using System.Text.Json;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class StartTimeTests
{
    static JsonElement Json(object o) => JsonSerializer.SerializeToElement(o, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    [Fact]
    public void Start_time_is_measured_from_the_start_command_and_only_for_games_started_from_the_app()
    {
        var t0 = new DateTime(2026, 10, 1, 18, 0, 0, DateTimeKind.Utc);
        var f = new HistoryFile();
        // Six starts of "Elden Ring": 20 s each, the last three 40 s (slower); one session without a start command (from Steam).
        for (var i = 0; i < 6; i++)
        {
            var at = t0.AddDays(i);
            f.Launches.Insert(0, new LaunchRecord { ItemId = "item_er", Name = "Elden Ring", At = at, Ok = true });
            f.Sessions.Insert(0, new GameSession { ItemId = "item_er", Name = "Elden Ring", StartedAt = at.AddSeconds(i < 3 ? 20 : 40), StartSeconds = i < 3 ? 20 : 40, StartAccuracy = 1 });
        }
        f.Sessions.Insert(0, new GameSession { ItemId = "item_er", Name = "Elden Ring", StartedAt = t0.AddDays(10) }); // not started from the app
        // Older session without stored value: derived from the start log, accurate only to the scan interval.
        f.Launches.Insert(0, new LaunchRecord { ItemId = "item_cs", Name = "CS2", At = t0, Ok = true });
        f.Launches.Insert(0, new LaunchRecord { ItemId = "item_cs", Name = "CS2", At = t0.AddSeconds(5), Ok = false, Error = "x" }); // failed start is ignored
        f.Sessions.Insert(0, new GameSession { ItemId = "item_cs", Name = "CS2", StartedAt = t0.AddSeconds(12) });
        // A start command 20 minutes before is too long ago to belong to the session.
        f.Launches.Insert(0, new LaunchRecord { ItemId = "item_old", Name = "Old", At = t0, Ok = true });
        f.Sessions.Insert(0, new GameSession { ItemId = "item_old", Name = "Old", StartedAt = t0.AddMinutes(20) });

        var r = Json(StartTimes.Report(f, defaultAccuracy: 5));
        var games = r.GetProperty("games").EnumerateArray().ToList();
        Assert.Equal(new[] { "item_er", "item_cs" }, games.Select(g => g.GetProperty("itemId").GetString()));
        var er = games[0];
        Assert.Equal(6, er.GetProperty("count").GetInt32());
        Assert.Equal(30, er.GetProperty("median").GetDouble());
        Assert.Equal(40, er.GetProperty("last").GetDouble());
        Assert.Equal("slower", er.GetProperty("trend").GetString());
        var cs = games[1];
        Assert.Equal(12, cs.GetProperty("last").GetDouble());
        Assert.Equal(5, cs.GetProperty("accuracy").GetInt32());
    }

    sealed class FakeProcesses : IProcessSource
    {
        public List<string> Names = new();
        public IReadOnlyList<ProcessInfo> Snapshot() => Names.Select((n, i) => new ProcessInfo(i, n, null)).ToList();
    }

    [Fact]
    public void After_a_start_command_the_pc_looks_every_second_and_records_the_start_time()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var item = new LibraryItem { Id = "item_g", Name = "Shooter", Kind = ItemKind.Game, ProcessNames = { "shooter" } };
        s.Library.Import(new LibraryFile { Items = { item } });
        var procs = new FakeProcesses();
        using var tracker = new SessionTracker(s.Library, procs, s.Settings);
        tracker.Start();
        var normal = tracker.PeriodSeconds;
        Assert.True(normal > 1);
        s.History.RecordLaunch(item, new LaunchResult(true, "ok"), "test");
        tracker.Boost();
        Assert.Equal(1, tracker.CurrentAccuracy);
        procs.Names = new() { "shooter" };
        var seen = 0;
        tracker.Started += (i, at) => { seen++; s.History.SessionStarted(i, at, tracker.LastScanAccuracy); };
        tracker.Tick();
        Assert.Equal(1, seen);
        Assert.Equal(normal, tracker.CurrentAccuracy); // back to the normal interval once the game is seen
        var r = Json(s.History.StartTimeReport(normal));
        var g = r.GetProperty("games").EnumerateArray().Single();
        Assert.Equal(1, g.GetProperty("accuracy").GetInt32());
        Assert.InRange(g.GetProperty("last").GetDouble(), 0, 5);
    }
}
