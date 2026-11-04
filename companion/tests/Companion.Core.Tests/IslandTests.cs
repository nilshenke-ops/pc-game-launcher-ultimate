using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class IslandTests
{
    [Fact]
    public void Island_shows_only_when_switched_on_and_hides_during_games_unless_wanted()
    {
        Assert.False(CompanionServices.IslandWanted(new Settings(), gaming: false)); // off until switched on
        Assert.True(CompanionServices.IslandWanted(new Settings { IslandDesktop = true }, gaming: false));
        Assert.False(CompanionServices.IslandWanted(new Settings { IslandDesktop = true }, gaming: true)); // gone while a game runs
        Assert.True(CompanionServices.IslandWanted(new Settings { IslandDesktop = true, IslandInGames = true }, gaming: true));
        Assert.False(CompanionServices.IslandWanted(new Settings { IslandDesktop = false, IslandInGames = true }, gaming: true));
    }

    [Fact]
    public void Without_the_Windows_companion_the_island_says_so()
    {
        Assert.False(NullDesktopIsland.Instance.Supported);
        Assert.Contains("Windows-Begleiter", NullDesktopIsland.Instance.SetVisible(true));
        Assert.Null(NullDesktopIsland.Instance.SetVisible(false));
    }

    static SettingsService NewSettings(TempDir dir) => new(new AppPaths(dir.Path), new NullHub());

    [Fact]
    public void The_look_defaults_stay_as_before_and_changes_are_kept()
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        var s = svc.Get();
        Assert.Equal(("default", "auto", "m", "center", 100), (s.IslandStyle, s.IslandEye, s.IslandEyeSize, s.IslandPosition, s.IslandOpacity));
        Assert.Null(s.IslandWidgets); // null = the usual set
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Style = "neon", Eye = "pink", EyeSize = "l", Position = "right", Opacity = 80, Widgets = new() { "note", "game", "game", "net" } });
        var n = NewSettings(dir).Get(); // read again from the file
        Assert.Equal(("neon", "pink", "l", "right", 80), (n.IslandStyle, n.IslandEye, n.IslandEyeSize, n.IslandPosition, n.IslandOpacity));
        Assert.Equal(new[] { "game", "net", "note" }, n.IslandWidgets); // fixed order, no duplicates
    }

    [Fact]
    public void The_new_widgets_are_accepted_in_their_fixed_order()
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Widgets = new() { "sounds", "profile", "stopwatch", "start", "game", "note" } });
        Assert.Equal(new[] { "game", "start", "stopwatch", "profile", "sounds", "note" }, NewSettings(dir).Get().IslandWidgets);
    }

    [Theory]
    [InlineData("style", "rot")] [InlineData("eye", "#ff0000")] [InlineData("size", "xl")] [InlineData("position", "top")] [InlineData("opacity", 10)] [InlineData("opacity", 101)] [InlineData("widgets", "kamera")]
    public void Unknown_look_values_are_refused_and_nothing_changes(string field, object value)
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        var u = field switch
        {
            "style" => new SettingsService.IslandLookUpdate { Style = (string)value },
            "eye" => new SettingsService.IslandLookUpdate { Eye = (string)value },
            "size" => new SettingsService.IslandLookUpdate { EyeSize = (string)value },
            "position" => new SettingsService.IslandLookUpdate { Position = (string)value },
            "opacity" => new SettingsService.IslandLookUpdate { Opacity = (int)value },
            _ => new SettingsService.IslandLookUpdate { Widgets = new() { "game", (string)value } },
        };
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => svc.SetIslandLook(u)).Code);
        var s = svc.Get();
        Assert.Equal(("default", "auto", "m", "center", 100), (s.IslandStyle, s.IslandEye, s.IslandEyeSize, s.IslandPosition, s.IslandOpacity));
    }

    [Fact]
    public void Only_a_part_of_the_look_can_be_changed_the_rest_stays()
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Style = "mono", Opacity = 70 });
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Eye = "white" });
        var s = svc.Get();
        Assert.Equal(("mono", "white", 70), (s.IslandStyle, s.IslandEye, s.IslandOpacity));
    }
}
