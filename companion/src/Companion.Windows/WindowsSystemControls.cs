using System.Diagnostics;
using NAudio.CoreAudioApi;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Volume and mute of the default output (Core Audio), battery (Windows power status), brightness of the built-in screen (WMI, laptops) and
/// the active power plan (powercfg). Each part is read on its own: what this PC does not have (no battery, an external monitor without
/// brightness control, a missing power plan) comes back as null and the page leaves it out.
/// </summary>
sealed class WindowsSystemControls : ISystemControls
{
    const string Saver = "a1841308-3541-4fab-bc81-f71556f20b4a", Balanced = "381b4222-f694-41f0-9685-ff5bb260df2e", Performance = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
    readonly object _lock = new();
    int? _brightness; string? _mode; DateTime _slowAt = DateTime.MinValue;

    public bool Supported => true;

    public SystemControlState Read()
    {
        int? volume = null; bool? muted = null;
        try
        {
            using var en = new MMDeviceEnumerator();
            using var dev = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
            volume = (int)Math.Round(dev.AudioEndpointVolume.MasterVolumeLevelScalar * 100);
            muted = dev.AudioEndpointVolume.Mute;
        }
        catch (Exception ex) { Log.Debug("controls", "Lautstärke nicht lesbar: " + ex.Message); }

        int? battery = null; bool? charging = null;
        try
        {
            var ps = SystemInformation.PowerStatus;
            if ((ps.BatteryChargeStatus & BatteryChargeStatus.NoSystemBattery) == 0 && ps.BatteryChargeStatus != BatteryChargeStatus.Unknown && ps.BatteryLifePercent is >= 0 and <= 1)
            {
                battery = (int)Math.Round(ps.BatteryLifePercent * 100);
                charging = ps.PowerLineStatus == PowerLineStatus.Online;
            }
        }
        catch (Exception ex) { Log.Debug("controls", "Akku nicht lesbar: " + ex.Message); }

        // Brightness and power plan need a helper process – read at most every 10 s.
        lock (_lock)
        {
            if (DateTime.UtcNow - _slowAt > TimeSpan.FromSeconds(10))
            {
                _slowAt = DateTime.UtcNow;
                _brightness = int.TryParse(Run("powershell.exe", "-NoProfile -NonInteractive -Command \"(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop | Select-Object -First 1).CurrentBrightness\"")?.Trim(), out var b) && b is >= 0 and <= 100 ? b : null;
                var scheme = Run("powercfg.exe", "/getactivescheme")?.ToLowerInvariant() ?? "";
                _mode = scheme.Contains(Saver) ? "saver" : scheme.Contains(Balanced) ? "balanced" : scheme.Contains(Performance) ? "performance" : null;
            }
            return new SystemControlState(volume, muted, _brightness, battery, charging, _mode);
        }
    }

    public string? Set(int? volume, bool? muted, int? brightness, string? powerMode)
    {
        try
        {
            if (volume != null || muted != null)
            {
                using var en = new MMDeviceEnumerator();
                using var dev = en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
                if (volume is { } v) dev.AudioEndpointVolume.MasterVolumeLevelScalar = Math.Clamp(v, 0, 100) / 100f;
                if (muted is { } m) dev.AudioEndpointVolume.Mute = m;
            }
        }
        catch (Exception ex) { return "Die Lautstärke ließ sich nicht ändern: " + ex.Message; }

        if (brightness is { } br)
        {
            var n = Math.Clamp(br, 0, 100); // a number only – nothing typed by anyone reaches the command line
            var outp = Run("powershell.exe", $"-NoProfile -NonInteractive -Command \"$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop | Select-Object -First 1; Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{Timeout=1;Brightness={n}}} | Out-Null; 'ok'\"");
            if (outp?.Trim() != "ok") return "Dieser Bildschirm lässt seine Helligkeit nicht von Windows regeln (meist bei externen Monitoren).";
            lock (_lock) _brightness = n;
        }

        if (powerMode != null)
        {
            var guid = powerMode switch { "saver" => Saver, "performance" => Performance, _ => Balanced };
            Run("powercfg.exe", "/setactive " + guid);
            var now = Run("powercfg.exe", "/getactivescheme")?.ToLowerInvariant() ?? "";
            if (!now.Contains(guid)) return "Diesen Energiesparplan gibt es auf diesem PC nicht (viele Notebooks haben nur „Ausbalanciert“).";
            lock (_lock) _mode = powerMode;
        }
        return null;
    }

