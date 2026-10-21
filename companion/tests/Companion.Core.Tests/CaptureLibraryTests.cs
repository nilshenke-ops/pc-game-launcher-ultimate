using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CaptureLibraryTests
{
    sealed class FakeMedia : IMediaTools
    {
        public int Thumbnails;
        public List<string> Recycled = new();
        public string? Thumbnail(string path, int size) { Thumbnails++; return "data:image/jpeg;base64,AAAA"; }
        public bool CanRecycle => true;
        public bool MoveToRecycleBin(string path) { Recycled.Add(path); File.Delete(path); return true; }
    }

    sealed class MediaPlatform(IMediaTools media) : IPlatform
    {
        readonly GenericPlatform _g = new();
        public string Name => "Test";
        public ILauncher Launcher => _g.Launcher;
        public IProcessSource Processes => _g.Processes;
        public IAudioEngine Audio => _g.Audio;
        public IHotkeyRegistrar Hotkeys => _g.Hotkeys;
        public IMetricsSource Metrics => _g.Metrics;
        public IAutostart Autostart => _g.Autostart;
        public ISecretProtector Secrets => _g.Secrets;
        public IDesktopIntegration Desktop => _g.Desktop;
        public IEnumerable<IDetector> Detectors => Array.Empty<IDetector>();
        public IUpdateInstaller UpdateInstaller => _g.UpdateInstaller;
        public IMediaTools Media => media;
    }

    static (CaptureLibraryService lib, string shots, string videos, string steam) Setup(TempDir dir, IPlatform platform)
    {
        var paths = new AppPaths(Path.Combine(dir.Path, "data"));
        var library = new LibraryService(paths, platform, new NullHub());
        library.Import(new LibraryFile { Items = {
            new LibraryItem { Id = "item_rl", Name = "Rocket League®", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "252950" },
            new LibraryItem { Id = "item_mc", Name = "Minecraft", Kind = ItemKind.Game, Source = LaunchSource.Exe, Target = "x" },
        } });
        var shots = Directory.CreateDirectory(Path.Combine(dir.Path, "Captures")).FullName;
        var videos = Directory.CreateDirectory(Path.Combine(dir.Path, "Videos")).FullName;
        var steam = Directory.CreateDirectory(Path.Combine(dir.Path, "userdata", "1", "760", "remote")).FullName;
        File.WriteAllBytes(Path.Combine(shots, "Minecraft 2026-10-20 18-00-00.mp4"), new byte[3000]);
        File.WriteAllBytes(Path.Combine(shots, "Desktop 2026-10-20.png"), new byte[10]);
        File.WriteAllText(Path.Combine(shots, "notes.txt"), "privat");                                  // not a capture
        Directory.CreateDirectory(Path.Combine(videos, "Rocket League"));
        File.WriteAllBytes(Path.Combine(videos, "Rocket League", "Goal.mp4"), new byte[20]);              // NVIDIA style
        File.WriteAllBytes(Path.Combine(videos, "Urlaub.mp4"), new byte[20]);                             // private video
        Directory.CreateDirectory(Path.Combine(steam, "252950", "screenshots", "thumbnails"));
        File.WriteAllBytes(Path.Combine(steam, "252950", "screenshots", "20261020_1.jpg"), new byte[30]);
        File.WriteAllBytes(Path.Combine(steam, "252950", "screenshots", "thumbnails", "20261020_1.jpg"), new byte[3]); // Steam's own copy
        var lib = new CaptureLibraryService(paths, library, platform, new NullHub(), () => new[]
        {
            new CaptureFolder { Path = shots, Label = "Xbox Game Bar", Source = "auto" },
            new CaptureFolder { Path = videos, Label = "Videos (NVIDIA)", Source = "auto-games" },
            new CaptureFolder { Path = steam, Label = "Steam", Source = "auto" },
        });
        return (lib, shots, videos, steam);
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public void Only_pictures_and_videos_are_listed_with_the_right_game_and_no_private_videos()
    {
        using var dir = new TempDir();
        var (lib, _, _, _) = Setup(dir, new GenericPlatform());
        lib.Scan();
        var items = J(lib.List()).GetProperty("items").EnumerateArray().ToList();
        var names = items.Select(i => i.GetProperty("name").GetString()).ToList();
        Assert.Equal(4, items.Count);
        Assert.DoesNotContain("notes.txt", names);
        Assert.DoesNotContain("Urlaub.mp4", names);          // videos folder: only files of known games
        Assert.Single(names, n => n == "20261020_1.jpg");   // Steam's thumbnail copy skipped
        string? Game(string n) => items.First(i => i.GetProperty("name").GetString() == n).TryGetProperty("game", out var g) ? g.GetString() : null;
        Assert.Equal("Minecraft", Game("Minecraft 2026-10-20 18-00-00.mp4")); // Game Bar file name
        Assert.Equal("Rocket League®", Game("Goal.mp4"));                       // NVIDIA folder
        Assert.Equal("Rocket League®", Game("20261020_1.jpg"));                 // Steam app id
        Assert.Null(Game("Desktop 2026-10-20.png"));                            // unsure: no guess
        Assert.False(J(lib.List()).GetProperty("canRecycle").GetBoolean());
    }

    [Fact]
    public void Reading_returns_the_file_and_unknown_ids_reveal_nothing()
    {
        using var dir = new TempDir();
        var (lib, shots, _, _) = Setup(dir, new GenericPlatform());
        lib.Scan();
        var id = CaptureLibraryService.IdOf(Path.Combine(shots, "Minecraft 2026-10-20 18-00-00.mp4"));
        var r = J(lib.Read(id, 0, 1000));
        Assert.Equal(1000, Convert.FromBase64String(r.GetProperty("data").GetString()!).Length);
        Assert.False(r.GetProperty("eof").GetBoolean());
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => lib.Read(CaptureLibraryService.IdOf(Path.Combine(shots, "notes.txt")), 0, 10)).Code);
        // Without a recycle bin nothing is deleted.
        Assert.Equal("not-supported", Assert.Throws<RpcException>(() => lib.Remove(id)).Code);
        Assert.True(File.Exists(Path.Combine(shots, "Minecraft 2026-10-20 18-00-00.mp4")));
    }

    [Fact]
    public void Thumbnails_are_cached_favorites_survive_rescans_and_delete_goes_to_the_recycle_bin()
    {
        using var dir = new TempDir();
        var media = new FakeMedia();
        var (lib, shots, _, _) = Setup(dir, new MediaPlatform(media));
        lib.Scan();
        var path = Path.Combine(shots, "Desktop 2026-10-20.png");
        var id = CaptureLibraryService.IdOf(path);
        Assert.Equal("data:image/jpeg;base64,AAAA", lib.Thumbs(new[] { id })[id]);
        lib.Thumbs(new[] { id });
        Assert.Equal(1, media.Thumbnails); // second time from the cache

        lib.Update(id, true, new() { "Clutch", "  Clutch ", "Win" });
        Assert.Throws<RpcException>(() => lib.Update(id, null, new() { "<script>" }));
        lib.Scan();
        var item = J(lib.List()).GetProperty("items").EnumerateArray().First(i => i.GetProperty("id").GetString() == id);
        Assert.True(item.GetProperty("favorite").GetBoolean());
        Assert.Equal(new[] { "Clutch", "Win" }, item.GetProperty("tags").EnumerateArray().Select(x => x.GetString()));

        lib.Remove(id);
        Assert.Equal(new[] { path }, media.Recycled);
        Assert.DoesNotContain(J(lib.List()).GetProperty("items").EnumerateArray(), i => i.GetProperty("id").GetString() == id);
    }

    [Fact]
    public void Categories_are_checked_and_hashes_find_only_identical_files()
    {
        using var dir = new TempDir();
        var (lib, shots, _, steam) = Setup(dir, new GenericPlatform());
        // Same size, different content – and an exact copy.
        File.WriteAllBytes(Path.Combine(shots, "a.png"), new byte[] { 1, 2, 3, 4 });
        File.WriteAllBytes(Path.Combine(shots, "b.png"), new byte[] { 1, 2, 3, 5 });
        File.WriteAllBytes(Path.Combine(shots, "a-kopie.png"), new byte[] { 1, 2, 3, 4 });
        lib.Scan();
        string Id(string n) => CaptureLibraryService.IdOf(Path.Combine(shots, n));
        var h = lib.Hashes(new[] { Id("a.png"), Id("b.png"), Id("a-kopie.png"), "0000000000000000" });
        Assert.Equal(h[Id("a.png")], h[Id("a-kopie.png")]);
        Assert.NotEqual(h[Id("a.png")], h[Id("b.png")]);
        Assert.Null(h["0000000000000000"]);                       // unknown id: nothing revealed
        Assert.Equal(64, h[Id("a.png")]!.Length);
        // Changed file → new hash (cache is renewed).
        File.WriteAllBytes(Path.Combine(shots, "a-kopie.png"), new byte[] { 9, 9, 9, 9, 9 });
        lib.Scan();
        Assert.NotEqual(h[Id("a.png")], lib.Hashes(new[] { Id("a-kopie.png") })[Id("a-kopie.png")]);
        Assert.True(File.Exists(Path.Combine(shots, "a.png")));     // hashing never deletes

        lib.Update(Id("a.png"), null, null, "Landschaft & Natur");
        Assert.Throws<RpcException>(() => lib.Update(Id("a.png"), null, null, "<b>x</b>"));
        Assert.Throws<RpcException>(() => lib.Update(Id("a.png"), null, null, new string('x', 31)));
        string? Cat() => J(lib.List()).GetProperty("items").EnumerateArray().First(i => i.GetProperty("id").GetString() == Id("a.png")).TryGetProperty("category", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        Assert.Equal("Landschaft & Natur", Cat());
        lib.Update(Id("a.png"), null, null, "");                   // "" clears
        Assert.Null(Cat());
    }

    [Fact]
    public async Task Captures_need_manage_rights_and_folders_can_only_be_added_by_an_admin()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var (manager, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        Assert.Equal("forbidden", await viewer.Error("captures.list"));
        await manager.Ok("captures.list");
        var folder = Directory.CreateDirectory(Path.Combine(dir.Path, "Clips")).FullName;
        Assert.Equal("forbidden", await manager.Error("captures.addFolder", new { path = folder }));
        await admin.Ok("captures.addFolder", new { path = folder, label = "Meine Clips" });
        Assert.Equal("invalid-params", await admin.Error("captures.addFolder", new { path = "relative/dir" }));
        Assert.Equal("invalid-params", await admin.Error("captures.addFolder", new { path = Path.GetPathRoot(folder)! }));
        Assert.Equal("invalid-params", await manager.Error("captures.update", new { id = "../../x", favorite = true }));
    }
}
