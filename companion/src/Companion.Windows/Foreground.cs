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
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] static extern int GetWindowLong(IntPtr hWnd, int index);
    const int GWL_STYLE = -16; const int WS_CAPTION = 0xC00000;
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
    string? _reason, _program;

    public bool Supported => true;
    public string? GameReason { get { lock (_gate) return _game ? _reason : null; } }
    public string? FrontProgram { get { lock (_gate) return _program; } }
    public ForegroundKind Kind { get { lock (_gate) return _kind; } }
    public bool GameInFront { get { lock (_gate) return _game; } }
    public event Action? Changed;

    public void SetActive(bool on)
    {
        lock (_gate)
        {
            if (on && _timer == null)
            {
                _kind = Classify(_kind); (_game, _reason, _program) = _kind == ForegroundKind.Program ? GameCheck() : (false, null, null);
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
            var (g, why, prog) = k == ForegroundKind.Program ? GameCheck() : (false, null, null);
            changed = k != _kind || g != _game || prog != _program; _kind = k; _game = g; _reason = why; _program = prog;
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

    /// <summary>
    /// Is the program in front a game – even though the launcher did not start it? Two signs: a program from a game store folder (Steam, Epic,
    /// Xbox, GOG), or a window without title bar that covers the whole screen (full screen, borderless). A normal window – even a maximised one,
    /// even when the task bar is hidden – is never a game; neither is a launcher, a browser or a tool (NotGames). Also tells the program in
    /// front and why it counts as a game, so the settings can say why the island is hidden.
    /// </summary>
    static (bool game, string? reason, string? program) GameCheck()
    {
        try
        {
            var h = GetForegroundWindow();
            if (h == IntPtr.Zero) return (false, null, null);
            GetWindowThreadProcessId(h, out var pid);
            if (pid == Environment.ProcessId) return (false, null, null);
            var cls = new StringBuilder(64); GetClassName(h, cls, cls.Capacity);
            if (DesktopClasses.Contains(cls.ToString())) return (false, null, null);
            var path = ImagePath(pid);
            var name = path == null ? "" : System.IO.Path.GetFileNameWithoutExtension(path);
            var low = name.ToLowerInvariant();
            var program = name.Length == 0 ? null : name;
            if (NotGames.Contains(low)) return (false, null, program);
            if (path != null) { var l = path.ToLowerInvariant(); if (GameFolders.Any(f => l.Contains(f))) return (true, $"{name}.exe liegt in einem Spiele-Ordner", program); }
            if (!GetWindowRect(h, out var r)) return (false, null, program);
            var mon = MonitorFromWindow(h, 2);
            var info = new MonitorInfo { Size = Marshal.SizeOf<MonitorInfo>() };
            if (mon == IntPtr.Zero || !GetMonitorInfo(mon, ref info)) return (false, null, program);
            var covers = r.L <= info.Monitor.L && r.T <= info.Monitor.T && r.R >= info.Monitor.R && r.B >= info.Monitor.B;
            if (!covers) return (false, null, program);
            // A maximised program window has a title bar (and, with a hidden task bar, also covers the screen): not a game.
            var hasCaption = (GetWindowLong(h, GWL_STYLE) & WS_CAPTION) == WS_CAPTION;
            return hasCaption ? (false, null, program) : (true, $"Vollbild-Fenster von {(name.Length == 0 ? "einem Programm" : name + ".exe")}", program);
        }
        catch { return (false, null, null); }
    }
    /// <summary>Programs that never count as a game: browsers, players, chat, tools, and the game launchers themselves (they live in the store folders but are no game).</summary>
    static readonly HashSet<string> NotGames = new()
    {
        "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "vlc", "mpc-hc64", "mpc-hc", "wmplayer", "spotify", "explorer", "applicationframehost", "mpv", "teams", "zoom",
        "discord", "slack", "code", "devenv", "obs64", "obs32", "obs", "notepad", "notepad++", "winword", "excel", "powerpnt", "outlook", "photoshop", "premiere pro",
        "epicgameslauncher", "steam", "steamwebhelper", "galaxyclient", "ubisoftconnect", "upc", "eadesktop", "ea app", "origin", "battle.net", "xboxpcapp", "gamingservices",
        "wallpaper32", "wallpaper64", "lively", "windowsterminal", "cmd", "powershell", "msedgewebview2",
    };

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
