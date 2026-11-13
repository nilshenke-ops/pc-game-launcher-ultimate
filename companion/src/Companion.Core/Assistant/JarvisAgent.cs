using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Hosting;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Security;
using Pgl.Core.Services;

namespace Pgl.Core.Assistant;

// JARVIS 3.0 – the control centre (3.59). Bigger requests become a plan of the app's own, fixed actions: shown first, every step
// can be switched off or changed, nothing runs before the person confirms. Diagnoses use only what the PC really measures and
// says where each value comes from. No AI decides what runs: the plans are built from fixed rules and the person's own data, so
// a sentence in a web page, a game name or a document can never add a step. Every run lands in a history the person can search
// and delete; secrets never go into it.

public sealed record AgentOption(string Ref, string Label);

public sealed class AgentStep
{
    public string Id { get; set; } = "";
    /// <summary>check-pc, check-game, check-programs, check-audio, check-network, check-updates, check-crashes, launch, profile,
    /// audio-voice, audio-reset, close, automation, verify.</summary>
    public string Kind { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Detail { get; set; }
    /// <summary>read = only looks, prepare = shows/creates nothing on the PC yet, execute = starts or switches something,
    /// critical = changes Windows settings or closes programs (always needs its own tick).</summary>
    public string Tier { get; set; } = "read";
    /// <summary>The device permission this step needs (view, launch, manage).</summary>
    public string Permission { get; set; } = Permissions.View;
    public string? Ref { get; set; }
    public List<AgentOption> Options { get; set; } = new();
    public bool Selected { get; set; } = true;
    /// <summary>planned, skipped, running, done, failed, cancelled, refused.</summary>
    public string Status { get; set; } = "planned";
    public string? Result { get; set; }
    public bool? Ok { get; set; }
    public long? Ms { get; set; }
    /// <summary>For the automation step: the rule that would be saved.</summary>
    public AutomationRule? Rule { get; set; }
}

public sealed class AgentFinding
{
    /// <summary>problem, warn, info, ok.</summary>
    public string Severity { get; set; } = "info";
    public string Title { get; set; } = "";
    /// <summary>What was measured or read, in words – the reason for the finding.</summary>
    public string Evidence { get; set; } = "";
    public string Source { get; set; } = "";
    public string? Advice { get; set; }
    public string? Page { get; set; }
}

public sealed class AgentTask
{
    public string Id { get; set; } = "";
    /// <summary>prepare, diagnose, workflow.</summary>
    public string Kind { get; set; } = "";
    public string? Topic { get; set; }
    /// <summary>The request in the person's words – only kept when the history may keep requests (and cleaned of secrets).</summary>
    public string? Request { get; set; }
    public string? Page { get; set; }
    public string By { get; set; } = "";
    public string Owner { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public string Model { get; set; } = JarvisAgent.BuiltIn;
    public double CostUsd { get; set; }
    /// <summary>planned, running, done, failed, cancelled.</summary>
    public string State { get; set; } = "planned";
    public string Summary { get; set; } = "";
    public List<AgentStep> Steps { get; set; } = new();
    public List<AgentFinding> Findings { get; set; } = new();
    /// <summary>Problems counted before the fixes and after the check (diagnoses only).</summary>
    public int? ProblemsBefore { get; set; }
    public int? ProblemsAfter { get; set; }
}

public sealed class AgentHistoryFile
{
    public List<AgentTask> Tasks { get; set; } = new();
    /// <summary>Keep finished tasks at all (off = only the current task lives, nothing is written).</summary>
    public bool Keep { get; set; } = true;
    /// <summary>Keep the request text (off = only kind, steps and results).</summary>
    public bool KeepRequests { get; set; } = true;
}

public sealed class JarvisAgent
{
    public const string BuiltIn = "Fest eingebaut (ohne KI)";
    const int MaxTasks = 200;
    static readonly CultureInfo De = new("de-DE");
    const double GB = 1073741824.0;

    readonly CompanionServices _s;
    readonly JsonStore<AgentHistoryFile> _store;
    readonly Dictionary<string, AgentTask> _open = new();
    readonly Dictionary<string, CancellationTokenSource> _running = new();
    readonly object _lock = new();
    readonly Func<DateTime> _now;

    public JarvisAgent(CompanionServices s, AppPaths paths, Func<DateTime>? now = null)
    {
        _s = s;
        _store = new JsonStore<AgentHistoryFile>(paths.File("jarvis-tasks.json"));
        _now = now ?? (() => DateTime.UtcNow);
    }

    // ================================================================ understanding the request

    static string Fold(string s) => " " + Regex.Replace(KnowledgeBase.Fold(s), "[^a-z0-9]+", " ").Trim() + " ";

    static readonly Regex PrepareRx = new(" (bereite|bereit machen|vorbereit|startklar|klar machen|gaming session|zock session|zocksession|session vor|runde vor|fuer eine runde|fertig machen fuer) ");
    static readonly Regex DiagnoseRx = new(" (warum|wieso|weshalb|funktioniert nicht|funktioniert .* nicht|geht nicht|geht .* nicht|klappt nicht|kaputt|problem|probleme|fehler|hoert mich nicht|hoeren mich nicht|hoert mich niemand|ruckel|ruckelt|laggt|lagt|stottert|langsam|abgestuerzt|stuerzt ab|crash|keine verbindung|diagnose|ueberpruef|pruef mal|check mal|untersuche) ");
    static readonly Regex WorkflowRx = new("^ wenn ich (.+?) starte (.+)$");

    static string? TopicOf(string f) =>
        Regex.IsMatch(f, " (sound|soundboard|audio|mikro|mikrofon|headset|discord|hoert mich|hoeren mich|ton|lautsprecher|kabel) ") ? "audio"
        : Regex.IsMatch(f, " (netz|netzwerk|internet|wlan|ping|verbindung|relay|handy verbind|lan|router|dns) ") ? "network"
        : Regex.IsMatch(f, " (ruckel|ruckelt|lag|laggt|lagt|stottert|langsam|fps|gpu|cpu|ram|arbeitsspeicher|grafikkarte|prozessor|heiss|temperatur|auslastung|performance|leistung) ") ? "performance"
        : Regex.IsMatch(f, " (update|aktualisier|version) ") ? "updates"
        : Regex.IsMatch(f, " (absturz|abgestuerzt|stuerzt|crash|crasht|schliesst sich) ") ? "crashes"
        : null;

