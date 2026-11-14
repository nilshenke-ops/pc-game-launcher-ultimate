using System.Security.Cryptography;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// File transfer by QR code (3.64) – PC → phone and phone → PC, on top of the exchange folder (<see cref="TransferService"/>).
///
/// Security:
/// - The QR code holds only a share id and a random 256-bit secret, in the URL fragment (never sent to a server). It works for a
///   few minutes (setting, 1–15) and for one device.
/// - The phone never sends the secret: it answers a fresh challenge with an HMAC (key derived from the secret, HKDF-SHA256).
/// - Knowing the QR code is not enough: the PC must allow the device; both sides show the same 4-digit code to compare.
/// - Every piece of a file is encrypted with AES-256-GCM (key from the secret, piece bound to share, file and position), so it stays
///   unreadable on the way – also over plain http in the home network and through the relay.
/// - Only the files chosen for this share can be read; uploads go only into the exchange folder, programs and scripts are refused.
/// - A share can be revoked at any time and ends by itself after inactivity. Nothing is published; there is no download link.
/// </summary>
public sealed class ShareService
{
    public const int MaxShares = 8, MaxFailedJoins = 5;
    public static readonly TimeSpan IdleLimit = TimeSpan.FromMinutes(30), HardLimit = TimeSpan.FromHours(3);
    static readonly string[] Blocked = { ".exe", ".msi", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".scr", ".com", ".lnk", ".reg", ".hta", ".cpl", ".dll", ".jar", ".msc", ".pif", ".appx", ".msix" };

    public sealed class Share
    {
        public required string Id { get; init; }
        public required byte[] AuthKey { get; init; }
        public required byte[] EncKey { get; init; }
        public required string Direction { get; init; }       // "send" (PC → phone) or "receive" (phone → PC)
        public required List<string> Files { get; init; }
        public required string By { get; init; }
        public DateTime Created { get; } = DateTime.UtcNow;
        public required DateTime JoinUntil { get; init; }
        public DateTime LastActive { get; set; } = DateTime.UtcNow;
        public string State { get; set; } = "open";            // open → waiting → approved → done | rejected | revoked | expired
        public string? Device { get; set; }
        public string? Code { get; set; }
        public RpcSession? Bound { get; set; }
        public string? Resume { get; set; }
        public int Failed { get; set; }
        public HashSet<string> Done { get; } = new();
        public long Bytes { get; set; }
        public string? Current { get; set; }
        public readonly Dictionary<RpcSession, byte[]> Challenges = new();
        public readonly Dictionary<string, string> Uploads = new(); // uploadId → file name
    }

    public sealed record HistoryEntry(string Id, string Direction, DateTime At, string? Device, int Files, long Bytes, string Result, List<string> Names);

    readonly TransferService _files;
    readonly IHub _hub;
    readonly Func<Models.Settings> _settings;
    readonly JsonStore<List<HistoryEntry>> _history;
    readonly object _lock = new();
    readonly Dictionary<string, Share> _shares = new();
    readonly Action<string, string>? _notify;

    public ShareService(AppPaths paths, TransferService files, IHub hub, Func<Models.Settings> settings, Action<string, string>? notify = null)
    {
        _files = files; _hub = hub; _settings = settings; _notify = notify;
        _history = new JsonStore<List<HistoryEntry>>(Path.Combine(paths.DataDir, "transfer-history.json"));
    }

