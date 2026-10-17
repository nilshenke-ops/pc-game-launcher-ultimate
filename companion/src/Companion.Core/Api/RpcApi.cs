using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
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
            return new { code, expiresAt = expires, urls = PairingUrls(s, code) };
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
                activeProfile = active == null ? null : new { active.Id, active.Name, active.Color, active.Icon, reason = prof.ActiveReason, since = prof.ActiveSince, active.DashboardLayoutId },
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
        rpc.Register("library.detect", ctx => new { items = s.Library.Detect(), detectors = s.Platform.Detectors.Select(d => d.Name).Append("Startmenü / Microsoft Store / Xbox") });
        rpc.Register("library.addDetected", ctx => s.Library.AddDetected(ctx.Str("key", 400), ParseKind(ctx.OptStr("kind", 20))));
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
            return s.Profiles.Save(ctx.Params.GetProperty("profile").Deserialize<Profile>(Json.Options) ?? throw new RpcException("invalid-params", "Profil fehlt."));
        });
        rpc.Register("profiles.remove", ctx => { s.Profiles.Remove(ctx.Str("id", 64)); return true; });
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
        rpc.Register("audio.testTone", ctx => s.Audio.TestTone(ctx.Str("target", 20, false)) is { } err ? throw new RpcException("audio", err) : true);
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
            return new { settings = set, relaySecretSet = hasSecret, dataDir = ctx.Session.IsLocalAdmin ? s.Paths.DataDir : null, restartRequired = set.Port != s.Web.Port || set.LanAccess != s.Web.LanAccess, webStartError = s.Web.StartError };
        });
        rpc.Register("settings.save", ctx => s.Settings.SaveGeneral(ctx.Bind<SettingsService.GeneralUpdate>()));
        rpc.Register("settings.saveSecurity", ctx =>
        {
            var u = ctx.Bind<SettingsService.SecurityUpdate>();
            // Changing how the PC is reachable is only allowed from the PC itself.
            if (!ctx.Session.IsLocalAdmin && (u.LanAccess != null || u.Port != null || u.RelayEnabled != null || u.RelayUrl != null || u.RelaySecret != null || u.RelayCompanionId != null))
                throw new RpcException("forbidden", "Verbindungseinstellungen können nur direkt am PC geändert werden.");
            var r = s.Settings.SaveSecurity(u, s.Platform.Secrets);
            r.RelaySecretProtected = null;
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
            return s.Backup.Restore(ctx.Str("uploadId", 64), parts);
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

    static List<string> PairingUrls(CompanionServices s, string code)
    {
        var bases = new List<string>();
        if (s.Settings.Get().PublicUrl is { } pub) bases.Add(pub);
        bases.AddRange(s.Web.LanUrls());
        return bases.Distinct().Select(b => $"{b}/#/pair?code={code}").ToList();
    }

    static object Diagnostics(CompanionServices s, RpcSession session)
    {
        var checks = new List<object>();
        void Add(string area, string label, string status, string detail) => checks.Add(new { area, label, status, detail });
        Add("companion", "Companion", "ok", $"Version {UpdateService.CurrentVersion} auf {s.Platform.Name}, läuft seit {s.StartedAt:u}");
        Add("web", "Webserver", s.Web.StartError == null ? "ok" : "error", s.Web.StartError ?? $"Port {s.Web.Port}, {(s.Web.LanAccess ? "im WLAN erreichbar" : "nur lokal")}, Web-App: {s.Web.Assets.Source}");
        Add("web", "Web-App-Dateien", s.Web.Assets.Available ? "ok" : "error", s.Web.Assets.Available ? "Vorhanden" : "Fehlen – Web-App wurde nicht mitgebaut.");
        var relay = s.Relay.Status();
        Add("relay", "Relay", s.Relay.State switch { "connected" => "ok", "disabled" => "info", _ => "warn" }, JsonSerializer.Serialize(relay, Json.Options));
        Add("devices", "Gekoppelte Geräte", "info", $"{s.Devices.List().Count} gekoppelt, {s.Rpc.Sessions.Count(x => x.Authenticated)} verbunden");
        Add("audio", "Audio", s.Audio.Engine.Supported ? "ok" : "unsupported", s.Audio.Engine.Supported ? $"{s.Audio.Devices().Count} Geräte" : s.Audio.Engine.UnsupportedReason ?? "");
        var hk = s.Hotkeys.List();
        Add("hotkeys", "Hotkeys", !s.Platform.Hotkeys.Supported ? "unsupported" : "ok", s.Platform.Hotkeys.Supported ? $"{hk.Count} konfiguriert" : "Nur im Windows-Companion");
        Add("autostart", "Autostart", s.Platform.Autostart.Supported ? "ok" : "unsupported", s.Platform.Autostart.Supported ? (s.Platform.Autostart.IsEnabled() ? "Aktiv" : "Aus") : "Nicht unterstützt");
        Add("sessions", "Spielerkennung", "ok", $"Prüft alle {s.Settings.Get().ProcessScanSeconds} s, {s.Sessions.Running().Count} Spiel(e) laufen");
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
}
