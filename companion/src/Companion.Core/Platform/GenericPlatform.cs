using Pgl.Core.Infrastructure;
using System.Diagnostics;
using Pgl.Core.Models;
using Pgl.Core.Services;

namespace Pgl.Core.Platform;

/// <summary>
/// Cross-platform implementation used by the headless host (development, tests, Linux/macOS).
/// Windows-only features report themselves as unsupported.
/// </summary>
public sealed class GenericPlatform : IPlatform
{
    public string Name => OperatingSystem.IsWindows() ? "Windows (ohne Desktop-Funktionen)" : Environment.OSVersion.Platform.ToString();
    public ILauncher Launcher { get; } = new GenericLauncher();
    public IProcessSource Processes { get; } = new GenericProcessSource();
    public IAudioEngine Audio { get; init; } = new NullAudioEngine("Audiowiedergabe ist nur im Windows-Companion verfügbar.");
    public IHotkeyRegistrar Hotkeys { get; } = new NullHotkeys();
    public IMetricsSource Metrics { get; } = new GenericMetrics();
    public IAutostart Autostart { get; } = new NullAutostart();
    public ISecretProtector Secrets { get; } = new PlainSecretProtector();
    public IDesktopIntegration Desktop { get; } = new NullDesktop();
    public IEnumerable<IDetector> Detectors { get; } = new IDetector[] { new SteamDetector(SteamDetector.DefaultRoots()), new EpicDetector(EpicDetector.DefaultManifestDir()) };
    public IUpdateInstaller UpdateInstaller { get; } = new NullUpdateInstaller();
    /// <summary>No power actions by default; the headless companion can use <see cref="DryRunPower"/> for trying out the app.</summary>
    public IPowerControl Power { get; init; } = NullPower.Instance;
    public IHardwareInfo Hardware { get; init; } = NullHardwareInfo.Instance;
    public IScreenCapture Screen { get; init; } = NullScreenCapture.Instance;
    public IRemoteInput RemoteInput { get; init; } = NullRemoteInput.Instance;
    public IAudioLoopback AudioLoopback { get; init; } = NullAudioLoopback.Instance;
}

/// <summary>Only records what would happen (headless test runs with PGL_POWER_DRYRUN=1) – never switches anything off.</summary>
public sealed class DryRunPower : IPowerControl
{
    public readonly List<(string action, int delay)> Calls = new();
    public bool Supported => true;
    public string? Run(string action, int delaySeconds)
    {
        lock (Calls) Calls.Add((action, delaySeconds));
        Log.Info("power", $"Probelauf: {action} (in {delaySeconds} s) – es wird nichts ausgeschaltet.");
        return null;
    }
}

public sealed class GenericLauncher : ILauncher
{
    public LaunchResult Launch(LibraryItem item)
    {
        if (item.Source != LaunchSource.Exe)
            return new LaunchResult(false, "Diese Startmethode wird nur vom Windows-Companion unterstützt.", "unsupported");
        if (!File.Exists(item.Target)) return new LaunchResult(false, $"Datei nicht gefunden: {item.Target}", "not-found");
        var psi = new ProcessStartInfo(item.Target) { UseShellExecute = false, WorkingDirectory = item.WorkingDir ?? Path.GetDirectoryName(item.Target)! };
        foreach (var a in ArgSplitter.Split(item.Args)) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi);
        return p == null ? new LaunchResult(false, "Prozess konnte nicht gestartet werden.", "start-failed") : new LaunchResult(true, "Gestartet");
    }

    public string? ValidateExecutable(string path)
    {
        if (!File.Exists(path)) return "Datei existiert nicht.";
        if (OperatingSystem.IsWindows())
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext is ".exe" or ".lnk" ? null : "Nur .exe- und .lnk-Dateien sind erlaubt.";
        }
        return (File.GetUnixFileMode(path) & (UnixFileMode.UserExecute | UnixFileMode.GroupExecute | UnixFileMode.OtherExecute)) != 0
            ? null : "Datei ist nicht ausführbar.";
    }

    public string? ExtractIcon(string path) => null;
}

