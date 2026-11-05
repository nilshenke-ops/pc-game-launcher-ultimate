using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

// "Free AI" – several free AI services in one fixed order (OpenRouter → Groq → Cerebras → Mistral → Pollinations → Ollama) with ONE rule above all:
// it must never cost money. Nothing in this file can pick a paid model, a paid endpoint or a paid fallback:
//   • the addresses are fixed here (no user-supplied base URL), keys only ever go to their own host,
//   • OpenRouter: only models whose listed price is 0 in EVERY field AND that end in ":free" – checked again before every request –
//     and every request additionally carries provider.max_price = 0 (OpenRouter itself then refuses anything that is not free),
//   • Groq, Cerebras, Mistral: only used after the person confirmed the free plan (no payment method); a rate limit (429) switches to the next AI,
//   • Pollinations: only the keyless anonymous endpoint, never with a key; a "budget reached" notice is an error, never an answer,
//   • Ollama: local, no external cost.
// The keys are stored protected at the PC (like all keys here) and are never part of any status.

public sealed class FreeProviderCfg
{
    public bool Enabled { get; set; }
    public string? KeyProtected { get; set; }
    /// <summary>Groq, Cerebras, Mistral: the person confirmed "free plan, no payment method".</summary>
    public bool Attested { get; set; }
    /// <summary>Pollinations: the person agreed that questions go to this third-party service.</summary>
    public bool Consent { get; set; }
}

public sealed class FreeAiFile
{
    public List<string> Order { get; set; } = new() { "openrouter", "groq", "cerebras", "mistral", "pollinations", "ollama" };
    public Dictionary<string, FreeProviderCfg> Providers { get; set; } = new();
    /// <summary>Older versions: automatic switching on/off. Read once and turned into <see cref="Strategy"/>.</summary>
    public bool? Auto { get; set; }
    /// <summary>How the free AIs work together: "fallback" = in this order, the next one if one is full or down; "race" = all AIs with a key are asked at the same
    /// time and the faster answer counts; "single" = only one AI (<see cref="Single"/>, or the first active one), never another.</summary>
    public string Strategy { get; set; } = "fallback";
    public string? Single { get; set; }
    public string? LastProvider { get; set; }
    public string? LastModel { get; set; }
    public DateTime? LastAt { get; set; }
    public bool Migrated { get; set; }
}

/// <summary>Why a provider could not answer (the next one is tried).</summary>
public sealed class ProviderException : Exception
{
    /// <summary>limit · down · offline · busy · key · billing · model · empty · blocked · error</summary>
    public string Kind { get; }
    public TimeSpan? RetryAfter { get; }
    public ProviderException(string kind, string message, TimeSpan? retryAfter = null) : base(message) { Kind = kind; RetryAfter = retryAfter; }
}

public sealed record FreeModel(string Id, long Context, int Rank);
public sealed record FreeAnswer(string Text, string Provider, string Model, string Label, long PromptTokens, long OutputTokens);

/// <summary>The cost rules as pure functions (tested without a network).</summary>
public static class CostGuard
{
    public const string OpenRouterBase = "https://openrouter.ai/api/v1";
    public const string GroqBase = "https://api.groq.com/openai/v1";
    public const string CerebrasBase = "https://api.cerebras.ai/v1";
    public const string MistralBase = "https://api.mistral.ai/v1";
    public const string PollinationsUrl = "https://text.pollinations.ai/openai";

    public static string? Endpoint(string id) => id switch { "openrouter" => OpenRouterBase, "groq" => GroqBase, "cerebras" => CerebrasBase, "mistral" => MistralBase, "pollinations" => PollinationsUrl, _ => null };

    /// <summary>The AIs that need the person's own free key (OpenAI-compatible, model list at /models).</summary>
    public static readonly string[] KeyProviders = { "openrouter", "groq", "cerebras", "mistral" };
    public static bool IsKeyProvider(string id) => Array.IndexOf(KeyProviders, id) >= 0;
    /// <summary>Their free plan is a plan of the account, not a price on the model – so the person confirms "free plan, no payment method" first (OpenRouter prices every model: checked per request instead).</summary>
    public static bool NeedsAttestation(string id) => id is "groq" or "cerebras" or "mistral";

