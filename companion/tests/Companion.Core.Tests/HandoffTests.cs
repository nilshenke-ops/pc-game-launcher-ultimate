using System.Net;
using System.Text.Json;
using Pgl.Core.Hosting;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>"Zugang übertragen" and the fixed address – the pairing survives home-screen apps and new Wi-Fi IPs.</summary>
public class HandoffTests
{
    [Fact]
    public async Task A_paired_device_hands_its_access_to_a_new_one_once_with_the_same_rights()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (ipad, ipadId, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });

        var h = await ipad.Ok("devices.handoff");
        var code = h.GetProperty("code").GetString()!;
        Assert.True(code.Length >= 30);

        // The home-screen app (own storage) redeems it without a confirmation at the PC.
        var app = new TestClient(s.Rpc, new TestChannel("192.168.1.51"));
        await app.Ok("hello");
        var r = await app.Ok("pairing.handoff", new { code, deviceName = "iPad (App)", platform = "iPad" });
        var newId = r.GetProperty("deviceId").GetString()!;
        Assert.NotEqual(ipadId, newId);
        var device = await Fixtures.Login(s, newId, r.GetProperty("token").GetString()!);
        var me = await device.Ok("devices.me");
        Assert.Equal(new[] { "view", "launch" }, me.GetProperty("permissions").EnumerateArray().Select(p => p.GetString()).Where(p => p is "view" or "launch" or "admin" or "manage").ToArray());
        Assert.Contains(s.Notifications.List(), n => n.Title == "Neuer Zugang: iPad (App)");

        // Single use.
        var again = new TestClient(s.Rpc, new TestChannel("192.168.1.52"));
        await again.Ok("hello");
        Assert.Equal("handoff-invalid", await again.Error("pairing.handoff", new { code, deviceName = "x" }));
        // Both accesses are separate entries and can be revoked on their own.
        Assert.Equal(2, (await admin.Ok("devices.list")).GetProperty("devices").GetArrayLength());
    }

    [Fact]
    public async Task Handoff_codes_expire_die_with_their_device_and_are_not_for_the_PC_itself()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("not-device", await admin.Error("devices.handoff"));

        var (phone, phoneId, _) = await Fixtures.PairedDevice(s, admin);
        var code = (await phone.Ok("devices.handoff")).GetProperty("code").GetString()!;
        await admin.Ok("devices.revoke", new { id = phoneId });
        var other = new TestClient(s.Rpc, new TestChannel("192.168.1.60"));
        await other.Ok("hello");
        Assert.Equal("handoff-invalid", await other.Error("pairing.handoff", new { code }));
        Assert.Equal("handoff-invalid", await other.Error("pairing.handoff", new { code = "erfunden-erfunden-erfunden-1234" }));
    }

    [Fact]
    public void Codes_expire_after_ten_minutes_and_at_most_three_stay_open()
    {
        using var dir = new TempDir();
        var devices = new Security.DeviceStore(new Infrastructure.AppPaths(dir.Path), new Platform.PlainSecretProtector());
        var now = DateTime.UtcNow;
        var pairing = new Security.PairingService(devices, () => now);
        var (dev, _) = devices.Create("iPad", "iPad", Security.Permissions.Default, "192.168.1.5");
        var codes = Enumerable.Range(0, 4).Select(_ => pairing.CreateHandoff(dev.Id).code).ToList();
        Assert.Equal(Security.PairingError.Invalid, pairing.RedeemHandoff(codes[0], "", "", "192.168.1.6").error); // oldest dropped
        Assert.Equal(Security.PairingError.None, pairing.RedeemHandoff(codes[1], "", "", "192.168.1.6").error);
        now += TimeSpan.FromMinutes(11);
        Assert.Equal(Security.PairingError.Invalid, pairing.RedeemHandoff(codes[2], "", "", "192.168.1.6").error);
        // A name is made up from the creating device when none is given.
        Assert.Contains(devices.List(), d => d.Name == "iPad (2)");
    }

    [Fact]
    public async Task Router_name_counts_only_when_it_points_to_this_PC()
    {
        var lan = new[] { "192.168.178.116" };
        Task<IPAddress[]> Dns(string host) => Task.FromResult(host == "gaming-pc.fritz.box" ? new[] { IPAddress.Parse("192.168.178.116") } : host == "gaming-pc.lan" ? new[] { IPAddress.Parse("192.168.178.20") } : throw new System.Net.Sockets.SocketException());
        var st = new StableAddress(() => lan, "Gaming-PC", Dns, () => Task.FromResult<string?>(null));
        await st.RefreshAsync();
        Assert.Equal("gaming-pc.fritz.box", st.RouterName);
        Assert.True(st.IsOwnHost("GAMING-PC.fritz.box"));
        Assert.False(st.IsOwnHost("gaming-pc.lan"));

        // Name resolves elsewhere (another device): not used.
        var other = new StableAddress(() => new[] { "192.168.178.20" }, "Gaming-PC", h => Task.FromResult(new[] { IPAddress.Parse("192.168.178.116") }), () => Task.FromResult<string?>(null), reverse: _ => Task.FromResult<string?>(null));
        await other.RefreshAsync();
        Assert.Null(other.RouterName);
        // No Wi-Fi address at all: nothing.
        var none = new StableAddress(Array.Empty<string>, "Gaming-PC", Dns, () => Task.FromResult<string?>(null));
        await none.RefreshAsync();
        Assert.Null(none.RouterName);
    }

    [Fact]
    public async Task Router_name_is_also_asked_from_the_router_when_the_PC_name_differs()
    {
        // Windows calls the PC "DESKTOP-7Q2", the FRITZ!Box knows it as "laptop-nils".
        var lan = new[] { "192.168.178.116" };
        Task<IPAddress[]> Dns(string host) => host == "laptop-nils.fritz.box" ? Task.FromResult(new[] { IPAddress.Parse("192.168.178.116") }) : throw new System.Net.Sockets.SocketException();
        var st = new StableAddress(() => lan, "DESKTOP-7Q2", Dns, () => Task.FromResult<string?>(null), reverse: ip => Task.FromResult<string?>(ip == "192.168.178.116" ? "laptop-nils.fritz.box." : null));
        await st.RefreshAsync();
        Assert.Equal("laptop-nils.fritz.box", st.RouterName);
        // A reverse name outside the home network's router names, or one that points elsewhere, is not taken.
        var foreign = new StableAddress(() => lan, "DESKTOP-7Q2", h => Task.FromResult(new[] { IPAddress.Parse("10.0.0.9") }), () => Task.FromResult<string?>(null), reverse: _ => Task.FromResult<string?>("laptop-nils.fritz.box"));
        await foreign.RefreshAsync();
        Assert.Null(foreign.RouterName);
        var isp = new StableAddress(() => lan, "DESKTOP-7Q2", Dns, () => Task.FromResult<string?>(null), reverse: _ => Task.FromResult<string?>("p5dd1234.dip0.t-ipconnect.de"));
        await isp.RefreshAsync();
        Assert.Null(isp.RouterName);
    }

    [Fact]
    public async Task Tailscale_name_is_read_from_the_status_and_https_only_when_this_companion_answers()
    {
        const string running = """{"BackendState":"Running","Self":{"DNSName":"gaming-pc.tail1234.ts.net.","TailscaleIPs":["100.101.102.103"]}}""";
        Assert.Equal("gaming-pc.tail1234.ts.net", StableAddress.ParseTailscaleName(running));
        Assert.Null(StableAddress.ParseTailscaleName("""{"BackendState":"Stopped","Self":{"DNSName":"gaming-pc.tail1234.ts.net."}}"""));
        Assert.Null(StableAddress.ParseTailscaleName("""{"BackendState":"Running","Self":{"DNSName":"bad name/../x"}}"""));
        Assert.Null(StableAddress.ParseTailscaleName("kein json"));

        string? probed = null;
        var st = new StableAddress(() => new[] { "192.168.1.5" }, "pc", _ => Task.FromException<IPAddress[]>(new Exception()), () => Task.FromResult<string?>(running), u => { probed = u; return Task.FromResult(true); });
        var changes = 0;
        st.Changed += () => changes++;
        await st.RefreshAsync();
        Assert.Equal("gaming-pc.tail1234.ts.net", st.TailscaleName);
        Assert.True(st.TailscaleHttps);
        Assert.Equal("https://gaming-pc.tail1234.ts.net", probed);
        await st.RefreshAsync();
        Assert.Equal(1, changes); // only real changes are announced
        // Probe failing (Serve not set up) → name only, no https.
        var plain = new StableAddress(() => new[] { "192.168.1.5" }, "pc", _ => Task.FromException<IPAddress[]>(new Exception()), () => Task.FromResult<string?>(running), _ => throw new HttpRequestException());
        await plain.RefreshAsync();
        Assert.False(plain.TailscaleHttps);
    }

    [Fact]
    public async Task The_QR_code_opens_on_every_phone_first_and_offers_the_fixed_name_and_the_website_only_with_https()
    {
        using var dir = new TempDir();
        Environment.SetEnvironmentVariable("PGL_TEST_LAN_HOST", "192.168.178.116");
        try
        {
            await using var s = Fixtures.Services(dir);
            var admin = await Fixtures.Admin(s);
            var before = await admin.Ok("pairing.create");
            Assert.StartsWith("http://192.168.178.116:", before.GetProperty("urls")[0].GetString());

            // Simulate what RefreshAsync finds in a FRITZ!Box network: router name pointing to this PC.
            var stable = new StableAddress(() => new[] { "192.168.178.116" }, "gaming-pc", h => Task.FromResult(new[] { IPAddress.Parse("192.168.178.116") }), () => Task.FromResult<string?>(null));
            await stable.RefreshAsync();
            typeof(Pgl.Core.Services.CompanionServices).GetProperty(nameof(Pgl.Core.Services.CompanionServices.Stable))!.GetBackingField().SetValue(s, stable);
            var urls = (await admin.Ok("pairing.create")).GetProperty("urls").EnumerateArray().Select(u => u.GetString()!).ToList();
            // The IP first (every phone opens it, also Android without local names), the fixed name right after;
            // the website (https) not first: the PC has no https address.
            Assert.StartsWith("http://192.168.178.116:", urls[0]);
            Assert.StartsWith("http://gaming-pc.fritz.box:", urls[1]);
            // The phone may check the fixed name from the IP page: it is in the page's connect-src (see WebHost).
            Assert.Contains(Pgl.Core.Api.RpcApi.Addresses(s), a => a.kind == "router" && a.url.StartsWith("http://gaming-pc.fritz.box:"));
            // Checked with this companion's own names – the process-wide hook is shared by tests running in parallel.
            Assert.True(RequestOrigin.HostAllowed("gaming-pc.fritz.box", null, stable.IsOwnHost));
            Assert.False(RequestOrigin.HostAllowed("evil.example", null, stable.IsOwnHost));
        }
        finally { Environment.SetEnvironmentVariable("PGL_TEST_LAN_HOST", null); }
    }
}

