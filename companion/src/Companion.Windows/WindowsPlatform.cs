using System.ComponentModel;
using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Windows;

/// <summary>Native Windows implementation of all platform services.</summary>
sealed class WindowsPlatform : IPlatform
{
    public WindowsPlatform(UiInvoker ui, Func<TrayIcon?> tray)
    {
        Desktop = new WindowsDesktop(ui, tray);
        Hotkeys = new HotkeyRegistrar(ui);
        OverlayWindows = new WindowsOverlay(ui, Metrics);
    }

    public string Name => $"Windows {Environment.OSVersion.Version}";
    public ILauncher Launcher { get; } = new WindowsLauncher();
    public IProcessSource Processes { get; } = new WindowsProcessSource();
    public IAudioEngine Audio { get; } = new NAudioEngine();
    public IHotkeyRegistrar Hotkeys { get; }
    public IMetricsSource Metrics { get; } = new WindowsMetrics();
    public IAutostart Autostart { get; } = new WindowsAutostart();
    public ISecretProtector Secrets { get; } = new DpapiProtector();
    public IDesktopIntegration Desktop { get; }
    public IEnumerable<IDetector> Detectors { get; } = new IDetector[] { new SteamDetector(SteamDetector.DefaultRoots()), new EpicDetector(EpicDetector.DefaultManifestDir()) };
    public IUpdateInstaller UpdateInstaller { get; } = new SelfReplaceInstaller();
    public IPowerControl Power { get; } = new WindowsPower();
    public WindowsOverlay OverlayWindows { get; }
    public IOverlay Overlay => OverlayWindows;
    public IKeySender KeySender { get; } = new WindowsKeySender();
    public IGameMode GameMode { get; } = new WindowsGameMode();
}

/// <summary>Runs code on the WinForms UI thread.</summary>
public sealed class UiInvoker(Control control)
{
    public T Invoke<T>(Func<T> f) => control.InvokeRequired ? (T)control.Invoke(f) : f();
    public void Invoke(Action a) { if (control.InvokeRequired) control.Invoke(a); else a(); }
    public void Post(Action a) { try { control.BeginInvoke(a); } catch (InvalidOperationException) { } }
}

sealed class WindowsLauncher : ILauncher
{
    public LaunchResult Launch(LibraryItem item)
    {
        try
        {
            switch (item.Source)
            {
                case LaunchSource.Exe:
                    if (!File.Exists(item.Target)) return new LaunchResult(false, $"Datei nicht gefunden: {item.Target}. Wurde das Programm verschoben oder deinstalliert?", "not-found");
                    var psi = new ProcessStartInfo(item.Target)
                    {
                        UseShellExecute = true, // required for .lnk and for programs that request elevation themselves
                        Arguments = item.Args ?? "",
                        WorkingDirectory = item.WorkingDir ?? Path.GetDirectoryName(item.Target)!,
                    };
                    Process.Start(psi)?.Dispose();
                    return new LaunchResult(true, "Gestartet");
                case LaunchSource.Steam:
                    Process.Start(new ProcessStartInfo($"steam://rungameid/{item.Target}") { UseShellExecute = true })?.Dispose();
                    return new LaunchResult(true, "An Steam übergeben");
                case LaunchSource.Epic:
                    var p = item.Target.Split(':');
                    var id = p.Length == 3 ? $"{p[0]}%3A{p[1]}%3A{p[2]}" : p[^1];
                    Process.Start(new ProcessStartInfo($"com.epicgames.launcher://apps/{id}?action=launch&silent=true") { UseShellExecute = true })?.Dispose();
                    return new LaunchResult(true, "An Epic Games Launcher übergeben");
                case LaunchSource.AppsFolder:
                    var explorer = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
                    var start = new ProcessStartInfo(explorer) { UseShellExecute = false };
                    start.ArgumentList.Add(@"shell:AppsFolder\" + item.Target);
                    Process.Start(start)?.Dispose();
                    return new LaunchResult(true, "Gestartet");
            }
            return new LaunchResult(false, "Unbekannte Startmethode.", "invalid-target");
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1155)
        {
            var who = item.Source == LaunchSource.Steam ? "Steam" : item.Source == LaunchSource.Epic ? "Epic Games Launcher" : "das zugehörige Programm";
            return new LaunchResult(false, $"{who} ist auf diesem PC nicht installiert.", "launcher-missing");
        }
        catch (Win32Exception ex) when (ex.NativeErrorCode == 1223)
        {
            return new LaunchResult(false, "Start wurde in der Windows-Sicherheitsabfrage abgebrochen.", "cancelled");
        }
    }

    public string? ValidateExecutable(string path)
    {
        if (!File.Exists(path)) return "Datei existiert nicht.";
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is not (".exe" or ".lnk")) return "Nur .exe- und .lnk-Dateien können freigegeben werden.";
        var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
        // Command interpreters would turn the allow list into arbitrary command execution.
        if (name is "cmd" or "powershell" or "pwsh" or "wscript" or "cscript" or "mshta" or "rundll32" or "regsvr32" or "wsl" or "bash")
            return "Kommandozeilen und Skript-Hosts können aus Sicherheitsgründen nicht freigegeben werden.";
        return null;
    }

