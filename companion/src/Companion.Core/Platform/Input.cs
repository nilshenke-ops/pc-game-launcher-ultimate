namespace Pgl.Core.Platform;

/// <summary>A connected keyboard or mouse as Windows reports it (name from the device itself, if it tells one).</summary>
public sealed record InputDevice(string Kind, string Name, string? Manufacturer, string? Vid, string? Pid);

/// <summary>One key or mouse button sent instead of the pressed one (Windows virtual-key codes; mouse buttons are 1, 2, 4, 5, 6).</summary>
public readonly record struct InputAction(int Code, bool Down);

/// <summary>
/// Low-level keyboard/mouse hook that lets <see cref="Services.RemapEngine"/> swap keys and mouse buttons system-wide
/// (Windows companion only). Only the hooks that are needed are installed – no mouse hook without a mouse mapping.
/// </summary>
public interface IInputHook
{
    bool Supported { get; }
    /// <summary>Installs (or replaces) the hooks. <paramref name="handle"/> gets every real key/button event and returns
    /// null to let it through, or the events to send instead (empty = swallow).</summary>
    void Start(Func<int, bool, string?, InputAction[]?> handle, bool keyboard, bool mouse);
    void Stop();
    /// <summary>Waits for the next key or mouse button (not the left one) pressed on the PC and returns its code.</summary>
    Task<int?> CaptureNextAsync(TimeSpan timeout, CancellationToken ct);
    List<InputDevice> Devices();
}

public sealed class NullInputHook : IInputHook
{
    public static readonly NullInputHook Instance = new();
    public bool Supported => false;
    public void Start(Func<int, bool, string?, InputAction[]?> handle, bool keyboard, bool mouse) { }
    public void Stop() { }
    public Task<int?> CaptureNextAsync(TimeSpan timeout, CancellationToken ct) => Task.FromResult<int?>(null);
    public List<InputDevice> Devices() => new();
}
