using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Real tasks for a bingo of any Steam game: the game's achievements with their worldwide unlock rate. Loaded only
/// when the user agreed to look on the internet (the website asks first). Three public sources:
/// the store search (name → app), the community achievements page (names and descriptions in German; robots.txt
/// allows it) and the official Web API for the global unlock percentages (no key needed). Kept 24 h per game.
/// </summary>
public sealed class SteamAchievementsService : IDisposable
{
    public const string Source = "Steam-Erfolge (steamcommunity.com, api.steampowered.com)";
    static readonly TimeSpan MinGap = TimeSpan.FromSeconds(1.5);
    static readonly TimeSpan CacheFor = TimeSpan.FromHours(24);
    readonly HttpClient _http;
    readonly SemaphoreSlim _one = new(1, 1);
    readonly Dictionary<string, (DateTime At, object Result)> _cache = new();
    DateTime _last = DateTime.MinValue;
    public string StoreBase { get; init; } = "https://store.steampowered.com";
    public string CommunityBase { get; init; } = "https://steamcommunity.com";
    public string ApiBase { get; init; } = "https://api.steampowered.com";
    public string WikiBase { get; init; } = "https://de.wikipedia.org";
    public Func<TimeSpan, Task> Delay { get; init; } = t => Task.Delay(t);

    public SteamAchievementsService(HttpMessageHandler? http = null)
    {
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(20);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.56 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public sealed record Achievement(string Name, string Description, bool Hidden, double? Percent);

    static string Site(string url) => url.Contains("wikipedia", StringComparison.OrdinalIgnoreCase) || url.Contains("wiki.", StringComparison.OrdinalIgnoreCase) ? "Wikipedia" : "Steam";

    async Task<string> GetAsync(string url)
    {
        var wait = _last + MinGap - DateTime.UtcNow;
        if (wait > TimeSpan.Zero) await Delay(wait);
        try
        {
            using var resp = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            _last = DateTime.UtcNow;
            if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"{Site(url)} antwortet mit {(int)resp.StatusCode}{((int)resp.StatusCode == 429 ? " (zu viele Anfragen – später noch einmal)" : "")}.");
            if (resp.Content.Headers.ContentLength > 5_000_000) throw new RpcException("unavailable", $"Antwort von {Site(url)} ist ungewöhnlich groß – abgebrochen.");
            var s = await resp.Content.ReadAsStringAsync();
            return s.Length > 5_000_000 ? throw new RpcException("unavailable", "Antwort von Steam ist ungewöhnlich groß – abgebrochen.") : s;
        }
        catch (RpcException) { throw; }
        catch (Exception ex) { _last = DateTime.UtcNow; throw new RpcException("unavailable", "Steam nicht erreichbar: " + ex.Message); }
    }

