using System.Net;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class PlaytimeTests
{
    [Fact]
    public void Steam_keeps_the_total_play_time_in_its_own_file_on_the_PC()
    {
        const string vdf = """
        "UserLocalConfigStore" { "Software" { "Valve" { "Steam" { "apps" {
          "990080" { "LastPlayed" "1761500000" "Playtime" "2715" "Playtime2wks" "120" }
          "730" { "Playtime" "0" }
          "notanid" { "Playtime" "5" }
        } } } } }
        """;
        var r = SteamService.ParseLocalPlaytime(vdf);
        Assert.Single(r);
        Assert.Equal(2715, r[990080].minutes); // total, not the last two weeks
        Assert.Equal(2025, r[990080].lastPlayed!.Value.Year);
        Assert.Empty(SteamService.ParseLocalPlaytime("\"x\" { }"));
    }

    [Fact]
    public void IGDB_the_same_game_only_and_hours_from_seconds()
    {
        var games = JsonDocument.Parse("""[{"id":1,"name":"Hogwarts Legacy: Deluxe Edition"},{"id":2,"name":"Hogwarts Legacy 2"},{"id":3,"name":"Hogwarts Legacy","url":"https://www.igdb.com/games/hogwarts-legacy"}]""").RootElement;
        Assert.Equal(3, PlaytimeService.PickGame(games, "hogwarts legacy")!.Value.id); // exact name first
        Assert.Equal(1, PlaytimeService.PickGame(JsonDocument.Parse("""[{"id":1,"name":"Hogwarts Legacy: Deluxe Edition"}]""").RootElement, "Hogwarts Legacy")!.Value.id);
        Assert.Null(PlaytimeService.PickGame(JsonDocument.Parse("""[{"id":9,"name":"Minecraft Dungeons"}]""").RootElement, "Minecraft"));
        var d = PlaytimeService.ParseDurations(JsonDocument.Parse("""[{"hastily":95400,"normally":154800,"completely":246600,"count":412}]""").RootElement, 3, "Hogwarts Legacy", "");
        Assert.Equal((26.5, 43.0, 68.5, 412), (d!.MainHours!.Value, d.ExtraHours!.Value, d.CompleteHours!.Value, d.Count));
        Assert.StartsWith("https://www.igdb.com/games/3", d.Url);
        Assert.Null(PlaytimeService.ParseDurations(JsonDocument.Parse("[]").RootElement, 3, "x", ""));
        Assert.Null(PlaytimeService.ParseDurations(JsonDocument.Parse("""[{"count":0}]""").RootElement, 3, "x", ""));
    }

    sealed class Igdb : HttpMessageHandler
    {
        public List<string> Asked { get; } = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.ToString();
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            Asked.Add(u + " " + body);
            string json = u.Contains("oauth2/token") ? """{"access_token":"tok","expires_in":5000}"""
                : u.EndsWith("/v4/games") ? """[{"id":3,"name":"Hogwarts Legacy"}]"""
                : u.EndsWith("/v4/game_time_to_beats") ? """[{"hastily":95400,"normally":154800,"completely":246600,"count":412}]""" : "";
            if (u.EndsWith("/v4/games") || u.EndsWith("/v4/game_time_to_beats"))
                Assert.Equal("Bearer tok", r.Headers.Authorization?.ToString());
            return new HttpResponseMessage(json.Length > 0 ? HttpStatusCode.OK : HttpStatusCode.NotFound) { Content = new StringContent(json) };
        }
    }

    [Fact]
    public async Task Durations_only_with_the_users_own_IGDB_access_set_at_the_PC_and_kept_a_week()
    {
        using var dir = new TempDir();
        var igdb = new Igdb();
        using var p = new PlaytimeService(new AppPaths(dir.Path), new PlainSecretProtector(), null, null, igdb) { TokenBase = "https://id.test", IgdbBase = "https://igdb.test" };
        var none = JsonSerializer.SerializeToElement(await p.LookupAsync("Hogwarts Legacy", false), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal("not-configured", none.GetProperty("durationsError").GetString());
        Assert.Equal(JsonValueKind.Null, none.GetProperty("durations").ValueKind);
        Assert.Empty(igdb.Asked); // nothing is asked without the user's access

        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => p.Configure("abcdefghij0123456789", "abcdefghij0123456789", isLocalAdmin: false)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => p.Configure("NOT VALID", null, isLocalAdmin: true)).Code);
        p.Configure("abcdefghij0123456789", "secretsecret0123456789", isLocalAdmin: true);
        Assert.DoesNotContain("secretsecret0123456789", JsonSerializer.Serialize(p.Status())); // the secret is never handed out

        var r = JsonSerializer.SerializeToElement(await p.LookupAsync("Hogwarts Legacy", false), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal(26.5, r.GetProperty("durations").GetProperty("mainHours").GetDouble());
        Assert.Equal(412, r.GetProperty("durations").GetProperty("count").GetInt32());
        Assert.Contains("IGDB", r.GetProperty("durations").GetProperty("source").GetString());
        Assert.Contains(igdb.Asked, a => a.Contains("where game_id = 3"));
        var asked = igdb.Asked.Count;
        await p.LookupAsync("hogwarts legacy", false); // from the cache
        Assert.Equal(asked, igdb.Asked.Count);
        await p.LookupAsync("Hogwarts Legacy", true);  // "neu nachsehen"
        Assert.True(igdb.Asked.Count > asked);
        // A quote in the name cannot break the query.
        await p.LookupAsync("Bad \" ; fields *", true);
        Assert.Contains(igdb.Asked, a => a.Contains("search \"Bad  ; fields *\""));
    }

    sealed class Media : HttpMessageHandler
    {
        public List<string> Asked { get; } = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.ToString();
            Asked.Add(u);
            string json = u.Contains("oauth2/token") ? """{"access_token":"tok","expires_in":5000}"""
                : u.Contains("/helix/search/categories") ? """{"data":[{"id":"111","name":"Elden Ring Nightreign"},{"id":"512953","name":"Elden Ring"}]}"""
                : u.Contains("/helix/streams") ? """{"data":[{"user_login":"streamer_1","user_name":"Streamer 1","title":"Blind run","viewer_count":4200,"language":"de"},{"user_login":"bad login!","user_name":"x","title":"x","viewer_count":1}]}"""
                : u.Contains("/youtube/v3/search") ? """{"items":[{"id":{"videoId":"dQw4w9WgXcQ"},"snippet":{"title":"Elden Ring Guide &amp; Tipps","channelTitle":"Kanal","publishedAt":"2026-01-01T00:00:00Z"}},{"id":{"videoId":"bad"},"snippet":{"title":"x"}}]}""" : "";
            if (u.Contains("/helix/")) Assert.Equal("Bearer tok", r.Headers.Authorization?.ToString());
            return Task.FromResult(new HttpResponseMessage(json.Length > 0 ? HttpStatusCode.OK : HttpStatusCode.NotFound) { Content = new StringContent(json) });
        }
    }

    [Fact]
    public async Task Twitch_streams_and_YouTube_only_with_the_users_own_access_never_scraped()
    {
        using var dir = new TempDir();
        var media = new Media();
        using var p = new PlaytimeService(new AppPaths(dir.Path), new PlainSecretProtector(), null, null, media) { TokenBase = "https://id.test", HelixBase = "https://helix.test", YouTubeBase = "https://yt.test" };
        Assert.Equal("not-configured", (await Assert.ThrowsAsync<RpcException>(() => p.StreamsAsync("Elden Ring"))).Code);
        // Without a key: only the link to YouTube's own search.
        var none = JsonSerializer.SerializeToElement(await p.YouTubeAsync("Elden Ring Guide"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.False(none.GetProperty("configured").GetBoolean());
        Assert.Equal("https://www.youtube.com/results?search_query=Elden%20Ring%20Guide", none.GetProperty("searchUrl").GetString());
        Assert.Empty(media.Asked);

        p.Configure("abcdefghij0123456789", "secretsecret0123456789", isLocalAdmin: true);
        var s = JsonSerializer.SerializeToElement(await p.StreamsAsync("Elden Ring"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal("Elden Ring", s.GetProperty("game").GetString()); // the same game, not "Nightreign"
        Assert.Contains(media.Asked, a => a.Contains("game_id=512953"));
        Assert.Equal(1, s.GetProperty("streams").GetArrayLength()); // the odd login is left out
        Assert.Equal("https://www.twitch.tv/streamer_1", s.GetProperty("streams")[0].GetProperty("url").GetString());

        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => p.ConfigureYouTube("AIza" + new string('a', 35), isLocalAdmin: false)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => p.ConfigureYouTube("nope", isLocalAdmin: true)).Code);
        p.ConfigureYouTube("AIza" + new string('a', 35), isLocalAdmin: true);
        Assert.DoesNotContain("AIza", JsonSerializer.Serialize(p.Status()));
        var y = JsonSerializer.SerializeToElement(await p.YouTubeAsync("Elden Ring Guide"), new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
        Assert.Equal(1, y.GetProperty("videos").GetArrayLength());
        Assert.Equal("Elden Ring Guide & Tipps", y.GetProperty("videos")[0].GetProperty("title").GetString());
        Assert.Equal("https://www.youtube.com/watch?v=dQw4w9WgXcQ", y.GetProperty("videos")[0].GetProperty("url").GetString());
    }

    [Fact]
    public void Epic_free_games_are_only_the_100_percent_offers_now_and_next()
    {
        const string json = """
        {"data":{"Catalog":{"searchStore":{"elements":[
          {"title":"Gratis Jetzt","productSlug":"gratis-jetzt/home","price":{"totalPrice":{"fmtPrice":{"originalPrice":"22,39 €"}}},"promotions":{"promotionalOffers":[{"promotionalOffers":[{"startDate":"2026-10-22T15:00:00.000Z","endDate":"2026-10-29T15:00:00.000Z","discountSetting":{"discountPercentage":0}}]}],"upcomingPromotionalOffers":[]}},
          {"title":"Nur Rabatt","productSlug":"rabatt","promotions":{"promotionalOffers":[{"promotionalOffers":[{"startDate":"2026-10-19T15:00:00.000Z","endDate":"2026-11-02T16:00:00.000Z","discountSetting":{"discountPercentage":40}}]}]}},
          {"title":"Bald Gratis","catalogNs":{"mappings":[{"pageSlug":"bald-gratis"}]},"promotions":{"promotionalOffers":[],"upcomingPromotionalOffers":[{"promotionalOffers":[{"startDate":"2026-10-29T15:00:00.000Z","endDate":"2026-11-05T15:00:00.000Z","discountSetting":{"discountPercentage":0}}]}]}},
          {"title":"Ohne Aktion","productSlug":"x","promotions":null}
                ]}}}}
        """;
        var l = NewsService.ParseEpic(json, new DateTime(2026, 10, 28, 12, 0, 0, DateTimeKind.Utc));
        Assert.Equal(new[] { "Gratis Jetzt", "Bald Gratis" }, l.Select(x => x.Title));
        Assert.True(l[0].Now);
        Assert.False(l[1].Now);
        Assert.Equal("https://store.epicgames.com/de/p/gratis-jetzt", l[0].Url);
        Assert.Equal("22,39 €", l[0].NormalPrice);
    }
}
