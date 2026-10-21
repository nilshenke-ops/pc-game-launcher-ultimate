using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

// ============================================================ Plugin system (API version 1)
//
// A plugin is a ZIP package (".pglplugin") with a manifest "plugin.json" and static files. It can contribute
//   - widgets: own HTML/JS/CSS that the web app runs only inside a sandboxed iframe (no access to the app, its storage,
//     the network or the PC unless a permission is granted; calls go through a small, checked bridge),
//   - actions: sequences of the existing, validated action steps (no own code runs on the PC),
//   - themes: colour sets for the design editor,
//   - settings: typed configuration values (also used to pick a game/sound/profile for actions).
// No plugin code ever runs inside the companion process. Everything a plugin may do is listed as a permission, must
// be granted by the user and can be revoked one by one.

public static class PluginPermissions
{
    public static readonly IReadOnlyDictionary<string, string> All = new Dictionary<string, string>
    {
        ["library.read"] = "Spiele und Programme lesen",
        ["library.launch"] = "Spiele und Programme starten",
        ["history.read"] = "Spielverlauf und Spielzeit lesen",
        ["monitor.read"] = "Live-Leistungswerte des PCs lesen",
        ["sounds.read"] = "Soundboard-Liste lesen",
        ["sounds.play"] = "Sounds abspielen und stoppen",
        ["profiles.read"] = "Gaming-Profile lesen",
        ["profiles.activate"] = "Gaming-Profile wechseln",
        ["audio.output"] = "Audio-Ausgabegerät wechseln",
        ["diagnostics.run"] = "Diagnose ausführen",
        ["notify"] = "Hinweise in der App anzeigen",
        ["network"] = "Internetzugriff (nur https) aus dem Widget",
        ["capture.control"] = "Aufnahme und Replays in OBS steuern",
        ["overlay.show"] = "Overlay im Spiel ein- und ausblenden",
    };

    /// <summary>Permission an action step needs.</summary>
    public static string ForStep(StepType t) => t switch
    {
        StepType.LaunchItem => "library.launch",
        StepType.ActivateProfile or StepType.RevertProfile => "profiles.activate",
        StepType.PlaySound or StepType.StopAllSounds or StepType.SetCollection => "sounds.play",
        StepType.SetAudioOutput => "audio.output",
        StepType.RunDiagnostics => "diagnostics.run",
        StepType.ToggleOverlay => "overlay.show",
        StepType.ObsRecordToggle or StepType.ObsReplaySave or StepType.ObsReplayBufferToggle => "capture.control",
        _ => "notify",
    };
}

public sealed class PluginWidget
{
    public string Id { get; set; } = ""; public string Title { get; set; } = ""; public string Entry { get; set; } = ""; public int Height { get; set; } = 180;
    /// <summary>Also shown in the in-game overlay (Windows companion), not only on the dashboard.</summary>
    public bool Overlay { get; set; }
}
public sealed class PluginAction { public string Id { get; set; } = ""; public string Name { get; set; } = ""; public string Icon { get; set; } = "zap"; public List<ActionStep> Steps { get; set; } = new(); }
public sealed class PluginTheme { public string Id { get; set; } = ""; public string Name { get; set; } = ""; public JsonObject Theme { get; set; } = new(); }
public sealed class PluginSetting
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    /// <summary>text, number, boolean, select, game, program, sound, profile</summary>
    public string Type { get; set; } = "text";
    public JsonNode? Default { get; set; }
    public List<string>? Options { get; set; }
}
public sealed class PluginContributes
{
    public List<PluginWidget> Widgets { get; set; } = new();
    public List<PluginAction> Actions { get; set; } = new();
    public List<PluginTheme> Themes { get; set; } = new();
    public List<PluginSetting> Settings { get; set; } = new();
}
public sealed class PluginChange { public string Version { get; set; } = ""; public string? Date { get; set; } public List<string> Changes { get; set; } = new(); }

public sealed class PluginManifest
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public int ApiVersion { get; set; } = 1;
    public string MinAppVersion { get; set; } = "1.2.0";
    public string Author { get; set; } = "";
    public string Description { get; set; } = "";
    public string Category { get; set; } = "";
    public List<string> Platforms { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public Dictionary<string, string> Dependencies { get; set; } = new();
    public string? Homepage { get; set; }
    public PluginContributes Contributes { get; set; } = new();
    public List<PluginChange> Changelog { get; set; } = new();
}

public sealed class InstalledPlugin
{
    public string Id { get; set; } = "";
    public string Version { get; set; } = "";
    public string Sha256 { get; set; } = "";
    /// <summary>official (signed project catalog), reviewed (listed as reviewed in the signed catalog), unverified (own file).</summary>
    public string Trust { get; set; } = "unverified";
    public string Source { get; set; } = "";
    public bool Enabled { get; set; }
    public List<string> Granted { get; set; } = new();
    public bool Favorite { get; set; }
    public bool AutoUpdate { get; set; }
    public JsonObject Config { get; set; } = new();
    public string? PreviousVersion { get; set; }
    public DateTime InstalledAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? DisabledReason { get; set; }
    public List<PluginLogEntry> Log { get; set; } = new();
}

public sealed class PluginLogEntry { public DateTime At { get; set; } = DateTime.UtcNow; public string Level { get; set; } = "info"; public string Message { get; set; } = ""; }

public sealed class PluginsFile { public List<InstalledPlugin> Plugins { get; set; } = new(); }

