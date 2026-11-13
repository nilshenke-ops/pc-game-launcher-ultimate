using System.Diagnostics;
using System.Text.Json;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CloseProgramTests
{
    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o);

    [Theory]
    [InlineData("explorer")] [InlineData("csrss")] [InlineData("svchost")] [InlineData("PCGameLauncherCompanion")] [InlineData("LSASS")]
    public async Task Windows_own_processes_and_the_companion_are_never_closed(string name)
    {
        var e = await Assert.ThrowsAsync<RpcException>(() => new ProcessUsageService().CloseAsync(name, force: true));
        Assert.Equal("forbidden", e.Code);
        Assert.False(new ProcUsage(name, 1, 1, 1).Closable);
    }

    [Fact]
    public async Task A_program_that_does_not_run_is_said_so()
    {
        var e = await Assert.ThrowsAsync<RpcException>(() => new ProcessUsageService().CloseAsync("gibt-es-nicht-" + Guid.NewGuid().ToString("N")[..8], force: false));
        Assert.Equal("not-found", e.Code);
    }

    [Fact]
    public async Task Without_a_window_closing_needs_force_and_force_ends_it()
    {
        if (OperatingSystem.IsWindows()) return; // uses the Linux "sleep" program as a harmless stand-in
        // a copy of "sleep" with a name of its own, so nothing else on this machine is touched
        var name = "pglsleep" + Guid.NewGuid().ToString("N")[..6];
        var exe = Path.Combine(Path.GetTempPath(), name);
        File.Copy("/bin/sleep", exe, true);
        File.SetUnixFileMode(exe, UnixFileMode.UserRead | UnixFileMode.UserExecute | UnixFileMode.UserWrite);
        using var p = Process.Start(new ProcessStartInfo(exe, "120") { UseShellExecute = false })!;
        try
        {
            var svc = new ProcessUsageService();
            var soft = J(await svc.CloseAsync(name, force: false));
            Assert.True(soft.GetProperty("needsForce").GetBoolean());
            Assert.False(p.HasExited);
            var hard = J(await svc.CloseAsync(name, force: true));
            Assert.Equal(0, hard.GetProperty("left").GetInt32());
            Assert.True(p.WaitForExit(3000));
        }
        finally { try { p.Kill(); } catch { /* gone */ } try { File.Delete(exe); } catch { /* still in use */ } }
    }
}