static class ReflectionExtensions
{
    public static System.Reflection.FieldInfo GetBackingField(this System.Reflection.PropertyInfo p) =>
        p.DeclaringType!.GetField($"<{p.Name}>k__BackingField", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
}

public class HomeNetworkTests
{
    [Fact]
    public void Phone_addresses_come_from_the_adapter_with_the_router_never_from_VPN_or_link_local()
    {
        var found = new List<(string, string, bool, bool)>
        {
            ("Tailscale Tailscale Tunnel", "100.101.102.103", false, false),
            ("Ethernet 2 TAP-Windows Adapter V9", "10.8.0.6", false, true),
            ("WLAN Intel Wi-Fi 6", "192.168.178.40", false, false),          // Wi-Fi on as well, but no router there
            ("Ethernet Realtek PCIe GbE", "192.168.178.116", true, true),     // the cable to the router
            ("Ethernet 3", "169.254.12.7", false, true),                      // no DHCP: link-local
            ("vEthernet (WSL)", "172.28.0.1", false, true),
        };
        var r = Pgl.Core.Services.NetworkDiagnostics.RankLan(found);
        Assert.Equal(new[] { "192.168.178.116", "192.168.178.40" }, r);
    }

    [Fact]
    public void Firewall_rules_for_this_program_and_port_decide_block_wins()
    {
        const string exe = @"C:\Users\x\AppData\Local\NexusGamingHub\PCGameLauncherCompanion.exe";
        var other = new FirewallRule("Andere App", true, true, true, 7, 6, "*", @"C:\Other\app.exe");
        var allow = new FirewallRule("Nexus Gaming Hub – Handy im Heimnetz", true, true, true, FirewallVerdict.Private | FirewallVerdict.Domain, 6, "8787", exe);
        var autoBlock = new FirewallRule("pcgamelaunchercompanion.exe", true, true, false, FirewallVerdict.Public, 6, "*", exe.ToLowerInvariant());
        Assert.Equal("no-rule", FirewallVerdict.Evaluate(new[] { other }, FirewallVerdict.Private, true, exe, 8787).state);
        Assert.Equal("allowed", FirewallVerdict.Evaluate(new[] { other, allow }, FirewallVerdict.Private, true, exe, 8787).state);
        Assert.Equal("blocked", FirewallVerdict.Evaluate(new[] { allow, autoBlock }, FirewallVerdict.Public | FirewallVerdict.Private, true, exe, 8787).state);
        Assert.Equal("allowed", FirewallVerdict.Evaluate(new[] { allow, autoBlock }, FirewallVerdict.Private, true, exe, 8787).state); // block only for public
        Assert.Equal("no-rule", FirewallVerdict.Evaluate(new[] { allow with { LocalPorts = "9000-9100" } }, FirewallVerdict.Private, true, exe, 8787).state);
        Assert.Equal("firewall-off", FirewallVerdict.Evaluate(Array.Empty<FirewallRule>(), FirewallVerdict.Private, false, exe, 8787).state);
        // PC on cable in a network Windows calls "public": the rule for home networks does not help there.
        var nets = new[] { new NetworkProfile("1", "Netzwerk 2", 0) };
        var st = FirewallVerdict.Combine(FirewallVerdict.Evaluate(new[] { allow }, FirewallVerdict.Public | FirewallVerdict.Private, true, exe, 8787), nets, new[] { allow }, exe, 8787);
        Assert.Equal("public-network", st.State);
        Assert.True(st.CanFix);
        Assert.Contains("Netzwerk 2", st.Detail);
    }

