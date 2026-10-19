using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

[Collection("GameActivity")] // shared static state
public class PerformanceTests
{
    [Fact]
    public void Process_paths_are_looked_up_once_per_process()
    {
        var cache = new ProcessPathCache();
        var calls = new List<int>();
        string? Resolve(int pid) { calls.Add(pid); return $"C:/Games/{pid}.exe"; }
        cache.Resolve(new[] { (1, "steam"), (2, "game") }, Resolve);
        var second = cache.Resolve(new[] { (1, "steam"), (2, "game"), (3, "discord") }, Resolve);
        Assert.Equal(new[] { 1, 2, 3 }, calls); // 1 and 2 not again
        Assert.Equal("C:/Games/3.exe", second.Single(p => p.Pid == 3).Path);
        // A recycled process id with another name is looked up again; gone processes are forgotten.
        cache.Resolve(new[] { (2, "other") }, Resolve);
        Assert.Equal(new[] { 1, 2, 3, 2 }, calls);
        Assert.Equal(1, cache.Count);
    }

    [Fact]
    public void Nvidia_smi_lines_are_parsed_and_missing_values_stay_empty()
    {
        var r = NvidiaSmi.ParseLine("0, NVIDIA GeForce RTX 4070, 87, 66, 7012, 12282")!.Value;
        Assert.Equal(0, r.index);
        Assert.Equal("NVIDIA GeForce RTX 4070", r.gpu.Name);
        Assert.Equal(87, r.gpu.UtilPercent);
        Assert.Equal(66, r.gpu.TempC);
        Assert.Equal(7012L * 1024 * 1024, r.gpu.MemUsedBytes);
        var na = NvidiaSmi.ParseLine("1, Tesla T4, [N/A], 40, 0, 15360")!.Value;
        Assert.Null(na.gpu.UtilPercent); // not invented
        Assert.Null(NvidiaSmi.ParseLine("Failed to initialize NVML"));
    }

    [Fact]
    public async Task Background_work_waits_while_a_game_runs_and_runs_once_afterwards()
    {
        GameActivity.IdleDelay = TimeSpan.FromMilliseconds(50);
        try
        {
            var runs = 0;
            GameActivity.Set(true);
            GameActivity.RunWhenIdle("test-sync", () => { Interlocked.Increment(ref runs); return Task.CompletedTask; });
            GameActivity.RunWhenIdle("test-sync", () => { Interlocked.Increment(ref runs); return Task.CompletedTask; }); // same job only once
            await Task.Delay(200);
            Assert.Equal(0, runs);
            GameActivity.Set(false);
            for (var i = 0; i < 50 && runs == 0; i++) await Task.Delay(20);
            Assert.Equal(1, runs);
            GameActivity.RunWhenIdle("test-now", () => { Interlocked.Increment(ref runs); return Task.CompletedTask; }); // no game: right away
            for (var i = 0; i < 50 && runs == 1; i++) await Task.Delay(20);
            Assert.Equal(2, runs);
        }
        finally { GameActivity.Set(false); GameActivity.IdleDelay = TimeSpan.FromSeconds(30); }
    }

    sealed class RecordingGameMode : IGameMode
    {
        public List<(bool gaming, bool audio)> Calls { get; } = new();
        public string Apply(bool gaming, bool audioLive) { Calls.Add((gaming, audioLive)); return ""; }
    }

    sealed class FakeProcesses : IProcessSource
    {
        public List<ProcessInfo> Running { get; } = new();
        public bool? LastWithPaths;
        public IReadOnlyList<ProcessInfo> Snapshot() => Snapshot(true);
        public IReadOnlyList<ProcessInfo> Snapshot(bool withPaths) { LastWithPaths = withPaths; return Running.ToList(); }
    }

    [Fact]
    public void Game_start_and_end_switch_the_companion_into_game_mode_and_back()
    {
        using var dir = new TempDir();
        var procs = new FakeProcesses();
        var mode = new RecordingGameMode();
        var platform = new TestPlatform(procs, mode);
        var s = new CompanionServices(platform, new Pgl.Core.Infrastructure.AppPaths(dir.Path), new Hosting.WebAssets(dir.Path));
        try
        {
            s.Library.Import(new LibraryFile { Items = { new LibraryItem { Id = "item_t", Kind = ItemKind.Game, Name = "Testspiel", ProcessNames = { "game" } } } });
            s.Sessions.Tick();
            Assert.Empty(mode.Calls);
            Assert.False(procs.LastWithPaths); // no game detected by folder → no path lookups
            procs.Running.Add(new ProcessInfo(42, "game", null));
            s.Sessions.Tick();
            Assert.Equal((true, false), mode.Calls.Last());
            Assert.True(GameActivity.Running);
            procs.Running.Clear();
            s.Sessions.Tick();
            Assert.Equal((false, false), mode.Calls.Last());
            Assert.False(GameActivity.Running);
        }
        finally { s.DisposeAsync().AsTask().Wait(); GameActivity.Set(false); }
    }

    sealed class TestPlatform(IProcessSource procs, IGameMode mode) : IPlatform
    {
        readonly GenericPlatform _g = new();
        public string Name => "Test";
        public ILauncher Launcher => _g.Launcher;
        public IProcessSource Processes => procs;
        public IAudioEngine Audio => _g.Audio;
        public IHotkeyRegistrar Hotkeys => _g.Hotkeys;
        public IMetricsSource Metrics => _g.Metrics;
        public IAutostart Autostart => _g.Autostart;
        public ISecretProtector Secrets => _g.Secrets;
        public IDesktopIntegration Desktop => _g.Desktop;
        public IEnumerable<IDetector> Detectors => Array.Empty<IDetector>();
        public IUpdateInstaller UpdateInstaller => _g.UpdateInstaller;
        public IGameMode GameMode => mode;
    }
}
