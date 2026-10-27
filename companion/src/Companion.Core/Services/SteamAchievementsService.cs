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
    public Func<TimeSpan, Task> Delay { get; init; } = t => Task.Delay(t);

    public SteamAchievementsService(HttpMessageHandler? http = null)
    {
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(20);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.56 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public sealed record Achievement(string Name, string Description, bool Hidden, double? Percent);

    async Task<string> GetAsync(string url)
    {
        var wait = _last + MinGap - DateTime.UtcNow;
        if (wait > TimeSpan.Zero) await Delay(wait);
        try
        {
            using var resp = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead);
            _last = DateTime.UtcNow;
            if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Steam antwortet mit {(int)resp.StatusCode}.");
            if (resp.Content.Headers.ContentLength > 5_000_000) throw new RpcException("unavailable", "Antwort von Steam ist ungewöhnlich groß – abgebrochen.");
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

    public async Task<object> TasksAsync(string game)
    {
        game = game.Trim();
        if (game.Length is < 2 or > 100) throw new RpcException("invalid-params", "Spielname mit 2–100 Zeichen.");
        var cacheKey = game.ToLowerInvariant();
        lock (_cache) if (_cache.TryGetValue(cacheKey, out var c) && DateTime.UtcNow - c.At < CacheFor) return c.Result;
        await _one.WaitAsync();
        try
        {
            var search = await GetAsync($"{StoreBase}/api/storesearch/?term={Uri.EscapeDataString(game)}&l=german&cc=DE");
            var app = PickApp(search, game) ?? throw new RpcException("not-found", $"„{game}“ habe ich bei Steam nicht gefunden – Erfolge gibt es nur für Steam-Spiele.");
            var pct = ParsePercent(await GetAsync($"{ApiBase}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid={app.id}"));
            var list = ParsePage(await GetAsync($"{CommunityBase}/achievements/{app.id}?l=german"), pct);
            if (list.Count == 0) throw new RpcException("not-found", $"„{app.name}“ hat bei Steam keine Erfolge – daraus lässt sich kein Bingo machen.");
            var result = new { source = Source, appId = app.id, name = app.name, url = $"{CommunityBase}/achievements/{app.id}", achievements = list };
            lock (_cache) { if (_cache.Count > 100) _cache.Clear(); _cache[cacheKey] = (DateTime.UtcNow, result); }
            return result;
        }
        finally { _one.Release(); }
    }

    public void Dispose() { _http.Dispose(); _one.Dispose(); }
}