    /// <summary>Which area the page belongs to – "warum geht das nicht?" in the audio center is about audio.</summary>
    public static string? TopicOfPage(string? page)
    {
        var p = (page ?? "").Split('?')[0].ToLowerInvariant();
        return p.StartsWith("/audio") || p.StartsWith("/sound") || p.StartsWith("/voice") ? "audio"
            : p.StartsWith("/network") || p.StartsWith("/ping") || p.StartsWith("/connect") || p.StartsWith("/devices") ? "network"
            : p.StartsWith("/monitor") || p.StartsWith("/performance") || p.StartsWith("/pc") ? "performance"
            : p.StartsWith("/update") ? "updates"
            : p.StartsWith("/crash") ? "crashes"
            : null;
    }

    static readonly Regex GeneralCheckRx = new(" (diagnose|pruef(e)? (mal )?(meinen|den) pc|check (mal )?(meinen|den) pc|untersuche (meinen|den) pc|was stimmt nicht mit meinem pc) ");
    static readonly Regex BrokenRx = new(" (funktioniert nicht|funktioniert .* nicht|geht nicht|geht .* nicht|klappt nicht|kaputt|problem|probleme|fehler) ");

    /// <summary>
    /// A request for the control centre (null = an ordinary question for the chat). A diagnosis needs a technical topic –
    /// "Warum ist Elden Ring so schwer?" stays a question; "warum geht das nicht?" counts only on a page with a topic.
    /// </summary>
    public static string? KindOf(string text, string? page = null)
    {
        var f = Fold(text);
        if (WorkflowRx.IsMatch(f)) return "workflow";
        if (PrepareRx.IsMatch(f)) return "prepare";
        if (GeneralCheckRx.IsMatch(f)) return "diagnose";
        if (DiagnoseRx.IsMatch(f) && (TopicOf(f) != null || (BrokenRx.IsMatch(f) && TopicOfPage(page) != null))) return "diagnose";
        return null;
    }

    // ================================================================ planning

    /// <summary>Builds the plan (and, for a diagnosis, reads the current values). Null = not a control-centre request.</summary>
    public async Task<AgentTask?> PlanAsync(string text, string? page, string owner, string who, CancellationToken ct = default)
    {
        var kind = KindOf(text, page);
        if (kind == null) return null;
        var task = new AgentTask { Id = Ids.New("task"), Kind = kind, Page = SafePage(page), Owner = owner, By = who, CreatedAt = _now(), Request = text };
        switch (kind)
        {
            case "prepare": PlanPrepare(task, text); break;
            case "workflow": PlanWorkflow(task, text); break;
            default:
                task.Topic = TopicOf(Fold(text)) ?? TopicOfPage(page) ?? "general";
                await DiagnoseAsync(task, ct);
                break;
        }
        lock (_lock)
        {
            _open[task.Id] = task;
            foreach (var old in _open.Values.Where(x => x.State == "planned" && _now() - x.CreatedAt > TimeSpan.FromHours(2)).Select(x => x.Id).ToList()) _open.Remove(old);
        }
        Record(task);
        Publish(task);
        return task;
    }

    static string? SafePage(string? page) => page != null && Regex.IsMatch(page, "^/[a-zA-Z0-9/_-]{0,60}$") ? page : null;

    static int _n;
    static string StepId() => "s" + Interlocked.Increment(ref _n).ToString(CultureInfo.InvariantCulture);

    static AgentStep Step(string kind, string title, string tier = "read", string perm = Permissions.View, string? @ref = null, string? detail = null, bool selected = true) =>
        new() { Id = StepId(), Kind = kind, Title = title, Tier = tier, Permission = perm, Ref = @ref, Detail = detail, Selected = selected };

    /// <summary>The library entry the person named (longest name wins: "Counter-Strike 2" over "Counter").</summary>
    LibraryItem? Named(string text, ItemKind? kind = null) =>
        _s.Library.List().Where(i => kind == null || i.Kind == kind).Where(i => Jarvis.Mentioned(i.Name, text))
            .OrderByDescending(i => i.Name.Length).FirstOrDefault();

    void PlanPrepare(AgentTask task, string text)
    {
        var game = Named(text, ItemKind.Game);
        var profiles = _s.Profiles.Get();
        task.Steps.Add(Step("check-pc", "PC-Zustand prüfen", detail: "Auslastung, Arbeitsspeicher, Temperaturen und freier Speicher – so wie der PC sie misst."));
        if (game != null)
            task.Steps.Add(Step("check-game", $"Prüfen, ob „{game.Name}“ bereit ist", @ref: game.Id, detail: "In der Bibliothek, Startweg gültig, läuft es schon?"));
        task.Steps.Add(Step("check-programs", "Hintergrundprogramme anzeigen", detail: "Was gerade am meisten Arbeitsspeicher braucht, und was der Spielmodus beim Start schließen würde."));
        task.Steps.Add(Step("check-audio", "Audio prüfen", detail: "Geräte, Soundboard-Weg und ob deine Stimme in Discord ankommt."));
        task.Steps.Add(Step("check-network", "Verbindung prüfen", detail: "Router, DNS, Internet und die Verbindung zum Handy."));
        // Programs the person named ("… mit Discord und Steam") are offered for starting – nothing else.
        foreach (var prog in _s.Library.List().Where(i => i.Kind == ItemKind.Program && Jarvis.Mentioned(i.Name, text)).Take(3))
            task.Steps.Add(Step("launch", $"„{prog.Name}“ öffnen", "execute", Permissions.Launch, prog.Id));
        var profileId = game != null ? CompanionServices.ProfileFor(game, profiles) : null;
        var named = AssistantData.Best(text, profiles.Profiles, p => p.Name, 0.8)?.item ?? profiles.Profiles.FirstOrDefault(p => Jarvis.Mentioned(p.Name, text));
        var chosen = named?.Id ?? profileId;
        var profileStep = Step("profile", chosen != null ? $"Profil „{profiles.Profiles.First(p => p.Id == chosen).Name}“ aktivieren" : "Gaming-Profil aktivieren", "execute", Permissions.Launch,
            chosen ?? profiles.ActiveProfileId, chosen != null ? (named != null ? "Du hast es genannt." : "Dieses Profil gehört zum Spiel.") : "Kein Profil ist dem Spiel zugeordnet – wähle eins oder lass den Schritt aus.",
            selected: chosen != null && chosen != profiles.ActiveProfileId);
        profileStep.Options = profiles.Profiles.Select(p => new AgentOption(p.Id, p.Name + (p.Id == profiles.ActiveProfileId ? " (aktiv)" : ""))).ToList();
        task.Steps.Add(profileStep);
        if (game != null)
            task.Steps.Add(Step("launch", $"„{game.Name}“ starten", "execute", Permissions.Launch, game.Id, "Als letzter Schritt, nachdem alles geprüft ist."));
        else
        {
            var h = _s.History.Export();
            var last = h.Sessions.Select(x => (x.ItemId, At: x.StartedAt)).Concat(h.Launches.Where(l => l.Ok).Select(l => (l.ItemId, l.At)))
                .GroupBy(x => x.ItemId).ToDictionary(g => g.Key, g => g.Max(x => x.At));
            var recent = _s.Library.List().Where(i => i.Kind == ItemKind.Game && last.ContainsKey(i.Id)).OrderByDescending(i => last[i.Id]).Take(8).ToList();
            if (recent.Count > 0)
            {
                var st = Step("launch", "Spiel starten", "execute", Permissions.Launch, recent[0].Id, "Kein Spiel genannt – vorgeschlagen ist das zuletzt gestartete. Du kannst ein anderes wählen.", selected: false);
                st.Options = recent.Select(i => new AgentOption(i.Id, i.Name)).ToList();
                st.Title = $"„{recent[0].Name}“ starten";
                task.Steps.Add(st);
            }
        }
        task.Summary = game != null ? $"Plan für eine Runde „{game.Name}“ – erst prüfen, dann nach deiner Bestätigung starten." : "Plan für eine Gaming-Session – erst prüfen, dann nach deiner Bestätigung starten.";
    }

