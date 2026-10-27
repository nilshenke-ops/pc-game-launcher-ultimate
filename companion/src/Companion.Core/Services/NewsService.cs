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

    public void Dispose() => _http.Dispose();
}
