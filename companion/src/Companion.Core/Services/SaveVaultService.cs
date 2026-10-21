using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>A registered place: a savegame folder ("saves") or one configuration file ("config").</summary>
public sealed class VaultLocation
{
    public string Id { get; set; } = "";
    public string? ItemId { get; set; }
    public string Name { get; set; } = "";
    /// <summary>"saves" (folder) or "config" (single file).</summary>
    public string Kind { get; set; } = "saves";
    public string Path { get; set; } = "";
    /// <summary>"off", "afterPlay" (when the game ends) or "daily".</summary>
    public string Auto { get; set; } = "afterPlay";
    public int Keep { get; set; } = 10;
    /// <summary>Where the place came from ("steam-cloud", "saved-games", … or "manual" at the PC).</summary>
    public string Source { get; set; } = "manual";
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
}

public sealed class VaultFile { public List<VaultLocation> Locations { get; set; } = new(); }

public sealed record VaultEntry(string P, long Size, string Sha, DateTime Mtime);
public sealed record VaultManifest(string Reason, DateTime At, long Bytes, List<VaultEntry> Files);
public sealed record VaultSuggestion(string Name, string Kind, string Path, string Source, string Hint);

/// <summary>Folders the vault may ever touch (user profile areas and Steam's per-game cloud folders) – injectable for tests.</summary>
public sealed record VaultEnv(IReadOnlyList<string> UserRoots, IReadOnlyList<string> SteamRoots)
{
    public static VaultEnv Default()
    {
        var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var roots = new List<string>
        {
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), System.IO.Path.Combine(profile, "Saved Games"),
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), local,
        };
        if (!string.IsNullOrEmpty(local)) roots.Add(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(local.TrimEnd('\\', '/')) ?? local, "LocalLow"));
        return new VaultEnv(roots.Where(r => !string.IsNullOrEmpty(r)).Distinct().ToList(), SteamDetector.DefaultRoots().ToList());
    }
}

/// <summary>
/// Savegame vault and configuration versions. Only places the user registered are read or written; places are only
/// suggested from sure facts (Steam's cloud folder of the game, folders named exactly like the game in the usual
/// places) and never guessed. Every backup is a ZIP with a SHA-256 list (checkable later). Before every restore the
/// current state is backed up, nothing happens while the game runs, and the swap is done via a side folder so a
/// failure in the middle never leaves half a savegame.
/// </summary>
public sealed class SaveVaultService
{
    public const long MaxBackupBytes = 2L * 1024 * 1024 * 1024;
    public const long MaxConfigBytes = 2 * 1024 * 1024;
    static readonly Regex IdRx = new("^sv_[A-Za-z0-9_-]{1,40}$");
    static readonly Regex BackupRx = new(@"^\d{8}-\d{6}-\d{3}\.zip$");
    static readonly string[] ConfigExt = { ".ini", ".cfg", ".conf", ".json", ".xml", ".txt", ".properties", ".toml", ".yaml", ".yml", ".vdf", ".lua" };
    // Never offered and never accepted, even inside the user profile: browsers, Windows itself, credentials.
    static readonly string[] Denied = { "Microsoft", "Google", "Mozilla", "Packages", "Temp", "Opera Software", "BraveSoftware", "Steam\\config", "Nexus Gaming Hub" };

    readonly JsonStore<VaultFile> _store;
    readonly string _root;
    readonly LibraryService _library;
    readonly Func<string, bool> _isRunning;
    readonly IHub _hub;
    readonly Func<VaultEnv> _env;
    readonly Func<DateTime> _now;
    readonly object _lock = new();
    readonly Timer? _daily;

    public SaveVaultService(AppPaths paths, LibraryService library, Func<string, bool> isRunning, IHub hub, Func<VaultEnv>? env = null, Func<DateTime>? now = null)
    {
        _store = new JsonStore<VaultFile>(paths.File("savevault.json"));
        _root = System.IO.Path.Combine(paths.DataDir, "savevault");
        _library = library; _isRunning = isRunning; _hub = hub;
        _env = env ?? VaultEnv.Default;
        _now = now ?? (() => DateTime.UtcNow);
        // "daily" rule: looked at once an hour, never while a game runs.
        if (now == null) _daily = new Timer(_ => GameActivity.RunWhenIdle("vault-daily", () => { Daily(); return Task.CompletedTask; }), null, TimeSpan.FromMinutes(10), TimeSpan.FromHours(1));
    }