    void PlanWorkflow(AgentTask task, string text)
    {
        var f = Fold(text);
        var m = WorkflowRx.Match(f);
        var trigger = Named(" " + m.Groups[1].Value + " ");
        if (trigger == null) { task.Summary = "Welches Spiel oder Programm meinst du? Ich finde es nicht in deiner Bibliothek."; task.State = "failed"; return; }
        var rest = " " + m.Groups[2].Value + " ";
        var actions = new List<ActionStep>();
        var parts = new List<string>();
        foreach (var item in _s.Library.List().Where(i => i.Id != trigger.Id && Jarvis.Mentioned(i.Name, rest)).Take(3))
        { actions.Add(new ActionStep { Type = StepType.LaunchItem, Ref = item.Id }); parts.Add($"„{item.Name}“ öffnen"); }
        var profiles = _s.Profiles.Get().Profiles;
        var prof = Regex.IsMatch(rest, " (profil|aktivier|wechsel) ")
            ? profiles.FirstOrDefault(p => Jarvis.Mentioned(p.Name, rest)) ?? (CompanionServices.ProfileFor(trigger, _s.Profiles.Get()) is { } pid ? profiles.FirstOrDefault(p => p.Id == pid) : null)
            : null;
        if (prof != null) { actions.Add(new ActionStep { Type = StepType.ActivateProfile, Ref = prof.Id }); parts.Add($"Profil „{prof.Name}“ aktivieren"); }
        if (actions.Count == 0) { task.Summary = "Was soll dann passieren? Ich verstehe „öffne …“ (aus deiner Bibliothek) und „aktiviere Profil …“."; task.State = "failed"; return; }
        var trig = trigger.Kind == ItemKind.Game ? TriggerType.GameStarted : TriggerType.ProgramStarted;
        var rule = new AutomationRule { Name = $"JARVIS: {trigger.Name} → " + string.Join(", ", parts), Trigger = trig, TriggerRef = trigger.Id, Actions = actions };
        // The same rule twice would run everything twice – say so instead.
        var same = _s.Automations.List().FirstOrDefault(r => r.Trigger == rule.Trigger && r.TriggerRef == rule.TriggerRef
            && r.Actions.Select(a => (a.Type, a.Ref)).SequenceEqual(rule.Actions.Select(a => (a.Type, a.Ref))));
        var st = Step("automation", "Automatisierung anlegen", "execute", Permissions.Manage,
            detail: $"Wenn „{trigger.Name}“ startet: " + string.Join(", dann ", parts) + ". Sie steht danach unter Automatisierungen und lässt sich dort ändern oder ausschalten.");
        st.Rule = rule;
        if (same != null) { st.Selected = false; st.Detail = $"Diese Automatisierung gibt es schon („{same.Name}“) – sie wird nicht doppelt angelegt."; }
        task.Steps.Add(st);
        task.Summary = same != null ? "Das ist schon eingerichtet." : "Ich lege dafür eine Automatisierung an – mit den vorhandenen Automatisierungen, kein zweites System.";
    }

    // ================================================================ diagnosis (only real values)

    async Task DiagnoseAsync(AgentTask task, CancellationToken ct)
    {
        task.Findings.Clear();
        foreach (var st in task.Steps.Where(x => x.Kind is "audio-voice" or "audio-reset" or "close" or "verify").ToList()) task.Steps.Remove(st);
        switch (task.Topic)
        {
            case "audio": DiagnoseAudio(task); break;
            case "network": await DiagnoseNetwork(task); break;
            case "performance": await DiagnosePerformance(task, ct); break;
            case "updates": DiagnoseUpdates(task); break;
            case "crashes": DiagnoseCrashes(task); break;
            default:
                DiagnoseAudio(task); await DiagnosePerformance(task, ct); DiagnoseUpdates(task); DiagnoseCrashes(task);
                break;
        }
        LogFindings(task);
        var problems = task.Findings.Count(f => f.Severity == "problem");
        var warns = task.Findings.Count(f => f.Severity == "warn");
        task.ProblemsBefore ??= problems + warns;
        // Most important first: problems, then warnings, then the rest.
        task.Findings = task.Findings.OrderBy(f => f.Severity switch { "problem" => 0, "warn" => 1, "info" => 2, _ => 3 }).ToList();
        if (task.Steps.Any(x => x.Tier is "execute" or "critical"))
            task.Steps.Add(Step("verify", "Danach erneut prüfen", detail: "Misst noch einmal und vergleicht mit vorher."));
        task.Summary = problems + warns == 0
            ? "Ich finde in den Werten, die der PC misst, keinen Fehler."
            : $"Wahrscheinlichste Ursache: {task.Findings[0].Title}" + (problems + warns > 1 ? $" (insgesamt {problems + warns} Auffälligkeiten)." : ".");
    }

