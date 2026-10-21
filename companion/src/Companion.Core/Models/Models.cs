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
    /// <summary>The PC already tried to read the program's own icon (or the user removed it) – not tried again.</summary>
    public bool IconChecked { get; set; }
    /// <summary>The icon was chosen by the user (e.g. icon workshop) – shown before the brand logo; false = icon of the program file.</summary>
    public bool IconCustom { get; set; }
    /// <summary>For Steam and Epic games: the PC already looked for the game's own icon in its install folder (from 2.13).</summary>
    public bool GameIconTried { get; set; }
    public string? CoverUrl { get; set; }
    public string? ProfileId { get; set; }
    public string? Notes { get; set; }
    /// <summary>Own rating 0 (none) … 5 stars.</summary>
    public int Rating { get; set; }
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
    /// <summary>Microsoft Store product id if the game is (or was) in the PC Game Pass catalog.</summary>
    public string? GamePassId { get; set; }
    /// <summary>Added automatically by the Game Pass sync – removed again automatically when uninstalled or no longer in Game Pass.</summary>
    public bool AutoAdded { get; set; }
    /// <summary>Which sync added it automatically ("epic", "ea"); only that sync removes it again.</summary>
    public string? AutoSource { get; set; }
    /// <summary>When the automatic cover search last looked for this game (null = not yet).</summary>
    public DateTime? CoverLookupAt { get; set; }
    /// <summary>Backlog status (<see cref="Backlog.Statuses"/>), null = not in the backlog. Only ever set by the user.</summary>
    public string? Backlog { get; set; }
    /// <summary>Priority in the backlog: 0 none, 1 low, 2 medium, 3 high.</summary>
    public int Priority { get; set; }
    public DateTime? BacklogChangedAt { get; set; }
    /// <summary>Own goal for this game in hours of play time (e.g. "main story ≈ 25 h"), null = none.</summary>
    public double? GoalHours { get; set; }
    /// <summary>Own estimate how long the game takes in hours (an estimate – shown as such), null = unknown.</summary>
    public double? EstimateHours { get; set; }
    /// <summary>Own estimate how long one session takes at least (minutes), null = unknown. Used by the time finder.</summary>
    public int? SessionMinutes { get; set; }
    /// <summary>Archived in the backlog: kept with its status, but out of the normal list (instead of deleting).</summary>
    public bool BacklogArchived { get; set; }
    /// <summary>Merged into another entry of the library (duplicate); the backlog data went there.</summary>
    public string? DuplicateOf { get; set; }
}

public static class Backlog
{
    /// <summary>Noch spielen, Als Nächstes, Gerade aktiv, Pausiert, Durchgespielt, Nicht mehr interessant.</summary>
    public static readonly string[] Statuses = { "backlog", "next", "playing", "paused", "completed", "dropped" };
}

public sealed class LibraryFile
{
    public int Version { get; set; } = 1;
    public List<LibraryItem> Items { get; set; } = new();
    /// <summary>Automatically added games the user removed ("Source:Target"); the Steam/Epic/EA/Game Pass sync does not add them again.
    /// Cleared when the game is uninstalled or added again by hand.</summary>
    public List<string> Hidden { get; set; } = new();
}

/// <summary>Result of a platform scan. Not persisted until the user adds it.</summary>
public sealed record DetectedItem(string Key, ItemKind Kind, string Name, LaunchSource Source, string Target, string? InstallDir, List<string> ProcessNames, string? CoverUrl, string Origin, bool AlreadyAdded);

public sealed record LaunchResult(bool Ok, string Message, string? Code = null);

// ---------------------------------------------------------------- Quick actions, profiles, automations

public enum StepType { LaunchItem, ActivateProfile, RevertProfile, PlaySound, StopAllSounds, SetCollection, SetAudioOutput, RunDiagnostics, Notify, ToggleOverlay, ObsRecordToggle, ObsReplaySave, ObsReplayBufferToggle, Wait, IfRunning, IfNotRunning, MediaKey, ApplyLayout, RgbColor, RgbProfile }

public sealed class ActionStep
{
    public StepType Type { get; set; }
    /// <summary>Id of item / profile / sound / collection, or device id, or text for Notify, or "full"/"mini" for ToggleOverlay,
    /// seconds for Wait, game/program id for IfRunning / IfNotRunning (the remaining steps only run if the condition holds).</summary>
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
    /// <summary>Own look while this profile is active (e.g. switched on by a game start); null = keep the normal design.</summary>
    public ProfileTheme? Theme { get; set; }
}

