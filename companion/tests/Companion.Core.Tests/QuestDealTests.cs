using System.Net;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class QuestTests
{
    // Wednesday, 21.10.2026 12:00 UTC – the ISO week started on Monday 19.10.
    static DateTime _now = new(2026, 10, 21, 12, 0, 0, DateTimeKind.Utc);

    static (QuestService q, List<GameSession> sessions, List<(string, string)> reached) Make(TempDir dir, Func<DateTime> clock)
    {
        var sessions = new List<GameSession>();
        var q = new QuestService(new AppPaths(dir.Path), () => sessions, id => id == "rl" ? "Rocket League" : null, new NullHub(), clock, TimeZoneInfo.Utc);
        var reached = new List<(string, string)>();
        q.Reached = (t, x) => reached.Add((t, x));
        return (q, sessions, reached);
    }

    static System.Text.Json.JsonElement J(object o) => System.Text.Json.JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public void Weekly_playtime_counts_only_the_part_inside_the_week_and_books_xp_once()
    {
        using var dir = new TempDir();
        var now = _now;
        var (q, sessions, reached) = Make(dir, () => now);
        q.SaveGoal(new QuestGoal { Title = "2 h Rocket League", Kind = "playtime", Period = "weekly", Target = 120, ItemId = "rl" });
        // Sunday 23:00 → Monday 01:00: only the 60 minutes on Monday count.
        sessions.Add(new GameSession { ItemId = "rl", StartedAt = new(2026, 10, 18, 23, 0, 0, DateTimeKind.Utc), EndedAt = new(2026, 10, 19, 1, 0, 0, DateTimeKind.Utc) });
        sessions.Add(new GameSession { ItemId = "other", StartedAt = new(2026, 10, 20, 10, 0, 0, DateTimeKind.Utc), EndedAt = new(2026, 10, 20, 15, 0, 0, DateTimeKind.Utc) });
        var g = J(q.Get()).GetProperty("goals")[0];
        Assert.Equal(60, g.GetProperty("value").GetDouble());
        Assert.False(g.GetProperty("done").GetBoolean());
        Assert.Equal("auto", g.GetProperty("source").GetString());
        Assert.Equal("Rocket League", g.GetProperty("game").GetString());
        Assert.DoesNotContain(reached, r => r.Item1.StartsWith("Ziel"));

        sessions.Add(new GameSession { ItemId = "rl", StartedAt = new(2026, 10, 21, 9, 0, 0, DateTimeKind.Utc), EndedAt = new(2026, 10, 21, 10, 0, 0, DateTimeKind.Utc) });
        var r = J(q.Get());
        Assert.True(r.GetProperty("goals")[0].GetProperty("done").GetBoolean());
        Assert.Single(reached, x => x.Item1 == "Ziel erreicht: 2 h Rocket League");
        q.Get();
        Assert.Single(reached, x => x.Item1 == "Ziel erreicht: 2 h Rocket League"); // booked once per week

        // Next week: new period, progress starts at zero again.
        now = _now.AddDays(7);
        r = J(q.Get());
        Assert.Equal(0, r.GetProperty("goals")[0].GetProperty("value").GetDouble());
        Assert.Equal("2026-W44", r.GetProperty("goals")[0].GetProperty("periodKey").GetString());
    }

    [Fact]
    public void Wins_come_only_from_entered_matches_and_achievements_unlock_from_history()
    {
        using var dir = new TempDir();
        var (q, sessions, reached) = Make(dir, () => _now);
        q.SaveGoal(new QuestGoal { Id = "goal_daily-wins", Title = "3 Siege", Kind = "wins", Period = "daily", Target = 3 });
        Assert.Equal("manual", J(q.Get()).GetProperty("goals")[0].GetProperty("source").GetString());
        for (var i = 0; i < 3; i++) q.AddMatch(new MatchRecord { Id = $"match_m{i}abc", ItemId = "rl", Result = "win", At = _now.AddHours(-1) });
        q.AddMatch(new MatchRecord { Id = "match_m0abc", ItemId = "rl", Result = "loss" }); // same id again (outbox retry) → ignored
        q.AddMatch(new MatchRecord { Game = "Fortnite", Result = "loss", At = _now.AddDays(-2) }); // yesterday's: not in today's goal
        var r = J(q.Get());
        Assert.True(r.GetProperty("goals")[0].GetProperty("done").GetBoolean());
        Assert.Equal(4, r.GetProperty("totals").GetProperty("matches").GetInt32());
        var stats = r.GetProperty("matchStats");
        Assert.Equal("Rocket League", stats[0].GetProperty("game").GetString()); // name taken from the library
        Assert.Equal(100, stats[0].GetProperty("winRate").GetDouble());
        // No game session yet → the "first round" achievement is not unlocked (nothing invented).
        Assert.DoesNotContain(r.GetProperty("achievements").EnumerateArray(), a => a.GetProperty("id").GetString() == "first" && a.GetProperty("unlocked").GetBoolean());

        sessions.Add(new GameSession { ItemId = "rl", StartedAt = _now.AddHours(-3), EndedAt = _now.AddHours(-2) });
        r = J(q.Get());
        Assert.Contains(r.GetProperty("achievements").EnumerateArray(), a => a.GetProperty("id").GetString() == "first" && a.GetProperty("unlocked").GetBoolean());
        Assert.Equal(20 + 25, r.GetProperty("xp").GetInt32()); // daily goal + first round
        Assert.Contains(reached, x => x.Item1 == "Erfolg: Erste Runde");
    }

    [Fact]
    public void Invalid_input_is_rejected()
    {
        using var dir = new TempDir();
        var (q, _, _) = Make(dir, () => _now);
        Assert.Throws<RpcException>(() => q.SaveGoal(new QuestGoal { Kind = "kills", Title = "x" }));
        Assert.Throws<RpcException>(() => q.SaveGoal(new QuestGoal { Kind = "wins", Period = "monthly", Title = "x" }));
        Assert.Throws<RpcException>(() => q.SaveGoal(new QuestGoal { Id = "../evil", Kind = "wins", Title = "x" }));
        Assert.Throws<RpcException>(() => q.AddMatch(new MatchRecord { Result = "surrender" }));
        // A match in the future is set to now.
        var m = q.AddMatch(new MatchRecord { Game = "X", Result = "draw", At = _now.AddDays(3) });
        Assert.Equal(_now, m.At);
        Assert.Equal(1, q.SaveGoal(new QuestGoal { Kind = "wins", Title = "x", Target = -5 }).Target);
    }

    [Theory]
    [InlineData(0, 1, 0, 100)]
    [InlineData(99, 1, 0, 100)]
    [InlineData(100, 2, 100, 300)]
    [InlineData(300, 3, 300, 600)]
    [InlineData(1000, 5, 1000, 1500)]
    public void Level_curve(int xp, int level, int from, int to) => Assert.Equal((level, from, to), QuestService.Level(xp));

    [Fact]
    public async Task Quests_need_manage_to_change_and_survive_a_backup()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        await viewer.Ok("quests.get");
        await viewer.Ok("deals.list");
        Assert.Equal("forbidden", await viewer.Error("quests.saveGoal", new { title = "x", kind = "wins", period = "daily", target = 1 }));
        Assert.Equal("forbidden", await viewer.Error("deals.save", new { title = "x" }));
        Assert.Equal("forbidden", await viewer.Error("deals.configure", new { enabled = true }));

        await admin.Ok("quests.saveGoal", new { id = "goal_backup1", title = "Backup-Ziel", kind = "sessions", period = "once", target = 2 });
        await admin.Ok("quests.addMatch", new { id = "match_backup1", game = "Chess", result = "win" });
        await admin.Ok("deals.save", new { id = "wish_backup1", title = "Hades II", steamAppId = "1145350", targetCents = 1999 });
        var zip = s.Backup.CreateZip(includeSounds: false);
        var v = BackupService.ValidateFile(zip);
        Assert.Contains("quests", v.Parts.Keys);
        Assert.Contains("deals", v.Parts.Keys);
        await admin.Ok("quests.removeGoal", new { id = "goal_backup1" });
        await admin.Ok("deals.remove", new { id = "wish_backup1" });
        var cls = StorageAndBackupTests.UploadFile(s, zip);
        s.Backup.Restore(cls, new[] { "quests", "deals" });
        var q = await admin.Ok("quests.get");
        Assert.Equal("Backup-Ziel", q.GetProperty("goals")[0].GetProperty("title").GetString());
        var d = await admin.Ok("deals.list");
        Assert.Equal("1145350", d.GetProperty("items")[0].GetProperty("steamAppId").GetString());
        Assert.False(d.GetProperty("enabled").GetBoolean()); // a backup never switches the price check on
    }
}

