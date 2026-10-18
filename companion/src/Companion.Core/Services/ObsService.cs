using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Controls OBS Studio through its built-in WebSocket server (obs-websocket, protocol version 5, part of OBS 28+):
/// start/stop recording, replay buffer on/off, save replay. The launcher records nothing itself – OBS captures and encodes.
/// The connection is opened on first use, stays open and is reopened after OBS restarts.
/// </summary>
public sealed class ObsService : IAsyncDisposable
{
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(5);
    const int EventSubscriptionOutputs = 1 << 6;

    readonly Func<Settings> _settings;
    readonly ISecretProtector _secrets;
    readonly IHub _hub;
    readonly SemaphoreSlim _connectLock = new(1, 1);
    readonly SemaphoreSlim _sendLock = new(1, 1);
    readonly ConcurrentDictionary<string, TaskCompletionSource<JsonElement>> _pending = new();
    ClientWebSocket? _ws;
    CancellationTokenSource? _readCts;
    string? _lastError;
    string? _version;

    /// <summary>Recording started/stopped (active, file path when stopped).</summary>
    public event Action<bool, string?>? RecordingChanged;
    /// <summary>A replay was written (file path as reported by OBS).</summary>
    public event Action<string?>? ReplaySaved;

    public ObsService(Func<Settings> settings, ISecretProtector secrets, IHub hub)
    {
        _settings = settings; _secrets = secrets; _hub = hub;
    }

    public bool Connected => _ws?.State == WebSocketState.Open;

    // ------------------------------------------------------------ public operations

    public async Task<object> Status()
    {
        var s = _settings();
        bool? recording = null, replay = null;
        string? timecode = null;
        if (!string.IsNullOrEmpty(s.ObsUrl))
        {
            try
            {
                var rec = await Request("GetRecordStatus");
                recording = rec.GetProperty("outputActive").GetBoolean();
                timecode = rec.TryGetProperty("outputTimecode", out var tc) ? tc.GetString() : null;
                try { replay = (await Request("GetReplayBufferStatus")).GetProperty("outputActive").GetBoolean(); }
                catch (RpcException) { replay = null; } // replay buffer switched off in OBS (reported by "replayError")
            }
            catch (RpcException) { /* _lastError says why */ }
        }
        return new
        {
            url = s.ObsUrl,
            passwordSet = s.ObsPasswordProtected != null,
            replayWhilePlaying = s.ObsReplayWhilePlaying,
            connected = Connected,
            version = Connected ? _version : null,
            recording,
            recordTimecode = recording == true ? timecode : null,
            replayBuffer = replay,
            error = Connected ? null : _lastError ?? (string.IsNullOrEmpty(s.ObsUrl) ? "Keine OBS-Adresse eingetragen." : null),
        };
    }

    public async Task<string> RecordToggle()
    {
        var active = (await Request("ToggleRecord")).GetProperty("outputActive").GetBoolean();
        _hub.Changed("obs"); // pages update at once, also if OBS's own event comes later
        return active ? "Aufnahme gestartet" : "Aufnahme gestoppt";
    }

    public async Task<string> ReplayBufferToggle()
    {
        var active = (await Request("ToggleReplayBuffer")).GetProperty("outputActive").GetBoolean();
        _hub.Changed("obs");
        return active ? "Replay-Puffer läuft" : "Replay-Puffer gestoppt";
    }

    public async Task<string> ReplaySave()
    {
        await Request("SaveReplayBuffer");
        return "Replay gespeichert";
    }

    /// <summary>Starts or stops the replay buffer (used while a game runs). Already in that state = nothing happens.</summary>
    public async Task EnsureReplayBuffer(bool on)
    {
        var active = (await Request("GetReplayBufferStatus")).GetProperty("outputActive").GetBoolean();
        if (active != on) { await Request(on ? "StartReplayBuffer" : "StopReplayBuffer"); _hub.Changed("obs"); }
    }

    /// <summary>Closes the connection so that the next call uses changed settings (address, password).</summary>
    public void Reconnect() { Close(); _lastError = null; _hub.Changed("obs"); }

    // ------------------------------------------------------------ protocol

