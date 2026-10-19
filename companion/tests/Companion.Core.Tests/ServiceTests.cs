using System.IO.Compression;
using System.Net;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class LaunchValidatorTests
{
    [Theory]
    [InlineData(LaunchSource.Steam, "730", true)]
    [InlineData(LaunchSource.Steam, "730; calc", false)]
    [InlineData(LaunchSource.Steam, "steam://run/730", false)]
    [InlineData(LaunchSource.Epic, "fn:4fe75bbc5a674f4f9b356b5c90567da5:Fortnite", true)]
    [InlineData(LaunchSource.Epic, "a b", false)]
    [InlineData(LaunchSource.AppsFolder, "Microsoft.624F8B84B80_8wekyb3d8bbwe!Forzahorizon5", true)]
    [InlineData(LaunchSource.AppsFolder, "..\\..\\evil", false)]
    [InlineData(LaunchSource.AppsFolder, "x\" & calc", false)]
    [InlineData(LaunchSource.Exe, "relative\\game.exe", false)]
    public void Targets(LaunchSource source, string target, bool valid) =>
        Assert.Equal(valid, LaunchValidator.ValidateTarget(source, target) == null);

    [Fact]
    public void Args_limits()
    {
        Assert.Null(LaunchValidator.ValidateArgs("-fullscreen -w 1920"));
        Assert.NotNull(LaunchValidator.ValidateArgs(new string('a', 501)));
        Assert.NotNull(LaunchValidator.ValidateArgs("a\nb"));
    }

    [Fact]
    public void Argument_splitting_never_uses_a_shell()
    {
        Assert.Equal(new[] { "-a", "b c", "", "d" }, ArgSplitter.Split("-a \"b c\" \"\" d"));
        Assert.Equal(new[] { "&&", "calc" }, ArgSplitter.Split("&& calc")); // passed as plain arguments, not interpreted
    }
}

public class DetectionTests
{
    const string LibraryVdf = """
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"apps" { "730" "123" }
	}
	"1" { "path" "D:\\SteamLibrary" }
}
""";

    [Fact]
    public void Parses_libraryfolders_with_escapes()
    {
        var v = Vdf.Parse(LibraryVdf).Child("libraryfolders")!;
        Assert.Equal(@"C:\Program Files (x86)\Steam", v.Child("0")!.Str("path"));
        Assert.Equal(@"D:\SteamLibrary", v.Child("1")!.Str("path"));
    }

    [Fact]
    public void Manifest_only_reports_fully_installed_games()
    {
        string Acf(string flags, string name = "Counter-Strike 2", string id = "730") => $"\"AppState\"\n{{\n\"appid\" \"{id}\"\n\"name\" \"{name}\"\n\"installdir\" \"Counter-Strike Global Offensive\"\n\"StateFlags\" \"{flags}\"\n}}";
        var ok = SteamDetector.ParseManifest(Acf("4"), "/lib/steamapps")!;
        Assert.Equal("730", ok.Target);
        Assert.Equal(LaunchSource.Steam, ok.Source);
        Assert.EndsWith(Path.Combine("common", "Counter-Strike Global Offensive"), ok.InstallDir);
        Assert.Null(SteamDetector.ParseManifest(Acf("1026"), "/lib/steamapps")); // update required / downloading
        Assert.Null(SteamDetector.ParseManifest(Acf("4", "Steamworks Common Redistributables", "228980"), "/x"));
    }

    [Fact]
    public void Steam_detector_scans_a_library()
    {
        using var dir = new TempDir();
        var apps = Directory.CreateDirectory(Path.Combine(dir.Path, "steamapps")).FullName;
        File.WriteAllText(Path.Combine(apps, "libraryfolders.vdf"), "\"libraryfolders\" { }");
        File.WriteAllText(Path.Combine(apps, "appmanifest_570.acf"), "\"AppState\" { \"appid\" \"570\" \"name\" \"Dota 2\" \"installdir\" \"dota 2 beta\" \"StateFlags\" \"4\" }");
        File.WriteAllText(Path.Combine(apps, "appmanifest_1.acf"), "kaputt {{{");
        var found = new SteamDetector(new[] { dir.Path }).Detect().ToList();
        Assert.Single(found);
        Assert.Equal("Dota 2", found[0].Name);
    }

    [Fact]
    public void Epic_manifest()
    {
        var json = """{"DisplayName":"Rocket League","AppName":"Sugar","CatalogNamespace":"9773aa1aa54f4f7b80e44bef04986cea","CatalogItemId":"530145df28a24424923f5828cc9031a1","InstallLocation":"C:\\Games\\rocketleague","LaunchExecutable":"Binaries\\Win64\\RocketLeague.exe"}""";
        var d = EpicDetector.ParseManifest(json)!;
        Assert.Equal("9773aa1aa54f4f7b80e44bef04986cea:530145df28a24424923f5828cc9031a1:Sugar", d.Target);
        Assert.Equal(new[] { "RocketLeague" }, d.ProcessNames);
        Assert.Null(EpicDetector.ParseManifest("""{"DisplayName":"x","AppName":"y","CatalogNamespace":"a","CatalogItemId":"b","bIsIncompleteInstall":true}"""));
    }

