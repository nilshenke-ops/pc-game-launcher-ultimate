using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

// ============================================================ Settings

public sealed class SettingsService
{
    readonly JsonStore<Settings> _store;
    readonly IHub _hub;
    public event Action<Settings>? Saved;

    public SettingsService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<Settings>(paths.File("settings.json"));
        _hub = hub;
    }

    public Settings Get() => _store.Snapshot();

    public sealed class GeneralUpdate
    {
        public string? PcName { get; set; }
        public string? Language { get; set; }
        public bool? HistoryEnabled { get; set; }
        public bool? StartMinimized { get; set; }
        public bool? KeepRunningInTray { get; set; }
        public int? ProcessScanSeconds { get; set; }
        public bool? NotifyInfo { get; set; }
        public bool? QuietWhileGaming { get; set; }
        public List<string>? MutedNotificationKeys { get; set; }
        public bool? SteamCoversFromCdn { get; set; }
        public bool? GamePassEnabled { get; set; }
        public string? GamePassMarket { get; set; }
        public bool? CoverSearch { get; set; }
        public bool? SteamEnabled { get; set; }
        public bool? EpicEnabled { get; set; }
        public bool? EaEnabled { get; set; }
    }

    public Settings SaveGeneral(GeneralUpdate u)
    {
        if (u.Language is { } l && l is not ("de" or "en")) throw new RpcException("invalid-params", "Sprache muss de oder en sein.");
        if (u.GamePassMarket is { } gm && !System.Text.RegularExpressions.Regex.IsMatch(gm, "^[A-Z]{2}$")) throw new RpcException("invalid-params", "Markt muss ein Ländercode aus zwei Großbuchstaben sein (z. B. DE).");
        if (u.ProcessScanSeconds is { } p && (p < 2 || p > 60)) throw new RpcException("invalid-params", "Prüfintervall muss zwischen 2 und 60 Sekunden liegen.");
        var s = _store.Update(s =>
        {
            if (u.PcName != null) s.PcName = DeviceStore.Sanitize(u.PcName, 40, s.PcName);
            if (u.Language != null) s.Language = u.Language;
            if (u.HistoryEnabled != null) s.HistoryEnabled = u.HistoryEnabled.Value;
            if (u.StartMinimized != null) s.StartMinimized = u.StartMinimized.Value;
            if (u.KeepRunningInTray != null) s.KeepRunningInTray = u.KeepRunningInTray.Value;
            if (u.ProcessScanSeconds != null) s.ProcessScanSeconds = u.ProcessScanSeconds.Value;
            if (u.NotifyInfo != null) s.NotifyInfo = u.NotifyInfo.Value;
            if (u.QuietWhileGaming != null) s.QuietWhileGaming = u.QuietWhileGaming.Value;
            if (u.MutedNotificationKeys != null) s.MutedNotificationKeys = u.MutedNotificationKeys.Take(50).ToList();
            if (u.SteamCoversFromCdn != null) s.SteamCoversFromCdn = u.SteamCoversFromCdn.Value;
            if (u.GamePassEnabled != null) s.GamePassEnabled = u.GamePassEnabled.Value;
            if (u.GamePassMarket != null) s.GamePassMarket = u.GamePassMarket;
            if (u.CoverSearch != null) s.CoverSearch = u.CoverSearch.Value;
            if (u.SteamEnabled != null) s.SteamEnabled = u.SteamEnabled.Value;
            if (u.EpicEnabled != null) s.EpicEnabled = u.EpicEnabled.Value;
            if (u.EaEnabled != null) s.EaEnabled = u.EaEnabled.Value;
            return Json.Deserialize<Settings>(Json.Serialize(s))!;
        });
        _hub.Changed("settings");
        Saved?.Invoke(s);
        return s;
    }

    /// <summary>Stores the protected Steam Web API key (or removes it). keep = leave the current key.</summary>
    public void SetSteamKey(string? protectedKey, bool keep)
    {
        if (keep) return;
        _store.Update(s => s.SteamApiKeyProtected = protectedKey);
        _hub.Changed("settings");
    }

    public sealed class SecurityUpdate
    {
        public bool? LanAccess { get; set; }
        public int? Port { get; set; }
        public string? PublicUrl { get; set; }
        public string? WebAppUrl { get; set; }
        public bool? RelayEnabled { get; set; }
        public string? RelayUrl { get; set; }
        public string? RelayCompanionId { get; set; }
        public string? RelaySecret { get; set; }
        public string? UpdateManifestUrl { get; set; }
    }

    public Settings SaveSecurity(SecurityUpdate u, ISecretProtector secrets)
    {
        if (u.Port is { } port && (port < 1024 || port > 65535)) throw new RpcException("invalid-params", "Port muss zwischen 1024 und 65535 liegen.");
        if (u.PublicUrl is { Length: > 0 } pu && AddressRules.PublicUrlProblem(pu) is { } puProblem)
            throw new RpcException("invalid-params", puProblem);
        if (u.WebAppUrl is { Length: > 0 } wa && !(Uri.TryCreate(wa, UriKind.Absolute, out var wau) && wau.Scheme is "https" or "http"))
            throw new RpcException("invalid-params", "Adresse der Web-App muss mit https:// beginnen.");
        if (u.RelayUrl is { Length: > 0 } ru && AddressRules.RelayProblem(ru, u.Port ?? Get().Port) is { } ruProblem)
            throw new RpcException("invalid-params", ruProblem);
        if (u.UpdateManifestUrl is { Length: > 0 } um && !(Uri.TryCreate(um, UriKind.Absolute, out var umu) && umu.Scheme == "https"))
            throw new RpcException("invalid-params", "Update-Quelle muss eine https-Adresse sein.");
        if (u.RelayCompanionId is { Length: > 0 } rid && !System.Text.RegularExpressions.Regex.IsMatch(rid, "^[a-z0-9-]{3,40}$"))
            throw new RpcException("invalid-params", "Companion-ID: 3–40 Zeichen, nur a–z, 0–9 und Bindestrich.");
        if (u.RelaySecret is { Length: > 0 and < 24 }) throw new RpcException("invalid-params", "Relay-Schlüssel muss mindestens 24 Zeichen lang sein.");
        var s = _store.Update(s =>
        {
            if (u.LanAccess != null) s.LanAccess = u.LanAccess.Value;
            if (u.Port != null) s.Port = u.Port.Value;
            if (u.PublicUrl != null) s.PublicUrl = u.PublicUrl == "" ? null : u.PublicUrl.TrimEnd('/');
            if (u.WebAppUrl != null) s.WebAppUrl = u.WebAppUrl == "" ? null : u.WebAppUrl.Trim().TrimEnd('/');
            if (u.RelayEnabled != null) s.RelayEnabled = u.RelayEnabled.Value;
            if (u.RelayUrl != null) s.RelayUrl = u.RelayUrl == "" ? null : u.RelayUrl;
            if (u.RelayCompanionId != null) s.RelayCompanionId = u.RelayCompanionId == "" ? null : u.RelayCompanionId;
            if (u.RelaySecret != null) s.RelaySecretProtected = u.RelaySecret == "" ? null : secrets.Protect(u.RelaySecret);
            if (u.UpdateManifestUrl != null) s.UpdateManifestUrl = u.UpdateManifestUrl == "" ? null : u.UpdateManifestUrl;
            return Json.Deserialize<Settings>(Json.Serialize(s))!;
        });
        _hub.Changed("settings");
        Saved?.Invoke(s);
        return s;
    }

    internal void Import(Settings s, Settings keepSecurityFrom)
    {
        // Security relevant values (relay secret, network exposure) are never taken from a backup file.
        s.RelaySecretProtected = keepSecurityFrom.RelaySecretProtected;
        s.LanAccess = keepSecurityFrom.LanAccess;
        s.Port = keepSecurityFrom.Port;
        s.PublicUrl = keepSecurityFrom.PublicUrl;   // allowed web origins are never changed by a backup file
        s.WebAppUrl = keepSecurityFrom.WebAppUrl;
        s.SteamApiKeyProtected = keepSecurityFrom.SteamApiKeyProtected; // secrets never come from a backup file
        _store.Replace(s);
        _hub.Changed("settings");
    }
}

