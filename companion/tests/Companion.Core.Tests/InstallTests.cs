using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class InstallTests
{
    static readonly InstallPlan Plan = new(@"C:\Users\Nils\AppData\Local", @"C:\Users\Nils\AppData\Roaming\Microsoft\Windows\Start Menu\Programs", @"C:\Users\Nils\Desktop");

    [Fact]
    public void Everything_goes_to_the_users_own_folders_without_admin_rights()
    {
        if (!OperatingSystem.IsWindows()) // the plan uses Windows paths; Path.Combine keeps the separators of the input
        {
            Assert.EndsWith(Path.Combine("Programs", "Nexus Gaming Hub", "PCGameLauncherCompanion.exe"), Plan.Exe);
            Assert.EndsWith("Nexus Gaming Hub.lnk", Plan.StartMenuLink);
        }
        Assert.StartsWith(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\", InstallPlan.UninstallKey); // HKCU: per user
        Assert.Equal($"\"{Plan.Exe}\" --minimized", Plan.AutostartCommand); // same format as the existing autostart entry
    }

    [Fact]
    public void The_apps_and_features_entry_has_what_windows_shows_and_a_working_uninstall_command()
    {
        var v = Plan.UninstallValues("2.17.0", 87_366_661, new DateTime(2026, 10, 20));
        Assert.Equal("Nexus Gaming Hub", v["DisplayName"]);
        Assert.Equal("2.17.0", v["DisplayVersion"]);
        Assert.Equal($"\"{Plan.Exe}\" --uninstall", v["UninstallString"]);      // quoted: the path has spaces
        Assert.Equal($"\"{Plan.Exe}\" --uninstall --quiet", v["QuietUninstallString"]);
        Assert.Equal(85_319, v["EstimatedSize"]);                                // KB, as a number (DWORD)
        Assert.Equal("20261020", v["InstallDate"]);
        Assert.Equal(1, v["NoModify"]);
        Assert.IsType<int>(v["NoRepair"]);
    }

    [Fact]
    public void Only_the_installed_copy_counts_as_installed()
    {
        Assert.True(Plan.IsInstalledPath(Plan.Exe));
        Assert.True(Plan.IsInstalledPath(Plan.Exe.ToUpperInvariant()));
        Assert.False(Plan.IsInstalledPath(@"C:\Users\Nils\Downloads\PCGameLauncherCompanion.exe"));
        Assert.False(Plan.IsInstalledPath(null));
    }

    [Fact]
    public async Task Installing_is_only_possible_at_the_pc_itself()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch", "manage", "admin" });
        Assert.Equal("forbidden", await phone.Error("install.run"));
        Assert.Equal("forbidden", await phone.Error("install.uninstall", new { removeData = true }));
        var st = await admin.Ok("install.status");
        Assert.False(st.GetProperty("supported").GetBoolean()); // headless/Linux: honest "not here"
        Assert.Equal("failed", await admin.Error("install.run"));
    }
}
