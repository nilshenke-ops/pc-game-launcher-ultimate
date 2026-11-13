using System.Runtime.InteropServices;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Which window is in front: the desktop (wallpaper, taskbar – no program window), this app, or another program (Discord,
/// a browser, a game …). Looked at twice a second, and only while the island's place depends on it. The island's own window
/// takes the focus when its panel opens – that must not count as "the app is in front".
/// </summary>
sealed class WindowsForegroundWatcher : IForegroundWatcher, IDisposable
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out Rect rect);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int size);
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MonitorInfo { public int Size; public Rect Monitor, Work; public uint Flags; }
    static readonly string[] GameFolders = { "\\steamapps\\common\\", "\\epic games\\", "\\xboxgames\\", "\\gog galaxy\\games\\", "\\gog games\\" };

    /// <summary>The island window's title (see IslandForm).</summary>
    internal const string IslandTitle = "Nexus Gaming Hub – JARVIS";
    static readonly HashSet<string> DesktopClasses = new(StringComparer.Ordinal) { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow", "TopLevelWindowForTaskbar" };

    readonly object _gate = new();
    System.Threading.Timer? _timer;
    ForegroundKind _kind = ForegroundKind.Program;
    bool _game;

    public bool Supported => true;
    public ForegroundKind Kind { get { lock (_gate) return _kind; } }
    public bool GameInFront { get { lock (_gate) return _game; } }
    public event Action? Changed;

    public void SetActive(bool on)
    {
        lock (_gate)
        {
            if (on && _timer == null)
            {
                _kind = Classify(_kind); _game = _kind == ForegroundKind.Program && IsGameInFront();
                _timer = new System.Threading.Timer(_ => Tick(), null, 500, 500);
            }
            else if (!on && _timer != null) { _timer.Dispose(); _timer = null; }
        }
    }

    void Tick()
    {
        bool changed;
        lock (_gate)
        {
            if (_timer == null) return;
            var k = Classify(_kind);
            var g = k == ForegroundKind.Program && IsGameInFront();
            changed = k != _kind || g != _game; _kind = k; _game = g;
        }
        if (changed) { try { Changed?.Invoke(); } catch (Exception ex) { Log.Warn("island", ex.Message); } }
    }

    static ForegroundKind Classify(ForegroundKind previous)
    {
        try
        {
            var h = GetForegroundWindow();
            if (h == IntPtr.Zero) return ForegroundKind.Desktop; // nothing in front (lock screen, switching)
            var cls = new StringBuilder(64); GetClassName(h, cls, cls.Capacity);
            if (DesktopClasses.Contains(cls.ToString())) return ForegroundKind.Desktop;
            GetWindowThreadProcessId(h, out var pid);
            if (pid != Environment.ProcessId) return ForegroundKind.Program;
            var title = new StringBuilder(128); GetWindowText(h, title, title.Capacity);
            return title.ToString() == IslandTitle ? previous : ForegroundKind.App; // the island itself: nothing changed
        }
        catch { return previous; }
    }

    /// <summary>A full-screen window (game, borderless or exclusive) or a program that lives in a game store folder. A game started from Steam directly is not a launcher session, yet it is still a game.</summary>
    static bool IsGameInFront()
    {
        try
        {
            var h = GetForegroundWindow();
            if (h == IntPtr.Zero) return false;
            GetWindowThreadProcessId(h, out var pid);
            if (pid == Environment.ProcessId) return false;
            var cls = new StringBuilder(64); GetClassName(h, cls, cls.Capacity);
            if (DesktopClasses.Contains(cls.ToString())) return false;
            var path = ImagePath(pid);
            if (path != null) { var l = path.ToLowerInvariant(); if (GameFolders.Any(f => l.Contains(f))) return true; }
            if (!GetWindowRect(h, out var r)) return false;
            var mon = MonitorFromWindow(h, 2);
            var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
            if (mon == IntPtr.Zero || !GetMonitorInfo(mon, ref info)) return false;
            var covers = r.L <= info.Monitor.L && r.T <= info.Monitor.T && r.R >= info.Monitor.R && r.B >= info.Monitor.B;
            // a browser or video player in full screen is not a game: only count it when the program is not a well-known non-game
            if (!covers) return false;
            var name = path == null ? "" : System.IO.Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
            return !NotGames.Contains(name);
        }
        catch { return false; }
    }
    static readonly HashSet<string> NotGames = new() { "chrome", "msedge", "firefox", "brave", "opera", "vlc", "mpc-hc64", "mpc-hc", "wmplayer", "spotify", "explorer", "applicationframehost", "mpv", "teams", "zoom" };

    public string? FrontBrand()
    {
        try
        {
            var h = GetForegroundWindow();
            if (h == IntPtr.Zero) return null;
            GetWindowThreadProcessId(h, out var pid);
            if (pid == Environment.ProcessId) return "self";
            var path = ImagePath(pid);
            var title = new StringBuilder(256); GetWindowText(h, title, title.Capacity);
            return ForegroundBrand.Detect(path == null ? null : System.IO.Path.GetFileNameWithoutExtension(path), title.ToString());
        }
        catch { return null; }
    }

    static string? ImagePath(int pid)
    {
        var p = OpenProcess(0x1000, false, pid);
        if (p == IntPtr.Zero) return null;
        try { var sb = new StringBuilder(520); var n = sb.Capacity; return QueryFullProcessImageName(p, 0, sb, ref n) ? sb.ToString() : null; }
        finally { CloseHandle(p); }
    }

    public void Dispose() { lock (_gate) { _timer?.Dispose(); _timer = null; } }
}
