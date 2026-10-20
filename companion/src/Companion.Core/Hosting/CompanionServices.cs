using Pgl.Core.Api;
using Pgl.Core.Hosting;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>Composition root: creates all services, wires their events and starts the servers.</summary>
public sealed class CompanionServices : IAsyncDisposable
{
    public AppPaths Paths { get; }
    public IPlatform Platform { get; }
    public DateTime StartedAt { get; } = DateTime.UtcNow;
    public RpcServer Rpc { get; }
    public DeviceStore Devices { get; }
    public PairingService Pairing { get; }
    public SettingsService Settings { get; }
    public NotificationCenter Notifications { get; }
    public LibraryService Library { get; }
    public HistoryService History { get; }
    public SessionTracker Sessions { get; }
    public ProfileService Profiles { get; }
    public ActionRunner Runner { get; } = new();
    public RunTracker Runs { get; }
    public CompatService Compat { get; }
    public WebPushService Push { get; }
    public ModService Mods { get; }
    public WindowLayoutService Layouts { get; }
    public RgbService Rgb { get; }
    public QuickActionService QuickActions { get; }
    public AutomationEngine Automations { get; }
    public HotkeyService Hotkeys { get; }
    public AudioService Audio { get; }
    public SoundboardService Soundboard { get; }
    public MonitorService Monitor { get; }
    public LanAddressWatch LanAddress { get; }
    /// <summary>PC values with the user's switches applied (switched-off values are not measured).</summary>
    public IMetricsSource Metrics { get; }
    public NetworkDiagnostics Network { get; }
    public UpdateService Updates { get; }
    public PluginService Plugins { get; }
    public PerformanceRecorder Perf { get; }
    public NetworkMonitor NetMonitor { get; }
    public StorageService Storage { get; }
    public TransferService Transfer { get; }
    public CaptureLibraryService Captures { get; }
    public GamePassService GamePass { get; }
    public CoverService Covers { get; }
    public SteamService Steam { get; }
    public LauncherService Launchers { get; }
    public ObsService Obs { get; }
    public CaptureService Capture { get; }
    public CustomWidgetService Widgets { get; }
    public DeckService Decks { get; }
    public CalendarService Calendar { get; }
    public ActivityService Activity { get; }
    public BackupService Backup { get; }
    public QuestService Quests { get; }
    public DealService Deals { get; }
    public GameModePrograms GameModePrograms { get; }
    public Assistant.AssistantService Assistant { get; }
    public RelayClient Relay { get; }
    public WebHost Web { get; }

