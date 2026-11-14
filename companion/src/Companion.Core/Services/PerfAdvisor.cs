// Nexus Performance Intelligence (3.66): reads the measured values and tells in plain words what stands out – what was seen,
// why it matters, what can be done, and what the risk of doing it is. Pure rules on real measurements (tested); a finding that
// is only a likely explanation is marked as such ("Vermutung"), never as a fact. Nothing is changed from here: every action is
// a separate tap with its own confirmation (close a program, switch the power plan, …).
using Pgl.Core.Platform;

namespace Pgl.Core.Services;

public sealed record PerfFinding(
    string Id,
    /// <summary>info | warn | critical</summary>
    string Level,
    /// <summary>measured (a fact from the values) | suspicion (a likely explanation)</summary>
    string Kind,
    string Area,
    string Title,
    string What,
    string Why,
    string Fix,
    string Risk,
    /// <summary>Optional link to something that helps: "procs:cpu", "procs:ram", "storage", "network", "power", "fps".</summary>
    string? Action = null);

public sealed record AdvisorInput(
    MetricsSample Now,
    bool Gaming,
    double? CpuAvg, double? GpuAvg, double? RamAvg,
    IReadOnlyList<ProcUsage>? TopCpu, IReadOnlyList<ProcUsage>? TopRam,
    IReadOnlyList<PingSummary>? Ping,
    IReadOnlyList<DiskSample>? Disks,
    /// <summary>Process names of the running games (they are never "background load").</summary>
    IReadOnlyCollection<string>? GameProcesses = null);

public static class PerfAdvisor
{
    static readonly HashSet<string> Harmless = new(StringComparer.OrdinalIgnoreCase) { "System", "Idle", "System Idle Process", "Registry", "Memory Compression", "Secure System" };

    /// <summary>German number format in the texts ("10,8 GB"), whatever the companion's own culture is.</summary>
    public static List<PerfFinding> Analyze(AdvisorInput i)
    {
        var before = System.Globalization.CultureInfo.CurrentCulture;
        System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.GetCultureInfo("de-DE");
        try { return AnalyzeCore(i); }
        finally { System.Globalization.CultureInfo.CurrentCulture = before; }
    }

