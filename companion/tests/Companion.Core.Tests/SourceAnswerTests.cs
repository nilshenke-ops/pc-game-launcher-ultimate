using Pgl.Core.Assistant;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

public class SourceAnswerTests
{
    static SourceAnswer.Request Req(params string[] texts) => new()
    {
        Question = "Was ist die stärkste Waffe in Skyrim?",
        Passages = texts.Select((t, i) => new SourceAnswer.Passage { Title = $"T{i}", Source = "Wiki", Url = i == 0 ? "javascript:alert(1)" : "https://en.uesp.net/wiki/x", Text = t }).ToList(),
    };

    [Fact]
    public void Quellen_werden_geprueft_und_begrenzt()
    {
        var r = SourceAnswer.Check(Req("Daedric weapons are the strongest standard weapons in Skyrim.", "kurz"));
        Assert.Single(r.Passages);                    // too short passages are dropped
        Assert.Equal("", r.Passages[0].Url);          // only https links
        Assert.Throws<RpcException>(() => SourceAnswer.Check(Req("x")));
        Assert.Contains("[1] T0 (Wiki)", SourceAnswer.Prompt(r));
    }

    [Fact]
    public void Antwort_ohne_Links_und_nur_mit_gueltigen_Quellennummern()
    {
        var (ok, text, best) = SourceAnswer.Parse("Hier: {\"answered\": true, \"answer\": \"Daedrische Waffen sind am stärksten [1][7]. Mehr: https://evil.example <b>x</b>\", \"best\": 9}", 2);
        Assert.True(ok);
        Assert.Equal("Daedrische Waffen sind am stärksten [1]. Mehr:  x", text);
        Assert.Equal(1, best);
        Assert.False(SourceAnswer.Parse("{\"answered\": true, \"answer\": \"\"}", 2).answered);
        Assert.Throws<RpcException>(() => SourceAnswer.Parse("keine JSON-Antwort", 2));
    }
}
