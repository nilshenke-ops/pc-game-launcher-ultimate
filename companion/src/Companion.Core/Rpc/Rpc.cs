using System.Collections.Concurrent;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Security;

namespace Pgl.Core.Rpc;

/// <summary>A bidirectional message channel to one web client (direct WebSocket or multiplexed via relay).</summary>
public interface IClientChannel
{
    string Id { get; }
    string RemoteIp { get; }
    /// <summary>True only for a direct connection from this machine (not via relay).</summary>
    bool IsLoopback { get; }
    string Transport { get; }
    Task SendAsync(string text);
    Task CloseAsync(string reason);
}

public sealed class RpcException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

public sealed class RpcSession
{
    public required IClientChannel Channel { get; init; }
    public byte[] Nonce { get; } = RandomNumberGenerator.GetBytes(32);
    public long LastSeq { get; set; }
    public PairedDevice? Device { get; set; }
    public bool IsLocalAdmin { get; set; }
    public HashSet<string> Permissions { get; set; } = new();
    public HashSet<string> Subscriptions { get; } = new();
    public DateTime ConnectedAt { get; } = DateTime.UtcNow;
    public RateLimiter Limiter { get; } = new(300, TimeSpan.FromSeconds(10));
    public bool Authenticated => IsLocalAdmin || Device != null;
    public string Who => IsLocalAdmin ? "PC" : Device?.Name ?? "unbekannt";
    public string PrefsKey => IsLocalAdmin ? "local" : Device?.Id ?? "anon";
    public bool Has(string perm) => Permissions.Contains(perm);
}

public sealed class RpcContext
{
    public required RpcSession Session { get; init; }
    public required JsonElement Params { get; init; }

    public T Bind<T>() where T : class
    {
        try
        {
            var v = Params.ValueKind == JsonValueKind.Undefined || Params.ValueKind == JsonValueKind.Null
                ? JsonSerializer.Deserialize<T>("{}", Json.Options)
                : Params.Deserialize<T>(Json.Options);
            return v ?? throw new RpcException("invalid-params", "Parameter fehlen.");
        }
        catch (JsonException ex) { throw new RpcException("invalid-params", "Ungültige Parameter: " + ex.Message); }
    }

    public string Str(string name, int maxLen = 200, bool required = true)
    {
        if (Params.ValueKind == JsonValueKind.Object && Params.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String)
        {
            var s = v.GetString()!;
            if (s.Length > maxLen) throw new RpcException("invalid-params", $"„{name}“ ist zu lang.");
            if (required && s.Length == 0) throw new RpcException("invalid-params", $"„{name}“ fehlt.");
            return s;
        }
        if (required) throw new RpcException("invalid-params", $"„{name}“ fehlt.");
        return "";
    }

    public string? OptStr(string name, int maxLen = 200)
    {
        var s = Str(name, maxLen, required: false);
        return s.Length == 0 ? null : s;
    }

    public bool Bool(string name, bool fallback = false) =>
        Params.ValueKind == JsonValueKind.Object && Params.TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False ? v.GetBoolean() : fallback;

    public int Int(string name, int fallback, int min, int max) =>
        Params.ValueKind == JsonValueKind.Object && Params.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i)
            ? Math.Clamp(i, min, max) : fallback;
}

public delegate Task<object?> RpcHandler(RpcContext ctx);

public interface IHub
{
    void Broadcast(string ev, object? data, string permission = Security.Permissions.View);
    void Changed(string topic) => Broadcast("changed", new { topic });
    void SendTo(RpcSession session, string ev, object? data);
}

/// <summary>
/// JSON message protocol (version 1). Request: {v,id,m,p}. Response: {v,id,ok,r|e}. Event: {v,ev,d}.
/// Request ids must strictly increase per connection (duplicate/replayed frames are rejected).
/// Each method has exactly one required permission, defined centrally in protocol/protocol.json.
/// </summary>
public sealed class RpcServer : IHub
{
    public const int ProtocolVersion = 1;
    public const int MaxMessageBytes = 1024 * 1024;

    readonly Dictionary<string, (string perm, RpcHandler handler)> _methods = new();
    readonly ConcurrentDictionary<string, RpcSession> _sessions = new();
    readonly RateLimiter _loginLimiter = new(20, TimeSpan.FromMinutes(5));
    public IReadOnlyDictionary<string, string> ProtocolPermissions { get; }

