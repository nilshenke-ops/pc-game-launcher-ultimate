using Pgl.Core.Models;

namespace Pgl.Core.Services;

/// <summary>
/// Start-time analysis: how long it takes from the start command in the app until the game's process is running.
/// Only measured values – sessions started outside the app (no start command shortly before) are not counted.
/// </summary>
public static class StartTimes
{
    /// <summary>A start command counts for a session only if it came at most this long before.</summary>
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(10);

    /// <summary>The last successful start command of this game shortly before <paramref name="at"/>.</summary>
    public static LaunchRecord? LaunchFor(HistoryFile f, string itemId, DateTime at) =>
        f.Launches.Where(l => l.ItemId == itemId && l.Ok && l.At <= at && at - l.At <= Window).OrderByDescending(l => l.At).FirstOrDefault();

    public sealed record Sample(DateTime At, double Seconds, int? Accuracy);

    static double Median(IReadOnlyList<double> v)
    {
        var s = v.OrderBy(x => x).ToList();
        return s.Count == 0 ? 0 : s.Count % 2 == 1 ? s[s.Count / 2] : (s[s.Count / 2 - 1] + s[s.Count / 2]) / 2;
    }

    /// <summary>Per game: last, median, fastest, slowest, the last 20 values and a trend (only from own measurements).
    /// Older sessions without a stored value are derived from the start log (accurate to the scan interval).</summary>
    public static object Report(HistoryFile f, int defaultAccuracy)
    {
        var samples = new List<(string itemId, string name, Sample s)>();
        foreach (var s in f.Sessions)
        {
            var secs = s.StartSeconds;
            var acc = s.StartAccuracy;
            if (secs == null)
            {
                var l = LaunchFor(f, s.ItemId, s.StartedAt);
                if (l == null) continue;
                secs = Math.Round((s.StartedAt - l.At).TotalSeconds, 1);
                acc = defaultAccuracy;
            }
            samples.Add((s.ItemId, s.Name, new Sample(s.StartedAt, secs.Value, acc)));
        }
        var games = samples.GroupBy(x => x.itemId).Select(g =>
        {
            var list = g.Select(x => x.s).OrderBy(x => x.At).ToList();
            var values = list.Select(x => x.Seconds).ToList();
            var median = Median(values);
            string? trend = null;
            if (values.Count >= 6)
            {
                var recent = Median(values.TakeLast(3).ToList()); var before = Median(values.SkipLast(3).ToList());
                if (recent > before * 1.3 && recent - before >= 3) trend = "slower";
                else if (recent < before * 0.77 && before - recent >= 3) trend = "faster";
            }
            return new
            {
                itemId = g.Key, name = g.First().name, count = values.Count,
                last = values[^1], median = Math.Round(median, 1), fastest = values.Min(), slowest = values.Max(),
                accuracy = list[^1].Accuracy, trend,
                spread = values.Count >= 3 && values.Max() > median * 3 && values.Max() - median >= 10,
                recent = list.TakeLast(20).Select(x => new { at = x.At, seconds = x.Seconds, accuracy = x.Accuracy }),
            };
        }).OrderByDescending(x => x.median).ToList();
        return new { games, windowMinutes = (int)Window.TotalMinutes };
    }
}
