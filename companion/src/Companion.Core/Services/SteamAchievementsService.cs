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
    /// <summary>Microsoft Store catalog (what the Xbox app sells) – for games that are not on Steam.</summary>
    public string MsBase { get; init; } = "https://displaycatalog.mp.microsoft.com";
    public Func<TimeSpan, Task> Delay { get; init; } = t => Task.Delay(t);

    public SteamAchievementsService(HttpMessageHandler? http = null)
    {
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(20);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.56 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public sealed record Achievement(string Name, string Description, bool Hidden, double? Percent);

    static string Site(string url) => url.Contains("wikipedia", StringComparison.OrdinalIgnoreCase) || url.Contains("wiki.", StringComparison.OrdinalIgnoreCase) ? "Wikipedia"
        : url.Contains("microsoft", StringComparison.OrdinalIgnoreCase) || url.Contains("ms.", StringComparison.OrdinalIgnoreCase) ? "Microsoft Store" : "Steam";

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
            return apps.Cast<(int, string)?>().FirstOrDefault(a => F(a!.Value.Item2) == F(wanted)) ?? apps.Cast<(int, string)?>().FirstOrDefault(a => SameGame(a!.Value.Item2, wanted));
        }
        catch (JsonException) { return null; }
    }

    static readonly HashSet<string> EditionWords = new(StringComparer.Ordinal)
    {
        "special", "edition", "remastered", "remaster", "deluxe", "goty", "game", "of", "the", "year", "definitive", "anniversary", "enhanced", "complete",
        "ultimate", "legendary", "gold", "standard", "director", "directors", "s", "cut", "hd", "collection", "digital", "premium", "classic", "version",
    };

    /// <summary>
    /// A store hit is the wanted game only if its name is the wanted name plus a series prefix and/or edition words:
    /// "Skyrim" → "The Elder Scrolls V: Skyrim Special Edition" yes, "Minecraft" → "Minecraft Dungeons" no (another game).
    /// </summary>
    public static bool SameGame(string storeName, string wanted)
    {
        static string[] W(string s) => Regex.Split(s.ToLowerInvariant(), "[^\\p{L}\\p{N}]+").Where(x => x.Length > 0).ToArray();
        var name = W(storeName);
        var want = W(wanted);
        if (want.Length == 0 || name.Length == 0) return false;
        if (string.Concat(name) == string.Concat(want)) return true;
        for (var i = 0; i + want.Length <= name.Length; i++)
        {
            if (!name.Skip(i).Take(want.Length).SequenceEqual(want)) continue;
            return name.Skip(i + want.Length).All(EditionWords.Contains);
        }
        return false;
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

    /// <summary>Product ids of games from the Microsoft Store suggestions.</summary>
    public static List<string> ParseMsSuggest(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("Results", out var res) || res.ValueKind != JsonValueKind.Array) return new();
            return res.EnumerateArray().Where(r => r.TryGetProperty("Products", out var p) && p.ValueKind == JsonValueKind.Array).SelectMany(r => r.GetProperty("Products").EnumerateArray())
                .Where(p => p.TryGetProperty("Type", out var t) && t.GetString() == "Game" && p.TryGetProperty("ProductId", out _))
                .Select(p => p.GetProperty("ProductId").GetString() ?? "").Where(id => Regex.IsMatch(id, "^[A-Z0-9]{12}$")).Distinct().Take(6).ToList();
        }
        catch (JsonException) { return new(); }
    }

    /// <summary>The wanted game from Microsoft Store product details: title, description and category (only the same game, see <see cref="SameGame"/>).</summary>
    public static (string id, string title, string? description, List<string> categories)? ParseMsProduct(string json, string wanted)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("Products", out var list) || list.ValueKind != JsonValueKind.Array) return null;
            foreach (var p in list.EnumerateArray())
            {
                if (p.TryGetProperty("ProductKind", out var k) && k.GetString() != "Game") continue;
                if (!p.TryGetProperty("LocalizedProperties", out var lps) || lps.ValueKind != JsonValueKind.Array || lps.GetArrayLength() == 0) continue;
                var lp = lps[0];
                var title = lp.TryGetProperty("ProductTitle", out var tt) ? tt.GetString() ?? "" : "";
                if (!SameGame(title, wanted)) continue;
                var desc = lp.TryGetProperty("ShortDescription", out var sd) && sd.GetString() is { Length: > 0 } d ? d : lp.TryGetProperty("ProductDescription", out var pd) ? pd.GetString() : null;
                var cats = new List<string>();
                if (p.TryGetProperty("Properties", out var pr) && pr.TryGetProperty("Categories", out var cs) && cs.ValueKind == JsonValueKind.Array)
                    cats.AddRange(cs.EnumerateArray().Select(c => c.GetString() ?? "").Where(c => c.Length is > 0 and < 60).Take(5));
                return (p.GetProperty("ProductId").GetString() ?? "", title, desc == null ? null : Clean(desc.Length > 600 ? desc[..600] : desc), cats);
            }
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or KeyNotFoundException) { }
        return null;
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

    readonly Dictionary<string, (DateTime At, (int id, string name)? App)> _apps = new();

    /// <summary>Name → Steam app (store search, same game only – "Minecraft" is not "Minecraft Dungeons"); cached a day.</summary>
    public async Task<(int id, string name)?> FindAppAsync(string game)
    {
        game = game.Trim();
        if (game.Length is < 2 or > 100) throw new RpcException("invalid-params", "Spielname mit 2–100 Zeichen.");
        var key = game.ToLowerInvariant();
        lock (_apps) if (_apps.TryGetValue(key, out var c) && DateTime.UtcNow - c.At < TimeSpan.FromDays(1)) return c.App;
        var app = PickApp(await GetAsync($"{StoreBase}/api/storesearch/?term={Uri.EscapeDataString(game)}&l=german&cc=DE"), game);
        lock (_apps) { if (_apps.Count > 500) _apps.Clear(); _apps[key] = (DateTime.UtcNow, app); }
        return app;
    }

    public sealed record GameFacts(int AppId, string Name, string Url, List<string> Developers, List<string> Publishers, string? Release, bool ComingSoon,
        bool Free, int? PriceCents, int? InitialCents, int Discount, string? Currency, int? Metacritic, string? MetacriticUrl, List<string> Genres,
        string? Description, List<string> Platforms, int? PlayersNow, DateTime FetchedAt, string Source);

    readonly Dictionary<int, GameFacts> _facts = new();

    /// <summary>
    /// JARVIS "Was ist X für ein Spiel / was kostet es / wie viele spielen gerade?": Steam's own store page data
    /// (appdetails, German, prices in €) and the current player count (ISteamUserStats) – passed on as Steam says it, kept 30 min.
    /// </summary>
    public async Task<GameFacts> FactsAsync(string game)
    {
        var app = await FindAppAsync(game) ?? throw new RpcException("not-found", $"„{game.Trim()}“ habe ich im Steam-Shop nicht eindeutig gefunden.");
        lock (_facts) if (_facts.TryGetValue(app.id, out var c) && DateTime.UtcNow - c.FetchedAt < TimeSpan.FromMinutes(30)) return c;
        var f = ParseFacts(await GetAsync($"{StoreBase}/api/appdetails?appids={app.id}&l=german&cc=DE"), app.id, app.name);
        try
        {
            using var doc = JsonDocument.Parse(await GetAsync($"{ApiBase}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid={app.id}"));
            if (doc.RootElement.TryGetProperty("response", out var r) && r.TryGetProperty("player_count", out var pc) && pc.TryGetInt32(out var n)) f = f with { PlayersNow = n };
        }
        catch (Exception e) when (e is RpcException or JsonException) { /* no count – said as unknown */ }
        lock (_facts) { if (_facts.Count > 300) _facts.Clear(); _facts[app.id] = f; }
        return f;
    }

    public static GameFacts ParseFacts(string json, int appId, string fallbackName)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty(appId.ToString(), out var root) || !root.TryGetProperty("success", out var ok) || ok.ValueKind != JsonValueKind.True || !root.TryGetProperty("data", out var d))
                throw new RpcException("not-found", "Steam hat zu diesem Spiel keine Shop-Daten.");
            string? S(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() is { Length: > 0 } x ? x : null;
            List<string> L(string k, string? field = null)
            {
                var list = new List<string>();
                if (d.TryGetProperty(k, out var a) && a.ValueKind == JsonValueKind.Array)
                    foreach (var x in a.EnumerateArray())
                        if ((field == null ? (x.ValueKind == JsonValueKind.String ? x.GetString() : null) : S(x, field)) is { Length: > 0 } v && list.Count < 8) list.Add(v.Length > 80 ? v[..80] : v);
                return list;
            }
            int? price = null, initial = null; var discount = 0; string? cur = null;
            if (d.TryGetProperty("price_overview", out var po) && po.ValueKind == JsonValueKind.Object)
            {
                if (po.TryGetProperty("final", out var fi) && fi.TryGetInt32(out var fv)) price = fv;
                if (po.TryGetProperty("initial", out var ii) && ii.TryGetInt32(out var iv)) initial = iv;
                if (po.TryGetProperty("discount_percent", out var di) && di.TryGetInt32(out var dv)) discount = dv;
                cur = S(po, "currency");
            }
            int? mc = null; string? mcUrl = null;
            if (d.TryGetProperty("metacritic", out var m) && m.ValueKind == JsonValueKind.Object)
            {
                if (m.TryGetProperty("score", out var sc) && sc.TryGetInt32(out var sv)) mc = sv;
                mcUrl = S(m, "url") is { } u && u.StartsWith("https://") ? u : null;
            }
            string? release = null; var soon = false;
            if (d.TryGetProperty("release_date", out var rd) && rd.ValueKind == JsonValueKind.Object)
            {
                release = S(rd, "date");
                soon = rd.TryGetProperty("coming_soon", out var cs) && cs.ValueKind == JsonValueKind.True;
            }
            var platforms = new List<string>();
            if (d.TryGetProperty("platforms", out var pl) && pl.ValueKind == JsonValueKind.Object)
                foreach (var (k, label) in new[] { ("windows", "Windows"), ("mac", "macOS"), ("linux", "Linux / Steam Deck (SteamOS)") })
                    if (pl.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.True) platforms.Add(label);
            var desc = S(d, "short_description");
            if (desc != null) { desc = System.Net.WebUtility.HtmlDecode(Regex.Replace(desc, "<[^>]+>", "")).Trim(); if (desc.Length > 600) desc = desc[..600] + " …"; }
            return new GameFacts(appId, S(d, "name") ?? fallbackName, $"https://store.steampowered.com/app/{appId}", L("developers"), L("publishers"), release, soon,
                d.TryGetProperty("is_free", out var fr) && fr.ValueKind == JsonValueKind.True, price, initial, discount, cur, mc, mcUrl, L("genres", "description"),
                desc, platforms, null, DateTime.UtcNow, "Steam-Shop (store.steampowered.com)");
        }
        catch (JsonException) { throw new RpcException("unavailable", "Steam hat unerwartet geantwortet."); }
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
            else if (await MicrosoftAsync(game) is { } ms)
            {
                result = new { source = "Microsoft Store / Xbox (displaycatalog.mp.microsoft.com)", appId = (int?)null, name = ms.title, url = $"https://www.xbox.com/de-DE/games/store/x/{ms.id}", achievements = new List<Achievement>(), genres = ms.categories, categories = new List<string>(), description = ms.description };
            }
            else
            {
                string? title;
                try { title = PickWikiTitle(await GetAsync($"{WikiBase}/w/rest.php/v1/search/title?q={Uri.EscapeDataString(game)}&limit=5")); }
                catch (RpcException e) when (steamDown is not null) { throw new RpcException("unavailable", $"{steamDown.Message} {e.Message}"); }
                if (title is null) throw steamDown ?? new RpcException("not-found", $"Zu „{game}“ habe ich weder bei Steam noch im Microsoft Store (Xbox) noch bei Wikipedia ein Spiel gefunden.");
                var summary = ParseWikiSummary(await GetAsync($"{WikiBase}/api/rest_v1/page/summary/{Uri.EscapeDataString(title)}"));
                result = new { source = "Wikipedia (de.wikipedia.org)", appId = (int?)null, name = title.Replace('_', ' '), url = $"{WikiBase}/wiki/{Uri.EscapeDataString(title)}", achievements = new List<Achievement>(), genres = new List<string>(), categories = new List<string>(), description = summary };
            }
            lock (_cache) { if (_cache.Count > 100) _cache.Clear(); _cache[cacheKey] = (DateTime.UtcNow, result); }
            return result;
        }
        finally { _one.Release(); }
    }

    /// <summary>Not on Steam: is it a game of the Microsoft Store / Xbox? Errors there only mean "not found here".</summary>
    async Task<(string id, string title, string? description, List<string> categories)?> MicrosoftAsync(string game)
    {
        try
        {
            var ids = ParseMsSuggest(await GetAsync($"{MsBase}/v7.0/productFamilies/autosuggest?market=DE&languages=de-de&query={Uri.EscapeDataString(game)}&productFamilyNames=Games"));
            if (ids.Count == 0) return null;
            return ParseMsProduct(await GetAsync($"{MsBase}/v7.0/products?bigIds={string.Join(",", ids)}&market=DE&languages=de-de"), game);
        }
        catch (RpcException) { return null; }
    }

    public void Dispose() { _http.Dispose(); _one.Dispose(); }
}
