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
}
