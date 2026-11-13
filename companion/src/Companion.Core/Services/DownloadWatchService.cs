using Pgl.Core.Infrastructure;
using Pgl.Core.Models;

namespace Pgl.Core.Services;

/// <summary>
/// Says when a download is finished: watches the user's Downloads folder (works with every browser) and reports a file once it is complete – it no
/// longer carries a browser's "still loading" ending, has content and has not grown for a moment. Only the file name is used, nothing is opened or read.
/// </summary>
public sealed class DownloadWatchService : IDisposable
{
    static readonly HashSet<string> Partial = new(StringComparer.OrdinalIgnoreCase) { ".crdownload", ".part", ".partial", ".download", ".tmp", ".opdownload", ".!ut", ".aria2" };
    readonly Action<string, long> _finished;
    readonly Func<bool> _enabled;
    readonly Dictionary<string, (long size, DateTime seen)> _pending = new(StringComparer.OrdinalIgnoreCase);
    readonly HashSet<string> _reported = new(StringComparer.OrdinalIgnoreCase);
    readonly object _lock = new();
    FileSystemWatcher? _watcher;
    Timer? _timer;
    public string? Folder { get; private set; }

    public DownloadWatchService(Action<string, long> finished, Func<bool> enabled) { _finished = finished; _enabled = enabled; }

    public static string DefaultFolder() =>
        Environment.GetEnvironmentVariable("PGL_DOWNLOADS_DIR") is { Length: > 0 } custom ? custom
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");

    public void Start(string? folder = null)
    {
        Folder = folder ?? DefaultFolder();
        try
        {
            if (!Directory.Exists(Folder)) { Log.Info("downloads", $"Kein Downloads-Ordner unter {Folder} – die Download-Anzeige bleibt aus."); return; }
            _watcher = new FileSystemWatcher(Folder) { NotifyFilter = NotifyFilters.FileName | NotifyFilters.Size | NotifyFilters.LastWrite, IncludeSubdirectories = false };
            _watcher.Created += (_, e) => Note(e.FullPath);
            _watcher.Changed += (_, e) => Note(e.FullPath);
            _watcher.Renamed += (_, e) => Note(e.FullPath);   // browsers rename "name.crdownload" to "name" when they are done
            _watcher.EnableRaisingEvents = true;
            _timer = new Timer(_ => Check(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
        }
        catch (Exception ex) { Log.Warn("downloads", "Downloads-Ordner lässt sich nicht beobachten: " + ex.Message); }
    }

    public static bool IsPartial(string path) => Partial.Contains(Path.GetExtension(path)) || Path.GetFileName(path).StartsWith("~", StringComparison.Ordinal) || Path.GetFileName(path).StartsWith(".", StringComparison.Ordinal);

    void Note(string path)
    {
        if (!_enabled() || IsPartial(path)) return;
        lock (_lock) { if (!_reported.Contains(path)) _pending[path] = (-1, DateTime.UtcNow); }
    }

    /// <summary>A file is finished when its size is above zero and was the same at two checks at least 1.5 s apart.</summary>
    internal void Check(DateTime? nowUtc = null)
    {
        var now = nowUtc ?? DateTime.UtcNow;
        List<(string path, long size)> done = new();
        lock (_lock)
        {
            foreach (var (path, state) in _pending.ToList())
            {
                long size;
                try { var fi = new FileInfo(path); if (!fi.Exists) { _pending.Remove(path); continue; } size = fi.Length; }
                catch { continue; }
                if (size != state.size) { _pending[path] = (size, now); continue; }
                if (size > 0 && now - state.seen >= TimeSpan.FromSeconds(1.5)) { _pending.Remove(path); if (_reported.Add(path)) done.Add((path, size)); }
                else if (now - state.seen > TimeSpan.FromMinutes(30)) _pending.Remove(path);   // an empty file that never grew
            }
            if (_reported.Count > 500) _reported.Clear();
        }
        foreach (var (path, size) in done)
            try { _finished(Path.GetFileName(path), size); } catch (Exception ex) { Log.Warn("downloads", ex.Message); }
    }

    internal void NoteForTest(string path) => Note(path);

    public void Dispose() { _watcher?.Dispose(); _timer?.Dispose(); }
}
