using System.Diagnostics;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;

namespace Pgl.Core.Services;

/// <summary>
/// What "PC einschalten" (Wake-on-LAN) needs to know about this PC: the network adapters with their MAC addresses, and – on Windows – what the
/// system itself reports about waking by network. Nothing is guessed: a check that cannot be read is reported as "unknown", never as "works".
/// The result travels to the cloud copy, so a phone knows the MAC address while the PC is off.
/// </summary>
public sealed class WakeService
{
    public sealed record Adapter(string name, string? description, string kind, string mac, bool up, string? ip);
    /// <summary>ok: true = fine, false = must be changed, null = could not be read.</summary>
    public sealed record Check(string id, bool? ok, string text, string? hint);
    public sealed record Info(List<Adapter> adapters, string? suggestedMac, List<Check> checks, bool windows, DateTime checkedAt);

    readonly object _lock = new();
    Info? _cache;

    public Info Get(bool fresh = false)
    {
        lock (_lock)
        {
            if (!fresh && _cache != null && DateTime.UtcNow - _cache.checkedAt < TimeSpan.FromMinutes(10)) return _cache;
            var adapters = Adapters();
            var checks = OperatingSystem.IsWindows() ? WindowsChecks(adapters) : new List<Check> { new("platform", null, "Die Prüfungen gibt es nur im Windows-Begleiter.", null) };
            // The wake packet must reach a cable adapter: WLAN adapters cannot be woken from "off".
            var wired = adapters.FirstOrDefault(a => a.kind == "ethernet" && a.up) ?? adapters.FirstOrDefault(a => a.kind == "ethernet");
            return _cache = new Info(adapters, wired?.mac, checks, OperatingSystem.IsWindows(), DateTime.UtcNow);
        }
    }