    static IEnumerable<(string id, string label, string status, string detail, string? fix)> Checks(object o)
    {
        var e = JsonSerializer.SerializeToElement(o, Json.Options);
        var list = e.ValueKind == JsonValueKind.Array ? e : e.TryGetProperty("checks", out var c) ? c : default;
        if (list.ValueKind != JsonValueKind.Array) yield break;
        foreach (var x in list.EnumerateArray())
        {
            string S(string k) => x.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
            yield return (S("id"), S("label"), S("status"), S("detail"), x.TryGetProperty("fix", out var f) && f.ValueKind == JsonValueKind.String ? f.GetString() : null);
        }
    }

    static string SevOf(string status) => status switch { "error" => "problem", "warn" => "warn", "ok" => "ok", _ => "info" };

    void DiagnoseAudio(AgentTask task)
    {
        var a = _s.Audio;
        if (!a.Engine.Supported)
        {
            task.Findings.Add(new AgentFinding { Severity = "info", Title = "Audio prüft nur der Windows-Begleiter", Evidence = a.Engine.UnsupportedReason ?? "Audio wird auf diesem System nicht unterstützt.", Source = "Audio-Engine", Page = "/audio" });
            return;
        }
        var settings = a.Settings();
        var devices = a.Devices();
        foreach (var c in Checks(a.Diagnose()).Where(c => c.status is "error" or "warn" && c.id != "discord-check"))
            task.Findings.Add(new AgentFinding { Severity = SevOf(c.status), Title = c.label, Evidence = c.detail, Source = "Audio-Diagnose (jetzt gemessen)", Page = "/audio" });
        var cable = AudioService.OutputIsCable(settings, devices);
        var wanted = AudioService.MicWanted(settings, devices);
        if (cable && (!wanted || !a.MicPassthroughActive))
        {
            task.Findings.Insert(0, new AgentFinding
            {
                Severity = "problem", Title = "Deine Stimme geht nicht mit ins virtuelle Kabel",
                Evidence = $"Soundboard-Ausgabe: {devices.FirstOrDefault(d => d.Id == settings.OutputDeviceId)?.Name ?? "?"} (virtuelles Kabel); Mikrofon mitsenden: {(wanted ? "an" : "aus")}; Durchleitung läuft: {(a.MicPassthroughActive ? "ja" : "nein")}.",
                Source = "Audio-Einstellungen und Audio-Engine (jetzt)", Advice = "Discord nimmt das Kabel als Mikrofon – ohne deine Stimme darin hören die anderen nur Sounds.", Page = "/audio",
            });
            task.Steps.Add(Step("audio-voice", "Meine Stimme mitsenden", "execute", Permissions.Manage, detail: "Schaltet „Meine Stimme automatisch mitsenden“ und die Durchleitung ein."));
            task.Steps.Add(Step("audio-reset", "Alles zurück auf normal", "critical", Permissions.Manage,
                detail: "Soundboard zurück auf deine Lautsprecher, Mikrofon-Weg aus; nimmt Windows über das Kabel auf, wieder dein echtes Mikrofon. Ändert Windows-Standardgeräte.", selected: false));
        }
        var missing = AudioService.MissingDevices(settings, devices);
        if (missing.Count > 0)
            task.Findings.Add(new AgentFinding { Severity = "problem", Title = "Gespeichertes Audiogerät fehlt", Evidence = "Nicht angeschlossen: " + string.Join(", ", missing) + ".", Source = "Audio-Einstellungen", Advice = "Gerät anschließen oder im Audio Center ein anderes wählen.", Page = "/audio" });
        var sounds = _s.Soundboard.Get();
        if (sounds.Sounds.Count == 0)
            task.Findings.Add(new AgentFinding { Severity = "warn", Title = "Im Soundboard sind keine Sounds", Evidence = "0 Sounds gespeichert.", Source = "Soundboard", Page = "/soundboard" });
        if (!task.Findings.Any(f => f.Severity is "problem" or "warn"))
            task.Findings.Add(new AgentFinding
            {
                Severity = "ok", Title = "Geräte und Soundboard-Weg sind in Ordnung", Source = "Audio-Diagnose (jetzt gemessen)",
                Evidence = $"Ausgabe: {(settings.OutputDeviceId == null ? "Windows-Standard" : devices.FirstOrDefault(d => d.Id == settings.OutputDeviceId)?.Name ?? "?")}; Mikrofon mitsenden: {(wanted ? (a.MicPassthroughActive ? "läuft" : "aus") : "nicht nötig")}.",
                Advice = "Was Discord selbst eingestellt hat (Eingabegerät), kann keine App von außen prüfen – mit dem Discord-Mikrofontest kontrollieren.",
            });
    }

    async Task DiagnoseNetwork(AgentTask task)
    {
        foreach (var c in Checks(await _s.Network.Run()))
            if (c.status is "error" or "warn")
                task.Findings.Add(new AgentFinding { Severity = SevOf(c.status), Title = c.label, Evidence = c.detail, Source = "Netzwerkprüfung (jetzt)", Advice = c.fix, Page = "/network" });
        var relay = JsonSerializer.SerializeToElement(_s.Relay.Status(), Json.Options);
        if (relay.TryGetProperty("state", out var st) && st.GetString() is { } state && state != "disabled" && state != "connected")
            task.Findings.Add(new AgentFinding
            {
                Severity = "warn", Title = "Fernverbindung (Relay) nicht verbunden", Source = "Relay-Status",
                Evidence = $"Zustand: {state}" + (relay.TryGetProperty("lastError", out var le) && le.ValueKind == JsonValueKind.String ? $"; letzter Fehler: {le.GetString()}" : ""),
                Advice = "Unterwegs (nicht im WLAN) erreicht das Handy den PC dann nicht.", Page = "/settings",
            });
        if (!task.Findings.Any(f => f.Severity is "problem" or "warn"))
            task.Findings.Add(new AgentFinding { Severity = "ok", Title = "Netzwerk in Ordnung", Evidence = "Router, DNS und Internet antworten.", Source = "Netzwerkprüfung (jetzt)" });
    }