    /// <summary>Random per-launch secret for the PC's own window. Only accepted on direct loopback connections.</summary>
    public string AdminToken { get; } = Ids.Token(32);

    public DeviceStore Devices { get; }
    public Func<RpcSession, object> HelloInfo { get; set; } = _ => new { };

    public RpcServer(DeviceStore devices)
    {
        Devices = devices;
        ProtocolPermissions = LoadProtocol();
        devices.Revoked += id =>
        {
            foreach (var s in _sessions.Values.Where(s => s.Device?.Id == id).ToList())
            {
                SendTo(s, "auth.revoked", new { reason = "Dieses Gerät wurde am PC entfernt." });
                _ = s.Channel.CloseAsync("revoked");
            }
        };
        Register("hello", ctx => Task.FromResult<object?>(Hello(ctx.Session)));
        Register("ping", ctx => Task.FromResult<object?>(new { t = DateTime.UtcNow }));
        Register("auth.login", Login);
        Register("auth.logout", ctx =>
        {
            ctx.Session.Device = null; ctx.Session.IsLocalAdmin = false; ctx.Session.Permissions.Clear();
            return Task.FromResult<object?>(true);
        });
    }

    static Dictionary<string, string> LoadProtocol()
    {
        using var s = typeof(RpcServer).Assembly.GetManifestResourceStream("protocol.json")
            ?? throw new InvalidOperationException("protocol.json fehlt im Build.");
        var node = JsonNode.Parse(s)!;
        return node["methods"]!.AsObject().ToDictionary(kv => kv.Key, kv => kv.Value!.GetValue<string>());
    }

    public IEnumerable<string> RegisteredMethods => _methods.Keys;

    public void Register(string method, RpcHandler handler)
    {
        if (!ProtocolPermissions.TryGetValue(method, out var perm))
            throw new InvalidOperationException($"Methode {method} ist nicht in protocol.json definiert.");
        _methods[method] = (perm, handler);
    }

    public void Register(string method, Func<RpcContext, object?> handler) => Register(method, ctx => Task.FromResult(handler(ctx)));

    object Hello(RpcSession s) => new
    {
        protocol = ProtocolVersion,
        nonce = Convert.ToHexString(s.Nonce).ToLowerInvariant(),
        transport = s.Channel.Transport,
        info = HelloInfo(s),
    };

