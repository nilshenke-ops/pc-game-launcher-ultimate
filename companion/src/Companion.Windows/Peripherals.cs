using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>Visible top-level program windows and the monitors (Win32). Only normal app windows – no tool windows,
/// no hidden/cloaked ones (e.g. suspended Store apps), never the companion itself.</summary>
sealed class WindowsWindowManager : IWindowManager
{
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct WINDOWPLACEMENT { public int length, flags, showCmd; public POINT min, max; public RECT normal; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct MONITORINFOEX { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
    delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
    delegate bool MonitorEnumProc(IntPtr m, IntPtr dc, ref RECT r, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorEnumProc cb, IntPtr l);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFOEX info);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
    [DllImport("user32.dll")] static extern bool GetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("user32.dll")] static extern bool SetWindowPlacement(IntPtr h, ref WINDOWPLACEMENT p);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
    const int GWL_EXSTYLE = -20; const long WS_EX_TOOLWINDOW = 0x80; const uint GW_OWNER = 4; const int DWMWA_CLOAKED = 14;
    const int SW_SHOWNORMAL = 1, SW_SHOWMINIMIZED = 2, SW_SHOWMAXIMIZED = 3;

    public bool Supported => true;

    public List<MonitorInfo> Monitors()
    {
        var list = new List<MonitorInfo>();
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr _, ref RECT _, IntPtr _) =>
        {
            var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>() };
            if (GetMonitorInfo(m, ref info))
            {
                var r = info.rcWork;
                var screen = Screen.AllScreens.FirstOrDefault(s => s.DeviceName == info.szDevice);
                list.Add(new MonitorInfo(info.szDevice, $"Monitor {list.Count + 1} ({info.rcMonitor.Right - info.rcMonitor.Left}×{info.rcMonitor.Bottom - info.rcMonitor.Top})",
                    r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, (info.dwFlags & 1) != 0));
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    string MonitorOf(IntPtr h)
    {
        var info = new MONITORINFOEX { cbSize = Marshal.SizeOf<MONITORINFOEX>() };
        return GetMonitorInfo(MonitorFromWindow(h, 2), ref info) ? info.szDevice : "";
    }

    public List<WindowInfo> Windows()
    {
        var own = Environment.ProcessId;
        var list = new List<WindowInfo>();
        var names = new Dictionary<uint, string>();
        EnumWindows((h, _) =>
        {
            try
            {
                if (!IsWindowVisible(h) || GetWindow(h, GW_OWNER) != IntPtr.Zero) return true;
                if ((GetWindowLongPtr(h, GWL_EXSTYLE).ToInt64() & WS_EX_TOOLWINDOW) != 0) return true;
                if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out var cloaked, 4) == 0 && cloaked != 0) return true;
                var len = GetWindowTextLength(h);
                if (len == 0) return true;
                var sb = new StringBuilder(len + 1); GetWindowText(h, sb, sb.Capacity);
                GetWindowThreadProcessId(h, out var pid);
                if (pid == own) return true;
                if (!names.TryGetValue(pid, out var proc)) { try { using var p = Process.GetProcessById((int)pid); proc = p.ProcessName; } catch { proc = ""; } names[pid] = proc; }
                if (proc.Length == 0 || proc.Equals("explorer", StringComparison.OrdinalIgnoreCase) && sb.ToString() == "Program Manager") return true;
                var wp = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
                if (!GetWindowPlacement(h, ref wp)) return true;
                var state = wp.showCmd == SW_SHOWMAXIMIZED ? "maximized" : wp.showCmd == SW_SHOWMINIMIZED ? "minimized" : "normal";
                var r = wp.normal; // workspace coordinates of the restored window
                list.Add(new WindowInfo(h.ToInt64(), proc, sb.ToString(), r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, state, MonitorOf(h)));
            }
            catch (Exception ex) { Log.Warn("windows", ex.Message); }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public string? Place(long handle, int x, int y, int width, int height, string state)
    {
        var h = new IntPtr(handle);
        if (!IsWindow(h)) return "Fenster gibt es nicht mehr.";
        var wp = new WINDOWPLACEMENT { length = Marshal.SizeOf<WINDOWPLACEMENT>() };
        if (!GetWindowPlacement(h, ref wp)) return "Fenster lässt sich nicht lesen (evtl. mit Administratorrechten gestartet).";
        wp.normal = new RECT { Left = x, Top = y, Right = x + Math.Max(100, width), Bottom = y + Math.Max(80, height) };
        wp.showCmd = state == "maximized" ? SW_SHOWMAXIMIZED : state == "minimized" ? SW_SHOWMINIMIZED : SW_SHOWNORMAL;
        wp.flags = 0;
        return SetWindowPlacement(h, ref wp) ? null : "Fenster lässt sich nicht verschieben (evtl. mit Administratorrechten gestartet).";
    }
}

/// <summary>XInput (xinput1_4.dll, Windows 8+): Xbox and compatible controllers, up to four.</summary>
sealed class XInputControllers : IControllers
{
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_GAMEPAD { public ushort wButtons; public byte bLeftTrigger, bRightTrigger; public short sThumbLX, sThumbLY, sThumbRX, sThumbRY; }
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_STATE { public uint dwPacketNumber; public XINPUT_GAMEPAD Gamepad; }
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_VIBRATION { public ushort wLeftMotorSpeed, wRightMotorSpeed; }
    [StructLayout(LayoutKind.Sequential)] struct XINPUT_BATTERY_INFORMATION { public byte BatteryType, BatteryLevel; }
    [DllImport("xinput1_4.dll")] static extern uint XInputGetState(uint i, out XINPUT_STATE s);
    [DllImport("xinput1_4.dll")] static extern uint XInputSetState(uint i, ref XINPUT_VIBRATION v);
    [DllImport("xinput1_4.dll")] static extern uint XInputGetBatteryInformation(uint i, byte devType, out XINPUT_BATTERY_INFORMATION b);
    static readonly (ushort mask, string name)[] Buttons =
    {
        (0x0001, "up"), (0x0002, "down"), (0x0004, "left"), (0x0008, "right"), (0x0010, "start"), (0x0020, "back"), (0x0040, "ls"), (0x0080, "rs"),
        (0x0100, "lb"), (0x0200, "rb"), (0x1000, "a"), (0x2000, "b"), (0x4000, "x"), (0x8000, "y"),
    };

    bool? _available;
    public bool Supported => _available ??= Probe();

    static bool Probe() { try { XInputGetState(0, out _); return true; } catch (DllNotFoundException) { return false; } catch (EntryPointNotFoundException) { return false; } }

    public List<ControllerInfo> List()
    {
        if (!Supported) return new();
        var list = new List<ControllerInfo>();
        for (uint i = 0; i < 4; i++)
        {
            var connected = XInputGetState(i, out _) == 0;
            var battery = "–";
            if (connected && XInputGetBatteryInformation(i, 0, out var b) == 0)
                battery = b.BatteryType switch { 1 => "Kabel", 0 => "getrennt", 0xFF => "unbekannt", _ => b.BatteryLevel switch { 0 => "leer", 1 => "niedrig", 2 => "mittel", _ => "voll" } };
            list.Add(new ControllerInfo((int)i, connected, "XInput (Xbox-kompatibel)", battery));
        }
        return list;
    }

    static double Stick(short v) { var d = v / 32767.0; return Math.Abs(d) < 0.08 ? 0 : Math.Clamp(d, -1, 1); }

    public ControllerState? State(int index)
    {
        if (!Supported || index is < 0 or > 3 || XInputGetState((uint)index, out var s) != 0) return null;
        var g = s.Gamepad;
        return new ControllerState(index, Buttons.ToDictionary(b => b.name, b => (g.wButtons & b.mask) != 0),
            Stick(g.sThumbLX), Stick(g.sThumbLY), Stick(g.sThumbRX), Stick(g.sThumbRY), g.bLeftTrigger / 255.0, g.bRightTrigger / 255.0, s.dwPacketNumber);
    }

    public string? Rumble(int index, int milliseconds, double strength)
    {
        if (!Supported || index is < 0 or > 3) return "Controller nicht gefunden.";
        var speed = (ushort)(Math.Clamp(strength, 0, 1) * 65535);
        var v = new XINPUT_VIBRATION { wLeftMotorSpeed = speed, wRightMotorSpeed = speed };
        if (XInputSetState((uint)index, ref v) != 0) return "Controller nicht verbunden.";
        _ = Task.Delay(Math.Clamp(milliseconds, 50, 2000)).ContinueWith(_ => { var off = new XINPUT_VIBRATION(); XInputSetState((uint)index, ref off); });
        return null;
    }
}
