using System.Text.Json;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

/// <summary>Addresses that other devices or the relay client use must never point back to the wrong machine.</summary>
public class ConnectionTests
{
    [Theory]
    [InlineData("ws://127.0.0.1:8787/ws")]
    [InlineData("ws://localhost:8787/ws")]
    [InlineData("ws://[::1]:8787")]
    public void Relay_address_of_the_companion_itself_is_rejected(string url)
    {
        var problem = AddressRules.RelayProblem(url, 8787);
        Assert.NotNull(problem);
        Assert.Contains("kein Relay", problem);
    }

    [Theory]
    [InlineData("wss://relay.example.com")]
    [InlineData("ws://127.0.0.1:8788")] // relay running on the same PC (development) is a different service
    public void Real_relay_addresses_are_accepted(string url) => Assert.Null(AddressRules.RelayProblem(url, 8787));

    [Theory]
    [InlineData("http://127.0.0.1:8787")]
    [InlineData("https://localhost")]
    public void Loopback_is_never_a_public_address(string url) => Assert.NotNull(AddressRules.PublicUrlProblem(url));

    [Fact]
    public void Public_tunnel_address_is_accepted() => Assert.Null(AddressRules.PublicUrlProblem("https://gaming-pc.tail1234.ts.net"));

    [Fact]
    public async Task Settings_refuse_the_companion_itself_as_relay()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("invalid-params", await admin.Error("settings.saveSecurity", new { relayUrl = "ws://127.0.0.1:" + s.Settings.Get().Port + "/ws" }));
        Assert.Equal("invalid-params", await admin.Error("settings.saveSecurity", new { publicUrl = "http://127.0.0.1:8787" }));
    }

    [Fact]
    public async Task Pairing_never_offers_loopback_to_other_devices()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var r = await admin.Ok("pairing.create");
        foreach (var u in r.GetProperty("urls").EnumerateArray())
            Assert.DoesNotContain("127.0.0.1", u.GetString());
        if (r.TryGetProperty("pcAddress", out var pc) && pc.ValueKind == JsonValueKind.String)
            Assert.DoesNotContain("127.0.0.1", pc.GetString());
    }

    [Fact]
    public async Task Diagnosis_explains_a_relay_that_points_to_the_companion()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        // Settings written by an older version (no validation then): relay = own /ws endpoint.
        var file = Path.Combine(dir.Path, "settings.json");
        var settings = s.Settings.Get();
        settings.RelayEnabled = true;
        settings.RelayUrl = $"ws://127.0.0.1:{settings.Port}/ws";
        File.WriteAllText(file, Infrastructure.Json.Serialize(settings));
        var s2 = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s2);
        var d = await admin.Ok("diagnostics.run");
        var relay = d.GetProperty("checks").EnumerateArray().First(c => c.GetProperty("area").GetString() == "relay");
        Assert.Equal("error", relay.GetProperty("status").GetString());
        Assert.Contains("kein Relay", relay.GetProperty("detail").GetString());
        Assert.False(string.IsNullOrEmpty(relay.GetProperty("fix").GetString()));
    }
}
