// FPS measurement on Windows with Intel PresentMon (open source, MIT, https://github.com/GameTechDev/PresentMon).
// PresentMon reads Windows' own event tracing (ETW) of presented frames – it does not inject anything into a game, so it does not
// touch anti-cheat protection. It is built into the companion EXE by the release build (scripts/publish-companion.ps1 downloads a
// fixed version and checks Intel's signature); here it is unpacked once and its signature is checked again before every start.
//
// Windows only lets administrators and members of the group "Performance Log Users" (S-1-5-32-559) read these events. If the
// user is neither, the companion says so and offers a one-time "Erlauben": Windows asks (UAC) and the user is added to that group;
// it takes effect at the next sign-in. Nothing else on the system is changed.
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Security.Principal;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Windows;

sealed class PresentMonCapture : IFrameCapture
{
    const string Resource = "PresentMon.exe";
    const string SessionName = "NexusGamingHubFps";
    static readonly SecurityIdentifier PerfLogUsers = new("S-1-5-32-559");
    readonly object _lock = new();
    Process? _proc;
    string? _exe;
    string? _exeProblem;
    bool _asked;

    string? Exe()
    {
        if (_exe != null || _exeProblem != null) return _exe;
        try
        {
            using var res = Assembly.GetExecutingAssembly().GetManifestResourceStream(Resource);
            if (res == null) { _exeProblem = "Diese Version des Begleiters enthält PresentMon nicht (selbst gebaut ohne den Release-Schritt). Die offizielle Version enthält es."; return null; }
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PCGameLauncher", "tools");
            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, $"PresentMon-{res.Length}.exe");
            if (!File.Exists(path) || new FileInfo(path).Length != res.Length)
            {
                var tmp = path + ".tmp";
                using (var f = File.Create(tmp)) res.CopyTo(f);
                File.Move(tmp, path, true);
            }
            if (SignatureProblem(path) is { } bad) { _exeProblem = bad; try { File.Delete(path); } catch { } return null; }
            _exe = path;
        }
        catch (Exception ex) { _exeProblem = "PresentMon konnte nicht vorbereitet werden: " + ex.Message; }
        return _exe;
    }

    public string? Unavailable => Exe() == null ? _exeProblem : null;

    public string? PermissionProblem
    {
        get
        {
            using var id = WindowsIdentity.GetCurrent();
            var p = new WindowsPrincipal(id);
            if (p.IsInRole(WindowsBuiltInRole.Administrator) || p.IsInRole(PerfLogUsers)) return null;
            return _asked
                ? "Erlaubt – wirksam ab der nächsten Windows-Anmeldung. Einmal abmelden und wieder anmelden (oder neu starten), danach misst der Begleiter die FPS von selbst."
                : "Windows erlaubt das Mitlesen der Bildausgabe nur Administratoren und der Gruppe „Leistungsprotokollbenutzer“. Einmal „Erlauben“ – Windows fragt nach, danach misst der Begleiter FPS ohne weitere Einrichtung.";
        }
    }

    public bool CanRequestPermission => !_asked;

    public string RequestPermission()
    {
        try
        {
            var user = WindowsIdentity.GetCurrent().Name.Replace("'", "''");
            // Only this: the current user into the built-in group "Performance Log Users" (by SID, so it works in every Windows language).
            var ps = $"Add-LocalGroupMember -SID 'S-1-5-32-559' -Member '{user}' -ErrorAction SilentlyContinue";
            var psi = new ProcessStartInfo("powershell.exe", $"-NoProfile -NonInteractive -WindowStyle Hidden -Command \"{ps}\"") { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
            using var p = Process.Start(psi);
            p?.WaitForExit(30_000);
            if (p is { HasExited: true, ExitCode: not 0 }) return "Windows hat die Änderung nicht übernommen (Code " + p.ExitCode + ").";
            _asked = true;
            Log.Info("fps", "Benutzer zur Gruppe Leistungsprotokollbenutzer hinzugefügt (Bestätigung per UAC).");
            return "Erlaubt. Bitte einmal von Windows abmelden und wieder anmelden – danach startet die FPS-Messung von selbst mit jedem Spiel.";
        }
        catch (System.ComponentModel.Win32Exception) { return "Abgebrochen – Windows hat nicht nach Erlaubnis gefragt oder du hast „Nein“ gewählt."; }
        catch (Exception ex) { return "Nicht möglich: " + ex.Message; }
    }

    public void Start(Action<string> line, Action<string?> ended)
    {
        lock (_lock)
        {
            Stop();
            var exe = Exe();
            if (exe == null) { ended(_exeProblem); return; }
            if (SignatureProblem(exe) is { } bad) { ended(bad); return; }
            var psi = new ProcessStartInfo(exe)
            {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
            };
            foreach (var a in new[] { "--output_stdout", "--no_console_stats", "--session_name", SessionName, "--stop_existing_session", "--exclude", "dwm.exe" }) psi.ArgumentList.Add(a);
            var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
            var err = new System.Text.StringBuilder();
            p.OutputDataReceived += (_, e) => { if (e.Data != null) line(e.Data); };
            p.ErrorDataReceived += (_, e) => { if (e.Data != null && err.Length < 2000) err.AppendLine(e.Data); };
            p.Exited += (_, _) =>
            {
                lock (_lock) if (_proc != p) return;   // stopped on purpose
                var msg = err.ToString().Trim();
                ended(Explain(p.ExitCode, msg));
            };
            p.Start();
            p.BeginOutputReadLine(); p.BeginErrorReadLine();
            try { p.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
            _proc = p;
        }
    }

    static string Explain(int code, string msg)
    {
        if (msg.Contains("access", StringComparison.OrdinalIgnoreCase) || msg.Contains("Performance Log Users", StringComparison.OrdinalIgnoreCase) || code == 5)
            return "Keine Berechtigung für die Messung (Gruppe „Leistungsprotokollbenutzer“ fehlt).";
        return "Die FPS-Messung wurde beendet" + (msg.Length > 0 ? ": " + msg.Split('\n')[0] : $" (Code {code}).");
    }

    public void Stop()
    {
        lock (_lock)
        {
            var p = _proc; _proc = null;
            if (p == null) return;
            try { if (!p.HasExited) { p.Kill(); p.WaitForExit(3000); } } catch (Exception ex) { Log.Warn("fps", ex.Message); }
            p.Dispose();
        }
    }

    // ------------------------------------------------------------------ signature check
    [DllImport("wintrust.dll", ExactSpelling = true, SetLastError = false, CharSet = CharSet.Unicode)]
    static extern uint WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid action, IntPtr data);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct WINTRUST_FILE_INFO { public uint cbStruct; public string pcwszFilePath; public IntPtr hFile; public IntPtr pgKnownSubject; }
    [StructLayout(LayoutKind.Sequential)]
    struct WINTRUST_DATA
    {
        public uint cbStruct; public IntPtr pPolicyCallbackData, pSIPClientData; public uint dwUIChoice, fdwRevocationChecks, dwUnionChoice;
        public IntPtr pFile; public uint dwStateAction; public IntPtr hWVTStateData; public IntPtr pwszURLReference; public uint dwProvFlags, dwUIContext; public IntPtr pSignatureSettings;
    }
    static readonly Guid GenericVerifyV2 = new("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

    /// <summary>Null when the file carries a valid Authenticode signature by Intel; otherwise why it is refused.</summary>
    static string? SignatureProblem(string path)
    {
        var fi = new WINTRUST_FILE_INFO { cbStruct = (uint)Marshal.SizeOf<WINTRUST_FILE_INFO>(), pcwszFilePath = path };
        var pFile = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_FILE_INFO>());
        var pData = Marshal.AllocHGlobal(Marshal.SizeOf<WINTRUST_DATA>());
        try
        {
            Marshal.StructureToPtr(fi, pFile, false);
            var d = new WINTRUST_DATA { cbStruct = (uint)Marshal.SizeOf<WINTRUST_DATA>(), dwUIChoice = 2 /*none*/, fdwRevocationChecks = 0, dwUnionChoice = 1 /*file*/, pFile = pFile, dwStateAction = 0, dwProvFlags = 0x80 /*cache only url retrieval*/ };
            Marshal.StructureToPtr(d, pData, false);
            var r = WinVerifyTrust(IntPtr.Zero, GenericVerifyV2, pData);
            if (r != 0) return $"PresentMon wurde nicht gestartet: die Signatur der Datei ist ungültig (0x{r:X8}).";
#pragma warning disable SYSLIB0057
            var cert = X509Certificate.CreateFromSignedFile(path);
#pragma warning restore SYSLIB0057
            if (!cert.Subject.Contains("Intel Corporation", StringComparison.OrdinalIgnoreCase)) return "PresentMon wurde nicht gestartet: die Datei ist nicht von Intel signiert.";
            return null;
        }
        catch (Exception ex) { return "PresentMon wurde nicht gestartet: Signatur nicht prüfbar (" + ex.Message + ")."; }
        finally { Marshal.FreeHGlobal(pFile); Marshal.FreeHGlobal(pData); }
    }
}

