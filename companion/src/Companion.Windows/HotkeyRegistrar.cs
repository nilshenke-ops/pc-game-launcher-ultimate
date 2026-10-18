using System.Runtime.InteropServices;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>Global hotkeys through RegisterHotKey on a hidden message window (UI thread).</summary>
public sealed class HotkeyRegistrar : IHotkeyRegistrar
{
    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll", SetLastError = true)] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_WIN = 8, MOD_NOREPEAT = 0x4000;
    const int WM_HOTKEY = 0x0312;

    readonly UiInvoker _ui;
    readonly Dictionary<int, Action> _handlers = new();
    MessageWindow? _window;

    public HotkeyRegistrar(UiInvoker ui) { _ui = ui; }
    public bool Supported => true;

    sealed class MessageWindow : NativeWindow
    {
        readonly HotkeyRegistrar _owner;
        public MessageWindow(HotkeyRegistrar owner) { _owner = owner; CreateHandle(new CreateParams { Parent = new IntPtr(-3) /* HWND_MESSAGE */ }); }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && _owner._handlers.TryGetValue(m.WParam.ToInt32(), out var h)) { try { h(); } catch { } }
            base.WndProc(ref m);
        }
    }

    public static (uint mods, Keys key)? Parse(string combo)
    {
        uint mods = MOD_NOREPEAT;
        Keys? key = null;
        foreach (var part in combo.Split('+'))
        {
            switch (part)
            {
                case "Ctrl": mods |= MOD_CONTROL; break;
                case "Alt": mods |= MOD_ALT; break;
                case "Shift": mods |= MOD_SHIFT; break;
                case "Win": mods |= MOD_WIN; break;
                default:
                    key = part switch
                    {
                        { Length: 1 } when char.IsLetter(part[0]) => Enum.Parse<Keys>(part),
                        { Length: 1 } when char.IsDigit(part[0]) => Enum.Parse<Keys>("D" + part),
                        _ when part.StartsWith("Num") && part.Length == 4 => Enum.Parse<Keys>("NumPad" + part[3]),
                        "NumAdd" => Keys.Add, "NumSubtract" => Keys.Subtract, "NumMultiply" => Keys.Multiply, "NumDivide" => Keys.Divide,
                        "Enter" => Keys.Return, "PageUp" => Keys.PageUp, "PageDown" => Keys.PageDown, "ScrollLock" => Keys.Scroll,
                        "PrintScreen" => Keys.PrintScreen,
                        _ => Enum.TryParse<Keys>(part, out var k) ? k : null,
                    };
                    break;
            }
        }
        return key == null ? null : (mods, key.Value);
    }

    // ------------------------------------------------------------ mouse side buttons (Mouse4 = back, Mouse5 = forward)
    // RegisterHotKey only knows keyboard keys. Side buttons need a low-level mouse hook; it is installed only while at
    // least one mouse hotkey exists, only looks at side-button presses and hands the action to a worker thread at once,
    // so mouse movement is never delayed. A matching press is consumed (like a keyboard hotkey).

    delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string? name);
    const int WH_MOUSE_LL = 14, WM_XBUTTONDOWN = 0x020B, WM_XBUTTONUP = 0x020C;
    readonly Dictionary<int, (uint mods, int button, Action action)> _mouse = new();
    LowLevelProc? _proc; // kept referenced so the GC does not collect the callback
    IntPtr _hook;
    int _swallowUp; // button whose release belongs to a consumed press

    static uint CurrentMods()
    {
        bool Down(int vk) => (GetAsyncKeyState(vk) & 0x8000) != 0;
        return (Down(0x11) ? MOD_CONTROL : 0) | (Down(0x12) ? MOD_ALT : 0) | (Down(0x10) ? MOD_SHIFT : 0) | (Down(0x5B) || Down(0x5C) ? MOD_WIN : 0);
    }

    IntPtr OnMouse(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && (wParam == WM_XBUTTONDOWN || wParam == WM_XBUTTONUP))
        {
            var button = (Marshal.ReadInt32(lParam, 8) >> 16) & 0xFFFF; // MSLLHOOKSTRUCT.mouseData high word: 1 = XBUTTON1, 2 = XBUTTON2
            if (wParam == WM_XBUTTONUP && _swallowUp == button) { _swallowUp = 0; return 1; }
            if (wParam == WM_XBUTTONDOWN)
            {
                var mods = CurrentMods();
                foreach (var (_, m) in _mouse)
                    if (m.button == button && (m.mods & ~MOD_NOREPEAT) == mods)
                    {
                        _swallowUp = button;
                        var a = m.action;
                        ThreadPool.QueueUserWorkItem(_ => { try { a(); } catch { } });
                        return 1;
                    }
            }
        }
        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }

    void UpdateHook()
    {
        if (_mouse.Count > 0 && _hook == IntPtr.Zero)
        {
            _proc ??= OnMouse;
            _hook = SetWindowsHookEx(WH_MOUSE_LL, _proc, GetModuleHandle(null), 0);
        }
        else if (_mouse.Count == 0 && _hook != IntPtr.Zero) { UnhookWindowsHookEx(_hook); _hook = IntPtr.Zero; }
    }

    public string? Register(int id, string keys, Action onPressed)
    {
        if (keys.EndsWith("Mouse4") || keys.EndsWith("Mouse5"))
        {
            uint mods = 0;
            foreach (var part in keys.Split('+')[..^1]) mods |= part switch { "Ctrl" => MOD_CONTROL, "Alt" => MOD_ALT, "Shift" => MOD_SHIFT, "Win" => MOD_WIN, _ => 0u };
            var button = keys.EndsWith("Mouse4") ? 1 : 2;
            return _ui.Invoke(() =>
            {
                if (_mouse.Values.Any(m => m.button == button && m.mods == mods)) return "Diese Maustaste ist bereits belegt.";
                _mouse[id] = (mods, button, onPressed);
                UpdateHook();
                return _hook == IntPtr.Zero ? $"Maustasten-Überwachung nicht möglich (Fehler {Marshal.GetLastWin32Error()})." : (string?)null;
            });
        }
        var parsed = Parse(keys);
        if (parsed == null) return "Taste wird nicht unterstützt.";
        return _ui.Invoke(() =>
        {
            _window ??= new MessageWindow(this);
            if (!RegisterHotKey(_window.Handle, id, parsed.Value.mods, (uint)parsed.Value.key))
            {
                var err = Marshal.GetLastWin32Error();
                return err == 1409 ? "Bereits von Windows oder einem anderen Programm belegt." : $"Registrierung fehlgeschlagen (Fehler {err}).";
            }
            _handlers[id] = onPressed;
            return (string?)null;
        });
    }

    public void Unregister(int id) => _ui.Invoke(() =>
    {
        if (_window != null) UnregisterHotKey(_window.Handle, id);
        _handlers.Remove(id);
        if (_mouse.Remove(id)) UpdateHook();
    });

    public void UnregisterAll() => _ui.Invoke(() =>
    {
        if (_window != null) foreach (var id in _handlers.Keys.ToList()) UnregisterHotKey(_window.Handle, id);
        _handlers.Clear();
        _mouse.Clear();
        UpdateHook();
    });
}