    static List<Adapter> Adapters()
    {
        var list = new List<Adapter>();
        try
        {
            foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (n.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
                var bytes = n.GetPhysicalAddress().GetAddressBytes();
                if (bytes.Length != 6 || bytes.All(b => b == 0)) continue;
                var text = (n.Name + " " + n.Description).ToLowerInvariant();
                if (text.Contains("virtual") || text.Contains("vmware") || text.Contains("hyper-v") || text.Contains("bluetooth") || text.Contains("vpn") || text.Contains("wireguard") || text.Contains("tailscale") || text.Contains("loopback")) continue;
                var kind = n.NetworkInterfaceType switch
                {
                    NetworkInterfaceType.Wireless80211 => "wifi",
                    NetworkInterfaceType.Ethernet or NetworkInterfaceType.GigabitEthernet or NetworkInterfaceType.FastEthernetT or NetworkInterfaceType.FastEthernetFx or NetworkInterfaceType.Ethernet3Megabit => "ethernet",
                    _ => "other",
                };
                string? ip = null;
                try { ip = n.GetIPProperties().UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork)?.Address.ToString(); } catch { }
                list.Add(new Adapter(n.Name, n.Description == n.Name ? null : n.Description, kind, string.Join(":", bytes.Select(b => b.ToString("X2"))), n.OperationalStatus == OperationalStatus.Up, ip));
            }
        }
        catch { /* no adapters readable: the list stays empty and the website says so */ }
        return list;
    }

    static List<Check> WindowsChecks(List<Adapter> adapters)
    {
        var r = new List<Check>();
        var wired = adapters.Where(a => a.kind == "ethernet").ToList();
        r.Add(wired.Count == 0
            ? new("ethernet", false, "Kein LAN-Anschluss (Ethernet) gefunden.", "Wake-on-LAN aus dem ausgeschalteten Zustand geht nur über ein LAN-Kabel, nicht über WLAN.")
            : wired.Any(a => a.up)
                ? new("ethernet", true, $"LAN-Kabel verbunden ({wired.First(a => a.up).name}).", null)
                : new("ethernet", false, "LAN-Anschluss vorhanden, aber kein Kabel verbunden.", "Den Laptop per LAN-Kabel mit der FRITZ!Box verbinden – über WLAN lässt er sich ausgeschaltet nicht wecken."));

        // What Windows says about the adapter: is waking by magic packet switched on?
        var pm = Run("powershell", "-NoProfile -NonInteractive -Command \"Get-NetAdapterPowerManagement | Where-Object { $_.WakeOnMagicPacket -ne 'Unsupported' -or $true } | Select-Object Name, WakeOnMagicPacket | ConvertTo-Json -Compress\"");
        bool? magic = null; string? magicName = null;
        try
        {
            if (!string.IsNullOrWhiteSpace(pm))
            {
                using var doc = JsonDocument.Parse(pm);
                var items = doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement.EnumerateArray().ToList() : new List<JsonElement> { doc.RootElement };
                foreach (var it in items)
                {
                    var name = it.TryGetProperty("Name", out var n) ? n.GetString() : null;
                    if (name == null || wired.All(a => a.name != name)) continue;
                    var v = it.TryGetProperty("WakeOnMagicPacket", out var w) ? (w.ValueKind == JsonValueKind.Number ? w.GetInt32().ToString() : w.GetString()) : null;
                    magicName = name;
                    magic = v is "Enabled" or "1" ? true : v is "Disabled" or "2" ? false : v is "Unsupported" or "0" ? false : null;
                    if (v is "Unsupported" or "0") { r.Add(new("magic", false, $"Der Netzwerkadapter „{name}“ meldet: Wecken per Magic Packet wird nicht unterstützt.", "Den neuesten LAN-Treiber von der HP-Supportseite installieren. Bleibt es dabei, kann dieser Adapter den PC nicht wecken.")); magic = null; magicName = "reported"; }
                    break;
                }
            }
        }
        catch { magic = null; }
        if (magicName != "reported")
            r.Add(magic == true ? new("magic", true, $"„Magic Packet“ ist am LAN-Adapter eingeschaltet ({magicName}).", null)
                : magic == false ? new("magic", false, $"„Magic Packet“ ist am LAN-Adapter ausgeschaltet ({magicName}).", "Geräte-Manager → Netzwerkadapter → LAN-Adapter → Energieverwaltung: „Gerät kann den Computer aus dem Ruhezustand aktivieren“ und „Nur Magic Packet …“ einschalten; unter Erweitert „Wake on Magic Packet“ und „Shutdown Wake-On-Lan“ auf Aktiviert.")
                : new("magic", null, "Ob „Magic Packet“ am LAN-Adapter eingeschaltet ist, ließ sich nicht lesen.", "Im Geräte-Manager beim LAN-Adapter unter Energieverwaltung und Erweitert nachsehen."));

        // Devices Windows allows to wake the PC.
        var armed = Run("powercfg", "/devicequery wake_armed");
        if (armed == null) r.Add(new("armed", null, "Welche Geräte den PC wecken dürfen, ließ sich nicht lesen.", null));
        else
        {
            var lines = armed.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0 && !l.Equals("NONE", StringComparison.OrdinalIgnoreCase)).ToList();
            var net = lines.FirstOrDefault(l => { var t = l.ToLowerInvariant(); return t.Contains("ethernet") || t.Contains("gbe") || t.Contains("realtek") || t.Contains("lan") || t.Contains("network"); });
            r.Add(net != null ? new("armed", true, $"Windows erlaubt dem Netzwerkadapter das Wecken ({net}).", null)
                : new("armed", false, "Kein Netzwerkadapter darf den PC wecken.", "Geräte-Manager → LAN-Adapter → Energieverwaltung → „Gerät kann den Computer aus dem Ruhezustand aktivieren“."));
        }

        // Fast startup: "shut down" is then a hybrid hibernate; many adapters do not listen in that state.
        var fast = Run("reg", "query \"HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power\" /v HiberbootEnabled");
        if (fast == null) r.Add(new("faststartup", null, "Ob der Schnellstart eingeschaltet ist, ließ sich nicht lesen.", null));
        else r.Add(fast.Contains("0x1") ? new("faststartup", false, "Der Windows-Schnellstart ist eingeschaltet.", "Systemsteuerung → Energieoptionen → „Auswählen, was beim Drücken von Netzschaltern geschehen soll“ → „Schnellstart aktivieren“ ausschalten. Mit Schnellstart hört die Netzwerkkarte nach dem Herunterfahren oft nicht mehr zu.")
            : new("faststartup", true, "Der Windows-Schnellstart ist ausgeschaltet.", null));

        // Which sleep states the firmware offers (S0 low power idle = "Modern Standby": waking from standby by LAN is usually not possible there).
        var states = Run("powercfg", "/a");
        if (states != null)
        {
            var modern = states.Contains("S0 Low Power Idle", StringComparison.OrdinalIgnoreCase) || states.Contains("S0-Niedrigstrom", StringComparison.OrdinalIgnoreCase);
            var available = states.Split(new[] { "The following sleep states are not available", "Die folgenden Standbymodusfunktionen sind auf diesem System nicht verfügbar" }, StringSplitOptions.None)[0];
            var hibernate = available.Contains("Hibernate", StringComparison.OrdinalIgnoreCase) || available.Contains("Ruhezustand", StringComparison.OrdinalIgnoreCase);
            r.Add(new("hibernate", hibernate, hibernate ? "Der Ruhezustand (Hibernate, S4) ist verfügbar – daraus lässt sich ein Laptop meist am zuverlässigsten wecken." : "Der Ruhezustand (Hibernate) ist nicht verfügbar.", hibernate ? null : "Als Administrator ausführen: powercfg /hibernate on"));
            if (modern) r.Add(new("standby", null, "Dieser Laptop nutzt „Modern Standby“ (S0). Aus dem Energiesparmodus weckt ein Magic Packet meist nicht.", "Statt „Energie sparen“ den Ruhezustand oder Herunterfahren verwenden."));
        }

        // On battery the network card is usually switched off.
        var ac = Run("powershell", "-NoProfile -NonInteractive -Command \"(Get-CimInstance Win32_Battery | Select-Object -First 1).BatteryStatus\"");
        if (int.TryParse(ac?.Trim(), out var st))
            r.Add(st == 2 || st >= 6 ? new("ac", true, "Das Netzteil ist angeschlossen.", null)
                : new("ac", false, "Der Laptop läuft gerade im Akkubetrieb.", "Wake-on-LAN funktioniert bei Laptops in aller Regel nur mit angeschlossenem Netzteil – ohne Netzteil wird die Netzwerkkarte abgeschaltet."));
        return r;
    }

    /// <summary>Runs a system tool and returns its output; null when it is missing, fails or takes too long.</summary>
    static string? Run(string exe, string args)
    {
        try
        {
            var psi = new ProcessStartInfo(exe, args) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
            using var p = Process.Start(psi);
            if (p == null) return null;
            var read = p.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(8000)) { try { p.Kill(true); } catch { } return null; }
            return p.ExitCode == 0 ? read.GetAwaiter().GetResult() : null;
        }
        catch { return null; }
    }
}
