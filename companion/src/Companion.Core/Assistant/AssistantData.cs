using System.Globalization;
using System.Text.Json;
using Pgl.Core.Hosting;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Core.Assistant;

/// <summary>A suggestion the user confirms by tapping – the assistant itself never runs anything.</summary>
public sealed class AssistantAction
{
    /// <summary>launch, sound, stopSounds, profile, quick, navigate, goal, wish, match.</summary>
    public string Kind { get; set; } = "";
    public string Label { get; set; } = "";
    /// <summary>RPC method the device calls on tap (with its own permissions); null for navigate.</summary>
    public string? Method { get; set; }
    public Dictionary<string, object?> Params { get; set; } = new();
    public string? Path { get; set; }
    /// <summary>Asks once more before running (starts programs or runs several steps).</summary>
    public bool Confirm { get; set; }
}

public sealed class AssistantReply
{
    public string Text { get; set; } = "";
    public List<AssistantAction> Actions { get; set; } = new();
    /// <summary>Where the answer comes from (knowledge sections, live data).</summary>
    public List<string> Sources { get; set; } = new();
    /// <summary>local, claude</summary>
    public string Mode { get; set; } = "local";
    public string? Model { get; set; }
    public double? CostUsd { get; set; }
    public List<string> Suggestions { get; set; } = new();
    /// <summary>Recognised command or data answer (not a guess from the help texts) – used to decide whether Claude is needed.</summary>
    [System.Text.Json.Serialization.JsonIgnore] public bool Confident { get; set; } = true;
}

/// <summary>Live facts and fuzzy lookups used by both the local assistant and Claude's tools.</summary>
public sealed class AssistantData
{
    readonly CompanionServices _s;
    readonly TimeZoneInfo _zone;
    readonly Func<DateTime> _now;
    public KnowledgeBase Knowledge { get; }

    readonly Func<bool>? _gameRunning;

    public AssistantData(CompanionServices s, KnowledgeBase? knowledge = null, Func<DateTime>? now = null, TimeZoneInfo? zone = null, Func<bool>? gameRunning = null)
    {
        _s = s; Knowledge = knowledge ?? KnowledgeBase.Embedded; _now = now ?? (() => DateTime.UtcNow); _zone = zone ?? TimeZoneInfo.Local; _gameRunning = gameRunning;
    }

    static readonly CultureInfo De = new("de-DE");

    // ---------------------------------------------------------------- fuzzy matching

    /// <summary>0…1 similarity of a spoken name to a stored one ("rocket" ~ "Rocket League", "cs2" ~ "Counter-Strike 2" only via exact tokens).</summary>
    public static double Similarity(string query, string name)
    {
        var q = KnowledgeBase.Fold(query).Trim();
        var n = KnowledgeBase.Fold(name).Trim();
        if (q.Length == 0 || n.Length == 0) return 0;
        if (q == n) return 1;
        string Squash(string x) => new(x.Where(char.IsLetterOrDigit).ToArray());
        var qs = Squash(q); var ns = Squash(n);
        if (qs == ns) return 0.97;
        if (ns.StartsWith(qs) && qs.Length >= 3) return 0.85 + 0.1 * qs.Length / ns.Length;
        if (ns.Contains(qs) && qs.Length >= 3) return 0.75 + 0.1 * qs.Length / ns.Length;
        // Initials: "rl" → "Rocket League", "lol" → "League of Legends"
        var initials = new string(n.Split(new[] { ' ', '-', ':', '_' }, StringSplitOptions.RemoveEmptyEntries).Select(w => w[0]).ToArray());
        if (qs.Length >= 2 && qs == initials) return 0.8;
        var qt = q.Split(' ', StringSplitOptions.RemoveEmptyEntries); var nt = n.Split(new[] { ' ', '-', ':' }, StringSplitOptions.RemoveEmptyEntries);
        var hit = qt.Count(t => nt.Any(w => w == t || (t.Length >= 4 && w.StartsWith(t))));
        var tokenScore = qt.Length == 0 ? 0 : 0.7 * hit / Math.Max(qt.Length, 1) * Math.Min(1, (double)hit / nt.Length + 0.5);
        var lev = 1 - (double)Levenshtein(qs, ns) / Math.Max(qs.Length, ns.Length);
        return Math.Max(tokenScore, lev * 0.9);
    }

    static int Levenshtein(string a, string b)
    {
        var d = new int[b.Length + 1];
        for (var j = 0; j <= b.Length; j++) d[j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            var prev = d[0]; d[0] = i;
            for (var j = 1; j <= b.Length; j++)
            {
                var tmp = d[j];
                d[j] = Math.Min(Math.Min(d[j] + 1, d[j - 1] + 1), prev + (a[i - 1] == b[j - 1] ? 0 : 1));
                prev = tmp;
            }
        }
        return d[b.Length];
    }

    public static (T item, double score)? Best<T>(string query, IEnumerable<T> items, Func<T, string> name, double min = 0.62)
    {
        (T, double)? best = null;
        foreach (var i in items)
        {
            var sc = Similarity(query, name(i));
            if (sc >= min && (best == null || sc > best.Value.Item2)) best = (i, sc);
        }
        return best;
    }

