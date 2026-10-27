using System.Net;
using System.Text.Json;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class SteamAchievementsTests
{
    // Hand-written in the shape the community page uses: JSON inside a JSON string inside the page's data script.
    static string Page()
    {
        var inner = JsonSerializer.Serialize(new { queries = new[] { new { state = new { data = new { appid = 4711, groups = new[] { new { achievements = new object[] {
            new { api_name = "FIRST", name = "Erster Schritt", description = "Schließe das Tutorial ab.", hidden = false },
            new { api_name = "BOSS", name = "Königsmörder", description = "Besiege den König.", hidden = false },
            new { api_name = "SECRET", name = "Geheim", description = "", hidden = true },
            new { api_name = "RARE", name = "Perfektion", description = "Alles auf 100 %.", hidden = false },
        } } } } } } } });
        var outer = JsonSerializer.Serialize(new { route = "/achievements/:appid", loaderData = new[] { JsonSerializer.Serialize(new { renderContext = new { queryData = inner } }) } });
        return $"<html><script type=\"application/json\" id=\"valve-ssr-data\" nonce=\"x\">{outer}</script></html>";
    }
    const string Percent = """{"achievementpercentages":{"achievements":[{"name":"FIRST","percent":"81.2"},{"name":"BOSS","percent":22.5},{"name":"RARE","percent":"1.4"}]}}""";
    const string Details = """{"4711":{"success":true,"data":{"short_description":"Ein &quot;Rennspiel&quot; mit <b>Strecken</b>.","genres":[{"id":"9","description":"Rennspiele"}],"categories":[{"id":1,"description":"Mehrspieler"},{"id":24,"description":"Geteilter Bildschirm"}]}}}""";
    const string Search = """{"total":2,"items":[{"type":"app","name":"Test Game Soundtrack","id":1},{"type":"app","name":"Test Game","id":4711}]}""";

    sealed class Steam : HttpMessageHandler
    {
        public List<string> Asked { get; } = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.ToString();
            Asked.Add(u);
            if (u.Contains("storesearch") && u.Contains("busy")) return Task.FromResult(new HttpResponseMessage((HttpStatusCode)429));
            var body = u.Contains("storesearch") ? (u.Contains("Make") ? Search : u.Contains("nurwiki") || u.Contains("Halo") ? """{"total":0,"items":[]}""" : Search)
                : u.Contains("autosuggest") ? (u.Contains("Halo") ? """{"Results":[{"Products":[{"Type":"Game","ProductId":"9NP1P1WFS0LB","Title":"Halo Wars"},{"Type":"Game","ProductId":"9PP5G1F0C2B6","Title":"Halo Infinite"}]}]}""" : """{"Results":[]}""")
                : u.Contains("bigIds") ? """{"Products":[{"ProductKind":"Game","ProductId":"9NP1P1WFS0LB","LocalizedProperties":[{"ProductTitle":"Halo Wars: Definitive Edition","ShortDescription":"Echtzeit-Strategie im Halo-Universum."}],"Properties":{"Categories":["Strategy"]}},{"ProductKind":"Game","ProductId":"9PP5G1F0C2B6","LocalizedProperties":[{"ProductTitle":"Halo Infinite","ShortDescription":"Der Master Chief kehrt zurück – ein Ego-Shooter."}],"Properties":{"Categories":["Shooter"]}}]}"""
                : u.Contains("appdetails") ? Details : u.Contains("GetGlobalAchievementPercentages") ? Percent : u.Contains("/achievements/4711") ? Page()
                : u.Contains("search/title") ? """{"pages":[{"key":"Nurwiki_(Band)","description":"deutsche Band"},{"key":"Nurwiki","description":"Computerspiel von 2019"}]}"""
                : u.Contains("page/summary/Nurwiki") ? """{"extract":"Nurwiki ist ein Survival-Horror-Computerspiel."}""" : "";
            return Task.FromResult(new HttpResponseMessage(body.Length > 0 ? HttpStatusCode.OK : HttpStatusCode.NotFound) { Content = new StringContent(body) });
        }
    }

    sealed class Down : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
    }

    [Fact]
    public void Achievements_come_with_names_descriptions_and_the_real_unlock_rate()
    {
        var list = SteamAchievementsService.ParsePage(Page(), SteamAchievementsService.ParsePercent(Percent));
        Assert.Equal(4, list.Count);
        Assert.Equal(("Erster Schritt", "Schließe das Tutorial ab.", false, 81.2), (list[0].Name, list[0].Description, list[0].Hidden, list[0].Percent!.Value));
        Assert.Equal(22.5, list[1].Percent);
        Assert.True(list[2].Hidden);
        Assert.Null(list[2].Percent); // no rate known → none invented
        Assert.Empty(SteamAchievementsService.ParsePage("<html>nichts</html>", new()));
        Assert.Equal(4711, SteamAchievementsService.PickApp(Search, "test game")!.Value.id); // exact name before the first hit
        Assert.Null(SteamAchievementsService.PickApp("""{"total":0,"items":[]}""", "x"));
        // Only the same game (series prefix and edition words are fine), never another game of the series.
        Assert.True(SteamAchievementsService.SameGame("The Elder Scrolls V: Skyrim Special Edition", "Skyrim"));
        Assert.True(SteamAchievementsService.SameGame("Make Way", "Makeway"));
        Assert.False(SteamAchievementsService.SameGame("Minecraft Dungeons", "Minecraft"));
        Assert.False(SteamAchievementsService.SameGame("Minecraft Legends", "Minecraft"));
        Assert.False(SteamAchievementsService.SameGame("The Elder Scrolls V: Skyrim VR", "Skyrim"));
        Assert.Null(SteamAchievementsService.PickApp("""{"total":2,"items":[{"type":"app","name":"Minecraft Dungeons","id":1672970},{"type":"app","name":"Minecraft Legends","id":1928870}]}""", "Minecraft"));
    }

    [Fact]
    public async Task One_lookup_per_game_and_honest_errors()
    {
        var steam = new Steam();
        using var s = new SteamAchievementsService(steam) { StoreBase = "https://store.test", CommunityBase = "https://community.test", ApiBase = "https://api.test", Delay = _ => Task.CompletedTask };
        var r = JsonSerializer.SerializeToElement(await s.TasksAsync("Test Game"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal(4711, r.GetProperty("appId").GetInt32());
        Assert.Equal(4, r.GetProperty("achievements").GetArrayLength());
        Assert.Equal(4, steam.Asked.Count);
        Assert.Contains(steam.Asked, u => u.Contains("/achievements/4711?l=german"));
        Assert.Equal("Rennspiele", r.GetProperty("genres")[0].GetString());
        Assert.Equal(2, r.GetProperty("categories").GetArrayLength());
        Assert.Equal("Ein \"Rennspiel\" mit Strecken .", r.GetProperty("description").GetString());
        await s.TasksAsync("test game"); // from the cache
        Assert.Equal(4, steam.Asked.Count);
        // Not on Steam: Wikipedia – only a page that is about a game.
        using var w = new SteamAchievementsService(steam) { StoreBase = "https://store.test", WikiBase = "https://wiki.test", Delay = _ => Task.CompletedTask };
        var wiki = JsonSerializer.SerializeToElement(await w.TasksAsync("nurwiki"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal("Nurwiki", wiki.GetProperty("name").GetString());
        Assert.Contains("Survival-Horror", wiki.GetProperty("description").GetString());
        Assert.Equal(0, wiki.GetProperty("achievements").GetArrayLength());
        // Not on Steam, but in the Microsoft Store (Xbox): that game, not another of the series.
        var halo = JsonSerializer.SerializeToElement(await w.TasksAsync("Halo Infinite"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal("Halo Infinite", halo.GetProperty("name").GetString());
        Assert.Equal("Shooter", halo.GetProperty("genres")[0].GetString());
        Assert.Contains("Ego-Shooter", halo.GetProperty("description").GetString());
        // Steam busy (429): Wikipedia is still asked.
        Assert.Equal("Nurwiki", JsonSerializer.SerializeToElement(await w.TasksAsync("busy"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }).GetProperty("name").GetString());
        Assert.Null(SteamAchievementsService.PickWikiTitle("""{"pages":[{"key":"Band","description":"Musikgruppe"}]}"""));
        using var none = new SteamAchievementsService(new Down()) { Delay = _ => Task.CompletedTask };
        Assert.Equal("unavailable", (await Assert.ThrowsAsync<RpcException>(() => none.TasksAsync("Gibt es nicht"))).Code);
        await Assert.ThrowsAsync<RpcException>(() => none.TasksAsync("x"));
    }
}
