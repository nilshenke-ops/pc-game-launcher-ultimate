using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>Your own status ("busy", "in a raid until 22:00") plus the game running on the PC.</summary>
public sealed class ActivityFile
{
    /// <summary>available, busy, away, dnd, invisible</summary>
    public string Status { get; set; } = "available";
    public string? Text { get; set; }
    /// <summary>After this time (UTC) the status falls back to "available" (null = stays).</summary>
    public DateTime? Until { get; set; }
    /// <summary>Show the running game with the status.</summary>
    public bool ShowGame { get; set; } = true;
    /// <summary>Devices with only "view" rights (e.g. a family tablet) see the status. Off by default: then only devices that may change things see it.</summary>
    public bool Share { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// Activity status. Nothing leaves the PC: the status is only shown to the paired devices – and to "view" devices only
/// if sharing is switched on. Discord or other platforms are not contacted.
/// </summary>
public sealed class ActivityService
{
    public static readonly string[] Statuses = { "available", "busy", "away", "dnd", "invisible" };
    readonly JsonStore<ActivityFile> _store;
    readonly IHub _hub;
    readonly Func<IReadOnlyList<(string itemId, string name, DateTime since)>> _running;

    public ActivityService(AppPaths paths, IHub hub, Func<IReadOnlyList<(string itemId, string name, DateTime since)>> running)
    {
        _store = new JsonStore<ActivityFile>(paths.File("activity.json"));
        _hub = hub;
        _running = running;
    }

    public ActivityFile Get() => _store.Snapshot();

    /// <summary>What a device gets to see. <paramref name="full"/> = the device may change settings (manage).</summary>
    public object View(bool full, DateTime nowUtc)
    {
        var a = _store.Snapshot();
        if (!a.Share && !full) return new { shared = false };
        var expired = a.Until is { } u && u <= nowUtc;
        var status = expired ? "available" : a.Status;
        // "Invisible" hides the game from view-only devices as well – that is what the status promises.
        var game = a.ShowGame && (full || status != "invisible") ? _running().OrderBy(r => r.since).FirstOrDefault() : default;
        return new
        {
            shared = true,
            status,
            text = expired ? null : a.Text,
            until = expired ? null : a.Until,
            a.ShowGame,
            share = full ? a.Share : (bool?)null,
            playing = game.itemId == null ? null : new { game.itemId, game.name, game.since },
            a.UpdatedAt,
        };
    }

    public ActivityFile Set(ActivityFile v)
    {
        Validate(v);
        v.UpdatedAt = DateTime.UtcNow;
        _store.Replace(v);
        _hub.Changed("activity");
        return v;
    }

    public static void Validate(ActivityFile v)
    {
        if (!Statuses.Contains(v.Status ?? "")) throw new RpcException("invalid-params", "Status: verfügbar, beschäftigt, abwesend, nicht stören oder unsichtbar.");
        v.Text = string.IsNullOrWhiteSpace(v.Text) ? null : DeviceStore.Sanitize(v.Text, 60, "");
        if (v.Text?.Length == 0) v.Text = null;
        if (v.Until is { } u)
        {
            u = DateTime.SpecifyKind(u.Kind == DateTimeKind.Local ? u.ToUniversalTime() : u, DateTimeKind.Utc);
            if (u.Year is < 2000 or > 2100) throw new RpcException("invalid-params", "Ungültige Zeit.");
            v.Until = u;
        }
    }

    /// <summary>The running game changed – devices showing the status refresh it.</summary>
    public void GameChanged() => _hub.Changed("activity");

    internal ActivityFile Export() => _store.Snapshot();

    internal void ImportChecked(ActivityFile f)
    {
        try { Validate(f); } catch (RpcException ex) { Log.Warn("activity", "Status aus dem Backup übersprungen: " + ex.Message); return; }
        _store.Replace(f);
        _hub.Changed("activity");
    }
}