    public List<VaultLocation> Locations() => _store.Snapshot().Locations;
    VaultLocation Loc(string id) => Locations().FirstOrDefault(l => l.Id == id) ?? throw new RpcException("not-found", "Speicherort nicht gefunden.");

    // ------------------------------------------------------------------ places

    /// <summary>Is the path inside an allowed area (and not in a denied one)? Returns the full path or null.</summary>
    public string? Allowed(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length > 400 || path.Contains('\0')) return null;
        string full;
        try { full = System.IO.Path.GetFullPath(path).TrimEnd('\\', '/'); } catch { return null; }
        var env = _env();
        var cmp = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var inUser = env.UserRoots.Select(r => System.IO.Path.GetFullPath(r).TrimEnd('\\', '/')).FirstOrDefault(r => full.StartsWith(r + System.IO.Path.DirectorySeparatorChar, cmp));
        var inSteam = env.SteamRoots.Select(r => System.IO.Path.Combine(System.IO.Path.GetFullPath(r), "userdata")).Any(r => full.StartsWith(r + System.IO.Path.DirectorySeparatorChar, cmp));
        var inGame = _library.List().Where(i => i.InstallDir is { Length: > 3 }).Any(i => full.StartsWith(System.IO.Path.GetFullPath(i.InstallDir!).TrimEnd('\\', '/') + System.IO.Path.DirectorySeparatorChar, cmp));
        if (inUser == null && !inSteam && !inGame) return null;
        var rel = inUser != null ? full[(inUser.Length + 1)..] : full;
        if (Denied.Any(d => rel.StartsWith(d.Replace('\\', System.IO.Path.DirectorySeparatorChar) , cmp) || rel.Contains(System.IO.Path.DirectorySeparatorChar + d.Replace('\\', System.IO.Path.DirectorySeparatorChar) + System.IO.Path.DirectorySeparatorChar, cmp))) return null;
        return full;
    }

    static bool IsLink(string path) { try { return new FileInfo(path).Attributes.HasFlag(FileAttributes.ReparsePoint); } catch { return true; } }

    /// <summary>Places for a game that are sure: Steam's cloud folder of exactly this app, or a folder named exactly like the game.</summary>
    public List<VaultSuggestion> Suggest(string itemId)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        var list = new List<VaultSuggestion>();
        var env = _env();
        if (item.Source == LaunchSource.Steam && Regex.IsMatch(item.Target, "^[0-9]{1,10}$"))
            foreach (var root in env.SteamRoots)
            {
                var ud = System.IO.Path.Combine(root, "userdata");
                if (!Directory.Exists(ud)) continue;
                foreach (var user in SafeDirs(ud))
                {
                    var remote = System.IO.Path.Combine(user, item.Target, "remote");
                    if (Directory.Exists(remote)) list.Add(new(item.Name, "saves", remote, "steam-cloud", "Steam-Cloud-Ordner dieses Spiels – Steam gleicht ihn mit der Cloud ab."));
                }
            }
        var name = item.Name.Trim();
        if (name.Length >= 2 && name.IndexOfAny(System.IO.Path.GetInvalidFileNameChars()) < 0)
            foreach (var r in env.UserRoots)
            {
                foreach (var cand in new[] { System.IO.Path.Combine(r, name), System.IO.Path.Combine(r, "My Games", name) })
                    if (Directory.Exists(cand)) list.Add(new(item.Name, "saves", cand, "same-name", "Ordner mit genau dem Namen des Spiels – bitte prüfen, ob dort die Spielstände liegen."));
                // Unity games: <LocalLow>/<Firma>/<Spiel>
                if (r.EndsWith("LocalLow", StringComparison.OrdinalIgnoreCase) && Directory.Exists(r))
                    foreach (var company in SafeDirs(r))
                    {
                        var cand = System.IO.Path.Combine(company, name);
                        if (Directory.Exists(cand)) list.Add(new(item.Name, "saves", cand, "same-name", "Ordner mit genau dem Namen des Spiels – bitte prüfen, ob dort die Spielstände liegen."));
                    }
            }
        var have = Locations().Select(l => l.Path).ToHashSet(StringComparer.OrdinalIgnoreCase);
        return list.Where(s => Allowed(s.Path) != null && !IsLink(s.Path) && !have.Contains(System.IO.Path.GetFullPath(s.Path).TrimEnd('\\', '/')))
            .GroupBy(s => s.Path, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
    }

    static IEnumerable<string> SafeDirs(string dir) { try { return Directory.EnumerateDirectories(dir).Take(500).ToList(); } catch { return Array.Empty<string>(); } }

    /// <summary>Registers a place. Devices may only take a suggestion of the PC; a typed path only at the PC itself.</summary>
    public VaultLocation Add(string? itemId, string kind, string path, string? name, bool atPc)
    {
        if (kind is not ("saves" or "config")) throw new RpcException("invalid-params", "Art muss „saves“ oder „config“ sein.");
        var full = Allowed(path) ?? throw new RpcException("invalid-params", "Dieser Ort ist nicht freigegeben. Erlaubt sind Ordner im Benutzerprofil (Dokumente, Gespeicherte Spiele, AppData), Steams Cloud-Ordner und Spielordner – keine Browser-, Windows- oder Anmeldedaten.");
        if (IsLink(full)) throw new RpcException("invalid-params", "Verknüpfungen werden aus Sicherheitsgründen nicht unterstützt.");
        if (kind == "saves" && !Directory.Exists(full)) throw new RpcException("not-found", "Ordner gibt es nicht.");
        if (kind == "config")
        {
            if (!File.Exists(full)) throw new RpcException("not-found", "Datei gibt es nicht.");
            if (!ConfigExt.Contains(System.IO.Path.GetExtension(full).ToLowerInvariant())) throw new RpcException("invalid-params", "Nur Konfigurationsdateien (ini, cfg, json, xml, txt …).");
            if (new FileInfo(full).Length > MaxConfigBytes) throw new RpcException("too-large", "Konfigurationsdatei ist größer als 2 MB.");
        }
        LibraryItem? item = null;
        if (!string.IsNullOrEmpty(itemId)) item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        var sug = item == null || kind != "saves" ? null : Suggest(item.Id).FirstOrDefault(s => string.Equals(System.IO.Path.GetFullPath(s.Path).TrimEnd('\\', '/'), full, StringComparison.OrdinalIgnoreCase));
        if (sug == null && !atPc) throw new RpcException("forbidden", "Vom Gerät aus lassen sich nur Vorschläge des PCs übernehmen. Eigene Pfade bitte direkt am PC eintragen.");
        var source = sug?.Source ?? "manual";
        if (Locations().Any(l => string.Equals(l.Path, full, StringComparison.OrdinalIgnoreCase))) throw new RpcException("exists", "Dieser Ort ist schon eingetragen.");
        var loc = new VaultLocation
        {
            Id = "sv_" + Ids.Token(9), ItemId = item?.Id, Kind = kind, Path = full, Source = source, AddedAt = _now(), Auto = kind == "config" ? "afterPlay" : "afterPlay",
            Name = Clean(name) ?? (item != null ? (kind == "config" ? $"{item.Name} – {System.IO.Path.GetFileName(full)}" : item.Name) : System.IO.Path.GetFileName(full)),
        };
        _store.Update(f => { if (f.Locations.Count >= 100) throw new RpcException("limit", "Höchstens 100 Orte."); f.Locations.Add(loc); });
        _hub.Changed("vault");
        return loc;
    }

    static string? Clean(string? s) { var t = s?.Replace("\r", " ").Replace("\n", " ").Trim(); return string.IsNullOrEmpty(t) ? null : t.Length > 60 ? t[..60] : t; }

    /// <summary>Rules (also prepared on a device without the PC and sent later).</summary>
    public VaultLocation Configure(string id, string? name, string? auto, int? keep)
    {
        if (auto != null && auto is not ("off" or "afterPlay" or "daily")) throw new RpcException("invalid-params", "Unbekannte Regel.");
        var r = _store.Update(f =>
        {
            var l = f.Locations.FirstOrDefault(x => x.Id == id) ?? throw new RpcException("not-found", "Speicherort nicht gefunden.");
            if (Clean(name) is { } n) l.Name = n;
            if (auto != null) l.Auto = auto;
            if (keep != null) l.Keep = Math.Clamp(keep.Value, 1, 50);
            return Json.Deserialize<VaultLocation>(Json.Serialize(l))!;
        });
        Prune(id, r.Keep);
        _hub.Changed("vault");
        return r;
    }

    public bool Remove(string id, bool deleteBackups)
    {
        var ok = _store.Update(f => f.Locations.RemoveAll(l => l.Id == id) > 0);
        if (ok && deleteBackups && IdRx.IsMatch(id) && Directory.Exists(Dir(id))) Directory.Delete(Dir(id), true);
        _hub.Changed("vault");
        return ok;
    }

    // ------------------------------------------------------------------ backups

    string Dir(string id) => System.IO.Path.Combine(_root, IdRx.IsMatch(id) ? id : throw new RpcException("invalid-params", "Ungültige Kennung."));

    void NotRunning(VaultLocation l)
    {
        if (l.ItemId != null && _isRunning(l.ItemId)) throw new RpcException("busy", "Das Spiel läuft gerade – Spielstände erst nach dem Beenden sichern oder zurückholen.");
    }

    /// <summary>Files of a place (relative path → full path); links are skipped.</summary>
    static List<(string rel, FileInfo file)> Current(VaultLocation l)
    {
        if (l.Kind == "config") return File.Exists(l.Path) ? new() { (System.IO.Path.GetFileName(l.Path), new FileInfo(l.Path)) } : new();
        if (!Directory.Exists(l.Path)) return new();
        return new DirectoryInfo(l.Path).EnumerateFiles("*", SearchOption.AllDirectories)
            .Where(f => !f.Attributes.HasFlag(FileAttributes.ReparsePoint) && !IsLinkedParent(f, l.Path))
            .Select(f => (System.IO.Path.GetRelativePath(l.Path, f.FullName).Replace('\\', '/'), f)).OrderBy(x => x.Item1, StringComparer.Ordinal).ToList();
    }

    static bool IsLinkedParent(FileInfo f, string root)
    {
        for (var d = f.Directory; d != null && d.FullName.Length > root.Length; d = d.Parent) if (d.Attributes.HasFlag(FileAttributes.ReparsePoint)) return true;
        return false;
    }

    static string Sha(Stream s) => Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();

    public record BackupInfo(string Name, DateTime At, string Reason, long Bytes, long ZipBytes, int Files);

    public List<BackupInfo> Backups(string id)
    {
        Loc(id);
        var d = Dir(id);
        if (!Directory.Exists(d)) return new();
        return new DirectoryInfo(d).GetFiles("*.zip").Where(f => BackupRx.IsMatch(f.Name)).OrderByDescending(f => f.Name).Select(f =>
        {
            var m = Manifest(id, f.Name);
            return new BackupInfo(f.Name, m?.At ?? f.CreationTimeUtc, m?.Reason ?? "", m?.Bytes ?? 0, f.Length, m?.Files.Count ?? 0);
        }).ToList();
    }

    VaultManifest? Manifest(string id, string backup)
    {
        try { return Json.Deserialize<VaultManifest>(File.ReadAllText(System.IO.Path.Combine(Dir(id), backup + ".json"))); } catch { return null; }
    }

    /// <summary>Makes a backup now. Returns null if the place is empty or unchanged since the last backup (when skipUnchanged).</summary>
    public BackupInfo? Backup(string id, string reason, bool skipUnchanged = false, bool prune = true)
    {
        var l = Loc(id);
        NotRunning(l);
        lock (_lock)
        {
            var files = Current(l);
            if (files.Count == 0) { if (skipUnchanged) return null; throw new RpcException("not-found", l.Kind == "config" ? "Die Datei gibt es nicht (mehr)." : "Der Ordner ist leer oder fehlt."); }
            var total = files.Sum(f => f.file.Length);
            if (total > MaxBackupBytes) throw new RpcException("too-large", "Mehr als 2 GB – zu groß für den Tresor, deshalb nicht gesichert.");
            var entries = new List<VaultEntry>();
            foreach (var (rel, f) in files) { using var s = f.OpenRead(); entries.Add(new VaultEntry(rel, f.Length, Sha(s), f.LastWriteTimeUtc)); }
            if (skipUnchanged && Backups(id).FirstOrDefault() is { } last && Manifest(id, last.Name) is { } lm
                && lm.Files.Select(x => x.P + x.Sha).SequenceEqual(entries.Select(x => x.P + x.Sha))) return null;
            var d = Dir(id);
            Directory.CreateDirectory(d);
            var at = _now();
            var name = $"{at:yyyyMMdd-HHmmss-fff}.zip";
            while (File.Exists(System.IO.Path.Combine(d, name))) { at = at.AddMilliseconds(1); name = $"{at:yyyyMMdd-HHmmss-fff}.zip"; }
            var path = System.IO.Path.Combine(d, name);
            using (var zip = ZipFile.Open(path, ZipArchiveMode.Create))
                foreach (var (rel, f) in files) zip.CreateEntryFromFile(f.FullName, rel, CompressionLevel.Optimal);
            var manifest = new VaultManifest(Clean(reason) ?? "Sicherung", at, total, entries);
            File.WriteAllText(path + ".json", Json.Serialize(manifest));
            if (prune) Prune(id, l.Keep);
            _hub.Changed("vault");
            return new BackupInfo(name, at, manifest.Reason, total, new FileInfo(path).Length, entries.Count);
        }
    }

    void Prune(string id, int keep)
    {
        var d = Dir(id);
        if (!Directory.Exists(d)) return;
        foreach (var old in new DirectoryInfo(d).GetFiles("*.zip").Where(f => BackupRx.IsMatch(f.Name)).OrderByDescending(f => f.Name).Skip(Math.Max(1, keep)))
        { old.Delete(); File.Delete(old.FullName + ".json"); }
    }

    public bool DeleteBackup(string id, string backup)
    {
        if (!BackupRx.IsMatch(backup)) throw new RpcException("invalid-params", "Ungültige Sicherung.");
        var p = System.IO.Path.Combine(Dir(id), backup);
        if (!File.Exists(p)) return false;
        File.Delete(p); File.Delete(p + ".json");
        _hub.Changed("vault");
        return true;
    }

    string BackupPath(string id, string backup)
    {
        if (!BackupRx.IsMatch(backup)) throw new RpcException("invalid-params", "Ungültige Sicherung.");
        var p = System.IO.Path.Combine(Dir(id), backup);
        return File.Exists(p) ? p : throw new RpcException("not-found", "Sicherung nicht gefunden.");
    }

    /// <summary>Recomputes every file's SHA-256 inside the ZIP and compares it with the list made at backup time.</summary>
    public sealed record VerifyResult(bool Ok, int Files, List<string> Problems);

    public VerifyResult Verify(string id, string backup)
    {
        var path = BackupPath(id, backup);
        var m = Manifest(id, backup);
        if (m == null) return new VerifyResult(false, 0, new() { "Die Prüfliste der Sicherung fehlt." });
        var problems = new List<string>();
        try
        {
            using var zip = ZipFile.OpenRead(path);
            foreach (var e in m.Files)
            {
                var z = zip.GetEntry(e.P);
                if (z == null) { problems.Add($"Fehlt: {e.P}"); continue; }
                using var s = z.Open();
                if (Sha(s) != e.Sha) problems.Add($"Beschädigt: {e.P}");
            }
            foreach (var z in zip.Entries.Where(z => !z.FullName.EndsWith('/') && m.Files.All(f => f.P != z.FullName))) problems.Add($"Nicht in der Prüfliste: {z.FullName}");
        }
        catch (InvalidDataException) { problems.Add("Die ZIP-Datei ist beschädigt."); }
        return new VerifyResult(problems.Count == 0, m.Files.Count, problems);
    }

    /// <summary>What a restore would change – shown before anything is written.</summary>
    public object Preview(string id, string backup)
    {
        var l = Loc(id);
        BackupPath(id, backup);
        var m = Manifest(id, backup) ?? throw new RpcException("broken", "Die Prüfliste der Sicherung fehlt – nicht wiederherstellbar.");
        var now = Current(l).ToDictionary(x => x.rel, x => x.file, StringComparer.Ordinal);
        var changed = new List<object>(); var back = new List<string>(); var removed = new List<string>(); var same = 0; var newer = 0;
        foreach (var e in m.Files)
        {
            if (!now.TryGetValue(e.P, out var f)) { back.Add(e.P); continue; }
            string sha; using (var s = f.OpenRead()) sha = Sha(s);
            if (sha == e.Sha) { same++; continue; }
            var isNewer = f.LastWriteTimeUtc > e.Mtime;
            if (isNewer) newer++;
            changed.Add(new { path = e.P, current = f.LastWriteTimeUtc, backup = e.Mtime, currentIsNewer = isNewer });
        }
        foreach (var p in now.Keys.Where(p => m.Files.All(e => e.P != p))) removed.Add(p);
        var cloud = l.Source == "steam-cloud" || Regex.IsMatch(l.Path, @"[\\/]userdata[\\/]\d+[\\/]\d+[\\/]remote$");
        return new
        {
            backup, at = m.At, reason = m.Reason, same, changed, back, removed, newerNow = newer, running = l.ItemId != null && _isRunning(l.ItemId), cloud,
            note = cloud ? "Steam-Cloud: Nach dem Wiederherstellen kann Steam beim nächsten Start fragen, welche Version gelten soll – dann „lokale Dateien“ wählen." : null,
        };
    }

    /// <summary>Puts a backup back: check it, back up the current state, write into a side folder, then swap.</summary>
    public object Restore(string id, string backup)
    {
        var l = Loc(id);
        NotRunning(l);
        var path = BackupPath(id, backup);
        var check = Verify(id, backup);
        if (!check.Ok) throw new RpcException("broken", "Die Sicherung ist beschädigt – nichts geändert. " + string.Join(", ", check.Problems.Take(3)));
        lock (_lock)
        {
            // The safety copy must not push the backup being restored out (old ones are removed only afterwards).
            var when = Manifest(id, backup)?.At.ToLocalTime().ToString("dd.MM.yyyy HH:mm") ?? backup;
            var before = Current(l).Count > 0 ? Backup(id, $"Vor dem Wiederherstellen der Sicherung vom {when}", prune: false) : null;
            using var zip = ZipFile.OpenRead(path);
            if (l.Kind == "config")
            {
                var e = zip.Entries.Single(x => !x.FullName.EndsWith('/'));
                var tmp = l.Path + ".nexus-neu";
                e.ExtractToFile(tmp, true);
                File.Move(tmp, l.Path, true);
            }
            else
            {
                var side = l.Path.TrimEnd('\\', '/') + ".nexus-neu";
                var old = l.Path.TrimEnd('\\', '/') + ".nexus-alt";
                if (Directory.Exists(side)) Directory.Delete(side, true);
                Directory.CreateDirectory(side);
                var sideRoot = System.IO.Path.GetFullPath(side) + System.IO.Path.DirectorySeparatorChar;
                foreach (var e in zip.Entries.Where(x => !x.FullName.EndsWith('/')))
                {
                    var target = System.IO.Path.GetFullPath(System.IO.Path.Combine(side, e.FullName));
                    if (!target.StartsWith(sideRoot, StringComparison.OrdinalIgnoreCase)) { Directory.Delete(side, true); throw new RpcException("broken", "Sicherung enthält ungültige Pfade – nichts geändert."); }
                    Directory.CreateDirectory(System.IO.Path.GetDirectoryName(target)!);
                    e.ExtractToFile(target, true);
                }
                if (Directory.Exists(old)) Directory.Delete(old, true);
                if (Directory.Exists(l.Path)) Directory.Move(l.Path, old);
                Directory.Move(side, l.Path);
                if (Directory.Exists(old)) Directory.Delete(old, true);
            }
            Log.Info("vault", $"{l.Name}: {backup} wiederhergestellt");
            Prune(id, Math.Max(l.Keep, 2));
            _hub.Changed("vault");
            return new { restored = backup, safety = before?.Name };
        }
    }

    // ------------------------------------------------------------------ compare (configuration files)

    string ReadText(VaultLocation l, string which)
    {
        if (which == "current") return l.Kind == "config" && File.Exists(l.Path) ? File.ReadAllText(l.Path) : throw new RpcException("not-found", "Die Datei gibt es nicht (mehr).");
        using var zip = ZipFile.OpenRead(BackupPath(l.Id, which));
        var e = zip.Entries.Single(x => !x.FullName.EndsWith('/'));
        if (e.Length > MaxConfigBytes) throw new RpcException("too-large", "Zu groß zum Vergleichen.");
        using var r = new StreamReader(e.Open());
        return r.ReadToEnd();
    }

    /// <summary>Compares two versions of a configuration file ("current" or a backup name).</summary>
    public object Diff(string id, string a, string b)
    {
        var l = Loc(id);
        if (l.Kind != "config") throw new RpcException("invalid-params", "Vergleichen gibt es für Konfigurationsdateien.");
        return ConfigDiff.Compare(ReadText(l, a), ReadText(l, b), System.IO.Path.GetExtension(l.Path));
    }

    // ------------------------------------------------------------------ automatic backups

    /// <summary>After a game ended: back up its places with the rule "afterPlay" (only if something changed).</summary>
    public void AfterPlay(string itemId)
    {
        foreach (var l in Locations().Where(x => x.ItemId == itemId && x.Auto == "afterPlay"))
            try { Backup(l.Id, "Automatisch nach dem Spielen", skipUnchanged: true); } catch (Exception ex) { Log.Warn("vault", $"{l.Name}: {ex.Message}"); }
    }

    /// <summary>Called about every hour: places with the rule "daily" whose newest backup is older than a day.</summary>
    public void Daily()
    {
        foreach (var l in Locations().Where(x => x.Auto == "daily"))
            try
            {
                if (Backups(l.Id).FirstOrDefault() is { } last && _now() - last.At < TimeSpan.FromHours(23)) continue;
                if (l.ItemId != null && _isRunning(l.ItemId)) continue;
                Backup(l.Id, "Automatisch (täglich)", skipUnchanged: true);
            }
            catch (Exception ex) { Log.Warn("vault", $"{l.Name}: {ex.Message}"); }
    }

    internal VaultFile Export() => _store.Snapshot();

    /// <summary>From a backup: only places that exist here and lie in an allowed area are taken over.</summary>
    internal void ImportChecked(VaultFile f)
    {
        var ok = f.Locations.Where(l => l != null && IdRx.IsMatch(l.Id ?? "") && l.Kind is "saves" or "config" && Allowed(l.Path) is { } full && full == System.IO.Path.GetFullPath(l.Path).TrimEnd('\\', '/')
            && (l.Kind == "saves" ? Directory.Exists(l.Path) : File.Exists(l.Path)) && !IsLink(l.Path)).Take(100)
            .Select(l => { l.Name = Clean(l.Name) ?? "Spielstände"; l.Auto = l.Auto is "off" or "afterPlay" or "daily" ? l.Auto : "off"; l.Keep = Math.Clamp(l.Keep, 1, 50); if (l.ItemId != null && _library.Get(l.ItemId) == null) l.ItemId = null; return l; }).ToList();
        _store.Replace(new VaultFile { Locations = ok });
        _hub.Changed("vault");
    }

    public object Overview() => new
    {
        locations = Locations().Select(l =>
        {
            var b = Directory.Exists(System.IO.Path.Combine(_root, l.Id)) ? Backups(l.Id) : new();
            var exists = l.Kind == "config" ? File.Exists(l.Path) : Directory.Exists(l.Path);
            return new { l.Id, l.ItemId, game = l.ItemId != null ? _library.Get(l.ItemId)?.Name : null, l.Name, l.Kind, l.Path, l.Auto, l.Keep, l.Source, exists, backups = b.Count, zipBytes = b.Sum(x => x.ZipBytes), last = b.FirstOrDefault()?.At, running = l.ItemId != null && _isRunning(l.ItemId) };
        }).ToList(),
    };
}

