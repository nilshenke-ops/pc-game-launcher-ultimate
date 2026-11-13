namespace Pgl.Core.Platform;

/// <summary>
/// Quick controls of the PC for the island: master volume, mute, screen brightness (laptop panel), battery and the Windows power plan.
/// Every value is null when this PC cannot tell or set it – the page then leaves the control out instead of showing a made-up number.
/// </summary>
public sealed record SystemControlState(int? Volume, bool? Muted, int? Brightness, int? BatteryPercent, bool? Charging, string? PowerMode);

/// <summary>The microphone of the PC and whether a program is using the microphone or the camera right now (null = this PC cannot tell).</summary>
public sealed record SensorState(bool? MicMuted, bool? MicInUse, string? MicApp, bool? CameraInUse, string? CameraApp);

public interface ISystemControls
{
    SensorState Sensors() => new(null, null, null, null, null);
    /// <summary>Mutes or unmutes the default microphone. Returns an error text, or null when applied.</summary>
    string? SetMicMuted(bool muted) => "Das Mikrofon lässt sich nur im Windows-Begleiter stummschalten.";
    bool Supported { get; }
    SystemControlState Read();
    /// <summary>Sets what is given (the rest stays). Returns an error text, or null when everything was applied. powerMode: saver, balanced, performance.</summary>
    string? Set(int? volume, bool? muted, int? brightness, string? powerMode);
}

public sealed class NullSystemControls : ISystemControls
{
    public static readonly NullSystemControls Instance = new();
    public bool Supported => false;
    public SystemControlState Read() => new(null, null, null, null, null, null);
    public string? Set(int? volume, bool? muted, int? brightness, string? powerMode) => "Die Regler sind nur im Windows-Begleiter verfügbar.";
}

/// <summary>Controls that only live in memory – for trying out the page and for the automatic tests (headless companion with PGL_TEST_CONTROLS=1). Nothing on the machine changes.</summary>
public sealed class MemorySystemControls : ISystemControls
{
    readonly object _lock = new();
    int _volume = 42, _brightness = 100; bool _muted; string _mode = "balanced";
    bool _micMuted;
    public bool Supported => true;
    public SystemControlState Read() { lock (_lock) return new(_volume, _muted, _brightness, 87, true, _mode); }
    public SensorState Sensors() { lock (_lock) return new(_micMuted, !_micMuted, _micMuted ? null : "Testprogramm", false, null); }
    public string? SetMicMuted(bool muted) { lock (_lock) _micMuted = muted; return null; }
    public string? Set(int? volume, bool? muted, int? brightness, string? powerMode)
    {
        lock (_lock)
        {
            if (volume is { } v) _volume = Math.Clamp(v, 0, 100);
            if (muted is { } m) _muted = m;
            if (brightness is { } b) _brightness = Math.Clamp(b, 0, 100);
            if (powerMode is "saver" or "balanced" or "performance") _mode = powerMode;
            return null;
        }
    }
}
