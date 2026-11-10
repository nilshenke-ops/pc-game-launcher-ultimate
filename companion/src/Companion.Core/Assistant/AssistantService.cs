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
    /// <summary>Web searches (Tavily) this month – counted against the person's own cap.</summary>
    public int SearchRequests { get; set; }
    public int SerperRequests { get; set; }
    public int ExaRequests { get; set; }
    public int BraveRequests { get; set; }
    public int SearxRequests { get; set; }
    /// <summary>DeepSeek (bingo tasks): counted, the price is billed by DeepSeek directly.</summary>
    public int DeepSeekRequests { get; set; }
    public long DeepSeekInputTokens { get; set; }
    public long DeepSeekOutputTokens { get; set; }
    /// <summary>KI-Router (OpenRouter, Groq, MixRoute, OmniRoute/LiteLLM): counted against the user's own monthly cap.</summary>
    public int RouterRequests { get; set; }
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
    /// <summary>Web search key (Tavily, free plan), protected like the other keys. Never returned, never in a backup.</summary>
    public string? SearchKeyProtected { get; set; }
    /// <summary>The person's home place: weather questions without a place use it ("Ich wohne in …" sets it; the first weather place asked is taken over, with a note).</summary>
    public string? HomePlace { get; set; }
    /// <summary>Further web search providers (free plans, no payment method), tried in the order Tavily → Serper → Exa.</summary>
    public string? SerperKeyProtected { get; set; }
    public string? ExaKeyProtected { get; set; }
    /// <summary>Brave Search API: its "free" part is $5 of credit every month and Brave asks for a card to prevent abuse – so only after a written confirmation (<see cref="BraveAcknowledged"/>).</summary>
    public string? BraveKeyProtected { get; set; }
    public bool BraveAcknowledged { get; set; }
    /// <summary>A SearXNG instance (own server or a trusted one) – no key; the address itself.</summary>
    public string? SearxUrl { get; set; }
    /// <summary>At most this many web searches per month (the free plan has 1,000; this stays below it).</summary>
    public int SearchMonthlyRequests { get; set; } = WebSearchClient.DefaultMonthly;
    /// <summary>DeepSeek API key, protected like the Anthropic key. Never returned, never in a backup.</summary>
    public string? DeepSeekKeyProtected { get; set; }
    public string DeepSeekModel { get; set; } = DeepSeekClient.DefaultModel;
    /// <summary>At most this many DeepSeek requests per month (protects against unexpected cost).</summary>
    public int DeepSeekMonthlyRequests { get; set; } = 200;
    /// <summary>OpenAI-compatible router: base address (https, or http only in the home network), key (protected), up to 3 models in priority order.</summary>
    public string? RouterBase { get; set; }
    public string? RouterKeyProtected { get; set; }
    public List<string> RouterModels { get; set; } = new();
    public int RouterMonthlyRequests { get; set; } = 1500;
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
    public WebSearchClient Search { get; }
    public SportsClient Sports { get; }
    public MemoryVault Memory { get; }
    public WeatherClient Weather { get; }
    public OpenAiCompatClient Router { get; }
    /// <summary>The free AI services in one fixed order with the cost guard (OpenRouter, Groq, Pollinations, Ollama).</summary>
    public FreeAiHub FreeAi { get; }
    readonly SemaphoreSlim _bingoBusy = new(1, 1);

    sealed class Conv { public required string Owner; public ClaudeAssistant.Conversation Claude = new(); public OllamaAssistant.Conversation Ollama = new(); public List<ChatTurn> Router = new(); public string? SmartText; public string? SmartOnly; public DateTime SmartAt; public string? SmartJson; public DateTime LastUsed; public int Turns; public readonly SemaphoreSlim Lock = new(1, 1); }
    readonly ConcurrentDictionary<string, Conv> _convs = new();
    const int MaxTurns = 30;

    public AssistantService(AppPaths paths, ISecretProtector secrets, IHub hub, AssistantData data, ClaudeAssistant? claude = null, Func<DateTime>? now = null, OllamaAssistant? ollama = null, DeepSeekClient? deepSeek = null, WebSearchClient? search = null, SportsClient? sports = null, WeatherClient? weather = null, OpenAiCompatClient? router = null, FreeAiHub? freeAi = null, MemoryVault? memory = null)
    {
        _store = new JsonStore<AssistantFile>(paths.File("assistant.json"));
        _secrets = secrets; _hub = hub; Data = data; _now = now ?? (() => DateTime.UtcNow);
        Local = new LocalAssistant(data);
        Claude = claude ?? new ClaudeAssistant(data);
        Ollama = ollama ?? new OllamaAssistant(data);
        DeepSeek = deepSeek ?? new DeepSeekClient();
        Search = search ?? new WebSearchClient();
        Sports = sports ?? new SportsClient();
        Memory = memory ?? new MemoryVault(paths, hub);
        Weather = weather ?? new WeatherClient();
        Router = router ?? new OpenAiCompatClient();
        FreeAi = freeAi ?? new FreeAiHub(paths, secrets);
        var f0 = _store.Snapshot();
        FreeAi.MigrateLegacy(f0.RouterBase, f0.RouterKeyProtected);
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
            // "" instead of null: the website tells by this field whether this companion knows the call at all.
            homePlace = f.HomePlace ?? "",
            deepSeek = new { keySet = f.DeepSeekKeyProtected != null, model = f.DeepSeekModel, monthlyRequests = f.DeepSeekMonthlyRequests, used = month.DeepSeekRequests, inputTokens = month.DeepSeekInputTokens, outputTokens = month.DeepSeekOutputTokens },
            bingoProvider = BingoProviderName(f),
            search = new
            {
                keySet = WebSearchClient.Providers.Any(i => SearchKeyOf(f, i) != null), monthlyRequests = f.SearchMonthlyRequests, used = month.SearchRequests,
                providers = WebSearchClient.Providers.Select(id => new { id, name = WebSearchClient.Name(id), keySet = SearchKeyOf(f, id) != null, used = SearchUsed(month, id), acknowledged = id == "brave" ? f.BraveAcknowledged : (bool?)null, url = id == "searxng" ? f.SearxUrl : null }).ToList(),
            },
            router = new { baseUrl = f.RouterBase, keySet = f.RouterKeyProtected != null, models = f.RouterModels, monthlyRequests = f.RouterMonthlyRequests, used = month.RouterRequests, ready = RouterReady(f) },
            researchAi = ResearchProvider(f)?.label,
            engines = Engines(),
            webSearch = f.Mode == "claude" && f.KeyProtected != null,
        };
    }

    /// <summary>
    /// The person's home place, as carried by the account: weather questions without a place use it. Set on the PC
    /// itself when the website of the PC connects, so it does not have to be said again there.
    /// </summary>
    public object SetHomePlace(string? place)
    {
        var clean = place?.Trim();
        if (clean is { Length: > 80 }) throw new RpcException("invalid-params", "Der Ort ist zu lang (höchstens 80 Zeichen).");
        if (clean is { Length: 0 }) clean = null;
        if (clean != null && clean.Any(char.IsControl)) throw new RpcException("invalid-params", "Ungültiger Ort.");
        _store.Update(x => x.HomePlace = clean);
        _hub.Changed("assistant");
        return new { homePlace = clean ?? "" };
    }

    public sealed class Config
    {
        public string? Mode { get; set; } public string? Model { get; set; } public bool? LocalFirst { get; set; } public double? MonthlyLimitUsd { get; set; } public string? ApiKey { get; set; }
        public string? OllamaUrl { get; set; } public string? OllamaModel { get; set; } public bool? OllamaWhileGaming { get; set; }
        public string? SearchKey { get; set; } public string? SerperKey { get; set; } public string? ExaKey { get; set; } public string? BraveKey { get; set; } public bool? BraveAcknowledged { get; set; } public string? SearxUrl { get; set; } public int? SearchMonthlyRequests { get; set; }
        public string? BingoAi { get; set; } public string? DeepSeekKey { get; set; } public string? DeepSeekModel { get; set; } public int? DeepSeekMonthlyRequests { get; set; }
       
        public string? RouterBase { get; set; } public string? RouterKey { get; set; } public List<string>? RouterModels { get; set; } public int? RouterMonthlyRequests { get; set; }
    }

    /// <summary>At least one free AI is set up and switched on: OpenRouter, Groq, Pollinations or a local model (Ollama).</summary>
    bool OllamaOn(AssistantFile f) => !string.IsNullOrEmpty(f.OllamaModel) && FreeAi.Configured("ollama");
    bool HasFreeAi(AssistantFile f) => CostGuard.KeyProviders.Any(FreeAi.Configured) || FreeAi.Configured("pollinations") || OllamaOn(f);
    static bool RouterReady(AssistantFile f) => f.RouterBase != null && f.RouterModels.Count > 0 && (f.RouterKeyProtected != null || IsHomeNetwork(f.RouterBase));
    static bool IsHomeNetwork(string url) => Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.IsLoopback || u.Host == "localhost" ||
        (System.Net.IPAddress.TryParse(u.Host, out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && ip.GetAddressBytes() is var b &&
         (b[0] == 10 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168))));

    /// <summary>Router address: https anywhere, http only on this PC or in the home network (self-hosted OmniRoute/LiteLLM). Keeps the path ("/api/v1").</summary>
    static string CheckRouterUrl(string url)
    {
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var u) || u.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(u.UserInfo) || !string.IsNullOrEmpty(u.Query) || !string.IsNullOrEmpty(u.Fragment))
            throw new RpcException("invalid-params", "Router-Adresse z. B. https://openrouter.ai/api/v1");
        if (u.Scheme == "http" && !IsHomeNetwork(u.ToString())) throw new RpcException("invalid-params", "Ohne https nur auf diesem PC oder im Heimnetz (z. B. http://192.168.0.10:20128/v1).");
        return u.GetLeftPart(UriPartial.Path).TrimEnd('/');
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
        if ((c.ApiKey != null || c.DeepSeekKey != null || c.SearchKey != null || c.SerperKey != null || c.ExaKey != null || c.BraveKey != null || c.SearxUrl != null || c.RouterKey != null || c.RouterBase != null) && !atPc) throw new RpcException("forbidden", "Den API-Schlüssel kannst du nur direkt am PC eintragen oder löschen.");
        var searchKey = c.SearchKey?.Trim();
        if (!string.IsNullOrEmpty(searchKey) && !WebSearchClient.LooksLikeKey(searchKey)) throw new RpcException("invalid-params", "Das sieht nicht nach einem Tavily-Schlüssel aus (tavily.com → API Keys, er beginnt mit „tvly-“).");
        var serperKey = c.SerperKey?.Trim(); var exaKey = c.ExaKey?.Trim();
        if (!string.IsNullOrEmpty(serperKey) && !WebSearchClient.LooksLikeKey("serper", serperKey)) throw new RpcException("invalid-params", "Das sieht nicht nach einem Serper-Schlüssel aus (serper.dev → API Key, 40 Zeichen aus Ziffern und Kleinbuchstaben a–f).");
        if (!string.IsNullOrEmpty(exaKey) && !WebSearchClient.LooksLikeKey("exa", exaKey)) throw new RpcException("invalid-params", "Das sieht nicht nach einem Exa-Schlüssel aus (dashboard.exa.ai → API Keys, er ist eine UUID wie 01234567-89ab-cdef-0123-456789abcdef).");
        var braveKey = c.BraveKey?.Trim(); var searxUrl = c.SearxUrl?.Trim();
        if (!string.IsNullOrEmpty(braveKey) && !WebSearchClient.LooksLikeKey("brave", braveKey)) throw new RpcException("invalid-params", "Das sieht nicht nach einem Brave-Schlüssel aus (api-dashboard.search.brave.com → API Keys, er beginnt mit „BSA“).");
        if (!string.IsNullOrEmpty(braveKey) && c.BraveAcknowledged != true && !_store.Snapshot().BraveAcknowledged) throw new RpcException("invalid-params", "Bitte zuerst bestätigen: Du nutzt bei Brave nur die monatlichen Gratis-Credits (5 $ ≈ 1000 Suchen) und lädst nichts auf.");
        if (!string.IsNullOrEmpty(searxUrl) && !WebSearchClient.LooksLikeSearxUrl(searxUrl)) throw new RpcException("invalid-params", "Die SearXNG-Adresse muss mit http:// oder https:// beginnen, z. B. https://search.example.org");
        if (c.SearchMonthlyRequests is < 0 or > 1000) throw new RpcException("invalid-params", "Websuchen pro Monat: 0–1000 (der kostenlose Tarif hat 1000).");
        if (c.BingoAi is not (null or "assistant" or "deepseek")) throw new RpcException("invalid-params", "Bingo-KI muss „assistant“ oder „deepseek“ sein.");
        if (c.DeepSeekModel != null && !Regex.IsMatch(c.DeepSeekModel, @"^[A-Za-z0-9._:-]{2,60}$")) throw new RpcException("invalid-params", "Ungültiger DeepSeek-Modellname.");
        if (c.DeepSeekMonthlyRequests is < 0 or > 5000) throw new RpcException("invalid-params", "DeepSeek-Anfragen pro Monat: 0–5000.");
        var rBase = c.RouterBase == null ? null : c.RouterBase.Trim().Length == 0 ? "" : CheckRouterUrl(c.RouterBase);
        // At OpenRouter only free models can be chosen – the router can never be pointed at a paid one.
        {
            var effBase = rBase ?? _store.Snapshot().RouterBase;
            var effModels = c.RouterModels ?? (rBase != null ? null : _store.Snapshot().RouterModels);
            if (effBase != null && Uri.TryCreate(effBase, UriKind.Absolute, out var ub) && ub.Host.EndsWith("openrouter.ai", StringComparison.OrdinalIgnoreCase) && effModels != null && effModels.Any(m => !CostGuard.IsFreeId(m ?? "")))
                throw new RpcException("invalid-params", "Bei OpenRouter sind nur kostenlose Modelle erlaubt (Kennzeichen „:free“ oder „openrouter/free“).");
        }
        var rKey = c.RouterKey?.Trim();
        if (!string.IsNullOrEmpty(rKey) && (rKey.Length is < 8 or > 300 || rKey.Any(char.IsWhiteSpace))) throw new RpcException("invalid-params", "Das sieht nicht wie ein API-Schlüssel aus.");
        if (c.RouterModels != null && (c.RouterModels.Count > 3 || c.RouterModels.Any(m => !Regex.IsMatch(m ?? "", @"^[A-Za-z0-9._:/@~-]{2,120}$")))) throw new RpcException("invalid-params", "Höchstens 3 Modelle mit gültigem Namen.");
        if (c.RouterMonthlyRequests is < 0 or > 100000) throw new RpcException("invalid-params", "Router-Anfragen pro Monat: 0–100000.");
        var dsKey = c.DeepSeekKey?.Trim();
        if (!string.IsNullOrEmpty(dsKey) && (dsKey.Length is < 20 or > 200 || dsKey.Any(char.IsWhiteSpace) || !dsKey.StartsWith("sk-") || dsKey.StartsWith("sk-ant-")))
            throw new RpcException("invalid-params", "Das sieht nicht wie ein DeepSeek-API-Schlüssel aus (beginnt mit „sk-“).");
        if (c.OllamaUrl != null && !atPc) throw new RpcException("forbidden", "Die Ollama-Adresse kannst du nur direkt am PC ändern.");
        if (c.Mode is not (null or "local" or "ollama" or "claude" or "router" or "smart")) throw new RpcException("invalid-params", "Modus muss „local“, „ollama“, „claude“, „router“ oder „smart“ sein.");
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
                if (c.Mode == "smart")
                {
                    var ok = HasFreeAi(f) || !string.IsNullOrEmpty(c.OllamaModel ?? f.OllamaModel);
                    if (!ok) throw new RpcException("assistant-key", "Für „Automatisch“ zuerst eine kostenlose KI einrichten (OpenRouter, Groq, Cerebras, Mistral, Pollinations oder lokale KI).");
                }
                if (c.Mode == "router")
                {
                    var b2 = rBase != null ? (rBase.Length == 0 ? null : rBase) : f.RouterBase;
                    var m2 = rBase is "" ? new List<string>() : c.RouterModels ?? f.RouterModels;
                    var k2 = rKey != null ? rKey.Length > 0 : rBase == null || rBase == f.RouterBase ? f.RouterKeyProtected != null : false;
                    if (b2 == null || m2.Count == 0 || !(k2 || IsHomeNetwork(b2))) throw new RpcException("assistant-key", "Für den KI-Router zuerst am PC Adresse, Schlüssel und ein Modell eintragen.");
                }
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
            if (c.SearchMonthlyRequests != null) f.SearchMonthlyRequests = c.SearchMonthlyRequests.Value;
            if (searchKey != null) f.SearchKeyProtected = searchKey.Length == 0 ? null : _secrets.Protect(searchKey);
            if (serperKey != null) f.SerperKeyProtected = serperKey.Length == 0 ? null : _secrets.Protect(serperKey);
            if (exaKey != null) f.ExaKeyProtected = exaKey.Length == 0 ? null : _secrets.Protect(exaKey);
            if (c.BraveAcknowledged != null) f.BraveAcknowledged = c.BraveAcknowledged.Value;
            if (braveKey != null) { f.BraveKeyProtected = braveKey.Length == 0 ? null : _secrets.Protect(braveKey); if (braveKey.Length > 0) f.BraveAcknowledged = true; }
            if (!f.BraveAcknowledged) f.BraveKeyProtected = null;
            if (searxUrl != null) f.SearxUrl = searxUrl.Length == 0 ? null : searxUrl.TrimEnd('/');
            if (c.DeepSeekModel != null) f.DeepSeekModel = c.DeepSeekModel;
            if (c.DeepSeekMonthlyRequests != null) f.DeepSeekMonthlyRequests = c.DeepSeekMonthlyRequests.Value;
            if (rBase != null)
            {
                // Another address: the old key must not go there – it is removed unless a new one comes along.
                if (rBase != (f.RouterBase ?? "") && rKey == null) f.RouterKeyProtected = null;
                f.RouterBase = rBase.Length == 0 ? null : rBase;
                if (rBase.Length == 0) f.RouterModels = new();
            }
            if (rKey != null) f.RouterKeyProtected = rKey.Length == 0 ? null : _secrets.Protect(rKey);
            if (c.RouterModels != null) f.RouterModels = c.RouterModels.Distinct().ToList();
            if (c.RouterMonthlyRequests != null) f.RouterMonthlyRequests = c.RouterMonthlyRequests.Value;
            if (f.Mode == "router" && !RouterReady(f)) f.Mode = "local";
            if (f.Mode == "gemini") f.Mode = "smart";   // Gemini was removed: an old setting becomes the automatic free AI
            // The first free AI that is set up switches the assistant to "Automatisch" by itself (commands stay at the PC, questions go to the free AI);
            // without any free AI left it falls back to the built-in assistant.
            if (f.Mode == "local" && c.Mode == null && !string.IsNullOrEmpty(c.OllamaModel)) f.Mode = "smart";
            if (f.Mode == "smart" && !HasFreeAi(f)) f.Mode = "local";
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
        if (rKey != null) Log.Info("assistant", rKey.Length == 0 ? "Router-Schlüssel entfernt." : "Router-Schlüssel gespeichert (geschützt).");
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
    public async Task<object> AskAsync(string owner, string who, string? conversationId, string text, CancellationToken ct = default, bool jarvis = false, bool jarvisRequested = false, string? engine = null, bool direct = false)
    {
        text = text.Trim();
        if (text.Length is 0 or > 2000) throw new RpcException("invalid-params", "Frage mit 1–2000 Zeichen.");
        _ask.Value = (text, jarvis, direct);
        if (WeatherClient.HomeFrom(text) is { } home)
        {
            _store.Update(x => x.HomePlace = home);
            _hub.Changed("assistant");
            return Done(conversationId ?? Ids.New("conv"), new AssistantReply { Text = $"Alles klar, ich merke mir: Du wohnst in {home}. Fragst du nach dem Wetter ohne Ort, sage ich dir das Wetter von {home}.", Sources = { "Gedächtnis" } }, null);
        }
        if (await MemoryReplyAsync(owner, text, conversationId) is { } memReply) return memReply;
        if (Regex.IsMatch(text, @"^\s*wo\s+wohne\s+ich\b", RegexOptions.IgnoreCase))
            return Done(conversationId ?? Ids.New("conv"), new AssistantReply { Text = _store.Snapshot().HomePlace is { } hp ? $"Du wohnst in {hp} – das habe ich mir gemerkt." : "Das weiß ich noch nicht. Sag einfach „Ich wohne in …“, dann merke ich es mir.", Sources = { "Gedächtnis" } }, null);
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
        // Commands and PC values never wait: they are answered before the conversation lock, so a slow AI answer in the same chat
        // (a free service can take 20 seconds or more) does not hold up "Starte …".
        AssistantReply? preLocal = null;
        // A question about a team's matches or about the weather is NOT a question about the PC: "Wie war das letzte Bayern-Spiel ausgegangen?" must not end up at
        // the local answer for "last played game / play time". Those go to the live data (OpenLigaDB, Open-Meteo) and the AI.
        var liveTopic = WeatherClient.AsksWeather(text) || (SportsClient.LooksSporty(text) && await Sports.NamesTeamAsync(text, _now(), ct));
        if (!liveTopic && ResolveEngine(_store.Snapshot(), engine).mode == "smart")
        {
            preLocal = await Local.AnswerAsync(text);
            if (preLocal.Confident && (preLocal.Actions.Any(a => a.Kind != "navigate") || preLocal.Sources.Any(x => !x.Contains(':'))))
            {
                preLocal.Sources.Add("Automatisch: Befehl oder Wert vom PC – lokal beantwortet (kostenlos)");
                conv.LastUsed = _now();
                return Done(conversationId, preLocal, note);
            }
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
            var useRouter = mode == "router";
            if (mode == "smart")
            {
                // Commands and live values of the PC are answered right here (a game that should start, PC values …) – instant, free, exact.
                var cmd = liveTopic ? new AssistantReply() : preLocal ?? await Local.AnswerAsync(text);
                if (cmd.Confident && (cmd.Actions.Any(a => a.Kind != "navigate") || cmd.Sources.Any(x => !x.Contains(':'))))
                {
                    cmd.Sources.Add("Automatisch: Befehl oder Wert vom PC – lokal beantwortet (kostenlos)");
                    return Done(conversationId, cmd, note);
                }
                return Done(conversationId, await SmartOnceAsync(f, conv, text, who, ct, null), note);
            }
            if (CostGuard.IsKeyProvider(mode) || mode == "pollinations") return Done(conversationId, await SmartOnceAsync(f, conv, text, who, ct, mode), note);
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
            if ((useOllama && f.LocalFirst) || ((useClaude || useRouter) && f.LocalFirst && simple))
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
            if (useRouter) return Done(conversationId, await RouterChatAsync(f, conv.Router, text, who, ct), note);
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
    (string mode, string claudeModel) ResolveEngine(AssistantFile f, string? engine)
    {
        engine = string.IsNullOrWhiteSpace(engine) ? "auto" : engine.Trim();
        if (engine == "auto") return (f.Mode switch { "claude" when f.KeyProtected == null => "local", "router" when !RouterReady(f) => "local", "smart" when !HasFreeAi(f) => "local", _ => f.Mode }, f.Model);
        if (engine == "smart") return HasFreeAi(f) ? ("smart", f.Model) : throw new RpcException("assistant-key", "Für „Automatisch“ zuerst eine kostenlose KI einrichten (OpenRouter, Groq, Cerebras, Mistral, Pollinations oder lokale KI).");
        if (CostGuard.IsKeyProvider(engine) || engine == "pollinations") return FreeAi.Configured(engine) ? (engine, f.Model) : throw new RpcException("assistant-key", $"{FreeAiHub.Name(engine)} ist noch nicht eingerichtet (KI-Verwaltung in JARVIS).");
        if (engine == "router") return RouterReady(f) ? ("router", f.Model) : throw new RpcException("assistant-key", "Der KI-Router ist am PC noch nicht eingerichtet (Adresse, Schlüssel, Modell).");
        if (engine == "local") return ("local", f.Model);
        if (engine == "ollama") return string.IsNullOrEmpty(f.OllamaModel) ? throw new RpcException("assistant-key", "Die lokale KI (Ollama) ist am PC noch nicht eingerichtet.") : ("ollama", f.Model);
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
        var list = new List<object>();
        if (HasFreeAi(f)) list.Add(new { id = "smart", label = "Automatisch (empfohlen): Befehle am PC, Fragen per freier KI", free = true });
        list.Add(new { id = "auto", label = $"Standard des PCs ({ModeLabel(f)})", free = f.Mode != "claude" });
        foreach (var pid in new[] { "openrouter", "groq", "cerebras", "mistral", "pollinations" }) if (FreeAi.Configured(pid)) list.Add(new { id = pid, label = $"{FreeAiHub.Name(pid)} (kostenlos)", free = true });
        list.Add(new { id = "local", label = "Eingebaut (ohne KI, 0 €)", free = true });
        if (OllamaOn(f)) list.Add(new { id = "ollama", label = $"Lokale KI: {f.OllamaModel} (0 €)", free = true });
        if (RouterReady(f)) list.Add(new { id = "router", label = $"KI-Router: {f.RouterModels[0]}{(f.RouterModels.All(m => m.EndsWith(":free")) ? " (kostenlos)" : "")}", free = f.RouterModels.All(m => m.EndsWith(":free")) });
        if (f.KeyProtected != null) foreach (var m in ClaudeAssistant.Models) list.Add(new { id = "claude:" + m.Id, label = $"{m.Label} (kostenpflichtig, Websuche)", free = false });
        return list;
    }

    string ModeLabel(AssistantFile f) => f.Mode switch
    {
        "claude" when f.KeyProtected != null => ClaudeAssistant.PriceOf(f.Model).Label,
        "ollama" when !string.IsNullOrEmpty(f.OllamaModel) => $"lokale KI {f.OllamaModel}",
        "router" when RouterReady(f) => $"KI-Router {f.RouterModels[0]}",
        "smart" when HasFreeAi(f) => "Automatisch: Befehle am PC, Fragen per freier KI",
        _ => "eingebaut",
    };

    /// <summary>The KI-Router as chat brain: no tools, no live data, says so instead of guessing.</summary>
    async Task<AssistantReply> RouterChatAsync(AssistantFile f, List<ChatTurn> history, string text, string who, CancellationToken ct)
    {
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
        if ((month?.RouterRequests ?? 0) >= f.RouterMonthlyRequests) throw new RpcException("assistant-limit", $"Dein Monatslimit von {f.RouterMonthlyRequests} Router-Anfragen ist erreicht.");
        history.Add(new ChatTurn("user", $"[Kontext – nicht vom Nutzer: {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}, Gerät: {who}]\n{text}"));
        if (history.Count > 20) history.RemoveRange(0, history.Count - 20);
        var res = await Router.ChatAsync(f.RouterBase!, RouterKey(f), f.RouterModels, ChatSystem(), history, json: false, ct);
        history.Add(new ChatTurn("model", res.Text));
        CountMonth(m => m.RouterRequests++);
        var fallback = res.Model != f.RouterModels[0] && !res.Model.StartsWith(f.RouterModels[0].Split(':')[0]);
        return new AssistantReply { Text = res.Text.Trim(), Mode = "router", Model = res.Model, CostUsd = 0, Sources = { fallback ? $"KI-Router – Ausweichmodell {res.Model} (das erste war nicht verfügbar)" : "KI-Router – ohne Live-Daten vom PC" } };
    }

    string? RouterKey(AssistantFile f) => f.RouterKeyProtected == null ? null : _secrets.Unprotect(f.RouterKeyProtected) ?? throw new RpcException("assistant-key", "Der gespeicherte Router-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");

    /// <summary>The models the router offers right now (to choose up to three at the PC); free ones first.</summary>
    public async Task<object> RouterModelsAsync(CancellationToken ct = default)
    {
        var f = _store.Snapshot();
        if (f.RouterBase == null) throw new RpcException("assistant-key", "Zuerst am PC die Router-Adresse eintragen.");
        var list = await Router.ModelsAsync(f.RouterBase, RouterKey(f), ct);
        return new { models = list.Select(m => new { id = m.Id, free = m.Free, context = m.Context }) };
    }

    string ChatSystem() => "Du bist JARVIS, der Gaming-Assistent im „Nexus Gaming Hub“. Antworte in der Sprache des Nutzers (meist Deutsch), kurz und konkret – gib direkt die Antwort, ohne Quellenangaben, ohne Markdown (keine Sternchen, Rauten oder Aufzählungszeichen). " +
            "Du hast in diesem Modus KEINE Werkzeuge und KEINE Live-Daten vom PC: Fragt der Nutzer nach Werten seines PCs, seinen Spielen oder Spielzeiten, sag ehrlich, dass du sie hier nicht siehst. Behaupte nie, etwas gestartet oder erledigt zu haben. " +
            "Erfinde nichts; bist du unsicher (neue Spiele, Patches, Zahlen), sag das und empfiehl „Im Internet suchen“. Keine Spoiler ohne Wunsch. Nur Gaming-Themen. Keine Hilfe bei Cheats oder Anti-Cheat-Umgehung.\n\n" +
            "Wissensbasis der App:\n" + Data.Knowledge.FullText;

    /// <summary>Errors that mean "this AI cannot answer right now" – the next one in the chain is tried. Cancelling is not one of them.</summary>
    static bool CanSkip(RpcException e) => e.Code is "assistant-limit" or "assistant-unavailable" or "assistant-offline" or "assistant-busy" or "assistant-error" or "assistant-model" or "assistant-key";

    // ------------------------------------------------------------------------------------------------ "Automatisch": the free AIs

    /// <summary>The same question twice within a few seconds (double tap, a retry) is answered once.</summary>
    async Task<AssistantReply> SmartOnceAsync(AssistantFile f, Conv conv, string text, string who, CancellationToken ct, string? only)
    {
        if (conv.SmartJson != null && conv.SmartText == text && conv.SmartOnly == only && _now() - conv.SmartAt < TimeSpan.FromSeconds(8))
        {
            var again = System.Text.Json.JsonSerializer.Deserialize<AssistantReply>(conv.SmartJson, Json.Options);
            if (again != null) return again;
        }
        var r = await SmartChatAsync(f, conv, text, who, ct, only);
        if (!r.Failed) { conv.SmartText = text; conv.SmartOnly = only; conv.SmartAt = _now(); conv.SmartJson = System.Text.Json.JsonSerializer.Serialize(r, Json.Options); }
        return r;
    }

    /// <summary>The short system text for the free services: no knowledge base (the built-in assistant answers app questions), no device name – less data leaves the PC and the free limits last longer.</summary>
    string FreeSystem() => "Du bist JARVIS, der Gaming-Assistent im „Nexus Gaming Hub“. Antworte in der Sprache des Nutzers (meist Deutsch), kurz und konkret – gib direkt die Antwort, ohne Quellenangaben, ohne Markdown (keine Sternchen, Rauten oder Aufzählungszeichen). " +
        "Du hast KEINE Werkzeuge und KEINE Live-Daten vom PC: Fragt der Nutzer nach Werten seines PCs, seinen Spielen oder Spielzeiten, sag ehrlich, dass du sie hier nicht siehst. Behaupte nie, etwas gestartet oder erledigt zu haben. " +
        "Erfinde nichts; bist du unsicher (neue Spiele, Patches, Zahlen), sag das. Keine Spoiler ohne Wunsch. Keine Hilfe bei Cheats oder Anti-Cheat-Umgehung.";

    static string Plain(string kind) => kind switch { "limit" => "Limit erreicht", "key" => "Schlüssel abgelehnt", "offline" => "nicht erreichbar", "down" => "Dienst gestört", "busy" => "zu langsam", "model" => "kein Modell frei", "empty" => "leere Antwort", "billing" => "würde Geld verlangen – nicht verwendet", _ => "Fehler" };

    /// <summary>
    /// "Automatisch": the free AIs one after the other in the order set in the KI-Verwaltung (OpenRouter → Groq → Pollinations → Ollama).
    /// One that is full, offline or refuses the key is skipped and the next one answers; the answer names the one that did and why.
    /// Nothing is ever bought: the cost guard in <see cref="FreeAiHub"/> stands in front of every request. If none can answer,
    /// the built-in assistant does and says so. <paramref name="only"/> = one chosen provider, no fallback.
    /// </summary>
    static string? SearchKeyOf(AssistantFile f, string id) => id switch { "serper" => f.SerperKeyProtected, "exa" => f.ExaKeyProtected, "brave" => f.BraveAcknowledged ? f.BraveKeyProtected : null, "searxng" => f.SearxUrl, _ => f.SearchKeyProtected };
    static int SearchUsed(AssistantUsageMonth? m, string id) => m == null ? 0 : id switch { "serper" => m.SerperRequests, "exa" => m.ExaRequests, "brave" => m.BraveRequests, "searxng" => m.SearxRequests, _ => m.SearchRequests };

    async Task<AssistantReply> SmartChatAsync(AssistantFile f, Conv conv, string text, string who, CancellationToken ct, string? only = null)
    {
        var failed = new List<string>();
        // Questions that need current facts (schedules, news, weather, prices): searched on the web first (own Tavily key, monthly cap), the AI answers from the results.
        string? webBlock = null, webSources = null; var needsWeb = WebSearchClient.Wanted(text);
        var anySearchKey = WebSearchClient.Providers.Any(id => SearchKeyOf(f, id) != null);
        var webKind = "Websuche";
        // Long-term memory (RAG): only the few best notes for THIS question go to the AI – never the whole vault; nothing is attached when nothing fits.
        if (!needsWeb && Memory.Enabled && Memory.ContextFor(text) is { } mem) { webBlock = mem.Block; webSources = string.Join(", ", mem.Paths); webKind = "Gedächtnis"; }
        // Football (schedules, scores): from OpenLigaDB first – free, no key, no search service needed. Other live questions go to the web search.
        string? homeNote = null;
        if (needsWeb || SportsClient.LooksSporty(text) || WeatherClient.AsksWeather(text))
        {
            try
            {
                var sp = await Sports.AskAsync(text, _now(), ct);
                if (sp != null) { webBlock = sp.Block; webSources = "OpenLigaDB"; webKind = "Sportdaten"; needsWeb = true; }
                else if (await Weather.AskAsync(text, f.HomePlace, ct) is { } wx)
                {
                    webBlock = wx.Block; webSources = "Open-Meteo"; webKind = "Wetterdaten"; needsWeb = true;
                    if (wx.FromQuestion && f.HomePlace == null) { _store.Update(x => x.HomePlace ??= wx.Place); homeNote = $"Ich merke mir {wx.Place} als deinen Ort – fragst du nach dem Wetter ohne Ort, sage ich es für {wx.Place}. („Ich wohne in …“ ändert das.)"; }
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        }
        // Web search also for football and weather: the free data source gives the exact numbers, the search adds news/context (and answers when the source has nothing).
        var dataBlock = webKind is "Sportdaten" or "Wetterdaten" ? webBlock : null;
        if (needsWeb && anySearchKey && (webBlock == null || dataBlock != null))
        {
            // one search provider after the other (Tavily → Serper → Exa) until one delivers; each has its own monthly cap and stops by itself at its free limit
            foreach (var sid in WebSearchClient.Providers)
            {
                if (SearchKeyOf(f, sid) is not { } prot) continue;
                var used = SearchUsed(f.Usage.FirstOrDefault(u => u.Month == MonthKey), sid);
                if (used >= f.SearchMonthlyRequests) { failed.Add($"{WebSearchClient.Name(sid)}: Monatslimit erreicht"); continue; }
                try
                {
                    var key = (sid == "searxng" ? prot : _secrets.Unprotect(prot)) ?? throw new RpcException("assistant-key", $"{WebSearchClient.Name(sid)}: Der Websuche-Schlüssel lässt sich nicht entschlüsseln.");
                    var hits = await Search.SearchAsync(sid, key, text, 5, ct);
                    CountMonth(m => { switch (sid) { case "serper": m.SerperRequests++; break; case "exa": m.ExaRequests++; break; case "brave": m.BraveRequests++; break; case "searxng": m.SearxRequests++; break; default: m.SearchRequests++; break; } });
                    if (hits.Count > 0)
                    {
                        var sb = WebSearchClient.Block(hits, TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local));
                        if (dataBlock != null) { webBlock = dataBlock + "\n\n" + sb; webSources = webSources + " + " + WebSearchClient.Domains(hits); }
                        else { webBlock = sb; webSources = WebSearchClient.Domains(hits); }
                        break;
                    }
                }
                catch (RpcException e) when (e.Code is "assistant-limit" or "assistant-offline" or "assistant-unavailable" or "assistant-key") { failed.Add("Websuche: " + e.Message); }
            }
        }
        // A league/sport with no free data source and no web search set up: say so honestly instead of letting a small AI claim "no access".
        if (webBlock == null && !anySearchKey && SportsClient.UncoveredLeague(text) is { } league)
            return new AssistantReply { Text = SportsClient.UncoveredAnswer(league), Sources = { "JARVIS" } };
        var active = FreeAi.ActiveOrder().Where(id => id != "ollama" || OllamaOn(f)).ToList();
        var strategy = only != null ? "single" : FreeAi.Strategy;
        List<string> order;
        if (only != null) order = new List<string> { only };
        else if (strategy == "single") { var pick = FreeAi.Single is { } sg && active.Contains(sg) ? sg : active.FirstOrDefault(); order = pick == null ? new() : new List<string> { pick }; }
        else order = active;
        var history = conv.Router;
        var openTurn = false;
        void EnsureTurn()
        {
            if (openTurn) return;
            history.Add(new ChatTurn("user", $"[Kontext – nicht vom Nutzer: {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}]\n{(webBlock != null ? webBlock + "\n\nFrage: " : "")}{text}"));
            if (history.Count > 20) history.RemoveRange(0, history.Count - 20);
            openTurn = true;
        }
        AssistantReply Tag(AssistantReply r, string label)
        {
            r.Sources.Insert(0, label);
            if (webSources != null) r.Sources.Add($"{webKind}: {webSources}");
            if (homeNote != null) r.Sources.Add("Gedächtnis: " + homeNote);
            else if (needsWeb && !anySearchKey && webKind == "Websuche") r.Text += "\n\n(Tipp: Für aktuelle Infos wie Spielpläne oder Nachrichten richte am PC unter KI-Assistent die kostenlose Websuche ein.)";
            if (failed.Count > 0) r.Sources.Insert(1, $"Automatisch: {string.Join("; ", failed)} – deshalb antwortet {label.Replace("Beantwortet von ", "")}");
            return r;
        }
        // "Schnellster gewinnt": OpenRouter and Groq are asked at the same time, the faster answer counts, the other request is cancelled.
        // (Both free limits are used for one question – that is the price of the speed.) If both fail, the rest of the order is tried as usual.
        var raceIds = strategy == "race" ? order.Where(CostGuard.IsKeyProvider).ToList() : new List<string>();
        if (raceIds.Count >= 2)
        {
            EnsureTurn();
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var running = raceIds.Select(id => (id, task: FreeAi.AskAsync(id, FreeSystem(), history, cts.Token, TimeSpan.FromSeconds(25), TimeSpan.Zero))).ToList();
            var pending = running.Select(r => r.task).ToList();
            FreeAnswer? win = null; var winner = "";
            while (pending.Count > 0 && win == null)
            {
                var done = await Task.WhenAny(pending);
                pending.Remove(done);
                var rid = running.First(r => r.task == done).id;
                try { win = await done; winner = rid; }
                catch (ProviderException e) { failed.Add($"{FreeAiHub.Name(rid)}: {Plain(e.Kind)}"); }
            }
            cts.Cancel();
            foreach (var p in pending) _ = p.ContinueWith(t => _ = t.Exception, TaskContinuationOptions.OnlyOnFaulted);   // the slower ones were cancelled – nobody waits for them
            if (win != null)
            {
                history.Add(new ChatTurn("model", win.Text));
                openTurn = false;
                var raced = new AssistantReply { Text = win.Text, Mode = winner, Model = win.Model, CostUsd = 0 };
                raced.Sources.Add("ohne Live-Daten vom PC");
                var tagged = Tag(raced, win.Label);
                tagged.Sources.Insert(1, $"Schnellster gewinnt: {FreeAiHub.Name(winner)} antwortete zuerst");
                return tagged;
            }
            order = order.Where(id => !raceIds.Contains(id)).ToList();
        }
        for (var oi = 0; oi < order.Count; oi++)
        {
            var id = order[oi];
            var last = oi == order.Count - 1;
            ct.ThrowIfCancellationRequested();
            if (id == "ollama")
            {
                if (string.IsNullOrEmpty(f.OllamaModel)) { failed.Add("Ollama: keine lokale KI eingerichtet"); continue; }
                if (!f.OllamaWhileGaming && Data.GameRunning()) { failed.Add("Ollama: pausiert, solange ein Spiel läuft"); continue; }
                try
                {
                    var o = await Ollama.AskAsync(f.OllamaUrl, f.OllamaModel, conv.Ollama, text, $"[Kontext – nicht vom Nutzer: Zeit {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}]", ct);
                    FreeAi.NoteOllama(f.OllamaModel);
                    return Tag(o.Reply, $"Beantwortet von Ollama – lokal auf deinem PC ({f.OllamaModel})");
                }
                catch (RpcException e) when (CanSkip(e)) { failed.Add($"Ollama: {e.Message}"); continue; }
            }
            EnsureTurn();
            try
            {
                // Not the last one in line: give up after 20 s and ask the next; the last one may take 45 s and wait out a short rate limit.
                var a = await FreeAi.AskAsync(id, FreeSystem(), history, ct, last ? TimeSpan.FromSeconds(45) : TimeSpan.FromSeconds(20), last ? TimeSpan.FromSeconds(30) : TimeSpan.Zero);
                history.Add(new ChatTurn("model", a.Text));
                openTurn = false;
                var reply = new AssistantReply { Text = a.Text, Mode = id, Model = a.Model, CostUsd = 0 };
                reply.Sources.Add("ohne Live-Daten vom PC");
                return Tag(reply, a.Label);
            }
            catch (ProviderException e) { failed.Add(only == null ? $"{FreeAiHub.Name(id)}: {Plain(e.Kind)}" : e.Message); if (only != null) throw new RpcException(e.Kind == "key" ? "assistant-key" : e.Kind == "limit" ? "assistant-limit" : "assistant-unavailable", e.Message); }
        }
        if (openTurn && history.Count > 0 && history[^1].Role == "user") history.RemoveAt(history.Count - 1);
        var local = await Local.AnswerAsync(text);
        local.Text = (failed.Count == 0
            ? "Es ist noch keine kostenlose KI eingerichtet – ich antworte mit dem eingebauten Assistenten.\n\n"
            : "Momentan ist keine kostenlose externe KI erreichbar.\n" + string.Join("\n", failed.Select(x => "• " + x)) + "\n\nIch antworte mit dem eingebauten Assistenten:\n\n") + local.Text;
        local.Sources.Insert(0, "Automatisch: eingebauter Assistent (keine KI erreichbar)");
        return local;
    }

    // ------------------------------------------------------------------------------------------------ KI-Verwaltung (website)

    /// <summary>Everything the KI-Verwaltung shows: the four providers in their order, state, models, limits, the last answer. Never a key.</summary>
    public async Task<object> AiStatusAsync(bool refresh, CancellationToken ct = default)
    {
        if (refresh) await FreeAi.RefreshLimitsAsync(ct);
        return AiStatus();
    }

    public object AiStatus()
    {
        var f = _store.Snapshot(); var last = FreeAi.Last();
        return new
        {
            providers = FreeAi.Providers(f.OllamaModel), auto = FreeAi.Auto, strategy = FreeAi.Strategy, single = FreeAi.Single, mode = f.Mode, smart = f.Mode == "smart", anyReady = HasFreeAi(f),
            last = last.provider == null ? null : new { provider = last.provider, name = FreeAiHub.Name(last.provider), model = last.model, at = last.at },
            costGuard = new { freeOnly = true, rules = new[] {
                "Nur kostenlose Modelle: bei OpenRouter das Gratis-Routing openrouter/free und Modelle mit Preis 0 (:free) – vor jeder Anfrage erneut geprüft, dazu Höchstpreis 0 in der Anfrage.",
                "Keine bezahlten Ausweichmodelle, kein Aufladen von Guthaben, keine Abos.",
                "Ist das Gratis-Limit erreicht oder ein Anbieter gestört, wechselt JARVIS zum nächsten – oder sagt offen, dass gerade keine kostenlose KI erreichbar ist.",
                "Schlüssel liegen geschützt am PC, nie auf der Webseite, nie in GitHub." } },
        };
    }

    /// <summary>Switches a provider on/off, stores a key (protected), or records the confirmation (Groq: free plan) / consent (Pollinations).</summary>
    public object AiSet(string provider, bool? enabled, string? key, bool? attested, bool? consent, bool secureChannel)
    {
        if (!string.IsNullOrEmpty(key) && !secureChannel) throw new RpcException("forbidden", "Einen Schlüssel kannst du nur über eine verschlüsselte Verbindung oder direkt am PC eintragen. Im Heimnetz ohne Verschlüsselung bitte am PC eintippen – oder über die Relay-Verbindung (anderes Netz).");
        FreeAi.Set(provider, enabled, key, attested, consent);
        _store.Update(f =>
        {
            if (f.Mode == "local" && HasFreeAi(f)) f.Mode = "smart";        // the first free AI switches to "Automatisch" by itself
            else if (f.Mode == "smart" && !HasFreeAi(f)) f.Mode = "local";
        });
        _hub.Changed("assistant");
        return AiStatus();
    }

    public object AiOrder(IEnumerable<string> order) { FreeAi.SetOrder(order); _hub.Changed("assistant"); return AiStatus(); }
    public object AiAuto(bool on) { FreeAi.SetAuto(on); _hub.Changed("assistant"); return AiStatus(); }
    /// <summary>How the free AIs work together: "fallback" (one after the other), "race" (all AIs with a key at once, the faster counts) or "single" (only one).</summary>
    public object AiStrategy(string strategy, string? single) { FreeAi.SetStrategy(strategy, single); _hub.Changed("assistant"); return AiStatus(); }

    /// <summary>A real connection test (key, models, one tiny question) – the answer says what worked or what did not, in plain words.</summary>
    public async Task<object> AiTestAsync(string provider, CancellationToken ct = default)
    {
        var f = _store.Snapshot();
        if (provider == "ollama")
        {
            if (string.IsNullOrEmpty(f.OllamaModel)) return new { ok = false, message = "Ollama ist noch nicht eingerichtet (am PC: Ollama installieren, ein Modell wählen)." };
            try
            {
                var models = await Ollama.ModelsAsync(f.OllamaUrl, ct);
                var has = models.Any(m => m.name == f.OllamaModel || m.name.StartsWith(f.OllamaModel + ":"));
                if (!has) { FreeAi.NoteOllamaError("Modell nicht installiert"); return new { ok = false, message = $"Ollama läuft, aber das Modell „{f.OllamaModel}“ ist nicht installiert." }; }
                FreeAi.NoteOllama(f.OllamaModel);
                return new { ok = true, message = $"Ollama erreichbar – Modell {f.OllamaModel} ist da. Läuft auf deinem PC, kostet nichts.", model = f.OllamaModel, ms = 0L, models = models.Count };
            }
            catch (RpcException e) { FreeAi.NoteOllamaError(e.Message); return new { ok = false, message = $"Ollama nicht erreichbar: {e.Message}" }; }
        }
        var r = await FreeAi.TestAsync(provider, ct);
        _hub.Changed("assistant");
        return new { ok = r.Ok, message = r.Message, model = r.Model, ms = r.Ms, models = r.Models };
    }

    public async Task<object> AiModelsAsync(string provider, CancellationToken ct = default)
    {
        if (provider == "ollama") { var f = _store.Snapshot(); var m = await Ollama.ModelsAsync(f.OllamaUrl, ct); return new { models = m.Select(x => new { id = x.name, context = 0L }) }; }
        try { var list = await FreeAi.RefreshModelsAsync(provider, ct); return new { models = list.Select(x => new { id = x.Id, context = x.Context }) }; }
        catch (ProviderException e) { throw new RpcException(e.Kind == "key" ? "assistant-key" : "assistant-unavailable", e.Message); }
    }

    readonly AsyncLocal<(string text, bool jarvis, bool direct)> _ask = new();
    readonly Dictionary<string, string> _lastUser = new();

    /// <summary>"Merk dir …" / "Wo war ich bei … stehen geblieben?" – answered from the vault itself (no AI needed, nothing invented). Null = not a memory request (or no memory).</summary>
    readonly System.Collections.Concurrent.ConcurrentDictionary<string, (string text, DateTime at)> _pendingConflict = new();

    Task<object?> MemoryReplyAsync(string owner, string text, string? conversationId)
    {
        object? Reply(string t, string? src, bool failed = false)
        {
            var r = new AssistantReply { Text = t, Failed = failed };
            r.Sources.Add(src ?? "Gedächtnis");
            return Done(conversationId ?? Ids.New("conv"), r, null);
        }
        // The answer to JARVIS' "replace it or keep both?" (asked in the last 10 minutes): nothing was saved before this.
        if (Memory.Enabled && _pendingConflict.TryGetValue(owner, out var pend))
        {
            if (_now() - pend.at > TimeSpan.FromMinutes(10)) _pendingConflict.TryRemove(owner, out _);
            else if (MemoryIntents.ConflictAnswer(text) is { } ans)
            {
                _pendingConflict.TryRemove(owner, out _);
                if (ans == "cancel") return Task.FromResult(Reply("Gut, ich habe nichts geändert – das Alte gilt weiter.", null));
                try
                {
                    var games0 = Data.Library().Where(i => i.Kind == Models.ItemKind.Game).Select(i => i.Name).ToList();
                    var res0 = Memory.Remember(pend.text, games0, ans);
                    return Task.FromResult(Reply((ans == "replace" ? "Ersetzt – das Alte ist durchgestrichen und bleibt im Verlauf nachlesbar. " : "Beides steht jetzt drin. ") + res0.Message, "Gedächtnis: " + res0.Path));
                }
                catch (RpcException e) { return Task.FromResult(Reply(e.Message, "Gedächtnis", failed: true)); }
            }
        }
        var remember = MemoryIntents.RememberText(text);
        var topic = remember == null ? MemoryIntents.RecallTopic(text) : null;
        var isDelete = remember == null && topic == null && MemoryIntents.IsDeleteRequest(text);
        if (!Memory.Enabled)
        {
            // memory is not connected: the older behaviour stays (the browser's own "Gaming-Gedächtnis"); only say why when someone asked it to be the long-term memory
            return Task.FromResult<object?>(null);
        }
        if (isDelete) return Task.FromResult(Reply("Löschen mache ich nie von allein. Öffne „JARVIS MEMORY“, wähle die Notiz und lösche sie dort (das musst du in den Einstellungen erst erlauben) – gelöschte Notizen landen im Papierkorb des Vaults, nicht endgültig weg.", "Gedächtnis"));
        if (remember != null)
        {
            var payload = remember;
            if (payload.Length == 0) _lastUser.TryGetValue(owner, out payload);
            else if (Regex.IsMatch(text, @"\bdass\b", RegexOptions.IgnoreCase)) payload = MemoryIntents.MainClause(payload);   // "dass mein Lieblingsspiel Celeste ist" → "mein Lieblingsspiel ist Celeste"
            if (string.IsNullOrWhiteSpace(payload)) return Task.FromResult(Reply("Was soll ich mir merken? Sag zum Beispiel: „Merk dir, dass mein Minecraft-Projekt noch nicht fertig ist.“", null));
            try
            {
                var games = Data.Library().Where(i => i.Kind == Models.ItemKind.Game).Select(i => i.Name).ToList();
                var res = Memory.Remember(payload, games);
                if (res.Status == "conflict") _pendingConflict[owner] = (payload, _now());
                return Task.FromResult(Reply(res.Message, "Gedächtnis: " + res.Path));
            }
            catch (RpcException e) { return Task.FromResult(Reply(e.Message, "Gedächtnis", failed: true)); }
        }
        if (topic != null)
        {
            var found = Memory.Recall(topic);
            return Task.FromResult(found != null ? Reply(found, "Gedächtnis") : Reply($"Zu „{topic}“ steht nichts in meinem Gedächtnis – ich sage dir also nichts, was ich nicht weiß. Wenn du magst: „Merk dir, dass …“, dann speichere ich es.", "Gedächtnis"));
        }
        _lastUser[owner] = text;
        return Task.FromResult<object?>(null);
    }

    object Done(string conversationId, AssistantReply reply, string? note)
    {
        if (note != null) reply.Text = note + "\n\n" + reply.Text;
        var (text, jarvis, direct) = _ask.Value;
        // "direct": the person typed or said the command themselves (the island): what they named runs at once – no second question.
        if (Memory.Enabled && Memory.Config.Auto != "off" && Memory.Config.WriteEnabled && !reply.Failed && MemoryIntents.LooksWorthKeeping(text) && !reply.Sources.Any(x => x.StartsWith("Gedächtnis")))
        {
            if (Memory.Config.Auto == "auto")
            {
                try { var res = Memory.Remember(text, Data.Library().Where(i => i.Kind == Models.ItemKind.Game).Select(i => i.Name).ToList()); reply.Sources.Add("Gedächtnis: " + res.Message); }
                catch (RpcException) { /* not saved – nothing to say */ }
            }
            else if (!reply.Suggestions.Contains("Merk dir das")) reply.Suggestions.Add("Merk dir das");
        }
        if (jarvis || direct) Jarvis.MarkAuto(reply, text);
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
    /// the free AIs (OpenRouter, Groq, Pollinations, Ollama in the order set up) when one is ready, otherwise DeepSeek. Never switched silently – the answer names the provider.
    /// </summary>
    (string id, string label)? ResearchProvider(AssistantFile f) =>
        f.Mode == "claude" && f.KeyProtected != null ? ("claude", "Claude")
        : f.Mode == "ollama" && !string.IsNullOrEmpty(f.OllamaModel) ? ("ollama", $"Ollama ({f.OllamaModel})")
        : f.Mode == "router" && RouterReady(f) ? ("router", $"KI-Router ({f.RouterModels[0]})")
        : RouterReady(f) ? ("router", $"KI-Router ({f.RouterModels[0]})")
        : FreeAi.ActiveOrder().Count > 0 ? ("free", "Kostenlose KI (" + string.Join(" → ", FreeAi.ActiveOrder().Select(FreeAiHub.Name)) + ")")
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
            case "free":
            {
                // The free AIs in the order set up at the PC; the first one that answers writes the text (named in the answer).
                var hist = new[] { new ChatTurn("user", prompt) };
                ProviderException? last = null;
                foreach (var id in FreeAi.ActiveOrder())
                {
                    try
                    {
                        if (id == "ollama") { var o = await Ollama.CompleteAsync(f.OllamaUrl, f.OllamaModel ?? "", system, prompt, ct, json: true); return (o.Text, "Ollama", f.OllamaModel, 0); }
                        var a = await FreeAi.AskAsync(id, system, hist, ct); return (a.Text, FreeAiHub.Name(id), a.Model, 0);
                    }
                    catch (ProviderException e) { last = e; }
                    catch (RpcException e) when (id == "ollama") { last = new ProviderException("down", e.Message); }
                }
                throw new RpcException("assistant-local", last?.Message ?? "Gerade ist keine kostenlose KI erreichbar.");
            }
            case "router":
            {
                if ((month?.RouterRequests ?? 0) >= f.RouterMonthlyRequests) throw new RpcException("assistant-limit", $"Dein Monatslimit von {f.RouterMonthlyRequests} Router-Anfragen ist erreicht.");
                var res = await Router.ChatAsync(f.RouterBase!, RouterKey(f), f.RouterModels, system, new[] { new ChatTurn("user", prompt) }, json: true, ct);
                CountMonth(m => m.RouterRequests++);
                return (res.Text, "KI-Router", res.Model, 0);
            }
            case "deepseek":
            {
                if ((month?.DeepSeekRequests ?? 0) >= f.DeepSeekMonthlyRequests) throw new RpcException("assistant-limit", $"Das Monatslimit von {f.DeepSeekMonthlyRequests} DeepSeek-Anfragen ist erreicht.");
                var key = _secrets.Unprotect(f.DeepSeekKeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte DeepSeek-Schlüssel lässt sich nicht entschlüsseln. Bitte am PC neu eintragen.");
                var res = await DeepSeek.CompleteJsonAsync(key, f.DeepSeekModel, system, prompt, ct);
                CountMonth(m => { m.DeepSeekRequests++; m.DeepSeekInputTokens += res.PromptTokens; m.DeepSeekOutputTokens += res.OutputTokens; });
                return (res.Text, "DeepSeek", res.Model, 0);
            }
            default: throw new RpcException("assistant-local", "Keine KI eingerichtet – JARVIS zeigt dann die beste Fundstelle wörtlich. Kostenlos: unter KI-Verwaltung OpenRouter, Groq oder Pollinations einrichten – oder Ollama am PC.");
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

    // ---------------------------------------------------------------- loading a model into Ollama (from the UI, with progress)

    public sealed record PullInfo(string Model, string Status, int Percent, bool Done, string? Error);
    PullInfo? _pull;
    readonly object _pullLock = new();
    static readonly System.Text.RegularExpressions.Regex ModelName = new(@"^[a-z0-9][a-z0-9._-]{0,60}(/[a-z0-9][a-z0-9._-]{0,60})?(:[a-zA-Z0-9._-]{1,40})?$");

    public object OllamaPullStatus()
    {
        var p = _pull;
        return p == null ? new { active = false, model = (string?)null, status = "", percent = 0, done = false, error = (string?)null }
            : new { active = !p.Done && p.Error == null, model = (string?)p.Model, status = p.Status, percent = p.Percent, done = p.Done, error = p.Error };
    }

    /// <summary>Starts loading a model (only from Ollama's own library, one at a time). Returns at once; <see cref="OllamaPullStatus"/> shows the progress.</summary>
    public object OllamaPullStart(string model)
    {
        model = model.Trim().ToLowerInvariant();
        if (!ModelName.IsMatch(model)) throw new RpcException("invalid-params", "Modellname z. B. qwen2.5:7b (nur Buchstaben, Zahlen, . _ - : /).");
        lock (_pullLock)
        {
            if (_pull is { Done: false, Error: null }) throw new RpcException("busy", $"Es wird gerade schon „{_pull.Model}“ geladen – bitte warten.");
            _pull = new PullInfo(model, "Starte …", 0, false, null);
        }
        var url = _store.Snapshot().OllamaUrl;
        _ = Task.Run(async () =>
        {
            try
            {
                await Ollama.PullAsync(url, model, (status, total, done) =>
                {
                    var pct = total > 0 ? (int)Math.Min(99, done * 100 / total) : _pull?.Percent ?? 0;
                    _pull = new PullInfo(model, status, pct, false, null);
                });
                _pull = new PullInfo(model, "Fertig", 100, true, null);
                Log.Info("assistant", $"Ollama-Modell {model} geladen");
            }
            catch (Exception ex) { _pull = new PullInfo(model, "", _pull?.Percent ?? 0, false, ex is RpcException r ? r.Message : "Laden fehlgeschlagen: " + ex.Message); Log.Warn("assistant", "Ollama-Pull: " + ex.Message); }
        });
        return OllamaPullStatus();
    }

    internal AssistantFile Export() => _store.Snapshot();
}