// ============================================================ Notifications

public sealed class NotificationCenter
{
    readonly IHub _hub;
    readonly SettingsService _settings;
    readonly List<Notification> _items = new();
    readonly object _lock = new();
    public Func<bool> IsGaming { get; set; } = () => false;
    public Func<bool> ProfileQuiet { get; set; } = () => false;
    public Action<Notification>? OnDesktop { get; set; }

    public NotificationCenter(IHub hub, SettingsService settings) { _hub = hub; _settings = settings; }

    /// <summary>Adds a notification. Repeats of the same key within 10 minutes are merged into one entry with a counter.</summary>
    public Notification? Push(string key, Severity severity, string title, string? message = null, string? link = null)
    {
        var s = _settings.Get();
        if (s.MutedNotificationKeys.Contains(key) && severity < Severity.Error) return null;
        if (severity <= Severity.Success && (!s.NotifyInfo || ProfileQuiet() || (s.QuietWhileGaming && IsGaming()))) return null;
        Notification n;
        lock (_lock)
        {
            var existing = _items.FirstOrDefault(x => x.Key == key && !x.Dismissed && DateTime.UtcNow - x.At < TimeSpan.FromMinutes(10));
            if (existing != null)
            {
                existing.Count++;
                existing.At = DateTime.UtcNow;
                existing.Message = message;
                n = existing;
            }
            else
            {
                n = new Notification { Id = Ids.New("ntf"), Key = key, Severity = severity, Title = title, Message = message, At = DateTime.UtcNow, Link = link };
                _items.Insert(0, n);
                if (_items.Count > 200) _items.RemoveAt(_items.Count - 1);
            }
        }
        _hub.Broadcast("notification", n);
        if (severity >= Severity.Warning) OnDesktop?.Invoke(n);
        return n;
    }

    public List<Notification> List() { lock (_lock) return _items.Where(n => !n.Dismissed).OrderByDescending(n => n.Severity).ThenByDescending(n => n.At).ToList(); }
    public void Dismiss(string id) { lock (_lock) foreach (var n in _items.Where(n => n.Id == id)) n.Dismissed = true; _hub.Changed("notifications"); }
    public void DismissAll() { lock (_lock) foreach (var n in _items) n.Dismissed = true; _hub.Changed("notifications"); }
}

