using System.Security.Cryptography;
using System.Text;
using Pgl.Core.Security;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>An API key typed on a phone in the home network (plain http): it only arrives sealed with the device key, for this session and this provider.</summary>
public class SealedKeyRpcTests
{
    const string Key = "sk-or-v1-0123456789abcdef0123456789";

    static async Task<(TestClient phone, byte[] nonce, byte[] deviceKey)> AdminPhone(Pgl.Core.Services.CompanionServices s)
    {
        var admin = await Fixtures.Admin(s);
        var (_, id, token) = await Fixtures.PairedDevice(s, admin, new[] { "view", "admin" });
        var phone = new TestClient(s.Rpc, new TestChannel("192.168.1.50"));          // another device in the home network, plain http
        var hello = await phone.Ok("hello");
        var nonceHex = hello.GetProperty("nonce").GetString()!;
        await phone.Ok("auth.login", new { deviceId = id, proof = Fixtures.Proof(token, nonceHex) });
        return (phone, Convert.FromHexString(nonceHex), SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    }

    [Fact]
    public async Task Ein_versiegelter_Schluessel_vom_Handy_im_WLAN_wird_angenommen_ein_Klartext_Schluessel_nicht()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var (phone, nonce, dk) = await AdminPhone(s);
        Assert.Equal("forbidden", await phone.Error("ai.set", new { provider = "openrouter", key = Key }));             // plain over plain http: refused
        var (iv, ct, tag) = SecretSeal.Seal(dk, nonce, "ai.key:openrouter", Key);
        var r = await phone.Ok("ai.set", new { provider = "openrouter", @sealed = new { iv, ct, tag } });
        Assert.DoesNotContain(Key, r.GetRawText());
        Assert.True(s.Assistant.FreeAi.Configured("openrouter"));                                                          // stored (protected) and switched on
        Assert.Equal("smart", System.Text.Json.JsonSerializer.SerializeToElement(s.Assistant.Status(), Pgl.Core.Infrastructure.Json.Options).GetProperty("mode").GetString());
    }

    [Fact]
    public async Task Fremde_oder_veraenderte_versiegelte_Schluessel_werden_abgelehnt_und_nichts_wird_gespeichert()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var (phone, nonce, dk) = await AdminPhone(s);
        var good = SecretSeal.Seal(dk, nonce, "ai.key:openrouter", Key);
        // another session (replay of a message captured on an earlier connection)
        var other = SecretSeal.Seal(dk, RandomNumberGenerator.GetBytes(32), "ai.key:openrouter", Key);
        Assert.Equal("invalid-params", await phone.Error("ai.set", new { provider = "openrouter", @sealed = new { iv = other.iv, ct = other.ct, tag = other.tag } }));
        // the OpenRouter key in the Groq slot
        Assert.Equal("invalid-params", await phone.Error("ai.set", new { provider = "groq", @sealed = new { iv = good.iv, ct = good.ct, tag = good.tag } }));
        // a byte changed on the way
        var flipped = good.ct[..^2] + (good.ct.EndsWith("00") ? "01" : "00");
        Assert.Equal("invalid-params", await phone.Error("ai.set", new { provider = "openrouter", @sealed = new { good.iv, ct = flipped, good.tag } }));
        // sealed with another device's key
        var foreign = SecretSeal.Seal(SHA256.HashData(Encoding.UTF8.GetBytes("anderes Gerät")), nonce, "ai.key:openrouter", Key);
        Assert.Equal("invalid-params", await phone.Error("ai.set", new { provider = "openrouter", @sealed = new { foreign.iv, foreign.ct, foreign.tag } }));
        Assert.False(s.Assistant.FreeAi.Configured("openrouter"));
        // a wrong KEY SHAPE inside a valid seal is still refused (a Google key)
        var google = SecretSeal.Seal(dk, nonce, "ai.key:openrouter", "AIzaSyA0123456789abcdefghijklmnopqrstuv");
        Assert.Equal("invalid-params", await phone.Error("ai.set", new { provider = "openrouter", @sealed = new { google.iv, google.ct, google.tag } }));
        Assert.False(s.Assistant.FreeAi.Configured("openrouter"));
        // removing a key needs no secret channel
        await phone.Ok("ai.set", new { provider = "openrouter", @sealed = new { good.iv, good.ct, good.tag } });
        Assert.True(s.Assistant.FreeAi.Configured("openrouter"));
        await phone.Ok("ai.set", new { provider = "openrouter", key = "" });
        Assert.False(s.Assistant.FreeAi.Configured("openrouter"));
    }

    [Fact]
    public async Task Ein_Geraet_ohne_Verwalten_Recht_kann_gar_nichts_einrichten()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await viewer.Error("ai.set", new { provider = "openrouter", key = "" }));
        Assert.Equal("forbidden", await viewer.Error("ai.strategy", new { strategy = "race" }));
        var st = await viewer.Ok("ai.status");                                                                            // but may look
        Assert.DoesNotContain("sk-or-", st.GetRawText());
    }
}
