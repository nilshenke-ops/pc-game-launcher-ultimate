using System.Text;
using Pgl.Core.Models;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

/// <summary>Xbox app games (XboxGames folders) and the automatic launcher links.</summary>
public class XboxTests
{
    const string MsPublisher = "CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US";

    static string Config(string name, string? display, string exe = "Game.exe", string id = "Game") =>
        $"""<?xml version="1.0" encoding="utf-8"?><Game configVersion="1"><Identity Name="{name}" Publisher="{MsPublisher}" Version="1.0.0.0"/><ExecutableList><Executable Name="{exe}" Id="{id}"/></ExecutableList><ShellVisuals DefaultDisplayName="{display}" PublisherDisplayName="Xbox"/></Game>""";

    static string MakeGame(string root, string folder, string config)
    {
        var content = Directory.CreateDirectory(Path.Combine(root, folder, "Content")).FullName;
        File.WriteAllText(Path.Combine(content, "MicrosoftGame.config"), config);
        return content;
    }

    [Fact]
    public void Publisher_id_follows_windows_rule()
    {
        // The well-known id of Microsoft's own packages (e.g. Microsoft.WindowsCalculator_8wekyb3d8bbwe).
        Assert.Equal("8wekyb3d8bbwe", XboxDetector.PublisherId(MsPublisher));
    }

    [Fact]
    public void Games_are_found_with_their_windows_start_id_and_leftovers_are_skipped()
    {
        using var dir = new TempDir();
        var root = Directory.CreateDirectory(Path.Combine(dir.Path, "XboxGames")).FullName;
        MakeGame(root, "Forza Horizon 5", Config("Microsoft.624F8B84B80", "Forza Horizon 5", "ForzaHorizon5.exe"));
        MakeGame(root, "Starfield", Config("BethesdaSoftworks.ProjectGold", "ms-resource:DisplayName", "Starfield.exe"));
        MakeGame(root, "Uninstalled Game", Config("Old.Game", "Old Game"));
        MakeGame(root, "Broken", "<nope");
        Directory.CreateDirectory(Path.Combine(root, "GameSave"));                       // no config: ignored

        // Windows lists these start ids (the uninstalled game is not registered any more).
        var aumids = new[] { "Microsoft.624F8B84B80_8wekyb3d8bbwe!Game", "BethesdaSoftworks.ProjectGold_3275kfvn8vcwc!Game", "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App" };
        var found = XboxDetector.Detect(new[] { root }, aumids).OrderBy(d => d.Name).ToList();
        Assert.Equal(new[] { "Forza Horizon 5", "Starfield" }, found.Select(d => d.Name));       // resource name → folder name
        Assert.Equal(("Microsoft.624F8B84B80_8wekyb3d8bbwe!Game", LaunchSource.AppsFolder, ItemKind.Game), (found[0].Target, found[0].Source, found[0].Kind));
        Assert.Equal(new[] { "ForzaHorizon5" }, found[0].ProcessNames);
        Assert.Equal("BethesdaSoftworks.ProjectGold_3275kfvn8vcwc!Game", found[1].Target);

        // Without the Windows list the id is computed from the config.
        var computed = XboxDetector.Detect(new[] { root }, null);
        Assert.Contains(computed, d => d.Target == "Microsoft.624F8B84B80_8wekyb3d8bbwe!Game");
        Assert.Contains(computed, d => d.Name == "Old Game");
    }

    [Fact]
    public void Gaming_root_files_add_other_folders_and_reject_odd_paths()
    {
        var bytes = new List<byte>(Encoding.ASCII.GetBytes("RGBX"));
        bytes.AddRange(new byte[] { 1, 0, 0, 0 });
        bytes.AddRange(Encoding.Unicode.GetBytes("Spiele\\Xbox\0..\\Windows\0"));
        Assert.Equal(new[] { "Spiele\\Xbox" }, XboxDetector.ParseGamingRoot(bytes.ToArray()));
        Assert.Empty(XboxDetector.ParseGamingRoot(Encoding.ASCII.GetBytes("garbage-data")));

        using var dir = new TempDir();
        var d = Directory.CreateDirectory(Path.Combine(dir.Path, "D")).FullName;
        Directory.CreateDirectory(Path.Combine(d, "XboxGames"));
        Directory.CreateDirectory(Path.Combine(d, "Spiele\\Xbox".Replace('\\', Path.DirectorySeparatorChar)));
        var roots = XboxDetector.GameRoots(new[] { d }, Directory.Exists, f => f.EndsWith(".GamingRoot") ? bytes.ToArray() : null);
        Assert.Equal(2, roots.Count);
    }

    [Fact]
    public void Xbox_link_keeps_the_library_in_sync_and_a_removed_game_stays_removed()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var installed = new List<DetectedItem>
        {
            new("xbox:A", ItemKind.Game, "Forza Horizon 5", LaunchSource.AppsFolder, "Microsoft.624F8B84B80_8wekyb3d8bbwe!Game", "C:/XboxGames/FH5/Content", new() { "ForzaHorizon5" }, null, "Xbox", false),
            new("xbox:B", ItemKind.Game, "Starfield", LaunchSource.AppsFolder, "BethesdaSoftworks.ProjectGold_3275kfvn8vcwc!Game", null, new(), null, "Xbox", false),
        };
        using var l = new LauncherService(s.Library, s.Platform, s.Settings, s.Rpc, null, null, () => Array.Empty<DetectedItem>(), () => false, () => installed);
        Assert.Equal("disabled", Assert.Throws<Pgl.Core.Rpc.RpcException>(() => l.Sync(LauncherService.Xbox)).Code);

        Assert.True(s.Settings.EnableLauncherLinksOnce());                 // first start: all links on
        var set = s.Settings.Get();
        Assert.True(set.SteamEnabled && set.EpicEnabled && set.EaEnabled && set.XboxEnabled);
        l.Sync(LauncherService.Xbox);
        Assert.Equal(new[] { "Forza Horizon 5", "Starfield" }, s.Library.List().Select(i => i.Name).OrderBy(n => n));
        Assert.All(s.Library.List(), i => Assert.Equal(("xbox", true), (i.AutoSource, i.AutoAdded)));

        // Removed by the user → not added again; uninstalled → removed.
        s.Library.Remove(s.Library.List().Single(i => i.Name == "Starfield").Id);
        installed.RemoveAt(0);
        l.Sync(LauncherService.Xbox);
        Assert.Empty(s.Library.List());

        // A Game Pass sync does not touch games of the Xbox link.
        installed.Insert(0, new("xbox:A", ItemKind.Game, "Forza Horizon 5", LaunchSource.AppsFolder, "Microsoft.624F8B84B80_8wekyb3d8bbwe!Game", null, new(), null, "Xbox", false));
        l.Sync(LauncherService.Xbox);
        s.Library.ReconcileGamePass(Array.Empty<GamePassGame>(), new Dictionary<string, string>());
        Assert.Single(s.Library.List(), i => i.Name == "Forza Horizon 5");

        // Switched off by the user → stays off (the automatic switch-on happens only once).
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { XboxEnabled = false });
        Assert.False(s.Settings.EnableLauncherLinksOnce());
        Assert.False(s.Settings.Get().XboxEnabled);
    }
}