    public SensorState Sensors()
    {
        bool? micMuted = null;
        try
        {
            using var en = new MMDeviceEnumerator();
            using var dev = en.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
            micMuted = dev.AudioEndpointVolume.Mute;
        }
        catch (Exception ex) { Log.Debug("controls", "Mikrofon nicht lesbar: " + ex.Message); }
        var (mic, micApp) = InUse("microphone");
        var (cam, camApp) = InUse("webcam");
        return new SensorState(micMuted, mic, micApp, cam, camApp);
    }

    public string? SetMicMuted(bool muted)
    {
        try
        {
            using var en = new MMDeviceEnumerator();
            using var dev = en.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
            dev.AudioEndpointVolume.Mute = muted;
            return null;
        }
        catch (Exception ex) { return "Das Mikrofon ließ sich nicht umschalten: " + ex.Message; }
    }

    (bool? wifi, bool? bt) _radios; DateTime _radiosAt = DateTime.MinValue;

    /// <summary>Wi-Fi and Bluetooth through Windows' radio interface (the same switches as the quick settings); read at most every 5 s.</summary>
    public (bool? Wifi, bool? Bluetooth) Radios()
    {
        lock (_lock) if (DateTime.UtcNow - _radiosAt < TimeSpan.FromSeconds(5)) return _radios;
        bool? wifi = null, bt = null;
        try
        {
            var task = global::Windows.Devices.Radios.Radio.GetRadiosAsync().AsTask();
            if (task.Wait(3000))
                foreach (var r in task.Result)
                {
                    if (r.Kind == global::Windows.Devices.Radios.RadioKind.WiFi) wifi = r.State == global::Windows.Devices.Radios.RadioState.On;
                    else if (r.Kind == global::Windows.Devices.Radios.RadioKind.Bluetooth) bt = r.State == global::Windows.Devices.Radios.RadioState.On;
                }
        }
        catch (Exception ex) { Log.Debug("controls", "Funk nicht lesbar: " + ex.Message); }
        lock (_lock) { _radios = (wifi, bt); _radiosAt = DateTime.UtcNow; }
        return (wifi, bt);
    }

    public string? SetRadio(string kind, bool on)
    {
        try
        {
            var access = global::Windows.Devices.Radios.Radio.RequestAccessAsync().AsTask();
            if (!access.Wait(5000) || access.Result != global::Windows.Devices.Radios.RadioAccessStatus.Allowed)
                return "Windows erlaubt dem Begleiter nicht, den Funk zu schalten (Datenschutz-Einstellungen → Funkempfang).";
            var want = kind == "wifi" ? global::Windows.Devices.Radios.RadioKind.WiFi : global::Windows.Devices.Radios.RadioKind.Bluetooth;
            var list = global::Windows.Devices.Radios.Radio.GetRadiosAsync().AsTask();
            if (!list.Wait(3000)) return "Windows hat nicht rechtzeitig geantwortet.";
            var radio = list.Result.FirstOrDefault(r => r.Kind == want);
            if (radio == null) return kind == "wifi" ? "Dieser PC hat kein WLAN." : "Dieser PC hat kein Bluetooth.";
            var set = radio.SetStateAsync(on ? global::Windows.Devices.Radios.RadioState.On : global::Windows.Devices.Radios.RadioState.Off).AsTask();
            if (!set.Wait(5000)) return "Windows hat nicht rechtzeitig geantwortet.";
            if (set.Result != global::Windows.Devices.Radios.RadioAccessStatus.Allowed) return "Windows hat das Schalten abgelehnt.";
            lock (_lock) _radiosAt = DateTime.MinValue;
            return null;
        }
        catch (Exception ex) { return "Funk ließ sich nicht schalten: " + ex.Message; }
    }

