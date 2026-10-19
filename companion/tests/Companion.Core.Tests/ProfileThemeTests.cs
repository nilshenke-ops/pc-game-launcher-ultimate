using Pgl.Core.Models;
using Xunit;

namespace Pgl.Core.Tests;

public class ProfileThemeTests
{
    [Fact]
    public async Task Theme_is_checked_reaches_all_devices_with_the_active_profile_and_a_broken_backup_theme_is_dropped()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var bad = new { id = "", name = "Racing", icon = "gamepad-2", color = "#ff0000", gameIds = Array.Empty<string>(), launchProgramIds = Array.Empty<string>(), quickActionIds = Array.Empty<string>(), hotkeyIds = Array.Empty<string>(),
            theme = new { mode = "dark", primary = "red;}", accent = "#00ff00", background = "#000000" } };
        Assert.Equal("invalid-params", await admin.Error("profiles.save", new { profile = bad }));

        var p = await admin.Ok("profiles.save", new { profile = bad with { theme = new { mode = "light", primary = "#ff0000", accent = "#00ff00", background = "#ffffff" } } });
        var id = p.GetProperty("id").GetString()!;
        await admin.Ok("profiles.activate", new { id });
        var st = await admin.Ok("state.get");
        Assert.Equal("#ff0000", st.GetProperty("activeProfile").GetProperty("theme").GetProperty("primary").GetString());

        // A backup with a manipulated theme: restored without the theme instead of failing.
        var f = s.Profiles.Get();
        f.Profiles.First(x => x.Id == id).Theme = new ProfileTheme { Mode = "dark", Primary = "url(x)", Accent = "#000000", Background = "#000000" };
        s.Profiles.Import(f);
        Assert.Null(s.Profiles.Find(id)!.Theme);
    }
}
