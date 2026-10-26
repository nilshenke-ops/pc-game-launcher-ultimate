using System.Net;
using System.Net.Sockets;
using System.Text;
using Pgl.Core.Infrastructure;

namespace Pgl.Core.Hosting;

/// <summary>
/// Announces a fixed name for this PC in the home network via multicast DNS (Bonjour), e.g. "nexus-gaming-pc.local".
/// iPhone and iPad resolve ".local" names by themselves, so the pairing stays valid when the router hands out a new
/// IP – no router setting needed. Answers only questions for exactly this name (type A or ANY) with the PC's private
/// Wi-Fi/LAN addresses; it never asks, forwards or stores anything. Off when "Im WLAN erreichbar" is off.
/// </summary>
public sealed class MdnsResponder : IDisposable
{
    public const int MdnsPort = 5353;
    static readonly IPAddress Group = IPAddress.Parse("224.0.0.251");

    readonly Func<IReadOnlyList<string>> _ips;
    readonly int _port;
    UdpClient? _udp;
    CancellationTokenSource? _cts;

    public string Name { get; }
    public bool Running { get; private set; }
    public string? Error { get; private set; }
    public int Answered { get; private set; }

    public MdnsResponder(Func<IReadOnlyList<string>> ips, string? machineName = null, int port = MdnsPort)
    {
        _ips = ips;
        _port = port;
        Name = NameFor(machineName ?? Environment.MachineName);
    }

    /// <summary>"Gaming PC_1" → "nexus-gaming-pc-1.local" (own prefix, so it never collides with Windows' own name).</summary>
    public static string NameFor(string machine)
    {
        var clean = new string(machine.Trim().ToLowerInvariant().Select(c => char.IsAsciiLetterOrDigit(c) ? c : '-').ToArray()).Trim('-');
        while (clean.Contains("--")) clean = clean.Replace("--", "-");
        if (clean.Length == 0) clean = "pc";
        if (clean.Length > 40) clean = clean[..40].Trim('-');
        return $"nexus-{clean}.local";
    }

    public void Start()
    {
        try
        {
            var udp = new UdpClient(AddressFamily.InterNetwork);
            udp.Client.SetSocketOption(SocketOptionLevel.Socket, SocketOptionName.ReuseAddress, true); // Windows' own mDNS uses 5353 too
            udp.Client.Bind(new IPEndPoint(IPAddress.Any, _port));
            foreach (var ip in _ips()) { try { udp.JoinMulticastGroup(Group, IPAddress.Parse(ip)); } catch { /* interface without multicast */ } }
            _udp = udp;
            _cts = new CancellationTokenSource();
            Running = true;
            _ = Loop(_cts.Token);
            _ = Announce();
            Log.Info("web", $"Fester Name im WLAN: {Name}");
        }
        catch (Exception ex) { Error = ex.Message; Running = false; Log.Warn("web", $"mDNS-Name nicht verfügbar: {ex.Message}"); }
    }

    async Task Announce()
    {
        // Two unsolicited answers, as mDNS asks for, so caches in the network learn the name right away.
        for (int i = 0; i < 2 && _udp != null; i++)
        {
            var ips = Addresses();
            if (ips.Count > 0) { try { var r = BuildResponse(0, Name, ips, null); await _udp.SendAsync(r, r.Length, new IPEndPoint(Group, MdnsPort)); } catch { } }
            await Task.Delay(1000);
        }
    }

    List<IPAddress> Addresses() => _ips().Select(IPAddress.Parse)
        .Where(a => !(a.GetAddressBytes()[0] == 100 && a.GetAddressBytes()[1] is >= 64 and <= 127)) // not the Tailscale address
        .ToList();

