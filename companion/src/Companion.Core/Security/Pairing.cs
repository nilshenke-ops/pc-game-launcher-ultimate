using System.Security.Cryptography;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;

namespace Pgl.Core.Security;

public static class Permissions
{
    /// <summary>Power = put the PC to sleep, restart or shut it down from a device (locking only needs Launch). Not given by default.</summary>
    /// <summary>Screen = see the PC screen (remote desktop), Remote = also control it with touch/keys. Neither is given by default.</summary>
    public const string View = "view", Launch = "launch", Soundboard = "soundboard", Manage = "manage", Power = "power", Admin = "admin", Local = "local", Screen = "screen", Remote = "remote";
    public static readonly string[] Grantable = { View, Launch, Soundboard, Manage, Power, Screen, Remote, Admin };
    public static readonly string[] Default = { View, Launch, Soundboard, Manage };
    public static readonly string[] LocalAdmin = { View, Launch, Soundboard, Manage, Power, Screen, Remote, Admin, Local };
}

/// <summary>
/// Paired devices. Each device holds a random 256-bit token; the companion only stores SHA-256(token)
/// (protected with DPAPI on Windows). Logins use a challenge-response (HMAC over a per-connection nonce),
/// so a recorded login cannot be replayed on another connection.
/// </summary>
public sealed class DeviceStore
{
    readonly JsonStore<DevicesFile> _store;
    readonly ISecretProtector _secrets;
    public event Action<string>? Revoked;

    public DeviceStore(AppPaths paths, ISecretProtector secrets)
    {
        _store = new JsonStore<DevicesFile>(paths.File("devices.json"));
        _secrets = secrets;
    }

    public IReadOnlyList<PairedDevice> List() => _store.Snapshot().Devices;
    public PairedDevice? Get(string id) => _store.Get(f => f.Devices.FirstOrDefault(d => d.Id == id));

    /// <summary>Creates a device and returns the plain token, which is handed to the device exactly once.</summary>
    public (PairedDevice device, string token) Create(string name, string platform, IEnumerable<string> permissions, string? ip)
    {
        var token = Ids.Token(32);
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
        var device = new PairedDevice
        {
            Id = Ids.New("dev"),
            Name = Sanitize(name, 40, "Gerät"),
            Platform = Sanitize(platform, 40, "Unbekannt"),
            KeyProtected = _secrets.Protect(key),
            Permissions = permissions.Where(p => Permissions.Grantable.Contains(p)).Distinct().ToList(),
            LastIp = ip,
        };
        _store.Update(f => f.Devices.Add(device));
        Log.Info("pairing", $"Gerät gekoppelt: {device.Name} ({device.Id})");
        return (device, token);
    }

    public PairedDevice? VerifyLogin(string deviceId, string proofHex, byte[] nonce)
    {
        var device = Get(deviceId);
        if (device == null) return null;
        var keyHex = _secrets.Unprotect(device.KeyProtected);
        if (keyHex == null) return null;
        var expected = HMACSHA256.HashData(Convert.FromHexString(keyHex), nonce);
        byte[] given;
        try { given = Convert.FromHexString(proofHex); } catch { return null; }
        return CryptographicOperations.FixedTimeEquals(expected, given) ? device : null;
    }

    public void Touch(string id, string? ip) => _store.Update(f =>
    {
        var d = f.Devices.FirstOrDefault(x => x.Id == id);
        if (d != null) { d.LastSeenAt = DateTime.UtcNow; d.LastIp = ip; }
    });

    public bool Rename(string id, string name) => _store.Update(f =>
    {
        var d = f.Devices.FirstOrDefault(x => x.Id == id);
        if (d == null) return false;
        d.Name = Sanitize(name, 40, d.Name);
        return true;
    });

