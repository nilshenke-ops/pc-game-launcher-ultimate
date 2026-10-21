using System.Net.NetworkInformation;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Hardware and device inventory: one place that collects what the companion can really read (processor and graphics
/// from the PC monitor, audio devices, controllers, keyboards/mice, monitors, drives, network adapters). A category
/// that Windows or this companion cannot provide says so with the reason – nothing is invented, no driver is installed
/// and no setting is changed.
/// </summary>
public sealed class InventoryService(IPlatform platform, AudioService audio)
{
    public sealed record Category(string Id, string Title, bool Available, string? Reason, IReadOnlyList<object> Items);

    static Category Cat(string id, string title, Func<IReadOnlyList<object>> read, string? unavailable = null)
    {
        if (unavailable != null) return new(id, title, false, unavailable, Array.Empty<object>());
        try { return new(id, title, true, null, read()); }
        catch (Exception ex) { return new(id, title, false, "Nicht lesbar: " + ex.Message, Array.Empty<object>()); }
    }

    public object Get()
    {
        var p = platform;
        var m = Safe(() => p.Metrics.Sample());
        var drivers = p.Hardware.Supported ? Safe(() => p.Hardware.Gpus()) ?? new() : new();
        var cats = new List<Category>
        {
            Cat("cpu", "Prozessor", () => new object[] { new { name = m?.CpuName ?? "Unbekannt", cores = m?.CpuCores ?? Environment.ProcessorCount, source = m?.Sources.GetValueOrDefault("cpu") } }),
            Cat("ram", "Arbeitsspeicher", () => m?.MemTotalBytes is { } t ? new object[] { new { totalBytes = t } } : Array.Empty<object>(), m?.MemTotalBytes == null ? "Gesamtgröße wird von diesem System nicht gemeldet." : null),
            Cat("gpu", "Grafikkarte", () =>
            {
                var names = (m?.Gpus.Select(g => g.Name) ?? Enumerable.Empty<string>()).Concat(drivers.Select(d => d.Name)).Where(n => !string.IsNullOrWhiteSpace(n)).Distinct().ToList();
                return names.Select(n =>
                {
                    var d = drivers.FirstOrDefault(x => x.Name == n);
                    var g = m?.Gpus.FirstOrDefault(x => x.Name == n);
                    return (object)new { name = n, driverVersion = d?.Version, driverDate = d?.Date, memTotalBytes = g?.MemTotalBytes };
                }).ToList();
            }),
            Cat("audio", "Audio (Ausgänge, Mikrofone, Headsets)", () => audio.Devices().Select(d => (object)new
            {
                name = d.Name, kind = d.Flow == "capture" ? "Mikrofon" : "Ausgabe", isDefault = d.IsDefault, virtualCable = d.IsVirtualCable,
                headset = Regex.IsMatch(d.Name, "headset|headphone|kopfhörer|arctis|hyperx|kraken|blackshark|cloud|wireless", RegexOptions.IgnoreCase),
            }).ToList(), audio.Devices().Count == 0 && !p.Audio.Supported ? p.Audio.UnsupportedReason ?? "Nur im Windows-Begleiter." : null),
            Cat("controllers", "Controller", () => p.Controllers.List().Where(c => c.Connected).Select(c => (object)new { name = $"Controller {c.Index + 1} ({c.Kind})", battery = c.Battery }).ToList(),
                p.Controllers.Supported ? null : "Nur im Windows-Begleiter (XInput)."),
            Cat("input", "Tastaturen und Mäuse", () => p.InputHook.Devices().Select(d => (object)new { name = d.Name, kind = d.Kind, manufacturer = d.Manufacturer, vid = d.Vid, pid = d.Pid }).ToList(),
                p.InputHook.Supported ? null : "Nur im Windows-Begleiter (Raw Input)."),
            Cat("monitors", "Monitore", () => p.WindowManager.Monitors().Select(x => (object)new { name = x.Name, width = x.Width, height = x.Height, primary = x.Primary }).ToList(),
                p.WindowManager.Supported ? null : "Nur im Windows-Begleiter."),
            Cat("drives", "Laufwerke", () => DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType is DriveType.Fixed or DriveType.Removable or DriveType.Network)
                .Where(d => OperatingSystem.IsWindows() || d.TotalSize > 1_000_000_000)
                .Select(d => (object)new { name = d.Name, label = SafeStr(() => d.VolumeLabel) is { } vl && vl != d.Name ? vl : null, format = SafeStr(() => d.DriveFormat), type = d.DriveType.ToString(), totalBytes = d.TotalSize, freeBytes = d.AvailableFreeSpace }).Take(26).ToList()),
            Cat("network", "Netzwerkadapter", () => NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.NetworkInterfaceType is not (NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel))
                .Select(n => (object)new { name = n.Name, description = n.Description == n.Name ? null : n.Description, kind = n.NetworkInterfaceType.ToString(), up = n.OperationalStatus == OperationalStatus.Up, speedMbit = n.OperationalStatus == OperationalStatus.Up && n.Speed is > 0 and < 1_000_000_000_000 && n.Speed != uint.MaxValue ? n.Speed / 1_000_000 : (long?)null })
                .Take(20).ToList()),
            Cat("usb", "Sonstige USB-Geräte", () => Array.Empty<object>(), "Wird noch nicht erfasst – Tastaturen, Mäuse und Controller stehen oben in ihren Abschnitten."),
        };
        return new
        {
            at = DateTime.UtcNow,
            system = new { os = System.Runtime.InteropServices.RuntimeInformation.OSDescription, uptimeHours = Math.Round(Environment.TickCount64 / 3_600_000.0, 1), companion = UpdateService.CurrentVersion, platform = p.Name },
            categories = cats,
        };
    }

    static T? Safe<T>(Func<T> f) where T : class { try { return f(); } catch (Exception ex) { Log.Warn("inventory", ex.Message); return null; } }
    static string? SafeStr(Func<string> f) { try { var v = f(); return string.IsNullOrWhiteSpace(v) ? null : v; } catch { return null; } }
}