// ============================================================ History & running games

public sealed class HistoryService
{
    readonly JsonStore<HistoryFile> _store;
    readonly SettingsService _settings;
    readonly IHub _hub;

    public HistoryService(AppPaths paths, SettingsService settings, IHub hub)
    {
        _store = new JsonStore<HistoryFile>(paths.File("history.json"));
        _settings = settings;
        _hub = hub;
    }

    bool Enabled => _settings.Get().HistoryEnabled;

    public void RecordLaunch(LibraryItem item, LaunchResult r, string by)
    {
        if (!Enabled) return;
        _store.Update(f =>
        {
            f.Launches.Insert(0, new LaunchRecord { ItemId = item.Id, Name = item.Name, At = DateTime.UtcNow, Ok = r.Ok, Error = r.Ok ? null : r.Message, By = by });
            if (f.Launches.Count > 500) f.Launches.RemoveRange(500, f.Launches.Count - 500);
        });
        _hub.Changed("history");
    }

    public void SessionStarted(LibraryItem item, DateTime at)
    {
        if (!Enabled) return;
        _store.Update(f =>
        {
            f.Sessions.Insert(0, new GameSession { ItemId = item.Id, Name = item.Name, StartedAt = at });
            if (f.Sessions.Count > 1000) f.Sessions.RemoveRange(1000, f.Sessions.Count - 1000);
        });
        _hub.Changed("history");
    }

    public void SessionEnded(string itemId, DateTime at)
    {
        if (!Enabled) return;
        _store.Update(f =>
        {
            var s = f.Sessions.FirstOrDefault(x => x.ItemId == itemId && x.EndedAt == null);
            if (s != null) s.EndedAt = at;
        });
        _hub.Changed("history");
    }

    /// <summary>Closes sessions left open by a crash or shutdown so durations stay plausible.</summary>
    public void CloseDanglingSessions()
    {
        _store.Update(f => { foreach (var s in f.Sessions.Where(s => s.EndedAt == null)) s.EndedAt = s.StartedAt; });
    }

    public object Get()
    {
        var f = _store.Snapshot();
        var stats = f.Sessions.GroupBy(s => s.ItemId).Select(g => new
        {
            itemId = g.Key,
            name = g.First().Name,
            sessions = g.Count(),
            totalMinutes = Math.Round(g.Sum(s => s.Minutes), 1),
            lastPlayed = g.Max(s => s.StartedAt),
        }).OrderByDescending(x => x.totalMinutes).ToList();
        var launchStats = f.Launches.GroupBy(l => l.ItemId).Select(g => new { itemId = g.Key, name = g.First().Name, launches = g.Count(), failures = g.Count(l => !l.Ok) })
            .OrderByDescending(x => x.launches).ToList();
        return new
        {
            enabled = Enabled,
            sessions = f.Sessions.Take(100).Select(s => new { s.ItemId, s.Name, s.StartedAt, s.EndedAt, minutes = Math.Round(s.Minutes, 1) }),
            launches = f.Launches.Take(100),
            stats,
            launchStats,
            failures = f.Launches.Where(l => !l.Ok).Take(20),
        };
    }

    public void Clear() { _store.Replace(new HistoryFile()); _hub.Changed("history"); }
    internal HistoryFile Export() => _store.Snapshot();
    internal void Import(HistoryFile f) { _store.Replace(f); _hub.Changed("history"); }
}

/// <summary>
/// Detects running games by process name or install directory. Uses a single process snapshot every few
/// seconds (default 5 s) and only when at least one item has a detection rule.
/// </summary>
public sealed class SessionTracker : IDisposable
{
    readonly LibraryService _library;
    readonly IProcessSource _processes;
    readonly SettingsService _settings;
    readonly Dictionary<string, DateTime> _running = new();
    readonly object _lock = new();
    Timer? _timer;
    public event Action<LibraryItem, DateTime>? Started;
    public event Action<LibraryItem, DateTime>? Stopped;

    public SessionTracker(LibraryService library, IProcessSource processes, SettingsService settings)
    {
        _library = library; _processes = processes; _settings = settings;
    }

    public void Start()
    {
        var period = TimeSpan.FromSeconds(Math.Clamp(_settings.Get().ProcessScanSeconds, 2, 60));
        _timer = new Timer(_ => Tick(), null, TimeSpan.FromSeconds(1), period);
    }

    public IReadOnlyList<(string itemId, DateTime since)> Running()
    {
        lock (_lock) return _running.Select(kv => (kv.Key, kv.Value)).ToList();
    }

    public bool AnyGameRunning()
    {
        lock (_lock) return _running.Count > 0;
    }

