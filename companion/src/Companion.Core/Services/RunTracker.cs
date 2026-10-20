using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class RunStep
{
    public string Label { get; set; } = "";
    /// <summary>pending, running, done, failed, skipped</summary>
    public string Status { get; set; } = "pending";
    public string? Result { get; set; }
}

public sealed class ActionRun
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? ActionId { get; set; }
    public string By { get; set; } = "";
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    /// <summary>running, done, failed (a step failed), cancelled, stopped (a condition was not met)</summary>
    public string State { get; set; } = "running";
    public List<RunStep> Steps { get; set; } = new();
    /// <summary>The run switched the gaming profile – after a cancel the previous one can be restored.</summary>
    public bool ProfileChanged { get; set; }
    internal CancellationTokenSource Cts { get; } = new();
}

/// <summary>
/// Runs quick actions ("scenes") step by step so every device sees the progress and can cancel. Kept in memory only
/// (the last 20 runs); a restart of the companion ends running scenes – they are not resumed by themselves.
/// </summary>
public sealed class RunTracker
{
    const int Keep = 20;
    readonly ActionRunner _runner;
    readonly IHub _hub;
    readonly Func<ActionStep, string> _label;
    readonly object _lock = new();
    readonly List<ActionRun> _runs = new();

    public RunTracker(ActionRunner runner, IHub hub, Func<ActionStep, string> label)
    {
        _runner = runner; _hub = hub; _label = label;
    }

    public List<ActionRun> List() { lock (_lock) return _runs.ToList(); }

    public (ActionRun run, Task<List<string>> done) Start(string name, string? actionId, IReadOnlyList<ActionStep> steps, string by)
    {
        var run = new ActionRun
        {
            Id = Ids.New("run"), Name = name, ActionId = actionId, By = by, StartedAt = DateTime.UtcNow,
            Steps = steps.Take(20).Select(s => new RunStep { Label = Safe(s) }).ToList(),
        };
        lock (_lock)
        {
            if (actionId != null && _runs.Any(r => r.ActionId == actionId && r.State == "running"))
                throw new RpcException("busy", $"„{name}“ läuft schon – erst abwarten oder abbrechen.");
            _runs.Insert(0, run);
            if (_runs.Count > Keep) _runs.RemoveRange(Keep, _runs.Count - Keep);
        }
        if (run.Steps.Count > 0) run.Steps[0].Status = "running";
        _hub.Changed("runs");
        var done = Task.Run(async () =>
        {
            try
            {
                var results = await _runner.RunAsync(steps, by, (i, result) =>
                {
                    lock (_lock)
                    {
                        if (i >= run.Steps.Count) return;
                        var st = run.Steps[i];
                        st.Result = result;
                        st.Status = result == ActionRunner.Cancelled ? "skipped" : result.StartsWith("Fehler") ? "failed" : "done";
                        if (steps[i].Type == StepType.ActivateProfile && st.Status == "done") run.ProfileChanged = true;
                        if (i + 1 < run.Steps.Count && st.Status != "skipped") run.Steps[i + 1].Status = "running";
                    }
                    _hub.Changed("runs");
                }, run.Cts.Token);
                lock (_lock)
                {
                    var stoppedEarly = results.Count > 0 && results[^1].StartsWith("Beendet:");
                    foreach (var st in run.Steps.Where(x => x.Status is "pending" or "running")) { st.Status = "skipped"; }
                    run.State = run.Cts.IsCancellationRequested ? "cancelled" : stoppedEarly ? "stopped" : run.Steps.Any(x => x.Status == "failed") ? "failed" : "done";
                    run.EndedAt = DateTime.UtcNow;
                }
                return results;
            }
            catch (Exception ex)
            {
                Log.Warn("runs", ex.Message);
                lock (_lock) { run.State = "failed"; run.EndedAt = DateTime.UtcNow; }
                return new List<string> { "Fehler: " + ex.Message };
            }
            finally { _hub.Changed("runs"); }
        });
        return (run, done);
    }

    string Safe(ActionStep s) { try { return _label(s); } catch { return s.Type.ToString(); } }

    public void Cancel(string id)
    {
        ActionRun run;
        lock (_lock) run = _runs.FirstOrDefault(r => r.Id == id) ?? throw new RpcException("not-found", "Ablauf nicht gefunden.");
        if (run.State != "running") throw new RpcException("invalid-params", "Der Ablauf ist schon beendet.");
        run.Cts.Cancel();
        _hub.Changed("runs");
    }
}
