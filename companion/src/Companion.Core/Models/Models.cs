namespace Pgl.Core.Models;

// ---------------------------------------------------------------- Library (games + programs share one model)

public enum ItemKind { Game, Program }

/// <summary>How an item is started. Each source has its own strictly validated target format.</summary>
public enum LaunchSource
{
    /// <summary>Absolute path to an allow-listed executable or shortcut (.exe/.lnk). Only added on the PC itself.</summary>
    Exe,
    /// <summary>Steam app id, started through steam://rungameid/.</summary>
    Steam,
    /// <summary>Epic Games "namespace:catalogItemId:appName", started through the Epic launcher URI.</summary>
    Epic,
    /// <summary>Start-menu / Microsoft Store / Xbox app user model id, started through shell:AppsFolder.</summary>
    AppsFolder,
}

public sealed class LibraryItem
{
    public string Id { get; set; } = "";
    public ItemKind Kind { get; set; }
    public string Name { get; set; } = "";
    public LaunchSource Source { get; set; }
    public string Target { get; set; } = "";
    public string Args { get; set; } = "";
    public string? WorkingDir { get; set; }
    /// <summary>Process names (without .exe) used to detect that the item is running.</summary>
    public List<string> ProcessNames { get; set; } = new();
    /// <summary>Install directory; processes running from below it count as this item.</summary>
    public string? InstallDir { get; set; }
    public List<string> Categories { get; set; } = new();
    public bool Favorite { get; set; }
    public string? IconData { get; set; }
    public string? CoverUrl { get; set; }
    public string? ProfileId { get; set; }
    public string? Notes { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public sealed class LibraryFile
{
    public int Version { get; set; } = 1;
    public List<LibraryItem> Items { get; set; } = new();
}

/// <summary>Result of a platform scan. Not persisted until the user adds it.</summary>
public sealed record DetectedItem(string Key, ItemKind Kind, string Name, LaunchSource Source, string Target, string? InstallDir, List<string> ProcessNames, string? CoverUrl, string Origin, bool AlreadyAdded);

public sealed record LaunchResult(bool Ok, string Message, string? Code = null);

// ---------------------------------------------------------------- Quick actions, profiles, automations

public enum StepType { LaunchItem, ActivateProfile, RevertProfile, PlaySound, StopAllSounds, SetCollection, SetAudioOutput, RunDiagnostics, Notify }

public sealed class ActionStep
{
    public StepType Type { get; set; }
    /// <summary>Id of item / profile / sound / collection, or device id, or text for Notify.</summary>
    public string? Ref { get; set; }
}

public sealed class QuickAction
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "zap";
    public string? Category { get; set; }
    public bool Favorite { get; set; }
    public bool ShowOnDashboard { get; set; } = true;
    public bool RequireConfirm { get; set; }
    public List<ActionStep> Steps { get; set; } = new();
}

public sealed class QuickActionsFile
{
    public List<QuickAction> Actions { get; set; } = new();
}

public sealed class Profile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "gamepad-2";
    public string Color { get; set; } = "#22d3ee";
    public List<string> GameIds { get; set; } = new();
    /// <summary>Allow-listed programs started when the profile is activated.</summary>
    public List<string> LaunchProgramIds { get; set; } = new();
    public string? SoundCollectionId { get; set; }
    public string? AudioOutputDeviceId { get; set; }
    public int? SoundboardVolume { get; set; }
    public List<string> QuickActionIds { get; set; } = new();
    public List<string> HotkeyIds { get; set; } = new();
    public string? DashboardLayoutId { get; set; }
    /// <summary>Reduce notifications to warnings and errors while active.</summary>
    public bool QuietNotifications { get; set; }
}

public sealed class ProfilesFile
{
    public List<Profile> Profiles { get; set; } = new();
    public string? ActiveProfileId { get; set; }
    public string? ActiveReason { get; set; }
    public DateTime? ActiveSince { get; set; }
    public string? PreviousProfileId { get; set; }
    /// <summary>Automatically activate a game's profile while it runs and revert afterwards.</summary>
    public bool AutoSwitch { get; set; } = true;
}

public enum TriggerType { GameStarted, GameStopped, CompanionStarted, AudioDeviceMissing, RelayDisconnected, UpdateFailed, ProfileActivated }

public sealed class AutomationRule
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public TriggerType Trigger { get; set; }
    /// <summary>Optional filter (game id, profile id, device id). Null matches all.</summary>
    public string? TriggerRef { get; set; }
    public List<ActionStep> Actions { get; set; } = new();
    public DateTime? LastRunAt { get; set; }
    public string? LastResult { get; set; }
    public int RunCount { get; set; }
}

public sealed class AutomationsFile
{
    public List<AutomationRule> Rules { get; set; } = new();
}

// ---------------------------------------------------------------- Hotkeys

public sealed class Hotkey
{
    public string Id { get; set; } = "";
    /// <summary>Normalized combination such as "Ctrl+Alt+F9".</summary>
    public string Keys { get; set; } = "";
    public bool Enabled { get; set; } = true;
    public ActionStep Action { get; set; } = new();
    public string? QuickActionId { get; set; }
}

