using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

/// <summary>
/// DeepSeek's official API (OpenAI format, https://api.deepseek.com/chat/completions) – used only for generated content
/// that is checked afterwards (bingo tasks). The model name is the user's choice and is sent as is; "deepseek-flash" is
/// DeepSeek-V4.1-Flash according to DeepSeek's documentation. The key is stored protected on the PC and only decrypted
/// for the request; it never goes to a phone or into a backup.
/// </summary>
public sealed class DeepSeekClient
{
    public const string DefaultModel = "deepseek-flash";
    public const string DefaultBase = "https://api.deepseek.com";
    readonly HttpClient _http;
    public string BaseUrl { get; init; } = Environment.GetEnvironmentVariable("PGL_DEEPSEEK_BASE") is { Length: > 0 } b ? b : DefaultBase;

    public DeepSeekClient(HttpMessageHandler? handler = null)
    {
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(90);
    }

    public sealed record Result(string Text, long PromptTokens, long OutputTokens, string Model);

    public async Task<Result> CompleteJsonAsync(string apiKey, string model, string system, string prompt, CancellationToken ct = default)
    {
        var body = new JsonObject
        {
            ["model"] = model,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = system },
                new JsonObject { ["role"] = "user", ["content"] = prompt },
            },
            ["response_format"] = new JsonObject { ["type"] = "json_object" },
            ["max_tokens"] = 4000,
            ["stream"] = false,
        };
        using var req = new HttpRequestMessage(HttpMethod.Post, BaseUrl.TrimEnd('/') + "/chat/completions") { Content = JsonContent.Create(body) };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct); }
        catch (HttpRequestException) { throw new RpcException("assistant-offline", "Keine Verbindung zu DeepSeek (Internet?). Aufgaben aus dem eingebauten Katalog funktionieren weiter."); }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested) { throw new RpcException("assistant-busy", "DeepSeek hat zu lange gebraucht – bitte gleich noch einmal versuchen."); }
        using (resp)
        {
            var raw = await resp.Content.ReadAsStringAsync(ct);
            if (!resp.IsSuccessStatusCode)
                throw resp.StatusCode switch
                {
                    HttpStatusCode.Unauthorized => new RpcException("assistant-key", "DeepSeek lehnt den API-Schlüssel ab. Bitte am PC unter KI-Assistent → DeepSeek neu eintragen."),
                    HttpStatusCode.PaymentRequired => new RpcException("assistant-limit", "Das DeepSeek-Guthaben ist aufgebraucht (Fehler 402). Auf platform.deepseek.com aufladen oder den Katalog nutzen."),
                    HttpStatusCode.TooManyRequests => new RpcException("assistant-busy", "DeepSeek begrenzt gerade die Anfragen – bitte kurz warten."),
                    HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity when raw.Contains("model", StringComparison.OrdinalIgnoreCase) => new RpcException("assistant-model", $"DeepSeek kennt das Modell „{model}“ nicht. Unter KI-Assistent → DeepSeek ein gültiges Modell eintragen (z. B. {DefaultModel})."),
                    _ when (int)resp.StatusCode >= 500 => new RpcException("assistant-unavailable", "DeepSeek ist gerade nicht erreichbar (Serverfehler)."),
                    _ => new RpcException("assistant-error", $"DeepSeek-Fehler {(int)resp.StatusCode}."),
                };
            try
            {
                using var doc = JsonDocument.Parse(raw);
                var root = doc.RootElement;
                var text = root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
                long pt = root.TryGetProperty("usage", out var u) && u.TryGetProperty("prompt_tokens", out var p) && p.TryGetInt64(out var pv) ? pv : 0;
                long ot = root.TryGetProperty("usage", out var u2) && u2.TryGetProperty("completion_tokens", out var o) && o.TryGetInt64(out var ov) ? ov : 0;
                var served = root.TryGetProperty("model", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : model;
                // DeepSeek documents that JSON mode can occasionally return empty content.
                if (string.IsNullOrWhiteSpace(text)) throw new RpcException("assistant-bingo", "DeepSeek hat eine leere Antwort geschickt – bitte noch einmal versuchen.");
                return new Result(text, pt, ot, served);
            }
            catch (Exception e) when (e is JsonException or KeyNotFoundException or IndexOutOfRangeException or InvalidOperationException)
            { throw new RpcException("assistant-error", "Unerwartete Antwort von DeepSeek."); }
        }
    }
}
