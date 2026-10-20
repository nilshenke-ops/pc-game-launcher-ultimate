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
        public string? ExtractIcon(string path) { Asked.Add(path); return path.Contains("Discord") ? "data:image/png;base64,AAAA" : path.EndsWith(".exe") ? "data:image/png;base64," + Path.GetFileNameWithoutExtension(path) : null; }
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

    [Fact]
    public async Task Steam_and_Epic_games_get_the_icon_of_their_own_exe()
    {
        using var dir = new TempDir();
        // Rocket League as installed by Steam (no process name known): the largest EXE that is not a helper.
        var rl = Path.Combine(dir.Path, "games", "rocketleague");
        Directory.CreateDirectory(Path.Combine(rl, "Binaries", "Win64"));
        Directory.CreateDirectory(Path.Combine(rl, "Engine", "Extras", "Redist"));
        File.WriteAllBytes(Path.Combine(rl, "Binaries", "Win64", "RocketLeague.exe"), new byte[50_000]);
        File.WriteAllBytes(Path.Combine(rl, "Binaries", "Win64", "UnityCrashHandler64.exe"), new byte[90_000]);
        File.WriteAllBytes(Path.Combine(rl, "Binaries", "Win64", "EasyAntiCheat_EOS_Setup.exe"), new byte[95_000]);
        File.WriteAllBytes(Path.Combine(rl, "Engine", "Extras", "Redist", "UE3Redist.exe"), new byte[99_000]);
        File.WriteAllBytes(Path.Combine(rl, "unins000.exe"), new byte[99_000]);
        // An Epic game with a known launch EXE: that one, even if another EXE is bigger.
        var fn = Path.Combine(dir.Path, "games", "fortnite");
        Directory.CreateDirectory(Path.Combine(fn, "Win64"));
        File.WriteAllBytes(Path.Combine(fn, "Win64", "FortniteLauncher.exe"), new byte[10_000]);
        File.WriteAllBytes(Path.Combine(fn, "Win64", "FortniteClient-Win64-Shipping.exe"), new byte[80_000]);

        var file = new LibraryFile();
        file.Items.Add(new LibraryItem { Id = "item_rl", Name = "Rocket League", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "252950", InstallDir = rl, IconChecked = true });
        file.Items.Add(new LibraryItem { Id = "item_fn", Name = "Fortnite", Kind = ItemKind.Game, Source = LaunchSource.Epic, Target = "ns:cat:Fortnite", InstallDir = fn, ProcessNames = { "FortniteLauncher" }, IconChecked = true });
        file.Items.Add(new LibraryItem { Id = "item_gone", Name = "Deinstalliert", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "1", InstallDir = Path.Combine(dir.Path, "fehlt"), IconChecked = true });
        var paths = new AppPaths(dir.Path);
        File.WriteAllText(paths.File("library.json"), Json.Serialize(file));
        var platform = new IconPlatform();
        await using var s = new CompanionServices(platform, paths, new Hosting.WebAssets(dir.Path));

        Assert.Equal(2, s.Library.FillMissingIcons()); // also for games already checked by 2.9 (programs only back then)
        Assert.Equal("data:image/png;base64,RocketLeague", s.Library.Get("item_rl")!.IconData);
        Assert.Equal("data:image/png;base64,FortniteLauncher", s.Library.Get("item_fn")!.IconData);
        Assert.Null(s.Library.Get("item_gone")!.IconData);
        platform.Icons.Asked.Clear();
        Assert.Equal(0, s.Library.FillMissingIcons()); // once
        Assert.Empty(platform.Icons.Asked);
    }
}
