using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

/// <summary>
/// Minimal stand-in for OBS Studio's WebSocket server (obs-websocket protocol 5): Hello with authentication challenge,
/// Identify/Identified, requests for recording and replay buffer, and the matching events.
/// </summary>
public sealed class FakeObs : IDisposable
{
    readonly HttpListener _http = new();
    readonly CancellationTokenSource _cts = new();
    public string Url { get; }
    public string? Password { get; set; }
    public bool Recording { get; private set; }
    public bool ReplayBuffer { get; set; }
    public bool ReplayBufferEnabledInObs { get; set; } = true;
    public List<string> Requests { get; } = new();

    public FakeObs(string? password = null)
    {
        Password = password;
        var l = new TcpListener(IPAddress.Loopback, 0); l.Start();
        var port = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop();
        _http.Prefixes.Add($"http://127.0.0.1:{port}/");
        _http.Start();
        Url = $"ws://127.0.0.1:{port}";
        _ = Accept();
    }

    async Task Accept()
    {
        while (!_cts.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _http.GetContextAsync(); } catch { return; }
            if (!ctx.Request.IsWebSocketRequest) { ctx.Response.StatusCode = 400; ctx.Response.Close(); continue; }
            var ws = (await ctx.AcceptWebSocketAsync(null)).WebSocket;
            _ = Serve(ws);
        }
    }

    static string Sha(string s) => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    async Task Serve(WebSocket ws)
    {
        const string salt = "c2FsdA==", challenge = "Y2hhbGxlbmdl";
        var hello = new JsonObject { ["obsWebSocketVersion"] = "5.5.4", ["rpcVersion"] = 1 };
        if (Password != null) hello["authentication"] = new JsonObject { ["challenge"] = challenge, ["salt"] = salt };
        await Send(ws, 0, hello);
        var identify = await Receive(ws);
        if (Password != null && identify?["d"]?["authentication"]?.GetValue<string>() != Sha(Sha(Password + salt) + challenge))
        {
            await ws.CloseAsync((WebSocketCloseStatus)4009, "Authentication failed.", CancellationToken.None);
            return;
        }
        await Send(ws, 2, new JsonObject { ["negotiatedRpcVersion"] = 1 });
        while (ws.State == WebSocketState.Open)
        {
            var msg = await Receive(ws);
            if (msg == null) return;
            var d = msg["d"]!;
            var type = d["requestType"]!.GetValue<string>();
            lock (Requests) Requests.Add(type);
            JsonObject? data = null;
            (bool ok, int code, string? comment) status = (true, 100, null);
            switch (type)
            {
                case "GetRecordStatus": data = new() { ["outputActive"] = Recording, ["outputTimecode"] = Recording ? "00:00:05.000" : "00:00:00.000" }; break;
                case "ToggleRecord":
                    Recording = !Recording;
                    data = new() { ["outputActive"] = Recording };
                    await Send(ws, 5, new JsonObject { ["eventType"] = "RecordStateChanged", ["eventData"] = new JsonObject { ["outputActive"] = Recording, ["outputState"] = Recording ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED", ["outputPath"] = Recording ? null : "C:/Videos/aufnahme.mkv" } });
                    break;
                case "GetReplayBufferStatus" or "ToggleReplayBuffer" or "StartReplayBuffer" or "StopReplayBuffer" when !ReplayBufferEnabledInObs:
                    status = (false, 504, "Replay buffer is not available."); break;
                case "GetReplayBufferStatus": data = new() { ["outputActive"] = ReplayBuffer }; break;
                case "ToggleReplayBuffer": ReplayBuffer = !ReplayBuffer; data = new() { ["outputActive"] = ReplayBuffer }; break;
                case "StartReplayBuffer": ReplayBuffer = true; break;
                case "StopReplayBuffer": ReplayBuffer = false; break;
                case "SaveReplayBuffer":
                    if (!ReplayBuffer) { status = (false, 501, "Replay buffer is not active."); break; }
                    await Send(ws, 5, new JsonObject { ["eventType"] = "ReplayBufferSaved", ["eventData"] = new JsonObject { ["savedReplayPath"] = "C:/Videos/Replay 2026-10-18.mkv" } });
                    break;
                default: status = (false, 204, "Unknown request type."); break;
            }
            var resp = new JsonObject { ["requestType"] = type, ["requestId"] = d["requestId"]!.GetValue<string>(), ["requestStatus"] = new JsonObject { ["result"] = status.ok, ["code"] = status.code } };
            if (status.comment != null) resp["requestStatus"]!["comment"] = status.comment;
            if (data != null) resp["responseData"] = data;
            await Send(ws, 7, resp);
        }
    }

    readonly SemaphoreSlim _send = new(1, 1);
    async Task Send(WebSocket ws, int op, JsonObject d)
    {
        await _send.WaitAsync();
        try { await ws.SendAsync(Encoding.UTF8.GetBytes(new JsonObject { ["op"] = op, ["d"] = d }.ToJsonString()), WebSocketMessageType.Text, true, CancellationToken.None); }
        finally { _send.Release(); }
    }

    static async Task<JsonNode?> Receive(WebSocket ws)
    {
        var buf = new byte[64 * 1024];
        try
        {
            var r = await ws.ReceiveAsync(buf, CancellationToken.None);
            return r.MessageType == WebSocketMessageType.Close ? null : JsonNode.Parse(Encoding.UTF8.GetString(buf, 0, r.Count));
        }
        catch { return null; }
    }

    public void Dispose() { _cts.Cancel(); try { _http.Stop(); _http.Close(); } catch { } }
}

public class ObsTests
{
    static (ObsService obs, Settings settings) Make(string url, string? password)
    {
        var settings = new Settings { ObsUrl = url, ObsPasswordProtected = password == null ? null : new PlainSecretProtector().Protect(password) };
        return (new ObsService(() => settings, new PlainSecretProtector(), new NullHub()), settings);
    }

    [Fact]
    public void Auth_follows_the_obs_websocket_5_rule()
    {
        static string Sha(string s) => Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(s)));
        Assert.Equal(Sha(Sha("pw" + "salt") + "challenge"), ObsService.Auth("pw", "salt", "challenge"));
    }

    [Fact]
    public async Task Connects_with_password_and_toggles_recording()
    {
        using var fake = new FakeObs("geheim");
        var (obs, _) = Make(fake.Url, "geheim");
        await using var _o = obs;
        var started = new TaskCompletionSource<bool>();
        obs.RecordingChanged += (active, _) => started.TrySetResult(active);
        Assert.Equal("Aufnahme gestartet", await obs.RecordToggle());
        Assert.True(await started.Task.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.True(fake.Recording);
        var status = System.Text.Json.JsonSerializer.SerializeToElement(await obs.Status());
        Assert.True(status.GetProperty("connected").GetBoolean());
        Assert.True(status.GetProperty("recording").GetBoolean());
        Assert.Equal("5.5.4", status.GetProperty("version").GetString());
        Assert.Equal("Aufnahme gestoppt", await obs.RecordToggle());
        Assert.False(fake.Recording);
    }

    [Fact]
    public async Task Wrong_password_is_reported_clearly()
    {
        using var fake = new FakeObs("geheim");
        var (obs, _) = Make(fake.Url, "falsch");
        await using var _o = obs;
        var ex = await Assert.ThrowsAsync<RpcException>(() => obs.RecordToggle());
        Assert.Contains("Passwort abgelehnt", ex.Message);
        Assert.False(fake.Recording);
    }

    [Fact]
    public async Task Missing_password_and_unreachable_obs_are_explained()
    {
        using var fake = new FakeObs("geheim");
        var (obs, _) = Make(fake.Url, null);
        await using var _o = obs;
        Assert.Contains("verlangt ein Passwort", (await Assert.ThrowsAsync<RpcException>(() => obs.ReplaySave())).Message);

        var (obs2, _) = Make("ws://127.0.0.1:1", null);
        await using var _o2 = obs2;
        Assert.Contains("OBS nicht erreichbar", (await Assert.ThrowsAsync<RpcException>(() => obs2.RecordToggle())).Message);
        var status = System.Text.Json.JsonSerializer.SerializeToElement(await obs2.Status());
        Assert.False(status.GetProperty("connected").GetBoolean());
        Assert.Contains("OBS nicht erreichbar", status.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Replay_needs_running_buffer_and_reports_the_saved_file()
    {
        using var fake = new FakeObs();
        var (obs, _) = Make(fake.Url, null);
        await using var _o = obs;
        Assert.Contains("Replay-Puffer läuft nicht", (await Assert.ThrowsAsync<RpcException>(() => obs.ReplaySave())).Message);
        Assert.Equal("Replay-Puffer läuft", await obs.ReplayBufferToggle());
        var saved = new TaskCompletionSource<string?>();
        obs.ReplaySaved += p => saved.TrySetResult(p);
        Assert.Equal("Replay gespeichert", await obs.ReplaySave());
        Assert.Equal("C:/Videos/Replay 2026-10-18.mkv", await saved.Task.WaitAsync(TimeSpan.FromSeconds(5)));
        await obs.EnsureReplayBuffer(false);
        Assert.False(fake.ReplayBuffer);
        await obs.EnsureReplayBuffer(false); // already off: nothing sent
        Assert.Equal(1, fake.Requests.Count(r => r == "StopReplayBuffer"));
    }

    [Fact]
    public async Task Replay_buffer_switched_off_in_obs_is_explained()
    {
        using var fake = new FakeObs { ReplayBufferEnabledInObs = false };
        var (obs, _) = Make(fake.Url, null);
        await using var _o = obs;
        Assert.Contains("Replay-Puffer aktivieren", (await Assert.ThrowsAsync<RpcException>(() => obs.ReplayBufferToggle())).Message);
    }

    [Fact]
    public async Task Steps_run_obs_and_overlay_through_the_action_runner()
    {
        using var fake = new FakeObs();
        var (obs, _) = Make(fake.Url, null);
        await using var _o = obs;
        var runner = new ActionRunner
        {
            ObsRecordToggle = obs.RecordToggle, ObsReplaySave = obs.ReplaySave, ObsReplayBufferToggle = obs.ReplayBufferToggle,
            ToggleOverlay = NullOverlay.Instance.Toggle,
        };
        var results = await runner.RunAsync(new[]
        {
            new ActionStep { Type = StepType.ObsReplayBufferToggle },
            new ActionStep { Type = StepType.ObsReplaySave },
            new ActionStep { Type = StepType.ObsRecordToggle },
            new ActionStep { Type = StepType.ToggleOverlay, Ref = "mini" },
        }, "Test");
        Assert.Equal("Replay-Puffer läuft", results[0]);
        Assert.Equal("Replay gespeichert", results[1]);
        Assert.Equal("Aufnahme gestartet", results[2]);
        Assert.Equal("Fehler: Das Overlay gibt es nur im Windows-Begleiter.", results[3]);
    }

    [Fact]
    public void Settings_reject_non_websocket_addresses_and_never_return_the_password()
    {
        using var dir = new TempDir();
        var svc = new SettingsService(new Pgl.Core.Infrastructure.AppPaths(dir.Path), new NullHub());
        Assert.Throws<RpcException>(() => svc.SetObs("http://evil.example", null, true, null));
        Assert.Throws<RpcException>(() => svc.SetObs("ws://user:pw@127.0.0.1:4455", null, true, null));
        var s = svc.SetObs("ws://192.168.1.20:4455", "plain:pw", false, true);
        Assert.Equal("ws://192.168.1.20:4455", s.ObsUrl);
        Assert.True(s.ObsReplayWhilePlaying);
        Assert.Equal("plain:pw", svc.Get().ObsPasswordProtected);
        svc.SetObs(null, null, keepPassword: true, null);
        Assert.Equal("plain:pw", svc.Get().ObsPasswordProtected);
    }

    [Fact]
    public async Task Rpc_configures_obs_from_a_device_but_the_password_never_comes_back()
    {
        using var dir = new TempDir();
        using var fake = new FakeObs("Sup3rGeheim");
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });

        var st = await phone.Ok("obs.configure", new { url = fake.Url, password = "Sup3rGeheim", replayWhilePlaying = true });
        Assert.True(st.GetProperty("connected").GetBoolean());
        Assert.True(st.GetProperty("passwordSet").GetBoolean());
        Assert.DoesNotContain("Sup3rGeheim", st.GetRawText());
        Assert.DoesNotContain("Sup3rGeheim", (await admin.Ok("settings.get")).GetRawText());
        Assert.DoesNotContain("obsPasswordProtected", (await admin.Ok("settings.get")).GetRawText(), StringComparison.OrdinalIgnoreCase);
        // Recording is an immediate action: needs the "launch" permission.
        Assert.Equal("forbidden", await phone.Error("obs.recordToggle"));
        Assert.Contains("gestartet", (await admin.Ok("obs.recordToggle")).GetProperty("message").GetString());
        Assert.True(fake.Recording);
        // Without the companion for Windows there is no overlay – said so instead of pretending.
        var ov = await admin.Ok("overlay.status");
        Assert.False(ov.GetProperty("supported").GetBoolean());
        Assert.Equal("unsupported", await admin.Error("overlay.toggle", new { mode = "mini" }));
        // An empty password removes it.
        await admin.Ok("obs.configure", new { password = "" });
        Assert.Null(s.Settings.Get().ObsPasswordProtected);
    }
}
