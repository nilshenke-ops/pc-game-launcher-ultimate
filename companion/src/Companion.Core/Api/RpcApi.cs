using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;
using Pgl.Core.Services;

namespace Pgl.Core.Api;

/// <summary>Maps every protocol method to a service call. Permissions come from protocol.json (see RpcServer.Register).</summary>
public static class RpcApi
{
    public static void Register(CompanionServices s)
    {
        var rpc = s.Rpc;

        // ------------------------------------------------------------ pairing
        rpc.Register("pairing.create", ctx =>
        {
            var (code, expires) = s.Pairing.CreateCode();
            return new { code, expiresAt = expires, urls = PairingUrls(s, code), pcAddress = PcAddress(s) };
        });
        rpc.Register("pairing.cancel", ctx => { s.Pairing.CancelCode(); return true; });
        rpc.Register("pairing.pending", ctx =>
        {
            var active = s.Pairing.ActiveCode();
            return new
            {
                code = active?.code,
                expiresAt = active?.expiresAt,
                urls = active == null ? null : PairingUrls(s, active.Value.code),
                pcAddress = PcAddress(s),
                pending = s.Pairing.Pending().Select(p => new { requestId = p.RequestId, deviceName = p.DeviceName, platform = p.Platform, ip = p.Ip, createdAt = p.CreatedAt }),
            };
        });
        rpc.Register("pairing.decide", ctx =>
        {
            var perms = ctx.Params.TryGetProperty("permissions", out var pe) && pe.ValueKind == JsonValueKind.Array
                ? pe.EnumerateArray().Select(x => x.GetString() ?? "").ToList() : null;
            var p = s.Pairing.Decide(ctx.Str("requestId", 64), ctx.Bool("approve"), perms)
                ?? throw new RpcException("not-found", "Anfrage ist abgelaufen oder wurde bereits entschieden.");
            return new { approved = p.Approved, deviceId = p.DeviceId };
        });
        rpc.Register("pairing.request", ctx =>
        {
            var (error, pending, claim, retry) = s.Pairing.Request(ctx.Str("code", 20), ctx.Str("deviceName", 60, false), ctx.Str("platform", 60, false), ctx.Session.Channel.RemoteIp, ctx.Session.Channel.Id);
            if (error == PairingError.None) return new { state = "awaiting-confirmation", requestId = pending!.RequestId, claimSecret = claim };
            throw error switch
            {
                PairingError.RateLimited => new RpcException("rate-limited", $"Zu viele Versuche. Bitte in {Math.Max(1, (int)Math.Ceiling(retry.TotalMinutes))} Minute(n) erneut versuchen."),
                PairingError.NoActiveCode => new RpcException("no-code", "Am PC ist kein Kopplungscode aktiv. Bitte im Companion „Neuen Code erzeugen“ klicken."),
                PairingError.Expired => new RpcException("code-expired", "Der Code ist abgelaufen. Bitte am PC einen neuen Code erzeugen."),
                PairingError.Locked => new RpcException("code-locked", "Zu viele falsche Eingaben – der Code wurde gesperrt. Bitte am PC einen neuen Code erzeugen."),
                _ => new RpcException("code-invalid", "Code ist ungültig. Bitte genau so eingeben, wie er am PC angezeigt wird."),
            };
        });
        rpc.Register("pairing.claim", ctx =>
        {
            var (state, token, deviceId) = s.Pairing.Claim(ctx.Str("requestId", 64), ctx.Str("claimSecret", 100), ctx.Session.Channel.Id);
            return new { state, token, deviceId };
        });

        // ------------------------------------------------------------ devices
        rpc.Register("devices.list", ctx => new
        {
            devices = s.Devices.List().Select(d => new
            {
                d.Id, d.Name, d.Platform, d.Permissions, d.PairedAt, d.LastSeenAt, d.LastIp,
                online = rpc.Sessions.Any(x => x.Device?.Id == d.Id),
                transport = rpc.Sessions.FirstOrDefault(x => x.Device?.Id == d.Id)?.Channel.Transport,
            }),
            localSessions = rpc.Sessions.Count(x => x.IsLocalAdmin),
            protection = s.Platform.Secrets.Description,
        });
        rpc.Register("devices.me", ctx => new { isLocal = ctx.Session.IsLocalAdmin, device = ctx.Session.Device == null ? null : new { ctx.Session.Device.Id, ctx.Session.Device.Name }, permissions = ctx.Session.Permissions, transport = ctx.Session.Channel.Transport });
        rpc.Register("devices.rename", ctx => s.Devices.Rename(ctx.Str("id", 64), ctx.Str("name", 60)) ? Changed(s, "devices") : throw NotFound());
        rpc.Register("devices.revoke", ctx =>
        {
            var id = ctx.Str("id", 64);
            if (ctx.Session.Device?.Id == id) throw new RpcException("invalid", "Das eigene Gerät kann hier nicht entfernt werden. Bitte am PC entfernen oder „Abmelden“ nutzen.");
            return s.Devices.Revoke(id) ? Changed(s, "devices") : throw NotFound();
        });
        rpc.Register("devices.setPermissions", ctx =>
        {
            var perms = ctx.Params.GetProperty("permissions").EnumerateArray().Select(x => x.GetString() ?? "").ToList();
            var id = ctx.Str("id", 64);
            if (!s.Devices.SetPermissions(id, perms)) throw NotFound();
            foreach (var sess in rpc.Sessions.Where(x => x.Device?.Id == id)) sess.Permissions = new HashSet<string>(s.Devices.Get(id)!.Permissions);
            return Changed(s, "devices");
        });

        // ------------------------------------------------------------ state
        rpc.Register("state.get", ctx =>
        {
            var prof = s.Profiles.Get();
            var active = prof.Profiles.FirstOrDefault(p => p.Id == prof.ActiveProfileId);
            var audio = s.Audio.Settings();
            var devices = s.Audio.Devices();
            var set = s.Settings.Get();
            return new
            {
                pcName = set.PcName,
                version = UpdateService.CurrentVersion,
                platform = s.Platform.Name,
                startedAt = s.StartedAt,
                features = s.Features(),
                activeProfile = active == null ? null : new { active.Id, active.Name, active.Color, active.Icon, reason = prof.ActiveReason, since = prof.ActiveSince, active.DashboardLayoutId, active.QuickActionIds },
                autoSwitch = prof.AutoSwitch,
                running = s.RunningList(),
                playing = s.Soundboard.Playing(),
                relay = s.Relay.Status(),
                lanUrls = s.Web.LanUrls(),
                lanAccess = s.Web.LanAccess,
                publicUrl = set.PublicUrl,
                audio = new
                {
                    supported = s.Audio.Engine.Supported,
                    output = audio.OutputDeviceId == null ? "Windows-Standardgerät" : devices.FirstOrDefault(d => d.Id == audio.OutputDeviceId)?.Name ?? "Gerät fehlt",
                    mic = audio.MicPassthrough ? (s.Audio.Engine.MicPassthroughActive ? "Durchleitung aktiv" : "Durchleitung gestört") : "Nicht durchgeleitet",
                    volume = audio.SoundboardVolume,
                    missing = AudioService.MissingDevices(audio, devices),
                },
                counts = new
                {
                    games = s.Library.List().Count(i => i.Kind == ItemKind.Game),
                    programs = s.Library.List().Count(i => i.Kind == ItemKind.Program),
                    sounds = s.Soundboard.Get().Sounds.Count,
                    devices = s.Devices.List().Count,
                    notifications = s.Notifications.List().Count,
                },
                me = new { isLocal = ctx.Session.IsLocalAdmin, name = ctx.Session.Who, permissions = ctx.Session.Permissions, transport = ctx.Session.Channel.Transport },
                updates = s.Updates.Status(),
            };
        });

        // ------------------------------------------------------------ library
        rpc.Register("library.list", ctx => new { items = s.Library.List(), installed = s.Library.InstallState(), running = s.Sessions.Running().Select(r => r.itemId), coversFromCdn = s.Settings.Get().SteamCoversFromCdn });
        rpc.Register("library.detect", ctx => new { items = s.Library.Detect(), detectors = s.Platform.Detectors.Select(d => d.Name).Concat(s.Platform.Desktop.CanListApps ? new[] { "Startmenü / Microsoft Store / Xbox" } : Array.Empty<string>()) });
        rpc.Register("library.addDetected", ctx => s.Library.AddDetected(ctx.Str("key", 400), ParseKind(ctx.OptStr("kind", 20))));
        rpc.Register("library.addSteam", ctx => s.Library.AddSteam(ctx.Str("appId", 12), ctx.OptStr("name", 80)));
        rpc.Register("library.addPath", ctx => s.Library.AddPath(ctx.Str("path", 400), ParseKind(ctx.OptStr("kind", 20)) ?? ItemKind.Program, ctx.OptStr("name", 80), ctx.OptStr("args", 500)));
        rpc.Register("library.pickFile", async ctx =>
        {
            if (!s.Platform.Desktop.CanPickFiles) throw new RpcException("unsupported", "Dateiauswahl ist nur im Windows-Companion verfügbar. Pfad bitte manuell eingeben.");
            return (object?)new { path = await s.Platform.Desktop.PickExecutableAsync() };
        });
        rpc.Register("library.update", ctx => s.Library.UpdateMetadata(ctx.Bind<LibraryService.MetadataUpdate>()));
        rpc.Register("library.updateTarget", ctx => s.Library.UpdateTarget(ctx.Str("id", 64), ctx.OptStr("target", 400), ctx.Str("args", 500, false), ctx.Str("workingDir", 400, false)));
        rpc.Register("library.remove", ctx => s.Library.Remove(ctx.Str("id", 64)) ? true : throw NotFound());
        rpc.Register("library.launch", ctx =>
        {
            var r = s.Library.Launch(ctx.Str("id", 64), ctx.Session.Who);
            if (!r.Ok) throw new RpcException(r.Code ?? "launch-failed", r.Message);
            return r;
        });

        // ------------------------------------------------------------ quick actions
        rpc.Register("quick.list", ctx => new { actions = s.QuickActions.List() });
        rpc.Register("quick.save", ctx => s.QuickActions.Save(ctx.Bind<QuickAction>()));
        rpc.Register("quick.remove", ctx => { s.QuickActions.Remove(ctx.Str("id", 64)); return true; });
        rpc.Register("quick.reorder", ctx => { s.QuickActions.Reorder(ctx.Params.GetProperty("ids").EnumerateArray().Select(x => x.GetString() ?? "").Take(500).ToList()); return true; });
        rpc.Register("quick.run", async ctx =>
        {
            var qa = s.QuickActions.Get(ctx.Str("id", 64)) ?? throw NotFound();
            return (object?)new { results = await s.Runner.RunAsync(qa.Steps, $"{ctx.Session.Who} (Quick Action {qa.Name})") };
        });

        // ------------------------------------------------------------ profiles
        rpc.Register("profiles.list", ctx => s.Profiles.Get());
        rpc.Register("profiles.save", ctx =>
        {
            if (ctx.Params.TryGetProperty("autoSwitch", out var a) && a.ValueKind is JsonValueKind.True or JsonValueKind.False && !ctx.Params.TryGetProperty("profile", out _))
            { s.Profiles.SetAutoSwitch(a.GetBoolean()); return true; }
            var saved = s.Profiles.Save(ctx.Params.GetProperty("profile").Deserialize<Profile>(Json.Options) ?? throw new RpcException("invalid-params", "Profil fehlt."));
            s.Hotkeys.RegisterAll(); // the profile's hotkey list may have changed
            return saved;
        });
        rpc.Register("profiles.remove", ctx => { s.Profiles.Remove(ctx.Str("id", 64)); s.Hotkeys.RegisterAll(); return true; });
        rpc.Register("profiles.copy", ctx => s.Profiles.Copy(ctx.Str("id", 64)));
        rpc.Register("profiles.activate", ctx => s.Profiles.Activate(ctx.Str("id", 64), $"Manuell ({ctx.Session.Who})"));
        rpc.Register("profiles.revert", ctx => (object?)s.Profiles.Revert($"Manuell ({ctx.Session.Who})") ?? throw new RpcException("none", "Kein vorheriges Profil gespeichert."));

        // ------------------------------------------------------------ automations
        rpc.Register("automations.list", ctx => new { rules = s.Automations.List() });
        rpc.Register("automations.save", ctx => s.Automations.Save(ctx.Bind<AutomationRule>()));
        rpc.Register("automations.remove", ctx => { s.Automations.Remove(ctx.Str("id", 64)); return true; });
        rpc.Register("automations.copy", ctx => s.Automations.Copy(ctx.Str("id", 64)));
        rpc.Register("automations.test", async ctx => (object?)new { results = await s.Automations.Test(ctx.Str("id", 64)) });

        // ------------------------------------------------------------ hotkeys
        rpc.Register("hotkeys.list", ctx => s.Hotkeys.ListWithStatus());
        rpc.Register("hotkeys.save", ctx => s.Hotkeys.Save(ctx.Bind<Hotkey>()));
        rpc.Register("hotkeys.remove", ctx => { s.Hotkeys.Remove(ctx.Str("id", 64)); return true; });

        // ------------------------------------------------------------ history
        rpc.Register("history.get", ctx => s.History.Get());
        rpc.Register("history.clear", ctx => { s.History.Clear(); return true; });

        // ------------------------------------------------------------ sounds
        rpc.Register("sounds.list", ctx => new { data = s.Soundboard.Get(), playing = s.Soundboard.Playing(), supported = s.Audio.Engine.Supported, reason = s.Audio.Engine.UnsupportedReason });
        rpc.Register("sounds.uploadBegin", ctx => new { uploadId = s.Soundboard.UploadBegin(ctx.Str("name", 200), ctx.Params.GetProperty("size").GetInt64()) });
        rpc.Register("sounds.uploadChunk", ctx => { s.Soundboard.UploadChunk(ctx.Str("uploadId", 64), ctx.Str("data", 800_000)); return true; });
        rpc.Register("sounds.uploadEnd", ctx => s.Soundboard.UploadEnd(ctx.Str("uploadId", 64)));
        rpc.Register("sounds.importUrl", async ctx => (object?)await s.Soundboard.ImportUrl(ctx.Str("url", 1000), ctx.OptStr("name", 80)));
        rpc.Register("sounds.update", ctx => s.Soundboard.Update(ctx.Bind<SoundboardService.SoundUpdate>()));
        rpc.Register("sounds.remove", ctx => { s.Soundboard.Remove(ctx.Str("id", 64)); return true; });
        rpc.Register("sounds.play", ctx => s.Soundboard.Play(ctx.Str("id", 64)) is { } err ? throw new RpcException("audio", err) : true);
        rpc.Register("sounds.stop", ctx => { s.Soundboard.Stop(ctx.Str("playbackId", 64)); return true; });
        rpc.Register("sounds.stopAll", ctx => { s.Soundboard.StopAll(); return true; });
        rpc.Register("sounds.pause", ctx => { s.Soundboard.Pause(ctx.Str("playbackId", 64), true); return true; });
        rpc.Register("sounds.resume", ctx => { s.Soundboard.Pause(ctx.Str("playbackId", 64), false); return true; });
        rpc.Register("sounds.saveCollection", ctx => s.Soundboard.SaveCollection(ctx.Bind<SoundCollection>()));
        rpc.Register("sounds.removeCollection", ctx => { s.Soundboard.RemoveCollection(ctx.Str("id", 64)); return true; });
        rpc.Register("sounds.setActiveCollection", ctx => { s.Soundboard.SetActiveCollection(ctx.OptStr("id", 64)); return true; });
        rpc.Register("sounds.exportConfig", ctx => s.Soundboard.ExportConfig());
        rpc.Register("sounds.importConfig", ctx => new { applied = s.Soundboard.ImportConfig(ctx.Params.GetProperty("config")) });

        // ------------------------------------------------------------ audio
        rpc.Register("audio.state", ctx => s.Audio.State());
        rpc.Register("audio.save", ctx => s.Audio.Save(ctx.Bind<AudioSettings>()));
        rpc.Register("audio.testTone", ctx =>
        {
            int? volume = ctx.Params.TryGetProperty("volume", out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number ? v.GetInt32() : null;
            return s.Audio.TestTone(ctx.Str("target", 20, false), ctx.Params.TryGetProperty("deviceId", out _) ? ctx.OptStr("deviceId", 512) ?? "" : null, volume) is { } err ? throw new RpcException("audio", err) : true;
        });
        rpc.Register("audio.micTest", async ctx => await s.Audio.MicTest(ctx.Session, ctx.OptStr("deviceId", 512)));
        rpc.Register("audio.subscribe", ctx => { lock (ctx.Session.Subscriptions) ctx.Session.Subscriptions.Add(AudioService.LevelTopic); return true; });
        rpc.Register("audio.unsubscribe", ctx => { lock (ctx.Session.Subscriptions) ctx.Session.Subscriptions.Remove(AudioService.LevelTopic); return true; });
        rpc.Register("audio.diagnose", ctx => new { at = DateTime.UtcNow, checks = s.Audio.Diagnose() });

        // ------------------------------------------------------------ monitor / network
        rpc.Register("monitor.subscribe", ctx => s.Monitor.Subscribe(ctx.Session));
        rpc.Register("monitor.unsubscribe", ctx => { s.Monitor.Unsubscribe(ctx.Session); return true; });
        rpc.Register("network.diagnose", async ctx => (object?)await s.Network.Run());

        // ------------------------------------------------------------ notifications
        rpc.Register("notifications.list", ctx => new { items = s.Notifications.List() });
        rpc.Register("notifications.dismiss", ctx => { s.Notifications.Dismiss(ctx.Str("id", 64)); return true; });
        rpc.Register("notifications.dismissAll", ctx => { s.Notifications.DismissAll(); return true; });

        // ------------------------------------------------------------ settings
        rpc.Register("settings.get", ctx =>
        {
            var set = s.Settings.Get();
            var hasSecret = set.RelaySecretProtected != null;
            set.RelaySecretProtected = null;
            set.SteamApiKeyProtected = null; // secrets never leave the PC
            set.ObsPasswordProtected = null;
            return new { settings = set, relaySecretSet = hasSecret, dataDir = ctx.Session.IsLocalAdmin ? s.Paths.DataDir : null, restartRequired = set.Port != s.Web.Port || set.LanAccess != s.Web.LanAccess, webStartError = s.Web.StartError };
        });
        rpc.Register("library.findCover", async ctx => (object?)new { cover = await s.Covers.FindForAsync(ctx.Str("id", 64)) });
        rpc.Register("launchers.list", ctx => s.Launchers.List(ctx.Str("source", 10)));
        rpc.Register("launchers.sync", ctx => s.Launchers.Sync(ctx.Str("source", 10)));
        rpc.Register("launchers.install", ctx => s.Launchers.Install(ctx.Str("source", 10), ctx.Str("id", 128)) is { } err ? throw new RpcException("unsupported", err) : (object)true);
        rpc.Register("steam.list", _ => s.Steam.List());
        rpc.Register("steam.sync", async _ => await s.Steam.SyncAsync(force: true));
        rpc.Register("steam.link", async ctx => await s.Steam.Link(ctx.Str("profile", 200), ctx.Params.TryGetProperty("apiKey", out var k) ? k.GetString() : null));
        rpc.Register("steam.unlink", _ => s.Steam.Unlink());
        rpc.Register("steam.install", ctx => s.Steam.Install(ctx.Str("appId", 10)) is { } err ? throw new RpcException("unsupported", err) : (object)true);
        rpc.Register("gamepass.list", _ => s.GamePass.List());
        rpc.Register("gamepass.sync", async _ => await s.GamePass.SyncAsync(force: true));
        rpc.Register("gamepass.install", ctx => s.GamePass.OpenInstallPage(ctx.Str("id", 12)) is { } err ? throw new RpcException("unsupported", err) : (object)true);
        rpc.Register("settings.save", ctx =>
        {
            var r = s.Settings.SaveGeneral(ctx.Bind<SettingsService.GeneralUpdate>());
            r.RelaySecretProtected = null; // secrets never leave the PC
            r.SteamApiKeyProtected = null;
            r.ObsPasswordProtected = null;
            return r;
        });
        rpc.Register("settings.saveSecurity", ctx =>
        {
            var u = ctx.Bind<SettingsService.SecurityUpdate>();
            // Changing how the PC is reachable is only allowed from the PC itself.
            if (!ctx.Session.IsLocalAdmin && (u.LanAccess != null || u.Port != null || u.RelayEnabled != null || u.RelayUrl != null || u.RelaySecret != null || u.RelayCompanionId != null))
                throw new RpcException("forbidden", "Verbindungseinstellungen können nur direkt am PC geändert werden.");
            var r = s.Settings.SaveSecurity(u, s.Platform.Secrets);
            r.RelaySecretProtected = null;
            r.SteamApiKeyProtected = null;
            r.ObsPasswordProtected = null;
            return r;
        });

        // ------------------------------------------------------------ autostart
        rpc.Register("autostart.get", ctx => new { supported = s.Platform.Autostart.Supported, enabled = s.Platform.Autostart.Supported && s.Platform.Autostart.IsEnabled() });
        rpc.Register("autostart.set", ctx =>
        {
            var err = s.Platform.Autostart.SetEnabled(ctx.Bool("enabled"));
            if (err != null) throw new RpcException("autostart", err);
            Changed(s, "autostart");
            return new { enabled = s.Platform.Autostart.IsEnabled() };
        });

        // ------------------------------------------------------------ updates
        rpc.Register("updates.status", ctx => s.Updates.Status());
        rpc.Register("updates.check", async ctx => await s.Updates.Check());
        rpc.Register("updates.download", async ctx => await s.Updates.Download());
        rpc.Register("updates.install", ctx => s.Updates.Install() is { } err ? throw new RpcException("update", err) : true);
        rpc.Register("updates.rollback", ctx => s.Updates.Rollback() is { } err ? throw new RpcException("update", err) : true);

        // ------------------------------------------------------------ network, storage, power, notes
        rpc.Register("network.subscribe", ctx => s.NetMonitor.Subscribe(ctx.Session));
        rpc.Register("network.unsubscribe", ctx => { s.NetMonitor.Unsubscribe(ctx.Session); return true; });
        rpc.Register("network.history", _ => s.NetMonitor.History());
        rpc.Register("storage.get", _ => s.Storage.Get());
        rpc.Register("storage.scan", ctx => s.Storage.Scan(ctx.OptStr("id", 64)));
        rpc.Register("storage.openFolder", ctx => { s.Storage.OpenFolder(ctx.Str("id", 64)); return true; });
        // ------------------------------------------------------------ overlay + OBS (recording, replays)
        rpc.Register("overlay.status", _ => new { supported = s.Platform.Overlay.Supported, visible = s.Platform.Overlay.Visible, reason = s.Platform.Overlay.Supported ? null : NullOverlay.Instance.Toggle("full") });
        rpc.Register("overlay.toggle", async ctx =>
        {
            var mode = ctx.OptStr("mode", 10) ?? "full";
            if (mode is not ("full" or "mini")) throw new RpcException("invalid-params", "Modus muss „full“ oder „mini“ sein.");
            return await s.Capture.ToggleOverlay(mode) is { } err ? throw new RpcException("unsupported", err) : (object)new { visible = s.Platform.Overlay.Visible };
        });
        rpc.Register("overlay.hide", _ => { s.Platform.Overlay.Hide(); return true; });
        rpc.Register("obs.status", async _ => await s.Obs.Status());
        rpc.Register("obs.configure", async ctx =>
        {
            // The password is protected on the PC right away and never returned (like the Steam key).
            var hasPw = ctx.Params.ValueKind == JsonValueKind.Object && ctx.Params.TryGetProperty("password", out var pw) && pw.ValueKind == JsonValueKind.String;
            var password = hasPw ? ctx.Str("password", 200, required: false) : null;
            bool? replay = ctx.Params.ValueKind == JsonValueKind.Object && ctx.Params.TryGetProperty("replayWhilePlaying", out var r) && r.ValueKind is JsonValueKind.True or JsonValueKind.False ? r.GetBoolean() : null;
            s.Settings.SetObs(ctx.OptStr("url", 200), string.IsNullOrEmpty(password) ? null : s.Platform.Secrets.Protect(password), keepPassword: !hasPw, replay);
            s.Obs.Reconnect();
            return await s.Obs.Status();
        });
        rpc.Register("capture.status", async _ => await s.Capture.Status());
        rpc.Register("capture.configure", async ctx =>
        {
            var keys = ctx.Params.ValueKind == JsonValueKind.Object && ctx.Params.TryGetProperty("keys", out var k) && k.ValueKind == JsonValueKind.Object
                ? k.EnumerateObject().Take(50).ToDictionary(p => p.Name, p => p.Value.ValueKind == JsonValueKind.String ? p.Value.GetString() : null) : null;
            s.Capture.Configure(ctx.OptStr("provider", 20), ctx.OptStr("overlayProvider", 20), keys);
            return await s.Capture.Status();
        });
        rpc.Register("capture.recordToggle", async _ => (object)new { message = await s.Capture.Run("record") });
        rpc.Register("capture.replaySave", async _ => (object)new { message = await s.Capture.Run("replay") });
        rpc.Register("capture.replayToggle", async _ => (object)new { message = await s.Capture.Run("buffer") });
        // Names of 1.4 (plugin "Game-Overlay" 1.0.0); they now also use the chosen program.
        rpc.Register("obs.recordToggle", async _ => (object)new { message = await s.Capture.Run("record") });
        rpc.Register("obs.replaySave", async _ => (object)new { message = await s.Capture.Run("replay") });
        rpc.Register("obs.replayToggle", async _ => (object)new { message = await s.Capture.Run("buffer") });

        rpc.Register("power.status", _ => new { supported = s.Platform.Power.Supported });
        rpc.Register("power.run", ctx =>
        {
            var action = ctx.Str("action", 20);
            if (action is not ("lock" or "sleep" or "restart" or "shutdown" or "cancel")) throw new RpcException("invalid-params", "Unbekannte Aktion.");
            Log.Info("power", $"{action} angefordert von {ctx.Session.Who}");
            return s.Platform.Power.Run(action, ctx.Int("delay", 60, 0, 600)) is { } err ? throw new RpcException("power", err) : true;
        });
        rpc.Register("history.setNote", ctx => { s.History.SetNote(ctx.Str("itemId", 64), ctx.Params.GetProperty("startedAt").GetDateTime(), ctx.OptStr("note", 1000)); return true; });
        rpc.Register("backup.points", _ => s.Backup.Points());
        rpc.Register("backup.createPoint", _ => s.Backup.CreatePoint());
        rpc.Register("backup.openPoint", ctx => new { uploadId = s.Backup.OpenPoint(ctx.Str("name", 130)) });

        // ------------------------------------------------------------ plugins
        rpc.Register("plugins.list", _ => s.Plugins.List());
        rpc.Register("plugins.files", ctx => s.Plugins.Files(ctx.Str("id", 64), ctx.Bool("preview")));
        rpc.Register("plugins.catalog", async ctx => await s.Plugins.CatalogInfo(ctx.Bool("refresh")));
        rpc.Register("plugins.installCatalog", async ctx => await s.Plugins.InstallFromCatalog(ctx.Str("id", 64)));
        rpc.Register("plugins.update", async ctx => await s.Plugins.Update(ctx.Str("id", 64)));
        rpc.Register("plugins.importBegin", ctx => new { importId = s.Plugins.ImportBegin(ctx.Params.GetProperty("size").GetInt64()) });
        rpc.Register("plugins.importChunk", ctx => { s.Plugins.ImportChunk(ctx.Str("importId", 64), ctx.Str("data", 800_000)); return true; });
        rpc.Register("plugins.importEnd", ctx => s.Plugins.ImportEnd(ctx.Str("importId", 64), ctx.Bool("check"), ctx.Session.Who));
        rpc.Register("plugins.export", ctx => s.Plugins.Export(ctx.Str("id", 64), ctx.Params.TryGetProperty("offset", out var o) ? o.GetInt64() : 0));
        rpc.Register("plugins.enable", ctx => { s.Plugins.Enable(ctx.Str("id", 64), ctx.Params.GetProperty("grant").EnumerateArray().Select(x => x.GetString() ?? "").ToList()); return true; });
        rpc.Register("plugins.disable", ctx => { s.Plugins.Disable(ctx.Str("id", 64)); return true; });
        rpc.Register("plugins.revoke", ctx => { s.Plugins.Revoke(ctx.Str("id", 64), ctx.Str("permission", 40)); return true; });
        rpc.Register("plugins.uninstall", ctx => { s.Plugins.Uninstall(ctx.Str("id", 64)); return true; });
        rpc.Register("plugins.rollback", ctx => s.Plugins.Rollback(ctx.Str("id", 64)));
        rpc.Register("plugins.setFlags", ctx => { s.Plugins.SetFlags(ctx.Str("id", 64), ctx.Params.TryGetProperty("favorite", out var f) ? f.GetBoolean() : null, ctx.Params.TryGetProperty("autoUpdate", out var a) ? a.GetBoolean() : null); return true; });
        rpc.Register("plugins.setConfig", ctx => s.Plugins.SetConfig(ctx.Str("id", 64), ctx.Params.GetProperty("config")));
        rpc.Register("plugins.runAction", async ctx => new { results = await s.Plugins.RunAction(ctx.Str("id", 64), ctx.Str("actionId", 32), ctx.Session.Who) });
        rpc.Register("plugins.reportError", ctx => { s.Plugins.ReportError(ctx.Str("id", 64), ctx.Str("message", 2000)); return true; });

        // ------------------------------------------------------------ backup
        rpc.Register("backup.export", ctx =>
        {
            var id = ctx.OptStr("exportId", 64);
            return id == null ? s.Backup.ExportBegin(ctx.Bool("includeSounds")) : s.Backup.ExportChunk(id, ctx.Params.GetProperty("offset").GetInt64());
        });
        rpc.Register("backup.validate", ctx =>
        {
            if (ctx.Params.TryGetProperty("size", out var size)) return new { uploadId = s.Backup.UploadBegin(size.GetInt64()) };
            var id = ctx.Str("uploadId", 64);
            if (ctx.OptStr("data", 800_000) is { } data) { s.Backup.UploadChunk(id, data); return true; }
            return BackupService.Summary(s.Backup.Validate(id));
        });
        rpc.Register("backup.restore", ctx =>
        {
            var parts = ctx.Params.GetProperty("parts").EnumerateArray().Select(x => x.GetString() ?? "").ToList();
            return s.Backup.Restore(ctx.Str("uploadId", 64), parts, ctx.Session.IsLocalAdmin);
        });

        // ------------------------------------------------------------ diagnostics
        rpc.Register("diagnostics.run", ctx => Diagnostics(s, ctx.Session));
        rpc.Register("diagnostics.logs", ctx => new { entries = Log.Recent(300) });

        // ------------------------------------------------------------ ui prefs (theme, layouts) per device
        rpc.Register("ui.getPrefs", ctx => new { prefs = s.Devices.GetUiPrefs(ctx.Session.PrefsKey) });
        rpc.Register("ui.savePrefs", ctx =>
        {
            var json = ctx.Params.GetProperty("prefs").GetRawText();
            if (json.Length > 1_500_000) throw new RpcException("too-large", "Design-Daten sind zu groß (Hintergrundbild verkleinern).");
            s.Devices.SaveUiPrefs(ctx.Session.PrefsKey, json);
            return true;
        });

        rpc.Register("system.openDataFolder", ctx => { s.Platform.Desktop.OpenFolder(s.Paths.DataDir); return true; });

        var missing = rpc.ProtocolPermissions.Keys.Except(rpc.RegisteredMethods).ToList();
        if (missing.Count > 0) throw new InvalidOperationException("Nicht implementierte Protokollmethoden: " + string.Join(", ", missing));
    }

    static object Changed(CompanionServices s, string topic) { s.Rpc.Changed(topic); return true; }
    static RpcException NotFound() => new("not-found", "Eintrag nicht gefunden.");

    static ItemKind? ParseKind(string? k) => k switch { "game" => ItemKind.Game, "program" => ItemKind.Program, null => null, _ => throw new RpcException("invalid-params", "Typ muss game oder program sein.") };

    /// <summary>What a person types as "PC-Adresse" on the hosted web app: the public (tunnel) address, otherwise the first LAN address.</summary>
    static string? PcAddress(CompanionServices s)
    {
        var set = s.Settings.Get();
        var url = set.PublicUrl ?? s.Web.LanUrls().FirstOrDefault();
        if (url == null || !Uri.TryCreate(url, UriKind.Absolute, out var u)) return null;
        // https is implied by the hosted page; keep the scheme only for plain http (home network/testing).
        return u.Scheme == "https" ? u.Authority : $"{u.Scheme}://{u.Authority}";
    }

    static List<string> PairingUrls(CompanionServices s, string code)
    {
        var set = s.Settings.Get();
        var urls = new List<string>();
        // First choice: the hosted web app (online even while the PC is off) with code and PC address filled in.
        // Only with an https PC address (e.g. Tailscale Funnel): an https page cannot connect to plain http.
        var webIsHttps = set.WebAppUrl?.StartsWith("https://", StringComparison.OrdinalIgnoreCase) == true;
        var pcIsHttps = set.PublicUrl?.StartsWith("https://", StringComparison.OrdinalIgnoreCase) == true;
        if (set.WebAppUrl is { } web && PcAddress(s) is { } pc && (!webIsHttps || pcIsHttps))
            urls.Add($"{web}/#/pair?code={code}&pc={Uri.EscapeDataString(pc)}");
        var bases = new List<string>();
        if (set.PublicUrl is { } pub) bases.Add(pub);
        bases.AddRange(s.Web.LanUrls());
        urls.AddRange(bases.Distinct().Select(b => $"{b}/#/pair?code={code}"));
        return urls;
    }

    static object Diagnostics(CompanionServices s, RpcSession session)
    {
        var checks = new List<object>();
        void Add(string area, string label, string status, string detail, string? fix = null) => checks.Add(new { area, label, status, detail, fix });
        var set = s.Settings.Get();
        Add("companion", "PC-Begleiter", "ok", $"Version {UpdateService.CurrentVersion} auf {s.Platform.Name}, läuft seit {s.StartedAt:u}");

        // Web server + WebSocket endpoint (what every browser, also the iPad, connects to).
        if (s.Web.StartError != null)
            Add("web", "WebSocket-Endpunkt", "error", s.Web.StartError, "Ein anderes Programm belegt den Port, oder der Begleiter läuft doppelt. Doppelte Instanz beenden oder unter Einstellungen → Verbindung einen anderen Port wählen und neu starten.");
        else
            Add("web", "WebSocket-Endpunkt", "ok", $"Lauscht auf Port {s.Web.Port} ({(s.Web.LanAccess ? "alle Netzwerkadressen" : "nur dieser PC")}), Endpunkt /ws");
        Add("web", "Web-App-Dateien", s.Web.Assets.Available ? "ok" : "error", s.Web.Assets.Available ? "Vorhanden" : "Fehlen – Web-App wurde nicht mitgebaut.", s.Web.Assets.Available ? null : "Offizielle EXE verwenden oder mit scripts/publish-companion.sh neu bauen.");

        // Address that an iPad/phone in the same Wi-Fi uses. Never 127.0.0.1 (that is the iPad itself).
        var lan = s.Web.LanUrls();
        if (!s.Web.LanAccess)
            Add("address", "Adresse für iPad/Handy (WLAN)", "error", "„Im WLAN erreichbar“ ist ausgeschaltet – nur dieser PC selbst kann die App öffnen.", "Einstellungen → Verbindung → „Im WLAN erreichbar“ einschalten (Neustart des Begleiters nötig).");
        else if (lan.Count == 0)
            Add("address", "Adresse für iPad/Handy (WLAN)", "error", "Keine Adresse im Heimnetz gefunden (kein aktiver WLAN-/LAN-Adapter).", "PC mit dem Router verbinden (WLAN oder Kabel) und Diagnose erneut ausführen.");
        else
            Add("address", "Adresse für iPad/Handy (WLAN)", "ok", string.Join("  ", lan), "Am iPad im selben WLAN genau diese Adresse öffnen oder den QR-Code unter „Gerät koppeln“ scannen. Fragt Windows nach der Firewall: „Private Netzwerke“ erlauben.");

        // Hosted web app (https) needs an https address of the PC – browsers block https → ws:// (mixed content).
        var webHttps = set.WebAppUrl?.StartsWith("https://", StringComparison.OrdinalIgnoreCase) == true;
        var pubHttps = set.PublicUrl?.StartsWith("https://", StringComparison.OrdinalIgnoreCase) == true;
        if (set.WebAppUrl == null)
            Add("address", "Webseite → PC", "info", "Keine gehostete Webseite eingetragen. Das iPad nutzt die WLAN-Adresse.");
        else if (webHttps && !pubHttps)
            Add("address", "Webseite → PC", "warn", $"{set.WebAppUrl} ist eine https-Seite und darf den PC nur über eine https-Adresse erreichen. Eine öffentliche https-Adresse ist nicht eingetragen.",
                "Im WLAN: QR-Code unter „Gerät koppeln“ scannen (öffnet die App direkt vom PC über http). Für die Webseite und unterwegs: Tailscale Funnel einrichten („tailscale funnel --bg " + s.Web.Port + "“) und die https://…ts.net-Adresse unter Einstellungen → Verbindung → „Öffentliche Adresse“ eintragen.");
        else
            Add("address", "Webseite → PC", "ok", $"{set.WebAppUrl} verbindet sich mit {set.PublicUrl ?? lan.FirstOrDefault()}");

        // Relay (optional).
        var relayProblem = set.RelayEnabled && set.RelayUrl != null ? AddressRules.RelayProblem(set.RelayUrl, set.Port) : null;
        if (!set.RelayEnabled)
            Add("relay", "Relay-Dienst", "info", "Ausgeschaltet – im WLAN und mit Tailscale Funnel nicht nötig.");
        else if (relayProblem != null)
            Add("relay", "Relay-Dienst", "error", relayProblem, "Einstellungen → Verbindung → Relay-Adresse korrigieren oder „Mit eigenem Relay verbinden“ ausschalten.");
        else if (s.Relay.State == "connected")
            Add("relay", "Relay-Dienst", "ok", $"Verbunden mit {s.Relay.Url} seit {s.Relay.ConnectedAt:u}");
        else
            Add("relay", "Relay-Dienst", "error", $"{s.Relay.State}: {s.Relay.LastError ?? "noch keine Verbindung"}", "Läuft der Relay-Server und stimmen Adresse, Companion-ID und Schlüssel mit relay.config.json überein? Ohne eigenen Server: Relay ausschalten und Tailscale Funnel nutzen.");

        // Pairing and connected devices.
        var active = s.Pairing.ActiveCode();
        var devices = s.Devices.List();
        var connected = s.Rpc.Sessions.Where(x => x.Authenticated && !x.IsLocalAdmin).ToList();
        Add("pairing", "Kopplung", "info", (active != null ? $"Code aktiv bis {active.Value.expiresAt:HH:mm:ss} UTC. " : "Kein Kopplungscode aktiv. ") + $"{devices.Count} Gerät(e) gekoppelt.",
            devices.Count == 0 ? "Am PC „Gerät koppeln → Neuen Code erzeugen“, QR-Code mit dem iPad scannen und am PC „Erlauben“ klicken." : null);
        Add("devices", "Verbundene Geräte (iPad/Handy)", connected.Count > 0 ? "ok" : "info",
            connected.Count > 0 ? string.Join(", ", connected.Select(x => $"{x.Who} ({(x.Channel.Transport == "relay" ? "über Relay" : x.Channel.RemoteIp)})")) : "Gerade ist kein gekoppeltes Gerät verbunden.",
            connected.Count > 0 ? null : "Am iPad die App öffnen. Wenn sie keine Verbindung bekommt: dieselbe WLAN-Adresse wie oben verwenden und die Firewall-Freigabe prüfen.");

        // Permissions of the session that runs the diagnosis.
        var perms = string.Join(", ", session.Permissions.OrderBy(p => p));
        var missing = new[] { Permissions.View, Permissions.Launch, Permissions.Soundboard, Permissions.Manage }.Where(p => !session.Has(p)).ToList();
        Add("permissions", "Berechtigungen dieser Sitzung", missing.Count == 0 ? "ok" : "warn", $"{session.Who}: {perms}",
            missing.Count == 0 ? null : $"Es fehlt: {string.Join(", ", missing)}. Am PC unter Geräte → Gerät → Berechtigungen freigeben.");

        Add("devices", "Gekoppelte Geräte", "info", $"{devices.Count} gekoppelt, {s.Rpc.Sessions.Count(x => x.Authenticated)} Sitzung(en) angemeldet");
        SecurityChecks(s, set, devices, session.Has(Permissions.Admin), Add);
        try { foreach (var c in ConsistencyCheck.Run(s)) Add(c.area, c.label, c.status, c.detail, c.fix); }
        catch (Exception ex) { Add("check", "Prüfung: Einstellungen", "warn", "Konnte nicht prüfen: " + ex.Message); }
        Add("audio", "Audio", s.Audio.Engine.Supported ? "ok" : "unsupported", s.Audio.Engine.Supported ? $"{s.Audio.Devices().Count} Geräte" : s.Audio.Engine.UnsupportedReason ?? "");
        var hk = s.Hotkeys.List();
        Add("hotkeys", "Hotkeys", !s.Platform.Hotkeys.Supported ? "unsupported" : "ok", s.Platform.Hotkeys.Supported ? $"{hk.Count} konfiguriert" : "Nur im Windows-Companion");
        if (!s.Platform.Autostart.Supported) Add("autostart", "Autostart", "unsupported", "Nur im Windows-Begleiter.");
        else if (s.Platform.Autostart.IsEnabled()) Add("autostart", "Autostart", "ok", "Aktiv – der Begleiter startet mit Windows, das iPad kann sich nach dem Einschalten des PCs sofort verbinden.");
        else Add("autostart", "Autostart", "warn", "Aus – nach einem PC-Neustart ist der Begleiter nicht erreichbar, bis er von Hand gestartet wird.", "Einstellungen → Autostart & Hintergrund → „Mit Windows starten“ einschalten.");
        Add("sessions", "Spielerkennung", "ok", $"Prüft alle {s.Sessions.PeriodSeconds} s, {s.Sessions.Running().Count} Spiel(e) laufen");
        try
        {
            var drive = new DriveInfo(Path.GetPathRoot(s.Paths.DataDir)!);
            Add("storage", "Speicherplatz Datenordner", drive.AvailableFreeSpace > 500_000_000 ? "ok" : "warn", $"{drive.AvailableFreeSpace / 1_000_000_000.0:F1} GB frei");
        }
        catch { }
        var errors = Log.Recent(300).Where(e => e.Level >= LogLevel.Warn).Take(15).ToList();
        Add("log", "Letzte Warnungen/Fehler", errors.Count == 0 ? "ok" : "warn", errors.Count == 0 ? "Keine" : $"{errors.Count} Einträge (siehe Protokoll)");
        return new { at = DateTime.UtcNow, checks, recentErrors = session.Has(Permissions.Admin) ? errors : null };
    }

    /// <summary>Security check: only facts read from the current configuration – nothing is guessed.</summary>
    internal static void SecurityChecks(CompanionServices s, Settings set, IReadOnlyList<PairedDevice> devices, bool showNames, Action<string, string, string, string, string?> add)
    {
        string Names(List<PairedDevice> l) => showNames ? string.Join(", ", l.Select(d => d.Name)) : $"{l.Count} Gerät(e)"; // names only for admins (like devices.list)
        SecurityChecksInner(s, set, devices, Names, add);
    }

    static void SecurityChecksInner(CompanionServices s, Settings set, IReadOnlyList<PairedDevice> devices, Func<List<PairedDevice>, string> names, Action<string, string, string, string, string?> add)
    {
        var dpapi = s.Platform.Secrets is not Pgl.Core.Platform.PlainSecretProtector;
        add("sec-secrets", "Sicherheit: Schlüssel-Speicher", dpapi ? "ok" : "warn", s.Platform.Secrets.Description,
            dpapi ? null : "Nur der Windows-Begleiter verschlüsselt Schlüssel mit dem Benutzerkonto. Datenordner nicht weitergeben.");
        add("sec-lan", "Sicherheit: Erreichbarkeit", "info", set.LanAccess
            ? "Im WLAN erreichbar – Zugriff nur mit Kopplung (Code + Bestätigung am PC). Router-Ports werden nicht geöffnet."
            : "Nur auf diesem PC erreichbar.", null);
        if (!string.IsNullOrWhiteSpace(set.PublicUrl))
        {
            var https = set.PublicUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
            add("sec-public", "Sicherheit: Öffentliche Adresse", https ? "ok" : "error", https ? $"{set.PublicUrl} (verschlüsselt über https)" : $"{set.PublicUrl} ist nicht verschlüsselt.",
                https ? null : "Nur https-Adressen verwenden (z. B. Tailscale Funnel) – sonst lassen sich Anmeldedaten mitlesen.");
        }
        if (set.RelayEnabled && set.RelayUrl is { } relay && relay.StartsWith("ws://", StringComparison.OrdinalIgnoreCase) && !AddressRules.IsLoopbackHost(new Uri(relay).Host))
            add("sec-relay", "Sicherheit: Relay", "warn", $"{relay} ist unverschlüsselt (ws://).", "Relay hinter https betreiben und wss:// eintragen.");
        var admins = devices.Where(d => d.Permissions.Contains(Permissions.Admin)).ToList();
        add("sec-admin", "Sicherheit: Geräte mit Admin-Recht", admins.Count == 0 ? "ok" : "warn",
            admins.Count == 0 ? "Kein gekoppeltes Gerät hat Admin-Rechte." : $"{names(admins)} – darf Einstellungen, Geräte, Protokoll und Backups verwalten.",
            admins.Count == 0 ? null : "Nur behalten, wenn nötig: am PC unter Geräte → Berechtigungen „Admin“ entfernen.");
        var cutoff = DateTime.UtcNow.AddDays(-60);
        var stale = devices.Where(d => (d.LastSeenAt ?? d.PairedAt) < cutoff).ToList();
        add("sec-stale", "Sicherheit: Lange nicht genutzte Geräte", stale.Count == 0 ? "ok" : "warn",
            stale.Count == 0 ? "Alle gekoppelten Geräte waren in den letzten 60 Tagen verbunden." : $"{names(stale)} – seit über 60 Tagen nicht verbunden.",
            stale.Count == 0 ? null : "Unter Geräte widerrufen, wenn das Gerät nicht mehr genutzt wird (verloren, verkauft, ersetzt).");
        var src = set.UpdateManifestUrl;
        if (string.IsNullOrEmpty(src)) add("sec-updates", "Sicherheit: Updates", "info", "Update-Prüfung ist ausgeschaltet.", "Einstellungen → Updates: Quelle eintragen, um Sicherheitskorrekturen zu bekommen.");
        else add("sec-updates", "Sicherheit: Updates", src == new Settings().UpdateManifestUrl ? "ok" : "warn",
            src == new Settings().UpdateManifestUrl ? "Offizielle Quelle, Download wird per SHA-256 geprüft und nie automatisch installiert." : $"Eigene Quelle: {src}",
            src == new Settings().UpdateManifestUrl ? null : "Nur Quellen eintragen, denen du vertraust – sie bestimmen, welche EXE installiert werden kann.");
    }
}