    public CompanionServices(IPlatform platform, AppPaths paths, WebAssets? assets = null)
    {
        Paths = paths;
        Platform = platform;
        Log.Init(paths.LogsDir);
        Log.CleanupOldFiles();

        Devices = new DeviceStore(paths, platform.Secrets);
        Rpc = new RpcServer(Devices);
        Pairing = new PairingService(Devices);
        Settings = new SettingsService(paths, Rpc);
        Notifications = new NotificationCenter(Rpc, Settings, paths);
        Library = new LibraryService(paths, platform, Rpc);
        History = new HistoryService(paths, Settings, Rpc);
        Sessions = new SessionTracker(Library, platform.Processes, Settings);
        Profiles = new ProfileService(paths, Rpc);
        QuickActions = new QuickActionService(paths, Rpc);
        Automations = new AutomationEngine(paths, Rpc, Runner);
        Hotkeys = new HotkeyService(paths, platform.Hotkeys, Rpc);
        Audio = new AudioService(paths, platform.Audio, Rpc);
        Soundboard = new SoundboardService(paths, Audio, Rpc);
        Metrics = new SwitchedMetrics(platform.Metrics, () => Settings.Get().Metrics ?? new());
        Metrics.Apply(Settings.Get().Metrics ?? new());
        Monitor = new MonitorService(Metrics, Rpc);
        Relay = new RelayClient(Rpc);
        Web = new WebHost(this, assets);
        Network = new NetworkDiagnostics(Relay.Status, Settings.Get, Web.LanUrls);
        Updates = new UpdateService(paths, Settings.Get, platform.UpdateInstaller, Rpc);
        Updates.Failed += message => { _ = Automations.Fire(TriggerType.UpdateFailed, null); };
        if (new UpdateGuard(paths).TakeRollbackNote(UpdateService.CurrentVersion) is { } rb)
            Notifications.Push("update-rolled-back", Severity.Warning, $"Update {rb.from} automatisch zurückgesetzt",
                $"Version {rb.from} ist zweimal kurz nach dem Start abgestürzt. Der Begleiter läuft wieder mit Version {UpdateService.CurrentVersion}. Fehlerdetails: Diagnose → Protokoll.", "/updates");
        LanAddress = new LanAddressWatch(paths, () => Settings.Get().LanAccess ? NetworkDiagnostics.LocalIPv4() : Array.Empty<string>(), () => Devices.List().Count > 0);
        LanAddress.Changed = (old, now) => Notifications.Push("lan-address-changed", Severity.Warning, "WLAN-Adresse des PCs hat sich geändert",
            $"Neu: {string.Join(", ", now.Select(a => $"{a}:{Settings.Get().Port}"))} (vorher {string.Join(", ", old)}). Handys, die die alte Adresse gespeichert haben, finden den PC nicht mehr. " +
            "Einmal den QR-Code unter „Gerät koppeln“ neu scannen. Damit das nicht wieder passiert: im Router dem PC immer dieselbe IP-Adresse geben (z. B. FRITZ!Box: Heimnetz → Netzwerk → Gerät bearbeiten → „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“).", "/pair");
        Updates.Available += m => Notifications.Push("update-available", Severity.Info, $"Update {m.Version} verfügbar", "Updates & Versionen: Änderungen ansehen, herunterladen und installieren. Es wird nie automatisch installiert.", "/updates");
        Plugins = new PluginService(paths, Rpc, Settings.Get);
        Perf = new PerformanceRecorder(Metrics, () => Settings.Get().RecordSessionPerf && Settings.Get().HistoryEnabled);
        NetMonitor = new NetworkMonitor(Rpc, () => Settings.Get().PingTargets);
        Storage = new StorageService(paths, Library, platform, Rpc);
        Transfer = new TransferService(paths, platform, Rpc, Notifications);
        Captures = new CaptureLibraryService(paths, Library, platform, Rpc);
        Runs = new RunTracker(Runner, Rpc, StepLabel);
        Compat = new CompatService(paths, Metrics, Library);
        Push = new WebPushService(paths, platform.Secrets, id => Devices.Get(id) != null);
        Mods = new ModService(paths, Library, Transfer, id => Sessions.Running().Any(r => r.itemId == id), Rpc);
        Layouts = new WindowLayoutService(paths, platform.WindowManager, Rpc);
        Rgb = new RgbService(paths);
        Notifications.Created += Push.OnNotification;
        Updates.CreateRestorePoint = name =>
        {
            try { return Path.GetFileName(Backup.CreateZip(includeSounds: false, Path.Combine(paths.BackupsDir, $"{name}-{DateTime.Now:yyyyMMdd-HHmmss}.zip"))); }
            catch (Exception ex) { Log.Warn("updates", "Wiederherstellungspunkt nicht erstellt: " + ex.Message); return null; }
        };
        Backup = new BackupService(paths, this);
        GamePass = new GamePassService(paths, Library, platform, Settings.Get, Rpc);
        Covers = new CoverService(Library, Settings.Get);
        Steam = new SteamService(paths, Library, platform, Settings, Rpc);
        Obs = new ObsService(Settings.Get, platform.Secrets, Rpc);
        Widgets = new CustomWidgetService(paths, Rpc);
        Decks = new DeckService(paths, Rpc);
        Calendar = new CalendarService(paths, Rpc, Notifications);
        Activity = new ActivityService(paths, Rpc, () => Sessions.Running().Select(r => (r.itemId, Library.Get(r.itemId)?.Name ?? "?", r.since)).ToList());
        Capture = new CaptureService(Settings.Get, Settings, Obs, platform) { OwnHotkeys = () => Hotkeys.List().Where(h => h.Enabled).Select(h => h.Keys) };
        Launchers = new LauncherService(Library, platform, Settings, Rpc) { CoverByName = name => Covers.FindByNameAsync(name) };
        Quests = new QuestService(paths, () => History.Export().Sessions, id => Library.Get(id)?.Name, Rpc);
        string[] defaultProfiles = { "prof_general", "prof_competitive", "prof_streaming", "prof_quiet" };
        Quests.Launcher = () => new LauncherCounts(
            Profiles.Get().Profiles.Count(p => !defaultProfiles.Contains(p.Id)), Devices.List().Count,
            Automations.List().Count(r => !(r.Trigger == TriggerType.AudioDeviceMissing && r.Name == "Warnung bei fehlendem Audiogerät")),
            QuickActions.List().Count, Library.List().Count(i => i.Backlog == "completed"), Soundboard.Get().Sounds.Count,
            Widgets.List().Count, Profiles.Get().Profiles.Count(p => p.Theme != null));
        Deals = new DealService(paths, Rpc) { SteamId = () => Steam.KnownSteamId() };
        // Games from the library are never closed by the game mode (process names and the started EXE).
        GameModePrograms = new GameModePrograms(paths, platform.Processes, platform.ProcessControl, Rpc, () => Library.List().Where(i => i.Kind == ItemKind.Game)
            .SelectMany(i => i.ProcessNames.Concat(i.Source == LaunchSource.Exe ? new[] { Path.GetFileNameWithoutExtension(i.Target) } : Array.Empty<string>())));
        Assistant = new Assistant.AssistantService(paths, platform.Secrets, Rpc, new Assistant.AssistantData(this));

        Wire();
        Rpc.HelloInfo = HelloInfo;
        RpcApi.Register(this);
    }