public class DealTests
{
    sealed class FakeStore : HttpMessageHandler
    {
        public int Final = 2999, Initial = 2999, Discount;
        public bool Unknown;
        public List<string> Requests { get; } = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var url = r.RequestUri!.ToString();
            lock (Requests) Requests.Add(url);
            string body;
            if (url.Contains("/api/storesearch/"))
                body = "{\"total\":2,\"items\":[{\"type\":\"app\",\"name\":\"Hades II\",\"id\":1145350,\"price\":{\"currency\":\"EUR\",\"initial\":2950,\"final\":2950}},{\"type\":\"app\",\"name\":\"Hades\",\"id\":1145360}]}";
            else if (Unknown)
                body = "{\"1145350\":{\"success\":false}}";
            else
                body = $"{{\"1145350\":{{\"success\":true,\"data\":{{\"price_overview\":{{\"currency\":\"EUR\",\"initial\":{Initial},\"final\":{Final},\"discount_percent\":{Discount}}}}}}}}}";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    [Fact]
    public async Task Nothing_is_requested_while_switched_off()
    {
        using var dir = new TempDir();
        var store = new FakeStore();
        using var d = new DealService(new AppPaths(dir.Path), new NullHub(), store, timer: false) { StoreBase = "http://steam.test" };
        d.Save(new WishItem { Title = "Hades II", SteamAppId = "1145350" });
        await d.CheckAllAsync();
        var ex = await Assert.ThrowsAsync<RpcException>(() => d.SearchAsync("hades"));
        Assert.Equal("disabled", ex.Code);
        Assert.Empty(store.Requests);
    }

