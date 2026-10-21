using System.IO.Compression;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class VaultTests
{
    sealed class World : IDisposable
    {
        public readonly TempDir Dir = new();
        public readonly CompanionServices S;
        public readonly SaveVaultService V;
        public readonly HashSet<string> Running = new();
        public DateTime Now = new(2026, 10, 21, 12, 0, 0, DateTimeKind.Utc);
        public string User => Path.Combine(Dir.Path, "user");
        public string Steam => Path.Combine(Dir.Path, "steam");
        public World()
        {
            S = Fixtures.Services(Dir);
            var env = new VaultEnv(new[] { Path.Combine(User, "Documents"), Path.Combine(User, "Saved Games"), Path.Combine(User, "AppData", "Roaming") }, new[] { Steam });
            V = new SaveVaultService(new AppPaths(Path.Combine(Dir.Path, "vaultdata")), S.Library, id => Running.Contains(id), new NullHub(), () => env, () => Now = Now.AddSeconds(1));
        }
        public string Write(string path, string text) { Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllText(path, text); return path; }
        public void Dispose() { S.DisposeAsync().AsTask().Wait(); Dir.Dispose(); }
    }

    [Fact]
    public void Only_sure_places_are_suggested_and_only_allowed_areas_accepted()
    {
        using var w = new World();
        var hades = w.S.Library.AddSteam("1145360", "Hades");
        var cloud = Path.Combine(w.Steam, "userdata", "4711", "1145360", "remote");
        w.Write(Path.Combine(cloud, "Profile1.sav"), "a");
        w.Write(Path.Combine(w.User, "Saved Games", "Hades", "x.sav"), "b");
        w.Write(Path.Combine(w.User, "Saved Games", "Hades II", "y.sav"), "c");    // other game – not suggested
        w.Write(Path.Combine(w.User, "Documents", "My Games", "Hades", "z.sav"), "d");
        var s = w.V.Suggest(hades.Id);
        Assert.Equal(3, s.Count);
        Assert.Contains(s, x => x.Source == "steam-cloud" && x.Path == cloud);
        Assert.DoesNotContain(s, x => x.Path.Contains("Hades II"));

        // A device may take a suggestion, but no typed path; the PC may type a path in an allowed area.
        Assert.Equal("steam-cloud", w.V.Add(hades.Id, "saves", cloud, null, atPc: false).Source);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => w.V.Add(hades.Id, "saves", Path.Combine(w.User, "Saved Games", "Hades II"), null, atPc: false)).Code);
        Assert.Equal("manual", w.V.Add(null, "saves", Path.Combine(w.User, "Saved Games", "Hades II"), null, atPc: true).Source);
        Assert.Equal("same-name", w.V.Add(hades.Id, "saves", Path.Combine(w.User, "Saved Games", "Hades"), null, atPc: true).Source); // suggestion taken at the PC keeps its origin
        Assert.Equal("exists", Assert.Throws<RpcException>(() => w.V.Add(hades.Id, "saves", cloud, null, atPc: true)).Code);
        // Never outside the allowed areas, never browsers/Windows, never links.
        Assert.Null(w.V.Allowed(w.Dir.Path));
        Assert.Null(w.V.Allowed("/etc"));
        Assert.Null(w.V.Allowed(Path.Combine(w.User, "AppData", "Roaming", "Microsoft", "Credentials")));
        Assert.Null(w.V.Allowed(Path.Combine(w.User, "AppData", "Roaming", "Mozilla", "Firefox")));
        Assert.Null(w.V.Allowed(Path.Combine(w.User, "Documents", "..", "..", "secret")));
        var link = Path.Combine(w.User, "Documents", "Link");
        Directory.CreateSymbolicLink(link, w.Dir.Path);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.V.Add(null, "saves", link, null, atPc: true)).Code);
    }

    [Fact]
    public void Backup_check_preview_and_restore_with_a_safety_copy()
    {
        using var w = new World();
        var game = w.S.Library.AddSteam("1145360", "Hades");
        var dir = Path.Combine(w.User, "Saved Games", "Hades");
        w.Write(Path.Combine(dir, "Profile1.sav"), "level 1");
        w.Write(Path.Combine(dir, "sub", "opts.cfg"), "vsync=1");
        var loc = w.V.Add(game.Id, "saves", dir, null, atPc: false);
        var b1 = w.V.Backup(loc.Id, "Test")!;
        Assert.Equal(2, b1.Files);
        Assert.Null(w.V.Backup(loc.Id, "gleich", skipUnchanged: true)); // nothing changed → no new backup
        Assert.True(w.V.Verify(loc.Id, b1.Name).Ok);

        // Play on: one file changes, one new file appears, one is deleted.
        File.WriteAllText(Path.Combine(dir, "Profile1.sav"), "level 7");
        File.SetLastWriteTimeUtc(Path.Combine(dir, "Profile1.sav"), DateTime.UtcNow.AddHours(1));
        w.Write(Path.Combine(dir, "Profile2.sav"), "new");
        File.Delete(Path.Combine(dir, "sub", "opts.cfg"));
        var p = JsonSerializer.SerializeToElement(w.V.Preview(loc.Id, b1.Name), Json.Options);
        Assert.Equal("Profile1.sav", p.GetProperty("changed")[0].GetProperty("path").GetString());
        Assert.True(p.GetProperty("changed")[0].GetProperty("currentIsNewer").GetBoolean());
        Assert.Equal("sub/opts.cfg", p.GetProperty("back")[0].GetString());
        Assert.Equal("Profile2.sav", p.GetProperty("removed")[0].GetString());

        // Not while the game runs.
        w.Running.Add(game.Id);
        Assert.Equal("busy", Assert.Throws<RpcException>(() => w.V.Restore(loc.Id, b1.Name)).Code);
        w.Running.Clear();

        // Keep only 1: the safety copy must not delete the backup being restored.
        w.V.Configure(loc.Id, null, null, 1);
        var r = JsonSerializer.SerializeToElement(w.V.Restore(loc.Id, b1.Name), Json.Options);
        Assert.Equal("level 1", File.ReadAllText(Path.Combine(dir, "Profile1.sav")));
        Assert.Equal("vsync=1", File.ReadAllText(Path.Combine(dir, "sub", "opts.cfg")));
        Assert.False(File.Exists(Path.Combine(dir, "Profile2.sav")));
        Assert.False(Directory.Exists(dir + ".nexus-neu"));
        Assert.False(Directory.Exists(dir + ".nexus-alt"));
        // The state before the restore was saved and can be brought back.
        var safety = r.GetProperty("safety").GetString()!;
        Assert.Contains(w.V.Backups(loc.Id), b => b.Name == safety && b.Reason.StartsWith("Vor dem Wiederherstellen"));
        w.V.Restore(loc.Id, safety);
        Assert.Equal("level 7", File.ReadAllText(Path.Combine(dir, "Profile1.sav")));
        Assert.True(File.Exists(Path.Combine(dir, "Profile2.sav")));
    }

    [Fact]
    public void Broken_backups_are_found_and_never_restored()
    {
        using var w = new World();
        var dir = Path.Combine(w.User, "Saved Games", "Celeste");
        w.Write(Path.Combine(dir, "0.celeste"), "progress");
        var loc = w.V.Add(null, "saves", dir, "Celeste", atPc: true);
        var b = w.V.Backup(loc.Id, "x")!;
        var zipPath = Path.Combine(w.Dir.Path, "vaultdata", "savevault", loc.Id, b.Name);
        using (var z = ZipFile.Open(zipPath, ZipArchiveMode.Update))
        {
            z.GetEntry("0.celeste")!.Delete();
            using var sw = new StreamWriter(z.CreateEntry("0.celeste").Open());
            sw.Write("tampered");
        }
        var v = w.V.Verify(loc.Id, b.Name);
        Assert.False(v.Ok);
        Assert.Contains("Beschädigt: 0.celeste", v.Problems);
        Assert.Equal("broken", Assert.Throws<RpcException>(() => w.V.Restore(loc.Id, b.Name)).Code);
        Assert.Equal("progress", File.ReadAllText(Path.Combine(dir, "0.celeste")));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.V.Restore(loc.Id, "../../x.zip")).Code);
    }

    [Fact]
    public void Automatic_rules_after_play_and_daily_and_old_backups_are_removed()
    {
        using var w = new World();
        var game = w.S.Library.AddSteam("504230", "Celeste");
        var dir = Path.Combine(w.User, "Saved Games", "Celeste");
        w.Write(Path.Combine(dir, "0.celeste"), "1");
        var loc = w.V.Add(game.Id, "saves", dir, null, atPc: false);
        w.V.AfterPlay(game.Id);
        w.V.AfterPlay(game.Id); // unchanged → no second backup
        Assert.Single(w.V.Backups(loc.Id));
        w.V.Configure(loc.Id, "Celeste Saves", "daily", 3);
        for (var i = 2; i < 8; i++) { File.WriteAllText(Path.Combine(dir, "0.celeste"), i.ToString()); w.Now = w.Now.AddDays(1); w.V.Daily(); }
        Assert.Equal(3, w.V.Backups(loc.Id).Count);
        File.WriteAllText(Path.Combine(dir, "0.celeste"), "x");
        w.V.Daily(); // newest is younger than a day → nothing
        Assert.Equal(3, w.V.Backups(loc.Id).Count);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.V.Configure(loc.Id, null, "hourly", null)).Code);
    }

    [Fact]
    public void Configuration_versions_compare_settings_and_restore()
    {
        using var w = new World();
        var cfg = w.Write(Path.Combine(w.User, "Documents", "My Games", "Skyrim", "Skyrim.ini"), "[Display]\nfov=90\nvsync=1\n; comment\n[Audio]\nvolume=0.8\n");
        var loc = w.V.Add(null, "config", cfg, null, atPc: true);
        var v1 = w.V.Backup(loc.Id, "Vorher")!;
        File.WriteAllText(cfg, "[Display]\nfov=105\n[Audio]\nvolume=0.8\nmusic=0.2\n");
        var d = JsonSerializer.SerializeToElement(w.V.Diff(loc.Id, v1.Name, "current"), Json.Options);
        Assert.Equal("keys", d.GetProperty("mode").GetString());
        var ch = d.GetProperty("changes").EnumerateArray().Select(x => $"{x.GetProperty("kind").GetString()}:{x.GetProperty("key").GetString()}").ToList();
        Assert.Equal(new[] { "added:Audio.music", "changed:Display.fov", "removed:Display.vsync" }, ch);
        w.V.Restore(loc.Id, v1.Name);
        Assert.Contains("fov=90", File.ReadAllText(cfg));

        var json = w.Write(Path.Combine(w.User, "AppData", "Roaming", "Game", "settings.json"), "{\"gfx\":{\"res\":\"1080p\",\"hdr\":false}}");
        var jl = w.V.Add(null, "config", json, null, atPc: true);
        var j1 = w.V.Backup(jl.Id, "a")!;
        File.WriteAllText(json, "{\"gfx\":{\"res\":\"1440p\",\"hdr\":false}}");
        var jd = JsonSerializer.SerializeToElement(w.V.Diff(jl.Id, j1.Name, "current"), Json.Options);
        Assert.Equal("gfx.res", jd.GetProperty("changes")[0].GetProperty("key").GetString());
        Assert.Equal("1440p", jd.GetProperty("changes")[0].GetProperty("new").GetString());

        var txt = w.Write(Path.Combine(w.User, "Documents", "notes.txt"), "line one\nline two\nline three\n");
        var tl = w.V.Add(null, "config", txt, null, atPc: true);
        var t1 = w.V.Backup(tl.Id, "a")!;
        File.WriteAllText(txt, "line one\nline 2\nline three\n");
        var td = JsonSerializer.SerializeToElement(w.V.Diff(tl.Id, t1.Name, "current"), Json.Options);
        Assert.Equal("lines", td.GetProperty("mode").GetString());
        var kinds = td.GetProperty("lines").EnumerateArray().Select(x => x.GetProperty("kind").GetString() + ":" + x.GetProperty("text").GetString()).ToList();
        Assert.Contains("del:line two", kinds);
        Assert.Contains("add:line 2", kinds);
        // Only settings files.
        var exe = w.Write(Path.Combine(w.User, "Documents", "game.exe"), "MZ");
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.V.Add(null, "config", exe, null, atPc: true)).Code);
    }

    [Fact]
    public async Task Rights_view_cannot_back_up_or_restore()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal(0, (await viewer.Ok("vault.list")).GetProperty("locations").GetArrayLength());
        Assert.Equal("forbidden", await viewer.Error("vault.backup", new { id = "sv_x" }));
        Assert.Equal("forbidden", await viewer.Error("vault.restore", new { id = "sv_x", backup = "20260101-000000-000.zip" }));
        Assert.Equal("forbidden", await viewer.Error("vault.add", new { kind = "saves", path = "/tmp" }));
        Assert.Equal("not-found", await admin.Error("vault.backup", new { id = "sv_missing" }));
    }
}
