using System.Net;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>2.51: wish list fields (F11) and official Steam patch notes (F13).</summary>
public class InfosTests
{
    sealed class Handler(string body, HttpStatusCode code = HttpStatusCode.OK) : HttpMessageHandler
    {
        public readonly List<string> Urls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            Urls.Add(r.RequestUri!.ToString());
            return Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body) });
        }
    }

    const string News = """
    {"appnews":{"appid":730,"newsitems":[
      {"gid":"1847286114034398","title":"Counter-Strike 2 Update","url":"https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1847286114034398","author":"Vitaliy","contents":"[p]\\[ GAMEPLAY ][/p][list][*][p]Fixed a crash[/p][/*][/list]","date":1792709770,"feedname":"steam_community_announcements","tags":["patchnotes"]},
      {"gid":"2","title":"Sale","url":"http://not-https.example/x","contents":"x","date":1792709770},
      {"gid":"3","title":"  ","url":"https://store.steampowered.com/news/3","contents":"Hello","date":1792700000}
    ]}}
    """;

    [Fact]
    public void Steam_news_are_taken_over_unchanged_and_only_with_https_links()
    {
        var l = NewsService.Parse(News);
        Assert.Equal(2, l.Count);
        Assert.Equal("Counter-Strike 2 Update", l[0].Title);
        Assert.True(l[0].PatchNotes);
        Assert.Equal("[p]\\[ GAMEPLAY ][/p][list][*][p]Fixed a crash[/p][/*][/list]", l[0].Contents);
        Assert.Equal(DateTimeOffset.FromUnixTimeSeconds(1792709770).UtcDateTime, l[0].Date);
        Assert.Equal("(ohne Titel)", l[1].Title);
        Assert.False(l[1].PatchNotes);
        Assert.Empty(NewsService.Parse("not json"));
        Assert.Empty(NewsService.Parse("{\"appnews\":{}}"));
    }

    [Fact]
    public async Task Only_the_official_announcements_feed_is_asked_and_bad_ids_are_refused()
    {
        var h = new Handler(News);
        using var s = new NewsService(h) { ApiBase = "http://steam.test" };
        var r = JsonSerializer.SerializeToElement(await s.SteamAsync("730", 50), Json.Options);
        Assert.Equal(2, r.GetProperty("items").GetArrayLength());
        Assert.Single(h.Urls);
        Assert.Contains("appid=730", h.Urls[0]);
        Assert.Contains("count=15", h.Urls[0]); // capped
        Assert.Contains("feeds=steam_community_announcements", h.Urls[0]);
        var ex = await Assert.ThrowsAsync<RpcException>(() => s.SteamAsync("73a", 5));
        Assert.Equal("invalid-params", ex.Code);
        Assert.Single(h.Urls);
        using var down = new NewsService(new Handler("", HttpStatusCode.ServiceUnavailable)) { ApiBase = "http://steam.test" };
        Assert.Equal("unavailable", (await Assert.ThrowsAsync<RpcException>(() => down.SteamAsync("730", 5))).Code);
    }

    [Fact]
    public void Wish_list_keeps_kind_priority_categories_and_a_safe_shop_link()
    {
        using var dir = new TempDir();
        using var d = new DealService(new AppPaths(dir.Path), new NullHub(), new Handler("{}"), timer: false);
        var w = d.Save(new WishItem { Id = "wish_abcdef", Title = "Hades II – Soundtrack", Kind = "dlc", BaseGame = "Hades II", Priority = 2, Categories = new() { "Musik", "musik", " Geschenk " }, ShopUrl = "https://store.steampowered.com/app/1" });
        Assert.Equal("dlc", w.Kind);
        Assert.Equal("Hades II", w.BaseGame);
        Assert.Equal(2, w.Priority);
        Assert.Equal(new[] { "Musik", "Geschenk" }, w.Categories);
        Assert.Equal("https://store.steampowered.com/app/1", w.ShopUrl);

        // Editing changes the user's fields, never the measured ones.
        var e = d.Save(new WishItem { Id = "wish_abcdef", Title = "Hades II – Soundtrack", Kind = "game", BaseGame = "ignored for games", Priority = 0 });
        Assert.Equal("game", e.Kind);
        Assert.Null(e.BaseGame);
        Assert.Empty(e.Categories);
        Assert.Null(e.ShopUrl);

        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "X", ShopUrl = "http://shop.example" })).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "X", ShopUrl = "javascript:alert(1)" })).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "X", Priority = 5 })).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => d.Save(new WishItem { Title = "X", Categories = Enumerable.Range(0, 9).Select(i => "k" + i).ToList() })).Code);
        Assert.Equal("game", d.Save(new WishItem { Title = "Y", Kind = "<script>" }).Kind);
    }
}
