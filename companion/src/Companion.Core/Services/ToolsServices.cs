using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

// ============================================================ Performance per game session

/// <summary>
/// Measures CPU/RAM/GPU load while a game runs (one sample every 10 s, only during game sessions) and stores
/// average and peak with the session ("Leistungsverlauf"). FPS is not measured: Windows has no source for it
/// without overlays or drivers – it is never estimated.
/// </summary>
public sealed class PerformanceRecorder : IDisposable
{
    readonly IMetricsSource _source;
    readonly Func<bool> _enabled;
    readonly ConcurrentDictionary<string, Acc> _running = new();
    Timer? _timer;
    int _busy;

    sealed class Acc { public int N; public double Cpu, CpuMax, Ram, Gpu, GpuMax; public int CpuN, RamN, GpuN; }

    public PerformanceRecorder(IMetricsSource source, Func<bool> enabled) { _source = source; _enabled = enabled; }

    public void GameStarted(string itemId)
    {
        if (!_enabled()) return;
        _running[itemId] = new Acc();
        _timer ??= new Timer(_ => Sample(), null, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(10));
    }

    public SessionPerf? GameStopped(string itemId)
    {
        _running.TryRemove(itemId, out var a);
        if (_running.IsEmpty) { _timer?.Dispose(); _timer = null; }
        if (a == null || a.N == 0) return null;
        return new SessionPerf
        {
            Samples = a.N,
            CpuAvg = a.CpuN > 0 ? Math.Round(a.Cpu / a.CpuN, 1) : null, CpuMax = a.CpuN > 0 ? Math.Round(a.CpuMax, 1) : null,
            RamAvg = a.RamN > 0 ? Math.Round(a.Ram / a.RamN, 1) : null,
            GpuAvg = a.GpuN > 0 ? Math.Round(a.Gpu / a.GpuN, 1) : null, GpuMax = a.GpuN > 0 ? Math.Round(a.GpuMax, 1) : null,
        };
    }

    void Sample()
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return;
        try
        {
            var m = _source.Sample();
            var ram = m.MemTotalBytes is > 0 && m.MemUsedBytes != null ? 100.0 * m.MemUsedBytes.Value / m.MemTotalBytes.Value : (double?)null;
            var gpu = m.Gpus.Count > 0 ? m.Gpus.Max(g => g.UtilPercent) : null;
            foreach (var a in _running.Values)
                lock (a)
                {
                    a.N++;
                    if (m.CpuPercent is { } c) { a.Cpu += c; a.CpuMax = Math.Max(a.CpuMax, c); a.CpuN++; }
                    if (ram is { } r) { a.Ram += r; a.RamN++; }
                    if (gpu is { } g) { a.Gpu += g; a.GpuMax = Math.Max(a.GpuMax, g); a.GpuN++; }
                }
        }
        catch (Exception ex) { Log.Warn("perf", ex.Message); }
        finally { Volatile.Write(ref _busy, 0); }
    }

    internal void SampleNow() => Sample();

    public void Dispose() => _timer?.Dispose();
}

// ============================================================ Network monitor

/// <summary>
/// Live ping to the router and the internet with packet loss and jitter. Pings run only while a device has the
/// view open (subscription "network"), every 2 s; the last 30 minutes stay in memory as history.
/// </summary>
public sealed class NetworkMonitor : IDisposable
{
    public sealed record Target(string Id, string Label, string Host);
    public sealed record Point(DateTime At, double? Ms);

    readonly RpcServer _rpc;
    readonly ConcurrentDictionary<string, LinkedList<Point>> _history = new();
    readonly object _lock = new();
    readonly Func<string, IPAddress?, Task<double?>> _ping;
    Timer? _timer;
    int _busy;
    List<Target> _targets = new();
    const int MaxPoints = 900; // 30 min at 2 s

    public NetworkMonitor(RpcServer rpc, Func<string, IPAddress?, Task<double?>>? ping = null) { _rpc = rpc; _ping = ping ?? PingOnce; }

