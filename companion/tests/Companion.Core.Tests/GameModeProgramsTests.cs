using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class GameModeProgramsTests
{
    sealed class FakeProcesses : IProcessSource
    {
        public List<ProcessInfo> List = new();
        public IReadOnlyList<ProcessInfo> Snapshot() => List.ToList();
    }

    /// <summary>Behaves like Windows: a process with a window closes, helper processes have no window and end with it.</summary>
    sealed class FakeControl(FakeProcesses procs) : IProcessControl
    {
        public HashSet<int> WithWindow = new();
        public HashSet<int> Refuses = new();
        public List<int> Closed = new();
        public List<string> Started = new();
        public bool Supported => true;
        public string? CloseGracefully(int pid, TimeSpan wait)
        {
            var p = procs.List.FirstOrDefault(x => x.Pid == pid);
            if (p == null) return null;
            if (Refuses.Contains(pid)) return "hat sich nicht beendet";
            if (!WithWindow.Contains(pid)) return "hat kein offenes Fenster";
            Closed.Add(pid);
            procs.List.RemoveAll(x => x.Name == p.Name); // helpers end with the main window
            return null;
        }
        public string? Start(string exePath) { Started.Add(exePath); return null; }
    }

    static (GameModePrograms g, FakeProcesses procs, FakeControl ctl, List<string> reports) Make(TempDir dir, params string[] games)
    {
        var procs = new FakeProcesses();
        var ctl = new FakeControl(procs);
        var g = new GameModePrograms(new AppPaths(dir.Path), procs, ctl, new NullHub(), () => games);
        var reports = new List<string>();
        g.Report = (key, title, _) => reports.Add(key + "|" + title);
        return (g, procs, ctl, reports);
    }

    static List<GameModeProgram> P(params string[] names) => names.Select(n => new GameModeProgram { Name = n }).ToList();

    [Theory]
    [InlineData("explorer")]
    [InlineData("steam.exe")]
    [InlineData("EasyAntiCheat")]
    [InlineData("PCGameLauncherCompanion")]
    [InlineData("..\\evil")]
    public void System_launcher_anticheat_and_companion_cannot_be_listed(string name)
    {
        using var dir = new TempDir();
        var (g, _, _, _) = Make(dir);
        Assert.Throws<RpcException>(() => g.Save(true, null, P(name)));
    }

    [Fact]
    public void Closes_listed_programs_gently_and_reopens_them_after_the_last_game()
    {
        using var dir = new TempDir();
        var (g, procs, ctl, reports) = Make(dir, "Cyberpunk2077");
        g.Save(true, true, P("chrome.exe", "Discord", "Cyberpunk2077"));
        procs.List.AddRange(new[]
        {
            new ProcessInfo(10, "chrome", @"C:\Chrome\chrome.exe"), new ProcessInfo(11, "chrome", @"C:\Chrome\chrome.exe"),
            new ProcessInfo(20, "Discord", @"C:\Discord\Discord.exe"),
            new ProcessInfo(30, "Cyberpunk2077", @"C:\Games\Cyberpunk2077.exe"),
        });
        ctl.WithWindow.UnionWith(new[] { 11, 20, 30 });

        var problems = g.GameStartedAsync().GetAwaiter().GetResult();
        Assert.Empty(problems); // chrome helper 10 without a window is no problem: 11 closed the program
        Assert.Equal(new[] { 11, 20 }, ctl.Closed.Order()); // the game is never closed, even when listed
        Assert.Contains(procs.List, p => p.Name == "Cyberpunk2077");
        Assert.Equal("closed|Spielmodus: 2 Programme geschlossen", Assert.Single(reports));

        // Companion restart in between: the list of closed programs is kept.
        var (g2, procs2, ctl2, _) = Make(dir, "Cyberpunk2077");
        Assert.Equal(0, g2.AllGamesStoppedAsync().GetAwaiter().GetResult() - 2);
        Assert.Equal(new[] { @"C:\Chrome\chrome.exe", @"C:\Discord\Discord.exe" }, ctl2.Started.Order());
        Assert.Equal(0, g2.AllGamesStoppedAsync().GetAwaiter().GetResult()); // only once
    }

    [Fact]
    public void Reports_programs_that_did_not_close_and_does_not_reopen_them()
    {
        using var dir = new TempDir();
        var (g, procs, ctl, reports) = Make(dir);
        g.Save(true, true, P("notepad", "Spotify"));
        procs.List.AddRange(new[] { new ProcessInfo(1, "notepad", @"C:\n.exe"), new ProcessInfo(2, "Spotify", @"C:\s.exe") });
        ctl.WithWindow.UnionWith(new[] { 1 });
        ctl.Refuses.Add(1); // e.g. "save changes?"
        var problems = g.GameStartedAsync().GetAwaiter().GetResult();
        Assert.Equal(2, problems.Count);
        Assert.Contains(problems, p => p.StartsWith("notepad: hat sich nicht beendet"));
        Assert.Contains(problems, p => p.StartsWith("Spotify: hat kein offenes Fenster"));
        Assert.Equal("closed|Spielmodus: Programme nicht geschlossen", Assert.Single(reports));
        Assert.Equal(0, g.AllGamesStoppedAsync().GetAwaiter().GetResult());
        Assert.Empty(ctl.Started);
    }

    [Fact]
    public void Does_nothing_when_off_and_restore_off_only_forgets()
    {
        using var dir = new TempDir();
        var (g, procs, ctl, _) = Make(dir);
        g.Save(false, false, P("chrome"));
        procs.List.Add(new ProcessInfo(1, "chrome", @"C:\c.exe"));
        ctl.WithWindow.Add(1);
        g.GameStartedAsync().GetAwaiter().GetResult();
        Assert.Empty(ctl.Closed);

        g.Save(true, null, null);
        g.GameStartedAsync().GetAwaiter().GetResult();
        Assert.Equal(new[] { 1 }, ctl.Closed);
        Assert.Equal(0, g.AllGamesStoppedAsync().GetAwaiter().GetResult());
        Assert.Empty(ctl.Started);
    }

    [Fact]
    public void Preview_and_candidates_leave_out_blocked_processes()
    {
        using var dir = new TempDir();
        var (g, procs, _, _) = Make(dir, "Hades");
        g.Save(true, null, P("chrome", "Hades"));
        procs.List.AddRange(new[] { new ProcessInfo(1, "chrome", null), new ProcessInfo(2, "chrome", null), new ProcessInfo(3, "svchost", null), new ProcessInfo(4, "Hades", null) });
        var cands = g.RunningCandidates();
        Assert.Equal(new[] { "chrome", "Hades" }, cands);
        var json = System.Text.Json.JsonSerializer.Serialize(g.Preview());
        Assert.Contains("\"running\":2", json);
        Assert.Contains("\"protectedAsGame\":true", json);
    }

    [Fact]
    public async Task Rpc_needs_admin_to_change_and_the_list_survives_a_backup()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch", "manage" });
        await viewer.Ok("gamemode.get");
        Assert.Equal("forbidden", await viewer.Error("gamemode.save", new { enabled = true }));
        Assert.Equal("forbidden", await viewer.Error("gamemode.candidates"));
        Assert.Equal("invalid-params", await admin.Error("gamemode.save", new { programs = new[] { new { name = "steam" } } }));

        var r = await admin.Ok("gamemode.save", new { enabled = true, programs = new[] { new { name = "chrome.exe", label = "Browser" } } });
        Assert.True(r.GetProperty("enabled").GetBoolean());
        Assert.Equal("chrome", r.GetProperty("programs")[0].GetProperty("name").GetString());
        r = await admin.Ok("gamemode.save", new { restore = false }); // only the switch – the list stays
        Assert.Single(r.GetProperty("programs").EnumerateArray().ToList());

        var zip = s.Backup.CreateZip(includeSounds: false);
        Assert.Contains("gamemode", BackupService.ValidateFile(zip).Parts.Keys);
        await admin.Ok("gamemode.save", new { enabled = false, programs = Array.Empty<object>() });
        s.Backup.Restore(StorageAndBackupTests.UploadFile(s, zip), new[] { "gamemode" });
        r = await admin.Ok("gamemode.get");
        Assert.True(r.GetProperty("enabled").GetBoolean());
        Assert.False(r.GetProperty("restore").GetBoolean());
        Assert.Equal("Browser", r.GetProperty("programs")[0].GetProperty("label").GetString());
    }
}