    public string? ExtractIcon(string path)
    {
        using var icon = Icon.ExtractAssociatedIcon(path);
        if (icon == null) return null;
        using var bmp = new Bitmap(icon.ToBitmap(), new Size(48, 48));
        using var ms = new MemoryStream();
        bmp.Save(ms, ImageFormat.Png);
        return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
    }
}

sealed class WindowsProcessSource : IProcessSource
{
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder name, ref int size);
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    readonly ProcessPathCache _paths = new();
    readonly StringBuilder _sb = new(1024);
    readonly object _lock = new();

    public IReadOnlyList<ProcessInfo> Snapshot() => Snapshot(withPaths: true);

    public IReadOnlyList<ProcessInfo> Snapshot(bool withPaths)
    {
        var current = new List<(int pid, string name)>();
        foreach (var p in Process.GetProcesses())
            using (p) { try { current.Add((p.Id, p.ProcessName)); } catch { /* exited meanwhile */ } }
        if (!withPaths) return current.Select(c => new ProcessInfo(c.pid, c.name, null)).ToList();
        // Each process is opened only the first time it is seen (not ~300 handles every scan).
        lock (_lock) return _paths.Resolve(current, PathOf);
    }

    string? PathOf(int pid)
    {
        var h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return null;
        try { int size = _sb.Capacity; return QueryFullProcessImageName(h, 0, _sb, ref size) ? _sb.ToString(0, size) : null; }
        finally { CloseHandle(h); }
    }
}

sealed class WindowsAutostart : IAutostart
{
    const string Key = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string Name = "PCGameLauncherUltimate";
    public bool Supported => true;

    public bool IsEnabled()
    {
        using var k = Registry.CurrentUser.OpenSubKey(Key);
        return k?.GetValue(Name) is string v && v.Contains(Environment.ProcessPath ?? "\0", StringComparison.OrdinalIgnoreCase);
    }

    public string? SetEnabled(bool enabled)
    {
        try
        {
            using var k = Registry.CurrentUser.CreateSubKey(Key);
            if (enabled) k.SetValue(Name, $"\"{Environment.ProcessPath}\" --minimized");
            else k.DeleteValue(Name, false);
            return null;
        }
        catch (Exception ex) { return "Autostart konnte nicht geändert werden: " + ex.Message; }
    }
}

sealed class DpapiProtector : ISecretProtector
{
    public string Description => "Mit Windows-Datenschutz (DPAPI, nur dieses Benutzerkonto) verschlüsselt.";
    public string Protect(string plain) => "dpapi:" + Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), null, DataProtectionScope.CurrentUser));
    public string? Unprotect(string v)
    {
        try
        {
            if (v.StartsWith("dpapi:")) return Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(v[6..]), null, DataProtectionScope.CurrentUser));
            if (v.StartsWith("plain:")) return v[6..];
        }
        catch (CryptographicException) { }
        return null;
    }
}

sealed class WindowsDesktop(UiInvoker ui, Func<TrayIcon?> tray) : IDesktopIntegration
{
    public bool CanPickFiles => true;

