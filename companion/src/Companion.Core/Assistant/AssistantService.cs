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
    readonly SemaphoreSlim _bingoBusy = new(1, 1);

    sealed class Conv { public required string Owner; public ClaudeAssistant.Conversation Claude = new(); public OllamaAssistant.Conversation Ollama = new(); public DateTime LastUsed; public int Turns; public readonly SemaphoreSlim Lock = new(1, 1); }
    readonly ConcurrentDictionary<string, Conv> _convs = new();
    const int MaxTurns = 30;

    public AssistantService(AppPaths paths, ISecretProtector secrets, IHub hub, AssistantData data, ClaudeAssistant? claude = null, Func<DateTime>? now = null, OllamaAssistant? ollama = null, DeepSeekClient? deepSeek = null)
    {
        _store = new JsonStore<AssistantFile>(paths.File("assistant.json"));
        _secrets = secrets; _hub = hub; Data = data; _now = now ?? (() => DateTime.UtcNow);
        Local = new LocalAssistant(data);
        Claude = claude ?? new ClaudeAssistant(data);
        Ollama = ollama ?? new OllamaAssistant(data);
        DeepSeek = deepSeek ?? new DeepSeekClient();
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
        };
    }

    public sealed class Config
    {
        public string? Mode { get; set; } public string? Model { get; set; } public bool? LocalFirst { get; set; } public double? MonthlyLimitUsd { get; set; } public string? ApiKey { get; set; }
        public string? OllamaUrl { get; set; } public string? OllamaModel { get; set; } public bool? OllamaWhileGaming { get; set; }
        public string? BingoAi { get; set; } public string? DeepSeekKey { get; set; } public string? DeepSeekModel { get; set; } public int? DeepSeekMonthlyRequests { get; set; }
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
        if ((c.ApiKey != null || c.DeepSeekKey != null) && !atPc) throw new RpcException("forbidden", "Den API-Schlüssel kannst du nur direkt am PC eintragen oder löschen.");
        if (c.BingoAi is not (null or "assistant" or "deepseek")) throw new RpcException("invalid-params", "Bingo-KI muss „assistant“ oder „deepseek“ sein.");
        if (c.DeepSeekModel != null && !Regex.IsMatch(c.DeepSeekModel, @"^[A-Za-z0-9._:-]{2,60}$")) throw new RpcException("invalid-params", "Ungültiger DeepSeek-Modellname.");
        if (c.DeepSeekMonthlyRequests is < 0 or > 5000) throw new RpcException("invalid-params", "DeepSeek-Anfragen pro Monat: 0–5000.");
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
    public async Task<object> AskAsync(string owner, string who, string? conversationId, string text, CancellationToken ct = default, bool jarvis = false, bool jarvisRequested = false)
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
            var useClaude = f.Mode == "claude" && f.KeyProtected != null;
            var useOllama = f.Mode == "ollama";
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
            if ((useOllama && f.LocalFirst) || (useClaude && f.LocalFirst && simple))
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
            var result = await Claude.AskAsync(key, f.Model, conv.Claude, text, context, ct);
            var cost = ClaudeAssistant.Cost(result.ServedBy, result.Input, result.Output, result.CacheRead, result.CacheWrite);
            RecordUsage(result.Input, result.Output, result.CacheRead, result.CacheWrite, cost);
            result.Reply.CostUsd = Math.Round(cost, 4);
            return Done(conversationId, result.Reply, note);
        }
        finally { conv.Lock.Release(); }
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