    public object Features() => new
    {
        audio = Platform.Audio.Supported,
        hotkeys = Platform.Hotkeys.Supported,
        autostart = Platform.Autostart.Supported,
        pickFile = Platform.Desktop.CanPickFiles,
        installUpdates = Platform.UpdateInstaller.Supported,
        overlay = Platform.Overlay.Supported,
        sendKeys = Platform.KeySender.Supported,
        desktopWidgets = Platform.DesktopWidgets.Supported,
    };

    object HelloInfo(RpcSession s) => new
    {
        app = "Nexus Gaming Hub",
        version = UpdateService.CurrentVersion,
        pcName = Settings.Get().PcName,
        platform = Platform.Name,
        features = Features(),
    };

    void Wire()
    {
        Runner.LaunchItem = (id, by) => Library.Launch(id, by);
        // A media key that is itself an active hotkey would trigger that hotkey again and again.
        if (Platform.KeySender.Supported)
            Runner.SendKey = async key => Hotkeys.List().Any(h => h.Enabled && h.Keys == key)
                ? $"{key} ist selbst als Hotkey belegt – das würde sich endlos selbst auslösen."
                : await Platform.KeySender.SendAsync(key);
        Runner.IsRunning = id => Sessions.Running().Any(r => r.itemId == id);
        Runner.ItemName = id => Library.Get(id)?.Name;
        Runner.ApplyLayout = id =>
        {
            var r = Layouts.Apply(id);
            var failed = r.Where(x => !x.Ok).ToList();
            return r.Count == 0 ? "Layout ist leer" : failed.Count == r.Count ? "Fehler: " + string.Join(", ", failed.Select(x => $"{x.Process} {x.Result}")) : $"{r.Count - failed.Count} Fenster an ihren Platz" + (failed.Count > 0 ? $" ({string.Join(", ", failed.Select(x => $"{x.Process} {x.Result}"))})" : "");
        };
        Runner.RgbColor = async c => $"RGB-Farbe {c} auf {await Rgb.SetColorAsync(c, null)} Gerät(en)";
        Runner.RgbProfile = async p => { await Rgb.LoadProfileAsync(p); return $"RGB-Profil „{p}“ geladen"; };
        Runner.ActivateProfile = (id, by) => Profiles.Activate(id, by);
        Runner.RevertProfile = by => Profiles.Revert(by);
        Runner.PlaySound = id => Soundboard.Play(id);
        Runner.StopAllSounds = Soundboard.StopAll;
        Runner.SetCollection = Soundboard.SetActiveCollection;
        Runner.SetAudioOutput = id => Audio.Update(a => a.OutputDeviceId = id);
        Runner.RunDiagnostics = async () => await Network.Run();
        Runner.Notify = text => Notifications.Push("automation:" + text, Severity.Info, text);
        // The step names say "obs" for historical reasons; they run with the program chosen under "Overlay & Aufnahme".
        Runner.ToggleOverlay = Capture.ToggleOverlay;
        Runner.ObsRecordToggle = () => Capture.Run("record");
        Runner.ObsReplaySave = () => Capture.Run("replay");
        Runner.ObsReplayBufferToggle = () => Capture.Run("buffer");
        Platform.Overlay.Changed += () => { Rpc.Changed("overlay"); UpdateGameMode(); };
        Widgets.Changed += () => Platform.DesktopWidgets.Sync(Widgets.DesktopWidgets());
        Platform.DesktopWidgets.Moved += Widgets.SetDesktopPosition;
        Platform.DesktopWidgets.Sync(Widgets.DesktopWidgets());
        Obs.RecordingChanged += (active, path) =>
        {
            Notifications.Push("obs-record", Severity.Success, active ? "Aufnahme läuft" : "Aufnahme gespeichert", active ? "OBS nimmt auf." : path, active ? "/overlay-settings" : "/captures");
            if (!active) Captures.RememberObsFile(path);
        };
        Obs.ReplaySaved += path => { Notifications.Push("obs-replay", Severity.Success, "Replay gespeichert", path, "/captures"); Captures.RememberObsFile(path); };
        Plugins.RunSteps = (steps, by) => Runner.RunAsync(steps, by);
        GameModePrograms.Report = (key, title, text) => Notifications.Push("gamemode:" + key, Severity.Info, title, text, "/profiles");
        Quests.Reached = (title, text) => Notifications.Push("quest:" + title, Severity.Success, title, text, "/quests");
        Deals.TargetReached = (title, text) => Notifications.Push("deal:" + title, Severity.Success, title, text, "/deals");
        Plugins.Notify = (title, text) => Notifications.Push("plugin:" + title, Severity.Warning, title, text, "/plugins");

        Library.Launched += (item, result, by) =>
        {
            History.RecordLaunch(item, result, by);
            if (!result.Ok) Notifications.Push("launch-failed:" + item.Id, Severity.Error, $"Start fehlgeschlagen: {item.Name}", result.Message, "/library");
        };

        Sessions.Started += (item, at) =>
        {
            History.SessionStarted(item, at);
            Perf.GameStarted(item.Id);
            var p = Profiles.Get();
            var profileId = ProfileFor(item, p);
            if (p.AutoSwitch && profileId != null && p.ActiveProfileId != profileId)
                Profiles.Activate(profileId, $"Spiel gestartet: {item.Name}");
            Rpc.Broadcast("session", RunningInfo());
            Activity.GameChanged();
            _ = Automations.Fire(TriggerType.GameStarted, item.Id);
            _ = GameModePrograms.GameStartedAsync();
            UpdateGameMode();
            if (Settings.Get() is { ObsReplayWhilePlaying: true } st && CaptureService.ProviderFor(st, "replay") == "obs") _ = ObsReplayBuffer(true);
        };
        Sessions.Stopped += (item, at) =>
        {
            History.SessionEnded(item.Id, at);
            if (Perf.GameStopped(item.Id) is { } perf) History.AttachPerf(item.Id, perf);
            var p = Profiles.Get();
            var profileId = ProfileFor(item, p);
            // Only switch back if no other running game still wants this profile.
            var stillNeeded = Sessions.Running().Any(r => r.itemId != item.Id && Library.Get(r.itemId) is { } other && ProfileFor(other, p) == profileId);
            if (p.AutoSwitch && profileId != null && p.ActiveProfileId == profileId && !stillNeeded)
                Profiles.Revert($"Spiel beendet: {item.Name}");
            Rpc.Broadcast("session", RunningInfo());
            Activity.GameChanged();
            _ = Automations.Fire(TriggerType.GameStopped, item.Id);
            if (Sessions.Running().Count == 0) _ = GameModePrograms.AllGamesStoppedAsync();
            GameActivity.RunWhenIdle("quests", () => { try { Quests.Get(); } catch (Exception ex) { Log.Warn("quests", ex.Message); } return Task.CompletedTask; });
            UpdateGameMode();
            if (Settings.Get() is { ObsReplayWhilePlaying: true } st && CaptureService.ProviderFor(st, "replay") == "obs" && Sessions.Running().Count == 0) _ = ObsReplayBuffer(false);
        };

        Profiles.LaunchItem = (id, by) => Library.Launch(id, by);
        Profiles.CurrentAudio = () => { var a = Audio.Settings(); return (a.OutputDeviceId, a.SoundboardVolume, Soundboard.Get().ActiveCollectionId); };
        Profiles.Apply = (p, plan) =>
        {
            if (plan.SetOutput || plan.SoundboardVolume != null)
                Audio.Update(a =>
                {
                    if (plan.SetOutput) a.OutputDeviceId = plan.OutputDeviceId;
                    if (plan.SoundboardVolume != null) a.SoundboardVolume = plan.SoundboardVolume.Value;
                });
            if (plan.SetCollection) Soundboard.SetActiveCollection(plan.SoundCollectionId);
            if (p.AudioOutputDeviceId != null && Audio.Engine.Supported && Audio.Devices().All(d => d.Id != p.AudioOutputDeviceId))
            {
                Notifications.Push("audio-missing", Severity.Warning, "Audiogerät des Profils fehlt", $"Profil „{p.Name}“ nutzt ein Gerät, das nicht angeschlossen ist.", "/audio");
                _ = Automations.Fire(TriggerType.AudioDeviceMissing, p.AudioOutputDeviceId);
            }
        };
        Profiles.Activated += (p, reason) => _ = Automations.Fire(TriggerType.ProfileActivated, p.Id);

        Hotkeys.ActiveNow = h =>
        {
            var f = Profiles.Get();
            var owners = f.Profiles.Where(p => p.HotkeyIds.Contains(h.Id)).Select(p => p.Id).ToList();
            return owners.Count == 0 || owners.Contains(f.ActiveProfileId ?? "");
        };
        Hotkeys.OnPressed = async h => { if (Hotkeys.ActiveNow(h)) await RunHotkey(h); }; // profile-specific hotkeys only in their profile
        Profiles.Activated += (_, _) => Hotkeys.RegisterAll(); // profile-only hotkeys follow the active profile

        Pairing.PendingAdded += p =>
        {
            Rpc.Broadcast("pairing.pending", new { requestId = p.RequestId, deviceName = p.DeviceName, platform = p.Platform, ip = p.Ip, createdAt = p.CreatedAt }, Permissions.Local);
            try { Platform.Desktop.ShowPairingRequest(p.DeviceName); } catch { }
        };
        Pairing.Decided += p =>
        {
            Rpc.Broadcast("changed", new { topic = "pairing" }, Permissions.Local);
            if (p.Approved == true) Rpc.Changed("devices");
            var session = p.ChannelId != null ? Rpc.Session(p.ChannelId) : null;
            if (session == null) return; // device will use pairing.claim after reconnecting
            if (p.Approved == true) Rpc.SendTo(session, "pairing.result", new { approved = true, token = Pairing.TakeToken(p), deviceId = p.DeviceId });
            else Rpc.SendTo(session, "pairing.result", new { approved = false });
        };
        Pairing.CodeLocked += () => Notifications.Push("pairing-locked", Severity.Warning, "Kopplungscode gesperrt", "Zu viele falsche Eingaben. Ein neuer Code muss am PC erzeugt werden.", "/pair");

        Relay.StateChanged += state =>
        {
            if (state == "error" || state == "reconnecting")
            {
                Notifications.Push("relay-down", Severity.Warning, "Relay-Verbindung unterbrochen", Relay.LastError);
                _ = Automations.Fire(TriggerType.RelayDisconnected, null);
            }
        };

        Notifications.IsGaming = Sessions.AnyGameRunning;
        Notifications.ProfileQuiet = () => Profiles.Active()?.QuietNotifications == true;
        Notifications.OnDesktop = n => { try { Platform.Desktop.ShowToast(n.Title, n.Message ?? ""); } catch { } };

        Settings.Saved += s => ApplyRelaySettings(s);
        Settings.Saved += s => Metrics.Apply(s.Metrics ?? new());
        var (epicWasOn, eaWasOn) = (Settings.Get().EpicEnabled, Settings.Get().EaEnabled);
        Settings.Saved += s =>
        {
            try
            {
                if (s.EpicEnabled && !epicWasOn) Launchers.Sync(LauncherService.Epic);
                if (s.EaEnabled && !eaWasOn) Launchers.Sync(LauncherService.Ea);
            }
            catch (Exception ex) { Log.Warn("launchers", ex.Message); }
            (epicWasOn, eaWasOn) = (s.EpicEnabled, s.EaEnabled);
        };
        var steamWasOn = Settings.Get().SteamEnabled;
        Settings.Saved += s =>
        {
            if (s.SteamEnabled && !steamWasOn) _ = Steam.SyncAsync(force: true).ContinueWith(t => { if (t.Exception != null) Log.Warn("steam", t.Exception.GetBaseException().Message); });
            steamWasOn = s.SteamEnabled;
        };
        var gamePassWasOn = Settings.Get().GamePassEnabled;
        Settings.Saved += s =>
        {
            if (s.GamePassEnabled && !gamePassWasOn) _ = GamePass.SyncAsync(force: true).ContinueWith(t => { if (t.Exception != null) Log.Warn("gamepass", t.Exception.GetBaseException().Message); });
            gamePassWasOn = s.GamePassEnabled;
        };
    }

