using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

public sealed class AssistantUsageMonth
{
    public string Month { get; set; } = "";
    public int Requests { get; set; }
    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long CacheWriteTokens { get; set; }
    public double CostUsd { get; set; }
    /// <summary>DeepSeek (bingo tasks): counted, the price is billed by DeepSeek directly.</summary>
    public int DeepSeekRequests { get; set; }
    public long DeepSeekInputTokens { get; set; }
    public long DeepSeekOutputTokens { get; set; }
    /// <summary>Gemini (free tier with the user's own key): counted against the user's own monthly cap.</summary>
    public int GeminiRequests { get; set; }
}

public sealed class AssistantFile
{
    /// <summary>local = built-in assistant (free); ollama = language model on this PC via Ollama (free); claude = Claude (paid, needs a key).</summary>
    public string Mode { get; set; } = "local";
    public string OllamaUrl { get; set; } = OllamaAssistant.DefaultUrl;
    public string? OllamaModel { get; set; }
    /// <summary>Use the local model also while a game runs (it needs the graphics card). Off = the built-in assistant answers then.</summary>
    public bool OllamaWhileGaming { get; set; }
    public string Model { get; set; } = ClaudeAssistant.DefaultModel;
    /// <summary>Recognised commands ("Starte …") are answered locally even in Claude mode – instant and free.</summary>
    public bool LocalFirst { get; set; } = true;
    public double MonthlyLimitUsd { get; set; } = 5;
    /// <summary>Anthropic API key, protected with DPAPI on Windows. Never returned, never in a backup.</summary>
    public string? KeyProtected { get; set; }
    public List<AssistantUsageMonth> Usage { get; set; } = new();
    /// <summary>Which AI writes bingo tasks: "assistant" = the assistant's own mode (Claude/Ollama), "deepseek" = DeepSeek.</summary>
    public string BingoAi { get; set; } = "assistant";
    /// <summary>DeepSeek API key, protected like the Anthropic key. Never returned, never in a backup.</summary>
    public string? DeepSeekKeyProtected { get; set; }
    public string DeepSeekModel { get; set; } = DeepSeekClient.DefaultModel;
    /// <summary>At most this many DeepSeek requests per month (protects against unexpected cost).</summary>
    public int DeepSeekMonthlyRequests { get; set; } = 200;
    /// <summary>Google Gemini API key (free tier from Google AI Studio), protected like the other keys. Never returned, never in a backup.</summary>
    public string? GeminiKeyProtected { get; set; }
    public string GeminiModel { get; set; } = GeminiClient.DefaultModel;
    /// <summary>At most this many Gemini requests per month (Google also limits the free tier per minute and day).</summary>
    public int GeminiMonthlyRequests { get; set; } = 1000;
}

/// <summary>Entry point for the assistant: chooses local or Claude, keeps conversations, counts cost against the monthly limit.</summary>
public sealed class AssistantService
{
    readonly JsonStore<AssistantFile> _store;
    readonly ISecretProtector _secrets;
    readonly IHub _hub;
    readonly Func<DateTime> _now;
    public AssistantData Data { get; }
    public LocalAssistant Local { get; }
    public ClaudeAssistant Claude { get; }
    public OllamaAssistant Ollama { get; }
    public DeepSeekClient DeepSeek { get; }
    public GeminiClient Gemini { get; }
    readonly SemaphoreSlim _bingoBusy = new(1, 1);

    sealed class Conv { public required string Owner; public ClaudeAssistant.Conversation Claude = new(); public OllamaAssistant.Conversation Ollama = new(); public List<GeminiClient.Turn> Gemini = new(); public DateTime LastUsed; public int Turns; public readonly SemaphoreSlim Lock = new(1, 1); }
    readonly ConcurrentDictionary<string, Conv> _convs = new();
    const int MaxTurns = 30;

    public AssistantService(AppPaths paths, ISecretProtector secrets, IHub hub, AssistantData data, ClaudeAssistant? claude = null, Func<DateTime>? now = null, OllamaAssistant? ollama = null, DeepSeekClient? deepSeek = null, GeminiClient? gemini = null)
    {
        _store = new JsonStore<AssistantFile>(paths.File("assistant.json"));
        _secrets = secrets; _hub = hub; Data = data; _now = now ?? (() => DateTime.UtcNow);
        Local = new LocalAssistant(data);
        Claude = claude ?? new ClaudeAssistant(data);
        Ollama = ollama ?? new OllamaAssistant(data);
        DeepSeek = deepSeek ?? new DeepSeekClient();
        Gemini = gemini ?? new GeminiClient();
    }

    string MonthKey => _now().ToString("yyyy-MM");

