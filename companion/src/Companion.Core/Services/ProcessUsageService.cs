using System.Diagnostics;

namespace Pgl.Core.Services;

/// <summary>Memory and processor use of one program (all its processes together).</summary>
public sealed record ProcUsage(string Name, double RamMb, double? CpuPercent, int Count)
{
    /// <summary>False for Windows' own processes and this companion – the page offers no "close" for them.</summary>
    public bool Closable => !ProcessUsageService.IsProtected(Name);
    /// <summary>windows (part of Windows – never end) | companion (this app) | driver (graphics/sound driver – better leave running) | app.</summary>
    public string Kind => ProcessUsageService.KindOf(Name);
    /// <summary>What it is for, in plain words (known Windows parts and drivers), otherwise null.</summary>
    public string? Role => ProcessUsageService.RoleOf(Name);
}

/// <summary>Graphics card use of one program: share of the GPU (busiest engine) and its own graphics memory.</summary>
public sealed record GpuProcUsage(string Name, double? GpuPercent, double? VramMb, int Count)
{
    public bool Closable => !ProcessUsageService.IsProtected(Name);
    public string Kind => ProcessUsageService.KindOf(Name);
    public string? Role => ProcessUsageService.RoleOf(Name);
}

/// <summary>
/// "Welche Programme verbrauchen am meisten RAM?": measured only when asked (two looks one second apart for the processor
/// share), never in the background, and the result is kept for a few seconds so repeated questions do not measure again.
/// Closing a program is a separate, explicit step (CloseAsync): first politely (its window is asked to close, so it can ask to save),
/// forced only when asked for again. Windows' own processes and this companion are never closed.
/// </summary>
public sealed class ProcessUsageService
{
    readonly Func<CancellationToken, Task<List<ProcUsage>>> _measure;
    readonly SemaphoreSlim _gate = new(1, 1);
    List<ProcUsage>? _last;
    List<GpuProcUsage>? _gpu;
    DateTime _at;

    public ProcessUsageService(Func<CancellationToken, Task<List<ProcUsage>>>? measure = null) => _measure = measure ?? MeasureAsync;

