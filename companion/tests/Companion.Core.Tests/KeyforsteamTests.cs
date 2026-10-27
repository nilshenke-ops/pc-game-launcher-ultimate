using System.Net;
using System.Text.Json;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class KeyforsteamTests
{
    // Hand-written page in the shape keyforsteam.de embeds its offer table (script "aks-offers-js-extra").
    const string Page = """
        <html><head><title>Elden Ring Key kaufen Preisvergleich</title></head><body>
        <script id="aks-offers-js-extra"> var gamePageTrans = {"isAccPage":"","merchants":{"61":{"name":"G2A","rating":{"score":4.2,"count":300,"maximum":5},"official":false},
          "1":{"name":"Steam","rating":{"score":4.7,"count":40,"maximum":5},"official":true}},
          "editions":{"1":{"name":"Standard"},"7":{"name":"Deluxe"}},
          "regions":{"9":{"region_name":"EUROPA","region_short_description":"EU Steam CD Key."},"412":{"region_name":"KONTO"}},
          "prices":[
            {"merchant":61,"merchantName":"G2A","isOfficial":false,"edition":"1","region":"9","price":22.92,"originalPrice":22.92,"pricePaypal":23.25,"priceCard":23.40,"dispo":1,"account":false,"activationPlatform":"steam"},
            {"merchant":61,"merchantName":"G2A","isOfficial":false,"edition":"1","region":"412","price":19.5,"originalPrice":22.0,"voucher_code":"allkeyshop","pricePaypal":19.5,"priceCard":19.5,"dispo":1,"account":true,"activationPlatform":"steam"},
            {"merchant":1,"merchantName":"Steam","isOfficial":true,"edition":"7","region":"2","price":79.99,"dispo":1,"account":false,"activationPlatform":"steam"},
            {"merchant":5,"merchantName":"","price":1},
            {"merchant":6,"merchantName":"Kaputt","price":"x"}
          ]};
        </script></body></html>
        """;

    sealed class Site(string body, HttpStatusCode code = HttpStatusCode.OK) : HttpMessageHandler
    {
        public List<string> Asked { get; } = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Asked.Add(r.RequestUri!.AbsolutePath);
            return Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body) });
        }
    }

    static JsonElement Json(object o) => JsonSerializer.SerializeToElement(o, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    [Fact]
    public void Offers_are_read_from_the_embedded_table_with_edition_region_and_account_flag()
    {
        var (title, offers) = KeyforsteamService.Parse(Page);
        Assert.Equal("Elden Ring Key kaufen Preisvergleich", title);
        Assert.Equal(3, offers.Count); // nameless and broken rows are left out
        var acc = offers[0];
        Assert.Equal(("G2A", "KONTO", true, "allkeyshop", 22.0), (acc.Shop, acc.Region, acc.Account, acc.Voucher, acc.PriceBeforeVoucher!.Value));
        var key = offers[1];
        Assert.Equal(("Standard", "EUROPA", false, 23.25, 4.2, 300), (key.Edition, key.Region, key.Official, key.PriceWithFees!.Value, key.ShopRating!.Value, key.ShopRatings));
        Assert.Null(key.PriceBeforeVoucher);
        var steam = offers[2];
        Assert.True(steam.Official);
        Assert.Equal("Deluxe", steam.Edition);
        Assert.Equal("Unbekannte Region", steam.Region); // region 2 is not in the table – not guessed
        Assert.Empty(KeyforsteamService.Parse("<html>kein Angebot</html>").Offers);
    }

    [Fact]
    public void Only_game_pages_of_keyforsteam_are_fetched()
    {
        using var k = new KeyforsteamService(new Site(Page));
        Assert.Equal("elden-ring", KeyforsteamService.Slug("ELDEN RING"));
        Assert.Equal("baldurs-gate-3", KeyforsteamService.Slug("Baldur's Gate 3"));
        Assert.Equal("pokemon-legenden-z-a", KeyforsteamService.Slug("Pokémon Legenden: Z-A"));
        Assert.Equal("/elden-ring-key-kaufen-preisvergleich/", k.PageFor("Elden Ring", null));
        Assert.Equal("/elden-ring-key-kaufen-preisvergleich/", k.PageFor(null, "https://www.keyforsteam.de/elden-ring-key-kaufen-preisvergleich/?x=1"));
        foreach (var bad in new[] { "https://evil.example/elden-ring-key-kaufen-preisvergleich/", "http://www.keyforsteam.de/elden-ring-key-kaufen-preisvergleich/",
                     "https://www.keyforsteam.de/wp-admin/", "https://www.keyforsteam.de/x-key-kaufen-preisvergleich/../../wp-admin/", "https://keyforsteam.de.evil.example/a-key-kaufen-preisvergleich/" })
            Assert.Throws<RpcException>(() => k.PageFor(null, bad));
        Assert.Throws<RpcException>(() => k.PageFor(" ", null));
    }

    [Fact]
    public async Task Requests_are_spaced_5_seconds_and_pages_are_cached()
    {
        var site = new Site(Page);
        var waits = new List<TimeSpan>();
        using var k = new KeyforsteamService(site) { Base = "https://kfs.test", Delay = t => { waits.Add(t); return Task.CompletedTask; } };
        var a = Json(await k.PricesAsync("Elden Ring", null));
        Assert.Equal("https://kfs.test/elden-ring-key-kaufen-preisvergleich/", a.GetProperty("url").GetString());
        Assert.Equal(3, a.GetProperty("offers").GetArrayLength());
        await k.PricesAsync("elden ring", null); // same page → from the cache, no request
        Assert.Single(site.Asked);
        Assert.Empty(waits);
        await k.PricesAsync("Hades", null); // next page right after → waits the rest of the 5 s
        Assert.Equal(2, site.Asked.Count);
        Assert.Single(waits);
        Assert.InRange(waits[0].TotalSeconds, 4, 5);
    }

    [Fact]
    public async Task Missing_page_and_empty_page_say_so()
    {
        using var gone = new KeyforsteamService(new Site("", HttpStatusCode.NotFound)) { Delay = _ => Task.CompletedTask };
        var e = await Assert.ThrowsAsync<RpcException>(() => gone.PricesAsync("Gibt es nicht", null));
        Assert.Equal("not-found", e.Code);
        using var empty = new KeyforsteamService(new Site("<html></html>")) { Delay = _ => Task.CompletedTask };
        Assert.Equal("unavailable", (await Assert.ThrowsAsync<RpcException>(() => empty.PricesAsync("Leer", null))).Code);
    }
}
