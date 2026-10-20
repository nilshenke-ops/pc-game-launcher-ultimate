using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Lock, sleep, restart and shut down from a device. Windows does the work (LockWorkStation, shutdown.exe with a
/// countdown that Windows itself shows). A planned restart/shutdown is remembered so every device can see it and
/// cancel it; the PC shows a notification who asked for it. Never queued for later (see web lib/outbox.ts).
/// </summary>
public sealed class PowerService(IPowerControl power, IHub hub, NotificationCenter notes, Func<DateTime>? clock = null)
{
    public sealed record Planned(string Action, DateTime At, string By);
    static readonly string[] Actions = { "lock", "sleep", "restart", "shutdown", "cancel" };
    readonly Func<DateTime> _now = clock ?? (() => DateTime.UtcNow);
    Planned? _planned;
    readonly object _lock = new();

    public bool Supported => power.Supported;

    /// <summary>Planned restart/shutdown that has not happened yet (gone once its time is over).</summary>
    public Planned? Current { get { lock (_lock) return _planned is { } p && p.At > _now().AddSeconds(-10) ? p : null; } }

    public object Status(RpcSession session) => new
    {
        supported = power.Supported,
        planned = Current is { } p ? new { action = p.Action, at = p.At, by = p.By } : null,
        canLock = session.Has(Security.Permissions.Launch),
        canPower = session.Has(Security.Permissions.Power),
    };

    public Planned? Run(string action, int delaySeconds, string by)
    {
        if (!Actions.Contains(action)) throw new RpcException("invalid-params", "Unbekannte Aktion.");
        delaySeconds = Math.Clamp(delaySeconds, 0, 600);
        if (action == "cancel" && Current == null) throw new RpcException("not-found", "Es ist kein Neustart und kein Herunterfahren geplant.");
        Log.Info("power", $"{action} angefordert von {by}" + (action is "restart" or "shutdown" ? $" (in {delaySeconds} s)" : ""));
        if (power.Run(action, delaySeconds) is { } err) throw new RpcException("power", err);
        Planned? result = null;
        lock (_lock)
        {
            if (action is "restart" or "shutdown") _planned = result = new Planned(action, _now().AddSeconds(delaySeconds), by);
            else if (action == "cancel") _planned = null;
        }
        var title = action switch
        {
            "lock" => $"PC gesperrt von {by}", "sleep" => $"Energiesparmodus von {by}",
            "restart" => delaySeconds > 0 ? $"Neustart in {delaySeconds} s – angefordert von {by}" : $"Neustart angefordert von {by}",
            "shutdown" => delaySeconds > 0 ? $"Herunterfahren in {delaySeconds} s – angefordert von {by}" : $"Herunterfahren angefordert von {by}",
            _ => $"Neustart/Herunterfahren abgebrochen von {by}",
        };
        notes.Push("power:" + action, action is "restart" or "shutdown" ? Severity.Warning : Severity.Info, title);
        hub.Changed("power");
        return result;
    }
}