    public async Task<object> TopAsync(int n = 8, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (_last == null || DateTime.UtcNow - _at > TimeSpan.FromSeconds(5))
            {
                var gpuTask = Gpu?.Invoke(ct) ?? Task.FromResult<List<GpuProcUsage>?>(null);   // measured at the same time as the processor share
                _last = await _measure(ct); _at = DateTime.UtcNow;
                try { _gpu = await gpuTask; } catch (Exception ex) { _gpu = null; Pgl.Core.Infrastructure.Log.Warn("procs", "GPU je Programm: " + ex.Message); }
            }
            return new
            {
                at = _at,
                ram = _last.OrderByDescending(p => p.RamMb).Take(n),
                cpu = _last.Where(p => p.CpuPercent != null).OrderByDescending(p => p.CpuPercent).Take(n),
                gpu = _gpu?.OrderByDescending(p => p.GpuPercent ?? 0).ThenByDescending(p => p.VramMb ?? 0).Take(n),
                gpuSupported = _gpu != null,
                cores = Environment.ProcessorCount,
            };
        }
        finally { _gate.Release(); }
    }

    /// <summary>All measured programs (same 5-s cache as <see cref="TopAsync"/>).</summary>
    public async Task<List<ProcUsage>> ListAsync(CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (_last == null || DateTime.UtcNow - _at > TimeSpan.FromSeconds(5)) { _last = await _measure(ct); _at = DateTime.UtcNow; }
            return _last.ToList();
        }
        finally { _gate.Release(); }
    }

    /// <summary>Processes that keep Windows (or this companion) running – closing them would log out, crash the desktop or cut the connection.</summary>
    static readonly HashSet<string> Protected = new(StringComparer.OrdinalIgnoreCase)
    {
        "Idle", "System", "Registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "lsaiso", "svchost", "dwm", "fontdrvhost",
        "sihost", "explorer", "audiodg", "spoolsv", "ctfmon", "conhost", "RuntimeBroker", "SearchHost", "SearchIndexer", "StartMenuExperienceHost",
        "ShellExperienceHost", "TextInputHost", "taskhostw", "MsMpEng", "SecurityHealthService", "WmiPrvSE", "dllhost", "LogonUI", "userinit",
        "Memory Compression", "MemCompression", "PCGameLauncherCompanion", "pgl-companion-headless", "init", "systemd",
    };
    static readonly string Self = Process.GetCurrentProcess().ProcessName;
    public static bool IsProtected(string name) => Protected.Contains(name) || string.Equals(name, Self, StringComparison.OrdinalIgnoreCase);

    static string Bare(string n) => n.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? n[..^4] : n;
    static readonly HashSet<string> Companion = new(StringComparer.OrdinalIgnoreCase) { "PCGameLauncherCompanion", "pgl-companion-headless", "msedgewebview2" };
    // Graphics, sound and chipset helpers: not part of Windows, but ending them can break the picture, the sound or the overlay.
    static readonly string[] Drivers = { "NVDisplay.Container", "nvcontainer", "nvsphelper64", "NVIDIA Web Helper", "NVIDIA Share", "NVIDIA Overlay", "amdfendrsr", "atiesrxx", "atieclxx", "AMDRSServ", "RadeonSoftware", "AMDRSSrcExt", "igfxEM", "igfxCUIService", "IntelCpHDCPSvc", "IntelGraphicsSoftware", "RtkAudUService64", "RtkAudioService", "WavesSvc64", "NahimicSvc64", "AsusOptimization", "LGHUB", "lghub_agent", "iCUE", "Corsair.Service" };
    static readonly Dictionary<string, string> Roles = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Idle"] = "Freie Rechenzeit des Prozessors (kein echtes Programm)",
        ["System"] = "Kern von Windows (Treiber, Laufwerke, Netzwerk)",
        ["Registry"] = "Windows-Registrierung (Einstellungen von Windows)",
        ["Memory Compression"] = "Speicherkomprimierung von Windows – spart Arbeitsspeicher",
        ["MemCompression"] = "Speicherkomprimierung von Windows – spart Arbeitsspeicher",
        ["smss"] = "Startet die Windows-Sitzung", ["csrss"] = "Grundlegender Windows-Prozess für Fenster und Konsole",
        ["wininit"] = "Startet Windows-Dienste", ["winlogon"] = "Windows-Anmeldung und Sperrbildschirm",
        ["services"] = "Verwaltet alle Windows-Dienste", ["lsass"] = "Anmeldung und Passwörter von Windows (Sicherheit)",
        ["lsaiso"] = "Geschützte Anmeldedaten (Sicherheit)", ["svchost"] = "Windows-Dienste (Netzwerk, Updates, Audio, Bluetooth …)",
        ["dwm"] = "Zeichnet den Desktop und alle Fenster", ["fontdrvhost"] = "Schriftarten von Windows",
        ["sihost"] = "Windows-Oberfläche (Benachrichtigungen, Taskleiste)", ["explorer"] = "Taskleiste, Startmenü und Datei-Explorer",
        ["audiodg"] = "Windows-Audio (Ton für alle Programme)", ["spoolsv"] = "Druckdienst von Windows",
        ["ctfmon"] = "Tastatur-, Sprach- und Stifteingabe", ["conhost"] = "Hilfsprozess für Konsolenfenster",
        ["RuntimeBroker"] = "Prüft Rechte von Windows-Apps", ["SearchHost"] = "Windows-Suche (Oberfläche)", ["SearchIndexer"] = "Windows-Suche (Index der Dateien)",
        ["StartMenuExperienceHost"] = "Startmenü", ["ShellExperienceHost"] = "Windows-Oberfläche (Info-Center, Uhr)", ["TextInputHost"] = "Bildschirmtastatur und Emoji-Eingabe",
        ["taskhostw"] = "Geplante Windows-Aufgaben", ["MsMpEng"] = "Microsoft Defender – Virenschutz", ["SecurityHealthService"] = "Windows-Sicherheit",
        ["WmiPrvSE"] = "Windows-Verwaltung (Abfragen von Programmen)", ["dllhost"] = "Hilfsprozess von Windows", ["LogonUI"] = "Windows-Anmeldebildschirm",
        ["userinit"] = "Startet die Benutzeroberfläche nach der Anmeldung",
        ["PCGameLauncherCompanion"] = "Der Nexus-Begleiter selbst (diese App)", ["pgl-companion-headless"] = "Der Nexus-Begleiter selbst (diese App)",
        ["msedgewebview2"] = "Anzeige von Webinhalten (u. a. für die Insel des Begleiters und andere Apps)",
        ["init"] = "Startprozess des Systems", ["systemd"] = "Startprozess des Systems",
    };

    public static string KindOf(string name)
    {
        var n = Bare(name);
        if (Companion.Contains(n) || string.Equals(n, Self, StringComparison.OrdinalIgnoreCase)) return "companion";
        if (Protected.Contains(n)) return "windows";
        if (Drivers.Any(d => n.StartsWith(d, StringComparison.OrdinalIgnoreCase))) return "driver";
        return "app";
    }

    public static string? RoleOf(string name)
    {
        var n = Bare(name);
        if (Roles.TryGetValue(n, out var r)) return r;
        return KindOf(n) == "driver"
            ? (n.StartsWith("NV", StringComparison.OrdinalIgnoreCase) ? "NVIDIA-Grafiktreiber" : n.StartsWith("amd", StringComparison.OrdinalIgnoreCase) || n.StartsWith("ati", StringComparison.OrdinalIgnoreCase) || n.StartsWith("Radeon", StringComparison.OrdinalIgnoreCase) ? "AMD-Grafiktreiber" : n.StartsWith("igfx", StringComparison.OrdinalIgnoreCase) || n.StartsWith("Intel", StringComparison.OrdinalIgnoreCase) ? "Intel-Grafiktreiber" : "Treiber für Ton oder Zubehör")
            : null;
    }

    /// <summary>Graphics card use per program (Windows: "GPU Engine" and "GPU Process Memory" counters). Null when the system cannot tell.</summary>
    public Func<CancellationToken, Task<List<GpuProcUsage>?>>? Gpu { get; set; }

    /// <summary>
    /// Closes every process of a program. Without force: asks its windows to close (the program may ask to save) and waits up to 4 s.
    /// With force: ends the processes. Returns how many ended, how many are left and whether forcing would be needed.
    /// </summary>
    public async Task<object> CloseAsync(string name, bool force, CancellationToken ct = default)
    {
        name = name.Trim();
        if (name.Length is 0 or > 120) throw new Rpc.RpcException("invalid-params", "Ungültiger Programmname.");
        if (IsProtected(name)) throw new Rpc.RpcException("forbidden", $"„{name}“ gehört zu Windows oder zu diesem Begleiter und wird nicht geschlossen.");
        var procs = Process.GetProcessesByName(name).Where(p => p.Id != Environment.ProcessId).ToList();
        if (procs.Count == 0) throw new Rpc.RpcException("not-found", $"„{name}“ läuft nicht mehr.");
        try
        {
            foreach (var p in procs)
            {
                try
                {
                    if (force) p.Kill(entireProcessTree: true);
                    else if (OperatingSystem.IsWindows() && p.MainWindowHandle != IntPtr.Zero) p.CloseMainWindow();
                }
                catch { /* no access or already gone */ }
            }
            var until = DateTime.UtcNow.AddSeconds(4);
            while (DateTime.UtcNow < until && procs.Any(Alive)) await Task.Delay(150, ct);
            var left = procs.Count(Alive);
            lock (_gate) _last = null; // the next look measures again
            return new { name, closed = procs.Count - left, left, needsForce = left > 0 && !force };
        }
        finally { foreach (var p in procs) p.Dispose(); }

        static bool Alive(Process p) { try { p.Refresh(); return !p.HasExited; } catch { return false; } }
    }

    static readonly HashSet<string> Skip = new(StringComparer.OrdinalIgnoreCase) { "Idle", "System", "Registry", "Memory Compression", "MemCompression" };

    static async Task<List<ProcUsage>> MeasureAsync(CancellationToken ct)
    {
        Dictionary<int, (string name, TimeSpan cpu)> First()
        {
            var d = new Dictionary<int, (string, TimeSpan)>();
            foreach (var p in Process.GetProcesses())
            {
                using (p)
                {
                    try { if (!Skip.Contains(p.ProcessName)) d[p.Id] = (p.ProcessName, p.TotalProcessorTime); }
                    catch { /* no access (protected process) – its time is not counted */ }
                }
            }
            return d;
        }
        var a = First();
        var sw = Stopwatch.StartNew();
        await Task.Delay(1000, ct);
        var b = new Dictionary<string, (double ram, double cpuMs, int count, bool cpuKnown)>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in Process.GetProcesses())
        {
            using (p)
            {
                string name; long ram;
                try { name = p.ProcessName; ram = p.WorkingSet64; } catch { continue; }
                if (Skip.Contains(name)) continue;
                double? cpu = null;
                try { if (a.TryGetValue(p.Id, out var f) && f.name == name) cpu = (p.TotalProcessorTime - f.cpu).TotalMilliseconds; } catch { /* no access */ }
                var cur = b.GetValueOrDefault(name);
                b[name] = (cur.ram + ram / 1048576.0, cur.cpuMs + (cpu ?? 0), cur.count + 1, cur.cpuKnown || cpu != null);
            }
        }
        var elapsed = Math.Max(1, sw.Elapsed.TotalMilliseconds) * Environment.ProcessorCount;
        return b.Select(x => new ProcUsage(x.Key, Math.Round(x.Value.ram, 1), x.Value.cpuKnown ? Math.Round(Math.Min(100, 100.0 * x.Value.cpuMs / elapsed), 1) : null, x.Value.count)).ToList();
    }
}
