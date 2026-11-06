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
