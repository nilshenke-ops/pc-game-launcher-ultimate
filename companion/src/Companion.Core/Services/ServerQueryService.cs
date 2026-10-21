using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed record ServerStatus(string Status, int? Players, int? MaxPlayers, string? Name, string? Version, string? Motd, string? Map, long? LatencyMs, string? Error, DateTime CheckedAt);

/// <summary>
/// Status of a game server, asked only when the user taps "aktualisieren" and only over the games' own documented
/// protocols: Minecraft Java "Server List Ping" (TCP) and Valve "A2S_INFO" (UDP, Source/Steam servers). Everything
/// else is "unknown" – nothing is guessed. Short timeouts, a rate limit, and only a host name or IP + port are accepted.
/// </summary>
public sealed class ServerQueryService
{
    public static readonly string[] Protocols = { "minecraft", "source" };
    static readonly Regex HostRx = new(@"^(?=.{1,253}$)([A-Za-z0-9-]{1,63}\.)*[A-Za-z0-9-]{1,63}$|^\[?[0-9A-Fa-f:.]{2,45}\]?$");
    readonly RateLimiter _limiter = new(20, TimeSpan.FromMinutes(1));
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(3);

    public async Task<ServerStatus> QueryAsync(string protocol, string host, int? port, string who)
    {
        host = host.Trim().Trim('[', ']');
        if (!HostRx.IsMatch(host)) throw new RpcException("invalid-params", "Ungültige Serveradresse (nur Name oder IP, ohne http://).");
        if (port is < 1 or > 65535) throw new RpcException("invalid-params", "Port muss zwischen 1 und 65535 liegen.");
        if (!_limiter.TryHit(who)) throw new RpcException("rate-limited", "Zu viele Abfragen – bitte kurz warten.");
        var now = DateTime.UtcNow;
        if (!Protocols.Contains(protocol))
            return new ServerStatus("unknown", null, null, null, null, null, null, null, "Für dieses Spiel gibt es keine unterstützte Statusabfrage.", now);
        try
        {
            using var cts = new CancellationTokenSource(Timeout);
            return protocol == "minecraft"
                ? await MinecraftAsync(host, port ?? 25565, cts.Token)
                : await SourceAsync(host, port ?? 27015, cts.Token);
        }
        catch (OperationCanceledException) { return new ServerStatus("offline", null, null, null, null, null, null, null, "Keine Antwort (Zeitüberschreitung).", now); }
        catch (SocketException ex) { return new ServerStatus("offline", null, null, null, null, null, null, null, ex.SocketErrorCode == SocketError.HostNotFound ? "Adresse nicht gefunden." : "Nicht erreichbar.", now); }
        catch (Exception ex) when (ex is InvalidDataException or JsonException or EndOfStreamException or IOException)
        { return new ServerStatus("unknown", null, null, null, null, null, null, null, "Antwort nicht lesbar: " + ex.Message, now); }
    }

    // ----------------------------------------------------------------------------------------- Minecraft Java

    static void VarInt(Stream s, int v) { var u = (uint)v; do { var b = (byte)(u & 0x7F); u >>= 7; if (u != 0) b |= 0x80; s.WriteByte(b); } while (u != 0); }
    static async Task<int> ReadVarIntAsync(Stream s, CancellationToken ct)
    {
        int value = 0, shift = 0;
        var buf = new byte[1];
        while (true)
        {
            if (await s.ReadAsync(buf, ct) == 0) throw new EndOfStreamException("Verbindung beendet.");
            value |= (buf[0] & 0x7F) << shift;
            if ((buf[0] & 0x80) == 0) return value;
            shift += 7;
            if (shift > 28) throw new InvalidDataException("Ungültige Länge.");
        }
    }