    static List<Target> DetectTargets()
    {
        var list = new List<Target>();
        var gw = NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().GatewayAddresses).Select(g => g.Address)
            .FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !a.Equals(IPAddress.Any));
        if (gw != null) list.Add(new Target("router", "Router", gw.ToString()));
        list.Add(new Target("internet", "Internet (Cloudflare)", "1.1.1.1"));
        list.Add(new Target("dns", "Internet (Google)", "8.8.8.8"));
        return list;
    }

    public object Subscribe(RpcSession s)
    {
        lock (_lock)
        {
            s.Subscriptions.Add("network");
            if (_timer == null) { _targets = DetectTargets(); _timer = new Timer(_ => _ = Tick(), null, TimeSpan.Zero, TimeSpan.FromSeconds(2)); }
        }
        return History();
    }

    public void Unsubscribe(RpcSession s)
    {
        lock (_lock)
        {
            s.Subscriptions.Remove("network");
            if (_rpc.Sessions.Any(x => x.Subscriptions.Contains("network"))) return;
            _timer?.Dispose(); _timer = null;
        }
    }

    internal async Task Tick()
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return;
        try
        {
            if (!_rpc.Sessions.Any(x => x.Subscriptions.Contains("network"))) { lock (_lock) { _timer?.Dispose(); _timer = null; } return; }
            var now = DateTime.UtcNow;
            var results = await Task.WhenAll(_targets.Select(async t => (t, ms: await _ping(t.Host, IPAddress.TryParse(t.Host, out var ip) ? ip : null))));
            foreach (var (t, ms) in results)
            {
                var h = _history.GetOrAdd(t.Id, _ => new LinkedList<Point>());
                lock (h) { h.AddLast(new Point(now, ms)); while (h.Count > MaxPoints) h.RemoveFirst(); }
            }
            _rpc.BroadcastTo(x => x.Authenticated && x.Subscriptions.Contains("network"), "network.sample",
                new { at = now, targets = results.Select(r => new { r.t.Id, r.t.Label, r.t.Host, ms = r.ms }) });
        }
        catch (Exception ex) { Log.Warn("network", ex.Message); }
        finally { Volatile.Write(ref _busy, 0); }
    }

    /// <summary>History with statistics: average, minimum, maximum, jitter (mean difference between consecutive pings), loss.</summary>
    public object History() => new
    {
        intervalSeconds = 2,
        targets = _targets.Select(t =>
        {
            var pts = _history.TryGetValue(t.Id, out var h) ? (List<Point>)Locked(h) : new List<Point>();
            var ok = pts.Where(p => p.Ms != null).Select(p => p.Ms!.Value).ToList();
            var jitter = ok.Count > 1 ? ok.Zip(ok.Skip(1), (a, b) => Math.Abs(b - a)).Average() : (double?)null;
            return new
            {
                t.Id, t.Label, t.Host, samples = pts.Count,
                avg = ok.Count > 0 ? Math.Round(ok.Average(), 1) : (double?)null, min = ok.Count > 0 ? ok.Min() : (double?)null, max = ok.Count > 0 ? ok.Max() : (double?)null,
                jitter = jitter == null ? (double?)null : Math.Round(jitter.Value, 1),
                lossPercent = pts.Count > 0 ? Math.Round(100.0 * pts.Count(p => p.Ms == null) / pts.Count, 1) : (double?)null,
                points = pts.TakeLast(150).Select(p => new { p.At, p.Ms }),
            };
        }),
    };

    static List<Point> Locked(LinkedList<Point> h) { lock (h) return h.ToList(); }

    /// <summary>For tests: fixed targets and recorded results.</summary>
    internal void Record(Target target, double? ms)
    {
        if (_targets.All(t => t.Id != target.Id)) _targets.Add(target);
        var h = _history.GetOrAdd(target.Id, _ => new LinkedList<Point>());
        lock (h) h.AddLast(new Point(DateTime.UtcNow, ms));
    }

    static async Task<double?> PingOnce(string host, IPAddress? ip)
    {
        try
        {
            using var p = new Ping();
            var r = ip != null ? await p.SendPingAsync(ip, 1000) : await p.SendPingAsync(host, 1000);
            return r.Status == IPStatus.Success ? r.RoundtripTime : null;
        }
        catch { return null; }
    }

    public void Dispose() => _timer?.Dispose();
}

// ============================================================ Storage

public sealed class StorageFile { public Dictionary<string, SizeEntry> Sizes { get; set; } = new(); }
public sealed class SizeEntry { public long Bytes { get; set; } public int Files { get; set; } public DateTime At { get; set; } public bool Partial { get; set; } }

