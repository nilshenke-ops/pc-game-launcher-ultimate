using System.Net;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>GG.deals price API (official, own key): key shop and store prices next to Steam / Microsoft Store.</summary>
public class GgDealsTests
{
    /// <summary>Answers shaped like api.gg.deals/v1/prices/by-steam-app-id (fields as documented by GG.deals' examples).</summary>
    sealed class Gg : HttpMessageHandler
    {
        public string Key = "good-key-1234567890";
        public string Keyshop = "18.50";
        public List<string> Urls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.ToString();
            lock (Urls) Urls.Add(u);
            if (u.Contains("/api/appdetails")) { var id = System.Web.HttpUtility.ParseQueryString(r.RequestUri.Query)["appids"]!; return Ok($"{{\"{id}\":{{\"success\":true,\"data\":{{\"price_overview\":{{\"currency\":\"EUR\",\"initial\":2899,\"final\":2899,\"discount_percent\":0}}}}}}}}"); }
            if (!u.Contains("/v1/prices/by-steam-app-id/")) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            var q = System.Web.HttpUtility.ParseQueryString(r.RequestUri.Query);
            if (q["key"] != Key) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("{\"success\":false,\"data\":{\"name\":\"Unauthorized\",\"message\":\"Invalid API key\",\"code\":401,\"status\":401}}") });
            var parts = q["ids"]!.Split(',').Select(id => id switch
            {
                "1145350" => $$$"""
                    "1145350":{"title":"Hades II","url":"https://gg.deals/game/hades-ii/","prices":{"currentRetail":"28.99","currentKeyshops":"{{{Keyshop}}}","historicalRetail":"22.99","historicalKeyshops":15.99,"currency":"EUR"}}
                    """,
                "620" => """ "620":{"title":"Portal 2","url":"https://gg.deals/game/portal-2/","prices":{"currentRetail":"9.75","currentKeyshops":null,"historicalRetail":"0.99","historicalKeyshops":null,"currency":"EUR"}} """,
                _ => $"\"{id}\":null",
            });
            return Ok("{\"success\":true,\"data\":{" + string.Join(",", parts) + "}}");
        }
        static Task<HttpResponseMessage> Ok(string body) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
    }

    [Fact]
    public async Task Key_shop_and_store_prices_come_from_gg_deals_and_unknown_games_say_so()
    {
        using var dir = new TempDir();
        var gg = new Gg();
        string? key = null;
        var told = new List<string>();
        using var d = new DealService(new AppPaths(dir.Path), new NullHub(), gg, timer: false) { StoreBase = "http://steam.test", GgBase = "http://gg.test", GgDealsKey = () => key, TargetReached = (t, x) => told.Add(t + " | " + x) };
        d.Configure(true, "de", compareMicrosoft: false, syncSteamWishlist: false);
        d.Save(new WishItem { Title = "Hades II", SteamAppId = "1145350", TargetCents = 2000 });
        d.Save(new WishItem { Title = "Portal 2", SteamAppId = "620" });
        d.Save(new WishItem { Title = "Unbekannt", SteamAppId = "999999" });

        await d.CheckAllAsync(force: true);
        Assert.DoesNotContain(gg.Urls, u => u.Contains("gg.test"));               // no key: no request to GG.deals at all
        Assert.Null(d.Export().Items[0].GgKeyshopCents);

        Assert.NotNull(await d.TestGgKeyAsync("wrong-key-1234567890", "de"));     // a wrong key is refused before it is stored
        Assert.Null(await d.TestGgKeyAsync(gg.Key, "de"));
        key = gg.Key;
        await d.CheckAllAsync(force: true);
        var items = d.Export().Items;
        var hades = items.Single(i => i.SteamAppId == "1145350");
        Assert.Equal((1850, 2899, 1599, 2299, "EUR"), (hades.GgKeyshopCents!.Value, hades.GgRetailCents!.Value, hades.GgKeyshopLowCents!.Value, hades.GgRetailLowCents!.Value, hades.GgCurrency));
        Assert.Equal("https://gg.deals/game/hades-ii/", hades.GgUrl);
        Assert.Contains(gg.Urls, u => u.Contains("region=de") && u.Contains("ids=1145350,620,999999"));
        var portal = items.Single(i => i.SteamAppId == "620");
        Assert.Equal((975, (int?)null), (portal.GgRetailCents!.Value, portal.GgKeyshopCents));   // no key shop offer: no price invented
        Assert.Contains("kennt dieses Spiel nicht", items.Single(i => i.SteamAppId == "999999").GgError);

        // Target 20 € reached in a key shop (18,50 €) → told once; again only after a further drop.
        Assert.Single(told, t => t.Contains("Key-Shop") && t.Contains("Hades II") && t.Contains("18,50"));
        await d.CheckAllAsync(force: true);
        Assert.Single(told, t => t.Contains("Key-Shop"));
        gg.Keyshop = "17.10";
        await d.CheckAllAsync(force: true);
        Assert.Equal(2, told.Count(t => t.Contains("Key-Shop")));

        // Key revoked at GG.deals: the reason is shown, old prices are not presented as new.
        gg.Key = "rotated-key-1234567890";
        await d.CheckAllAsync(force: true);
        Assert.Contains("Invalid API key", d.Export().Items[0].GgError);
    }

    [Fact]
    public void Prices_are_read_as_text_or_number_and_nonsense_is_ignored()
    {
        using var doc = System.Text.Json.JsonDocument.Parse("""{"a":"18.50","b":9.99,"c":null,"d":"gratis","e":-1,"f":"1234567"}""");
        var r = doc.RootElement;
        Assert.Equal(1850, DealService.GgCents(r, "a"));
        Assert.Equal(999, DealService.GgCents(r, "b"));
        Assert.Null(DealService.GgCents(r, "c"));
        Assert.Null(DealService.GgCents(r, "d"));
        Assert.Null(DealService.GgCents(r, "e"));
        Assert.Null(DealService.GgCents(r, "f"));
        Assert.Null(DealService.GgCents(r, "missing"));
    }
}
