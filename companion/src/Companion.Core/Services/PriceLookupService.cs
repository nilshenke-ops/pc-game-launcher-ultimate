using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Reads the price (and the name) of a product from a shop page – for the Christmas wish list, only when the user asks for it.
/// The PC loads the page, because a browser may not read other websites. The price is read from what the page itself says about the product
/// (schema.org data as JSON-LD or microdata, or the Open-Graph price tags) – nothing is guessed from the visible text; a page without such
/// data (many shops that build the page in the browser, or that block automatic requests) answers "no price found".
///
/// Safety: this loads an address someone typed, so it never goes to the home network or the PC itself. Only http/https on the standard ports,
/// no address with user name or IP number, every redirect checked again (at most 4), the connection itself only to public addresses (checked
/// when it is made, so a changed DNS answer cannot lead inside), no cookies, no sign-in data, 10 s, at most 1.5 MB, only HTML, at most 2 at a time
/// and 30 per minute, every answer kept for 30 minutes.
/// </summary>
public sealed class PriceLookupService : IDisposable
{
    public const int MaxBytes = 1_500_000, MaxRedirects = 4, PerMinute = 30;
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(30), Timeout = TimeSpan.FromSeconds(10);

    public sealed record Result(string Url, string Host, string? Title, long? PriceCents, string? Currency, string? Source, string? Note, bool Multiple, string ReadAt);

    readonly HttpClient _http;
    readonly SemaphoreSlim _slots = new(2, 2);
    readonly Dictionary<string, (DateTime At, Result R)> _cache = new();
    readonly Queue<DateTime> _recent = new();
    readonly object _gate = new();
    readonly Func<string, CancellationToken, Task<IPAddress[]>> _resolve;

