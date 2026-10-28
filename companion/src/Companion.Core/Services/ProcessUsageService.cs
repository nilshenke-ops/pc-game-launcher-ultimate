using System.Diagnostics;

namespace Pgl.Core.Services;

/// <summary>Memory and processor use of one program (all its processes together).</summary>
public sealed record ProcUsage(string Name, double RamMb, double? CpuPercent, int Count);

/// <summary>
/// "Welche Programme verbrauchen am meisten RAM?": measured only when asked (two looks one second apart for the processor
/// share), never in the background, and the result is kept for a few seconds so repeated questions do not measure again.
/// Read-only – nothing is closed here.
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
