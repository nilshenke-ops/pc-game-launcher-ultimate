using System.Text.RegularExpressions;

namespace Pgl.Core.Assistant;

/// <summary>
/// Tasks for a bingo card, written by the configured AI (Claude or the local model in Ollama). Only the wording comes
/// from the model – count and length are checked here, the card itself stays in the app on the device.
/// </summary>
public static class BingoIdeas
{
    /// <summary>A cell shows at most this many characters (see play.ts: tasks are cut off at 80).</summary>
    public const int MaxTaskChars = 70;

    public const string System =
        "Du hilfst beim Gaming-Bingo im „Nexus Gaming Hub“. Du erfindest keine Fakten über den Nutzer und keine Spiele-Features, " +
        "sondern formulierst kurze Aufgaben zum genannten Spiel. Antworte ausschließlich mit der Liste – ohne Einleitung, " +
        "Nummerierung, Anführungszeichen oder Erklärung.";

    public static string Prompt(string game, int size)
    {
        var need = size * size;
        return
            $"Spiel: {game}\n" +
            $"Erstelle {need} verschiedene, kurze Aufgaben für eine {size}×{size}-Bingo-Karte zu genau diesem Spiel.\n" +
            "- Jede Aufgabe in einer eigenen Zeile, höchstens 6 Wörter, kein Punkt am Ende.\n" +
            "- Konkret und im Spiel machbar: Orte, Gegner, Mechaniken, typische Momente.\n" +
            "- Nichts erfinden, was es im Spiel nicht gibt; kennst du eine Mechanik nicht sicher, formuliere allgemein " +
            "(z. B. „Einen Boss ohne Heilung besiegen“).\n" +
            "- Keine doppelten Aufgaben, keine Überschriften, keine Stichpunkte mit Erklärung.";
    }

    /// <summary>
    /// The answer as tasks: bullets, numbering, quotes and closing full stops removed, duplicates dropped,
    /// headings and prose skipped. At most <paramref name="max"/> tasks.
    /// </summary>
    public static List<string> Parse(string text, int max)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var tasks = new List<string>();
        if (max <= 0) return tasks;
        foreach (var raw in text.Split('\n'))
        {
            var task = Clean(raw);
            if (task.Length is < 3 or > MaxTaskChars) continue;
            if (!task.Any(char.IsLetter)) continue;
            if (task.EndsWith(':')) continue; // "Aufgaben für Minecraft:"
            if (!seen.Add(task)) continue;
            tasks.Add(task);
            if (tasks.Count == max) break;
        }
        return tasks;
    }

    static string Clean(string line)
    {
        var s = line.Trim().Trim('*', '_', '`').Trim();
        // "- Aufgabe", "• Aufgabe", "1. Aufgabe", "1) Aufgabe"
        s = Regex.Replace(s, @"^(?:[-*•–]|\d{1,2}[.)])\s*", "").Trim();
        s = s.Trim('"', '„', '“', '\'').Trim();
        if (s.EndsWith('.')) s = s[..^1].Trim();
        return s;
    }
}