    /// <summary>A key may only be sent to its own host.</summary>
    public static bool HostAllowed(string id, string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme == Uri.UriSchemeHttps && id switch
        {
            "openrouter" => u.Host == "openrouter.ai",
            "groq" => u.Host == "api.groq.com",
            "cerebras" => u.Host == "api.cerebras.ai",
            "mistral" => u.Host == "api.mistral.ai",
            "pollinations" => u.Host == "text.pollinations.ai",
            _ => false,
        };

    /// <summary>OpenRouter's own router for free models. The other "openrouter/…" routers (auto, fusion, …) have variable prices and are never used.</summary>
    public const string FreeRouter = "openrouter/free";
    /// <summary>The only ids that can ever be sent to OpenRouter: ends in ":free", or exactly "openrouter/free".</summary>
    public static bool IsFreeId(string id) => id.EndsWith(":free", StringComparison.Ordinal) || id == FreeRouter;

    /// <summary>A model of the OpenRouter list is free only if its id is a free id AND every price in its "pricing" is 0 (no overrides, no negative "variable" price, no unknown value).</summary>
    public static bool IsFreeOpenRouter(JsonElement model)
    {
        if (model.ValueKind != JsonValueKind.Object || !model.TryGetProperty("id", out var idv) || idv.ValueKind != JsonValueKind.String) return false;
        if (!IsFreeId(idv.GetString() ?? "")) return false;
        if (!model.TryGetProperty("pricing", out var pr) || pr.ValueKind != JsonValueKind.Object) return false;
        var sawPrompt = false; var sawCompletion = false;
        foreach (var p in pr.EnumerateObject())
        {
            if (p.Name == "overrides") { if (p.Value.ValueKind == JsonValueKind.Array && p.Value.GetArrayLength() > 0) return false; continue; }
            decimal d;
            switch (p.Value.ValueKind)
            {
                case JsonValueKind.Number: if (!p.Value.TryGetDecimal(out d)) return false; break;
                case JsonValueKind.String: if (!decimal.TryParse(p.Value.GetString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d)) return false; break;
                case JsonValueKind.Null: continue;
                default: return false;
            }
            if (d != 0) return false;
            if (p.Name == "prompt") sawPrompt = true;
            if (p.Name == "completion") sawCompletion = true;
        }
        return sawPrompt && sawCompletion;
    }

    static readonly Regex NotChat = new(@"(safety|guard|embed|whisper|tts|rerank|moderat|orpheus|playai|image|audio|speech|transcri|\bvl\b|-vl\b|vision|ocr|diffusion|code|prompt-guard|voxtral|pixtral)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    /// <summary>Text chat models only (no speech, image, embedding, safety or code-only models).</summary>
    public static bool IsChatModel(string id) => id.Length is > 1 and <= 120 && !NotChat.IsMatch(id);

    static readonly Regex Size = new(@"(?<![\d.])(\d{1,3}(?:\.\d)?)b(?![a-z])", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    /// <summary>Quality guess from the name: the parameter count (capped at 120 B – bigger ones are slow), a bonus for well-known families, a small one for context.</summary>
    public static int Rank(string id, long context)
    {
        if (id == FreeRouter) return 100000;   // OpenRouter picks an available free model itself – first choice, the named free models are the fallback
        var m = Size.Match(id);
        var size = m.Success && double.TryParse(m.Groups[1].Value, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var b) ? Math.Min(b, 120) : 8;
        if (!m.Success) size = Regex.IsMatch(id, "large", RegexOptions.IgnoreCase) ? 70 : Regex.IsMatch(id, "medium", RegexOptions.IgnoreCase) ? 40 : size;   // Mistral names its sizes in words
        var bonus = Regex.IsMatch(id, "gpt-oss|llama-3\\.3|llama-3\\.1|qwen|gemma|nemotron|mistral|deepseek", RegexOptions.IgnoreCase) ? 10 : 0;
        return (int)(size * 10 + bonus + Math.Min(context / 50000, 10));
    }

    static readonly Regex Notice = new(@"(budget|raise the key|top.?up|payment|insufficient|credits?\b|pollen|upgrade your|quota|billing|subscribe)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    /// <summary>"The API key has reached its budget, please top up…" is a payment request, not an answer. Zero output tokens plus such words (or the words alone in a very short text) = notice.</summary>
    public static bool LooksLikePaymentNotice(string text, long completionTokens)
    {
        if (!Notice.IsMatch(text)) return false;
        return completionTokens == 0 || text.Length < 400;
    }

    /// <summary>Key shapes: OpenRouter "sk-or-…", Groq "gsk_…", Cerebras "csk-…", Mistral 32 letters/digits. Anything else (for example a Google key or the key of another service) is refused before it is stored or sent.</summary>
    public static bool KeyLooksRight(string id, string key) => key.Length is >= 20 and <= 200 && Regex.IsMatch(key, "^[A-Za-z0-9_-]+$") && id switch
    {
        "openrouter" => key.StartsWith("sk-or-", StringComparison.Ordinal),
        "groq" => key.StartsWith("gsk_", StringComparison.Ordinal),
        "cerebras" => key.StartsWith("csk-", StringComparison.Ordinal),
        "mistral" => key.Length == 32 && Regex.IsMatch(key, "^[A-Za-z0-9]{32}$"),
        _ => false,
    };
}

public sealed class FreeAiHub
{
    public static readonly string[] Ids = { "openrouter", "groq", "cerebras", "mistral", "pollinations", "ollama" };
    public static string Name(string id) => id switch { "openrouter" => "OpenRouter", "groq" => "Groq", "cerebras" => "Cerebras", "mistral" => "Mistral", "pollinations" => "Pollinations", "ollama" => "Ollama", _ => id };

    /// <summary>How long a model list counts as "checked": the price check runs again after this, before the request.</summary>
    public static readonly TimeSpan Fresh = TimeSpan.FromMinutes(5);
    /// <summary>If the list cannot be refreshed, the last check is trusted for this long – then the provider is not used at all (cost rule fails closed).</summary>
    public static readonly TimeSpan MaxStale = TimeSpan.FromMinutes(30);
    const int MaxModelTries = 3;
    const int OpenRouterPerMinute = 18;      // OpenRouter allows 20 per minute for free models
    const int OpenRouterPerDayDefault = 50;  // without purchased credits
    const int PollinationsPerHour = 30;

    readonly JsonStore<FreeAiFile> _store;
    readonly ISecretProtector _secrets;
    readonly HttpClient _http;
    readonly Func<DateTime> _now;
    readonly object _gate = new();
    readonly Dictionary<string, State> _state = new();

    sealed class State
    {
        public DateTime? CooldownUntil; public string? LastError; public DateTime? LastErrorAt; public DateTime? LastOkAt; public string? LastModel;
        public List<FreeModel> Models = new(); public DateTime? ModelsAt;
        public int? DailyLimit; public int? DailyRemaining;
        public bool KeyBad;
        public readonly Dictionary<string, DateTime> ModelCooldown = new();
        public readonly Queue<DateTime> Recent = new();
        public readonly Queue<DateTime> RecentHour = new();
    }

    public FreeAiHub(AppPaths paths, ISecretProtector secrets, HttpMessageHandler? handler = null, Func<DateTime>? now = null)
    {
        _store = new JsonStore<FreeAiFile>(paths.File("freeai.json"));
        _secrets = secrets;
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(45);
        _now = now ?? (() => DateTime.UtcNow);
        foreach (var id in Ids) _state[id] = new State();
        _store.Update(f =>
        {
            if (f.Auto == false && f.Strategy == "fallback") f.Strategy = "single";
            f.Auto = null;
            // providers added in later versions join the saved order before Pollinations/Ollama (their own place stays)
            foreach (var id in Ids.Where(i => !f.Order.Contains(i)))
            {
                var at = f.Order.IndexOf("pollinations");
                f.Order.Insert(at < 0 ? f.Order.Count : at, id);
            }
        });
    }

    State S(string id) { lock (_gate) return _state[id]; }
    FreeProviderCfg Cfg(FreeAiFile f, string id) => f.Providers.TryGetValue(id, out var c) ? c : new FreeProviderCfg();
    string? KeyOf(string id) { var c = Cfg(_store.Snapshot(), id); return c.KeyProtected == null ? null : _secrets.Unprotect(c.KeyProtected); }

    public string Strategy => _store.Get(f => f.Strategy);
    public string? Single => _store.Get(f => f.Single);
    /// <summary>Another AI may take over (fallback or race) – false only for "single".</summary>
    public bool Auto => Strategy != "single";
    public (string? provider, string? model, DateTime? at) Last() => _store.Get(f => (f.LastProvider, f.LastModel, f.LastAt));

    /// <summary>Set up and allowed to be used (Ollama: only the switch – whether it is installed is checked by the caller).</summary>
    public bool Configured(string id)
    {
        var f = _store.Snapshot();
        var c = Cfg(f, id);
        return id switch
        {
            "openrouter" => c.Enabled && c.KeyProtected != null,
            "groq" or "cerebras" or "mistral" => c.Enabled && c.KeyProtected != null && c.Attested,
            "pollinations" => c.Enabled && c.Consent,
            "ollama" => !f.Providers.ContainsKey("ollama") || c.Enabled,   // on by default as soon as a model is chosen (that is checked by the caller)
            _ => false,
        };
    }
    public bool AnyConfigured() => Ids.Any(Configured);

    /// <summary>The order the providers are tried in (only the set-up ones).</summary>
    public List<string> ActiveOrder() { var f = _store.Snapshot(); return f.Order.Where(id => Ids.Contains(id) && Configured(id)).ToList(); }

    // ---------------------------------------------------------------- configuration

    /// <summary>Sets a provider up. A key can only be entered for the providers with a key (OpenRouter, Groq, Cerebras, Mistral); the key shape is checked; the wrong key never reaches the file.</summary>
    public void Set(string id, bool? enabled, string? key, bool? attested, bool? consent)
    {
        if (!Ids.Contains(id)) throw new RpcException("invalid-params", "Unbekannter Anbieter.");
        if (key != null && !CostGuard.IsKeyProvider(id)) throw new RpcException("invalid-params", $"{Name(id)} braucht keinen Schlüssel.");
        var k = key?.Trim();
        if (!string.IsNullOrEmpty(k) && !CostGuard.KeyLooksRight(id, k))
            throw new RpcException("invalid-params", id switch
            {
                "openrouter" => "Das sieht nicht nach einem OpenRouter-Schlüssel aus (er beginnt mit „sk-or-“).",
                "groq" => "Das sieht nicht nach einem Groq-Schlüssel aus (er beginnt mit „gsk_“).",
                "cerebras" => "Das sieht nicht nach einem Cerebras-Schlüssel aus (er beginnt mit „csk-“).",
                _ => "Das sieht nicht nach einem Mistral-Schlüssel aus (32 Buchstaben und Ziffern, ohne Vorsilbe).",
            });
        _store.Update(f =>
        {
            if (!f.Providers.TryGetValue(id, out var c)) f.Providers[id] = c = new FreeProviderCfg();
            if (attested != null) c.Attested = attested.Value;
            if (consent != null) c.Consent = consent.Value;
            if (k != null) { c.KeyProtected = k.Length == 0 ? null : _secrets.Protect(k); S(id).KeyBad = false; if (k.Length == 0) c.Enabled = false; else if (enabled == null) c.Enabled = !CostGuard.NeedsAttestation(id) || c.Attested; }
            if (enabled != null)
            {
                if (enabled.Value)
                {
                    if (CostGuard.IsKeyProvider(id) && c.KeyProtected == null) throw new RpcException("assistant-key", $"Für {Name(id)} zuerst den Schlüssel eintragen.");
                    if (CostGuard.NeedsAttestation(id) && !c.Attested) throw new RpcException("invalid-params", $"Bitte zuerst bestätigen: Dein {Name(id)}-Konto ist im kostenlosen Tarif und hat keine Zahlungsmethode.");
                    if (id == "pollinations" && !c.Consent) throw new RpcException("invalid-params", "Bitte zuerst zustimmen: Fragen gehen an den Dienst Pollinations (Dritter).");
                }
                c.Enabled = enabled.Value;
            }
            if (!c.Attested && CostGuard.NeedsAttestation(id)) c.Enabled = false;
            if (!c.Consent && id == "pollinations") c.Enabled = false;
        });
        Log.Info("assistant", k != null ? $"{Name(id)}: Schlüssel {(k.Length == 0 ? "entfernt" : "gespeichert (geschützt)")}." : $"{Name(id)}: Einstellung geändert.");
    }

    public void SetOrder(IEnumerable<string> order)
    {
        var list = order.Distinct().ToList();
        if (list.Any(id => !Ids.Contains(id))) throw new RpcException("invalid-params", "Unbekannter Anbieter in der Reihenfolge.");
        list.AddRange(Ids.Where(id => !list.Contains(id)));   // an older page that does not know the newer AIs yet leaves them at the end
        _store.Update(f => f.Order = list);
    }

    public void SetAuto(bool on) => SetStrategy(on ? "fallback" : "single", null);

    /// <summary>"fallback" (in order), "race" (all AIs with a key at the same time, the faster one counts) or "single" (only this one, or the first active one).</summary>
    public void SetStrategy(string strategy, string? single)
    {
        if (strategy is not ("fallback" or "race" or "single")) throw new RpcException("invalid-params", "Betriebsart: fallback, race oder single.");
        if (single != null && !Ids.Contains(single)) throw new RpcException("invalid-params", "Unbekannter Anbieter.");
        _store.Update(f => { f.Strategy = strategy; f.Single = strategy == "single" ? single : null; f.Auto = null; });
    }

    /// <summary>The local model (Ollama) answered / failed – shown in the status next to the online providers.</summary>
    public void NoteOllama(string model)
    {
        _store.Update(f => { f.LastProvider = "ollama"; f.LastModel = model; f.LastAt = _now(); });
        var s = S("ollama"); lock (_gate) { s.LastOkAt = _now(); s.LastModel = model; s.LastError = null; }
    }
    public void NoteOllamaError(string message) { var s = S("ollama"); lock (_gate) { s.LastError = message; s.LastErrorAt = _now(); } }

    /// <summary>Imports the single router of an earlier version once (OpenRouter keys are kept; Groq needs the new confirmation).</summary>
    public void MigrateLegacy(string? routerBase, string? routerKeyProtected)
    {
        _store.Update(f =>
        {
            if (f.Migrated) return;
            f.Migrated = true;
            if (routerBase == null || routerKeyProtected == null || !Uri.TryCreate(routerBase, UriKind.Absolute, out var u)) return;
            if (u.Host == "openrouter.ai") f.Providers["openrouter"] = new FreeProviderCfg { Enabled = true, KeyProtected = routerKeyProtected };
            else if (u.Host == "api.groq.com") f.Providers["groq"] = new FreeProviderCfg { Enabled = false, KeyProtected = routerKeyProtected, Attested = false };
        });
    }

    // ---------------------------------------------------------------- status (never contains a key)

    public List<object> Providers(string? ollamaModel = null)
    {
        var f = _store.Snapshot(); var now = _now();
        var list = new List<object>();
        foreach (var id in f.Order.Where(Ids.Contains))
        {
            var c = Cfg(f, id); var s = S(id);
            string state, text;
            if (id == "ollama" && string.IsNullOrEmpty(ollamaModel)) { state = "setup"; text = "Nicht eingerichtet – am PC Ollama installieren und ein Modell wählen"; }
            else if (id == "ollama" && f.Providers.ContainsKey("ollama") && !c.Enabled) { state = "off"; text = "Aus"; }
            else if (id == "ollama") { state = "ready"; text = $"Bereit – Modell {ollamaModel}"; }
            else if (CostGuard.IsKeyProvider(id) && c.KeyProtected == null) { state = "setup"; text = "Schlüssel fehlt"; }
            else if (CostGuard.NeedsAttestation(id) && !c.Attested) { state = "setup"; text = "Bitte bestätigen: kostenloser Tarif"; }
            else if (id == "pollinations" && !c.Consent) { state = "setup"; text = "Zustimmung fehlt"; }
            else if (!c.Enabled) { state = "off"; text = "Aus"; }
            else if (s.KeyBad) { state = "error"; text = "Schlüssel abgelehnt"; }
            else if (s.CooldownUntil is { } cu && cu > now) { state = "cooldown"; text = $"Limit erreicht – wieder ab {cu.ToLocalTime():HH:mm}"; }
            else { state = "ready"; text = "Bereit"; }
            list.Add(new
            {
                id, name = Name(id), enabled = id == "ollama" ? Configured("ollama") : c.Enabled, needsKey = CostGuard.IsKeyProvider(id), needsAttest = CostGuard.NeedsAttestation(id), keySet = c.KeyProtected != null,
                attested = c.Attested, consent = c.Consent, state, stateText = text,
                lastError = s.LastError, lastErrorAt = s.LastErrorAt, lastOkAt = s.LastOkAt, lastModel = s.LastModel,
                models = id == "ollama" ? (string.IsNullOrEmpty(ollamaModel) ? new List<object>() : new List<object> { new { id = ollamaModel, context = 0L } }) : s.Models.Take(8).Select(m => (object)new { id = m.Id, context = m.Context }).ToList(),
                modelCount = id == "ollama" ? (string.IsNullOrEmpty(ollamaModel) ? 0 : 1) : s.Models.Count, modelsAt = s.ModelsAt,
                today = new { limit = s.DailyLimit, remaining = s.DailyRemaining },
                privacy = Privacy(id), cost = Cost(id),
            });
        }
        return list;
    }

    public static string Privacy(string id) => id switch
    {
        "openrouter" => "Gesendet wird deine Frage mit den letzten Nachrichten dieses Chats an OpenRouter und das Unternehmen hinter dem gewählten kostenlosen Modell. Kostenlose Modelle dürfen Eingaben protokollieren oder zum Training nutzen – gib dort nichts Persönliches ein. Dein Schlüssel bleibt am PC.",
        "groq" => "Gesendet wird deine Frage mit den letzten Nachrichten dieses Chats an Groq (USA). Dein Schlüssel bleibt am PC.",
        "cerebras" => "Gesendet wird deine Frage mit den letzten Nachrichten dieses Chats an Cerebras (USA). Im kostenlosen Tarif kann Cerebras Eingaben zur Verbesserung nutzen – gib dort nichts Persönliches ein. Dein Schlüssel bleibt am PC.",
        "mistral" => "Gesendet wird deine Frage mit den letzten Nachrichten dieses Chats an Mistral AI (Frankreich/EU). Im kostenlosen „Experiment“-Tarif darf Mistral Eingaben zum Training nutzen – gib dort nichts Persönliches ein. Dein Schlüssel bleibt am PC.",
        "pollinations" => "Gesendet wird deine Frage mit den letzten Nachrichten dieses Chats an text.pollinations.ai – ein Dienst eines Dritten, ohne Konto und ohne Schlüssel. Was dort mit der Frage geschieht, bestimmt der Dienst.",
        _ => "Bleibt auf deinem PC – es wird nichts gesendet.",
    };
    public static string Cost(string id) => id switch
    {
        "openrouter" => "0,00 € – nur das Gratis-Routing openrouter/free und Modelle mit Preis 0 (:free), vor jeder Anfrage erneut geprüft, dazu Höchstpreis 0 in jeder Anfrage. Es wird nie Guthaben aufgeladen.",
        "groq" => "0,00 € im kostenlosen Tarif. Bei Limit (429) wechselt JARVIS zum nächsten Anbieter. Achtung: Ein Upgrade deines Groq-Kontos auf einen bezahlten Tarif kann Kosten verursachen.",
        "cerebras" => "0,00 € im kostenlosen Tarif (Tageslimits an Anfragen und Tokens). Bei Limit (429) wechselt JARVIS zum nächsten Anbieter. Achtung: Ein Upgrade deines Cerebras-Kontos auf einen bezahlten Tarif kann Kosten verursachen.",
        "mistral" => "0,00 € im kostenlosen „Experiment“-Tarif (ohne Zahlungsmethode, mit Limits pro Sekunde und Monat). Bei Limit (429) wechselt JARVIS zum nächsten Anbieter. Achtung: Ein Wechsel deines Mistral-Kontos auf einen bezahlten Tarif kann Kosten verursachen.",
        "pollinations" => "0,00 € – nur der anonyme Weg ohne Schlüssel; Aufforderungen zum Aufstocken werden nie als Antwort angezeigt.",
        _ => "0,00 € – läuft auf deinem PC.",
    };

    // ---------------------------------------------------------------- models and the free check

    /// <summary>The free chat models of a provider right now (best first). OpenRouter: only price-0 ":free" models.</summary>
    public async Task<List<FreeModel>> RefreshModelsAsync(string id, CancellationToken ct = default)
    {
        if (!CostGuard.IsKeyProvider(id)) return new();
        var s = S(id);
        string url = CostGuard.Endpoint(id)! + "/models";
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        if (id != "openrouter")
        {
            var key = KeyOf(id) ?? throw new ProviderException("key", $"{Name(id)}: Schlüssel fehlt.");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        }
        using var resp = await SendAsync(req, ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) throw Classify(id, resp, raw, "Modellliste");
        var list = new List<FreeModel>();
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array)
                foreach (var m in data.EnumerateArray())
                {
                    if (!m.TryGetProperty("id", out var idv) || idv.GetString() is not { Length: > 0 } mid || !CostGuard.IsChatModel(mid)) continue;
                    if (id == "openrouter")
                    {
                        if (!CostGuard.IsFreeOpenRouter(m)) continue;
                        if (m.TryGetProperty("architecture", out var ar) && ar.ValueKind == JsonValueKind.Object)
                        {
                            if (ar.TryGetProperty("output_modalities", out var om) && om.ValueKind == JsonValueKind.Array && !om.EnumerateArray().Any(x => x.GetString() == "text")) continue;
                            if (ar.TryGetProperty("input_modalities", out var im) && im.ValueKind == JsonValueKind.Array && !im.EnumerateArray().Any(x => x.GetString() == "text")) continue;
                        }
                    }
                    else if (m.TryGetProperty("active", out var act) && act.ValueKind == JsonValueKind.False) continue;
                    // Mistral says per model whether it can chat (the list also holds OCR, embedding, moderation and audio models)
                    if (id == "mistral" && m.TryGetProperty("capabilities", out var cap) && cap.ValueKind == JsonValueKind.Object && cap.TryGetProperty("completion_chat", out var cc0) && cc0.ValueKind == JsonValueKind.False) continue;
                    long ctx = m.TryGetProperty("context_length", out var c1) && c1.TryGetInt64(out var cv) ? cv : m.TryGetProperty("context_window", out var c2) && c2.TryGetInt64(out var cw) ? cw : 0;
                    list.Add(new FreeModel(mid, ctx, CostGuard.Rank(mid, ctx)));
                }
        }
        catch (JsonException) { throw new ProviderException("error", $"{Name(id)}: unerwartete Modellliste."); }
        list = list.OrderByDescending(m => m.Rank).ThenBy(m => m.Id).Take(60).ToList();
        lock (_gate) { s.Models = list; s.ModelsAt = _now(); }
        return list;
    }

    /// <summary>Before every request: is this model STILL free? The list is checked again when it is older than five minutes; if that fails for half an hour the provider is not used.</summary>
    async Task<List<FreeModel>> VerifiedModelsAsync(string id, CancellationToken ct)
    {
        var s = S(id); var now = _now();
        if (s.ModelsAt is { } at && now - at <= Fresh && s.Models.Count > 0) return s.Models.ToList();
        try { return await RefreshModelsAsync(id, ct); }
        catch (ProviderException) when (s.ModelsAt is { } at2 && now - at2 <= MaxStale && s.Models.Count > 0) { return s.Models.ToList(); }
        catch (ProviderException e) when (e.Kind is "offline" or "down" or "busy" or "error") { throw new ProviderException(e.Kind, $"{Name(id)}: Kostenfreiheit der Modelle lässt sich gerade nicht prüfen – deshalb wird nichts gesendet."); }
    }

    // ---------------------------------------------------------------- the request

    /// <summary>Asks one provider (up to three of its models, best first). Throws a <see cref="ProviderException"/> if it cannot answer.</summary>
    public async Task<FreeAnswer> AskAsync(string id, string system, IReadOnlyList<ChatTurn> history, CancellationToken ct = default, TimeSpan? timeout = null, TimeSpan? maxWait = null)
    {
        if (!(CostGuard.IsKeyProvider(id) || id == "pollinations")) throw new ProviderException("blocked", "Dieser Anbieter wird hier nicht angefragt.");
        if (!Configured(id)) throw new ProviderException("blocked", $"{Name(id)} ist nicht eingerichtet oder ausgeschaltet.");
        var s = S(id); var now = _now();
        if (s.KeyBad) throw new ProviderException("key", $"{Name(id)}: Der Schlüssel wurde abgelehnt – bitte neu eintragen.");
        if (s.CooldownUntil is { } cu && cu > now) throw new ProviderException("limit", $"{Name(id)}: Limit erreicht, wieder ab {cu.ToLocalTime():HH:mm} Uhr.", cu - now);
        CheckOwnLimits(id, now);

        var messages = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = system } };
        foreach (var t in history.TakeLast(8)) messages.Add(new JsonObject { ["role"] = t.Role == "model" ? "assistant" : "user", ["content"] = t.Text.Length > 1500 ? t.Text[..1500] : t.Text });

        if (id == "pollinations")
        {
            // The anonymous service allows about one reply every 45 seconds per address and says how long to wait: if that is short and nobody else
            // is left to ask, wait it out once instead of failing – the answer then simply arrives a little later.
            for (var attempt = 0; ; attempt++)
            {
                try
                {
                    Reply r;
                    try { r = await ChatAsync(id, null, "openai-fast", messages, ct, timeout, lowEffort: true); }
                    catch (ProviderException e) when (e.Kind == "model") { r = await ChatAsync(id, null, "openai-fast", messages, ct, timeout, lowEffort: false); }   // the setting was refused: ask plainly
                    return Done(id, r, "Beantwortet von Pollinations – kostenloser Dienst ohne Konto");
                }
                catch (ProviderException e) when (attempt == 0 && e.Kind == "limit" && e.RetryAfter is { } wait && maxWait is { } mw && wait <= mw)
                {
                    await Task.Delay(wait + TimeSpan.FromMilliseconds(300), ct);
                    lock (_gate) s.CooldownUntil = null;
                }
            }
        }
        var models = (await VerifiedModelsAsync(id, ct)).Where(m => !(s.ModelCooldown.TryGetValue(m.Id, out var u) && u > _now())).Take(MaxModelTries).ToList();
        if (models.Count == 0) throw new ProviderException("model", id == "openrouter" ? "OpenRouter: gerade ist kein kostenloses Modell verfügbar." : $"{Name(id)}: gerade ist kein Modell verfügbar.");
        var key = KeyOf(id) ?? throw new ProviderException("key", $"{Name(id)}: Schlüssel fehlt.");
        ProviderException? last = null;
        foreach (var m in models)
        {
            // the price check of THIS model, right before the request
            if (id == "openrouter" && !s.Models.Any(x => x.Id == m.Id && CostGuard.IsFreeId(x.Id))) continue;
            try
            {
                var r = await ChatAsync(id, key, m.Id, messages, ct, timeout);
                return Done(id, r, $"Beantwortet von {Name(id)} – kostenloses Modell ({r.Model})");
            }
            catch (ProviderException e) when (e.Kind is "limit" or "model" or "empty" or "busy" or "down")
            {
                last = e;
                if (e.Kind == "limit" && e.RetryAfter is { } ra && ra > TimeSpan.FromMinutes(2)) throw; // the whole account is full, not just this model
                lock (_gate) s.ModelCooldown[m.Id] = _now() + (e.RetryAfter ?? TimeSpan.FromMinutes(2));
            }
        }
        throw last ?? new ProviderException("model", $"{Name(id)}: kein Modell hat geantwortet.");
    }

