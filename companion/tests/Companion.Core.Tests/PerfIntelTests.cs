// 3.66 Performance Intelligence: PresentMon CSV (old and new columns), FPS statistics, automatic sessions, the advisor, drive activity.
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class PerfIntelTests
{
    const string HeaderV1 = "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,TimeInSeconds,MsInPresentAPI,MsUntilRenderComplete,MsUntilDisplayed,MsBetweenPresents,MsBetweenDisplayChange,MsGPUActive";
    const string HeaderV2 = "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,AllowsTearing,PresentMode,FrameType,CPUStartTime,FrameTime,CPUBusy,CPUWait,GPULatency,GPUTime,GPUBusy,GPUWait,DisplayLatency,DisplayedTime";

    static string V1(string app, double ms, double gpu = 5, int dropped = 0) => $"{app},4242,0x1,DXGI,1,0,{dropped},1.0,0.1,1.0,2.0,{ms.ToString(System.Globalization.CultureInfo.InvariantCulture)},16.6,{gpu.ToString(System.Globalization.CultureInfo.InvariantCulture)}";
    static string V2(string app, double ms, double gpu) => $"{app},77,0x1,DXGI,0,0,1,Hardware: Independent Flip,Application,123,{ms.ToString(System.Globalization.CultureInfo.InvariantCulture)},1,1,1,1,{gpu.ToString(System.Globalization.CultureInfo.InvariantCulture)},0,5,{ms.ToString(System.Globalization.CultureInfo.InvariantCulture)}";

    [Fact]
    public void PresentMon_old_and_new_columns_are_read_from_the_header()
    {
        var a = new PresentMonCsv();
        Assert.Null(a.Parse(V1("game.exe", 16.6)));        // no header yet → nothing guessed
        Assert.Null(a.Parse(HeaderV1));
        var f = a.Parse(V1("game.exe", 16.6, 9.5, 1))!.Value;
        Assert.Equal("game.exe", f.App); Assert.Equal(4242, f.Pid); Assert.Equal(16.6, f.FrameMs); Assert.Equal(9.5, f.GpuBusyMs); Assert.Equal("DXGI", f.Api); Assert.True(f.Dropped);

        var b = new PresentMonCsv();
        b.Parse(HeaderV2);
        var g = b.Parse(V2("vk.exe", 8.3, 7.0))!.Value;
        Assert.Equal(8.3, g.FrameMs); Assert.Equal(7.0, g.GpuBusyMs); Assert.Equal(77, g.Pid);
        Assert.Null(b.Parse("vk.exe,77,broken"));          // short or broken lines are skipped
    }

    [Fact]
    public void Statistics_average_lows_frame_time_and_stutter()
    {
        var st = new FrameStats();
        // 990 frames at 10 ms (100 FPS) and 10 frames at 50 ms: the 1 % low is the slow ones, the average stays high.
        for (var i = 0; i < 1000; i++) st.Add(new FrameRecord("g", 1, i % 100 == 50 ? 50 : 10, 8, "DXGI", false));
        Assert.Equal(1000, st.Frames);
        Assert.InRange(st.Average!.Value, 95, 97);           // 1000 frames in 10.4 s
        Assert.InRange(st.Low1!.Value, 19, 21);              // 99th percentile = 50 ms → 20 FPS
        Assert.NotNull(st.Low01);
        Assert.Equal(10, st.Stutters);                        // every 50-ms frame among 10-ms frames is a stutter
        Assert.InRange(st.Now()!.Value, 80, 101);
        Assert.InRange(st.GpuBusyPercent!.Value, 60, 80);
        Assert.True(st.PerSecond.Count >= 9);
    }

    [Fact]
    public void Too_few_frames_give_no_lows_instead_of_guesses()
    {
        var st = new FrameStats();
        for (var i = 0; i < 50; i++) st.Add(new FrameRecord("g", 1, 16, null, null, false));
        Assert.Null(st.Low1); Assert.Null(st.Low01); Assert.Null(st.GpuBusyPercent);
    }

    sealed class FakeCapture : IFrameCapture
    {
        public Action<string>? Line; public Action<string?>? Ended; public int Starts, Stops;
        public string? Unavailable { get; set; }
        public string? PermissionProblem { get; set; }
        public bool CanRequestPermission => PermissionProblem != null;
        public string RequestPermission() => "ok";
        public void Start(Action<string> line, Action<string?> ended) { Starts++; Line = line; Ended = ended; }
        public void Stop() => Stops++;
    }

    [Fact]
    public void Starts_with_the_game_measures_the_game_not_the_desktop_and_saves_the_session()
    {
        using var dir = new TempDir();
        var cap = new FakeCapture();
        var fps = new FpsService(cap, new AppPaths(dir.Path), () => true);
        Assert.Equal("idle", fps.Live().State);
        fps.GameStarted("item1", "Brotato");
        Assert.Equal(1, cap.Starts);
        Assert.Equal("waiting", fps.Live().State);
        cap.Line!(HeaderV1);
        for (var i = 0; i < 1200; i++) { cap.Line(V1("Brotato.exe", 8)); if (i % 3 == 0) { cap.Line(V1("dwm.exe", 16)); cap.Line(V1("msedge.exe", 16)); } }
        var live = fps.Live();
        Assert.Equal("measuring", live.State);
        Assert.Equal("Brotato.exe", live.Process);           // the compositor and the browser are not "the game"
        Assert.InRange(live.Avg!.Value, 124, 126);
        var s = fps.GameStopped()!;
        Assert.Equal(1, cap.Stops);
        Assert.Equal("Brotato", s.Game); Assert.Equal("item1", s.ItemId);
        Assert.Equal(125, s.Avg);
        Assert.Single(fps.Sessions());
        // a second, shorter-than-needed session is not saved
        fps.GameStarted("item1", "Brotato"); cap.Line(HeaderV1);
        for (var i = 0; i < 100; i++) cap.Line(V1("Brotato.exe", 8));
        Assert.Null(fps.GameStopped());
        Assert.Single(fps.Sessions());
    }

    [Fact]
    public void Says_why_it_cannot_measure()
    {
        using var dir = new TempDir();
        var cap = new FakeCapture { PermissionProblem = "Gruppe fehlt" };
        var fps = new FpsService(cap, new AppPaths(dir.Path), () => true);
        fps.GameStarted("x", "Spiel");
        Assert.Equal(0, cap.Starts);                          // nothing is started without the permission
        Assert.Equal("permission", fps.Live().State);
        Assert.True(fps.Live().CanRequestPermission);
        Assert.Equal("off", new FpsService(cap, new AppPaths(dir.Path), () => false).Live().State);
        Assert.Equal("unavailable", new FpsService(NullFrameCapture.Instance, new AppPaths(dir.Path), () => true).Live().State);
        // PresentMon ends by itself (e.g. no permission after all): the reason is shown
        var cap2 = new FakeCapture(); var f2 = new FpsService(cap2, new AppPaths(dir.Path), () => true);
        f2.GameStarted("x", "Spiel"); cap2.Ended!("Keine Berechtigung");
        Assert.Equal("stopped", f2.Live().State); Assert.Equal("Keine Berechtigung", f2.Live().Message);
    }

    [Fact]
    public void Sessions_are_compared_only_when_comparable()
    {
        var a = new FpsSession { Game = "G", Avg = 120, Minutes = 30, Api = "DXGI" };
        var b = new FpsSession { Game = "G", Avg = 100, Minutes = 20, Api = "DXGI" };
        Assert.Contains("20 % mehr", FpsService.Compare(a, b));
        Assert.Contains("Ähnlich", FpsService.Compare(new FpsSession { Avg = 102, Minutes = 5 }, b));
        Assert.Null(FpsService.Compare(new FpsSession { Avg = 102, Minutes = 1 }, b));                    // too short
        Assert.Null(FpsService.Compare(new FpsSession { Avg = 102, Minutes = 5, Api = "Vulkan" }, b));   // other renderer
    }

    static MetricsSample Sample(double cpu = 20, double ramPct = 40, double gpu = 50) => new()
    {
        CpuPercent = cpu, MemTotalBytes = 16L << 30, MemUsedBytes = (long)((16L << 30) * ramPct / 100),
        Gpus = { new GpuSample { Name = "GPU", UtilPercent = gpu, TempC = 60, MemTotalBytes = 8L << 30, MemUsedBytes = 2L << 30 } },
        Disks = { new DiskSample("C:\\", "System", 500L << 30, 200L << 30) },
    };

    [Fact]
    public void Advisor_finds_cpu_limit_background_load_and_full_memory_and_says_what_is_a_guess()
    {
        var top = new List<ProcUsage> { new("Brotato.exe", 900, 40, 1), new("chrome", 3000, 22, 30), new("svchost", 200, 30, 50) };
        var f = PerfAdvisor.Analyze(new AdvisorInput(Sample(cpu: 95, ramPct: 93, gpu: 45), true, 94, 45, 93, top, top, null, null, new[] { "Brotato.exe" }));
        var cpu = Assert.Single(f, x => x.Id == "cpu-bound");
        Assert.Equal("suspicion", cpu.Kind);                  // a likely explanation, not a fact
        Assert.Contains(f, x => x.Id == "bg-cpu:chrome");     // svchost is protected, the game itself is not "background"
        Assert.DoesNotContain(f, x => x.Id.StartsWith("bg-cpu:svchost"));
        var ram = Assert.Single(f, x => x.Id == "ram-full");
        Assert.Equal("warn", ram.Level); Assert.Contains("chrome", ram.What);
        Assert.All(f, x => { Assert.False(string.IsNullOrWhiteSpace(x.Why)); Assert.False(string.IsNullOrWhiteSpace(x.Fix)); Assert.False(string.IsNullOrWhiteSpace(x.Risk)); });
    }

    [Fact]
    public void Advisor_stays_quiet_when_all_is_fine_and_warns_about_disks_heat_and_network()
    {
        Assert.Empty(PerfAdvisor.Analyze(new AdvisorInput(Sample(), false, 20, 50, 40, null, null, null, null)));
        var s = Sample(); s.CpuTempC = 98; s.Disks = new() { new DiskSample("D:\\", "Spiele", 1000L << 30, 3L << 30) };
        var ping = new List<PingSummary> { new("router", "Router", 60, 3, 0), new("internet", "Internet", 60, 25, 12) };
        var f = PerfAdvisor.Analyze(new AdvisorInput(s, false, null, null, null, null, null, ping, null));
        Assert.Equal("critical", f[0].Level);                 // most severe first
        Assert.Contains(f, x => x.Id == "cpu-hot" && x.Level == "critical");
        Assert.Contains(f, x => x.Id == "disk-full:D:\\" && x.Action == "storage" && x.What.Contains("3,0 GB"));   // German number format
        Assert.Contains(f, x => x.Id == "loss:internet" && x.Level == "critical");
        Assert.DoesNotContain(f, x => x.Id == "loss:router");
    }

    [Fact]
    public void Linux_drive_activity_from_diskstats_whole_disks_only()
    {
        var text = "   8       0 sda 100 0 2000 0 50 0 1000 0 0 100 0\n   8       1 sda1 10 0 200 0 5 0 100 0 0 10 0\n   7       0 loop0 1 0 2 0 0 0 0 0 0 0 0\n 259 0 nvme0n1 10 0 100 0 10 0 100 0 0 10 0\n";
        var n = 0;
        var d = new ProcDiskActivity(() => n++ == 0 ? text : text.Replace("sda 100 0 2000 0 50 0 1000 0 0 100", "sda 200 0 4048 0 60 0 2024 0 0 600"));
        var first = d.Read();
        Assert.Equal(new[] { "nvme0n1", "sda" }, first.Select(x => x.Name).OrderBy(x => x));
        Assert.All(first, x => Assert.Null(x.ReadBps));      // nothing to compare with yet
        Thread.Sleep(300);
        var second = d.Read().Single(x => x.Name == "sda");
        Assert.True(second.ReadBps > 0 && second.WriteBps > 0 && second.BusyPercent > 0);
    }

    [Fact]
    public void Network_speed_in_megabits()
    {
        Assert.Equal(125.0, NetSpeedService.Mbit(15_625_000));
        Assert.Equal(0.0, NetSpeedService.Mbit(0));
    }
}
