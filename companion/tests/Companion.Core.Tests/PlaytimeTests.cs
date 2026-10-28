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
}
