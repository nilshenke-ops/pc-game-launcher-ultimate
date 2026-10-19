using System.Net;
using Microsoft.AspNetCore.Http;
using Pgl.Core.Hosting;
using Xunit;

namespace Pgl.Core.Tests;

public class HardeningTests
{
    static HeaderDictionary H(params (string k, string v)[] h) { var d = new HeaderDictionary(); foreach (var (k, v) in h) d[k] = v; return d; }

    [Fact]
    public void Proxy_headers_are_only_believed_from_this_pc()
    {
        // A device in the Wi-Fi cannot pretend to be someone else (and so slip past per-address limits).
        Assert.Equal(("192.168.1.50", false), RequestOrigin.Client(IPAddress.Parse("192.168.1.50"), H(("X-Forwarded-For", "1.2.3.4"))));
        Assert.Equal(("192.168.1.50", false), RequestOrigin.Client(IPAddress.Parse("::ffff:192.168.1.50"), H(("CF-Connecting-IP", "9.9.9.9"))));
        // A tunnel/proxy on this PC forwards the real address – and such a request is never "this PC".
        Assert.Equal(("1.2.3.4", false), RequestOrigin.Client(IPAddress.Loopback, H(("X-Forwarded-For", "1.2.3.4, 10.0.0.1"))));
        Assert.Equal(("proxy", false), RequestOrigin.Client(IPAddress.Loopback, H(("X-Forwarded-For", "not-an-ip"))));
        Assert.Equal(("127.0.0.1", true), RequestOrigin.Client(IPAddress.Loopback, H()));
    }

    [Fact]
    public void Only_addresses_of_this_pc_count_as_its_own_page()
    {
        Assert.True(RequestOrigin.HostAllowed("192.168.1.20", null));
        Assert.True(RequestOrigin.HostAllowed("[::1]", null));
        Assert.True(RequestOrigin.HostAllowed("localhost", null));
        Assert.True(RequestOrigin.HostAllowed(Environment.MachineName.ToLowerInvariant() + ".local", null));
        Assert.True(RequestOrigin.HostAllowed("games.example.com", "https://games.example.com"));
        // DNS rebinding: a foreign domain that points to this PC is not its page.
        Assert.False(RequestOrigin.HostAllowed("evil.example", null));
        Assert.False(RequestOrigin.HostAllowed("evil.example", "https://games.example.com"));
    }

    [Fact]
    public async Task Obs_password_does_not_follow_a_new_address()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("obs.configure", new { url = "ws://127.0.0.1:4455", password = "geheim" });
        Assert.NotNull(s.Settings.Get().ObsPasswordProtected);
        await admin.Ok("obs.configure", new { replayWhilePlaying = true }); // other options keep it
        Assert.NotNull(s.Settings.Get().ObsPasswordProtected);
        await admin.Ok("obs.configure", new { url = "ws://127.0.0.1:4455" }); // same address keeps it
        Assert.NotNull(s.Settings.Get().ObsPasswordProtected);
        await admin.Ok("obs.configure", new { url = "ws://192.168.1.99:4455" }); // a new address drops it
        Assert.Null(s.Settings.Get().ObsPasswordProtected);
    }
}