    public bool SetPermissions(string id, IEnumerable<string> perms) => _store.Update(f =>
    {
        var d = f.Devices.FirstOrDefault(x => x.Id == id);
        if (d == null) return false;
        d.Permissions = perms.Where(p => Permissions.Grantable.Contains(p)).Distinct().ToList();
        return true;
    });

    public bool Revoke(string id)
    {
        var ok = _store.Update(f =>
        {
            f.UiPrefs.Remove(id);
            return f.Devices.RemoveAll(x => x.Id == id) > 0;
        });
        if (ok) { Log.Info("pairing", $"Gerät widerrufen: {id}"); Revoked?.Invoke(id); }
        return ok;
    }

    public string? GetUiPrefs(string key) => _store.Get(f => f.UiPrefs.TryGetValue(key, out var v) ? v : null);
    public void SaveUiPrefs(string key, string json) => _store.Update(f => f.UiPrefs[key] = json);

    internal DevicesFile Export() => _store.Snapshot();

    public static string Sanitize(string? s, int max, string fallback)
    {
        if (string.IsNullOrWhiteSpace(s)) return fallback;
        var clean = new string(s.Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (clean.Length == 0) return fallback;
        return clean.Length > max ? clean[..max] : clean;
    }
}

public enum PairingError { None, RateLimited, NoActiveCode, Invalid, Expired, Locked }

public sealed class PendingPairing
{
    public string RequestId { get; init; } = "";
    public string DeviceName { get; init; } = "";
    public string Platform { get; init; } = "";
    public string? Ip { get; init; }
    public DateTime CreatedAt { get; init; }
    internal string ClaimSecretHash { get; init; } = "";
    internal string? ChannelId { get; set; }
    internal bool? Approved { get; set; }
    internal string? Token { get; set; }
    internal string? DeviceId { get; set; }
}

/// <summary>
/// One-time pairing codes: 8 characters from a 32-symbol alphabet (40 bit), valid for 5 minutes,
/// single use, max. 5 wrong guesses before the code is locked, rate-limited per IP and globally,
/// and every request must additionally be confirmed on the PC.
/// </summary>
public sealed class PairingService
{
    const string Alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan PendingLifetime = TimeSpan.FromMinutes(5);
    /// <summary>Wrong guesses per address before that address may not try this code any more.</summary>
    public const int MaxFailuresPerCode = 5;
    /// <summary>Wrong guesses from all addresses together before the code is withdrawn. 40 bit and the rate limits make
    /// guessing hopeless anyway; locking after 5 from anyone would let any device in the Wi-Fi block pairing for everyone.</summary>
    public const int MaxFailuresTotal = 50;
    readonly Dictionary<string, int> _failuresByIp = new();

    readonly DeviceStore _devices;
    readonly Func<DateTime> _now;
    readonly RateLimiter _perIp;
    readonly RateLimiter _global;
    readonly object _lock = new();
    readonly Dictionary<string, PendingPairing> _pending = new();

    string? _code;
    DateTime _codeExpires;
    int _failures;
    bool _locked;

    public event Action<PendingPairing>? PendingAdded;
    public event Action<PendingPairing>? Decided;
    public event Action? CodeLocked;
    /// <summary>A new device was added with a transfer code: (new device, device that created the code).</summary>
    public event Action<PairedDevice, PairedDevice>? HandedOff;

    /// <summary>Transfer codes ("Zugang übertragen"): SHA-256 of the code → creating device and expiry.</summary>
    readonly Dictionary<string, (string deviceId, DateTime expires)> _handoffs = new();
    public static readonly TimeSpan HandoffLifetime = TimeSpan.FromMinutes(10);
    public const int MaxHandoffsPerDevice = 3;

    public PairingService(DeviceStore devices, Func<DateTime>? now = null)
    {
        _devices = devices;
        _now = now ?? (() => DateTime.UtcNow);
        _perIp = new RateLimiter(8, TimeSpan.FromMinutes(5), _now);
        _global = new RateLimiter(30, TimeSpan.FromMinutes(1), _now);
    }