    async Task DiagnosePerformance(AgentTask task, CancellationToken ct)
    {
        var m = _s.Metrics.Sample();
        var gaming = _s.GameRunning();
        foreach (var f in GamingDoctor.Check(m, gaming))
            task.Findings.Add(new AgentFinding { Severity = f.Problem ? "problem" : "info", Title = f.Problem ? FirstSentence(f.Text) : "Hinweis", Evidence = f.Text, Source = "PC-Messung (jetzt)", Page = "/monitor" });
        task.Findings.Add(new AgentFinding { Severity = "info", Title = "Gemessene Werte", Evidence = Measured(m), Source = "PC-Messung (jetzt)", Page = "/monitor" });
        try
        {
            var top = JsonSerializer.SerializeToElement(await _s.ProcessUsage.TopAsync(5, ct), Json.Options);
            var ram = top.GetProperty("ram").EnumerateArray().Select(p => (name: p.GetProperty("name").GetString() ?? "", mb: p.GetProperty("ramMb").GetDouble(), closable: p.TryGetProperty("closable", out var c) && c.GetBoolean())).ToList();
            if (ram.Count > 0)
                task.Findings.Add(new AgentFinding { Severity = "info", Title = "Größte Speicherverbraucher", Evidence = string.Join(", ", ram.Select(p => $"{ProcName(p.name)} {p.mb.ToString("0", De)} MB")), Source = "Prozessliste (jetzt)" });
            var memFull = m.MemTotalBytes is { } t && m.MemUsedBytes is { } u && t > 0 && u >= 0.85 * t;
            var gameNames = _s.Library.List().Where(i => i.Kind == ItemKind.Game).SelectMany(i => i.ProcessNames).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (memFull)
                foreach (var p in ram.Where(p => p.closable && !gameNames.Contains(p.name)).Take(2))
                    task.Steps.Add(Step("close", $"„{p.name}“ schließen", "critical", Permissions.Manage, p.name,
                        $"Braucht {p.mb.ToString("0", De)} MB. Wird gebeten, sich zu beenden – es kann noch nach dem Speichern fragen.", selected: false));
        }
        catch (Exception ex) when (ex is not OperationCanceledException) { Log.Warn("jarvis", "Prozessliste: " + ex.Message); }
    }

    /// <summary>A program's name for reading – some systems report the whole command line; only its first word is shown.</summary>
    static string ProcName(string n) { var first = n.Split(' ', 2)[0]; return Shorten(first, 40); }

    static string FirstSentence(string s) { var i = s.IndexOfAny(new[] { ':', '(' }); return (i > 8 ? s[..i] : s).Trim(); }

    static string Measured(Platform.MetricsSample m)
    {
        var parts = new List<string>();
        if (m.CpuPercent is { } c) parts.Add($"CPU {c.ToString("0", De)} %");
        if (m.MemTotalBytes is { } t && m.MemUsedBytes is { } u && t > 0) parts.Add($"RAM {(u / GB).ToString("0.0", De)} von {(t / GB).ToString("0.0", De)} GB");
        foreach (var g in m.Gpus)
        {
            var bits = new List<string>();
            if (g.UtilPercent is { } gu) bits.Add($"{gu.ToString("0", De)} %");
            if (g.TempC is { } gt) bits.Add($"{gt.ToString("0", De)} °C");
            if (g.MemUsedBytes is { } vu && g.MemTotalBytes is { } vt && vt > 0) bits.Add($"VRAM {(vu / GB).ToString("0.0", De)}/{(vt / GB).ToString("0.0", De)} GB");
            if (bits.Count > 0) parts.Add($"{(string.IsNullOrWhiteSpace(g.Name) ? "GPU" : g.Name)} " + string.Join(", ", bits));
        }
        if (m.CpuTempC is { } ct) parts.Add($"CPU-Temperatur {ct.ToString("0", De)} °C");
        foreach (var d in m.Disks.Where(d => d.TotalBytes > 0)) parts.Add($"{d.Name} {(d.FreeBytes / GB).ToString("0", De)} GB frei");
        if (m.Off.Count > 0) parts.Add("ausgeschaltet: " + string.Join(", ", m.Off));
        return parts.Count == 0 ? "Dieser PC liefert gerade keine Messwerte." : string.Join(" · ", parts) + ". FPS misst der PC nicht.";
    }

    void DiagnoseUpdates(AgentTask task)
    {
        var u = JsonSerializer.SerializeToElement(_s.Updates.Status(), Json.Options);
        string? S(string k) => u.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        if (S("error") is { Length: > 0 } err)
            task.Findings.Add(new AgentFinding { Severity = "warn", Title = "Letzte Update-Prüfung fehlgeschlagen", Evidence = err, Source = "Update-Zentrale", Page = "/updates" });
        if (u.TryGetProperty("available", out var av) && av.ValueKind == JsonValueKind.Object && av.TryGetProperty("version", out var ver))
            task.Findings.Add(new AgentFinding { Severity = "info", Title = $"Update {ver.GetString()} verfügbar", Evidence = $"Installiert: {S("current")}.", Source = "Update-Zentrale", Advice = "In der Update-Zentrale installieren.", Page = "/updates" });
        else if (task.Topic == "updates")
            task.Findings.Add(new AgentFinding { Severity = "ok", Title = "Kein Update offen", Evidence = $"Installiert: {S("current")}.", Source = "Update-Zentrale" });
    }

