namespace Pgl.Core.Platform;

/// <summary>One Windows firewall rule, as far as it matters for "can a phone reach the companion".</summary>
public sealed record FirewallRule(string Name, bool Enabled, bool Inbound, bool Allow, int Profiles, int Protocol, string? LocalPorts, string? Application);

/// <summary>A connected network and how Windows classifies it (0 = öffentlich, 1 = privat, 2 = Domäne).</summary>
public sealed record NetworkProfile(string Id, string Name, int Category);

/// <summary>What stands between a phone in the home network and the companion on this PC.</summary>
public sealed record NetworkAccessStatus(
    bool Supported,
    /// <summary>"allowed", "blocked", "no-rule", "firewall-off", "public-network" or "unknown".</summary>
    string State,
    string Detail,
    IReadOnlyList<NetworkProfile> Networks,
    bool CanFix)
{
    public static readonly NetworkAccessStatus Unknown = new(false, "unknown", "Nur der Windows-Begleiter prüft die Firewall.", Array.Empty<NetworkProfile>(), false);
}

/// <summary>Windows firewall and network category (Windows companion only).</summary>
public interface INetworkAccess
{
    NetworkAccessStatus Check(int port);
    /// <summary>
    /// Starts the fix with administrator rights (Windows asks first): allow the companion in the firewall for home networks
    /// and, if wanted, classify the connected public networks as private. Null when started, otherwise why not.
    /// </summary>
    string? RequestFix(int port, bool makePrivate);
}

public sealed class NullNetworkAccess : INetworkAccess
{
    public static readonly NullNetworkAccess Instance = new();
    public NetworkAccessStatus Check(int port) => NetworkAccessStatus.Unknown;
    public string? RequestFix(int port, bool makePrivate) => "Nur am Windows-PC möglich.";
}

/// <summary>Pure rules: does the Windows firewall let a phone reach the companion's port? (Testable without Windows.)</summary>
public static class FirewallVerdict
{
    public const int Domain = 1, Private = 2, Public = 4;
    const int Tcp = 6, AnyProtocol = 256;

    /// <summary>
    /// Only rules that name this program or this port count (Windows' general rules say nothing about it).
    /// Block wins over allow, like in Windows. <paramref name="profiles"/>: the profiles of the connected networks.
    /// </summary>
    public static (string state, string detail) Evaluate(IEnumerable<FirewallRule> rules, int profiles, bool firewallOn, string exe, int port)
    {
        if (!firewallOn) return ("firewall-off", "Die Windows-Firewall ist für dieses Netzwerk aus – nichts blockiert den Begleiter.");
        var relevant = rules.Where(r => r.Enabled && r.Inbound && (r.Profiles & profiles) != 0 && (r.Protocol is Tcp or AnyProtocol or 0) && Concerns(r, exe, port)).ToList();
        if (relevant.FirstOrDefault(r => !r.Allow) is { } block)
            return ("blocked", $"Die Windows-Firewall blockiert den Begleiter (Regel „{block.Name}“) – Handys im Heimnetz erreichen ihn nicht.");
        if (relevant.FirstOrDefault(r => r.Allow) is { } allow)
            return ("allowed", $"Freigegeben (Regel „{allow.Name}“).");
        return ("no-rule", "Für den Begleiter gibt es noch keine Freigabe in der Windows-Firewall – Handys im Heimnetz werden abgewiesen.");
    }

    static bool Concerns(FirewallRule r, string exe, int port)
    {
        var app = string.IsNullOrWhiteSpace(r.Application) || r.Application == "*" ? null : r.Application;
        var ports = string.IsNullOrWhiteSpace(r.LocalPorts) || r.LocalPorts == "*" ? null : r.LocalPorts;
        if (app != null) return string.Equals(Path.GetFullPath(app), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase) && (ports == null || HasPort(ports, port));
        return ports != null && HasPort(ports, port);
    }

    static bool HasPort(string ports, int port) => ports.Split(',').Select(p => p.Trim()).Any(p =>
    {
        var d = p.Split('-');
        return d.Length == 2 && int.TryParse(d[0], out var a) && int.TryParse(d[1], out var b) ? port >= a && port <= b : int.TryParse(p, out var x) && x == port;
    });

    /// <summary>The overall state: a public network blocks phones even with a rule for home networks.</summary>
    public static NetworkAccessStatus Combine((string state, string detail) fw, IReadOnlyList<NetworkProfile> networks, IEnumerable<FirewallRule> rules, string exe, int port)
    {
        var pub = networks.Where(n => n.Category == 0).ToList();
        if (fw.state == "allowed" && pub.Count > 0)
        {
            // Allowed – but only for private networks? Then the public one still blocks.
            var forPublic = rules.Any(r => r.Enabled && r.Inbound && r.Allow && (r.Profiles & Public) != 0 && Concerns(r, exe, port));
            if (!forPublic)
                return new(true, "public-network", $"Windows stuft „{pub[0].Name}“ als öffentliches Netzwerk ein – dort blockiert die Firewall Handys. Zu Hause: als privates Netzwerk einstufen.", networks, true);
        }
        return new(true, fw.state, fw.detail, networks, fw.state is "blocked" or "no-rule");
    }
}
