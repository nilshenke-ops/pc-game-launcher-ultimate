// Automatic FPS measurement (3.66). The frames themselves come from Intel PresentMon (ETW, the same events Windows' own tools
// use) – see Companion.Windows/PresentMonCapture.cs. Everything here is platform independent and tested: reading PresentMon's
// CSV (old and new column names), the statistics (average, 1 % / 0.1 % low, frame time, stutter, GPU busy) and the sessions.
// Nothing is estimated: a value PresentMon does not deliver stays empty.
using System.Collections.Concurrent;
using System.Globalization;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Core.Services;

/// <summary>One presented frame as PresentMon reports it.</summary>
public readonly record struct FrameRecord(string App, int Pid, double FrameMs, double? GpuBusyMs, string? Api, bool Dropped);

/// <summary>Reads PresentMon CSV lines. The header decides which column is what (PresentMon 1.x and 2.x name them differently).</summary>
public sealed class PresentMonCsv
{
    int _app = -1, _pid = -1, _frame = -1, _gpu = -1, _api = -1, _dropped = -1, _displayed = -1, _count;
    public bool HasHeader => _frame >= 0;

    static readonly string[] FrameCols = { "MsBetweenPresents", "FrameTime", "msBetweenPresents", "MsBetweenAppStart", "MsBetweenSimulationStart" };
    static readonly string[] GpuCols = { "MsGPUBusy", "GPUBusy", "MsGPUActive", "msGPUActive" };
    static readonly string[] ApiCols = { "Runtime", "PresentRuntime" };

    /// <summary>True when the line was the header (it is recognised by its column names, wherever it appears).</summary>
    public bool TryHeader(string line)
    {
        if (!line.StartsWith("Application,", StringComparison.Ordinal)) return false;
        var cols = line.Split(',').Select(c => c.Trim()).ToList();
        int Find(params string[] names) { foreach (var n in names) { var i = cols.FindIndex(c => c.Equals(n, StringComparison.OrdinalIgnoreCase)); if (i >= 0) return i; } return -1; }
        _app = Find("Application"); _pid = Find("ProcessID"); _frame = Find(FrameCols); _gpu = Find(GpuCols); _api = Find(ApiCols);
        _dropped = Find("Dropped"); _displayed = Find("MsBetweenDisplayChange", "DisplayedTime"); _count = cols.Count;
        return true;
    }

    public FrameRecord? Parse(string line)
    {
        if (TryHeader(line) || !HasHeader || line.Length == 0) return null;
        var p = line.Split(',');
        if (p.Length <= _frame) return null;
        if (!double.TryParse(p[_frame], NumberStyles.Float, CultureInfo.InvariantCulture, out var ms) || ms <= 0 || ms > 5000) return null;
        double? gpu = _gpu >= 0 && _gpu < p.Length && double.TryParse(p[_gpu], NumberStyles.Float, CultureInfo.InvariantCulture, out var g) && g >= 0 ? g : null;
        var pid = _pid >= 0 && _pid < p.Length && int.TryParse(p[_pid], out var x) ? x : 0;
        var dropped = _dropped >= 0 && _dropped < p.Length && p[_dropped].Trim() == "1";
        return new FrameRecord(_app >= 0 ? p[_app].Trim() : "?", pid, ms, gpu, _api >= 0 && _api < p.Length ? p[_api].Trim() : null, dropped);
    }
}

/// <summary>Live and whole-session statistics of one program's frames. Memory stays small: a histogram for the lows, a short
/// window for "now", one value per second for the chart.</summary>
public sealed class FrameStats
{
    const double BinMs = 0.1; const int Bins = 10_000;            // 0 … 1000 ms in 0.1 ms steps
    readonly int[] _hist = new int[Bins + 1];
    readonly Queue<(double t, double ms)> _recent = new();          // last ~2 s (for "now")
    readonly Queue<double> _median = new();                         // last 120 frame times (for stutter)
    readonly List<double> _perSecond = new();                       // fps per second (chart), at most 2 h
    double _clock, _secStart, _secFrames, _sumMs, _gpuBusy, _gpuFrames;
    public long Frames { get; private set; }
    public int Stutters { get; private set; }
    public long Dropped { get; private set; }
    public string? Api { get; private set; }
    public double LastMs { get; private set; }

