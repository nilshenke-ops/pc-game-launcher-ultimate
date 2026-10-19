using System.Collections.Concurrent;
using Pgl.Core.Infrastructure;

namespace Pgl.Core.Services;

/// <summary>
/// Knows whether a game from the library is running. Background work that is not urgent (catalog and library syncs,
/// cover search, update and plugin checks) waits until no game runs any more, so the companion does not compete
/// with the game for CPU, disk and network.
/// </summary>
public static class GameActivity
{
    static volatile bool _running;
    static readonly ConcurrentDictionary<string, Func<Task>> Deferred = new();
    /// <summary>Pause after the last game ended before deferred work starts (the PC is often busy right then).</summary>
    public static TimeSpan IdleDelay { get; set; } = TimeSpan.FromSeconds(30);

    public static bool Running => _running;

    public static void Set(bool running)
    {
        if (_running == running) return;
        _running = running;
        if (running || Deferred.IsEmpty) return;
        _ = Task.Run(async () =>
        {
            await Task.Delay(IdleDelay);
            if (_running) return; // the next game already started – keep waiting
            foreach (var key in Deferred.Keys.ToList())
                if (Deferred.TryRemove(key, out var work))
                    try { await work(); } catch (Exception ex) { Log.Warn("background", $"{key}: {ex.Message}"); }
        });
    }

    /// <summary>Runs the work now, or – while a game runs – once after it ended (same key = only once).</summary>
    public static void RunWhenIdle(string key, Func<Task> work)
    {
        if (!_running) { _ = Task.Run(async () => { try { await work(); } catch (Exception ex) { Log.Warn("background", $"{key}: {ex.Message}"); } }); return; }
        Deferred[key] = work;
    }

    public static int DeferredCount => Deferred.Count;
}
