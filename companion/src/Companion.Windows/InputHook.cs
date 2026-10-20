using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Low-level keyboard/mouse hooks (WH_KEYBOARD_LL / WH_MOUSE_LL) on an own thread with a message loop. Every real event
/// goes to the remap engine; its replacement is sent with SendInput and the original is swallowed. Events sent by
/// programs (also our own) are marked "injected" by Windows and always passed through, so nothing loops. Windows itself
/// removes a hook that answers too slowly – the callback only looks up a dictionary and caches the foreground program.
/// Programs running as administrator do not see our replacement keys unless the companion runs as administrator too.
/// </summary>
sealed class WindowsInputHook : IInputHook
{
    delegate IntPtr HookProc(int code, IntPtr wParam, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] struct RAWINPUTDEVICELIST { public IntPtr hDevice; public uint dwType; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int idHook, HookProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll", SetLastError = true)] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string? name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageName(IntPtr p, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("user32.dll", SetLastError = true)] static extern uint GetRawInputDeviceList([Out] RAWINPUTDEVICELIST[]? list, ref uint count, uint size);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, StringBuilder? data, ref uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disposition, uint flags, IntPtr template);
    [DllImport("hid.dll", SetLastError = true)] static extern bool HidD_GetProductString(SafeFileHandle h, byte[] buffer, uint length);
    [DllImport("hid.dll", SetLastError = true)] static extern bool HidD_GetManufacturerString(SafeFileHandle h, byte[] buffer, uint length);

    const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14;
    const int WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105, WM_QUIT = 0x12;
    const int WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202, WM_RBUTTONDOWN = 0x204, WM_RBUTTONUP = 0x205, WM_MBUTTONDOWN = 0x207, WM_MBUTTONUP = 0x208, WM_XBUTTONDOWN = 0x20B, WM_XBUTTONUP = 0x20C;
    const uint LLKHF_INJECTED = 0x10, LLMHF_INJECTED = 0x01, INPUT_MOUSE = 0, INPUT_KEYBOARD = 1, KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2;
    const uint RIM_TYPEMOUSE = 0, RIM_TYPEKEYBOARD = 1, RIDI_DEVICENAME = 0x20000007;

    readonly object _lock = new();
    Thread? _thread;
    uint _threadId;
    IntPtr _kbHook, _mouseHook;
    HookProc? _kbProc, _mouseProc; // kept referenced – the GC must not collect them while Windows calls them
    volatile Func<int, bool, string?, InputAction[]?>? _handle;
    volatile TaskCompletionSource<int?>? _capture;
    int _captureSwallowUp = -1;
    bool _wantKeyboard, _wantMouse;
    IntPtr _fgWindow; string? _fgProcess;

    public bool Supported => true;

    public void Start(Func<int, bool, string?, InputAction[]?> handle, bool keyboard, bool mouse)
    {
        lock (_lock)
        {
            _handle = handle;
            if (_thread != null && _wantKeyboard == keyboard && _wantMouse == mouse) return; // same hooks: only the rules changed
            StopThread();
            _wantKeyboard = keyboard; _wantMouse = mouse;
            StartThread(keyboard, mouse);
        }
    }

    public void Stop() { lock (_lock) { _handle = null; if (_capture == null) StopThread(); } }

    void StartThread(bool keyboard, bool mouse)
    {
        if (!keyboard && !mouse) return;
        string? error = null;
        using var ready = new ManualResetEventSlim();
        _thread = new Thread(() =>
        {
            _threadId = GetCurrentThreadId();
            var module = GetModuleHandle(null);
            if (keyboard) { _kbProc = KeyboardProc; _kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, _kbProc, module, 0); if (_kbHook == IntPtr.Zero) error = $"Tastatur-Hook (Fehler {Marshal.GetLastWin32Error()})"; }
            if (mouse) { _mouseProc = MouseProc; _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, module, 0); if (_mouseHook == IntPtr.Zero) error = $"Maus-Hook (Fehler {Marshal.GetLastWin32Error()})"; }
            ready.Set();
            while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0) { }
            if (_kbHook != IntPtr.Zero) UnhookWindowsHookEx(_kbHook);
            if (_mouseHook != IntPtr.Zero) UnhookWindowsHookEx(_mouseHook);
            _kbHook = _mouseHook = IntPtr.Zero;
        }) { IsBackground = true, Name = "Tastenbelegung", Priority = ThreadPriority.Highest };
        _thread.Start();
        ready.Wait(3000);
        if (error != null) { StopThread(); throw new InvalidOperationException(error); }
        Log.Info("input", $"Tastenbelegung aktiv (Tastatur: {(keyboard ? "ja" : "nein")}, Maus: {(mouse ? "ja" : "nein")})");
    }

    void StopThread()
    {
        if (_thread == null) return;
        PostThreadMessage(_threadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        _thread.Join(2000);
        _thread = null; _wantKeyboard = _wantMouse = false;
    }

    /// <summary>Name of the program in the foreground (without .exe); only looked up when the window changes.</summary>
    string? Foreground()
    {
        var h = GetForegroundWindow();
        if (h == _fgWindow) return _fgProcess;
        _fgWindow = h; _fgProcess = null;
        GetWindowThreadProcessId(h, out var pid);
        var p = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
        if (p == IntPtr.Zero) return null;
        try
        {
            var sb = new StringBuilder(1024); var size = (uint)sb.Capacity;
            if (QueryFullProcessImageName(p, 0, sb, ref size)) _fgProcess = Path.GetFileNameWithoutExtension(sb.ToString());
        }
        finally { CloseHandle(p); }
        return _fgProcess;
    }

    IntPtr KeyboardProc(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var k = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            var msg = wParam.ToInt32();
            var down = msg is WM_KEYDOWN or WM_SYSKEYDOWN;
            if ((k.flags & LLKHF_INJECTED) == 0 && (down || msg is WM_KEYUP or WM_SYSKEYUP) && Decide((int)k.vkCode, down)) return (IntPtr)1;
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    IntPtr MouseProc(int code, IntPtr wParam, IntPtr lParam)
    {
        if (code >= 0)
        {
            var msg = wParam.ToInt32();
            if (msg != 0x200 /* move: the hot path, straight through */)
            {
                var m = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                if ((m.flags & LLMHF_INJECTED) == 0)
                {
                    var (vk, down) = msg switch
                    {
                        WM_LBUTTONDOWN => (0x01, true), WM_LBUTTONUP => (0x01, false), WM_RBUTTONDOWN => (0x02, true), WM_RBUTTONUP => (0x02, false),
                        WM_MBUTTONDOWN => (0x04, true), WM_MBUTTONUP => (0x04, false),
                        WM_XBUTTONDOWN => ((m.mouseData >> 16) == 1 ? 0x05 : 0x06, true), WM_XBUTTONUP => ((m.mouseData >> 16) == 1 ? 0x05 : 0x06, false),
                        _ => (0, false),
                    };
                    if (vk != 0 && Decide(vk, down)) return (IntPtr)1;
                }
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    /// <summary>True = the original event is swallowed.</summary>
    bool Decide(int vk, bool down)
    {
        try
        {
            if (_capture is { } cap && vk != 0x01)
            {
                if (down) { _capture = null; _captureSwallowUp = vk; cap.TrySetResult(vk); return true; }
            }
            if (!down && vk == _captureSwallowUp) { _captureSwallowUp = -1; return true; }
            var handle = _handle;
            if (handle == null) return false;
            var actions = handle(vk, down, Foreground());
            if (actions == null) return false;
            if (actions.Length > 0) Send(actions);
            return true;
        }
        catch (Exception ex) { Log.Warn("input", ex.Message); return false; }
    }

    static bool Extended(int vk) => vk is 0x21 or 0x22 or 0x23 or 0x24 or 0x25 or 0x26 or 0x27 or 0x28 or 0x2C or 0x2D or 0x2E
        or 0x5B or 0x5C or 0x5D or 0x6F or 0x90 or 0xA3 or 0xA5 or (>= 0xAD and <= 0xB3);

    static void Send(InputAction[] actions)
    {
        var inputs = new INPUT[actions.Length];
        for (var i = 0; i < actions.Length; i++)
        {
            var (vk, down) = (actions[i].Code, actions[i].Down);
            if (vk is >= 0x01 and <= 0x06 and not 0x03)
            {
                var (flags, data) = vk switch
                {
                    0x01 => (down ? 0x0002u : 0x0004u, 0u), 0x02 => (down ? 0x0008u : 0x0010u, 0u), 0x04 => (down ? 0x0020u : 0x0040u, 0u),
                    0x05 => (down ? 0x0080u : 0x0100u, 1u), _ => (down ? 0x0080u : 0x0100u, 2u),
                };
                inputs[i] = new INPUT { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dwFlags = flags, mouseData = data } } };
            }
            else
                inputs[i] = new INPUT
                {
                    type = INPUT_KEYBOARD,
                    u = new InputUnion { ki = new KEYBDINPUT { wVk = (ushort)vk, wScan = (ushort)MapVirtualKey((uint)vk, 0), dwFlags = (down ? 0 : KEYEVENTF_KEYUP) | (Extended(vk) ? KEYEVENTF_EXTENDEDKEY : 0) } },
                };
        }
        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
    }

    public async Task<int?> CaptureNextAsync(TimeSpan timeout, CancellationToken ct)
    {
        var tcs = new TaskCompletionSource<int?>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_lock)
        {
            _capture = tcs;
            // Hooks are needed while waiting, even if no profile is active (keyboard and mouse side buttons).
            if (_thread == null || !_wantKeyboard || !_wantMouse) { var h = _handle; StopThread(); _wantKeyboard = _wantMouse = true; StartThread(true, true); _handle = h; }
        }
        try
        {
            using var reg = ct.Register(() => tcs.TrySetResult(null));
            var done = await Task.WhenAny(tcs.Task, Task.Delay(timeout, CancellationToken.None));
            return done == tcs.Task ? tcs.Task.Result : null;
        }
        finally
        {
            lock (_lock)
            {
                _capture = null;
                if (_handle == null) StopThread(); // the service puts the right hooks back right after
            }
        }
    }

    public List<InputDevice> Devices()
    {
        var list = new List<InputDevice>();
        uint count = 0;
        var size = (uint)Marshal.SizeOf<RAWINPUTDEVICELIST>();
        if (GetRawInputDeviceList(null, ref count, size) != 0 || count == 0) return list;
        var devices = new RAWINPUTDEVICELIST[count];
        if (GetRawInputDeviceList(devices, ref count, size) == uint.MaxValue) return list;
        foreach (var d in devices.Take((int)count))
        {
            if (d.dwType is not (RIM_TYPEKEYBOARD or RIM_TYPEMOUSE)) continue;
            uint len = 0;
            GetRawInputDeviceInfo(d.hDevice, RIDI_DEVICENAME, null, ref len);
            if (len == 0) continue;
            var sb = new StringBuilder((int)len + 1);
            if (GetRawInputDeviceInfo(d.hDevice, RIDI_DEVICENAME, sb, ref len) == uint.MaxValue) continue;
            var path = sb.ToString();
            if (path.Contains("RDP_", StringComparison.OrdinalIgnoreCase)) continue; // remote desktop placeholders
            var vid = Regex.Match(path, "VID_([0-9A-F]{4})", RegexOptions.IgnoreCase); var pid = Regex.Match(path, "PID_([0-9A-F]{4})", RegexOptions.IgnoreCase);
            string? product = null, maker = null;
            try
            {
                using var h = CreateFile(path, 0, 3 /* share read/write */, IntPtr.Zero, 3 /* OPEN_EXISTING */, 0, IntPtr.Zero);
                if (!h.IsInvalid)
                {
                    var buf = new byte[256];
                    if (HidD_GetProductString(h, buf, (uint)buf.Length)) product = Encoding.Unicode.GetString(buf).TrimEnd('\0').Trim();
                    buf = new byte[256];
                    if (HidD_GetManufacturerString(h, buf, (uint)buf.Length)) maker = Encoding.Unicode.GetString(buf).TrimEnd('\0').Trim();
                }
            }
            catch (Exception ex) { Debug.WriteLine(ex.Message); }
            var kind = d.dwType == RIM_TYPEKEYBOARD ? "keyboard" : "mouse";
            var name = string.IsNullOrWhiteSpace(product) ? (kind == "keyboard" ? "Tastatur" : "Maus") : product!;
            var dev = new InputDevice(kind, name, string.IsNullOrWhiteSpace(maker) ? null : maker, vid.Success ? vid.Groups[1].Value.ToUpperInvariant() : null, pid.Success ? pid.Groups[1].Value.ToUpperInvariant() : null);
            if (!list.Contains(dev)) list.Add(dev); // one gaming keyboard often has several entries (keys, media keys …)
        }
        return list;
    }
}
