using System.Globalization;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>Own goal, e.g. "2 hours of Rocket League per week" or "3 wins per day".</summary>
public sealed class QuestGoal
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    /// <summary>playtime (minutes, automatic), sessions (count, automatic), wins / matches (manually recorded).</summary>
    public string Kind { get; set; } = "playtime";
    /// <summary>daily, weekly or once (counted from the creation of the goal).</summary>
    public string Period { get; set; } = "weekly";
    public int Target { get; set; } = 60;
    /// <summary>Only this game/program from the library (null = all).</summary>
    public string? ItemId { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; }
}

/// <summary>A match the user entered by hand – there is no source for private game statistics.</summary>
public sealed class MatchRecord
{
    public string Id { get; set; } = "";
    public string? ItemId { get; set; }
    public string Game { get; set; } = "";
    public DateTime At { get; set; }
    /// <summary>win, loss, draw.</summary>
    public string Result { get; set; } = "win";
    public string? Score { get; set; }
    public string? Note { get; set; }
}

/// <summary>Earned XP: a reached goal (per period) or an achievement. Kept, so XP do not vanish when old history is trimmed.</summary>
public sealed class XpEntry
{
    public string Key { get; set; } = "";
    public string Title { get; set; } = "";
    public int Xp { get; set; }
    public DateTime At { get; set; }
}

public sealed class QuestsFile
{
    public List<QuestGoal> Goals { get; set; } = new();
    public List<MatchRecord> Matches { get; set; } = new();
    public List<XpEntry> Ledger { get; set; } = new();
}

/// <summary>
/// GameQuest: own goals, achievements, XP and level. Play time and sessions come from the game detection (history),
/// wins and matches only from what the user enters – every value says where it comes from. Nothing is estimated.
/// </summary>
public sealed class QuestService
{
    public static readonly string[] Kinds = { "playtime", "sessions", "wins", "matches" };
    public static readonly string[] Periods = { "daily", "weekly", "once" };
    public static int XpFor(string period) => period switch { "daily" => 20, "weekly" => 60, _ => 100 };
    static readonly Regex ClientId = new("^(goal|match)_[A-Za-z0-9_-]{4,40}$");

    sealed record Achievement(string Id, string Title, string Description, int Xp, string Source, Func<Stats, double> Value, double Target);
    sealed record Stats(double TotalMinutes, int Sessions, int Games, int LongestStreakDays, int Wins, int Matches);

    static readonly Achievement[] Achievements =
    {
        new("first", "Erste Runde", "Eine Spielsitzung erkannt", 25, "auto", s => s.Sessions, 1),
        new("h10", "10 Stunden", "10 Stunden gespielt (erkannte Sitzungen)", 50, "auto", s => s.TotalMinutes / 60, 10),
        new("h50", "50 Stunden", "50 Stunden gespielt", 100, "auto", s => s.TotalMinutes / 60, 50),
        new("h100", "100 Stunden", "100 Stunden gespielt", 200, "auto", s => s.TotalMinutes / 60, 100),
        new("games5", "Abwechslung", "5 verschiedene Spiele gespielt", 50, "auto", s => s.Games, 5),
        new("streak7", "Eine Woche dran", "7 Tage hintereinander gespielt", 100, "auto", s => s.LongestStreakDays, 7),
        new("wins10", "Sieger", "10 Siege eingetragen", 50, "manual", s => s.Wins, 10),
        new("matches50", "Dauerbrenner", "50 Matches eingetragen", 100, "manual", s => s.Matches, 50),
    };

    readonly JsonStore<QuestsFile> _store;
    readonly Func<IReadOnlyList<GameSession>> _sessions;
    readonly Func<string, string?> _itemName;
    readonly IHub _hub;
    readonly Func<DateTime> _now;
    readonly TimeZoneInfo _zone;
    public Action<string, string>? Reached { get; set; }

