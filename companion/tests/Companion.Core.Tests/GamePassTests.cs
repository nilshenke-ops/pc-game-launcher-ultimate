using System.Net;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class GamePassTests
{
    static GamePassGame Game(string id, string title, string? pfn) => new() { Id = id, Title = title, Pfn = pfn, Cover = "https://store-images.s-microsoft.com/image/x" };

    [Fact]
    public void Installed_games_are_added_and_removed_again_when_uninstalled_or_leaving_game_pass()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var catalog = new List<GamePassGame> { Game("9NPDN9R45JX4", "1000xRESIST", "Surprise.1000xResist_8k24"), Game("9P8LR42PTRGJ", "33 Immortals", "Thunder.33Immortals_hbhk") };
        var installed = new Dictionary<string, string> { ["Surprise.1000xResist_8k24"] = "Surprise.1000xResist_8k24!Game" };

        Assert.Equal((1, 0), s.Library.ReconcileGamePass(catalog, installed));
        var item = Assert.Single(s.Library.List());
        Assert.Equal("1000xRESIST", item.Name);
        Assert.Equal(LaunchSource.AppsFolder, item.Source);
        Assert.Contains(GamePassService.Category, item.Categories);
        Assert.True(item.AutoAdded);
        Assert.Equal((0, 0), s.Library.ReconcileGamePass(catalog, installed)); // idempotent

        // Uninstalled → removed.
        Assert.Equal((0, 1), s.Library.ReconcileGamePass(catalog, new Dictionary<string, string>()));
        Assert.Empty(s.Library.List());

        // Installed again, then leaves Game Pass → removed.
        s.Library.ReconcileGamePass(catalog, installed);
        Assert.Equal((0, 1), s.Library.ReconcileGamePass(catalog.Skip(1).ToList(), installed));
        Assert.Empty(s.Library.List());
    }

    [Fact]
    public void Games_added_by_hand_only_get_or_lose_the_category()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var file = Path.Combine(dir.Path, "library.json");
        File.WriteAllText(file, Json.Serialize(new LibraryFile { Items = { new LibraryItem { Id = "item_manual", Kind = ItemKind.Game, Name = "Mein Spiel", Source = LaunchSource.AppsFolder, Target = "Surprise.1000xResist_8k24!Game" } } }));
        s = Fixtures.Services(dir);
        var catalog = new List<GamePassGame> { Game("9NPDN9R45JX4", "1000xRESIST", "Surprise.1000xResist_8k24") };
        var installed = new Dictionary<string, string> { ["Surprise.1000xResist_8k24"] = "Surprise.1000xResist_8k24!Game" };

        Assert.Equal((0, 0), s.Library.ReconcileGamePass(catalog, installed));
        var item = Assert.Single(s.Library.List());
        Assert.Equal("Mein Spiel", item.Name);
        Assert.Contains(GamePassService.Category, item.Categories);
        Assert.False(item.AutoAdded);

        s.Library.ReconcileGamePass(new List<GamePassGame> { Game("9P8LR42PTRGJ", "Other", "x.y_z") }, new Dictionary<string, string>());
        item = Assert.Single(s.Library.List()); // kept, because the user added it
        Assert.DoesNotContain(GamePassService.Category, item.Categories);
    }

    [Fact]
    public void Catalog_product_is_parsed_with_pc_package_and_cover()
    {
        const string json = """
        {"ProductId":"9NPDN9R45JX4","LocalizedProperties":[{"ProductTitle":"1000xRESIST","Images":[
          {"ImagePurpose":"Screenshot","Uri":"//store-images.s-microsoft.com/image/shot"},
          {"ImagePurpose":"Poster","Uri":"//store-images.s-microsoft.com/image/poster"}]}],
         "Properties":{"Category":"Action & adventure"},
         "DisplaySkuAvailabilities":[{"Sku":{"Properties":{"Packages":[
           {"PackageFamilyName":"Surprise.1000xResist_8k24","PlatformDependencies":[{"PlatformName":"Windows.Desktop"}]},
           {"PackageFamilyName":null,"PlatformDependencies":[{"PlatformName":"Windows.Xbox"}]}]}}}]}
        """;
        var g = GamePassService.Parse(JsonDocument.Parse(json).RootElement)!;
        Assert.Equal("1000xRESIST", g.Title);
        Assert.Equal("Surprise.1000xResist_8k24", g.Pfn);
        Assert.Equal("https://store-images.s-microsoft.com/image/poster", g.Cover);
        Assert.Equal("Action & adventure", g.Category);
    }

    sealed class FakeCatalog(int games) : HttpMessageHandler
    {
        public int Games = games;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var url = r.RequestUri!.ToString();
            string body;
            if (url.Contains("catalog.gamepass.com"))
                body = JsonSerializer.Serialize(new object[] { new { siglId = "x" } }.Concat(Enumerable.Range(0, Games).Select(i => (object)new { id = $"9N{i:D10}" })));
            else
            {
                var ids = System.Web.HttpUtility.ParseQueryString(r.RequestUri.Query)["bigIds"]!.Split(',');
                body = JsonSerializer.Serialize(new { Products = ids.Select(id => new { ProductId = id, LocalizedProperties = new[] { new { ProductTitle = "Spiel " + id, Images = Array.Empty<object>() } } }) });
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    [Fact]
    public async Task Catalog_sync_marks_only_later_additions_as_new_and_ignores_broken_responses()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { GamePassEnabled = true });
        var fake = new FakeCatalog(100);
        using var gp = new GamePassService(new AppPaths(dir.Path), s.Library, s.Platform, s.Settings.Get, s.Rpc, fake);

        var first = JsonSerializer.SerializeToElement(await gp.SyncAsync(force: true), Json.Options);
        Assert.Equal(100, first.GetProperty("games").GetArrayLength());
        Assert.DoesNotContain(first.GetProperty("games").EnumerateArray(), g => g.GetProperty("isNew").GetBoolean()); // first sync: nothing is "new"

        fake.Games = 101;
        var second = JsonSerializer.SerializeToElement(await gp.SyncAsync(force: true), Json.Options);
        Assert.Single(second.GetProperty("games").EnumerateArray(), g => g.GetProperty("isNew").GetBoolean());

        fake.Games = 10; // suspicious drop → keep the old catalog
        var third = JsonSerializer.SerializeToElement(await gp.SyncAsync(force: true), Json.Options);
        Assert.Equal(101, third.GetProperty("games").GetArrayLength());
        Assert.Contains("unvollständig", third.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Disabled_by_default_and_install_rejects_unknown_ids()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        Assert.False(s.Settings.Get().GamePassEnabled); // no request to Microsoft unless switched on
        var admin = await Fixtures.Admin(s);
        Assert.Equal("disabled", await admin.Error("gamepass.sync"));
        Assert.Equal("invalid-params", await admin.Error("gamepass.install", new { id = "../../evil" }));
    }
}
