using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Anthropic;
using Pgl.Core.Assistant;
using Pgl.Core.Services;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

public class AssistantTests
{
    static async Task<CompanionServices> Setup(TempDir dir)
    {
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        s.Library.AddSteam("252950", "Rocket League");
        s.Library.AddSteam("730", "Counter-Strike 2");
        var wav = Encoding.ASCII.GetBytes("RIFF\x24\0\0\0WAVEfmt ").Concat(new byte[200]).ToArray();
        var up = (await admin.Ok("sounds.uploadBegin", new { name = "Airhorn.wav", size = wav.Length })).GetProperty("uploadId").GetString();
        await admin.Ok("sounds.uploadChunk", new { uploadId = up, data = Convert.ToBase64String(wav) });
        await admin.Ok("sounds.uploadEnd", new { uploadId = up });
        await admin.Ok("profiles.save", new { profile = new { id = "", name = "Streaming", icon = "radio", color = "#22d3ee", gameIds = Array.Empty<string>(), launchProgramIds = Array.Empty<string>(), quickActionIds = Array.Empty<string>(), hotkeyIds = Array.Empty<string>() } });
        await admin.Ok("quick.save", new { name = "Abendrunde", steps = new[] { new { type = "stopAllSounds" } } });
        return s;
    }

    [Fact]
    public void Knowledge_base_contains_the_shipped_docs_and_finds_topics()
    {
        var kb = KnowledgeBase.Embedded;
        Assert.True(kb.Sections.Count > 40, $"nur {kb.Sections.Count} Abschnitte");
        Assert.Contains(kb.Sections, x => x.Source == "Fehlerbehebung");
        Assert.Contains(kb.Sections, x => x.Source == "Datenschutz");
        Assert.Equal("Discord einrichten: Sounds für andere hörbar machen", kb.Search("Wie hören andere in Discord meine Sounds?")[0].section.Title);
        Assert.Equal("Zugriff von unterwegs", kb.Search("Kann ich unterwegs mit 5G auf den PC zugreifen?")[0].section.Title);
        Assert.Equal("Deal Radar", kb.Search("wo stelle ich einen zielpreis ein")[0].section.Title);
        Assert.Empty(kb.Search("und oder der"));
    }

    [Fact]
    public void Every_page_of_the_web_app_is_described()
    {
        // The routes of web/src/App.tsx – the assistant must know every page it can send the user to.
        var app = File.ReadAllText(Path.Combine(Fixtures.RepoRoot, "web/src/App.tsx"));
        var paths = System.Text.RegularExpressions.Regex.Matches(app, "path=\"(/[a-z-]*)\"").Select(m => m.Groups[1].Value).Where(p => !p.StartsWith("/desktop-widget")).ToHashSet();
        var known = KnowledgeBase.Embedded.Sections.Where(x => x.Page != null).Select(x => x.Page!.Split('?')[0]).ToHashSet();
        Assert.Empty(paths.Where(p => !known.Contains(p)));
    }

    [Theory]
    [InlineData("rocket", "Rocket League", 0.8)]
    [InlineData("Rocket Leage", "Rocket League", 0.8)]
    [InlineData("rl", "Rocket League", 0.75)]
    [InlineData("counter strike", "Counter-Strike 2", 0.65)]
    public void Fuzzy_names(string q, string name, double min) => Assert.True(AssistantData.Similarity(q, name) >= min, $"{q} → {name}: {AssistantData.Similarity(q, name)}");

    [Fact]
    public void Unrelated_names_do_not_match() => Assert.Null(AssistantData.Best("Minecraft", new[] { "Rocket League", "Counter-Strike 2" }, x => x));

    [Fact]
    public async Task Local_assistant_understands_commands_and_only_suggests()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        var local = s.Assistant.Local;

        var r = await local.AnswerAsync("Starte Rocket League");
        var a = Assert.Single(r.Actions);
        Assert.Equal("library.launch", a.Method);
        Assert.Equal(s.Library.List().First(i => i.Name == "Rocket League").Id, a.Params["id"]);
        Assert.True(a.Confirm);
        Assert.Empty(s.Sessions.Running()); // nothing was started

