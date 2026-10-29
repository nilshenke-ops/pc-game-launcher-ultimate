using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

/// <summary>
/// JARVIS research: the web app collects passages from open sources (game wikis, Wikipedia, Q&amp;A sites); the configured
/// AI only writes a short German answer FROM those passages, numbered like the sources. It may not add knowledge of its
/// own – if the passages do not answer the question it has to say so. Everything returned is checked here.
/// </summary>
public static class SourceAnswer
{
    public sealed class Passage
    {
        public string Title { get; set; } = "";
        public string Source { get; set; } = "";
        public string Url { get; set; } = "";
        public string Text { get; set; } = "";
    }

    public sealed class Request
    {
        public string Question { get; set; } = "";
        public List<Passage> Passages { get; set; } = new();
    }

    public const string System =
        "Du bist JARVIS, ein Gaming-Assistent. Beantworte die Frage NUR mit Informationen aus den nummerierten Quellen. " +
        "Kein eigenes Wissen, nichts erfinden, keine Vermutungen als Fakten. Antworte auf Deutsch in höchstens 5 kurzen Sätzen, " +
        "übersetze englische Quellen sinngemäß und setze hinter jede Aussage die Nummer der Quelle in eckigen Klammern, z. B. [2]. " +
        "Widersprechen sich Quellen, sag das. Beantworten die Quellen die Frage nicht, setze \"answered\" auf false. " +
        "Gib nur JSON zurück: {\"answered\": true|false, \"answer\": \"…\", \"best\": <Nummer der hilfreichsten Quelle>}";

    public static Request Check(Request r)
    {
        r.Question = (r.Question ?? "").Trim();
        if (r.Question.Length is < 3 or > 300 || r.Question.Any(char.IsControl)) throw new RpcException("invalid-params", "Frage mit 3–300 Zeichen angeben.");
        r.Passages = (r.Passages ?? new()).Take(8).Select(p => new Passage
        {
            Title = Clip(p.Title, 120), Source = Clip(p.Source, 60), Text = Clip(p.Text, 1500),
            Url = Uri.TryCreate(p.Url, UriKind.Absolute, out var u) && u.Scheme == "https" ? u.ToString() : "",
        }).Where(p => p.Text.Length >= 20).ToList();
        if (r.Passages.Count == 0) throw new RpcException("invalid-params", "Keine Quellen zum Zusammenfassen.");
        return r;
    }

    static string Clip(string? s, int max)
    {
        var t = Regex.Replace(s ?? "", @"[\u0000-\u001f]+", " ").Trim();
        return t.Length > max ? t[..max] : t;
    }

    public static string Prompt(Request r) =>
        $"Frage: {r.Question}\n\n" + string.Join("\n\n", r.Passages.Select((p, i) => $"[{i + 1}] {p.Title} ({p.Source})\n{p.Text}"));

    /// <summary>
    /// "Gemini fragen (ohne Quelle)": only when the user taps it after no source matched. The answer comes from the AI's own
    /// knowledge and is shown marked as unchecked; the AI has to say when it is not sure instead of guessing.
    /// </summary>
    public const string FreeSystem =
        "Du bist JARVIS, ein Gaming-Assistent. Beantworte die Frage aus deinem Wissen auf Deutsch in höchstens 5 kurzen Sätzen. " +
        "Erfinde nichts: Weißt du es nicht sicher (z. B. sehr neue Spiele, Patches, Zahlenwerte), sag das ehrlich und setze \"sure\" auf false. " +
        "Keine Links. Gib nur JSON zurück: {\"answer\": \"…\", \"sure\": true|false}";

    public static string CheckQuestion(string? q)
    {
        var t = (q ?? "").Trim();
        if (t.Length is < 3 or > 300 || t.Any(char.IsControl)) throw new RpcException("invalid-params", "Frage mit 3–300 Zeichen angeben.");
        return t;
    }

    public static (string answer, bool sure) ParseFree(string json)
    {
        using var doc = ParseObject(json);
        var root = doc.RootElement;
        var text = root.TryGetProperty("answer", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
        text = Regex.Replace(text, @"https?://\S+|<[^>]*>|[`*_#]", "").Trim();
        if (text.Length > 1200) text = text[..1200].TrimEnd() + " …";
        if (text.Length < 5) throw new RpcException("assistant-format", "Die KI hat keine verwertbare Antwort geliefert.");
        return (text, root.TryGetProperty("sure", out var s) && s.ValueKind == JsonValueKind.True);
    }

    static JsonDocument ParseObject(string json)
    {
        var m = Regex.Match(json ?? "", @"\{[\s\S]*\}");
        if (!m.Success) throw new RpcException("assistant-format", "Die KI hat keine verwertbare Antwort geliefert.");
        try { return JsonDocument.Parse(m.Value); }
        catch (JsonException) { throw new RpcException("assistant-format", "Die KI hat keine verwertbare Antwort geliefert."); }
    }

    /// <summary>Checked answer: text without links or markup, source numbers only within range.</summary>
    public static (bool answered, string answer, int best) Parse(string json, int count)
    {
        using var doc = ParseObject(json);
        var root = doc.RootElement;
        var answered = root.TryGetProperty("answered", out var a) && a.ValueKind == JsonValueKind.True;
        var text = root.TryGetProperty("answer", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
        text = Regex.Replace(text, @"https?://\S+|<[^>]*>|[`*_#]", "").Trim();
        text = Regex.Replace(text, @"\[(\d+)\]", x => int.TryParse(x.Groups[1].Value, out var n) && n >= 1 && n <= count ? x.Value : "");
        if (text.Length > 1200) text = text[..1200].TrimEnd() + " …";
        var best = root.TryGetProperty("best", out var b) && b.TryGetInt32(out var bi) && bi >= 1 && bi <= count ? bi : 1;
        if (text.Length < 10) answered = false;
        return (answered, text, best);
    }
}
