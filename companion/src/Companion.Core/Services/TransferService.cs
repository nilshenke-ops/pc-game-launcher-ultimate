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

    readonly string _dir, _tmp;
    readonly IPlatform _platform;
    readonly IHub _hub;
    readonly NotificationCenter? _notify;
    readonly object _lock = new();
    readonly Dictionary<string, (string name, string path, long expected, long received, DateTime started, string by)> _uploads = new();

    public TransferService(AppPaths paths, IPlatform platform, IHub hub, NotificationCenter? notify = null)
    {
        _dir = paths.TransferDir;
        _tmp = Path.Combine(paths.DataDir, "transfer-tmp");
        _platform = platform; _hub = hub; _notify = notify;
    }

    public string Folder => _dir;

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
        return new { files, folder = _dir, totalBytes = Files().Sum(f => f.Length), maxFileBytes = MaxFileBytes, freeBytes = free };
    }

    FileInfo Find(string name) =>
        Files().FirstOrDefault(f => f.Name == name) ?? throw new RpcException("not-found", "Datei nicht gefunden.");

    public string UploadBegin(string name, long size, string by)
    {
        if (size < 0 || size > MaxFileBytes) throw new RpcException("too-large", $"Höchstens {MaxFileBytes / 1024 / 1024} MB pro Datei.");
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
            _notify?.Push("files:" + f.Name, Severity.Info, $"Datei empfangen: {f.Name}", $"Von {u.by} · im Ordner „{Path.GetFileName(_dir)}“", "/files");
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
        return new { data = Convert.ToBase64String(buf), size = f.Length, offset, eof = offset + buf.Length >= f.Length };
    }

    public void Remove(string name)
    {
        File.Delete(Find(name).FullName);
        _hub.Changed("files");
    }

    public void OpenFolder()
    {
        Directory.CreateDirectory(_dir);
        _platform.Desktop.OpenFolder(_dir);
    }
}
