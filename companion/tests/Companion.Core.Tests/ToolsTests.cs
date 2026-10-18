using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class ToolsTests
{
    sealed class FakeMetrics(params double?[] cpu) : IMetricsSource
    {
        int _i;
        public MetricsSample Sample() => new() { CpuPercent = cpu[_i++ % cpu.Length], MemTotalBytes = 100, MemUsedBytes = 50, Gpus = new() { new GpuSample { UtilPercent = 80 } } };
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public void Session_performance_is_averaged_from_real_samples_only()
    {
        var rec = new PerformanceRecorder(new FakeMetrics(20, 40, null), () => true);
        rec.GameStarted("g1");
        rec.SampleNow(); rec.SampleNow(); rec.SampleNow();
        var p = rec.GameStopped("g1")!;
        Assert.Equal(3, p.Samples);
        Assert.Equal(30, p.CpuAvg);   // the missing value is not counted as 0
        Assert.Equal(40, p.CpuMax);
        Assert.Equal(50, p.RamAvg);
        Assert.Equal(80, p.GpuMax);
        Assert.Null(new PerformanceRecorder(new FakeMetrics(1), () => false).GameStopped("x")); // switched off: nothing
    }

    [Fact]
    public void Network_statistics_loss_and_jitter()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var net = new NetworkMonitor(s.Rpc);
        var t = new NetworkMonitor.Target("internet", "Internet", "1.1.1.1");
        foreach (var ms in new double?[] { 10, 20, null, 30 }) net.Record(t, ms);
        var h = J(net.History()).GetProperty("targets")[0];
        Assert.Equal(4, h.GetProperty("samples").GetInt32());
        Assert.Equal(25, h.GetProperty("lossPercent").GetDouble());
        Assert.Equal(20, h.GetProperty("avg").GetDouble());
        Assert.Equal(10, h.GetProperty("jitter").GetDouble());
    }

    [Fact]
    public void Folder_size_counts_all_files()
    {
        using var dir = new TempDir();
        Directory.CreateDirectory(Path.Combine(dir.Path, "a", "b"));
        File.WriteAllBytes(Path.Combine(dir.Path, "a", "x.bin"), new byte[1000]);
        File.WriteAllBytes(Path.Combine(dir.Path, "a", "b", "y.bin"), new byte[234]);
        var (bytes, files, partial) = StorageService.FolderSize(Path.Combine(dir.Path, "a"));
        Assert.Equal((1234L, 2, false), (bytes, files, partial));
    }

    [Fact]
    public async Task Consistency_check_finds_missing_files_and_dangling_references()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var exe = Path.Combine(dir.Path, "game.sh");
        File.WriteAllText(exe, "#!/bin/sh\n");
        File.SetUnixFileMode(exe, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var item = s.Library.AddPath(exe, ItemKind.Game, "Spiel", null);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("quick.save", new { name = "Los", steps = new[] { new { type = "launchItem", @ref = item.Id } } });
        File.Delete(exe);
        s.Library.Remove(item.Id);
        var checks = ConsistencyCheck.Run(s).ToDictionary(c => c.area);
        Assert.Equal("warn", checks["check-refs"].status);
        Assert.Contains("Quick Action „Los“", checks["check-refs"].detail);
        Assert.Equal("ok", checks["check-hotkeys"].status);
    }

    [Fact]
    public void Restore_points_are_created_weekly_listed_and_names_are_checked()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Backup.EnsureAutoPoint();
        s.Backup.EnsureAutoPoint(); // second call within the week: no new point
        var points = J(s.Backup.Points()).GetProperty("points");
        Assert.Equal(1, points.GetArrayLength());
        Assert.StartsWith("auto-", points[0].GetProperty("name").GetString());
        Assert.NotEmpty(s.Backup.OpenPoint(points[0].GetProperty("name").GetString()!));
        Assert.Throws<RpcException>(() => s.Backup.OpenPoint("../settings.json"));
        Assert.Throws<RpcException>(() => s.Backup.OpenPoint("..\\x.zip"));
    }

    [Fact]
    public void Session_notes_and_ratings_are_stored()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var item = new LibraryItem { Id = "g", Name = "Spiel" };
        var start = DateTime.UtcNow.AddMinutes(-30);
        s.History.SessionStarted(item, start);
        s.History.SessionEnded("g", DateTime.UtcNow);
        s.History.SetNote("g", start, "  Boss besiegt  ");
        var session = J(s.History.Get()).GetProperty("sessions")[0];
        Assert.Equal("Boss besiegt", session.GetProperty("note").GetString());
        Assert.Throws<RpcException>(() => s.History.SetNote("g", start.AddHours(-5), "x"));
    }
}
