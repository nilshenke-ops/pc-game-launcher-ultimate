using System.IO.Compression;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class ModConfig
{
    public string ItemId { get; set; } = "";
    /// <summary>Mods folder relative to the game's install folder (e.g. "Mods", "BepInEx/plugins").</summary>
    public string ModsPath { get; set; } = "";
}

public sealed class ModsFile { public List<ModConfig> Games { get; set; } = new(); }

public sealed record ModEntry(string Name, bool Folder, long Size, DateTime Modified, bool Enabled);
public sealed record ModBackup(string Name, long Size, DateTime At, string Reason);

/// <summary>
/// Folder-based mods for a game: switch mods on/off (moved to a "&lt;Mods&gt;.nexus-aus" folder next to it), install a
/// ZIP from the exchange folder and remove mods – before every install, removal and restore the whole mods folder is
/// saved as a ZIP (last 5 per game). Nothing is ever run; changes are refused while the game is running.
/// </summary>
public sealed class ModService
{
    public const long MaxBackupBytes = 2L * 1024 * 1024 * 1024;
    public const long MaxZipBytes = 1L * 1024 * 1024 * 1024;
    public const int KeepBackups = 5;
    public static readonly string[] KnownFolders = { "Mods", "mods", "BepInEx/plugins", "Data/Mods", "Content/Paks/~mods", "addons", "plugins", "resourcepacks" };

    readonly JsonStore<ModsFile> _store;
    readonly string _backupRoot;
    readonly LibraryService _library;
    readonly TransferService _transfer;
    readonly Func<string, bool> _isRunning;
    readonly IHub _hub;
    readonly object _lock = new();

    public ModService(AppPaths paths, LibraryService library, TransferService transfer, Func<string, bool> isRunning, IHub hub)
    {
        _store = new JsonStore<ModsFile>(paths.File("mods.json"));
        _backupRoot = Path.Combine(paths.DataDir, "mod-backups");
        _library = library; _transfer = transfer; _isRunning = isRunning; _hub = hub;
    }

