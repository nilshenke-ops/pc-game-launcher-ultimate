using System.Net.NetworkInformation;

namespace Pgl.Core.Services;

/// <summary>
/// How fast the PC is receiving and sending right now: the byte counters of all active network adapters (no loopback, no tunnels),
/// compared with the previous reading. The first reading has nothing to compare with and says so (null).
/// </summary>
public sealed class NetSpeedService
{
    readonly object _lock = new();
    long _rx, _tx; DateTime _at = DateTime.MinValue; long? _down, _up;

    public object Read()
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            // Several pages may ask at once: answer from the last measurement instead of measuring over a few milliseconds.
            if (_at != DateTime.MinValue && (now - _at).TotalSeconds < 0.8) return new { supported = true, downBps = _down, upBps = _up };
            long rx = 0, tx = 0; var any = false;
            try
            {
                foreach (var n in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (n.OperationalStatus != OperationalStatus.Up || n.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
                    var st = n.GetIPStatistics();
                    rx += st.BytesReceived; tx += st.BytesSent; any = true;
                }
            }
            catch { any = false; }
            if (!any) return new { supported = false, downBps = (long?)null, upBps = (long?)null };
            if (_at != DateTime.MinValue && rx >= _rx && tx >= _tx)
            {
                var sec = Math.Max(0.2, (now - _at).TotalSeconds);
                _down = (long)((rx - _rx) / sec); _up = (long)((tx - _tx) / sec);
            }
            _rx = rx; _tx = tx; _at = now;
            return new { supported = true, downBps = _down, upBps = _up };
        }
    }
}