    [Fact]
    public void Running_detection_by_name_and_install_dir()
    {
        var sep = Path.DirectorySeparatorChar;
        var root = sep + "games" + sep + "Valorant";
        var item = new LibraryItem { ProcessNames = { "VALORANT-Win64-Shipping" }, InstallDir = root };
        Assert.True(SessionTracker.IsRunning(item, new(StringComparer.OrdinalIgnoreCase) { "valorant-win64-shipping" }, new()));
        Assert.True(SessionTracker.IsRunning(new LibraryItem { InstallDir = root }, new(), new() { root + sep + "bin" + sep + "game" }));
        Assert.False(SessionTracker.IsRunning(new LibraryItem { InstallDir = root }, new(), new() { root + "2" + sep + "game" }));
    }
}

public class HotkeyTests
{
    [Theory]
    [InlineData("ctrl + alt + f9", "Ctrl+Alt+F9")]
    [InlineData("Strg+Umschalt+s", "Ctrl+Shift+S")]
    [InlineData("alt+ctrl+1", "Ctrl+Alt+1")]
    [InlineData("F13", "F13")]
    [InlineData("Num5", "Num5")]
    [InlineData("a", null)]
    [InlineData("Ctrl+A+B", null)]
    [InlineData("Ctrl+Foo", null)]
    public void Normalize(string input, string? expected) => Assert.Equal(expected, HotkeyService.Normalize(input));

    [Fact]
    public async Task Conflicts_and_reserved_combinations_are_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("hotkeys.save", new { keys = "Ctrl+Alt+F9", enabled = true, action = new { type = "stopAllSounds" } });
        Assert.Equal("conflict", await admin.Error("hotkeys.save", new { keys = "ctrl+alt+F9", enabled = true, action = new { type = "stopAllSounds" } }));
        Assert.Equal("conflict", await admin.Error("hotkeys.save", new { keys = "Alt+Tab", enabled = true, action = new { type = "stopAllSounds" } }));
        Assert.Equal("invalid-params", await admin.Error("hotkeys.save", new { keys = "x", enabled = true, action = new { type = "stopAllSounds" } }));
        var list = await admin.Ok("hotkeys.list");
        Assert.False(list.GetProperty("supported").GetBoolean()); // honest on the headless platform
        Assert.Equal("error", list.GetProperty("hotkeys")[0].GetProperty("status").GetProperty("state").GetString());
    }
}

public class AudioTests
{
    [Fact]
    public void Formats_are_detected_by_content()
    {
        byte[] Pad(params byte[] b) => b.Concat(new byte[16]).ToArray();
        Assert.Equal("mp3", AudioFileValidator.Detect(Pad((byte)'I', (byte)'D', (byte)'3')));
        Assert.Equal("mp3", AudioFileValidator.Detect(Pad(0xFF, 0xFB)));
        Assert.Equal("wav", AudioFileValidator.Detect(Encoding.ASCII.GetBytes("RIFF\0\0\0\0WAVEfmt ")));
        Assert.Equal("ogg", AudioFileValidator.Detect(Pad((byte)'O', (byte)'g', (byte)'g', (byte)'S')));
        Assert.Null(AudioFileValidator.Detect(Encoding.ASCII.GetBytes("<html><body>nope</body>")));
        Assert.NotNull(AudioFileValidator.Problem("ogg"));
        Assert.Null(AudioFileValidator.Problem("mp3"));
    }

    [Theory]
    [InlineData("10.0.0.1", true)]
    [InlineData("192.168.178.20", true)]
    [InlineData("172.20.1.1", true)]
    [InlineData("127.0.0.1", true)]
    [InlineData("169.254.1.1", true)]
    [InlineData("::1", true)]
    [InlineData("fd00::1", true)]
    [InlineData("1.1.1.1", false)]
    [InlineData("172.32.0.1", false)]
    public void Imports_cannot_reach_the_local_network(string ip, bool isPrivate) =>
        Assert.Equal(isPrivate, SoundboardService.IsPrivate(IPAddress.Parse(ip)));

