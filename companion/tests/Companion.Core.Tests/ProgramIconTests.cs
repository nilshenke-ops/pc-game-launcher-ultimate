using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Xunit;

namespace Pgl.Core.Tests;

public class ProgramIconTests
{
    sealed class IconLauncher(ILauncher inner) : ILauncher
    {
        public readonly List<string> Asked = new();
        public LaunchResult Launch(LibraryItem item) => inner.Launch(item);
        public string? ValidateExecutable(string path) => inner.ValidateExecutable(path);
        public string? ExtractIcon(string path) { Asked.Add(path); return path.Contains("Discord") ? "data:image/png;base64,AAAA" : null; }
    }

    sealed class IconPlatform : IPlatform
    {
        readonly GenericPlatform _g = new();
        public IconPlatform() => Icons = new IconLauncher(_g.Launcher);
        public readonly IconLauncher Icons;
        public string Name => "Test";
        public ILauncher Launcher => Icons;
        public IProcessSource Processes => _g.Processes;
        public IAudioEngine Audio => _g.Audio;
        public IHotkeyRegistrar Hotkeys => _g.Hotkeys;
        public IMetricsSource Metrics => _g.Metrics;
        public IAutostart Autostart => _g.Autostart;
        public ISecretProtector Secrets => _g.Secrets;
        public IDesktopIntegration Desktop => _g.Desktop;
        public IEnumerable<IDetector> Detectors => Array.Empty<IDetector>();
        public IUpdateInstaller UpdateInstaller => _g.UpdateInstaller;
    }

    [Fact]
    public async Task Start_menu_and_store_apps_get_their_own_icon_once_and_removed_icons_stay_removed()
    {
        using var dir = new TempDir();
        var file = new LibraryFile();
        file.Items.Add(new LibraryItem { Id = "item_discord", Name = "Discord", Kind = ItemKind.Program, Source = LaunchSource.AppsFolder, Target = "com.squirrel.Discord.Discord" });
        file.Items.Add(new LibraryItem { Id = "item_spotify", Name = "Spotify", Kind = ItemKind.Program, Source = LaunchSource.AppsFolder, Target = "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" });
        file.Items.Add(new LibraryItem { Id = "item_steam", Name = "Rocket League", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "252950" });
        var paths = new AppPaths(dir.Path);
        File.WriteAllText(paths.File("library.json"), Json.Serialize(file));
        var platform = new IconPlatform();
        await using var s = new CompanionServices(platform, paths, new Hosting.WebAssets(dir.Path));

        Assert.Equal(1, s.Library.FillMissingIcons());
        Assert.Equal(@"shell:AppsFolder\com.squirrel.Discord.Discord", platform.Icons.Asked[0]); // start-menu id goes through the shell
        Assert.DoesNotContain(platform.Icons.Asked, p => p.Contains("252950"));                  // Steam games keep their cover
        Assert.Equal("data:image/png;base64,AAAA", s.Library.Get("item_discord")!.IconData);
        Assert.Null(s.Library.Get("item_spotify")!.IconData);

        // Each item is asked once – no reading in a loop for programs without an icon.
        platform.Icons.Asked.Clear();
        Assert.Equal(0, s.Library.FillMissingIcons());
        Assert.Empty(platform.Icons.Asked);

        // An icon the user removed is not brought back.
        s.Library.UpdateMetadata(new Services.LibraryService.MetadataUpdate { Id = "item_discord", IconData = "" });
        Assert.Equal(0, s.Library.FillMissingIcons());
        Assert.Null(s.Library.Get("item_discord")!.IconData);
    }
}