    FreeAnswer Done(string id, Reply r, string label)
    {
        var s = S(id);
        lock (_gate) { s.LastOkAt = _now(); s.LastModel = r.Model; s.LastError = null; s.KeyBad = false; s.CooldownUntil = null; }
        _store.Update(f => { f.LastProvider = id; f.LastModel = r.Model; f.LastAt = _now(); });
        return new FreeAnswer(r.Text, id, r.Model, label, r.PromptTokens, r.OutputTokens);
    }

    void CheckOwnLimits(string id, DateTime now)
    {
        var s = S(id);
        lock (_gate)
        {
            if (id == "openrouter")
            {
                while (s.Recent.Count > 0 && now - s.Recent.Peek() > TimeSpan.FromMinutes(1)) s.Recent.Dequeue();
                if (s.Recent.Count >= OpenRouterPerMinute) throw new ProviderException("limit", "OpenRouter: Minutenlimit der kostenlosen Modelle erreicht.", TimeSpan.FromSeconds(30));
                if (s.DailyRemaining is <= 0) throw new ProviderException("limit", $"OpenRouter: Tageslimit der kostenlosen Modelle ({s.DailyLimit ?? OpenRouterPerDayDefault}) erreicht.", NextUtcMidnight(now) - now);
            }
            else if (id == "pollinations")
            {
                while (s.RecentHour.Count > 0 && now - s.RecentHour.Peek() > TimeSpan.FromHours(1)) s.RecentHour.Dequeue();
                if (s.RecentHour.Count >= PollinationsPerHour) throw new ProviderException("limit", $"Pollinations: eigene Grenze von {PollinationsPerHour} Fragen pro Stunde erreicht.", TimeSpan.FromMinutes(10));
            }
        }
    }