    void DiagnoseCrashes(AgentTask task)
    {
        var since = _now().AddDays(-7);
        var recent = _s.Crashes.List().Where(r => r.At >= since).OrderByDescending(r => r.At).ToList();
        foreach (var g in recent.GroupBy(r => r.Game).Take(3))
        {
            var last = g.First();
            task.Findings.Add(new AgentFinding
            {
                Severity = g.Count() >= 2 ? "problem" : "warn", Title = $"{g.Key}: {g.Count()}× abgestürzt oder früh beendet (7 Tage)",
                Evidence = $"Zuletzt {last.At.ToLocalTime().ToString("g", De)} ({(last.Trigger == "crash" ? "Windows-Absturzbericht" : last.Trigger == "short" ? "nach kurzer Zeit beendet" : "von dir gemeldet")})."
                    + (last.Hints.Count > 0 ? " Mögliche Ursache: " + last.Hints[0].Text + " – weil " + last.Hints[0].Because : ""),
                Source = "Fehlerberichte", Page = "/crashes",
            });
        }
        if (task.Topic == "crashes" && recent.Count == 0)
            task.Findings.Add(new AgentFinding { Severity = "ok", Title = "Keine Abstürze in den letzten 7 Tagen", Evidence = "Keine Fehlerberichte.", Source = "Fehlerberichte" });
    }

    static readonly Dictionary<string, string[]> LogAreas = new()
    {
        ["audio"] = new[] { "audio", "soundboard" }, ["network"] = new[] { "network", "relay", "web", "mdns", "cloud" },
        ["updates"] = new[] { "update", "updates", "guard" }, ["performance"] = new[] { "metrics", "gamemode" }, ["crashes"] = new[] { "crash" },
    };

    /// <summary>Warnings and errors the companion logged since it started (the in-memory log – older days are in the log files).</summary>
    void LogFindings(AgentTask task)
    {
        var areas = task.Topic != null && LogAreas.TryGetValue(task.Topic, out var a) ? a : LogAreas.Values.SelectMany(x => x).ToArray();
        var hits = Log.Recent(500).Where(e => e.Level >= LogLevel.Warn && areas.Contains(e.Area, StringComparer.OrdinalIgnoreCase))
            .GroupBy(e => e.Message).Select(g => (msg: g.Key, last: g.Max(x => x.Time), n: g.Count(), lvl: g.Max(x => x.Level))).OrderByDescending(x => x.last).Take(3).ToList();
        foreach (var h in hits)
            task.Findings.Add(new AgentFinding
            {
                Severity = h.lvl == LogLevel.Error ? "problem" : "warn", Title = "Im Fehlerprotokoll: " + Shorten(h.msg, 80),
                Evidence = $"{h.n}× seit dem Start des Begleiters, zuletzt {h.last.ToLocalTime().ToString("t", De)} Uhr.", Source = "Fehlerprotokoll des Begleiters", Page = "/diagnostics",
            });
    }

    static string Shorten(string s, int n) => s.Length <= n ? s : s[..(n - 1)] + "…";

    // ================================================================ running

    public AgentTask? Get(string id) { lock (_lock) return _open.TryGetValue(id, out var t) ? t : null; }

    /// <summary>The task the island should show: a running one, else the newest still waiting for a decision (within 30 minutes).</summary>
    public AgentTask? Current(string? owner)
    {
        lock (_lock)
        {
            var mine = _open.Values.Where(t => owner == null || t.Owner == owner).ToList();
            return mine.FirstOrDefault(t => t.State == "running")
                ?? mine.Where(t => t.State == "planned" && t.Steps.Count > 0 && _now() - t.CreatedAt < TimeSpan.FromMinutes(30)).OrderByDescending(t => t.CreatedAt).FirstOrDefault();
        }
    }

    /// <summary>
    /// Runs the chosen steps one after the other. Every step is checked against the device's permissions; critical steps run
    /// only with <paramref name="confirmCritical"/>. One task per person at a time, a task never twice.
    /// </summary>
    public async Task<AgentTask> ExecuteAsync(string? owner, string id, IReadOnlyCollection<string> selected, IReadOnlyDictionary<string, string> refs, bool confirmCritical,
        Func<string, bool> can, Action<AgentTask>? progress, CancellationToken outer = default)
    {
        AgentTask task;
        CancellationTokenSource cts;
        lock (_lock)
        {
            if (!_open.TryGetValue(id, out task!) || (owner != null && task.Owner != owner)) throw new RpcException("not-found", "Diesen Plan gibt es nicht (mehr). Bitte neu fragen.");
            if (task.State != "planned") throw new RpcException("invalid", task.State == "running" ? "Dieser Plan läuft schon." : "Dieser Plan wurde schon ausgeführt – für einen neuen Lauf bitte neu fragen.");
            if (_running.Keys.Any(k => _open.TryGetValue(k, out var other) && other.Owner == task.Owner)) throw new RpcException("busy", "JARVIS führt gerade schon einen Auftrag aus. Erst abwarten oder abbrechen.");
            cts = CancellationTokenSource.CreateLinkedTokenSource(outer);
            _running[id] = cts;
            task.State = "running";
            task.StartedAt = _now();
        }
        var anyFailed = false;
        try
        {
            foreach (var st in task.Steps)
            {
                st.Selected = st.Kind == "verify" ? task.Steps.Any(x => x.Kind != "verify" && x.Tier is "execute" or "critical" && selected.Contains(x.Id)) : selected.Contains(st.Id);
                if (refs.TryGetValue(st.Id, out var r) && st.Options.Any(o => o.Ref == r))
                {
                    st.Ref = r;
                    var label = st.Options.First(o => o.Ref == r).Label.Replace(" (aktiv)", "");
                    st.Title = st.Kind == "profile" ? $"Profil „{label}“ aktivieren" : st.Kind == "launch" ? $"„{label}“ starten" : st.Title;
                }
            }
            progress?.Invoke(task); Publish(task);
            foreach (var st in task.Steps)
            {
                if (cts.IsCancellationRequested) { if (st.Status == "planned") st.Status = "cancelled"; continue; }
                if (!st.Selected) { st.Status = "skipped"; continue; }
                if (!can(st.Permission)) { st.Status = "refused"; st.Ok = false; st.Result = $"Dieses Gerät hat dafür nicht das Recht „{PermLabel(st.Permission)}“."; anyFailed = true; progress?.Invoke(task); continue; }
                if (st.Tier == "critical" && !confirmCritical) { st.Status = "refused"; st.Ok = false; st.Result = "Kritischer Schritt – nur mit ausdrücklicher Bestätigung."; anyFailed = true; progress?.Invoke(task); continue; }
                st.Status = "running"; progress?.Invoke(task); Publish(task);
                var sw = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    var (ok, text) = await RunStep(task, st, cts.Token);
                    st.Ok = ok; st.Result = text; st.Status = ok == false ? "failed" : "done";
                    if (ok == false) anyFailed = true;
                }
                catch (OperationCanceledException) { st.Status = "cancelled"; st.Result = "Abgebrochen."; }
                catch (Exception ex) { st.Status = "failed"; st.Ok = false; st.Result = ex is RpcException ? ex.Message : "Fehler: " + ex.Message; anyFailed = true; Log.Warn("jarvis", $"Schritt {st.Kind}: {ex.Message}"); }
                st.Ms = sw.ElapsedMilliseconds;
                progress?.Invoke(task); Publish(task);
            }
            task.State = cts.IsCancellationRequested ? "cancelled" : anyFailed ? "failed" : "done";
        }
        finally
        {
            task.EndedAt = _now();
            lock (_lock) { _running.Remove(id); }
            cts.Dispose();
            Record(task);
            progress?.Invoke(task); Publish(task);
            Log.Info("jarvis", $"Auftrag {task.Kind} ({task.Topic ?? "-"}): {task.State}, {task.Steps.Count(s => s.Status == "done")} von {task.Steps.Count(s => s.Selected)} Schritten erledigt.");
        }
        return task;
    }