    LibraryItem Game(string itemId)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        if (string.IsNullOrEmpty(item.InstallDir) || !Directory.Exists(item.InstallDir)) throw new RpcException("not-found", "Der Installationsordner des Spiels ist nicht bekannt oder fehlt.");
        return item;
    }

    /// <summary>The mods folder must lie inside the game's install folder (no "..", no absolute paths, no links).</summary>
    public static string Resolve(string installDir, string modsPath)
    {
        if (string.IsNullOrWhiteSpace(modsPath) || Path.IsPathRooted(modsPath) || Regex.IsMatch(modsPath, @"^[A-Za-z]:|^[\\/]") || modsPath.Length > 200 || Regex.IsMatch(modsPath, @"(^|[\\/])\.\.([\\/]|$)"))
            throw new RpcException("invalid-params", "Der Mod-Ordner muss ein Unterordner des Spiels sein (z. B. „Mods“).");
        var root = Path.GetFullPath(installDir).TrimEnd('\\', '/') + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(root, modsPath.Replace('\\', Path.DirectorySeparatorChar).Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new RpcException("invalid-params", "Der Mod-Ordner muss ein Unterordner des Spiels sein.");
        return full.TrimEnd(Path.DirectorySeparatorChar);
    }

    static string Disabled(string modsDir) => modsDir + ".nexus-aus";

    (LibraryItem item, string dir) Dir(string itemId)
    {
        var item = Game(itemId);
        var cfg = _store.Get(f => f.Games.FirstOrDefault(g => g.ItemId == itemId)) ?? throw new RpcException("not-configured", "Für dieses Spiel ist noch kein Mod-Ordner eingestellt.");
        var dir = Resolve(item.InstallDir!, cfg.ModsPath);
        if (Directory.Exists(dir) && new DirectoryInfo(dir).Attributes.HasFlag(FileAttributes.ReparsePoint)) throw new RpcException("invalid-params", "Der Mod-Ordner ist eine Verknüpfung – aus Sicherheitsgründen nicht unterstützt.");
        return (item, dir);
    }

    void NotRunning(LibraryItem item)
    {
        if (_isRunning(item.Id)) throw new RpcException("busy", $"{item.Name} läuft gerade – Mods erst nach dem Beenden ändern.");
    }

    public object Overview() => new
    {
        games = _library.List().Where(i => i.Kind == ItemKind.Game && !string.IsNullOrEmpty(i.InstallDir)).Select(i =>
        {
            var cfg = _store.Get(f => f.Games.FirstOrDefault(g => g.ItemId == i.Id));
            return new { itemId = i.Id, i.Name, modsPath = cfg?.ModsPath, installed = Directory.Exists(i.InstallDir) };
        }).OrderBy(g => g.Name).ToList(),
    };

    /// <summary>Folders inside the game that look like mod folders – suggestions for the setup.</summary>
    public List<string> Suggest(string itemId)
    {
        var item = Game(itemId);
        return KnownFolders.Where(f => Directory.Exists(Path.Combine(item.InstallDir!, f))).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public void Configure(string itemId, string modsPath)
    {
        var item = Game(itemId);
        Resolve(item.InstallDir!, modsPath);
        _store.Update(f => { f.Games.RemoveAll(g => g.ItemId == itemId); f.Games.Add(new ModConfig { ItemId = itemId, ModsPath = modsPath.Trim().Replace('\\', '/') }); });
        _hub.Changed("mods");
    }

    static long SizeOf(FileSystemInfo e) => e is FileInfo f ? f.Length : StorageService.FolderSize(e.FullName).bytes;

    public object List(string itemId)
    {
        var (item, dir) = Dir(itemId);
        IEnumerable<ModEntry> Read(string d, bool enabled) => !Directory.Exists(d) ? Enumerable.Empty<ModEntry>()
            : new DirectoryInfo(d).EnumerateFileSystemInfos().Where(e => !e.Attributes.HasFlag(FileAttributes.ReparsePoint)).Take(500)
                .Select(e => new ModEntry(e.Name, e is DirectoryInfo, SizeOf(e), e.LastWriteTimeUtc, enabled));
        var mods = Read(dir, true).Concat(Read(Disabled(dir), false)).OrderBy(m => m.Name, StringComparer.OrdinalIgnoreCase).ToList();
        return new { itemId, game = item.Name, modsPath = _store.Get(f => f.Games.First(g => g.ItemId == itemId).ModsPath), exists = Directory.Exists(dir), running = _isRunning(itemId), mods, backups = Backups(itemId) };
    }

    static string SafeEntry(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name is "." or ".." || name.Length > 200)
            throw new RpcException("invalid-params", "Ungültiger Mod-Name.");
        return name;
    }

    public void Toggle(string itemId, string name, bool enabled)
    {
        var (item, dir) = Dir(itemId);
        NotRunning(item);
        name = SafeEntry(name);
        lock (_lock)
        {
            var from = Path.Combine(enabled ? Disabled(dir) : dir, name);
            var to = Path.Combine(enabled ? dir : Disabled(dir), name);
            if (!File.Exists(from) && !Directory.Exists(from)) throw new RpcException("not-found", "Mod nicht gefunden.");
            if (File.Exists(to) || Directory.Exists(to)) throw new RpcException("conflict", "Dort liegt schon eine Mod mit diesem Namen.");
            Directory.CreateDirectory(Path.GetDirectoryName(to)!);
            if (Directory.Exists(from)) Directory.Move(from, to); else File.Move(from, to);
        }
        _hub.Changed("mods");
    }

    /// <summary>What a ZIP from the exchange folder would add or overwrite – shown before installing.</summary>
    public object Preview(string itemId, string zipName)
    {
        var (_, dir) = Dir(itemId);
        using var zip = OpenZip(zipName, out _);
        var files = Entries(zip, dir).ToList();
        return new { files = files.Count, bytes = files.Sum(f => f.entry.Length), overwrite = files.Where(f => File.Exists(f.target)).Select(f => Path.GetRelativePath(dir, f.target)).Take(50).ToList() };
    }

    ZipArchive OpenZip(string zipName, out long size)
    {
        var path = Path.Combine(_transfer.Folder, Path.GetFileName(zipName));
        if (Path.GetFileName(zipName) != zipName || !File.Exists(path) || !zipName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            throw new RpcException("not-found", "ZIP-Datei im Austausch-Ordner nicht gefunden (erst unter „Dateien“ an den PC senden).");
        size = new FileInfo(path).Length;
        if (size > MaxZipBytes) throw new RpcException("too-large", "Höchstens 1 GB pro Mod-ZIP.");
        try { return ZipFile.OpenRead(path); } catch (InvalidDataException) { throw new RpcException("invalid-params", "Keine gültige ZIP-Datei."); }
    }

    /// <summary>Every file of the ZIP with its target – entries that would land outside the mods folder are refused.</summary>
    static IEnumerable<(ZipArchiveEntry entry, string target)> Entries(ZipArchive zip, string dir)
    {
        var root = Path.GetFullPath(dir) + Path.DirectorySeparatorChar;
        long total = 0;
        foreach (var e in zip.Entries)
        {
            if (e.FullName.EndsWith('/') || e.FullName.EndsWith('\\')) continue; // folder entry
            var target = Path.GetFullPath(Path.Combine(root, e.FullName.Replace('\\', '/').TrimStart('/')));
            if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new RpcException("invalid-params", $"Die ZIP-Datei enthält einen unzulässigen Pfad („{e.FullName}“) – nicht installiert.");
            total += e.Length;
            if (total > 4L * MaxZipBytes) throw new RpcException("too-large", "Entpackt zu groß (über 4 GB).");
            yield return (e, target);
        }
    }

    public object Install(string itemId, string zipName, bool overwrite)
    {
        var (item, dir) = Dir(itemId);
        NotRunning(item);
        using var zip = OpenZip(zipName, out _);
        var files = Entries(zip, dir).ToList(); // checks every path before anything is written
        var clash = files.Where(f => File.Exists(f.target)).ToList();
        if (clash.Count > 0 && !overwrite) throw new RpcException("conflict", $"{clash.Count} Datei(en) würden überschrieben – erst die Vorschau ansehen und bestätigen.");
        var backup = Backup(itemId, dir, $"Vor dem Installieren von {zipName}");
        lock (_lock)
        {
            foreach (var (entry, target) in files)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                entry.ExtractToFile(target, overwrite: true);
            }
        }
        _hub.Changed("mods");
        return new { installed = files.Count, backup = backup?.Name };
    }

    public object Remove(string itemId, string name)
    {
        var (item, dir) = Dir(itemId);
        NotRunning(item);
        name = SafeEntry(name);
        var path = new[] { Path.Combine(dir, name), Path.Combine(Disabled(dir), name) }.FirstOrDefault(p => File.Exists(p) || Directory.Exists(p))
            ?? throw new RpcException("not-found", "Mod nicht gefunden.");
        var backup = Backup(itemId, dir, $"Vor dem Entfernen von {name}");
        lock (_lock) { if (Directory.Exists(path)) Directory.Delete(path, true); else File.Delete(path); }
        _hub.Changed("mods");
        return new { backup = backup?.Name };
    }

    // ------------------------------------------------------------------ backups

    string BackupDir(string itemId) => Path.Combine(_backupRoot, Regex.Replace(itemId, "[^A-Za-z0-9_-]", "_"));

    public List<ModBackup> Backups(string itemId)
    {
        var d = BackupDir(itemId);
        if (!Directory.Exists(d)) return new();
        return new DirectoryInfo(d).GetFiles("*.zip").OrderByDescending(f => f.Name).Select(f =>
        {
            var reason = File.Exists(f.FullName + ".txt") ? File.ReadAllText(f.FullName + ".txt") : "";
            return new ModBackup(f.Name, f.Length, f.CreationTimeUtc, reason);
        }).ToList();
    }

    /// <summary>The whole mods folder (switched-off mods included) as a ZIP. Null if there is nothing to save.</summary>
    ModBackup? Backup(string itemId, string dir, string reason)
    {
        var sources = new[] { (dir, "aktiv"), (Disabled(dir), "aus") }.Where(x => Directory.Exists(x.Item1)).ToList();
        if (sources.Count == 0) return null;
        if (sources.Sum(s => StorageService.FolderSize(s.Item1).bytes) > MaxBackupBytes) throw new RpcException("too-large", "Der Mod-Ordner ist größer als 2 GB – zu groß für eine automatische Sicherung, deshalb nichts geändert.");
        var bd = BackupDir(itemId);
        Directory.CreateDirectory(bd);
        var name = $"{DateTime.Now:yyyyMMdd-HHmmss-fff}.zip";
        var path = Path.Combine(bd, name);
        using (var zip = ZipFile.Open(path, ZipArchiveMode.Create))
            foreach (var (src, prefix) in sources)
                foreach (var f in new DirectoryInfo(src).EnumerateFiles("*", SearchOption.AllDirectories).Where(f => !f.Attributes.HasFlag(FileAttributes.ReparsePoint)))
                    zip.CreateEntryFromFile(f.FullName, prefix + "/" + Path.GetRelativePath(src, f.FullName).Replace('\\', '/'), CompressionLevel.Fastest);
        File.WriteAllText(path + ".txt", reason);
        foreach (var old in new DirectoryInfo(bd).GetFiles("*.zip").OrderByDescending(f => f.Name).Skip(KeepBackups)) { old.Delete(); File.Delete(old.FullName + ".txt"); }
        return new ModBackup(name, new FileInfo(path).Length, DateTime.UtcNow, reason);
    }

    /// <summary>Puts a backup back: the current state is saved first, then the mods folder is replaced by the backup.</summary>
    public object Restore(string itemId, string backupName)
    {
        var (item, dir) = Dir(itemId);
        NotRunning(item);
        if (!Regex.IsMatch(backupName, @"^\d{8}-\d{6}-\d{3}\.zip$")) throw new RpcException("invalid-params", "Ungültige Sicherung.");
        var path = Path.Combine(BackupDir(itemId), backupName);
        if (!File.Exists(path)) throw new RpcException("not-found", "Sicherung nicht gefunden.");
        var before = Backup(itemId, dir, $"Vor dem Zurückholen von {backupName}");
        lock (_lock)
        {
            using var zip = ZipFile.OpenRead(path);
            // Check every path first, then replace.
            var plan = zip.Entries.Where(e => !e.FullName.EndsWith('/')).Select(e =>
            {
                var parts = e.FullName.Split('/', 2);
                var baseDir = parts[0] == "aus" ? Disabled(dir) : dir;
                var target = Path.GetFullPath(Path.Combine(baseDir, parts.Length > 1 ? parts[1] : ""));
                if (!target.StartsWith(Path.GetFullPath(baseDir) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new RpcException("invalid-params", "Sicherung beschädigt.");
                return (e, target);
            }).ToList();
            foreach (var d in new[] { dir, Disabled(dir) }.Where(Directory.Exists)) Directory.Delete(d, true);
            Directory.CreateDirectory(dir);
            foreach (var (e, target) in plan) { Directory.CreateDirectory(Path.GetDirectoryName(target)!); e.ExtractToFile(target, true); }
        }
        _hub.Changed("mods");
        return new { restored = backupName, backup = before?.Name };
    }
}