/// <summary>One crash or hang written by Windows Error Reporting (Report.wer).</summary>
public sealed record WerCrash(string EventType, string App, string? AppVersion, string? Module, string? ModuleVersion, string? ExceptionCode, DateTime? At, string? AppPath, string File);

public static class WerReader
{
    /// <summary>Reads a Report.wer (key=value lines, usually UTF-16). Only crash/hang types are returned.</summary>
    public static WerCrash? Parse(string text, string file)
    {
        var kv = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in text.Replace("\r", "").Split('\n'))
        {
            var i = line.IndexOf('=');
            if (i > 0) kv[line[..i].Trim()] = line[(i + 1)..].Trim();
        }
        var type = kv.GetValueOrDefault("EventType") ?? "";
        if (!Regex.IsMatch(type, "^(APPCRASH|BEX|BEX64|AppHangB1|AppHangXProcB1|MoAppCrash|MoAppHang)$", RegexOptions.IgnoreCase)) return null;
        string? Sig(int i) => kv.GetValueOrDefault($"Sig[{i}].Value") is { Length: > 0 } v ? v : null;
        DateTime? at = long.TryParse(kv.GetValueOrDefault("EventTime"), out var ft) && ft > 0 ? DateTime.FromFileTimeUtc(ft) : null;
        var app = Sig(0) ?? kv.GetValueOrDefault("AppName") ?? "";
        if (app.Length == 0) return null;
        // Signature order: APPCRASH 3 module, 4 module version, 6 exception code; BEX/BEX64 7 exception code; hangs have no module.
        var hang = type.Contains("Hang", StringComparison.OrdinalIgnoreCase);
        var bex = type.StartsWith("BEX", StringComparison.OrdinalIgnoreCase);
        return new WerCrash(type, app, Sig(1), hang ? null : Sig(3), hang ? null : Sig(4), hang ? null : bex ? Sig(7) : Sig(6), at, kv.GetValueOrDefault("AppPath"), file);
    }

    /// <summary>All crash reports in the folders written in the time window, for the given program names (without .exe).</summary>
    public static List<WerCrash> Find(IEnumerable<string> folders, DateTime from, DateTime to, IReadOnlyCollection<string> processNames)
    {
        var names = processNames.Select(n => Path.GetFileNameWithoutExtension(n).ToLowerInvariant()).ToHashSet();
        var result = new List<WerCrash>();
        foreach (var folder in folders.Where(Directory.Exists))
        {
            IEnumerable<string> dirs;
            try { dirs = Directory.EnumerateDirectories(folder).OrderByDescending(Directory.GetLastWriteTimeUtc).Take(300).ToList(); } catch { continue; }
            foreach (var d in dirs)
            {
                var f = Path.Combine(d, "Report.wer");
                if (!File.Exists(f)) continue;
                try
                {
                    var c = Parse(ReadText(f), f);
                    if (c == null || !names.Contains(Path.GetFileNameWithoutExtension(c.App).ToLowerInvariant())) continue;
                    var at = c.At ?? File.GetLastWriteTimeUtc(f);
                    if (at >= from.AddMinutes(-1) && at <= to.AddMinutes(3)) result.Add(c with { At = at });
                }
                catch { /* not readable */ }
            }
        }
        return result.OrderBy(c => c.At).ToList();
    }

    static string ReadText(string f)
    {
        var bytes = File.ReadAllBytes(f);
        if (bytes.Length > 512 * 1024) bytes = bytes[..(512 * 1024)];
        return bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE ? System.Text.Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2) : System.Text.Encoding.UTF8.GetString(bytes);
    }
}

