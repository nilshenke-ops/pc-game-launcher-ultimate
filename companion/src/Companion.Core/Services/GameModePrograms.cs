using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using System.Text.RegularExpressions;

namespace Pgl.Core.Services;

public sealed class GameModeProgram
{
    /// <summary>Process name without ".exe", e.g. "chrome".</summary>
    public string Name { get; set; } = "";
    public string? Label { get; set; }
}

public sealed class GameModeProgramsFile
{
    public bool Enabled { get; set; }
    /// <summary>Open the closed programs again when the last game ends.</summary>
    public bool Restore { get; set; } = true;
    public List<GameModeProgram> Programs { get; set; } = new();
    /// <summary>Paths of programs this game mode closed and has not reopened yet (survives a companion restart).</summary>
    public List<string> ClosedPaths { get; set; } = new();
}

/// <summary>
/// Game mode for other programs: when a game starts, programs the user listed are asked to close (like clicking their X –
/// never killed); when the last game ends they are started again. System processes, game launchers, anti-cheat and the
/// companion itself can never be listed, and the running game is never touched.
/// </summary>
public sealed class GameModePrograms
{
    public static readonly HashSet<string> Blocked = new(StringComparer.OrdinalIgnoreCase)
    {
        // Windows
        "System", "Idle", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "svchost", "dwm", "explorer", "sihost", "fontdrvhost",
        "taskhostw", "ctfmon", "RuntimeBroker", "SearchHost", "SearchApp", "StartMenuExperienceHost", "ShellExperienceHost", "conhost", "audiodg",
        "MsMpEng", "SecurityHealthService", "SecurityHealthSystray", "spoolsv", "dllhost", "WmiPrvSE", "TextInputHost", "LockApp", "Registry", "MemCompression",
        // game launchers (games need them) and anti-cheat
        "steam", "steamwebhelper", "steamservice", "EpicGamesLauncher", "EpicWebHelper", "EADesktop", "EABackgroundService", "Origin", "Battle.net", "Agent",
        "upc", "UbisoftConnect", "GalaxyClient", "GalaxyClientService", "XboxPcApp", "GamingServices", "EasyAntiCheat", "EasyAntiCheat_EOS", "BEService",
        "vgc", "vgtray", "FACEIT", "faceitservice", "EAAntiCheat.GameServiceLauncher",
        // the companion
        "PCGameLauncherCompanion", "Companion.Headless", "dotnet",
    };
    static readonly Regex NameRx = new(@"^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,79}$");
    public static readonly TimeSpan CloseWait = TimeSpan.FromSeconds(8);

    readonly JsonStore<GameModeProgramsFile> _store;
    readonly IProcessSource _processes;
    readonly IProcessControl _control;
    readonly IHub _hub;
    readonly Func<IEnumerable<string>> _gameProcessNames;
    readonly SemaphoreSlim _busy = new(1, 1);
    /// <summary>(key, title, message) for a notification after closing/restoring.</summary>
    public Action<string, string, string>? Report { get; set; }

    public GameModePrograms(AppPaths paths, IProcessSource processes, IProcessControl control, IHub hub, Func<IEnumerable<string>> gameProcessNames)
    {
        _store = new JsonStore<GameModeProgramsFile>(paths.File("gamemode-programs.json"));
        _processes = processes; _control = control; _hub = hub; _gameProcessNames = gameProcessNames;
    }

    /// <summary>"Chrome.exe " → "Chrome". Paths are not accepted (no separators in <see cref="NameRx"/>).</summary>
    public static string Normalize(string name)
    {
        name = name.Trim();
        return name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name[..^4] : name;
    }

    public object Get()
    {
        var f = _store.Snapshot();
        return new { f.Enabled, f.Restore, f.Programs, supported = _control.Supported, waitingToReopen = f.ClosedPaths.Count, preview = Preview() };
    }

    public object Save(bool? enabled, bool? restore, List<GameModeProgram>? programs)
    {
        if (programs != null)
        {
            if (programs.Count > 30) throw new RpcException("invalid-params", "Höchstens 30 Programme.");
            foreach (var p in programs)
            {
                p.Name = Normalize(p.Name);
                if (!NameRx.IsMatch(p.Name)) throw new RpcException("invalid-params", $"„{p.Name}“ ist kein gültiger Programmname.");
                if (Blocked.Contains(p.Name)) throw new RpcException("invalid-params", $"„{p.Name}“ darf nicht geschlossen werden (Windows, Spiele-Launcher, Anti-Cheat oder der Begleiter selbst).");
                p.Label = p.Label == null ? null : Security.DeviceStore.Sanitize(p.Label, 60, p.Name);
            }
            programs = programs.GroupBy(p => p.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
        }
        _store.Update(f =>
        {
            if (enabled != null) f.Enabled = enabled.Value;
            if (restore != null) f.Restore = restore.Value;
            if (programs != null) f.Programs = programs;
        });
        _hub.Changed("gamemode");
        return Get();
    }