    public Task<string?> PickExecutableAsync()
    {
        var tcs = new TaskCompletionSource<string?>();
        ui.Post(() =>
        {
            using var dlg = new OpenFileDialog
            {
                Title = "Programm oder Spiel freigeben",
                Filter = "Programme und Verknüpfungen (*.exe;*.lnk)|*.exe;*.lnk",
                DereferenceLinks = false,
                CheckFileExists = true,
            };
            tcs.TrySetResult(dlg.ShowDialog() == DialogResult.OK ? dlg.FileName : null);
        });
        return tcs.Task;
    }

    public void OpenFolder(string path)
    {
        if (!Directory.Exists(path)) return;
        var psi = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe")) { UseShellExecute = false };
        psi.ArgumentList.Add(path);
        Process.Start(psi)?.Dispose();
    }

    public void ShowPairingRequest(string deviceName) => ui.Post(() => tray()?.PairingRequest(deviceName));
    public void ShowToast(string title, string message) => ui.Post(() => tray()?.Balloon(title, message));

    public bool CanListApps => true;

    /// <summary>Opens the product page in the Xbox app (Game Pass install); falls back to the Microsoft Store app.</summary>
    public string? OpenStoreProduct(string productId)
    {
        if (GamePassService.ValidProductId(productId) == null) return "Ungültige Produkt-ID.";
        foreach (var uri in new[] { $"msxbox://game/?productId={productId}", $"ms-windows-store://pdp/?productid={productId}" })
        {
            try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true })?.Dispose(); return null; }
            catch (Win32Exception) { /* app/protocol not installed – try the next one */ }
        }
        return "Weder die Xbox-App noch der Microsoft Store sind installiert.";
    }

    /// <summary>Hands the install request to the Epic Games Launcher (com.epicgames.launcher://apps/…?action=install).</summary>
    public string? OpenEpicInstall(string epicId)
    {
        if (LaunchValidator.ValidateTarget(LaunchSource.Epic, epicId) != null || epicId.Split(':').Length != 3) return "Ungültige Epic-Kennung.";
        try { Process.Start(new ProcessStartInfo($"com.epicgames.launcher://apps/{epicId.Replace(":", "%3A")}?action=install") { UseShellExecute = true })?.Dispose(); return null; }
        catch (Win32Exception) { return "Der Epic Games Launcher ist auf diesem PC nicht installiert."; }
    }

    /// <summary>Hands the install request to the Steam client (steam://install/&lt;appid&gt;).</summary>
    public string? OpenSteamInstall(string appId)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(appId, @"^\d{1,10}$")) return "Ungültige Steam-App-ID.";
        try { Process.Start(new ProcessStartInfo($"steam://install/{appId}") { UseShellExecute = true })?.Dispose(); return null; }
        catch (Win32Exception) { return "Steam ist auf diesem PC nicht installiert."; }
    }

    /// <summary>Lists start-menu apps (desktop, Microsoft Store and Xbox) through the shell's AppsFolder.</summary>
    public IReadOnlyList<DetectedItem> StartMenuApps()
    {
        var result = new List<DetectedItem>();
        var t = new Thread(() =>
        {
            try
            {
                var type = Type.GetTypeFromProgID("Shell.Application");
                if (type == null) return;
                dynamic shell = Activator.CreateInstance(type)!;
                dynamic folder = shell.NameSpace("shell:AppsFolder");
                foreach (dynamic item in folder.Items())
                {
                    string name = item.Name;
                    string id = item.Path;
                    if (string.IsNullOrWhiteSpace(id) || id.StartsWith("http", StringComparison.OrdinalIgnoreCase)) continue;
                    var ext = Path.GetExtension(id).ToLowerInvariant();
                    if (ext is ".url" or ".chm" or ".txt" or ".html" or ".htm" or ".pdf" or ".ini") continue;
                    if (LaunchValidator.ValidateTarget(LaunchSource.AppsFolder, id) != null) continue;
                    var isStore = id.Contains('!');
                    result.Add(new DetectedItem("apps:" + id, ItemKind.Program, name, LaunchSource.AppsFolder, id, null,
                        ext == ".exe" ? new List<string> { Path.GetFileNameWithoutExtension(id) } : new List<string>(), null,
                        isStore ? "Microsoft Store / Xbox" : "Startmenü", false));
                }
            }
            catch (Exception ex) { Log.Warn("detect", "Startmenü-Apps nicht lesbar: " + ex.Message); }
        });
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
        t.Join(TimeSpan.FromSeconds(20));
        return result.OrderBy(r => r.Name).ToList();
    }
}

