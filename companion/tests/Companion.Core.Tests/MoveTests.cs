using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Moving a Steam game to another drive: copy + verify, switch with Steam closed, confirm, undo, resume.</summary>
public class MoveTests
{
    sealed class World : IDisposable
    {
        public readonly TempDir Dir = new();
        public readonly LibraryService Library;
        public MoveService M;
        public bool GameRunning, SteamRunning;
        public long? FreeD = 50L << 30;
        public string C => Path.Combine(Dir.Path, "C");
        public string D => Path.Combine(Dir.Path, "D");
        public string SteamRoot => Path.Combine(C, "Steam");
        public string Lib2 => Path.Combine(D, "SteamLibrary");
        public string Game => Path.Combine(SteamRoot, "steamapps", "common", "Hades");
        public string ItemId = "item_hades";
        readonly AppPaths _paths;

        public World()
        {
            Directory.CreateDirectory(Path.Combine(SteamRoot, "steamapps"));
            Directory.CreateDirectory(Path.Combine(Lib2, "steamapps"));
            File.WriteAllText(Path.Combine(SteamRoot, "steamapps", "libraryfolders.vdf"),
                "\"libraryfolders\"\n{\n \"0\" { \"path\" \"" + SteamRoot.Replace("\\", "\\\\") + "\" }\n \"1\" { \"path\" \"" + Lib2.Replace("\\", "\\\\") + "\" }\n}\n");
            File.WriteAllText(Path.Combine(SteamRoot, "steamapps", "appmanifest_1145360.acf"), "\"AppState\"\n{\n \"appid\" \"1145360\"\n \"name\" \"Hades\"\n \"StateFlags\" \"4\"\n \"installdir\" \"Hades\"\n}\n");
            Directory.CreateDirectory(Path.Combine(Game, "Content", "Audio"));
            File.WriteAllText(Path.Combine(Game, "Hades.exe"), "exe");
            File.WriteAllBytes(Path.Combine(Game, "Content", "Audio", "music.bank"), Enumerable.Range(0, 3_000_000).Select(i => (byte)(i * 31)).ToArray());
            File.WriteAllText(Path.Combine(Game, "Content", "settings.ini"), "fov=90");
            _paths = new AppPaths(Path.Combine(Dir.Path, "data"));
            Library = new LibraryService(_paths, new GenericPlatform(), new NullHub());
            Library.Import(new LibraryFile { Items = { new LibraryItem { Id = ItemId, Name = "Hades", Kind = ItemKind.Game, Source = LaunchSource.Steam, Target = "1145360", InstallDir = Game } } });
            M = Make();
        }

        public MoveService Make() => new(_paths, Library, () => new[] { SteamRoot }, _ => GameRunning, () => SteamRunning, new NullHub(),
            p => Path.GetFullPath(p).StartsWith(D) ? "D:" : "C:", p => Path.GetFullPath(p).StartsWith(D) ? FreeD : 100L << 30);

        public MoveJob Wait(string id, int ms = 10000)
        {
            for (var i = 0; i < ms / 20; i++) { var j = M.List().Single(x => x.Id == id); if (j.Phase != "copying") return j; Thread.Sleep(20); }
            throw new TimeoutException();
        }
        public void Dispose() { M.Dispose(); Dir.Dispose(); }
    }

