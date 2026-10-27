using System.Text;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class JarvisTests
{
    static async Task<(Pgl.Core.Services.CompanionServices s, TestClient admin)> Setup(TempDir dir)
    {
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        s.Library.AddSteam("252950", "Rocket League");
        s.Library.AddSteam("730", "Counter-Strike 2");
        await admin.Ok("profiles.save", new { profile = new { id = "", name = "Streaming", icon = "radio", color = "#22d3ee", gameIds = Array.Empty<string>(), launchProgramIds = Array.Empty<string>(), quickActionIds = Array.Empty<string>(), hotkeyIds = Array.Empty<string>() } });
        return (s, admin);
    }

    static List<JsonElement> Actions(JsonElement r) => r.GetProperty("reply").GetProperty("actions").EnumerateArray().ToList();

    [Fact]
    public async Task Named_gaming_actions_run_only_while_the_jarvis_session_is_on()
    {
        using var dir = new TempDir();
        var (_, admin) = await Setup(dir);
        // Without a session: only a button, even if the website asks for JARVIS.
        var off = await admin.Ok("assistant.ask", new { text = "Starte Rocket League", jarvis = true });
        Assert.False(off.GetProperty("jarvis").GetBoolean());
        Assert.All(Actions(off), a => Assert.False(a.GetProperty("auto").GetBoolean()));

        Assert.True((await admin.Ok("jarvis.session", new { active = true })).GetProperty("active").GetBoolean());
        var on = await admin.Ok("assistant.ask", new { text = "Starte Rocket League", jarvis = true });
        Assert.True(on.GetProperty("jarvis").GetBoolean());
        var launch = Actions(on).Single(a => a.GetProperty("kind").GetString() == "launch");
        Assert.True(launch.GetProperty("auto").GetBoolean());

        var profile = await admin.Ok("assistant.ask", new { text = "Profil Streaming aktivieren", jarvis = true });
        Assert.True(Actions(profile).Single(a => a.GetProperty("kind").GetString() == "profile").GetProperty("auto").GetBoolean());

        // A normal ask (old assistant page) never runs anything.
        var plain = await admin.Ok("assistant.ask", new { text = "Starte Rocket League" });
        Assert.All(Actions(plain), a => Assert.False(a.GetProperty("auto").GetBoolean()));

        await admin.Ok("jarvis.session", new { active = false });
        var after = await admin.Ok("assistant.ask", new { text = "Starte Rocket League", jarvis = true });
        Assert.All(Actions(after), a => Assert.False(a.GetProperty("auto").GetBoolean()));
    }

    [Fact]
    public async Task Off_topic_and_code_requests_get_an_honest_answer_without_any_action()
    {
        using var dir = new TempDir();
        var (_, admin) = await Setup(dir);
        await admin.Ok("jarvis.session", new { active = true });
        var mail = await admin.Ok("assistant.ask", new { text = "Schreib eine E-Mail an meinen Chef", jarvis = true });
        Assert.Contains("nur um deine Spiele", mail.GetProperty("reply").GetProperty("text").GetString());
        Assert.Empty(Actions(mail));
        var code = await admin.Ok("assistant.ask", new { text = "Programmier mir eine neue Seite für Turniere", jarvis = true });
        Assert.Contains("Programmcode", code.GetProperty("reply").GetProperty("text").GetString());
        // Gaming words keep it in: "Discord" with a mail word is still about gaming.
        Assert.False(Jarvis.OffTopic("Öffne Discord und starte Minecraft"));
        Assert.False(Jarvis.OffTopic("Wie ist das Wetter in Minecraft einstellbar?"));
        Assert.True(Jarvis.OffTopic("Wie wird das Wetter morgen?"));
    }

    [Fact]
    public void Only_what_the_user_named_runs_directly()
    {
        AssistantReply R(params AssistantAction[] a) { var r = new AssistantReply(); r.Actions.AddRange(a); return r; }
        AssistantAction Launch(string name) => new() { Kind = "launch", Label = name + " starten", Method = "library.launch", Target = name };
        // Named → runs; something the AI added on its own (e.g. read in a note or a game name) → stays a button.
        var r = R(Launch("Minecraft"), Launch("Counter-Strike 2"));
        Assert.Equal(1, Jarvis.MarkAuto(r, "starte bitte minecraft"));
        Assert.True(r.Actions[0].Auto);
        Assert.False(r.Actions[1].Auto);
        // Never two starts from one sentence step.
        var two = R(Launch("Rocket League"), Launch("Rocket League Sideswipe"));
        Jarvis.MarkAuto(two, "Starte Rocket League");
        Assert.Single(two.Actions, a => a.Auto);
        // Not in the list (power, removing …) or asking before it runs → never directly.
        var power = R(new AssistantAction { Kind = "power", Target = "PC", Method = "power.run" }, new AssistantAction { Kind = "quick", Target = "Abend", Method = "quick.run", RequireConfirm = true });
        Assert.Equal(0, Jarvis.MarkAuto(power, "fahr den PC runter und führe Abend aus"));
        // Opening a page only when nothing else runs.
        var nav = R(Launch("Minecraft"), new AssistantAction { Kind = "navigate", Path = "/games", Target = "Spiele" });
        Jarvis.MarkAuto(nav, "Starte Minecraft und zeig Spiele");
        Assert.False(nav.Actions[1].Auto);
        Assert.True(Jarvis.MarkAuto(R(new AssistantAction { Kind = "stopSounds", Method = "sounds.stopAll" }), "stopp alle sounds") == 1);
        Assert.True(Jarvis.Mentioned("Counter-Strike 2", "starte counter strike"));
        Assert.False(Jarvis.Mentioned("Rocket League", "starte ein spiel"));
    }

    [Fact]
    public void The_stutter_check_names_only_measured_bottlenecks()
    {
        const long GB = 1073741824;
        var hot = new MetricsSample { CpuPercent = 96, MemTotalBytes = 24 * GB, MemUsedBytes = 23 * GB, CpuTempC = 97,
            Gpus = { new GpuSample { Name = "NVIDIA GeForce RTX 5060 Laptop GPU", UtilPercent = 99, TempC = 88, MemUsedBytes = 8 * GB - GB / 4, MemTotalBytes = 8 * GB } },
            Disks = { new DiskSample("C:", "", 500 * GB, 10 * GB) } };
        var f = GamingDoctor.Check(hot, gameRunning: true).Select(x => x.Text).ToList();
        Assert.Contains(f, x => x.StartsWith("Prozessor am Limit (96 %)"));
        Assert.Contains(f, x => x.StartsWith("Arbeitsspeicher fast voll (23,0 von 24,0 GB)"));
        Assert.Contains(f, x => x.Contains("sehr heiß (88 °C)"));
        Assert.Contains(f, x => x.StartsWith("Grafikspeicher fast voll"));
        Assert.Contains(f, x => x.StartsWith("Laufwerk C: fast voll"));
        Assert.DoesNotContain(f, x => x.Contains("FPS"));
        var idle = GamingDoctor.Check(new MetricsSample { CpuPercent = 20, Gpus = { new GpuSample { Name = "NVIDIA GeForce RTX 5060 Laptop GPU", UtilPercent = 30 } } }, gameRunning: true);
        Assert.Contains(idle, x => x.Text.Contains("kaum ausgelastet"));
        Assert.Contains(GamingDoctor.Check(new MetricsSample(), gameRunning: false), x => x.Text.StartsWith("Gerade läuft kein Spiel"));
    }
}
