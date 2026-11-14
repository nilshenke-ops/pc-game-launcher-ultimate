using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public sealed record TransferEntry(string Name, long Size, DateTime Modified, string Kind);

/// <summary>
/// Files between phone and PC through one folder on the PC. Only this folder is visible – no other path can be named
/// (a name is looked up in the folder's own listing). Files are never opened or run by the companion; on Windows they are
/// marked as downloaded from another computer, so Windows warns before running one.
/// </summary>
public sealed class TransferService
{
    public const long MaxFileBytes = 200L * 1024 * 1024;
    public const long MaxFolderBytes = 5L * 1024 * 1024 * 1024;
    public const int MaxChunkBytes = 512 * 1024;
    static readonly Regex Bad = new(@"[<>:""/\\|?*\x00-\x1f]");
    static readonly Regex Reserved = new(@"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$", RegexOptions.IgnoreCase);

    readonly string _defaultDir, _tmp;
    readonly Func<Models.Settings>? _settings;
    readonly IPlatform _platform;
    readonly IHub _hub;
    readonly NotificationCenter? _notify;
    readonly object _lock = new();
    readonly Dictionary<string, (string name, string path, long expected, long received, DateTime started, string by)> _uploads = new();
    readonly HashSet<string> _quiet = new();

    public TransferService(AppPaths paths, IPlatform platform, IHub hub, NotificationCenter? notify = null, Func<Models.Settings>? settings = null)
    {
        _defaultDir = paths.TransferDir; _settings = settings;
        _tmp = Path.Combine(paths.DataDir, "transfer-tmp");
        _platform = platform; _hub = hub; _notify = notify;
    }

    /// <summary>The exchange folder: the one chosen in the settings (if it is usable), else the usual one.</summary>
    public string Folder => _settings?.Invoke().TransferFolder is { Length: > 0 } f && Path.IsPathFullyQualified(f) ? f : _defaultDir;
    string _dir => Folder;
    public string DefaultFolder => _defaultDir;
    /// <summary>Largest file accepted (setting, 1–4096 MB; default 200 MB).</summary>
    public long MaxBytes => (_settings?.Invoke().TransferMaxMb is int mb and > 0 ? Math.Min(mb, 4096) : 200) * 1024L * 1024;

