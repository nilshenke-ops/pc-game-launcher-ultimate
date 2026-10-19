using Pgl.Core.Services;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class MetricSwitchesTests
{
    /// <summary>Counts what was asked for – a switched-off value must not be measured, not just hidden.</summary>
    sealed class CountingMetrics : IMetricsSource
    {
        public MetricSwitches On = new();
        public int GpuQueries, DiskQueries;
        public void Apply(MetricSwitches on) => On = on.Copy();
        public MetricsSample Sample()
        {
            var s = new MetricsSample { CpuPercent = 12, MemTotalBytes = 100, MemUsedBytes = 50 };
            if (On.Gpu) { GpuQueries++; s.Gpus.Add(new GpuSample { Name = "GPU", UtilPercent = 40, TempC = 60 }); }
            if (On.Disks) { DiskQueries++; s.Disks.Add(new DiskSample("C:", "", 100, 50)); }
            return s;
        }
    }

    sealed class TestPlatform(IMetricsSource metrics) : IPlatform
    {
        readonly GenericPlatform _g = new();
        public string Name => "Test";
        public ILauncher Launcher => _g.Launcher;
        public IProcessSource Processes => _g.Processes;
        public IAudioEngine Audio => _g.Audio;
        public IHotkeyRegistrar Hotkeys => _g.Hotkeys;
        public IMetricsSource Metrics => metrics;
        public IAutostart Autostart => _g.Autostart;
        public ISecretProtector Secrets => _g.Secrets;
        public IDesktopIntegration Desktop => _g.Desktop;
        public IEnumerable<IDetector> Detectors => Array.Empty<IDetector>();
        public IUpdateInstaller UpdateInstaller => _g.UpdateInstaller;
    }

    [Fact]
    public void Strip_removes_switched_off_values_and_names_them()
    {
        var s = new MetricSwitches { Cpu = false, Gpu = false }.Strip(new MetricsSample { CpuPercent = 5, MemUsedBytes = 1, MemTotalBytes = 2, Gpus = { new GpuSample() }, Disks = { new DiskSample("C:", "", 100, 50) } });
        Assert.Null(s.CpuPercent);
        Assert.Empty(s.Gpus);
        Assert.Equal(2, s.MemTotalBytes);
        Assert.Single(s.Disks);
        Assert.Equal(new[] { "cpu", "gpu" }, s.Off);
    }

    [Fact]
    public async Task Settings_switch_reaches_the_source_and_the_monitor()
    {
        using var dir = new TempDir();
        var metrics = new CountingMetrics();
        await using var s = new CompanionServices(new TestPlatform(metrics), new Infrastructure.AppPaths(dir.Path), new Hosting.WebAssets(dir.Path));
        var admin = await Fixtures.Admin(s);
        s.Metrics.Sample();
        Assert.Equal(1, metrics.GpuQueries);

        var r = await admin.Ok("settings.save", new { metrics = new { cpu = true, ram = true, gpu = false, disks = false } });
        Assert.False(r.GetProperty("metrics").GetProperty("gpu").GetBoolean());
        var sample = s.Metrics.Sample();
        Assert.Equal(1, metrics.GpuQueries); // not asked again
        Assert.Equal(0, metrics.DiskQueries - 1);
        Assert.Empty(sample.Gpus);
        Assert.Equal(new[] { "gpu", "disks" }, sample.Off);
        Assert.Equal(12, sample.CpuPercent);

        // Other settings changes keep the switches.
        await admin.Ok("settings.save", new { notifyInfo = false });
        Assert.False(s.Settings.Get().Metrics.Gpu);
        Assert.False(metrics.On.Gpu);
    }
}