/// <summary>Read/write speed and activity per drive letter from the "LogicalDisk" performance counters (like Task Manager).</summary>
sealed class WindowsDiskActivity : IDiskActivity
{
    Dictionary<string, (System.Diagnostics.CounterSample rd, System.Diagnostics.CounterSample wr, System.Diagnostics.CounterSample idle)>? _last;
    bool _broken;
    public bool Supported => !_broken;

    public List<Pgl.Core.Platform.DiskIo> Read()
    {
        if (_broken) return new();
        try
        {
            var data = new PerformanceCounterCategory("LogicalDisk").ReadCategory();
            InstanceDataCollection? R(string n) => data.Contains(n) ? data[n] : null;
            var rd = R("Disk Read Bytes/sec"); var wr = R("Disk Write Bytes/sec"); var idle = R("% Idle Time");
            if (rd == null || wr == null || idle == null) { _broken = true; return new(); }
            var cur = new Dictionary<string, (System.Diagnostics.CounterSample, System.Diagnostics.CounterSample, System.Diagnostics.CounterSample)>();
            foreach (InstanceData i in rd.Values)
            {
                var n = i.InstanceName;
                if (n == "_Total" || n.StartsWith("HarddiskVolume", StringComparison.OrdinalIgnoreCase) || wr[n] == null || idle[n] == null) continue;
                cur[n] = (i.Sample, wr[n].Sample, idle[n].Sample);
            }
            var list = new List<Pgl.Core.Platform.DiskIo>();
            foreach (var (n, v) in cur)
                if (_last != null && _last.TryGetValue(n, out var o))
                    list.Add(new(n, Math.Round(System.Diagnostics.CounterSample.Calculate(o.rd, v.Item1)), Math.Round(System.Diagnostics.CounterSample.Calculate(o.wr, v.Item2)),
                        Math.Round(Math.Clamp(100 - System.Diagnostics.CounterSample.Calculate(o.idle, v.Item3), 0, 100), 1)));
                else list.Add(new(n, null, null, null));
            _last = cur;
            return list;
        }
        catch (Exception ex) { _broken = true; Log.Warn("monitor", "Laufwerks-Leistungsindikatoren nicht verfügbar: " + ex.Message); return new(); }
    }