/// <summary>Drives and the size of each game's install folder. Folder sizes are computed only on request, one at a time.</summary>
public sealed class StorageService
{
    readonly JsonStore<StorageFile> _store;
    readonly LibraryService _library;
    readonly IPlatform _platform;
    readonly IHub _hub;
    readonly SemaphoreSlim _scan = new(1, 1);
    string? _scanning;

    public StorageService(AppPaths paths, LibraryService library, IPlatform platform, IHub hub)
    {
        _store = new JsonStore<StorageFile>(paths.File("storage.json"));
        _library = library; _platform = platform; _hub = hub;
    }

    public object Get()
    {
        var sizes = _store.Snapshot().Sizes;
        var drives = new List<object>();
        foreach (var d in DriveInfo.GetDrives())
            try
            {
                if (!d.IsReady || d.DriveType is not (DriveType.Fixed or DriveType.Removable) || d.TotalSize < 1_000_000_000) continue;
                drives.Add(new { name = d.Name, label = d.VolumeLabel, total = d.TotalSize, free = d.AvailableFreeSpace, format = d.DriveFormat });
            }
            catch { /* drive vanished */ }
        var items = _library.List().Where(i => !string.IsNullOrEmpty(i.InstallDir)).Select(i => new
        {
            i.Id, i.Name, i.Kind, i.InstallDir, exists = Directory.Exists(i.InstallDir),
            size = sizes.TryGetValue(i.Id, out var e) ? e : null,
        }).OrderByDescending(x => x.size?.Bytes ?? -1).ToList();
        return new { drives, items, scanning = _scanning };
    }

    /// <summary>Computes folder sizes in the background (all items without size, or one item). Progress via "changed: storage".</summary>
    public object Scan(string? itemId)
    {
        var targets = _library.List().Where(i => !string.IsNullOrEmpty(i.InstallDir) && Directory.Exists(i.InstallDir) && (itemId == null || i.Id == itemId)).ToList();
        if (targets.Count == 0) throw new RpcException("not-found", itemId == null ? "Keine Spiele mit bekanntem Installationsordner." : "Installationsordner nicht gefunden.");
        if (!_scan.Wait(0)) throw new RpcException("busy", "Es wird bereits gerechnet.");
        _ = Task.Run(() =>
        {
            try
            {
                foreach (var i in targets)
                {
                    _scanning = i.Name; _hub.Changed("storage");
                    var (bytes, files, partial) = FolderSize(i.InstallDir!);
                    _store.Update(f => f.Sizes[i.Id] = new SizeEntry { Bytes = bytes, Files = files, At = DateTime.UtcNow, Partial = partial });
                }
            }
            catch (Exception ex) { Log.Warn("storage", ex.Message); }
            finally { _scanning = null; _scan.Release(); _hub.Changed("storage"); }
        });
        return new { started = targets.Count };
    }

    /// <summary>Sum of all file sizes. Unreadable folders are skipped (result marked partial), links are not followed.</summary>
    internal static (long bytes, int files, bool partial) FolderSize(string dir)
    {
        long bytes = 0; int files = 0; var partial = false;
        var stack = new Stack<string>(); stack.Push(dir);
        while (stack.Count > 0)
        {
            var d = stack.Pop();
            try
            {
                foreach (var e in new DirectoryInfo(d).EnumerateFileSystemInfos())
                {
                    if (e.Attributes.HasFlag(FileAttributes.ReparsePoint)) continue;
                    if (e is FileInfo fi) { bytes += fi.Length; files++; }
                    else stack.Push(e.FullName);
                }
            }
            catch (Exception) { partial = true; }
        }
        return (bytes, files, partial);
    }

    public void OpenFolder(string itemId)
    {
        var i = _library.Get(itemId) ?? throw new RpcException("not-found", "Eintrag nicht gefunden.");
        if (string.IsNullOrEmpty(i.InstallDir) || !Directory.Exists(i.InstallDir)) throw new RpcException("not-found", "Installationsordner nicht gefunden.");
        _platform.Desktop.OpenFolder(i.InstallDir);
    }
}

// ============================================================ Consistency check

