using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class UpdateGuardTests
{
    static UpdateGuard G(TempDir dir) => new(new AppPaths(dir.Path));

    [Fact]
    public void Crashing_new_version_goes_back_to_the_last_stable_one()
    {
        using var dir = new TempDir();
        var g = G(dir);
        Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.4.0", canRollBack: false));
        g.MarkStable("2.4.0");
        g.CleanExit();

        // Update to 2.5.0: first start crashes (no clean exit), second start crashes too → third start rolls back.
        Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", canRollBack: true));
        Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", canRollBack: true)); // 1 failure
        Assert.Equal(UpdateGuard.Decision.RollBack, G(dir).OnStart("2.5.0", canRollBack: true)); // 2 failures

        // The old version starts and tells once what happened.
        var g2 = G(dir);
        Assert.Equal(UpdateGuard.Decision.Continue, g2.OnStart("2.4.0", canRollBack: true));
        Assert.Equal("2.5.0", g2.TakeRollbackNote("2.4.0")!.Value.from);
        Assert.Null(g2.TakeRollbackNote("2.4.0"));
    }

    [Fact]
    public void Clean_exits_and_stable_runs_never_count_as_failures()
    {
        using var dir = new TempDir();
        var g = G(dir);
        g.OnStart("2.4.0", false); g.MarkStable("2.4.0"); g.CleanExit();
        // New version closed quickly three times (e.g. Windows shut down) – no rollback.
        for (var i = 0; i < 3; i++) { Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", true)); g.CleanExit(); }
        Assert.Equal(0, g.Snapshot().Failures);
        // Once stable, later crashes are ordinary crashes, not a bad update.
        g.OnStart("2.5.0", true); g.MarkStable("2.5.0");
        for (var i = 0; i < 3; i++) Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", true));
        Assert.Equal("2.5.0", g.Snapshot().LastStableVersion);
    }

    [Fact]
    public void Without_a_stable_previous_version_or_installer_nothing_is_rolled_back()
    {
        using var dir = new TempDir();
        var g = G(dir);
        for (var i = 0; i < 4; i++) Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", true)); // very first install
        g = G(dir);
        g.OnStart("2.4.0", false); g.MarkStable("2.4.0");
        for (var i = 0; i < 4; i++) Assert.Equal(UpdateGuard.Decision.Continue, g.OnStart("2.5.0", canRollBack: false)); // no .old file
    }

    [Fact]
    public async Task Rollback_note_becomes_a_notification()
    {
        using var dir = new TempDir();
        var g = G(dir);
        g.OnStart("1.0.0", false); g.MarkStable("1.0.0");
        g.OnStart("9.9.9", true); g.OnStart("9.9.9", true);
        Assert.Equal(UpdateGuard.Decision.RollBack, g.OnStart("9.9.9", true));
        await using var s = Fixtures.Services(dir);
        Assert.Contains(s.Notifications.List(), n => n.Key == "update-rolled-back" && n.Title.Contains("9.9.9"));
    }
}
