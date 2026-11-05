using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>
/// The free AI system (OpenRouter → Groq → Pollinations → Ollama) with the cost guard – against fake servers that behave like the real ones
/// (answers, 429 with Retry-After, 401, price lists, the Pollinations "budget reached" notice, network errors). The one rule: never a paid request.
/// </summary>
public class FreeAiTests
{
    const string OrKey = "sk-or-v1-0123456789abcdef0123456789";
    const string GrKey = "gsk_0123456789abcdef0123456789ab";
    const string Question = "Wie lange sollte ein Erwachsener im Durchschnitt schlafen?";

    sealed record Rec(string Method, string Url, string? Auth, string Body);
    sealed class Fake(Func<Rec, (HttpStatusCode code, string body, Dictionary<string, string>? headers)> answer) : HttpMessageHandler
    {
        public readonly List<Rec> Calls = new();
        public Func<DateTime>? Clock;
        /// <summary>While set, chat requests wait for it (a slow AI answer).</summary>
        public Task? Hold;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var rec = new Rec(r.Method.Method, r.RequestUri!.ToString(), r.Headers.Authorization?.ToString(), r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct));
            Calls.Add(rec);
            if (Hold != null && rec.Method == "POST") await Hold.WaitAsync(ct);
            var (code, body, headers) = answer(rec);
            if (code == 0) throw new HttpRequestException("offline");
            var resp = new HttpResponseMessage(code) { Content = new StringContent(body) };
            if (headers != null) foreach (var (k, v) in headers) resp.Headers.TryAddWithoutValidation(k, v);
            return resp;
        }
        public IEnumerable<Rec> Chats(string host) => Calls.Where(c => c.Method == "POST" && c.Url.Contains(host));
    }

    static (HttpStatusCode, string, Dictionary<string, string>?) Ok(string body) => (HttpStatusCode.OK, body, null);
    static string Chat(string text, string model = "x/y:free", int outTokens = 12) => JsonSerializer.Serialize(new { id = "x", model, choices = new[] { new { index = 0, message = new { role = "assistant", content = text } } }, usage = new { prompt_tokens = 20, completion_tokens = outTokens } });
    static string OrList(params (string id, string price, long ctx)[] m) => JsonSerializer.Serialize(new { data = m.Select(x => new { id = x.id, pricing = new { prompt = x.price, completion = x.price, request = "0", image = "0" }, context_length = x.ctx, architecture = new { input_modalities = new[] { "text" }, output_modalities = new[] { "text" } } }) });
    static string GrList(params string[] ids) => JsonSerializer.Serialize(new { data = ids.Select(i => new { id = i, active = true, context_window = 131072 }) });
    static (HttpStatusCode, string, Dictionary<string, string>?) Limit(string retry = "30") => (HttpStatusCode.TooManyRequests, "{\"error\":{\"message\":\"rate limit\"}}", new() { ["Retry-After"] = retry });

    static (AssistantService a, FreeAiHub hub) Make(TempDir dir, Pgl.Core.Services.CompanionServices s, HttpMessageHandler fake, Func<DateTime>? now = null)
    {
        var paths = new AppPaths(Path.Combine(dir.Path, "d"));
        var secrets = new GenericPlatform().Secrets;
        var hub = new FreeAiHub(paths, secrets, fake, now);
        return (new AssistantService(paths, secrets, new NullHub(), new AssistantData(s), freeAi: hub, now: now), hub);
    }
    static JsonElement Reply(object answer) => JsonSerializer.SerializeToElement(answer, Json.Options).GetProperty("reply");
    static JsonElement Js(object o) => JsonSerializer.SerializeToElement(o, Json.Options);
    static string Source0(JsonElement r) => r.GetProperty("sources")[0].GetString()!;
    static string AllSources(JsonElement r) => string.Join(" | ", r.GetProperty("sources").EnumerateArray().Select(x => x.GetString()));

    static JsonElement Model(string id, params (string k, object v)[] pricing)
    {
        var p = pricing.ToDictionary(x => x.k, x => x.v);
        return JsonSerializer.SerializeToElement(new { id, pricing = p });
    }

    // ------------------------------------------------------------------ the cost guard itself

    [Fact]
    public void Kostenwaechter_laesst_nur_echte_Gratis_Modelle_durch()
    {
        Assert.True(CostGuard.IsFreeOpenRouter(Model("meta/llama-3.3-70b:free", ("prompt", "0"), ("completion", "0"), ("request", "0"))));
        Assert.True(CostGuard.IsFreeOpenRouter(Model("openrouter/free", ("prompt", "0"), ("completion", "0"))));
        Assert.True(CostGuard.IsFreeOpenRouter(Model("a/b:free", ("prompt", 0), ("completion", 0))));
        Assert.False(CostGuard.IsFreeOpenRouter(Model("a/b:free", ("prompt", "0.0000001"), ("completion", "0"))));            // ":free" in the name but a price
        Assert.False(CostGuard.IsFreeOpenRouter(Model("a/b:free", ("prompt", "0"), ("completion", "0"), ("request", "0.01")))); // a per-request price
        Assert.False(CostGuard.IsFreeOpenRouter(Model("openrouter/auto", ("prompt", "-1"), ("completion", "-1"))));            // variable price – never
        Assert.False(CostGuard.IsFreeOpenRouter(Model("openrouter/fusion", ("prompt", "-1"), ("completion", "-1"))));
        Assert.False(CostGuard.IsFreeOpenRouter(Model("google/lyria-3-pro-preview", ("prompt", "0"), ("completion", "0"))));  // price 0 today, but no free marker
        Assert.False(CostGuard.IsFreeOpenRouter(Model("a/b:free", ("prompt", "kostenlos"), ("completion", "0"))));            // unreadable price = not free
        Assert.False(CostGuard.IsFreeOpenRouter(Model("a/b:free", ("completion", "0"))));                                       // price of the prompt missing
        Assert.False(CostGuard.IsFreeOpenRouter(JsonSerializer.SerializeToElement(new { id = "a/b:free" })));                    // no pricing at all
        Assert.False(CostGuard.IsFreeOpenRouter(JsonSerializer.SerializeToElement(new { id = "a/b:free", pricing = new { prompt = "0", completion = "0", overrides = new[] { new { x = 1 } } } })));
    }

    [Fact]
    public void Nur_diese_Adressen_und_nur_Chat_Modelle()
    {
        Assert.True(CostGuard.HostAllowed("openrouter", "https://openrouter.ai/api/v1/chat/completions"));
        Assert.False(CostGuard.HostAllowed("openrouter", "http://openrouter.ai/api/v1/chat/completions"));
        Assert.False(CostGuard.HostAllowed("openrouter", "https://evil.example/openrouter.ai"));
        Assert.False(CostGuard.HostAllowed("groq", "https://openrouter.ai/api/v1"));
        Assert.True(CostGuard.HostAllowed("pollinations", "https://text.pollinations.ai/openai"));
        Assert.False(CostGuard.HostAllowed("pollinations", "https://gen.pollinations.ai/v1/chat/completions"));                  // the keyed (paid-budget) endpoint is never used
        foreach (var bad in new[] { "meta/llama-guard-4-12b", "openai/whisper-large-v3", "nvidia/nemotron-3.5-content-safety:free", "x/text-embedding", "cohere/north-mini-code:free", "playai-tts" })
            Assert.False(CostGuard.IsChatModel(bad), bad);
        Assert.True(CostGuard.IsChatModel("openai/gpt-oss-120b"));
        Assert.True(CostGuard.Rank("openrouter/free", 200000) > CostGuard.Rank("openai/gpt-oss-120b:free", 131072));
        Assert.True(CostGuard.Rank("openai/gpt-oss-120b", 131072) > CostGuard.Rank("llama-3.1-8b-instant", 131072));
    }

    [Fact]
    public void Zahlungsaufforderung_ist_keine_Antwort_und_Dauer_Header_werden_gelesen()
    {
        Assert.True(CostGuard.LooksLikePaymentNotice("The API key used for this request has reached its budget. Please [raise the key budget](https://enter.pollinations.ai/…), then try again.", 0));
        Assert.True(CostGuard.LooksLikePaymentNotice("Please top up your credits.", 5));
        Assert.False(CostGuard.LooksLikePaymentNotice("Erwachsene brauchen etwa 7 bis 9 Stunden Schlaf.", 14));
        Assert.Equal(TimeSpan.FromSeconds(90.5), FreeAiHub.ParseDuration("1m30.5s"));
        Assert.Equal(TimeSpan.FromSeconds(45), FreeAiHub.ParseDuration("45s"));
        Assert.Equal(TimeSpan.FromHours(2), FreeAiHub.ParseDuration("2h"));
        Assert.Null(FreeAiHub.ParseDuration("bald"));
    }

    [Fact]
    public void Falsche_Schluessel_kommen_nie_in_die_Datei()
    {
        using var dir = new TempDir();
        var hub = new FreeAiHub(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, new Fake(_ => Ok("{}")));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => hub.Set("openrouter", null, "AIzaSyA0123456789abcdefghijklmnopqrstuv", null, null)).Code);   // a Google key
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => hub.Set("groq", null, OrKey, null, null)).Code);                                           // the other service's key
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => hub.Set("pollinations", null, "sk-or-v1-0123456789abcdef0123456789", null, null)).Code);   // Pollinations never gets a key
        Assert.False(hub.Configured("openrouter"));
        hub.Set("openrouter", null, OrKey, null, null);
        Assert.True(hub.Configured("openrouter"));
        Assert.DoesNotContain(OrKey, Js(hub.Providers()).GetRawText());
    }

    // ------------------------------------------------------------------ the chain

    [Fact]
    public async Task OpenRouter_antwortet_kostenlos_mit_Hoechstpreis_0_und_die_Antwort_nennt_den_Anbieter()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r => r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000), ("meta/llama-3.3-70b:free", "0", 131072), ("big/paid-model", "0.00003", 1000000), ("a/gpt-oss-120b:free", "0.5", 131072)))
            : r.Url.EndsWith("/key") ? Ok("{\"data\":{\"free_model_daily_requests\":{\"used\":3,\"limit\":50,\"remaining\":47}}}")
            : Ok(Chat("Etwa 7 bis 9 Stunden pro Nacht.", "meta/llama-3.3-70b:free")));
        var (a, hub) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, secureChannel: true);
        Assert.Equal("smart", Js(a.AiStatus()).GetProperty("mode").GetString());                         // the first free AI switches to "Automatisch"
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Contains("7 bis 9", r.GetProperty("text").GetString());
        Assert.Equal("openrouter", r.GetProperty("mode").GetString());
        Assert.StartsWith("Beantwortet von OpenRouter – kostenloses Modell (meta/llama-3.3-70b:free)", Source0(r));
        var chat = Assert.Single(fake.Chats("openrouter.ai"));
        using var body = JsonDocument.Parse(chat.Body);
        Assert.Equal("openrouter/free", body.RootElement.GetProperty("model").GetString());              // the free router first
        var mp = body.RootElement.GetProperty("provider").GetProperty("max_price");                        // OpenRouter itself refuses anything that is not free
        Assert.Equal(0, mp.GetProperty("prompt").GetInt32()); Assert.Equal(0, mp.GetProperty("completion").GetInt32());
        Assert.DoesNotContain(fake.Calls, c => c.Body.Contains("paid-model") || c.Body.Contains("gpt-oss-120b"));   // the paid one and the "free but priced" one are never asked
        Assert.All(fake.Calls, c => Assert.Equal("openrouter.ai", new Uri(c.Url).Host));
        Assert.All(fake.Calls.Where(c => c.Url.Contains("/chat")), c => Assert.Equal("Bearer " + OrKey, c.Auth));
    }

    [Fact]
    public async Task Gibt_es_nur_bezahlte_Modelle_wird_nichts_gesendet_und_JARVIS_sagt_es_offen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r => r.Url.EndsWith("/models") ? Ok(OrList(("big/paid-model", "0.00003", 1000000), ("x/y", "0.000001", 8000))) : Ok(Chat("sollte nie ankommen")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Empty(fake.Chats("openrouter.ai"));
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", r.GetProperty("text").GetString());
        Assert.Contains("Automatisch: eingebauter Assistent", Source0(r));
    }

    [Fact]
    public async Task Limit_bei_OpenRouter_wechselt_zu_Groq_und_merkt_sich_die_Pause()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Limit("30"))
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile", "whisper-large-v3", "openai/gpt-oss-120b"))
            : Ok(Chat("Sieben bis neun Stunden.", "openai/gpt-oss-120b")));
        var (a, hub) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.AiSet("groq", true, GrKey, null, null, true)).Code); // Groq: first confirm "free plan"
        a.AiSet("groq", null, GrKey, true, null, true);
        a.AiSet("groq", true, null, null, null, true);
        var r = Reply(await a.AskAsync("dev", "Handy", null, Question));
        Assert.Equal("groq", r.GetProperty("mode").GetString());
        Assert.StartsWith("Beantwortet von Groq – kostenloses Modell (openai/gpt-oss-120b)", Source0(r));
        Assert.Contains("OpenRouter: Limit erreicht", AllSources(r));
        Assert.Contains("deshalb antwortet Groq", AllSources(r));
        Assert.Equal(1, fake.Chats("openrouter.ai").Count());
        var st = Js(a.AiStatus()).GetProperty("providers").EnumerateArray().First(p => p.GetProperty("id").GetString() == "openrouter");
        Assert.Equal("cooldown", st.GetProperty("state").GetString());                                    // shown in the KI-Verwaltung with the time
        // the next question does not knock on the full door again
        await a.AskAsync("dev", "Handy", null, "Und wie viel Schlaf brauchen Kinder?");
        Assert.Equal(1, fake.Chats("openrouter.ai").Count());
        Assert.DoesNotContain(fake.Calls, c => c.Body.Contains("whisper"));                               // no speech model as chat model
    }

    [Fact]
    public async Task Ungueltiger_Schluessel_wird_verstaendlich_gemeldet_und_der_naechste_Anbieter_antwortet()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : (HttpStatusCode.Unauthorized, "{\"error\":{\"message\":\"No auth\"}}", null))
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : Ok(Chat("ok", "llama-3.3-70b-versatile")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Equal("groq", r.GetProperty("mode").GetString());
        Assert.Contains("OpenRouter: Schlüssel abgelehnt", AllSources(r));
        var o = Js(a.AiStatus()).GetProperty("providers").EnumerateArray().First(p => p.GetProperty("id").GetString() == "openrouter");
        Assert.Equal("error", o.GetProperty("state").GetString());
        Assert.Contains("abgelehnt", o.GetProperty("lastError").GetString());
        Assert.DoesNotContain(OrKey, Js(a.AiStatus()).GetRawText());
    }

    [Fact]
    public async Task Verbindungsfehler_und_Serverfehler_werden_uebersprungen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? ((HttpStatusCode)0, "", null)                                  // no connection
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : (HttpStatusCode.BadGateway, "bad gateway", null));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        var text = r.GetProperty("text").GetString()!;
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", text);
        Assert.Contains("OpenRouter:", text); Assert.Contains("Groq:", text);
    }

    [Fact]
    public async Task Pollinations_nur_mit_Zustimmung_ohne_Schluessel_und_das_Budget_Hinweis_ist_keine_Antwort()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var notice = JsonSerializer.Serialize(new { model = "gpt-oss", choices = new[] { new { message = new { role = "assistant", content = "The API key used for this request has reached its budget. Please [raise the key budget](https://enter.pollinations.ai/edit-key), then try again." } } }, usage = new { prompt_tokens = 0, completion_tokens = 0 } });
        var fake = new Fake(_ => Ok(notice));
        var (a, _) = Make(dir, s, fake);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.AiSet("pollinations", true, null, null, null, true)).Code);   // consent first
        Assert.Empty(fake.Calls);
        a.AiSet("pollinations", null, null, null, consent: true, true);
        a.AiSet("pollinations", true, null, null, null, true);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.DoesNotContain("budget", r.GetProperty("text").GetString()!.Split("\n")[^1], StringComparison.OrdinalIgnoreCase);   // the notice is not shown as an answer
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", r.GetProperty("text").GetString());
        var call = Assert.Single(fake.Calls);
        Assert.Equal("https://text.pollinations.ai/openai", call.Url);
        Assert.Null(call.Auth);                                                                           // never a key
        var p = Js(a.AiStatus()).GetProperty("providers").EnumerateArray().First(x => x.GetProperty("id").GetString() == "pollinations");
        Assert.Equal("cooldown", p.GetProperty("state").GetString());
    }

    [Fact]
    public async Task Pollinations_liefert_eine_echte_Antwort_wenn_der_Dienst_sie_gibt()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(_ => Ok(Chat("Etwa 7 bis 9 Stunden.", "gpt-oss", 14)));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("pollinations", null, null, null, consent: true, true);
        a.AiSet("pollinations", true, null, null, null, true);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Equal("pollinations", r.GetProperty("mode").GetString());
        Assert.StartsWith("Beantwortet von Pollinations – kostenloser Dienst ohne Konto", Source0(r));
        Assert.DoesNotContain("iPad", fake.Calls[0].Body);                                                // the device name does not leave the PC
    }

    [Fact]
    public async Task Reihenfolge_ist_aenderbar_und_ohne_Automatik_gibt_es_keinen_Wechsel()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Limit())
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : Ok(Chat("von Groq", "llama-3.3-70b-versatile")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        a.AiOrder(new[] { "groq", "openrouter", "pollinations", "ollama" });
        var r1 = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Equal("groq", r1.GetProperty("mode").GetString());
        Assert.Empty(fake.Chats("openrouter.ai"));                                                         // Groq first, so OpenRouter was not even asked
        Assert.Throws<RpcException>(() => a.AiOrder(new[] { "groq", "groq", "openrouter", "ollama" }));      // all four, once each
        // automatic switching off: only the first one is tried
        a.AiOrder(new[] { "openrouter", "groq", "pollinations", "ollama" });
        a.AiAuto(false);
        fake.Calls.Clear();
        var r2 = Reply(await a.AskAsync("dev", "iPad", null, "Wie viel Schlaf brauchen Kinder denn so?"));
        Assert.Empty(fake.Chats("api.groq.com"));
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", r2.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Die_Modellliste_wird_vor_der_Anfrage_neu_geprueft_und_wird_ein_Modell_kostenpflichtig_nicht_mehr_benutzt()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var now = new DateTime(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc);
        var listCalls = 0; var priced = false; var down = false;
        var fake = new Fake(r =>
        {
            if (r.Url.EndsWith("/models")) { listCalls++; if (down) return (HttpStatusCode.ServiceUnavailable, "", null); return Ok(OrList(("openrouter/free", priced ? "0.000002" : "0", 200000), ("meta/llama-3.3-70b:free", "0", 131072))); }
            return Ok(Chat("ok", "meta/llama-3.3-70b:free"));
        });
        var (a, _) = Make(dir, s, fake, () => now);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        await a.AskAsync("dev", "iPad", null, "Erste Frage zum Schlaf bitte?");
        Assert.Equal(1, listCalls);
        now += TimeSpan.FromMinutes(2);  await a.AskAsync("dev", "iPad", null, "Zweite Frage zum Schlaf bitte?");
        Assert.Equal(1, listCalls);                                                                        // still fresh
        priced = true; now += TimeSpan.FromMinutes(6);                                                     // the router became priced
        fake.Calls.Clear();
        await a.AskAsync("dev", "iPad", null, "Dritte Frage zum Schlaf bitte?");
        Assert.Equal(2, listCalls);                                                                        // checked again before the request
        using (var body = JsonDocument.Parse(Assert.Single(fake.Chats("openrouter.ai")).Body)) Assert.Equal("meta/llama-3.3-70b:free", body.RootElement.GetProperty("model").GetString());
        // the list cannot be refreshed: trusted for 30 minutes, then nothing is sent any more
        down = true; fake.Calls.Clear(); now += TimeSpan.FromMinutes(10);
        await a.AskAsync("dev", "iPad", null, "Vierte Frage zum Schlaf bitte?");
        Assert.Single(fake.Chats("openrouter.ai"));
        now += TimeSpan.FromMinutes(40); fake.Calls.Clear();
        var r = Reply(await a.AskAsync("dev", "iPad", null, "Fünfte Frage zum Schlaf bitte?"));
        Assert.Empty(fake.Chats("openrouter.ai"));                                                         // cannot check "free" any more → not used
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", r.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Dieselbe_Frage_zweimal_in_Sekunden_wird_nur_einmal_gesendet()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r => r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Ok(Chat("Einmal beantwortet.", "x/y:free")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        var first = Js(await a.AskAsync("dev", "iPad", null, Question));
        var id = first.GetProperty("conversationId").GetString();
        var again = Reply(await a.AskAsync("dev", "iPad", id, Question));
        Assert.Equal(1, fake.Chats("openrouter.ai").Count());
        Assert.Contains("Einmal beantwortet", again.GetProperty("text").GetString());
    }

    [Fact]
    public async Task Befehle_und_PC_Werte_bleiben_am_PC_ohne_dass_eine_KI_gefragt_wird()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        s.Library.AddSteam("252950", "Rocket League");
        var fake = new Fake(_ => Ok(Chat("sollte nicht gefragt werden")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        fake.Calls.Clear();
        var r = Reply(await a.AskAsync("dev", "Handy", null, "Starte Rocket League"));
        Assert.Equal("library.launch", r.GetProperty("actions")[0].GetProperty("method").GetString());
        Assert.Empty(fake.Calls);                                                                          // the game starts via the PC's own function – no AI, no internet
    }

    // ------------------------------------------------------------------ test button, status, keys

    [Fact]
    public async Task Verbindungstest_zeigt_Erfolg_Modelle_und_Tageslimit_bzw_den_Grund_des_Scheiterns()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var good = true;
        var fake = new Fake(r =>
            !good ? (HttpStatusCode.Unauthorized, "{}", null)
            : r.Url.EndsWith("/key") ? Ok("{\"data\":{\"free_model_daily_requests\":{\"used\":3,\"limit\":50,\"remaining\":47}}}")
            : r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000), ("meta/llama-3.3-70b:free", "0", 131072), ("paid/x", "0.1", 1000)))
            : Ok(Chat("Verbindung steht.", "meta/llama-3.3-70b:free")));
        var (a, _) = Make(dir, s, fake);
        Assert.False(Js(await a.AiTestAsync("openrouter")).GetProperty("ok").GetBoolean());                // no key yet
        a.AiSet("openrouter", null, OrKey, null, null, true);
        var t = Js(await a.AiTestAsync("openrouter"));
        Assert.True(t.GetProperty("ok").GetBoolean(), t.GetRawText());
        Assert.Equal(2, t.GetProperty("models").GetInt32());                                               // two free models; the paid one does not count
        var p = Js(a.AiStatus()).GetProperty("providers").EnumerateArray().First(x => x.GetProperty("id").GetString() == "openrouter");
        Assert.InRange(p.GetProperty("today").GetProperty("remaining").GetInt32(), 46, 47);   // 47 from OpenRouter, minus the test question itself
        Assert.Equal(50, p.GetProperty("today").GetProperty("limit").GetInt32());
        good = false;
        var bad = Js(await a.AiTestAsync("openrouter"));
        Assert.False(bad.GetProperty("ok").GetBoolean());
        Assert.Contains("Schlüssel", bad.GetProperty("message").GetString());
        Assert.DoesNotContain(OrKey, bad.GetRawText());
    }

    [Fact]
    public async Task Der_Schluessel_wird_nur_ueber_sichere_Verbindungen_angenommen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var (a, _) = Make(dir, s, new Fake(_ => Ok("{}")));
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => a.AiSet("openrouter", null, OrKey, null, null, secureChannel: false)).Code);   // plain http in the home network
        var st = Js(a.AiSet("openrouter", null, OrKey, null, null, secureChannel: true));
        Assert.DoesNotContain(OrKey, st.GetRawText());
        Assert.True(st.GetProperty("providers").EnumerateArray().First(p => p.GetProperty("id").GetString() == "openrouter").GetProperty("keySet").GetBoolean());
        a.AiSet("openrouter", null, "", null, null, secureChannel: true);                                  // removing works and switches the AI off
        Assert.False(a.FreeAi.Configured("openrouter"));
        Assert.Equal("local", Js(a.AiStatus()).GetProperty("mode").GetString());                           // no free AI left → built-in assistant
    }

    [Fact]
    public async Task Ein_Router_der_frueheren_Version_wird_uebernommen_bei_OpenRouter_nur_mit_Gratis_Modellen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var paths = new AppPaths(Path.Combine(dir.Path, "d"));
        var secrets = new GenericPlatform().Secrets;
        var a0 = new AssistantService(paths, secrets, new NullHub(), new AssistantData(s));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a0.Configure(new AssistantService.Config { RouterBase = "https://openrouter.ai/api/v1", RouterKey = OrKey, RouterModels = new() { "openai/gpt-5" } }, atPc: true)).Code);   // a paid model at OpenRouter
        a0.Configure(new AssistantService.Config { RouterBase = "https://openrouter.ai/api/v1", RouterKey = OrKey, RouterModels = new() { "meta/llama-3.3-70b:free" } }, atPc: true);
        File.Delete(paths.File("freeai.json"));                                                            // as if the update just came in
        var a1 = new AssistantService(paths, secrets, new NullHub(), new AssistantData(s), freeAi: new FreeAiHub(paths, secrets, new Fake(_ => Ok("{}"))));
        Assert.True(a1.FreeAi.Configured("openrouter"));                                                   // the key moved over, still protected
        Assert.False(a1.FreeAi.Configured("groq"));
    }

    // ------------------------------------------------------------------ speed: commands do not wait, the free limit of Pollinations is waited out

    [Fact]
    public async Task Ein_Befehl_wartet_nicht_auf_eine_langsame_KI_Antwort_im_selben_Gespraech()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        s.Library.AddSteam("252950", "Rocket League");
        var hold = new TaskCompletionSource();
        var fake = new Fake(r => r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Ok(Chat("Spät, aber da.", "x/y:free")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        var id = Js(await a.AskAsync("dev", "iPad", null, "Eine erste schnelle Frage zum Schlaf?")).GetProperty("conversationId").GetString();
        fake.Hold = hold.Task;                                                  // from now on the AI answers slowly
        var slow = a.AskAsync("dev", "iPad", id, "Eine zweite Frage, die lange dauert?");
        await Task.Delay(300);
        Assert.False(slow.IsCompleted);                                          // really waiting for the AI
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var cmd = Reply(await a.AskAsync("dev", "iPad", id, "Starte Rocket League"));   // same conversation
        Assert.True(sw.ElapsedMilliseconds < 2000, $"der Befehl hat {sw.ElapsedMilliseconds} ms gewartet");
        Assert.Equal("library.launch", cmd.GetProperty("actions")[0].GetProperty("method").GetString());
        Assert.False(slow.IsCompleted);                                          // the slow answer is still pending
        hold.SetResult();
        Assert.Contains("Spät, aber da.", Reply(await slow).GetProperty("text").GetString());
    }

    [Fact]
    public async Task Pollinations_Tempolimit_402_ist_keine_Bezahlforderung_und_wird_kurz_abgewartet()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var calls = 0;
        var fake = new Fake(r =>
        {
            calls++;
            return calls == 1
                ? (HttpStatusCode.PaymentRequired, "{\"status\":402,\"success\":false,\"error\":{\"code\":\"FREE_LIMIT\",\"message\":\"Free limit reached: 1 reply every 45 seconds per IP\"}}", new Dictionary<string, string> { ["Retry-After"] = "1" })
                : Ok(Chat("Nach kurzem Warten beantwortet.", "gpt-oss", 14));
        });
        var (a, _) = Make(dir, s, fake);
        a.AiSet("pollinations", null, null, null, consent: true, true);
        a.AiSet("pollinations", true, null, null, null, true);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Contains("Nach kurzem Warten beantwortet.", r.GetProperty("text").GetString());   // the only provider: waited out once, then answered
        Assert.InRange(sw.ElapsedMilliseconds, 900, 8000);
        Assert.Equal(2, fake.Calls.Count);
        using var body = JsonDocument.Parse(fake.Calls[0].Body);
        Assert.Equal("openai-fast", body.RootElement.GetProperty("model").GetString());
        Assert.Equal("low", body.RootElement.GetProperty("reasoning_effort").GetString());          // fewer thinking tokens → quicker
        Assert.True(body.RootElement.GetProperty("max_tokens").GetInt32() <= 500);
    }

    [Fact]
    public async Task Pollinations_Tempolimit_bei_weiteren_Anbietern_wechselt_sofort_statt_zu_warten()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("text.pollinations.ai") ? (HttpStatusCode.PaymentRequired, "{\"error\":{\"code\":\"FREE_LIMIT\"}}", new() { ["Retry-After"] = "20" })
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : Ok(Chat("Von Groq.", "llama-3.3-70b-versatile")));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("groq", null, GrKey, true, null, true);
        a.AiSet("pollinations", null, null, null, consent: true, true);
        a.AiSet("pollinations", true, null, null, null, true);
        a.AiOrder(new[] { "pollinations", "groq", "openrouter", "ollama" });
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.True(sw.ElapsedMilliseconds < 5000);                                                  // did not wait the 20 s
        Assert.Equal("groq", r.GetProperty("mode").GetString());
        Assert.Contains("Pollinations: Limit erreicht", AllSources(r));
    }

    [Fact]
    public async Task Ein_zu_langsamer_Anbieter_wird_nach_dem_Zeitlimit_uebersprungen()
    {
        using var dir = new TempDir();
        var hold = new TaskCompletionSource();
        var fake = new Fake(_ => Ok(Chat("zu spät"))) { Hold = hold.Task };
        var hub = new FreeAiHub(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets, fake);
        hub.Set("pollinations", null, null, null, true);
        hub.Set("pollinations", true, null, null, null);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var e = await Assert.ThrowsAsync<ProviderException>(() => hub.AskAsync("pollinations", "x", new[] { new GeminiClient.Turn("user", "Frage?") }, default, timeout: TimeSpan.FromMilliseconds(300)));
        hold.SetResult();
        Assert.Equal("busy", e.Kind);
        Assert.True(sw.ElapsedMilliseconds < 3000);
    }

    // ------------------------------------------------------------------ how the AIs work together

    static (HttpStatusCode, string, Dictionary<string, string>?) GroqOrOr(Rec r, string orText, string grText) =>
        r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Ok(Chat(orText, "x/y:free")))
        : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : Ok(Chat(grText, "llama-3.3-70b-versatile"));

    [Fact]
    public async Task Schnellster_gewinnt_OpenRouter_und_Groq_werden_gleichzeitig_gefragt_und_die_schnellere_Antwort_zaehlt()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var slow = new TaskCompletionSource();
        var fake = new Fake(r => GroqOrOr(r, "Langsam von OpenRouter.", "Schnell von Groq."));
        // OpenRouter's chat answer is held back until released; Groq answers at once
        var orHold = slow.Task;
        var gated = new Gate(fake, orHold);
        var (a, hub) = Make(dir, s, gated.Handler);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        Assert.Equal("race", Js(a.AiStrategy("race", null)).GetProperty("strategy").GetString());
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Equal("groq", r.GetProperty("mode").GetString());
        Assert.Contains("Schnellster gewinnt: Groq antwortete zuerst", AllSources(r));
        Assert.Equal(1, gated.Held);                                                    // both were asked: OpenRouter's request was sent (and is still waiting) …
        Assert.Equal(1, fake.Chats("api.groq.com").Count());                            // … Groq answered
        slow.SetResult();                                                               // … the slower one is simply let go
    }

    [Fact]
    public async Task Schnellster_gewinnt_faellt_ein_Anbieter_aus_antwortet_der_andere_und_faellen_beide_aus_geht_es_der_Reihe_nach_weiter()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Limit())
            : r.Url.Contains("api.groq.com") ? (r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : (HttpStatusCode.BadGateway, "x", null))
            : Ok(Chat("Zuletzt von Pollinations.", "gpt-oss", 14)));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        a.AiSet("pollinations", null, null, null, consent: true, true);
        a.AiSet("pollinations", true, null, null, null, true);
        a.AiStrategy("race", null);
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Equal("pollinations", r.GetProperty("mode").GetString());              // the race failed, the rest of the order answered
        Assert.Contains("OpenRouter: Limit erreicht", AllSources(r));
        Assert.Contains("Groq:", AllSources(r));
    }

    [Fact]
    public async Task Nur_eine_KI_fragt_nur_diese_und_wechselt_nie_zu_einer_anderen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var fake = new Fake(r =>
            r.Url.Contains("openrouter.ai") ? (r.Url.EndsWith("/models") ? Ok(OrList(("openrouter/free", "0", 200000))) : Ok(Chat("Von OpenRouter.", "x/y:free")))
            : r.Url.EndsWith("/models") ? Ok(GrList("llama-3.3-70b-versatile")) : (HttpStatusCode.TooManyRequests, "{}", new() { ["Retry-After"] = "30" }));
        var (a, _) = Make(dir, s, fake);
        a.AiSet("openrouter", null, OrKey, null, null, true);
        a.AiSet("groq", null, GrKey, true, null, true);
        a.AiStrategy("single", "groq");
        var st = Js(a.AiStatus());
        Assert.Equal("single", st.GetProperty("strategy").GetString()); Assert.Equal("groq", st.GetProperty("single").GetString());
        var r = Reply(await a.AskAsync("dev", "iPad", null, Question));
        Assert.Empty(fake.Chats("openrouter.ai"));                                      // OpenRouter is ready but was not asked
        Assert.Contains("Momentan ist keine kostenlose externe KI erreichbar.", r.GetProperty("text").GetString());
        // switching the one AI is one call
        a.AiStrategy("single", "openrouter");
        var r2 = Reply(await a.AskAsync("dev", "iPad", null, "Und wie viel Schlaf brauchen Kinder denn so?"));
        Assert.Equal("openrouter", r2.GetProperty("mode").GetString());
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.AiStrategy("mix", null)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => a.AiStrategy("single", "gemini")).Code);
    }

    [Fact]
    public async Task Die_Betriebsart_bleibt_gespeichert_und_der_alte_Schalter_wird_uebernommen()
    {
        using var dir = new TempDir(); await using var s = Fixtures.Services(dir);
        var paths = new AppPaths(Path.Combine(dir.Path, "d"));
        var secrets = new GenericPlatform().Secrets;
        var hub = new FreeAiHub(paths, secrets, new Fake(_ => Ok("{}")));
        hub.SetStrategy("race", null);
        Assert.Equal("race", new FreeAiHub(paths, secrets, new Fake(_ => Ok("{}"))).Strategy);                // survives a restart
        File.WriteAllText(paths.File("freeai.json"), "{\"auto\": false}");                                      // file of an earlier version: automatic switching off
        Assert.Equal("single", new FreeAiHub(paths, secrets, new Fake(_ => Ok("{}"))).Strategy);
    }

    /// <summary>Holds back the chat answer of one host (OpenRouter) until released.</summary>
    sealed class Gate
    {
        public HttpMessageHandler Handler { get; }
        public int Held => ((Inner)Handler).Held;
        public Gate(Fake inner, Task hold) => Handler = new Inner(inner, hold);
        sealed class Inner(HttpMessageHandler inner, Task hold) : DelegatingHandler(inner)
        {
            public int Held;
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
            {
                if (r.Method == HttpMethod.Post && r.RequestUri!.Host == "openrouter.ai") { Interlocked.Increment(ref Held); await hold.WaitAsync(ct); }
                return await base.SendAsync(r, ct);
            }
        }
    }
}