    public bool Cancel(string? owner, string id)
    {
        lock (_lock)
        {
            if (!_open.TryGetValue(id, out var t) || (owner != null && t.Owner != owner)) return false;
            if (_running.TryGetValue(id, out var cts)) { cts.Cancel(); return true; }
            if (t.State == "planned") { t.State = "cancelled"; t.EndedAt = _now(); foreach (var st in t.Steps) st.Status = "cancelled"; Record(t); Publish(t); return true; }
            return false;
        }
    }

    /// <summary>"Stopp": every running JARVIS task of this person ends before its next step.</summary>
    public int StopAll(string? owner)
    {
        lock (_lock)
        {
            var n = 0;
            foreach (var (id, cts) in _running) if (_open.TryGetValue(id, out var t) && (owner == null || t.Owner == owner)) { cts.Cancel(); n++; }
            return n;
        }
    }

    static string PermLabel(string p) => p switch { Permissions.Launch => "Starten", Permissions.Manage => "Verwalten", Permissions.View => "Ansehen", _ => p };

    async Task<(bool? ok, string text)> RunStep(AgentTask task, AgentStep st, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        switch (st.Kind)
        {
            case "check-pc":
            {
                var m = _s.Metrics.Sample();
                var problems = GamingDoctor.Check(m, _s.GameRunning()).Where(f => f.Problem).Select(f => f.Text).ToList();
                return (problems.Count == 0 ? true : null, (problems.Count == 0 ? "Keine Engstelle. " : string.Join(" ", problems) + " ") + Measured(m));
            }
            case "check-game":
            {
                var item = _s.Library.Get(st.Ref ?? "");
                if (item == null) return (false, "Nicht mehr in der Bibliothek.");
                var bad = LaunchValidator.ValidateTarget(item.Source, item.Target) ?? (item.Source == LaunchSource.Exe ? _s.Platform.Launcher.ValidateExecutable(item.Target) : null);
                if (bad != null) return (false, "Startweg ungültig: " + bad);
                var running = _s.Sessions.Running().Any(r => r.itemId == item.Id);
                return (true, running ? $"„{item.Name}“ läuft schon." : $"„{item.Name}“ ist in der Bibliothek und startbar ({item.Source}).");
            }
            case "check-programs":
            {
                var top = JsonSerializer.SerializeToElement(await _s.ProcessUsage.TopAsync(5, ct), Json.Options);
                var ram = top.GetProperty("ram").EnumerateArray().Select(p => $"{ProcName(p.GetProperty("name").GetString() ?? "")} {p.GetProperty("ramMb").GetDouble().ToString("0", De)} MB");
                var gm = _s.GameModePrograms.Preview().Select(p => JsonSerializer.SerializeToElement(p, Json.Options)).Where(p => p.GetProperty("running").GetInt32() > 0)
                    .Select(p => p.GetProperty("label").ValueKind == JsonValueKind.String ? p.GetProperty("label").GetString() : p.GetProperty("name").GetString()).ToList();
                return (true, "Am meisten Arbeitsspeicher: " + string.Join(", ", ram) + ". " + (gm.Count > 0 ? "Der Spielmodus schließt beim Spielstart: " + string.Join(", ", gm) + "." : "Der Spielmodus schließt beim Start nichts."));
            }
            case "check-audio":
            {
                var t = new AgentTask { Topic = "audio" };
                DiagnoseAudio(t);
                var bad = t.Findings.Where(f => f.Severity is "problem" or "warn").ToList();
                return (bad.Count == 0 ? true : null, bad.Count == 0 ? t.Findings.FirstOrDefault()?.Evidence ?? "In Ordnung." : string.Join(" ", bad.Select(f => f.Title + ": " + f.Evidence)));
            }
            case "check-network":
            {
                var bad = Checks(await _s.Network.Run()).Where(c => c.status is "error" or "warn").ToList();
                return (bad.Count == 0 ? true : null, bad.Count == 0 ? "Router, DNS und Internet antworten." : string.Join(" ", bad.Select(c => c.label + ": " + c.detail)));
            }
            case "launch":
            {
                var r = _s.Library.Launch(st.Ref ?? "", "JARVIS-Plan (" + task.By + ")");
                return (r.Ok, r.Message);
            }
            case "profile":
            {
                var p = _s.Profiles.Activate(st.Ref ?? "", "JARVIS-Plan");
                return (true, $"Profil „{p.Name}“ ist aktiv.");
            }
            case "audio-voice":
            {
                _s.Audio.Update(a => { a.MicFollowsSoundboard = true; a.MicPassthrough = true; });
                return _s.Audio.MicPassthroughActive ? (true, "Deine Stimme läuft mit ins Kabel.") : (false, "Eingeschaltet, aber die Durchleitung läuft nicht – ist ein echtes Mikrofon angeschlossen?");
            }
            case "audio-reset":
            {
                var r = JsonSerializer.SerializeToElement(_s.Audio.ResetRouting((id, flow) => _s.Platform.Controls.SetDefaultDevice(id, flow)), Json.Options);
                var mic = r.TryGetProperty("micRestored", out var m) && m.ValueKind == JsonValueKind.String ? $" Windows nimmt wieder über „{m.GetString()}“ auf." : "";
                return (true, "Soundboard spielt wieder auf deinem Standardgerät." + mic + " In Discord das Eingabegerät auf dein Mikrofon stellen.");
            }
            case "close":
            {
                var r = JsonSerializer.SerializeToElement(await _s.ProcessUsage.CloseAsync(st.Ref ?? "", false, ct), Json.Options);
                var left = r.GetProperty("left").GetInt32();
                return left == 0 ? (true, $"„{st.Ref}“ ist geschlossen.") : (false, $"„{st.Ref}“ hat sich nicht beendet – vielleicht fragt es nach dem Speichern.");
            }
            case "automation":
            {
                if (st.Rule == null) return (false, "Keine Regel.");
                var saved = _s.Automations.Save(st.Rule);
                return (true, $"Automatisierung „{saved.Name}“ ist angelegt.");
            }
            case "verify":
            {
                await Task.Delay(TimeSpan.FromSeconds(1.5), ct); // devices and passthrough need a moment
                var before = task.ProblemsBefore ?? 0;
                var check = new AgentTask { Topic = task.Topic, ProblemsBefore = null };
                await DiagnoseAsync(check, ct);
                var after = check.Findings.Count(f => f.Severity is "problem" or "warn");
                task.ProblemsAfter = after;
                task.Findings = check.Findings;
                return after < before ? (true, $"Besser: vorher {before}, jetzt {after} Auffälligkeit(en).")
                    : after == 0 ? (true, "Keine Auffälligkeit mehr.")
                    : (false, $"Unverändert: {after} Auffälligkeit(en). " + check.Findings.First().Title);
            }
            default: return (false, "Unbekannter Schritt.");
        }
    }