    public void Add(FrameRecord f)
    {
        _clock += f.FrameMs; Frames++; _sumMs += f.FrameMs; LastMs = f.FrameMs;
        if (f.Dropped) Dropped++;
        if (f.Api is { Length: > 0 } a && a != "Other") Api = a;
        if (f.GpuBusyMs is { } g) { _gpuBusy += Math.Min(g, f.FrameMs); _gpuFrames += f.FrameMs; }
        _hist[Math.Min(Bins, (int)(f.FrameMs / BinMs))]++;
        // A stutter: a frame clearly longer than the ones around it (2.5 × the recent median and at least 25 ms).
        if (_median.Count >= 30)
        {
            var med = _median.OrderBy(x => x).ElementAt(_median.Count / 2);
            if (f.FrameMs > Math.Max(25, med * 2.5)) Stutters++;
        }
        _median.Enqueue(f.FrameMs); if (_median.Count > 120) _median.Dequeue();
        _recent.Enqueue((_clock, f.FrameMs));
        while (_recent.Count > 0 && _clock - _recent.Peek().t > 2000) _recent.Dequeue();
        _secFrames++;
        if (_clock - _secStart >= 1000)
        {
            if (_perSecond.Count < 7200) _perSecond.Add(Math.Round(_secFrames * 1000 / (_clock - _secStart), 1));
            _secStart = _clock; _secFrames = 0;
        }
    }

    /// <summary>Frames per second over the last second of frames.</summary>
    public double? Now()
    {
        if (_recent.Count < 2) return null;
        double sum = 0; int n = 0;
        foreach (var (t, ms) in _recent.Reverse()) { sum += ms; n++; if (sum >= 1000) break; }
        return sum > 0 ? Math.Round(n * 1000 / sum, 1) : null;
    }
    public double? Average => Frames > 0 ? Math.Round(Frames * 1000 / _sumMs, 1) : null;
    /// <summary>"1 % low": the frame rate of the slowest 1 % of frames (their average frame time, as CapFrameX and others report it). Needs enough frames.</summary>
    public double? Low1 => Frames >= 100 ? Math.Round(1000 / SlowestAverage(0.01), 1) : null;
    public double? Low01 => Frames >= 1000 ? Math.Round(1000 / SlowestAverage(0.001), 1) : null;
    /// <summary>Share of the frame time the GPU was busy (only when PresentMon reports it).</summary>
    public double? GpuBusyPercent => _gpuFrames > 0 ? Math.Round(100 * _gpuBusy / _gpuFrames, 1) : null;
    public double DurationSeconds => _clock / 1000;
    public IReadOnlyList<double> PerSecond => _perSecond;

    /// <summary>Average frame time of the slowest share of frames (from the histogram, 0.1 ms exact).</summary>
    double SlowestAverage(double share)
    {
        var want = Math.Max(1, (long)Math.Ceiling(Frames * share)); long took = 0; double sum = 0;
        for (var i = Bins; i >= 0 && took < want; i--)
        {
            if (_hist[i] == 0) continue;
            var n = Math.Min(_hist[i], want - took);
            sum += n * Math.Max(BinMs, (i + 0.5) * BinMs); took += n;
        }
        return took > 0 ? sum / took : 1000;
    }

    /// <summary>Frame times of the last ~2 s (for the frame-time chart).</summary>
    public double[] RecentFrameTimes() => _recent.Select(r => Math.Round(r.ms, 2)).ToArray();
}

public sealed class FpsSession
{
    public string Id { get; set; } = "";
    public string? ItemId { get; set; }
    public string Game { get; set; } = "";
    public string? Process { get; set; }
    public string? Api { get; set; }
    public DateTime StartedAt { get; set; }
    public double Minutes { get; set; }
    public double? Avg { get; set; }
    public double? Low1 { get; set; }
    public double? Low01 { get; set; }
    public int Stutters { get; set; }
    public double? GpuBusy { get; set; }
    public double? CpuAvg { get; set; }
    public double? GpuAvg { get; set; }
    public double? CpuTempMax { get; set; }
    public double? GpuTempMax { get; set; }
    /// <summary>FPS per 10 s (at most 720 points = 2 h).</summary>
    public List<double> Chart { get; set; } = new();
}