public sealed class CatalogEntry
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Version { get; set; } = "";
    public string Description { get; set; } = "";
    public string Author { get; set; } = "";
    public string Category { get; set; } = "";
    public List<string> Platforms { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
    public string MinAppVersion { get; set; } = "1.0.0";
    public string Trust { get; set; } = "official";
    public string Url { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public long Size { get; set; }
    public List<PluginChange> Changelog { get; set; } = new();
}
public sealed class Catalog { public int Version { get; set; } = 1; public List<CatalogEntry> Plugins { get; set; } = new(); }

public sealed partial class PluginService : IDisposable
{
    public const int ApiVersion = 1;
    public const long MaxPackageBytes = 2 * 1024 * 1024;
    public static readonly string[] Categories = { "launcher", "audio", "discord", "performance", "design", "automation", "device", "information", "productivity", "community" };
    static readonly string[] AllowedExtensions = { ".json", ".html", ".js", ".css", ".png", ".svg", ".jpg", ".jpeg", ".webp", ".txt", ".md" };
    static readonly string[] SettingTypes = { "text", "number", "boolean", "select", "game", "program", "sound", "profile" };

    readonly JsonStore<PluginsFile> _store;
    readonly string _dir;
    readonly IHub _hub;
    readonly Func<Settings> _settings;
    readonly HttpClient _http;
    readonly Dictionary<string, (byte[] data, DateTime at)> _imports = new();
    readonly Dictionary<string, Queue<DateTime>> _errorTimes = new();
    Catalog? _catalog;
    string? _catalogError;
    DateTime? _catalogAt;
    bool _catalogVerified;
    Timer? _timer;
    public string PublicKeyPem { get; set; } = UpdateSignature.OfficialPublicKey;
    /// <summary>Runs plugin action steps (the shared action runner).</summary>
    public Func<IEnumerable<ActionStep>, string, Task<List<string>>>? RunSteps { get; set; }
    public Action<string, string>? Notify { get; set; }
    public static string AppVersion => UpdateService.CurrentVersion;

    public PluginService(AppPaths paths, IHub hub, Func<Settings> settings, HttpMessageHandler? http = null)
    {
        _dir = Path.Combine(paths.DataDir, "plugins");
        Directory.CreateDirectory(_dir);
        _store = new JsonStore<PluginsFile>(Path.Combine(_dir, "plugins.json"));
        _hub = hub;
        _settings = settings;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(60);
    }

    /// <summary>Daily: refresh the catalog and apply updates the user allowed (auto update) – only if no new permissions are needed.</summary>
    public void Start() => _timer = new Timer(_ => GameActivity.RunWhenIdle("plugin-updates", async () =>
    {
        try
        {
            if (string.IsNullOrEmpty(_settings().PluginCatalogUrl)) return;
            await RefreshCatalog();
            foreach (var p in _store.Snapshot().Plugins.Where(p => p.AutoUpdate))
                try { if (UpdateFor(p) != null) await Update(p.Id, auto: true); }
                catch (Exception ex) { AddLog(p.Id, "warn", "Automatisches Update übersprungen: " + ex.Message); }
        }
        catch (Exception ex) { Log.Warn("plugins", ex.Message); }
    }), null, TimeSpan.FromMinutes(3), TimeSpan.FromHours(24));

    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }

    string PackagePath(string id, string version) => Path.Combine(_dir, $"{id}@{version}.pglplugin");

    // ------------------------------------------------------------ validation

    [GeneratedRegex(@"^[a-z0-9]+(\.[a-z0-9-]+){1,5}$")] private static partial Regex IdRx();
    [GeneratedRegex(@"^\d+\.\d+\.\d+$")] private static partial Regex SemVer();
    [GeneratedRegex(@"^[a-z0-9-]{1,32}$")] private static partial Regex LocalId();
    [GeneratedRegex(@"^\{config:([a-zA-Z0-9_]{1,32})\}$")] private static partial Regex ConfigRef();

    public static Version V(string s) => System.Version.Parse(s);

    public sealed record Package(PluginManifest Manifest, Dictionary<string, byte[]> Files, string Sha256, List<string> Warnings);

    /// <summary>Reads and fully checks a package in memory. Throws RpcException "invalid-plugin" with a clear reason.</summary>
    public static Package Validate(byte[] zipBytes, string? appVersion = null)
    {
        static Exception Bad(string m) => new RpcException("invalid-plugin", m);
        if (zipBytes.Length == 0 || zipBytes.Length > MaxPackageBytes) throw Bad($"Paket ist leer oder größer als {MaxPackageBytes / 1024 / 1024} MB.");
        var files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        try
        {
            using var zip = new ZipArchive(new MemoryStream(zipBytes), ZipArchiveMode.Read);
            if (zip.Entries.Count > 100) throw Bad("Paket enthält mehr als 100 Dateien.");
            long total = 0;
            foreach (var e in zip.Entries)
            {
                if (e.FullName.EndsWith('/')) continue; // folder entry
                var name = e.FullName;
                if (name.Contains('\\') || name.StartsWith('/') || name.Split('/').Any(p => p is "" or "." or "..") || name.Length > 120)
                    throw Bad($"Unzulässiger Dateipfad im Paket: {name}");
                if (!AllowedExtensions.Contains(Path.GetExtension(name).ToLowerInvariant())) throw Bad($"Dateityp nicht erlaubt: {name} (erlaubt: {string.Join(", ", AllowedExtensions)})");
                if (e.Length > 1024 * 1024) throw Bad($"{name} ist größer als 1 MB.");
                total += e.Length;
                if (total > 5 * 1024 * 1024) throw Bad("Paket ist entpackt größer als 5 MB.");
                using var s = e.Open(); using var ms = new MemoryStream();
                s.CopyTo(ms);
                if (ms.Length != e.Length) throw Bad($"{name} ist beschädigt.");
                files[name] = ms.ToArray();
            }
        }
        catch (InvalidDataException) { throw Bad("Datei ist kein gültiges Plugin-Paket (kein ZIP)."); }
        if (!files.TryGetValue("plugin.json", out var mf)) throw Bad("plugin.json fehlt im Paket.");
        PluginManifest m;
        try { m = JsonSerializer.Deserialize<PluginManifest>(mf, Json.Options) ?? throw Bad("plugin.json ist leer."); }
        catch (JsonException ex) { throw Bad("plugin.json ist ungültig: " + ex.Message); }
        var warnings = new List<string>();
        CheckManifest(m, files, appVersion ?? AppVersion, warnings);
        return new Package(m, files, Ids.Sha256Hex(zipBytes), warnings);
    }

    static void CheckManifest(PluginManifest m, IReadOnlyDictionary<string, byte[]> files, string appVersion, List<string> warnings)
    {
        static Exception Bad(string msg) => new RpcException("invalid-plugin", msg);
        if (m.Id.Length > 64 || !IdRx().IsMatch(m.Id)) throw Bad("Ungültige Plugin-ID (Format z. B. „de.meinname.mein-plugin“, nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich).");
        if (string.IsNullOrWhiteSpace(m.Name) || m.Name.Length > 60) throw Bad("Name fehlt oder ist länger als 60 Zeichen.");
        if (!SemVer().IsMatch(m.Version)) throw Bad("Version muss MAJOR.MINOR.PATCH sein (z. B. 1.0.0).");
        if (m.ApiVersion != ApiVersion) throw Bad($"Plugin-API-Version {m.ApiVersion} wird nicht unterstützt (dieser Launcher: {ApiVersion}).");
        if (!SemVer().IsMatch(m.MinAppVersion)) throw Bad("minAppVersion muss MAJOR.MINOR.PATCH sein.");
        if (V(m.MinAppVersion) > V(appVersion)) throw Bad($"Benötigt Launcher-Version {m.MinAppVersion} oder neuer (installiert: {appVersion}).");
        if (m.Description.Length > 500 || m.Author.Length > 60 || string.IsNullOrWhiteSpace(m.Author)) throw Bad("Autor fehlt oder Beschreibung/Autor zu lang.");
        if (!Categories.Contains(m.Category)) throw Bad($"Unbekannte Kategorie „{m.Category}“ (erlaubt: {string.Join(", ", Categories)}).");
        if (m.Platforms.Count == 0 || m.Platforms.Any(p => p is not ("web" or "windows"))) throw Bad("platforms muss „web“ und/oder „windows“ enthalten.");
        foreach (var p in m.Permissions) if (!PluginPermissions.All.ContainsKey(p)) throw Bad($"Unbekannte Berechtigung „{p}“.");
        if (m.Permissions.Distinct().Count() != m.Permissions.Count) throw Bad("Berechtigungen doppelt angegeben.");
        foreach (var (dep, range) in m.Dependencies)
        {
            if (!IdRx().IsMatch(dep) || dep == m.Id) throw Bad($"Ungültige Abhängigkeit „{dep}“.");
            if (!SemVer().IsMatch(range.TrimStart('>', '=').Trim())) throw Bad($"Versionsangabe für „{dep}“ muss „>=X.Y.Z“ oder „X.Y.Z“ sein.");
        }
        if (m.Homepage != null && !m.Homepage.StartsWith("https://", StringComparison.Ordinal)) throw Bad("homepage muss eine https-Adresse sein.");
        var c = m.Contributes;
        if (c.Widgets.Count + c.Actions.Count + c.Themes.Count == 0) throw Bad("Plugin trägt nichts bei (widgets, actions oder themes).");
        if (c.Widgets.Count > 5 || c.Actions.Count > 10 || c.Themes.Count > 5 || c.Settings.Count > 20) throw Bad("Zu viele Beiträge (max. 5 Widgets, 10 Aktionen, 5 Themes, 20 Einstellungen).");
        foreach (var s in c.Settings)
        {
            if (!Regex.IsMatch(s.Key, "^[a-zA-Z0-9_]{1,32}$") || string.IsNullOrWhiteSpace(s.Label) || s.Label.Length > 80) throw Bad($"Einstellung „{s.Key}“: Schlüssel oder Bezeichnung ungültig.");
            if (!SettingTypes.Contains(s.Type)) throw Bad($"Einstellung „{s.Key}“: unbekannter Typ „{s.Type}“.");
            if (s.Type == "select" && (s.Options is not { Count: > 0 } || s.Options.Count > 30)) throw Bad($"Einstellung „{s.Key}“: Auswahl braucht 1–30 Optionen.");
        }
        if (c.Settings.Select(s => s.Key).Distinct().Count() != c.Settings.Count) throw Bad("Einstellungsschlüssel doppelt.");
        foreach (var w in c.Widgets)
        {
            if (!LocalId().IsMatch(w.Id) || string.IsNullOrWhiteSpace(w.Title) || w.Title.Length > 60) throw Bad($"Widget „{w.Id}“: ID oder Titel ungültig.");
            if (!w.Entry.EndsWith(".html", StringComparison.Ordinal) || !files.ContainsKey(w.Entry)) throw Bad($"Widget „{w.Id}“: Einstiegsdatei {w.Entry} fehlt im Paket.");
            if (w.Height is < 60 or > 800) throw Bad($"Widget „{w.Id}“: Höhe muss zwischen 60 und 800 liegen.");
        }
        if (c.Widgets.Count > 0 && !m.Platforms.Contains("web")) throw Bad("Widgets laufen in der Web-App – platforms muss „web“ enthalten.");
        foreach (var a in c.Actions)
        {
            if (!LocalId().IsMatch(a.Id) || string.IsNullOrWhiteSpace(a.Name) || a.Name.Length > 60) throw Bad($"Aktion „{a.Id}“: ID oder Name ungültig.");
            if (a.Steps.Count is 0 or > 10) throw Bad($"Aktion „{a.Id}“: 1–10 Schritte erlaubt.");
            foreach (var st in a.Steps)
            {
                var perm = PluginPermissions.ForStep(st.Type);
                if (!m.Permissions.Contains(perm)) throw Bad($"Aktion „{a.Id}“: Schritt {st.Type} braucht die Berechtigung „{perm}“.");
                var needsRef = st.Type is StepType.LaunchItem or StepType.ActivateProfile or StepType.PlaySound or StepType.SetCollection or StepType.SetAudioOutput;
                if (needsRef)
                {
                    // IDs of games, sounds or profiles differ on every PC: the user picks them in the plugin settings.
                    var mm = ConfigRef().Match(st.Ref ?? "");
                    if (!mm.Success || c.Settings.All(s => s.Key != mm.Groups[1].Value)) throw Bad($"Aktion „{a.Id}“: Schritt {st.Type} muss auf eine Einstellung verweisen ({{config:schlüssel}}).");
                }
                else if (st.Type == StepType.Notify && (st.Ref?.Length ?? 0) > 200) throw Bad($"Aktion „{a.Id}“: Hinweistext zu lang.");
                else if (st.Type == StepType.ToggleOverlay && st.Ref is not (null or "full" or "mini")) throw Bad($"Aktion „{a.Id}“: Overlay-Modus muss „full“ oder „mini“ sein.");
            }
        }
        foreach (var t in c.Themes)
        {
            if (!LocalId().IsMatch(t.Id) || string.IsNullOrWhiteSpace(t.Name) || t.Name.Length > 40) throw Bad($"Theme „{t.Id}“: ID oder Name ungültig.");
            if (t.Theme.ToJsonString().Length > 4000) throw Bad($"Theme „{t.Id}“ ist zu groß.");
        }
        if (c.Actions.Count > 0 && !m.Platforms.Contains("windows")) warnings.Add("Aktionen werden vom Windows-Begleiter ausgeführt – platforms sollte „windows“ enthalten.");
        if (m.Permissions.Contains("network")) warnings.Add("Das Plugin möchte aus dem Widget auf das Internet zugreifen (https).");
    }

    // ------------------------------------------------------------ queries

    /// <summary>Installed plugins with version and state (for game state snapshots).</summary>
    public List<(string Id, string Version, bool Enabled)> Versions() => _store.Snapshot().Plugins.Select(p => (p.Id, p.Version, p.Enabled)).ToList();

    public object List()
    {
        var f = _store.Snapshot();
        return new
        {
            appVersion = AppVersion, apiVersion = ApiVersion,
            permissions = PluginPermissions.All,
            categories = Categories,
            catalogUrl = _settings().PluginCatalogUrl,
            plugins = f.Plugins.Select(p => Describe(p)).Where(x => x != null).ToList(),
        };
    }

    object? Describe(InstalledPlugin p)
    {
        var m = ManifestOf(p.Id, p.Version);
        if (m == null) return new { p.Id, p.Version, broken = true, p.Enabled, p.Trust, p.Log };
        var upd = UpdateFor(p);
        var deps = MissingDependencies(m);
        return new
        {
            p.Id, p.Version, p.Trust, p.Source, p.Enabled, p.Granted, p.Favorite, p.AutoUpdate, p.Config, p.PreviousVersion, p.InstalledAt, p.UpdatedAt, p.DisabledReason,
            log = p.Log.TakeLast(30),
            manifest = m,
            missingPermissions = m.Permissions.Except(p.Granted).ToList(),
            missingDependencies = deps,
            update = upd == null ? null : new { upd.Version, upd.Changelog, newPermissions = upd.Permissions.Except(m.Permissions).ToList() },
        };
    }

    PluginManifest? ManifestOf(string id, string version)
    {
        try { return Validate(File.ReadAllBytes(PackagePath(id, version)), "999.0.0").Manifest; }
        catch (Exception) { return null; }
    }

    CatalogEntry? UpdateFor(InstalledPlugin p) =>
        _catalog?.Plugins.FirstOrDefault(c => c.Id == p.Id && SemVer().IsMatch(c.Version) && V(c.Version) > V(p.Version) && V(c.MinAppVersion) <= V(AppVersion));

    List<string> MissingDependencies(PluginManifest m)
    {
        var installed = _store.Snapshot().Plugins;
        var missing = new List<string>();
        foreach (var (dep, range) in m.Dependencies)
        {
            var min = V(range.TrimStart('>', '=').Trim());
            var exact = !range.StartsWith(">=", StringComparison.Ordinal);
            var have = installed.FirstOrDefault(x => x.Id == dep);
            if (have == null || !have.Enabled || (exact ? V(have.Version) != min : V(have.Version) < min)) missing.Add($"{dep} {range}");
        }
        return missing;
    }

    /// <summary>Files the web app needs to run the plugin's widgets/themes (only for enabled plugins or the test preview).</summary>
    public object Files(string id, bool preview)
    {
        var p = Find(id);
        if (!p.Enabled && !preview) throw new RpcException("disabled", "Plugin ist deaktiviert.");
        var pkg = Validate(File.ReadAllBytes(PackagePath(p.Id, p.Version)), "999.0.0");
        return new { p.Id, p.Version, files = pkg.Files.Where(f => f.Key != "plugin.json").ToDictionary(f => f.Key, f => Convert.ToBase64String(f.Value)) };
    }

    InstalledPlugin Find(string id) => _store.Snapshot().Plugins.FirstOrDefault(x => x.Id == id) ?? throw new RpcException("not-found", "Plugin ist nicht installiert.");

    // ------------------------------------------------------------ install / update / remove

    /// <summary>Installs a package. New plugins start deactivated (test mode) until the user grants the permissions.</summary>
    public object Install(byte[] data, string trust, string source, bool allowDowngrade = false)
    {
        var pkg = Validate(data);
        var m = pkg.Manifest;
        var existing = _store.Snapshot().Plugins.FirstOrDefault(x => x.Id == m.Id);
        if (existing != null && !allowDowngrade && V(m.Version) <= V(existing.Version))
            throw new RpcException("version", $"Version {m.Version} ist nicht neuer als die installierte {existing.Version}.");
        var oldManifest = existing == null ? null : ManifestOf(existing.Id, existing.Version);
        File.WriteAllBytes(PackagePath(m.Id, m.Version), data);
        var newPerms = oldManifest == null ? m.Permissions : m.Permissions.Except(oldManifest.Permissions).ToList();
        _store.Update(f =>
        {
            var p = f.Plugins.FirstOrDefault(x => x.Id == m.Id);
            if (p == null)
            {
                p = new InstalledPlugin { Id = m.Id, Enabled = false, DisabledReason = "Neu installiert – prüfen und aktivieren" };
                f.Plugins.Add(p);
            }
            else
            {
                // Keep exactly one previous version for rollback.
                if (p.PreviousVersion != null && p.PreviousVersion != p.Version && p.PreviousVersion != m.Version) TryDelete(PackagePath(p.Id, p.PreviousVersion));
                p.PreviousVersion = p.Version;
                p.Granted = p.Granted.Intersect(m.Permissions).ToList();
                if (newPerms.Count > 0 && p.Enabled) { p.Enabled = false; p.DisabledReason = "Neue Berechtigungen nötig: " + string.Join(", ", newPerms); }
            }
            p.Version = m.Version; p.Sha256 = pkg.Sha256; p.Trust = trust; p.Source = source; p.UpdatedAt = DateTime.UtcNow;
            p.Config = DefaultConfig(m, p.Config);
        });
        AddLog(m.Id, "info", existing == null ? $"Installiert: {m.Version} ({TrustText(trust)}, Quelle {source})" : $"Aktualisiert: {existing.Version} → {m.Version} ({TrustText(trust)})");
        Log.Info("plugins", $"{m.Id} {m.Version} installiert ({trust}, {source})");
        _hub.Changed("plugins");
        return new { id = m.Id, version = m.Version, warnings = pkg.Warnings, newPermissions = newPerms };
    }

    static string TrustText(string t) => t switch { "official" => "offiziell", "reviewed" => "geprüft", _ => "nicht verifiziert" };

    static JsonObject DefaultConfig(PluginManifest m, JsonObject? old)
    {
        var cfg = new JsonObject();
        foreach (var s in m.Contributes.Settings)
            cfg[s.Key] = old != null && old.TryGetPropertyValue(s.Key, out var v) && v != null ? v.DeepClone() : s.Default?.DeepClone();
        return cfg;
    }

    static void TryDelete(string path) { try { File.Delete(path); } catch { } }

    public void Uninstall(string id)
    {
        var p = Find(id);
        var dependents = _store.Snapshot().Plugins.Where(x => x.Id != id && x.Enabled && ManifestOf(x.Id, x.Version)?.Dependencies.ContainsKey(id) == true).Select(x => x.Id).ToList();
        if (dependents.Count > 0) throw new RpcException("in-use", "Wird noch gebraucht von: " + string.Join(", ", dependents) + ". Diese zuerst deaktivieren.");
        _store.Update(f => f.Plugins.RemoveAll(x => x.Id == id));
        TryDelete(PackagePath(p.Id, p.Version));
        if (p.PreviousVersion != null) TryDelete(PackagePath(p.Id, p.PreviousVersion));
        Log.Info("plugins", $"{id} deinstalliert");
        _hub.Changed("plugins");
    }

    // ------------------------------------------------------------ test lab: one report per plugin

    public sealed record LabCheck(string Label, string Status, string Detail, string? Fix = null);

    static readonly HashSet<string> KnownManifestKeys = new(StringComparer.Ordinal) { "id", "name", "version", "apiVersion", "minAppVersion", "author", "description", "category", "icon", "homepage", "license", "platforms", "permissions", "dependencies", "contributes", "changelog", "$schema" };
    static readonly HashSet<string> KnownContributes = new(StringComparer.Ordinal) { "widgets", "actions", "themes", "settings" };

    /// <summary>Checks an installed plugin again, without running it: package unchanged, manifest valid for this launcher,
    /// permissions, dependencies, conflicts with other plugins, recent errors, update and way back.</summary>
    public object Check(string id)
    {
        var p = Find(id);
        var checks = new List<LabCheck>();
        var path = PackagePath(p.Id, p.Version);
        byte[]? bytes = File.Exists(path) ? File.ReadAllBytes(path) : null;
        if (bytes == null) checks.Add(new("Paket", "error", "Das Plugin-Paket fehlt auf dem PC.", "Plugin neu installieren."));
        else if (Ids.Sha256Hex(bytes) != p.Sha256) checks.Add(new("Paket", "error", "Das gespeicherte Paket wurde nach der Installation verändert (Prüfsumme stimmt nicht).", "Plugin deinstallieren und aus einer vertrauenswürdigen Quelle neu installieren."));
        else checks.Add(new("Paket", "ok", $"Unverändert seit der Installation (SHA-256 {p.Sha256[..12]}…). Herkunft: {TrustText(p.Trust)}."));
        PluginManifest? m = null;
        if (bytes != null)
        {
            try
            {
                var pkg = Validate(bytes);
                m = pkg.Manifest;
                checks.Add(new("Manifest & Version", pkg.Warnings.Count > 0 ? "warn" : "ok",
                    $"API-Version {m.ApiVersion} (Launcher: {ApiVersion}), braucht Launcher {m.MinAppVersion} oder neuer (installiert: {AppVersion})." + (pkg.Warnings.Count > 0 ? " Hinweise: " + string.Join(" ", pkg.Warnings) : "")));
                using var doc = JsonDocument.Parse(pkg.Files["plugin.json"]);
                var unknown = doc.RootElement.EnumerateObject().Select(x => x.Name).Where(n => !KnownManifestKeys.Contains(n)).ToList();
                if (doc.RootElement.TryGetProperty("contributes", out var c) && c.ValueKind == JsonValueKind.Object)
                    unknown.AddRange(c.EnumerateObject().Select(x => x.Name).Where(n => !KnownContributes.Contains(n)).Select(n => "contributes." + n));
                checks.Add(unknown.Count == 0 ? new("Schnittstellen", "ok", "Nur bekannte Einträge – nichts wird stillschweigend ignoriert.")
                    : new("Schnittstellen", "warn", "Unbekannte Einträge werden ignoriert: " + string.Join(", ", unknown), "Beim Plugin-Autor nachfragen, ob eine neuere Launcher-Version gebraucht wird."));
            }
            catch (RpcException ex) { checks.Add(new("Manifest & Version", "error", ex.Message, "Eine passende Plugin-Version installieren oder den Launcher aktualisieren.")); }
        }
        if (m != null)
        {
            var notGranted = m.Permissions.Except(p.Granted).ToList();
            checks.Add(new("Berechtigungen", m.Permissions.Count == 0 ? "ok" : p.Enabled && notGranted.Count == 0 ? "ok" : "warn",
                m.Permissions.Count == 0 ? "Braucht keine Berechtigungen." : string.Join(" · ", m.Permissions.Select(x => (PluginPermissions.All.TryGetValue(x, out var d) ? d : x) + (p.Granted.Contains(x) ? " ✓" : " (nicht erlaubt)")))
                + " – Plugins laufen abgeschirmt im Browser (eigener Rahmen, keine Programme, keine Dateien, kein Netzwerk) und dürfen nur das Erlaubte über den Launcher anfragen."));
            var deps = MissingDependencies(m);
            checks.Add(m.Dependencies.Count == 0 ? new("Abhängigkeiten", "ok", "Keine.")
                : deps.Count == 0 ? new("Abhängigkeiten", "ok", string.Join(", ", m.Dependencies.Select(d => $"{d.Key} {d.Value}")) + " – vorhanden und aktiv.")
                : new("Abhängigkeiten", "error", "Fehlt oder falsche Version: " + string.Join(", ", deps), "Die genannten Plugins installieren und aktivieren."));
            // Same names for actions/themes in two active plugins are confusing (which one runs?).
            var others = _store.Snapshot().Plugins.Where(x => x.Id != id && x.Enabled).Select(x => (x.Id, man: ManifestOf(x.Id, x.Version))).Where(x => x.man != null).ToList();
            var clash = new List<string>();
            foreach (var (oid, om) in others)
            {
                clash.AddRange(m.Contributes.Actions.Select(a => a.Name).Intersect(om!.Contributes.Actions.Select(a => a.Name), StringComparer.OrdinalIgnoreCase).Select(n => $"Aktion „{n}“ auch in {oid}"));
                clash.AddRange(m.Contributes.Themes.Select(a => a.Name).Intersect(om.Contributes.Themes.Select(a => a.Name), StringComparer.OrdinalIgnoreCase).Select(n => $"Theme „{n}“ auch in {oid}"));
            }
            checks.Add(clash.Count == 0 ? new("Konflikte", "ok", "Keine gleichnamigen Aktionen oder Themes in anderen aktiven Plugins.") : new("Konflikte", "warn", string.Join("; ", clash), "Eines der Plugins deaktivieren oder umbenennen lassen."));
        }
        var errors = p.Log.Where(l => l.Level == "error" && l.At > DateTime.UtcNow.AddDays(-7)).ToList();
        checks.Add(errors.Count == 0 ? new("Fehler (7 Tage)", "ok", "Keine Fehler protokolliert." + (p.DisabledReason != null && !p.Enabled ? $" Status: {p.DisabledReason}" : ""))
            : new("Fehler (7 Tage)", "warn", $"{errors.Count} Fehler, zuletzt: " + string.Join(" | ", errors.TakeLast(3).Select(e => $"{e.At:dd.MM. HH:mm} {e.Message}")), "Bei wiederholten Fehlern deaktivieren oder zur vorherigen Version zurück."));
        var update = UpdateFor(p);
        checks.Add(update != null ? new("Update", "warn", $"Version {update.Version} ist verfügbar.", "Im Plugin Center aktualisieren.") : (_catalog == null ? new("Update", "info", "Katalog noch nicht geladen – keine Aussage möglich.") : new("Update", "ok", "Aktuell.")));
        var back = p.PreviousVersion != null && File.Exists(PackagePath(id, p.PreviousVersion));
        checks.Add(new("Vorherige Version", back ? "ok" : "info", back ? $"{p.PreviousVersion} ist gespeichert – „Zurücksetzen“ möglich." : "Keine vorherige Version gespeichert."));
        var worst = checks.Any(c => c.Status == "error") ? "error" : checks.Any(c => c.Status == "warn") ? "warn" : "ok";
        return new { id, name = m?.Name ?? id, version = p.Version, enabled = p.Enabled, status = worst, at = DateTime.UtcNow, checks };
    }

    public object Rollback(string id)
    {
        var p = Find(id);
        if (p.PreviousVersion == null || !File.Exists(PackagePath(id, p.PreviousVersion))) throw new RpcException("none", "Keine vorherige Version gespeichert.");
        var res = Install(File.ReadAllBytes(PackagePath(id, p.PreviousVersion)), p.Trust, p.Source + " (zurückgesetzt)", allowDowngrade: true);
        AddLog(id, "info", $"Zurückgesetzt auf {p.PreviousVersion}");
        return res;
    }

    // ------------------------------------------------------------ enable / permissions / config

    /// <summary>Activates a plugin. All requested permissions must be granted explicitly (the user sees the list first).</summary>
    public void Enable(string id, IReadOnlyCollection<string> grant)
    {
        var p = Find(id);
        var m = ManifestOf(id, p.Version) ?? throw new RpcException("broken", "Plugin-Paket fehlt oder ist beschädigt – bitte neu installieren.");
        var missing = m.Permissions.Except(grant).ToList();
        if (missing.Count > 0) throw new RpcException("permissions", "Zum Aktivieren müssen diese Berechtigungen erlaubt werden: " + string.Join(", ", missing.Select(x => PluginPermissions.All[x])));
        if (MissingDependencies(m) is { Count: > 0 } deps) throw new RpcException("dependencies", "Fehlende Abhängigkeiten: " + string.Join(", ", deps));
        _store.Update(f => { var x = f.Plugins.First(y => y.Id == id); x.Enabled = true; x.Granted = m.Permissions.ToList(); x.DisabledReason = null; });
        lock (_errorTimes) _errorTimes.Remove(id);
        AddLog(id, "info", "Aktiviert mit Berechtigungen: " + (m.Permissions.Count == 0 ? "keine" : string.Join(", ", m.Permissions)));
        Log.Info("plugins", $"{id} aktiviert, Berechtigungen: {string.Join(", ", m.Permissions)}");
        _hub.Changed("plugins");
    }

    public void Disable(string id, string reason = "Vom Nutzer deaktiviert")
    {
        Find(id);
        _store.Update(f => { var x = f.Plugins.First(y => y.Id == id); x.Enabled = false; x.DisabledReason = reason; });
        AddLog(id, "info", "Deaktiviert: " + reason);
        _hub.Changed("plugins");
    }

    /// <summary>Withdraws one permission. The plugin stays active; calls that need it are refused from now on.</summary>
    public void Revoke(string id, string permission)
    {
        Find(id);
        _store.Update(f => f.Plugins.First(y => y.Id == id).Granted.Remove(permission));
        AddLog(id, "info", "Berechtigung entzogen: " + permission);
        Log.Info("plugins", $"{id}: Berechtigung {permission} entzogen");
        _hub.Changed("plugins");
    }

    public void SetFlags(string id, bool? favorite, bool? autoUpdate)
    {
        Find(id);
        _store.Update(f => { var x = f.Plugins.First(y => y.Id == id); if (favorite != null) x.Favorite = favorite.Value; if (autoUpdate != null) x.AutoUpdate = autoUpdate.Value; });
        _hub.Changed("plugins");
    }

    public JsonObject SetConfig(string id, JsonElement values)
    {
        var p = Find(id);
        var m = ManifestOf(id, p.Version) ?? throw new RpcException("broken", "Plugin-Paket beschädigt.");
        var cfg = new JsonObject();
        foreach (var s in m.Contributes.Settings)
        {
            if (!values.TryGetProperty(s.Key, out var v) || v.ValueKind == JsonValueKind.Null) { cfg[s.Key] = null; continue; }
            cfg[s.Key] = s.Type switch
            {
                "boolean" => v.ValueKind is JsonValueKind.True or JsonValueKind.False ? v.GetBoolean() : throw new RpcException("invalid-params", $"{s.Label}: Ja/Nein erwartet."),
                "number" => v.ValueKind == JsonValueKind.Number ? v.GetDouble() : throw new RpcException("invalid-params", $"{s.Label}: Zahl erwartet."),
                "select" => v.GetString() is { } o && s.Options!.Contains(o) ? o : throw new RpcException("invalid-params", $"{s.Label}: ungültige Auswahl."),
                _ => v.ValueKind == JsonValueKind.String && v.GetString()!.Length <= 500 ? v.GetString() : throw new RpcException("invalid-params", $"{s.Label}: Text (max. 500 Zeichen) erwartet."),
            };
        }
        _store.Update(f => f.Plugins.First(y => y.Id == id).Config = cfg);
        _hub.Changed("plugins");
        return cfg;
    }

    /// <summary>Runs a plugin action on the PC: only enabled plugins, only steps whose permission is granted, references from the settings.</summary>
    public async Task<List<string>> RunAction(string id, string actionId, string by)
    {
        var p = Find(id);
        if (!p.Enabled) throw new RpcException("disabled", "Plugin ist deaktiviert.");
        var m = ManifestOf(id, p.Version) ?? throw new RpcException("broken", "Plugin-Paket beschädigt.");
        var a = m.Contributes.Actions.FirstOrDefault(x => x.Id == actionId) ?? throw new RpcException("not-found", "Aktion nicht gefunden.");
        var steps = new List<ActionStep>();
        foreach (var st in a.Steps)
        {
            var perm = PluginPermissions.ForStep(st.Type);
            if (!p.Granted.Contains(perm)) throw new RpcException("forbidden", $"Berechtigung „{PluginPermissions.All[perm]}“ wurde entzogen.");
            var r = st.Ref;
            if (ConfigRef().Match(r ?? "") is { Success: true } mm)
            {
                r = p.Config.TryGetPropertyValue(mm.Groups[1].Value, out var v) ? v?.ToString() : null;
                if (string.IsNullOrEmpty(r)) throw new RpcException("config", "Bitte zuerst in den Plugin-Einstellungen festlegen: " + (m.Contributes.Settings.First(s => s.Key == mm.Groups[1].Value).Label));
            }
            steps.Add(new ActionStep { Type = st.Type, Ref = r });
        }
        var results = await (RunSteps ?? throw new InvalidOperationException()).Invoke(steps, $"Plugin {m.Name} ({by})");
        AddLog(id, results.Any(x => x.StartsWith("Fehler", StringComparison.Ordinal)) ? "warn" : "info", $"Aktion „{a.Name}“: {string.Join("; ", results)}");
        return results;
    }

    /// <summary>Errors reported by the sandbox (script errors, refused calls). 5 errors within a minute deactivate the plugin.</summary>
    public void ReportError(string id, string message)
    {
        var p = Find(id);
        var text = message.Length > 300 ? message[..300] : message;
        AddLog(id, "error", text);
        bool tooMany;
        lock (_errorTimes)
        {
            var q = _errorTimes.TryGetValue(id, out var x) ? x : _errorTimes[id] = new Queue<DateTime>();
            q.Enqueue(DateTime.UtcNow);
            while (q.Count > 0 && DateTime.UtcNow - q.Peek() > TimeSpan.FromMinutes(1)) q.Dequeue();
            tooMany = q.Count >= 5;
        }
        if (tooMany && p.Enabled)
        {
            Disable(id, "Automatisch deaktiviert: zu viele Fehler (5 in 1 Minute)");
            Notify?.Invoke($"Plugin „{ManifestOf(id, p.Version)?.Name ?? id}“ deaktiviert", "Es hat wiederholt Fehler gemeldet. Details im Plugin Center → Entwickleransicht.");
        }
    }

    void AddLog(string id, string level, string message)
    {
        _store.Update(f =>
        {
            var p = f.Plugins.FirstOrDefault(x => x.Id == id);
            if (p == null) return;
            p.Log.Add(new PluginLogEntry { Level = level, Message = message });
            if (p.Log.Count > 100) p.Log.RemoveRange(0, p.Log.Count - 100);
        });
        _hub.Changed("plugins");
    }

    // ------------------------------------------------------------ local package import / export (chunked: messages are ≤ 1 MB)

    public string ImportBegin(long size)
    {
        if (size <= 0 || size > MaxPackageBytes) throw new RpcException("too-large", "Plugin-Pakete dürfen höchstens 2 MB groß sein.");
        var id = Ids.New("pimp");
        lock (_imports)
        {
            foreach (var old in _imports.Where(x => DateTime.UtcNow - x.Value.at > TimeSpan.FromMinutes(10)).Select(x => x.Key).ToList()) _imports.Remove(old);
            _imports[id] = (Array.Empty<byte>(), DateTime.UtcNow);
        }
        return id;
    }

    public void ImportChunk(string id, string base64)
    {
        lock (_imports)
        {
            if (!_imports.TryGetValue(id, out var cur)) throw new RpcException("not-found", "Import abgelaufen. Bitte erneut starten.");
            var add = Convert.FromBase64String(base64);
            if (cur.data.Length + add.Length > MaxPackageBytes) throw new RpcException("too-large", "Paket zu groß.");
            _imports[id] = ([.. cur.data, .. add], DateTime.UtcNow);
        }
    }

    /// <summary>check = only validate and report (test mode before installing); otherwise install as "unverified".</summary>
    public object ImportEnd(string id, bool check, string by)
    {
        byte[] data;
        lock (_imports)
        {
            if (!_imports.TryGetValue(id, out var cur)) throw new RpcException("not-found", "Import abgelaufen.");
            data = cur.data;
            if (!check) _imports.Remove(id);
        }
        var pkg = Validate(data);
        if (check)
        {
            var existing = _store.Snapshot().Plugins.FirstOrDefault(x => x.Id == pkg.Manifest.Id);
            return new { manifest = pkg.Manifest, sha256 = pkg.Sha256, size = data.Length, warnings = pkg.Warnings, installedVersion = existing?.Version, missingDependencies = MissingDependencies(pkg.Manifest) };
        }
        // A file that matches the signed catalog entry keeps the catalog's trust level.
        var entry = _catalog?.Plugins.FirstOrDefault(c => c.Id == pkg.Manifest.Id && c.Version == pkg.Manifest.Version && c.Sha256 == pkg.Sha256);
        return Install(data, _catalogVerified && entry != null ? entry.Trust : "unverified", entry != null ? "Katalog (Datei)" : $"Datei ({by})");
    }

    public object Export(string id, long offset)
    {
        var p = Find(id);
        var bytes = File.ReadAllBytes(PackagePath(p.Id, p.Version));
        var len = (int)Math.Min(512 * 1024, Math.Max(0, bytes.Length - offset));
        return new { fileName = $"{p.Id}-{p.Version}.pglplugin", size = bytes.Length, data = Convert.ToBase64String(bytes, (int)offset, len), done = offset + len >= bytes.Length };
    }

    // ------------------------------------------------------------ catalog (store)

    public async Task<object> CatalogInfo(bool refresh)
    {
        if (refresh || _catalog == null) await RefreshCatalog();
        var installed = _store.Snapshot().Plugins.ToDictionary(p => p.Id, p => p.Version);
        return new
        {
            url = _settings().PluginCatalogUrl, verified = _catalogVerified, error = _catalogError, loadedAt = _catalogAt,
            plugins = (_catalog?.Plugins ?? new()).Select(c => new
            {
                c.Id, c.Name, c.Version, c.Description, c.Author, c.Category, c.Platforms, c.Permissions, c.MinAppVersion, c.Trust, c.Size, c.Changelog,
                compatible = SemVer().IsMatch(c.MinAppVersion) && V(c.MinAppVersion) <= V(AppVersion),
                installedVersion = installed.GetValueOrDefault(c.Id),
            }),
        };
    }

    internal async Task RefreshCatalog()
    {
        var url = _settings().PluginCatalogUrl;
        if (string.IsNullOrEmpty(url)) { _catalog = null; _catalogError = "Kein Plugin-Katalog eingetragen – lokale Plugin-Dateien lassen sich trotzdem importieren."; return; }
        try
        {
            if (!url.StartsWith("https://", StringComparison.Ordinal)) throw new Exception("Katalog-Adresse muss https sein.");
            var bust = (url.Contains('?') ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks;
            var bytes = await _http.GetByteArrayAsync(url + bust);
            var sig = (await _http.GetStringAsync(url + ".sig" + bust)).Trim();
            var verified = VerifyBytes(bytes, sig);
            // Only the official catalog is required to be signed; with an own catalog everything counts as unverified.
            var official = url == new Settings().PluginCatalogUrl;
            if (official && !verified) throw new Exception("Signatur des offiziellen Katalogs ist ungültig – Katalog wird nicht verwendet.");
            var cat = JsonSerializer.Deserialize<Catalog>(bytes, Json.Options) ?? throw new Exception("Katalog leer.");
            if (!verified) foreach (var e in cat.Plugins) e.Trust = "unverified";
            cat.Plugins = cat.Plugins.Where(e => IdRx().IsMatch(e.Id) && SemVer().IsMatch(e.Version) && e.Url.StartsWith("https://", StringComparison.Ordinal) && Regex.IsMatch(e.Sha256, "^[0-9a-f]{64}$")).ToList();
            foreach (var e in cat.Plugins) if (e.Trust is not ("official" or "reviewed")) e.Trust = "unverified";
            _catalog = cat; _catalogVerified = verified; _catalogError = null; _catalogAt = DateTime.UtcNow;
        }
        catch (Exception ex) { _catalogError = "Katalog nicht geladen: " + ex.Message; }
        _hub.Changed("plugins");
    }

    bool VerifyBytes(byte[] data, string signature)
    {
        try
        {
            using var key = ECDsa.Create();
            key.ImportFromPem(PublicKeyPem);
            return key.VerifyData(data, Convert.FromBase64String(signature), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        catch (Exception) { return false; }
    }

    /// <summary>Downloads a catalog package (https), checks size and SHA-256 from the signed catalog, then installs.</summary>
    public async Task<object> InstallFromCatalog(string id)
    {
        if (_catalog == null) await RefreshCatalog();
        var e = _catalog?.Plugins.FirstOrDefault(c => c.Id == id) ?? throw new RpcException("not-found", _catalogError ?? "Plugin nicht im Katalog.");
        if (V(e.MinAppVersion) > V(AppVersion)) throw new RpcException("incompatible", $"Benötigt Launcher {e.MinAppVersion} oder neuer – bitte zuerst den Begleiter aktualisieren.");
        byte[] data;
        try { data = await _http.GetByteArrayAsync(e.Url); }
        catch (Exception ex) { throw new RpcException("download", "Download fehlgeschlagen: " + ex.Message); }
        if (data.Length != e.Size || Ids.Sha256Hex(data) != e.Sha256) throw new RpcException("integrity", "Paket stimmt nicht mit dem Katalog überein (Größe/Prüfsumme) – nicht installiert.");
        var pkg = Validate(data);
        if (pkg.Manifest.Id != e.Id || pkg.Manifest.Version != e.Version) throw new RpcException("integrity", "Paketinhalt passt nicht zum Katalogeintrag – nicht installiert.");
        return Install(data, e.Trust, "Katalog");
    }

    public async Task<object> Update(string id, bool auto = false)
    {
        var p = Find(id);
        var e = UpdateFor(p) ?? throw new RpcException("none", "Kein Update verfügbar.");
        var m = ManifestOf(id, p.Version);
        if (auto && m != null && e.Permissions.Except(m.Permissions).Any()) throw new RpcException("permissions", "Neue Berechtigungen – bitte manuell aktualisieren.");
        return await InstallFromCatalog(e.Id);
    }

    // ------------------------------------------------------------ backup

    internal PluginsFile Export() => _store.Snapshot();
}
