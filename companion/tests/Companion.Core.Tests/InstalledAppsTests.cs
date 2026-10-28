using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class InstalledAppsTests
{
    static DetectedItem App(string name, string id, string origin = "Startmenü") =>
        new("apps:" + id, ItemKind.Program, name, LaunchSource.AppsFolder, id, null, new(), null, origin, false);

    [Fact]
    public void Filtert_Deinstaller_Hilfe_und_Windows_Werkzeuge()
    {
        Assert.True(LibraryService.IsUsefulApp(App("Discord", "com.squirrel.Discord.Discord")));
        Assert.True(LibraryService.IsUsefulApp(App("Spotify", "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "Microsoft Store / Xbox")));
        Assert.False(LibraryService.IsUsefulApp(App("Uninstall Discord", "x")));
        Assert.False(LibraryService.IsUsefulApp(App("OBS Studio Liesmich", "y")));
        Assert.False(LibraryService.IsUsefulApp(App("Eingabeaufforderung", "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\cmd.exe")));
        Assert.False(LibraryService.IsUsefulApp(App("Einstellungen", "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel")));
        Assert.False(LibraryService.IsUsefulApp(App("PC Game Launcher Companion", "C:\\Programme\\PCGameLauncherCompanion\\pgl.exe")));
    }

    [Fact]
    public void Installierte_Apps_erscheinen_ohne_Hinzufuegen_und_verschwinden_beim_Deinstallieren()
    {
        using var dir = new TempDir();
        var lib = new LibraryService(new AppPaths(Path.Combine(dir.Path, "data")), new GenericPlatform(), new NullHub());
        lib.Import(new LibraryFile { Items = { new LibraryItem { Id = "item_obs", Name = "OBS Studio", Kind = ItemKind.Program, Source = LaunchSource.Exe, Target = "C:\\obs\\obs64.exe" } } });
        var apps = new[] { App("Discord", "com.squirrel.Discord.Discord"), App("OBS Studio", "obs"), App("Uninstall Discord", "u"), App("discord", "dup") };

        Assert.Equal((1, 0), lib.ReconcileApps(apps));
        var discord = Assert.Single(lib.List(), i => i.Name == "Discord");
        Assert.Equal(ItemKind.Program, discord.Kind);
        Assert.True(discord.AutoAdded);
        Assert.Equal(LibraryService.AppsSource, discord.AutoSource);
        Assert.Single(lib.List(), i => i.Name == "OBS Studio"); // already added by hand – not twice

        // An empty list (start menu not readable) removes nothing.
        Assert.Equal((0, 0), lib.ReconcileApps(Array.Empty<DetectedItem>()));
        Assert.Contains(lib.List(), i => i.Name == "Discord");

        // Removed by the user → stays hidden while installed.
        Assert.True(lib.Remove(discord.Id));
        Assert.Equal((0, 0), lib.ReconcileApps(apps));
        Assert.DoesNotContain(lib.List(), i => i.Name == "Discord");

        // Uninstalled → hidden mark forgotten; reinstalled → shown again.
        Assert.Equal((1, 0), lib.ReconcileApps(new[] { App("Spotify", "spotify") }));
        // Discord back, Spotify uninstalled → Discord shown again, Spotify's auto entry goes away; the hand-added OBS stays.
        Assert.Equal((1, 1), lib.ReconcileApps(apps));
        Assert.Contains(lib.List(), i => i.Name == "Discord");
        Assert.DoesNotContain(lib.List(), i => i.Name == "Spotify");
        Assert.Contains(lib.List(), i => i.Name == "OBS Studio");
    }

    [Fact]
    public void Xbox_Spiel_aus_der_App_Liste_wird_zum_Spiel()
    {
        using var dir = new TempDir();
        var lib = new LibraryService(new AppPaths(Path.Combine(dir.Path, "data")), new GenericPlatform(), new NullHub());
        var forza = App("Forza Horizon 5", "Microsoft.624F8B84B80_8wekyb3d8bbwe!ForzaHorizon5", "Microsoft Store / Xbox");
        lib.ReconcileApps(new[] { forza });
        lib.ReconcileLauncher(LauncherService.Xbox, new[] { forza with { Kind = ItemKind.Game } });
        var item = Assert.Single(lib.List());
        Assert.Equal(ItemKind.Game, item.Kind);
        Assert.Equal(LauncherService.Xbox, item.AutoSource);
    }
}
