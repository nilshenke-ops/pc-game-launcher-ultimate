using System.Net;
using System.Net.Sockets;
using Pgl.Core.Hosting;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Fixed name in the Wi-Fi (mDNS) and the one-click Tailscale switch – no router or command-line steps.</summary>
public class FixedNameTests
{
    [Theory]
    [InlineData("GAMING-PC", "nexus-gaming-pc.local")]
    [InlineData("Gaming PC_1", "nexus-gaming-pc-1.local")]
    [InlineData("  ", "nexus-pc.local")]
    [InlineData("Größter--Rechner", "nexus-gr-ter-rechner.local")]
    public void The_name_is_a_valid_local_host_name(string machine, string expected) => Assert.Equal(expected, MdnsResponder.NameFor(machine));

    [Fact]
    public void Query_and_answer_follow_the_dns_wire_format()
    {
        var q = Query(0x1234, "nexus-gaming-pc.local", 1, unicast: true);
        var parsed = MdnsResponder.ParseQuery(q)!.Value;
        Assert.Equal(0x1234, parsed.id);
        Assert.Equal(("nexus-gaming-pc.local", (ushort)1, true), parsed.questions.Single());
        var answer = MdnsResponder.BuildResponse(0x1234, "nexus-gaming-pc.local", new[] { IPAddress.Parse("192.168.178.116") }, "nexus-gaming-pc.local");
        Assert.Equal(new byte[] { 192, 168, 178, 116 }, answer[^4..]);
        Assert.Equal(0x84, answer[2]); // response, authoritative
        Assert.Null(MdnsResponder.ParseQuery(answer)); // answers are never treated as questions
        Assert.Null(MdnsResponder.ParseQuery(new byte[] { 1, 2, 3 }));
    }

    [Fact]
    public async Task The_PC_answers_a_real_query_with_its_Wi_Fi_address_and_ignores_other_names()
    {
        var port = FreeUdpPort();
        using var r = new MdnsResponder(() => new[] { "192.168.178.116", "100.101.102.103" }, "Gaming-PC", port);
        r.Start();
        Assert.True(r.Running, r.Error);
        using var client = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0));
        await client.SendAsync(Query(7, "nexus-gaming-pc.local", 1, false), new IPEndPoint(IPAddress.Loopback, port));
        var rx = await client.ReceiveAsync().WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(7, rx.Buffer[0] << 8 | rx.Buffer[1]);
        Assert.Equal(1, rx.Buffer[7]); // exactly one address: the Tailscale one is not announced in the Wi-Fi
        Assert.Equal(new byte[] { 192, 168, 178, 116 }, rx.Buffer[^4..]);
        // Someone else's name: no answer.
        await client.SendAsync(Query(8, "anderer-pc.local", 1, false), new IPEndPoint(IPAddress.Loopback, port));
        await Assert.ThrowsAnyAsync<TimeoutException>(() => client.ReceiveAsync().WaitAsync(TimeSpan.FromMilliseconds(800)));
    }

    [Fact]
    public async Task Tailscale_https_is_switched_on_with_a_fixed_command_only_at_the_PC()
    {
        Assert.Equal(new[] { "serve", "--bg", "8787" }, TailscaleCli.Args(TailscaleCli.Command.ServeOn, 8787));
        Assert.Equal(new[] { "serve", "--https=443", "off" }, TailscaleCli.Args(TailscaleCli.Command.ServeOff, 8787));
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var calls = new List<string>();
        TailscaleCli.Runner = args => { calls.Add(string.Join(' ', args)); return Task.FromResult<(int, string)?>(args[0] == "status" ? (0, """{"BackendState":"Running","Self":{"DNSName":"gaming-pc.tail1234.ts.net."}}""") : (1, "HTTPS ist im Tailnet nicht eingeschaltet")); };
        try
        {
            var admin = await Fixtures.Admin(s);
            var info = await admin.Ok("tailscale.get");
            Assert.True(info.GetProperty("running").GetBoolean());
            Assert.Equal("gaming-pc.tail1234.ts.net", info.GetProperty("name").GetString());
            var r = await admin.Ok("tailscale.serve", new { on = true });
            Assert.False(r.GetProperty("ok").GetBoolean()); // honest: the command failed, the reason is shown
            Assert.Contains("HTTPS", r.GetProperty("output").GetString());
            Assert.Contains("serve --bg", string.Join("|", calls));
            var (phone, _, _) = await Fixtures.PairedDevice(s, admin);
            Assert.Equal("forbidden", await phone.Error("tailscale.serve", new { on = true })); // never from a phone
        }
        finally { TailscaleCli.Runner = null; }
    }

    static byte[] Query(ushort id, string name, ushort type, bool unicast)
    {
        var o = new List<byte> { (byte)(id >> 8), (byte)id, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0 };
        foreach (var l in name.Split('.')) { o.Add((byte)l.Length); o.AddRange(System.Text.Encoding.ASCII.GetBytes(l)); }
        o.Add(0);
        o.AddRange(new byte[] { (byte)(type >> 8), (byte)type, (byte)(unicast ? 0x80 : 0), 1 });
        return o.ToArray();
    }

    static int FreeUdpPort() { using var u = new UdpClient(new IPEndPoint(IPAddress.Loopback, 0)); return ((IPEndPoint)u.Client.LocalEndPoint!).Port; }
}
