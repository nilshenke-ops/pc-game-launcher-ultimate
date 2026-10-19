using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace Pgl.Core.Assistant;

public sealed record KnowledgeSection(string Source, string Title, string? Page, string Body, string Keywords)
{
    /// <summary>Body without the "Seite:"/"Stichworte:" lines, for showing to the user.</summary>
    public string Text => string.Join("\n", Body.Split('\n').Where(l => !l.StartsWith("Seite:") && !l.StartsWith("Stichworte:"))).Trim();
}

/// <summary>
/// What the assistant knows about the app: knowledge.md (pages, how-tos, limits) plus TROUBLESHOOTING.md and
/// docs/DATENSCHUTZ.md, embedded at build time so the answers always match the shipped version.
/// </summary>
public sealed class KnowledgeBase
{
    public IReadOnlyList<KnowledgeSection> Sections { get; }
    /// <summary>All documents as one text (system prompt for Claude).</summary>
    public string FullText { get; }

    public static readonly KnowledgeBase Embedded = Load();

    public KnowledgeBase(IEnumerable<(string source, string markdown)> docs)
    {
        var list = new List<KnowledgeSection>();
        var full = new StringBuilder();
        foreach (var (source, md) in docs)
        {
            full.Append("\n\n<<< ").Append(source).Append(" >>>\n").Append(md.Trim());
            foreach (var part in Regex.Split(md.Replace("\r", ""), @"^## ", RegexOptions.Multiline).Skip(1))
            {
                var nl = part.IndexOf('\n');
                var title = (nl < 0 ? part : part[..nl]).Trim();
                var body = nl < 0 ? "" : part[(nl + 1)..].Trim();
                var page = Regex.Match(body, @"^Seite: (\S+)", RegexOptions.Multiline) is { Success: true } m ? m.Groups[1].Value : null;
                var kw = Regex.Match(body, @"^Stichworte: (.+)$", RegexOptions.Multiline) is { Success: true } k ? k.Groups[1].Value : "";
                list.Add(new KnowledgeSection(source, title, page, body, kw));
            }
        }
        Sections = list;
        FullText = full.ToString().Trim();
    }

    static KnowledgeBase Load()
    {
        var asm = typeof(KnowledgeBase).Assembly;
        string Read(string name)
        {
            using var s = asm.GetManifestResourceStream(name);
            return s == null ? "" : new StreamReader(s).ReadToEnd();
        }
        return new KnowledgeBase(new[] { ("Wissen", Read("assistant/knowledge.md")), ("Fehlerbehebung", Read("assistant/TROUBLESHOOTING.md")), ("Datenschutz", Read("assistant/DATENSCHUTZ.md")) }
            .Where(d => d.Item2.Length > 0));
    }

    // ---------------------------------------------------------------- search

    static readonly HashSet<string> Stop = new(StringComparer.Ordinal)
    {
        "der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "und", "oder", "ich", "du", "mein", "meine", "meinen", "mir", "mich",
        "ist", "sind", "wie", "was", "wo", "wann", "warum", "kann", "kannst", "geht", "mit", "von", "für", "fur", "auf", "im", "in", "an", "am", "zu", "zum", "zur",
        "es", "man", "bitte", "nicht", "auch", "noch", "mal", "dann", "the", "a", "an", "how", "do", "i", "is", "my", "to", "what", "can", "of", "and", "where", "why",
    };

    /// <summary>Lower case, umlauts folded, crude German/English stemming – good enough to match "Sounds" to "sound".</summary>
    public static List<string> Tokens(string text)
    {
        var s = Fold(text);
        var result = new List<string>();
        foreach (Match m in Regex.Matches(s, "[a-z0-9]+"))
        {
            var w = m.Value;
            if (w.Length < 2 || Stop.Contains(w)) continue;
            var st = Stem(w);
            // Separable German verbs: "richte … ein" means "einrichten", "stelle … ein" means "einstellen".
            result.Add(st switch { "richt" => "einricht", "stell" => "einstell", "schalt" => "einschalt", "richtet" => "einricht", _ => st });
        }
        return result;
    }

    public static string Fold(string text)
    {
        var s = text.ToLowerInvariant().Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss");
        var d = s.Normalize(NormalizationForm.FormD);
        return new string(d.Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark).ToArray());
    }

    static string Stem(string w)
    {
        foreach (var suf in new[] { "ungen", "ung", "en", "er", "es", "e", "n", "s" })
            if (w.Length > suf.Length + 3 && w.EndsWith(suf, StringComparison.Ordinal)) return w[..^suf.Length];
        return w;
    }

    static readonly HashSet<string> Weak = new(StringComparer.Ordinal) { "einstell", "einricht", "einschalt", "mach", "funktionier", "geht", "brauch", "find" };

    public IReadOnlyList<(KnowledgeSection section, double score)> Search(string query, int max = 3)
    {
        var q = Tokens(query).Distinct().ToList();
        if (q.Count == 0) return Array.Empty<(KnowledgeSection, double)>();
        var scored = new List<(KnowledgeSection, double)>();
        foreach (var s in Sections)
        {
            var title = Tokens(s.Title).ToHashSet();
            var kw = Tokens(s.Keywords).ToHashSet();
            var body = Tokens(s.Body);
            var bodySet = body.ToHashSet();
            double score = 0;
            foreach (var t in q)
            {
                // Generic verbs ("einstellen", "einrichten") say little about the topic.
                var w = Weak.Contains(t) ? 0.3 : 1.0;
                if (title.Contains(t)) score += 3 * w;
                if (kw.Contains(t)) score += 2.5 * w;
                else if (kw.Any(k => k.Length >= 4 && t.Length >= 4 && (k.StartsWith(t) || t.StartsWith(k)))) score += 1.2 * w;
                if (bodySet.Contains(t)) score += 1 * w;
            }
            // Share of the question that is covered – prefers specific sections over long ones mentioning everything.
            var covered = q.Count(t => title.Contains(t) || kw.Contains(t) || bodySet.Contains(t)) / (double)q.Count;
            score *= 0.5 + covered;
            if (s.Source != "Wissen") score *= 0.9;
            if (score > 0) scored.Add((s, score));
        }
        return scored.OrderByDescending(x => x.Item2).Take(max).ToList();
    }

    /// <summary>Page title by path, e.g. "/deals" → "Deal Radar".</summary>
    public string? PageTitle(string path) => Sections.FirstOrDefault(s => s.Page == path)?.Title;
}
