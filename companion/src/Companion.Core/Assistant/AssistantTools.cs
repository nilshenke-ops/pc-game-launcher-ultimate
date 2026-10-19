using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

/// <summary>A tool the AI may call: name, description and JSON schema of the input (provider-neutral).</summary>
public sealed record ToolDef(string Name, string Description, Dictionary<string, JsonElement> Properties, string[] Required)
{
    public JsonElement Schema => JsonSerializer.SerializeToElement(new { type = "object", properties = Properties, required = Required });
}

/// <summary>
/// The tools an AI provider (Claude or a local model) can use: read live data from this PC and suggest actions as buttons.
/// Nothing here runs an action – suggestions are only executed when the user taps them, with that device's permissions.
/// </summary>
public sealed class AssistantTools
{
    readonly AssistantData _d;
    public AssistantTools(AssistantData data) => _d = data;

    static ToolDef Tool(string name, string description, object? properties = null, string[]? required = null) =>
        new(name, description, properties == null ? new Dictionary<string, JsonElement>() : JsonSerializer.SerializeToElement(properties).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone()), required ?? Array.Empty<string>());

    static readonly object Query = new { query = new { type = "string", description = "Optionaler Suchbegriff (Name, auch ungefähr)" } };

    public static readonly ToolDef[] All =
    {
        Tool("get_pc_status", "Misst jetzt CPU, RAM, GPU, Temperaturen (wenn verfügbar), Laufwerke und zeigt laufende Spiele."),
        Tool("search_library", "Spiele und Programme der Bibliothek (Id, Name, Quelle, Favorit, läuft).", Query),
        Tool("list_sounds", "Sounds im Soundboard und was gerade spielt.", Query),
        Tool("list_profiles_and_actions", "Gaming-Profile (aktives Profil), Quick Actions, aktive Hotkeys und Automatisierungen."),
        Tool("get_play_time", "Erkannte Spielzeit in einem Zeitraum, optional für ein Spiel.",
            new { period = new { type = "string", @enum = new[] { "today", "yesterday", "week", "month", "all" } }, game = new { type = "string", description = "Spielname (optional)" } }, new[] { "period" }),
        Tool("get_quests", "GameQuest: XP, Level, Ziele mit Fortschritt, Erfolge, Match-Statistik."),
        Tool("get_deals", "Deal Radar: Wunschliste mit Zielpreisen, letzten Steam-Preisen und ob die Preisabfrage an ist."),
        Tool("get_notifications", "Die neuesten Benachrichtigungen des PCs."),
        Tool("check_network", "Führt jetzt die Netzwerkprüfung aus (WLAN-Adresse, Router-Ping, DNS, Internet, Relay)."),
        Tool("get_updates", "Installierte und verfügbare Version des Begleiters."),
        Tool("get_settings", "Wichtige Einstellungen (ohne Geheimnisse), Version, Plattform, Funktionen, Anzahl Geräte."),
        Tool("search_help", "Durchsucht Wissensbasis, Fehlerbehebung und Datenschutz nach einem Thema.", new { query = new { type = "string" } }, new[] { "query" }),
        Tool("suggest_action", "Zeigt dem Nutzer einen Knopf für eine Aktion. Der Nutzer muss tippen; nichts wird automatisch ausgeführt.",
            new
            {
                kind = new { type = "string", @enum = new[] { "launch", "sound", "stop_sounds", "profile", "quick_action", "open_page" } },
                target = new { type = "string", description = "Name oder Id (Spiel, Sound, Profil, Quick Action) bzw. Seitenpfad wie /deals. Bei stop_sounds leer." },
            }, new[] { "kind" }),
        Tool("suggest_goal", "Schlägt ein neues GameQuest-Ziel vor (Knopf zum Anlegen).",
            new
            {
                title = new { type = "string" }, kind = new { type = "string", @enum = new[] { "playtime", "sessions", "wins", "matches" } },
                period = new { type = "string", @enum = new[] { "daily", "weekly", "once" } }, target = new { type = "integer", description = "Minuten bei playtime, sonst Anzahl" },
                game = new { type = "string", description = "Spielname (optional, sonst alle Spiele)" },
            }, new[] { "title", "kind", "period", "target" }),
        Tool("suggest_wish", "Schlägt vor, ein Spiel auf die Deal-Radar-Wunschliste zu setzen (Knopf).",
            new { title = new { type = "string" }, steamAppId = new { type = "string", description = "Steam-App-ID, nur wenn sicher bekannt" }, targetEuro = new { type = "number" } }, new[] { "title" }),
    };

    public static string? Str(IReadOnlyDictionary<string, JsonElement> input, string key) => input.TryGetValue(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    static string Json(object o) => JsonSerializer.Serialize(o, Infrastructure.Json.Options);

    public async Task<string> RunAsync(string name, IReadOnlyDictionary<string, JsonElement> input, AssistantReply reply)
    {
        void Src(string s) { if (!reply.Sources.Contains(s)) reply.Sources.Add(s); }
        switch (name)
        {
            case "get_pc_status": Src("PC-Messung (jetzt)"); return Json(_d.PcStatusObject());
            case "search_library": Src("Bibliothek"); return Json(_d.LibrarySummary(Str(input, "query")));
            case "list_sounds": Src("Soundboard"); return Json(_d.SoundsSummary(Str(input, "query")));
            case "list_profiles_and_actions": Src("Profile & Quick Actions"); return Json(_d.ProfilesAndActions());
            case "get_play_time": Src("Gaming-Verlauf"); return Json(_d.PlayTimeObject(Str(input, "period") ?? "week", Str(input, "game")));
            case "get_quests": Src("GameQuest"); return _d.Quests().GetRawText();
            case "get_deals": Src("Deal Radar"); return _d.Deals().GetRawText();
            case "get_notifications": Src("Benachrichtigungen"); return Json(_d.Notifications().Select(n => new { n.Title, n.Message, severity = n.Severity.ToString(), n.At, n.Count }));
            case "check_network": Src("Netzwerkprüfung (jetzt)"); return (await _d.NetworkCheck()).GetRawText();
            case "get_updates": Src("Updates"); return Json(_d.UpdateInfo());
            case "get_settings": Src("Einstellungen"); return Json(_d.SettingsOverview());
            case "search_help":
            {
                var hits = _d.Knowledge.Search(Str(input, "query") ?? "", 3);
                foreach (var h in hits) Src($"{h.section.Source}: {h.section.Title}");
                return hits.Count == 0 ? "Nichts gefunden." : string.Join("\n\n", hits.Select(h => $"## {h.section.Title}" + (h.section.Page != null ? $" (Seite {h.section.Page})" : "") + "\n" + h.section.Text));
            }
            case "suggest_action": return SuggestAction(Str(input, "kind") ?? "", Str(input, "target") ?? "", reply);
            case "suggest_goal": return SuggestGoal(input, reply);
            case "suggest_wish": return SuggestWish(input, reply);
            default: throw new RpcException("unknown-tool", $"Unbekanntes Werkzeug {name}");
        }
    }

    string Add(AssistantReply reply, AssistantAction a)
    {
        if (reply.Actions.Count >= 6) return "Es sind schon genug Knöpfe angezeigt.";
        if (!reply.Actions.Any(x => x.Label == a.Label)) reply.Actions.Add(a);
        return $"Knopf „{a.Label}“ wird angezeigt. Ausgeführt wird erst, wenn der Nutzer tippt.";
    }

    string SuggestAction(string kind, string target, AssistantReply reply)
    {
        static T? ById<T>(IEnumerable<T> items, Func<T, string> id, string target) where T : class => items.FirstOrDefault(i => id(i) == target);
        switch (kind)
        {
            case "launch":
                var item = ById(_d.Library(), i => i.Id, target) ?? AssistantData.Best(target, _d.Library(), i => i.Name)?.item;
                return item == null ? $"Kein Spiel/Programm „{target}“ in der Bibliothek." : Add(reply, _d.LaunchAction(item));
            case "sound":
                var s = ById(_d.Sounds(), x => x.Id, target) ?? AssistantData.Best(target, _d.Sounds(), x => x.Name)?.item;
                return s == null ? $"Kein Sound „{target}“." : Add(reply, AssistantData.SoundAction(s));
            case "stop_sounds": return Add(reply, AssistantData.StopSoundsAction());
            case "profile":
                var profiles = _d.Profiles().Profiles;
                var pr = ById(profiles, x => x.Id, target) ?? AssistantData.Best(target, profiles, x => x.Name)?.item;
                return pr == null ? $"Kein Profil „{target}“." : Add(reply, AssistantData.ProfileAction(pr));
            case "quick_action":
                var q = ById(_d.QuickActions(), x => x.Id, target) ?? AssistantData.Best(target, _d.QuickActions(), x => x.Name)?.item;
                return q == null ? $"Keine Quick Action „{target}“." : Add(reply, AssistantData.QuickAction(q));
            case "open_page":
                var path = target.Split('?')[0];
                var section = _d.Knowledge.Sections.FirstOrDefault(x => x.Page != null && x.Page.Split('?')[0] == path)
                    ?? AssistantData.Best(target, _d.Knowledge.Sections.Where(x => x.Page != null), x => x.Title, 0.7)?.item;
                return section == null ? $"Keine Seite „{target}“." : Add(reply, _d.Navigate(section.Page!));
            default: return $"Unbekannte Aktion „{kind}“.";
        }
    }

    string SuggestGoal(IReadOnlyDictionary<string, JsonElement> input, AssistantReply reply)
    {
        var kind = Str(input, "kind") ?? "playtime"; var period = Str(input, "period") ?? "weekly";
        if (!Services.QuestService.Kinds.Contains(kind) || !Services.QuestService.Periods.Contains(period)) return "Ungültige Art oder Zeitraum.";
        var target = input.TryGetValue("target", out var tv) && tv.TryGetInt32(out var n) ? Math.Clamp(n, 1, 100_000) : 1;
        string? itemId = null;
        if (Str(input, "game") is { Length: > 0 } game)
        {
            if (AssistantData.Best(game, _d.Library(), i => i.Name) is not { } hit) return $"Kein Spiel „{game}“ in der Bibliothek.";
            itemId = hit.item.Id;
        }
        var title = DeviceStoreSanitize(Str(input, "title") ?? "Ziel", 60);
        return Add(reply, new AssistantAction
        {
            Kind = "goal", Label = $"Ziel „{title}“ anlegen", Method = "quests.saveGoal",
            Params = { ["id"] = Ids.New("goal"), ["title"] = title, ["kind"] = kind, ["period"] = period, ["target"] = target, ["itemId"] = itemId, ["active"] = true },
        });
    }

    string SuggestWish(IReadOnlyDictionary<string, JsonElement> input, AssistantReply reply)
    {
        var title = DeviceStoreSanitize(Str(input, "title") ?? "Spiel", 80);
        var appId = Str(input, "steamAppId") is { } a && System.Text.RegularExpressions.Regex.IsMatch(a, "^[0-9]{1,10}$") ? a : null;
        int? cents = input.TryGetValue("targetEuro", out var te) && te.TryGetDouble(out var eur) && eur is > 0 and < 10000 ? (int)Math.Round(eur * 100) : null;
        return Add(reply, new AssistantAction
        {
            Kind = "wish", Label = $"„{title}“ auf die Wunschliste", Method = "deals.save",
            Params = { ["id"] = Ids.New("wish"), ["title"] = title, ["steamAppId"] = appId, ["targetCents"] = cents },
        });
    }

    static string DeviceStoreSanitize(string s, int max) => Security.DeviceStore.Sanitize(s, max, "Eintrag");
}
