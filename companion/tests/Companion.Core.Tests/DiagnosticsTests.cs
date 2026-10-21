using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class DiagnosticsTests
{
    sealed class FakeHardware(string folder) : IHardwareInfo
    {
        public bool Supported => true;
        public List<GpuDriver> Gpus() => new() { new("NVIDIA GeForce RTX 5060 Laptop GPU", "32.0.15.6614", "10-1-2026") };
        public IEnumerable<string> CrashReportFolders() => new[] { folder };
    }

    // Shaped like a real Report.wer of a German Windows (UTF-16 with BOM, localized names, positional values).
    static void Wer(string folder, string sub, string type, string app, string? module, string? code, DateTime at)
    {
        var d = Path.Combine(folder, sub);
        Directory.CreateDirectory(d);
        var sigs = type.StartsWith("AppHang")
            ? $"Sig[0].Name=Anwendungsname\r\nSig[0].Value={app}\r\nSig[1].Name=Anwendungsversion\r\nSig[1].Value=1.0.2.0\r\n"
            : type.StartsWith("BEX")
                ? $"Sig[0].Name=Anwendungsname\r\nSig[0].Value={app}\r\nSig[1].Value=1.0.2.0\r\nSig[3].Name=Fehlermodulname\r\nSig[3].Value={module}\r\nSig[4].Value=10.0.1\r\nSig[6].Value=00000000000a1b2c\r\nSig[7].Name=Ausnahmecode\r\nSig[7].Value={code}\r\n"
                : $"Sig[0].Name=Anwendungsname\r\nSig[0].Value={app}\r\nSig[1].Name=Anwendungsversion\r\nSig[1].Value=1.0.2.0\r\nSig[3].Name=Fehlermodulname\r\nSig[3].Value={module}\r\nSig[4].Name=Fehlermodulversion\r\nSig[4].Value=32.0.15.6614\r\nSig[6].Name=Ausnahmecode\r\nSig[6].Value={code}\r\n";
        var text = $"Version=1\r\nEventType={type}\r\nEventTime={at.ToFileTimeUtc()}\r\nReportType=2\r\n{sigs}AppName=Hades\r\nAppPath=C:\\Users\\Nils\\Games\\Hades\\{app}\r\n";
        File.WriteAllBytes(Path.Combine(d, "Report.wer"), new byte[] { 0xFF, 0xFE }.Concat(Encoding.Unicode.GetBytes(text)).ToArray());
    }

    [Fact]
    public void Windows_crash_reports_are_read_by_position_and_matched_by_program_and_time()
    {
        using var dir = new TempDir();
        var t0 = new DateTime(2026, 10, 21, 18, 0, 0, DateTimeKind.Utc);
        Wer(dir.Path, "AppCrash_Hades.exe_1", "APPCRASH", "Hades.exe", "nvwgf2umx.dll", "c0000005", t0.AddMinutes(30));
        Wer(dir.Path, "AppHang_Hades.exe_2", "AppHangB1", "Hades.exe", null, null, t0.AddMinutes(31));
        Wer(dir.Path, "BEX64_Hades.exe_3", "BEX64", "Hades.exe", "ucrtbase.dll", "c0000409", t0.AddMinutes(32));
        Wer(dir.Path, "AppCrash_Other.exe_4", "APPCRASH", "Other.exe", "x.dll", "c0000005", t0.AddMinutes(30)); // other program
        Wer(dir.Path, "AppCrash_Hades.exe_5", "APPCRASH", "Hades.exe", "x.dll", "c0000005", t0.AddDays(-3));     // too old
        Directory.CreateDirectory(Path.Combine(dir.Path, "NonCritical_1"));
        File.WriteAllText(Path.Combine(dir.Path, "NonCritical_1", "Report.wer"), "EventType=WindowsUpdateFailure\nSig[0].Value=Hades.exe\n");
        var found = WerReader.Find(new[] { dir.Path, Path.Combine(dir.Path, "missing") }, t0, t0.AddMinutes(31), new[] { "hades" });
        Assert.Equal(3, found.Count);
        Assert.Equal(("nvwgf2umx.dll", "c0000005", "1.0.2.0"), (found[0].Module, found[0].ExceptionCode, found[0].AppVersion));
        Assert.Null(found[1].Module); // hang: no module
        Assert.Equal(("ucrtbase.dll", "c0000409"), (found[2].Module, found[2].ExceptionCode)); // BEX: code at position 7
    }

    [Fact]
    public void Report_after_a_crash_has_only_real_data_and_guesses_with_reasons()
    {
        using var dir = new TempDir();
        var wer = Path.Combine(dir.Path, "wer");
        var platform = new GenericPlatform { Hardware = new FakeHardware(wer) };
        var history = new HistoryFile();
        var s = new CompanionServices(platform, new AppPaths(Path.Combine(dir.Path, "data")), new Pgl.Core.Hosting.WebAssets(dir.Path));
        try
        {
            var game = s.Library.AddSteam("1145360", "Hades");
            s.Library.UpdateMetadata(new LibraryService.MetadataUpdate { Id = game.Id, ProcessNames = new() { "Hades" } });
            var svc = new CrashReportService(new AppPaths(Path.Combine(dir.Path, "cr")), platform, s.Library, () => history, () => new ProfilesFile(), _ => new[] { "2026-10-21 17:00:00Z Mods: Vor dem Installieren von SuperMod.zip" }, new NullHub());
            var start = DateTime.UtcNow.AddMinutes(-40);
            // A long session without a crash report: no report.
            Assert.Null(svc.AfterSession(game.Id, start, DateTime.UtcNow));
            // Short session without a report: "short" with an honest guess.
            var shortR = svc.AfterSession(game.Id, DateTime.UtcNow.AddSeconds(-50), DateTime.UtcNow)!;
            Assert.Equal("short", shortR.Trigger);
            Assert.Contains(shortR.Hints, h => h.Because.Contains("weniger als 2 Minuten"));
            // Crash in the graphics driver.
            Wer(wer, "AppCrash_Hades.exe_9", "APPCRASH", "Hades.exe", "nvwgf2umx.dll", "c0000005", DateTime.UtcNow.AddMinutes(-1));
            var r = svc.AfterSession(game.Id, start, DateTime.UtcNow)!;
            Assert.Equal("crash", r.Trigger);
            Assert.Equal("nvwgf2umx.dll", r.Crashes.Single().Module);
            Assert.Contains(r.Hints, h => h.Text.StartsWith("Grafiktreiber") && h.Because.Contains("nvwgf2umx.dll"));
            Assert.Contains(r.Hints, h => h.Text.Contains("Mods") && h.Because.Contains("c0000005"));
            Assert.Equal("NVIDIA GeForce RTX 5060 Laptop GPU (Treiber 32.0.15.6614, 10-1-2026)", r.System["Grafikkarte"]);
            Assert.Single(r.Changes);
            Assert.Equal(2, svc.List().Count);
            // Export: user name in paths and e-mail addresses can be removed.
            var raw = svc.Export(r.Id, redact: false);
            Assert.Contains("C:\\Users\\Nils\\Games", raw);
            var red = svc.Export(r.Id, redact: true);
            Assert.DoesNotContain("Nils", red);
            Assert.Contains("C:\\Users\\<Benutzer>\\Games", red);
            Assert.Contains("(Vermutungen)", red);
            Assert.Equal("<E-Mail>", CrashReportService.Redact("max@example.de"));
            Assert.True(svc.Remove(r.Id));
        }
        finally { s.DisposeAsync().AsTask().Wait(); }
    }

    [Fact]
    public async Task Inventory_says_honestly_what_is_not_available()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var inv = await viewer.Ok("inventory.get");
        var cats = inv.GetProperty("categories").EnumerateArray().ToDictionary(c => c.GetProperty("id").GetString()!, c => c);
        Assert.True(cats["cpu"].GetProperty("available").GetBoolean());
        Assert.True(cats["drives"].GetProperty("available").GetBoolean());
        Assert.True(cats["network"].GetProperty("available").GetBoolean());
        Assert.False(cats["controllers"].GetProperty("available").GetBoolean()); // no Windows here
        Assert.Contains("Windows", cats["controllers"].GetProperty("reason").GetString());
        Assert.False(cats["usb"].GetProperty("available").GetBoolean());
        Assert.Equal("forbidden", await viewer.Error("crash.create", new { itemId = "x" }));
        Assert.Equal(0, (await viewer.Ok("crash.list")).GetProperty("reports").GetArrayLength());
    }
}