    [Fact]
    public async Task Upload_validates_and_detects_duplicates()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var wav = Encoding.ASCII.GetBytes("RIFF\x24\0\0\0WAVEfmt ").Concat(new byte[200]).ToArray();
        async Task<Pgl.Core.Tests.TestClient> Upload(byte[] data, string name, bool ok)
        {
            var id = (await admin.Ok("sounds.uploadBegin", new { name, size = data.Length })).GetProperty("uploadId").GetString();
            await admin.Ok("sounds.uploadChunk", new { uploadId = id, data = Convert.ToBase64String(data) });
            if (ok) await admin.Ok("sounds.uploadEnd", new { uploadId = id });
            else Assert.NotEqual("", await admin.Error("sounds.uploadEnd", new { uploadId = id }));
            return admin;
        }
        await Upload(wav, "boom.wav", true);
        await Upload(wav, "boom-copy.wav", false);                                  // duplicate
        await Upload(Encoding.ASCII.GetBytes("<html>not audio</html>xxxx"), "fake.mp3", false); // invalid content
        Assert.Single(s.Soundboard.Get().Sounds);
        Assert.Equal("boom", s.Soundboard.Get().Sounds[0].Name);
        Assert.Equal("audio", await admin.Error("sounds.play", new { id = s.Soundboard.Get().Sounds[0].Id })); // no audio engine on this platform – reported, not faked
        Assert.Equal("too-large", await admin.Error("sounds.uploadBegin", new { name = "x", size = 50_000_000 }));
    }

    [Fact]
    public async Task Url_import_rejects_local_network_targets()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var ex = await Assert.ThrowsAsync<RpcException>(() => s.Soundboard.ImportUrl("http://127.0.0.1:8787/x.mp3", null));
        Assert.Equal("download-failed", ex.Code);
        Assert.Equal("invalid-url", (await Assert.ThrowsAsync<RpcException>(() => s.Soundboard.ImportUrl("file:///etc/passwd", null))).Code);
    }
}

public class AutomationTests
{
    [Fact]
    public async Task Profile_activation_rule_cannot_switch_profiles()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("conflict", await admin.Error("automations.save", new { name = "Loop", trigger = "profileActivated", actions = new[] { new { type = "activateProfile", @ref = "prof_quiet" } } }));
    }

    [Fact]
    public async Task Contradicting_rules_are_detected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("automations.save", new { name = "A", trigger = "gameStarted", triggerRef = "g1", actions = new[] { new { type = "activateProfile", @ref = "prof_competitive" } } });
        Assert.Equal("conflict", await admin.Error("automations.save", new { name = "B", trigger = "gameStarted", triggerRef = "g1", actions = new[] { new { type = "activateProfile", @ref = "prof_quiet" } } }));
    }

    [Fact]
    public async Task Automation_actions_do_not_trigger_further_automations()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Automations.Save(new AutomationRule { Name = "Start→Competitive", Trigger = TriggerType.CompanionStarted, Actions = { new ActionStep { Type = StepType.ActivateProfile, Ref = "prof_competitive" } } });
        s.Automations.Save(new AutomationRule { Name = "Profil→Hinweis", Trigger = TriggerType.ProfileActivated, Actions = { new ActionStep { Type = StepType.Notify, Ref = "x" } } });
        await s.Automations.Fire(TriggerType.CompanionStarted, null);
        var rules = s.Automations.List();
        Assert.Equal(1, rules.First(r => r.Name == "Start→Competitive").RunCount);
        Assert.Equal(0, rules.First(r => r.Name == "Profil→Hinweis").RunCount); // nested trigger suppressed
        Assert.Equal("prof_competitive", s.Profiles.Get().ActiveProfileId);
    }

    [Fact]
    public async Task Rule_has_cooldown()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Automations.Save(new AutomationRule { Name = "N", Trigger = TriggerType.GameStarted, Actions = { new ActionStep { Type = StepType.Notify, Ref = "x" } } });
        await s.Automations.Fire(TriggerType.GameStarted, "g");
        await s.Automations.Fire(TriggerType.GameStarted, "g");
        Assert.Equal(1, s.Automations.List().First(r => r.Name == "N").RunCount);
    }

    [Fact]
    public async Task Game_session_switches_profile_and_back()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var item = new LibraryItem { Id = "item_g", Name = "Shooter", Kind = ItemKind.Game, ProcessNames = { "shooter" }, ProfileId = "prof_competitive" };
        s.Library.Import(new LibraryFile { Items = { item } });
        var procs = new FakeProcesses();
        var tracker = new SessionTracker(s.Library, procs, s.Settings);
        var started = new List<string>();
        tracker.Started += (i, _) => { started.Add(i.Id); };
        procs.Names = new() { "shooter" };
        tracker.Tick();
        Assert.Equal(new[] { "item_g" }, started);
        Assert.Single(tracker.Running());
        procs.Names = new();
        tracker.Tick();
        Assert.Empty(tracker.Running());
        await Task.CompletedTask;
    }

    sealed class FakeProcesses : IProcessSource
    {
        public List<string> Names = new();
        public IReadOnlyList<ProcessInfo> Snapshot() => Names.Select((n, i) => new ProcessInfo(i, n, null)).ToList();
    }
}

