using Pgl.Core.Services;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class PowerTests
{
    static (CompanionServices s, DryRunPower power) Setup(TempDir dir)
    {
        var power = new DryRunPower();
        return (new CompanionServices(new GenericPlatform { Power = power }, new AppPaths(dir.Path), new Pgl.Core.Hosting.WebAssets(dir.Path)), power);
    }

    [Fact]
    public async Task Lock_needs_launch_and_switching_off_needs_the_power_right()
    {
        using var dir = new TempDir();
        var (s, power) = Setup(dir);
        await using var _ = s;
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var (phone, phoneId, _) = await Fixtures.PairedDevice(s, admin); // default rights of a new phone
        Assert.DoesNotContain("power", Security.Permissions.Default);

        Assert.Equal("forbidden", await viewer.Error("power.lock"));
        Assert.True((await phone.Ok("power.lock")).GetBoolean());
        Assert.Equal(("lock", 0), power.Calls.Single());
        Assert.Equal("forbidden", await phone.Error("power.run", new { action = "shutdown", delay = 0 }));
        var st = await phone.Ok("power.status");
        Assert.True(st.GetProperty("canLock").GetBoolean());
        Assert.False(st.GetProperty("canPower").GetBoolean());

        // The PC grants the right to this phone once – then restart/shutdown work from the phone.
        await admin.Ok("devices.setPermissions", new { id = phoneId, permissions = new[] { "view", "launch", "soundboard", "manage", "power" } });
        var (phone2, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch", "power" });
        var r = await phone2.Ok("power.run", new { action = "shutdown", delay = 60 });
        Assert.Equal("shutdown", r.GetProperty("planned").GetProperty("action").GetString());
        Assert.Equal(("shutdown", 60), power.Calls.Last());
        // Every device sees the planned shutdown and can cancel it.
        Assert.Equal("Test-iPhone", (await viewer.Ok("power.status")).GetProperty("planned").GetProperty("by").GetString());
        Assert.Contains(s.Notifications.List(), n => n.Title.Contains("Herunterfahren in 60 s"));
        var c = await phone2.Ok("power.run", new { action = "cancel" });
        Assert.False(c.TryGetProperty("planned", out var pl) && pl.ValueKind != System.Text.Json.JsonValueKind.Null);
        Assert.Equal("not-found", await phone2.Error("power.run", new { action = "cancel" }));
        Assert.Equal("invalid-params", await phone2.Error("power.run", new { action = "format-c" }));
        Assert.Equal(("restart", 600), await phone2.Ok("power.run", new { action = "restart", delay = 99999 }).ContinueWith(_ => power.Calls.Last()));
    }

    [Fact]
    public async Task Admin_devices_may_switch_off_and_without_windows_the_answer_is_honest()
    {
        using var dir = new TempDir();
        var (s, power) = Setup(dir);
        await using (s)
        {
            var admin = await Fixtures.Admin(s);
            var (adminPhone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch", "admin" });
            Assert.True((await adminPhone.Ok("power.status")).GetProperty("canPower").GetBoolean());
            await adminPhone.Ok("power.run", new { action = "sleep" });
            Assert.Equal("sleep", power.Calls.Last().action);
        }
        using var dir2 = new TempDir();
        await using var plain = Fixtures.Services(dir2); // no power control (Linux without Windows)
        var pc = await Fixtures.Admin(plain);
        Assert.False((await pc.Ok("power.status")).GetProperty("supported").GetBoolean());
        Assert.Equal("power", await pc.Error("power.run", new { action = "shutdown", delay = 0 }));
    }
}
