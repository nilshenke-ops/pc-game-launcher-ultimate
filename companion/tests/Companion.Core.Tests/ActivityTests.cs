using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class ActivityTests
{
    [Fact]
    public async Task Status_is_hidden_from_view_only_devices_until_sharing_is_switched_on()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });

        Assert.False((await viewer.Ok("activity.get")).GetProperty("shared").GetBoolean()); // default: not shared
        Assert.Equal("forbidden", await viewer.Error("activity.set", new { status = "busy" }));

        var set = await admin.Ok("activity.set", new { status = "dnd", text = "  Raid  ", share = true });
        Assert.Equal("dnd", set.GetProperty("status").GetString());
        Assert.Equal("Raid", set.GetProperty("text").GetString());
        var seen = await viewer.Ok("activity.get");
        Assert.Equal("dnd", seen.GetProperty("status").GetString());
        Assert.False(seen.TryGetProperty("share", out _)); // the switch itself stays with the owner

        Assert.Equal("invalid-params", await admin.Error("activity.set", new { status = "online-for-everyone" }));
    }

    [Fact]
    public void Running_game_is_shown_unless_invisible_and_a_timed_status_runs_out()
    {
        using var dir = new TempDir();
        var running = new List<(string, string, DateTime)> { ("item_rl", "Rocket League", new DateTime(2026, 10, 20, 18, 0, 0, DateTimeKind.Utc)) };
        var a = new ActivityService(new AppPaths(dir.Path), new NullHub(), () => running);
        var now = new DateTime(2026, 10, 20, 19, 0, 0, DateTimeKind.Utc);
        a.Set(new ActivityFile { Status = "busy", Until = now.AddMinutes(30), Share = true });

        var v = JsonSerializer.SerializeToElement(a.View(false, now), Json.Options);
        Assert.Equal("busy", v.GetProperty("status").GetString());
        Assert.Equal("Rocket League", v.GetProperty("playing").GetProperty("name").GetString());

        v = JsonSerializer.SerializeToElement(a.View(false, now.AddMinutes(31)), Json.Options);
        Assert.Equal("available", v.GetProperty("status").GetString()); // ran out

        a.Set(new ActivityFile { Status = "invisible", Share = true });
        v = JsonSerializer.SerializeToElement(a.View(false, now), Json.Options);
        Assert.False(v.TryGetProperty("playing", out _)); // invisible hides the game from others
        v = JsonSerializer.SerializeToElement(a.View(true, now), Json.Options);
        Assert.Equal("item_rl", v.GetProperty("playing").GetProperty("itemId").GetString()); // but not from yourself

        a.Set(new ActivityFile { Status = "available", ShowGame = false, Share = true });
        v = JsonSerializer.SerializeToElement(a.View(true, now), Json.Options);
        Assert.False(v.TryGetProperty("playing", out _));
    }
}