    public void Tick()
    {
        var items = _library.List().Where(i => i.ProcessNames.Count > 0 || i.InstallDir != null).ToList();
        if (items.Count == 0 && _running.Count == 0) return;
        IReadOnlyList<ProcessInfo> snapshot;
        try { snapshot = _processes.Snapshot(); } catch (Exception ex) { Log.Warn("sessions", ex.Message); return; }
        var names = snapshot.Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var paths = snapshot.Where(p => p.Path != null).Select(p => p.Path!).ToList();
        var now = DateTime.UtcNow;
        var started = new List<LibraryItem>();
        var stopped = new List<LibraryItem>();
        lock (_lock)
        {
            foreach (var item in items)
            {
                var isRunning = IsRunning(item, names, paths);
                var was = _running.ContainsKey(item.Id);
                if (isRunning && !was) { _running[item.Id] = now; started.Add(item); }
                else if (!isRunning && was) { _running.Remove(item.Id); stopped.Add(item); }
            }
            foreach (var id in _running.Keys.Where(id => items.All(i => i.Id != id)).ToList()) _running.Remove(id);
        }
        foreach (var i in started) Started?.Invoke(i, now);
        foreach (var i in stopped) Stopped?.Invoke(i, now);
    }

    public static bool IsRunning(LibraryItem item, HashSet<string> processNames, List<string> processPaths)
    {
        if (item.ProcessNames.Any(processNames.Contains)) return true;
        if (item.InstallDir is { Length: > 3 } dir)
        {
            var prefix = dir.TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
            var cmp = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            return processPaths.Any(p => p.StartsWith(prefix, cmp));
        }
        return false;
    }

    public void Dispose() => _timer?.Dispose();
}

// ============================================================ Profiles

public sealed class ProfileService
{
    readonly JsonStore<ProfilesFile> _store;
    readonly IHub _hub;
    public event Action<Profile, string>? Activated;
    /// <summary>Applies audio/soundboard parts of a profile. Set by the composition root.</summary>
    public Action<Profile, ProfileAudioPlan>? Apply { get; set; }
    /// <summary>Current output device, soundboard volume and active collection (to remember the user's own values).</summary>
    public Func<(string? output, int volume, string? collection)>? CurrentAudio { get; set; }
    public Func<string, string, LaunchResult>? LaunchItem { get; set; }