    static string Hash(string dir) => string.Join("|", Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories).OrderBy(f => f)
        .Select(f => Path.GetRelativePath(dir, f) + ":" + Ids.Sha256Hex(File.ReadAllBytes(f))));

    [Fact]
    public void Options_show_the_official_way_target_libraries_and_checks()
    {
        using var w = new World();
        var o = System.Text.Json.JsonSerializer.SerializeToElement(w.M.Options(w.ItemId), Json.Options);
        Assert.True(o.GetProperty("supported").GetBoolean());
        Assert.Contains("Installationsordner verschieben", o.GetProperty("official").GetString());
        var t = o.GetProperty("targets").EnumerateArray().Single();
        Assert.Equal(w.Lib2, t.GetProperty("library").GetString());
        Assert.True(t.GetProperty("fits").GetBoolean());
        Assert.All(o.GetProperty("checks").EnumerateArray(), c => Assert.Equal("ok", c.GetProperty("status").GetString()));
        Assert.Equal(3, o.GetProperty("files").GetInt32());

        w.Library.Import(new LibraryFile { Items = { new LibraryItem { Id = "item_fn", Name = "Fortnite", Kind = ItemKind.Game, Source = LaunchSource.Epic, Target = "x:y:z", InstallDir = w.D } } });
        var e = System.Text.Json.JsonSerializer.SerializeToElement(w.M.Options("item_fn"), Json.Options);
        Assert.False(e.GetProperty("supported").GetBoolean());
        Assert.Contains("Epic hat keine Verschieben-Funktion", e.GetProperty("official").GetString());
        Assert.Equal("unsupported", Assert.Throws<RpcException>(() => w.M.Plan("item_fn", w.Lib2, "Test")).Code);
    }

    [Fact]
    public void Copy_verify_switch_with_steam_closed_and_delete_the_original_only_after_confirmation()
    {
        using var w = new World();
        var before = Hash(w.Game);
        var j = w.M.Plan(w.ItemId, w.Lib2, "Test");
        Assert.Equal("exists", Assert.Throws<RpcException>(() => w.M.Plan(w.ItemId, w.Lib2, "Test")).Code);
        w.M.Start(j.Id);
        j = w.Wait(j.Id);
        Assert.Equal("copied", j.Phase);
        Assert.Equal(before, Hash(j.Target));
        Assert.Equal(before, Hash(w.Game)); // original untouched
        Assert.True(File.Exists(Path.Combine(w.SteamRoot, "steamapps", "appmanifest_1145360.acf")));

        w.SteamRunning = true;
        Assert.Equal("steam-running", Assert.Throws<RpcException>(() => w.M.Switch(j.Id)).Code);
        w.SteamRunning = false;
        j = w.M.Switch(j.Id);
        Assert.Equal("switched", j.Phase);
        Assert.True(File.Exists(Path.Combine(w.Lib2, "steamapps", "appmanifest_1145360.acf")));
        Assert.True(File.Exists(Path.Combine(w.SteamRoot, "steamapps", "appmanifest_1145360.acf.nexus-moved")));
        Assert.False(File.Exists(Path.Combine(w.SteamRoot, "steamapps", "appmanifest_1145360.acf")));
        Assert.Equal(j.Target, w.Library.Get(w.ItemId)!.InstallDir);

        Assert.Equal("confirm", Assert.Throws<RpcException>(() => w.M.Finish(j.Id, false)).Code);
        w.GameRunning = true;
        Assert.Equal("busy", Assert.Throws<RpcException>(() => w.M.Finish(j.Id, true)).Code);
        w.GameRunning = false;
        j = w.M.Finish(j.Id, true);
        Assert.Equal("done", j.Phase);
        Assert.False(Directory.Exists(w.Game));
        Assert.False(File.Exists(Path.Combine(w.SteamRoot, "steamapps", "appmanifest_1145360.acf.nexus-moved")));
        Assert.Equal(before, Hash(j.Target));
    }

    [Fact]
    public void Undo_puts_everything_back_and_never_touches_the_original()
    {
        using var w = new World();
        var before = Hash(w.Game);
        var j = w.M.Plan(w.ItemId, w.Lib2, "Test");
        w.M.Start(j.Id); j = w.Wait(j.Id);
        w.M.Switch(j.Id);
        j = w.M.Undo(j.Id);
        Assert.Equal("cancelled", j.Phase);
        Assert.False(Directory.Exists(j.Target));
        Assert.False(File.Exists(Path.Combine(w.Lib2, "steamapps", "appmanifest_1145360.acf")));
        Assert.True(File.Exists(Path.Combine(w.SteamRoot, "steamapps", "appmanifest_1145360.acf")));
        Assert.Equal(w.Game, w.Library.Get(w.ItemId)!.InstallDir);
        Assert.Equal(before, Hash(w.Game));
    }

    [Fact]
    public void Checks_refuse_unsafe_moves_and_an_interrupted_or_changed_copy_is_verified_again()
    {
        using var w = new World();
        // Not enough space, game running, update pending.
        w.FreeD = 1L << 30;
        var j = w.M.Plan(w.ItemId, w.Lib2, "Test");
        Assert.Equal("no-space", Assert.Throws<RpcException>(() => w.M.Start(j.Id)).Code);
        w.FreeD = 50L << 30;
        w.GameRunning = true;
        Assert.Equal("busy", Assert.Throws<RpcException>(() => w.M.Start(j.Id)).Code);
        w.GameRunning = false;
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.M.Plan(w.ItemId, w.SteamRoot, "Test")).Code); // same drive
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.M.Plan(w.ItemId, w.D, "Test")).Code); // not a Steam library

        // Interrupted copy with a damaged file in the target: continuing fixes it (nothing is trusted unverified).
        w.M.Start(j.Id); j = w.Wait(j.Id);
        File.WriteAllText(Path.Combine(j.Target, "Content", "settings.ini"), "kaputt");
        w.M.Undo(j.Id);
        j = w.M.Plan(w.ItemId, w.Lib2, "Test");
        w.M.Start(j.Id); j = w.Wait(j.Id);
        File.WriteAllText(Path.Combine(j.Target, "Content", "settings.ini"), "kaputt");
        // The game changed after the copy (e.g. an update): switching is refused, continuing copies it again.
        Thread.Sleep(1100);
        File.WriteAllText(Path.Combine(w.Game, "Content", "settings.ini"), "fov=100");
        Assert.Equal("changed", Assert.Throws<RpcException>(() => w.M.Switch(j.Id)).Code);
        Assert.Equal("interrupted", w.M.List().Single(x => x.Id == j.Id).Phase);
        w.M.Start(j.Id); j = w.Wait(j.Id);
        Assert.Equal("copied", j.Phase);
        Assert.Equal("fov=100", File.ReadAllText(Path.Combine(j.Target, "Content", "settings.ini")));

        // Companion restarted during a copy → shown as interrupted.
        var store = Path.Combine(w.Dir.Path, "data", "moves.json");
        File.WriteAllText(store, File.ReadAllText(store).Replace("\"phase\": \"copied\"", "\"phase\": \"copying\"").Replace("\"phase\":\"copied\"", "\"phase\":\"copying\""));
        w.M = w.Make();
        Assert.Equal("interrupted", w.M.List().Single(x => x.Id == j.Id).Phase);
    }

    [Fact]
    public void Folders_with_links_are_not_moved()
    {
        using var w = new World();
        Directory.CreateSymbolicLink(Path.Combine(w.Game, "Mods"), w.Dir.Path);
        var j = w.M.Plan(w.ItemId, w.Lib2, "Test");
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.M.Start(j.Id)).Code);
    }
}
