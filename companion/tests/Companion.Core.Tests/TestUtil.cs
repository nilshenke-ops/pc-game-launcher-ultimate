using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public sealed class TempDir : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "pgl-test-" + Guid.NewGuid().ToString("N"));
    public TempDir() => Directory.CreateDirectory(Path);
    public void Dispose() { try { Directory.Delete(Path, true); } catch { } }
}

public sealed class TestChannel(string ip = "192.168.1.50", bool loopback = false, string transport = "local") : IClientChannel
{
    public string Id { get; } = Ids.New("test");
    public string RemoteIp => ip;
    public bool IsLoopback => loopback;
    public string Transport => transport;
    public List<string> Sent { get; } = new();
    public bool Closed { get; private set; }
    public Task SendAsync(string text) { lock (Sent) Sent.Add(text); return Task.CompletedTask; }
    public Task CloseAsync(string reason) { Closed = true; return Task.CompletedTask; }

    public IEnumerable<JsonElement> Events(string name)
    {
        lock (Sent)
            return Sent.Select(s => JsonDocument.Parse(s).RootElement).Where(e => e.TryGetProperty("ev", out var ev) && ev.GetString() == name).ToList();
    }
}

/// <summary>A connected client talking to a real RpcServer, used to test the protocol end to end.</summary>
public sealed class TestClient
{
    readonly RpcServer _rpc;
    public TestChannel Channel { get; }
    long _id;

    public TestClient(RpcServer rpc, TestChannel? channel = null)
    {
        _rpc = rpc;
        Channel = channel ?? new TestChannel();
        rpc.OnConnected(Channel);
    }

    public async Task<JsonElement> Raw(string json)
    {
        int before;
        lock (Channel.Sent) before = Channel.Sent.Count;
        await _rpc.OnMessageAsync(Channel, json);
        for (int i = 0; i < 200; i++)
        {
            lock (Channel.Sent)
                foreach (var s in Channel.Sent.Skip(before))
                {
                    var e = JsonDocument.Parse(s).RootElement;
                    if (e.TryGetProperty("ok", out _)) return e.Clone();
                }
            await Task.Delay(10);
        }
        throw new TimeoutException("Keine Antwort");
    }

    public Task<JsonElement> Call(string method, object? p = null, long? id = null)
    {
        var mid = id ?? ++_id;
        _id = Math.Max(_id, mid);
        return Raw(JsonSerializer.Serialize(new { v = 1, id = mid, m = method, p = p ?? new { } }));
    }

    public async Task<JsonElement> Ok(string method, object? p = null)
    {
        var r = await Call(method, p);
        Assert.True(r.GetProperty("ok").GetBoolean(), $"{method} fehlgeschlagen: {r}");
        return r.TryGetProperty("r", out var res) ? res : default;
    }

    public async Task<string> Error(string method, object? p = null)
    {
        var r = await Call(method, p);
        Assert.False(r.GetProperty("ok").GetBoolean(), $"{method} sollte fehlschlagen: {r}");
        return r.GetProperty("e").GetProperty("code").GetString()!;
    }
}

public static class Fixtures
{
    /// <summary>Repository root (the folder that contains protocol/).</summary>
    public static string RepoRoot
    {
        get
        {
            var d = new DirectoryInfo(AppContext.BaseDirectory);
            while (d != null && !Directory.Exists(Path.Combine(d.FullName, "protocol"))) d = d.Parent;
            return d?.FullName ?? throw new DirectoryNotFoundException("Repository-Wurzel nicht gefunden");
        }
    }

    public static CompanionServices Services(TempDir dir) => new(new GenericPlatform(), new AppPaths(dir.Path), new Hosting.WebAssets(dir.Path));

    /// <summary>Logs a PC (local admin) client in.</summary>
    public static async Task<TestClient> Admin(CompanionServices s)
    {
        var c = new TestClient(s.Rpc, new TestChannel("127.0.0.1", loopback: true));
        await c.Ok("hello");
        await c.Ok("auth.login", new { adminToken = s.Rpc.AdminToken });
        return c;
    }

    /// <summary>Runs the complete pairing flow and returns a logged-in device client plus its credentials.</summary>
    public static async Task<(TestClient client, string deviceId, string token)> PairedDevice(CompanionServices s, TestClient admin, string[]? perms = null)
    {
        var code = (await admin.Ok("pairing.create")).GetProperty("code").GetString()!;
        var phone = new TestClient(s.Rpc);
        await phone.Ok("hello");
        var req = await phone.Ok("pairing.request", new { code, deviceName = "Test-iPhone", platform = "iPhone" });
        await admin.Ok("pairing.decide", new { requestId = req.GetProperty("requestId").GetString(), approve = true, permissions = perms ?? Security.Permissions.Default });
        var result = phone.Channel.Events("pairing.result").Single().GetProperty("d");
        var token = result.GetProperty("token").GetString()!;
        var deviceId = result.GetProperty("deviceId").GetString()!;
        var device = await Login(s, deviceId, token);
        return (device, deviceId, token);
    }

    public static async Task<TestClient> Login(CompanionServices s, string deviceId, string token, TestChannel? ch = null)
    {
        var c = new TestClient(s.Rpc, ch);
        var hello = await c.Ok("hello");
        var proof = Proof(token, hello.GetProperty("nonce").GetString()!);
        await c.Ok("auth.login", new { deviceId, proof });
        return c;
    }

    public static string Proof(string token, string nonceHex)
    {
        var key = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(System.Security.Cryptography.HMACSHA256.HashData(key, Convert.FromHexString(nonceHex))).ToLowerInvariant();
    }
}