public sealed class HotkeysFile
{
    public List<Hotkey> Hotkeys { get; set; } = new();
}

public sealed record HotkeyStatus(string Id, string State, string? Message);

// ---------------------------------------------------------------- Soundboard

public sealed class Sound
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string FileName { get; set; } = "";
    public string Format { get; set; } = "";
    public long Size { get; set; }
    public string Sha256 { get; set; } = "";
    public List<string> Categories { get; set; } = new();
    public bool Favorite { get; set; }
    public int Volume { get; set; } = 100;
    public string? SourceUrl { get; set; }
    public string? Color { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public sealed class SoundCollection
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<string> SoundIds { get; set; } = new();
}

public sealed class SoundsFile
{
    public List<Sound> Sounds { get; set; } = new();
    public List<SoundCollection> Collections { get; set; } = new();
    public string? ActiveCollectionId { get; set; }
}

// ---------------------------------------------------------------- Audio

public sealed class AudioSettings
{
    public string? OutputDeviceId { get; set; }
    public int SoundboardVolume { get; set; } = 80;
    public bool MonitorEnabled { get; set; }
    public string? MonitorDeviceId { get; set; }
    public int MonitorVolume { get; set; } = 60;
    public bool MicPassthrough { get; set; }
    public string? MicDeviceId { get; set; }
    public int MicVolume { get; set; } = 100;
    /// <summary>"overlap" plays sounds simultaneously, "queue" one after another, "replace" stops the previous one.</summary>
    public string PlayMode { get; set; } = "overlap";
    public int MaxConcurrent { get; set; } = 8;
}

public sealed record AudioDevice(string Id, string Name, string Flow, bool IsDefault, bool IsVirtualCable);

// ---------------------------------------------------------------- Devices / security

public sealed class PairedDevice
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Platform { get; set; } = "";
    /// <summary>SHA-256(token), possibly protected with DPAPI on Windows. The token itself is never stored.</summary>
    public string KeyProtected { get; set; } = "";
    public List<string> Permissions { get; set; } = new();
    public DateTime PairedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAt { get; set; }
    public string? LastIp { get; set; }
}

public sealed class DevicesFile
{
    public List<PairedDevice> Devices { get; set; } = new();
    /// <summary>Per-device UI preferences (theme, layouts) as opaque JSON.</summary>
    public Dictionary<string, string> UiPrefs { get; set; } = new();
}

// ---------------------------------------------------------------- History

public sealed class GameSession
{
    public string ItemId { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public double Minutes => ((EndedAt ?? DateTime.UtcNow) - StartedAt).TotalMinutes;
}

public sealed class LaunchRecord
{
    public string ItemId { get; set; } = "";
    public string Name { get; set; } = "";
    public DateTime At { get; set; }
    public bool Ok { get; set; }
    public string? Error { get; set; }
    public string? By { get; set; }
}

public sealed class HistoryFile
{
    public List<GameSession> Sessions { get; set; } = new();
    public List<LaunchRecord> Launches { get; set; } = new();
}

// ---------------------------------------------------------------- Settings

public sealed class Settings
{
    public int Version { get; set; } = 1;
    public string PcName { get; set; } = Environment.MachineName;
    public string Language { get; set; } = "de";
    /// <summary>Listen on all interfaces so phones in the same Wi-Fi can connect. Off = only this PC.</summary>
    public bool LanAccess { get; set; } = true;
    public int Port { get; set; } = 8787;
    /// <summary>Public https URL of the web app (tunnel or hosting). Used for QR codes. Empty = LAN address.</summary>
    public string? PublicUrl { get; set; }
    /// <summary>Address of the hosted web app (static site that stays online while the PC is off). Its QR code links there.</summary>
    public string? WebAppUrl { get; set; } = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate";
    public bool RelayEnabled { get; set; }
    public string? RelayUrl { get; set; }
    public string? RelayCompanionId { get; set; }
    public string? RelaySecretProtected { get; set; }
    public bool HistoryEnabled { get; set; } = true;
    public bool StartMinimized { get; set; } = true;
    public bool KeepRunningInTray { get; set; } = true;
    public int ProcessScanSeconds { get; set; } = 5;
    public string? UpdateManifestUrl { get; set; }
    public bool NotifyInfo { get; set; } = true;
    public bool QuietWhileGaming { get; set; } = true;
    public List<string> MutedNotificationKeys { get; set; } = new();
    public bool SteamCoversFromCdn { get; set; } = true;
}

// ---------------------------------------------------------------- Notifications

public enum Severity { Info, Success, Warning, Error }

public sealed class Notification
{
    public string Id { get; set; } = "";
    public string Key { get; set; } = "";
    public Severity Severity { get; set; }
    public string Title { get; set; } = "";
    public string? Message { get; set; }
    public DateTime At { get; set; }
    public int Count { get; set; } = 1;
    public bool Dismissed { get; set; }
    public string? Link { get; set; }
}
