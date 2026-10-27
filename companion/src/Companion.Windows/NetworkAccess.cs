using System.Diagnostics;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Reads the Windows firewall (HNetCfg.FwPolicy2) and the category of the connected networks (Network List Manager) –
/// both only read here. The fix runs in a second start of this program with administrator rights (Windows asks):
/// <c>--allow-network PORT [--private]</c>. No shell, no other program.
/// </summary>
sealed class WindowsNetworkAccess : INetworkAccess
{
    const string RuleName = "Nexus Gaming Hub – Handy im Heimnetz";
    static readonly Guid NetworkListManager = new("DCB00C01-570F-4A9B-8D69-199FDBA5723B");

    static string Exe => Environment.ProcessPath ?? Application.ExecutablePath;

    public NetworkAccessStatus Check(int port)
    {
        try
        {
            var networks = Networks();
            dynamic policy = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2", true)!)!;
            int profiles = policy.CurrentProfileTypes;
            var on = false;
            foreach (var p in new[] { FirewallVerdict.Domain, FirewallVerdict.Private, FirewallVerdict.Public })
                if ((profiles & p) != 0 && (bool)policy.FirewallEnabled[p]) on = true;
            var rules = Rules(policy);
            var verdict = FirewallVerdict.Evaluate(rules, profiles, on, Exe, port);
            return FirewallVerdict.Combine(verdict, networks, rules, Exe, port);
        }
        catch (Exception e)
        {
            Log.Warn("network", "Firewall-Prüfung nicht möglich: " + e.Message);
            return new NetworkAccessStatus(false, "unknown", "Die Windows-Firewall ließ sich nicht abfragen.", Array.Empty<NetworkProfile>(), true);
        }
    }

    static List<FirewallRule> Rules(dynamic policy)
    {
        var list = new List<FirewallRule>();
        foreach (dynamic r in policy.Rules)
        {
            try
            {
                list.Add(new FirewallRule((string)(r.Name ?? ""), (bool)r.Enabled, (int)r.Direction == 1, (int)r.Action == 1, (int)r.Profiles, (int)r.Protocol,
                    (string?)r.LocalPorts, (string?)r.ApplicationName));
            }
            catch { /* rules of other kinds (e.g. ICMP) have no ports – not ours */ }
        }
        return list;
    }

    static List<NetworkProfile> Networks()
    {
        var list = new List<NetworkProfile>();
        try
        {
            dynamic nlm = Activator.CreateInstance(Type.GetTypeFromCLSID(NetworkListManager, true)!)!;
            foreach (dynamic n in nlm.GetNetworks(1)) // 1 = connected
                list.Add(new NetworkProfile(((Guid)n.GetNetworkId()).ToString(), (string)n.GetName(), (int)n.GetCategory()));
        }
        catch (Exception e) { Log.Warn("network", "Netzwerkliste nicht lesbar: " + e.Message); }
        return list;
    }

    public string? RequestFix(int port, bool makePrivate)
    {
        try
        {
            var psi = new ProcessStartInfo(Exe, $"--allow-network {port}" + (makePrivate ? " --private" : "")) { UseShellExecute = true, Verb = "runas" };
            Process.Start(psi)?.Dispose();
            return null;
        }
        catch (System.ComponentModel.Win32Exception) { return "Die Windows-Rückfrage wurde abgelehnt – nichts wurde geändert."; }
        catch (Exception e) { return e.Message; }
    }

    /// <summary>Runs elevated (second start): exactly one allow rule for this program and port on home networks.</summary>
    public static int RunFix(string[] args)
    {
        var i = Array.IndexOf(args, "--allow-network");
        if (i < 0 || i + 1 >= args.Length || !int.TryParse(args[i + 1], out var port) || port is < 1024 or > 65535) return 2;
        var makePrivate = args.Contains("--private");
        var exe = Exe;
        try
        {
            dynamic policy = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FwPolicy2", true)!)!;
            // Block rules for this program (Windows creates them when its question was cancelled) and our old rule go first.
            var remove = new List<string>();
            foreach (dynamic r in policy.Rules)
            {
                try
                {
                    var app = (string?)r.ApplicationName;
                    if ((string)r.Name == RuleName || (app != null && string.Equals(app, exe, StringComparison.OrdinalIgnoreCase) && (int)r.Direction == 1 && (int)r.Action == 0))
                        remove.Add((string)r.Name);
                }
                catch { /* not ours */ }
            }
            foreach (var name in remove.Distinct()) policy.Rules.Remove(name);
            dynamic rule = Activator.CreateInstance(Type.GetTypeFromProgID("HNetCfg.FWRule", true)!)!;
            rule.Name = RuleName;
            rule.Description = "Erlaubt Handys und Tablets im Heimnetz, die Web-App des Begleiters zu öffnen (nur dieses Programm, nur dieser Port).";
            rule.ApplicationName = exe;
            rule.Protocol = 6;
            rule.LocalPorts = port.ToString();
            rule.Direction = 1;
            rule.Action = 1;
            rule.Profiles = FirewallVerdict.Domain | FirewallVerdict.Private;
            rule.Enabled = true;
            policy.Rules.Add(rule);
            if (makePrivate)
            {
                dynamic nlm = Activator.CreateInstance(Type.GetTypeFromCLSID(NetworkListManager, true)!)!;
                foreach (dynamic n in nlm.GetNetworks(1))
                    if ((int)n.GetCategory() == 0) n.SetCategory(1);
            }
            MessageBox.Show("Erledigt: Handys im Heimnetz können den PC jetzt erreichen." + (makePrivate ? " Das Netzwerk ist jetzt als privat eingestuft." : ""), "Nexus Gaming Hub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception e)
        {
            MessageBox.Show("Die Freigabe hat nicht geklappt: " + e.Message, "Nexus Gaming Hub", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }
}
