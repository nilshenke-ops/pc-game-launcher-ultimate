using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Hosting;

/// <summary>
/// Optional outbound connection to a relay server for access from outside the home network.
/// The relay only forwards opaque frames per client channel; pairing and login are verified here, end to end.
/// Frames: {t:"open",ch,ip} {t:"msg",ch,d} {t:"close",ch} (relay → companion) and {t:"msg",ch,d} {t:"close",ch} (companion → relay).
/// </summary>
public sealed class RelayClient : IAsyncDisposable
{
    readonly RpcServer _rpc;
    readonly ConcurrentDictionary<string, RelayChannel> _channels = new();
    readonly SemaphoreSlim _send = new(1, 1);
    CancellationTokenSource? _cts;
    ClientWebSocket? _ws;
    Task? _loop;

    public string State { get; private set; } = "disabled";
    public string? LastError { get; private set; }
    public DateTime? ConnectedAt { get; private set; }
    public string? Url { get; private set; }
    public event Action<string>? StateChanged;

    public RelayClient(RpcServer rpc) { _rpc = rpc; }

    public object Status() => new { state = State, url = Url, lastError = LastError, connectedAt = ConnectedAt, clients = _channels.Count };

    public static string CompanionEndpoint(string relayUrl)
    {
        var u = new Uri(relayUrl);
        return u.AbsolutePath is "" or "/" ? relayUrl.TrimEnd('/') + "/companion" : relayUrl;
    }

    /// <summary>Shows a configuration problem instead of connecting (e.g. the address is this companion itself).</summary>
    public void Block(string url, string problem)
    {
        _ = StopAsync();
        Url = url;
        SetState("error", problem);
        Log.Warn("relay", problem);
    }

    public void Start(string url, string companionId, string secret)
    {
        _ = StopAsync();
        Url = url;
        _cts = new CancellationTokenSource();
        var ct = _cts.Token;
        _loop = Task.Run(() => Loop(CompanionEndpoint(url), companionId, secret, ct));
    }

    void SetState(string s, string? error = null)
    {
        State = s;
        if (error != null) LastError = error;
        StateChanged?.Invoke(s);
        _rpc.Broadcast("relay.status", Status());
    }

