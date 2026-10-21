using System.Net;
using System.Net.Sockets;
using System.Text;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Server status only over the documented protocols, against local stand-in servers; unknown stays unknown.</summary>
public class ServerQueryTests
{
    static byte[] VarInt(int v) { var l = new List<byte>(); var u = (uint)v; do { var b = (byte)(u & 0x7F); u >>= 7; if (u != 0) b |= 0x80; l.Add(b); } while (u != 0); return l.ToArray(); }

    [Fact]
    public async Task Minecraft_server_list_ping_reads_players_version_and_motd()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        var server = Task.Run(async () =>
        {
            using var c = await listener.AcceptTcpClientAsync();
            var s = c.GetStream();
            var buf = new byte[512];
            await s.ReadAsync(buf); // handshake + status request (not checked byte by byte here)
            var json = Encoding.UTF8.GetBytes("{\"version\":{\"name\":\"1.21.4\",\"protocol\":769},\"players\":{\"max\":20,\"online\":3},\"description\":{\"text\":\"§aHallo \",\"extra\":[{\"text\":\"Welt\"}]}}");
            var body = new List<byte> { 0x00 }; body.AddRange(VarInt(json.Length)); body.AddRange(json);
            await s.WriteAsync(VarInt(body.Count).Concat(body).ToArray());
        });
        var st = await new ServerQueryService().QueryAsync("minecraft", "127.0.0.1", port, "t");
        await server;
        listener.Stop();
        Assert.Equal("online", st.Status);
        Assert.Equal((3, 20), (st.Players, st.MaxPlayers));
        Assert.Equal("1.21.4", st.Version);
        Assert.Equal("Hallo Welt", st.Motd);
    }

    [Fact]
    public async Task Source_a2s_info_handles_the_challenge_and_reads_name_map_players()
    {
        using var udp = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        var port = ((IPEndPoint)udp.Client.LocalEndPoint!).Port;
        var server = Task.Run(async () =>
        {
            var first = await udp.ReceiveAsync();
            await udp.SendAsync(new byte[] { 0xFF, 0xFF, 0xFF, 0xFF, 0x41, 1, 2, 3, 4 }, first.RemoteEndPoint);
            var second = await udp.ReceiveAsync();
            Assert.Equal(new byte[] { 1, 2, 3, 4 }, second.Buffer[^4..]); // challenge sent back
            var r = new List<byte> { 0xFF, 0xFF, 0xFF, 0xFF, 0x49, 17 };
            foreach (var s in new[] { "Mein Server", "de_dust2", "csgo", "Counter-Strike" }) { r.AddRange(Encoding.UTF8.GetBytes(s)); r.Add(0); }
            r.AddRange(new byte[] { 0xDA, 0x02, 7, 16, 0 });
            await udp.SendAsync(r.ToArray(), second.RemoteEndPoint);
        });
        var st = await new ServerQueryService().QueryAsync("source", "127.0.0.1", port, "t");
        await server;
        Assert.Equal("online", st.Status);
        Assert.Equal(("Mein Server", "de_dust2", 7, 16), (st.Name, st.Map, st.Players, st.MaxPlayers));
    }

    [Fact]
    public async Task Unknown_offline_and_bad_input_are_reported_never_guessed()
    {
        var q = new ServerQueryService { Timeout = TimeSpan.FromMilliseconds(500) };
        Assert.Equal("unknown", (await q.QueryAsync("valorant", "example.com", null, "t")).Status);
        var closed = new TcpListener(IPAddress.Loopback, 0); closed.Start(); var port = ((IPEndPoint)closed.LocalEndpoint).Port; closed.Stop();
        var off = await q.QueryAsync("minecraft", "127.0.0.1", port, "t");
        Assert.Equal("offline", off.Status);
        Assert.Null(off.Players);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => q.QueryAsync("minecraft", "http://evil/x", null, "t"))).Code);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => q.QueryAsync("minecraft", "a b", null, "t"))).Code);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => q.QueryAsync("minecraft", "host", 70000, "t"))).Code);
        // Garbage instead of a status answer: "unknown", not online.
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var p2 = ((IPEndPoint)listener.LocalEndpoint).Port;
        var srv = Task.Run(async () => { using var c = await listener.AcceptTcpClientAsync(); await c.GetStream().WriteAsync(new byte[] { 0x05, 0x01, 0x02, 0x03, 0x04, 0x05 }); await Task.Delay(100); });
        var junk = await q.QueryAsync("minecraft", "127.0.0.1", p2, "t");
        await srv; listener.Stop();
        Assert.NotEqual("online", junk.Status);
        for (var i = 0; i < 20; i++) { try { await q.QueryAsync("valorant", "x", null, "flood"); } catch (RpcException) { } }
        Assert.Equal("rate-limited", (await Assert.ThrowsAsync<RpcException>(() => q.QueryAsync("valorant", "x", null, "flood"))).Code);
    }
}
