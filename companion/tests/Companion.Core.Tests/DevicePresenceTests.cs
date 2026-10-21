using System.Text.Json;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>The PC's device list says who is connected right now – and updates without a reload.</summary>
public class DevicePresenceTests
{
    static int DeviceChanges(TestClient c) => c.Channel.Events("changed").Count(e => e.GetProperty("d").GetProperty("topic").GetString() == "devices");

    [Fact]
    public async Task Connecting_and_closing_a_paired_device_is_announced_and_listed_correctly()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, id, token) = await Fixtures.PairedDevice(s, admin);
        bool Online(JsonElement list) => list.GetProperty("devices").EnumerateArray().Single(d => d.GetProperty("id").GetString() == id).GetProperty("online").GetBoolean();
        Assert.True(Online(await admin.Ok("devices.list")));

        var before = DeviceChanges(admin);
        s.Rpc.OnClosed(phone.Channel);
        Assert.Equal(before + 1, DeviceChanges(admin));
        Assert.False(Online(await admin.Ok("devices.list")));

        // Signing in again (e.g. the app reconnects) is announced too.
        await Fixtures.Login(s, id, token);
        Assert.Equal(before + 2, DeviceChanges(admin));
        Assert.True(Online(await admin.Ok("devices.list")));

        // A second connection of the same device closing while the first stays: still online, no "gone" event.
        var second = await Fixtures.Login(s, id, token);
        var mid = DeviceChanges(admin);
        s.Rpc.OnClosed(second.Channel);
        Assert.Equal(mid, DeviceChanges(admin));
        Assert.True(Online(await admin.Ok("devices.list")));
    }
}
