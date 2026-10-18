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
}

public sealed class PlayRequest
{
    public required string FilePath { get; init; }
    public required string PlaybackId { get; init; }
    public string? OutputDeviceId { get; init; }
    public float Volume { get; init; } = 1f;
    public string? MonitorDeviceId { get; init; }
    public float MonitorVolume { get; init; } = 1f;
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
}