    async Task Loop(string endpoint, string id, string secret, CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(2);
        while (!ct.IsCancellationRequested)
        {
            SetState("connecting");
            try
            {
                using var ws = new ClientWebSocket();
                ws.Options.KeepAliveInterval = TimeSpan.FromSeconds(25);
                using (var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct))
                {
                    connectCts.CancelAfter(TimeSpan.FromSeconds(15));
                    await ws.ConnectAsync(new Uri(endpoint), connectCts.Token);
                }
                _ws = ws;
                await SendRaw(JsonSerializer.Serialize(new { t = "auth", id, secret, protocol = RpcServer.ProtocolVersion }));
                var first = await Receive(ws, ct);
                using (var doc = JsonDocument.Parse(first ?? "{}"))
                {
                    var t = doc.RootElement.TryGetProperty("t", out var te) ? te.GetString() : null;
                    // A PC companion (not a relay) answers with an RPC response {v,id,ok:false,...}.
                    if (t == null && doc.RootElement.TryGetProperty("v", out _))
                        throw new InvalidOperationException($"Unter {endpoint} antwortet ein PC-Begleiter, kein Relay. Trage die Adresse deines Relay-Servers ein (Standard-Port 8788) oder schalte das Relay aus – im WLAN wird es nicht gebraucht.");
                    if (t != "ok")
                    {
                        var msg = doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() : "Relay hat die Anmeldung abgelehnt.";
                        throw new InvalidOperationException(msg);
                    }
                }
                ConnectedAt = DateTime.UtcNow;
                LastError = null;
                delay = TimeSpan.FromSeconds(2);
                SetState("connected");
                Log.Info("relay", $"Mit Relay verbunden: {endpoint}");
                while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    var text = await Receive(ws, ct);
                    if (text == null) break;
                    HandleFrame(text);
                }
                SetState("reconnecting", "Verbindung zum Relay getrennt.");
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                var msg = Explain(ex, endpoint);
                SetState("error", msg);
                Log.Warn("relay", $"Relay nicht erreichbar: {msg}");
            }
            finally
            {
                foreach (var c in _channels.Values) _rpc.OnClosed(c);
                _channels.Clear();
                _ws = null;
            }
            try { await Task.Delay(delay, ct); } catch { break; }
            delay = TimeSpan.FromSeconds(Math.Min(60, delay.TotalSeconds * 2));
        }
        SetState("disabled");
    }

    static string Explain(Exception ex, string endpoint)
    {
        for (Exception? e = ex; e != null; e = e.InnerException)
            if (e is System.Net.Sockets.SocketException se)
                return se.SocketErrorCode switch
                {
                    System.Net.Sockets.SocketError.ConnectionRefused => $"Unter {endpoint} läuft kein Dienst (Verbindung abgelehnt). Läuft der Relay-Server (npm run start:relay, Standard-Port 8788)?",
                    System.Net.Sockets.SocketError.HostNotFound or System.Net.Sockets.SocketError.NoData => $"Der Name in {endpoint} wurde nicht gefunden (DNS). Adresse prüfen.",
                    System.Net.Sockets.SocketError.TimedOut => $"{endpoint} antwortet nicht (Zeitüberschreitung). Firewall oder Adresse prüfen.",
                    _ => $"{endpoint}: {se.Message}",
                };
        if (ex is OperationCanceledException) return $"{endpoint} antwortet nicht (Zeitüberschreitung nach 15 s).";
        return ex.Message;
    }

    static async Task<string?> Receive(ClientWebSocket ws, CancellationToken ct)
    {
        var buf = new byte[64 * 1024];
        using var ms = new MemoryStream();
        while (true)
        {
            var r = await ws.ReceiveAsync(buf, ct);
            if (r.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buf, 0, r.Count);
            if (ms.Length > RpcServer.MaxMessageBytes * 2) throw new InvalidOperationException("Relay-Nachricht zu groß.");
            if (r.EndOfMessage) return Encoding.UTF8.GetString(ms.ToArray());
        }
    }

    void HandleFrame(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            var r = doc.RootElement;
            var t = r.GetProperty("t").GetString();
            var ch = r.TryGetProperty("ch", out var che) ? che.GetString() ?? "" : "";
            switch (t)
            {
                case "open":
                    var ip = r.TryGetProperty("ip", out var ipe) ? ipe.GetString() ?? "relay" : "relay";
                    var channel = new RelayChannel(this, ch, ip);
                    _channels[ch] = channel;
                    _rpc.OnConnected(channel);
                    break;
                case "msg":
                    if (_channels.TryGetValue(ch, out var c)) _ = _rpc.OnMessageAsync(c, r.GetProperty("d").GetString() ?? "");
                    break;
                case "close":
                    if (_channels.TryRemove(ch, out var closed)) _rpc.OnClosed(closed);
                    break;
            }
        }
        catch (Exception ex) { Log.Warn("relay", "Ungültiger Relay-Frame: " + ex.Message); }
    }

    internal async Task SendRaw(string text)
    {
        var ws = _ws;
        if (ws == null || ws.State != WebSocketState.Open) return;
        await _send.WaitAsync();
        try { await ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, CancellationToken.None); }
        catch { }
        finally { _send.Release(); }
    }

    internal void Forget(string ch) { if (_channels.TryRemove(ch, out var c)) _rpc.OnClosed(c); }

    public async Task StopAsync()
    {
        _cts?.Cancel();
        try { if (_ws != null) await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
        if (_loop != null) try { await _loop.WaitAsync(TimeSpan.FromSeconds(3)); } catch { }
        _loop = null;
        State = "disabled";
    }

    public ValueTask DisposeAsync() => new(StopAsync());

    sealed class RelayChannel(RelayClient owner, string ch, string ip) : IClientChannel
    {
        public string Id { get; } = "relay:" + ch;
        public string RemoteIp => ip;
        public bool IsLoopback => false;
        public string Transport => "relay";
        public Task SendAsync(string text) => owner.SendRaw(JsonSerializer.Serialize(new { t = "msg", ch, d = text }));
        public async Task CloseAsync(string reason)
        {
            await owner.SendRaw(JsonSerializer.Serialize(new { t = "close", ch, reason }));
            owner.Forget(ch);
        }
    }
}
