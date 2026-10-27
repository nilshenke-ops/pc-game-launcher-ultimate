using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Price comparison of one game from keyforsteam.de (official shops and key shops). Loaded only when the user asks for it
/// – never in the background. robots.txt of the site allows game pages and asks for 5 s between requests: requests are
/// spaced at least that far apart and every page is kept for 6 hours. Only game pages of keyforsteam.de are fetched
/// (no free URLs). The offers come from the data the page itself embeds for its offer table; nothing is filled in.
/// </summary>
public sealed class KeyforsteamService : IDisposable
{
    public const string Source = "keyforsteam.de";
    public static readonly TimeSpan MinGap = TimeSpan.FromSeconds(5);
    public static readonly TimeSpan CacheFor = TimeSpan.FromHours(6);
    static readonly Regex PagePath = new("^/[a-z0-9]+(?:-[a-z0-9]+)*-key-kaufen-preisvergleich/?$");
    readonly HttpClient _http;
    readonly SemaphoreSlim _one = new(1, 1);
    readonly Dictionary<string, (DateTime At, object Result)> _cache = new();
    DateTime _last = DateTime.MinValue;
    public string Base { get; init; } = "https://www.keyforsteam.de";
    /// <summary>For tests: waiting between requests.</summary>
    public Func<TimeSpan, Task> Delay { get; init; } = t => Task.Delay(t);

    public KeyforsteamService(HttpMessageHandler? http = null)
    {
        _http = http == null ? new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(20);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.54 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public sealed record Offer(string Shop, bool Official, double? ShopRating, int ShopRatings, string Edition, string Region, string? RegionNote,
        string? Platform, double Price, double? PriceWithFees, double? PriceBeforeVoucher, string? Voucher, bool Account, bool InStock);

    /// <summary>"Elden Ring" → "elden-ring" as keyforsteam names its pages (umlauts written out, everything else dropped).</summary>
    public static string Slug(string name)
    {
        var s = name.Trim().ToLowerInvariant().Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss").Replace("&", " and ");
        s = Regex.Replace(s.Normalize(System.Text.NormalizationForm.FormD), @"\p{Mn}", "");
        s = Regex.Replace(s, "['’`´]", "");
        s = Regex.Replace(s, "[^a-z0-9]+", "-").Trim('-');
        return s.Length > 120 ? s[..120].Trim('-') : s;
    }

    /// <summary>The page for a name, or a pasted keyforsteam link (only game pages of this site are accepted).</summary>
    public string PageFor(string? name, string? url)
    {
        if (!string.IsNullOrWhiteSpace(url))
        {
            if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps || u.Host is not ("www.keyforsteam.de" or "keyforsteam.de") || !PagePath.IsMatch(u.AbsolutePath))
                throw new RpcException("invalid-params", "Nur Links auf eine Spieleseite von keyforsteam.de (…-key-kaufen-preisvergleich/).");
            return u.AbsolutePath.TrimEnd('/') + "/";
        }
        var slug = Slug(name ?? "");
        if (slug.Length < 2) throw new RpcException("invalid-params", "Spielname fehlt.");
        return $"/{slug}-key-kaufen-preisvergleich/";
    }

    public async Task<object> PricesAsync(string? name, string? url)
    {
        var path = PageFor(name, url);
        lock (_cache) if (_cache.TryGetValue(path, out var c) && DateTime.UtcNow - c.At < CacheFor) return c.Result;
        await _one.WaitAsync();
        try
        {
            lock (_cache) if (_cache.TryGetValue(path, out var c) && DateTime.UtcNow - c.At < CacheFor) return c.Result;
            var wait = _last + MinGap - DateTime.UtcNow;
            if (wait > TimeSpan.Zero) await Delay(wait);
            string html;
            try
            {
                using var resp = await _http.GetAsync(Base + path, HttpCompletionOption.ResponseHeadersRead);
                _last = DateTime.UtcNow;
                if ((int)resp.StatusCode is 404 or 301 or 302 or 410)
                    throw new RpcException("not-found", "Keyforsteam hat keine Seite unter diesem Namen. Den Link der Spieleseite von keyforsteam.de einfügen.");
                if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Keyforsteam antwortet mit {(int)resp.StatusCode}.");
                if (resp.Content.Headers.ContentLength > 4_000_000) throw new RpcException("unavailable", "Die Seite ist ungewöhnlich groß – abgebrochen.");
                html = await resp.Content.ReadAsStringAsync();
                if (html.Length > 4_000_000) throw new RpcException("unavailable", "Die Seite ist ungewöhnlich groß – abgebrochen.");
            }
            catch (RpcException) { throw; }
            catch (Exception ex) { _last = DateTime.UtcNow; throw new RpcException("unavailable", "Keyforsteam nicht erreichbar: " + ex.Message); }
            var (title, offers) = Parse(html);
            if (offers.Count == 0) throw new RpcException("unavailable", "Auf der Seite wurden keine Angebote gefunden (Aufbau geändert oder keine Preise).");
            var result = new { source = Source, url = Base + path, title, fetchedAt = DateTime.UtcNow, offers };
            lock (_cache)
            {
                if (_cache.Count > 200) _cache.Clear();
                _cache[path] = (DateTime.UtcNow, result);
            }
            return result;
        }
        finally { _one.Release(); }
    }

