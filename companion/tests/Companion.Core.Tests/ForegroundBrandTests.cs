using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class ForegroundBrandTests
{
    [Theory]
    [InlineData("Discord", "#general - Discord", "discord")]
    [InlineData("Spotify.exe", "Roddy Ricch - The Box", "spotify")]
    [InlineData("chrome", "Never Gonna Give You Up - YouTube - Google Chrome", "youtube")]
    [InlineData("msedge", "Live – Twitch – Microsoft Edge", "twitch")]
    [InlineData("firefox", "Mozilla Firefox", "browser")]
    [InlineData("firefox", "Mein Dokument - Google Docs - Mozilla Firefox", "browser")]
    [InlineData("notepad", "Unbenannt - Editor", null)]
    [InlineData("", "irgendwas", null)]
    public void The_app_or_site_in_front_is_recognised_without_guessing(string proc, string title, string? brand)
        => Assert.Equal(brand, ForegroundBrand.Detect(proc, title));

    [Theory]
    [InlineData("default", true)] [InlineData("auto", true)] [InlineData("#5865F2", true)] [InlineData("#abc", false)] [InlineData("red", false)] [InlineData("#12345g", false)]
    public void Island_colours_are_checked(string accent, bool ok) => Assert.Equal(ok, SettingsService.IslandLook.ValidAccent(accent));

    [Fact]
    public void Colour_and_effect_are_kept_and_wrong_ones_refused()
    {
        using var dir = new TempDir();
        var svc = IslandTests.NewSettingsFor(dir);
        svc.SetIslandLook(new SettingsService.IslandLookUpdate { Accent = "#F9A8D4", Effect = "sakura" });
        var s = IslandTests.NewSettingsFor(dir).Get();
        Assert.Equal(("#f9a8d4", "sakura"), (s.IslandAccent, s.IslandEffect));
        Assert.Throws<RpcException>(() => svc.SetIslandLook(new SettingsService.IslandLookUpdate { Effect = "feuerwerk" }));
        Assert.Throws<RpcException>(() => svc.SetIslandLook(new SettingsService.IslandLookUpdate { Accent = "javascript:" }));
    }
}