    [Fact]
    public async Task Prices_are_recorded_and_a_target_is_reported_once_per_drop()
    {
        using var dir = new TempDir();
        var store = new FakeStore();
        var now = new DateTime(2026, 10, 19, 12, 0, 0, DateTimeKind.Utc);
        using var d = new DealService(new AppPaths(dir.Path), new NullHub(), store, () => now, timer: false) { StoreBase = "http://steam.test" };
        var told = new List<string>();
        d.TargetReached = (t, x) => told.Add(t + " | " + x);
        d.Configure(true, null);
        var w = d.Save(new WishItem { Title = "Hades II", SteamAppId = "1145350", TargetCents = 2000 });
        Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "nochmal", SteamAppId = "1145350" }));
        Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "x", SteamAppId = "12; rm" }));

        await d.CheckAllAsync(force: true);
        Assert.Contains(store.Requests, u => u.Contains("appids=1145350") && u.Contains("cc=de"));
        var item = d.Export().Items.Single();
        Assert.Equal(2999, item.FinalCents);
        Assert.Equal("EUR", item.Currency);
        Assert.Single(item.History);
        Assert.Empty(told);

        // Same price, same day → no new history point.
        await d.CheckAllAsync(force: true);
        Assert.Single(d.Export().Items.Single().History);

        store.Final = 1499; store.Discount = 50;
        await d.CheckAllAsync(force: true);
        Assert.Single(told);
        Assert.Contains("14,99 EUR", told[0]);
        await d.CheckAllAsync(force: true);
        Assert.Single(told); // not again for the same price

        store.Final = 1299;
        await d.CheckAllAsync(force: true);
        Assert.Equal(2, told.Count); // cheaper still → reported

        store.Final = 2999; store.Discount = 0;
        await d.CheckAllAsync(force: true);
        store.Final = 1499;
        await d.CheckAllAsync(force: true);
        Assert.Equal(3, told.Count); // above target in between → the next drop is reported again
        Assert.Equal(5, d.Export().Items.Single().History.Count);

        // Country change: the old prices (other currency) are dropped.
        d.Configure(null, "us");
        Assert.Null(d.Export().Items.Single().FinalCents);
        Assert.Empty(d.Export().Items.Single().History);
        Assert.Throws<RpcException>(() => d.Configure(null, "USA"));
        Assert.Equal(w.Id, d.Export().Items.Single().Id);
    }

    [Fact]
    public async Task Unknown_games_and_search_results_are_reported_honestly()
    {
        using var dir = new TempDir();
        var store = new FakeStore { Unknown = true };
        using var d = new DealService(new AppPaths(dir.Path), new NullHub(), store, timer: false) { StoreBase = "http://steam.test" };
        d.Configure(true, null);
        d.Save(new WishItem { Title = "Hades II", SteamAppId = "1145350" });
        d.Save(new WishItem { Title = "Ohne Steam" }); // plain wish list entry, never requested
        await d.CheckAllAsync(force: true);
        Assert.Single(store.Requests);
        var i = d.Export().Items.First();
        Assert.Null(i.FinalCents);
        Assert.Contains("kennt diese App-ID nicht", i.Error);

        var r = System.Text.Json.JsonSerializer.SerializeToElement(await d.SearchAsync("hades"), Json.Options);
        Assert.Equal(2, r.GetProperty("items").GetArrayLength());
        Assert.Equal("1145350", r.GetProperty("items")[0].GetProperty("appId").GetString());
        Assert.Equal(2950, r.GetProperty("items")[0].GetProperty("finalCents").GetInt32());
        Assert.False(r.GetProperty("items")[1].TryGetProperty("finalCents", out _)); // no price → none shown
        await Assert.ThrowsAsync<RpcException>(() => d.SearchAsync("h"));
    }
}
