// Data types sent by the companion (mirrors companion/src/Companion.Core/Models).

export type ItemKind = "game" | "program";
export type LaunchSource = "exe" | "steam" | "epic" | "appsFolder";

export interface LibraryItem {
  id: string;
  kind: ItemKind;
  name: string;
  source: LaunchSource;
  target: string;
  args: string;
  workingDir?: string;
  processNames: string[];
  installDir?: string;
  categories: string[];
  favorite: boolean;
  iconData?: string;
  /** Icon chosen by the user (icon workshop) – shown before the brand logo. */
  iconCustom?: boolean;
  coverUrl?: string;
  profileId?: string;
  notes?: string;
  rating?: number;
  addedAt: string;
  gamePassId?: string;
  autoAdded?: boolean;
  /** Backlog status (see lib/backlog.ts), absent = not in the backlog. */
  backlog?: string | null;
  priority?: number;
  backlogChangedAt?: string | null;
  /** Own estimate of the total play time in hours (an estimate). */
  estimateHours?: number | null;
  /** Own estimate how long one session takes at least (minutes). */
  sessionMinutes?: number | null;
  /** Archived in the backlog (kept, hidden from the normal list). */
  backlogArchived?: boolean;
  /** Merged into this other library entry (duplicate). */
  duplicateOf?: string | null;
  goalHours?: number | null;
}

export interface DetectedItem {
  key: string;
  kind: ItemKind;
  name: string;
  source: LaunchSource;
  target: string;
  installDir?: string;
  processNames: string[];
  coverUrl?: string;
  origin: string;
  alreadyAdded: boolean;
}

export type StepType = "launchItem" | "activateProfile" | "revertProfile" | "playSound" | "stopAllSounds" | "setCollection" | "setAudioOutput" | "runDiagnostics" | "notify"
  | "toggleOverlay" | "obsRecordToggle" | "obsReplaySave" | "obsReplayBufferToggle" | "wait" | "ifRunning" | "ifNotRunning" | "mediaKey" | "applyLayout" | "rgbColor" | "rgbProfile"
  | "closeItem" | "closeOtherGames" | "closeAllGames" | "runQuickAction" | "ifTime" | "ifWeekday" | "ifGameRunning" | "ifNoGameRunning";
export interface ActionStep { type: StepType; ref?: string | null }

export interface QuickAction {
  id: string;
  name: string;
  icon: string;
  category?: string | null;
  favorite: boolean;
  showOnDashboard: boolean;
  requireConfirm: boolean;
  steps: ActionStep[];
}

export interface Profile {
  id: string;
  name: string;
  icon: string;
  color: string;
  gameIds: string[];
  launchProgramIds: string[];
  soundCollectionId?: string | null;
  audioOutputDeviceId?: string | null;
  soundboardVolume?: number | null;
  quickActionIds: string[];
  hotkeyIds: string[];
  dashboardLayoutId?: string | null;
  /** Own look while this profile is active (all devices); absent = normal design. */
  theme?: ProfileTheme | null;
  quietNotifications: boolean;
}

export interface ProfilesFile {
  profiles: Profile[];
  activeProfileId?: string;
  activeReason?: string;
  activeSince?: string;
  previousProfileId?: string;
  autoSwitch: boolean;
}

export type TriggerType = "gameStarted" | "gameStopped" | "companionStarted" | "audioDeviceMissing" | "relayDisconnected" | "updateFailed" | "profileActivated" | "programStarted" | "programStopped" | "schedule";
export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: TriggerType;
  triggerRef?: string | null;
  actions: ActionStep[];
  lastRunAt?: string;
  lastResult?: string;
  runCount: number;
  runs?: { at: string; by: string; ok: boolean; results: string[] }[];
}

export interface Hotkey { id: string; keys: string; enabled: boolean; action: ActionStep; quickActionId?: string | null }
export interface HotkeyStatus { id: string; state: "active" | "error" | "disabled" | "pending"; message?: string }

export interface Sound {
  id: string;
  name: string;
  fileName: string;
  format: string;
  size: number;
  sha256: string;
  categories: string[];
  favorite: boolean;
  volume: number;
  sourceUrl?: string;
  color?: string;
  /** Emoji on the tile. */
  icon?: string | null;
  loop?: boolean;
  addedAt: string;
}
export interface SoundCollection { id: string; name: string; soundIds: string[] }
export interface SoundsFile { sounds: Sound[]; collections: SoundCollection[]; activeCollectionId?: string }
export interface PlayingSound { playbackId: string; soundId: string; name: string; startedAt: string; durationMs?: number; paused: boolean }
export interface PlayingState { playing: PlayingSound[]; queued: number }