public sealed class FpsFile { public List<FpsSession> Sessions { get; set; } = new(); }

/// <summary>Reads the frames of all programs; what a platform must provide (PresentMon on Windows, nothing elsewhere).</summary>
public interface IFrameCapture
{
    /// <summary>Null when it can run, otherwise why not (plain words).</summary>
    string? Unavailable { get; }
    /// <summary>Null when allowed, otherwise what is missing (e.g. the Windows permission for performance logs).</summary>
    string? PermissionProblem { get; }
    bool CanRequestPermission { get; }
    /// <summary>Asks Windows once (UAC) to allow performance logs for this user. Returns the message for the user.</summary>
    string RequestPermission();
    /// <summary>Starts reading; each CSV line goes to <paramref name="line"/>; <paramref name="ended"/> gets the reason when it stops by itself.</summary>
    void Start(Action<string> line, Action<string?> ended);
    void Stop();
}

public sealed class NullFrameCapture : IFrameCapture
{
    public static readonly NullFrameCapture Instance = new();
    public string? Unavailable => "FPS-Messung gibt es nur im Windows-Begleiter (sie nutzt Intel PresentMon).";
    public string? PermissionProblem => null;
    public bool CanRequestPermission => false;
    public string RequestPermission() => Unavailable!;
    public void Start(Action<string> line, Action<string?> ended) => ended(Unavailable);
    public void Stop() { }
}

/// <summary>
/// Starts the frame capture when a game starts and stops it when the last game ends – nobody has to set anything per game.
/// PresentMon sees every program that presents frames; the measured game is the one presenting the most frames right now
/// (the desktop compositor, browsers, overlays and this companion are left out). A session is saved when it is long enough.
/// </summary>
public sealed class FpsService : IDisposable
{
    static readonly HashSet<string> NotGames = new(StringComparer.OrdinalIgnoreCase)
    {
        "dwm.exe", "explorer.exe", "PCGameLauncherCompanion.exe", "msedgewebview2.exe", "msedge.exe", "chrome.exe", "firefox.exe", "opera.exe",
        "brave.exe", "Discord.exe", "obs64.exe", "steamwebhelper.exe", "EpicWebHelper.exe", "Spotify.exe", "NVIDIA Overlay.exe", "GameBar.exe",
        "XboxGameBar.exe", "ShellExperienceHost.exe", "SearchHost.exe", "StartMenuExperienceHost.exe", "TextInputHost.exe", "Teams.exe", "ms-teams.exe",
    };
    const int MinFramesToSave = 600;     // about 10 s at 60 FPS
    const int Keep = 200;

    readonly IFrameCapture _capture;
    readonly JsonStore<FpsFile> _store;
    readonly Func<bool> _enabled;
    readonly object _lock = new();
    readonly ConcurrentDictionary<string, FrameStats> _apps = new(StringComparer.OrdinalIgnoreCase);
    readonly ConcurrentDictionary<string, Queue<long>> _rate = new(StringComparer.OrdinalIgnoreCase);
    PresentMonCsv _csv = new();
    bool _running;
    string? _stopReason;
    string? _game, _itemId;
    DateTime _startedAt;
    long _tick;

    public FpsService(IFrameCapture capture, AppPaths paths, Func<bool> enabled)
    {
        _capture = capture; _enabled = enabled;
        _store = new JsonStore<FpsFile>(paths.File("fps-sessions.json"));
    }

    /// <summary>Raised when a session is saved.</summary>
    public event Action<FpsSession>? Saved;
    /// <summary>Extra values for the saved session (load, temperatures) from the session recorder.</summary>
    public Func<string, (double? cpu, double? gpu, double? cpuTemp, double? gpuTemp)>? SessionLoad { get; set; }

