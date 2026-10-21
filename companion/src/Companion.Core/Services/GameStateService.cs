using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class SnapConfig
{
    public string LocationId { get; set; } = "";
    public string Name { get; set; } = "";
    public string Path { get; set; } = "";
    /// <summary>File name of the saved copy inside the snapshot folder; null = the file did not exist / could not be read.</summary>
    public string? Copy { get; set; }
    public string? Sha { get; set; }
    public long Size { get; set; }
    public string? Problem { get; set; }
}

public sealed record SnapMod(string Name, bool Enabled);
public sealed record SnapPlugin(string Id, string Version, bool Enabled);
public sealed record SnapStep(string Part, string Status, string Detail);
public sealed record SnapRestore(DateTime At, string By, string? SafetySnapshot, List<SnapStep> Steps);

/// <summary>What could be read about a game's state at one moment. Not a system image – only these parts.</summary>
public sealed class GameSnapshot
{
    public string Id { get; set; } = "";
    public string ItemId { get; set; } = "";
    public string Game { get; set; } = "";
    public DateTime At { get; set; }
    public string Reason { get; set; } = "";
    public string By { get; set; } = "";
    public string? GameVersion { get; set; }
    public string Args { get; set; } = "";
    public string? WorkingDir { get; set; }
    public string? ProfileId { get; set; }
    public string? ProfileName { get; set; }
    public List<SnapConfig> Configs { get; set; } = new();
    /// <summary>null = no mods folder set up for this game.</summary>
    public List<SnapMod>? Mods { get; set; }
    public List<SnapPlugin> Plugins { get; set; } = new();
    public Dictionary<string, string> System { get; set; } = new();
    public List<SnapRestore> Restores { get; set; } = new();
}

public sealed class GameSnapshotsFile { public List<GameSnapshot> Snapshots { get; set; } = new(); }

/// <summary>
/// Restorable game state: before bigger changes (or on request) records the game version, launch settings (arguments,
/// working folder, linked gaming profile), the game's configuration files registered in the savegame vault (a copy of
/// each), the on/off state of its mods, installed plugin versions and system data. Restoring puts back launch settings,
/// configuration files and mod on/off – after saving the current state as a snapshot first. Game files, savegames
/// (→ vault), mods that were removed and Windows itself are not part of it, and the result says so.
/// </summary>
public sealed class GameStateService
{
    public const int KeepPerGame = 20;
    readonly JsonStore<GameSnapshotsFile> _store;
    readonly string _dir;
    readonly IPlatform _platform;
    readonly LibraryService _library;
    readonly SaveVaultService _vault;
    readonly ModService _mods;
    readonly Func<ProfilesFile> _profiles;
    readonly Func<List<(string Id, string Version, bool Enabled)>> _plugins;
    readonly Func<string, bool> _isRunning;
    readonly IHub _hub;
    readonly object _lock = new();
    static readonly Regex IdRx = new("^gs_[A-Za-z0-9_-]{6,20}$");

    public GameStateService(AppPaths paths, IPlatform platform, LibraryService library, SaveVaultService vault, ModService mods,
        Func<ProfilesFile> profiles, Func<List<(string Id, string Version, bool Enabled)>> plugins, Func<string, bool> isRunning, IHub hub)
    {
        _store = new JsonStore<GameSnapshotsFile>(paths.File("gamestate.json"));
        _dir = paths.File("gamestate");
        _platform = platform; _library = library; _vault = vault; _mods = mods; _profiles = profiles; _plugins = plugins; _isRunning = isRunning; _hub = hub;
    }

    public List<GameSnapshot> List(string? itemId = null) => _store.Snapshot().Snapshots.Where(s => itemId == null || s.ItemId == itemId).OrderByDescending(s => s.At).ToList();

    GameSnapshot Get(string id) => IdRx.IsMatch(id) ? _store.Get(f => f.Snapshots.FirstOrDefault(s => s.Id == id)) ?? throw new RpcException("not-found", "Momentaufnahme nicht gefunden.")
        : throw new RpcException("invalid-params", "Ungültige Momentaufnahme.");

    string SnapDir(string id) => System.IO.Path.Combine(_dir, id);