    public ProfileService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<ProfilesFile>(paths.File("profiles.json"));
        _hub = hub;
        if (_store.Get(f => f.Profiles.Count == 0)) SeedDefaults();
    }

    void SeedDefaults()
    {
        _store.Update(f =>
        {
            f.Profiles.Add(new Profile { Id = "prof_general", Name = "Allgemein", Icon = "monitor", Color = "#22d3ee" });
            f.Profiles.Add(new Profile { Id = "prof_competitive", Name = "Competitive", Icon = "crosshair", Color = "#f43f5e", QuietNotifications = true });
            f.Profiles.Add(new Profile { Id = "prof_streaming", Name = "Streaming", Icon = "radio", Color = "#a78bfa" });
            f.Profiles.Add(new Profile { Id = "prof_quiet", Name = "Ruhemodus", Icon = "moon", Color = "#34d399", QuietNotifications = true, SoundboardVolume = 30 });
            f.ActiveProfileId = "prof_general";
            f.ActiveReason = "Standard";
            f.ActiveSince = DateTime.UtcNow;
        });
    }

    public ProfilesFile Get() => _store.Snapshot();
    public Profile? Active() => _store.Get(f => f.Profiles.FirstOrDefault(p => p.Id == f.ActiveProfileId));
    public Profile? Find(string id) => _store.Get(f => f.Profiles.FirstOrDefault(p => p.Id == id));

    public Profile Save(Profile p)
    {
        p.Name = DeviceStore.Sanitize(p.Name, 40, "Profil");
        if (!System.Text.RegularExpressions.Regex.IsMatch(p.Color ?? "", "^#[0-9a-fA-F]{6}$")) p.Color = "#22d3ee";
        if (p.SoundboardVolume is { } v) p.SoundboardVolume = Math.Clamp(v, 0, 100);
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(p.Id)) p.Id = Ids.New("prof");
            var i = f.Profiles.FindIndex(x => x.Id == p.Id);
            if (i >= 0) f.Profiles[i] = p; else f.Profiles.Add(p);
            return p;
        });
        _hub.Changed("profiles");
        return r;
    }

    public Profile Copy(string id)
    {
        var src = Find(id) ?? throw new RpcException("not-found", "Profil nicht gefunden.");
        var copy = Json.Deserialize<Profile>(Json.Serialize(src))!;
        copy.Id = "";
        copy.Name = src.Name + " (Kopie)";
        return Save(copy);
    }

    public void Remove(string id)
    {
        _store.Update(f =>
        {
            if (f.Profiles.Count <= 1) throw new RpcException("invalid", "Das letzte Profil kann nicht gelöscht werden.");
            f.Profiles.RemoveAll(p => p.Id == id);
            if (f.ActiveProfileId == id) { f.ActiveProfileId = f.Profiles[0].Id; f.ActiveReason = "Aktives Profil wurde gelöscht"; }
            if (f.PreviousProfileId == id) f.PreviousProfileId = null;
        });
        _hub.Changed("profiles");
    }

    public void SetAutoSwitch(bool on) { _store.Update(f => f.AutoSwitch = on); _hub.Changed("profiles"); }

    public Profile Activate(string id, string reason, bool rememberPrevious = true)
    {
        var current = CurrentAudio?.Invoke();
        var (p, plan) = _store.Update(f =>
        {
            var p = f.Profiles.FirstOrDefault(x => x.Id == id) ?? throw new RpcException("not-found", "Profil nicht gefunden.");
            var prev = f.Profiles.FirstOrDefault(x => x.Id == f.ActiveProfileId);
            if (rememberPrevious && f.ActiveProfileId != id) f.PreviousProfileId = f.ActiveProfileId;
            f.ActiveProfileId = id;
            f.ActiveReason = reason;
            f.ActiveSince = DateTime.UtcNow;
            return (p, Plan(f.Baseline, p, prev, current));
        });
        try { Apply?.Invoke(p, plan); } catch (Exception ex) { Log.Warn("profiles", $"Profil teilweise angewendet: {ex.Message}"); }
        foreach (var progId in p.LaunchProgramIds) LaunchItem?.Invoke(progId, $"Profil {p.Name}");
        Log.Info("profiles", $"Profil aktiviert: {p.Name} ({reason})");
        _hub.Broadcast("profile.active", new { id = p.Id, name = p.Name, reason });
        _hub.Changed("profiles");
        Activated?.Invoke(p, reason);
        return p;
    }

    /// <summary>
    /// A value set by the profile wins. A value the profile leaves open falls back to the user's own value from before the
    /// previous profile overrode it – so "Ruhemodus (30 %) → Allgemein" brings the volume back instead of keeping 30 %.
    /// </summary>
    internal static ProfileAudioPlan Plan(ProfileBaseline b, Profile p, Profile? prev, (string? output, int volume, string? collection)? current)
    {
        // Remember the user's own value the first time a profile overrides it.
        if (current is { } c)
        {
            if (p.AudioOutputDeviceId != null && prev?.AudioOutputDeviceId == null) { b.HasOutput = true; b.OutputDeviceId = c.output; }
            if (p.SoundboardVolume != null && prev?.SoundboardVolume == null) b.SoundboardVolume = c.volume;
            if (p.SoundCollectionId != null && prev?.SoundCollectionId == null) { b.HasCollection = true; b.SoundCollectionId = c.collection; }
        }
        var restoreOutput = p.AudioOutputDeviceId == null && prev?.AudioOutputDeviceId != null && b.HasOutput;
        var restoreVolume = p.SoundboardVolume == null && prev?.SoundboardVolume != null && b.SoundboardVolume != null;
        var restoreCollection = p.SoundCollectionId == null && prev?.SoundCollectionId != null && b.HasCollection;
        return new ProfileAudioPlan(
            p.AudioOutputDeviceId != null || restoreOutput, p.AudioOutputDeviceId ?? (restoreOutput ? b.OutputDeviceId : null),
            p.SoundboardVolume ?? (restoreVolume ? b.SoundboardVolume : null),
            p.SoundCollectionId != null || restoreCollection, p.SoundCollectionId ?? (restoreCollection ? b.SoundCollectionId : null));
    }

    public Profile? Revert(string reason)
    {
        var prev = _store.Get(f => f.PreviousProfileId);
        return prev == null ? null : Activate(prev, reason, rememberPrevious: false);
    }

    internal void Import(ProfilesFile f) { _store.Replace(f); _hub.Changed("profiles"); }
}

// ============================================================ Action execution (shared by quick actions, automations, hotkeys)

public sealed class ActionRunner
{
    public Func<string, string, LaunchResult>? LaunchItem { get; set; }
    public Func<string, string, Profile>? ActivateProfile { get; set; }
    public Func<string, Profile?>? RevertProfile { get; set; }
    public Func<string, string?>? PlaySound { get; set; }
    public Action? StopAllSounds { get; set; }
    public Action<string?>? SetCollection { get; set; }
    public Action<string?>? SetAudioOutput { get; set; }
    public Func<Task<object>>? RunDiagnostics { get; set; }
    public Action<string>? Notify { get; set; }

    /// <summary>Executes steps in order. Returns a human readable result per step.</summary>
    public async Task<List<string>> RunAsync(IEnumerable<ActionStep> steps, string by)
    {
        var results = new List<string>();
        foreach (var s in steps.Take(20))
        {
            try
            {
                switch (s.Type)
                {
                    case StepType.LaunchItem:
                        var r = LaunchItem!(s.Ref ?? "", by);
                        results.Add(r.Ok ? "Gestartet" : "Fehler: " + r.Message);
                        break;
                    case StepType.ActivateProfile:
                        results.Add("Profil aktiv: " + ActivateProfile!(s.Ref ?? "", by).Name);
                        break;
                    case StepType.RevertProfile:
                        var prev = RevertProfile!(by);
                        results.Add(prev == null ? "Kein vorheriges Profil" : "Zurück zu " + prev.Name);
                        break;
                    case StepType.PlaySound:
                        results.Add(PlaySound!(s.Ref ?? "") is { } err ? "Fehler: " + err : "Sound gestartet");
                        break;
                    case StepType.StopAllSounds:
                        StopAllSounds!(); results.Add("Sounds gestoppt");
                        break;
                    case StepType.SetCollection:
                        SetCollection!(s.Ref); results.Add("Sammlung gewählt");
                        break;
                    case StepType.SetAudioOutput:
                        SetAudioOutput!(s.Ref); results.Add("Audioausgabe gesetzt");
                        break;
                    case StepType.RunDiagnostics:
                        await RunDiagnostics!(); results.Add("Diagnose ausgeführt");
                        break;
                    case StepType.Notify:
                        Notify!(DeviceStore.Sanitize(s.Ref, 120, "Hinweis")); results.Add("Hinweis angezeigt");
                        break;
                }
            }
            catch (RpcException ex) { results.Add("Fehler: " + ex.Message); }
            catch (Exception ex) { results.Add("Fehler: " + ex.Message); }
        }
        return results;
    }
}

