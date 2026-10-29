using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

/// <summary>
/// Google's official Gemini API (https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent) with the
/// user's own key from Google AI Studio. The free tier costs nothing (Google limits requests per minute/day and, per its
/// pricing page, may use free-tier content to improve its products – the settings say so). Google Search grounding is not
/// part of the free tier and is not used. The key is stored protected on the PC; it never goes to a phone or a backup.
/// </summary>
public sealed class GeminiClient
{
    /// <summary>Stable, free-tier model ("fastest, most cost-effective 3.5 model" per Google's model list, 2026-10).</summary>
    public const string DefaultModel = "gemini-3.5-flash-lite";
    public const string DefaultBase = "https://generativelanguage.googleapis.com";
    readonly HttpClient _http;
    public string BaseUrl { get; init; } = Environment.GetEnvironmentVariable("PGL_GEMINI_BASE") is { Length: > 0 } b ? b : DefaultBase;

    public GeminiClient(HttpMessageHandler? handler = null)
    {
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(60);
    }

    public sealed record Result(string Text, long PromptTokens, long OutputTokens, string Model);
    public sealed record Turn(string Role, string Text);

    /// <summary>A chat answer (plain text) for the conversation so far; roles "user" and "model".</summary>
    public Task<Result> ChatAsync(string apiKey, string model, string system, IReadOnlyList<Turn> history, CancellationToken ct = default) =>
        SendAsync(apiKey, model, system, new JsonArray(history.Select(t => (JsonNode)new JsonObject { ["role"] = t.Role, ["parts"] = new JsonArray { new JsonObject { ["text"] = t.Text } } }).ToArray()), json: false, ct);

    /// <summary>A Google API key from AI Studio: "AIza" + 35 characters (a little slack for future lengths).</summary>
    public static bool LooksLikeKey(string key) => System.Text.RegularExpressions.Regex.IsMatch(key, @"^AIza[0-9A-Za-z_-]{30,60}$");

    public Task<Result> CompleteJsonAsync(string apiKey, string model, string system, string prompt, CancellationToken ct = default) =>
        SendAsync(apiKey, model, system, new JsonArray { new JsonObject { ["role"] = "user", ["parts"] = new JsonArray { new JsonObject { ["text"] = prompt } } } }, json: true, ct);

    async Task<Result> SendAsync(string apiKey, string model, string system, JsonArray contents, bool json, CancellationToken ct)
    {
        var config = new JsonObject { ["maxOutputTokens"] = 2000, ["temperature"] = 0.3 };
        if (json) config["responseMimeType"] = "application/json";
        var body = new JsonObject
        {
            ["systemInstruction"] = new JsonObject { ["parts"] = new JsonArray { new JsonObject { ["text"] = system } } },
            ["contents"] = contents,
            ["generationConfig"] = config,
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl.TrimEnd('/')}/v1beta/models/{Uri.EscapeDataString(model)}:generateContent") { Content = JsonContent.Create(body) };
        req.Headers.Add("x-goog-api-key", apiKey); // header, not URL – the key never lands in a log line
        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct); }
        catch (HttpRequestException) { throw new RpcException("assistant-offline", "Keine Verbindung zu Gemini (Internet?)."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested) { throw new RpcException("assistant-busy", "Gemini hat zu lange gebraucht – bitte gleich noch einmal versuchen."); }
        catch (TaskCanceledException) { throw new RpcException("cancelled", "Abgebrochen."); }
        using (resp)
        {
            var raw = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw resp.StatusCode switch
                {
                    HttpStatusCode.BadRequest when raw.Contains("API_KEY_INVALID") || raw.Contains("API key not valid") => new RpcException("assistant-key", "Google lehnt den Gemini-Schlüssel ab. Bitte am PC unter KI-Assistent → Gemini neu eintragen."),
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new RpcException("assistant-key", "Der Gemini-Schlüssel darf die Gemini-API nicht nutzen (in Google AI Studio prüfen)."),
                    HttpStatusCode.NotFound => new RpcException("assistant-model", $"Gemini kennt das Modell „{model}“ nicht. Unter KI-Assistent → Gemini ein gültiges Modell eintragen (z. B. {DefaultModel})."),
                    HttpStatusCode.TooManyRequests => new RpcException("assistant-limit", "Das kostenlose Gemini-Kontingent ist für den Moment aufgebraucht (Google begrenzt Anfragen pro Minute und Tag) – später noch einmal."),
                    HttpStatusCode.BadRequest when raw.Contains("FAILED_PRECONDITION") || raw.Contains("location", StringComparison.OrdinalIgnoreCase) => new RpcException("assistant-unavailable", "Der kostenlose Gemini-Zugang ist in deiner Region gerade nicht verfügbar."),
                    _ when (int)resp.StatusCode >= 500 => new RpcException("assistant-unavailable", "Gemini ist gerade nicht erreichbar (Serverfehler)."),
                    _ => new RpcException("assistant-error", $"Gemini-Fehler {(int)resp.StatusCode}."),
                };
            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;
                var cand = root.GetProperty("candidates")[0];
                if (cand.TryGetProperty("finishReason", out var fr) && fr.GetString() is "SAFETY" or "PROHIBITED_CONTENT" or "BLOCKLIST")
                    throw new RpcException("assistant-error", "Gemini hat die Antwort blockiert.");
                var text = string.Concat(cand.GetProperty("content").GetProperty("parts").EnumerateArray()
                    .Where(p => !(p.TryGetProperty("thought", out var t) && t.ValueKind == JsonValueKind.True))
                    .Select(p => p.TryGetProperty("text", out var t) ? t.GetString() : ""));
                long pt = root.TryGetProperty("usageMetadata", out var u) && u.TryGetProperty("promptTokenCount", out var p) && p.TryGetInt64(out var pv) ? pv : 0;
                long ot = root.TryGetProperty("usageMetadata", out var u2) && u2.TryGetProperty("candidatesTokenCount", out var o) && o.TryGetInt64(out var ov) ? ov : 0;
                var served = root.TryGetProperty("modelVersion", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : model;
                if (string.IsNullOrWhiteSpace(text)) throw new RpcException("assistant-error", "Gemini hat eine leere Antwort geschickt – bitte noch einmal versuchen.");
                return new Result(text, pt, ot, served);
            }
            catch (Exception e) when (e is JsonException or KeyNotFoundException or IndexOutOfRangeException or InvalidOperationException)
            { throw new RpcException("assistant-error", "Unerwartete Antwort von Gemini."); }
        }
    }
}