    /// <summary>The profile linked to a game: set on the game itself, or the game is listed in a profile.</summary>
    public static string? ProfileFor(LibraryItem item, ProfilesFile p)
    {
        if (item.ProfileId != null && p.Profiles.Any(x => x.Id == item.ProfileId)) return item.ProfileId;
        return p.Profiles.FirstOrDefault(x => x.GameIds.Contains(item.Id))?.Id;
    }

    /// <summary>What a step does, in words, for the progress view.</summary>
    string StepLabel(ActionStep st)
    {
        string Item() => Library.Get(st.Ref ?? "")?.Name ?? "Spiel/Programm";
        return st.Type switch
        {
            StepType.LaunchItem => $"{Item()} starten",
            StepType.ActivateProfile => $"Profil „{Profiles.Get().Profiles.FirstOrDefault(p => p.Id == st.Ref)?.Name ?? "?"}“",
            StepType.RevertProfile => "Vorheriges Profil",
            StepType.PlaySound => $"Sound „{Soundboard.Get().Sounds.FirstOrDefault(x => x.Id == st.Ref)?.Name ?? "?"}“",
            StepType.StopAllSounds => "Alle Sounds stoppen",
            StepType.SetCollection => "Sound-Sammlung wählen",
            StepType.SetAudioOutput => "Audioausgabe setzen",
            StepType.RunDiagnostics => "Diagnose",
            StepType.Notify => "Hinweis: " + DeviceStore.Sanitize(st.Ref, 60, ""),
            StepType.ToggleOverlay => "Overlay umschalten",
            StepType.ObsRecordToggle => "Aufnahme starten/stoppen",
            StepType.ObsReplaySave => "Replay speichern",
            StepType.ObsReplayBufferToggle => "Replay-Puffer umschalten",
            StepType.Wait => $"{st.Ref} s warten",
            StepType.IfRunning => $"Nur wenn {Item()} läuft",
            StepType.IfNotRunning => $"Nur wenn {Item()} nicht läuft",
            StepType.MediaKey => "Medientaste " + st.Ref,
            StepType.ApplyLayout => $"Fenster-Layout „{Layouts.Export().Layouts.FirstOrDefault(l => l.Id == st.Ref)?.Name ?? "?"}“",
            StepType.RgbColor => "RGB-Farbe " + st.Ref,
            StepType.RgbProfile => $"RGB-Profil „{st.Ref}“",
            _ => st.Type.ToString(),
        };
    }

