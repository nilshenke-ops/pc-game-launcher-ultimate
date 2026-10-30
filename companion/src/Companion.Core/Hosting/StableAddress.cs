using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Pgl.Core.Infrastructure;

namespace Pgl.Core.Hosting;

/// <summary>
/// A name for this PC that stays the same when the router hands out another IP. Browsers keep the pairing per address
/// (scheme + host + port), so pairing under http://192.168.178.116:8787 is lost when the IP changes – under
/// http://gaming-pc.fritz.box:8787 it is not. Found, never guessed:
/// - Router name: "&lt;PC-Name&gt;.fritz.box" (and other common router suffixes) only if it resolves to one of this PC's
///   own Wi-Fi addresses.
/// - Tailscale: the MagicDNS name from "tailscale status --json" (read only, nothing is changed) while Tailscale runs;
///   plus whether https://&lt;name&gt; really answers with this companion (Tailscale Serve set up by the user).
/// </summary>
public sealed class StableAddress
{
    public static readonly string[] RouterSuffixes = { "fritz.box", "speedport.ip", "home", "lan" };

    readonly Func<IReadOnlyList<string>> _lanIps;
    readonly Func<string, Task<IPAddress[]>> _resolve;
    readonly Func<string, Task<string?>> _reverse;
    readonly Func<Task<string?>> _tailscaleStatus;
    readonly Func<string, Task<bool>> _isThisCompanion;
    readonly string _machine;

    public string? RouterName { get; private set; }
    public string? TailscaleName { get; private set; }
    public bool TailscaleHttps { get; private set; }
    public DateTime? CheckedAt { get; private set; }
    public event Action? Changed;

    public StableAddress(Func<IReadOnlyList<string>> lanIps, string? machineName = null, Func<string, Task<IPAddress[]>>? resolve = null,
        Func<Task<string?>>? tailscaleStatus = null, Func<string, Task<bool>>? isThisCompanion = null, Func<string, Task<string?>>? reverse = null)
    {
        _reverse = reverse ?? (async ip => (await Dns.GetHostEntryAsync(IPAddress.Parse(ip))).HostName);
        _lanIps = lanIps;
        _machine = (machineName ?? Environment.MachineName).Trim().ToLowerInvariant();
        _resolve = resolve ?? (h => Dns.GetHostAddressesAsync(h));
        _tailscaleStatus = tailscaleStatus ?? ReadTailscaleStatus;
        _isThisCompanion = isThisCompanion ?? (_ => Task.FromResult(false));
    }

    /// <summary>Host names that this PC answers to as its own (DNS-rebinding guard in <see cref="RequestOrigin"/>).</summary>
    public bool IsOwnHost(string host) =>
        (RouterName != null && host.Equals(RouterName, StringComparison.OrdinalIgnoreCase)) ||
        (TailscaleName != null && host.Equals(TailscaleName, StringComparison.OrdinalIgnoreCase));

    readonly object _gate = new();
    Task? _refreshing;

    /// <summary>Looks again (timer, pairing page, Tailscale card) – calls at the same time share one run.</summary>
    public Task RefreshAsync()
    {
        lock (_gate) return _refreshing is { IsCompleted: false } running ? running : _refreshing = RefreshCoreAsync();
    }

    async Task RefreshCoreAsync()
    {
        var before = (RouterName, TailscaleName, TailscaleHttps);
        RouterName = await FindRouterName();
        TailscaleName = ParseTailscaleName(await SafeTailscale());
        TailscaleHttps = TailscaleName != null && await SafeProbe($"https://{TailscaleName}");
        CheckedAt = DateTime.UtcNow;
        if (before != (RouterName, TailscaleName, TailscaleHttps))
        {
            Log.Info("web", $"Feste Adresse: Router {RouterName ?? "–"}, Tailscale {TailscaleName ?? "–"}{(TailscaleHttps ? " (https)" : "")}");
            Changed?.Invoke();
        }
    }

