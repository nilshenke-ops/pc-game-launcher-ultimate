using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// One entry of the personal gaming collections (game memory, goals, finds, story, wiki, …). The browser is where it is
/// made and kept – also while the PC is off; the PC keeps a copy so every device sees the same and it is in the backup.
/// The PC does not interpret <see cref="Data"/> (each page owns its fields); it only checks id, kind and size.
/// </summary>
public sealed class JournalEntry
{
    /// <summary>Made in the browser ("j_…"), stable for ever – links between entries use it.</summary>
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    /// <summary>When it was last changed, in ms since 1970 (the device's clock): the newer change wins.</summary>
    public long UpdatedAt { get; set; }
    /// <summary>Deleted entries stay as a marker (without data), so the deletion reaches the other devices.</summary>
    public bool Deleted { get; set; }
    /// <summary>Counter of the PC: a device asks for everything with a higher number than it has seen.</summary>
    public long Rev { get; set; }
    public JsonElement? Data { get; set; }
}

/// <summary>A change that lost against a newer one from another device – kept so nothing is lost silently.</summary>
public sealed class JournalConflict
{
    public string Id { get; set; } = "";
    public string EntryId { get; set; } = "";
    public string Kind { get; set; } = "";
    public long UpdatedAt { get; set; }
    public string By { get; set; } = "";
    public DateTime At { get; set; }
    public JsonElement? Data { get; set; }
}

public sealed class JournalFile
{
    public long Seq { get; set; }
    public List<JournalEntry> Entries { get; set; } = new();
    public List<JournalConflict> Conflicts { get; set; } = new();
}

public sealed class JournalChange
{
    public string Id { get; set; } = "";
    public string Kind { get; set; } = "";
    public long UpdatedAt { get; set; }
    public bool Deleted { get; set; }
    /// <summary>The device's last known version of the entry (its UpdatedAt) – if the PC has a different one, both changed.</summary>
    public long? Base { get; set; }
    public JsonElement? Data { get; set; }
}

public sealed class JournalService
{
    public const int MaxEntries = 20_000, MaxEntryBytes = 256 * 1024, MaxBatch = 200, MaxConflicts = 50, MaxPull = 500;
    public const long MaxTotalBytes = 40L * 1024 * 1024;
    public const int MaxImageBytes = 700 * 1024, MaxImages = 3000;
    public const long MaxImageTotal = 600L * 1024 * 1024;
    static readonly Regex IdRx = new("^j_[A-Za-z0-9_-]{6,40}$");
    static readonly Regex KindRx = new("^[a-z]{2,16}$");
    static readonly Regex ImgRx = new("^img_[A-Za-z0-9_-]{6,40}$");
    static readonly Dictionary<string, string> Mimes = new() { ["image/jpeg"] = ".jpg", ["image/png"] = ".png", ["image/webp"] = ".webp" };

    readonly JsonStore<JournalFile> _store;
    readonly string _imageDir;
    readonly IHub _hub;