    /// <summary>The Steam app for a name: exact name first, else the first game the store search returns.</summary>
    public static (int id, string name)? PickApp(string json, string wanted)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array) return null;
            var apps = items.EnumerateArray().Where(i => i.TryGetProperty("type", out var t) && t.GetString() == "app" && i.TryGetProperty("id", out var id) && id.TryGetInt32(out _))
                .Select(i => (id: i.GetProperty("id").GetInt32(), name: i.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "")).ToList();
            static string F(string s) => Regex.Replace(s.ToLowerInvariant(), "[^a-z0-9]+", "");
            return apps.Cast<(int, string)?>().FirstOrDefault(a => F(a!.Value.Item2) == F(wanted)) ?? apps.Cast<(int, string)?>().FirstOrDefault();
        }
        catch (JsonException) { return null; }
    }

    /// <summary>Achievements from the community page: the page embeds them as JSON (sometimes JSON inside a JSON string).</summary>
    public static List<Achievement> ParsePage(string html, Dictionary<string, double> percent)
    {
        var list = new List<Achievement>();
        var m = Regex.Match(html, "<script type=\"application/json\" id=\"valve-ssr-data\"[^>]*>(.*?)</script>", RegexOptions.Singleline);
        if (!m.Success) return list;
        var seen = new HashSet<string>();
        void Walk(JsonElement e, int depth)
        {
            if (list.Count >= 500) return;
            switch (e.ValueKind)
            {
                case JsonValueKind.Object:
                    if (e.TryGetProperty("api_name", out var api) && e.TryGetProperty("name", out var nm) && nm.ValueKind == JsonValueKind.String && api.ValueKind == JsonValueKind.String)
                    {
                        var key = api.GetString() ?? "";
                        var name = (nm.GetString() ?? "").Trim();
                        if (name.Length is > 0 and <= 120 && seen.Add(key))
                        {
                            var desc = e.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String ? (d.GetString() ?? "").Trim() : "";
                            var hidden = e.TryGetProperty("hidden", out var h) && h.ValueKind == JsonValueKind.True;
                            list.Add(new Achievement(name, desc.Length > 200 ? desc[..200] : desc, hidden, percent.TryGetValue(key, out var p) ? p : null));
                        }
                        return;
                    }
                    foreach (var p in e.EnumerateObject()) Walk(p.Value, depth);
                    break;
                case JsonValueKind.Array:
                    foreach (var x in e.EnumerateArray()) Walk(x, depth);
                    break;
                case JsonValueKind.String when depth < 5:
                    var s = e.GetString();
                    if (s is { Length: > 1 } && (s[0] == '{' || s[0] == '['))
                        try { using var inner = JsonDocument.Parse(s); Walk(inner.RootElement, depth + 1); } catch (JsonException) { }
                    break;
            }
        }
        try { using var doc = JsonDocument.Parse(m.Groups[1].Value); Walk(doc.RootElement, 0); } catch (JsonException) { }
        return list;
    }

    public static Dictionary<string, double> ParsePercent(string json)
    {
        var map = new Dictionary<string, double>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("achievementpercentages", out var ap) && ap.TryGetProperty("achievements", out var a) && a.ValueKind == JsonValueKind.Array)
                foreach (var x in a.EnumerateArray())
                {
                    var name = x.TryGetProperty("name", out var n) ? n.GetString() : null;
                    double v = double.NaN;
                    if (x.TryGetProperty("percent", out var p))
                        v = p.ValueKind == JsonValueKind.Number ? p.GetDouble() : double.TryParse(p.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d) ? d : double.NaN;
                    if (name != null && !double.IsNaN(v) && v is >= 0 and <= 100) map[name] = v;
                }
        }
        catch (JsonException) { }
        return map;
    }

    /// <summary>What kind of game it is (from the Steam store page data): genres, features, short description.</summary>
    public sealed record StoreInfo(string? Description, List<string> Genres, List<string> Categories);

    public static StoreInfo ParseDetails(string json, int appId)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty(appId.ToString(), out var app) || !app.TryGetProperty("data", out var d)) return new(null, new(), new());
            static List<string> Names(JsonElement d, string key) => d.TryGetProperty(key, out var a) && a.ValueKind == JsonValueKind.Array
                ? a.EnumerateArray().Select(x => x.TryGetProperty("description", out var v) ? v.GetString() ?? "" : "").Where(x => x.Length is > 0 and < 60).Distinct().Take(40).ToList() : new();
            var desc = d.TryGetProperty("short_description", out var sd) ? Clean(sd.GetString()) : null;
            return new(desc, Names(d, "genres"), Names(d, "categories"));
        }
        catch (JsonException) { return new(null, new(), new()); }
    }

    static string? Clean(string? html)
    {
        if (string.IsNullOrWhiteSpace(html)) return null;
        var t = System.Net.WebUtility.HtmlDecode(Regex.Replace(html, "<[^>]+>", " ")).Replace('\n', ' ');
        t = Regex.Replace(t, @"\s+", " ").Trim();
        return t.Length > 600 ? t[..600] : t;
    }

    /// <summary>Wikipedia (official REST API) for games that are not on Steam: the best title match that is about a game.</summary>
    public static string? PickWikiTitle(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return null;
            string? first = null;
            foreach (var p in pages.EnumerateArray())
            {
                var key = p.TryGetProperty("key", out var k) ? k.GetString() : null;
                var desc = (p.TryGetProperty("description", out var d) ? d.GetString() : "") ?? "";
                if (key == null) continue;
                first ??= key;
                if (Regex.IsMatch(desc, "(spiel|game)", RegexOptions.IgnoreCase)) return key;
            }
            return null; // nothing that says it is a game – not taken
        }
        catch (JsonException) { return null; }
    }

    public static string? ParseWikiSummary(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.TryGetProperty("extract", out var e) ? Clean(e.GetString()) : null;
        }
        catch (JsonException) { return null; }
    }

    /// <summary>
    /// Everything the internet says about a game for a bingo: Steam (achievements with unlock rates, genres, features,
    /// description) – or, for games not on Steam, the Wikipedia summary. Only the user's agreement triggers this.
    /// </summary>
    public async Task<object> TasksAsync(string game)
    {
        game = game.Trim();
        if (game.Length is < 2 or > 100) throw new RpcException("invalid-params", "Spielname mit 2–100 Zeichen.");
        var cacheKey = game.ToLowerInvariant();
        lock (_cache) if (_cache.TryGetValue(cacheKey, out var c) && DateTime.UtcNow - c.At < CacheFor) return c.Result;
        await _one.WaitAsync();
        try
        {
            object result;
            // Steam busy or down: Wikipedia is still asked (the error is only reported when that fails too).
            RpcException? steamDown = null;
            (int id, string name)? found = null;
            try { found = PickApp(await GetAsync($"{StoreBase}/api/storesearch/?term={Uri.EscapeDataString(game)}&l=german&cc=DE"), game); }
            catch (RpcException e) { steamDown = e; }
            if (found is { } app)
            {
                StoreInfo info;
                try { info = ParseDetails(await GetAsync($"{StoreBase}/api/appdetails?appids={app.id}&l=german&cc=DE"), app.id); }
                catch (RpcException) { info = new(null, new(), new()); }
                var list = new List<Achievement>();
                try
                {
                    var pct = ParsePercent(await GetAsync($"{ApiBase}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={app.id}"));
                    list = ParsePage(await GetAsync($"{CommunityBase}/achievements/{app.id}?l=german"), pct);
                }
                catch (RpcException) { /* no achievements – the genre and features still help */ }
                result = new { source = Source, appId = app.id, name = app.name, url = $"{StoreBase}/app/{app.id}", achievements = list, genres = info.Genres, categories = info.Categories, description = info.Description };
            }
            else
            {
                string? title;
                try { title = PickWikiTitle(await GetAsync($"{WikiBase}/w/rest.php/v1/search/title?q={Uri.EscapeDataString(game)}&limit=5")); }
                catch (RpcException e) when (steamDown is not null) { throw new RpcException("unavailable", $"{steamDown.Message} {e.Message}"); }
                if (title is null) throw steamDown ?? new RpcException("not-found", $"Zu „{game}“ habe ich weder bei Steam noch bei Wikipedia ein Spiel gefunden.");
                var summary = ParseWikiSummary(await GetAsync($"{WikiBase}/api/rest_v1/page/summary/{Uri.EscapeDataString(title)}"));
                result = new { source = "Wikipedia (de.wikipedia.org)", appId = (int?)null, name = title.Replace('_', ' '), url = $"{WikiBase}/wiki/{Uri.EscapeDataString(title)}", achievements = new List<Achievement>(), genres = new List<string>(), categories = new List<string>(), description = summary };
            }
            lock (_cache) { if (_cache.Count > 100) _cache.Clear(); _cache[cacheKey] = (DateTime.UtcNow, result); }
            return result;
        }
        finally { _one.Release(); }
    }

    public void Dispose() { _http.Dispose(); _one.Dispose(); }
}
