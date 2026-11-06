using System.Text.RegularExpressions;

namespace Pgl.Core.Assistant;

/// <summary>What JARVIS understands about his long-term memory: "Merk dir …", "Wo war ich bei … stehen geblieben?", "Was weißt du über …?", and what is worth keeping.</summary>
public static class MemoryIntents
{
    const RegexOptions O = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;

    static readonly Regex Remember = new(@"^\s*(?:(?:hey\s+)?jarvis[,:]?\s+)?(?:bitte\s+)?(?:merk(?:e)?\s+dir|vergiss\s+nicht)[,:]?\s*(?:bitte\s+)?(?:dass\s+|folgendes[:,]?\s*)?(.+?)\s*[.!]?\s*$", O);
    static readonly Regex RememberIn = new(@"^\s*(?:bitte\s+)?(?:speicher(?:e)?|notier(?:e)?|schreib(?:e)?)\s+(?:dir\s+)?(?:bitte\s+)?(.+?)\s+(?:in|ins|im|in\s+mein(?:em)?)\s+(?:mein\s+)?(?:gedächtnis|gedaechtnis|memory|obsidian)\s*[.!]?\s*$", O);
    static readonly Regex Pronoun = new(@"^(?:das|es|dies|das\s+bitte|das\s+alles|das\s+hier|ja|ja\s+bitte)$", O);

    /// <summary>The text to remember; "" when only "das" was said (then the last thing you told JARVIS is meant); null if it is no such request.</summary>
    public static string? RememberText(string text)
    {
        var m = Remember.Match(text);
        if (!m.Success) m = RememberIn.Match(text);
        if (!m.Success) return null;
        var t = m.Groups[1].Value.Trim().TrimEnd('.', '!');
        return Pronoun.IsMatch(t) ? "" : t;
    }

    static readonly Regex Replace = new(@"^\s*(?:ja[,.!]?\s*)?(?:bitte\s+)?(?:ersetz\w*|ersetze\s+(?:es|das|die\s+alte\w*)|überschreib\w*|ueberschreib\w*|nimm\s+(?:das\s+)?neue\w*|das\s+neue\s+gilt|stimmt\s+jetzt)\b.*$", O);
    static readonly Regex Both = new(@"^\s*(?:ja[,.!]?\s*)?(?:bitte\s+)?(?:behalt\w*\s+beide\w*|beide\w*\s+behalten|beides(?:\s+behalten)?|beides\s+(?:stimmt|gilt))\b.*$", O);
    static readonly Regex Cancel = new(@"^\s*(?:nein|lass\s+(?:es|das)|vergiss\s+(?:es|das)|doch\s+nicht|abbrechen|stopp?|egal|nicht\s+merken|das\s+alte\s+gilt|alt(?:es)?\s+behalten)\b.*$", O);

    /// <summary>The answer to "Soll ich es ersetzen oder beides behalten?": "replace", "both", "cancel" – or null when the text is something else.</summary>
    public static string? ConflictAnswer(string text)
    {
        var t = text.Trim();
        if (t.Length > 60) return null;
        if (Both.IsMatch(t)) return "both";
        if (Replace.IsMatch(t)) return "replace";
        if (Cancel.IsMatch(t)) return "cancel";
        return null;
    }

    /// <summary>After "dass" the verb stands last ("mein Lieblingsspiel Celeste ist"); stored it reads better – and can be compared with other notes – with the verb in second place ("mein Lieblingsspiel ist Celeste").</summary>
    public static string MainClause(string s)
    {
        var w = s.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (w.Length < 3) return s;
        var subj = Regex.IsMatch(w[0], "^(ich|wir|er|sie|es|du)$", O) ? 1 : Regex.IsMatch(w[0], "^(mein|meine|meinen|dein|deine|unser|unsere)$", O) && w.Length > 3 ? 2 : 0;
        var verb = w[^1];
        if (subj == 0 || w.Length < subj + 2 || !Regex.IsMatch(verb, @"^[a-zäöüß]+$") || !Regex.IsMatch(verb, @"^(ist|sind|war|waren|hat|haben|wird|werden|kann|können|heißt|heisst|bin|bist|gibt|läuft|spiele|wohne|mag|habe|will|möchte)$", O)) return s;
        return string.Join(' ', w.Take(subj).Concat(new[] { verb }).Concat(w.Skip(subj).Take(w.Length - subj - 1)));
    }