public sealed class GenericProcessSource : IProcessSource
{
    public IReadOnlyList<ProcessInfo> Snapshot()
    {
        var list = new List<ProcessInfo>();
        foreach (var p in Process.GetProcesses())
        {
            using (p)
            {
                string? path = null;
                try
                {
                    if (OperatingSystem.IsLinux())
                    {
                        var link = new FileInfo($"/proc/{p.Id}/exe").LinkTarget;
                        path = link;
                    }
                }
                catch { }
                try { list.Add(new ProcessInfo(p.Id, p.ProcessName, path)); } catch { }
            }
        }
        return list;
    }
}

public sealed class NullAudioEngine(string reason) : IAudioEngine
{
    public bool Supported => false;
    public string? UnsupportedReason => reason;
    public IReadOnlyList<AudioDevice> Devices() => Array.Empty<AudioDevice>();
    public TimeSpan? Play(PlayRequest request, Action<string, string?> onEnded) => throw new InvalidOperationException(reason);
    public void Stop(string playbackId) { }
    public void Pause(string playbackId) { }
    public void Resume(string playbackId) { }
    public void StopAll() { }
    public string? SetMicPassthrough(bool enabled, string? micDeviceId, string? outputDeviceId, float volume) => enabled ? reason : null;
    public bool MicPassthroughActive => false;
    public float? MicLevel => null;
    public string? PlayTestTone(string? deviceId, float volume) => reason;
    public Task<MicTestResult> MicTestAsync(string? deviceId, TimeSpan duration, Action<float> onLevel) => Task.FromResult(new MicTestResult(null, 0, 0, reason));
    public event Action? DevicesChanged { add { } remove { } }
}

public sealed class NullHotkeys : IHotkeyRegistrar
{
    public bool Supported => false;
    public string? Register(int id, string keys, Action onPressed) => "Globale Hotkeys werden nur vom Windows-Companion unterstützt.";
    public void Unregister(int id) { }
    public void UnregisterAll() { }
}

public sealed class NullAutostart : IAutostart
{
    public bool Supported => false;
    public bool IsEnabled() => false;
    public string? SetEnabled(bool enabled) => "Autostart wird nur vom Windows-Companion unterstützt.";
}

public sealed class PlainSecretProtector : ISecretProtector
{
    public string Description => "Ohne Betriebssystem-Verschlüsselung gespeichert (nur Hash/Schlüssel, nie Klartext-Token).";
    public string Protect(string plain) => "plain:" + plain;
    public string? Unprotect(string v) => v.StartsWith("plain:") ? v[6..] : null;
}

public sealed class NullDesktop : IDesktopIntegration
{
    public bool CanListApps => false;
    public string? OpenStoreProduct(string productId) => "Installieren über die Xbox-App geht nur mit dem Windows-Begleiter.";
    public string? OpenSteamInstall(string appId) => "Installieren über Steam geht nur mit dem Windows-Begleiter.";
    public string? OpenEpicInstall(string epicId) => "Installieren über Epic geht nur mit dem Windows-Begleiter.";
    public bool CanPickFiles => false;
    public Task<string?> PickExecutableAsync() => Task.FromResult<string?>(null);
    public void OpenFolder(string path) { }
    public void ShowPairingRequest(string deviceName) { }
    public void ShowToast(string title, string message) { }
    public IReadOnlyList<DetectedItem> StartMenuApps() => Array.Empty<DetectedItem>();
}

public sealed class NullUpdateInstaller : IUpdateInstaller
{
    public bool Supported => false;
    public string? Install(string newFile) => "Automatische Installation wird nur vom Windows-Companion unterstützt.";
}

public sealed class GenericMetrics : IMetricsSource
{
    (ulong idle, ulong total)? _last;
    volatile MetricSwitches _on = new();
    public void Apply(MetricSwitches on) => _on = on.Copy();

