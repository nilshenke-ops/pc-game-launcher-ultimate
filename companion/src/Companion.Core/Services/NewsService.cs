using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Official announcements and patch notes of a Steam game (Steam's public news API, ISteamNews/GetNewsForApp, no key).
/// Only the developer's own announcements feed ("steam_community_announcements") – no press articles, no guessing.
/// Loaded only on request from the phone (the browser cannot ask Steam itself); the text is passed on unchanged,
/// sorting and summary happen in the app and stay marked as such.
/// </summary>
public sealed class NewsService : IDisposable
{
    public const string Source = "Steam-Ankündigungen (api.steampowered.com, ISteamNews)";
    static readonly Regex AppId = new("^[0-9]{1,10}$");
    readonly HttpClient _http;
    public string ApiBase { get; init; } = "https://api.steampowered.com";

    public NewsService(HttpMessageHandler? http = null)
    {
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(15);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.5 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public sealed record NewsItem(string Gid, string Title, string Url, DateTime Date, string? Author, string Contents, bool PatchNotes);

    public async Task<object> SteamAsync(string appId, int count)
    {
        if (!AppId.IsMatch(appId)) throw new RpcException("invalid-params", "Steam-App-ID besteht nur aus Ziffern.");
        count = Math.Clamp(count, 1, 15);
        string body;
        try
        {
            using var resp = await _http.GetAsync($"{ApiBase}/ISteamNews/GetNewsForApp/v2/?appid={appId}&count={count}&maxlength=0&feeds=steam_community_announcements&format=json");
            if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Steam antwortet mit {(int)resp.StatusCode}.");
            body = await resp.Content.ReadAsStringAsync();
        }
        catch (RpcException) { throw; }
        catch (Exception ex) { throw new RpcException("unavailable", "Steam nicht erreichbar: " + ex.Message); }
        return new { source = Source, appId, items = Parse(body) };
    }

    /// <summary>Steam's answer → items; anything unexpected is left out (never filled in).</summary>
    public static List<NewsItem> Parse(string json)
    {
        var list = new List<NewsItem>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("appnews", out var an) || !an.TryGetProperty("newsitems", out var items) || items.ValueKind != JsonValueKind.Array) return list;
            foreach (var i in items.EnumerateArray())
            {
                string S(string k) => i.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
                var url = S("url");
                if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) continue;
                if (!i.TryGetProperty("date", out var dv) || !dv.TryGetInt64(out var secs)) continue;
                var contents = S("contents");
                if (contents.Length > 60_000) contents = contents[..60_000];
                var patch = i.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array && tags.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String && x.GetString() == "patchnotes");
                var gid = S("gid");
                if (gid.Length is 0 or > 40) continue;
                list.Add(new NewsItem(gid, S("title").Trim() is { Length: > 0 } t ? (t.Length > 200 ? t[..200] : t) : "(ohne Titel)", u.ToString(),
                    DateTimeOffset.FromUnixTimeSeconds(secs).UtcDateTime, S("author") is { Length: > 0 } a ? (a.Length > 80 ? a[..80] : a) : null, contents, patch));
            }
        }
        catch (JsonException) { }
        return list;
    }

    public string EpicBase { get; init; } = "https://store-site-backend-static.ak.epicgames.com";
    public sealed record EpicFree(string Title, string Url, DateTime Start, DateTime End, string? NormalPrice, bool Now);
    (DateTime At, List<EpicFree> List)? _epic;

    /// <summary>
    /// The Epic Games Store's free games – now and coming next – from the same public list the store page shows
    /// (freeGamesPromotions). Only games whose offer is 100 % off count as free; asked on request only, kept 30 minutes.
    /// </summary>
    public async Task<object> EpicFreeAsync()
    {
        if (_epic is { } c && DateTime.UtcNow - c.At < TimeSpan.FromMinutes(30)) return new { source = "Epic Games Store (store.epicgames.com)", items = c.List };
        string body;
        try
        {
            using var resp = await _http.GetAsync($"{EpicBase}/freeGamesPromotions?locale=de&country=DE&allowCountries=DE");
            if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Epic antwortet mit {(int)resp.StatusCode}.");
            body = await resp.Content.ReadAsStringAsync();
        }
        catch (RpcException) { throw; }
        catch (Exception ex) { throw new RpcException("unavailable", "Epic nicht erreichbar: " + ex.Message); }
        var list = ParseEpic(body, DateTime.UtcNow);
        _epic = (DateTime.UtcNow, list);
        return new { source = "Epic Games Store (store.epicgames.com)", items = list };
    }

    public static List<EpicFree> ParseEpic(string json, DateTime now)
    {
        var list = new List<EpicFree>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (!doc.RootElement.TryGetProperty("data", out var d) || !d.TryGetProperty("Catalog", out var cat) || !cat.TryGetProperty("searchStore", out var ss) || !ss.TryGetProperty("elements", out var els) || els.ValueKind != JsonValueKind.Array) return list;
            foreach (var e in els.EnumerateArray())
            {
                if (!e.TryGetProperty("title", out var tv) || tv.GetString() is not { Length: > 0 } title) continue;
                string? slug = e.TryGetProperty("productSlug", out var ps) && ps.ValueKind == JsonValueKind.String ? ps.GetString() : null;
                if (string.IsNullOrEmpty(slug) && e.TryGetProperty("catalogNs", out var ns) && ns.TryGetProperty("mappings", out var mp) && mp.ValueKind == JsonValueKind.Array && mp.GetArrayLength() > 0 && mp[0].TryGetProperty("pageSlug", out var pg)) slug = pg.GetString();
                if (string.IsNullOrEmpty(slug) && e.TryGetProperty("offerMappings", out var om) && om.ValueKind == JsonValueKind.Array && om.GetArrayLength() > 0 && om[0].TryGetProperty("pageSlug", out var pg2)) slug = pg2.GetString();
                slug = slug?.Split('/')[0];
                if (string.IsNullOrEmpty(slug) || !Regex.IsMatch(slug, "^[a-z0-9-]{1,120}$")) continue;
                string? normal = e.TryGetProperty("price", out var pr) && pr.TryGetProperty("totalPrice", out var tp) && tp.TryGetProperty("fmtPrice", out var fp) && fp.TryGetProperty("originalPrice", out var op) ? op.GetString() : null;
                if (!e.TryGetProperty("promotions", out var promo) || promo.ValueKind != JsonValueKind.Object) continue;
                foreach (var (key, isNow) in new[] { ("promotionalOffers", true), ("upcomingPromotionalOffers", false) })
                {
                    if (!promo.TryGetProperty(key, out var groups) || groups.ValueKind != JsonValueKind.Array) continue;
                    foreach (var g in groups.EnumerateArray())
                    {
                        if (!g.TryGetProperty("promotionalOffers", out var offers) || offers.ValueKind != JsonValueKind.Array) continue;
                        foreach (var o in offers.EnumerateArray())
                        {
                            if (!o.TryGetProperty("discountSetting", out var ds) || !ds.TryGetProperty("discountPercentage", out var dp) || !dp.TryGetInt32(out var pct) || pct != 0) continue; // 0 = price × 0 → free
                            if (!o.TryGetProperty("startDate", out var sd) || !sd.TryGetDateTime(out var start) || !o.TryGetProperty("endDate", out var ed) || !ed.TryGetDateTime(out var end)) continue;
                            start = start.ToUniversalTime(); end = end.ToUniversalTime();
                            if (end < now) continue;
                            list.Add(new EpicFree(title.Length > 120 ? title[..120] : title, $"https://store.epicgames.com/de/p/{slug}", start, end, normal, isNow && start <= now));
                        }
                    }
                }
            }
        }
        catch (JsonException) { }
        return list.OrderByDescending(x => x.Now).ThenBy(x => x.Start).ToList();
    }

    public void Dispose() => _http.Dispose();
}
