using System.Buffers.Binary;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public sealed class PushSubscription
{
    public string DeviceId { get; set; } = "";
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    /// <summary>Notification categories sent to this device (calendar, launch, recording, update …); empty = warnings and errors of all.</summary>
    public List<string> Categories { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime? LastSentAt { get; set; }
    public string? LastError { get; set; }
}

public sealed class WebPushFile
{
    public string? PublicKey { get; set; }
    /// <summary>Private VAPID key, protected like other secrets (DPAPI on Windows).</summary>
    public string? PrivateKeyProtected { get; set; }
    public List<PushSubscription> Subscriptions { get; set; } = new();
}

/// <summary>
/// Web Push (RFC 8030/8291/8292) from the PC to paired phones – notifications arrive even while the app is closed. The PC
/// signs with its own key (VAPID) and encrypts every message end to end; the push service of the browser maker (Google,
/// Mozilla, Apple, Microsoft) only forwards ciphertext. Only those services are contacted, never any other address.
/// </summary>
public sealed class WebPushService
{
    public const int MaxPerDevice = 5;
    static readonly string[] AllowedHosts = { "fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com" };
    static readonly string[] AllowedSuffixes = { ".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com" };
    public static readonly string[] Categories = { "calendar", "launch", "recording", "update", "automation", "quest", "deal", "plugin", "gamemode", "system" };

    readonly JsonStore<WebPushFile> _store;
    readonly ISecretProtector _secrets;
    readonly Func<string, bool> _deviceExists;
    readonly HttpClient _http;
    readonly SemaphoreSlim _send = new(2, 2);
    readonly object _keyLock = new();
    public string Subject { get; init; } = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/";

    public WebPushService(AppPaths paths, ISecretProtector secrets, Func<string, bool> deviceExists, HttpMessageHandler? http = null)
    {
        _store = new JsonStore<WebPushFile>(paths.File("webpush.json"));
        _secrets = secrets; _deviceExists = deviceExists;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(15);
    }

    // ------------------------------------------------------------------ keys

    /// <summary>The PC's public VAPID key (base64url, uncompressed P-256 point); created on first use.</summary>
    public string PublicKey() { lock (_keyLock) return EnsureKeys().pub; }

    (string pub, ECDsa key) EnsureKeys()
    {
        var f = _store.Snapshot();
        if (f.PublicKey != null && f.PrivateKeyProtected != null && _secrets.Unprotect(f.PrivateKeyProtected) is { } d)
        {
            var pubBytes = B64.Decode(f.PublicKey);
            var key = ECDsa.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, D = B64.Decode(d), Q = new ECPoint { X = pubBytes[1..33], Y = pubBytes[33..65] } });
            return (f.PublicKey, key);
        }
        var k = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var p = k.ExportParameters(true);
        var pub = B64.Encode(Uncompressed(p.Q));
        _store.Update(x => { x.PublicKey = pub; x.PrivateKeyProtected = _secrets.Protect(B64.Encode(p.D!)); x.Subscriptions.Clear(); }); // old subscriptions belong to an old key
        return (pub, k);
    }

    static byte[] Uncompressed(ECPoint q) => new byte[] { 4 }.Concat(q.X!).Concat(q.Y!).ToArray();

    // ------------------------------------------------------------------ subscriptions

    public static void CheckEndpoint(string endpoint)
    {
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var u) || u.Scheme != "https" || !u.IsDefaultPort || endpoint.Length > 1000)
            throw new RpcException("invalid-params", "Ungültige Push-Adresse.");
        var host = u.Host.ToLowerInvariant();
        if (!AllowedHosts.Contains(host) && !AllowedSuffixes.Any(s => host.EndsWith(s, StringComparison.Ordinal)))
            throw new RpcException("invalid-params", "Unbekannter Push-Dienst – nur die Dienste von Google, Mozilla, Apple und Microsoft werden angesprochen.");
    }

    public void Subscribe(string deviceId, string endpoint, string p256dh, string auth, IEnumerable<string>? categories)
    {
        CheckEndpoint(endpoint);
        byte[] key, secret;
        try { key = B64.Decode(p256dh); secret = B64.Decode(auth); } catch { throw new RpcException("invalid-params", "Ungültige Schlüssel."); }
        if (key.Length != 65 || key[0] != 4 || secret.Length != 16) throw new RpcException("invalid-params", "Ungültige Schlüssel.");
        var cats = (categories ?? Array.Empty<string>()).Where(c => Categories.Contains(c)).Distinct().ToList();
        lock (_keyLock) EnsureKeys();
        _store.Update(f =>
        {
            f.Subscriptions.RemoveAll(x => x.Endpoint == endpoint);
            if (f.Subscriptions.Count(x => x.DeviceId == deviceId) >= MaxPerDevice) f.Subscriptions.Remove(f.Subscriptions.First(x => x.DeviceId == deviceId));
            f.Subscriptions.Add(new PushSubscription { DeviceId = deviceId, Endpoint = endpoint, P256dh = p256dh, Auth = auth, Categories = cats, CreatedAt = DateTime.UtcNow });
        });
    }

    public void Unsubscribe(string deviceId, string? endpoint) =>
        _store.Update(f => f.Subscriptions.RemoveAll(x => x.DeviceId == deviceId && (endpoint == null || x.Endpoint == endpoint)));

    public List<PushSubscription> ForDevice(string deviceId) => _store.Snapshot().Subscriptions.Where(x => x.DeviceId == deviceId).ToList();

    // ------------------------------------------------------------------ sending

    /// <summary>A new notification on the PC: sent to every subscribed device that wants its category (merged repeats are not sent again).</summary>
    public void OnNotification(Notification n)
    {
        var subs = _store.Snapshot().Subscriptions.Where(s => s.Categories.Count == 0 ? n.Severity >= Severity.Warning : s.Categories.Contains(n.Category)).ToList();
        if (subs.Count == 0) return;
        var payload = JsonSerializer.Serialize(new { title = n.Title, body = n.Message ?? "", link = n.Link ?? "/notifications", tag = n.Key });
        foreach (var s in subs) _ = SendAsync(s, payload);
    }

    public async Task<string?> SendAsync(PushSubscription sub, string payload)
    {
        if (!_deviceExists(sub.DeviceId)) { Unsubscribe(sub.DeviceId, null); return "Gerät nicht mehr gekoppelt."; } // revoked device: no more messages
        await _send.WaitAsync();
        try
        {
            CheckEndpoint(sub.Endpoint);
            ECDsa key; string pub;
            lock (_keyLock) (pub, key) = EnsureKeys();
            using (key)
            {
                var body = Encrypt(Encoding.UTF8.GetBytes(payload), B64.Decode(sub.P256dh), B64.Decode(sub.Auth));
                using var req = new HttpRequestMessage(HttpMethod.Post, sub.Endpoint) { Content = new ByteArrayContent(body) };
                req.Content.Headers.ContentType = new("application/octet-stream");
                req.Content.Headers.ContentEncoding.Add("aes128gcm");
                req.Headers.Add("TTL", "3600");
                req.Headers.Add("Urgency", "normal");
                req.Headers.TryAddWithoutValidation("Authorization", $"vapid t={VapidJwt(new Uri(sub.Endpoint), key, Subject)}, k={pub}");
                using var res = await _http.SendAsync(req);
                if (res.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Gone) { Unsubscribe(sub.DeviceId, sub.Endpoint); return "Push-Abo abgelaufen – auf dem Gerät neu einschalten."; }
                var error = res.IsSuccessStatusCode ? null : $"Push-Dienst antwortet {(int)res.StatusCode}.";
                _store.Update(f => { var s = f.Subscriptions.FirstOrDefault(x => x.Endpoint == sub.Endpoint); if (s != null) { s.LastSentAt = DateTime.UtcNow; s.LastError = error; } });
                return error;
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) { Log.Warn("push", ex.Message); return "Push-Dienst nicht erreichbar."; }
        finally { _send.Release(); }
    }

    /// <summary>VAPID (RFC 8292): an ES256 JWT for the push service's origin, valid for 12 hours.</summary>
    public static string VapidJwt(Uri endpoint, ECDsa key, string subject, DateTime? now = null)
    {
        var header = B64.Encode(Encoding.UTF8.GetBytes("{\"typ\":\"JWT\",\"alg\":\"ES256\"}"));
        var exp = new DateTimeOffset(now ?? DateTime.UtcNow).AddHours(12).ToUnixTimeSeconds();
        var claims = B64.Encode(JsonSerializer.SerializeToUtf8Bytes(new { aud = endpoint.GetLeftPart(UriPartial.Authority), exp, sub = subject }));
        var sig = key.SignData(Encoding.ASCII.GetBytes(header + "." + claims), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        return $"{header}.{claims}.{B64.Encode(sig)}";
    }

    /// <summary>Message encryption of RFC 8291 (aes128gcm, one record). <paramref name="asKey"/> and <paramref name="salt"/> only for tests.</summary>
    public static byte[] Encrypt(byte[] plaintext, byte[] uaPublic, byte[] authSecret, ECDiffieHellman? asKey = null, byte[]? salt = null)
    {
        if (plaintext.Length > 3993) throw new RpcException("too-large", "Nachricht zu lang.");
        using var own = asKey == null ? ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256) : null;
        var key = asKey ?? own!;
        var asPublic = Uncompressed(key.ExportParameters(false).Q);
        using var peer = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new ECPoint { X = uaPublic[1..33], Y = uaPublic[33..65] } });
        var ecdh = key.DeriveRawSecretAgreement(peer.PublicKey);
        salt ??= RandomNumberGenerator.GetBytes(16);

        var keyInfo = Encoding.ASCII.GetBytes("WebPush: info\0").Concat(uaPublic).Concat(asPublic).ToArray();
        var ikm = HKDF.Expand(HashAlgorithmName.SHA256, HKDF.Extract(HashAlgorithmName.SHA256, ecdh, authSecret), 32, keyInfo);
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var cek = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, Encoding.ASCII.GetBytes("Content-Encoding: aes128gcm\0"));
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, Encoding.ASCII.GetBytes("Content-Encoding: nonce\0"));

        var padded = plaintext.Concat(new byte[] { 2 }).ToArray(); // last record, no padding
        var cipher = new byte[padded.Length];
        var tag = new byte[16];
        using (var gcm = new AesGcm(cek, 16)) gcm.Encrypt(nonce, padded, cipher, tag);

        var header = new byte[16 + 4 + 1 + asPublic.Length];
        salt.CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32BigEndian(header.AsSpan(16), 4096);
        header[20] = (byte)asPublic.Length;
        asPublic.CopyTo(header, 21);
        return header.Concat(cipher).Concat(tag).ToArray();
    }

    internal WebPushFile Export() => _store.Snapshot();
}

/// <summary>base64url without padding (as used by Web Push and JWT).</summary>
public static class B64
{
    public static string Encode(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static byte[] Decode(string s)
    {
        var t = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(t + new string('=', (4 - t.Length % 4) % 4));
    }
}