    /// <summary>What would be closed right now (listed and running, never the game itself).</summary>
    public List<object> Preview()
    {
        var f = _store.Snapshot();
        var running = _processes.Snapshot(withPaths: false);
        var games = _gameProcessNames().ToHashSet(StringComparer.OrdinalIgnoreCase);
        return f.Programs.Select(p =>
        {
            var count = running.Count(r => r.Name.Equals(p.Name, StringComparison.OrdinalIgnoreCase));
            return (object)new { p.Name, p.Label, running = count, protectedAsGame = games.Contains(p.Name) };
        }).ToList();
    }

    /// <summary>Running programs that could be added (names, deduplicated, without blocked ones).</summary>
    public List<string> RunningCandidates() => _processes.Snapshot(withPaths: false).Select(p => p.Name)
        .Where(n => !Blocked.Contains(n) && NameRx.IsMatch(n)).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).Take(300).ToList();

    public async Task<List<string>> GameStartedAsync()
    {
        var f = _store.Snapshot();
        var results = new List<string>();
        if (!f.Enabled || f.Programs.Count == 0 || !_control.Supported) return results;
        await _busy.WaitAsync();
        try
        {
            var games = _gameProcessNames().ToHashSet(StringComparer.OrdinalIgnoreCase);
            var running = _processes.Snapshot(withPaths: true);
            var closedPaths = new List<string>();
            int closed = 0;
            foreach (var p in f.Programs.Where(p => !Blocked.Contains(p.Name) && !games.Contains(p.Name)))
            {
                // Many programs run several processes (browsers, chat apps); only one of them has the window. The program counts
                // as closed when one of them closed – the helper processes without a window are no reason for a message.
                var procs = running.Where(r => r.Name.Equals(p.Name, StringComparison.OrdinalIgnoreCase)).ToList();
                if (procs.Count == 0) continue;
                string? firstError = null; var ok = false;
                foreach (var proc in procs)
                {
                    var err = await Task.Run(() => _control.CloseGracefully(proc.Pid, CloseWait));
                    if (err == null) { ok = true; if (proc.Path != null && !closedPaths.Contains(proc.Path, StringComparer.OrdinalIgnoreCase)) closedPaths.Add(proc.Path); }
                    else firstError ??= err;
                }
                if (ok) closed++; else if (firstError != null) results.Add($"{p.Label ?? p.Name}: {firstError}");
            }
            _store.Update(x => { foreach (var path in closedPaths) if (!x.ClosedPaths.Contains(path, StringComparer.OrdinalIgnoreCase)) x.ClosedPaths.Add(path); });
            if (closed > 0 || results.Count > 0)
            {
                Log.Info("gamemode", $"Spielmodus: {closed} Programm(e) geschlossen" + (results.Count > 0 ? "; " + string.Join("; ", results) : ""));
                Report?.Invoke("closed", closed > 0 ? $"Spielmodus: {closed} Programm{(closed == 1 ? "" : "e")} geschlossen" : "Spielmodus: Programme nicht geschlossen",
                    (results.Count > 0 ? string.Join("\n", results) + "\n" : "") + (f.Restore ? "Sie werden nach dem Spiel wieder geöffnet." : "Wieder öffnen ist ausgeschaltet."));
            }
            _hub.Changed("gamemode");
            return results;
        }
        finally { _busy.Release(); }
    }

    public async Task<int> AllGamesStoppedAsync()
    {
        var f = _store.Snapshot();
        if (f.ClosedPaths.Count == 0) return 0;
        await _busy.WaitAsync();
        try
        {
            var opened = 0;
            if (f.Restore && _control.Supported)
            {
                var running = _processes.Snapshot(withPaths: true).Select(p => p.Path).Where(p => p != null).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var path in f.ClosedPaths.Where(p => !running.Contains(p)))
                {
                    var err = await Task.Run(() => _control.Start(path));
                    if (err == null) opened++; else Log.Warn("gamemode", $"{Path.GetFileName(path)} nicht wieder geöffnet: {err}");
                }
                if (opened > 0) Report?.Invoke("reopened", $"Spielmodus: {opened} Programm{(opened == 1 ? "" : "e")} wieder geöffnet", string.Join(", ", f.ClosedPaths.Select(Path.GetFileNameWithoutExtension)));
            }
            _store.Update(x => x.ClosedPaths.Clear());
            _hub.Changed("gamemode");
            return opened;
        }
        finally { _busy.Release(); }
    }

    internal GameModeProgramsFile Export()
    {
        var f = _store.Snapshot();
        return new GameModeProgramsFile { Enabled = f.Enabled, Restore = f.Restore, Programs = f.Programs }; // closed paths are PC state, not settings
    }

    /// <summary>From a backup: the same checks as saving (blocked names are dropped instead of failing the whole restore).</summary>
    internal void ImportChecked(GameModeProgramsFile f)
    {
        var programs = (f.Programs ?? new()).Where(p => p?.Name != null && NameRx.IsMatch(Normalize(p.Name)) && !Blocked.Contains(Normalize(p.Name))).Take(30).ToList();
        Save(f.Enabled, f.Restore, programs);
    }
}