    [Fact]
    public async Task Tailscale_connected_after_the_companion_started_is_found_on_the_next_look_and_reported_once()
    {
        // Windows started the companion first: Tailscale still "Starting", a moment later "Running".
        var state = "Starting";
        var calls = 0;
        var gate = new TaskCompletionSource();
        var st = new StableAddress(() => new[] { "192.168.178.116" }, "gaming", _ => Task.FromResult(Array.Empty<IPAddress>()),
            async () => { calls++; await gate.Task; return "{\"BackendState\":\"" + state + "\",\"Self\":{\"DNSName\":\"gaming.tail72a60b.ts.net.\"}}"; },
            url => Task.FromResult(url == "https://gaming.tail72a60b.ts.net"), reverse: _ => Task.FromResult<string?>(null));
        var changed = 0;
        st.Changed += () => changed++;
        var a = st.RefreshAsync(); var b = st.RefreshAsync(); // page + timer at the same moment: one run
        gate.SetResult();
        await Task.WhenAll(a, b);
        Assert.Equal(1, calls);
        Assert.Null(st.TailscaleName);
        state = "Running";
        await st.RefreshAsync();
        Assert.Equal("gaming.tail72a60b.ts.net", st.TailscaleName);
        Assert.True(st.TailscaleHttps);
        Assert.Equal(1, changed);
    }
}
