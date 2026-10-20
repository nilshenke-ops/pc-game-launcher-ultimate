using Xunit;

namespace Pgl.Core.Tests;

public class BacklogTests
{
    [Fact]
    public async Task Status_priority_and_goal_are_checked_and_only_changed_by_the_user()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });
        var g = s.Library.AddSteam("1145360", "Hades");
        Assert.Null(g.Backlog);

        Assert.Equal("forbidden", await viewer.Error("library.update", new { id = g.Id, backlog = "next" }));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = g.Id, backlog = "won" }));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = g.Id, goalHours = -1 }));

        var r = await admin.Ok("library.update", new { id = g.Id, backlog = "next", priority = 9, goalHours = 22.46 });
        Assert.Equal("next", r.GetProperty("backlog").GetString());
        Assert.Equal(3, r.GetProperty("priority").GetInt32()); // clamped
        Assert.Equal(22.5, r.GetProperty("goalHours").GetDouble());
        var changed = r.GetProperty("backlogChangedAt").GetDateTime();

        // Other edits leave the backlog alone; the same status again does not count as a change.
        r = await admin.Ok("library.update", new { id = g.Id, favorite = true, backlog = "next" });
        Assert.Equal(changed, r.GetProperty("backlogChangedAt").GetDateTime());
        Assert.Equal("next", r.GetProperty("backlog").GetString());

        // Removing: "" and goal 0.
        r = await admin.Ok("library.update", new { id = g.Id, backlog = "", goalHours = 0 });
        Assert.False(r.TryGetProperty("backlog", out _)); // null values are left out of the answer
        Assert.False(r.TryGetProperty("goalHours", out _));

        // Part of the backup (library export).
        await admin.Ok("library.update", new { id = g.Id, backlog = "completed" });
        Assert.Equal("completed", s.Library.Export().Items.Single().Backlog);
    }

    [Fact]
    public async Task Own_icon_is_marked_as_chosen_by_the_user_and_cleared_again()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var g = s.Library.AddSteam("1145360", "Hades");
        Assert.False(g.IconCustom);
        await admin.Ok("library.update", new { id = g.Id, iconData = "data:image/png;base64,AAAA" });
        Assert.True(s.Library.Get(g.Id)!.IconCustom);
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = g.Id, iconData = "javascript:alert(1)" }));
        await admin.Ok("library.update", new { id = g.Id, iconData = "" });
        Assert.False(s.Library.Get(g.Id)!.IconCustom);
        Assert.Null(s.Library.Get(g.Id)!.IconData);
    }
}