    Task<object?> Login(RpcContext ctx)
    {
        var s = ctx.Session;
        if (!_loginLimiter.TryHit(s.Channel.RemoteIp))
            throw new RpcException("rate-limited", "Zu viele Anmeldeversuche. Bitte kurz warten.");
        var admin = ctx.OptStr("adminToken", 100);
        if (admin != null)
        {
            if (!s.Channel.IsLoopback || s.Channel.Transport != "local")
                throw new RpcException("forbidden", "Die PC-Anmeldung ist nur direkt auf diesem PC möglich.");
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(admin), Encoding.UTF8.GetBytes(AdminToken)))
                throw new RpcException("auth-failed", "PC-Sitzung abgelaufen. Bitte das Companion-Fenster neu öffnen.");
            s.IsLocalAdmin = true;
            s.Permissions = new HashSet<string>(Permissions.LocalAdmin);
            return Task.FromResult<object?>(new { isLocal = true, device = (object?)null, permissions = s.Permissions });
        }
        var deviceId = ctx.Str("deviceId", 64);
        var proof = ctx.Str("proof", 128);
        var device = Devices.VerifyLogin(deviceId, proof, s.Nonce);
        if (device == null)
        {
            Log.Warn("auth", $"Fehlgeschlagene Anmeldung von {s.Channel.RemoteIp}.");
            throw new RpcException("auth-failed", "Dieses Gerät ist nicht (mehr) gekoppelt. Bitte neu koppeln.");
        }
        s.Device = device;
        s.Permissions = new HashSet<string>(device.Permissions);
        Devices.Touch(device.Id, s.Channel.RemoteIp);
        return Task.FromResult<object?>(new { isLocal = false, device = new { device.Id, device.Name, device.Permissions }, permissions = s.Permissions });
    }

    // ------------------------------------------------------------ connection lifecycle

    public RpcSession OnConnected(IClientChannel channel)
    {
        var s = new RpcSession { Channel = channel };
        _sessions[channel.Id] = s;
        return s;
    }

    public void OnClosed(IClientChannel channel) => _sessions.TryRemove(channel.Id, out _);

    public RpcSession? Session(string channelId) => _sessions.TryGetValue(channelId, out var s) ? s : null;
    public IEnumerable<RpcSession> Sessions => _sessions.Values;

    public async Task OnMessageAsync(IClientChannel channel, string text)
    {
        if (!_sessions.TryGetValue(channel.Id, out var session)) return;
        long id = 0;
        try
        {
            if (text.Length > MaxMessageBytes) throw new RpcException("too-large", "Nachricht zu groß.");
            if (!session.Limiter.TryHit("msg")) throw new RpcException("rate-limited", "Zu viele Anfragen.");
            using var doc = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 32 });
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new RpcException("bad-request", "Ungültige Nachricht.");
            if (!root.TryGetProperty("v", out var v) || v.ValueKind != JsonValueKind.Number || v.GetInt32() != ProtocolVersion)
                throw new RpcException("protocol", $"Nicht unterstützte Protokollversion (erwartet {ProtocolVersion}).");
            if (!root.TryGetProperty("id", out var idEl) || !idEl.TryGetInt64(out id) || id <= 0)
                throw new RpcException("bad-request", "Anfrage-ID fehlt.");
            if (id <= session.LastSeq) throw new RpcException("replay", "Doppelte oder veraltete Anfrage verworfen.");
            session.LastSeq = id;
            var method = root.TryGetProperty("m", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : "";
            if (!_methods.TryGetValue(method, out var entry)) throw new RpcException("unknown-method", $"Unbekannte Aktion: {method}");
            Authorize(session, entry.perm);
            var p = root.TryGetProperty("p", out var pe) ? pe.Clone() : default;
            var result = await entry.handler(new RpcContext { Session = session, Params = p });
            await SafeSend(session, Json.Serialize(new { v = ProtocolVersion, id, ok = true, r = result }));
        }
        catch (Exception ex)
        {
            var (code, msg) = ex switch
            {
                RpcException r => (r.Code, r.Message),
                JsonException => ("bad-request", "Nachricht ist kein gültiges JSON."),
                _ => ("internal", "Interner Fehler: " + ex.Message),
            };
            if (ex is not RpcException) Log.Error("rpc", $"{ex.GetType().Name}: {ex.Message}");
            await SafeSend(session, Json.Serialize(new { v = ProtocolVersion, id, ok = false, e = new { code, message = msg } }));
        }
    }

    static void Authorize(RpcSession s, string perm)
    {
        if (perm == "none") return;
        if (!s.Authenticated) throw new RpcException("unauthenticated", "Nicht angemeldet. Bitte Gerät koppeln.");
        if (perm == "any") return;
        if (!s.Has(perm))
            throw new RpcException("forbidden", perm == Permissions.Local
                ? "Diese Aktion ist aus Sicherheitsgründen nur direkt am PC möglich."
                : $"Diesem Gerät fehlt die Berechtigung „{perm}“.");
    }

    static async Task SafeSend(RpcSession s, string text)
    {
        try { await s.Channel.SendAsync(text); } catch { }
    }

    public void Broadcast(string ev, object? data, string permission = Permissions.View)
    {
        var text = Json.Serialize(new { v = ProtocolVersion, ev, d = data });
        foreach (var s in _sessions.Values)
            if (s.Authenticated && s.Has(permission)) _ = SafeSend(s, text);
    }

    public void BroadcastTo(Func<RpcSession, bool> filter, string ev, object? data)
    {
        var text = Json.Serialize(new { v = ProtocolVersion, ev, d = data });
        foreach (var s in _sessions.Values.Where(filter)) _ = SafeSend(s, text);
    }

    public void SendTo(RpcSession session, string ev, object? data) =>
        _ = SafeSend(session, Json.Serialize(new { v = ProtocolVersion, ev, d = data }));

    public void Changed(string topic) => Broadcast("changed", new { topic });
}
