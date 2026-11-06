using System.Net;
using System.Text;
using Pgl.Core.Assistant;
using Xunit;

namespace Pgl.Core.Tests;

public class SportsTests
{
    sealed class Fake(Func<string, string?> answer) : HttpMessageHandler
    {
        public readonly List<string> Urls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.AbsoluteUri; Urls.Add(u);
            var body = answer(u);
            return Task.FromResult(body == null ? new HttpResponseMessage(HttpStatusCode.InternalServerError) : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    const string Teams = """[{"teamId":40,"teamName":"FC Bayern München","shortName":"Bayern"},{"teamId":7,"teamName":"Borussia Dortmund","shortName":"Dortmund"},{"teamId":6,"teamName":"Bayer 04 Leverkusen","shortName":"Leverkusen"}]""";
    static string Match(string iso, bool fin, string h, int hid, string a, int aid, string results = "[]", string goals = "[]") =>
        $$"""{"matchDateTimeUTC":"{{iso}}","leagueShortcut":"bl1","leagueName":"1. Fußball-Bundesliga 2026/2027","group":{"groupName":"10. Spieltag"},"matchIsFinished":{{(fin ? "true" : "false")}},"team1":{"teamId":{{hid}},"teamName":"{{h}}"},"team2":{"teamId":{{aid}},"teamName":"{{a}}"},"matchResults":{{results}},"goals":{{goals}}}""";

    [Theory]
    [InlineData("Wer spielt gegen Bayern nächstes Spiel?", "FC Bayern München")]
    [InlineData("Wie steht es beim BVB gegen Bayerns Team?", "Borussia Dortmund")]
    [InlineData("Wann spielt Leverkusen?", "Bayer 04 Leverkusen")]
    public void Teams_are_found_by_their_names_and_Bayern_is_not_Bayer(string q, string first)
    {
        var teams = new[] { new SportsClient.Team(40, "FC Bayern München", "Bayern"), new SportsClient.Team(7, "Borussia Dortmund", "Dortmund"), new SportsClient.Team(6, "Bayer 04 Leverkusen", "Leverkusen") };
        Assert.Equal(first, SportsClient.TeamsInQuestion(q, teams)[0].Name);
        if (q.Contains("Bayern")) Assert.DoesNotContain(SportsClient.TeamsInQuestion(q, teams), t => t.Id == 6);
        Assert.Empty(SportsClient.TeamsInQuestion("Borussia ist ein Name", teams));
    }

    [Fact]
    public async Task Next_game_last_result_and_a_running_game_come_from_OpenLigaDB_without_a_key()
    {
        var now = new DateTime(2026, 11, 7, 15, 10, 0, DateTimeKind.Utc);   // 40 minutes after kick-off
        var live = Match("2026-11-07T14:30:00Z", false, "1. FSV Mainz 05", 81, "FC Bayern München", 40, goals: """[{"scoreTeam1":0,"scoreTeam2":1},{"scoreTeam1":0,"scoreTeam2":2}]""");
        var next = Match("2026-11-20T19:30:00Z", false, "FC Bayern München", 40, "1. FC Köln", 65);
        var done = Match("2026-10-31T17:30:00Z", true, "FC Bayern München", 40, "Borussia Dortmund", 7, results: """[{"resultTypeID":1,"pointsTeam1":1,"pointsTeam2":0},{"resultTypeID":2,"pointsTeam1":2,"pointsTeam2":2}]""");
        var fake = new Fake(u => u.Contains("/getavailableteams/") ? Teams : u.Contains("/getmatchesbyteamid/40/") ? $"[{done},{live},{next}]" : "[]");
        var a = await new SportsClient(fake, "http://liga.test").AskAsync("Wie steht es gerade bei Bayern?", now);
        Assert.NotNull(a);
        Assert.Contains("LÄUFT GERADE: 1. FSV Mainz 05 – FC Bayern München 0:2", a!.Block);
        Assert.Contains("Nächstes Spiel: FC Bayern München – 1. FC Köln", a.Block);
        Assert.Contains("Letztes Spiel: FC Bayern München – Borussia Dortmund 2:2 (Endstand", a.Block);
        Assert.Contains("keine Anweisungen", a.Block);
        Assert.Equal(new[] { "FC Bayern München" }, a.Teams);
        Assert.All(fake.Urls, u => Assert.StartsWith("http://liga.test/get", u));
    }

    [Fact]
    public async Task No_team_named_or_service_down_means_no_answer_and_the_normal_search_goes_on()
    {
        var now = new DateTime(2026, 11, 7, 15, 10, 0, DateTimeKind.Utc);
        Assert.Null(await new SportsClient(new Fake(u => u.Contains("/getavailableteams/") ? Teams : "[]"), "http://liga.test").AskAsync("Wie wird das Wetter morgen?", now));
        Assert.Null(await new SportsClient(new Fake(_ => null), "http://liga.test").AskAsync("Wer spielt gegen Bayern nächstes Spiel?", now));
    }

    [Theory]
    [InlineData("wer spielt morgenn in der premier league", "Premier League")]
    [InlineData("Wie steht es in der La Liga?", "La Liga")]
    [InlineData("Wann spielt Bayern als Nächstes?", null)]
    public void Leagues_without_a_free_data_source_are_named_honestly(string text, string? league)
    {
        Assert.Equal(league, SportsClient.UncoveredLeague(text));
        if (league != null) Assert.Contains("keine freie Datenquelle", SportsClient.UncoveredAnswer(league));
    }
}