    /// <summary>Health per physical drive from Windows' storage cmdlets (SMART values where the drive reports them).</summary>
    public async Task<List<Pgl.Core.Platform.DriveHealth>?> HealthAsync(CancellationToken ct)
    {
        const string ps = "Get-PhysicalDisk | ForEach-Object { $r = $_ | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue; [pscustomobject]@{ n=$_.FriendlyName; m=[string]$_.MediaType; h=[string]$_.HealthStatus; t=$r.Temperature; w=$r.Wear; re=$r.ReadErrorsTotal; we=$r.WriteErrorsTotal; p=$r.PowerOnHours } } | ConvertTo-Json -Compress";
        try
        {
            var psi = new ProcessStartInfo("powershell.exe", $"-NoProfile -NonInteractive -Command \"{ps}\"") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using var p = Process.Start(psi)!;
            var text = await p.StandardOutput.ReadToEndAsync(ct);
            await p.WaitForExitAsync(ct);
            if (string.IsNullOrWhiteSpace(text)) return null;
            using var doc = System.Text.Json.JsonDocument.Parse(text);
            var arr = doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array ? doc.RootElement.EnumerateArray().ToList() : new() { doc.RootElement };
            static double? D(System.Text.Json.JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number ? v.GetDouble() : null;
            static long? L(System.Text.Json.JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number ? v.GetInt64() : null;
            static string? S(System.Text.Json.JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String ? v.GetString() : null;
            // A temperature of 0 means "not reported", not 0 °C.
            return arr.Select(e => new Pgl.Core.Platform.DriveHealth(S(e, "n") ?? "?", S(e, "m"), S(e, "h"), D(e, "t") is > 0 and var t ? t : null, D(e, "w"), L(e, "re"), L(e, "we"), L(e, "p"))).ToList();
        }
        catch (Exception ex) { Log.Warn("monitor", "Laufwerkszustand: " + ex.Message); return null; }
    }
}

/// <summary>
/// Which programs use the graphics card: the "GPU Engine" counters per process (busiest engine type, like Task Manager's "GPU"
/// column) and "GPU Process Memory" (dedicated graphics memory). Read only when someone opens the list.
/// </summary>
sealed class WindowsGpuProcesses : IGpuProcesses
{
    bool _broken;
    public bool Supported => !_broken;

    static int Pid(string instance) { var i = instance.IndexOf("pid_", StringComparison.Ordinal); if (i < 0) return -1; var j = instance.IndexOf('_', i + 4); return int.TryParse(instance[(i + 4)..(j < 0 ? instance.Length : j)], out var p) ? p : -1; }

    public async Task<List<GpuProcUsage>?> ReadAsync(CancellationToken ct)
    {
        if (_broken) return null;
        try
        {
            static Dictionary<string, CounterSample> Snap()
            {
                var d = new Dictionary<string, CounterSample>();
                var data = new PerformanceCounterCategory("GPU Engine").ReadCategory()["Utilization Percentage"];
                if (data != null) foreach (InstanceData i in data.Values) d[i.InstanceName] = i.Sample;
                return d;
            }
            var a = await Task.Run(Snap, ct);
            await Task.Delay(1000, ct);
            var b = await Task.Run(Snap, ct);
            // per process and engine type (3D, Copy, VideoDecode …): sum over engines of that type; the process value is its busiest type
            var perType = new Dictionary<(int pid, string type), double>();
            foreach (var (inst, s2) in b)
            {
                if (!a.TryGetValue(inst, out var s1)) continue;
                var pid = Pid(inst); if (pid <= 0) continue;
                var t = inst.LastIndexOf("engtype_", StringComparison.Ordinal) is var k and >= 0 ? inst[(k + 8)..] : "?";
                perType[(pid, t)] = perType.GetValueOrDefault((pid, t)) + CounterSample.Calculate(s1, s2);
            }
            var util = perType.GroupBy(x => x.Key.pid).ToDictionary(g => g.Key, g => Math.Min(100, g.Max(x => x.Value)));
            var vram = new Dictionary<int, double>();
            try
            {
                var mem = new PerformanceCounterCategory("GPU Process Memory").ReadCategory()["Dedicated Usage"];
                if (mem != null) foreach (InstanceData i in mem.Values) { var pid = Pid(i.InstanceName); if (pid > 0) vram[pid] = vram.GetValueOrDefault(pid) + i.RawValue / 1048576.0; }
            }
            catch { /* older Windows: no per-process graphics memory */ }
            var names = new Dictionary<int, string>();
            foreach (var pid in util.Keys.Concat(vram.Keys).Distinct())
                try { using var p = Process.GetProcessById(pid); names[pid] = p.ProcessName; } catch { /* ended meanwhile */ }
            return names.GroupBy(n => n.Value, StringComparer.OrdinalIgnoreCase).Select(g =>
            {
                var pids = g.Select(x => x.Key).ToList();
                double? u = pids.Any(util.ContainsKey) ? Math.Round(Math.Min(100, pids.Sum(p => util.GetValueOrDefault(p))), 1) : null;
                double? v = pids.Any(vram.ContainsKey) ? Math.Round(pids.Sum(p => vram.GetValueOrDefault(p))) : null;
                return new GpuProcUsage(g.Key, u, v, pids.Count);
            }).Where(x => x.GpuPercent is > 0.05 || x.VramMb is >= 1).ToList();
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) { _broken = true; Log.Warn("procs", "GPU-Leistungsindikatoren je Programm nicht verfügbar: " + ex.Message); return null; }
    }
}
