using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

/// <summary>
/// Any AI router or provider with the OpenAI chat format (POST {base}/chat/completions): OpenRouter (free ":free" models),
/// Groq, MixRoute, or a self-hosted OmniRoute/LiteLLM in the home network. Up to three models in priority order: on
/// OpenRouter they go as its "models" fallback list (the router switches in milliseconds); elsewhere the next model is
/// tried here when one is rate-limited, down or unknown. The answer names the model that really answered.
/// The key is stored protected on the PC and only decrypted for the request.
/// </summary>
public sealed class OpenAiCompatClient
{
    readonly HttpClient _http;

    public OpenAiCompatClient(HttpMessageHandler? handler = null)
    {
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(90);
    }

    public sealed record Result(string Text, long PromptTokens, long OutputTokens, string Model);
    public sealed record Model(string Id, bool? Free, long? Context);

    static bool IsOpenRouter(string baseUrl) => Uri.TryCreate(baseUrl, UriKind.Absolute, out var u) && u.Host.EndsWith("openrouter.ai", StringComparison.OrdinalIgnoreCase);

    public async Task<Result> ChatAsync(string baseUrl, string? apiKey, IReadOnlyList<string> models, string system, IReadOnlyList<GeminiClient.Turn> history, bool json, CancellationToken ct = default)
    {
        if (models.Count == 0) throw new RpcException("assistant-model", "Für den KI-Router ist noch kein Modell gewählt (am PC unter KI-Assistent → KI-Router).");
        var messages = new JsonArray { new JsonObject { ["role"] = "system", ["content"] = system } };
        foreach (var t in history) messages.Add(new JsonObject { ["role"] = t.Role == "model" ? "assistant" : "user", ["content"] = t.Text });
        if (IsOpenRouter(baseUrl)) return await SendAsync(baseUrl, apiKey, models[0], models.Count > 1 ? models : null, messages, json, ct);
        RpcException? last = null;
        foreach (var m in models)
        {
            try { return await SendAsync(baseUrl, apiKey, m, null, messages, json, ct); }
            catch (RpcException e) when (e.Code is "assistant-busy" or "assistant-unavailable" or "assistant-model" or "assistant-limit") { last = e; }
        }
        throw last!;
    }

    async Task<Result> SendAsync(string baseUrl, string? apiKey, string model, IReadOnlyList<string>? fallbacks, JsonArray messages, bool json, CancellationToken ct)
    {
        var body = new JsonObject { ["model"] = model, ["messages"] = messages.DeepClone(), ["max_tokens"] = 2000, ["stream"] = false };
        if (fallbacks != null) body["models"] = new JsonArray(fallbacks.Select(f => (JsonNode)JsonValue.Create(f)!).ToArray());
        if (json) body["response_format"] = new JsonObject { ["type"] = "json_object" };
        using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl.TrimEnd('/') + "/chat/completions") { Content = JsonContent.Create(body) };
        if (!string.IsNullOrEmpty(apiKey)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        req.Headers.Add("X-Title", "Nexus Gaming Hub"); // OpenRouter shows the app name in the user's own activity list
        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct); }
        catch (HttpRequestException) { throw new RpcException("assistant-offline", "Der KI-Router ist nicht erreichbar (Internet oder Adresse prüfen)."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested) { throw new RpcException("assistant-busy", "Der KI-Router hat zu lange gebraucht – bitte gleich noch einmal versuchen."); }
        catch (TaskCanceledException) { throw new RpcException("cancelled", "Abgebrochen."); }
        using (resp)
        {
            var raw = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw resp.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new RpcException("assistant-key", "Der KI-Router lehnt den Schlüssel ab. Bitte am PC unter KI-Assistent → KI-Router neu eintragen."),
                    HttpStatusCode.PaymentRequired => new RpcException("assistant-limit", "Beim KI-Router ist kein Guthaben für dieses Modell da – ein kostenloses Modell wählen (bei OpenRouter die mit „:free“)."),
                    HttpStatusCode.TooManyRequests => new RpcException("assistant-limit", "Das kostenlose Kontingent des KI-Routers ist für den Moment aufgebraucht (z. B. OpenRouter: 20 pro Minute, 50 pro Tag ohne Guthaben)."),
                    HttpStatusCode.NotFound => new RpcException("assistant-model", $"Der KI-Router kennt das Modell „{model}“ nicht (mehr) – am PC ein anderes wählen."),
                    _ when (int)resp.StatusCode >= 500 => new RpcException("assistant-unavailable", "Der KI-Router ist gerade nicht erreichbar (Serverfehler)."),
                    _ => new RpcException("assistant-error", $"KI-Router-Fehler {(int)resp.StatusCode}."),
                };
            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;
                if (root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.Object) throw new RpcException("assistant-unavailable", "Der KI-Router meldet einen Fehler beim Modell.");
                var text = root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
                long pt = root.TryGetProperty("usage", out var u) && u.TryGetProperty("prompt_tokens", out var p) && p.TryGetInt64(out var pv) ? pv : 0;
                long ot = root.TryGetProperty("usage", out var u2) && u2.TryGetProperty("completion_tokens", out var o) && o.TryGetInt64(out var ov) ? ov : 0;
                var served = root.TryGetProperty("model", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : model;
                if (string.IsNullOrWhiteSpace(text)) throw new RpcException("assistant-unavailable", "Der KI-Router hat eine leere Antwort geschickt.");
                return new Result(text, pt, ot, served);
            }
            catch (Exception e) when (e is JsonException or KeyNotFoundException or IndexOutOfRangeException or InvalidOperationException)
            { throw new RpcException("assistant-error", "Unerwartete Antwort vom KI-Router."); }
        }
    }

    /// <summary>The models the router offers right now (GET {base}/models); free = price 0 (OpenRouter) or ":free".</summary>
    public async Task<List<Model>> ModelsAsync(string baseUrl, string? apiKey, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl.TrimEnd('/') + "/models");
        if (!string.IsNullOrEmpty(apiKey)) req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        string raw;
        try
        {
            using var r = await _http.SendAsync(req, ct);
            if (r.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) throw new RpcException("assistant-key", "Der KI-Router lehnt den Schlüssel ab.");
            if (!r.IsSuccessStatusCode) throw new RpcException("assistant-unavailable", $"Der KI-Router antwortet mit {(int)r.StatusCode}.");
            raw = await r.Content.ReadAsStringAsync(ct);
        }
        catch (HttpRequestException) { throw new RpcException("assistant-offline", "Der KI-Router ist nicht erreichbar."); }
        var list = new List<Model>();
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array) return list;
            foreach (var m in data.EnumerateArray())
            {
                if (!m.TryGetProperty("id", out var idv) || idv.GetString() is not { Length: > 0 and <= 120 } id) continue;
                bool? free = id.EndsWith(":free") ? true : null;
                if (m.TryGetProperty("pricing", out var pr) && pr.ValueKind == JsonValueKind.Object)
                    free = Zero(pr, "prompt") && Zero(pr, "completion");
                long? ctx = m.TryGetProperty("context_length", out var c) && c.TryGetInt64(out var cv) ? cv : null;
                list.Add(new Model(id, free, ctx));
            }
        }
        catch (JsonException) { }
        return list.OrderByDescending(x => x.Free == true).ThenBy(x => x.Id).Take(400).ToList();
    }

    static bool Zero(JsonElement pr, string k) => pr.TryGetProperty(k, out var v) && (v.ValueKind == JsonValueKind.String ? v.GetString() is "0" or "0.0" : v.ValueKind == JsonValueKind.Number && v.GetDouble() == 0);
}
