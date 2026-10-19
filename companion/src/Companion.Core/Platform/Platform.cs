using Pgl.Core.Models;

namespace Pgl.Core.Platform;

/// <summary>
/// Everything that touches the operating system goes through these interfaces.
/// Windows implements them natively; the cross-platform host uses <see cref="GenericPlatform"/>,
/// which reports unsupported features honestly instead of pretending.
/// </summary>
public interface IPlatform
{
    string Name { get; }
    ILauncher Launcher { get; }
    IProcessSource Processes { get; }
    IAudioEngine Audio { get; }
    IHotkeyRegistrar Hotkeys { get; }
    IMetricsSource Metrics { get; }
    IAutostart Autostart { get; }
    ISecretProtector Secrets { get; }
    IDesktopIntegration Desktop { get; }
    IEnumerable<IDetector> Detectors { get; }
    IUpdateInstaller UpdateInstaller { get; }
    /// <summary>Lock, sleep, restart, shut down (Windows companion only).</summary>
    IPowerControl Power => NullPower.Instance;
    /// <summary>In-game overlay window (Windows companion only).</summary>
    IOverlay Overlay => NullOverlay.Instance;
    /// <summary>Presses keyboard shortcuts of other programs (NVIDIA, Xbox Game Bar …). Windows companion only.</summary>
    IKeySender KeySender => NullKeySender.Instance;
    /// <summary>Makes the companion step back while a game runs (priority, efficiency mode, memory). No-op elsewhere.</summary>
    IGameMode GameMode => NullGameMode.Instance;
    /// <summary>Own widgets as small windows on the Windows desktop (Windows companion only).</summary>
    IDesktopWidgets DesktopWidgets => NullDesktopWidgets.Instance;
    /// <summary>Closes and reopens chosen programs for the game mode (Windows companion only).</summary>
    IProcessControl ProcessControl => NullProcessControl.Instance;
}

/// <summary>Gentle closing of a program (like clicking its X) and starting it again. Never forced.</summary>
public interface IProcessControl
{
    bool Supported { get; }
    /// <summary>Asks the program to close and waits. Returns null when it ended, otherwise why not.</summary>
    string? CloseGracefully(int pid, TimeSpan wait);
    string? Start(string exePath);
}

public sealed class NullProcessControl : IProcessControl
{
    public static readonly NullProcessControl Instance = new();
    public bool Supported => false;
    public string? CloseGracefully(int pid, TimeSpan wait) => "Nur im Windows-Begleiter möglich.";
    public string? Start(string exePath) => "Nur im Windows-Begleiter möglich.";
}

/// <summary>
/// Widgets from the widget editor as small borderless windows at the bottom of the desktop (below all other windows).
/// Start menu, lock screen and the Windows widget board are closed to normal programs, so there is nothing for them here.
/// </summary>
public interface IDesktopWidgets
{
    bool Supported { get; }
    /// <summary>Shows exactly these widgets (windows of other widgets are closed). Called again after every change.</summary>
    void Sync(IReadOnlyList<Services.CustomWidget> widgets);
    /// <summary>While a game runs the windows are hidden and their browser engine is suspended (no CPU, less memory).</summary>
    void SetPaused(bool paused);
    /// <summary>The user moved a widget window: id, new position as share of the (virtual) screen.</summary>
    event Action<string, double, double>? Moved;
}

public sealed class NullDesktopWidgets : IDesktopWidgets
{
    public static readonly NullDesktopWidgets Instance = new();
    public bool Supported => false;
    public void Sync(IReadOnlyList<Services.CustomWidget> widgets) { }
    public void SetPaused(bool paused) { }
    public event Action<string, double, double>? Moved { add { } remove { } }
}

public interface IGameMode
{
    /// <summary>
    /// true while a game runs (and the large overlay is not open). audioLive: the microphone is passed through right now –
    /// then priority and clock speed stay normal so voice chat does not crackle; only memory is given back.
    /// Returns a readable description of what was applied.
    /// </summary>
    string Apply(bool gaming, bool audioLive);
}

public sealed class NullGameMode : IGameMode
{
    public static readonly NullGameMode Instance = new();
    public string Apply(bool gaming, bool audioLive) => "";
}

public interface IKeySender
{
    bool Supported { get; }
    /// <summary>Presses a normalized combination such as "Alt+F9" once. Returns an error text or null.</summary>
    Task<string?> SendAsync(string combo);
}

public sealed class NullKeySender : IKeySender
{
    public static readonly NullKeySender Instance = new();
    public bool Supported => false;
    public Task<string?> SendAsync(string combo) => Task.FromResult<string?>("Tastenkürzel an andere Programme senden geht nur im Windows-Begleiter.");
}

public interface IOverlay
{
    bool Supported { get; }
    /// <summary>"full" (interactive panel), "mini" (small click-through window in a corner) or null (hidden).</summary>
    string? Visible { get; }
    /// <summary>Shows the overlay in this mode, or hides it if it is already shown in this mode. Returns an error text or null.</summary>
    string? Toggle(string mode);
    void Hide();
    event Action? Changed;
}