// ============================================================ Quick actions

public sealed class QuickActionService
{
    readonly JsonStore<QuickActionsFile> _store;
    readonly IHub _hub;

    public QuickActionService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<QuickActionsFile>(paths.File("quickactions.json"));
        _hub = hub;
    }

    public List<QuickAction> List() => _store.Snapshot().Actions;
    public QuickAction? Get(string id) => List().FirstOrDefault(a => a.Id == id);

    public QuickAction Save(QuickAction a)
    {
        a.Name = DeviceStore.Sanitize(a.Name, 40, "Aktion");
        a.Icon = DeviceStore.Sanitize(a.Icon, 30, "zap");
        a.Category = a.Category == null ? null : DeviceStore.Sanitize(a.Category, 30, "");
        if (a.Steps.Count == 0) throw new RpcException("invalid-params", "Eine Quick Action braucht mindestens einen Schritt.");
        if (a.Steps.Count > 20) throw new RpcException("invalid-params", "Maximal 20 Schritte.");
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(a.Id)) a.Id = Ids.New("qa");
            var i = f.Actions.FindIndex(x => x.Id == a.Id);
            if (i >= 0) f.Actions[i] = a; else f.Actions.Add(a);
            return a;
        });
        _hub.Changed("quick");
        return r;
    }

    public void Remove(string id) { _store.Update(f => f.Actions.RemoveAll(a => a.Id == id)); _hub.Changed("quick"); }

    public void Reorder(List<string> ids)
    {
        _store.Update(f => f.Actions = f.Actions.OrderBy(a => { var i = ids.IndexOf(a.Id); return i < 0 ? int.MaxValue : i; }).ToList());
        _hub.Changed("quick");
    }

    internal QuickActionsFile Export() => _store.Snapshot();
    internal void Import(QuickActionsFile f) { _store.Replace(f); _hub.Changed("quick"); }
}

// ============================================================ Automations

/// <summary>
/// Rule engine. Protection against loops: actions run with a nesting depth limit of 1 (events caused by an
/// automation do not trigger further automations), each rule has a 3-second cooldown and at most 20 runs per minute.
/// </summary>
public sealed class AutomationEngine
{
    readonly JsonStore<AutomationsFile> _store;
    readonly IHub _hub;
    readonly ActionRunner _runner;
    readonly RateLimiter _perRule = new(20, TimeSpan.FromMinutes(1));
    readonly Dictionary<string, DateTime> _lastRun = new();
    readonly AsyncLocal<int> _depth = new();
    static readonly HashSet<StepType> AllowedSteps = Enum.GetValues<StepType>().ToHashSet();

    public AutomationEngine(AppPaths paths, IHub hub, ActionRunner runner)
    {
        _store = new JsonStore<AutomationsFile>(paths.File("automations.json"));
        _hub = hub;
        _runner = runner;
        if (!File.Exists(paths.File("automations.json"))) SeedDefaults();
    }

    void SeedDefaults()
    {
        _store.Update(f =>
        {
            f.Rules.Add(new AutomationRule
            {
                Id = Ids.New("rule"), Name = "Warnung bei fehlendem Audiogerät", Trigger = TriggerType.AudioDeviceMissing,
                Actions = { new ActionStep { Type = StepType.Notify, Ref = "Ein im Profil gewähltes Audiogerät fehlt." } },
            });
        });
    }

    public List<AutomationRule> List() => _store.Snapshot().Rules;

