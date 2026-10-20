using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class DesignAccount
{
    public string User { get; set; } = "";
    /// <summary>PBKDF2 of the login key the browser derives from the password – the password itself never reaches the PC.</summary>
    public string AuthHash { get; set; } = "";
    public string AuthSalt { get; set; } = "";
    /// <summary>Design, encrypted in the browser (AES-GCM, key from the password). The PC cannot read it.</summary>
    public string Blob { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class DesignAccountsFile { public List<DesignAccount> Accounts { get; set; } = new(); }

/// <summary>
/// Optional design profiles: user name + password, so a design made in one browser can be loaded in another one
/// (connected to this PC). End-to-end encrypted – the PC only keeps a hash of a login key and the encrypted design.
/// Only the design is stored; a profile gives no rights on the PC.
/// </summary>
public sealed class DesignAccountService
{
    static readonly Regex UserRx = new("^[a-z0-9._-]{3,24}$");
    static readonly Regex KeyRx = new("^[0-9a-f]{64}$");
    public const int MaxAccounts = 20, MaxBlob = 900_000;
    readonly JsonStore<DesignAccountsFile> _store;
    readonly RateLimiter _limiter = new(8, TimeSpan.FromMinutes(15));

    public DesignAccountService(AppPaths paths) => _store = new JsonStore<DesignAccountsFile>(paths.File("design-accounts.json"));

    public static string Normalize(string? user) => (user ?? "").Trim().ToLowerInvariant();

    static string Hash(string key, string salt) => Convert.ToHexString(Rfc2898DeriveBytes.Pbkdf2(Convert.FromHexString(key), Convert.FromBase64String(salt), 100_000, HashAlgorithmName.SHA256, 32));

    static void CheckBlob(string? blob)
    {
        if (string.IsNullOrEmpty(blob) || blob.Length > MaxBlob || !Regex.IsMatch(blob, "^[A-Za-z0-9+/=]+$")) throw new RpcException("invalid-params", "Design-Daten ungültig oder zu groß (Hintergrundbild verkleinern).");
    }

    static void CheckKey(string user, string key)
    {
        if (!UserRx.IsMatch(user)) throw new RpcException("invalid-params", "Benutzername: 3–24 Zeichen, nur Buchstaben a–z, Ziffern, Punkt, Minus, Unterstrich.");
        if (!KeyRx.IsMatch(key)) throw new RpcException("invalid-params", "Ungültiger Schlüssel.");
    }

    public object Create(string userIn, string key, string blob)
    {
        var user = Normalize(userIn);
        CheckKey(user, key); CheckBlob(blob);
        var salt = Convert.ToBase64String(RandomNumberGenerator.GetBytes(16));
        var now = DateTime.UtcNow;
        _store.Update(f =>
        {
            if (f.Accounts.Any(a => a.User == user)) throw new RpcException("conflict", "Diesen Benutzernamen gibt es auf diesem PC schon.");
            if (f.Accounts.Count >= MaxAccounts) throw new RpcException("limit", $"Höchstens {MaxAccounts} Design-Profile pro PC.");
            f.Accounts.Add(new DesignAccount { User = user, AuthSalt = salt, AuthHash = Hash(key, salt), Blob = blob, CreatedAt = now, UpdatedAt = now });
        });
        Log.Info("design", $"Design-Profil „{user}“ angelegt");
        return new { user, updatedAt = now };
    }

    DesignAccount Verify(string userIn, string key, string ip)
    {
        var user = Normalize(userIn);
        CheckKey(user, key);
        if (!_limiter.TryHit(ip + "|" + user)) throw new RpcException("rate-limited", "Zu viele Versuche – bitte in 15 Minuten wieder probieren.");
        var acc = _store.Get(f => f.Accounts.FirstOrDefault(a => a.User == user));
        // Same work for unknown names, so the answer time does not tell which names exist.
        var computed = Convert.FromHexString(Hash(key, acc?.AuthSalt ?? Convert.ToBase64String(new byte[16])));
        var ok = acc != null && CryptographicOperations.FixedTimeEquals(computed, Convert.FromHexString(acc.AuthHash));
        if (acc == null || !ok) { Log.Warn("design", $"Fehlgeschlagene Design-Anmeldung „{user}“ von {ip}"); throw new RpcException("unauthorized", "Benutzername oder Passwort falsch."); }
        return acc;
    }

    public object Load(string user, string key, string ip)
    {
        var a = Verify(user, key, ip);
        return new { user = a.User, blob = a.Blob, updatedAt = a.UpdatedAt };
    }

    public object Save(string user, string key, string blob, string ip)
    {
        CheckBlob(blob);
        var a = Verify(user, key, ip);
        var now = DateTime.UtcNow;
        _store.Update(f => { var x = f.Accounts.First(y => y.User == a.User); x.Blob = blob; x.UpdatedAt = now; });
        return new { user = a.User, updatedAt = now };
    }

    public void Delete(string user, string key, string ip)
    {
        var a = Verify(user, key, ip);
        _store.Update(f => f.Accounts.RemoveAll(x => x.User == a.User));
        Log.Info("design", $"Design-Profil „{a.User}“ gelöscht");
    }

    /// <summary>For the PC view: names and dates only (the designs are encrypted anyway).</summary>
    public object List() => new { accounts = _store.Snapshot().Accounts.Select(a => new { a.User, a.CreatedAt, a.UpdatedAt, size = a.Blob.Length }) };

    /// <summary>Removing a profile at the PC (forgotten password) – the PC owner decides.</summary>
    public void Remove(string user) => _store.Update(f => f.Accounts.RemoveAll(x => x.User == Normalize(user)));
}
