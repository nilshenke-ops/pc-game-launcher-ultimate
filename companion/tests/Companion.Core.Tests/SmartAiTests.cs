using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>"Automatisch": commands at the PC, questions per free AI with a chain (Gemini → router → local) – against fake servers.</summary>
public class SmartAiTests
{
    const string GemKey = "AIzaSyA0123456789abcdefghijklmnopqrstuv";
    const string RouterKey = "sk-or-v1-0123456789abcdef0123456789";

    sealed class Fake(Func<string, string, (HttpStatusCode, string)> answer) : HttpMessageHandler
    {
        public readonly List<string> Urls = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            Urls.Add(r.RequestUri!.ToString());
            var (code, text) = answer(r.RequestUri!.ToString(), body);
            return new HttpResponseMessage(code) { Content = new StringContent(text) };
        }
    }
    static string GemOk(string text) => JsonSerializer.Serialize(new { candidates = new[] { new { content = new { role = "model", parts = new object[] { new { text } } }, finishReason = "STOP" } }, usageMetadata = new { promptTokenCount = 10, candidatesTokenCount = 5 }, modelVersion = "gemini-3.5-flash-lite" });
    static string RouterOk(string text, string model = "google/gemma-4-31b-it:free") => JsonSerializer.Serialize(new { id = "x", model, choices = new[] { new { index = 0, message = new { role = "assistant", content = text } } }, usage = new { prompt_tokens = 10, completion_tokens = 5 } });
    static string Models(params (string id, bool free, int ctx)[] m) => JsonSerializer.Serialize(new { data = m.Select(x => new { id = x.id, pricing = new { prompt = x.free ? "0" : "0.001", completion = x.free ? "0" : "0.002" }, context_length = x.ctx }) });

    static AssistantService Make(TempDir dir, Pgl.Core.Services.CompanionServices s, Fake? gemini, Fake? router) =>
        new(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new NullHub(), new AssistantData(s),
            gemini: gemini == null ? null : new GeminiClient(gemini) { BaseUrl = "http://gemini.test" }, router: router == null ? null : new OpenAiCompatClient(router));

    static JsonElement Reply(object answer) => JsonSerializer.SerializeToElement(answer, Json.Options).GetProperty("reply");
    const string Question = "Wie lange sollte ein Erwachsener im Durchschnitt schlafen?";

    [Fact]
    public async Task Der_erste_kostenlose_Schluessel_schaltet_auf_Automatisch_und_Fragen_gehen_an_Gemini()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var gem = new Fake((_, _) => (HttpStatusCode.OK, GemOk("Etwa 7 bis 9 Stunden pro Nacht.")));
        var a = Make(dir, s, gem, null);
        Assert.Equal("local", JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("mode").GetString());
        Assert.Equal("assistant-key", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { Mode = "smart" }, atPc: true)).Code); // nothing free set up yet
        a.Configure(new AssistantService.Config { GeminiKey = GemKey }, atPc: true);
        var st = JsonSerializer.SerializeToElement(a.Status(), Json.Options);
        Assert.Equal("smart", st.GetProperty("mode").GetString());                    // switched by itself
        Assert.Equal("smart", st.GetProperty("engines")[0].GetProperty("id").GetString()); // offered first
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.True(r.GetProperty("text").GetString()!.Contains("7 bis 9"), r.GetRawText());
        Assert.Equal("gemini", r.GetProperty("mode").GetString());
        Assert.StartsWith("Automatisch: Gemini", r.GetProperty("sources")[0].GetString());
    }

    [Fact]
    public async Task Ist_Gemini_ausgelastet_springt_der_Router_ein_und_die_Antwort_sagt_es()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var gem = new Fake((_, _) => (HttpStatusCode.TooManyRequests, "{}"));
        var router = new Fake((url, _) => url.EndsWith("/models") ? (HttpStatusCode.OK, Models(("google/gemma-4-31b-it:free", true, 262144))) : (HttpStatusCode.OK, RouterOk("Sieben bis neun Stunden.")));
        var a = Make(dir, s, gem, router);
        a.Configure(new AssistantService.Config { GeminiKey = GemKey, RouterBase = "https://openrouter.ai/api/v1", RouterKey = RouterKey, RouterModels = new() { "google/gemma-4-31b-it:free" } }, atPc: true);
        Assert.Equal("smart", JsonSerializer.SerializeToElement(a.Status(), Json.Options).GetProperty("mode").GetString());
        var r = Reply(await a.AskAsync("dev", "Handy", null, Question));
        Assert.True(r.GetProperty("mode").GetString() == "router", r.GetRawText());
        var src = r.GetProperty("sources")[0].GetString()!;
        Assert.Contains("Gemini", src); Assert.Contains("deshalb antwortet KI-Router", src);
        Assert.Single(gem.Urls);                                  // Gemini was tried once, not again for the same question
        // The turn that did not work is not kept in Gemini's history: the next question starts clean.
        gem.Urls.Clear();
        var r2 = Reply(await a.AskAsync("dev", "Handy", null, "Und wie viel Schlaf brauchen Kinder?"));
        Assert.Equal("router", r2.GetProperty("mode").GetString());
    }

    [Fact]
    public async Task Antwortet_keine_freie_KI_antwortet_der_eingebaute_Assistent_und_nennt_die_Gruende()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var gem = new Fake((_, _) => (HttpStatusCode.Forbidden, "{}"));
        var a = Make(dir, s, gem, null);
        a.Configure(new AssistantService.Config { GeminiKey = GemKey }, atPc: true);
        var r = Reply(await a.AskAsync("dev", "Handy", null, Question));
        var text = r.GetProperty("text").GetString()!;
        Assert.True(text.Contains("Keine freie KI konnte gerade antworten"), r.GetRawText());
        Assert.Contains("Gemini:", text);
        Assert.Contains("Automatisch: eingebauter Assistent", r.GetProperty("sources")[0].GetString());
    }

    [Fact]
    public async Task Befehle_und_PC_Werte_bleiben_am_PC_ohne_dass_eine_KI_gefragt_wird()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        s.Library.AddSteam("252950", "Rocket League");
        var gem = new Fake((_, _) => (HttpStatusCode.OK, GemOk("sollte nicht gefragt werden")));
        var a = Make(dir, s, gem, null);
        a.Configure(new AssistantService.Config { GeminiKey = GemKey }, atPc: true);
        var r = Reply(await a.AskAsync("dev", "Handy", null, "Starte Rocket League"));
        Assert.Equal("library.launch", r.GetProperty("actions")[0].GetProperty("method").GetString());
        Assert.Empty(gem.Urls);                                   // the game starts via the PC's own function – no AI involved
        Assert.Contains("Befehl", r.GetProperty("sources").EnumerateArray().Select(x => x.GetString()).First(x => x!.StartsWith("Automatisch"))!);
    }

    [Fact]
    public async Task Ein_Klick_Einrichter_waehlt_kostenlose_Modelle_und_schaltet_auf_Automatisch()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var router = new Fake((url, _) => url.EndsWith("/models")
            ? (HttpStatusCode.OK, Models(("openai/gpt-6", false, 400000), ("a/small:free", true, 8000), ("b/big:free", true, 262144), ("c/mid:free", true, 65536), ("d/other:free", true, 4000)))
            : (HttpStatusCode.OK, RouterOk("ok")));
        var a = Make(dir, s, null, router);
        await Assert.ThrowsAsync<RpcException>(() => a.QuickRouterAsync("openrouter", RouterKey, atPc: false));          // keys only at the PC
        await Assert.ThrowsAsync<RpcException>(() => a.QuickRouterAsync("mistral", RouterKey, atPc: true));              // only the known presets
        await Assert.ThrowsAsync<RpcException>(() => a.QuickRouterAsync("openrouter", "kurz", atPc: true));
        var st = JsonSerializer.SerializeToElement(await a.QuickRouterAsync("openrouter", RouterKey, atPc: true), Json.Options);
        var models = st.GetProperty("router").GetProperty("models").EnumerateArray().Select(x => x.GetString()).ToList();
        Assert.Equal(new[] { "b/big:free", "c/mid:free", "a/small:free" }, models);   // free ones only, biggest context first, at most three
        Assert.Equal("smart", st.GetProperty("mode").GetString());
        Assert.DoesNotContain(RouterKey, st.GetRawText());
    }
}
