using System.Text.Json;
using Xunit;

namespace Pgl.Core.Tests;

public class LauncherAchievementTests
{
    static JsonElement Ach(JsonElement q, string id) => q.GetProperty("achievements").EnumerateArray().First(a => a.GetProperty("id").GetString() == id);

    [Fact]
    public async Task Launcher_achievements_count_existing_data_and_can_be_switched_off()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);

        // Fresh install: the default profiles and the default automation do not count.
        var q = await admin.Ok("quests.get");
        Assert.False(Ach(q, "profile1").GetProperty("unlocked").GetBoolean());
        Assert.False(Ach(q, "auto3").GetProperty("unlocked").GetBoolean());
        Assert.False(Ach(q, "pair1").GetProperty("unlocked").GetBoolean());
        Assert.Equal("launcher", Ach(q, "pair1").GetProperty("source").GetString());

        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var g = s.Library.AddSteam("620", "Portal 2");
        await admin.Ok("library.update", new { id = g.Id, backlog = "completed" });
        Assert.Equal("forbidden", await viewer.Error("quests.configure", new { launcherAchievements = false }));

        q = await admin.Ok("quests.get");
        Assert.True(Ach(q, "pair1").GetProperty("unlocked").GetBoolean());
        Assert.True(Ach(q, "backlog1").GetProperty("unlocked").GetBoolean());
        Assert.Equal(1, Ach(q, "backlog5").GetProperty("value").GetDouble());
        var xp = q.GetProperty("xp").GetInt32();
        Assert.True(xp >= 75);

        // Switched off: no longer shown or counted; XP already earned stays.
        q = await admin.Ok("quests.configure", new { launcherAchievements = false });
        Assert.False(q.GetProperty("launcherAchievements").GetBoolean());
        Assert.DoesNotContain(q.GetProperty("achievements").EnumerateArray(), a => a.GetProperty("source").GetString() == "launcher");
        Assert.Equal(xp, q.GetProperty("xp").GetInt32());
    }
}
