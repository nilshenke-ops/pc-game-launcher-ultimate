using System.Text.Json;
using Pgl.Core.Rpc;
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

/// <summary>What the app asks for (Ultimate Bingo). All fields are checked in <see cref="BingoPlan.Check"/>.</summary>
public sealed class BingoRequest
{
    public string Game { get; set; } = "";
    public int Size { get; set; } = 4;
    /// <summary>How many tasks per level 1–4 (the app plans this from the difficulty).</summary>
    public int[]? Levels { get; set; }
    public string? Mode { get; set; }
    public int Players { get; set; } = 1;
    public List<string>? Categories { get; set; }
    public List<string>? Exclude { get; set; }
    public string? Rules { get; set; }
    public string? Progress { get; set; }
    public bool Spoilers { get; set; }
}

public sealed record PlannedTask(string Text, int Level, string Category, bool Team, string? Why);

/// <summary>Prompt and strict reading of a JSON answer for the Ultimate Bingo – the model only supplies wording and levels.</summary>
public static class BingoPlan
{
    public static readonly string[] Categories = { "explore", "combat", "collect", "build", "team", "fun", "challenge", "progress", "survival" };
    public const int MaxText = 90;

    public static BingoRequest Check(BingoRequest r)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        r.Game = (r.Game ?? "").Trim();
        if (r.Game.Length is < 2 or > 100 || r.Game.Any(char.IsControl)) throw Bad("Spiel mit 2–100 Zeichen angeben.");
        if (r.Size is not (3 or 4 or 5)) throw Bad("Größe muss 3, 4 oder 5 sein.");
        r.Levels ??= new[] { 0, r.Size * r.Size, 0, 0 };
        if (r.Levels.Length != 4 || r.Levels.Any(x => x is < 0 or > 25) || r.Levels.Sum() is < 1 or > 25) throw Bad("Ungültige Verteilung der Schwierigkeit.");
        if (r.Players is < 1 or > 8) throw Bad("1–8 Spieler.");
        r.Categories = (r.Categories ?? new()).Where(c => Categories.Contains(c)).Distinct().ToList();
        r.Exclude = (r.Exclude ?? new()).Where(e => !string.IsNullOrWhiteSpace(e)).Select(e => e.Trim()).Where(e => e.Length <= MaxText).Take(60).ToList();
        r.Mode = r.Mode is { Length: <= 20 } m && Regex.IsMatch(m, "^[a-z]+$") ? m : "classic";
        r.Rules = Clip(r.Rules, 300);
        r.Progress = Clip(r.Progress, 200);
        return r;
    }

    static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : new string(s.Trim().Where(c => !char.IsControl(c)).Take(max).ToArray());

    public const string System =
        "Du erstellst Aufgaben für ein Gaming-Bingo im „Nexus Gaming Hub“ und antwortest ausschließlich mit gültigem JSON. " +
        "Nenne nur Gegenstände, Gegner, Bosse, Orte und Mechaniken, die es im genannten Spiel wirklich gibt. Kennst du das Spiel nicht sicher, " +
        "setze \"known\": false und schreibe nur allgemeine Aufgaben, die in jedem Spiel dieser Art möglich sind. Jede Aufgabe ist ein eigener " +
        "Spielzweck (keine Umformulierung einer anderen), konkret, fair und grundsätzlich erfüllbar.";

    static readonly string[] LevelNames = { "leicht (Einsteiger, kurz)", "mittel (etwas Spielerfahrung)", "schwer (Können, Planung oder Zeit)", "sehr schwer (erfahrene Spieler, fordernd aber fair)" };

    /// <summary>The model is asked for a few more tasks than needed, so checks and exclusions never leave the card short.</summary>
    public static int Extra(BingoRequest r) => Math.Min(8, 2 + r.Levels!.Sum() / 4);

    public static string Prompt(BingoRequest r)
    {
        var sb = new System.Text.StringBuilder();
        sb.Append($"Spiel: {r.Game}\n");
        sb.Append($"Bingo {r.Size}×{r.Size}. Liefere {r.Levels!.Sum() + Extra(r)} verschiedene Aufgaben, davon je Stufe ungefähr:\n");
        for (int i = 0; i < 4; i++) if (r.Levels[i] > 0) sb.Append($"- Stufe {i + 1} = {LevelNames[i]}: {r.Levels[i] + (i == Array.IndexOf(r.Levels, r.Levels.Max()) ? Extra(r) : 0)}\n");
        sb.Append($"Spielmodus: {r.Mode}. Spieler: {r.Players}.");
        sb.Append(r.Players > 1 ? " Einige Aufgaben dürfen Teamaufgaben sein (\"team\": true).\n" : " Keine Teamaufgaben.\n");
        if (r.Categories!.Count > 0) sb.Append($"Bevorzugte Kategorien: {string.Join(", ", r.Categories)}.\n");
        if (r.Progress != null) sb.Append($"Spielfortschritt des Spielers: {r.Progress}\n");
        if (r.Rules != null) sb.Append($"Eigene Regeln (einhalten): {r.Rules}\n");
        sb.Append(r.Spoilers ? "Spoiler sind erlaubt.\n" : "Keine Spoiler: keine Namen später Bosse, Orte oder Story-Wendungen.\n");
        if (r.Exclude!.Count > 0) sb.Append("Diese Aufgaben NICHT wiederholen: " + string.Join(" | ", r.Exclude.Take(40)) + "\n");
        sb.Append("Kategorien (genau eine je Aufgabe): " + string.Join(", ", Categories) + ".\n");
        sb.Append("Text: deutsch, höchstens 12 Wörter, ohne Punkt am Ende. \"why\": ein kurzer Satz, warum die Aufgabe zur Stufe passt.\n");
        sb.Append("Antwortformat (json): {\"known\":true,\"tasks\":[{\"text\":\"Finde Diamanten\",\"level\":2,\"category\":\"collect\",\"team\":false,\"why\":\"Braucht Eisenwerkzeug und etwas Suche unter Tage\"}]}");
        return sb.ToString();
    }

    /// <summary>Reads the model's JSON (also when wrapped in text or code fences). Invalid entries are dropped, never repaired by guessing.</summary>
    public static (bool known, List<PlannedTask> tasks) Parse(string text, BingoRequest r)
    {
        var tasks = new List<PlannedTask>();
        var known = true;
        var a = text.IndexOf('{'); var b = text.LastIndexOf('}');
        if (a < 0 || b <= a) return (known, tasks);
        var seen = new HashSet<string>((r.Exclude ?? new()).Select(Key));
        try
        {
            using var doc = JsonDocument.Parse(text[a..(b + 1)]);
            var root = doc.RootElement;
            if (root.TryGetProperty("known", out var k) && k.ValueKind == JsonValueKind.False) known = false;
            if (!root.TryGetProperty("tasks", out var list) || list.ValueKind != JsonValueKind.Array) return (known, tasks);
            foreach (var t in list.EnumerateArray().Take(60))
            {
                if (t.ValueKind != JsonValueKind.Object || !t.TryGetProperty("text", out var tx) || tx.ValueKind != JsonValueKind.String) continue;
                var s = Regex.Replace(tx.GetString() ?? "", @"\s+", " ").Trim().TrimEnd('.');
                if (s.Length is < 3 or > MaxText || !s.Any(char.IsLetter) || s.IndexOfAny(new[] { '<', '>', '{', '}' }) >= 0 || s.Any(char.IsControl)) continue;
                if (!seen.Add(Key(s))) continue;
                var level = t.TryGetProperty("level", out var lv) && lv.TryGetInt32(out var l) && l is >= 1 and <= 4 ? l : 2;
                var cat = t.TryGetProperty("category", out var c) && c.ValueKind == JsonValueKind.String && Categories.Contains(c.GetString()) ? c.GetString()! : "challenge";
                var team = t.TryGetProperty("team", out var tm) && tm.ValueKind == JsonValueKind.True;
                if (team && r.Players < 2) continue;
                var why = t.TryGetProperty("why", out var w) && w.ValueKind == JsonValueKind.String && w.GetString()!.Length <= 160 ? w.GetString()!.Trim() : null;
                tasks.Add(new PlannedTask(s, level, cat, team, why));
            }
        }
        catch (JsonException) { }
        return (known, tasks);
    }

    static string Key(string s) => Regex.Replace(s.ToLowerInvariant(), @"[^\p{L}\p{N}]+", " ").Trim();
}