    public AutomationRule Save(AutomationRule r)
    {
        r.Name = DeviceStore.Sanitize(r.Name, 60, "Regel");
        if (r.Actions.Count == 0) throw new RpcException("invalid-params", "Eine Regel braucht mindestens eine Aktion.");
        if (r.Actions.Count > 10) throw new RpcException("invalid-params", "Maximal 10 Aktionen pro Regel.");
        if (r.Actions.Any(a => !AllowedSteps.Contains(a.Type))) throw new RpcException("invalid-params", "Unbekannte Aktion.");
        var conflict = Conflict(r);
        if (conflict != null) throw new RpcException("conflict", conflict);
        var res = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(r.Id)) r.Id = Ids.New("rule");
            var i = f.Rules.FindIndex(x => x.Id == r.Id);
            if (i >= 0) { r.LastRunAt = f.Rules[i].LastRunAt; r.LastResult = f.Rules[i].LastResult; r.RunCount = f.Rules[i].RunCount; f.Rules[i] = r; }
            else f.Rules.Add(r);
            return r;
        });
        _hub.Changed("automations");
        return res;
    }

    /// <summary>Detects contradictory rules, e.g. a profile activation that triggers a rule activating another profile.</summary>
    public string? Conflict(AutomationRule r)
    {
        if (r.Trigger == TriggerType.ProfileActivated && r.Actions.Any(a => a.Type is StepType.ActivateProfile or StepType.RevertProfile))
            return "Eine Regel „Profil aktiviert“ darf selbst kein Profil wechseln (Endlosschleife).";
        var others = List().Where(o => o.Enabled && o.Id != r.Id && o.Trigger == r.Trigger && (o.TriggerRef ?? "") == (r.TriggerRef ?? "")).ToList();
        var myProfiles = r.Actions.Where(a => a.Type == StepType.ActivateProfile).Select(a => a.Ref).ToHashSet();
        foreach (var o in others)
        {
            var theirs = o.Actions.Where(a => a.Type == StepType.ActivateProfile).Select(a => a.Ref).ToHashSet();
            if (myProfiles.Count > 0 && theirs.Count > 0 && !myProfiles.SetEquals(theirs))
                return $"Widerspruch zu Regel „{o.Name}“: gleicher Auslöser aktiviert ein anderes Profil.";
        }
        return null;
    }

    public AutomationRule Copy(string id)
    {
        var src = List().FirstOrDefault(r => r.Id == id) ?? throw new RpcException("not-found", "Regel nicht gefunden.");
        var c = Json.Deserialize<AutomationRule>(Json.Serialize(src))!;
        c.Id = ""; c.Name += " (Kopie)"; c.Enabled = false; c.LastRunAt = null; c.LastResult = null; c.RunCount = 0;
        return Save(c);
    }

    public void Remove(string id) { _store.Update(f => f.Rules.RemoveAll(r => r.Id == id)); _hub.Changed("automations"); }

    public async Task Fire(TriggerType trigger, string? reference)
    {
        if (_depth.Value > 0) return; // events caused by automations never trigger automations
        foreach (var rule in List().Where(r => r.Enabled && r.Trigger == trigger && (r.TriggerRef == null || r.TriggerRef == reference)))
        {
            lock (_lastRun)
            {
                if (_lastRun.TryGetValue(rule.Id, out var last) && DateTime.UtcNow - last < TimeSpan.FromSeconds(3)) continue;
                _lastRun[rule.Id] = DateTime.UtcNow;
            }
            if (!_perRule.TryHit(rule.Id)) { Log.Warn("automation", $"Regel „{rule.Name}“ gedrosselt (zu häufig ausgelöst)."); continue; }
            await Execute(rule, "Automatisierung");
        }
    }

    public async Task<List<string>> Test(string id)
    {
        var rule = List().FirstOrDefault(r => r.Id == id) ?? throw new RpcException("not-found", "Regel nicht gefunden.");
        return await Execute(rule, "Test");
    }

    async Task<List<string>> Execute(AutomationRule rule, string by)
    {
        _depth.Value++;
        List<string> results;
        try { results = await _runner.RunAsync(rule.Actions, $"{by}: {rule.Name}"); }
        finally { _depth.Value--; }
        var summary = string.Join("; ", results);
        _store.Update(f =>
        {
            var r = f.Rules.FirstOrDefault(x => x.Id == rule.Id);
            if (r != null) { r.LastRunAt = DateTime.UtcNow; r.LastResult = summary; r.RunCount++; }
        });
        Log.Info("automation", $"Regel „{rule.Name}“ ausgeführt: {summary}");
        _hub.Changed("automations");
        return results;
    }

    internal AutomationsFile Export() => _store.Snapshot();
    internal void Import(AutomationsFile f) { _store.Replace(f); _hub.Changed("automations"); }
}

// ============================================================ Hotkeys