public sealed class NullOverlay : IOverlay
{
    public static readonly NullOverlay Instance = new();
    public bool Supported => false;
    public string? Visible => null;
    public string? Toggle(string mode) => "Das Overlay gibt es nur im Windows-Begleiter.";
    public void Hide() { }
    public event Action? Changed { add { } remove { } }
}

public interface IPowerControl
{
    bool Supported { get; }
    /// <summary>Runs "lock", "sleep", "restart", "shutdown" or "cancel". Restart/shutdown wait <paramref name="delaySeconds"/> and can be cancelled.</summary>
    string? Run(string action, int delaySeconds);
}

public sealed class NullPower : IPowerControl
{
    public static readonly NullPower Instance = new();
    public bool Supported => false;
    public string? Run(string action, int delaySeconds) => "Energie-Aktionen sind nur im Windows-Begleiter verfügbar.";
}

public interface ILauncher
{
    /// <summary>Starts an already validated item. Must not interpret the target through a shell command line.</summary>
    LaunchResult Launch(LibraryItem item);
    /// <summary>Platform specific validation (e.g. allowed file extensions). Return null if valid.</summary>
    string? ValidateExecutable(string path);
    string? ExtractIcon(string path);
}

public sealed record ProcessInfo(int Pid, string Name, string? Path);

public interface IProcessSource
{
    IReadOnlyList<ProcessInfo> Snapshot();
    /// <summary>Without paths it is much cheaper (no handle per process) – paths are only needed for games detected by folder.</summary>
    IReadOnlyList<ProcessInfo> Snapshot(bool withPaths) => Snapshot();
}

/// <summary>
/// Remembers the executable path per process id, so each process is opened only once instead of every scan.
/// A recycled id with a different process name is looked up again.
/// </summary>
public sealed class ProcessPathCache
{
    readonly Dictionary<int, (string name, string? path)> _known = new();

    /// <summary>Paths for the current processes; <paramref name="resolve"/> is only called for processes not seen before.</summary>
    public IReadOnlyList<ProcessInfo> Resolve(IEnumerable<(int pid, string name)> current, Func<int, string?> resolve)
    {
        var list = new List<ProcessInfo>();
        var seen = new HashSet<int>();
        foreach (var (pid, name) in current)
        {
            seen.Add(pid);
            if (!_known.TryGetValue(pid, out var k) || k.name != name) _known[pid] = k = (name, resolve(pid));
            list.Add(new ProcessInfo(pid, name, k.path));
        }
        foreach (var gone in _known.Keys.Where(p => !seen.Contains(p)).ToList()) _known.Remove(gone);
        return list;
    }

    public int Count => _known.Count;
}

public sealed class PlayRequest
{
    public required string FilePath { get; init; }
    public required string PlaybackId { get; init; }
    public string? OutputDeviceId { get; init; }
    public float Volume { get; init; } = 1f;
    public string? MonitorDeviceId { get; init; }
    public float MonitorVolume { get; init; } = 1f;
    /// <summary>Repeat until stopped.</summary>
    public bool Loop { get; init; }
}

public interface IAudioEngine
{
    bool Supported { get; }
    string? UnsupportedReason { get; }
    IReadOnlyList<AudioDevice> Devices();
    /// <summary>Starts playback; returns duration if known. Invokes <paramref name="onEnded"/> on completion.</summary>
    TimeSpan? Play(PlayRequest request, Action<string, string?> onEnded);
    void Stop(string playbackId);
    void Pause(string playbackId);
    void Resume(string playbackId);
    void StopAll();
    /// <summary>Mixes the microphone into the soundboard output (for a virtual cable). Returns an error message or null.</summary>
    string? SetMicPassthrough(bool enabled, string? micDeviceId, string? outputDeviceId, float volume);
    bool MicPassthroughActive { get; }
    /// <summary>Current mic peak level 0..1 while passthrough is active; null otherwise.</summary>
    float? MicLevel { get; }
    string? PlayTestTone(string? deviceId, float volume);
    /// <summary>Records the microphone for <paramref name="duration"/> and reports its peak level (0..1) about 10× per second.
    /// Independent of the passthrough; nothing is stored or sent anywhere.</summary>
    Task<MicTestResult> MicTestAsync(string? deviceId, TimeSpan duration, Action<float> onLevel);
    /// <summary>Raised when an audio device is plugged in/removed, enabled/disabled or the Windows default changes.</summary>
    event Action? DevicesChanged;
}

public sealed record MicTestResult(string? Device, float Peak, float Average, string? Error);

public interface IHotkeyRegistrar
{
    bool Supported { get; }
    /// <summary>Registers a combination. Returns null on success or an error text (e.g. already used by another program).</summary>
    string? Register(int id, string keys, Action onPressed);
    void Unregister(int id);
    void UnregisterAll();
}