    static readonly Regex[] Recalls =
    {
        new(@"wo\s+war\s+ich\s+(?:bei|in|mit|an)\s+(?:meinem|meiner|meinen|dem|der|den)?\s*(.+?)\s*(?:stehen\s+geblieben|stehengeblieben)?\s*\??$", O),
        new(@"wie\s+weit\s+(?:bin|war)\s+ich\s+(?:bei|mit|in)\s+(?:meinem|meiner|meinen|dem|der|den)?\s*(.+?)\s*\??$", O),
        new(@"was\s+(?:weißt|weisst)\s+du\s+(?:alles\s+)?(?:über|ueber|zu|von)\s+(.+?)\s*\??$", O),
        new(@"(?:erinnerst|erinnere)\s+du\s+dich\s+(?:an|daran|noch\s+an)\s+(.+?)\s*\??$", O),
        new(@"was\s+habe\s+ich\s+(?:dir\s+)?(?:über|ueber|zu|von)\s+(.+?)\s+(?:gesagt|erzählt|erzaehlt|geschrieben|notiert)\s*\??$", O),
        new(@"(?:was\s+ist|wie\s+ist)\s+(?:der\s+)?(?:letzte|aktuelle|derzeitige)\s+stand\s+(?:von|bei|meines|meiner|vom|zu)\s+(.+?)\s*\??$", O),
        new(@"(?:such(?:e)?|schau|schaue)\s+(?:bitte\s+)?(?:in\s+(?:meinem\s+)?(?:gedächtnis|gedaechtnis|memory|notizen|obsidian)\s+)?(?:nach\s+)(.+?)\s*\??$", O),
        new(@"(?:was\s+steht|steht\s+was)\s+(?:in\s+(?:meinen\s+)?(?:notizen|gedächtnis)\s+)?(?:über|ueber|zu|von)\s+(.+?)\s*\??$", O),
    };

    /// <summary>The topic of a question to the memory ("Minecraft-Projekt", "meine Wunschliste"), or null.</summary>
    public static string? RecallTopic(string text)
    {
        foreach (var r in Recalls)
        {
            var m = r.Match(text.Trim());
            if (m.Success) { var t = m.Groups[1].Value.Trim().TrimEnd('?', '.', '!'); if (t.Length >= 2) return t; }
        }
        return null;
    }

    static readonly Regex Delete = new(@"\b(lösch\w*|loesch\w*|entfern\w*|vergiss)\b.*\b(notiz|notizen|erinnerung|gedächtnis|gedaechtnis|memory)\b|\b(notiz|erinnerung)\b.*\b(lösch\w*|loesch\w*|entfern\w*)\b", O);
    public static bool IsDeleteRequest(string text) => Delete.IsMatch(text);

    static readonly Regex Worth = new(@"^(?:ich\s+(?:habe|hab|bin|wohne|spiele|baue|plane|will|möchte|moechte|mag|arbeite|nutze|benutze)\b|heute\s+habe\s+ich\b|gestern\s+habe\s+ich\b|mein(?:e|en|em|er)?\s+[\p{L}\d -]+\s+(?:ist|sind|hat|läuft|laeuft)\b)", O);
    static readonly Regex Progress = new(@"\b(projekt|fertig|gebaut|gespielt|durchgespielt|level|boss|fortschritt|geschafft|angefangen|abgeschlossen|lieblings\w*|wohne|plane|ziel)\b", O);

    /// <summary>A statement that carries something lasting (first person, progress, preference) – never a question or a command.</summary>
    public static bool LooksWorthKeeping(string text)
    {
        var t = text.Trim();
        if (t.Length is < 18 or > 300 || t.Contains('?')) return false;
        if (Regex.IsMatch(t, @"^(starte|öffne|oeffne|stopp|mach|schalte|zeig|spiel|such)\b", O)) return false;
        return Worth.IsMatch(t) && Progress.IsMatch(t);
    }
}