    /// <summary>For tests: an own handler and an own name lookup (the real one goes to the DNS and connects only to public addresses).</summary>
    public PriceLookupService(HttpMessageHandler? handler = null, Func<string, CancellationToken, Task<IPAddress[]>>? resolve = null)
    {
        _resolve = resolve ?? ((h, ct) => Dns.GetHostAddressesAsync(h, ct));
        _http = new HttpClient(handler ?? RealHandler(), disposeHandler: handler == null) { Timeout = Timeout };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; NexusWishlist/1.0)");
        _http.DefaultRequestHeaders.Accept.ParseAdd("text/html,application/xhtml+xml");
        _http.DefaultRequestHeaders.AcceptLanguage.ParseAdd("de-DE,de;q=0.9,en;q=0.5");
    }

    /// <summary>No proxy, no cookies, no automatic redirects; the connection is made here and only to a public address.</summary>
    static HttpMessageHandler RealHandler() => new SocketsHttpHandler
    {
        AllowAutoRedirect = false, UseCookies = false, UseProxy = false, AutomaticDecompression = DecompressionMethods.All,
        ConnectTimeout = TimeSpan.FromSeconds(6),
        ConnectCallback = async (ctx, ct) =>
        {
            var addrs = await Dns.GetHostAddressesAsync(ctx.DnsEndPoint.Host, ct);
            var ok = addrs.Where(IsPublic).ToArray();
            if (ok.Length == 0 || ok.Length != addrs.Length) throw new HttpRequestException("Adresse nicht erlaubt");
            var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try { await socket.ConnectAsync(ok, ctx.DnsEndPoint.Port, ct); return new NetworkStream(socket, ownsSocket: true); }
            catch { socket.Dispose(); throw; }
        },
    };

    // ------------------------------------------------------------------ what may be loaded
    /// <summary>A public internet address – not this PC, not the home network, not a special range.</summary>
    public static bool IsPublic(IPAddress ip)
    {
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        if (IPAddress.IsLoopback(ip) || ip.Equals(IPAddress.Any) || ip.Equals(IPAddress.IPv6Any) || ip.Equals(IPAddress.None)) return false;
        var b = ip.GetAddressBytes();
        if (ip.AddressFamily == AddressFamily.InterNetwork)
            return !(b[0] == 0 || b[0] == 10 || b[0] >= 224 || (b[0] == 100 && b[1] >= 64 && b[1] <= 127) || (b[0] == 169 && b[1] == 254) || (b[0] == 172 && b[1] >= 16 && b[1] <= 31)
                || (b[0] == 192 && b[1] == 168) || (b[0] == 192 && b[1] == 0 && b[2] == 0) || (b[0] == 192 && b[1] == 0 && b[2] == 2) || (b[0] == 198 && (b[1] == 18 || b[1] == 19))
                || (b[0] == 198 && b[1] == 51 && b[2] == 100) || (b[0] == 203 && b[1] == 0 && b[2] == 113));
        if (ip.AddressFamily != AddressFamily.InterNetworkV6) return false;
        if (ip.IsIPv6LinkLocal || ip.IsIPv6SiteLocal || ip.IsIPv6Multicast || ip.IsIPv6UniqueLocal) return false;
        if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0d && b[3] == 0xb8) return false;                 // documentation range
        if (b[0] == 0x20 && b[1] == 0x02) return IsPublic(new IPAddress(new[] { b[2], b[3], b[4], b[5] })); // 6to4: the IPv4 inside decides
        if (b[0] == 0 && b[1] == 0x64 && b[2] == 0xff && b[3] == 0x9b && b[4] == 0 && b[5] == 0 && b[6] == 0 && b[7] == 0 && b[8] == 0 && b[9] == 0 && b[10] == 0 && b[11] == 0)
            return IsPublic(new IPAddress(new[] { b[12], b[13], b[14], b[15] }));                         // NAT64
        return true;
    }

    /// <summary>The address to load, or a reason why not. Names only (no IP numbers), standard ports, no sign-in data.</summary>
    public static Uri? CheckUrl(string raw, out string? why)
    {
        why = null;
        if (!Uri.TryCreate((raw ?? "").Trim(), UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https")) { why = "Das ist kein Link (nur http und https)."; return null; }
        if (!string.IsNullOrEmpty(u.UserInfo)) { why = "Links mit Benutzername oder Passwort werden nicht geladen."; return null; }
        if (!u.IsDefaultPort) { why = "Nur Links mit der üblichen Adresse (ohne eigenen Port) werden geladen."; return null; }
        var h = u.IdnHost.ToLowerInvariant().TrimEnd('.');
        if (h.Length == 0 || !h.Contains('.') || IPAddress.TryParse(h.Trim('[', ']'), out _) || h is "localhost" || h.EndsWith(".local") || h.EndsWith(".localhost") || h.EndsWith(".internal")
            || h.EndsWith(".lan") || h.EndsWith(".home") || h.EndsWith(".home.arpa") || h.EndsWith(".intranet") || h.EndsWith(".corp"))
        { why = "Diese Adresse liegt nicht im Internet und wird nicht geladen."; return null; }
        return u;
    }

    // ------------------------------------------------------------------ lookup
    public async Task<Result> LookupAsync(string url, CancellationToken ct = default)
    {
        var u = CheckUrl(url, out var why) ?? throw new RpcException("invalid-params", why!);
        var key = u.GetLeftPart(UriPartial.Path) + u.Query;
        lock (_gate)
        {
            if (_cache.TryGetValue(key, out var c) && DateTime.UtcNow - c.At < CacheFor) return c.R;
            var now = DateTime.UtcNow;
            while (_recent.Count > 0 && now - _recent.Peek() > TimeSpan.FromMinutes(1)) _recent.Dequeue();
            if (_recent.Count >= PerMinute) throw new RpcException("rate-limited", "Zu viele Preis-Abrufe – bitte kurz warten.");
            _recent.Enqueue(now);
        }
        await _slots.WaitAsync(ct);
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct); cts.CancelAfter(Timeout);
            var (html, final) = await FetchAsync(u, cts.Token);
            var p = PriceParser.Parse(html);
            var r = new Result(final.ToString(), final.IdnHost.StartsWith("www.") ? final.IdnHost[4..] : final.IdnHost,
                p.Title, p.PriceCents, p.Currency, p.Source, p.Note, p.Multiple, DateTime.UtcNow.ToString("o"));
            lock (_gate) { _cache[key] = (DateTime.UtcNow, r); if (_cache.Count > 200) foreach (var k in _cache.Where(x => DateTime.UtcNow - x.Value.At > CacheFor).Select(x => x.Key).ToList()) _cache.Remove(k); }
            return r;
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new RpcException("timeout", "Der Shop hat zu lange gebraucht."); }
        catch (HttpRequestException) { throw new RpcException("unavailable", "Die Seite konnte nicht geladen werden (nicht erreichbar oder blockiert)."); }
        finally { _slots.Release(); }
    }

    async Task<(string html, Uri final)> FetchAsync(Uri start, CancellationToken ct)
    {
        var u = start;
        for (var hop = 0; hop <= MaxRedirects; hop++)
        {
            // checked before every request, also after a redirect: the name must resolve to public addresses only
            var check = CheckUrl(u.ToString(), out var why) ?? throw new RpcException("invalid-params", hop == 0 ? why! : "Der Shop leitet auf eine Adresse weiter, die nicht geladen wird.");
            var addrs = await _resolve(check.IdnHost, ct);
            if (addrs.Length == 0 || addrs.Any(a => !IsPublic(a))) throw new RpcException("invalid-params", "Diese Adresse liegt nicht im Internet und wird nicht geladen.");
            using var req = new HttpRequestMessage(HttpMethod.Get, check);
            using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)res.StatusCode is >= 300 and < 400 && res.Headers.Location is { } loc) { u = loc.IsAbsoluteUri ? loc : new Uri(check, loc); continue; }
            if (!res.IsSuccessStatusCode) throw new RpcException("unavailable", $"Der Shop hat die Anfrage abgelehnt (Status {(int)res.StatusCode}). Viele Shops erlauben keine automatischen Abrufe – dann den Preis bitte selbst eintragen.");
            var type = res.Content.Headers.ContentType?.MediaType ?? "";
            if (!type.Contains("html", StringComparison.OrdinalIgnoreCase)) throw new RpcException("unavailable", "Unter dem Link liegt keine Webseite.");
            await using var s = await res.Content.ReadAsStreamAsync(ct);
            using var ms = new MemoryStream();
            var buf = new byte[16 * 1024]; int n;
            while ((n = await s.ReadAsync(buf, ct)) > 0) { ms.Write(buf, 0, n); if (ms.Length > MaxBytes) break; }   // only the first 1.5 MB are read
            var enc = Encoding.UTF8;
            try { if (res.Content.Headers.ContentType?.CharSet is { Length: > 0 } cs) enc = Encoding.GetEncoding(cs.Trim('"')); } catch (ArgumentException) { /* unknown: UTF-8 */ }
            return (enc.GetString(ms.GetBuffer(), 0, (int)ms.Length), check);
        }
        throw new RpcException("unavailable", "Zu viele Weiterleitungen.");
    }

    public void Dispose() { _http.Dispose(); _slots.Dispose(); }
}