public sealed class MetricsSample
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public double? CpuPercent { get; set; }
    public string? CpuName { get; set; }
    public int? CpuCores { get; set; }
    public double? CpuTempC { get; set; }
    public string CpuTempSource { get; set; } = "Nicht verfügbar";
    public long? MemTotalBytes { get; set; }
    public long? MemUsedBytes { get; set; }
    public List<GpuSample> Gpus { get; set; } = new();
    public List<DiskSample> Disks { get; set; } = new();
    public double? UptimeHours { get; set; }
    public string? FpsStatus { get; set; } = "Nicht verfügbar – benötigt einen Frame-Capture-Dienst (z. B. PresentMon), der nicht eingebunden ist.";
    public Dictionary<string, string> Sources { get; set; } = new();
    /// <summary>Values switched off in the settings (cpu, ram, gpu, disks) – not measured, so the UI says "ausgeschaltet" instead of "nicht verfügbar".</summary>
    public List<string> Off { get; set; } = new();
}

public sealed class GpuSample
{
    public string Name { get; set; } = "";
    public double? UtilPercent { get; set; }
    public double? TempC { get; set; }
    public long? MemUsedBytes { get; set; }
    public long? MemTotalBytes { get; set; }
    public string Source { get; set; } = "";
}

public sealed record DiskSample(string Name, string Label, long TotalBytes, long FreeBytes);

public interface IMetricsSource
{
    MetricsSample Sample();
    /// <summary>Which values are measured. Sources that can skip expensive queries (e.g. nvidia-smi) do so for switched-off values.</summary>
    void Apply(MetricSwitches on) { }
}

/// <summary>Each value of the PC monitor can be switched off; off means not measured at all (not just hidden).</summary>
public sealed class MetricSwitches
{
    public bool Cpu { get; set; } = true;
    public bool Ram { get; set; } = true;
    /// <summary>Utilization, graphics memory and temperature of the graphics card.</summary>
    public bool Gpu { get; set; } = true;
    /// <summary>Free space per drive.</summary>
    public bool Disks { get; set; } = true;

    public MetricSwitches Copy() => new() { Cpu = Cpu, Ram = Ram, Gpu = Gpu, Disks = Disks };

    /// <summary>Removes switched-off values from a sample (for sources that measured them anyway) and lists them in <see cref="MetricsSample.Off"/>.</summary>
    public MetricsSample Strip(MetricsSample s)
    {
        s.Off.Clear();
        if (!Cpu) { s.CpuPercent = null; s.CpuTempC = null; s.Sources.Remove("cpu"); s.Off.Add("cpu"); }
        if (!Ram) { s.MemUsedBytes = null; s.MemTotalBytes = null; s.Sources.Remove("ram"); s.Off.Add("ram"); }
        if (!Gpu) { s.Gpus = new(); s.Off.Add("gpu"); }
        if (!Disks) { s.Disks = new(); s.Off.Add("disks"); }
        return s;
    }
}

/// <summary>The platform source with the user's switches applied – used by everything in the companion that reads values.</summary>
public sealed class SwitchedMetrics(IMetricsSource inner, Func<MetricSwitches> on) : IMetricsSource
{
    public MetricsSample Sample() => on().Strip(inner.Sample());
    public void Apply(MetricSwitches s) => inner.Apply(s);
}

public interface IAutostart
{
    bool Supported { get; }
    bool IsEnabled();
    string? SetEnabled(bool enabled);
}

public interface ISecretProtector
{
    string Protect(string plain);
    string? Unprotect(string protectedValue);
    string Description { get; }
}

public interface IDesktopIntegration
{
    bool CanPickFiles { get; }
    Task<string?> PickExecutableAsync();
    void OpenFolder(string path);
    void ShowPairingRequest(string deviceName);
    void ShowToast(string title, string message);
    IReadOnlyList<DetectedItem> StartMenuApps();
    /// <summary>True if <see cref="StartMenuApps"/> really lists installed apps (needed to recognise installed Game Pass games).</summary>
    bool CanListApps { get; }
    /// <summary>Opens a Microsoft Store product (already validated id) in the Xbox app or Store. Returns an error text or null.</summary>
    string? OpenStoreProduct(string productId);
    /// <summary>Asks the Steam client to install a game (already validated numeric app id). Returns an error text or null.</summary>
    string? OpenSteamInstall(string appId);
    /// <summary>Asks the Epic Games Launcher to install a game ("namespace:catalogItemId:appName", already validated).</summary>
    string? OpenEpicInstall(string epicId);
}

public interface IDetector
{
    string Name { get; }
    IEnumerable<DetectedItem> Detect();
}

public interface IUpdateInstaller
{
    bool Supported { get; }
    /// <summary>Replaces the running executable with <paramref name="newFile"/> and restarts. Returns error or null.</summary>
    string? Install(string newFile);
    /// <summary>True if the previous version is kept and can be restored.</summary>
    bool CanRollback => false;
    string? Rollback() => "Nur im Windows-Begleiter möglich.";
}
