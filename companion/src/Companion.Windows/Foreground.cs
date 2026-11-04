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

    /// <summary>The island window's title (see IslandForm).</summary>
    internal const string IslandTitle = "Nexus Gaming Hub – JARVIS";
    static readonly HashSet<string> DesktopClasses = new(StringComparer.Ordinal) { "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow", "TopLevelWindowForTaskbar" };

    readonly object _gate = new();
    System.Threading.Timer? _timer;
    ForegroundKind _kind = ForegroundKind.Program;

    public bool Supported => true;
    public ForegroundKind Kind { get { lock (_gate) return _kind; } }
    public event Action? Changed;

    public void SetActive(bool on)
    {
        lock (_gate)
        {
            if (on && _timer == null)
            {
                _kind = Classify(_kind);
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
            changed = k != _kind; _kind = k;
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

    public void Dispose() { lock (_gate) { _timer?.Dispose(); _timer = null; } }
}