/// <summary>What a shop page says about its product: name and price – read from its own product data, never from the visible text.</summary>
public static class PriceParser
{
    public sealed record Parsed(string? Title, long? PriceCents, string? Currency, string? Source, string? Note, bool Multiple);

    static readonly Regex Script = new(@"<script\b[^>]*type\s*=\s*[""']?application/ld\+json[""']?[^>]*>(.*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    static readonly Regex MetaTag = new(@"<meta\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Attr = new(@"([a-zA-Z:_-]+)\s*=\s*(?:""([^""]*)""|'([^']*)')", RegexOptions.Compiled);
    static readonly Regex ItemProp = new(@"<(?:meta|span|div|p|data|link)\b[^>]*itemprop\s*=\s*[""']price[""'][^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex TitleTag = new(@"<title[^>]*>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    public static Parsed Parse(string html)
    {
        var metas = MetaTag.Matches(html).Select(m => Attrs(m.Value)).ToList();
        string? Meta(params string[] names) => metas.Select(a => (k: (a.GetValueOrDefault("property") ?? a.GetValueOrDefault("name") ?? a.GetValueOrDefault("itemprop") ?? "").ToLowerInvariant(), v: a.GetValueOrDefault("content")))
            .FirstOrDefault(x => names.Contains(x.k) && !string.IsNullOrWhiteSpace(x.v)).v;
        string? title = null;
        var prices = new List<(long cents, string? cur)>();
        string? source = null;

        // 1) schema.org Product / Offer as JSON-LD
        foreach (Match m in Script.Matches(html))
        {
            try
            {
                using var doc = JsonDocument.Parse(WebUtility.HtmlDecode(m.Groups[1].Value).Trim());
                Walk(doc.RootElement, ref title, prices, 0);
            }
            catch (JsonException) { /* a block that is not valid JSON is skipped */ }
        }
        if (prices.Count > 0) source = "Produktdaten der Seite (schema.org)";

        // 2) Open-Graph / Facebook product tags
        if (prices.Count == 0 && ParseAmount(Meta("product:price:amount", "og:price:amount", "twitter:data1")) is { } og)
        { prices.Add((og, Meta("product:price:currency", "og:price:currency")?.Trim().ToUpperInvariant())); source = "Produktdaten der Seite (Open Graph)"; }

        // 3) microdata: itemprop="price"
        if (prices.Count == 0)
            foreach (Match m in ItemProp.Matches(html))
            {
                var a = Attrs(m.Value);
                if (ParseAmount(a.GetValueOrDefault("content")) is { } md) prices.Add((md, Meta("pricecurrency") ?? a.GetValueOrDefault("data-currency")));
            }
        if (prices.Count > 0 && source == null)
        {
            var cur = Regex.Match(html, @"itemprop\s*=\s*[""']priceCurrency[""'][^>]*content\s*=\s*[""']([A-Za-z]{3})[""']", RegexOptions.IgnoreCase);
            if (cur.Success && prices.All(p => p.cur == null)) prices = prices.Select(p => (p.cents, (string?)cur.Groups[1].Value.ToUpperInvariant())).ToList();
            source = "Produktdaten der Seite (Microdata)";
        }

        title ??= Meta("og:title", "twitter:title");
        if (string.IsNullOrWhiteSpace(title) && TitleTag.Match(html) is { Success: true } tm) title = tm.Groups[1].Value;
        title = Clean(title, 120);

        if (prices.Count == 0) return new Parsed(title, null, null, null, "Auf der Seite stehen keine Produktdaten mit Preis. Viele Shops bauen die Seite erst im Browser auf oder erlauben keine automatischen Abrufe – dann den Preis bitte selbst eintragen.", false);
        var distinct = prices.Select(p => p.cents).Distinct().Count();
        var best = prices.OrderBy(p => p.cents).First();
        var currency = best.cur is { Length: 3 } c ? c.ToUpperInvariant() : null;
        var note = distinct > 1 ? "Die Seite nennt mehrere Preise (zum Beispiel für Varianten) – hier steht der niedrigste. Bitte im Shop prüfen." : null;
        return new Parsed(title, best.cents, currency, source, note, distinct > 1);
    }

    static void Walk(JsonElement e, ref string? title, List<(long, string?)> prices, int depth)
    {
        if (depth > 12) return;
        switch (e.ValueKind)
        {
            case JsonValueKind.Array: foreach (var x in e.EnumerateArray()) Walk(x, ref title, prices, depth + 1); break;
            case JsonValueKind.Object:
                var isProduct = e.TryGetProperty("@type", out var t) && TypeIs(t, "Product", "ProductGroup", "Offer", "AggregateOffer");
                if (isProduct)
                {
                    if (title == null && e.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String) title = n.GetString();
                    ReadOffer(e, prices);
                    if (e.TryGetProperty("offers", out var offers))                      // the offers of a product count even without their own @type
                        foreach (var o in offers.ValueKind == JsonValueKind.Array ? offers.EnumerateArray() : new[] { offers }.AsEnumerable())
                            if (o.ValueKind == JsonValueKind.Object) { ReadOffer(o, prices); if (o.TryGetProperty("offers", out var inner)) Walk(inner, ref title, prices, depth + 1); }
                    if (e.TryGetProperty("hasVariant", out var hv)) Walk(hv, ref title, prices, depth + 1);
                }
                if (e.TryGetProperty("@graph", out var g)) Walk(g, ref title, prices, depth + 1);
                break;
        }
    }
    static bool TypeIs(JsonElement t, params string[] names) => t.ValueKind == JsonValueKind.String ? names.Contains(t.GetString()) : t.ValueKind == JsonValueKind.Array && t.EnumerateArray().Any(x => x.ValueKind == JsonValueKind.String && names.Contains(x.GetString()));
    static void ReadOffer(JsonElement e, List<(long, string?)> prices)
    {
        string? cur = e.TryGetProperty("priceCurrency", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        foreach (var name in new[] { "price", "lowPrice" })
        {
            if (!e.TryGetProperty(name, out var v)) continue;
            var cents = v.ValueKind == JsonValueKind.Number ? ParseAmount(v.GetRawText()) : v.ValueKind == JsonValueKind.String ? ParseAmount(v.GetString()) : null;
            if (cents != null) { prices.Add((cents.Value, cur)); return; }
        }
        if (e.TryGetProperty("priceSpecification", out var ps))
            foreach (var spec in ps.ValueKind == JsonValueKind.Array ? ps.EnumerateArray() : new[] { ps }.AsEnumerable())
                if (spec.ValueKind == JsonValueKind.Object) ReadOffer(spec, prices);
    }

    /// <summary>"29.99", "29,99", "1.299,00", "1,299.50", "1299", 29.9 → cents; null when it is no price (negative, text, absurdly large).</summary>
    public static long? ParseAmount(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        // only a number with an optional currency sign or code before or after it – no letters or signs in between, no minus
        var m = Regex.Match(raw.Trim(), @"^(?:[€$£]|EUR|USD|GBP)?\s*(\d[\d.,]*)\s*(?:[€$£]|EUR|USD|GBP)?$", RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        var s = m.Groups[1].Value;
        if (s.Length > 14) return null;
        var sep = Math.Max(s.LastIndexOf(','), s.LastIndexOf('.'));
        var decimals = sep >= 0 ? s.Length - sep - 1 : 0;
        s = sep >= 0 && decimals is >= 1 and <= 2 ? Regex.Replace(s[..sep], @"[.,]", "") + "." + s[(sep + 1)..] : Regex.Replace(s, @"[.,]", "");
        if (!decimal.TryParse(s, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var d) || d < 0 || d > 1_000_000m) return null;
        return (long)Math.Round(d * 100m, MidpointRounding.AwayFromZero);
    }

    static Dictionary<string, string> Attrs(string tag)
    {
        var d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in Attr.Matches(tag)) d[m.Groups[1].Value] = WebUtility.HtmlDecode(m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value);
        return d;
    }
    static string? Clean(string? s, int max)
    {
        if (s == null) return null;
        s = Regex.Replace(WebUtility.HtmlDecode(s), @"[\u0000-\u001f\u007f]|\s+", " ").Trim();
        return s.Length == 0 ? null : s.Length > max ? s[..max].TrimEnd() : s;
    }
}
