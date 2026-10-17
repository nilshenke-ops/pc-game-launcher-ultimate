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
    public QuickActionService QuickActions { get; }
    public AutomationEngine Automations { get; }
    public HotkeyService Hotkeys { get; }
    public AudioService Audio { get; }
    public SoundboardService Soundboard { get; }
    public MonitorService Monitor { get; }
    public NetworkDiagnostics Network { get; }
    public UpdateService Updates { get; }
    public BackupService Backup { get; }
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
        Notifications = new NotificationCenter(Rpc, Settings);
        Library = new LibraryService(paths, platform, Rpc);
        History = new HistoryService(paths, Settings, Rpc);
        Sessions = new SessionTracker(Library, platform.Processes, Settings);
        Profiles = new ProfileService(paths, Rpc);
        QuickActions = new QuickActionService(paths, Rpc);
        Automations = new AutomationEngine(paths, Rpc, Runner);
        Hotkeys = new HotkeyService(paths, platform.Hotkeys, Rpc);
        Audio = new AudioService(paths, platform.Audio, Rpc);
        Soundboard = new SoundboardService(paths, Audio, Rpc);
        Monitor = new MonitorService(platform.Metrics, Rpc);
        Relay = new RelayClient(Rpc);
        Web = new WebHost(this, assets);
        Network = new NetworkDiagnostics(Relay.Status, Settings.Get, Web.LanUrls);
        Updates = new UpdateService(paths, Settings.Get, platform.UpdateInstaller, Rpc);
        Backup = new BackupService(paths, this);

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
    };

    object HelloInfo(RpcSession s) => new
    {
        app = "PC Game Launcher Ultimate",
        version = UpdateService.CurrentVersion,
        pcName = Settings.Get().PcName,
        platform = Platform.Name,
        features = Features(),
    };

    void Wire()
    {
        Runner.LaunchItem = (id, by) => Library.Launch(id, by);
        Runner.ActivateProfile = (id, by) => Profiles.Activate(id, by);
        Runner.RevertProfile = by => Profiles.Revert(by);
        Runner.PlaySound = id => Soundboard.Play(id);
        Runner.StopAllSounds = Soundboard.StopAll;
        Runner.SetCollection = Soundboard.SetActiveCollection;
        Runner.SetAudioOutput = id => Audio.Update(a => a.OutputDeviceId = id);
        Runner.RunDiagnostics = async () => await Network.Run();
        Runner.Notify = text => Notifications.Push("automation:" + text, Severity.Info, text);

        Library.Launched += (item, result, by) =>
        {
            History.RecordLaunch(item, result, by);
            if (!result.Ok) Notifications.Push("launch-failed:" + item.Id, Severity.Error, $"Start fehlgeschlagen: {item.Name}", result.Message, "/library");
        };

        Sessions.Started += (item, at) =>
        {
            History.SessionStarted(item, at);
            var p = Profiles.Get();
            if (p.AutoSwitch && item.ProfileId != null && p.ActiveProfileId != item.ProfileId && Profiles.Find(item.ProfileId) != null)
                Profiles.Activate(item.ProfileId, $"Spiel gestartet: {item.Name}");
            Rpc.Broadcast("session", RunningInfo());
            _ = Automations.Fire(TriggerType.GameStarted, item.Id);
        };
        Sessions.Stopped += (item, at) =>
        {
            History.SessionEnded(item.Id, at);
            var p = Profiles.Get();
            if (p.AutoSwitch && item.ProfileId != null && p.ActiveProfileId == item.ProfileId)
                Profiles.Revert($"Spiel beendet: {item.Name}");
            Rpc.Broadcast("session", RunningInfo());
            _ = Automations.Fire(TriggerType.GameStopped, item.Id);
        };

        Profiles.LaunchItem = (id, by) => Library.Launch(id, by);
        Profiles.Apply = p =>
        {
            if (p.AudioOutputDeviceId != null || p.SoundboardVolume != null)
                Audio.Update(a =>
                {
                    if (p.AudioOutputDeviceId != null) a.OutputDeviceId = p.AudioOutputDeviceId;
                    if (p.SoundboardVolume != null) a.SoundboardVolume = p.SoundboardVolume.Value;
                });
            if (p.SoundCollectionId != null) Soundboard.SetActiveCollection(p.SoundCollectionId);
            if (p.AudioOutputDeviceId != null && Audio.Engine.Supported && Audio.Devices().All(d => d.Id != p.AudioOutputDeviceId))
            {
                Notifications.Push("audio-missing", Severity.Warning, "Audiogerät des Profils fehlt", $"Profil „{p.Name}“ nutzt ein Gerät, das nicht angeschlossen ist.", "/audio");
                _ = Automations.Fire(TriggerType.AudioDeviceMissing, p.AudioOutputDeviceId);
            }
        };
        Profiles.Activated += (p, reason) => _ = Automations.Fire(TriggerType.ProfileActivated, p.Id);

        Hotkeys.OnPressed = async h =>
        {
            var owners = Profiles.Get().Profiles.Where(p => p.HotkeyIds.Contains(h.Id)).Select(p => p.Id).ToList();
            if (owners.Count > 0 && !owners.Contains(Profiles.Get().ActiveProfileId ?? "")) return; // profile-specific hotkey
            if (h.QuickActionId != null && QuickActions.Get(h.QuickActionId) is { } qa) await Runner.RunAsync(qa.Steps, "Hotkey " + h.Keys);
            else await Runner.RunAsync(new[] { h.Action }, "Hotkey " + h.Keys);
        };

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
        Sessions.Start();
        ApplyRelaySettings(Settings.Get());
        _ = Automations.Fire(TriggerType.CompanionStarted, null);
        Log.Info("companion", $"Companion {UpdateService.CurrentVersion} gestartet. Daten: {Paths.DataDir}");
    }

    public async ValueTask DisposeAsync()
    {
        Sessions.Dispose();
        Monitor.Dispose();
        try { Platform.Hotkeys.UnregisterAll(); } catch { }
        try { Platform.Audio.StopAll(); Platform.Audio.SetMicPassthrough(false, null, null, 0); } catch { }
        await Relay.DisposeAsync();
        await Web.DisposeAsync();
        Log.Info("companion", "Companion beendet.");
    }
}
