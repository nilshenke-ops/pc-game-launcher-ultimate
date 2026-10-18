using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class LauncherTests
{
    /// <summary>Epic launcher cache: Base64 of a JSON array with games, DLC and apps (like catcache.bin).</summary>
    static string Catcache() => Convert.ToBase64String(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new object[]
    {
        new { id = "c1", @namespace = "fn", title = "Fortnite", categories = new[] { new { path = "games" } },
              releaseInfo = new[] { new { appId = "Fortnite", platform = new[] { "Windows" } } },
              keyImages = new[] { new { type = "Thumbnail", url = "https://cdn1.epicgames.com/thumb.jpg" }, new { type = "DieselGameBoxTall", url = "https://cdn1.epicgames.com/tall.jpg" } } },
        new { id = "c2", @namespace = "rl", title = "Rocket League", categories = new[] { new { path = "games" } },
              releaseInfo = new[] { new { appId = "Sugar", platform = new[] { "Windows" } } }, keyImages = Array.Empty<object>() },
        new { id = "c3", @namespace = "rl", title = "Rocket League – Season Pass", categories = new[] { new { path = "addons" } }, mainGameItem = new { id = "c2" } },
        new { id = "c4", @namespace = "ue", title = "Unreal Engine", categories = new[] { new { path = "applications" } } },
    })));

    [Fact]
    public void Epic_cache_lists_games_without_dlc_and_apps()
    {
        var games = LauncherService.ParseEpicCatalog(Catcache());
        Assert.Equal(new[] { "Fortnite", "Rocket League" }, games.Select(g => g.Title));
        Assert.Equal("https://cdn1.epicgames.com/tall.jpg", games[0].Cover); // portrait art preferred
        Assert.Equal(("fn", "Fortnite"), (games[0].Namespace, games[0].AppName));
    }

    [Fact]
    public void Epic_installed_games_sync_and_owned_games_are_listed()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var manifests = Directory.CreateDirectory(Path.Combine(dir.Path, "Manifests")).FullName;
        File.WriteAllText(Path.Combine(manifests, "a.item"), JsonSerializer.Serialize(new { DisplayName = "Rocket League", AppName = "Sugar", CatalogNamespace = "rl", CatalogItemId = "c2", InstallLocation = "C:/Games/RL", LaunchExecutable = "Binaries/RL.exe" }));
        var cache = Path.Combine(dir.Path, "catcache.bin");
        File.WriteAllText(cache, Catcache());
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { EpicEnabled = true });
        using var l = new LauncherService(s.Library, s.Platform, s.Settings, s.Rpc, manifests, cache, () => Array.Empty<DetectedItem>(), () => false);

        var r = JsonSerializer.SerializeToElement(l.Sync(LauncherService.Epic), Json.Options);
        var games = r.GetProperty("games").EnumerateArray().ToList();
        Assert.Equal(2, games.Count);
        Assert.True(games[0].GetProperty("installed").GetBoolean());              // Rocket League installed → first, playable
        Assert.Equal("Rocket League", games[0].GetProperty("name").GetString());
        Assert.False(games[1].GetProperty("installed").GetBoolean());             // Fortnite owned, not installed → installable
        Assert.True(games[1].GetProperty("installable").GetBoolean());
        var item = Assert.Single(s.Library.List());
        Assert.Equal(("epic", LaunchSource.Epic), (item.AutoSource, item.Source));

        File.Delete(Path.Combine(manifests, "a.item")); // uninstalled
        l.Sync(LauncherService.Epic);
        Assert.Empty(s.Library.List());
    }

    [Fact]
    public void Ea_games_come_from_electronic_arts_uninstall_entries()
    {
        string P(params string[] parts) => Path.Combine(new[] { Path.GetTempPath(), "Games" }.Concat(parts).ToArray()); // full path on every OS
        var bf = P("BF2042", "BF2042.exe");
        var entries = new[]
        {
            new EaDetector.Entry("Battlefield 2042", "Electronic Arts", P("BF2042"), $"\"{bf}\",0"),
            new EaDetector.Entry("EA app", "Electronic Arts", P("EA Desktop"), P("EA Desktop", "EADesktop.exe")),
            new EaDetector.Entry("Some Tool", "Other Publisher", P("Tools"), P("Tools", "tool.exe")),
            new EaDetector.Entry("FC 25", "Electronic Arts", P("FC25"), P("FC25", "missing.exe")),
        };
        var found = EaDetector.FromEntries(entries, p => !p.Contains("missing"));
        var g = Assert.Single(found);
        Assert.Equal(("Battlefield 2042", bf, LaunchSource.Exe), (g.Name, g.Target, g.Source));
    }

    [Fact]
    public async Task Off_by_default_and_ea_cannot_install()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        Assert.False(s.Settings.Get().EpicEnabled || s.Settings.Get().EaEnabled);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("disabled", await admin.Error("launchers.sync", new { source = "epic" }));
        Assert.Equal("invalid-params", await admin.Error("launchers.list", new { source = "gog" }));
        Assert.Equal("unsupported", await admin.Error("launchers.install", new { source = "ea", id = "x" }));
    }
}