    /// <summary>The offer table data the page embeds (script "aks-offers-js-extra"); unknown or broken rows are left out.</summary>
    public static (string? Title, List<Offer> Offers) Parse(string html)
    {
        var list = new List<Offer>();
        var title = Regex.Match(html, "<title>([^<]{1,300})</title>") is { Success: true } tm ? System.Net.WebUtility.HtmlDecode(tm.Groups[1].Value).Trim() : null;
        var start = html.IndexOf("<script id=\"aks-offers-js-extra\">", StringComparison.Ordinal);
        if (start < 0) return (title, list);
        var brace = html.IndexOf('{', start);
        var end = html.IndexOf("</script>", start, StringComparison.Ordinal);
        if (brace < 0 || end < brace) return (title, list);
        try
        {
            var reader = new Utf8JsonReader(System.Text.Encoding.UTF8.GetBytes(html[brace..end]), new JsonReaderOptions { AllowTrailingCommas = true });
            using var doc = JsonDocument.ParseValue(ref reader);
            var r = doc.RootElement;
            if (!r.TryGetProperty("prices", out var prices) || prices.ValueKind != JsonValueKind.Array) return (title, list);
            r.TryGetProperty("merchants", out var merchants);
            r.TryGetProperty("editions", out var editions);
            r.TryGetProperty("regions", out var regions);
            static string? S(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            static double? D(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) && d >= 0 && d < 100_000 ? d : null;
            static bool B(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) && (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) && i == 1));
            static JsonElement Sub(JsonElement e, string? k) => k != null && e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) ? v : default;
            static string Id(JsonElement e, string k) => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(k, out var v) ? (v.ValueKind == JsonValueKind.Number ? v.GetRawText() : v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "") : "";
            static string Cut(string s, int n) => s.Length > n ? s[..n] : s;
            foreach (var p in prices.EnumerateArray().Take(400))
            {
                var price = D(p, "price");
                var shop = S(p, "merchantName");
                if (price is null || string.IsNullOrWhiteSpace(shop)) continue;
                var m = Sub(merchants, Id(p, "merchant"));
                var rating = Sub(m, "rating");
                var region = Sub(regions, Id(p, "region"));
                var fees = new[] { D(p, "pricePaypal"), D(p, "priceCard") }.Where(x => x != null).Select(x => x!.Value).DefaultIfEmpty(-1).Min();
                var before = D(p, "originalPrice");
                list.Add(new Offer(
                    Cut(shop.Trim(), 60),
                    B(p, "isOfficial") || B(m, "official"),
                    D(rating, "count") is > 0 ? D(rating, "score") : null,
                    (int)(D(rating, "count") ?? 0),
                    Cut(S(Sub(editions, Id(p, "edition")), "name") ?? "Unbekannte Edition", 80),
                    Cut(S(region, "region_name") ?? S(region, "filter_name") ?? "Unbekannte Region", 60),
                    S(region, "region_short_description") is { Length: > 0 } rn ? Cut(rn, 300) : null,
                    S(p, "activationPlatform") is { Length: > 0 } pl ? Cut(pl, 30) : null,
                    Math.Round(price.Value, 2),
                    fees >= 0 ? Math.Round(fees, 2) : null,
                    before is { } b && b > price + 0.004 ? Math.Round(b, 2) : null,
                    S(p, "voucher_code") is { Length: > 0 and <= 40 } v ? v : null,
                    B(p, "account"),
                    B(p, "dispo")));
            }
        }
        catch (JsonException) { }
        list.Sort((a, b) => (a.PriceWithFees ?? a.Price).CompareTo(b.PriceWithFees ?? b.Price));
        return (title, list);
    }

    public void Dispose() { _http.Dispose(); _one.Dispose(); }
}