    static DateTime NextUtcMidnight(DateTime now) => now.Date.AddDays(1);

    sealed record Reply(string Text, string Model, long PromptTokens, long OutputTokens);

    async Task<Reply> ChatAsync(string id, string? key, string model, JsonArray messages, CancellationToken ct, TimeSpan? timeout = null, bool lowEffort = false)
    {
        var url = CostGuard.Endpoint(id)!;
        var endpoint = id == "pollinations" ? url : url + "/chat/completions";
        if (!CostGuard.HostAllowed(id, endpoint)) throw new ProviderException("blocked", "Adresse nicht erlaubt.");
        var body = new JsonObject { ["model"] = model, ["messages"] = messages.DeepClone(), ["max_tokens"] = id == "pollinations" ? 500 : 1200, ["stream"] = false };
        if (lowEffort) body["reasoning_effort"] = "low";       // fewer "thinking" tokens: short factual answers arrive sooner
        if (id == "openrouter")
        {
            if (!CostGuard.IsFreeId(model)) throw new ProviderException("blocked", "Nur kostenlose Modelle (:free oder openrouter/free) werden verwendet.");
            // second, server-side lock: OpenRouter itself refuses any provider that charges anything
            body["provider"] = new JsonObject { ["max_price"] = new JsonObject { ["prompt"] = 0, ["completion"] = 0, ["request"] = 0, ["image"] = 0 } };
        }
        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json") };
        if (id != "pollinations" && !string.IsNullOrEmpty(key)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);   // Pollinations never gets a key
        if (id == "openrouter") req.Headers.Add("X-Title", "Nexus Gaming Hub");
        Count(id);
        using var resp = await SendAsync(req, ct, timeout);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (id == "openrouter") ReadOpenRouterLimits(resp);
        if (!resp.IsSuccessStatusCode) throw Classify(id, resp, raw, "Anfrage");
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.Object)
            {
                var code = err.TryGetProperty("code", out var cc) && cc.TryGetInt32(out var ci) ? ci : 0;
                throw code switch
                {
                    429 => Fail(id, new ProviderException("limit", $"{Name(id)}: Limit erreicht.", TimeSpan.FromMinutes(1))),
                    401 or 403 => Fail(id, new ProviderException("key", $"{Name(id)}: Schlüssel abgelehnt.")),
                    402 => Fail(id, new ProviderException("billing", $"{Name(id)}: verlangt Guthaben – wird nicht verwendet.", TimeSpan.FromHours(1))),
                    _ => Fail(id, new ProviderException("down", $"{Name(id)} meldet einen Fehler beim Modell.", TimeSpan.FromMinutes(1))),
                };
            }
            var text = (root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "").Trim();
            long pt = root.TryGetProperty("usage", out var u) && u.TryGetProperty("prompt_tokens", out var p) && p.TryGetInt64(out var pv) ? pv : 0;
            long ot = root.TryGetProperty("usage", out var u2) && u2.TryGetProperty("completion_tokens", out var o) && o.TryGetInt64(out var ov) ? ov : 0;
            var served = root.TryGetProperty("model", out var mm) && mm.ValueKind == JsonValueKind.String ? mm.GetString()! : model;
            if (CostGuard.LooksLikePaymentNotice(text, ot)) throw Fail(id, new ProviderException("limit", $"{Name(id)}: Der kostenlose Zugang meldet „Budget erreicht“ – kein Ergebnis, nichts bezahlt.", TimeSpan.FromMinutes(30)));
            if (text.Length == 0) throw Fail(id, new ProviderException("empty", $"{Name(id)}: leere Antwort.", TimeSpan.FromMinutes(5)));
            return new Reply(text, served, pt, ot);
        }
        catch (Exception e) when (e is JsonException or KeyNotFoundException or IndexOutOfRangeException or InvalidOperationException)
        { throw Fail(id, new ProviderException("error", $"{Name(id)}: unerwartete Antwort.")); }
    }

    void Count(string id)
    {
        var s = S(id); var now = _now();
        lock (_gate)
        {
            if (id == "openrouter") { s.Recent.Enqueue(now); if (s.DailyRemaining is > 0) s.DailyRemaining--; }
            else if (id == "pollinations") s.RecentHour.Enqueue(now);
        }
    }

    void ReadOpenRouterLimits(HttpResponseMessage resp)
    {
        // X-RateLimit-Remaining appears only on failed requests; the daily number comes from GET /key (see TestAsync)
        if (resp.Headers.TryGetValues("X-RateLimit-Remaining", out var v) && int.TryParse(v.FirstOrDefault(), out var rem) && rem <= 0)
            lock (_gate) S("openrouter").CooldownUntil = _now() + TimeSpan.FromSeconds(20);
    }

    async Task<HttpResponseMessage> SendAsync(HttpRequestMessage req, CancellationToken ct, TimeSpan? timeout = null)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (timeout is { } t) cts.CancelAfter(t);
        try { return await _http.SendAsync(req, cts.Token); }
        catch (HttpRequestException) { throw new ProviderException("offline", "nicht erreichbar (Internet prüfen)"); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested) { throw new ProviderException("busy", "hat zu lange gebraucht", TimeSpan.FromMinutes(1)); }
        catch (TaskCanceledException) { throw new RpcException("cancelled", "Abgebrochen."); }
    }

    ProviderException Fail(string id, ProviderException e)
    {
        var s = S(id);
        lock (_gate)
        {
            s.LastError = e.Message; s.LastErrorAt = _now();
            if (e.Kind == "key") s.KeyBad = true;
            if (e.Kind is "limit" or "billing" && e.RetryAfter is { } ra) s.CooldownUntil = _now() + ra;
        }
        return e;
    }

    ProviderException Classify(string id, HttpResponseMessage resp, string raw, string what)
    {
        var n = Name(id);
        var retry = RetryAfter(resp);
        var code = (int)resp.StatusCode;
        if (resp.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) return Fail(id, new ProviderException("key", $"{n}: Der Schlüssel wird abgelehnt."));
        if (id == "pollinations" && (resp.StatusCode == HttpStatusCode.PaymentRequired || resp.StatusCode == HttpStatusCode.TooManyRequests) && raw.Contains("FREE_LIMIT", StringComparison.Ordinal))
        {
            // "Free limit reached: 1 reply every 45 seconds per IP" – a speed limit of the free service (with Retry-After), not a request for money.
            var wait = retry ?? TimeSpan.FromSeconds(45);
            return Fail(id, new ProviderException("limit", $"{n}: der kostenlose Dienst erlaubt nur etwa eine Antwort alle 45 Sekunden – wieder in {Math.Ceiling(wait.TotalSeconds)} s.", wait));
        }
        if (resp.StatusCode == HttpStatusCode.PaymentRequired) return Fail(id, new ProviderException("billing", $"{n}: verlangt Guthaben – diese Anfrage wird nicht bezahlt.", TimeSpan.FromHours(1)));
        if (resp.StatusCode == HttpStatusCode.TooManyRequests)
        {
            var daily = Regex.IsMatch(raw, "per-day|per day|daily|free-models-per-day|tokens per day|TPD|RPD", RegexOptions.IgnoreCase);
            var wait = daily ? NextUtcMidnight(_now()) - _now() : retry ?? TimeSpan.FromMinutes(1);
            if (daily && id == "openrouter") lock (_gate) S(id).DailyRemaining = 0;
            return Fail(id, new ProviderException("limit", daily ? $"{n}: Tageslimit der kostenlosen Nutzung erreicht." : $"{n}: Minutenlimit erreicht.", wait));
        }
        if (resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity) return Fail(id, new ProviderException("model", $"{n}: Modell nicht verfügbar ({code}).", TimeSpan.FromMinutes(10)));
        if (code >= 500 || resp.StatusCode == HttpStatusCode.RequestTimeout) return Fail(id, new ProviderException("down", $"{n}: Dienst gerade nicht erreichbar ({code}).", TimeSpan.FromMinutes(1)));
        return Fail(id, new ProviderException("error", $"{n}: Fehler {code} bei {what}."));
    }

    /// <summary>Retry-After (seconds) or Groq's x-ratelimit-reset-* ("1m30.5s", "45s").</summary>
    static TimeSpan? RetryAfter(HttpResponseMessage resp)
    {
        if (resp.Headers.RetryAfter?.Delta is { } d) return d;
        if (resp.Headers.TryGetValues("retry-after", out var ra) && double.TryParse(ra.FirstOrDefault(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var sec)) return TimeSpan.FromSeconds(Math.Clamp(sec, 1, 86400));
        foreach (var h in new[] { "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens" })
            if (resp.Headers.TryGetValues(h, out var vals) && ParseDuration(vals.FirstOrDefault()) is { } t) return t;
        return null;
    }

    public static TimeSpan? ParseDuration(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var m = Regex.Match(s.Trim(), @"^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+)ms)?$");
        if (!m.Success || m.Value.Length == 0) return null;
        double G(int i) => m.Groups[i].Success ? double.Parse(m.Groups[i].Value, System.Globalization.CultureInfo.InvariantCulture) : 0;
        var total = G(1) * 3600 + G(2) * 60 + G(3) + G(4) / 1000;
        return total <= 0 ? null : TimeSpan.FromSeconds(Math.Min(total, 86400));
    }

    // ---------------------------------------------------------------- test of a connection

    public sealed record TestResult(bool Ok, string Message, string? Model, long Ms, int Models);

    /// <summary>A real test: key accepted, free models found, one tiny question answered. Counts as one request against the free limit.</summary>
    public async Task<TestResult> TestAsync(string id, CancellationToken ct = default)
    {
        if (!(CostGuard.IsKeyProvider(id) || id == "pollinations")) throw new RpcException("invalid-params", "Dieser Anbieter wird hier nicht getestet.");
        var sw = System.Diagnostics.Stopwatch.StartNew();
        try
        {
            var s = S(id);
            if (CostGuard.IsKeyProvider(id) && KeyOf(id) == null) return new(false, "Zuerst den Schlüssel eintragen.", null, 0, 0);
            if (id == "openrouter") await ReadOpenRouterKeyAsync(ct);
            int models = 0;
            if (id != "pollinations") models = (await RefreshModelsAsync(id, ct)).Count;
            lock (_gate) { s.CooldownUntil = null; s.KeyBad = false; }
            var messages = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = "Antworte in einem kurzen Satz." }, new JsonObject { ["role"] = "user", ["content"] = "Sag nur: Verbindung steht." } };
            // the same path as a real question (free check, limits, up to three models)
            var cfg = Cfg(_store.Snapshot(), id);
            if (!cfg.Enabled && id != "pollinations" || (id == "pollinations" && !cfg.Consent))
            {
                // not switched on yet: test with the same rules without enabling
                if (id == "pollinations") return new(false, "Zuerst zustimmen, dann testen.", null, 0, 0);
            }
            var a = await AskTestAsync(id, messages, ct);
            return new(true, $"Verbindung steht – Antwort von {a.Model}.", a.Model, sw.ElapsedMilliseconds, models);
        }
        catch (ProviderException e) { return new(false, e.Message, null, sw.ElapsedMilliseconds, 0); }
    }

    async Task<FreeAnswer> AskTestAsync(string id, JsonArray messages, CancellationToken ct)
    {
        // a test also works while the provider is still switched off – but with every rule of a real request
        var f = _store.Snapshot(); var c = Cfg(f, id); var was = c.Enabled;
        if (!was && id != "pollinations") _store.Update(x => { if (x.Providers.TryGetValue(id, out var p)) p.Enabled = true; });
        try
        {
            var hist = new List<ChatTurn>();
            var user = messages[1]!["content"]!.GetValue<string>();
            hist.Add(new ChatTurn("user", user));
            return await AskAsync(id, messages[0]!["content"]!.GetValue<string>(), hist, ct);
        }
        finally { if (!was && id != "pollinations") _store.Update(x => { if (x.Providers.TryGetValue(id, out var p)) p.Enabled = false; }); }
    }

    async Task ReadOpenRouterKeyAsync(CancellationToken ct)
    {
        var key = KeyOf("openrouter")!;
        using var req = new HttpRequestMessage(HttpMethod.Get, CostGuard.OpenRouterBase + "/key");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
        using var resp = await SendAsync(req, ct);
        var raw = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode) throw Classify("openrouter", resp, raw, "Schlüsselprüfung");
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("data", out var d) && d.TryGetProperty("free_model_daily_requests", out var fr) && fr.ValueKind == JsonValueKind.Object)
            {
                var s = S("openrouter");
                lock (_gate)
                {
                    s.DailyLimit = fr.TryGetProperty("limit", out var l) && l.TryGetInt32(out var li) ? li : null;
                    s.DailyRemaining = fr.TryGetProperty("remaining", out var r) && r.TryGetInt32(out var ri) ? ri : null;
                }
            }
        }
        catch (JsonException) { /* the key works; the numbers are optional */ }
    }

    /// <summary>Refreshes the daily numbers (OpenRouter) without a question – used by the status screen.</summary>
    public async Task RefreshLimitsAsync(CancellationToken ct = default)
    {
        if (Configured("openrouter")) { try { await ReadOpenRouterKeyAsync(ct); } catch (ProviderException) { } }
    }
}
