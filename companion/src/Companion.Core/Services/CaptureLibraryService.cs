using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public sealed class CaptureFolder
{
    public string Path { get; set; } = "";
    public string Label { get; set; } = "";
    /// <summary>"user" (added at the PC), "obs" (where OBS saved a recording), "auto" (Windows/Steam default), "auto-games" (only files of known games).</summary>
    public string Source { get; set; } = "user";
}

public sealed class CaptureMeta
{
    public bool Favorite { get; set; }
    public List<string> Tags { get; set; } = new();
    public string? Category { get; set; }
}

public sealed class CaptureFile
{
    public List<CaptureFolder> Folders { get; set; } = new();
    public Dictionary<string, CaptureMeta> Meta { get; set; } = new();
}

public sealed record CaptureItem(string Id, string Name, string Folder, string Kind, long Size, DateTime Taken, string? Game, string? ItemId, bool Favorite, List<string> Tags, string? Category = null)
{
    internal string FullPath { get; init; } = "";
}

/// <summary>
/// Screenshots and clips in known folders (Windows Game Bar, NVIDIA, Steam, Medal, OBS and folders added at the PC). Only picture
/// and video files are listed – nothing else of a folder is visible. Thumbnails come from Windows itself; deleting moves a
/// file to the recycle bin (never a permanent delete).
/// </summary>
public sealed class CaptureLibraryService
{
    public const int MaxFiles = 5000;
    public const int MaxDepth = 3;
    static readonly HashSet<string> Images = new(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".jxr" };
    static readonly HashSet<string> Videos = new(StringComparer.OrdinalIgnoreCase) { ".mp4", ".mkv", ".webm", ".mov", ".avi", ".flv" };
    static readonly Regex SteamShot = new(@"[\\/]760[\\/]remote[\\/](\d+)[\\/]screenshots", RegexOptions.IgnoreCase);
    static readonly Regex Tag = new(@"^[\p{L}\p{N} _\-]{1,24}$");
    static readonly Regex Category = new(@"^[\p{L}\p{N} _\-&]{1,30}$");

    readonly JsonStore<CaptureFile> _store;
    readonly string _thumbDir;
    readonly LibraryService _library;
    readonly IPlatform _platform;
    readonly IHub _hub;
    readonly Func<IEnumerable<CaptureFolder>> _autoFolders;
    readonly SemaphoreSlim _scan = new(1, 1);
    List<CaptureItem> _index = new();
    DateTime _scannedAt;
    bool _truncated;

    public CaptureLibraryService(AppPaths paths, LibraryService library, IPlatform platform, IHub hub, Func<IEnumerable<CaptureFolder>>? autoFolders = null)
    {
        _store = new JsonStore<CaptureFile>(paths.File("captures.json"));
        _thumbDir = Path.Combine(paths.DataDir, "thumbs");
        _library = library; _platform = platform; _hub = hub;
        _autoFolders = autoFolders ?? DefaultFolders;
    }

    /// <summary>Where Windows, NVIDIA and Steam put screenshots and clips by default – only folders that exist.</summary>
    public static IEnumerable<CaptureFolder> DefaultFolders()
    {
        var pics = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
        var vids = Environment.GetFolderPath(Environment.SpecialFolder.MyVideos);
        var list = new List<CaptureFolder>();
        if (pics.Length > 0) list.Add(new() { Path = Path.Combine(pics, "Screenshots"), Label = "Bildschirmfotos (Windows)", Source = "auto" });
        // Medal before "Videos": its folder may lie inside it and the first folder names the source.
        foreach (var m in MedalFolders(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            DriveRoots().Select(r => Path.Combine(r, "Medal")).Append(vids.Length > 0 ? Path.Combine(vids, "Medal") : "")))
            list.Add(new() { Path = m, Label = MedalLabel, Source = "auto" });
        if (vids.Length > 0)
        {
            list.Add(new() { Path = Path.Combine(vids, "Captures"), Label = "Xbox Game Bar", Source = "auto" });
            list.Add(new() { Path = vids, Label = "Videos (NVIDIA)", Source = "auto-games" }); // only files of known games, not private videos
        }
        foreach (var root in SteamDetector.DefaultRoots())
        {
            var userdata = Path.Combine(root, "userdata");
            if (!Directory.Exists(userdata)) continue;
            try { foreach (var u in Directory.EnumerateDirectories(userdata)) list.Add(new() { Path = Path.Combine(u, "760", "remote"), Label = "Steam", Source = "auto" }); }
            catch { /* not readable */ }
        }
        return list.Where(f => Directory.Exists(f.Path));
    }