    static string Sha(byte[] data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();

    /// <summary>Reads the current state; with <paramref name="save"/> the configuration files are copied and the snapshot kept.</summary>
    GameSnapshot Read(LibraryItem item, string reason, string by, bool save)
    {
        var prof = _profiles();
        var snap = new GameSnapshot
        {
            Id = "gs_" + Ids.Token(12), ItemId = item.Id, Game = item.Name, At = DateTime.UtcNow, Reason = Clean(reason), By = by,
            GameVersion = item.Source == LaunchSource.Steam ? SteamAppState.ForInstallDir(item.InstallDir, item.Target)?.BuildId is { } b ? "Steam-Build " + b : null : null,
            Args = item.Args, WorkingDir = item.WorkingDir, ProfileId = item.ProfileId,
            ProfileName = prof.Profiles.FirstOrDefault(p => p.Id == item.ProfileId)?.Name,
            Mods = _mods.Entries(item.Id)?.Select(m => new SnapMod(m.Name, m.Enabled)).ToList(),
            Plugins = _plugins().Select(p => new SnapPlugin(p.Id, p.Version, p.Enabled)).ToList(),
            System = CrashReportService.SystemInfo(_platform),
        };
        var n = 0;
        foreach (var l in _vault.Locations().Where(l => l.ItemId == item.Id && l.Kind == "config"))
        {
            var c = new SnapConfig { LocationId = l.Id, Name = l.Name, Path = l.Path };
            try
            {
                var fi = new FileInfo(l.Path);
                if (!fi.Exists) c.Problem = "Datei fehlte zu diesem Zeitpunkt.";
                else if (fi.Length > SaveVaultService.MaxConfigBytes) c.Problem = "Größer als 2 MB – nicht gesichert.";
                else
                {
                    var data = File.ReadAllBytes(l.Path);
                    c.Sha = Sha(data); c.Size = data.Length;
                    if (save)
                    {
                        Directory.CreateDirectory(SnapDir(snap.Id));
                        c.Copy = $"{++n}.bin";
                        File.WriteAllBytes(System.IO.Path.Combine(SnapDir(snap.Id), c.Copy), data);
                    }
                }
            }
            catch (Exception ex) { c.Problem = "Nicht lesbar: " + ex.Message; }
            snap.Configs.Add(c);
        }
        return snap;
    }

    static string Clean(string? s) { s = (s ?? "").Trim(); return s.Length == 0 ? "Momentaufnahme" : s.Length > 80 ? s[..80] : s; }

    public GameSnapshot Create(string itemId, string reason, string by)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        lock (_lock)
        {
            var snap = Read(item, reason, by, save: true);
            var dropped = new List<string>();
            _store.Update(f =>
            {
                f.Snapshots.Add(snap);
                foreach (var old in f.Snapshots.Where(s => s.ItemId == itemId).OrderByDescending(s => s.At).Skip(KeepPerGame).ToList()) { f.Snapshots.Remove(old); dropped.Add(old.Id); }
            });
            foreach (var id in dropped) try { if (Directory.Exists(SnapDir(id))) Directory.Delete(SnapDir(id), true); } catch { /* removed later */ }
            _hub.Changed("gamestate");
            return snap;
        }
    }

    /// <summary>Automatic snapshot before a bigger change (mod install/restore, vault restore); at most one per game every 10 minutes.</summary>
    public void Before(string itemId, string reason)
    {
        try
        {
            if (_library.Get(itemId) == null || List(itemId).FirstOrDefault() is { } last && DateTime.UtcNow - last.At < TimeSpan.FromMinutes(10)) return;
            Create(itemId, reason, "automatisch");
        }
        catch (Exception ex) { Log.Warn("gamestate", "Momentaufnahme vor Änderung nicht möglich: " + ex.Message); }
    }

    public bool Remove(string id)
    {
        Get(id);
        lock (_lock)
        {
            var ok = _store.Update(f => f.Snapshots.RemoveAll(s => s.Id == id) > 0);
            try { if (Directory.Exists(SnapDir(id))) Directory.Delete(SnapDir(id), true); } catch { }
            _hub.Changed("gamestate");
            return ok;
        }
    }

    public sealed record Change(string Area, string Key, string? Old, string? New);

