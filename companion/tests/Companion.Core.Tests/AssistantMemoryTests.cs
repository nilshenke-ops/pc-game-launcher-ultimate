using System.Text.Json;
using Pgl.Core.Infrastructure;
using Xunit;

namespace Pgl.Core.Tests;

public class AssistantMemoryTests
{
    static async Task<string> Ask(Pgl.Core.Services.CompanionServices s, string q)
    {
        var r = JsonSerializer.SerializeToElement(await s.Assistant.AskAsync("dev", "Test", null, q), Json.Options).GetProperty("reply");
        return r.GetProperty("text").GetString()!;
    }

    [Fact]
    public async Task The_home_place_is_remembered_and_can_be_asked_for()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        Assert.Contains("noch nicht", await Ask(s, "Wo wohne ich?"));
        Assert.Contains("Du wohnst in Adendorf", await Ask(s, "Ich wohne in Adendorf"));
        Assert.Contains("Du wohnst in Adendorf", await Ask(s, "Wo wohne ich?"));
    }

    [Fact]
    public async Task The_last_play_session_is_answered_with_game_and_length_or_honestly_with_nothing()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var a = await Ask(s, "Was war meine letzte Spielzeit?");
        Assert.Contains("noch keine Spielsitzung", a);
        Assert.DoesNotContain("Insgesamt", a);                       // not the total over everything
        Assert.Contains("noch keine Spielsitzung", await Ask(s, "Wie lange habe ich zuletzt gespielt?"));
    }
}
