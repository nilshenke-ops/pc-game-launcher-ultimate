using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pgl.Core.Assistant;

/// <summary>
/// Assistant without any online service: understands typical commands and questions (German, some English),
/// answers from live data on this PC and from the knowledge base. It only suggests actions; the user taps to run them.
/// </summary>
public sealed class LocalAssistant
{
    readonly AssistantData _d;
    public LocalAssistant(AssistantData data) => _d = data;

    public static readonly string[] Examples =
    {
        "Was kannst du?", "Wie geht es meinem PC?", "Wie lange habe ich diese Woche gespielt?", "Starte Rocket League", "Spiel Sound Airhorn",
        "Profil Streaming aktivieren", "Was läuft gerade?", "Wie richte ich Discord mit dem Soundboard ein?", "Welches Level habe ich?", "Gibt es Deals auf meiner Wunschliste?",
    };

    static bool Has(string text, string pattern) => Regex.IsMatch(text, pattern);
    /// <summary>Removes the given words (pattern like " (a|b) ") and returns what is left – the name the user meant.
    /// Lookarounds keep the spaces, so neighbouring filler words ("spiel sound airhorn") are all removed.</summary>
    static string Rest(string text, string pattern) =>
        Regex.Replace(Regex.Replace(text, "(?<= )" + pattern.Trim() + "(?= )", " "), " {2,}", " ").Trim(' ', '.', '!', '?', ',', '"', '„', '“');

    /// <summary>The words as the user typed them (case, umlauts) for a name found in the folded text.</summary>
    static string Original(string raw, string folded)
    {
        var words = raw.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(w => w.Trim('.', '!', '?', ',', '"', '„', '“')).ToArray();
        for (var from = 0; from < words.Length; from++)
            for (var len = words.Length - from; len >= 1; len--)
            {
                var cand = string.Join(' ', words.Skip(from).Take(len));
                if (KnowledgeBase.Fold(cand) == folded) return cand;
            }
        return folded;
    }

    // One assistant serves all devices at once: per-request state lives in the async flow, not in fields.
    static readonly AsyncLocal<string> RawInput = new();
    static string _raw => RawInput.Value ?? "";