/// <summary>Colours (and optionally a built-in background) shown on every device while the profile is active.</summary>
public sealed class ProfileTheme
{
    public string Mode { get; set; } = "dark";
    public string Primary { get; set; } = "#22d3ee";
    public string Accent { get; set; } = "#a78bfa";
    public string Background { get; set; } = "#070b14";
    /// <summary>Id of a built-in background (web/public/backgrounds), null = keep the device's background.</summary>
    public string? BgScene { get; set; }
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
    /// <summary>The user's own audio values from before a profile overrode them; restored by profiles that leave a value open.</summary>
    public ProfileBaseline Baseline { get; set; } = new();
}

public sealed class ProfileBaseline
{
    public bool HasOutput { get; set; }
    public string? OutputDeviceId { get; set; }
    public int? SoundboardVolume { get; set; }
    public bool HasCollection { get; set; }
    public string? SoundCollectionId { get; set; }
}

/// <summary>What a profile activation changes: set = profile value, or the saved baseline when switching away from an override.</summary>
public sealed record ProfileAudioPlan(bool SetOutput, string? OutputDeviceId, int? SoundboardVolume, bool SetCollection, string? SoundCollectionId);

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
    /// <summary>Last runs, newest first (at most 10).</summary>
    public List<RuleRun> Runs { get; set; } = new();
}

public sealed class RuleRun
{
    public DateTime At { get; set; }
    public string By { get; set; } = "";
    public bool Ok { get; set; }
    public List<string> Results { get; set; } = new();
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
    /// <summary>Repeat until stopped (stop button or "stop all sounds").</summary>
    public bool Loop { get; set; }
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
    /// <summary>Personal note (max. 1000 characters).</summary>
    public string? Note { get; set; }
    /// <summary>Load measured on the PC while this game ran (every 10 s). No FPS: Windows offers no source without overlays/drivers.</summary>
    public SessionPerf? Perf { get; set; }
    /// <summary>Seconds from the start command to the game process being seen (null = not started from the app).</summary>
    public double? StartSeconds { get; set; }
    /// <summary>How often the PC looked for the process while waiting, in seconds – the measurement is that exact.</summary>
    public int? StartAccuracy { get; set; }
}