public sealed class HotkeyService
{
    static readonly string[] Modifiers = { "Ctrl", "Alt", "Shift", "Win" };
    /// <summary>Combinations reserved by Windows or very commonly used; never registered.</summary>
    static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Shift+Escape", "Ctrl+Escape", "Win+L", "Win+D", "Win+E", "Win+R", "Win+Tab", "Win+G",
        "Win+I", "Win+S", "Win+X", "Win+V", "Alt+Escape", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+A", "Ctrl+S", "Win+PrintScreen", "Alt+Enter",
    };

    readonly JsonStore<HotkeysFile> _store;
    readonly IHotkeyRegistrar _registrar;
    readonly IHub _hub;
    readonly Dictionary<string, HotkeyStatus> _status = new();
    readonly Dictionary<string, int> _nativeIds = new();
    public Func<Hotkey, Task>? OnPressed { get; set; }

    public HotkeyService(AppPaths paths, IHotkeyRegistrar registrar, IHub hub)
    {
        _store = new JsonStore<HotkeysFile>(paths.File("hotkeys.json"));
        _registrar = registrar;
        _hub = hub;
    }

    /// <summary>Normalizes "ctrl + alt + f9" to "Ctrl+Alt+F9". Returns null if invalid.</summary>
    public static string? Normalize(string? keys)
    {
        if (string.IsNullOrWhiteSpace(keys)) return null;
        var parts = keys.Split('+', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var mods = new List<string>();
        string? key = null;
        foreach (var raw in parts)
        {
            var p = raw.ToLowerInvariant() switch { "control" or "strg" or "ctrl" => "Ctrl", "alt" => "Alt", "shift" or "umschalt" => "Shift", "win" or "meta" or "windows" => "Win", _ => null };
            if (p != null) { if (!mods.Contains(p)) mods.Add(p); continue; }
            if (key != null) return null;
            key = NormalizeKey(raw);
            if (key == null) return null;
        }
        if (key == null) return null;
        bool isFKey = key.Length >= 2 && key[0] == 'F' && int.TryParse(key[1..], out var fn) && fn is >= 1 and <= 24;
        if (mods.Count == 0 && !isFKey && !key.StartsWith("Num") && key != "Pause" && key != "ScrollLock") return null; // plain letters would break typing
        var ordered = Modifiers.Where(mods.Contains).ToList();
        ordered.Add(key);
        return string.Join("+", ordered);
    }

    static string? NormalizeKey(string k)
    {
        if (k.Length == 1 && char.IsLetterOrDigit(k[0])) return k.ToUpperInvariant();
        var u = k.ToLowerInvariant();
        if (u.StartsWith('f') && int.TryParse(u[1..], out var f) && f is >= 1 and <= 24) return "F" + f;
        if (u.StartsWith("num") && int.TryParse(u[3..], out var n) && n is >= 0 and <= 9) return "Num" + n;
        return u switch
        {
            "space" or "leertaste" => "Space", "enter" => "Enter", "escape" or "esc" => "Escape", "tab" => "Tab", "delete" or "entf" => "Delete",
            "insert" or "einfg" => "Insert", "home" or "pos1" => "Home", "end" or "ende" => "End", "pageup" => "PageUp", "pagedown" => "PageDown",
            "up" => "Up", "down" => "Down", "left" => "Left", "right" => "Right", "pause" => "Pause", "scrolllock" => "ScrollLock", "printscreen" or "druck" => "PrintScreen",
            "numadd" or "numplus" => "NumAdd", "numsubtract" or "numminus" => "NumSubtract", "nummultiply" => "NumMultiply", "numdivide" => "NumDivide",
            _ => null,
        };
    }

    public List<Hotkey> List() => _store.Snapshot().Hotkeys;

    public object ListWithStatus()
    {
        var list = List();
        lock (_status)
            return new
            {
                supported = _registrar.Supported,
                hotkeys = list.Select(h => new { hotkey = h, status = _status.GetValueOrDefault(h.Id) ?? new HotkeyStatus(h.Id, h.Enabled ? "pending" : "disabled", null) }),
            };
    }

    public string? Conflict(Hotkey h)
    {
        if (Reserved.Contains(h.Keys)) return $"{h.Keys} ist von Windows reserviert oder sehr gebräuchlich und wird nicht überschrieben.";
        var dup = List().FirstOrDefault(o => o.Id != h.Id && o.Enabled && string.Equals(o.Keys, h.Keys, StringComparison.OrdinalIgnoreCase));
        return dup != null ? $"{h.Keys} ist bereits einer anderen Aktion zugewiesen." : null;
    }

    public Hotkey Save(Hotkey h)
    {
        h.Keys = Normalize(h.Keys) ?? throw new RpcException("invalid-params", "Ungültige Tastenkombination. Beispiel: Strg+Alt+F9 (einzelne Buchstaben nur mit Strg/Alt/Shift/Win).");
        if (h.Enabled && Conflict(h) is { } c) throw new RpcException("conflict", c);
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(h.Id)) h.Id = Ids.New("hk");
            var i = f.Hotkeys.FindIndex(x => x.Id == h.Id);
            if (i >= 0) f.Hotkeys[i] = h; else f.Hotkeys.Add(h);
            return h;
        });
        RegisterAll();
        _hub.Changed("hotkeys");
        return r;
    }

    public void Remove(string id) { _store.Update(f => f.Hotkeys.RemoveAll(h => h.Id == id)); RegisterAll(); _hub.Changed("hotkeys"); }

    public void RegisterAll()
    {
        _registrar.UnregisterAll();
        lock (_status)
        {
            _status.Clear();
            _nativeIds.Clear();
            int nextId = 1;
            foreach (var h in List())
            {
                if (!h.Enabled) { _status[h.Id] = new HotkeyStatus(h.Id, "disabled", null); continue; }
                if (Reserved.Contains(h.Keys)) { _status[h.Id] = new HotkeyStatus(h.Id, "error", "Reserviert"); continue; }
                var id = nextId++;
                var captured = h;
                var err = _registrar.Register(id, h.Keys, () => _ = OnPressed?.Invoke(captured));
                _status[h.Id] = err == null ? new HotkeyStatus(h.Id, "active", null) : new HotkeyStatus(h.Id, "error", err);
                if (err != null) Log.Warn("hotkeys", $"{h.Keys}: {err}");
                _nativeIds[h.Id] = id;
            }
        }
    }

    internal HotkeysFile Export() => _store.Snapshot();
    internal void Import(HotkeysFile f) { _store.Replace(f); RegisterAll(); _hub.Changed("hotkeys"); }
}