    /// <summary>Differences from snapshot <paramref name="a"/> to <paramref name="b"/> ("current" = the state right now).</summary>
    public object Diff(string a, string b)
    {
        var x = Get(a);
        var y = b == "current" ? Read(_library.Get(x.ItemId) ?? throw new RpcException("not-found", "Spiel nicht mehr in der Bibliothek."), "Jetzt", "", save: false) : Get(b);
        if (y.ItemId != x.ItemId) throw new RpcException("invalid-params", "Nur Momentaufnahmen desselben Spiels lassen sich vergleichen.");
        var ch = new List<Change>();
        void F(string area, string key, string? o, string? n) { if ((o ?? "") != (n ?? "")) ch.Add(new(area, key, o, n)); }
        F("Spiel", "Version", x.GameVersion, y.GameVersion);
        F("Start", "Startargumente", x.Args, y.Args);
        F("Start", "Arbeitsordner", x.WorkingDir, y.WorkingDir);
        F("Start", "Gaming-Profil", x.ProfileName ?? x.ProfileId, y.ProfileName ?? y.ProfileId);
        var files = new List<object>();
        foreach (var c in x.Configs.Concat(y.Configs).Select(c => c.LocationId).Distinct())
        {
            var o = x.Configs.FirstOrDefault(k => k.LocationId == c);
            var n = y.Configs.FirstOrDefault(k => k.LocationId == c);
            var name = (o ?? n)!.Name;
            if (o?.Sha == n?.Sha) continue;
            if (o?.Sha == null || n?.Sha == null) { F("Konfiguration", name, o?.Sha == null ? "fehlt" : "vorhanden", n?.Sha == null ? "fehlt" : "vorhanden"); continue; }
            object? detail = null;
            try
            {
                var ta = ReadCopy(x, o);
                var tb = b == "current" ? File.ReadAllText(n.Path) : ReadCopy(y, n);
                if (ta != null && tb != null) detail = ConfigDiff.Compare(ta, tb, System.IO.Path.GetExtension(o.Path));
            }
            catch { /* shown as changed without details */ }
            ch.Add(new("Konfiguration", name, "geändert", null));
            files.Add(new { name, diff = detail });
        }
        if (x.Mods != null || y.Mods != null)
            foreach (var m in (x.Mods ?? new()).Select(m => m.Name).Union((y.Mods ?? new()).Select(m => m.Name), StringComparer.OrdinalIgnoreCase).OrderBy(s => s))
            {
                var o = x.Mods?.FirstOrDefault(k => k.Name == m);
                var n = y.Mods?.FirstOrDefault(k => k.Name == m);
                F("Mods", m, o == null ? "nicht da" : o.Enabled ? "an" : "aus", n == null ? "nicht da" : n.Enabled ? "an" : "aus");
            }
        foreach (var p in x.Plugins.Select(p => p.Id).Union(y.Plugins.Select(p => p.Id)).OrderBy(s => s))
        {
            var o = x.Plugins.FirstOrDefault(k => k.Id == p);
            var n = y.Plugins.FirstOrDefault(k => k.Id == p);
            F("Plugins", p, o == null ? "nicht installiert" : $"{o.Version}{(o.Enabled ? "" : " (aus)")}", n == null ? "nicht installiert" : $"{n.Version}{(n.Enabled ? "" : " (aus)")}");
        }
        foreach (var k in x.System.Keys.Union(y.System.Keys).Where(k => k != "Speicher belegt (jetzt)"))
            F("System", k, x.System.GetValueOrDefault(k), y.System.GetValueOrDefault(k));
        return new { a = new { x.Id, x.At, x.Reason }, b = b == "current" ? null : new { y.Id, y.At, y.Reason }, changes = ch, files };
    }

    string? ReadCopy(GameSnapshot s, SnapConfig c)
    {
        if (c.Copy == null) return null;
        var p = System.IO.Path.Combine(SnapDir(s.Id), c.Copy);
        return File.Exists(p) ? File.ReadAllText(p) : null;
    }

    /// <summary>What a restore would change – shown before restoring.</summary>
    public object Preview(string id)
    {
        var d = Diff(id, "current");
        var s = Get(id);
        var missing = s.Configs.Where(c => c.Copy != null && !File.Exists(System.IO.Path.Combine(SnapDir(s.Id), c.Copy))).Select(c => c.Name).ToList();
        return new { diff = d, running = _isRunning(s.ItemId), missingCopies = missing, notRestored = NotRestored };
    }

    static readonly string[] NotRestored =
    {
        "Spieldateien und Spielversion (Updates macht der Launcher)",
        "Spielstände – dafür gibt es den Savegame-Tresor",
        "Mods, die inzwischen gelöscht wurden (nur an/aus wird zurückgestellt)",
        "Inhalt des Gaming-Profils und Plugin-Versionen (nur angezeigt)",
        "Windows und andere Programme",
    };

    /// <summary>Puts back launch settings, configuration files and mod on/off. The current state is saved first.</summary>
    public object Restore(string id, string by)
    {
        var s = Get(id);
        var item = _library.Get(s.ItemId) ?? throw new RpcException("not-found", "Spiel nicht mehr in der Bibliothek.");
        if (_isRunning(item.Id)) throw new RpcException("busy", $"{item.Name} läuft gerade – bitte erst beenden. Es wurde nichts geändert.");
        var steps = new List<SnapStep>();
        var safety = Create(item.Id, "Vor dem Wiederherstellen", by);
        steps.Add(new("Sicherung", "ok", "Der Zustand vor dem Wiederherstellen ist als eigene Momentaufnahme gespeichert."));

