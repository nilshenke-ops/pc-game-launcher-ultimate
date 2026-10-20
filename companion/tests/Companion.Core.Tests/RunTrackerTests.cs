using System.Text.Json;
using Xunit;

namespace Pgl.Core.Tests;

public class RunTrackerTests
{
    static async Task<JsonElement> Run(TestClient c, string id)
    {
        var runs = (await c.Ok("runs.list")).GetProperty("runs").EnumerateArray().ToList();
        return runs.First(r => r.GetProperty("id").GetString() == id);
    }

    [Fact]
    public async Task A_scene_shows_each_step_and_a_cancel_stops_it_during_a_wait()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var qa = await admin.Ok("quick.save", new { name = "Raid-Abend", steps = new object[] {
            new { type = "notify", @ref = "Los geht's" }, new { type = "wait", @ref = "60" }, new { type = "notify", @ref = "zu spät" } } });
        var r = await admin.Ok("quick.run", new { id = qa.GetProperty("id").GetString() });
        Assert.True(r.GetProperty("background").GetBoolean());
        var runId = r.GetProperty("runId").GetString()!;

        JsonElement run = default;
        for (var i = 0; i < 50; i++) { run = await Run(viewer, runId); if (run.GetProperty("steps")[0].GetProperty("status").GetString() == "done") break; await Task.Delay(50); }
        var steps = run.GetProperty("steps");
        Assert.Equal("Hinweis: Los geht's", steps[0].GetProperty("label").GetString());
        Assert.Equal("done", steps[0].GetProperty("status").GetString());
        Assert.Equal("running", steps[1].GetProperty("status").GetString());   // the wait
        Assert.Equal("60 s warten", steps[1].GetProperty("label").GetString());
        Assert.Equal("busy", await admin.Error("quick.run", new { id = qa.GetProperty("id").GetString() })); // not twice at once

        Assert.Equal("forbidden", await viewer.Error("runs.cancel", new { id = runId }));
        var t0 = DateTime.UtcNow;
        await admin.Ok("runs.cancel", new { id = runId });
        for (var i = 0; i < 50 && (await Run(admin, runId)).GetProperty("state").GetString() == "running"; i++) await Task.Delay(50);
        run = await Run(admin, runId);
        Assert.True(DateTime.UtcNow - t0 < TimeSpan.FromSeconds(5));     // the 60 s wait was interrupted
        Assert.Equal("cancelled", run.GetProperty("state").GetString());
        Assert.Equal("skipped", run.GetProperty("steps")[2].GetProperty("status").GetString()); // "zu spät" never ran
        for (var i = 0; i < 50 && !s.Notifications.List().Any(n => n.Title.Contains("abgebrochen")); i++) await Task.Delay(50);
        Assert.Contains(s.Notifications.List(), n => n.Title == "„Raid-Abend“ abgebrochen");
        Assert.DoesNotContain(s.Notifications.List(), n => n.Title == "zu spät");
    }

    [Fact]
    public async Task A_short_scene_answers_directly_and_marks_failed_steps()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var qa = await admin.Ok("quick.save", new { name = "Kurz", steps = new object[] { new { type = "notify", @ref = "Hallo" }, new { type = "mediaKey", @ref = "playpause" } } });
        var r = await admin.Ok("quick.run", new { id = qa.GetProperty("id").GetString() });
        Assert.Equal(2, r.GetProperty("results").GetArrayLength());
        var run = await Run(admin, r.GetProperty("runId").GetString()!);
        Assert.Equal("failed", run.GetProperty("state").GetString()); // media keys need Windows – reported, not hidden
        Assert.Equal("done", run.GetProperty("steps")[0].GetProperty("status").GetString());
        Assert.Equal("failed", run.GetProperty("steps")[1].GetProperty("status").GetString());
        Assert.Equal("invalid-params", await admin.Error("runs.cancel", new { id = r.GetProperty("runId").GetString() }));
    }
}
