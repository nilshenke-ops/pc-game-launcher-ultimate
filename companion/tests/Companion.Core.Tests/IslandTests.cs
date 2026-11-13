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
    public void Island_window_follows_the_chosen_scope_and_the_front_window()
    {
        Settings S(string scope) => new() { IslandScope = scope };
        const ForegroundKind App = ForegroundKind.App, Desk = ForegroundKind.Desktop, Prog = ForegroundKind.Program;
        // "app": only the island inside the app – no window anywhere.
        foreach (var fg in new[] { App, Desk, Prog }) foreach (var g in new[] { false, true }) Assert.False(CompanionServices.IslandWanted(S("app"), g, fg));
        // "desktop": only with no program in front (and no game).
        Assert.True(CompanionServices.IslandWanted(S("desktop"), false, Desk));
        Assert.False(CompanionServices.IslandWanted(S("desktop"), false, Prog)); // Discord in front
        Assert.False(CompanionServices.IslandWanted(S("desktop"), true, Desk));
        // "programs": over every program (Discord, browser …), but not while a game runs.
        Assert.True(CompanionServices.IslandWanted(S("programs"), false, Prog));
        Assert.True(CompanionServices.IslandWanted(S("programs"), false, Desk));
        Assert.False(CompanionServices.IslandWanted(S("programs"), true, Prog));
        // "games": not in programs, only while a game runs.
        Assert.False(CompanionServices.IslandWanted(S("games"), false, Prog));
        Assert.True(CompanionServices.IslandWanted(S("games"), true, Prog));
        // "all": everywhere.
        Assert.True(CompanionServices.IslandWanted(S("all"), false, Prog));
        Assert.True(CompanionServices.IslandWanted(S("all"), true, Prog));
        // In front of the companion's own window the island window is never shown (the one in the app is there).
        foreach (var sc in SettingsService.IslandScopes) foreach (var g in new[] { false, true }) Assert.False(CompanionServices.IslandWanted(S(sc), g, App));
    }

    [Fact]
    public void Old_switches_become_the_matching_scope()
    {
        Assert.Equal("app", SettingsService.ScopeOf(new Settings()));
        Assert.Equal("programs", SettingsService.ScopeOf(new Settings { IslandDesktop = true }));
        Assert.Equal("all", SettingsService.ScopeOf(new Settings { IslandDesktop = true, IslandInGames = true }));
        Assert.Equal("games", SettingsService.ScopeOf(new Settings { IslandInGames = true }));
        Assert.Equal("desktop", SettingsService.ScopeOf(new Settings { IslandScope = "desktop", IslandDesktop = false }));
        Assert.Equal("app", SettingsService.ScopeOf(new Settings { IslandScope = "unsinn" })); // unknown value → switches decide
    }

    [Fact]
    public void The_scope_is_kept_validated_and_keeps_the_old_switches_in_step()
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        svc.SetIsland(null, null, "desktop");
        var s = NewSettings(dir).Get();
        Assert.Equal(("desktop", true, false), (s.IslandScope, s.IslandDesktop, s.IslandInGames));
        svc.SetIsland(null, null, "games");
        s = NewSettings(dir).Get();
        Assert.Equal(("games", false, true), (s.IslandScope, s.IslandDesktop, s.IslandInGames));
        var ex = Assert.Throws<RpcException>(() => svc.SetIsland(null, null, "überall-und-nirgends"));
        Assert.Equal("invalid-params", ex.Code);
        Assert.Equal("games", NewSettings(dir).Get().IslandScope); // nothing changed
        svc.SetIsland(true, null); // an old client switches the old way (desktop on, games stays on): the scope is derived again
        Assert.Equal("all", SettingsService.ScopeOf(NewSettings(dir).Get()));
        svc.SetIsland(null, false);
        Assert.Equal("programs", SettingsService.ScopeOf(NewSettings(dir).Get()));
    }

    [Theory]
    [InlineData("Wallpaper Engine", true)] [InlineData("wallpaper engine", true)] [InlineData("Lively Wallpaper", true)] [InlineData("Rainmeter", true)]
    [InlineData("Among Us", false)] [InlineData("Minecraft", false)] [InlineData("", false)] [InlineData(null, false)]
    public void A_live_wallpaper_is_no_game_that_is_played(string? name, bool ambient) => Assert.Equal(ambient, AmbientApps.IsAmbient(name));

    [Fact]
    public void Without_a_Windows_companion_nothing_plays_and_the_front_window_is_a_program()
    {
        Assert.False(NullNowPlaying.Instance.Supported);
        Assert.Null(NullNowPlaying.Instance.Current());
        Assert.Equal(ForegroundKind.Program, NullForegroundWatcher.Instance.Kind);
    }

    [Fact]
    public void Without_the_Windows_companion_the_island_says_so()
    {
        Assert.False(NullDesktopIsland.Instance.Supported);
        Assert.Contains("Windows-Begleiter", NullDesktopIsland.Instance.SetVisible(true));
        Assert.Null(NullDesktopIsland.Instance.SetVisible(false));
    }

    static SettingsService NewSettings(TempDir dir) => new(new AppPaths(dir.Path), new NullHub());
    internal static SettingsService NewSettingsFor(TempDir dir) => NewSettings(dir);

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

    static System.Text.Json.JsonElement J(string json) => System.Text.Json.JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void The_island_layout_is_kept_and_can_be_reset()
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        const string layout = """{"tabs":["home","dash","audio","music"],"home":[{"id":"a1","type":"jarvis"},{"id":"a2","type":"clock","opts":{"zone":"Asia/Tokyo","seconds":true}}],"dash":[{"id":"b1","type":"weather","opts":{"place":"Köln"}}]}""";
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Layout = J(layout) });
        var n = NewSettings(dir).Get(); // read again from the file
        Assert.NotNull(n.IslandLayout);
        Assert.Equal("Asia/Tokyo", n.IslandLayout!["home"]![1]!["opts"]!["zone"]!.GetValue<string>());
        Assert.Equal(4, n.IslandLayout["tabs"]!.AsArray().Count);
        // another part of the look leaves the layout alone
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Eye = "pink" });
        Assert.NotNull(svc.Get().IslandLayout);
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { ResetLayout = true });
        Assert.Null(NewSettings(dir).Get().IslandLayout);
    }

    [Theory]
    [InlineData("""{"tabs":["home","kamera"]}""")]
    [InlineData("""{"home":[{"id":"x","type":"browser"}]}""")]
    [InlineData("""{"home":[{"id":"X Y","type":"clock"}]}""")]
    [InlineData("""{"home":[{"type":"clock"}]}""")]
    [InlineData("""{"dash":[{"id":"a","type":"note","opts":{"text":{"nested":1}}}]}""")]
    [InlineData("""{"dash":[{"id":"a","type":"note","script":"x"}]}""")]
    [InlineData("""{"secret":1}""")]
    [InlineData("""[1,2]""")]
    public void A_wrong_island_layout_is_refused_and_nothing_changes(string json)
    {
        using var dir = new TempDir();
        var svc = NewSettings(dir);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => svc.SetIslandLook(new SettingsService.IslandLookUpdate { Layout = J(json) })).Code);
        Assert.Null(svc.Get().IslandLayout);
    }

    [Fact]
    public void An_island_layout_that_is_too_large_or_has_too_many_tiles_is_refused()
    {
        var many = "{\"dash\":[" + string.Join(",", Enumerable.Range(0, 13).Select(i => $"{{\"id\":\"t{i}\",\"type\":\"clock\"}}")) + "]}";
        Assert.Throws<RpcException>(() => SettingsService.CheckIslandLayout(J(many)));
        var huge = "{\"dash\":[" + string.Join(",", Enumerable.Range(0, 12).Select(i => $"{{\"id\":\"t{i}\",\"type\":\"note\",\"opts\":{{\"text\":\"{new string('x', 300)}\",\"label\":\"{new string('y', 300)}\",\"a\":\"{new string('z', 300)}\",\"b\":\"{new string('w', 300)}\"}}}}")) + "]}";
        Assert.Throws<RpcException>(() => SettingsService.CheckIslandLayout(J(huge)));
    }
}