    public void GameStarted(string? itemId, string name)
    {
        lock (_lock)
        {
            _game = name; _itemId = itemId;
            if (_running || !_enabled() || _capture.Unavailable != null || _capture.PermissionProblem != null) return;
            _apps.Clear(); _rate.Clear(); _csv = new PresentMonCsv(); _stopReason = null; _startedAt = DateTime.UtcNow;
            _running = true;
            try { _capture.Start(OnLine, OnEnded); }
            catch (Exception ex) { _running = false; _stopReason = ex.Message; Log.Warn("fps", ex.Message); }
        }
    }

    /// <summary>The last game ended (or measuring was switched off): saves the session and stops reading.</summary>
    public FpsSession? GameStopped()
    {
        lock (_lock)
        {
            if (!_running) { _game = null; return null; }
            _running = false;
            try { _capture.Stop(); } catch (Exception ex) { Log.Warn("fps", ex.Message); }
            var s = Finish();
            _game = null; _itemId = null;
            return s;
        }
    }

    void OnEnded(string? reason) { lock (_lock) { if (_running) { _running = false; _stopReason = reason ?? "Die Messung wurde beendet."; Finish(); } } }

    void OnLine(string line)
    {
        var f = _csv.Parse(line);
        if (f is not { } fr || NotGames.Contains(fr.App)) return;
        _apps.GetOrAdd(fr.App, _ => new FrameStats()).Add(fr);
        var q = _rate.GetOrAdd(fr.App, _ => new Queue<long>());
        var now = Environment.TickCount64;
        lock (q) { q.Enqueue(now); while (q.Count > 0 && now - q.Peek() > 2000) q.Dequeue(); }
        Interlocked.Increment(ref _tick);
    }

    /// <summary>For tests: feeds lines as if they came from PresentMon.</summary>
    internal void Feed(string line) => OnLine(line);

    /// <summary>The program presenting the most frames in the last 2 s.</summary>
    string? Current()
    {
        var now = Environment.TickCount64; string? best = null; var most = 0;
        foreach (var (app, q) in _rate)
            lock (q) { while (q.Count > 0 && now - q.Peek() > 2000) q.Dequeue(); if (q.Count > most) { most = q.Count; best = app; } }
        return best ?? _apps.OrderByDescending(a => a.Value.Frames).Select(a => a.Key).FirstOrDefault();
    }

    /// <summary>Every program that showed frames in the last 2 s, with its own frame rate – what the frames are "used for".</summary>
    List<FpsApp> Presenting()
    {
        var now = Environment.TickCount64; var list = new List<FpsApp>();
        foreach (var (app, q) in _rate)
        {
            int n; lock (q) { while (q.Count > 0 && now - q.Peek() > 2000) q.Dequeue(); n = q.Count; }
            if (n > 0 && _apps.TryGetValue(app, out var st)) list.Add(new FpsApp(app, st.Now(), ProcessUsageService.KindOf(app), ProcessUsageService.RoleOf(app)));
        }
        return list.OrderByDescending(a => a.Fps ?? 0).Take(8).ToList();
    }

    FpsSession? Finish()
    {
        var main = _apps.OrderByDescending(a => a.Value.Frames).FirstOrDefault();
        if (main.Value == null || main.Value.Frames < MinFramesToSave) return null;
        var st = main.Value;
        var load = SessionLoad?.Invoke(_itemId ?? "") ?? default;
        var chart = new List<double>();
        for (var i = 0; i < st.PerSecond.Count; i += 10) chart.Add(Math.Round(st.PerSecond.Skip(i).Take(10).Average(), 1));
        var s = new FpsSession
        {
            Id = Ids.New("fps"), ItemId = _itemId, Game = _game ?? main.Key, Process = main.Key, Api = st.Api, StartedAt = _startedAt,
            Minutes = Math.Round(st.DurationSeconds / 60, 1), Avg = st.Average, Low1 = st.Low1, Low01 = st.Low01, Stutters = st.Stutters, GpuBusy = st.GpuBusyPercent,
            CpuAvg = load.cpu, GpuAvg = load.gpu, CpuTempMax = load.cpuTemp, GpuTempMax = load.gpuTemp, Chart = chart.Take(720).ToList(),
        };
        _store.Update(f => { f.Sessions.Insert(0, s); if (f.Sessions.Count > Keep) f.Sessions.RemoveRange(Keep, f.Sessions.Count - Keep); });
        Saved?.Invoke(s);
        return s;
    }

