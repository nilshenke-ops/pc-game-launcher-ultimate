namespace Pgl.Core.Platform;

public sealed record MonitorInfo(string Id, string Name, int X, int Y, int Width, int Height, bool Primary);

/// <summary>A visible program window. State: normal, maximized, minimized.</summary>
public sealed record WindowInfo(long Handle, string Process, string Title, int X, int Y, int Width, int Height, string State, string MonitorId);

/// <summary>Reads and places program windows (Windows companion only).</summary>
public interface IWindowManager
{
    bool Supported { get; }
    List<MonitorInfo> Monitors();
    List<WindowInfo> Windows();
    /// <summary>Moves a window (absolute screen coordinates) and sets its state. Returns an error text or null.</summary>
    string? Place(long handle, int x, int y, int width, int height, string state);
}

public sealed class NullWindowManager : IWindowManager
{
    public static readonly NullWindowManager Instance = new();
    public bool Supported => false;
    public List<MonitorInfo> Monitors() => new();
    public List<WindowInfo> Windows() => new();
    public string? Place(long handle, int x, int y, int width, int height, string state) => "Fenster verschieben geht nur im Windows-Begleiter.";
}

public sealed record ControllerInfo(int Index, bool Connected, string Kind, string Battery);

/// <summary>Live state of a controller: buttons and sticks/triggers from -1..1 (triggers 0..1).</summary>
public sealed record ControllerState(int Index, Dictionary<string, bool> Buttons, double LeftX, double LeftY, double RightX, double RightY, double LeftTrigger, double RightTrigger, uint Packet);

/// <summary>Game controllers through XInput (Xbox and compatible). Windows companion only.</summary>
public interface IControllers
{
    bool Supported { get; }
    List<ControllerInfo> List();
    ControllerState? State(int index);
    /// <summary>Short vibration (both motors) for the test; returns an error text or null.</summary>
    string? Rumble(int index, int milliseconds, double strength);
}

public sealed class NullControllers : IControllers
{
    public static readonly NullControllers Instance = new();
    public bool Supported => false;
    public List<ControllerInfo> List() => new();
    public ControllerState? State(int index) => null;
    public string? Rumble(int index, int milliseconds, double strength) => "Controller gibt es nur im Windows-Begleiter.";
}