    public (string code, DateTime expiresAt) CreateCode()
    {
        lock (_lock)
        {
            var chars = new char[8];
            for (int i = 0; i < chars.Length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
            _code = new string(chars);
            _codeExpires = _now() + CodeLifetime;
            _failures = 0;
            _failuresByIp.Clear();
            _locked = false;
            Log.Info("pairing", "Neuer Kopplungscode erzeugt (gültig 5 Minuten).");
            return (Format(_code), _codeExpires);
        }
    }

    public static string Format(string raw) => raw.Length == 8 ? raw[..4] + "-" + raw[4..] : raw;
    public static string Normalize(string? input) => new((input ?? "").ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());

    public (string code, DateTime expiresAt)? ActiveCode()
    {
        lock (_lock) return _code != null && !_locked && _now() < _codeExpires ? (Format(_code), _codeExpires) : null;
    }

    public void CancelCode() { lock (_lock) { _code = null; } }

    public (PairingError error, PendingPairing? pending, string? claimSecret, TimeSpan retryAfter) Request(string code, string deviceName, string platform, string ip, string channelId)
    {
        if (!_perIp.TryHit(ip)) return (PairingError.RateLimited, null, null, _perIp.RetryAfter(ip));
        if (!_global.TryHit("all")) return (PairingError.RateLimited, null, null, _global.RetryAfter("all"));
        lock (_lock)
        {
            if (_code == null) return (_locked ? PairingError.Locked : PairingError.NoActiveCode, null, null, default);
            if (_locked) return (PairingError.Locked, null, null, default);
            if (_failuresByIp.GetValueOrDefault(ip) >= MaxFailuresPerCode) return (PairingError.Locked, null, null, default);
            var normalized = Normalize(code);
            var match = CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(normalized.PadRight(8)), Encoding.ASCII.GetBytes(_code));
            if (_now() >= _codeExpires)
            {
                if (match) { _code = null; return (PairingError.Expired, null, null, default); }
                return (PairingError.Invalid, null, null, default);
            }
            if (!match)
            {
                _failures++;
                _failuresByIp[ip] = _failuresByIp.GetValueOrDefault(ip) + 1;
                if (_failures >= MaxFailuresTotal)
                {
                    _locked = true;
                    _code = null;
                    Log.Warn("pairing", "Kopplungscode nach zu vielen Fehlversuchen gesperrt.");
                    CodeLocked?.Invoke();
                }
                return (PairingError.Invalid, null, null, default);
            }
            _code = null; // single use
            var claim = Ids.Token(24);
            var p = new PendingPairing
            {
                RequestId = Ids.New("pair"),
                DeviceName = DeviceStore.Sanitize(deviceName, 40, "Neues Gerät"),
                Platform = DeviceStore.Sanitize(platform, 40, "Unbekannt"),
                Ip = ip,
                CreatedAt = _now(),
                ClaimSecretHash = Ids.Sha256Hex(claim),
                ChannelId = channelId,
            };
            _pending[p.RequestId] = p;
            Cleanup();
            Log.Info("pairing", $"Kopplungsanfrage von „{p.DeviceName}“ ({ip}) wartet auf Bestätigung.");
            PendingAdded?.Invoke(p);
            return (PairingError.None, p, claim, default);
        }
    }

    /// <summary>
    /// A paired device creates a one-time code that adds a further access for the same person, e.g. the iPad's
    /// home-screen app (own storage, separate from Safari) or the same device under a fixed address. Valid 10 minutes,
    /// single use, at most 3 open per device; the new access gets the same rights as the creating one, never more,
    /// shows up in the device list and is revoked like any other.
    /// </summary>
    public (string code, DateTime expiresAt) CreateHandoff(string deviceId)
    {
        lock (_lock)
        {
            CleanupHandoffs();
            var mine = _handoffs.Where(kv => kv.Value.deviceId == deviceId).OrderBy(kv => kv.Value.expires).Select(kv => kv.Key).ToList();
            foreach (var old in mine.Take(Math.Max(0, mine.Count - (MaxHandoffsPerDevice - 1)))) _handoffs.Remove(old);
            var code = Ids.Token(24);
            var expires = _now() + HandoffLifetime;
            _handoffs[Ids.Sha256Hex(code)] = (deviceId, expires);
            return (code, expires);
        }
    }