public sealed class CrashReport
{
    public string Id { get; set; } = "";
    public string ItemId { get; set; } = "";
    public string Game { get; set; } = "";
    public DateTime At { get; set; }
    /// <summary>"crash" (Windows crash report found), "short" (ended within 2 minutes, no report) or "manual".</summary>
    public string Trigger { get; set; } = "manual";
    public DateTime? SessionStart { get; set; }
    public DateTime? SessionEnd { get; set; }
    public string? GameVersion { get; set; }
    public string? LastLaunch { get; set; }
    public List<WerCrash> Crashes { get; set; } = new();
    public Dictionary<string, string> System { get; set; } = new();
    public string? Profile { get; set; }
    public List<string> Changes { get; set; } = new();
    public List<CrashHint> Hints { get; set; } = new();
}

/// <summary>A possible cause – always a guess, with the reason why.</summary>
public sealed record CrashHint(string Text, string Because);

public sealed class CrashReportsFile { public List<CrashReport> Reports { get; set; } = new(); }

/// <summary>
/// Error reports per game: made after a detected crash (Windows wrote a crash report for the game's program) or a very
/// short session, or on request. Only data that exists goes in; causes are marked as guesses with their reason.
/// Everything stays on the PC; export only by hand, with personal data removed if wanted.
/// </summary>
public sealed class CrashReportService
{
    readonly JsonStore<CrashReportsFile> _store;
    readonly IPlatform _platform;
    readonly LibraryService _library;
    readonly Func<HistoryFile> _history;
    readonly Func<ProfilesFile> _profiles;
    readonly Func<string, IEnumerable<string>> _recentChanges;
    readonly IHub _hub;

    public CrashReportService(AppPaths paths, IPlatform platform, LibraryService library, Func<HistoryFile> history, Func<ProfilesFile> profiles, Func<string, IEnumerable<string>> recentChanges, IHub hub)
    {
        _store = new JsonStore<CrashReportsFile>(paths.File("crashreports.json"));
        _platform = platform; _library = library; _history = history; _profiles = profiles; _recentChanges = recentChanges; _hub = hub;
    }

    public List<CrashReport> List() => _store.Snapshot().Reports;