    static readonly Dictionary<string, string> SettingsPages = new() { ["nightlight"] = "ms-settings:nightlight", ["bluetooth"] = "ms-settings:bluetooth", ["wifi"] = "ms-settings:network-wifi" };
    public string? OpenSettings(string page)
    {
        if (!SettingsPages.TryGetValue(page, out var uri)) return "Unbekannte Einstellungsseite.";
        try { Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true }); return null; }
        catch (Exception ex) { return "Die Einstellungen ließen sich nicht öffnen: " + ex.Message; }
    }

    /// <summary>
    /// Sets the default endpoint for all three roles (console, multimedia, communications) – the same call the sound settings of Windows
    /// make. Windows offers no documented way for programs; this uses the long-standing PolicyConfig interface that sound switchers use.
    /// </summary>
    public string? SetDefaultDevice(string id, string flow)
    {
        try
        {
            var cfg = (IPolicyConfig)new PolicyConfigClient();
            try
            {
                for (var role = 0; role < 3; role++)
                {
                    var hr = cfg.SetDefaultEndpoint(id, role);
                    if (hr != 0) return $"Windows hat das Gerät nicht umgestellt (Fehler 0x{hr:X8}).";
                }
            }
            finally { System.Runtime.InteropServices.Marshal.ReleaseComObject(cfg); }
            return null;
        }
        catch (Exception ex) { return "Das Standardgerät ließ sich nicht umstellen: " + ex.Message; }
    }

    [System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    class PolicyConfigClient { }

    [System.Runtime.InteropServices.ComImport, System.Runtime.InteropServices.Guid("f8679f50-850a-41cf-9c72-430f290290c8"),
     System.Runtime.InteropServices.InterfaceType(System.Runtime.InteropServices.ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig
    {
        // The order of the methods is the interface's – only SetDefaultEndpoint is called.
        [System.Runtime.InteropServices.PreserveSig] int GetMixFormat(string id, IntPtr format);
        [System.Runtime.InteropServices.PreserveSig] int GetDeviceFormat(string id, int def, IntPtr format);
        [System.Runtime.InteropServices.PreserveSig] int ResetDeviceFormat(string id);
        [System.Runtime.InteropServices.PreserveSig] int SetDeviceFormat(string id, IntPtr endpointFormat, IntPtr mixFormat);
        [System.Runtime.InteropServices.PreserveSig] int GetProcessingPeriod(string id, int def, IntPtr defaultPeriod, IntPtr minPeriod);
        [System.Runtime.InteropServices.PreserveSig] int SetProcessingPeriod(string id, IntPtr period);
        [System.Runtime.InteropServices.PreserveSig] int GetShareMode(string id, IntPtr mode);
        [System.Runtime.InteropServices.PreserveSig] int SetShareMode(string id, IntPtr mode);
        [System.Runtime.InteropServices.PreserveSig] int GetPropertyValue(string id, IntPtr key, IntPtr value);
        [System.Runtime.InteropServices.PreserveSig] int SetPropertyValue(string id, IntPtr key, IntPtr value);
        [System.Runtime.InteropServices.PreserveSig] int SetDefaultEndpoint([System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string id, int role);
        [System.Runtime.InteropServices.PreserveSig] int SetEndpointVisibility(string id, int visible);
    }

    /// <summary>
    /// Windows notes per program when it last used the microphone or camera (the list behind Settings › Privacy). A program whose
    /// "LastUsedTimeStop" is 0 is using it right now. Only the program's name is read.
    /// </summary>
    static (bool? inUse, string? app) InUse(string capability)
    {
        try
        {
            using var root = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + capability);
            if (root == null) return (null, null);
            foreach (var (key, packaged) in new[] { (root, true), (root.OpenSubKey("NonPackaged"), false) })
            {
                if (key == null) continue;
                foreach (var name in key.GetSubKeyNames())
                {
                    if (name == "NonPackaged") continue;
                    using var k = key.OpenSubKey(name);
                    if (k?.GetValue("LastUsedTimeStart") is long start && start != 0 && k.GetValue("LastUsedTimeStop") is long stop && stop == 0)
                    {
                        var app = packaged ? name.Split('_')[0] : Path.GetFileNameWithoutExtension(name.Replace('#', '\\'));
                        return (true, app.Length > 60 ? app[..60] : app);
                    }
                }
            }
            return (false, null);
        }
        catch { return (null, null); }
    }

    /// <summary>Runs a fixed system tool hidden and returns what it printed (null on any failure or after 6 s).</summary>
    static string? Run(string file, string args)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true });
            if (p == null) return null;
            var text = p.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(6000)) { try { p.Kill(true); } catch { /* gone */ } return null; }
            return p.ExitCode == 0 ? text.Result : null;
        }
        catch { return null; }
    }
}
