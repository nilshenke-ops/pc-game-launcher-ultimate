using System.IO.Compression;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class ModTests
{
    static (ModService mods, string game, string exchange, Func<bool> running, Action<bool> setRunning) Setup(TempDir dir)
    {
        var paths = new AppPaths(Path.Combine(dir.Path, "data"));
        var library = new LibraryService(paths, new GenericPlatform(), new NullHub());
        var game = Directory.CreateDirectory(Path.Combine(dir.Path, "Games", "Stardew Valley")).FullName;
        Directory.CreateDirectory(Path.Combine(game, "Mods", "ContentPatcher"));
        File.WriteAllText(Path.Combine(game, "Mods", "ContentPatcher", "manifest.json"), "{\"v\":1}");
        File.WriteAllText(Path.Combine(game, "Mods", "NPCMap.dll"), "old");
        library.Import(new LibraryFile { Items = { new LibraryItem { Id = "item_sv", Name = "Stardew Valley", Kind = ItemKind.Game, Source = LaunchSource.Exe, Target = "x", InstallDir = game } } });
        var running = false;
        var transfer = new TransferService(paths, new GenericPlatform(), new NullHub());
        Directory.CreateDirectory(paths.TransferDir);
        return (new ModService(paths, library, transfer, _ => running, new NullHub()), game, paths.TransferDir, () => running, v => running = v);
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    static void Zip(string path, params (string name, string content)[] files)
    {
        using var z = ZipFile.Open(path, ZipArchiveMode.Create);
        foreach (var (name, content) in files) using (var w = new StreamWriter(z.CreateEntry(name).Open())) w.Write(content);
    }

    [Fact]
    public void The_mods_folder_must_stay_inside_the_game()
    {
        var game = OperatingSystem.IsWindows() ? @"C:\Games\SV" : "/games/sv";
        Assert.EndsWith("Mods", ModService.Resolve(game, "Mods"));
        Assert.EndsWith(Path.Combine("BepInEx", "plugins"), ModService.Resolve(game, "BepInEx/plugins"));
        foreach (var bad in new[] { "../Windows", "Mods/../../x", "/etc", @"C:\Windows", "" })
            Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => ModService.Resolve(game, bad)).Code);
    }

    [Fact]
    public void Mods_are_switched_off_and_on_by_moving_and_never_while_the_game_runs()
    {
        using var dir = new TempDir();
        var (mods, game, _, _, setRunning) = Setup(dir);
        Assert.Equal(new[] { "Mods" }, mods.Suggest("item_sv"));
        mods.Configure("item_sv", "Mods");
        mods.Toggle("item_sv", "NPCMap.dll", false);
        Assert.False(File.Exists(Path.Combine(game, "Mods", "NPCMap.dll")));
        Assert.True(File.Exists(Path.Combine(game, "Mods.nexus-aus", "NPCMap.dll")));
        var list = J(mods.List("item_sv")).GetProperty("mods").EnumerateArray().ToDictionary(m => m.GetProperty("name").GetString()!, m => m.GetProperty("enabled").GetBoolean());
        Assert.False(list["NPCMap.dll"]);
        Assert.True(list["ContentPatcher"]);
        setRunning(true);
        Assert.Equal("busy", Assert.Throws<RpcException>(() => mods.Toggle("item_sv", "NPCMap.dll", true)).Code);
        setRunning(false);
        mods.Toggle("item_sv", "NPCMap.dll", true);
        Assert.Equal("old", File.ReadAllText(Path.Combine(game, "Mods", "NPCMap.dll")));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => mods.Toggle("item_sv", "../Stardew Valley.exe", false)).Code);
    }

    [Fact]
    public void A_zip_is_previewed_installed_with_a_backup_and_the_backup_brings_everything_back()
    {
        using var dir = new TempDir();
        var (mods, game, exchange, _, _) = Setup(dir);
        mods.Configure("item_sv", "Mods");
        Zip(Path.Combine(exchange, "update.zip"), ("NPCMap.dll", "new"), ("Automate/manifest.json", "{}"));
        var preview = J(mods.Preview("item_sv", "update.zip"));
        Assert.Equal(2, preview.GetProperty("files").GetInt32());
        Assert.Equal(new[] { "NPCMap.dll" }, preview.GetProperty("overwrite").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal("conflict", Assert.Throws<RpcException>(() => mods.Install("item_sv", "update.zip", false)).Code); // nothing overwritten without confirmation
        Assert.Equal("old", File.ReadAllText(Path.Combine(game, "Mods", "NPCMap.dll")));

        var r = J(mods.Install("item_sv", "update.zip", true));
        Assert.Equal("new", File.ReadAllText(Path.Combine(game, "Mods", "NPCMap.dll")));
        Assert.True(File.Exists(Path.Combine(game, "Mods", "Automate", "manifest.json")));
        var backup = r.GetProperty("backup").GetString()!;

        mods.Remove("item_sv", "ContentPatcher");
        Assert.False(Directory.Exists(Path.Combine(game, "Mods", "ContentPatcher")));
        mods.Restore("item_sv", backup); // state before the install
        Assert.Equal("old", File.ReadAllText(Path.Combine(game, "Mods", "NPCMap.dll")));
        Assert.True(File.Exists(Path.Combine(game, "Mods", "ContentPatcher", "manifest.json")));
        Assert.False(Directory.Exists(Path.Combine(game, "Mods", "Automate")));
        Assert.True(mods.Backups("item_sv").Count >= 3); // install, remove, restore – each saved the state before
    }

    [Fact]
    public void A_zip_that_tries_to_write_outside_the_mods_folder_is_refused_completely()
    {
        using var dir = new TempDir();
        var (mods, game, exchange, _, _) = Setup(dir);
        mods.Configure("item_sv", "Mods");
        Zip(Path.Combine(exchange, "evil.zip"), ("ok.txt", "x"), ("../../Stardew Valley.exe", "malware"));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => mods.Install("item_sv", "evil.zip", true)).Code);
        Assert.False(File.Exists(Path.Combine(game, "Stardew Valley.exe")));
        Assert.False(File.Exists(Path.Combine(game, "Mods", "ok.txt"))); // checked before anything was written
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => mods.Install("item_sv", "../data/devices.json", true)).Code);
    }

    [Fact]
    public async Task Changing_mods_needs_manage_rights()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        await viewer.Ok("mods.overview");
        Assert.Equal("forbidden", await viewer.Error("mods.configure", new { itemId = "x", modsPath = "Mods" }));
        Assert.Equal("forbidden", await viewer.Error("mods.install", new { itemId = "x", zip = "a.zip" }));
    }
}
