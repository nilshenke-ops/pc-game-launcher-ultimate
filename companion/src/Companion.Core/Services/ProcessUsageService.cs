using System.Diagnostics;

namespace Pgl.Core.Services;

/// <summary>Memory and processor use of one program (all its processes together).</summary>
public sealed record ProcUsage(string Name, double RamMb, double? CpuPercent, int Count)
{
    /// <summary>False for Windows' own processes and this companion – the page offers no "close" for them.</summary>
    public bool Closable => !ProcessUsageService.IsProtected(Name);
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
    DateTime _at;

    public ProcessUsageService(Func<CancellationToken, Task<List<ProcUsage>>>? measure = null) => _measure = measure ?? MeasureAsync;

    public async Task<object> TopAsync(int n = 8, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            if (_last == null || DateTime.UtcNow - _at > TimeSpan.FromSeconds(5)) { _last = await _measure(ct); _at = DateTime.UtcNow; }
            return new
            {
                at = _at,
                ram = _last.OrderByDescending(p => p.RamMb).Take(n),
                cpu = _last.Where(p => p.CpuPercent != null).OrderByDescending(p => p.CpuPercent).Take(n),
                cores = Environment.ProcessorCount,
            };
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