    public async Task<AssistantReply> AnswerAsync(string input)
    {
        var raw = input.Trim();
        RawInput.Value = raw;
        var t = " " + KnowledgeBase.Fold(raw).Replace("?", " ").Replace("!", " ").Replace(",", " ").Replace(".", " ") + " ";
        var question = Has(t, @"^ (wie|was|wo|warum|wieso|weshalb|kann|koennen|gibt|welche|welcher|welches|how|what|why|where|can|does|is) ");

        if (Has(t, @" (hilfe|help|was kannst du|what can you do|befehle|commands) ") && t.Trim().Length < 30) return Help();

        // ---- live data questions (also asked as questions)
        if (Has(t, @" (cpu|prozessor|ram|arbeitsspeicher|gpu|grafikkarte|vram|temperatur|temp|heiss|auslastung|festplatte|speicherplatz|laufwerk) ") || Has(t, @"wie geht es (meinem|dem) pc|pc status|how is my pc"))
            return PcStatus();
        if (Has(t, @" (was|welches spiel|welche spiele|what) (laeuft|lauft|is running|running) ") || Has(t, @" laeuft (gerade|grad) "))
        {
            var r = _d.Running();
            return new AssistantReply { Text = r.Count == 0 ? "Gerade läuft kein Spiel und kein Programm aus deiner Bibliothek." : "Läuft gerade: " + string.Join(", ", r) + ".", Sources = { "Spielerkennung" } };
        }
        if (Has(t, @" (wie lange|wie viel|wieviel|spielzeit|gespielt|played|playtime|stunden) ") && !Has(t, @" (quest|ziel|level|xp) "))
            return PlayTime(t);
        if (Has(t, @" (level|xp|erfolg|erfolge|achievement|quest|quests|ziele|ziel) ") && !Has(t, @" (wie (lege|richte|erstelle)|anlegen|einrichten) "))
            return Quests();
        if (Has(t, @" (deal|deals|angebot|angebote|wunschliste|sale|rabatt|zielpreis|guenstig|preis|preise) ") && !Has(t, @" (wie (richte|stelle)|einrichten|einschalten) "))
            return Deals();
        if (Has(t, @" (benachrichtigung|benachrichtigungen|meldung|meldungen|neuigkeiten|notifications) ") && !question || Has(t, @"was gibt es neues|any news"))
            return Notifications();
        if (Has(t, @" (update|updates|version|aktuell) ") && Has(t, @" (gibt|habe|ist|neue|neueste|welche|aktuell|any|latest) ") && !Has(t, @" (wie|how) (installiere|lade|update)"))
            return Updates();
        if (Has(t, @" (ping|lag|internet|netzwerk|verbindung langsam|wlan|network) ") && Has(t, @" (pruef|teste|test|check|wie ist|wie gut|hab ich|habe ich|mein) "))
            return await Network();

        if (!question)
        {
            // ---- commands
            if (Has(t, @" (stopp|stop|stoppe|halt|beende) (alle |die )?(sounds|sound|toene|musik|alles) ") || Has(t, @" (sounds|sound) (stoppen|aus|stop) "))
                return new AssistantReply { Text = "Soll ich alle laufenden Sounds stoppen?", Actions = { AssistantData.StopSoundsAction() } };

            if (Has(t, @" (sound|ton|soundboard|sfx) "))
            {
                var name = Rest(t, @" (spiel|spiele|play|abspielen|spielen|starte|start|den|der|das|bitte|mal|sound|ton|soundboard|sfx|ab) ");
                return SoundCommand(name);
            }
            if (Has(t, @" (profil|profile) "))
            {
                var name = Rest(t, @" (aktiviere|aktivieren|wechsel|wechsle|zu|zum|auf|das|profil|profile|activate|switch|to|bitte|starte|einschalten|an) ");
                return ProfileCommand(name);
            }
            if (Has(t, @" (quick action|quickaction|aktion|ablauf|fuehre|ausfuehren|run) "))
            {
                var name = Rest(t, @" (fuehre|aus|ausfuehren|quick action|quickaction|die|der|das|aktion|ablauf|run|bitte|starte) ");
                if (AssistantData.Best(name, _d.QuickActions(), q => q.Name) is { } qa)
                    return new AssistantReply { Text = $"Quick Action „{qa.item.Name}“ ({qa.item.Steps.Count} Schritte) ausführen?", Actions = { AssistantData.QuickAction(qa.item) }, Sources = { "Quick Actions" } };
            }
            if (Has(t, @" (oeffne|offne|zeige|zeig|geh zu|gehe zu|navigiere|open|show|go to) "))
            {
                var name = Rest(t, @" (oeffne|offne|zeige|zeig|mir|geh|gehe|zu|zur|zum|navigiere|die|den|das|seite|bereich|open|show|go|to|the|page|bitte|mal) ");
                var page = AssistantData.Best(name, _d.Knowledge.Sections.Where(s => s.Page != null), s => s.Title, 0.7);
                var item = AssistantData.Best(name, _d.Library(), i => i.Name);
                if (page is { } p && (item == null || p.score >= item.Value.score))
                    return new AssistantReply { Text = $"{p.item.Title}: {FirstSentence(p.item.Text)}", Actions = { _d.Navigate(p.item.Page!) }, Sources = { p.item.Title } };
                if (item is { } it) return new AssistantReply { Text = $"„{it.item.Name}“ starten?", Actions = { _d.LaunchAction(it.item) }, Sources = { "Bibliothek" } };
            }
            if (Has(t, @" (starte|start|starten|launch|zocken|spielen|spiel|spiele|play|run) "))
            {
                var name = Rest(t, @" (starte|start|starten|launch|lass uns|ich will|ich moechte|zocken|spielen|spiel|spiele|play|run|bitte|mal|jetzt|das|den|die|ein|eine|game|programm) ");
                var item = name.Length > 0 ? AssistantData.Best(name, _d.Library(), i => i.Name) : null;
                var sound = name.Length > 0 ? AssistantData.Best(name, _d.Sounds(), x => x.Name) : null;
                if (sound is { } sd && (item == null || sd.score > item.Value.score + 0.1)) return new AssistantReply { Text = $"Sound „{sd.item.Name}“ abspielen?", Actions = { AssistantData.SoundAction(sd.item) }, Sources = { "Soundboard" } };
                if (item is { } it)
                    return new AssistantReply { Text = $"„{it.item.Name}“ starten?" + (_d.Running().Contains(it.item.Name) ? " Es läuft bereits." : ""), Actions = { _d.LaunchAction(it.item) }, Sources = { "Bibliothek" } };
                if (name.Length > 0)
                    return new AssistantReply { Text = $"„{Original(_raw, name)}“ habe ich in deiner Bibliothek nicht gefunden. Unter Spiele → „Hinzufügen“ kannst du installierte Spiele übernehmen.", Actions = { _d.Navigate("/games") } };
            }
        }

        // ---- knowledge base
        return Knowledge(raw);
    }