        r = await local.AnswerAsync("spiel sound airhorn");
        Assert.Equal("sounds.play", Assert.Single(r.Actions).Method);
        r = await local.AnswerAsync("Profil Streaming aktivieren");
        Assert.Equal("profiles.activate", Assert.Single(r.Actions).Method);
        r = await local.AnswerAsync("führe abendrunde aus");
        Assert.Equal("quick.run", Assert.Single(r.Actions).Method);
        r = await local.AnswerAsync("stopp alle sounds");
        Assert.Equal("sounds.stopAll", Assert.Single(r.Actions).Method);
        r = await local.AnswerAsync("Öffne Deal Radar");
        Assert.Equal("/deals", Assert.Single(r.Actions).Path);
        r = await local.AnswerAsync("Mir ist langweilig. Welche Spiele habe ich überhaupt?");
        Assert.Contains("Rocket League", r.Text);
        Assert.Contains("Counter-Strike 2", r.Text);
        Assert.DoesNotContain("nicht gefunden", r.Text);
        r = await local.AnswerAsync("Ich weiß nicht so recht was ich heute Abend spielen soll mit meinen Freunden");
        Assert.DoesNotContain("nicht gefunden", r.Text); // a sentence is not a game name
        r = await local.AnswerAsync("Starte Minecraft");
        Assert.Contains("nicht gefunden", r.Text);
        Assert.DoesNotContain(r.Actions, x => x.Method != null);
    }

    [Fact]
    public async Task Simultaneous_questions_from_several_devices_do_not_mix()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        var names = Enumerable.Range(0, 40).Select(i => $"Spiel{i}xyz").ToList();
        var replies = await Task.WhenAll(names.Select(n => Task.Run(() => s.Assistant.Local.AnswerAsync("Starte " + n))));
        for (var i = 0; i < names.Count; i++) Assert.Contains($"„{names[i]}“", replies[i].Text);
    }

    [Fact]
    public async Task Local_assistant_answers_from_live_data_and_knowledge()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        var local = s.Assistant.Local;
        var rl = s.Library.List().First(i => i.Name == "Rocket League");
        var start = DateTime.UtcNow.AddMinutes(-95);
        s.History.SessionStarted(rl, start);
        s.History.SessionEnded(rl.Id, DateTime.UtcNow.AddMinutes(-5));

        var r = await local.AnswerAsync("Wie lange habe ich heute Rocket League gespielt?");
        Assert.Contains("1 Std. 30 Min.", r.Text);
        Assert.Contains("Gaming-Verlauf", r.Sources);
        r = await local.AnswerAsync("wie viel habe ich insgesamt gespielt");
        Assert.Contains("1 Std. 30 Min.", r.Text);

        r = await local.AnswerAsync("Wie geht es meinem PC?");
        Assert.Contains("CPU", r.Text);
        r = await local.AnswerAsync("welches level habe ich");
        Assert.StartsWith("Level 1", r.Text);
        r = await local.AnswerAsync("gibt es deals auf meiner wunschliste");
        Assert.Contains("Wunschliste ist leer", r.Text);

        r = await local.AnswerAsync("Wie richte ich Discord mit dem Soundboard ein?");
        Assert.Contains("CABLE Input", r.Text);
        Assert.Equal("/audio", r.Actions.Single().Path);
        Assert.True(r.Confident);

        r = await local.AnswerAsync("xqzv plimbo");
        Assert.False(r.Confident);
        Assert.Contains("nicht verstanden", r.Text);
        Assert.NotEmpty(r.Suggestions);
    }

    [Fact]
    public async Task Rpc_ask_works_with_view_permission_and_the_key_is_local_only()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var r = await viewer.Ok("assistant.ask", new { text = "Starte Rocket League" });
        Assert.StartsWith("conv_", r.GetProperty("conversationId").GetString());
        Assert.Equal("library.launch", r.GetProperty("reply").GetProperty("actions")[0].GetProperty("method").GetString());
        // The suggestion runs with the device's own rights: a view-only device may not launch.
        Assert.Equal("forbidden", await viewer.Error("library.launch", new { id = s.Library.List()[0].Id }));
        Assert.Equal("forbidden", await viewer.Error("assistant.configure", new { mode = "claude" }));

        var (remoteAdmin, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "admin" });
        Assert.Equal("forbidden", await remoteAdmin.Error("assistant.configure", new { apiKey = "sk-ant-test-0123456789abcdef" }));
        Assert.Equal("assistant-key", await admin.Error("assistant.configure", new { mode = "claude" }));
        Assert.Equal("invalid-params", await admin.Error("assistant.configure", new { apiKey = "hallo" }));
        var st = await admin.Ok("assistant.configure", new { apiKey = "sk-ant-test-0123456789abcdef", mode = "claude", model = "claude-haiku-5-5" });
        Assert.True(st.GetProperty("keySet").GetBoolean());
        Assert.DoesNotContain("sk-ant", st.GetRawText());
        // Not in a backup either.
        var zip = s.Backup.CreateZip(includeSounds: false);
        using (var z = System.IO.Compression.ZipFile.OpenRead(zip)) Assert.DoesNotContain(z.Entries, e => e.Name.Contains("assistant"));
        // Mode and limit may be changed by a remote admin (no key involved).
        await remoteAdmin.Ok("assistant.configure", new { monthlyLimitUsd = 2.5 });
        st = await admin.Ok("assistant.configure", new { apiKey = "" });
        Assert.Equal("local", st.GetProperty("mode").GetString());
    }

    // ---------------------------------------------------------------- Claude against a local fake of the Messages API

    sealed class FakeClaude : IDisposable
    {
        readonly HttpListener _l = new();
        public string Url { get; }
        public List<JsonElement> Requests { get; } = new();
        public Queue<string> Responses { get; } = new();
        public List<string> Paths { get; } = new();
        public int Status = 200;
        public string? ErrorBody;
        public FakeClaude()
        {
            var probe = new TcpListener(IPAddress.Loopback, 0); probe.Start(); var port = ((IPEndPoint)probe.LocalEndpoint).Port; probe.Stop();
            Url = $"http://127.0.0.1:{port}";
            _l.Prefixes.Add(Url + "/");
            _l.Start();
            _ = Task.Run(async () =>
            {
                while (_l.IsListening)
                {
                    HttpListenerContext ctx;
                    try { ctx = await _l.GetContextAsync(); } catch { return; }
                    using var rd = new StreamReader(ctx.Request.InputStream);
                    var body = await rd.ReadToEndAsync();
                    lock (Requests) { Paths.Add(ctx.Request.Url!.AbsolutePath); if (body.Length > 0) Requests.Add(JsonDocument.Parse(body).RootElement.Clone()); }
                    var resp = Status == 200 ? Responses.Count > 0 ? Responses.Dequeue() : Text("leer") : ErrorBody ?? "{\"type\":\"error\",\"error\":{\"type\":\"authentication_error\",\"message\":\"invalid x-api-key\"}}";
                    ctx.Response.StatusCode = Status;
                    ctx.Response.ContentType = "application/json";
                    var bytes = Encoding.UTF8.GetBytes(resp);
                    await ctx.Response.OutputStream.WriteAsync(bytes);
                    ctx.Response.Close();
                }
            });
        }
        public static string Msg(string stop, object[] content, int input = 3000, int output = 120, int cacheRead = 0, int cacheWrite = 9000, string model = "claude-opus-5-5") =>
            JsonSerializer.Serialize(new { id = "msg_" + Guid.NewGuid().ToString("N")[..8], type = "message", role = "assistant", model, stop_reason = stop, stop_sequence = (string?)null, content,
                usage = new { input_tokens = input, output_tokens = output, cache_read_input_tokens = cacheRead, cache_creation_input_tokens = cacheWrite } });
        public static string Text(string t) => Msg("end_turn", new object[] { new { type = "text", text = t } });
        public void Dispose() { _l.Stop(); _l.Close(); }
    }

    static AssistantService WithFake(CompanionServices s, TempDir dir, FakeClaude fake, Func<DateTime>? now = null)
    {
        var data = new AssistantData(s);
        var claude = new ClaudeAssistant(data, key => new AnthropicClient { ApiKey = key, BaseUrl = fake.Url, MaxRetries = 0, Timeout = TimeSpan.FromSeconds(20) });
        var a = new AssistantService(new AppPaths(Path.Combine(dir.Path, "a")), new GenericPlatform().Secrets, new NullHub(), data, claude, now);
        a.Configure(new AssistantService.Config { ApiKey = "sk-ant-test-0123456789abcdef", Mode = "claude" }, atPc: true);
        return a;
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public async Task Claude_reads_data_through_tools_and_turns_actions_into_buttons()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        fake.Responses.Enqueue(FakeClaude.Msg("tool_use", new object[]
        {
            new { type = "thinking", thinking = "", signature = "sig-1" },
            new { type = "text", text = "Ich schaue nach." },
            new { type = "tool_use", id = "tu_1", name = "get_pc_status", input = new { } },
            new { type = "tool_use", id = "tu_2", name = "suggest_action", input = new { kind = "launch", target = "rocket league" } },
            new { type = "tool_use", id = "tu_3", name = "suggest_action", input = new { kind = "launch", target = "Minecraft" } },
        }));
        fake.Responses.Enqueue(FakeClaude.Msg("end_turn", new object[] { new { type = "text", text = "Dein PC ist entspannt. Tippe auf „Rocket League starten“." } }, input: 200, output: 40, cacheRead: 9000, cacheWrite: 0));
        var a = WithFake(s, dir, fake);

        var r = J(await a.AskAsync("local", "PC", null, "Wie geht es meinem PC und kannst du Rocket League starten?"));
        var reply = r.GetProperty("reply");
        Assert.Equal("claude", reply.GetProperty("mode").GetString());
        Assert.Contains("Tippe auf", reply.GetProperty("text").GetString());
        var action = Assert.Single(reply.GetProperty("actions").EnumerateArray());
        Assert.Equal("library.launch", action.GetProperty("method").GetString());
        Assert.Contains("PC-Messung (jetzt)", reply.GetProperty("sources").EnumerateArray().Select(x => x.GetString()));
        Assert.Empty(s.Sessions.Running()); // nothing started by the assistant

        Assert.Equal(2, fake.Requests.Count);
        var first = fake.Requests[0];
        Assert.Equal("claude-opus-5-5", first.GetProperty("model").GetString());
        Assert.Equal("default", first.GetProperty("fallbacks").GetString());
        Assert.Equal("ephemeral", first.GetProperty("system")[0].GetProperty("cache_control").GetProperty("type").GetString());
        Assert.Contains("CABLE Input", first.GetProperty("system")[0].GetProperty("text").GetString()); // knowledge base inside
        Assert.Contains(first.GetProperty("tools").EnumerateArray(), t => t.GetProperty("name").GetString() == "suggest_action");
        Assert.Equal("low", first.GetProperty("output_config").GetProperty("effort").GetString());
        // Second request: history appended unchanged (thinking signature), one tool_result per tool_use, unknown game reported.
        var msgs = fake.Requests[1].GetProperty("messages");
        Assert.Equal(3, msgs.GetArrayLength());
        Assert.Equal("sig-1", msgs[1].GetProperty("content")[0].GetProperty("signature").GetString());
        var results = msgs[2].GetProperty("content").EnumerateArray().ToList();
        Assert.Equal(new[] { "tu_1", "tu_2", "tu_3" }, results.Select(x => x.GetProperty("tool_use_id").GetString()));
        Assert.Contains("CPU", results[0].GetProperty("content").GetString());
        Assert.Contains("Minecraft", results[2].GetProperty("content").GetString());

        // Cost: Opus 5.5 – 3200 in × $4 + 160 out × $20 + 9000 cache write × $5 + 9000 cache read × $0.20 (per million).
        var expected = (3200 * 4.0 + 160 * 20.0 + 9000 * 5.0 + 9000 * 0.2) / 1_000_000;
        Assert.Equal(Math.Round(expected, 4), reply.GetProperty("costUsd").GetDouble());
        var usage = J(a.Status()).GetProperty("usage");
        Assert.Equal(1, usage.GetProperty("requests").GetInt32());
        Assert.Equal(9000, usage.GetProperty("cacheReadTokens").GetInt64());

        // Same conversation: the next question is appended to the same history.
        fake.Responses.Enqueue(FakeClaude.Text("Gern."));
        var conv = r.GetProperty("conversationId").GetString();
        await a.AskAsync("local", "PC", conv, "Danke");
        Assert.Equal(5, fake.Requests[2].GetProperty("messages").GetArrayLength());
        // Another device cannot continue this conversation.
        fake.Responses.Enqueue(FakeClaude.Text("Neu."));
        var other = J(await a.AskAsync("dev_x", "iPhone", conv, "Hallo"));
        Assert.NotEqual(conv, other.GetProperty("conversationId").GetString());
        Assert.Equal(1, fake.Requests[3].GetProperty("messages").GetArrayLength());
    }

    [Fact]
    public async Task Cheaper_model_without_fallback_sends_no_fallback_fields()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        var a = WithFake(s, dir, fake);
        a.Configure(new AssistantService.Config { Model = "claude-haiku-5-5" }, atPc: true);
        fake.Responses.Enqueue(FakeClaude.Msg("end_turn", new object[] { new { type = "text", text = "Hallo!" } }, model: "claude-haiku-5-5"));
        var r = J(await a.AskAsync("local", "PC", null, "Erzähl mir einen Witz über Gamer und Lag"));
        Assert.Equal("Hallo!", r.GetProperty("reply").GetProperty("text").GetString());
        var req = fake.Requests.Single();
        Assert.Equal("claude-haiku-5-5", req.GetProperty("model").GetString());
        Assert.False(req.TryGetProperty("fallbacks", out _), req.GetRawText()[..200]);
    }

    [Fact]
    public async Task Commands_stay_local_and_the_monthly_limit_is_respected()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        var a = WithFake(s, dir, fake);
        var r = J(await a.AskAsync("local", "PC", null, "Spiel Sound Airhorn"));
        Assert.Equal("local", r.GetProperty("reply").GetProperty("mode").GetString());
        Assert.Empty(fake.Requests); // free and instant

        a.Configure(new AssistantService.Config { MonthlyLimitUsd = 0.01 }, atPc: false);
        fake.Responses.Enqueue(FakeClaude.Text("Antwort 1"));
        await a.AskAsync("local", "PC", null, "Erzähl mir etwas über Rocket League"); // costs ~0.06 $
        r = J(await a.AskAsync("local", "PC", null, "Und noch etwas?"));
        Assert.Single(fake.Requests);
        Assert.Contains("Monatslimit", r.GetProperty("reply").GetProperty("text").GetString());
    }

    [Fact]
    public async Task Claude_errors_are_reported_without_secrets()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude { Status = 401 };
        var a = WithFake(s, dir, fake);
        var ex = await Assert.ThrowsAsync<RpcException>(() => a.AskAsync("local", "PC", null, "Hallo, wer bist du?"));
        Assert.Equal("assistant-key", ex.Code);
        Assert.DoesNotContain("sk-ant", ex.Message);
        Assert.Equal(0, J(a.Status()).GetProperty("usage").GetProperty("requests").GetInt32());
    }

    // ---------------------------------------------------------------- free local model (Ollama) against a fake server

    static string OllamaMsg(string content, object[]? toolCalls = null) => JsonSerializer.Serialize(new
    {
        model = "qwen2.5:7b", created_at = "2026-10-19T12:00:00Z", done = true, done_reason = "stop", prompt_eval_count = 900, eval_count = 40,
        message = toolCalls == null ? (object)new { role = "assistant", content } : new { role = "assistant", content, tool_calls = toolCalls },
    });

    static AssistantService WithOllama(CompanionServices s, TempDir dir, FakeClaude fake, Func<bool>? gameRunning = null)
    {
        var data = new AssistantData(s, gameRunning: gameRunning);
        var a = new AssistantService(new AppPaths(Path.Combine(dir.Path, "o")), new GenericPlatform().Secrets, new NullHub(), data, ollama: new OllamaAssistant(data));
        a.Configure(new AssistantService.Config { Mode = "ollama", OllamaUrl = fake.Url, OllamaModel = "qwen2.5:7b" }, atPc: true);
        return a;
    }

    [Fact]
    public async Task Free_local_model_uses_the_same_tools_and_costs_nothing()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        fake.Responses.Enqueue(OllamaMsg("", new object[]
        {
            new { function = new { name = "get_pc_status", arguments = new { } } },
            new { function = new { name = "suggest_action", arguments = new { kind = "launch", target = "Rocket Leage" } } },
        }));
        fake.Responses.Enqueue(OllamaMsg("Dein PC ist entspannt. Tippe auf „Rocket League starten“."));
        var a = WithOllama(s, dir, fake);
        a.Configure(new AssistantService.Config { LocalFirst = false }, atPc: true); // force the model for this check

        var r = J(await a.AskAsync("local", "PC", null, "Wie geht es meinem PC und kannst du Rocket League starten?"));
        var reply = r.GetProperty("reply");
        Assert.Equal("ollama", reply.GetProperty("mode").GetString());
        Assert.Equal(0, reply.GetProperty("costUsd").GetDouble());
        Assert.Equal("library.launch", Assert.Single(reply.GetProperty("actions").EnumerateArray()).GetProperty("method").GetString());
        Assert.Contains("lokales Modell (kostenlos)", reply.GetProperty("sources").EnumerateArray().Select(x => x.GetString()));
        Assert.Empty(s.Sessions.Running());

        Assert.Equal(new[] { "/api/chat", "/api/chat" }, fake.Paths);
        var first = fake.Requests[0];
        Assert.Equal("qwen2.5:7b", first.GetProperty("model").GetString());
        Assert.False(first.GetProperty("stream").GetBoolean());
        Assert.Equal("2m", first.GetProperty("keep_alive").GetString());
        Assert.Equal("system", first.GetProperty("messages")[0].GetProperty("role").GetString());
        Assert.Contains(first.GetProperty("tools").EnumerateArray(), t => t.GetProperty("function").GetProperty("name").GetString() == "suggest_action");
        var msgs = fake.Requests[1].GetProperty("messages").EnumerateArray().ToList();
        Assert.Equal(new[] { "system", "user", "assistant", "tool", "tool" }, msgs.Select(m => m.GetProperty("role").GetString()));
        Assert.Contains("CPU", msgs[3].GetProperty("content").GetString());
        Assert.Equal(0, J(a.Status()).GetProperty("usage").GetProperty("costUsd").GetDouble());
        Assert.True(J(a.Status()).GetProperty("free").GetBoolean());

        // Help questions get the matching help sections along (small models have little context).
        fake.Responses.Enqueue(OllamaMsg("So geht's …"));
        await a.AskAsync("local", "PC", r.GetProperty("conversationId").GetString(), "Wie hören meine Freunde in Discord meine Sounds?");
        var last = fake.Requests[^1].GetProperty("messages").EnumerateArray().Last(m => m.GetProperty("role").GetString() == "user").GetProperty("content").GetString();
        Assert.Contains("CABLE Input", last);
    }

    [Fact]
    public async Task Live_values_commands_and_help_never_come_from_the_local_model()
    {
        // Measured with a real small model (qwen2.5:1.5b): asked for CPU/RAM it invented "CPU 100 %, RAM 95 %".
        // So with the default settings the exact local assistant answers these, the model is not asked at all.
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        var a = WithOllama(s, dir, fake);
        foreach (var q in new[] { "Wie geht es meinem PC und wie viel RAM ist frei?", "Starte Rocket League", "Wie hören meine Freunde in Discord meine Sounds?", "Wie lange habe ich diese Woche gespielt?" })
        {
            var r = J(await a.AskAsync("local", "PC", null, q)).GetProperty("reply");
            Assert.Equal("local", r.GetProperty("mode").GetString());
        }
        Assert.Empty(fake.Requests);
        // Free conversation goes to the model.
        fake.Responses.Enqueue(OllamaMsg("Probier mal ein Koop-Spiel."));
        var free = J(await a.AskAsync("local", "PC", null, "Mir ist langweilig, hast du eine Idee für heute Abend?")).GetProperty("reply");
        Assert.Equal("ollama", free.GetProperty("mode").GetString());
        Assert.Single(fake.Requests);
    }

    [Fact]
    public async Task Local_model_problems_are_explained_and_gaming_keeps_the_gpu_free()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude { Status = 404, ErrorBody = "{\"error\":\"model 'qwen2.5:7b' not found\"}" };
        var gaming = false;
        var a = WithOllama(s, dir, fake, () => gaming);
        var ex = await Assert.ThrowsAsync<RpcException>(() => a.AskAsync("local", "PC", null, "Erzähl mir etwas über Rocket League und Autoball"));
        Assert.Contains("ollama pull qwen2.5:7b", ex.Message);

        gaming = true;
        var n = fake.Requests.Count;
        var r = J(await a.AskAsync("local", "PC", null, "Erzähl mir etwas über Rocket League und Autoball"));
        Assert.Equal(n, fake.Requests.Count); // no request while a game runs
        Assert.Contains(r.GetProperty("reply").GetProperty("sources").EnumerateArray(), x => x.GetString()!.Contains("Grafikkarte frei"));

        // Not installed / not running.
        a.Configure(new AssistantService.Config { OllamaUrl = "http://127.0.0.1:1" }, atPc: true);
        gaming = false;
        ex = await Assert.ThrowsAsync<RpcException>(() => a.AskAsync("local", "PC", null, "Erzähl mir etwas über Rocket League und Autoball"));
        Assert.Contains("ollama.com", ex.Message);
        ex = await Assert.ThrowsAsync<RpcException>(() => a.OllamaModelsAsync());
        Assert.Equal("assistant-ollama", ex.Code);

        // Only this PC or the home network, and only set at the PC.
        Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { OllamaUrl = "https://example.com" }, atPc: true));
        Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { OllamaUrl = "http://user:pw@127.0.0.1:11434" }, atPc: true));
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { OllamaUrl = "http://192.168.1.20:11434" }, atPc: false)).Code);
        a.Configure(new AssistantService.Config { OllamaUrl = "http://192.168.1.20:11434/irgendwas" }, atPc: true);
        Assert.Equal("http://192.168.1.20:11434", J(a.Status()).GetProperty("ollama").GetProperty("url").GetString());
        Assert.Throws<RpcException>(() => a.Configure(new AssistantService.Config { OllamaModel = "qwen; rm -rf" }, atPc: false));
    }

    [Fact]
    public async Task Installed_models_are_listed()
    {
        using var dir = new TempDir();
        await using var s = await Setup(dir);
        using var fake = new FakeClaude();
        fake.Responses.Enqueue("{\"models\":[{\"name\":\"qwen2.5:7b\",\"size\":4683087332},{\"name\":\"llama3.1:8b\",\"size\":4920753328}]}");
        var a = WithOllama(s, dir, fake);
        var m = J(await a.OllamaModelsAsync()).GetProperty("models");
        Assert.Equal("qwen2.5:7b", m[0].GetProperty("name").GetString());
        Assert.Equal(4.7, m[0].GetProperty("sizeGb").GetDouble());
        Assert.Equal("/api/tags", fake.Paths.Single());
    }

    [Fact]
    public void Prices_match_the_published_list()
    {
        Assert.Equal(24.0, ClaudeAssistant.Cost("claude-opus-5-5", 1_000_000, 1_000_000, 0, 0));
        Assert.Equal(12.0, ClaudeAssistant.Cost("claude-sonnet-5-5", 1_000_000, 1_000_000, 0, 0));
        Assert.Equal(0.6, ClaudeAssistant.Cost("claude-haiku-5-5", 1_000_000, 1_000_000, 0, 0), 6);
    }
}