        // Launch settings
        try
        {
            var changed = new List<string>();
            if (item.Args != s.Args || item.WorkingDir != s.WorkingDir)
            {
                var wd = s.WorkingDir != null && !Directory.Exists(s.WorkingDir) ? null : s.WorkingDir;
                _library.UpdateTarget(item.Id, null, s.Args, wd ?? "");
                changed.Add("Startargumente/Arbeitsordner");
                if (s.WorkingDir != null && wd == null) steps.Add(new("Start", "warn", $"Arbeitsordner {s.WorkingDir} gibt es nicht mehr – nicht gesetzt."));
            }
            if (item.ProfileId != s.ProfileId)
            {
                if (s.ProfileId != null && _profiles().Profiles.All(p => p.Id != s.ProfileId)) steps.Add(new("Start", "warn", $"Gaming-Profil „{s.ProfileName}“ gibt es nicht mehr – Verknüpfung nicht gesetzt."));
                else { _library.UpdateMetadata(new LibraryService.MetadataUpdate { Id = item.Id, ProfileId = s.ProfileId ?? "" }); changed.Add("Gaming-Profil"); }
            }
            steps.Add(new("Start", "ok", changed.Count > 0 ? "Zurückgestellt: " + string.Join(", ", changed) + "." : "Unverändert."));
        }
        catch (Exception ex) { steps.Add(new("Start", "error", ex.Message)); }

        // Configuration files
        foreach (var c in s.Configs)
        {
            if (c.Copy == null) { steps.Add(new("Konfiguration", "skip", $"{c.Name}: {c.Problem ?? "keine Kopie"} – nichts geändert.")); continue; }
            try
            {
                var src = System.IO.Path.Combine(SnapDir(s.Id), c.Copy);
                if (!File.Exists(src)) { steps.Add(new("Konfiguration", "error", $"{c.Name}: Kopie fehlt in der Momentaufnahme – nichts geändert.")); continue; }
                var data = File.ReadAllBytes(src);
                if (Sha(data) != c.Sha) { steps.Add(new("Konfiguration", "error", $"{c.Name}: Kopie ist beschädigt (Prüfsumme) – nichts geändert.")); continue; }
                if (_vault.Allowed(c.Path) == null) { steps.Add(new("Konfiguration", "error", $"{c.Name}: liegt nicht (mehr) in einem freigegebenen Ordner – nichts geändert.")); continue; }
                if (File.Exists(c.Path) && Sha(File.ReadAllBytes(c.Path)) == c.Sha) { steps.Add(new("Konfiguration", "ok", $"{c.Name}: schon gleich.")); continue; }
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(c.Path)!);
                var tmp = c.Path + ".nexus-neu";
                File.WriteAllBytes(tmp, data);
                File.Move(tmp, c.Path, true);
                steps.Add(new("Konfiguration", "ok", $"{c.Name}: zurückgestellt."));
            }
            catch (Exception ex) { steps.Add(new("Konfiguration", "error", $"{c.Name}: {ex.Message}")); }
        }

        // Mods on/off
        if (s.Mods != null)
        {
            var now = _mods.Entries(item.Id);
            if (now == null) steps.Add(new("Mods", "skip", "Für das Spiel ist kein Mod-Ordner mehr eingerichtet."));
            else
            {
                int toggled = 0;
                foreach (var m in s.Mods)
                {
                    var cur = now.FirstOrDefault(x => x.Name == m.Name);
                    if (cur == null) { steps.Add(new("Mods", "warn", $"{m.Name}: nicht mehr vorhanden – Mod-Dateien sind nicht Teil der Momentaufnahme.")); continue; }
                    if (cur.Enabled == m.Enabled) continue;
                    try { _mods.Toggle(item.Id, m.Name, m.Enabled); toggled++; }
                    catch (Exception ex) { steps.Add(new("Mods", "error", $"{m.Name}: {ex.Message}")); }
                }
                var extra = now.Where(x => s.Mods.All(m => m.Name != x.Name)).Select(x => x.Name).ToList();
                steps.Add(new("Mods", "ok", $"{toggled} Mods an/aus zurückgestellt." + (extra.Count > 0 ? $" Neu dazugekommen und unverändert gelassen: {string.Join(", ", extra.Take(5))}{(extra.Count > 5 ? " …" : "")}." : "")));
            }
        }
        steps.Add(new("Nicht enthalten", "info", string.Join(" · ", NotRestored)));

        var log = new SnapRestore(DateTime.UtcNow, by, safety.Id, steps);
        _store.Update(f => f.Snapshots.FirstOrDefault(x => x.Id == s.Id)?.Restores.Add(log));
        Log.Info("gamestate", $"{item.Name}: Momentaufnahme {s.Id} wiederhergestellt ({steps.Count(x => x.Status == "error")} Fehler).");
        _hub.Changed("gamestate");
        return new { restored = s.Id, safety = safety.Id, steps, ok = steps.All(x => x.Status != "error") };
    }
}
