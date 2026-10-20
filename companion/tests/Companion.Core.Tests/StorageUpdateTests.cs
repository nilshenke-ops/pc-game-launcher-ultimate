using System.Text.Json;
using Pgl.Core.Models;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class StorageUpdateTests
{
    static string Manifest(int flags, long size, long toDl = 0, long done = 0) => $$"""
        "AppState"
        {
            "appid"     "252950"
            "name"      "Rocket League"
            "StateFlags"    "{{flags}}"
            "installdir"    "rocketleague"
            "LastUpdated"   "1760000000"
            "SizeOnDisk"    "{{size}}"
            "buildid"   "1234567"
            "BytesToDownload"   "{{toDl}}"
            "BytesDownloaded"   "{{done}}"
        }
        """;

    [Fact]
    public void Steam_update_state_is_read_from_the_manifest_flags()
    {
        Assert.Equal("current", SteamAppState.Parse(Manifest(4, 100))!.Status);
        Assert.Equal("update", SteamAppState.Parse(Manifest(6, 100))!.Status);
        Assert.Equal("update", SteamAppState.Parse(Manifest(4, 100, toDl: 500, done: 100))!.Status); // download not finished
        Assert.Equal("updating", SteamAppState.Parse(Manifest(1026, 100))!.Status);
        Assert.Equal("paused", SteamAppState.Parse(Manifest(4 | 512, 100))!.Status);
        Assert.Equal("damaged", SteamAppState.Parse(Manifest(4 | 128, 100))!.Status);
        var s = SteamAppState.Parse(Manifest(4, 21_474_836_480))!;
        Assert.Equal(21_474_836_480, s.SizeOnDisk);
        Assert.Equal(new DateTime(2025, 10, 9, 8, 53, 20, DateTimeKind.Utc), s.LastUpdated);
        Assert.Null(SteamAppState.Parse("\"AppState\" { \"appid\" \"1\" }")); // no flags: nothing invented
    }

    [Fact]
    public async Task Storage_overview_shows_steam_size_and_update_but_unknown_for_other_launchers()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var apps = Path.Combine(dir.Path, "SteamLibrary", "steamapps");
        Directory.CreateDirectory(Path.Combine(apps, "common", "rocketleague"));
        File.WriteAllText(Path.Combine(apps, "appmanifest_252950.acf"), Manifest(6, 21_000_000_000, toDl: 300_000_000, done: 0));
        Directory.CreateDirectory(Path.Combine(dir.Path, "Epic", "Fortnite"));
        s.Library.Import(new LibraryFile { Items = {
            new LibraryItem { Id = "item_rl", Name = "Rocket League", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "252950", InstallDir = Path.Combine(apps, "common", "rocketleague") },
            new LibraryItem { Id = "item_fn", Name = "Fortnite", Kind = ItemKind.Game, Source = LaunchSource.Epic, Target = "Fortnite", InstallDir = Path.Combine(dir.Path, "Epic", "Fortnite") },
        } });
        var admin = await Fixtures.Admin(s);
        var r = await admin.Ok("storage.get");
        var items = r.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("id").GetString()!);
        var rl = items["item_rl"];
        Assert.Equal(21_000_000_000, rl.GetProperty("size").GetProperty("bytes").GetInt64());
        Assert.True(rl.GetProperty("size").GetProperty("fromLauncher").GetBoolean());
        Assert.Equal("update", rl.GetProperty("update").GetProperty("status").GetString());
        Assert.Equal(300_000_000, rl.GetProperty("update").GetProperty("bytesToDownload").GetInt64());
        Assert.False(items["item_fn"].TryGetProperty("update", out _)); // Epic: no reliable update state → not shown as "current"
    }
}
