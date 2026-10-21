using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Privacy button (what it really did, other devices paused, everything put back) and game state snapshots.</summary>
public class StateTests
{
    sealed class MicAudio : IAudioEngine
    {
        public bool Passthrough = true, Muted;
        public int StopAllCalls;
        public bool Supported => true;
        public string? UnsupportedReason => null;
        public IReadOnlyList<AudioDevice> Devices() => new[] { new AudioDevice("mic1", "Headset-Mikrofon", "capture", true, false) };
        public TimeSpan? Play(PlayRequest request, Action<string, string?> onEnded) => null;
        public void Stop(string playbackId) { }
        public void Pause(string playbackId) { }
        public void Resume(string playbackId) { }
        public void StopAll() => StopAllCalls++;
        public string? SetMicPassthrough(bool enabled, string? micDeviceId, string? outputDeviceId, float volume) { Passthrough = enabled; return null; }
        public bool MicPassthroughActive => Passthrough;
        public float? MicLevel => null;
        public string? PlayTestTone(string? deviceId, float volume) => null;
        public Task<MicTestResult> MicTestAsync(string? deviceId, TimeSpan duration, Action<float> onLevel) => Task.FromResult(new MicTestResult(null, 0, 0, null));
        public event Action? DevicesChanged { add { } remove { } }
        public bool MicMuteSupported => true;
        public IReadOnlyList<string> MuteDefaultMics() { if (Muted) return Array.Empty<string>(); Muted = true; return new[] { "mic1" }; }
        public void UnmuteMics(IEnumerable<string> ids) { if (ids.Contains("mic1")) Muted = false; }
    }

    static string Status(System.Text.Json.JsonElement st, string id) =>
        st.GetProperty("results").EnumerateArray().Single(r => r.GetProperty("id").GetString() == id).GetProperty("status").GetString()!;