    // ---------------------------------------------------------------- lookups

    public List<LibraryItem> Library() => _s.Library.List();
    public List<Sound> Sounds() => _s.Soundboard.Get().Sounds;
    public ProfilesFile Profiles() => _s.Profiles.Get();
    public List<QuickAction> QuickActions() => _s.QuickActions.List();

    public object LibrarySummary(string? query, int max = 40)
    {
        var running = _s.Sessions.Running().Select(r => r.itemId).ToHashSet();
        var items = Library().AsEnumerable();
        if (!string.IsNullOrWhiteSpace(query)) items = items.Select(i => (i, sc: Similarity(query, i.Name))).Where(x => x.sc >= 0.5).OrderByDescending(x => x.sc).Select(x => x.i);
        return items.Take(max).Select(i => new { i.Id, i.Name, kind = i.Kind.ToString().ToLowerInvariant(), source = i.Source.ToString().ToLowerInvariant(), i.Favorite, running = running.Contains(i.Id), i.Categories }).ToList();
    }

    public object SoundsSummary(string? query, int max = 60)
    {
        var items = Sounds().AsEnumerable();
        if (!string.IsNullOrWhiteSpace(query)) items = items.Select(i => (i, sc: Similarity(query, i.Name))).Where(x => x.sc >= 0.5).OrderByDescending(x => x.sc).Select(x => x.i);
        return new { playing = _s.Soundboard.Playing(), sounds = items.Take(max).Select(x => new { x.Id, x.Name, x.Categories }).ToList() };
    }

    public object ProfilesAndActions()
    {
        var p = Profiles();
        return new
        {
            activeProfile = p.Profiles.FirstOrDefault(x => x.Id == p.ActiveProfileId)?.Name, autoSwitch = p.AutoSwitch,
            profiles = p.Profiles.Select(x => new { x.Id, x.Name }),
            quickActions = QuickActions().Select(q => new { q.Id, q.Name, q.Category, steps = q.Steps.Count, q.RequireConfirm }),
            hotkeys = _s.Hotkeys.List().Where(h => h.Enabled).Select(h => new { h.Keys, action = h.Action.Type.ToString() }),
            automations = _s.Automations.List().Select(a => new { a.Name, a.Enabled, trigger = a.Trigger.ToString() }),
        };
    }

    /// <summary>One measurement right now (CPU, RAM, GPU, drives), with the honest "not available" where there is no source.</summary>
    public (MetricsSample sample, string text) PcStatus()
    {
        var m = _s.Monitor.Last is { } last && _now() - last.At < TimeSpan.FromSeconds(10) ? last : _s.Metrics.Sample();
        // CPU load needs two measurements; right after the start the first one has none yet.
        if (m.CpuPercent == null && _s.Monitor.Last == null) { Thread.Sleep(700); m = _s.Metrics.Sample(); }
        static string F(FormattableString f) => f.ToString(De);
        const double GB = 1073741824.0;
        var parts = new List<string>();
        parts.Add(m.CpuPercent is { } c ? F($"CPU {c:0} %") : "CPU-Auslastung nicht verfügbar");
        if (m.CpuTempC is { } ct) parts.Add(F($"CPU-Temperatur {ct:0} °C"));
        if (m.MemTotalBytes is { } mt && m.MemUsedBytes is { } mu) parts.Add(F($"RAM {mu / GB:0.0} von {mt / GB:0.0} GB ({100.0 * mu / mt:0} %)"));
        foreach (var g in m.Gpus)
            parts.Add($"{g.Name}: " + string.Join(", ", new[] { g.UtilPercent is { } u ? F($"{u:0} % Last") : null, g.TempC is { } t ? F($"{t:0} °C") : null,
                g.MemUsedBytes is { } vu && g.MemTotalBytes is { } vt ? F($"VRAM {vu / GB:0.0}/{vt / GB:0.0} GB") : null }.Where(x => x != null).DefaultIfEmpty("keine Werte")));
        if (m.Gpus.Count == 0) parts.Add("Grafikkarte: keine Werte (nur mit NVIDIA verfügbar)");
        foreach (var d in m.Disks.Take(4)) parts.Add(F($"Laufwerk {d.Name}: {d.FreeBytes / GB:0} GB frei"));
        return (m, string.Join(" · ", parts));
    }

    public object PcStatusObject()
    {
        var (m, text) = PcStatus();
        return new { text, cpuPercent = m.CpuPercent, cpuTempC = m.CpuTempC, memUsedBytes = m.MemUsedBytes, memTotalBytes = m.MemTotalBytes, gpus = m.Gpus, disks = m.Disks, fps = m.FpsStatus, running = Running() };
    }

    public bool GameRunning() => _gameRunning?.Invoke() ?? _s.Sessions.AnyGameRunning();

    public List<string> Running() => _s.Sessions.Running().Select(r => _s.Library.Get(r.itemId)?.Name ?? r.itemId).ToList();