    static async Task<ServerStatus> MinecraftAsync(string host, int port, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(host, port, ct);
        var latency = sw.ElapsedMilliseconds;
        await using var net = tcp.GetStream();
        var hs = new MemoryStream();
        VarInt(hs, 0x00); VarInt(hs, -1); // handshake, protocol "unknown" (allowed for status)
        var hostBytes = Encoding.UTF8.GetBytes(host);
        VarInt(hs, hostBytes.Length); hs.Write(hostBytes);
        hs.WriteByte((byte)(port >> 8)); hs.WriteByte((byte)port);
        VarInt(hs, 1); // next state: status
        var pkt = new MemoryStream();
        VarInt(pkt, (int)hs.Length); hs.Position = 0; hs.CopyTo(pkt);
        VarInt(pkt, 1); VarInt(pkt, 0x00); // status request
        await net.WriteAsync(pkt.ToArray(), ct);
        var len = await ReadVarIntAsync(net, ct);
        if (len <= 0 || len > 256 * 1024) throw new InvalidDataException("Ungültige Paketlänge.");
        var body = new byte[len];
        await net.ReadExactlyAsync(body, ct);
        var ms = new MemoryStream(body);
        if (await ReadVarIntAsync(ms, ct) != 0x00) throw new InvalidDataException("Unerwartetes Paket.");
        var strLen = await ReadVarIntAsync(ms, ct);
        if (strLen < 0 || strLen > body.Length) throw new InvalidDataException("Ungültige Textlänge.");
        var json = Encoding.UTF8.GetString(body, (int)ms.Position, strLen);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        int? online = null, max = null;
        if (root.TryGetProperty("players", out var pl))
        {
            if (pl.TryGetProperty("online", out var o) && o.TryGetInt32(out var oi)) online = oi;
            if (pl.TryGetProperty("max", out var m) && m.TryGetInt32(out var mi)) max = mi;
        }
        var version = root.TryGetProperty("version", out var v) && v.TryGetProperty("name", out var vn) ? vn.GetString() : null;
        var motd = root.TryGetProperty("description", out var d) ? Clip(Motd(d), 200) : null;
        return new ServerStatus("online", online, max, null, Clip(version, 60), motd, null, latency, null, DateTime.UtcNow);
    }

    /// <summary>Minecraft text components: plain text of "text" and "extra" (formatting codes removed).</summary>
    static string Motd(JsonElement d)
    {
        if (d.ValueKind == JsonValueKind.String) return Regex.Replace(d.GetString() ?? "", "§.", "");
        var sb = new StringBuilder();
        if (d.ValueKind == JsonValueKind.Object)
        {
            if (d.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String) sb.Append(t.GetString());
            if (d.TryGetProperty("extra", out var ex) && ex.ValueKind == JsonValueKind.Array) foreach (var e in ex.EnumerateArray()) sb.Append(Motd(e));
        }
        return Regex.Replace(sb.ToString(), "§.", "");
    }

    static string? Clip(string? s, int n) => s == null ? null : s.Length > n ? s[..n] : s;

    // ----------------------------------------------------------------------------------------- Source A2S_INFO

    static readonly byte[] A2SInfo = [0xFF, 0xFF, 0xFF, 0xFF, 0x54, .. Encoding.ASCII.GetBytes("Source Engine Query"), 0x00];

    static async Task<ServerStatus> SourceAsync(string host, int port, CancellationToken ct)
    {
        var addrs = await Dns.GetHostAddressesAsync(host, ct);
        var ip = addrs.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork) ?? addrs.First();
        using var udp = new UdpClient(ip.AddressFamily);
        var ep = new IPEndPoint(ip, port);
        var sw = Stopwatch.StartNew();
        await udp.SendAsync(new ReadOnlyMemory<byte>(A2SInfo), ep, ct);
        var r = await udp.ReceiveAsync(ct);
        var data = r.Buffer;
        if (data.Length >= 9 && data[4] == 0x41)
        {
            // Challenge (since 2020): send the request again with the 4 challenge bytes.
            await udp.SendAsync(new ReadOnlyMemory<byte>([.. A2SInfo, .. data[5..9]]), ep, ct);
            data = (await udp.ReceiveAsync(ct)).Buffer;
        }
        var latency = sw.ElapsedMilliseconds;
        if (data.Length < 6 || data[0] != 0xFF || data[1] != 0xFF || data[2] != 0xFF || data[3] != 0xFF || data[4] != 0x49) throw new InvalidDataException("Keine A2S_INFO-Antwort.");
        var pos = 6; // after header and protocol byte
        string Str() { var end = Array.IndexOf(data, (byte)0, pos); if (end < 0) throw new InvalidDataException("Text ohne Ende."); var s = Encoding.UTF8.GetString(data, pos, end - pos); pos = end + 1; return s; }
        var name = Str(); var map = Str(); Str(); var game = Str();
        if (pos + 4 > data.Length) throw new InvalidDataException("Antwort zu kurz.");
        pos += 2; // app id
        int players = data[pos], max = data[pos + 1];
        return new ServerStatus("online", players, max, Clip(name, 120), Clip(game, 60), null, Clip(map, 80), latency, null, DateTime.UtcNow);
    }
}
