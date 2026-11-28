using System.Net;
using System.Text;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class PriceLookupTests
{
    // ---------------------------------------------------------------- which addresses may be loaded
    [Theory]
    [InlineData("93.184.216.34", true)] [InlineData("8.8.8.8", true)] [InlineData("2606:4700:4700::1111", true)]
    [InlineData("127.0.0.1", false)] [InlineData("10.1.2.3", false)] [InlineData("172.16.0.1", false)] [InlineData("172.31.255.255", false)] [InlineData("192.168.178.1", false)]
    [InlineData("169.254.169.254", false)] [InlineData("100.64.0.1", false)] [InlineData("0.0.0.0", false)] [InlineData("224.0.0.1", false)] [InlineData("255.255.255.255", false)]
    [InlineData("::1", false)] [InlineData("::", false)] [InlineData("fe80::1", false)] [InlineData("fc00::1", false)] [InlineData("fd12:3456::1", false)] [InlineData("ff02::1", false)]
    [InlineData("::ffff:127.0.0.1", false)] [InlineData("::ffff:192.168.1.1", false)] [InlineData("::ffff:8.8.8.8", true)] [InlineData("2002:c0a8:0101::1", false)] [InlineData("64:ff9b::7f00:1", false)]
    public void Only_public_internet_addresses_are_allowed(string ip, bool ok) => Assert.Equal(ok, PriceLookupService.IsPublic(IPAddress.Parse(ip)));

    [Theory]
    [InlineData("https://www.shop.de/a/b?x=1", true)] [InlineData("http://shop.de/a", true)]
    [InlineData("ftp://shop.de/a", false)] [InlineData("file:///etc/passwd", false)] [InlineData("javascript:alert(1)", false)] [InlineData("gopher://shop.de", false)]
    [InlineData("http://127.0.0.1/", false)] [InlineData("http://[::1]/", false)] [InlineData("http://192.168.1.10/admin", false)] [InlineData("http://2130706433/", false)]
    [InlineData("http://localhost/", false)] [InlineData("http://router.local/", false)] [InlineData("http://nas.lan/", false)] [InlineData("http://printer/", false)] [InlineData("http://host.internal/", false)]
    [InlineData("https://shop.de:8443/a", false)] [InlineData("http://shop.de:22/", false)] [InlineData("https://user:pw@shop.de/", false)] [InlineData("", false)] [InlineData("shop.de/a", false)]
    public void Only_ordinary_shop_links_are_loaded(string url, bool ok) => Assert.Equal(ok, PriceLookupService.CheckUrl(url, out _) != null);

    // ---------------------------------------------------------------- what a page says
    [Theory]
    [InlineData("29.99", 2999)] [InlineData("29,99", 2999)] [InlineData("1.299,00", 129900)] [InlineData("1,299.50", 129950)] [InlineData("1299", 129900)] [InlineData("1.299", 129900)] [InlineData("12,5", 1250)] [InlineData("€ 49,95", 4995)] [InlineData("0", 0)]
    public void Amounts_are_read_in_german_and_english_style(string raw, long cents) => Assert.Equal(cents, PriceParser.ParseAmount(raw));

    [Theory] [InlineData("")] [InlineData("abc")] [InlineData("-5")] [InlineData("ab 12")] [InlineData("99999999999")] [InlineData(null)]
    public void No_price_is_made_up(string? raw) => Assert.Null(PriceParser.ParseAmount(raw));

    [Fact]
    public void Reads_the_product_data_json_ld()
    {
        var p = PriceParser.Parse("""<html><head><title>Shop</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Sony WH-1000XM5 &amp; Etui","offers":{"@type":"Offer","price":"299.99","priceCurrency":"EUR"}}</script></head></html>""");
        Assert.Equal(29999, p.PriceCents); Assert.Equal("EUR", p.Currency); Assert.Equal("Sony WH-1000XM5 & Etui", p.Title); Assert.Contains("schema.org", p.Source); Assert.False(p.Multiple);
    }

    [Fact]
    public void Reads_a_graph_a_list_of_types_numbers_and_the_lowest_of_several_offers()
    {
        var p = PriceParser.Parse("""<script type='application/ld+json'>{"@graph":[{"@type":"WebPage","name":"x"},{"@type":["Product","Thing"],"name":"Lego","offers":[{"@type":"Offer","price":59.9,"priceCurrency":"EUR"},{"@type":"Offer","price":"49,95","priceCurrency":"EUR"}]}]}</script>""");
        Assert.Equal(4995, p.PriceCents); Assert.True(p.Multiple); Assert.Contains("mehrere Preise", p.Note); Assert.Equal("Lego", p.Title);
        var agg = PriceParser.Parse("""<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"AggregateOffer","lowPrice":"10.00","highPrice":"20.00","priceCurrency":"USD"}}</script>""");
        Assert.Equal(1000, agg.PriceCents); Assert.Equal("USD", agg.Currency);
        var spec = PriceParser.Parse("""<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"@type":"Offer","priceSpecification":{"price":"7.50","priceCurrency":"EUR"}}}</script>""");
        Assert.Equal(750, spec.PriceCents);
    }

    [Fact]
    public void Falls_back_to_open_graph_and_microdata_and_skips_broken_blocks()
    {
        var og = PriceParser.Parse("""<head><meta property="og:title" content="Buch &quot;Winter&quot;"><meta property="product:price:amount" content="14,50"><meta property="product:price:currency" content="eur"></head>""");
        Assert.Equal(1450, og.PriceCents); Assert.Equal("EUR", og.Currency); Assert.Equal("Buch \"Winter\"", og.Title); Assert.Contains("Open Graph", og.Source);
        var micro = PriceParser.Parse("""<div itemscope itemtype="https://schema.org/Product"><meta itemprop="priceCurrency" content="EUR"><span itemprop="price" content="89.00">89,00 €</span></div><title>Kopfhörer</title>""");
        Assert.Equal(8900, micro.PriceCents); Assert.Equal("Kopfhörer", micro.Title);
        var broken = PriceParser.Parse("""<script type="application/ld+json">{ kaputt </script><meta property="og:price:amount" content="5.00">""");
        Assert.Equal(500, broken.PriceCents);
    }

    [Fact]
    public void A_page_without_product_data_says_so_instead_of_guessing()
    {
        var p = PriceParser.Parse("<html><head><title>Irgendeine Seite</title></head><body>Jetzt nur 19,99 € – Aktion!</body></html>");
        Assert.Null(p.PriceCents); Assert.Contains("selbst eintragen", p.Note); Assert.Equal("Irgendeine Seite", p.Title);   // the price in the visible text is NOT taken
    }

    // ---------------------------------------------------------------- loading
    sealed class Fake(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public readonly List<Uri> Seen = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) { Seen.Add(r.RequestUri!); return Task.FromResult(answer(r)); }
    }
    static HttpResponseMessage Html(string body, string type = "text/html") => new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, type) };
    static Task<IPAddress[]> Dns(string host, CancellationToken _) => Task.FromResult(new[] { IPAddress.Parse(host.StartsWith("intern") ? "10.0.0.5" : "93.184.216.34") });
    const string Product = """<script type="application/ld+json">{"@type":"Product","name":"Ding","offers":{"price":"12.34","priceCurrency":"EUR"}}</script>""";

    [Fact]
    public async Task Loads_a_product_page_and_keeps_the_answer_for_a_while()
    {
        var f = new Fake(_ => Html(Product)); using var s = new PriceLookupService(f, Dns);
        var r = await s.LookupAsync("https://www.shop.example/ding");
        Assert.Equal(1234, r.PriceCents); Assert.Equal("Ding", r.Title); Assert.Equal("shop.example", r.Host); Assert.Equal("EUR", r.Currency);
        await s.LookupAsync("https://www.shop.example/ding");
        Assert.Single(f.Seen);                                                  // the second answer came from the memory
    }

    [Fact]
    public async Task Never_loads_what_is_inside_the_home_network()
    {
        var f = new Fake(_ => Html(Product)); using var s = new PriceLookupService(f, Dns);
        foreach (var bad in new[] { "http://127.0.0.1/", "http://192.168.1.1/", "http://localhost/x", "http://intern.shop.example/a" })     // the last one only resolves to a private address
            await Assert.ThrowsAsync<RpcException>(() => s.LookupAsync(bad));
        Assert.Empty(f.Seen);
    }

    [Fact]
    public async Task A_redirect_into_the_home_network_is_refused_and_a_normal_redirect_is_followed()
    {
        var f = new Fake(r => r.RequestUri!.Host == "shop.example" && r.RequestUri.AbsolutePath == "/start"
            ? new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("https://intern.shop.example/steal") } }
            : r.RequestUri.AbsolutePath == "/a" ? new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("/b", UriKind.Relative) } } : Html(Product));
        using var s = new PriceLookupService(f, Dns);
        await Assert.ThrowsAsync<RpcException>(() => s.LookupAsync("https://shop.example/start"));
        Assert.DoesNotContain(f.Seen, u => u.Host.StartsWith("intern"));
        Assert.Equal(1234, (await s.LookupAsync("https://shop.example/a")).PriceCents);                                                    // /a → /b
        var loop = new Fake(r => new HttpResponseMessage(HttpStatusCode.Found) { Headers = { Location = new Uri("/again", UriKind.Relative) } });
        using var s2 = new PriceLookupService(loop, Dns);
        await Assert.ThrowsAsync<RpcException>(() => s2.LookupAsync("https://shop.example/loop"));
        Assert.Equal(PriceLookupService.MaxRedirects + 1, loop.Seen.Count);                                                                // stops after 4 redirects
    }

    [Fact]
    public async Task Says_what_went_wrong_when_a_shop_refuses_or_sends_something_else()
    {
        using var s = new PriceLookupService(new Fake(r => r.RequestUri!.AbsolutePath == "/403" ? new HttpResponseMessage(HttpStatusCode.Forbidden) : r.RequestUri.AbsolutePath == "/img" ? Html("x", "image/png") : Html("<html></html>")), Dns);
        Assert.Contains("selbst eintragen", (await Assert.ThrowsAsync<RpcException>(() => s.LookupAsync("https://shop.example/403"))).Message);
        Assert.Contains("keine Webseite", (await Assert.ThrowsAsync<RpcException>(() => s.LookupAsync("https://shop.example/img"))).Message);
        var empty = await s.LookupAsync("https://shop.example/leer");
        Assert.Null(empty.PriceCents); Assert.NotNull(empty.Note);
    }

    [Fact]
    public async Task Reads_only_the_first_part_of_a_huge_page_and_limits_the_requests()
    {
        var big = new Fake(_ => Html(Product + new string('x', PriceLookupService.MaxBytes * 2)));
        using var s = new PriceLookupService(big, Dns);
        Assert.Equal(1234, (await s.LookupAsync("https://shop.example/gross")).PriceCents);     // the product data is at the start, the rest is not read
        using var s2 = new PriceLookupService(new Fake(_ => Html(Product)), Dns);
        for (var i = 0; i < PriceLookupService.PerMinute; i++) await s2.LookupAsync($"https://shop.example/p{i}");
        await Assert.ThrowsAsync<RpcException>(() => s2.LookupAsync("https://shop.example/zu-viel"));
    }
}