public sealed class SessionPerf
{
    public int Samples { get; set; }
    public double? CpuAvg { get; set; }
    public double? CpuMax { get; set; }
    public double? RamAvg { get; set; }
    public double? GpuAvg { get; set; }
    public double? GpuMax { get; set; }
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

public sealed class PingTarget { public string Label { get; set; } = ""; public string Host { get; set; } = ""; }

public sealed class Settings
{
    public int Version { get; set; } = 1;
    /// <summary>Which values the PC monitor measures (off = not queried).</summary>
    public Pgl.Core.Platform.MetricSwitches Metrics { get; set; } = new();
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
    /// <summary>Update manifest (version, download link, SHA-256). Default: the project's GitHub Pages site. Empty = no checks.</summary>
    public string? UpdateManifestUrl { get; set; } = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/update.json";
    /// <summary>Record CPU/RAM/GPU load during game sessions (one sample every 10 s, only while a game runs).</summary>
    public bool RecordSessionPerf { get; set; } = true;
    /// <summary>Plugin store: signed catalog of official/reviewed plugins. "" = no catalog (local plugin files still work).</summary>
    public string? PluginCatalogUrl { get; set; } = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/plugins/catalog.json";
    public bool NotifyInfo { get; set; } = true;
    public bool QuietWhileGaming { get; set; } = true;
    public List<string> MutedNotificationKeys { get; set; } = new();
    public bool SteamCoversFromCdn { get; set; } = true;
    /// <summary>Keep the "Game Pass" category in sync with the PC Game Pass catalog (reads Microsoft's public catalog).</summary>
    public bool GamePassEnabled { get; set; }
    /// <summary>Store market for the Game Pass catalog (two letters, e.g. DE).</summary>
    public string GamePassMarket { get; set; } = "DE";
    /// <summary>Look up real cover art (Steam / Microsoft Store) for games without one.</summary>
    public bool CoverSearch { get; set; } = true;
    /// <summary>Steam link: installed Steam games are kept in the library automatically.</summary>
    public bool SteamEnabled { get; set; }
    /// <summary>Optional Steam Web API key (protected like the relay secret) for the whole Steam library.</summary>
    public string? SteamApiKeyProtected { get; set; }
    /// <summary>Epic link: installed games kept in the library, owned games from the launcher's cache shown.</summary>
    public bool EpicEnabled { get; set; }
    /// <summary>EA link: installed EA app games kept in the library.</summary>
    public bool EaEnabled { get; set; }
    /// <summary>Xbox link: installed Xbox app / PC Game Pass games (XboxGames folders) kept in the library.</summary>
    public bool XboxEnabled { get; set; }
    /// <summary>Set once all launcher links were switched on automatically (installed games appear without any setup; each can be switched off later).</summary>
    public bool AutoLinkDone { get; set; }
    /// <summary>OBS Studio WebSocket server (obs-websocket 5) used for recording and replays.</summary>
    public string? ObsUrl { get; set; } = "ws://127.0.0.1:4455";
    /// <summary>Password of the OBS WebSocket server (protected like the relay secret, never sent to devices).</summary>
    public string? ObsPasswordProtected { get; set; }
    /// <summary>Keep the OBS replay buffer running while a game from the library runs.</summary>
    public bool ObsReplayWhilePlaying { get; set; }
    /// <summary>Own ping targets for the network diagnosis (e.g. a game server), at most 3.</summary>
    public List<PingTarget> PingTargets { get; set; } = new();
    /// <summary>Screen corner of the small in-game overlay (Windows companion).</summary>
    public string OverlayCorner { get; set; } = "top-right";
    /// <summary>Program used for recording and replays: obs, nvidia, xbox, steam or discord (see CaptureProviders).</summary>
    public string CaptureProvider { get; set; } = "obs";
    /// <summary>Large overlay: "own" (launcher overlay) or the overlay of nvidia, xbox, steam or discord.</summary>
    public string OverlayProvider { get; set; } = "own";
    /// <summary>Shortcut per "provider.action" as set up in that program; missing = factory default, "" = none.</summary>
    public Dictionary<string, string> CaptureKeys { get; set; } = new();
    /// <summary>Own program per function ("record", "replay", "buffer"), e.g. replays as Discord clips while OBS records. Missing = CaptureProvider.</summary>
    public Dictionary<string, string> CaptureActionProviders { get; set; } = new();
    /// <summary>Widgets of the large overlay with their place on the screen. Null = default arrangement (chosen by the web app).</summary>
    public OverlayLayout? OverlayLayout { get; set; }
    /// <summary>Saved HUD arrangements of the large overlay (at most 10) – one of them can be put on the overlay with one tap.</summary>
    public List<OverlayPreset> OverlayPresets { get; set; } = new();
}

public sealed class OverlayPreset
{
    /// <summary>Made on the device ("hud_…"), so a change queued without the PC is applied only once.</summary>
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public OverlayLayout Layout { get; set; } = new();
}

public sealed class OverlayLayout
{
    /// <summary>Opacity of the widget windows (0.4 – 1).</summary>
    public double Opacity { get; set; } = 0.85;
    public List<OverlayWidgetPlace> Widgets { get; set; } = new();
}

public sealed class OverlayWidgetPlace
{
    /// <summary>Built-in widget (e.g. "system", "quick") or "plugin:&lt;plugin id&gt;:&lt;widget id&gt;".</summary>
    public string Id { get; set; } = "";
    public bool Visible { get; set; } = true;
    /// <summary>Position as share of the screen (0 – 1), so it fits every resolution.</summary>
    public double X { get; set; }
    public double Y { get; set; }
    /// <summary>Size in pixels; H = 0 means "as high as the content".</summary>
    public int W { get; set; } = 340;
    public int H { get; set; }
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
    /// <summary>Seen by the user (opened the list or marked as read).</summary>
    public bool Read { get; set; }
    /// <summary>update, launch, automation, plugin, quest, deal, recording, assistant, system</summary>
    public string Category { get; set; } = "system";
}

public sealed class NotificationsFile
{
    public List<Notification> Items { get; set; } = new();
}