    public object Status()
    {
        var f = _store.Snapshot();
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey) ?? new AssistantUsageMonth { Month = MonthKey };
        return new
        {
            mode = f.Mode, model = f.Model, localFirst = f.LocalFirst, monthlyLimitUsd = f.MonthlyLimitUsd, keySet = f.KeyProtected != null,
            claudeReady = f.Mode == "claude" && f.KeyProtected != null,
            ollama = new { url = f.OllamaUrl, model = f.OllamaModel, whileGaming = f.OllamaWhileGaming, recommended = OllamaAssistant.Recommended.Select(r => new { r.id, r.label, r.note }) },
            free = f.Mode != "claude",
            models = ClaudeAssistant.Models.Select(m => new { m.Id, m.Label, m.Input, m.Output, m.CacheRead, m.Note }),
            usage = month, history = f.Usage.OrderByDescending(u => u.Month).Take(6),
            examples = LocalAssistant.Examples,
            knowledgeSections = Data.Knowledge.Sections.Count,
            bingoAi = f.BingoAi,
            deepSeek = new { keySet = f.DeepSeekKeyProtected != null, model = f.DeepSeekModel, monthlyRequests = f.DeepSeekMonthlyRequests, used = month.DeepSeekRequests, inputTokens = month.DeepSeekInputTokens, outputTokens = month.DeepSeekOutputTokens },
            bingoProvider = BingoProviderName(f),
            gemini = new { keySet = f.GeminiKeyProtected != null, model = f.GeminiModel, monthlyRequests = f.GeminiMonthlyRequests, used = month.GeminiRequests },
            researchAi = ResearchProvider(f)?.label,
            engines = Engines(),
            webSearch = f.Mode == "claude" && f.KeyProtected != null,
        };
    }

    public sealed class Config
    {
        public string? Mode { get; set; } public string? Model { get; set; } public bool? LocalFirst { get; set; } public double? MonthlyLimitUsd { get; set; } public string? ApiKey { get; set; }
        public string? OllamaUrl { get; set; } public string? OllamaModel { get; set; } public bool? OllamaWhileGaming { get; set; }
        public string? BingoAi { get; set; } public string? DeepSeekKey { get; set; } public string? DeepSeekModel { get; set; } public int? DeepSeekMonthlyRequests { get; set; }
        public string? GeminiKey { get; set; } public string? GeminiModel { get; set; } public int? GeminiMonthlyRequests { get; set; }
    }

    /// <summary>Which AI would write bingo tasks right now (null = none – the app then uses its own catalog).</summary>
    static string? BingoProviderName(AssistantFile f) =>
        f.BingoAi == "deepseek" && f.DeepSeekKeyProtected != null ? $"DeepSeek ({f.DeepSeekModel})"
        : f.Mode == "claude" && f.KeyProtected != null ? "Claude"
        : f.Mode == "ollama" && !string.IsNullOrEmpty(f.OllamaModel) ? $"Ollama ({f.OllamaModel})" : null;

    /// <summary>Ollama address: http(s), this PC or a device in the home network only (no internet hosts).</summary>
    static string CheckOllamaUrl(string url)
    {
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(u.UserInfo))
            throw new RpcException("invalid-params", "Ollama-Adresse z. B. http://127.0.0.1:11434");
        var local = u.IsLoopback || u.Host == "localhost" ||
            (System.Net.IPAddress.TryParse(u.Host, out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && ip.GetAddressBytes() is var b &&
             (b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168)));
        if (!local) throw new RpcException("invalid-params", "Ollama muss auf diesem PC oder im Heimnetz laufen (localhost oder 192.168.x.x/10.x.x.x).");
        return u.GetLeftPart(UriPartial.Authority);
    }

    /// <param name="atPc">The key may only be set or removed at the PC itself (it costs money and leaves the home network).</param>
    public object Configure(Config c, bool atPc)
    {
        if ((c.ApiKey != null || c.DeepSeekKey != null || c.GeminiKey != null) && !atPc) throw new RpcException("forbidden", "Den API-Schlüssel kannst du nur direkt am PC eintragen oder löschen.");
        if (c.BingoAi is not (null or "assistant" or "deepseek")) throw new RpcException("invalid-params", "Bingo-KI muss „assistant“ oder „deepseek“ sein.");
        if (c.DeepSeekModel != null && !Regex.IsMatch(c.DeepSeekModel, @"^[A-Za-z0-9._:-]{2,60}$")) throw new RpcException("invalid-params", "Ungültiger DeepSeek-Modellname.");
        if (c.DeepSeekMonthlyRequests is < 0 or > 5000) throw new RpcException("invalid-params", "DeepSeek-Anfragen pro Monat: 0–5000.");
        if (c.GeminiModel != null && !Regex.IsMatch(c.GeminiModel, @"^[a-z0-9.-]{2,60}$")) throw new RpcException("invalid-params", "Ungültiger Gemini-Modellname (z. B. gemini-3.5-flash-lite).");
        if (c.GeminiMonthlyRequests is < 0 or > 50000) throw new RpcException("invalid-params", "Gemini-Anfragen pro Monat: 0–50000.");
        var gmKey = c.GeminiKey?.Trim();
        if (!string.IsNullOrEmpty(gmKey) && !GeminiClient.LooksLikeKey(gmKey)) throw new RpcException("invalid-params", "Das sieht nicht wie ein Gemini-API-Schlüssel aus (aus Google AI Studio, beginnt mit „AIza“).");
        var dsKey = c.DeepSeekKey?.Trim();
        if (!string.IsNullOrEmpty(dsKey) && (dsKey.Length is < 20 or > 200 || dsKey.Any(char.IsWhiteSpace) || !dsKey.StartsWith("sk-") || dsKey.StartsWith("sk-ant-")))
            throw new RpcException("invalid-params", "Das sieht nicht wie ein DeepSeek-API-Schlüssel aus (beginnt mit „sk-“).");
        if (c.OllamaUrl != null && !atPc) throw new RpcException("forbidden", "Die Ollama-Adresse kannst du nur direkt am PC ändern.");
        if (c.Mode is not (null or "local" or "ollama" or "claude")) throw new RpcException("invalid-params", "Modus muss „local“, „ollama“ oder „claude“ sein.");
        var ollamaUrl = c.OllamaUrl == null ? null : CheckOllamaUrl(c.OllamaUrl);
        if (c.OllamaModel is { Length: > 100 } || (c.OllamaModel != null && !Regex.IsMatch(c.OllamaModel, @"^[A-Za-z0-9._:/-]*$"))) throw new RpcException("invalid-params", "Ungültiger Modellname.");
        if (c.Model != null && ClaudeAssistant.Models.All(m => m.Id != c.Model)) throw new RpcException("invalid-params", "Unbekanntes Modell.");
        if (c.MonthlyLimitUsd is < 0 or > 500) throw new RpcException("invalid-params", "Monatslimit zwischen 0 und 500 $.");
        var key = c.ApiKey?.Trim();
        if (!string.IsNullOrEmpty(key) && (key.Length is < 20 or > 300 || key.Any(char.IsWhiteSpace) || !key.StartsWith("sk-ant-")))
            throw new RpcException("invalid-params", "Das sieht nicht wie ein Anthropic-API-Schlüssel aus (beginnt mit „sk-ant-“).");
        _store.Update(f =>
        {
            if (c.Mode != null)
            {
                if (c.Mode == "claude" && f.KeyProtected == null && string.IsNullOrEmpty(key)) throw new RpcException("assistant-key", "Für Claude zuerst am PC einen API-Schlüssel eintragen.");
                f.Mode = c.Mode;
            }
            if (c.Model != null) f.Model = c.Model;
            if (ollamaUrl != null) f.OllamaUrl = ollamaUrl;
            if (c.OllamaModel != null) f.OllamaModel = c.OllamaModel.Length == 0 ? null : c.OllamaModel;
            if (c.OllamaWhileGaming != null) f.OllamaWhileGaming = c.OllamaWhileGaming.Value;
            if (c.LocalFirst != null) f.LocalFirst = c.LocalFirst.Value;
            if (c.MonthlyLimitUsd != null) f.MonthlyLimitUsd = Math.Round(c.MonthlyLimitUsd.Value, 2);
            if (c.BingoAi != null)
            {
                if (c.BingoAi == "deepseek" && f.DeepSeekKeyProtected == null && string.IsNullOrEmpty(dsKey)) throw new RpcException("assistant-key", "Für DeepSeek zuerst am PC einen API-Schlüssel eintragen.");
                f.BingoAi = c.BingoAi;
            }
            if (c.DeepSeekModel != null) f.DeepSeekModel = c.DeepSeekModel;
            if (c.DeepSeekMonthlyRequests != null) f.DeepSeekMonthlyRequests = c.DeepSeekMonthlyRequests.Value;
            if (c.GeminiModel != null) f.GeminiModel = c.GeminiModel;
            if (c.GeminiMonthlyRequests != null) f.GeminiMonthlyRequests = c.GeminiMonthlyRequests.Value;
            if (gmKey != null) f.GeminiKeyProtected = gmKey.Length == 0 ? null : _secrets.Protect(gmKey);
            if (dsKey != null)
            {
                f.DeepSeekKeyProtected = dsKey.Length == 0 ? null : _secrets.Protect(dsKey);
                if (dsKey.Length == 0) f.BingoAi = "assistant";
            }
            if (key != null)
            {
                f.KeyProtected = key.Length == 0 ? null : _secrets.Protect(key);
                if (key.Length == 0) f.Mode = "local";
            }
        });
        if (key != null) Log.Info("assistant", key.Length == 0 ? "Claude-Schlüssel entfernt." : "Claude-Schlüssel gespeichert (geschützt)."); // never the key itself
        if (dsKey != null) Log.Info("assistant", dsKey.Length == 0 ? "DeepSeek-Schlüssel entfernt." : "DeepSeek-Schlüssel gespeichert (geschützt).");
        if (gmKey != null) Log.Info("assistant", gmKey.Length == 0 ? "Gemini-Schlüssel entfernt." : "Gemini-Schlüssel gespeichert (geschützt).");
        _hub.Changed("assistant");
        return Status();
    }

    public void Reset(string owner, string? conversationId)
    {
        if (conversationId != null && _convs.TryGetValue(conversationId, out var c) && c.Owner == owner) _convs.TryRemove(conversationId, out _);
    }

    void Cleanup()
    {
        foreach (var kv in _convs.Where(kv => _now() - kv.Value.LastUsed > TimeSpan.FromHours(3)).ToList()) _convs.TryRemove(kv.Key, out _);
        while (_convs.Count > 50) { var oldest = _convs.OrderBy(kv => kv.Value.LastUsed).First(); _convs.TryRemove(oldest.Key, out _); }
    }

    /// <param name="owner">Device (or "local") – a conversation belongs to the device that started it.</param>
    /// <param name="jarvis">JARVIS session is active: actions the user named may be run directly (see <see cref="Jarvis"/>).</param>
    /// <param name="jarvisRequested">The website asked for JARVIS (even if the session ran out) – gaming-only rules apply.</param>
    public async Task<object> AskAsync(string owner, string who, string? conversationId, string text, CancellationToken ct = default, bool jarvis = false, bool jarvisRequested = false, string? engine = null)
    {
        text = text.Trim();
        if (text.Length is 0 or > 2000) throw new RpcException("invalid-params", "Frage mit 1–2000 Zeichen.");
        _ask.Value = (text, jarvis);
        if (jarvis || jarvisRequested)
        {
            // Answered without any AI call – fast, free, and the same on every mode.
            if (Jarvis.OffTopic(text)) return Done(conversationId ?? Ids.New("conv"), new AssistantReply { Text = Jarvis.OffTopicReply, Sources = { "JARVIS" }, Suggestions = { "Was kannst du?", "Wie geht es meinem PC?", "Starte mein zuletzt gespieltes Spiel" } }, null);
            if (Jarvis.CodeRequest(text)) return Done(conversationId ?? Ids.New("conv"), new AssistantReply { Text = Jarvis.CodeReply, Sources = { "JARVIS" } }, null);
        }
        Cleanup();
        var note = (string?)null;
        if (conversationId == null || !_convs.TryGetValue(conversationId, out var conv) || conv.Owner != owner)
        {
            conversationId = Ids.New("conv");
            conv = new Conv { Owner = owner };
            _convs[conversationId] = conv;
        }
        else if (conv.Turns >= MaxTurns)
        {
            conversationId = Ids.New("conv");
            conv = new Conv { Owner = owner };
            _convs[conversationId] = conv;
            note = "Das Gespräch war sehr lang – ich habe ein neues begonnen (das spart Kosten).";
        }
        await conv.Lock.WaitAsync(ct);
        try
        {
            conv.LastUsed = _now(); conv.Turns++;
            var f = _store.Snapshot();
            AssistantReply reply;
            var (mode, claudeModel) = ResolveEngine(f, engine);
            var useClaude = mode == "claude";
            var useOllama = mode == "ollama";
            var useGemini = mode == "gemini";
            if (useOllama && !f.OllamaWhileGaming && Data.GameRunning())
            {
                reply = await Local.AnswerAsync(text);
                reply.Sources.Add("lokal beantwortet – während eines Spiels bleibt die Grafikkarte frei");
                return Done(conversationId, reply, note);
            }
            // Short single requests only – "Wie geht es meinem PC und …" needs Claude to answer every part.
            var simple = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length <= 8 && !Regex.IsMatch(" " + text.ToLowerInvariant() + " ", @" (und|and|dann|then|aber|but|oder|or) ");
            // Local model: the exact local assistant always goes first – small models invent numbers (measured with
            // qwen2.5:1.5b) – so commands, live values and help answers never come from the model. Claude: only short single requests.
            if ((useOllama && f.LocalFirst) || ((useClaude || useGemini) && f.LocalFirst && simple))
            {
                var local = await Local.AnswerAsync(text);
                // Only commands and live-data answers count; help-text guesses go to Claude, which explains better.
                // Claude explains help topics better than the stored text, so only commands/live data stay local there.
                // A small local model does not – every confident local answer (including help texts) stays local.
                if (local.Confident && (useOllama || local.Actions.Any(a => a.Kind != "navigate") || local.Sources.Any(s => !s.Contains(':'))))
                {
                    local.Sources.Add("lokal beantwortet (kostenlos)");
                    return Done(conversationId, local, note);
                }
            }
            if (useOllama)
            {
                var o = await Ollama.AskAsync(f.OllamaUrl, f.OllamaModel ?? "", conv.Ollama, text, $"[Kontext – nicht vom Nutzer: Zeit {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}, Gerät: {who}]", ct);
                return Done(conversationId, o.Reply, note);
            }
            if (useGemini) return Done(conversationId, await GeminiChatAsync(f, conv.Gemini, text, who, ct), note);
            if (!useClaude)
            {
                reply = await Local.AnswerAsync(text);
                return Done(conversationId, reply, note);
            }
            var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
            if (f.MonthlyLimitUsd <= 0 || (month?.CostUsd ?? 0) >= f.MonthlyLimitUsd)
            {
                reply = await Local.AnswerAsync(text);
                reply.Text = $"Das Monatslimit für Claude ({f.MonthlyLimitUsd:0.00} $) ist erreicht – ich antworte lokal. (Limit änderbar unter Assistent → Einstellungen.)\n\n" + reply.Text;
                return Done(conversationId, reply, note);
            }
            var key = _secrets.Unprotect(f.KeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Schlüssel lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
            var context = $"[Kontext – nicht vom Nutzer: Zeit {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}, Gerät: {who}]";
            var result = await Claude.AskAsync(key, claudeModel, conv.Claude, text, context, ct);
            var cost = ClaudeAssistant.Cost(result.ServedBy, result.Input, result.Output, result.CacheRead, result.CacheWrite);
            RecordUsage(result.Input, result.Output, result.CacheRead, result.CacheWrite, cost);
            result.Reply.CostUsd = Math.Round(cost, 4);
            return Done(conversationId, result.Reply, note);
        }
        finally { conv.Lock.Release(); }
    }

    /// <summary>
    /// The engine chosen in the chat ("auto" = the mode set at the PC). Only engines that are set up can be chosen –
    /// never silently another one: a missing key or model is an error the chat shows.
    /// </summary>
    static (string mode, string claudeModel) ResolveEngine(AssistantFile f, string? engine)
    {
        engine = string.IsNullOrWhiteSpace(engine) ? "auto" : engine.Trim();
        if (engine == "auto") return (f.Mode == "claude" && f.KeyProtected == null ? "local" : f.Mode, f.Model);
        if (engine == "local") return ("local", f.Model);
        if (engine == "ollama") return string.IsNullOrEmpty(f.OllamaModel) ? throw new RpcException("assistant-key", "Die lokale KI (Ollama) ist am PC noch nicht eingerichtet.") : ("ollama", f.Model);
        if (engine == "gemini") return f.GeminiKeyProtected == null ? throw new RpcException("assistant-key", "Für Gemini zuerst am PC einen kostenlosen Gemini-Schlüssel eintragen.") : ("gemini", f.Model);
        if (engine.StartsWith("claude"))
        {
            if (f.KeyProtected == null) throw new RpcException("assistant-key", "Für Claude zuerst am PC einen API-Schlüssel eintragen.");
            var model = engine.StartsWith("claude:") ? engine[7..] : f.Model;
            if (ClaudeAssistant.Models.All(m => m.Id != model)) throw new RpcException("invalid-params", "Unbekanntes Claude-Modell.");
            return ("claude", model);
        }
        throw new RpcException("invalid-params", "Unbekannte KI.");
    }

    /// <summary>The engines the chat can offer right now (set up at the PC), with the model that will really answer.</summary>
    public List<object> Engines()
    {
        var f = _store.Snapshot();
        var list = new List<object> { new { id = "auto", label = $"Automatisch ({ModeLabel(f)})", free = f.Mode != "claude" } };
        list.Add(new { id = "local", label = "Eingebaut (ohne KI, 0 €)", free = true });
        if (!string.IsNullOrEmpty(f.OllamaModel)) list.Add(new { id = "ollama", label = $"Lokale KI: {f.OllamaModel} (0 €)", free = true });
        if (f.GeminiKeyProtected != null) list.Add(new { id = "gemini", label = $"Gemini {f.GeminiModel} (kostenlos)", free = true });
        if (f.KeyProtected != null) foreach (var m in ClaudeAssistant.Models) list.Add(new { id = "claude:" + m.Id, label = $"{m.Label} (kostenpflichtig, Websuche)", free = false });
        return list;
    }

    static string ModeLabel(AssistantFile f) => f.Mode switch
    {
        "claude" when f.KeyProtected != null => ClaudeAssistant.PriceOf(f.Model).Label,
        "ollama" when !string.IsNullOrEmpty(f.OllamaModel) => $"lokale KI {f.OllamaModel}",
        _ => "eingebaut",
    };

    /// <summary>Gemini as chat brain (free tier, own key): no tools and no live data – it says so instead of guessing.</summary>
    async Task<AssistantReply> GeminiChatAsync(AssistantFile f, List<GeminiClient.Turn> history, string text, string who, CancellationToken ct)
    {
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
        if ((month?.GeminiRequests ?? 0) >= f.GeminiMonthlyRequests) throw new RpcException("assistant-limit", $"Dein Monatslimit von {f.GeminiMonthlyRequests} Gemini-Anfragen ist erreicht.");
        var key = _secrets.Unprotect(f.GeminiKeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Gemini-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
        var system = "Du bist JARVIS, der Gaming-Assistent im „Nexus Gaming Hub“. Antworte in der Sprache des Nutzers (meist Deutsch), kurz und konkret. " +
            "Du hast in diesem Modus KEINE Werkzeuge und KEINE Live-Daten vom PC: Fragt der Nutzer nach Werten seines PCs, seinen Spielen oder Spielzeiten, sag ehrlich, dass du sie hier nicht siehst. Behaupte nie, etwas gestartet oder erledigt zu haben. " +
            "Erfinde nichts; bist du unsicher (neue Spiele, Patches, Zahlen), sag das und empfiehl „Im Internet suchen“. Keine Spoiler ohne Wunsch. Nur Gaming-Themen. Keine Hilfe bei Cheats oder Anti-Cheat-Umgehung.\n\n" +
            "Wissensbasis der App:\n" + Data.Knowledge.FullText;
        history.Add(new GeminiClient.Turn("user", $"[Kontext – nicht vom Nutzer: {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}, Gerät: {who}]\n{text}"));
        if (history.Count > 20) history.RemoveRange(0, history.Count - 20);
        var res = await Gemini.ChatAsync(key, f.GeminiModel, system, history, ct);
        history.Add(new GeminiClient.Turn("model", res.Text));
        CountMonth(m => m.GeminiRequests++);
        return new AssistantReply { Text = res.Text.Trim(), Mode = "gemini", Model = res.Model, CostUsd = 0, Sources = { "Gemini (kostenlos) – ohne Live-Daten vom PC" } };
    }

    readonly AsyncLocal<(string text, bool jarvis)> _ask = new();

    object Done(string conversationId, AssistantReply reply, string? note)
    {
        if (note != null) reply.Text = note + "\n\n" + reply.Text;
        var (text, jarvis) = _ask.Value;
        if (jarvis) Jarvis.MarkAuto(reply, text);
        else foreach (var a in reply.Actions) a.Auto = false;
        return new { conversationId, reply, jarvis };
    }

    void RecordUsage(long input, long output, long cacheRead, long cacheWrite, double cost)
    {
        _store.Update(file =>
        {
            var m = file.Usage.FirstOrDefault(u => u.Month == MonthKey);
            if (m == null) { m = new AssistantUsageMonth { Month = MonthKey }; file.Usage.Add(m); }
            m.Requests++; m.InputTokens += input; m.OutputTokens += output; m.CacheReadTokens += cacheRead; m.CacheWriteTokens += cacheWrite;
            m.CostUsd = Math.Round(m.CostUsd + cost, 4);
            if (file.Usage.Count > 24) file.Usage.RemoveAt(0);
        });
        _hub.Changed("assistant");
    }

    /// <summary>
    /// Bingo tasks for one game, written by the configured AI. The model only supplies the wording: count, length and
    /// duplicates are checked here (BingoIdeas), and the card itself is kept in the app on the device.
    /// </summary>
    public async Task<object> BingoTasksAsync(string game, int size, CancellationToken ct = default)
    {
        game = game.Trim();
        if ((game.Length is < 2 or > 100) || game.Any(char.IsControl)) throw new RpcException("invalid-params", "Spiel mit 2–100 Zeichen angeben.");
        if (size is not (3 or 4 or 5)) throw new RpcException("invalid-params", "Größe muss 3, 4 oder 5 sein.");
        var need = size * size;
        var f = _store.Snapshot();
        if (f.Mode == "claude")
        {
            if (f.KeyProtected == null) throw new RpcException("assistant-key", "Für Claude fehlt der API-Schlüssel – bitte am PC unter Assistent → Claude eintragen.");
            var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
            if (f.MonthlyLimitUsd <= 0 || (month?.CostUsd ?? 0) >= f.MonthlyLimitUsd)
                throw new RpcException("assistant-limit", $"Das Monatslimit für Claude ({f.MonthlyLimitUsd:0.00} $) ist erreicht. Für 0 € die Lokale KI (Ollama) verwenden oder die Aufgaben selbst eintragen.");
            var key = _secrets.Unprotect(f.KeyProtected) ?? throw new RpcException("assistant-key", "Der gespeicherte Schlüssel lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
            var r = await Claude.CompleteAsync(key, f.Model, BingoIdeas.System, BingoIdeas.Prompt(game, size), ct);
            var cost = ClaudeAssistant.Cost(r.Model, r.Input, r.Output, r.CacheRead, r.CacheWrite);
            RecordUsage(r.Input, r.Output, r.CacheRead, r.CacheWrite, cost);
            return new { tasks = EnoughTasks(BingoIdeas.Parse(r.Text, need), need), mode = "claude", model = ClaudeAssistant.PriceOf(r.Model).Label, costUsd = Math.Round(cost, 4) };
        }
        if (f.Mode == "ollama")
        {
            var r = await Ollama.CompleteAsync(f.OllamaUrl, f.OllamaModel ?? "", BingoIdeas.System, BingoIdeas.Prompt(game, size), ct);
            return new { tasks = EnoughTasks(BingoIdeas.Parse(r.Text, need), need), mode = "ollama", model = f.OllamaModel, costUsd = 0.0 };
        }
        throw new RpcException("assistant-local", "KI-Aufgaben braucht die Lokale KI (Ollama, 0 €) oder Claude – beides unter KI-Assistent → Einrichten wählbar. Bis dahin gehen auch Vorlage und eigene Aufgaben.");
    }

    /// <summary>
    /// Ultimate Bingo: tasks with level and category as JSON from the chosen AI. One request at a time (a second tap
    /// while one runs is refused, not queued). Everything the model returns is checked in <see cref="BingoPlan.Parse"/>.
    /// Without any AI configured this throws "assistant-local" – the app then uses its built-in catalog.
    /// </summary>
    public async Task<object> PlanBingoAsync(BingoRequest req, CancellationToken ct = default)
    {
        var r = BingoPlan.Check(req);
        if (!await _bingoBusy.WaitAsync(0, ct)) throw new RpcException("assistant-busy", "Es wird schon ein Bingo erstellt – einen Moment.");
        try
        {
            var f = _store.Snapshot();
            var need = r.Levels!.Sum();
            string text; string provider; string? model; double cost = 0;
            if (f.BingoAi == "deepseek" && f.DeepSeekKeyProtected != null)
            {
                var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
                if ((month?.DeepSeekRequests ?? 0) >= f.DeepSeekMonthlyRequests)
                    throw new RpcException("assistant-limit", $"Das Monatslimit von {f.DeepSeekMonthlyRequests} DeepSeek-Anfragen ist erreicht (änderbar am PC unter KI-Assistent). Der eingebaute Katalog funktioniert weiter.");
                var key = _secrets.Unprotect(f.DeepSeekKeyProtected) ?? throw new RpcException("assistant-key", "Der gespeicherte DeepSeek-Schlüssel lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
                var res = await DeepSeek.CompleteJsonAsync(key, f.DeepSeekModel, BingoPlan.System, BingoPlan.Prompt(r), ct);
                _store.Update(file =>
                {
                    var m = file.Usage.FirstOrDefault(u => u.Month == MonthKey);
                    if (m == null) { m = new AssistantUsageMonth { Month = MonthKey }; file.Usage.Add(m); }
                    m.DeepSeekRequests++; m.DeepSeekInputTokens += res.PromptTokens; m.DeepSeekOutputTokens += res.OutputTokens;
                });
                _hub.Changed("assistant");
                (text, provider, model) = (res.Text, "DeepSeek", res.Model);
            }
            else if (f.Mode == "claude" && f.KeyProtected != null)
            {
                var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
                if (f.MonthlyLimitUsd <= 0 || (month?.CostUsd ?? 0) >= f.MonthlyLimitUsd)
                    throw new RpcException("assistant-limit", $"Das Monatslimit für Claude ({f.MonthlyLimitUsd:0.00} $) ist erreicht. Der eingebaute Katalog funktioniert weiter.");
                var key = _secrets.Unprotect(f.KeyProtected) ?? throw new RpcException("assistant-key", "Der gespeicherte Schlüssel lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
                var res = await Claude.CompleteAsync(key, f.Model, BingoPlan.System, BingoPlan.Prompt(r), ct);
                cost = ClaudeAssistant.Cost(res.Model, res.Input, res.Output, res.CacheRead, res.CacheWrite);
                RecordUsage(res.Input, res.Output, res.CacheRead, res.CacheWrite, cost);
                (text, provider, model) = (res.Text, "Claude", ClaudeAssistant.PriceOf(res.Model).Label);
            }
            else if (f.Mode == "ollama")
            {
                var res = await Ollama.CompleteAsync(f.OllamaUrl, f.OllamaModel ?? "", BingoPlan.System, BingoPlan.Prompt(r), ct, json: true);
                (text, provider, model) = (res.Text, "Ollama", f.OllamaModel);
            }
            else throw new RpcException("assistant-local", "Keine KI eingerichtet – die Aufgaben kommen aus dem eingebauten Katalog. (KI wählbar unter KI-Assistent → Einrichten.)");
            var (known, tasks) = BingoPlan.Parse(text, r);
            if (tasks.Count < need) throw new RpcException("assistant-bingo", $"Die KI hat nur {tasks.Count} brauchbare von {need} Aufgaben geliefert – bitte noch einmal versuchen.");
            return new { known, tasks = tasks.Select(t => new { text = t.Text, level = t.Level, category = t.Category, team = t.Team, why = t.Why }), provider, model, costUsd = Math.Round(cost, 4) };
        }
        finally { _bingoBusy.Release(); }
    }

    readonly SemaphoreSlim _summaryBusy = new(1, 1);

    /// <summary>Claude is the assistant mode, has a key and the monthly limit is not reached – then research uses its web search.</summary>
    public bool ClaudeReady()
    {
        var f = _store.Snapshot();
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
        return f.Mode == "claude" && f.KeyProtected != null && f.MonthlyLimitUsd > 0 && (month?.CostUsd ?? 0) < f.MonthlyLimitUsd;
    }

    public sealed record ClaudeResearch(ClaudeAssistant.ResearchResult Result, string ModelLabel, double CostUsd);

    /// <summary>US dollars per web search (Anthropic: $10 per 1,000 searches, 10/2026), added to the token cost.</summary>
    public const double SearchPriceUsd = 0.01;

    /// <summary>Researched answer from Claude with web search; tokens and searches count against the monthly limit.</summary>
    public async Task<ClaudeResearch> ClaudeResearchAsync(string question, string context, bool force, ClaudeAssistant.ResearchProgress progress, CancellationToken ct = default)
    {
        var f = _store.Snapshot();
        if (!ClaudeReady()) throw new RpcException("assistant-limit", $"Claude ist nicht bereit (Modus, Schlüssel oder Monatslimit von {f.MonthlyLimitUsd:0.00} $).");
        var key = _secrets.Unprotect(f.KeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Claude-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
        var r = await Claude.ResearchAsync(key, f.Model, question, context, force, progress, ct);
        var cost = ClaudeAssistant.Cost(r.Model, r.Input, r.Output, r.CacheRead, r.CacheWrite) + r.Searches * SearchPriceUsd;
        RecordUsage(r.Input, r.Output, r.CacheRead, r.CacheWrite, cost);
        return new ClaudeResearch(r, ClaudeAssistant.PriceOf(r.Model).Label, cost);
    }

    /// <summary>
    /// Which AI writes JARVIS research answers: Claude or the local AI (Ollama) when that is the assistant mode, otherwise
    /// Gemini (free tier) when its key is set, otherwise DeepSeek. Never switched silently – the answer names the provider.
    /// </summary>
    static (string id, string label)? ResearchProvider(AssistantFile f) =>
        f.Mode == "claude" && f.KeyProtected != null ? ("claude", "Claude")
        : f.Mode == "ollama" && !string.IsNullOrEmpty(f.OllamaModel) ? ("ollama", $"Ollama ({f.OllamaModel})")
        : f.GeminiKeyProtected != null ? ("gemini", $"Gemini ({f.GeminiModel}, kostenlos)")
        : f.DeepSeekKeyProtected != null ? ("deepseek", $"DeepSeek ({f.DeepSeekModel})") : null;

    async Task<(string text, string provider, string? model, double cost)> ResearchCompleteAsync(string system, string prompt, CancellationToken ct)
    {
        var f = _store.Snapshot();
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
        switch (ResearchProvider(f)?.id)
        {
            case "claude":
            {
                if (f.MonthlyLimitUsd <= 0 || (month?.CostUsd ?? 0) >= f.MonthlyLimitUsd) throw new RpcException("assistant-limit", $"Das Monatslimit für Claude ({f.MonthlyLimitUsd:0.00} $) ist erreicht.");
                var key = _secrets.Unprotect(f.KeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Claude-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
                var res = await Claude.CompleteAsync(key, f.Model, system, prompt, ct);
                var cost = ClaudeAssistant.Cost(res.Model, res.Input, res.Output, res.CacheRead, res.CacheWrite);
                RecordUsage(res.Input, res.Output, res.CacheRead, res.CacheWrite, cost);
                return (res.Text, "Claude", ClaudeAssistant.PriceOf(res.Model).Label, cost);
            }
            case "ollama":
            {
                var res = await Ollama.CompleteAsync(f.OllamaUrl, f.OllamaModel ?? "", system, prompt, ct, json: true);
                return (res.Text, "Ollama", f.OllamaModel, 0);
            }
            case "gemini":
            {
                if ((month?.GeminiRequests ?? 0) >= f.GeminiMonthlyRequests) throw new RpcException("assistant-limit", $"Dein Monatslimit von {f.GeminiMonthlyRequests} Gemini-Anfragen ist erreicht (änderbar am PC unter KI-Assistent → Gemini).");
                var key = _secrets.Unprotect(f.GeminiKeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Gemini-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
                var res = await Gemini.CompleteJsonAsync(key, f.GeminiModel, system, prompt, ct);
                CountMonth(m => m.GeminiRequests++);
                return (res.Text, "Gemini", res.Model, 0);
            }
            case "deepseek":
            {
                if ((month?.DeepSeekRequests ?? 0) >= f.DeepSeekMonthlyRequests) throw new RpcException("assistant-limit", $"Das Monatslimit von {f.DeepSeekMonthlyRequests} DeepSeek-Anfragen ist erreicht.");
                var key = _secrets.Unprotect(f.DeepSeekKeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte DeepSeek-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
                var res = await DeepSeek.CompleteJsonAsync(key, f.DeepSeekModel, system, prompt, ct);
                CountMonth(m => { m.DeepSeekRequests++; m.DeepSeekInputTokens += res.PromptTokens; m.DeepSeekOutputTokens += res.OutputTokens; });
                return (res.Text, "DeepSeek", res.Model, 0);
            }
            default: throw new RpcException("assistant-local", "Keine KI eingerichtet – JARVIS zeigt dann die beste Fundstelle wörtlich. Kostenlos: am PC unter KI-Assistent einen Gemini-Schlüssel eintragen oder Ollama einrichten.");
        }
    }

    void CountMonth(Action<AssistantUsageMonth> change)
    {
        _store.Update(file =>
        {
            var m = file.Usage.FirstOrDefault(u => u.Month == MonthKey);
            if (m == null) { m = new AssistantUsageMonth { Month = MonthKey }; file.Usage.Add(m); }
            change(m);
        });
        _hub.Changed("assistant");
    }

    /// <summary>A German answer written only from the passages JARVIS found (see <see cref="SourceAnswer"/>). Limits apply.</summary>
    public async Task<object> SummarizeAsync(SourceAnswer.Request req, CancellationToken ct = default)
    {
        var r = SourceAnswer.Check(req);
        if (!await _summaryBusy.WaitAsync(0, ct)) throw new RpcException("assistant-busy", "Ich fasse gerade schon etwas zusammen – einen Moment.");
        try
        {
            var (text, provider, model, cost) = await ResearchCompleteAsync(SourceAnswer.System, SourceAnswer.Prompt(r), ct);
            var (answered, answer, best) = SourceAnswer.Parse(text, r.Passages.Count);
            return new { answered, answer, best, provider, model, costUsd = Math.Round(cost, 4) };
        }
        finally { _summaryBusy.Release(); }
    }

    public sealed class FreeQuestion { public string Question { get; set; } = ""; }

    /// <summary>Only on the user's tap "KI fragen (ohne Quelle)": the AI's own knowledge, returned marked as unchecked.</summary>
    public async Task<object> FreeAnswerAsync(FreeQuestion q, CancellationToken ct = default)
    {
        var question = SourceAnswer.CheckQuestion(q.Question);
        if (!await _summaryBusy.WaitAsync(0, ct)) throw new RpcException("assistant-busy", "Ich frage gerade schon nach – einen Moment.");
        try
        {
            var (text, provider, model, cost) = await ResearchCompleteAsync(SourceAnswer.FreeSystem, $"Frage: {question}", ct);
            var (answer, sure) = SourceAnswer.ParseFree(text);
            return new { answer, sure, provider, model, costUsd = Math.Round(cost, 4) };
        }
        finally { _summaryBusy.Release(); }
    }

    static List<string> EnoughTasks(List<string> tasks, int need)
    {
        if (tasks.Count < need) throw new RpcException("assistant-bingo", $"Die KI hat nur {tasks.Count} von {need} Aufgaben geliefert – bitte noch einmal versuchen.");
        return tasks;
    }

    public async Task<object> OllamaModelsAsync(CancellationToken ct = default)
    {
        var f = _store.Snapshot();
        var models = await Ollama.ModelsAsync(f.OllamaUrl, ct);
        return new { url = f.OllamaUrl, models = models.Select(m => new { m.name, sizeGb = Math.Round(m.size / 1e9, 1) }) };
    }

    internal AssistantFile Export() => _store.Snapshot();
}