/// <summary>
/// Windows allows renaming a running executable. The update is installed by renaming the current file to *.old,
/// moving the verified download into place and starting it. The old file is removed on the next start.
/// </summary>
/// <summary>Power actions with the means Windows itself offers (no administrator rights needed for the current user).</summary>
sealed class WindowsPower : IPowerControl
{
    [DllImport("user32.dll", SetLastError = true)] static extern bool LockWorkStation();
    [DllImport("powrprof.dll", SetLastError = true)] static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);
    public bool Supported => true;

    public string? Run(string action, int delaySeconds)
    {
        var delay = Math.Clamp(delaySeconds, 0, 600).ToString(System.Globalization.CultureInfo.InvariantCulture);
        static string? Shutdown(params string[] args)
        {
            using var p = Process.Start(new ProcessStartInfo("shutdown.exe") { UseShellExecute = false, CreateNoWindow = true }.With(args));
            p?.WaitForExit(5000);
            return p == null ? "shutdown.exe konnte nicht gestartet werden." : p.ExitCode == 0 ? null : p.ExitCode == 1116 ? "Es war kein Herunterfahren geplant." : $"Windows meldet Fehler {p.ExitCode}.";
        }
        switch (action)
        {
            case "lock": return LockWorkStation() ? null : "PC konnte nicht gesperrt werden.";
            case "sleep": return SetSuspendState(false, false, false) ? null : "Energiesparen nicht möglich (evtl. in Windows deaktiviert).";
            case "restart": return Shutdown("/r", "/t", delay, "/c", "PC Game Launcher: Neustart angefordert");
            case "shutdown": return Shutdown("/s", "/t", delay, "/c", "PC Game Launcher: Herunterfahren angefordert");
            case "cancel": return Shutdown("/a");
            default: return "Unbekannte Aktion.";
        }
    }
}

static class PsiExtensions
{
    public static ProcessStartInfo With(this ProcessStartInfo psi, string[] args) { foreach (var a in args) psi.ArgumentList.Add(a); return psi; }
}

sealed class SelfReplaceInstaller : IUpdateInstaller
{
    public bool Supported => Environment.ProcessPath?.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) == true;
    static string Exe => Environment.ProcessPath!;
    static string Old => Exe + ".old";
    public bool CanRollback => Supported && File.Exists(Old);

    /// <summary>Keeps the running version as "&lt;exe&gt;.old", copies the new file in place and restarts.
    /// If copying fails, the old file is moved back – the installed version stays usable. No administrator rights are
    /// needed as long as the program folder is writable for the user (e.g. Documents, Desktop, own folder).</summary>
    public string? Install(string newFile)
    {
        var exe = Exe;
        try
        {
            if (File.Exists(Old)) File.Delete(Old);
            File.Move(exe, Old);
            try { File.Copy(newFile, exe); }
            catch { File.Move(Old, exe); throw; }
            Restart(exe);
            return null;
        }
        catch (Exception ex) { return "Installation fehlgeschlagen (Ordner evtl. schreibgeschützt – Programm z. B. nach Dokumente verschieben): " + ex.Message; }
    }

    /// <summary>Swaps current and previous version (the current one becomes "&lt;exe&gt;.old", so this can be undone again).</summary>
    public string? Rollback()
    {
        if (!CanRollback) return "Keine vorherige Version vorhanden.";
        var exe = Exe; var tmp = exe + ".swap";
        try
        {
            if (File.Exists(tmp)) File.Delete(tmp);
            File.Move(exe, tmp);
            try { File.Move(Old, exe); }
            catch { File.Move(tmp, exe); throw; }
            File.Move(tmp, Old);
            Restart(exe);
            return null;
        }
        catch (Exception ex) { return "Zurücksetzen fehlgeschlagen: " + ex.Message; }
    }

    static void Restart(string exe)
    {
        Process.Start(new ProcessStartInfo(exe, "--updated") { UseShellExecute = false })?.Dispose();
        Program.RequestExit();
    }
}