    public const string MedalLabel = "Medal";
    /// <summary>Medal's own sub-folders that hold no captures of the user (preview pictures, editor and cache files).</summary>
    static readonly HashSet<string> MedalSkip = new(StringComparer.OrdinalIgnoreCase) { "Thumbnails", "Thumbs", "Cache", "Temp", "Editor", "Logs" };

    static IEnumerable<string> DriveRoots()
    {
        try { return DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Fixed && d.IsReady).Select(d => d.RootDirectory.FullName).ToList(); }
        catch { return Array.Empty<string>(); }
    }

    /// <summary>
    /// Medal's capture folder: the one chosen in Medal (read from Medal's own files in %APPDATA%\Medal\store – folder
    /// settings and the folders of clips it knows) plus the usual places (C:\Medal, Videos\Medal). Only folders that exist.
    /// </summary>
    public static List<string> MedalFolders(string appData, IEnumerable<string> candidates)
    {
        var found = new List<string>();
        void Add(string? dir)
        {
            if (string.IsNullOrWhiteSpace(dir) || found.Count >= 8) return;
            try { dir = Path.GetFullPath(dir).TrimEnd('/', '\\'); } catch { return; }
            if (Directory.Exists(dir) && !found.Contains(dir, StringComparer.OrdinalIgnoreCase)) found.Add(dir);
        }
        var store = appData.Length > 0 ? Path.Combine(appData, "Medal", "store") : "";
        if (store.Length > 0 && Directory.Exists(store))
            foreach (var file in SafeFiles(store))
            {
                try
                {
                    if (new FileInfo(file).Length > 50_000_000) continue;
                    var reader = new System.Text.Json.Utf8JsonReader(File.ReadAllBytes(file), new System.Text.Json.JsonReaderOptions { AllowTrailingCommas = true, CommentHandling = System.Text.Json.JsonCommentHandling.Skip });
                    string prop = "";
                    while (reader.Read())
                    {
                        if (reader.TokenType == System.Text.Json.JsonTokenType.PropertyName) { prop = reader.GetString() ?? ""; continue; }
                        if (reader.TokenType != System.Text.Json.JsonTokenType.String) continue;
                        var v = reader.GetString();
                        if (v == null || v.Length < 4 || v.Length > 400 || !Path.IsPathFullyQualified(v)) continue;
                        if (Images.Contains(Path.GetExtension(v)) || Videos.Contains(Path.GetExtension(v)))
                        {
                            // A clip Medal knows: its capture folder is the parent of "Clips"/"Screenshots".
                            if (!File.Exists(v)) continue;
                            var d = new DirectoryInfo(Path.GetDirectoryName(v)!);
                            for (var up = d; up != null; up = up.Parent)
                                if (up.Name.Equals("Clips", StringComparison.OrdinalIgnoreCase) || up.Name.Equals("Screenshots", StringComparison.OrdinalIgnoreCase)) { d = up.Parent ?? up; break; }
                            if (!MedalSkip.Contains(d.Name)) Add(d.FullName);
                        }
                        else if (Regex.IsMatch(prop, "folder|directory|dir$|location|savepath|clippath", RegexOptions.IgnoreCase) && !Regex.IsMatch(prop, "temp|cache|log|thumb|install|download", RegexOptions.IgnoreCase))
                            Add(v);
                    }
                }
                catch { /* not readable or no JSON – Medal's format is not documented */ }
            }
        foreach (var c in candidates) Add(c);
        // Nested folders (C:\Medal and C:\Medal\Clips) are listed once.
        return found.Where(f => !found.Any(o => o != f && f.StartsWith(o + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))).ToList();
    }

    static IEnumerable<string> SafeFiles(string dir)
    {
        try { return Directory.EnumerateFiles(dir, "*.json", SearchOption.TopDirectoryOnly).Take(30).ToList(); }
        catch { return Array.Empty<string>(); }
    }

    public static string IdOf(string fullPath) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(fullPath.ToLowerInvariant())))[..16].ToLowerInvariant();

    public List<CaptureFolder> Folders()
    {
        var own = _store.Snapshot().Folders;
        return own.Concat(_autoFolders()).GroupBy(f => Path.GetFullPath(f.Path).TrimEnd('/', '\\'), StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
    }

    /// <summary>The index (scanned again in the background when older than two minutes).</summary>
    public object List()
    {
        if (DateTime.UtcNow - _scannedAt > TimeSpan.FromMinutes(2)) _ = ScanAsync();
        var meta = _store.Snapshot().Meta;
        var items = _index.Select(i => meta.TryGetValue(i.Id, out var m) ? i with { Favorite = m.Favorite, Tags = m.Tags, Category = m.Category } : i).ToList();
        return new
        {
            items,
            folders = Folders().Select(f => new { f.Label, f.Source, path = f.Path, exists = Directory.Exists(f.Path) }),
            scannedAt = _scannedAt == default ? (DateTime?)null : _scannedAt,
            scanning = _scan.CurrentCount == 0,
            truncated = _truncated,
            canRecycle = _platform.Media.CanRecycle,
        };
    }

    public async Task ScanAsync()
    {
        if (!await _scan.WaitAsync(0)) return;
        try
        {
            _hub.Changed("captures");
            await Task.Run(Scan);
        }
        catch (Exception ex) { Log.Warn("captures", ex.Message); }
        finally { _scan.Release(); _hub.Changed("captures"); }
    }

    /// <summary>Synchronous scan (tests and the background task).</summary>
    public void Scan()
    {
        var games = _library.List().Where(i => i.Kind == ItemKind.Game).ToList();
        var result = new List<CaptureItem>();
        var seen = new HashSet<string>();
        var truncated = false;
        foreach (var folder in Folders())
        {
            if (!Directory.Exists(folder.Path)) continue;
            var stack = new Stack<(string dir, int depth)>(); stack.Push((folder.Path, 0));
            while (stack.Count > 0 && !truncated)
            {
                var (dir, depth) = stack.Pop();
                IEnumerable<FileSystemInfo> entries;
                try { entries = new DirectoryInfo(dir).EnumerateFileSystemInfos().ToList(); } catch { continue; }
                foreach (var e in entries)
                {
                    if (e.Attributes.HasFlag(FileAttributes.ReparsePoint) || e.Attributes.HasFlag(FileAttributes.Hidden) || e.Name.StartsWith('.')) continue;
                    if (e is DirectoryInfo) { if (depth < MaxDepth && !(folder.Label == MedalLabel && MedalSkip.Contains(e.Name))) stack.Push((e.FullName, depth + 1)); continue; }
                    var ext = Path.GetExtension(e.Name);
                    var kind = Images.Contains(ext) ? "image" : Videos.Contains(ext) ? "video" : null;
                    if (kind == null || e is not FileInfo fi) continue;
                    if (folder.Label == "Steam" && fi.DirectoryName?.EndsWith("thumbnails", StringComparison.OrdinalIgnoreCase) == true) continue; // Steam's own small copies
                    if (!seen.Add(fi.FullName.ToLowerInvariant())) continue;
                    if (result.Count >= MaxFiles) { truncated = true; break; }
                    var (game, itemId) = GuessGame(fi.FullName, fi.Name, games);
                    if (game == null && folder.Label == MedalLabel) game = MedalGame(fi.FullName, folder.Path); // Medal sorts by game folder
                    if (folder.Source == "auto-games" && itemId == null) continue;
                    result.Add(new CaptureItem(IdOf(fi.FullName), fi.Name, folder.Label, kind, fi.Length, fi.LastWriteTimeUtc, game, itemId, false, new()) { FullPath = fi.FullName });
                }
            }
        }
        _index = result.OrderByDescending(r => r.Taken).ToList();
        _truncated = truncated;
        _scannedAt = DateTime.UtcNow;
    }

    static string Clean(string s) => Regex.Replace(s.ToLowerInvariant(), @"[®™©:'’]", "").Trim();

    /// <summary>The game a capture belongs to: Steam's app folder, NVIDIA's game folder or the Game Bar file name. Null if unsure.</summary>
    internal static (string? game, string? itemId) GuessGame(string fullPath, string fileName, List<LibraryItem> games)
    {
        var m = SteamShot.Match(fullPath);
        if (m.Success)
        {
            var hit = games.FirstOrDefault(g => g.Source == LaunchSource.Steam && g.Target == m.Groups[1].Value);
            return hit != null ? (hit.Name, hit.Id) : ($"Steam-App {m.Groups[1].Value}", null);
        }
        var parent = Clean(Path.GetFileName(Path.GetDirectoryName(fullPath) ?? ""));
        var file = Clean(fileName);
        foreach (var g in games.OrderByDescending(g => g.Name.Length))
        {
            var n = Clean(g.Name);
            if (n.Length < 3) continue;
            if (parent == n || (file.StartsWith(n) && (file.Length == n.Length || !char.IsLetterOrDigit(file[n.Length])))) return (g.Name, g.Id);
        }
        return (null, null);
    }

    /// <summary>Medal's game folder (…\Clips\Valorant\clip.mp4 → "Valorant"); null directly in Clips/Screenshots.</summary>
    internal static string? MedalGame(string fullPath, string root)
    {
        var parent = Path.GetDirectoryName(fullPath);
        if (parent == null || string.Equals(parent.TrimEnd('/', '\\'), root.TrimEnd('/', '\\'), StringComparison.OrdinalIgnoreCase)) return null;
        var name = Path.GetFileName(parent);
        return Regex.IsMatch(name, "^(clips|screenshots|videos|uploads|medal|local|bookmarks)$", RegexOptions.IgnoreCase) ? null : name;
    }

    CaptureItem Find(string id)
    {
        if (_index.Count == 0 && _scannedAt == default) Scan();
        return _index.FirstOrDefault(i => i.Id == id) ?? throw new RpcException("not-found", "Aufnahme nicht gefunden (vielleicht verschoben oder gelöscht).");
    }

    /// <summary>Thumbnails for the shown items (max 24 per call), cached on the PC and renewed when the file changes.</summary>
    public Dictionary<string, string?> Thumbs(IEnumerable<string> ids)
    {
        Directory.CreateDirectory(_thumbDir);
        var result = new Dictionary<string, string?>();
        foreach (var id in ids.Distinct().Take(24))
        {
            var item = _index.FirstOrDefault(i => i.Id == id);
            if (item == null) { result[id] = null; continue; }
            var cache = Path.Combine(_thumbDir, $"{id}-{item.Taken.Ticks}.txt");
            try
            {
                if (File.Exists(cache)) { result[id] = File.ReadAllText(cache); continue; }
                var thumb = _platform.Media.Thumbnail(item.FullPath, 320);
                if (thumb != null && thumb.Length < 200_000)
                {
                    foreach (var old in Directory.EnumerateFiles(_thumbDir, id + "-*.txt")) File.Delete(old);
                    File.WriteAllText(cache, thumb);
                }
                result[id] = thumb is { Length: < 200_000 } ? thumb : null;
            }
            catch (Exception ex) { Log.Warn("thumbs", ex.Message); result[id] = null; }
        }
        TrimThumbs();
        return result;
    }

    void TrimThumbs()
    {
        try
        {
            var files = new DirectoryInfo(_thumbDir).GetFiles("*.txt");
            if (files.Length <= 3000) return;
            foreach (var f in files.OrderBy(f => f.LastWriteTimeUtc).Take(files.Length - 3000)) f.Delete();
        }
        catch { /* best effort */ }
    }

    public object Read(string id, long offset, int length)
    {
        var item = Find(id);
        var f = new FileInfo(item.FullPath);
        if (!f.Exists) throw new RpcException("not-found", "Die Datei ist nicht mehr da.");
        if (offset < 0 || offset > f.Length) throw new RpcException("invalid-params", "Ungültige Position.");
        length = Math.Clamp(length, 1, TransferService.MaxChunkBytes);
        var buf = new byte[(int)Math.Min(length, f.Length - offset)];
        using (var fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
        {
            fs.Position = offset;
            var read = 0;
            while (read < buf.Length) { var n = fs.Read(buf, read, buf.Length - read); if (n == 0) break; read += n; }
            if (read < buf.Length) Array.Resize(ref buf, read);
        }
        return new { data = Convert.ToBase64String(buf), size = f.Length, offset, eof = offset + buf.Length >= f.Length };
    }

    /// <summary>Favorite and tags. Kept by id; an id that is not (or no longer) in the index is still accepted, so a change
    /// made on the phone without the PC is not lost when the PC has not scanned yet.</summary>
    public CaptureMeta Update(string id, bool? favorite, List<string>? tags, string? category = null)
    {
        if (!Regex.IsMatch(id, "^[0-9a-f]{16}$")) throw new RpcException("invalid-params", "Ungültige Kennung.");
        List<string>? clean = null;
        if (tags != null)
        {
            clean = tags.Select(t => DeviceStore.Sanitize(t, 24, "")).Where(t => t.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToList();
            if (clean.Any(t => !Tag.IsMatch(t))) throw new RpcException("invalid-params", "Schlagwörter: Buchstaben, Ziffern, Leerzeichen, - und _ (höchstens 24 Zeichen).");
        }
        var cat = category == null ? "" : DeviceStore.Sanitize(category, 200, "");
        if (cat.Length > 0 && (cat.Length > 30 || !Category.IsMatch(cat))) throw new RpcException("invalid-params", "Kategorie: Buchstaben, Ziffern, Leerzeichen, - und _ (höchstens 30 Zeichen).");
        var result = _store.Update(f =>
        {
            if (!f.Meta.TryGetValue(id, out var m)) { if (f.Meta.Count >= 20000) throw new RpcException("invalid-params", "Zu viele markierte Aufnahmen."); m = f.Meta[id] = new(); }
            if (favorite != null) m.Favorite = favorite.Value;
            if (clean != null) m.Tags = clean;
            if (category != null) m.Category = cat.Length == 0 ? null : cat;
            if (!m.Favorite && m.Tags.Count == 0 && m.Category == null) f.Meta.Remove(id);
            return m;
        });
        _hub.Changed("captures");
        return result;
    }

    public const long MaxHashBytes = 2L * 1024 * 1024 * 1024;
    readonly Dictionary<string, (long size, long ticks, string hash)> _hashes = new();

    /// <summary>
    /// SHA-256 of whole files, to find true duplicates (same size alone is not enough). Max 40 per call and 2 GB in total;
    /// a file over that, or one that is gone, gets null. Cached until the file changes. Nothing is deleted here.
    /// </summary>
    public Dictionary<string, string?> Hashes(IEnumerable<string> ids)
    {
        var result = new Dictionary<string, string?>();
        long budget = MaxHashBytes;
        foreach (var id in ids.Distinct().Take(40))
        {
            var item = _index.FirstOrDefault(i => i.Id == id);
            if (item == null) { result[id] = null; continue; }
            try
            {
                var fi = new FileInfo(item.FullPath);
                if (!fi.Exists) { result[id] = null; continue; }
                lock (_hashes)
                    if (_hashes.TryGetValue(id, out var c) && c.size == fi.Length && c.ticks == fi.LastWriteTimeUtc.Ticks) { result[id] = c.hash; continue; }
                if (fi.Length > budget) { result[id] = null; continue; }
                budget -= fi.Length;
                using var fs = new FileStream(fi.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var hash = Convert.ToHexString(SHA256.HashData(fs)).ToLowerInvariant();
                lock (_hashes) _hashes[id] = (fi.Length, fi.LastWriteTimeUtc.Ticks, hash);
                result[id] = hash;
            }
            catch (Exception ex) { Log.Warn("captures", ex.Message); result[id] = null; }
        }
        return result;
    }

    /// <summary>Moves the file to the recycle bin. Where there is none (other systems), nothing is deleted.</summary>
    public void Remove(string id)
    {
        var item = Find(id);
        if (!_platform.Media.CanRecycle) throw new RpcException("not-supported", "Löschen geht nur am Windows-PC (über den Papierkorb).");
        if (!File.Exists(item.FullPath)) throw new RpcException("not-found", "Die Datei ist nicht mehr da.");
        if (!_platform.Media.MoveToRecycleBin(item.FullPath)) throw new RpcException("failed", "Konnte nicht in den Papierkorb verschoben werden (vielleicht gerade geöffnet).");
        _index = _index.Where(i => i.Id != id).ToList();
        _store.Update(f => f.Meta.Remove(id));
        _hub.Changed("captures");
    }

    public void AddFolder(string path, string? label, string source = "user")
    {
        if (string.IsNullOrWhiteSpace(path) || !Path.IsPathFullyQualified(path)) throw new RpcException("invalid-params", "Bitte einen vollständigen Ordnerpfad angeben.");
        var abs = Path.GetFullPath(path);
        var full = abs.TrimEnd('/', '\\');
        if (full.Length == 0 || string.Equals(Path.GetPathRoot(abs)?.TrimEnd('/', '\\'), full, StringComparison.OrdinalIgnoreCase))
            throw new RpcException("invalid-params", "Bitte einen Ordner wählen, nicht ein ganzes Laufwerk.");
        if (!Directory.Exists(full)) throw new RpcException("not-found", "Ordner nicht gefunden.");
        _store.Update(f =>
        {
            if (f.Folders.Any(x => string.Equals(Path.GetFullPath(x.Path).TrimEnd('/', '\\'), full, StringComparison.OrdinalIgnoreCase))) return;
            if (f.Folders.Count >= 20) throw new RpcException("invalid-params", "Höchstens 20 eigene Ordner.");
            f.Folders.Add(new CaptureFolder { Path = full, Label = DeviceStore.Sanitize(label, 40, Path.GetFileName(full)), Source = source });
        });
        _scannedAt = default;
        _hub.Changed("captures");
    }

    /// <summary>OBS told us where it saved a recording or replay: that folder is watched from now on.</summary>
    public void RememberObsFile(string? filePath)
    {
        var dir = filePath == null ? null : Path.GetDirectoryName(filePath);
        if (dir == null || !Directory.Exists(dir)) return;
        try { AddFolder(dir, "OBS", "obs"); } catch (RpcException ex) { Log.Warn("captures", ex.Message); }
    }

    public void RemoveFolder(string path)
    {
        _store.Update(f => f.Folders.RemoveAll(x => string.Equals(x.Path, path, StringComparison.OrdinalIgnoreCase)));
        _scannedAt = default;
        _hub.Changed("captures");
    }

    internal CaptureFile Export() => _store.Snapshot();
    internal void ImportChecked(CaptureFile f)
    {
        var folders = f.Folders.Where(x => !string.IsNullOrWhiteSpace(x.Path) && Path.IsPathFullyQualified(x.Path)).Take(20).ToList();
        var meta = f.Meta.Where(kv => Regex.IsMatch(kv.Key, "^[0-9a-f]{16}$")).Take(20000)
            .ToDictionary(kv => kv.Key, kv => new CaptureMeta { Favorite = kv.Value.Favorite, Tags = kv.Value.Tags.Where(t => Tag.IsMatch(t)).Take(10).ToList() });
        _store.Replace(new CaptureFile { Folders = folders, Meta = meta });
        _scannedAt = default;
        _hub.Changed("captures");
    }
}
