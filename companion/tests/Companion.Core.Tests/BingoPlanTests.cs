using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>2.52 Ultimate Bingo: structured AI tasks, strict checking, DeepSeek as bingo AI (against a fake server).</summary>
public class BingoPlanTests
{
    sealed class FakeDeepSeek(Func<string, (HttpStatusCode, string)> answer) : HttpMessageHandler
    {
        public readonly List<(string url, string? auth, string body)> Requests = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            Requests.Add((r.RequestUri!.ToString(), r.Headers.Authorization?.ToString(), body));
            var (code, text) = answer(body);
            return new HttpResponseMessage(code) { Content = new StringContent(text) };
        }
    }

    static string Completion(string content) => JsonSerializer.Serialize(new
    {
        id = "x", model = "deepseek-flash", choices = new[] { new { index = 0, message = new { role = "assistant", content } } },
        usage = new { prompt_tokens = 700, completion_tokens = 300 },
    });

    static string Tasks(int n, string prefix = "Aufgabe") => JsonSerializer.Serialize(new
    {
        known = true,
        tasks = Enumerable.Range(1, n).Select(i => new { text = $"{prefix} Nummer {i}", level = 1 + i % 4, category = i % 2 == 0 ? "collect" : "explore", team = false, why = "Passt zur Stufe" }),
    });

    static BingoRequest Req(int size = 3) => new() { Game = "Minecraft", Size = size, Levels = new[] { 3, 3, 2, size * size - 8 } };

    [Fact]
    public void Answers_are_checked_strictly_and_nothing_is_repaired_by_guessing()
    {
        var r = BingoPlan.Check(new BingoRequest { Game = "Minecraft", Size = 3, Exclude = new() { "Finde Diamanten" }, Players = 1 });
        var text = "Hier ist dein Bingo:\n```json\n" + JsonSerializer.Serialize(new
        {
            known = false,
            tasks = new object[]
            {
                new { text = "Finde Diamanten", level = 2, category = "collect" },            // excluded (was on the last card)
                new { text = "Besuche den Nether.", level = 3, category = "explore" },          // full stop removed
                new { text = "besuche den nether", level = 3, category = "explore" },           // duplicate
                new { text = "<b>Hack</b>", level = 1, category = "fun" },                       // markup
                new { text = "Baut gemeinsam ein Haus", level = 1, category = "team", team = true }, // team task for one player
                new { text = "Fange einen Fisch", level = 9, category = "unbekannt" },          // level/category fall back
                new { text = "ok" },                                                             // too short
            },
        }) + "\n```";
        var (known, tasks) = BingoPlan.Parse(text, r);
        Assert.False(known);
        Assert.Equal(new[] { "Besuche den Nether", "Fange einen Fisch" }, tasks.Select(t => t.Text));
        Assert.Equal((2, "challenge"), (tasks[1].Level, tasks[1].Category));
        Assert.Empty(BingoPlan.Parse("kein json", r).tasks);
        Assert.Empty(BingoPlan.Parse("{\"tasks\": 5}", r).tasks);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => BingoPlan.Check(new BingoRequest { Game = "M", Size = 3 })).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => BingoPlan.Check(new BingoRequest { Game = "Minecraft", Size = 7 })).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => BingoPlan.Check(new BingoRequest { Game = "Minecraft", Size = 3, Levels = new[] { 30, 0, 0, 0 } })).Code);
    }

    [Fact]
    public void Facts_from_the_internet_reach_the_prompt_readable_and_limited()
    {
        var p = BingoPlan.Prompt(BingoPlan.Check(new BingoRequest { Game = "Halo 5: Guardians", Size = 3, Facts = "Halo 5 (Xbox)\nGenre: Shooter\nBeschreibung: Multiplayer" + new string('x', 3000) }));
        Assert.Contains("Was im Internet über das Spiel steht", p);
        Assert.Contains("Halo 5 (Xbox) · Genre: Shooter · Beschreibung", p);
        Assert.DoesNotContain(new string('x', 2001), p);
        Assert.DoesNotContain("Was im Internet", BingoPlan.Prompt(BingoPlan.Check(new BingoRequest { Game = "Minecraft", Size = 3 })));
    }

    [Fact]
    public void Prompt_names_the_game_the_levels_and_what_must_not_repeat()
    {
        var p = BingoPlan.Prompt(BingoPlan.Check(new BingoRequest { Game = "Elden Ring", Size = 4, Levels = new[] { 0, 3, 10, 3 }, Exclude = new() { "Besiege Margit" }, Players = 2, Progress = "Durchgespielt" }));
        Assert.Contains("Spiel: Elden Ring", p);
        Assert.Contains("Stufe 3", p);
        Assert.DoesNotContain("Stufe 1 ", p);
        Assert.Contains("Besiege Margit", p);
        Assert.Contains("Teamaufgaben sein", p);
        Assert.Contains("json", p);
    }

    static async Task<(AssistantService a, FakeDeepSeek fake, TempDir dir, CompanionServices s)> WithDeepSeek(Func<string, (HttpStatusCode, string)> answer)
    {
        var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var fake = new FakeDeepSeek(answer);
        var a = new AssistantService(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new NullHub(), new AssistantData(s), deepSeek: new DeepSeekClient(fake) { BaseUrl = "http://deepseek.test" });
        await Task.CompletedTask;
        return (a, fake, dir, s);
    }

    [Fact]
    public async Task DeepSeek_writes_bingo_tasks_with_the_key_only_set_at_the_pc()
    {
        var (a, fake, dir, s) = await WithDeepSeek(_ => (HttpStatusCode.OK, Completion(Tasks(14))));
        using var _d = dir; await using var _s = s;
        // Without any AI: honest "no AI" – the app uses its catalog.
        Assert.Equal("assistant-local", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { DeepSeekKey = "sk-0123456789abcdef0123" }, atPc: false)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { DeepSeekKey = "sk-ant-0123456789abcdef0123" }, atPc: true)).Code);
        Assert.Equal("assistant-key", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { BingoAi = "deepseek" }, atPc: true)).Code);
        a.Configure(new AssistantService.Config { DeepSeekKey = "sk-0123456789abcdef0123", BingoAi = "deepseek" }, atPc: true);
        var st = JsonSerializer.SerializeToElement(a.Status(), Json.Options);
        Assert.Equal("DeepSeek (deepseek-flash)", st.GetProperty("bingoProvider").GetString());
        Assert.DoesNotContain("0123456789abcdef", st.GetRawText()); // the key never leaves the PC

        var r = JsonSerializer.SerializeToElement(await a.PlanBingoAsync(Req()), Json.Options);
        Assert.Equal("DeepSeek", r.GetProperty("provider").GetString());
        Assert.Equal(14, r.GetProperty("tasks").GetArrayLength());
        var req = fake.Requests.Single();
        Assert.Equal("http://deepseek.test/chat/completions", req.url);
        Assert.Equal("Bearer sk-0123456789abcdef0123", req.auth);
        using var body = JsonDocument.Parse(req.body);
        Assert.Equal("deepseek-flash", body.RootElement.GetProperty("model").GetString());
        Assert.Equal("json_object", body.RootElement.GetProperty("response_format").GetProperty("type").GetString());
        var used = JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("deepSeek");
        Assert.Equal(1, used.GetProperty("used").GetInt32());
        Assert.Equal(700, used.GetProperty("inputTokens").GetInt64());
    }

    [Fact]
    public async Task DeepSeek_errors_are_explained_and_the_monthly_cap_holds()
    {
        var reply = (HttpStatusCode.Unauthorized, "{\"error\":{\"message\":\"Authentication Fails\"}}");
        var (a, fake, dir, s) = await WithDeepSeek(_ => reply);
        using var _d = dir; await using var _s = s;
        a.Configure(new AssistantService.Config { DeepSeekKey = "sk-0123456789abcdef0123", BingoAi = "deepseek", DeepSeekMonthlyRequests = 2 }, atPc: true);
        Assert.Equal("assistant-key", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code);
        reply = (HttpStatusCode.PaymentRequired, "{}");
        Assert.Equal("assistant-limit", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code);
        reply = (HttpStatusCode.OK, Completion(""));
        Assert.Equal("assistant-bingo", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code); // documented empty content
        reply = (HttpStatusCode.OK, Completion(Tasks(4)));
        // Errors are not counted (no successful answer) – too few tasks is an honest error, not a short card.
        Assert.Equal("assistant-bingo", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code);
        reply = (HttpStatusCode.OK, Completion(Tasks(12)));
        await a.PlanBingoAsync(Req());
        Assert.Equal("assistant-limit", (await Assert.ThrowsAsync<RpcException>(() => a.PlanBingoAsync(Req()))).Code);
        Assert.Equal(5, fake.Requests.Count); // the capped request never left the PC
    }
}