public class StorageAndBackupTests
{
    [Fact]
    public void Corrupt_json_does_not_crash_and_is_kept_for_diagnosis()
    {
        using var dir = new TempDir();
        var file = Path.Combine(dir.Path, "x.json");
        File.WriteAllText(file, "{ kaputt");
        var store = new JsonStore<Settings>(file);
        Assert.Equal(8787, store.Snapshot().Port);
        Assert.Single(Directory.GetFiles(dir.Path, "x.json.corrupt-*"));
    }

    [Fact]
    public async Task Backup_roundtrip_excludes_secrets_and_devices()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await Fixtures.PairedDevice(s, admin);
        s.Settings.SaveSecurity(new SettingsService.SecurityUpdate { RelaySecret = "super-secret-relay-key-123456" }, s.Platform.Secrets);
        await admin.Ok("quick.save", new { name = "Abend", steps = new[] { new { type = "stopAllSounds" } } });
        var zip = s.Backup.CreateZip(includeSounds: true);
        var text = string.Join("\n", ZipFile.OpenRead(zip).Entries.Select(e => { using var r = new StreamReader(e.Open()); return e.FullName + r.ReadToEnd(); }));
        Assert.DoesNotContain("super-secret-relay-key", text);
        Assert.DoesNotContain("keyProtected", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("devices.json", text);

        var v = BackupService.ValidateFile(zip);
        Assert.Contains("quickactions", v.Parts.Keys);
        s.QuickActions.Remove(s.QuickActions.List()[0].Id);
        var id = UploadFile(s, zip);
        s.Backup.Restore(id, new[] { "quickactions" });
        Assert.Equal("Abend", s.QuickActions.List().Single().Name);
        Assert.NotEmpty(Directory.GetFiles(s.Paths.BackupsDir, "vor-wiederherstellung-*.zip"));
    }

    [Fact]
    public void Remote_restore_cannot_release_programs_or_change_the_relay()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var zip = s.Backup.CreateZip(includeSounds: false);
        // Library: only at the PC itself.
        var ex = Assert.Throws<Pgl.Core.Rpc.RpcException>(() => s.Backup.Restore(UploadFile(s, zip), new[] { "library" }, fromThisPc: false));
        Assert.Equal("local-only", ex.Code);
        // Settings from a backup never set the relay address (it receives the relay secret).
        var crafted = s.Settings.Get();
        crafted.RelayEnabled = true;
        crafted.RelayUrl = "wss://evil.example";
        crafted.RelayCompanionId = "x";
        s.Settings.Import(crafted, s.Settings.Get());
        Assert.False(s.Settings.Get().RelayEnabled);
        Assert.Null(s.Settings.Get().RelayUrl);
    }

    internal static string UploadFile(CompanionServices s, string path)
    {
        var bytes = File.ReadAllBytes(path);
        var id = s.Backup.UploadBegin(bytes.Length);
        s.Backup.UploadChunk(id, Convert.ToBase64String(bytes));
        return id;
    }

    [Fact]
    public void Damaged_or_malicious_backups_are_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var notZip = Path.Combine(dir.Path, "a.zip");
        File.WriteAllText(notZip, "hello");
        Assert.Equal("invalid-backup", Assert.Throws<RpcException>(() => BackupService.ValidateFile(notZip)).Code);

        var good = s.Backup.CreateZip(false);
        var evil = Path.Combine(dir.Path, "evil.zip");
        File.Copy(good, evil);
        using (var z = ZipFile.Open(evil, ZipArchiveMode.Update))
        {
            var e = z.CreateEntry("sounds/../../evil.exe");
            using var w = new StreamWriter(e.Open());
            w.Write("MZ");
        }
        Assert.Equal("invalid-backup", Assert.Throws<RpcException>(() => BackupService.ValidateFile(evil)).Code);

        var badLib = Path.Combine(dir.Path, "badlib.zip");
        File.Copy(good, badLib);
        using (var z = ZipFile.Open(badLib, ZipArchiveMode.Update))
        {
            z.GetEntry("library.json")!.Delete();
            var e = z.CreateEntry("library.json");
            using var w = new StreamWriter(e.Open());
            w.Write("""{"items":[{"id":"x","name":"Hack","source":"steam","target":"730 & calc"}]}""");
        }
        Assert.Equal("invalid-backup", Assert.Throws<RpcException>(() => BackupService.ValidateFile(badLib)).Code);
        // Nothing was changed by the failed validations.
        Assert.Empty(s.Library.List());
    }
}