export interface AudioDevice { id: string; name: string; flow: "render" | "capture"; isDefault: boolean; isVirtualCable: boolean }
export interface AudioSettings {
  outputDeviceId?: string | null;
  soundboardVolume: number;
  monitorEnabled: boolean;
  monitorDeviceId?: string | null;
  monitorVolume: number;
  micPassthrough: boolean;
  micDeviceId?: string | null;
  micVolume: number;
  playMode: "overlap" | "queue" | "replace";
  maxConcurrent: number;
}

export interface CheckResult { id?: string; area?: string; label: string; status: "ok" | "warn" | "error" | "info" | "untested" | "unsupported"; detail: string; ms?: number; fix?: string | null }

export interface Notification { id: string; key: string; severity: "info" | "success" | "warning" | "error"; title: string; message?: string; at: string; count: number; link?: string; read?: boolean; dismissed?: boolean; category: string }

export interface GpuSample { name: string; utilPercent?: number; tempC?: number; memUsedBytes?: number; memTotalBytes?: number; source: string }
export interface MetricsSample {
  at: string;
  cpuPercent?: number;
  cpuName?: string;
  cpuCores?: number;
  cpuTempC?: number;
  cpuTempSource: string;
  memTotalBytes?: number;
  memUsedBytes?: number;
  gpus: GpuSample[];
  disks: { name: string; label: string; totalBytes: number; freeBytes: number }[];
  uptimeHours?: number;
  fpsStatus?: string;
  sources: Record<string, string>;
  /** Values switched off in the settings – not measured. */
  off?: ("cpu" | "ram" | "gpu" | "disks")[];
}

export interface MetricSwitches { cpu: boolean; ram: boolean; gpu: boolean; disks: boolean }

export interface Settings {
  pcName: string;
  metrics?: MetricSwitches;
  language: "de" | "en";
  lanAccess: boolean;
  port: number;
  publicUrl?: string;
  webAppUrl?: string;
  relayEnabled: boolean;
  relayUrl?: string;
  relayCompanionId?: string;
  historyEnabled: boolean;
  recordSessionPerf?: boolean;
  startMinimized: boolean;
  keepRunningInTray: boolean;
  processScanSeconds: number;
  updateManifestUrl?: string;
  pluginCatalogUrl?: string | null;
  notifyInfo: boolean;
  quietWhileGaming: boolean;
  mutedNotificationKeys: string[];
  steamCoversFromCdn: boolean;
  gamePassEnabled?: boolean;
  /** Installed apps (start menu, Microsoft Store) appear under "Programme" without adding them. */
  appsEnabled?: boolean;
  gamePassMarket?: string;
  coverSearch?: boolean;
  obsUrl?: string | null;
  obsReplayWhilePlaying?: boolean;
  overlayCorner?: OverlayCorner;
}

export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface ObsStatus {
  url?: string | null; passwordSet: boolean; replayWhilePlaying: boolean; connected: boolean; version?: string | null;
  recording?: boolean | null; recordTimecode?: string | null; replayBuffer?: boolean | null; error?: string | null;
}
export interface OverlayStatus { supported: boolean; visible?: "full" | "mini" | null; reason?: string | null }

export interface Features { audio: boolean; hotkeys: boolean; autostart: boolean; pickFile: boolean; installUpdates: boolean; overlay?: boolean }

export interface AppState {
  pcName: string;
  version: string;
  platform: string;
  startedAt: string;
  features: Features;
  activeProfile?: { id: string; name: string; color: string; icon: string; reason?: string; since?: string; dashboardLayoutId?: string; quickActionIds?: string[]; theme?: ProfileTheme | null };
  autoSwitch: boolean;
  running: { itemId: string; name: string; since: string }[];
  playing: PlayingState;
  relay: { state: string; url?: string; lastError?: string; connectedAt?: string; clients: number };
  lanUrls: string[];
  lanAccess: boolean;
  publicUrl?: string;
  audio: { supported: boolean; output: string; mic: string; volume: number; missing: string[] };
  counts: { games: number; programs: number; sounds: number; devices: number; notifications: number };
  me: { isLocal: boolean; name: string; permissions: string[]; transport: string };
  updates: UpdateStatus;
}

export interface UpdateStatus {
  current: string;
  source?: string;
  state: string;
  error?: string;
  checkedAt?: string;
  official?: boolean;
  available?: { version: string; date?: string; url: string; sha256: string; size?: number; notes?: string; changes?: import("./release").ReleaseChanges; signed: boolean; source?: string };
  downloaded: boolean;
  canInstall: boolean;
  canRollback?: boolean;
  guard?: { stable: boolean; lastStable?: string | null; failures: number } | null;
}

export interface PairedDevice {
  id: string;
  name: string;
  platform: string;
  permissions: string[];
  pairedAt: string;
  lastSeenAt?: string;
  lastIp?: string;
  online: boolean;
  transport?: string;
}

export interface ProfileTheme { mode: "dark" | "light"; primary: string; accent: string; background: string; bgScene?: string | null }