    public (PairingError error, PairedDevice? device, string? token, TimeSpan retryAfter) RedeemHandoff(string code, string deviceName, string platform, string ip)
    {
        if (!_perIp.TryHit(ip)) return (PairingError.RateLimited, null, null, _perIp.RetryAfter(ip));
        PairedDevice? source;
        lock (_lock)
        {
            CleanupHandoffs();
            var key = Ids.Sha256Hex(code ?? "");
            if (!_handoffs.Remove(key, out var h)) return (PairingError.Invalid, null, null, default);
            source = _devices.Get(h.deviceId);
            if (source == null) return (PairingError.Invalid, null, null, default); // creating device was removed meanwhile
        }
        var name = string.IsNullOrWhiteSpace(deviceName) ? source.Name + " (2)" : deviceName;
        var (device, token) = _devices.Create(name, platform, source.Permissions, ip);
        Log.Info("pairing", $"Zugang übertragen: „{device.Name}“ ({device.Id}) über „{source.Name}“ ({source.Id}).");
        HandedOff?.Invoke(device, source);
        return (PairingError.None, device, token, default);
    }

    void CleanupHandoffs()
    {
        var now = _now();
        foreach (var k in _handoffs.Where(kv => kv.Value.expires <= now).Select(kv => kv.Key).ToList()) _handoffs.Remove(k);
    }

    public IReadOnlyList<PendingPairing> Pending()
    {
        lock (_lock) { Cleanup(); return _pending.Values.Where(p => p.Approved == null).ToList(); }
    }

    public PendingPairing? Decide(string requestId, bool approve, IEnumerable<string>? permissions)
    {
        lock (_lock)
        {
            Cleanup();
            if (!_pending.TryGetValue(requestId, out var p) || p.Approved != null) return null;
            p.Approved = approve;
            if (approve)
            {
                var (device, token) = _devices.Create(p.DeviceName, p.Platform, permissions ?? Permissions.Default, p.Ip);
                p.DeviceId = device.Id;
                p.Token = token;
            }
            else Log.Info("pairing", $"Kopplungsanfrage von „{p.DeviceName}“ abgelehnt.");
            Decided?.Invoke(p);
            return p;
        }
    }

    /// <summary>Lets a device that lost its connection fetch the decision. The token is handed out only once.</summary>
    public (string state, string? token, string? deviceId) Claim(string requestId, string claimSecret, string newChannelId)
    {
        lock (_lock)
        {
            Cleanup();
            if (!_pending.TryGetValue(requestId, out var p)) return ("unknown", null, null);
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Ids.Sha256Hex(claimSecret ?? "")), Encoding.ASCII.GetBytes(p.ClaimSecretHash))) return ("unknown", null, null);
            p.ChannelId = newChannelId;
            if (p.Approved == null) return ("pending", null, null);
            if (p.Approved == false) { _pending.Remove(requestId); return ("denied", null, null); }
            return ("approved", TakeToken(p), p.DeviceId);
        }
    }

    /// <summary>Removes the token from memory after it was delivered.</summary>
    public string? TakeToken(PendingPairing p)
    {
        lock (_lock)
        {
            var t = p.Token;
            p.Token = null;
            _pending.Remove(p.RequestId);
            return t;
        }
    }

    void Cleanup()
    {
        var now = _now();
        foreach (var id in _pending.Where(kv => now - kv.Value.CreatedAt > PendingLifetime).Select(kv => kv.Key).ToList()) _pending.Remove(id);
    }
}
