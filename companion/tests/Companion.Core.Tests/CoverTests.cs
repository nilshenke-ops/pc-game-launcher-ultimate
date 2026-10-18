using System.Net;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class CoverTests
{
    [Theory]
    [InlineData("Rocket League®", "rocket league")]
    [InlineData("FORZA HORIZON 5 – Standard Edition", "forza horizon 5")]
    [InlineData("Pokémon: Legends", "pokemon legends")]
    public void Titles_are_normalised(string input, string expected) => Assert.Equal(expected, CoverService.Normalize(input));

    [Fact]
    public void Similar_titles_are_not_equal() => Assert.NotEqual(CoverService.Normalize("Hades"), CoverService.Normalize("Hades II"));

    sealed class FakeStores : HttpMessageHandler
    {
        public readonly List<string> Calls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var url = r.RequestUri!.ToString();
            Calls.Add(url);
            string body = "{}";
            if (url.Contains("storesearch")) body = """{"total":2,"items":[{"name":"Hades II","id":1145350},{"name":"Hades","id":1145360}]}""";
            else if (url.Contains("autosuggest")) body = """{"Results":[{"Products":[{"Title":"Rocket League®","ProductId":"C125W9BG2K0V"}]}]}""";
            else if (url.Contains("products/lookup") || url.Contains("products?bigIds"))
                body = """{"Products":[{"ProductId":"C125W9BG2K0V","LocalizedProperties":[{"ProductTitle":"X","Images":[{"ImagePurpose":"Poster","Uri":"//store-images.s-microsoft.com/image/poster"}]}]}]}""";
            if (url.Contains("storesearch") && url.Contains("Rocket")) body = """{"total":0,"items":[]}""";
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") });
        }
    }

    static CompanionServices WithGames(TempDir dir, params LibraryItem[] items)
    {
        File.WriteAllText(Path.Combine(dir.Path, "library.json"), Json.Serialize(new LibraryFile { Items = items.ToList() }));
        return Fixtures.Services(dir);
    }

    [Fact]
    public async Task Finds_exact_matches_and_never_overwrites_a_users_cover()
    {
        using var dir = new TempDir();
        var s = WithGames(dir,
            new LibraryItem { Id = "rl", Kind = ItemKind.Game, Name = "Rocket League", Source = LaunchSource.Epic, Target = "a:b:c" },
            new LibraryItem { Id = "hades", Kind = ItemKind.Game, Name = "Hades", Source = LaunchSource.Exe, Target = @"C:\Games\Hades.exe" },
            new LibraryItem { Id = "fh", Kind = ItemKind.Game, Name = "Forza", Source = LaunchSource.AppsFolder, Target = "Microsoft.SunriseBaseGame_8wekyb3d8bbwe!App" },
            new LibraryItem { Id = "own", Kind = ItemKind.Game, Name = "Mein Spiel", Source = LaunchSource.Exe, Target = @"C:\x.exe", CoverUrl = "https://example.com/mine.jpg" });
        var fake = new FakeStores();
        using var covers = new CoverService(s.Library, s.Settings.Get, fake);

        Assert.Equal(3, await covers.FillMissingAsync());
        Assert.Equal("https://store-images.s-microsoft.com/image/poster", s.Library.Get("rl")!.CoverUrl); // Microsoft Store search, exact title
        Assert.Equal("https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/library_600x900.jpg", s.Library.Get("hades")!.CoverUrl); // "Hades", not "Hades II"
        Assert.Equal("https://store-images.s-microsoft.com/image/poster", s.Library.Get("fh")!.CoverUrl); // by package family name
        Assert.Equal("https://example.com/mine.jpg", s.Library.Get("own")!.CoverUrl);
        Assert.Contains(fake.Calls, c => c.Contains("alternateId=PackageFamilyName&value=Microsoft.SunriseBaseGame_8wekyb3d8bbwe"));

        fake.Calls.Clear();
        Assert.Equal(0, await covers.FillMissingAsync()); // each game is looked up only once
        Assert.Empty(fake.Calls);
    }

    [Fact]
    public async Task Switched_off_means_no_requests()
    {
        using var dir = new TempDir();
        var s = WithGames(dir, new LibraryItem { Id = "rl", Kind = ItemKind.Game, Name = "Rocket League", Source = LaunchSource.Epic, Target = "a:b:c" });
        s.Settings.SaveGeneral(new SettingsService.GeneralUpdate { CoverSearch = false });
        var fake = new FakeStores();
        using var covers = new CoverService(s.Library, s.Settings.Get, fake);
        Assert.Equal(0, await covers.FillMissingAsync());
        Assert.Empty(fake.Calls);
    }
}