    static string FirstSentence(string text)
    {
        var line = text.Split('\n').FirstOrDefault(l => l.Trim().Length > 0)?.Trim() ?? "";
        var dot = line.IndexOf(". ", StringComparison.Ordinal);
        return dot > 20 ? line[..(dot + 1)] : line;
    }

    AssistantReply Help() => new()
    {
        Text = "Ich bin der lokale Assistent – ich laufe auf deinem PC, ohne Internet und ohne Kosten. Ich kann:\n" +
               "• Spiele und Programme starten, Sounds abspielen, Profile und Quick Actions auslösen (immer erst nach deinem Tippen)\n" +
               "• PC-Werte, laufende Spiele, Spielzeit, Level, Deals, Benachrichtigungen und Updates nennen\n" +
               "• Fragen zur App beantworten: Einrichtung, Discord, Verbindung, Fehlerbehebung, Datenschutz\n" +
               "Für freie Gespräche lässt sich Claude als KI zuschalten (eigener API-Schlüssel, am PC einzutragen).",
        Suggestions = Examples.Skip(1).Take(6).ToList(),
        Sources = { "Assistent" },
    };

    AssistantReply PcStatus()
    {
        var (_, text) = _d.PcStatus();
        var running = _d.Running();
        return new AssistantReply { Text = "Gerade gemessen: " + text + "." + (running.Count > 0 ? " Läuft: " + string.Join(", ", running) + "." : ""), Actions = { _d.Navigate("/monitor") }, Sources = { "PC-Messung (jetzt)" } };
    }

    AssistantReply PlayTime(string t)
    {
        var (period, label) = Has(t, " heute | today ") ? ("today", "heute") : Has(t, " gestern | yesterday ") ? ("yesterday", "gestern")
            : Has(t, " woche | week ") ? ("week", "diese Woche") : Has(t, " monat | month ") ? ("month", "diesen Monat") : ("all", "insgesamt");
        var name = Rest(t, @" (wie|lange|viel|wieviel|habe|hab|ich|du|heute|gestern|diese|dieser|woche|diesen|monat|insgesamt|gespielt|spielzeit|stunden|zeit|in|an|today|yesterday|this|week|month|how|long|did|play|played|playtime|have|meine|mein) ");
        string? itemId = null, game = null;
        if (name.Length >= 2 && AssistantData.Best(name, _d.Library(), i => i.Name, 0.7) is { } hit) { itemId = hit.item.Id; game = hit.item.Name; }
        var (min, n, per) = _d.PlayTime(period, itemId);
        string text;
        if (n == 0) text = $"Für {label} habe ich keine erkannte Spielsitzung" + (game != null ? $" von {game}" : "") + ".";
        else
        {
            text = $"{(game ?? "Insgesamt")} {label}: {AssistantData.Duration(min)} in {n} Sitzung{(n == 1 ? "" : "en")}.";
            if (game == null && per.Count > 1) text += " Am meisten: " + string.Join(", ", per.Take(3).Select(p => $"{p.game} ({AssistantData.Duration(p.minutes)})")) + ".";
        }
        return new AssistantReply { Text = text + " (Gezählt wird nur, was der PC als laufendes Spiel erkannt hat.)", Actions = { _d.Navigate("/history") }, Sources = { "Gaming-Verlauf" } };
    }

