using System.Net;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class SteamTests
{
    /// <summary>Builds a minimal Steam folder like on a real PC: libraryfolders.vdf, app manifests, loginusers.vdf.</summary>
    static string FakeSteam(TempDir dir, params (string id, string name)[] games)
    {
        var root = Path.Combine(dir.Path, "Steam");
        var apps = Path.Combine(root, "steamapps");
        Directory.CreateDirectory(apps);
        Directory.CreateDirectory(Path.Combine(root, "config"));
        File.WriteAllText(Path.Combine(apps, "libraryfolders.vdf"), "\"libraryfolders\"\n{\n}\n");
        foreach (var (id, name) in games)
            File.WriteAllText(Path.Combine(apps, $"appmanifest_{id}.acf"), $"\"AppState\"\n{{\n\t\"appid\"\t\t\"{id}\"\n\t\"name\"\t\t\"{name}\"\n\t\"StateFlags\"\t\t\"4\"\n\t\"installdir\"\t\t\"{name}\"\n}}\n");
        File.WriteAllText(Path.Combine(root, "config", "loginusers.vdf"), "\"users\"\n{\n\t\"76561198000000001\"\n\t{\n\t\t\"AccountName\"\t\t\"x\"\n\t\t\"PersonaName\"\t\t\"Nils\"\n\t\t\"MostRecent\"\t\t\"1\"\n\t}\n}\n");
        return root;
    }

    [Fact]
    public async Task Installed_steam_games_appear_automatically_and_disappear_when_uninstalled()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var root = FakeSteam(dir, ("730", "Counter-Strike 2"), ("1145360", "Hades"));
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { SteamEnabled = true });
        using var steam = new SteamService(new AppPaths(dir.Path), s.Library, s.Platform, s.Settings, s.Rpc, new[] { root }, new FakeSteamApi());

        await steam.SyncAsync(force: true);
        Assert.Equal(new[] { "Counter-Strike 2", "Hades" }, s.Library.List().Select(i => i.Name).OrderBy(x => x));
        Assert.All(s.Library.List(), i => { Assert.True(i.AutoAdded); Assert.Equal(LaunchSource.Steam, i.Source); Assert.Contains("library_600x900", i.CoverUrl); });

        File.Delete(Path.Combine(root, "steamapps", "appmanifest_1145360.acf")); // uninstalled in Steam
        await steam.SyncAsync(force: true);
        Assert.Equal("Counter-Strike 2", Assert.Single(s.Library.List()).Name);

        Directory.Delete(root, true); // Steam folder gone (e.g. drive not connected) → nothing is removed
        await steam.SyncAsync(force: true);
        Assert.Single(s.Library.List());

        var account = new SteamService(new AppPaths(dir.Path), s.Library, s.Platform, s.Settings, s.Rpc, new[] { FakeSteam(dir) }).LocalAccount();
        Assert.Equal(("76561198000000001", "Nils"), (account!.Value.steamId, account.Value.name));
    }

    sealed class FakeSteamApi : HttpMessageHandler
    {
        public string? LastUrl;
        public bool Private;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            LastUrl = r.RequestUri!.ToString();
            var body = LastUrl.Contains("GetOwnedGames")
                ? (Private ? """{"response":{}}""" : """{"response":{"game_count":2,"games":[{"appid":252950,"name":"Rocket League","playtime_forever":1234,"rtime_last_played":1700000000},{"appid":1145360,"name":"Hades","playtime_forever":60}]}}""")
                : "<profile><steamID64>76561198000000001</steamID64><steamID>Nils</steamID></profile>";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8) });
        }
    }

    [Fact]
    public async Task Whole_library_with_own_api_key_and_the_key_never_leaves_the_pc()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var root = FakeSteam(dir, ("1145360", "Hades"));
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { SteamEnabled = true });
        var api = new FakeSteamApi();
        using var steam = new SteamService(new AppPaths(dir.Path), s.Library, s.Platform, s.Settings, s.Rpc, new[] { root }, api);

        var r = JsonSerializer.SerializeToElement(await steam.Link("https://steamcommunity.com/id/nils/", "0123456789ABCDEF0123456789ABCDEF"), Json.Options);
        var games = r.GetProperty("games").EnumerateArray().ToList();
        Assert.Equal(2, games.Count);
        Assert.True(games.First(g => g.GetProperty("name").GetString() == "Hades").GetProperty("installed").GetBoolean());
        Assert.False(games.First(g => g.GetProperty("name").GetString() == "Rocket League").GetProperty("installed").GetBoolean());
        Assert.Equal("Nils", r.GetProperty("persona").GetString());
        Assert.DoesNotContain("0123456789ABCDEF", r.GetRawText());

        // Neither settings.get nor settings.save hand out the key or the relay secret.
        var admin = await Fixtures.Admin(s);
        Assert.DoesNotContain("steamApiKey", (await admin.Ok("settings.get")).GetRawText(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("SteamApiKeyProtected\":\"", (await admin.Ok("settings.save", new { notifyInfo = true })).GetRawText());

        api.Private = true;
        r = JsonSerializer.SerializeToElement(await steam.SyncAsync(force: true), Json.Options);
        Assert.Contains("Spieldetails", r.GetProperty("error").GetString());
        Assert.Equal(2, r.GetProperty("games").GetArrayLength()); // last good list is kept
    }

    [Fact]
    public async Task Invalid_key_and_profile_are_explained()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { SteamEnabled = true });
        using var steam = new SteamService(new AppPaths(dir.Path), s.Library, s.Platform, s.Settings, s.Rpc, new[] { Path.Combine(dir.Path, "none") }, new FakeSteamApi());
        var e = await Assert.ThrowsAsync<RpcException>(() => steam.Link("76561198000000001", "not-a-key"));
        Assert.Contains("32 Zeichen", e.Message);
        e = await Assert.ThrowsAsync<RpcException>(() => steam.Link("bad profile!!", "0123456789ABCDEF0123456789ABCDEF"));
        Assert.Contains("Profillink", e.Message);
    }

    [Fact]
    public async Task Real_cover_paths_replace_the_old_broken_ones()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), Json.Serialize(new LibraryFile { Items = {
            new LibraryItem { Id = "peak", Kind = ItemKind.Game, Name = "PEAK", Source = LaunchSource.Steam, Target = "3527290", CoverUrl = SteamArt.OldCover("3527290") },
            new LibraryItem { Id = "mine", Kind = ItemKind.Game, Name = "CS", Source = LaunchSource.Steam, Target = "730", CoverUrl = "https://example.com/mine.jpg" } } }));
        s = Fixtures.Services(dir);
        using var http = new HttpClient(new StoreItems());
        var covers = await SteamArt.ResolveAsync(http, new[] { "3527290", "730" });
        Assert.Equal("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3527290/abc/library_600x900.jpg?t=1", covers["3527290"]);
        s.Library.ReplaceSteamCovers(covers);
        Assert.Equal(covers["3527290"], s.Library.Get("peak")!.CoverUrl);
        Assert.Equal("https://example.com/mine.jpg", s.Library.Get("mine")!.CoverUrl); // the user's own picture stays
    }

    sealed class StoreItems : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(
                "{\"response\":{\"store_items\":[{\"appid\":3527290,\"assets\":{\"asset_url_format\":\"steam/apps/3527290/${FILENAME}?t=1\",\"library_capsule\":\"abc/library_600x900.jpg\",\"header\":\"abc/header.jpg\"}},{\"appid\":730,\"assets\":{\"asset_url_format\":\"steam/apps/730/${FILENAME}?t=2\",\"library_capsule\":\"library_600x900.jpg\"}}]}}", Encoding.UTF8) });
    }
}