    [Fact]
    public async Task Privacy_button_does_only_the_chosen_steps_pauses_other_devices_and_puts_everything_back()
    {
        using var dir = new TempDir();
        var audio = new MicAudio();
        await using var s = new CompanionServices(new GenericPlatform { Audio = audio }, new AppPaths(dir.Path), new Pgl.Core.Hosting.WebAssets(dir.Path));
        s.Audio.Update(a => { a.MicPassthrough = true; a.MicDeviceId = "mic1"; });
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var (phone, phoneId, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });
        var (tablet, tabletId, tabletToken) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });

        Assert.Equal("forbidden", await viewer.Error("privacy.on"));
        Assert.Equal("forbidden", await phone.Error("privacy.configure", new { muteMic = true }));
        await admin.Ok("privacy.configure", new { stopSounds = true, stopMicPassthrough = true, muteMic = true, quietNotifications = true, quietCategories = new[] { "deal", "bogus" }, pauseOtherDevices = true, hideSensitive = true });
        Assert.Equal(new[] { "deal" }, s.Privacy.Config.QuietCategories); // unknown categories are dropped

        var pushed = 0; var desktop = 0;
        s.Notifications.Created += _ => pushed++;
        s.Notifications.OnDesktop = _ => desktop++;

        var on = await phone.Ok("privacy.on");
        Assert.True(on.GetProperty("active").GetBoolean());
        Assert.Equal("done", Status(on, "sounds"));
        Assert.Equal(1, audio.StopAllCalls);
        Assert.Equal("active", Status(on, "passthrough"));
        Assert.False(audio.Passthrough);
        Assert.Equal("active", Status(on, "mic"));
        Assert.True(audio.Muted);
        Assert.Equal("active", Status(on, "devices"));
        Assert.Equal("info", Status(on, "note")); // says honestly what is not covered

        // Other devices are signed out (still paired) and refused until it is switched off; the PC and the phone stay.
        Assert.Single(tablet.Channel.Events("auth.paused"));
        Assert.Single(viewer.Channel.Events("auth.paused"));
        Assert.Empty(phone.Channel.Events("auth.paused"));
        Assert.Equal("unauthenticated", await tablet.Error("library.list"));
        Assert.Equal("paused", await Relogin(s, tabletId, tabletToken));
        await phone.Ok("library.list");
        await admin.Ok("library.list");

        // Settings changes or a plugged-in mic do not bring the passthrough back while active.
        s.Audio.ApplyMic();
        Assert.False(audio.Passthrough);

        // Quiet categories: no push and no Windows pop-up, but still stored; other categories as usual.
        s.Notifications.Push("deal:1", Severity.Warning, "Angebot");
        Assert.Equal((0, 0), (pushed, desktop));
        Assert.Contains(s.Notifications.List(), n => n.Key == "deal:1");
        s.Notifications.Push("plugin:x", Severity.Warning, "Plugin");
        Assert.Equal((1, 1), (pushed, desktop));

        var off = await phone.Ok("privacy.off");
        Assert.False(off.GetProperty("active").GetBoolean());
        Assert.False(audio.Muted);       // unmuted because this mode muted it
        Assert.True(audio.Passthrough);  // back to what the audio settings say
        Assert.Null(await Relogin(s, tabletId, tabletToken));
    }

    [Fact]
    public async Task Privacy_button_never_claims_what_this_companion_cannot_do()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("privacy.configure", new { stopSounds = true, stopMicPassthrough = true, muteMic = true, quietNotifications = false, pauseOtherDevices = false, hideSensitive = true });
        var on = await admin.Ok("privacy.on");
        Assert.Equal("unsupported", Status(on, "sounds"));
        Assert.Equal("unsupported", Status(on, "passthrough"));
        Assert.Equal("unsupported", Status(on, "mic"));
        Assert.Equal("active", Status(on, "hide"));
        Assert.DoesNotContain(on.GetProperty("results").EnumerateArray(), r => r.GetProperty("id").GetString() is "notifications" or "devices");
        Assert.True((await admin.Ok("privacy.status")).GetProperty("hideSensitive").GetBoolean());
        // Muted mics are only unmuted when this mode muted them – nothing else is touched.
        var st = s.Privacy.State;
        Assert.Empty(st.MutedMics);
    }

    static async Task<string?> Relogin(CompanionServices s, string deviceId, string token)
    {
        var c = new TestClient(s.Rpc);
        var hello = await c.Ok("hello");
        var r = await c.Call("auth.login", new { deviceId, proof = Fixtures.Proof(token, hello.GetProperty("nonce").GetString()!) });
        return r.GetProperty("ok").GetBoolean() ? null : r.GetProperty("e").GetProperty("code").GetString();
    }

    // ------------------------------------------------------------------ game state snapshots

    sealed class World : IDisposable
    {
        public readonly TempDir Dir = new();
        public readonly CompanionServices S;
        public readonly SaveVaultService V;
        public readonly ModService M;
        public readonly GameStateService G;
        public readonly HashSet<string> Running = new();
        public readonly string Ini, Game, ItemId = "item_sk";
        public World()
        {
            S = Fixtures.Services(Dir);
            var user = Path.Combine(Dir.Path, "user");
            var env = new VaultEnv(new[] { Path.Combine(user, "Documents") }, Array.Empty<string>());
            var paths = new AppPaths(Path.Combine(Dir.Path, "statedata"));
            Game = Directory.CreateDirectory(Path.Combine(Dir.Path, "Games", "Skyrim")).FullName;
            Directory.CreateDirectory(Path.Combine(Game, "Mods"));
            File.WriteAllText(Path.Combine(Game, "Mods", "SkyUI.esp"), "x");
            File.WriteAllText(Path.Combine(Game, "Mods", "Hair.esp"), "y");
            S.Library.Import(new LibraryFile { Items = { new LibraryItem { Id = ItemId, Name = "Skyrim", Kind = ItemKind.Game, Source = LaunchSource.Exe, Target = "x", InstallDir = Game, Args = "-windowed" } } });
            V = new SaveVaultService(paths, S.Library, id => Running.Contains(id), new NullHub(), () => env);
            var transfer = new TransferService(paths, new GenericPlatform(), new NullHub());
            M = new ModService(paths, S.Library, transfer, id => Running.Contains(id), new NullHub());
            M.Configure(ItemId, "Mods");
            Ini = Path.Combine(user, "Documents", "My Games", "Skyrim", "Skyrim.ini");
            Directory.CreateDirectory(Path.GetDirectoryName(Ini)!);
            File.WriteAllText(Ini, "[Display]\nfov=90\nvsync=1\n");
            V.Add(ItemId, "config", Ini, "Skyrim.ini", atPc: true);
            G = new GameStateService(paths, new GenericPlatform(), S.Library, V, M, () => S.Profiles.Get(), () => new() { ("de.pgl.x", "1.0.0", true) }, id => Running.Contains(id), new NullHub());
        }
        public void Dispose() { S.DisposeAsync().AsTask().Wait(); Dir.Dispose(); }
    }

    [Fact]
    public void Snapshot_records_the_game_state_compares_and_restores_after_saving_the_current_state()
    {
        using var w = new World();
        var snap = w.G.Create(w.ItemId, "Vor Grafik-Tuning", "Test");
        Assert.Equal("-windowed", snap.Args);
        Assert.Equal(2, snap.Mods!.Count);
        Assert.Equal(64, w.G.List(w.ItemId).Single().Configs.Single().Sha!.Length);
        Assert.Single(snap.Plugins);

        // Change things the snapshot covers.
        File.WriteAllText(w.Ini, "[Display]\nfov=110\nshadows=ultra\n");
        w.S.Library.UpdateTarget(w.ItemId, null, "-dx12", null);
        w.S.Library.UpdateMetadata(new LibraryService.MetadataUpdate { Id = w.ItemId, ProfileId = "prof_competitive" });
        w.M.Toggle(w.ItemId, "Hair.esp", false);

        var diff = System.Text.Json.JsonSerializer.SerializeToElement(w.G.Diff(snap.Id, "current"), Json.Options);
        var changes = diff.GetProperty("changes").EnumerateArray().Select(c => $"{c.GetProperty("area").GetString()}|{c.GetProperty("key").GetString()}").ToList();
        Assert.Contains("Start|Startargumente", changes);
        Assert.Contains("Start|Gaming-Profil", changes);
        Assert.Contains("Konfiguration|Skyrim.ini", changes);
        Assert.Contains("Mods|Hair.esp", changes);
        var keys = diff.GetProperty("files")[0].GetProperty("diff").GetProperty("changes").EnumerateArray().Select(c => c.GetProperty("key").GetString()).ToList();
        Assert.Contains("Display.fov", keys);
        Assert.Contains("Display.shadows", keys);

        // Not while the game runs – nothing changed.
        w.Running.Add(w.ItemId);
        Assert.Equal("busy", Assert.Throws<RpcException>(() => w.G.Restore(snap.Id, "Test")).Code);
        Assert.Contains("fov=110", File.ReadAllText(w.Ini));
        w.Running.Clear();

        var r = System.Text.Json.JsonSerializer.SerializeToElement(w.G.Restore(snap.Id, "Test"), Json.Options);
        Assert.True(r.GetProperty("ok").GetBoolean());
        Assert.Equal("[Display]\nfov=90\nvsync=1\n", File.ReadAllText(w.Ini));
        var item = w.S.Library.Get(w.ItemId)!;
        Assert.Equal("-windowed", item.Args);
        Assert.Null(item.ProfileId);
        Assert.True(File.Exists(Path.Combine(w.Game, "Mods", "Hair.esp")));
        // The state before restoring was saved as its own snapshot – going back is possible.
        var safety = w.G.List(w.ItemId).Single(x => x.Id == r.GetProperty("safety").GetString());
        Assert.StartsWith("Vor dem Wiederherstellen", safety.Reason);
        Assert.Equal("-dx12", safety.Args);
        Assert.Contains(safety.Mods!, m => m.Name == "Hair.esp" && !m.Enabled);
        // The restore is documented in the snapshot.
        Assert.Single(w.G.List(w.ItemId).Single(x => x.Id == snap.Id).Restores);
    }

    [Fact]
    public void Damaged_copies_missing_files_and_removed_mods_are_reported_and_never_written()
    {
        using var w = new World();
        var snap = w.G.Create(w.ItemId, "x", "Test");
        File.WriteAllText(w.Ini, "fov=120\n");
        var copy = Path.Combine(w.Dir.Path, "statedata", "gamestate", snap.Id, snap.Configs[0].Copy!);
        File.WriteAllText(copy, "manipuliert");
        File.Delete(Path.Combine(w.Game, "Mods", "SkyUI.esp"));
        var r = System.Text.Json.JsonSerializer.SerializeToElement(w.G.Restore(snap.Id, "Test"), Json.Options);
        Assert.False(r.GetProperty("ok").GetBoolean());
        var steps = r.GetProperty("steps").EnumerateArray().Select(x => (x.GetProperty("status").GetString(), x.GetProperty("detail").GetString()!)).ToList();
        Assert.Contains(steps, x => x.Item1 == "error" && x.Item2.Contains("beschädigt"));
        Assert.Contains(steps, x => x.Item1 == "warn" && x.Item2.Contains("SkyUI.esp"));
        Assert.Contains(steps, x => x.Item1 == "info" && x.Item2.Contains("Spielstände"));
        Assert.Equal("fov=120\n", File.ReadAllText(w.Ini));

        // A file missing at snapshot time is recorded as such and not deleted later.
        File.Delete(w.Ini);
        var empty = w.G.Create(w.ItemId, "ohne Datei", "Test");
        Assert.Equal("Datei fehlte zu diesem Zeitpunkt.", empty.Configs[0].Problem);
        File.WriteAllText(w.Ini, "fov=70\n");
        w.G.Restore(empty.Id, "Test");
        Assert.Equal("fov=70\n", File.ReadAllText(w.Ini));
    }

    [Fact]
    public void Old_snapshots_are_removed_with_their_files_and_automatic_ones_are_throttled()
    {
        using var w = new World();
        for (var i = 0; i < GameStateService.KeepPerGame + 2; i++) w.G.Create(w.ItemId, $"#{i}", "Test");
        Assert.Equal(GameStateService.KeepPerGame, w.G.List(w.ItemId).Count);
        Assert.Equal(GameStateService.KeepPerGame, Directory.GetDirectories(Path.Combine(w.Dir.Path, "statedata", "gamestate")).Length);
        var before = w.G.List(w.ItemId).Count;
        w.G.Before(w.ItemId, "Vor Mod-Installation"); // last one is seconds old – no extra snapshot
        Assert.Equal(before, w.G.List(w.ItemId).Count);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => w.G.Restore("../../etc", "Test")).Code);
    }
}
