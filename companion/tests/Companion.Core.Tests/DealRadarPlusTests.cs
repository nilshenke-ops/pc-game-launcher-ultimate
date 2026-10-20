using System.Net;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class DealRadarPlusTests
{
    /// <summary>Answers shaped like the real Steam and Microsoft Store endpoints (checked against the live services).</summary>
    sealed class Stores : HttpMessageHandler
    {
        public List<string> Wishlist = new() { "1245620", "730" };
        public List<string> Urls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.ToString();
            lock (Urls) Urls.Add(u);
            string body;
            if (u.Contains("/IWishlistService/GetWishlist")) body = Wishlist.Count == 0 ? "{\"response\":{}}" : "{\"response\":{\"items\":[" + string.Join(",", Wishlist.Select(a => $"{{\"appid\":{a},\"priority\":1}}")) + "]}}";
            else if (u.Contains("/IStoreBrowseService/GetItems")) body = "{\"response\":{\"store_items\":[{\"appid\":1245620,\"name\":\"ELDEN RING\"},{\"appid\":730,\"name\":\"Counter-Strike 2\"}]}}";
            else if (u.Contains("/api/storesearch") && u.ToLowerInvariant().Contains("minecraft")) body = "{\"total\":3,\"items\":[{\"type\":\"app\",\"name\":\"Minecraft Dungeons II\",\"id\":1912410},{\"type\":\"app\",\"name\":\"Minecraft Dungeons\",\"id\":1672970},{\"type\":\"app\",\"name\":\"Minecraft Legends\",\"id\":1928870}]}";
            else if (u.Contains("/api/storesearch")) body = u.ToLowerInvariant().Contains("forza") ? "{\"total\":2,\"items\":[{\"type\":\"app\",\"name\":\"Forza Horizon 4\",\"id\":1293830},{\"type\":\"app\",\"name\":\"Forza Horizon 5\",\"id\":1551360}]}" : "{\"total\":0,\"items\":[]}";
            else if (u.Contains("/api/appdetails")) { var id = System.Web.HttpUtility.ParseQueryString(r.RequestUri.Query)["appids"]!; body = $"{{\"{id}\":{{\"success\":true,\"data\":{{\"price_overview\":{{\"currency\":\"EUR\",\"initial\":5999,\"final\":2999,\"discount_percent\":50}}}}}}}}"; }
            else if (u.Contains("/productFamilies/autosuggest")) body = "{\"Results\":[{\"ProductFamilyName\":\"Games\",\"Products\":[{\"ProductId\":\"9MTLKM2DJMZ2\",\"Type\":\"Game\",\"Title\":\"Forza Horizon 5 Premium Edition\"},{\"ProductId\":\"9NKX70BBCDRN\",\"Type\":\"Game\",\"Title\":\"Forza Horizon 5 Standard Edition\"},{\"ProductId\":\"9OTHER\",\"Type\":\"Game\",\"Title\":\"Forza Motorsport\"},{\"ProductId\":\"9MZ0SR207MG8\",\"Type\":\"Game\",\"Title\":\"Forza Horizon 5 – Premium Add-ons-Bundle\"},{\"ProductId\":\"9P7V09FQ5C56\",\"Type\":\"Game\",\"Title\":\"Forza Horizon 5 Upgrade\"}]}]}";
            else if (u.Contains("/v7.0/products")) body = """
                {"Products":[
                 {"ProductId":"9MTLKM2DJMZ2","ProductKind":"Game","LocalizedProperties":[{"ProductTitle":"Forza Horizon 5 Premium Edition"}],"DisplaySkuAvailabilities":[{"Availabilities":[{"Actions":["Details","Purchase"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":99.99,"MSRP":99.99}}},{"Actions":["Details","Purchase"],"RemediationRequired":true,"Remediations":[{"Type":"Upsell"}],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":9.99,"MSRP":99.99}}}]}]},
                 {"ProductId":"9MZ0SR207MG8","ProductKind":"Game","LocalizedProperties":[{"ProductTitle":"Forza Horizon 5 – Premium Add-ons-Bundle"}],"MarketProperties":[{"RelatedProducts":[{"RelationshipType":"SellableBy","RelatedProductId":"9NNX1VVR3KNQ"}]}],"DisplaySkuAvailabilities":[{"Availabilities":[{"Actions":["Purchase"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":19.99,"MSRP":49.99}}}]}]},
                 {"ProductId":"9P7V09FQ5C56","ProductKind":"Game","LocalizedProperties":[{"ProductTitle":"Forza Horizon 5 Upgrade"}],"DisplaySkuAvailabilities":[{"Availabilities":[{"Actions":["Purchase"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":4.99,"MSRP":4.99}}}]}]},
                 {"ProductId":"9NKX70BBCDRN","ProductKind":"Game","LocalizedProperties":[{"ProductTitle":"Forza Horizon 5 Standard Edition","Images":[{"ImagePurpose":"Screenshot","Uri":"//store-images.s-microsoft.com/image/shot"},{"ImagePurpose":"SuperHeroArt","Uri":"//store-images.s-microsoft.com/image/hero"}]}],"DisplaySkuAvailabilities":[{"Availabilities":[{"Actions":["Details","Redeem"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":0.0,"MSRP":0.0}}},{"Actions":["Details","Purchase"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":27.99,"MSRP":69.99}}}]}]},
                 {"ProductId":"9OTHER","ProductKind":"Game","LocalizedProperties":[{"ProductTitle":"Forza Motorsport"}],"DisplaySkuAvailabilities":[{"Availabilities":[{"Actions":["Purchase"],"OrderManagementData":{"Price":{"CurrencyCode":"EUR","ListPrice":9.99,"MSRP":69.99}}}]}]}]}
                """;
            else return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotFound));
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body) });
        }
    }

    static DealService Make(TempDir dir, Stores s, string? steamId = "76561198000000001") =>
        new(new AppPaths(dir.Path), new NullHub(), s, timer: false) { StoreBase = "http://steam.test", ApiBase = "http://api.steam.test", MsBase = "http://ms.test", SteamId = () => steamId };

    [Fact]
    public async Task Typing_only_the_name_finds_the_game_and_compares_with_the_microsoft_store()
    {
        using var dir = new TempDir();
        var stores = new Stores();
        using var d = Make(dir, stores);
        d.Configure(true, "de", syncSteamWishlist: false);
        var w = await d.AddByNameAsync("forza horizon 5", null);
        Assert.Equal(("1551360", "Forza Horizon 5"), (w.SteamAppId, w.Title)); // exact name wins over the first hit (FH4)
        await d.CheckAllAsync(force: true);
        var item = d.Export().Items.Single();
        Assert.Equal(2999, item.FinalCents);
        Assert.Equal(2799, item.MsFinalCents);                         // cheapest buyable edition of the same game
        Assert.Equal("Forza Horizon 5 Standard Edition", item.MsTitle); // not "Forza Motorsport" for 9,99 €, no add-on bundle, no Game Pass member price
        Assert.Equal(6999, item.MsInitialCents);
        Assert.Equal("https://store-images.s-microsoft.com/image/hero", item.MsImage);
        Assert.Equal("conflict", (await Assert.ThrowsAsync<RpcException>(() => d.AddByNameAsync("Forza Horizon 5", null))).Code);
    }

    [Fact]
    public async Task Without_the_radar_switched_on_the_name_is_kept_and_matched_at_the_next_check()
    {
        using var dir = new TempDir();
        var stores = new Stores();
        using var d = Make(dir, stores);
        var w = await d.AddByNameAsync("Forza Horizon 5", 2500);
        Assert.Null(w.SteamAppId);
        Assert.Empty(stores.Urls); // radar off: not a single request
        d.Configure(true, "de", compareMicrosoft: false, syncSteamWishlist: false);
        await d.CheckAllAsync(force: true);
        Assert.Equal("1551360", d.Export().Items.Single().SteamAppId);
        Assert.DoesNotContain(stores.Urls, u => u.StartsWith("http://ms.test")); // Microsoft comparison switched off
    }

    [Fact]
    public async Task The_steam_wish_list_is_taken_over_and_left_entries_go_unless_they_were_edited()
    {
        using var dir = new TempDir();
        var stores = new Stores();
        using var d = Make(dir, stores);
        d.Configure(true, "de", compareMicrosoft: false);
        var r = await d.SyncWishlistAsync();
        Assert.Equal(new[] { "ELDEN RING", "Counter-Strike 2" }, d.Export().Items.Select(i => i.Title));
        var cs = d.Export().Items.Single(i => i.SteamAppId == "730");
        d.Save(new WishItem { Id = d.Export().Items.Single(i => i.SteamAppId == "1245620").Id, Title = "ELDEN RING", SteamAppId = "1245620", TargetCents = 3000 }); // own target set

        stores.Wishlist = new() { "999" }; // both left the Steam wish list
        await d.SyncWishlistAsync();
        var titles = d.Export().Items.Select(i => i.SteamAppId).ToList();
        Assert.Contains("1245620", titles);   // kept: target price set here
        Assert.DoesNotContain("730", titles); // removed: came from Steam, untouched

        stores.Wishlist = new();
        await d.SyncWishlistAsync();
        Assert.Contains("nicht öffentlich", d.Export().WishlistError);
    }

    [Fact]
    public async Task Without_a_steam_account_the_wish_list_says_how_to_connect()
    {
        using var dir = new TempDir();
        using var d = Make(dir, new Stores(), steamId: null);
        Assert.Equal("not-configured", (await Assert.ThrowsAsync<RpcException>(() => d.SyncWishlistAsync())).Code);
    }

    [Fact]
    public async Task Minecraft_is_not_turned_into_Minecraft_Dungeons_because_it_is_not_sold_on_Steam()
    {
        using var dir = new TempDir();
        var stores = new Stores();
        using var d = Make(dir, stores);
        d.Configure(true, "de", compareMicrosoft: false, syncSteamWishlist: false);
        var w = await d.AddByNameAsync("Minecraft", null);
        Assert.Null(w.SteamAppId);
        Assert.Equal("Minecraft", w.Title);
        Assert.Equal(DealService.NotOnSteam, d.Export().Items.Single().Error);
        Assert.True(DealService.SameGame("Forza Horizon 5", "Forza Horizon 5 Premium Edition"));
        Assert.True(DealService.SameGame("Minecraft", "Minecraft: Java & Bedrock Edition for PC"));
        Assert.False(DealService.SameGame("Minecraft", "Minecraft Legends"));
        Assert.False(DealService.SameGame("Elden Ring", "ELDEN RING NIGHTREIGN"));
        Assert.False(DealService.SameGame("Forza Horizon 5", "Forza Horizon 5 – Premium Add-ons-Bundle"));
    }
}