    /// <summary>Play time from the game detection in a period: today, yesterday, week (ISO, Monday), month, all.</summary>
    public (double minutes, int sessions, List<(string game, double minutes)> perGame) PlayTime(string period, string? itemId = null)
    {
        var now = _now();
        var today = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(now, DateTimeKind.Utc), _zone).Date;
        DateTime Utc(DateTime local) => TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), _zone);
        var (from, to) = period switch
        {
            "today" => (Utc(today), now),
            "yesterday" => (Utc(today.AddDays(-1)), Utc(today)),
            "week" => (Utc(today.AddDays(-(((int)today.DayOfWeek + 6) % 7))), now),
            "month" => (Utc(new DateTime(today.Year, today.Month, 1)), now),
            _ => (DateTime.MinValue, now),
        };
        var sessions = _s.History.Export().Sessions.Where(x => itemId == null || x.ItemId == itemId).ToList();
        var per = new Dictionary<string, double>();
        int count = 0;
        foreach (var x in sessions)
        {
            var start = x.StartedAt > from ? x.StartedAt : from;
            var end = (x.EndedAt ?? now) < to ? x.EndedAt ?? now : to;
            var min = (end - start).TotalMinutes;
            if (min <= 0) continue;
            count++;
            var name = _s.Library.Get(x.ItemId)?.Name ?? x.Name;
            per[name] = per.GetValueOrDefault(name) + min;
        }
        return (per.Values.Sum(), count, per.OrderByDescending(p => p.Value).Select(p => (p.Key, p.Value)).ToList());
    }

    public static string Duration(double minutes) => minutes < 1 ? "unter einer Minute" : minutes < 60 ? $"{Math.Round(minutes)} Minuten" : $"{(int)(minutes / 60)} Std. {(int)Math.Round(minutes % 60)} Min.";

    public object PlayTimeObject(string period, string? game)
    {
        string? itemId = null;
        if (!string.IsNullOrWhiteSpace(game))
        {
            if (Best(game, Library(), i => i.Name) is not { } hit) return new { error = $"Kein Spiel „{game}“ in der Bibliothek." };
            itemId = hit.item.Id;
        }
        var (min, n, per) = PlayTime(period, itemId);
        return new { period, minutes = Math.Round(min), sessions = n, perGame = per.Take(10).Select(p => new { p.game, minutes = Math.Round(p.minutes) }), historyEnabled = _s.Settings.Get().HistoryEnabled, source = "Spielerkennung (Gaming-Verlauf)" };
    }

    public JsonElement Quests() => JsonSerializer.SerializeToElement(_s.Quests.Get(), Json.Options);
    public JsonElement Deals() => JsonSerializer.SerializeToElement(_s.Deals.List(), Json.Options);
    public List<Notification> Notifications() => _s.Notifications.List().Take(15).ToList();

    public object UpdateInfo() => _s.Updates.Status();
    public async Task<JsonElement> NetworkCheck() => JsonSerializer.SerializeToElement(await _s.Network.Run(), Json.Options);

    public object SettingsOverview()
    {
        var st = _s.Settings.Get();
        // Never any secret – only whether something is set.
        return new
        {
            st.PcName, st.Language, st.LanAccess, st.Port, st.RelayEnabled, st.HistoryEnabled, st.RecordSessionPerf, st.QuietWhileGaming, st.GamePassEnabled, st.SteamEnabled,
            st.CoverSearch, st.SteamCoversFromCdn, obsUrl = st.ObsUrl, steamKeySet = st.SteamApiKeyProtected != null, relaySecretSet = st.RelaySecretProtected != null,
            version = UpdateService.CurrentVersion, platform = _s.Platform.Name, features = _s.Features(), devices = _s.Devices.List().Count,
        };
    }

    // ---------------------------------------------------------------- actions (suggestions)

    public AssistantAction LaunchAction(LibraryItem i) => new() { Kind = "launch", Label = $"{i.Name} starten", Method = "library.launch", Params = { ["id"] = i.Id }, Confirm = true };
    public static AssistantAction SoundAction(Sound x) => new() { Kind = "sound", Label = $"„{x.Name}“ abspielen", Method = "sounds.play", Params = { ["id"] = x.Id } };
    public static AssistantAction StopSoundsAction() => new() { Kind = "stopSounds", Label = "Alle Sounds stoppen", Method = "sounds.stopAll" };
    public static AssistantAction ProfileAction(Profile p) => new() { Kind = "profile", Label = $"Profil „{p.Name}“ aktivieren", Method = "profiles.activate", Params = { ["id"] = p.Id } };
    public static AssistantAction QuickAction(QuickAction q) => new() { Kind = "quick", Label = $"„{q.Name}“ ausführen", Method = "quick.run", Params = { ["id"] = q.Id }, Confirm = true };
    public AssistantAction Navigate(string path, string? title = null) => new() { Kind = "navigate", Label = $"{title ?? Knowledge.PageTitle(path) ?? path} öffnen", Path = path };
}