    /// <summary>Authentication string of obs-websocket 5: base64(sha256(base64(sha256(password + salt)) + challenge)).</summary>
    public static string Auth(string password, string salt, string challenge)
    {
        var secret = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password + salt)));
        return Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(secret + challenge)));
    }

    public async Task<JsonElement> Request(string type, JsonObject? data = null)
    {
        var ws = await ConnectAsync();
        var id = Guid.NewGuid().ToString("N");
        var tcs = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = tcs;
        try
        {
            var d = new JsonObject { ["requestType"] = type, ["requestId"] = id };
            if (data != null) d["requestData"] = data;
            await Send(ws, new JsonObject { ["op"] = 6, ["d"] = d });
            JsonElement resp;
            try { resp = await tcs.Task.WaitAsync(Timeout); }
            catch (TimeoutException) { Close(); throw Fail("OBS antwortet nicht (Zeitüberschreitung)."); }
            var status = resp.GetProperty("requestStatus");
            if (!status.GetProperty("result").GetBoolean())
            {
                var code = status.TryGetProperty("code", out var c) ? c.GetInt32() : 0;
                var comment = status.TryGetProperty("comment", out var cm) ? cm.GetString() : null;
                throw new RpcException("obs", Explain(type, code, comment));
            }
            return resp.TryGetProperty("responseData", out var rd) ? rd : JsonDocument.Parse("{}").RootElement;
        }
        finally { _pending.TryRemove(id, out _); }
    }

    static string Explain(string type, int code, string? comment) => (type, code) switch
    {
        ("SaveReplayBuffer", 501) => "Der Replay-Puffer läuft nicht – zuerst „Replay-Puffer an/aus“ wählen (oder „Replay-Puffer beim Spielen“ einschalten).",
        (_, 504) when type.Contains("ReplayBuffer") => "In OBS ist der Replay-Puffer ausgeschaltet: OBS → Einstellungen → Ausgabe → „Replay-Puffer aktivieren“.",
        (_, 500) => "OBS: läuft bereits.",
        (_, 501) => "OBS: läuft gerade nicht.",
        _ => $"OBS hat „{type}“ abgelehnt: {comment ?? "ohne Begründung"} (Code {code}).",
    };

    RpcException Fail(string message)
    {
        _lastError = message;
        return new RpcException("obs", message);
    }

    async Task<ClientWebSocket> ConnectAsync()
    {
        if (_ws is { State: WebSocketState.Open } open) return open;
        await _connectLock.WaitAsync();
        try
        {
            if (_ws is { State: WebSocketState.Open } again) return again;
            Close();
            var s = _settings();
            if (string.IsNullOrEmpty(s.ObsUrl) || !Uri.TryCreate(s.ObsUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("ws" or "wss"))
                throw Fail("Keine gültige OBS-Adresse eingetragen (z. B. ws://127.0.0.1:4455).");
            var ws = new ClientWebSocket();
            using var cts = new CancellationTokenSource(Timeout);
            try { await ws.ConnectAsync(uri, cts.Token); }
            catch (Exception)
            {
                ws.Dispose();
                throw Fail($"OBS nicht erreichbar unter {s.ObsUrl}. Läuft OBS, und ist unter Werkzeuge → WebSocket-Servereinstellungen „WebSocket-Server aktivieren“ an?");
            }
            try
            {
                var hello = await Receive(ws, cts.Token);
                if (hello?["op"]?.GetValue<int>() != 0) throw Fail("Unter dieser Adresse antwortet kein OBS-WebSocket-Server (Version 5).");
                var hd = hello["d"]!;
                _version = hd["obsWebSocketVersion"]?.GetValue<string>();
                var identify = new JsonObject { ["rpcVersion"] = 1, ["eventSubscriptions"] = EventSubscriptionOutputs };
                if (hd["authentication"] is JsonObject a)
                {
                    var pw = s.ObsPasswordProtected == null ? null : _secrets.Unprotect(s.ObsPasswordProtected);
                    if (string.IsNullOrEmpty(pw)) throw Fail("OBS verlangt ein Passwort. Es steht in OBS unter Werkzeuge → WebSocket-Servereinstellungen → „Verbindungsinformationen anzeigen“.");
                    identify["authentication"] = Auth(pw, a["salt"]!.GetValue<string>(), a["challenge"]!.GetValue<string>());
                }
                await Send(ws, new JsonObject { ["op"] = 1, ["d"] = identify });
                var identified = await Receive(ws, cts.Token);
                if (identified?["op"]?.GetValue<int>() != 2) throw Fail("OBS hat die Anmeldung nicht bestätigt.");
            }
            catch (WebSocketCloseException ex)
            {
                ws.Dispose();
                throw Fail(ex.Status == 4009 ? "OBS hat das Passwort abgelehnt. Bitte das Passwort aus OBS (Werkzeuge → WebSocket-Servereinstellungen) neu eintragen."
                    : $"OBS hat die Verbindung beendet: {ex.Description ?? ex.Status.ToString()}");
            }
            catch (OperationCanceledException) { ws.Dispose(); throw Fail("OBS antwortet nicht (Zeitüberschreitung bei der Anmeldung)."); }
            catch (RpcException) { ws.Dispose(); throw; }
            catch (Exception ex) { ws.Dispose(); throw Fail("Verbindung zu OBS fehlgeschlagen: " + ex.Message); }

            _ws = ws;
            _readCts = new CancellationTokenSource();
            _ = ReadLoop(ws, _readCts.Token);
            _lastError = null;
            Log.Info("obs", $"Mit OBS verbunden (obs-websocket {_version}).");
            _hub.Changed("obs");
            return ws;
        }
        finally { _connectLock.Release(); }
    }

    async Task ReadLoop(ClientWebSocket ws, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var msg = await Receive(ws, ct);
                if (msg == null) break;
                var op = msg["op"]?.GetValue<int>();
                var d = msg["d"];
                if (op == 7 && d?["requestId"]?.GetValue<string>() is { } id && _pending.TryGetValue(id, out var tcs))
                    tcs.TrySetResult(JsonDocument.Parse(d.ToJsonString()).RootElement);
                else if (op == 5) OnEvent(d?["eventType"]?.GetValue<string>(), d?["eventData"]);
            }
        }
        catch (WebSocketCloseException ex) { _lastError = $"OBS hat die Verbindung beendet ({ex.Description ?? ex.Status.ToString()})."; }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _lastError = "Verbindung zu OBS unterbrochen: " + ex.Message; }
        finally
        {
            if (ReferenceEquals(_ws, ws))
            {
                _ws = null;
                foreach (var p in _pending.Values) p.TrySetException(Fail(_lastError ?? "Verbindung zu OBS unterbrochen."));
                _hub.Changed("obs");
            }
            ws.Dispose();
        }
    }

    void OnEvent(string? type, JsonNode? data)
    {
        switch (type)
        {
            case "RecordStateChanged":
                var state = data?["outputState"]?.GetValue<string>();
                if (state is "OBS_WEBSOCKET_OUTPUT_STARTED" or "OBS_WEBSOCKET_OUTPUT_STOPPED")
                {
                    RecordingChanged?.Invoke(state.EndsWith("STARTED"), data?["outputPath"]?.GetValue<string>());
                    _hub.Changed("obs");
                }
                break;
            case "ReplayBufferStateChanged":
                _hub.Changed("obs");
                break;
            case "ReplayBufferSaved":
                ReplaySaved?.Invoke(data?["savedReplayPath"]?.GetValue<string>());
                break;
        }
    }

    async Task Send(ClientWebSocket ws, JsonObject msg)
    {
        var bytes = Encoding.UTF8.GetBytes(msg.ToJsonString());
        await _sendLock.WaitAsync();
        try
        {
            using var cts = new CancellationTokenSource(Timeout);
            await ws.SendAsync(bytes, WebSocketMessageType.Text, true, cts.Token);
        }
        catch (Exception ex) when (ex is not RpcException) { Close(); throw Fail("Senden an OBS fehlgeschlagen: " + ex.Message); }
        finally { _sendLock.Release(); }
    }

    /// <summary>Reads one text message (max. 1 MB). Null = connection ended normally.</summary>
    static async Task<JsonNode?> Receive(ClientWebSocket ws, CancellationToken ct)
    {
        var buf = new byte[16 * 1024];
        using var ms = new MemoryStream();
        while (true)
        {
            var r = await ws.ReceiveAsync(buf, ct);
            if (r.MessageType == WebSocketMessageType.Close)
            {
                if (ws.CloseStatus is { } st && st != WebSocketCloseStatus.NormalClosure) throw new WebSocketCloseException((int)st, ws.CloseStatusDescription);
                return null;
            }
            ms.Write(buf, 0, r.Count);
            if (ms.Length > 1024 * 1024) throw new InvalidDataException("Nachricht von OBS zu groß.");
            if (r.EndOfMessage) break;
        }
        return JsonNode.Parse(ms.ToArray());
    }

    void Close()
    {
        var ws = _ws;
        _ws = null;
        _readCts?.Cancel();
        _readCts = null;
        if (ws != null)
        {
            foreach (var p in _pending.Values) p.TrySetException(new RpcException("obs", "Verbindung zu OBS wurde neu aufgebaut."));
            try { ws.Abort(); } catch { }
            ws.Dispose();
        }
    }

    public ValueTask DisposeAsync() { Close(); return ValueTask.CompletedTask; }

    sealed class WebSocketCloseException(int status, string? description) : Exception(description)
    {
        public int Status { get; } = status;
        public string? Description { get; } = description;
    }
}