    public List<object> RunningList() =>
        Sessions.Running().Select(r => (object)new { itemId = r.itemId, name = Library.Get(r.itemId)?.Name ?? "?", since = r.since }).ToList();

    public object RunningInfo() => new { running = RunningList() };

    string? _relayFingerprint;

    void ApplyRelaySettings(Settings s)
    {
        var secret = s.RelaySecretProtected == null ? null : Platform.Secrets.Unprotect(s.RelaySecretProtected);
        var fp = s.RelayEnabled && s.RelayUrl != null && s.RelayCompanionId != null && secret != null ? $"{s.RelayUrl}|{s.RelayCompanionId}|{Ids.Sha256Hex(secret)}" : null;
        if (fp == _relayFingerprint) return;
        _relayFingerprint = fp;
        if (fp == null) { _ = Relay.StopAsync(); return; }
        // Settings from older versions may still point the relay at this companion itself (e.g. ws://127.0.0.1:8787/ws).
        if (AddressRules.RelayProblem(s.RelayUrl!, s.Port) is { } problem)
        {
            Relay.Block(s.RelayUrl!, problem);
            Notifications.Push("relay-config", Severity.Error, "Relay-Adresse ungültig", problem, "/settings?s=connection");
            return;
        }
        Relay.Start(s.RelayUrl!, s.RelayCompanionId!, secret!);
    }

