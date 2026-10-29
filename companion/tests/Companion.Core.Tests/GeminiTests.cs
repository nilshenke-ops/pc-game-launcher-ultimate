using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Gemini (free tier, the user's own key) for JARVIS research – against a fake Google server.</summary>
public class GeminiTests
{
    const string Key = "AIzaSyA0123456789abcdefghijklmnopqrstuv";

    sealed class FakeGoogle(Func<string, (HttpStatusCode, string)> answer) : HttpMessageHandler
    {
        public readonly List<(string url, string? key, string body)> Requests = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            Requests.Add((r.RequestUri!.ToString(), r.Headers.TryGetValues("x-goog-api-key", out var v) ? v.Single() : null, body));
            var (code, text) = answer(body);
            return new HttpResponseMessage(code) { Content = new StringContent(text) };
        }
    }

    static string Reply(string text) => JsonSerializer.Serialize(new
    {
        candidates = new[] { new { content = new { role = "model", parts = new object[] { new { text = "denke nach", thought = true }, new { text } } }, finishReason = "STOP" } },
        usageMetadata = new { promptTokenCount = 500, candidatesTokenCount = 80 },
        modelVersion = "gemini-3.5-flash-lite",
    });

    static SourceAnswer.Request Req() => new()
    {
        Question = "Was ist die stärkste Waffe in Skyrim?",
        Passages = { new SourceAnswer.Passage { Title = "Weapons", Source = "UESP", Url = "https://en.uesp.net/wiki/Skyrim:Weapons", Text = "Daedric weapons are the strongest standard weapons in Skyrim." } },
    };

    [Fact]
    public async Task Gemini_fasst_kostenlos_zusammen_und_antwortet_auf_Wunsch_ohne_Quelle()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var answers = new Queue<string>(new[]
        {
            Reply("{\"answered\": true, \"answer\": \"Daedrische Waffen sind am stärksten [1].\", \"best\": 1}"),
            Reply("{\"answer\": \"Das weiß ich nicht sicher.\", \"sure\": false}"),
        });
        var fake = new FakeGoogle(_ => (HttpStatusCode.OK, answers.Dequeue()));
        var a = new AssistantService(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new NullHub(), new AssistantData(s), gemini: new GeminiClient(fake) { BaseUrl = "http://gemini.test" });

        Assert.Equal("assistant-local", (await Assert.ThrowsAsync<RpcException>(() => a.SummarizeAsync(Req()))).Code);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { GeminiKey = Key }, atPc: false)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { GeminiKey = "sk-0123456789abcdef0123" }, atPc: true)).Code);
        a.Configure(new AssistantService.Config { GeminiKey = Key }, atPc: true);
        var st = JsonSerializer.SerializeToElement(a.Status(), Json.Options);
        Assert.DoesNotContain("0123456789abcdef", st.GetRawText()); // the key never leaves the PC
        Assert.Equal("Gemini (gemini-3.5-flash-lite, kostenlos)", st.GetProperty("researchAi").GetString());

        var r = JsonSerializer.SerializeToElement(await a.SummarizeAsync(Req()), Json.Options);
        Assert.Equal("Gemini", r.GetProperty("provider").GetString());
        Assert.Equal("Daedrische Waffen sind am stärksten [1].", r.GetProperty("answer").GetString()); // the thought part is not shown
        var req = fake.Requests[0];
        Assert.Equal("http://gemini.test/v1beta/models/gemini-3.5-flash-lite:generateContent", req.url);
        Assert.Equal(Key, req.key);
        Assert.DoesNotContain(Key, req.url); // key in the header, never in the URL
        using (var body = JsonDocument.Parse(req.body))
        {
            Assert.Equal("application/json", body.RootElement.GetProperty("generationConfig").GetProperty("responseMimeType").GetString());
            Assert.Contains("NUR mit Informationen aus den nummerierten Quellen", body.RootElement.GetProperty("systemInstruction").GetRawText());
            Assert.False(body.RootElement.TryGetProperty("tools", out _)); // no Google Search grounding (not free)
        }

        var free = JsonSerializer.SerializeToElement(await a.FreeAnswerAsync(new AssistantService.FreeQuestion { Question = "Wer ist Blorbfisch?" }), Json.Options);
        Assert.False(free.GetProperty("sure").GetBoolean());
        Assert.Equal(2, JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("gemini").GetProperty("used").GetInt32());
    }

    [Fact]
    public async Task Gemini_Fehler_werden_erklaert_und_das_Monatslimit_haelt()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var reply = (HttpStatusCode.TooManyRequests, "{\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}");
        var fake = new FakeGoogle(_ => reply);
        var a = new AssistantService(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new NullHub(), new AssistantData(s), gemini: new GeminiClient(fake) { BaseUrl = "http://gemini.test" });
        a.Configure(new AssistantService.Config { GeminiKey = Key, GeminiMonthlyRequests = 1 }, atPc: true);
        Assert.Contains("kostenlose Gemini-Kontingent", (await Assert.ThrowsAsync<RpcException>(() => a.SummarizeAsync(Req()))).Message);
        reply = (HttpStatusCode.BadRequest, "{\"error\":{\"message\":\"API key not valid. Please pass a valid API key.\",\"details\":[{\"reason\":\"API_KEY_INVALID\"}]}}");
        Assert.Equal("assistant-key", (await Assert.ThrowsAsync<RpcException>(() => a.SummarizeAsync(Req()))).Code);
        reply = (HttpStatusCode.NotFound, "{}");
        Assert.Equal("assistant-model", (await Assert.ThrowsAsync<RpcException>(() => a.SummarizeAsync(Req()))).Code);
        reply = (HttpStatusCode.OK, Reply("{\"answered\": true, \"answer\": \"Daedrische Waffen [1].\", \"best\": 1}"));
        await a.SummarizeAsync(Req());
        Assert.Equal("assistant-limit", (await Assert.ThrowsAsync<RpcException>(() => a.SummarizeAsync(Req()))).Code);
        Assert.Equal(4, fake.Requests.Count); // the 5th was stopped before going out
        // Claude/Ollama as assistant mode stay first: Gemini never replaces a chosen AI silently.
        a.Configure(new AssistantService.Config { Mode = "ollama", OllamaModel = "llama3" }, atPc: true);
        Assert.StartsWith("Ollama", JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("researchAi").GetString());
    }
}