    /// <summary>Checks a folder chosen for receiving files: an absolute path that is not a system folder; it is created if needed.</summary>
    public static string CheckFolder(string path)
    {
        var p = (path ?? "").Trim();
        if (!Path.IsPathFullyQualified(p) || p.Length > 240) throw new RpcException("invalid-params", "Bitte einen vollständigen Ordnerpfad angeben (z. B. D:\\Nexus Transfers).");
        var full = Path.GetFullPath(p).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var root = Path.GetPathRoot(full) ?? "";
        string[] forbidden = OperatingSystem.IsWindows()
            ? new[] { Environment.GetFolderPath(Environment.SpecialFolder.Windows), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.System) }
            : new[] { "/bin", "/sbin", "/usr", "/etc", "/proc", "/sys", "/dev", "/boot" };
        if (string.Equals(full.TrimEnd('\\', '/'), root.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase) || full.Length <= root.Length)
            throw new RpcException("invalid-params", "Bitte einen Unterordner wählen, nicht ein ganzes Laufwerk.");
        if (forbidden.Where(f => f.Length > 0).Any(f => full.StartsWith(f, StringComparison.OrdinalIgnoreCase)))
            throw new RpcException("invalid-params", "Systemordner sind als Empfangsordner nicht erlaubt.");
        try { Directory.CreateDirectory(full); } catch (Exception ex) { throw new RpcException("invalid-params", "Ordner lässt sich nicht anlegen: " + ex.Message); }
        return full;
    }

    /// <summary>Removes files older than the given number of days from the exchange folder (setting; 0 = never).</summary>
    public int CleanOld(int days)
    {
        if (days <= 0) return 0;
        var n = 0;
        foreach (var f in Files().Where(f => DateTime.UtcNow - f.LastWriteTimeUtc > TimeSpan.FromDays(days)).ToList())
        { try { f.Delete(); n++; } catch { /* in use */ } }
        if (n > 0) _hub.Changed("files");
        return n;
    }

    public IReadOnlyList<TransferEntry> Entries() => Files().OrderByDescending(f => f.LastWriteTimeUtc).Take(500).Select(f => new TransferEntry(f.Name, f.Length, f.LastWriteTimeUtc, KindOf(f.Name))).ToList();

    /// <summary>A file name that is safe on Windows and cannot leave the folder.</summary>
    public static string SafeName(string? name)
    {
        var n = Bad.Replace(Path.GetFileName((name ?? "").Replace('\\', '/')), "_").Trim().TrimEnd('.', ' ').TrimStart('.');
        if (Reserved.IsMatch(n)) n = "_" + n;
        if (n.Length > 120) { var ext = Path.GetExtension(n); n = n[..(120 - Math.Min(ext.Length, 20))] + (ext.Length <= 20 ? ext : ""); }
        return n.Length == 0 ? "Datei" : n;
    }

    public static string KindOf(string name) => Path.GetExtension(name).ToLowerInvariant() switch
    {
        ".png" or ".jpg" or ".jpeg" or ".webp" or ".gif" or ".bmp" or ".heic" => "image",
        ".mp4" or ".mkv" or ".webm" or ".mov" or ".avi" => "video",
        ".mp3" or ".wav" or ".flac" or ".m4a" or ".ogg" or ".wma" => "audio",
        ".zip" or ".7z" or ".rar" => "archive",
        ".pdf" or ".txt" or ".doc" or ".docx" or ".md" or ".json" or ".cfg" or ".ini" => "document",
        _ => "other",
    };

    IEnumerable<FileInfo> Files() => Directory.Exists(_dir)
        ? new DirectoryInfo(_dir).EnumerateFiles().Where(f => !f.Attributes.HasFlag(FileAttributes.Hidden) && !f.Name.StartsWith('.'))
        : Enumerable.Empty<FileInfo>();

    public object List()
    {
        var files = Files().OrderByDescending(f => f.LastWriteTimeUtc).Take(500).Select(f => new TransferEntry(f.Name, f.Length, f.LastWriteTimeUtc, KindOf(f.Name))).ToList();
        long? free = null;
        try { free = new DriveInfo(Path.GetPathRoot(Path.GetFullPath(_dir))!).AvailableFreeSpace; } catch { /* unknown drive */ }
        return new { files, folder = _dir, defaultFolder = _defaultDir, totalBytes = Files().Sum(f => f.Length), maxFileBytes = MaxBytes, freeBytes = free };
    }

    FileInfo Find(string name) =>
        Files().FirstOrDefault(f => f.Name == name) ?? throw new RpcException("not-found", "Datei nicht gefunden.");

    public string UploadBegin(string name, long size, string by, bool quiet = false)
    {
        if (size < 0 || size > MaxBytes) throw new RpcException("too-large", $"Höchstens {MaxBytes / 1024 / 1024} MB pro Datei (in den Einstellungen änderbar).");
        if (Files().Sum(f => f.Length) + size > MaxFolderBytes) throw new RpcException("too-large", "Der Austausch-Ordner ist voll (5 GB). Bitte alte Dateien löschen.");
        try { if (new DriveInfo(Path.GetPathRoot(Path.GetFullPath(_dir))!).AvailableFreeSpace < size + 1_000_000_000) throw new RpcException("too-large", "Zu wenig freier Speicher auf dem PC."); }
        catch (RpcException) { throw; } catch { /* unknown drive: the write itself fails if full */ }
        Directory.CreateDirectory(_tmp);
        var id = Ids.New("tx");
        var path = Path.Combine(_tmp, id + ".part");
        File.WriteAllBytes(path, Array.Empty<byte>());
        lock (_lock)
        {
            foreach (var old in _uploads.Where(u => DateTime.UtcNow - u.Value.started > TimeSpan.FromMinutes(30)).ToList())
            { _uploads.Remove(old.Key); try { File.Delete(old.Value.path); } catch { } }
            if (_uploads.Count >= 8) throw new RpcException("busy", "Zu viele gleichzeitige Übertragungen.");
            _uploads[id] = (SafeName(name), path, size, 0, DateTime.UtcNow, by);
            if (quiet) _quiet.Add(id);
        }
        return id;
    }

    public long UploadChunk(string uploadId, string base64)
    {
        byte[] data;
        try { data = Convert.FromBase64String(base64); } catch { throw new RpcException("invalid-params", "Ungültige Daten."); }
        lock (_lock)
        {
            if (!_uploads.TryGetValue(uploadId, out var u)) throw new RpcException("not-found", "Übertragung nicht gefunden oder abgelaufen.");
            if (u.received + data.Length > u.expected) throw new RpcException("too-large", "Mehr Daten als angekündigt.");
            using (var fs = new FileStream(u.path, FileMode.Append)) fs.Write(data);
            _uploads[uploadId] = u with { received = u.received + data.Length, started = DateTime.UtcNow };
            return u.received + data.Length;
        }
    }

    /// <summary>A piece of an upload as bytes, at the position the sender expects (a repeated piece after a lost answer is ignored).</summary>
    public long UploadChunkBytes(string uploadId, byte[] data, long offset)
    {
        lock (_lock)
        {
            if (!_uploads.TryGetValue(uploadId, out var u)) throw new RpcException("not-found", "Übertragung nicht gefunden oder abgelaufen.");
            if (offset + data.Length == u.received) return u.received;           // already written – the answer got lost
            if (offset != u.received) throw new RpcException("conflict", $"Erwartet Position {u.received}.");
            if (u.received + data.Length > u.expected) throw new RpcException("too-large", "Mehr Daten als angekündigt.");
            using (var fs = new FileStream(u.path, FileMode.Append)) fs.Write(data);
            _uploads[uploadId] = u with { received = u.received + data.Length, started = DateTime.UtcNow };
            return u.received + data.Length;
        }
    }

    public TransferEntry UploadEnd(string uploadId)
    {
        (string name, string path, long expected, long received, DateTime started, string by) u;
        lock (_lock) if (!_uploads.Remove(uploadId, out u)) throw new RpcException("not-found", "Übertragung nicht gefunden.");
        try
        {
            if (u.received != u.expected) throw new RpcException("incomplete", "Übertragung unvollständig.");
            Directory.CreateDirectory(_dir);
            var target = Unique(u.name);
            File.Move(u.path, target);
            MarkFromOtherDevice(target);
            var f = new FileInfo(target);
            _hub.Changed("files");
            bool quiet; lock (_lock) quiet = _quiet.Remove(uploadId);
            if (!quiet) _notify?.Push("files:" + f.Name, Severity.Info, $"Datei empfangen: {f.Name}", $"Von {u.by} · im Ordner „{Path.GetFileName(_dir)}“", "/files");
            return new TransferEntry(f.Name, f.Length, f.LastWriteTimeUtc, KindOf(f.Name));
        }
        finally { try { File.Delete(u.path); } catch { } }
    }

    string Unique(string name)
    {
        var path = Path.Combine(_dir, name);
        var stem = Path.GetFileNameWithoutExtension(name); var ext = Path.GetExtension(name);
        for (var i = 2; File.Exists(path); i++) path = Path.Combine(_dir, $"{stem} ({i}){ext}");
        return path;
    }

    /// <summary>Windows "Mark of the Web": Explorer and SmartScreen warn before such a file is run.</summary>
    static void MarkFromOtherDevice(string path)
    {
        if (!OperatingSystem.IsWindows()) return;
        try { File.WriteAllText(path + ":Zone.Identifier", "[ZoneTransfer]\r\nZoneId=3\r\n"); } catch { /* not NTFS */ }
    }

    /// <summary>One piece of a file for the device (base64), so large files never need one huge message.</summary>
    public object Read(string name, long offset, int length)
    {
        var (buf, size, eof) = ReadBytes(name, offset, length);
        return new { data = Convert.ToBase64String(buf), size, offset, eof };
    }

    public (byte[] data, long size, bool eof) ReadBytes(string name, long offset, int length)
    {
        var f = Find(name);
        if (offset < 0 || offset > f.Length) throw new RpcException("invalid-params", "Ungültige Position.");
        length = Math.Clamp(length, 1, MaxChunkBytes);
        var buf = new byte[(int)Math.Min(length, f.Length - offset)];
        using (var fs = new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            fs.Position = offset;
            var read = 0;
            while (read < buf.Length) { var n = fs.Read(buf, read, buf.Length - read); if (n == 0) break; read += n; }
            if (read < buf.Length) Array.Resize(ref buf, read);
        }
        return (buf, f.Length, offset + buf.Length >= f.Length);
    }

    public void Remove(string name)
    {
        File.Delete(Find(name).FullName);
        _hub.Changed("files");
    }

    /// <summary>Renames a file of the exchange folder (island shelf). The new name is made safe; an existing name is never overwritten.</summary>
    public TransferEntry Rename(string name, string newName)
    {
        var f = Find(name);
        var target = SafeName(newName);
        if (Path.GetExtension(target).Length == 0 && f.Extension.Length > 0) target += f.Extension; // keep the type when only the name was typed
        if (string.Equals(target, f.Name, StringComparison.Ordinal)) return new TransferEntry(f.Name, f.Length, f.LastWriteTimeUtc, KindOf(f.Name));
        var dest = Path.Combine(_dir, target);
        if (File.Exists(dest) && !string.Equals(Path.GetFullPath(dest), f.FullName, StringComparison.OrdinalIgnoreCase))
            throw new RpcException("exists", $"„{target}“ gibt es schon im Austausch-Ordner.");
        File.Move(f.FullName, dest);
        _hub.Changed("files");
        var n = new FileInfo(dest);
        return new TransferEntry(n.Name, n.Length, n.LastWriteTimeUtc, KindOf(n.Name));
    }

    public void OpenFolder()
    {
        Directory.CreateDirectory(_dir);
        _platform.Desktop.OpenFolder(_dir);
    }
}