/// <summary>Differences between two versions of a settings file: per setting for ini/cfg/json, otherwise per line.</summary>
public static class ConfigDiff
{
    public sealed record Change(string Kind, string Key, string? Old, string? New);

    static Dictionary<string, string>? Keys(string text, string ext)
    {
        if (ext.Equals(".json", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var d = new Dictionary<string, string>();
                void Walk(JsonElement e, string p)
                {
                    if (e.ValueKind == JsonValueKind.Object) foreach (var x in e.EnumerateObject()) Walk(x.Value, p == "" ? x.Name : p + "." + x.Name);
                    else if (e.ValueKind == JsonValueKind.Array) { var i = 0; foreach (var x in e.EnumerateArray()) Walk(x, $"{p}[{i++}]"); }
                    else d[p] = e.ToString();
                }
                Walk(JsonDocument.Parse(text).RootElement, "");
                return d;
            }
            catch (JsonException) { return null; }
        }
        var result = new Dictionary<string, string>();
        var section = ""; int lines = 0, parsed = 0;
        var spaceStyle = ext.Equals(".cfg", StringComparison.OrdinalIgnoreCase) || ext.Equals(".conf", StringComparison.OrdinalIgnoreCase);
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith(';') || line.StartsWith('#') || line.StartsWith("//")) continue;
            lines++;
            if (line.StartsWith('[') && line.EndsWith(']')) { section = line[1..^1].Trim(); parsed++; continue; }
            var m = Regex.Match(line, @"^([^=:\s""]+|""[^""]+"")\s*[=:]\s*(.*)$");
            if (!m.Success && spaceStyle) m = Regex.Match(line, @"^([A-Za-z_][\w.\-]*)\s+(.+)$"); // cfg style: "sensitivity 2.5"
            if (!m.Success) continue;
            parsed++;
            result[(section == "" ? "" : section + ".") + m.Groups[1].Value.Trim('"')] = m.Groups[2].Value.Trim();
        }
        return lines > 0 && parsed * 10 >= lines * 6 ? result : null;
    }

    public static object Compare(string a, string b, string ext)
    {
        var ka = Keys(a, ext); var kb = Keys(b, ext);
        if (ka != null && kb != null)
        {
            var changes = new List<Change>();
            foreach (var k in ka.Keys.Union(kb.Keys).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
            {
                var has1 = ka.TryGetValue(k, out var v1); var has2 = kb.TryGetValue(k, out var v2);
                if (has1 && !has2) changes.Add(new("removed", k, v1, null));
                else if (!has1 && has2) changes.Add(new("added", k, null, v2));
                else if (v1 != v2) changes.Add(new("changed", k, v1, v2));
            }
            return new { mode = "keys", changes, same = ka.Keys.Intersect(kb.Keys).Count(k => ka[k] == kb[k]) };
        }
        return new { mode = "lines", lines = Lines(a.Replace("\r", "").Split('\n'), b.Replace("\r", "").Split('\n')) };
    }

    /// <summary>Line diff (longest common subsequence), unchanged runs shortened to 2 lines of context.</summary>
    static List<object> Lines(string[] a, string[] b)
    {
        if (a.Length * (long)b.Length > 25_000_000) return new() { new { kind = "info", text = "Zu groß für einen Zeilenvergleich." } };
        var lcs = new int[a.Length + 1, b.Length + 1];
        for (var i = a.Length - 1; i >= 0; i--) for (var j = b.Length - 1; j >= 0; j--) lcs[i, j] = a[i] == b[j] ? lcs[i + 1, j + 1] + 1 : Math.Max(lcs[i + 1, j], lcs[i, j + 1]);
        var ops = new List<(string kind, string text, int la, int lb)>();
        int x = 0, y = 0;
        while (x < a.Length && y < b.Length)
        {
            if (a[x] == b[y]) { ops.Add(("same", a[x], x + 1, y + 1)); x++; y++; }
            else if (lcs[x + 1, y] >= lcs[x, y + 1]) { ops.Add(("del", a[x], x + 1, 0)); x++; }
            else { ops.Add(("add", b[y], 0, y + 1)); y++; }
        }
        while (x < a.Length) { ops.Add(("del", a[x], x + 1, 0)); x++; }
        while (y < b.Length) { ops.Add(("add", b[y], 0, y + 1)); y++; }
        var keep = new bool[ops.Count];
        for (var i = 0; i < ops.Count; i++) if (ops[i].kind != "same") for (var k = Math.Max(0, i - 2); k <= Math.Min(ops.Count - 1, i + 2); k++) keep[k] = true;
        var result = new List<object>();
        var skipped = 0;
        for (var i = 0; i < ops.Count; i++)
        {
            if (!keep[i]) { skipped++; continue; }
            if (skipped > 0) { result.Add(new { kind = "skip", text = $"{skipped} gleiche Zeilen" }); skipped = 0; }
            result.Add(new { kind = ops[i].kind, text = ops[i].text.Length > 300 ? ops[i].text[..300] + "…" : ops[i].text, a = ops[i].la, b = ops[i].lb });
        }
        if (skipped > 0) result.Add(new { kind = "skip", text = $"{skipped} gleiche Zeilen" });
        return result.Take(2000).ToList();
    }
}