    public async Task StartAsync()
    {
        History.CloseDanglingSessions();
        await Web.StartAsync();
        if (Web.StartError != null) Notifications.Push("web-start", Severity.Error, "Webserver konnte nicht starten", Web.StartError, "/settings");
        Hotkeys.RegisterAll();
        if (Audio.ApplyMic() is { } micErr) Notifications.Push("mic", Severity.Warning, "Mikrofon-Durchleitung nicht aktiv", micErr, "/audio");
        if (Audio.Engine.Supported && AudioService.MissingDevices(Audio.Settings(), Audio.Devices()) is { Count: > 0 } missing)
        {
            Notifications.Push("audio-missing", Severity.Warning, "Audiogerät fehlt", string.Join(", ", missing) + " nicht gefunden.", "/audio");
            _ = Automations.Fire(TriggerType.AudioDeviceMissing, null);
        }
        Audio.WatchDevices(missing =>
        {
            Notifications.Push("audio-missing", Severity.Warning, "Audiogerät fehlt", string.Join(", ", missing) + " nicht gefunden.", "/audio");
            _ = Automations.Fire(TriggerType.AudioDeviceMissing, null);
        });
        Sessions.Start();
        LanAddress.Start();
        GamePass.Start();
        Updates.StartAutoCheck();
        Covers.Start();
        Calendar.Start();
        Plugins.Start();
        _ = Task.Run(Backup.EnsureAutoPoint);
        Steam.Start();
        Launchers.Start();
        ApplyRelaySettings(Settings.Get());
        _ = Automations.Fire(TriggerType.CompanionStarted, null);
        Log.Info("companion", $"Companion {UpdateService.CurrentVersion} gestartet. Daten: {Paths.DataDir}");
    }

