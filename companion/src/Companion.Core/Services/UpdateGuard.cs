using Pgl.Core.Infrastructure;

namespace Pgl.Core.Services;

public sealed class UpdateGuardFile
{
    /// <summary>Version of the last start.</summary>
    public string? Version { get; set; }
    /// <summary>The last start of <see cref="Version"/> is still running (or ended without a clean exit = crash).</summary>
    public bool Running { get; set; }
    /// <summary>This version ran stable once (long enough without crashing).</summary>
    public bool Stable { get; set; }
    /// <summary>Starts of this version that crashed before running stable.</summary>
    public int Failures { get; set; }
    public string? LastStableVersion { get; set; }
    /// <summary>Set when the guard rolled back; shown once by the version that is started afterwards.</summary>
    public string? RolledBackFrom { get; set; }
    public DateTime? RolledBackAt { get; set; }
}

/// <summary>
/// Update guard: if a newly installed version crashes twice before it ran stable for a minute, the companion goes back
/// to the last stable version on its own (the previous executable is kept by the installer). A clean exit – closing the
/// app, shutting down Windows – never counts as a failure. Only versions that ran stable before are rolled back to.
/// </summary>
public sealed class UpdateGuard
{
    public const int MaxFailures = 2;
    public static readonly TimeSpan StableAfter = TimeSpan.FromSeconds(60);
    public enum Decision { Continue, RollBack }

    readonly JsonStore<UpdateGuardFile> _store;
    readonly Func<DateTime> _now;

    public UpdateGuard(AppPaths paths, Func<DateTime>? now = null)
    {
        _store = new JsonStore<UpdateGuardFile>(paths.File("update-guard.json"));
        _now = now ?? (() => DateTime.UtcNow);
    }

    public UpdateGuardFile Snapshot() => _store.Snapshot();

    /// <summary>Called first thing at start. Returns <see cref="Decision.RollBack"/> when this version keeps crashing.</summary>
    public Decision OnStart(string version, bool canRollBack)
    {
        return _store.Update(f =>
        {
            if (f.Version != version)
            {
                // First start of this version (after an update, a rollback or the very first start).
                f.Version = version; f.Running = false; f.Stable = false; f.Failures = 0;
            }
            if (f.Running && !f.Stable) f.Failures++; // the previous start of this version did not end cleanly
            f.Running = true;
            if (!f.Stable && f.Failures >= MaxFailures && canRollBack && f.LastStableVersion != null && f.LastStableVersion != version)
            {
                f.RolledBackFrom = version; f.RolledBackAt = _now(); f.Running = false;
                return Decision.RollBack;
            }
            return Decision.Continue;
        });
    }

    /// <summary>The version has been running for <see cref="StableAfter"/> – it counts as good from now on.</summary>
    public void MarkStable(string version) => _store.Update(f =>
    {
        if (f.Version != version) return;
        f.Stable = true; f.Failures = 0; f.LastStableVersion = version;
    });

    /// <summary>Normal end of the app (also Windows shutdown).</summary>
    public void CleanExit() => _store.Update(f => f.Running = false);

    /// <summary>Note about an automatic rollback, returned once.</summary>
    public (string from, DateTime at)? TakeRollbackNote(string currentVersion)
    {
        (string, DateTime)? note = null;
        _store.Update(f =>
        {
            if (f.RolledBackFrom == null || f.RolledBackFrom == currentVersion) return;
            note = (f.RolledBackFrom, f.RolledBackAt ?? _now());
            f.RolledBackFrom = null; f.RolledBackAt = null;
        });
        return note;
    }
}