    async Task Loop(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _udp != null)
        {
            UdpReceiveResult rx;
            try { rx = await _udp.ReceiveAsync(ct); } catch { break; }
            try
            {
                var q = ParseQuery(rx.Buffer);
                if (q == null || !q.Value.questions.Any(x => string.Equals(x.name, Name, StringComparison.OrdinalIgnoreCase) && x.type is 1 or 255)) continue;
                var ips = Addresses();
                if (ips.Count == 0) continue;
                var legacy = rx.RemoteEndPoint.Port != MdnsPort; // one-shot query (e.g. from a resolver): answer directly, with the question
                var unicastWanted = q.Value.questions.Any(x => x.unicast);
                var resp = BuildResponse(legacy ? q.Value.id : (ushort)0, Name, ips, legacy ? Name : null);
                if (legacy || unicastWanted) await _udp.SendAsync(resp, resp.Length, rx.RemoteEndPoint);
                if (!legacy) await _udp.SendAsync(resp, resp.Length, new IPEndPoint(Group, MdnsPort));
                Answered++;
            }
            catch { /* malformed packet – ignore */ }
        }
    }

    // ------------------------------------------------------------------ DNS wire format (RFC 1035 / 6762)

    public static (ushort id, List<(string name, ushort type, bool unicast)> questions)? ParseQuery(byte[] b)
    {
        if (b.Length < 12) return null;
        var id = (ushort)(b[0] << 8 | b[1]);
        if ((b[2] & 0x80) != 0) return null; // a response, not a question
        int qd = b[4] << 8 | b[5];
        if (qd is 0 or > 16) return null;
        var list = new List<(string, ushort, bool)>();
        int p = 12;
        for (int i = 0; i < qd; i++)
        {
            var name = ReadName(b, ref p);
            if (name == null || p + 4 > b.Length) return null;
            var type = (ushort)(b[p] << 8 | b[p + 1]);
            var cls = (ushort)(b[p + 2] << 8 | b[p + 3]);
            p += 4;
            if ((cls & 0x7fff) == 1) list.Add((name, type, (cls & 0x8000) != 0));
        }
        return (id, list);
    }

    static string? ReadName(byte[] b, ref int p, int depth = 0)
    {
        var parts = new List<string>();
        while (p < b.Length)
        {
            int len = b[p];
            if (len == 0) { p++; return string.Join('.', parts); }
            if ((len & 0xc0) == 0xc0)
            {
                if (p + 1 >= b.Length || depth > 4) return null;
                int ptr = (len & 0x3f) << 8 | b[p + 1];
                p += 2;
                var rest = ReadName(b, ref ptr, depth + 1);
                if (rest == null) return null;
                parts.Add(rest);
                return string.Join('.', parts);
            }
            if (len > 63 || p + 1 + len > b.Length) return null;
            parts.Add(Encoding.ASCII.GetString(b, p + 1, len));
            p += 1 + len;
        }
        return null;
    }

    static void WriteName(List<byte> o, string name)
    {
        foreach (var label in name.Split('.', StringSplitOptions.RemoveEmptyEntries)) { var l = Encoding.ASCII.GetBytes(label); o.Add((byte)l.Length); o.AddRange(l); }
        o.Add(0);
    }

    /// <summary>Authoritative answer with one A record per address (TTL 120 s, cache-flush bit).</summary>
    public static byte[] BuildResponse(ushort id, string name, IReadOnlyList<IPAddress> ips, string? question)
    {
        var o = new List<byte> { (byte)(id >> 8), (byte)id, 0x84, 0x00, 0, (byte)(question != null ? 1 : 0), 0, (byte)ips.Count, 0, 0, 0, 0 };
        if (question != null) { WriteName(o, question); o.AddRange(new byte[] { 0, 1, 0, 1 }); }
        foreach (var ip in ips)
        {
            WriteName(o, name);
            o.AddRange(new byte[] { 0, 1, 0x80, 1, 0, 0, 0, 120, 0, 4 });
            o.AddRange(ip.GetAddressBytes());
        }
        return o.ToArray();
    }

    public void Dispose()
    {
        Running = false;
        try { _cts?.Cancel(); } catch { }
        try { _udp?.Dispose(); } catch { }
        _udp = null;
    }
}
