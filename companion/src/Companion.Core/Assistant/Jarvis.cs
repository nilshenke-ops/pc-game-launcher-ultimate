using System.Text.RegularExpressions;

namespace Pgl.Core.Assistant;

/// <summary>
/// JARVIS Gaming: the assistant may run what the user asked for directly – but only while the user has JARVIS switched
/// on in the website (a session on this connection), only for gaming actions from a fixed list, and only for things
/// the user named in this very message. Anything the AI comes up with on its own (or reads in game names, notes or
/// news) stays a button. Critical or multi-step actions marked "confirm" are never run without asking.
/// </summary>
public static class Jarvis
{
    public static readonly TimeSpan Idle = TimeSpan.FromMinutes(15);

    /// <summary>Kinds JARVIS may run directly. Not here: power, deleting, removing, anything outside the app's gaming functions.</summary>
    public static readonly HashSet<string> AutoKinds = new() { "launch", "sound", "stopSounds", "profile", "quick", "navigate", "goal", "wish" };

    static string Fold(string s) => " " + Regex.Replace(KnowledgeBase.Fold(s), "[^a-z0-9]+", " ").Trim() + " ";

    /// <summary>Did the user name this target in the message? Whole name, or one of its distinctive words (4+ letters).</summary>
    public static bool Mentioned(string? target, string userText)
    {
        if (string.IsNullOrWhiteSpace(target)) return false;
        var text = Fold(userText);
        var name = Fold(target);
        if (name.Trim().Length == 0) return false;
        if (text.Contains(name)) return true;
        return name.Split(' ', StringSplitOptions.RemoveEmptyEntries).Any(w => w.Length >= 4 && text.Contains(" " + w));
    }

    /// <summary>The user asks to stop all sounds (no name needed for that one).</summary>
    static bool AsksStopSounds(string userText) => Regex.IsMatch(Fold(userText), " (stopp|stop|stoppe|beende|halt)\\w* .*(sound|sounds|musik|toene|alles) | (sound|sounds) (stoppen|aus) ");

    /// <summary>Marks the actions JARVIS may run now. Returns how many.</summary>
    public static int MarkAuto(AssistantReply reply, string userText)
    {
        var n = 0;
        foreach (var a in reply.Actions)
        {
            a.Auto = false;
            if (!AutoKinds.Contains(a.Kind) || a.RequireConfirm) continue;
            var named = a.Kind == "stopSounds" ? AsksStopSounds(userText) : Mentioned(a.Target, userText);
            if (!named) continue;
            // Only one start per message step – "Starte A" never starts B and C as well.
            if (a.Kind == "launch" && reply.Actions.Count(x => x.Auto && x.Kind == "launch") > 0) continue;
            a.Auto = true;
            n++;
        }
        // A page is opened only when nothing else runs (otherwise the result would be hidden behind the new page).
        if (reply.Actions.Any(x => x.Auto && x.Kind != "navigate"))
            foreach (var a in reply.Actions.Where(x => x.Kind == "navigate" && x.Auto)) { a.Auto = false; n--; }
        return n;
    }

    // ---------------------------------------------------------------- only gaming

    const string GamingWords = "spiel|game|zock|gaming|steam|epic|xbox|launcher|discord|obs|stream|sound|profil|bingo|challenge|quest|level|xp|fps|ruckel|lag|ping|"
        + "grafik|gpu|cpu|ram|pc|controller|maus|tastatur|headset|mikro|deck|overlay|backlog|wunschliste|deal|key|mod|server|minecraft|clip|aufnahme|screenshot|"
        + "turnier|team|koop|mehrspieler|multiplayer|soundboard|dashboard|startseite|widget|kategorie|favorit|bibliothek|nexus|jarvis|app|seite|design|leiste|wiki|journal|zocken";

    const string OffTopicWords = "e ?mail|mail schreiben|brief|bewerbung|hausaufgabe|referat|aufsatz|steuer|rechnung schreiben|excel|word dokument|powerpoint|"
        + "kochen|rezept|wetter|aktie|boerse|krypto|bitcoin|nachrichten aus|politik|wahl|arzt|krankheit|medikament|diaet|abnehmen|reise buchen|flug|hotel|"
        + "uebersetze|gedicht|liebesbrief|einkaufsliste|termin beim|bank|ueberweis|versicherung|vertrag kuendig|programmier.*(website|app) fuer meine firma";

    /// <summary>Clearly not about gaming or this gaming hub – JARVIS says what he is for instead of answering.</summary>
    public static bool OffTopic(string userText)
    {
        var t = Fold(userText);
        return Regex.IsMatch(t, " (" + OffTopicWords + ")") && !Regex.IsMatch(t, " (" + GamingWords + ")");
    }

    public const string OffTopicReply =
        "Ich bin JARVIS Gaming – ich kümmere mich nur um deine Spiele, deinen Gaming-PC und diese Gaming-Zentrale. " +
        "Dabei helfe ich gern: Spiele starten, Profile einstellen, Sounds abspielen, Startseite und Bibliothek ordnen, Ruckler untersuchen, Bingos und Challenges erstellen.";

    /// <summary>Asks for a change of the app's program code (new feature, new page) – that is not done at runtime.</summary>
    public static bool CodeRequest(string userText) =>
        Regex.IsMatch(Fold(userText), " (programmier|entwickle|code|quellcode|neue (funktion|seite|komponente|backend|feature)|baue? (eine |ein )?(neue|neues) (funktion|seite|feature)|feature (bauen|einbauen)|aender (den|deinen) code) ");

    public const string CodeReply =
        "Neue Funktionen oder Seiten sind Änderungen am Programmcode – die mache ich nicht nebenbei im Chat, und meinen eigenen Code ändere ich nie. " +
        "Dafür gibt es den Entwicklungsweg: Änderung mit Versionskontrolle, Tests und einem neuen Update, das du über die Update-Zentrale installierst. " +
        "Ich kann deinen Wunsch als Entwicklungswunsch notieren. Innerhalb der App (Startseiten, Widgets, Leiste, Kategorien, Profile, Design) ändere ich dagegen direkt, was du sagst.";
}