    public JournalService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<JournalFile>(paths.File("journal.json"));
        _imageDir = Path.Combine(Path.GetDirectoryName(paths.File("journal.json"))!, "journal-images");
        _hub = hub;
    }

    static RpcException Bad(string m) => new("invalid-params", m);

    static int Size(JsonElement? d) => d is { } e ? e.GetRawText().Length : 0;

    static void Check(JournalChange c)
    {
        if (!IdRx.IsMatch(c.Id ?? "")) throw Bad("Ungültige Eintrags-Kennung.");
        if (!KindRx.IsMatch(c.Kind ?? "")) throw Bad("Ungültige Art.");
        if (c.UpdatedAt <= 0 || c.UpdatedAt > DateTimeOffset.UtcNow.AddDays(2).ToUnixTimeMilliseconds()) throw Bad("Ungültige Änderungszeit (Uhr des Geräts prüfen).");
        if (!c.Deleted && c.Data is not { ValueKind: JsonValueKind.Object }) throw Bad("Eintrag ohne Inhalt.");
        if (Size(c.Data) > MaxEntryBytes) throw Bad("Eintrag ist zu groß (höchstens 256 KB Text – Bilder werden getrennt gespeichert).");
    }

    /// <summary>
    /// Takes the device's changes (newer change wins; a lost one is kept as a conflict copy) and returns everything the
    /// device has not seen yet. Returns the PC's counter, which the device sends back next time.
    /// </summary>
    public object Push(IReadOnlyList<JournalChange> changes, string by)
    {
        if (changes.Count > MaxBatch) throw Bad($"Höchstens {MaxBatch} Änderungen auf einmal.");
        foreach (var c in changes) Check(c);
        var results = new List<object>();
        var changed = _store.UpdateIfChanged(f =>
        {
            var index = f.Entries.Select((e, i) => (e.Id, i)).ToDictionary(x => x.Id, x => x.i);
            var total = f.Entries.Sum(e => (long)Size(e.Data));
            var any = false;
            foreach (var c in changes)
            {
                index.TryGetValue(c.Id, out var i);
                var cur = index.ContainsKey(c.Id) ? f.Entries[i] : null;
                if (cur != null && cur.Kind != c.Kind) { results.Add(new { id = c.Id, status = "refused", reason = "Andere Art unter derselben Kennung." }); continue; }
                if (cur != null && cur.UpdatedAt == c.UpdatedAt && cur.Deleted == c.Deleted) { results.Add(new { id = c.Id, status = "ok", rev = cur.Rev }); continue; }
                // Both devices changed it: the newer one wins, the other one is kept (never lost without a trace).
                var both = cur != null && c.Base != cur.UpdatedAt;
                if (cur != null && cur.UpdatedAt > c.UpdatedAt)
                {
                    if (!c.Deleted) AddConflict(f, c.Id, c.Kind, c.UpdatedAt, by, c.Data);
                    results.Add(new { id = c.Id, status = "older", rev = cur.Rev });
                    any = true;
                    continue;
                }
                if (both && !cur!.Deleted && Size(cur.Data) > 0) AddConflict(f, cur.Id, cur.Kind, cur.UpdatedAt, "PC", cur.Data);
                var delta = (long)Size(c.Deleted ? null : c.Data) - Size(cur?.Data);
                if (cur == null && f.Entries.Count >= MaxEntries) { results.Add(new { id = c.Id, status = "refused", reason = $"Höchstens {MaxEntries} Einträge." }); continue; }
                if (total + delta > MaxTotalBytes) { results.Add(new { id = c.Id, status = "refused", reason = "Speicher für Sammlungen auf dem PC ist voll (40 MB Text)." }); continue; }
                total += delta;
                var e = new JournalEntry { Id = c.Id, Kind = c.Kind, UpdatedAt = c.UpdatedAt, Deleted = c.Deleted, Rev = ++f.Seq, Data = c.Deleted ? null : c.Data };
                if (cur == null) { index[c.Id] = f.Entries.Count; f.Entries.Add(e); } else f.Entries[i] = e;
                results.Add(new { id = c.Id, status = "ok", rev = e.Rev });
                any = true;
            }
            return (any, any);
        });
        if (changed) _hub.Changed("journal");
        return new { results };
    }

    static void AddConflict(JournalFile f, string id, string kind, long updatedAt, string by, JsonElement? data)
    {
        f.Conflicts.Add(new JournalConflict { Id = Ids.New("jc"), EntryId = id, Kind = kind, UpdatedAt = updatedAt, By = by, At = DateTime.UtcNow, Data = data });
        if (f.Conflicts.Count > MaxConflicts) f.Conflicts.RemoveRange(0, f.Conflicts.Count - MaxConflicts);
    }

    /// <summary>Entries changed after <paramref name="since"/> (oldest change first, in pages), deletion markers included.</summary>
    public object Pull(long since) => _store.Get(f =>
    {
        var page = f.Entries.Where(e => e.Rev > since).OrderBy(e => e.Rev).Take(MaxPull).ToList();
        var more = f.Entries.Count(e => e.Rev > since) > page.Count;
        return new { rev = more ? page[^1].Rev : f.Seq, more, entries = page, conflicts = f.Conflicts.Count };
    });

    public List<JournalConflict> Conflicts() => _store.Get(f => f.Conflicts.OrderByDescending(c => c.At).Select(c => new JournalConflict { Id = c.Id, EntryId = c.EntryId, Kind = c.Kind, UpdatedAt = c.UpdatedAt, By = c.By, At = c.At, Data = c.Data }).ToList());

    public void DismissConflict(string id)
    {
        _store.Update(f => f.Conflicts.RemoveAll(c => c.Id == id));
        _hub.Changed("journal");
    }

    public object Stats() => _store.Get(f => new
    {
        entries = f.Entries.Count(e => !e.Deleted),
        bytes = f.Entries.Sum(e => (long)Size(e.Data)),
        images = Directory.Exists(_imageDir) ? Directory.EnumerateFiles(_imageDir).Count() : 0,
        imageBytes = Directory.Exists(_imageDir) ? Directory.EnumerateFiles(_imageDir).Sum(p => new FileInfo(p).Length) : 0,
        conflicts = f.Conflicts.Count,
        byKind = f.Entries.Where(e => !e.Deleted).GroupBy(e => e.Kind).ToDictionary(g => g.Key, g => g.Count()),
    });

    // ------------------------------------------------------------------------------------------------ images

    string? ImagePath(string id) =>
        ImgRx.IsMatch(id) && Directory.Exists(_imageDir) ? Directory.EnumerateFiles(_imageDir, id + ".*").FirstOrDefault() : null;

    /// <summary>Stores a picture the browser already made small. Same id again = nothing to do (pictures never change).</summary>
    public object PutImage(string id, string mime, string base64)
    {
        if (!ImgRx.IsMatch(id)) throw Bad("Ungültige Bild-Kennung.");
        if (!Mimes.TryGetValue(mime, out var ext)) throw Bad("Nur JPEG, PNG oder WebP.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(base64); } catch (FormatException) { throw Bad("Bilddaten ungültig."); }
        if (bytes.Length == 0 || bytes.Length > MaxImageBytes) throw Bad("Bild ist zu groß (höchstens 700 KB – die Website verkleinert es vorher).");
        if (!LooksLike(mime, bytes)) throw Bad("Die Datei ist kein Bild dieses Typs.");
        if (ImagePath(id) != null) return new { id, stored = false };
        Directory.CreateDirectory(_imageDir);
        var files = Directory.EnumerateFiles(_imageDir).Select(p => new FileInfo(p)).ToList();
        if (files.Count >= MaxImages || files.Sum(x => x.Length) + bytes.Length > MaxImageTotal) throw new RpcException("full", "Bilder-Speicher auf dem PC ist voll (600 MB). Nicht mehr genutzte Bilder werden beim Aufräumen entfernt.");
        var path = Path.Combine(_imageDir, id + ext);
        File.WriteAllBytes(path + ".tmp", bytes);
        File.Move(path + ".tmp", path, true);
        return new { id, stored = true };
    }

    static bool LooksLike(string mime, byte[] b) => mime switch
    {
        "image/jpeg" => b.Length > 3 && b[0] == 0xFF && b[1] == 0xD8,
        "image/png" => b.Length > 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47,
        "image/webp" => b.Length > 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P',
        _ => false,
    };

    public object GetImage(string id)
    {
        var p = ImagePath(id) ?? throw new RpcException("not-found", "Bild nicht auf dem PC.");
        var mime = Mimes.First(m => p.EndsWith(m.Value, StringComparison.OrdinalIgnoreCase)).Key;
        return new { id, mime, data = Convert.ToBase64String(File.ReadAllBytes(p)) };
    }

    /// <summary>Which of these pictures the PC already has (the browser uploads only the missing ones).</summary>
    public List<string> HasImages(IEnumerable<string> ids) => ids.Where(id => ImagePath(id) != null).ToList();

    /// <summary>Removes pictures no entry (and no conflict copy) mentions any more. Pictures younger than a day stay: their entry may still be on its way.</summary>
    public int CleanImages(DateTime? nowUtc = null)
    {
        if (!Directory.Exists(_imageDir)) return 0;
        var text = _store.Get(f => string.Join("\n", f.Entries.Where(e => !e.Deleted).Select(e => e.Data?.GetRawText()).Concat(f.Conflicts.Select(c => c.Data?.GetRawText()))));
        var now = nowUtc ?? DateTime.UtcNow;
        var removed = 0;
        foreach (var p in Directory.EnumerateFiles(_imageDir).ToList())
        {
            var id = Path.GetFileNameWithoutExtension(p);
            if (text.Contains(id, StringComparison.Ordinal) || now - File.GetLastWriteTimeUtc(p) < TimeSpan.FromDays(1)) continue;
            try { File.Delete(p); removed++; } catch (IOException) { }
        }
        return removed;
    }

    // ------------------------------------------------------------------------------------------------ backup

    internal JournalFile Export() => _store.Snapshot();
    internal string ImageDir => _imageDir;

    internal void ImportChecked(JournalFile f)
    {
        var ok = new List<JournalEntry>();
        foreach (var e in f.Entries.Take(MaxEntries))
        {
            try { Check(new JournalChange { Id = e.Id, Kind = e.Kind, UpdatedAt = e.UpdatedAt, Deleted = e.Deleted, Data = e.Data }); ok.Add(e); }
            catch (RpcException ex) { Log.Warn("journal", $"Eintrag {e.Id} aus dem Backup übersprungen: {ex.Message}"); }
        }
        // New counter numbers, so every device fetches the restored state again (a device keeps its newer changes).
        long seq = Math.Max(f.Seq, _store.Get(x => x.Seq));
        foreach (var e in ok) e.Rev = ++seq;
        _store.Replace(new JournalFile { Seq = seq, Entries = ok, Conflicts = f.Conflicts.Take(MaxConflicts).ToList() });
        _hub.Changed("journal");
    }
}

public sealed class JournalPush { public List<JournalChange> Changes { get; set; } = new(); }
public sealed class JournalIds { public List<string> Ids { get; set; } = new(); }