    static List<PerfFinding> AnalyzeCore(AdvisorInput i)
    {
        var f = new List<PerfFinding>();
        var s = i.Now;
        var gpu = s.Gpus.FirstOrDefault();
        var cpu = i.CpuAvg ?? s.CpuPercent;
        var gpuUtil = i.GpuAvg ?? gpu?.UtilPercent;
        var ram = i.RamAvg ?? (s.MemTotalBytes is > 0 && s.MemUsedBytes != null ? 100.0 * s.MemUsedBytes.Value / s.MemTotalBytes.Value : null);
        var fps = s.Fps is { State: "measuring" } live ? live : null;

        // ---- CPU / GPU limit (only meaningful while a game runs)
        if (i.Gaming && cpu is >= 88 && (gpuUtil is null or < 75))
            f.Add(new("cpu-bound", "warn", "suspicion", "cpu", "Das Spiel wird wahrscheinlich vom Prozessor gebremst",
                $"Der Prozessor ist seit einer Weile zu {cpu:0} % ausgelastet, die Grafikkarte nur zu {(gpuUtil is { } g ? $"{g:0} %" : "einem unbekannten Teil")}.",
                "Wenn der Prozessor nicht hinterherkommt, wartet die Grafikkarte – die FPS steigen dann auch mit niedrigeren Grafikeinstellungen kaum.",
                "Programme im Hintergrund schließen (siehe Liste), im Spiel CPU-lastige Optionen senken (Sichtweite, Physik, Anzahl Figuren/NPCs), Energieplan „Höchstleistung“ bzw. „Ausbalanciert“ statt „Energiesparen“.",
                "Keins beim Senken von Einstellungen. Beim Schließen von Programmen gehen ungespeicherte Daten darin verloren.", "procs:cpu"));
        else if (i.Gaming && gpuUtil is >= 95)
            f.Add(new("gpu-bound", "info", "measured", "gpu", "Die Grafikkarte arbeitet am Limit",
                $"Die Grafikkarte ist zu {gpuUtil:0} % ausgelastet.",
                "Im Spiel ist das normal und meist gewollt: Sie liefert so viele Bilder, wie sie kann. Mehr FPS gibt es nur mit weniger Last.",
                "Für mehr FPS: Auflösung oder Render-Skalierung senken, Upscaling (DLSS/FSR/XeSS) einschalten, Schatten/Raytracing reduzieren, oder eine FPS-Grenze setzen, wenn die Karte zu warm/laut wird.",
                "Keins – nur Bildqualität gegen Geschwindigkeit.", "fps"));

        // ---- Background load while gaming
        if (i.Gaming && i.TopCpu != null)
        {
            static string Bare(string n) => n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? n[..^4] : n;
            var games = new HashSet<string>((i.GameProcesses ?? Array.Empty<string>()).Append(fps?.Process ?? "").Where(n => n.Length > 0).Select(Bare), StringComparer.OrdinalIgnoreCase);
            var bg = i.TopCpu.Where(p => p.CpuPercent is >= 15 && !Harmless.Contains(p.Name) && p.Closable && !games.Contains(Bare(p.Name)))
                .OrderByDescending(p => p.CpuPercent).FirstOrDefault();
            if (bg != null)
                f.Add(new("bg-cpu:" + bg.Name, "info", "measured", "cpu", $"„{bg.Name}“ braucht im Hintergrund viel Rechenleistung",
                    $"„{bg.Name}“ nutzt gerade etwa {bg.CpuPercent:0} % des Prozessors.",
                    "Diese Leistung fehlt dem Spiel – besonders spürbar, wenn der Prozessor ohnehin gut zu tun hat.",
                    "Wenn du das Programm gerade nicht brauchst: in der Liste der Programme beenden (mit Bestätigung). Updates und Virenscans lieber nach dem Spielen laufen lassen.",
                    "Ungespeicherte Arbeit im Programm geht verloren. Systemprogramme lassen sich hier nicht beenden.", "procs:cpu"));
        }

        // ---- Memory
        if (ram is >= 90)
            f.Add(new("ram-full", "warn", "measured", "ram", "Der Arbeitsspeicher wird knapp",
                $"{ram:0} % des Arbeitsspeichers sind belegt{TopName(i.TopRam, " – am meisten braucht „{0}“ ({1:0} MB)")}.",
                "Ist er voll, lagert Windows auf das Laufwerk aus. Das führt zu Rucklern und langen Ladezeiten.",
                "Programme schließen, die gerade nicht gebraucht werden (Browser mit vielen Tabs sind oft die größten).",
                "Ungespeicherte Daten in geschlossenen Programmen gehen verloren.", "procs:ram"));
        else if (ram is >= 80 && i.Gaming)
            f.Add(new("ram-high", "info", "measured", "ram", "Der Arbeitsspeicher ist gut gefüllt",
                $"{ram:0} % des Arbeitsspeichers sind belegt.", "Noch kein Problem, aber viel Luft bleibt nicht – weitere Programme können Ruckler auslösen.",
                "Im Blick behalten; große Programme im Hintergrund nach Möglichkeit schließen.", "Keins.", "procs:ram"));
        if (gpu?.MemTotalBytes is > 0 && gpu.MemUsedBytes is { } vu && 100.0 * vu / gpu.MemTotalBytes.Value is var vp && vp >= 92)
            f.Add(new("vram-full", "warn", "measured", "vram", "Der Grafikspeicher ist fast voll",
                $"{vp:0} % des Grafikspeichers sind belegt ({vu / 1073741824.0:0.0} von {gpu.MemTotalBytes.Value / 1073741824.0:0.0} GB).",
                "Reicht der Grafikspeicher nicht, müssen Texturen über den langsameren Arbeitsspeicher kommen – typisch sind kurze Hänger beim Drehen oder Betreten neuer Bereiche.",
                "Texturqualität eine Stufe senken; Raytracing und hohe Auflösungen brauchen besonders viel Grafikspeicher.", "Keins – nur etwas weniger scharfe Texturen."));

        // ---- Temperatures
        if (s.CpuTempC is { } ct && ct >= 90)
            f.Add(new("cpu-hot", ct >= 97 ? "critical" : "warn", "measured", "temp", "Der Prozessor ist sehr warm",
                $"Der Prozessor hat {ct:0} °C.", "Ab etwa 90–100 °C drosseln Prozessoren ihren Takt, um sich zu schützen – das kostet Leistung.",
                "Lüfter und Luftwege auf Staub prüfen, für Luftzufuhr sorgen; bei Laptops auf einer festen Unterlage spielen.", "Keins. Den PC nicht öffnen, während er läuft."));
        if (gpu?.TempC is { } gt && gt >= 85)
            f.Add(new("gpu-hot", gt >= 93 ? "critical" : "warn", "measured", "temp", "Die Grafikkarte ist sehr warm",
                $"Die Grafikkarte hat {gt:0} °C.", "Sehr hohe Temperaturen lassen die Karte heruntertakten und lauter werden.",
                "Gehäuse-Lüftung prüfen, Staub entfernen, eine FPS-Grenze (z. B. auf die Bildschirmfrequenz) senkt Last und Wärme deutlich.", "Keins."));

        // ---- Frames
        if (fps is { Avg: { } avg, Low1: { } low } && fps.Seconds >= 60)
        {
            if (low < avg * 0.5)
                f.Add(new("frametime", "warn", "measured", "fps", "Die Bildzeiten schwanken stark",
                    $"Im Schnitt {avg:0} FPS, aber die langsamsten 1 % der Bilder liegen bei nur {low:0} FPS.",
                    "Große Abstände zwischen Durchschnitt und 1 %-Low fühlen sich als Ruckeln an, auch wenn der Durchschnitt hoch ist.",
                    "Shader-Kompilierung abwarten (beim ersten Spielen normal), Programme im Hintergrund schließen, Spiel auf eine SSD legen, VRAM-Auslastung prüfen.",
                    "Keins.", "fps"));
            var perMin = fps.Stutters / Math.Max(1, fps.Seconds!.Value / 60);
            if (perMin >= 6)
                f.Add(new("stutter", "warn", "measured", "fps", "Wiederkehrende Ruckler",
                    $"{fps.Stutters} deutlich längere Bilder in {fps.Seconds / 60:0} min (etwa {perMin:0} pro Minute).",
                    "Einzelne lange Bilder sind die Ruckler, die man sieht – oft durch Nachladen, Hintergrundprogramme oder vollen Speicher.",
                    "Siehe Hinweise zu Speicher und Hintergrundprogrammen; V-Sync/FPS-Grenze ausprobieren.", "Keins.", "fps"));
        }

        // ---- Drives
        foreach (var d in i.Disks ?? s.Disks)
        {
            if (d.TotalBytes <= 0) continue;
            var freePct = 100.0 * d.FreeBytes / d.TotalBytes;
            var freeGb = d.FreeBytes / 1073741824.0;
            if (freePct < 3 || freeGb < 5)
                f.Add(new("disk-full:" + d.Name, "critical", "measured", "disk", $"Laufwerk {d.Name} ist fast voll",
                    $"Nur noch {freeGb:0.0} GB frei ({freePct:0.0} %).", "Spiele-Updates, Aufnahmen und Windows selbst brauchen freien Platz; ohne ihn schlagen Updates fehl.",
                    "In „Speicher“ nachsehen, was viel Platz braucht. Nichts wird automatisch gelöscht.", "Gelöschte Dateien sind weg – nur löschen, was sicher nicht mehr gebraucht wird.", "storage"));
            else if (freePct < 10 || freeGb < 20)
                f.Add(new("disk-low:" + d.Name, "warn", "measured", "disk", $"Wenig Platz auf {d.Name}",
                    $"{freeGb:0.0} GB frei ({freePct:0} %).", "Große Spiel-Updates passen eventuell nicht mehr darauf.", "In „Speicher“ nachsehen, was viel Platz braucht.", "Keins.", "storage"));
        }
        foreach (var io in s.DiskIo ?? new())
            if (io.BusyPercent is >= 95 && i.Gaming)
                f.Add(new("disk-busy:" + io.Name, "info", "measured", "disk", $"Laufwerk {io.Name} ist voll beschäftigt",
                    $"Das Laufwerk ist zu {io.BusyPercent:0} % ausgelastet.", "Muss das Spiel gleichzeitig nachladen, kommt es zu Hängern.",
                    "Downloads, Updates oder Virenscans auf diesem Laufwerk nach dem Spielen laufen lassen.", "Keins.", "storage"));

        // ---- Network
        foreach (var p in i.Ping ?? Array.Empty<PingSummary>())
        {
            if (p.Samples < 10) continue;
            if (p.LossPercent is >= 2)
                f.Add(new("loss:" + p.Id, p.LossPercent >= 10 ? "critical" : "warn", "measured", "net", $"Paketverlust zu „{p.Label}“",
                    $"{p.LossPercent:0.#} % der Pings kamen in den letzten 2 Minuten nicht an.", "Verlorene Pakete führen in Online-Spielen zu Sprüngen und Verzögerungen.",
                    p.Id == "router" ? "Verbindung zum Router prüfen: LAN-Kabel statt WLAN, näher an den Router, Störquellen meiden." : "Liegt es am Router (siehe dessen Wert)? Wenn nicht: beim Anbieter, oft nur vorübergehend.",
                    "Keins.", "network"));
            else if (p.AvgMs is >= 100 && p.Id != "router")
                f.Add(new("ping:" + p.Id, "info", "measured", "net", $"Hoher Ping zu „{p.Label}“", $"Im Schnitt {p.AvgMs:0} ms.",
                    "Für schnelle Online-Spiele ist ein Ping unter etwa 50 ms angenehm.", "Downloads/Streams im Heimnetz pausieren, LAN-Kabel statt WLAN.", "Keins.", "network"));
        }

        // ---- The companion itself
        if (s.Self?.CpuPercent is >= 5)
            f.Add(new("self", "info", "measured", "self", "Der Begleiter braucht gerade spürbar Leistung",
                $"Der PC-Begleiter selbst nutzt {s.Self.CpuPercent:0.#} % CPU und {s.Self.RamMb:0} MB Arbeitsspeicher.",
                "Er soll im Spiel möglichst nicht auffallen.", "Geöffnete Live-Ansichten (Remote-Bildschirm, Live-Werte) auf anderen Geräten schließen – ohne Zuschauer misst er seltener.", "Keins."));

        return f.OrderBy(x => x.Level switch { "critical" => 0, "warn" => 1, _ => 2 }).ToList();
    }

    static string TopName(IReadOnlyList<ProcUsage>? list, string fmt) =>
        list?.Where(p => !Harmless.Contains(p.Name)).OrderByDescending(p => p.RamMb).FirstOrDefault() is { } p ? string.Format(System.Globalization.CultureInfo.GetCultureInfo("de-DE"), fmt, p.Name, p.RamMb) : "";
}
