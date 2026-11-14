using System.Net.NetworkInformation;
using Pgl.Core.Platform;

namespace Pgl.Core.Services;

/// <summary>
/// How fast the PC is receiving and sending right now: the byte counters of all active network adapters (no loopback, no tunnels),
/// compared with the previous reading. The first reading has nothing to compare with and says so (null).
/// 3.66: also the active connections (Wi-Fi/Ethernet, link speed) and the data received/sent since the companion started.
/// The pages show the speed in Mbit/s (bits!), data amounts in MB/GB – the raw values here are bytes.
/// </summary>
public sealed class NetSpeedService
{
    readonly object _lock = new();
    long _rx, _tx; DateTime _at = DateTime.MinValue; long? _down, _up;
    long? _rx0, _tx0;
    List<NetLink> _links = new();

    public object Read()
    {
        var s = Sample();
        return new { supported = s != null, downBps = s?.DownBps, upBps = s?.UpBps, rxSinceStart = s?.RxSinceStart, txSinceStart = s?.TxSinceStart, links = s?.Links ?? new() };
    }

    public NetSample? Sample()
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            // Several pages may ask at once: answer from the last measurement instead of measuring over a few milliseconds.
            if (_at != DateTime.MinValue && (now - _at).TotalSeconds < 0.8) return Current();
            long rx = 0, tx = 0; var any = false; var links = new List<NetLink>();
            try
            {
                foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
                    var st = n.GetIPStatistics();
                    rx += st.BytesReceived; tx += st.BytesSent; any = true;
                    var kind = n.NetworkInterfaceType switch
                    {
                        NetworkInterfaceType.Wireless80211 => "wlan",
                        NetworkInterfaceType.Ethernet or NetworkInterfaceType.GigabitEthernet or NetworkInterfaceType.FastEthernetT or NetworkInterfaceType.FastEthernetFx or NetworkInterfaceType.Ethernet3Megabit => "ethernet",
                        NetworkInterfaceType.Wwanpp or NetworkInterfaceType.Wwanpp2 => "mobile",
                        _ => "other",
                    };
                    // Virtual adapters (Hyper-V, VPN, VirtualBox …) are counted in the speed but not listed as "the" connection.
                    if (!System.Text.RegularExpressions.Regex.IsMatch(n.Description + " " + n.Name, "virtual|hyper-v|vmware|virtualbox|vpn|tap-|wintun|tailscale|zerotier|docker|vethernet|bluetooth", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                        links.Add(new NetLink(n.Name, kind, n.Speed > 0 ? n.Speed : null));
                }
            }
            catch { any = false; }
            if (!any) return null;
            if (_at != DateTime.MinValue && rx >= _rx && tx >= _tx)
            {
                var sec = Math.Max(0.2, (now - _at).TotalSeconds);
                _down = (long)((rx - _rx) / sec); _up = (long)((tx - _tx) / sec);
            }
            _rx0 ??= rx; _tx0 ??= tx;
            if (rx < _rx0) _rx0 = rx; if (tx < _tx0) _tx0 = tx;   // adapter reset: counters start again
            _rx = rx; _tx = tx; _at = now; _links = links;
            return Current();
        }
    }

    NetSample Current() => new(_down, _up, _rx0 is { } a ? _rx - a : null, _tx0 is { } b ? _tx - b : null, _links);

    /// <summary>Bytes per second → megabits per second (what providers and speed tests use).</summary>
    public static double Mbit(long bytesPerSecond) => Math.Round(bytesPerSecond * 8 / 1_000_000.0, 1);
}