    /// <summary>Runs a hotkey's action – on key press and for "Jetzt testen" in the app.</summary>
    public async Task<List<string>> RunHotkey(Hotkey h)
    {
        List<string> results;
        if (h.QuickActionId != null) results = QuickActions.Get(h.QuickActionId) is { } qa ? await Runner.RunAsync(qa.Steps, "Hotkey " + h.Keys) : new() { "Fehler: Schnellaktion wurde gelöscht" };
        else results = await Runner.RunAsync(new[] { h.Action }, "Hotkey " + h.Keys);
        // A hotkey has no screen of its own – failures would otherwise go unnoticed.
        if (results.FirstOrDefault(r => r.StartsWith("Fehler", StringComparison.Ordinal)) is { } err)
            Notifications.Push("hotkey-" + h.Id, Severity.Warning, $"Hotkey {h.Keys} fehlgeschlagen", err, "/hotkeys");
        return results;
    }

        (bool, bool)? _gameMode;

    /// <summary>
    /// While a game runs: background work waits (GameActivity) and the companion steps back (lower priority, efficiency
    /// mode, smaller memory footprint). While the large overlay is open, the companion runs normally so it reacts at once.
    /// </summary>
    void UpdateGameMode()
    {
        var gaming = Sessions.AnyGameRunning();
        GameActivity.Set(gaming);
        Platform.DesktopWidgets.SetPaused(gaming);
        var step = gaming && Platform.Overlay.Visible != "full";
        var audioLive = Audio.Engine.MicPassthroughActive;
        if (_gameMode == (step, audioLive)) return;
        _gameMode = (step, audioLive);
        if (Platform.GameMode.Apply(step, audioLive) is { Length: > 0 } what) Log.Info("gamemode", what);
    }

    async Task ObsReplayBuffer(bool on)
    {
        try { await Obs.EnsureReplayBuffer(on); }
        catch (Exception ex)
        {
            Log.Warn("obs", ex.Message);
            if (on) Notifications.Push("obs-replay-buffer", Severity.Warning, "Replay-Puffer nicht gestartet", ex.Message, "/overlay-settings");
        }
    }

    public async ValueTask DisposeAsync()
    {
        await Obs.DisposeAsync();
        Sessions.Dispose();
        Calendar.Dispose();
        Monitor.Dispose();
        LanAddress.Dispose();
        GamePass.Dispose();
        Updates.Dispose();
        Covers.Dispose();
        Plugins.Dispose();
        Perf.Dispose();
        NetMonitor.Dispose();
        Steam.Dispose();
        Launchers.Dispose();
        Deals.Dispose();
        try { Platform.Hotkeys.UnregisterAll(); } catch { }
        try { Platform.Audio.StopAll(); Platform.Audio.SetMicPassthrough(false, null, null, 0); } catch { }
        await Relay.DisposeAsync();
        await Web.DisposeAsync();
        Log.Info("companion", "Companion beendet.");
    }
}