    // ---------------------------------------------------------------- keys
    public static byte[] DeriveAuth(byte[] secret, string id) => HKDF.DeriveKey(HashAlgorithmName.SHA256, secret, 32, Encoding.UTF8.GetBytes(id), Encoding.UTF8.GetBytes("nexus-share-auth"));
    public static byte[] DeriveEnc(byte[] secret, string id) => HKDF.DeriveKey(HashAlgorithmName.SHA256, secret, 32, Encoding.UTF8.GetBytes(id), Encoding.UTF8.GetBytes("nexus-share-enc"));
    public static byte[] Mac(byte[] key, byte[] challenge, string what) => HMACSHA256.HashData(key, challenge.Concat(Encoding.UTF8.GetBytes(what)).ToArray());
    public static string CodeOf(byte[] authKey, byte[] challenge) { var m = Mac(authKey, challenge, "code"); return ((BitConverter.ToUInt32(m, 0) % 10000)).ToString("D4"); }
    static byte[] Aad(string id, string name, long offset) => Encoding.UTF8.GetBytes($"{id}|{name}|{offset}");

    /// <summary>nonce(12) | ciphertext | tag(16), as base64.</summary>
    public static string Seal(byte[] key, byte[] plain, byte[] aad)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var outp = new byte[12 + plain.Length + 16];
        using var gcm = new AesGcm(key, 16);
        gcm.Encrypt(nonce, plain, outp.AsSpan(12, plain.Length), outp.AsSpan(12 + plain.Length, 16), aad);
        nonce.CopyTo(outp, 0);
        return Convert.ToBase64String(outp);
    }
    public static byte[] Open(byte[] key, string b64, byte[] aad)
    {
        byte[] all;
        try { all = Convert.FromBase64String(b64); } catch { throw new RpcException("invalid-params", "Ungültige Daten."); }
        if (all.Length < 28) throw new RpcException("invalid-params", "Ungültige Daten.");
        var plain = new byte[all.Length - 28];
        try { using var gcm = new AesGcm(key, 16); gcm.Decrypt(all.AsSpan(0, 12), all.AsSpan(12, plain.Length), all.AsSpan(all.Length - 16), plain, aad); }
        catch (CryptographicException) { throw new RpcException("forbidden", "Daten wurden unterwegs verändert oder falsch verschlüsselt."); }
        return plain;
    }

    // ---------------------------------------------------------------- PC side
    /// <summary>A new share. "send": the chosen exchange-folder files go to the phone; "receive": the phone may put files into the folder.</summary>
    public object Create(string direction, IEnumerable<string>? names, string by)
    {
        if (direction is not ("send" or "receive")) throw new RpcException("invalid-params", "Richtung muss send oder receive sein.");
        var list = new List<string>();
        if (direction == "send")
        {
            var have = _files.Entries().Select(f => f.Name).ToHashSet(StringComparer.Ordinal);
            list = (names ?? Enumerable.Empty<string>()).Distinct().Where(have.Contains).Take(50).ToList();
            if (list.Count == 0) throw new RpcException("invalid-params", "Keine Datei ausgewählt – erst Dateien in die Ablage legen.");
        }
        var ttl = Math.Clamp(_settings().ShareTtlMinutes, 1, 15);
        var secret = RandomNumberGenerator.GetBytes(32);
        var id = Ids.Token(9); // 72 bit, url-safe
        var share = new Share { Id = id, AuthKey = DeriveAuth(secret, id), EncKey = DeriveEnc(secret, id), Direction = direction, Files = list, By = by, JoinUntil = DateTime.UtcNow.AddMinutes(ttl) };
        lock (_lock)
        {
            Sweep();
            if (_shares.Count(x => x.Value.State is "open" or "waiting" or "approved") >= MaxShares) throw new RpcException("busy", "Zu viele offene Übertragungen – bitte erst eine beenden.");
            _shares[id] = share;
        }
        Changed(share);
        return new { id, secret = Ids.Base64Url(secret), direction, files = list, expiresAt = share.JoinUntil, ttlMinutes = ttl };
    }

    public void Approve(string id)
    {
        Share s;
        lock (_lock)
        {
            s = Get(id);
            if (s.State != "waiting") throw new RpcException("conflict", "Es wartet kein Gerät auf diese Übertragung.");
            s.State = "approved"; s.LastActive = DateTime.UtcNow;
            s.Resume = Ids.Token(24);
        }
        if (s.Bound != null) _hub.SendTo(s.Bound, "share.state", new { id, state = "approved", resume = s.Resume });
        Changed(s);
    }

    public void Reject(string id) => End(id, "rejected", "Am PC abgelehnt.");
    public void Revoke(string id) => End(id, "revoked", "Am PC beendet.");

    void End(string id, string state, string why)
    {
        Share s;
        lock (_lock) { s = Get(id); if (s.State is "done" or "rejected" or "revoked" or "expired") return; s.State = state; }
        if (s.Bound != null) _hub.SendTo(s.Bound, "share.state", new { id, state, message = why });
        Record(s, state);
        Changed(s);
    }

    public object List()
    {
        lock (_lock)
        {
            Sweep();
            var active = _shares.Values.Where(s => s.State is "open" or "waiting" or "approved").Select(View).ToList();
            var set = _settings();
            return new { active, history = set.TransferHistoryEnabled ? _history.Snapshot().OrderByDescending(h => h.At).Take(50).ToList() : new List<HistoryEntry>(), historyEnabled = set.TransferHistoryEnabled, folder = _files.Folder };
        }
    }
    public void ClearHistory() { _history.Update(h => { h.Clear(); return true; }); _hub.Changed("shares"); }

    object View(Share s) => new { s.Id, s.Direction, s.State, s.Device, s.Code, files = s.Files, done = s.Done.ToList(), s.Bytes, s.Current, expiresAt = s.JoinUntil, s.By };

    void Changed(Share s) { _hub.Broadcast("share.update", View(s), Security.Permissions.Manage); _hub.Changed("shares"); }

    // ---------------------------------------------------------------- phone side (no account needed – everything is tied to the share)
    public object Hello(string id, RpcSession session)
    {
        lock (_lock)
        {
            var s = Find(id) ?? throw new RpcException("not-found", "Dieser QR-Code ist ungültig oder abgelaufen.");
            if (s.Challenges.Count > 20) foreach (var k in s.Challenges.Keys.Where(k => k != s.Bound).ToList()) s.Challenges.Remove(k);
            var c = RandomNumberGenerator.GetBytes(16);
            s.Challenges[session] = c;
            return new { challenge = Convert.ToBase64String(c), direction = s.Direction, pc = _settings().PcName };
        }
    }

    public object Join(string id, string proof, string device, string? resume, RpcSession session)
    {
        Share s;
        string? code;
        lock (_lock)
        {
            s = Find(id) ?? throw new RpcException("not-found", "Dieser QR-Code ist ungültig oder abgelaufen.");
            if (!s.Challenges.TryGetValue(session, out var c)) throw new RpcException("conflict", "Bitte die Seite neu laden.");
            byte[] given;
            try { given = Convert.FromBase64String(proof); } catch { given = Array.Empty<byte>(); }
            if (!CryptographicOperations.FixedTimeEquals(given, Mac(s.AuthKey, c, "join")))
            {
                if (++s.Failed >= MaxFailedJoins) { s.State = "revoked"; Record(s, "revoked"); }
                throw new RpcException("forbidden", "Der Code passt nicht zu dieser Übertragung.");
            }
            if (_settings().ShareKnownOnly && !session.Authenticated) throw new RpcException("forbidden", "Am PC ist eingestellt: nur gekoppelte Geräte dürfen Dateien übertragen.");
            // The same phone after a lost connection: with the resume token it carries on without asking the PC again.
            if (s.State == "approved")
            {
                if (resume == null || s.Resume == null || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(resume), Encoding.UTF8.GetBytes(s.Resume)))
                    throw new RpcException("conflict", "Diese Übertragung läuft schon mit einem anderen Gerät.");
                s.Bound = session; s.LastActive = DateTime.UtcNow;
                return new { state = "approved", code = s.Code, resumed = true };
            }
            if (s.State == "waiting" && s.Bound != null && s.Bound != session && DateTime.UtcNow - s.LastActive < TimeSpan.FromSeconds(30))
                throw new RpcException("conflict", "Ein anderes Gerät meldet sich gerade für diesen QR-Code an.");
            if (s.State is not ("open" or "waiting") || DateTime.UtcNow > s.JoinUntil) throw new RpcException("expired", "Dieser QR-Code ist abgelaufen. Bitte am PC einen neuen erzeugen.");
            s.Bound = session; s.State = "waiting"; s.LastActive = DateTime.UtcNow;
            s.Device = Clean(device);
            code = s.Code = CodeOf(s.AuthKey, c);
        }
        Changed(s);
        _notify?.Invoke("Datei-Übertragung", $"{s.Device} möchte {(s.Direction == "send" ? "Dateien empfangen" : "Dateien senden")} – Code {code}. Bitte am PC bestätigen.");
        return new { state = "waiting", code };
    }

    static string Clean(string? n) { var x = new string((n ?? "").Where(ch => !char.IsControl(ch)).ToArray()).Trim(); return x.Length == 0 ? "Gerät" : x.Length > 40 ? x[..40] : x; }

    Share Ready(string id, RpcSession session)
    {
        var s = Find(id) ?? throw new RpcException("not-found", "Übertragung nicht gefunden oder abgelaufen.");
        if (s.Bound != session) throw new RpcException("forbidden", "Dieses Gerät gehört nicht zu dieser Übertragung.");
        if (s.State != "approved") throw new RpcException("forbidden", s.State == "waiting" ? "Bitte erst am PC bestätigen." : "Diese Übertragung ist beendet.");
        s.LastActive = DateTime.UtcNow;
        return s;
    }

    public object Info(string id, RpcSession session)
    {
        lock (_lock)
        {
            var s = Ready(id, session);
            var all = _files.Entries().ToDictionary(f => f.Name, StringComparer.Ordinal);
            var files = s.Files.Where(all.ContainsKey).Select(n => new { name = n, size = all[n].Size, kind = all[n].Kind, done = s.Done.Contains(n) }).ToList();
            return new { direction = s.Direction, files, maxFileBytes = _files.MaxBytes, done = s.Done.ToList(), previews = _settings().SharePreviews };
        }
    }

    public object Read(string id, string name, long offset, int length, RpcSession session)
    {
        Share s;
        lock (_lock) { s = Ready(id, session); if (s.Direction != "send" || !s.Files.Contains(name)) throw new RpcException("forbidden", "Diese Datei gehört nicht zu dieser Übertragung."); }
        var (data, size, eof) = _files.ReadBytes(name, offset, length);
        lock (_lock) { s.Bytes += data.Length; s.Current = name; }
        if (offset == 0 || eof) Changed(s);
        return new { data = Seal(s.EncKey, data, Aad(s.Id, name, offset)), size, eof };
    }

    public object Done(string id, string name, RpcSession session)
    {
        Share s;
        lock (_lock)
        {
            s = Ready(id, session);
            if (!s.Files.Contains(name)) throw new RpcException("forbidden", "Diese Datei gehört nicht zu dieser Übertragung.");
            s.Done.Add(name); s.Current = null;
            if (s.Direction == "send" && s.Files.All(s.Done.Contains)) s.State = "done";
        }
        if (s.State == "done") { Record(s, "done"); Notify(s); }
        Changed(s);
        return new { state = s.State };
    }

    public (string uploadId, string name) UploadBegin(string id, string name, long size, RpcSession session)
    {
        Share s;
        lock (_lock) { s = Ready(id, session); if (s.Direction != "receive") throw new RpcException("forbidden", "Diese Übertragung nimmt keine Dateien an."); }
        var safe = TransferService.SafeName(name);
        if (Blocked.Contains(Path.GetExtension(safe).ToLowerInvariant())) throw new RpcException("forbidden", "Programme und Skripte werden aus Sicherheitsgründen nicht angenommen.");
        var up = _files.UploadBegin(safe, size, "Handy: " + s.Device, quiet: true);
        lock (_lock) { s.Uploads[up] = safe; s.Current = safe; }
        Changed(s);
        return (up, safe);
    }

    public long UploadChunk(string id, string uploadId, long offset, string data, RpcSession session)
    {
        Share s; string name;
        lock (_lock) { s = Ready(id, session); if (!s.Uploads.TryGetValue(uploadId, out name!)) throw new RpcException("not-found", "Übertragung nicht gefunden."); }
        var plain = Open(s.EncKey, data, Aad(s.Id, name, offset));
        var got = _files.UploadChunkBytes(uploadId, plain, offset);
        lock (_lock) s.Bytes += plain.Length;
        return got;
    }

    public TransferEntry UploadEnd(string id, string uploadId, RpcSession session)
    {
        Share s; string name;
        lock (_lock) { s = Ready(id, session); if (!s.Uploads.Remove(uploadId, out name!)) throw new RpcException("not-found", "Übertragung nicht gefunden."); }
        var e = _files.UploadEnd(uploadId);
        lock (_lock) { s.Files.Add(e.Name); s.Done.Add(e.Name); s.Current = null; }
        Changed(s);
        return e;
    }

    /// <summary>The phone says it has sent everything (phone → PC).</summary>
    public object Finish(string id, RpcSession session)
    {
        Share s;
        lock (_lock) { s = Ready(id, session); s.State = "done"; }
        Record(s, "done"); Notify(s); Changed(s);
        return new { state = "done", files = s.Done.Count };
    }

    void Notify(Share s)
    {
        if (!_settings().TransferNotify) return;
        _notify?.Invoke("Datei-Übertragung", s.Direction == "send" ? $"{s.Done.Count} Datei(en) an {s.Device} übertragen." : $"{s.Done.Count} Datei(en) von {s.Device} empfangen – im Austausch-Ordner.");
    }

    // ---------------------------------------------------------------- housekeeping
    Share Get(string id) => _shares.TryGetValue(id, out var s) ? s : throw new RpcException("not-found", "Übertragung nicht gefunden.");
    Share? Find(string id)
    {
        lock (_lock) { Sweep(); return _shares.TryGetValue(id, out var s) && s.State is "open" or "waiting" or "approved" ? s : null; }
    }

    /// <summary>Ends shares nobody joined in time, idle ones and very old ones; forgets ended ones after a while.</summary>
    void Sweep()
    {
        var now = DateTime.UtcNow;
        foreach (var s in _shares.Values.ToList())
        {
            var stale = s.State is "open" or "waiting" && now > s.JoinUntil && (s.State == "open" || now - s.LastActive > TimeSpan.FromMinutes(2))
                || s.State == "approved" && (now - s.LastActive > IdleLimit || now - s.Created > HardLimit);
            if (stale) { s.State = "expired"; Record(s, "expired"); if (s.Bound != null) _hub.SendTo(s.Bound, "share.state", new { id = s.Id, state = "expired" }); }
            if (s.State is "done" or "rejected" or "revoked" or "expired" && now - s.LastActive > TimeSpan.FromMinutes(10)) _shares.Remove(s.Id);
        }
    }

    void Record(Share s, string result)
    {
        if (!_settings().TransferHistoryEnabled || (s.Device == null && result == "expired")) return;
        _history.Update(h =>
        {
            h.RemoveAll(x => x.Id == s.Id);
            h.Add(new HistoryEntry(s.Id, s.Direction, DateTime.UtcNow, s.Device, s.Done.Count, s.Bytes, result, s.Done.Take(20).ToList()));
            if (h.Count > 100) h.RemoveRange(0, h.Count - 100);
            return true;
        });
    }

    /// <summary>A connection closed: its open challenges go (approved shares keep their binding so the phone can resume).</summary>
    public void Closed(RpcSession session)
    {
        lock (_lock) foreach (var s in _shares.Values) s.Challenges.Remove(session);
    }
}