    public MetricsSample Sample()
    {
        var s = new MetricsSample { CpuCores = Environment.ProcessorCount };
        if (OperatingSystem.IsLinux())
        {
            try
            {
                var parts = File.ReadLines("/proc/stat").First().Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1).Select(ulong.Parse).ToArray();
                ulong idle = parts[3] + (parts.Length > 4 ? parts[4] : 0), total = 0;
                foreach (var v in parts) total += v;
                if (_last is { } l && total > l.total) s.CpuPercent = Math.Round(100.0 * (1 - (double)(idle - l.idle) / (total - l.total)), 1);
                _last = (idle, total);
                s.Sources["cpu"] = "/proc/stat";
                var mem = File.ReadLines("/proc/meminfo").Select(x => x.Split(':')).ToDictionary(x => x[0], x => long.Parse(x[1].Trim().Split(' ')[0]) * 1024);
                s.MemTotalBytes = mem["MemTotal"];
                s.MemUsedBytes = mem["MemTotal"] - mem.GetValueOrDefault("MemAvailable", mem["MemFree"]);
                s.Sources["ram"] = "/proc/meminfo";
                s.UptimeHours = Math.Round(double.Parse(File.ReadAllText("/proc/uptime").Split(' ')[0], System.Globalization.CultureInfo.InvariantCulture) / 3600, 1);
            }
            catch { }
        }
        if (_on.Disks) s.Disks = DiskInfo.ReadCached(TimeSpan.FromSeconds(60));
        return _on.Strip(s);
    }
}

public static class DiskInfo
{
    static List<DiskSample>? _cache;
    static DateTime _cacheAt;
    static readonly object Lock = new();

    /// <summary>
    /// Free space changes slowly; asking the drives every 2 s costs time and can wake sleeping hard disks.
    /// Live values therefore reuse the last reading for up to a minute.
    /// </summary>
    public static List<DiskSample> ReadCached(TimeSpan maxAge)
    {
        lock (Lock)
        {
            if (_cache == null || DateTime.UtcNow - _cacheAt > maxAge) { _cache = Read(); _cacheAt = DateTime.UtcNow; }
            return _cache;
        }
    }

    public static List<DiskSample> Read()
    {
        var list = new List<DiskSample>();
        foreach (var d in DriveInfo.GetDrives())
        {
            try
            {
                if (!d.IsReady || d.DriveType is not (DriveType.Fixed) || d.TotalSize < 1_000_000_000) continue;
                if (!OperatingSystem.IsWindows() && !(d.Name == "/" || d.Name.StartsWith("/home") || d.Name.StartsWith("/mnt"))) continue;
                list.Add(new DiskSample(d.Name, OperatingSystem.IsWindows() ? d.VolumeLabel : d.Name, d.TotalSize, d.AvailableFreeSpace));
            }
            catch { }
        }
        return list;
    }
}

/// <summary>Splits a Windows-style argument string into separate arguments without invoking a shell.</summary>
public static class ArgSplitter
{
    public static List<string> Split(string? args)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(args)) return result;
        var cur = new System.Text.StringBuilder();
        bool quoted = false, any = false;
        foreach (var c in args)
        {
            if (c == '"') { quoted = !quoted; any = true; continue; }
            if (char.IsWhiteSpace(c) && !quoted)
            {
                if (cur.Length > 0 || any) result.Add(cur.ToString());
                cur.Clear(); any = false;
                continue;
            }
            cur.Append(c);
        }
        if (cur.Length > 0 || any) result.Add(cur.ToString());
        return result;
    }
}

/// <summary>Reads lines of "nvidia-smi --query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits".</summary>
public static class NvidiaSmi
{
    public const string Query = "--query-gpu=index,name,utilization.gpu,temperature.gpu,memory.used,memory.total";

    public static (int index, GpuSample gpu)? ParseLine(string line)
    {
        var f = line.Split(',').Select(x => x.Trim()).ToArray();
        if (f.Length < 6 || !int.TryParse(f[0], out var index)) return null;
        var inv = System.Globalization.CultureInfo.InvariantCulture;
        double? D(int i) => double.TryParse(f[i], System.Globalization.NumberStyles.Float, inv, out var v) ? v : null; // "[N/A]" → null
        return (index, new GpuSample { Name = f[1], UtilPercent = D(2), TempC = D(3), MemUsedBytes = (long?)(D(4) * 1024 * 1024), MemTotalBytes = (long?)(D(5) * 1024 * 1024), Source = "nvidia-smi" });
    }
}