    AssistantReply Quests()
    {
        var q = _d.Quests();
        var xp = q.GetProperty("xp").GetInt32(); var level = q.GetProperty("level").GetInt32(); var to = q.GetProperty("levelTo").GetInt32();
        var goals = q.GetProperty("goals").EnumerateArray().ToList();
        var open = goals.Where(g => g.GetProperty("active").GetBoolean() && !g.GetProperty("done").GetBoolean()).Take(3)
            .Select(g => $"{g.GetProperty("title").GetString()} ({g.GetProperty("value").GetDouble().ToString("0.#", CultureInfo.GetCultureInfo("de-DE"))}/{g.GetProperty("target").GetInt32()})").ToList();
        var unlocked = q.GetProperty("achievements").EnumerateArray().Count(a => a.GetProperty("unlocked").GetBoolean());
        var text = $"Level {level} mit {xp} XP – noch {to - xp} XP bis Level {level + 1}. Erfolge: {unlocked}/8.";
        text += goals.Count == 0 ? " Du hast noch keine Ziele angelegt." : open.Count == 0 ? " Alle aktiven Ziele sind für diesen Zeitraum erreicht." : " Offen: " + string.Join(", ", open) + ".";
        return new AssistantReply { Text = text, Actions = { _d.Navigate("/quests") }, Sources = { "GameQuest" } };
    }

    AssistantReply Deals()
    {
        var d = _d.Deals();
        var items = d.GetProperty("items").EnumerateArray().ToList();
        if (items.Count == 0) return new AssistantReply { Text = "Deine Wunschliste ist leer.", Actions = { _d.Navigate("/deals") }, Sources = { "Deal Radar" } };
        var de = CultureInfo.GetCultureInfo("de-DE");
        string Money(JsonElement e, string prop) => e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number ? (v.GetInt32() / 100.0).ToString("0.00", de) + " " + (e.TryGetProperty("currency", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : "€") : "–";
        var hits = items.Where(i => i.TryGetProperty("targetCents", out var tc) && tc.ValueKind == JsonValueKind.Number && i.TryGetProperty("finalCents", out var fc) && fc.ValueKind == JsonValueKind.Number && fc.GetInt32() <= tc.GetInt32()).ToList();
        var text = !d.GetProperty("enabled").GetBoolean() ? $"{items.Count} Spiele auf der Wunschliste. Die Preisabfrage ist aus – deshalb kenne ich keine aktuellen Preise."
            : hits.Count > 0 ? "Zielpreis erreicht: " + string.Join(", ", hits.Select(h => $"{h.GetProperty("title").GetString()} für {Money(h, "finalCents")}")) + "."
            : $"Noch kein Spiel auf deiner Wunschliste ({items.Count}) hat den Zielpreis erreicht. " + string.Join(", ", items.Take(3).Select(i => $"{i.GetProperty("title").GetString()}: {Money(i, "finalCents")}")) + ".";
        if (d.GetProperty("lastRunAt").ValueKind == JsonValueKind.String) text += $" Stand: {d.GetProperty("lastRunAt").GetDateTime().ToLocalTime():dd.MM. HH:mm} (Steam-Shop).";
        return new AssistantReply { Text = text, Actions = { _d.Navigate("/deals") }, Sources = { "Deal Radar" } };
    }

    AssistantReply Notifications()
    {
        var n = _d.Notifications();
        return new AssistantReply { Text = n.Count == 0 ? "Keine offenen Benachrichtigungen." : "Neueste Meldungen: " + string.Join(" · ", n.Take(4).Select(x => x.Title + (x.Message is { Length: > 0 } m ? $" ({m})" : ""))), Actions = { _d.Navigate("/notifications") }, Sources = { "Benachrichtigungen" } };
    }

    AssistantReply Updates()
    {
        var u = JsonSerializer.SerializeToElement(_d.UpdateInfo(), Infrastructure.Json.Options);
        var cur = u.GetProperty("current").GetString();
        var avail = u.TryGetProperty("available", out var a) && a.ValueKind == JsonValueKind.Object && a.TryGetProperty("version", out var v) ? v.GetString() : null;
        var text = avail != null && avail != cur ? $"Installiert ist {cur}, verfügbar ist {avail}. Installieren kannst du unter Updates & Versionen – es wird nie automatisch installiert."
            : $"Installiert ist Version {cur}." + (u.TryGetProperty("checkedAt", out var c) && c.ValueKind == JsonValueKind.String ? $" Zuletzt geprüft {c.GetDateTime().ToLocalTime():dd.MM. HH:mm}, kein neueres Update gefunden." : " Noch nicht geprüft.");
        return new AssistantReply { Text = text, Actions = { _d.Navigate("/updates") }, Sources = { "Updates" } };
    }

    async Task<AssistantReply> Network()
    {
        var r = await _d.NetworkCheck();
        var checks = r.TryGetProperty("checks", out var c) ? c.EnumerateArray().ToList() : new();
        var bad = checks.Where(x => x.GetProperty("status").GetString() != "ok").ToList();
        var text = checks.Count == 0 ? "Die Netzwerkprüfung lieferte keine Werte."
            : bad.Count == 0 ? "Netzwerk sieht gut aus: " + string.Join(" · ", checks.Select(x => $"{x.GetProperty("label").GetString()}: {x.GetProperty("detail").GetString()}")) + "."
            : "Auffällig: " + string.Join(" · ", bad.Select(x => $"{x.GetProperty("label").GetString()} – {x.GetProperty("detail").GetString()}" + (x.TryGetProperty("fix", out var f) && f.ValueKind == JsonValueKind.String ? $" Tipp: {f.GetString()}" : "")));
        return new AssistantReply { Text = text + " Für Ping-Verlauf und Paketverlust zu deinem Spiel-Server: Netzwerkdiagnose.", Actions = { _d.Navigate("/network") }, Sources = { "Netzwerkprüfung (jetzt)" } };
    }

    AssistantReply SoundCommand(string name)
    {
        if (name.Length == 0) return new AssistantReply { Text = "Welchen Sound? Sag zum Beispiel „Spiel Sound Airhorn“.", Actions = { _d.Navigate("/soundboard") } };
        if (AssistantData.Best(name, _d.Sounds(), x => x.Name) is { } hit)
            return new AssistantReply { Text = $"Sound „{hit.item.Name}“ abspielen?", Actions = { AssistantData.SoundAction(hit.item) }, Sources = { "Soundboard" } };
        return new AssistantReply { Text = $"Einen Sound „{Original(_raw, name)}“ finde ich nicht.", Actions = { _d.Navigate("/soundboard") }, Suggestions = _d.Sounds().Take(4).Select(x => $"Spiel Sound {x.Name}").ToList() };
    }

    AssistantReply ProfileCommand(string name)
    {
        var p = _d.Profiles();
        if (name.Length > 0 && AssistantData.Best(name, p.Profiles, x => x.Name) is { } hit)
            return new AssistantReply { Text = hit.item.Id == p.ActiveProfileId ? $"„{hit.item.Name}“ ist bereits aktiv." : $"Profil „{hit.item.Name}“ aktivieren?", Actions = { AssistantData.ProfileAction(hit.item) }, Sources = { "Gaming-Profile" } };
        var active = p.Profiles.FirstOrDefault(x => x.Id == p.ActiveProfileId)?.Name;
        return new AssistantReply
        {
            Text = (name.Length > 0 ? $"Ein Profil „{Original(_raw, name)}“ gibt es nicht. " : "") + (p.Profiles.Count == 0 ? "Du hast noch keine Profile." : $"Profile: {string.Join(", ", p.Profiles.Select(x => x.Name))}." + (active != null ? $" Aktiv: {active}." : "")),
            Actions = { _d.Navigate("/profiles") }, Sources = { "Gaming-Profile" },
        };
    }

    AssistantReply Knowledge(string raw)
    {
        var hits = _d.Knowledge.Search(raw, 3);
        if (hits.Count == 0 || hits[0].score < 2.5)
        {
            return new AssistantReply
            {
                Confident = false,
                Text = "Das habe ich nicht verstanden. Ich kenne Befehle wie „Starte …“, „Spiel Sound …“, „Profil …“ und Fragen zur App, zu deinem PC und deiner Spielzeit." ,
                Suggestions = Examples.Take(5).ToList(),
            };
        }
        var top = hits[0].section;
        var reply = new AssistantReply { Text = top.Text, Sources = { $"{top.Source}: {top.Title}" }, Confident = hits[0].score >= 5 };
        if (top.Page != null) reply.Actions.Add(_d.Navigate(top.Page));
        foreach (var (s, score) in hits.Skip(1).Where(h => h.score >= hits[0].score * 0.6))
            reply.Suggestions.Add(s.Title.EndsWith('?') ? s.Title : $"Mehr zu: {s.Title}");
        return reply;
    }
}