    static IReadOnlyCollection<string> ProcessNames(LibraryItem item)
    {
        var names = new List<string>(item.ProcessNames);
        if (item.Source == LaunchSource.Exe && !string.IsNullOrEmpty(item.Target)) names.Add(Path.GetFileNameWithoutExtension(item.Target));
        return names.Where(n => n.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    /// <summary>After a session ended. Waits a little in the caller (Windows writes its report after the crash).</summary>
    public CrashReport? AfterSession(string itemId, DateTime start, DateTime end)
    {
        var item = _library.Get(itemId);
        if (item == null) return null;
        var crashes = WerReader.Find(_platform.Hardware.CrashReportFolders(), start, end, ProcessNames(item));
        var shortSession = end - start < TimeSpan.FromMinutes(2);
        if (crashes.Count == 0 && !shortSession) return null;
        return Make(item, crashes.Count > 0 ? "crash" : "short", start, end, crashes);
    }

    /// <summary>On request: the newest session of the game (if any) and its crash reports.</summary>
    public CrashReport Create(string itemId)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        var last = _history().Sessions.Where(s => s.ItemId == itemId).OrderByDescending(s => s.StartedAt).FirstOrDefault();
        var crashes = last == null ? new() : WerReader.Find(_platform.Hardware.CrashReportFolders(), last.StartedAt, last.EndedAt ?? DateTime.UtcNow, ProcessNames(item));
        return Make(item, "manual", last?.StartedAt, last?.EndedAt, crashes);
    }

    CrashReport Make(LibraryItem item, string trigger, DateTime? start, DateTime? end, List<WerCrash> crashes)
    {
        var h = _history();
        var launch = h.Launches.Where(l => l.ItemId == item.Id).OrderByDescending(l => l.At).FirstOrDefault();
        var prof = _profiles();
        var r = new CrashReport
        {
            Id = "cr_" + Ids.Token(9), ItemId = item.Id, Game = item.Name, At = DateTime.UtcNow, Trigger = trigger, SessionStart = start, SessionEnd = end, Crashes = crashes.Take(5).ToList(),
            GameVersion = item.Source == LaunchSource.Steam ? SteamAppState.ForInstallDir(item.InstallDir, item.Target)?.BuildId is { } b ? "Steam-Build " + b : null : crashes.FirstOrDefault()?.AppVersion,
            LastLaunch = launch == null ? null : launch.Ok ? $"Gestartet {launch.At:u} (von {launch.By ?? "?"})" : $"Start fehlgeschlagen {launch.At:u}: {launch.Error}",
            Profile = prof.Profiles.FirstOrDefault(p => p.Id == prof.ActiveProfileId)?.Name,
            Changes = _recentChanges(item.Id).Take(10).ToList(),
            System = SystemInfo(),
        };
        r.Hints = Hints(r, List().Count(x => x.ItemId == item.Id && x.At > DateTime.UtcNow.AddDays(-7) && x.Trigger != "manual"));
        _store.Update(f => { f.Reports.Insert(0, r); if (f.Reports.Count > 100) f.Reports.RemoveRange(100, f.Reports.Count - 100); });
        _hub.Changed("crashreports");
        return r;
    }

    Dictionary<string, string> SystemInfo()
    {
        var d = new Dictionary<string, string> { ["Betriebssystem"] = System.Runtime.InteropServices.RuntimeInformation.OSDescription, ["Begleiter"] = UpdateService.CurrentVersion };
        try
        {
            var m = _platform.Metrics.Sample();
            if (m.CpuName != null) d["Prozessor"] = m.CpuName;
            if (m.MemTotalBytes is { } t) d["Arbeitsspeicher"] = $"{t / 1024.0 / 1024 / 1024:0.#} GB";
            if (m.MemTotalBytes is { } tt && m.MemUsedBytes is { } u) d["Speicher belegt (jetzt)"] = $"{u * 100 / tt} %";
        }
        catch { /* not available */ }
        foreach (var (g, i) in _platform.Hardware.Gpus().Select((g, i) => (g, i)))
            d[i == 0 ? "Grafikkarte" : $"Grafikkarte {i + 1}"] = g.Name + (g.Version != null ? $" (Treiber {g.Version}{(g.Date != null ? ", " + g.Date : "")})" : "");
        return d;
    }

    static readonly Regex GpuModule = new(@"^(nvwgf2um|nvwgf2umx|nvoglv|nvd3dum|nvcuda|atiumd|atio6axx|amdxx|aticfx|igd10|igxe|igdumd|ig\d+icd|igc)", RegexOptions.IgnoreCase);

    /// <summary>Guesses with their reason – never presented as a certain diagnosis.</summary>
    public static List<CrashHint> Hints(CrashReport r, int recent)
    {
        var hints = new List<CrashHint>();
        var c = r.Crashes.FirstOrDefault();
        var code = c?.ExceptionCode?.ToLowerInvariant().Replace("0x", "");
        if (c != null && c.EventType.Contains("Hang", StringComparison.OrdinalIgnoreCase))
            hints.Add(new("Das Spiel reagierte nicht mehr (hing) und wurde beendet. Hilfreich sein können: Overlays testweise ausschalten, Grafiktreiber aktualisieren, Spieldateien prüfen.", "Windows meldet „reagiert nicht“ für dieses Programm."));
        if (c?.Module is { } mod && GpuModule.IsMatch(mod))
            hints.Add(new("Grafiktreiber aktualisieren oder sauber neu installieren.", $"Der Absturz geschah in „{mod}“ – das gehört zum Grafiktreiber."));
        else if (c?.Module is { } m2 && Regex.IsMatch(m2, @"^(d3d11|d3d12|dxgi|vulkan-1|opengl32)\.dll$", RegexOptions.IgnoreCase))
            hints.Add(new("Grafiktreiber aktualisieren; im Spiel testweise eine andere Grafik-Schnittstelle (DirectX 11/12, Vulkan) wählen.", $"Der Absturz geschah in „{m2}“ (Grafik-Schnittstelle von Windows)."));
        switch (code)
        {
            case "c0000005":
                hints.Add(new(r.Changes.Any(x => x.Contains("Mod", StringComparison.OrdinalIgnoreCase)) ? "Zuletzt geänderte Mods testweise deaktivieren (Mods-Seite), dann erneut starten." : "Spieldateien über den Launcher prüfen (Steam: Eigenschaften → Installierte Dateien → Dateien auf Fehler überprüfen).",
                    "Ausnahmecode c0000005 = unerlaubter Speicherzugriff; häufige Auslöser sind beschädigte Dateien, Mods oder Overlays."));
                break;
            case "c0000135": case "c0000142": case "c06d007e":
                hints.Add(new("Laufzeitbibliotheken (Visual C++ Redistributable, DirectX) neu installieren und Spieldateien prüfen.", $"Ausnahmecode {code} = eine benötigte Programmbibliothek fehlt oder ließ sich nicht laden."));
                break;
            case "c0000409":
                hints.Add(new("Overlays und Zusatzprogramme (Discord-Overlay, MSI Afterburner/RivaTuner, Nexus-Overlay) testweise ausschalten.", "Ausnahmecode c0000409 = das Programm hat sich wegen eines erkannten Fehlers selbst beendet; Overlays sind ein häufiger Auslöser."));
                break;
            case "e06d7363":
                hints.Add(new("Spiel aktualisieren bzw. beim Hersteller melden – der Fehler liegt im Spiel selbst.", "Ausnahmecode e06d7363 = nicht abgefangener Programmfehler (C++-Ausnahme) im Spiel."));
                break;
            case "80000003":
                hints.Add(new("Spiel aktualisieren; bei Mods diese testweise deaktivieren.", "Ausnahmecode 80000003 = Haltepunkt – das Spiel hat sich bewusst angehalten."));
                break;
        }
        if (r.Trigger == "short" && r.Crashes.Count == 0)
            hints.Add(new("Prüfen, ob das Spiel selbst eine Meldung zeigte; Launcher (Steam/Epic) und Anti-Cheat-Dienst neu starten; Spieldateien prüfen.", "Das Spiel lief weniger als 2 Minuten und Windows hat keinen Absturzbericht geschrieben – es wurde womöglich vom Launcher oder Anti-Cheat beendet oder selbst geschlossen."));
        if (r.LastLaunch?.StartsWith("Start fehlgeschlagen") == true)
            hints.Add(new("Startziel des Eintrags prüfen (Bibliothek → Bearbeiten) bzw. ob der Launcher installiert und angemeldet ist.", "Der letzte Startbefehl ist fehlgeschlagen."));
        if (recent >= 2)
            hints.Add(new("Tritt wiederholt auf – Berichte vergleichen, ob es immer derselbe Fehlerbaustein ist.", $"In den letzten 7 Tagen gab es schon {recent} weitere Berichte für dieses Spiel."));
        return hints;
    }

    public bool Remove(string id)
    {
        var ok = _store.Update(f => f.Reports.RemoveAll(r => r.Id == id) > 0);
        _hub.Changed("crashreports");
        return ok;
    }

    /// <summary>Text for sharing by hand. redact: user name, PC name and e-mail addresses are replaced.</summary>
    public string Export(string id, bool redact)
    {
        var r = List().FirstOrDefault(x => x.Id == id) ?? throw new RpcException("not-found", "Bericht nicht gefunden.");
        var sb = new System.Text.StringBuilder();
        sb.AppendLine($"Fehlerbericht: {r.Game}");
        sb.AppendLine($"Erstellt: {r.At:u} ({(r.Trigger == "crash" ? "Absturz erkannt" : r.Trigger == "short" ? "sehr kurze Sitzung" : "auf Anforderung")})");
        if (r.SessionStart != null) sb.AppendLine($"Sitzung: {r.SessionStart:u} – {(r.SessionEnd != null ? r.SessionEnd.Value.ToString("u") : "?")}");
        if (r.GameVersion != null) sb.AppendLine($"Version: {r.GameVersion}");
        if (r.LastLaunch != null) sb.AppendLine($"Letzter Start: {r.LastLaunch}");
        if (r.Profile != null) sb.AppendLine($"Gaming-Profil: {r.Profile}");
        foreach (var c in r.Crashes) sb.AppendLine($"Windows-Bericht ({c.EventType}, {c.At:u}): {c.App} {c.AppVersion} – Modul {c.Module ?? "?"} {c.ModuleVersion} – Code {c.ExceptionCode ?? "?"}{(c.AppPath != null ? " – " + c.AppPath : "")}");
        if (r.Crashes.Count == 0) sb.AppendLine("Kein Windows-Absturzbericht gefunden.");
        sb.AppendLine("System:");
        foreach (var (k, v) in r.System) sb.AppendLine($"  {k}: {v}");
        if (r.Changes.Count > 0) { sb.AppendLine("Änderungen davor:"); foreach (var x in r.Changes) sb.AppendLine("  " + x); }
        if (r.Hints.Count > 0) { sb.AppendLine("Mögliche Ursachen (Vermutungen):"); foreach (var x in r.Hints) sb.AppendLine($"  - {x.Text} (weil: {x.Because})"); }
        var text = sb.ToString();
        return redact ? Redact(text) : text;
    }

    public static string Redact(string text)
    {
        foreach (var (value, label) in new[] { (Environment.UserName, "<Benutzer>"), (Environment.MachineName, "<PC>") })
            if (value.Length >= 2) text = Regex.Replace(text, Regex.Escape(value), label, RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"(?i)([\\/](Users|home)[\\/])[^\\/\s]+", "$1<Benutzer>");
        return Regex.Replace(text, @"[\w.+-]+@[\w-]+\.[\w.-]+", "<E-Mail>");
    }
}
