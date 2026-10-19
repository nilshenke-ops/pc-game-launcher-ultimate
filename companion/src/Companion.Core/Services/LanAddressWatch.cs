using Pgl.Core.Infrastructure;

namespace Pgl.Core.Services;

public sealed class LanAddressFile
{
    /// <summary>Wi-Fi/LAN addresses of this PC seen last time.</summary>
    public List<string> Known { get; set; } = new();
}

/// <summary>
/// Paired phones remember the address under which they opened the app (e.g. http://192.168.178.20:8787). When the router
/// gives the PC a new address, those phones no longer find it – this watch notices the change and explains the fix
/// (fixed address in the router, or scan the QR code once more).
/// </summary>
public sealed class LanAddressWatch : IDisposable
{
    public static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);
    readonly JsonStore<LanAddressFile> _store;
    readonly Func<IReadOnlyList<string>> _addresses;
    readonly Func<bool> _hasRemoteDevices;
    Timer? _timer;
    /// <summary>(old addresses, new addresses) when the address changed while devices are paired.</summary>
    public Action<IReadOnlyList<string>, IReadOnlyList<string>>? Changed { get; set; }

    public LanAddressWatch(AppPaths paths, Func<IReadOnlyList<string>> addresses, Func<bool> hasRemoteDevices)
    {
        _store = new JsonStore<LanAddressFile>(paths.File("lan-address.json"));
        _addresses = addresses; _hasRemoteDevices = hasRemoteDevices;
    }

    public void Start() => _timer ??= new Timer(_ => { try { Check(); } catch (Exception ex) { Log.Warn("network", ex.Message); } }, null, TimeSpan.Zero, Interval);

    /// <summary>Returns true when a change was reported.</summary>
    public bool Check()
    {
        var now = _addresses();
        if (now.Count == 0) return false; // not connected right now (e.g. Wi-Fi still coming up) – nothing to compare
        var old = _store.Snapshot().Known;
        var changed = old.Count > 0 && !old.Any(a => now.Contains(a));
        if (!old.OrderBy(a => a).SequenceEqual(now.OrderBy(a => a))) _store.Update(f => f.Known = now.ToList());
        if (!changed) return false;
        Log.Info("network", $"WLAN-Adresse des PCs geändert: {string.Join(", ", old)} → {string.Join(", ", now)}");
        if (!_hasRemoteDevices()) return false;
        Changed?.Invoke(old, now);
        return true;
    }

    public void Dispose() => _timer?.Dispose();
}