    public QuestService(AppPaths paths, Func<IReadOnlyList<GameSession>> sessions, Func<string, string?> itemName, IHub hub, Func<DateTime>? now = null, TimeZoneInfo? zone = null)
    {
        _store = new JsonStore<QuestsFile>(paths.File("quests.json"));
        _sessions = sessions; _itemName = itemName; _hub = hub;
        _now = now ?? (() => DateTime.UtcNow);
        _zone = zone ?? TimeZoneInfo.Local;
    }

    // ---------------------------------------------------------------- editing

    public QuestGoal SaveGoal(QuestGoal g)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        if (!string.IsNullOrEmpty(g.Id) && !ClientId.IsMatch(g.Id)) throw Bad("Ungültige Ziel-ID.");
        if (!Kinds.Contains(g.Kind)) throw Bad("Art muss Spielzeit, Sitzungen, Siege oder Matches sein.");
        if (!Periods.Contains(g.Period)) throw Bad("Zeitraum muss täglich, wöchentlich oder einmalig sein.");
        g.Target = Math.Clamp(g.Target, 1, g.Kind == "playtime" ? 100_000 : 10_000);
        g.Title = DeviceStore.Sanitize(g.Title, 60, "Ziel");
        g.ItemId = string.IsNullOrWhiteSpace(g.ItemId) ? null : g.ItemId.Length <= 64 ? g.ItemId : throw Bad("Ungültiges Spiel.");
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(g.Id)) g.Id = Ids.New("goal");
            var i = f.Goals.FindIndex(x => x.Id == g.Id);
            if (i < 0 && f.Goals.Count >= 50) throw new RpcException("limit", "Höchstens 50 Ziele.");
            g.CreatedAt = i >= 0 ? f.Goals[i].CreatedAt : _now();
            if (i >= 0) f.Goals[i] = g; else f.Goals.Add(g);
            return g;
        });
        _hub.Changed("quests");
        return r;
    }

    public void RemoveGoal(string id) { _store.Update(f => f.Goals.RemoveAll(g => g.Id == id)); _hub.Changed("quests"); }

    public MatchRecord AddMatch(MatchRecord m)
    {
        static RpcException Bad(string msg) => new("invalid-params", msg);
        if (!string.IsNullOrEmpty(m.Id) && !ClientId.IsMatch(m.Id)) throw Bad("Ungültige Match-ID.");
        if (m.Result is not ("win" or "loss" or "draw")) throw Bad("Ergebnis muss Sieg, Niederlage oder Unentschieden sein.");
        m.ItemId = string.IsNullOrWhiteSpace(m.ItemId) ? null : m.ItemId.Length <= 64 ? m.ItemId : throw Bad("Ungültiges Spiel.");
        m.Game = DeviceStore.Sanitize(m.ItemId != null ? _itemName(m.ItemId) ?? m.Game : m.Game, 60, "Spiel");
        m.Score = m.Score == null ? null : DeviceStore.Sanitize(m.Score, 20, "");
        m.Note = m.Note == null ? null : DeviceStore.Sanitize(m.Note, 300, "");
        if (m.At == default || m.At > _now().AddMinutes(5)) m.At = _now();
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(m.Id)) m.Id = Ids.New("match");
            if (f.Matches.Any(x => x.Id == m.Id)) return f.Matches.First(x => x.Id == m.Id);
            f.Matches.Insert(0, m);
            if (f.Matches.Count > 2000) f.Matches.RemoveRange(2000, f.Matches.Count - 2000);
            return m;
        });
        _hub.Changed("quests");
        return r;
    }

    public void RemoveMatch(string id) { _store.Update(f => f.Matches.RemoveAll(m => m.Id == id)); _hub.Changed("quests"); }

    // ---------------------------------------------------------------- evaluation

    DateTime Local(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(utc, DateTimeKind.Utc), _zone);
    DateTime Utc(DateTime local) => TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), _zone);

    /// <summary>Start (UTC) and key of the current period of a goal.</summary>
    (DateTime from, string key) PeriodOf(QuestGoal g)
    {
        var today = Local(_now()).Date;
        return g.Period switch
        {
            "daily" => (Utc(today), today.ToString("yyyy-MM-dd")),
            "weekly" => (Utc(today.AddDays(-(((int)today.DayOfWeek + 6) % 7))), $"{ISOWeek.GetYear(today)}-W{ISOWeek.GetWeekOfYear(today):00}"),
            _ => (g.CreatedAt, "once"),
        };
    }

    double ProgressOf(QuestGoal g, DateTime from, IReadOnlyList<GameSession> sessions, IReadOnlyList<MatchRecord> matches)
    {
        var now = _now();
        bool Mine(string? itemId) => g.ItemId == null || itemId == g.ItemId;
        return g.Kind switch
        {
            // Only the part of a session inside the period counts (a session over midnight is split).
            "playtime" => sessions.Where(s => Mine(s.ItemId)).Sum(s => Math.Max(0, ((s.EndedAt ?? now) - (s.StartedAt > from ? s.StartedAt : from)).TotalMinutes)),
            "sessions" => sessions.Count(s => Mine(s.ItemId) && s.StartedAt >= from),
            "wins" => matches.Count(m => Mine(m.ItemId) && m.At >= from && m.Result == "win"),
            _ => matches.Count(m => Mine(m.ItemId) && m.At >= from),
        };
    }

    Stats StatsOf(IReadOnlyList<GameSession> sessions, IReadOnlyList<MatchRecord> matches)
    {
        var now = _now();
        var days = sessions.Select(s => Local(s.StartedAt).Date).Distinct().OrderBy(d => d).ToList();
        int best = 0, run = 0; DateTime? prev = null;
        foreach (var d in days) { run = prev == d.AddDays(-1) ? run + 1 : 1; best = Math.Max(best, run); prev = d; }
        return new Stats(sessions.Sum(s => Math.Max(0, ((s.EndedAt ?? now) - s.StartedAt).TotalMinutes)), sessions.Count,
            sessions.Select(s => s.ItemId).Distinct().Count(), best, matches.Count(m => m.Result == "win"), matches.Count);
    }

    /// <summary>Everything for the GameQuest page. Newly reached goals and achievements are booked (XP) and reported once.</summary>
    public object Get()
    {
        var sessions = _sessions();
        var now = _now();
        var reached = new List<(string title, string text)>();
        var result = _store.UpdateIfChanged(f =>
        {
            var goals = f.Goals.Select(g =>
            {
                var (from, key) = PeriodOf(g);
                var value = ProgressOf(g, from, sessions, f.Matches);
                var done = value >= g.Target;
                var ledgerKey = $"goal:{g.Id}:{key}";
                if (done && g.Active && f.Ledger.All(e => e.Key != ledgerKey))
                {
                    f.Ledger.Add(new XpEntry { Key = ledgerKey, Title = g.Title, Xp = XpFor(g.Period), At = now });
                    reached.Add(($"Ziel erreicht: {g.Title}", $"+{XpFor(g.Period)} XP"));
                }
                return new
                {
                    g.Id, g.Title, g.Kind, g.Period, g.Target, g.ItemId, g.Active, g.CreatedAt,
                    game = g.ItemId == null ? null : _itemName(g.ItemId),
                    value = Math.Round(value, 1), done, periodKey = key, periodFrom = from, xp = XpFor(g.Period),
                    source = g.Kind is "playtime" or "sessions" ? "auto" : "manual",
                };
            }).ToList();

            var stats = StatsOf(sessions, f.Matches);
            var achievements = Achievements.Select(a =>
            {
                var v = a.Value(stats);
                var key = $"ach:{a.Id}";
                var entry = f.Ledger.FirstOrDefault(e => e.Key == key);
                if (entry == null && v >= a.Target)
                {
                    entry = new XpEntry { Key = key, Title = a.Title, Xp = a.Xp, At = now };
                    f.Ledger.Add(entry);
                    reached.Add(($"Erfolg: {a.Title}", $"{a.Description} · +{a.Xp} XP"));
                }
                return new { a.Id, a.Title, a.Description, a.Xp, a.Source, value = Math.Round(Math.Min(v, a.Target), 1), target = a.Target, unlocked = entry != null, unlockedAt = entry?.At };
            }).ToList();
            if (f.Ledger.Count > 5000) f.Ledger.RemoveRange(0, f.Ledger.Count - 5000);

            var xp = f.Ledger.Sum(e => e.Xp);
            var (level, levelFrom, levelTo) = Level(xp);
            var perGame = f.Matches.GroupBy(m => m.Game).Select(gr => new
            {
                game = gr.Key, wins = gr.Count(m => m.Result == "win"), losses = gr.Count(m => m.Result == "loss"), draws = gr.Count(m => m.Result == "draw"),
                winRate = Math.Round(100.0 * gr.Count(m => m.Result == "win") / gr.Count(), 1),
            }).OrderByDescending(x => x.wins + x.losses + x.draws).ToList();
            var r = new
            {
                xp, level, levelFrom, levelTo, goals, achievements, matchStats = perGame,
                matches = f.Matches.Take(200), ledger = f.Ledger.OrderByDescending(e => e.At).Take(30),
                totals = new { minutes = Math.Round(stats.TotalMinutes), stats.Sessions, stats.Games, longestStreakDays = stats.LongestStreakDays, stats.Wins, stats.Matches },
                historySessions = sessions.Count,
            };
            return ((object)r, reached.Count > 0);
        });
        foreach (var (title, text) in reached) Reached?.Invoke(title, text);
        if (reached.Count > 0) _hub.Changed("quests");
        return result;
    }

    /// <summary>Level from XP: level L needs 50·L·(L−1) XP in total (0, 100, 300, 600, 1000 …).</summary>
    public static (int level, int from, int to) Level(int xp)
    {
        var l = 1;
        while (50 * (l + 1) * l <= xp) l++;
        return (l, 50 * l * (l - 1), 50 * (l + 1) * l);
    }

    internal QuestsFile Export() => _store.Snapshot();
    internal void Import(QuestsFile f) { _store.Replace(f); _hub.Changed("quests"); }

    /// <summary>Restore from a backup: invalid goals/matches are skipped, XP entries are capped (they only come from the backup file).</summary>
    internal void ImportChecked(QuestsFile f)
    {
        var goals = f.Goals.Where(g => ClientIdOrNew(g.Id) && Kinds.Contains(g.Kind) && Periods.Contains(g.Period) && (g.ItemId?.Length ?? 0) <= 64).Take(50).ToList();
        foreach (var g in goals) { g.Title = DeviceStore.Sanitize(g.Title, 60, "Ziel"); g.Target = Math.Clamp(g.Target, 1, g.Kind == "playtime" ? 100_000 : 10_000); }
        var matches = f.Matches.Where(m => ClientIdOrNew(m.Id) && m.Result is "win" or "loss" or "draw" && (m.ItemId?.Length ?? 0) <= 64).Take(2000).ToList();
        foreach (var m in matches) { m.Game = DeviceStore.Sanitize(m.Game, 60, "Spiel"); m.Score = m.Score == null ? null : DeviceStore.Sanitize(m.Score, 20, ""); m.Note = m.Note == null ? null : DeviceStore.Sanitize(m.Note, 300, ""); }
        var ledger = f.Ledger.Where(e => e.Key.Length <= 120).TakeLast(5000).ToList();
        foreach (var e in ledger) { e.Xp = Math.Clamp(e.Xp, 0, 200); e.Title = DeviceStore.Sanitize(e.Title, 60, "XP"); }
        Import(new QuestsFile { Goals = goals, Matches = matches, Ledger = ledger });
    }

    static bool ClientIdOrNew(string id) => ClientId.IsMatch(id) || Regex.IsMatch(id, "^(goal|match)_[0-9a-f]{12}$");
}