public static class ConsistencyCheck
{
    /// <summary>Finds broken references: missing program files, hotkeys/actions/profiles pointing to deleted entries, duplicate hotkeys.</summary>
    public static List<(string area, string label, string status, string detail, string? fix)> Run(CompanionServices s)
    {
        var r = new List<(string, string, string, string, string?)>();
        var lib = s.Library.List();
        var ids = lib.Select(i => i.Id).ToHashSet();
        var sounds = s.Soundboard.Get().Sounds.Select(x => x.Id).ToHashSet();
        var profiles = s.Profiles.Get().Profiles.Select(p => p.Id).ToHashSet();
        var quick = s.QuickActions.List().Select(q => q.Id).ToHashSet();
        var hotkeys = s.Hotkeys.List();

        var missingExe = lib.Where(i => i.Source == LaunchSource.Exe && !File.Exists(i.Target)).Select(i => i.Name).ToList();
        r.Add(("check-paths", "Prüfung: Programmpfade", missingExe.Count == 0 ? "ok" : "warn",
            missingExe.Count == 0 ? $"Alle {lib.Count(i => i.Source == LaunchSource.Exe)} freigegebenen Programme sind vorhanden." : "Datei fehlt: " + string.Join(", ", missingExe.Take(10)),
            missingExe.Count == 0 ? null : "Programm neu installiert oder verschoben? Am PC unter Spiele/Programme → Bearbeiten → Pfad ändern, oder Eintrag entfernen."));

        string? Missing(ActionStep st) => st.Type switch
        {
            StepType.LaunchItem when !ids.Contains(st.Ref ?? "") => "Spiel/Programm",
            StepType.PlaySound when !sounds.Contains(st.Ref ?? "") => "Sound",
            StepType.ActivateProfile when !profiles.Contains(st.Ref ?? "") => "Profil",
            _ => null,
        };
        var broken = new List<string>();
        foreach (var q in s.QuickActions.List()) foreach (var st in q.Steps) if (Missing(st) is { } m) broken.Add($"Quick Action „{q.Name}“ → gelöschtes {m}");
        foreach (var a in s.Automations.List()) foreach (var st in a.Actions) if (Missing(st) is { } m) broken.Add($"Automatisierung „{a.Name}“ → gelöschtes {m}");
        foreach (var h in hotkeys)
        {
            if (h.QuickActionId != null && !quick.Contains(h.QuickActionId)) broken.Add($"Hotkey {h.Keys} → gelöschte Quick Action");
            else if (h.QuickActionId == null && Missing(h.Action) is { } m) broken.Add($"Hotkey {h.Keys} → gelöschtes {m}");
        }
        foreach (var p in s.Profiles.Get().Profiles)
        {
            foreach (var pid in p.LaunchProgramIds.Where(x => !ids.Contains(x))) broken.Add($"Profil „{p.Name}“ → gelöschtes Programm");
            foreach (var hid in p.HotkeyIds.Where(x => hotkeys.All(h => h.Id != x))) broken.Add($"Profil „{p.Name}“ → gelöschter Hotkey");
        }
        r.Add(("check-refs", "Prüfung: Verweise", broken.Count == 0 ? "ok" : "warn", broken.Count == 0 ? "Keine verwaisten Verweise." : string.Join("; ", broken.Take(10)) + (broken.Count > 10 ? $" (+{broken.Count - 10})" : ""),
            broken.Count == 0 ? null : "Betroffene Aktion/Automatisierung/Hotkey bearbeiten und ein neues Ziel wählen."));

        var dupes = hotkeys.Where(h => h.Enabled).GroupBy(h => h.Keys, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        var status = s.Hotkeys.ListWithStatus();
        var hkErrors = System.Text.Json.JsonSerializer.SerializeToElement(status, Json.Options).GetProperty("hotkeys").EnumerateArray()
            .Where(x => x.GetProperty("status").GetProperty("state").GetString() == "error")
            .Select(x => x.GetProperty("hotkey").GetProperty("keys").GetString() + ": " + (x.GetProperty("status").TryGetProperty("message", out var msg) ? msg.GetString() : "")).ToList();
        r.Add(("check-hotkeys", "Prüfung: Hotkeys", dupes.Count + hkErrors.Count == 0 ? "ok" : "warn",
            dupes.Count + hkErrors.Count == 0 ? $"{hotkeys.Count} Hotkeys ohne Konflikt." : string.Join("; ", dupes.Select(d => "doppelt: " + d).Concat(hkErrors)),
            dupes.Count + hkErrors.Count == 0 ? null : "Hotkeys → Kombination ändern. „Belegt“ heißt: ein anderes Programm nutzt sie bereits."));
        return r;
    }
}