    async Task<string?> FindRouterName()
    {
        // Automated tests play "router name" with a name the test browser maps to this machine.
        if (Environment.GetEnvironmentVariable("PGL_TEST_ROUTER_NAME") is { Length: > 0 } test) return test;
        if (_machine.Length == 0 || _machine.Length > 63 || !_machine.All(c => char.IsAsciiLetterOrDigit(c) || c == '-')) return null;
        var own = _lanIps().ToHashSet();
        if (own.Count == 0) return null;
        foreach (var suffix in RouterSuffixes)
        {
            var host = $"{_machine}.{suffix}";
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                var addrs = await _resolve(host).WaitAsync(cts.Token);
                if (addrs.Any(a => own.Contains(a.ToString()))) return host;
            }
            catch { /* name unknown in this network */ }
        }
        // The router may know the PC under another name (renamed in the FRITZ!Box, other DHCP name): ask it which name
        // belongs to this PC's address – and take it only if that name leads back to this PC.
        foreach (var ip in own)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                var name = (await _reverse(ip).WaitAsync(cts.Token))?.Trim().TrimEnd('.').ToLowerInvariant();
                if (string.IsNullOrEmpty(name) || name.Length > 253 || !name.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.')) continue;
                if (!RouterSuffixes.Any(sfx => name.EndsWith("." + sfx, StringComparison.Ordinal))) continue;
                var addrs = await _resolve(name).WaitAsync(cts.Token);
                if (addrs.Any(a => own.Contains(a.ToString()))) return name;
            }
            catch { /* no reverse entry */ }
        }
        return null;
    }

    async Task<string?> SafeTailscale() { try { return await _tailscaleStatus(); } catch { return null; } }
    async Task<bool> SafeProbe(string url) { try { return await _isThisCompanion(url); } catch { return false; } }

    /// <summary>MagicDNS name of this PC while Tailscale runs ("Self.DNSName" without the trailing dot).</summary>
    public static string? ParseTailscaleName(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("BackendState", out var st) && st.GetString() != "Running") return null;
            if (!root.TryGetProperty("Self", out var self) || !self.TryGetProperty("DNSName", out var dn)) return null;
            var name = (dn.GetString() ?? "").TrimEnd('.').ToLowerInvariant();
            return name.Length is > 3 and < 254 && name.Contains('.') && name.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.') ? name : null;
        }
        catch (JsonException) { return null; }
    }

    static async Task<string?> ReadTailscaleStatus()
    {
        var r = await TailscaleCli.RunAsync(TailscaleCli.Command.Status);
        return r is { exitCode: 0 } ? r.Value.output : null;
    }
}

/// <summary>
/// The Tailscale command line with exactly three fixed commands – nothing else can be passed in:
/// status (read), "serve on" (https in the own tailnet → this companion) and "serve off". No shell, no user text.
/// </summary>
public static class TailscaleCli
{
    public enum Command { Status, ServeOn, ServeOff }

    /// <summary>Tests replace the program call.</summary>
    public static Func<string[], Task<(int exitCode, string output)?>>? Runner { get; set; }

    public static string? Exe() => OperatingSystem.IsWindows()
        ? new[] { Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Tailscale", "tailscale.exe") }.FirstOrDefault(File.Exists)
        : new[] { "/usr/bin/tailscale", "/usr/local/bin/tailscale" }.FirstOrDefault(File.Exists);

    public static string[] Args(Command c, int port) => c switch
    {
        Command.Status => new[] { "status", "--json" },
        Command.ServeOn => new[] { "serve", "--bg", port.ToString(System.Globalization.CultureInfo.InvariantCulture) },
        _ => new[] { "serve", "--https=443", "off" },
    };

    public static async Task<(int exitCode, string output)?> RunAsync(Command c, int port = 8787)
    {
        var args = Args(c, port);
        if (Runner != null) return await Runner(args);
        var exe = Exe();
        if (exe == null) return null;
        var psi = new ProcessStartInfo(exe) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi);
        if (p == null) return null;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(c == Command.Status ? 4 : 25));
        var output = p.StandardOutput.ReadToEndAsync(cts.Token);
        var error = p.StandardError.ReadToEndAsync(cts.Token);
        try { await p.WaitForExitAsync(cts.Token); } catch (OperationCanceledException) { try { p.Kill(); } catch { } return (-1, "Tailscale hat nicht rechtzeitig geantwortet."); }
        return (p.ExitCode, c == Command.Status ? await output : ((await output) + "\n" + (await error)).Trim());
    }
}