sealed class WindowsMetrics : IMetricsSource
{
    [StructLayout(LayoutKind.Sequential)] struct FILETIME { public uint Low, High; public ulong V => ((ulong)High << 32) | Low; }
    [DllImport("kernel32.dll")] static extern bool GetSystemTimes(out FILETIME idle, out FILETIME kernel, out FILETIME user);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    sealed class MEMORYSTATUSEX
    {
        public uint dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>();
        public uint dwMemoryLoad; public ulong ullTotalPhys, ullAvailPhys, ullTotalPageFile, ullAvailPageFile, ullTotalVirtual, ullAvailVirtual, ullAvailExtendedVirtual;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)] static extern bool GlobalMemoryStatusEx([In, Out] MEMORYSTATUSEX m);

    (ulong idle, ulong total)? _lastCpu;
    readonly string? _cpuName = ReadCpuName();
    readonly List<string> _gpuNames = ReadGpuNames();
    readonly NvidiaSmiStream? _smi = FindNvidiaSmi() is { } exe ? new NvidiaSmiStream(exe) : null;
    Dictionary<string, CounterSample>? _lastGpu;
    DateTime _lastCounters = DateTime.MinValue;
    double? _counterCache;
    bool _gpuCountersBroken;

    public MetricsSample Sample()
    {
        var s = new MetricsSample { CpuName = _cpuName, CpuCores = Environment.ProcessorCount, CpuTempSource = "Nicht verfügbar – Windows stellt die CPU-Temperatur ohne Hersteller-Treiber bzw. Administratorrechte nicht zuverlässig bereit." };
        if (GetSystemTimes(out var idle, out var kernel, out var user))
        {
            ulong total = kernel.V + user.V; // kernel time includes idle
            if (_lastCpu is { } l && total > l.total) s.CpuPercent = Math.Round(100.0 * (1 - (double)(idle.V - l.idle) / (total - l.total)), 1);
            _lastCpu = (idle.V, total);
            s.Sources["cpu"] = "GetSystemTimes";
        }
        var m = new MEMORYSTATUSEX();
        if (GlobalMemoryStatusEx(m))
        {
            s.MemTotalBytes = (long)m.ullTotalPhys;
            s.MemUsedBytes = (long)(m.ullTotalPhys - m.ullAvailPhys);
            s.Sources["ram"] = "GlobalMemoryStatusEx";
        }
        s.UptimeHours = Math.Round(Environment.TickCount64 / 3_600_000.0, 1);
        s.Disks = DiskInfo.ReadCached(TimeSpan.FromSeconds(60)); // free space changes slowly; avoids waking sleeping disks
        s.Gpus = SampleGpus();
        return s;
    }

    List<GpuSample> SampleGpus()
    {
        // NVIDIA: one nvidia-smi keeps running in loop mode while values are needed (instead of starting a new
        // process every few seconds) and ends itself 30 s after the last request.
        if (_smi?.Latest() is { Count: > 0 } smi) return smi;
        // Others: Windows "GPU Engine" performance counters (same source as Task Manager), no temperature.
        // Reading them is expensive (hundreds of instances), so at most every 4 s.
        if (DateTime.UtcNow - _lastCounters > TimeSpan.FromSeconds(4)) { _lastCounters = DateTime.UtcNow; _counterCache = GpuEngineUtilization(); }
        var util = _counterCache;
        var list = new List<GpuSample>();
        if (_gpuNames.Count == 0 && util == null) return list;
        var name = _gpuNames.Count == 1 ? _gpuNames[0] : string.Join(" / ", _gpuNames);
        list.Add(new GpuSample { Name = name.Length > 0 ? name : "GPU", UtilPercent = util, Source = util == null ? "Name aus Registry; Auslastung nicht verfügbar" : "Leistungsindikatoren „GPU Engine“" });
        return list;
    }

    double? GpuEngineUtilization()
    {
        if (_gpuCountersBroken) return null;
        try
        {
            var cat = new PerformanceCounterCategory("GPU Engine");
            var data = cat.ReadCategory()["Utilization Percentage"];
            if (data == null) return null;
            var current = new Dictionary<string, CounterSample>();
            foreach (InstanceData d in data.Values) current[d.InstanceName] = d.Sample;
            double? result = null;
            if (_lastGpu != null)
            {
                var perEngine = new Dictionary<string, double>();
                foreach (var (inst, sample) in current)
                {
                    if (!_lastGpu.TryGetValue(inst, out var prev)) continue;
                    var v = CounterSample.Calculate(prev, sample);
                    var luid = inst.Contains("_luid_") ? inst[inst.IndexOf("_luid_")..] : inst;
                    var key = luid[..(luid.IndexOf("_eng_") is var e and > 0 ? e : luid.Length)] + inst[(inst.LastIndexOf("engtype_") is var t and >= 0 ? t : 0)..];
                    perEngine[key] = perEngine.GetValueOrDefault(key) + v;
                }
                if (perEngine.Count > 0) result = Math.Round(Math.Min(100, perEngine.Values.Max()), 1);
            }
            _lastGpu = current;
            return result;
        }
        catch (Exception ex)
        {
            _gpuCountersBroken = true;
            Log.Warn("monitor", "GPU-Leistungsindikatoren nicht verfügbar: " + ex.Message);
            return null;
        }
    }

    static string? FindNvidiaSmi()
    {
        foreach (var p in new[] { Path.Combine(Environment.SystemDirectory, "nvidia-smi.exe"), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe") })
            if (File.Exists(p)) return p;
        return null;
    }

    static string? ReadCpuName()
    {
        try { using var k = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0"); return (k?.GetValue("ProcessorNameString") as string)?.Trim(); }
        catch { return null; }
    }

    static List<string> ReadGpuNames()
    {
        var names = new List<string>();
        try
        {
            using var cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}");
            if (cls == null) return names;
            foreach (var sub in cls.GetSubKeyNames().Where(n => n.Length == 4 && n.All(char.IsDigit)))
            {
                try
                {
                    using var k = cls.OpenSubKey(sub);
                    if (k?.GetValue("DriverDesc") is string d && !d.Contains("Basic Display") && !d.Contains("Remote")) names.Add(d);
                }
                catch { }
            }
        }
        catch { }
        return names.Distinct().ToList();
    }
}

/// <summary>
/// nvidia-smi in loop mode ("-lms 2000"): one long-running process prints a line per GPU every 2 s. Started on the
/// first request, stopped 30 s after the last one – so nothing runs while nobody looks at GPU values.
/// </summary>
sealed class NvidiaSmiStream(string exe)
{
    readonly object _lock = new();
    readonly Dictionary<int, GpuSample> _gpus = new();
    Process? _proc;
    DateTime _lastRequest, _lastLine;
    System.Threading.Timer? _idleTimer;
    bool _broken;

    public List<GpuSample>? Latest()
    {
        lock (_lock)
        {
            if (_broken) return null;
            _lastRequest = DateTime.UtcNow;
            if (_proc == null || _proc.HasExited) Start();
            // Values older than 10 s are not shown as current.
            return DateTime.UtcNow - _lastLine < TimeSpan.FromSeconds(10) ? _gpus.OrderBy(g => g.Key).Select(g => g.Value).ToList() : null;
        }
    }

    void Start()
    {
        try
        {
            var psi = new ProcessStartInfo(exe) { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
            psi.ArgumentList.Add(NvidiaSmi.Query);
            psi.ArgumentList.Add("--format=csv,noheader,nounits");
            psi.ArgumentList.Add("-lms");
            psi.ArgumentList.Add("2000");
            var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
            p.OutputDataReceived += (_, e) =>
            {
                if (e.Data is not { } line || NvidiaSmi.ParseLine(line) is not { } r) return;
                lock (_lock) { _gpus[r.index] = r.gpu; _lastLine = DateTime.UtcNow; }
            };
            p.Start();
            try { p.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
            p.BeginOutputReadLine();
            _proc = p;
            _idleTimer ??= new System.Threading.Timer(_ => StopIfIdle(), null, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(10));
        }
        catch (Exception ex) { _broken = true; Log.Warn("monitor", "nvidia-smi nicht nutzbar: " + ex.Message); }
    }

    void StopIfIdle()
    {
        lock (_lock)
        {
            if (_proc == null || DateTime.UtcNow - _lastRequest < TimeSpan.FromSeconds(30)) return;
            try { if (!_proc.HasExited) _proc.Kill(); } catch { }
            _proc.Dispose();
            _proc = null;
            _gpus.Clear();
        }
    }
}