    // ================================================================ AI activity island

    /// <summary>
    /// The short state of a task for the island on the PC screen (only to this PC's own windows, like "jarvis.activity"):
    /// what JARVIS does, how far, whether he waits for a decision, the error. No findings, no request text.
    /// </summary>
    public static object Brief(AgentTask t) => new
    {
        id = t.Id, kind = t.Kind, topic = t.Topic, state = t.State, summary = t.Summary, by = t.By,
        done = t.Steps.Count(x => x.Status is "done" or "failed" or "refused" or "skipped" or "cancelled" && x.Selected),
        total = t.Steps.Count(x => x.Selected),
        current = t.Steps.FirstOrDefault(x => x.Status == "running")?.Title,
        error = t.Steps.FirstOrDefault(x => x.Status is "failed" or "refused")?.Result,
        critical = t.Steps.Any(x => x.Tier == "critical" && x.Selected),
        steps = t.Steps.Count,
    };

    void Publish(AgentTask t) { try { _s.Rpc.Broadcast("jarvis.agent", Brief(t), Permissions.Local); } catch (Exception ex) { Log.Debug("jarvis", ex.Message); } }

    // ================================================================ history

    static readonly Regex TokenRx = new(@"sk-[A-Za-z0-9_-]{10,}|gsk_[A-Za-z0-9]{10,}|xai-[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}|\b[A-Fa-f0-9]{32,}\b");
    static readonly Regex LabeledRx = new(@"(?i)\b(passwort|password|kennwort|pin|token|schlüssel|schluessel|api[ -]?key)\b(\s*(?:ist|lautet|:|=)?\s*)(\S+)");

    /// <summary>Keys, tokens, long hex strings and "Passwort: …" never reach the history.</summary>
    public static string Scrub(string text) => LabeledRx.Replace(TokenRx.Replace(text, "[entfernt]"), m => m.Groups[1].Value + m.Groups[2].Value + "[entfernt]");

    void Record(AgentTask task)
    {
        var f = _store.Snapshot();
        if (!f.Keep) return;
        var copy = Json.Deserialize<AgentTask>(Json.Serialize(task))!;
        copy.Request = f.KeepRequests && copy.Request != null ? Scrub(copy.Request.Length > 300 ? copy.Request[..300] : copy.Request) : null;
        _store.Update(x =>
        {
            x.Tasks.RemoveAll(t => t.Id == copy.Id);
            x.Tasks.Insert(0, copy);
            if (x.Tasks.Count > MaxTasks) x.Tasks.RemoveRange(MaxTasks, x.Tasks.Count - MaxTasks);
        });
        _s.Rpc.Changed("jarvis");
    }

    public object History(string? query, string? kind, string? state, int limit = 50)
    {
        var f = _store.Snapshot();
        IEnumerable<AgentTask> list = f.Tasks;
        if (!string.IsNullOrWhiteSpace(kind)) list = list.Where(t => t.Kind == kind);
        if (!string.IsNullOrWhiteSpace(state)) list = list.Where(t => t.State == state);
        if (!string.IsNullOrWhiteSpace(query))
        {
            var q = KnowledgeBase.Fold(query);
            list = list.Where(t => KnowledgeBase.Fold((t.Request ?? "") + " " + t.Summary + " " + t.Topic + " " + string.Join(" ", t.Steps.Select(s => s.Title + " " + s.Result))).Contains(q));
        }
        return new { tasks = list.Take(Math.Clamp(limit, 1, 200)), keep = f.Keep, keepRequests = f.KeepRequests, total = f.Tasks.Count };
    }

    public bool Delete(string id) { var n = 0; _store.Update(x => n = x.Tasks.RemoveAll(t => t.Id == id)); if (n > 0) _s.Rpc.Changed("jarvis"); return n > 0; }
    public int Clear() { var n = 0; _store.Update(x => { n = x.Tasks.Count; x.Tasks.Clear(); }); _s.Rpc.Changed("jarvis"); return n; }

    public object Configure(bool? keep, bool? keepRequests)
    {
        _store.Update(x =>
        {
            if (keep is { } k) { x.Keep = k; if (!k) x.Tasks.Clear(); }
            if (keepRequests is { } r) { x.KeepRequests = r; if (!r) foreach (var t in x.Tasks) t.Request = null; }
        });
        _s.Rpc.Changed("jarvis");
        var f = _store.Snapshot();
        return new { keep = f.Keep, keepRequests = f.KeepRequests };
    }

    internal AgentHistoryFile Export() => _store.Snapshot();
}
