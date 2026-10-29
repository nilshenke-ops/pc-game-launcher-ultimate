using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>KI-Router (OpenAI format: OpenRouter, Groq, MixRoute, OmniRoute/LiteLLM) – against a fake server.</summary>
public class RouterTests
{
    sealed class Fake(Func<string, string, (HttpStatusCode, string)> answer) : HttpMessageHandler
    {
        public readonly List<(string url, string? auth, string body)> Requests = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            Requests.Add((r.RequestUri!.ToString(), r.Headers.Authorization?.ToString(), body));
            var (code, text) = answer(r.RequestUri!.ToString(), body);
            return new HttpResponseMessage(code) { Content = new StringContent(text) };
        }
    }

    static string Chat(string text, string model) => JsonSerializer.Serialize(new { id = "x", model, choices = new[] { new { index = 0, message = new { role = "assistant", content = text } } }, usage = new { prompt_tokens = 100, completion_tokens = 20 } });
    const string Key = "sk-or-v1-0123456789abcdef0123456789";

    static AssistantService Make(TempDir dir, Pgl.Core.Services.CompanionServices s, Fake fake) =>
        new(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new NullHub(), new AssistantData(s), router: new OpenAiCompatClient(fake));

    [Fact]
    public async Task OpenRouter_kostenlose_Modelle_mit_Ausweichliste_und_Router_als_Standard_KI()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var fake = new Fake((url, body) => url.EndsWith("/models")
            ? (HttpStatusCode.OK, JsonSerializer.Serialize(new { data = new object[]
              {
                  new { id = "openai/gpt-6", pricing = new { prompt = "0.000005", completion = "0.00002" }, context_length = 400000 },
                  new { id = "google/gemma-4-31b-it:free", pricing = new { prompt = "0", completion = "0" }, context_length = 262144 },
              } }))
            : (HttpStatusCode.OK, Chat("Ein Creeper explodiert, wenn er dir nahe kommt.", "nvidia/nemotron-3.5-lightning:free")));
        var a = Make(dir, s, fake);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { RouterBase = "https://openrouter.ai/api/v1", RouterKey = Key }, atPc: false)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { RouterBase = "http://evil.example/v1" }, atPc: true)).Code); // no http to the internet
        Assert.Equal("assistant-key", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { Mode = "router" }, atPc: true)).Code);
        a.Configure(new AssistantService.Config { RouterBase = "https://openrouter.ai/api/v1", RouterKey = Key }, atPc: true);

        // The model list comes live from the router – free ones first, nothing hard-coded.
        var models = JsonSerializer.SerializeToElement(await a.RouterModelsAsync(), Json.Options).GetProperty("models");
        Assert.Equal("google/gemma-4-31b-it:free", models[0].GetProperty("id").GetString());
        Assert.True(models[0].GetProperty("free").GetBoolean());
        Assert.False(models[1].GetProperty("free").GetBoolean());

        a.Configure(new AssistantService.Config { RouterModels = new() { "google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free" }, Mode = "router" }, atPc: true);
        var st = JsonSerializer.SerializeToElement(a.Status(), Json.Options);
        Assert.DoesNotContain("0123456789abcdef", st.GetRawText()); // the key never leaves the PC
        Assert.Contains(st.GetProperty("engines").EnumerateArray(), e => e.GetProperty("id").GetString() == "router" && e.GetProperty("label").GetString()!.Contains("(kostenlos)"));

        // "auto" = the router now; the answer names the model that really answered (the fallback).
        var r = JsonSerializer.SerializeToElement(await a.AskAsync("dev", "Handy", null, "Erklär mir bitte genau, warum Creeper in Minecraft explodieren und wie ich das verhindere"), Json.Options).GetProperty("reply");
        Assert.Equal("router", r.GetProperty("mode").GetString());
        Assert.Equal("nvidia/nemotron-3.5-lightning:free", r.GetProperty("model").GetString());
        Assert.Contains("Ausweichmodell", r.GetProperty("sources")[0].GetString());
        var req = fake.Requests.Last();
        Assert.Equal("https://openrouter.ai/api/v1/chat/completions", req.url);
        Assert.Equal("Bearer " + Key, req.auth);
        using var body = JsonDocument.Parse(req.body);
        Assert.Equal(2, body.RootElement.GetProperty("models").GetArrayLength()); // OpenRouter switches over itself
        Assert.Equal("system", body.RootElement.GetProperty("messages")[0].GetProperty("role").GetString());

        // Another address: the old key is not sent there.
        a.Configure(new AssistantService.Config { RouterBase = "http://192.168.0.20:20128/v1" }, atPc: true);
        Assert.False(JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("router").GetProperty("keySet").GetBoolean());
    }

    [Fact]
    public async Task Selbst_gehosteter_Router_im_Heimnetz_wechselt_bei_Ausfall_das_Modell_und_meldet_Fehler_verstaendlich()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var fake = new Fake((url, body) => body.Contains("\"model\":\"llama-big\"") ? (HttpStatusCode.TooManyRequests, "{}") : (HttpStatusCode.OK, Chat("{\"answered\":true,\"answer\":\"Daedrische Waffen [1].\",\"best\":1}", "qwen-small")));
        var a = Make(dir, s, fake);
        a.Configure(new AssistantService.Config { RouterBase = "http://127.0.0.1:4000/v1", RouterModels = new() { "llama-big", "qwen-small" } }, atPc: true); // LiteLLM without key
        var res = JsonSerializer.SerializeToElement(await a.SummarizeAsync(new SourceAnswer.Request { Question = "Stärkste Waffe in Skyrim?", Passages = { new() { Title = "Weapons", Source = "UESP", Url = "https://en.uesp.net/wiki/Skyrim:Weapons", Text = "Daedric weapons are the strongest standard weapons." } } }), Json.Options);
        Assert.Equal("KI-Router", res.GetProperty("provider").GetString());
        Assert.Equal("qwen-small", res.GetProperty("model").GetString());
        Assert.Equal(2, fake.Requests.Count); // first model rate-limited → next one, here at the PC
        Assert.Null(fake.Requests[0].auth);

        var down = new Fake((_, _) => (HttpStatusCode.PaymentRequired, "{}"));
        var b = Make(dir, s, down);
        b.Configure(new AssistantService.Config { RouterBase = "http://127.0.0.1:4000/v1", RouterModels = new() { "paid-model" } }, atPc: true);
        var e = await Assert.ThrowsAsync<RpcException>(() => b.AskAsync("dev", "PC", null, "Erklär mir bitte ausführlich, wie Redstone in Minecraft funktioniert", engine: "router"));
        Assert.Equal("assistant-limit", e.Code);
        Assert.Contains("kostenloses Modell", e.Message);
    }
}
