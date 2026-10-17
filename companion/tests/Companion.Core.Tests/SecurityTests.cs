using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Security;

namespace Pgl.Core.Tests;

public class PairingTests
{
    sealed class Clock { public DateTime Now = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc); }

    static (PairingService pairing, DeviceStore devices, Clock clock, TempDir dir) Make()
    {
        var dir = new TempDir();
        var clock = new Clock();
        var devices = new DeviceStore(new AppPaths(dir.Path), new PlainSecretProtector());
        return (new PairingService(devices, () => clock.Now), devices, clock, dir);
    }

    [Fact]
    public void Code_has_format_and_40_bits()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        Assert.Matches("^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$", code);
    }

    [Fact]
    public void Code_is_single_use()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        Assert.Equal(PairingError.None, p.Request(code, "A", "x", "1.1.1.1", "ch1").error);
        Assert.Equal(PairingError.NoActiveCode, p.Request(code, "B", "x", "1.1.1.2", "ch2").error);
    }

    [Fact]
    public void Code_accepts_lowercase_and_missing_dash()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        Assert.Equal(PairingError.None, p.Request(code.Replace("-", "").ToLowerInvariant(), "A", "x", "1.1.1.1", "ch").error);
    }

    [Fact]
    public void Code_expires_after_five_minutes()
    {
        var (p, _, clock, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        clock.Now += TimeSpan.FromMinutes(5) + TimeSpan.FromSeconds(1);
        Assert.Equal(PairingError.Expired, p.Request(code, "A", "x", "1.1.1.1", "ch").error);
    }

    [Fact]
    public void Code_is_locked_after_five_wrong_guesses()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        for (int i = 0; i < PairingService.MaxFailuresPerCode; i++)
            Assert.Equal(PairingError.Invalid, p.Request("ZZZZ-ZZZ" + i, "A", "x", $"10.0.0.{i}", "ch").error);
        Assert.NotEqual(PairingError.None, p.Request(code, "A", "x", "10.0.0.99", "ch").error);
        Assert.Null(p.ActiveCode());
    }

    [Fact]
    public void Requests_are_rate_limited_per_ip()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        PairingError last = PairingError.None;
        for (int i = 0; i < 20; i++) { p.CreateCode(); last = p.Request("AAAA-AAAA", "A", "x", "6.6.6.6", "ch").error; }
        Assert.Equal(PairingError.RateLimited, last);
    }

    [Fact]
    public void Approval_creates_device_and_token_is_handed_out_once()
    {
        var (p, devices, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        var (_, pending, claim, _) = p.Request(code, "Handy", "iOS", "1.1.1.1", "ch");
        Assert.Equal("pending", p.Claim(pending!.RequestId, claim!, "ch").state);
        p.Decide(pending.RequestId, true, new[] { "view", "launch", "local" /* not grantable */ });
        var (state, token, deviceId) = p.Claim(pending.RequestId, claim!, "ch2");
        Assert.Equal("approved", state);
        Assert.NotNull(token);
        Assert.Equal(new[] { "view", "launch" }, devices.Get(deviceId!)!.Permissions);
        Assert.Equal("unknown", p.Claim(pending.RequestId, claim!, "ch3").state); // second claim gets nothing
    }

    [Fact]
    public void Claim_requires_the_secret()
    {
        var (p, _, _, dir) = Make();
        using var _d = dir;
        var (code, _) = p.CreateCode();
        var (_, pending, _, _) = p.Request(code, "Handy", "iOS", "1.1.1.1", "ch");
        p.Decide(pending!.RequestId, true, null);
        Assert.Equal("unknown", p.Claim(pending.RequestId, "wrong-secret", "ch2").state);
    }

    [Fact]
    public void Login_proof_is_bound_to_nonce_and_token_is_not_stored()
    {
        using var dir = new TempDir();
        var devices = new DeviceStore(new AppPaths(dir.Path), new PlainSecretProtector());
        var (device, token) = devices.Create("Handy", "iOS", Permissions.Default, null);
        var nonce1 = new byte[32]; nonce1[0] = 1;
        var nonce2 = new byte[32]; nonce2[0] = 2;
        var proof = Fixtures.Proof(token, Convert.ToHexString(nonce1));
        Assert.NotNull(devices.VerifyLogin(device.Id, proof, nonce1));
        Assert.Null(devices.VerifyLogin(device.Id, proof, nonce2)); // replay with another nonce fails
        Assert.Null(devices.VerifyLogin(device.Id, "zz", nonce1));
        Assert.DoesNotContain(token, File.ReadAllText(Path.Combine(dir.Path, "devices.json")));
    }

    [Fact]
    public void Revoked_device_cannot_log_in()
    {
        using var dir = new TempDir();
        var devices = new DeviceStore(new AppPaths(dir.Path), new PlainSecretProtector());
        var (device, token) = devices.Create("Handy", "iOS", Permissions.Default, null);
        var nonce = new byte[32];
        Assert.True(devices.Revoke(device.Id));
        Assert.Null(devices.VerifyLogin(device.Id, Fixtures.Proof(token, Convert.ToHexString(nonce)), nonce));
    }

    [Fact]
    public void Device_names_are_sanitized()
    {
        Assert.Equal("ab", DeviceStore.Sanitize("a\u0000b\n", 40, "x"));
        Assert.Equal("x", DeviceStore.Sanitize("   ", 40, "x"));
        Assert.Equal(40, DeviceStore.Sanitize(new string('a', 100), 40, "x").Length);
    }
}

public class RateLimiterTests
{
    [Fact]
    public void Sliding_window()
    {
        var now = DateTime.UtcNow;
        var r = new RateLimiter(2, TimeSpan.FromSeconds(10), () => now);
        Assert.True(r.TryHit("a"));
        Assert.True(r.TryHit("a"));
        Assert.False(r.TryHit("a"));
        Assert.True(r.TryHit("b"));
        now = now.AddSeconds(11);
        Assert.True(r.TryHit("a"));
    }
}