    /// <summary>What the island and the pages show live. "state": off | unavailable | permission | idle | waiting | measuring | stopped.</summary>
    public FpsLive Live()
    {
        lock (_lock)
        {
            if (!_enabled()) return new FpsLive("off", "FPS-Messung ist in den Einstellungen ausgeschaltet.");
            if (_capture.Unavailable is { } u) return new FpsLive("unavailable", u);
            if (_capture.PermissionProblem is { } p) return new FpsLive("permission", p) { CanRequestPermission = _capture.CanRequestPermission };
            if (!_running) return _stopReason != null && _game != null ? new FpsLive("stopped", _stopReason) : new FpsLive("idle", "Startet von selbst, sobald ein Spiel läuft.");
            var app = Current();
            if (app == null || !_apps.TryGetValue(app, out var st)) return new FpsLive("waiting", "Warte auf die ersten Bilder des Spiels …") { Game = _game };
            return new FpsLive("measuring", null)
            {
                Game = _game, Process = app, Api = st.Api, Fps = st.Now(), Avg = st.Average, Low1 = st.Low1, Low01 = st.Low01, FrameMs = Math.Round(st.LastMs, 2),
                Stutters = st.Stutters, GpuBusy = st.GpuBusyPercent, Seconds = Math.Round(st.DurationSeconds), FrameTimes = st.RecentFrameTimes().TakeLast(240).ToArray(),
                Apps = Presenting(),
            };
        }
    }

    public List<FpsSession> Sessions(string? itemId = null) => _store.Snapshot().Sessions.Where(s => itemId == null || s.ItemId == itemId).ToList();

    /// <summary>Comparison with the previous session of the same game – only when both are long enough to say something.</summary>
    public static string? Compare(FpsSession now, FpsSession? before)
    {
        if (before?.Avg is not { } b || now.Avg is not { } a || now.Minutes < 2 || before.Minutes < 2) return null;
        if (!string.Equals(now.Api, before.Api, StringComparison.OrdinalIgnoreCase) && now.Api != null && before.Api != null) return null; // different renderer – not comparable
        var d = (a - b) / b * 100;
        if (Math.Abs(d) < 5) return $"Ähnlich wie beim letzten Mal ({b:0} FPS im Schnitt).";
        return d > 0 ? $"Im Schnitt {d:0} % mehr FPS als beim letzten Mal ({b:0} → {a:0})." : $"Im Schnitt {-d:0} % weniger FPS als beim letzten Mal ({b:0} → {a:0}).";
    }

    public object List(string? itemId)
    {
        var all = Sessions(itemId);
        return all.Take(50).Select(s => new
        {
            s.Id, s.ItemId, s.Game, s.Process, s.Api, s.StartedAt, s.Minutes, s.Avg, s.Low1, s.Low01, s.Stutters, s.GpuBusy, s.CpuAvg, s.GpuAvg, s.CpuTempMax, s.GpuTempMax, s.Chart,
            compare = Compare(s, all.Skip(all.IndexOf(s) + 1).FirstOrDefault(o => o.Game == s.Game)),
        }).ToList();
    }

    public bool Forget(string id) => _store.Update(f => f.Sessions.RemoveAll(s => s.Id == id) > 0);
    public string RequestPermission() => _capture.RequestPermission();

    public void Dispose() { try { _capture.Stop(); } catch { } }
}

public sealed record FpsLive(string State, string? Message)
{
    public bool CanRequestPermission { get; init; }
    public string? Game { get; init; }
    public string? Process { get; init; }
    public string? Api { get; init; }
    public double? Fps { get; init; }
    public double? Avg { get; init; }
    public double? Low1 { get; init; }
    public double? Low01 { get; init; }
    public double? FrameMs { get; init; }
    public int Stutters { get; init; }
    public double? GpuBusy { get; init; }
    public double? Seconds { get; init; }
    public double[]? FrameTimes { get; init; }
    public List<FpsApp>? Apps { get; init; }
}

public sealed record FpsApp(string Name, double? Fps, string Kind, string? Role);
