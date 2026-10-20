using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class CaptureTests
{
    sealed class RecordingKeys : IKeySender
    {
        public List<string> Sent { get; } = new();
        public bool Supported => true;
        public Task<string?> SendAsync(string combo) { Sent.Add(combo); return Task.FromResult<string?>(null); }
    }

    sealed class KeyPlatform(IKeySender keys) : IPlatform
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
        public IKeySender KeySender => keys;
    }

    static (CaptureService svc, SettingsService settings, RecordingKeys keys, TempDir dir) Make()
    {
        var dir = new TempDir();
        var settings = new SettingsService(new AppPaths(dir.Path), new NullHub());
        var keys = new RecordingKeys();
        var platform = new KeyPlatform(keys);
        var obs = new ObsService(settings.Get, platform.Secrets, new NullHub());
        return (new CaptureService(settings.Get, settings, obs, platform), settings, keys, dir);
    }

    [Fact]
    public async Task Nvidia_and_game_bar_get_their_factory_shortcuts()
    {
        var (svc, _, keys, dir) = Make();
        using var _d = dir;
        svc.Configure("nvidia", null, null);
        Assert.Equal("Aufnahme starten/stoppen: Alt+F9 an NVIDIA App / GeForce Experience gesendet", await svc.Run("record"));
        await svc.Run("replay");
        await svc.Run("buffer");
        svc.Configure("xbox", "xbox", null);
        await svc.Run("record");
        await svc.Run("replay");
        Assert.Null(await svc.ToggleOverlay("full"));
        Assert.Equal(new[] { "Alt+F9", "Alt+F10", "Alt+Shift+F10", "Alt+Win+R", "Alt+Win+G", "Win+G" }, keys.Sent);
    }

    [Fact]
    public async Task Own_shortcuts_unsupported_actions_and_missing_keys_are_explained()
    {
        var (svc, _, keys, dir) = Make();
        using var _d = dir;
        svc.Configure("discord", null, null);
        Assert.Contains("Discord kann „Aufnahme starten/stoppen“ nicht", (await Assert.ThrowsAsync<RpcException>(() => svc.Run("record"))).Message);
        Assert.Contains("keine Taste für „Replay speichern“ eingetragen", (await Assert.ThrowsAsync<RpcException>(() => svc.Run("replay"))).Message);
        svc.Configure(null, null, new() { ["discord.replay"] = "ctrl + shift + c" });
        await svc.Run("replay");
        Assert.Equal("Ctrl+Shift+C", keys.Sent.Single());
        // Own entry, then back to the factory default (null) or explicitly none ("").
        svc.Configure("nvidia", null, new() { ["nvidia.record"] = "Ctrl+Alt+9" });
        await svc.Run("record");
        svc.Configure(null, null, new() { ["nvidia.record"] = null });
        await svc.Run("record");
        svc.Configure(null, null, new() { ["nvidia.record"] = "" });
        await Assert.ThrowsAsync<RpcException>(() => svc.Run("record"));
        Assert.Equal(new[] { "Ctrl+Shift+C", "Ctrl+Alt+9", "Alt+F9" }, keys.Sent);
    }

    [Fact]
    public async Task Programs_can_be_mixed_per_function()
    {
        using var fake = new FakeObs();
        var (svc, settings, keys, dir) = Make();
        using var _d = dir;
        settings.SetObs(fake.Url, null, true, null);
        // OBS records, Discord saves clips, the replay buffer stays with OBS (main program).
        svc.Configure("obs", null, new() { ["discord.replay"] = "Ctrl+Shift+C" }, new() { ["replay"] = "discord" });
        Assert.Equal("Aufnahme gestartet", await svc.Run("record"));
        Assert.True(fake.Recording);
        await svc.Run("replay");
        Assert.Equal("Ctrl+Shift+C", keys.Sent.Single());
        Assert.Equal("Replay-Puffer läuft", await svc.Run("buffer"));
        // Steam records, Xbox Game Bar keeps the last moments; back to "same as main program" with null.
        svc.Configure("steam", null, new() { ["steam.record"] = "Ctrl+F11" }, new() { ["replay"] = "xbox" });
        await svc.Run("record");
        await svc.Run("replay");
        Assert.Equal(new[] { "Ctrl+Shift+C", "Ctrl+F11", "Alt+Win+G" }, keys.Sent);
        svc.Configure(null, null, null, new() { ["replay"] = null });
        Assert.Equal("steam", CaptureService.ProviderFor(settings.Get(), "replay"));
        // A program that cannot do a function is refused for it.
        Assert.Throws<RpcException>(() => svc.Configure(null, null, null, new() { ["record"] = "discord" }));
        Assert.Throws<RpcException>(() => svc.Configure(null, null, null, new() { ["buffer"] = "xbox" }));
        var status = JsonSerializer.SerializeToElement(await svc.Status(), Json.Options);
        Assert.Equal("steam", status.GetProperty("effectiveProviders").GetProperty("record").GetString());
    }

    [Fact]
    public async Task A_shortcut_that_is_also_a_launcher_hotkey_is_not_sent_in_a_loop()
    {
        var (svc, _, keys, dir) = Make();
        using var _d = dir;
        svc.OwnHotkeys = () => new[] { "Alt+F9" };
        svc.Configure("nvidia", null, null);
        Assert.Contains("auch ein Hotkey des Launchers", (await Assert.ThrowsAsync<RpcException>(() => svc.Run("record"))).Message);
        Assert.Empty(keys.Sent);
    }

    [Fact]
    public void Invalid_settings_are_refused()
    {
        var (svc, _, _, dir) = Make();
        using var _d = dir;
        Assert.Throws<RpcException>(() => svc.Configure("shadowplay", null, null));
        Assert.Throws<RpcException>(() => svc.Configure(null, "obs", null)); // OBS has no overlay the launcher can open
        Assert.Throws<RpcException>(() => svc.Configure(null, null, new() { ["nvidia.record"] = "Mouse4" }));
        Assert.Throws<RpcException>(() => svc.Configure(null, null, new() { ["nvidia.fly"] = "Alt+F9" }));
        Assert.Throws<RpcException>(() => svc.Configure(null, null, new() { ["obs.record"] = "Alt+F9" }));
        Assert.Throws<RpcException>(() => svc.Configure(null, null, new() { ["nvidia.record"] = "F" })); // plain letter would break typing
    }

    [Fact]
    public async Task Without_windows_the_shortcut_is_not_pretended_to_be_sent()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        var st = await phone.Ok("capture.configure", new { provider = "xbox", overlayProvider = "xbox", keys = new Dictionary<string, string?> { ["xbox.record"] = "Win+Alt+F8" } });
        Assert.Equal("xbox", st.GetProperty("provider").GetString());
        Assert.False(st.GetProperty("canSendKeys").GetBoolean());
        var xbox = st.GetProperty("providers").EnumerateArray().First(p => p.GetProperty("id").GetString() == "xbox");
        Assert.Equal("Alt+Win+F8", xbox.GetProperty("effective").GetProperty("record").GetString());
        Assert.Equal("Alt+Win+G", xbox.GetProperty("effective").GetProperty("replay").GetString());
        Assert.Equal("forbidden", await phone.Error("capture.recordToggle"));
        var r = await admin.Call("capture.recordToggle");
        Assert.Contains("nur im Windows-Begleiter", r.GetProperty("e").GetProperty("message").GetString());
        // The step used by hotkeys goes the same way.
        var results = await s.Runner.RunAsync(new[] { new ActionStep { Type = StepType.ObsRecordToggle }, new ActionStep { Type = StepType.ToggleOverlay } }, "Test");
        Assert.All(results, x => Assert.Contains("nur im Windows-Begleiter", x));
    }
}

public class OverlayLayoutTests
{
    [Fact]
    public async Task Layout_is_saved_checked_and_reset()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        Assert.False((await phone.Ok("overlay.layout")).TryGetProperty("layout", out _)); // no own arrangement yet
        var saved = await phone.Ok("overlay.saveLayout", new { layout = new { opacity = 0.1, widgets = new object[]
        {
            new { id = "system", visible = true, x = 0.05, y = 1.7, w = 5000, h = 0 },
            new { id = "plugin:de.pgl.game-overlay:overlay", visible = false, x = 0.5, y = 0.2, w = 380, h = 300 },
        } } });
        var l = saved.GetProperty("layout");
        Assert.Equal(0.4, l.GetProperty("opacity").GetDouble());              // not invisible
        Assert.Equal(0.98, l.GetProperty("widgets")[0].GetProperty("y").GetDouble()); // stays on screen
        Assert.Equal(1600, l.GetProperty("widgets")[0].GetProperty("w").GetInt32());
        Assert.False(l.GetProperty("widgets")[1].GetProperty("visible").GetBoolean());
        Assert.Equal("invalid-params", await phone.Error("overlay.saveLayout", new { layout = new { widgets = new[] { new { id = "<script>" } } } }));
        Assert.Equal("invalid-params", await phone.Error("overlay.saveLayout", new { layout = new { widgets = new[] { new { id = "quick" }, new { id = "quick" } } } }));
        await phone.Ok("overlay.saveLayout", new { layout = (object?)null });
        Assert.Null(s.Settings.Get().OverlayLayout);
    }

    [Fact]
    public async Task Hud_layouts_are_saved_checked_applied_and_removed()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var layout = new { opacity = 0.9, widgets = new object[] { new { id = "system", visible = true, x = 0.02, y = 0.1, w = 320, h = 0 } } };
        var r = await phone.Ok("overlay.savePreset", new { id = "hud_ranked", name = "  Ranked  ", layout });
        Assert.Equal("Ranked", r.GetProperty("presets")[0].GetProperty("name").GetString());
        await phone.Ok("overlay.savePreset", new { id = "hud_ranked", name = "Ranked 2", layout }); // same id replaces
        Assert.Single(s.Settings.Get().OverlayPresets);
        Assert.Equal("invalid-params", await phone.Error("overlay.savePreset", new { id = "../x", name = "A", layout }));
        Assert.Equal("invalid-params", await phone.Error("overlay.savePreset", new { id = "hud_x", name = "A", layout = new { widgets = new[] { new { id = "<b>" } } } }));
        Assert.Equal("forbidden", await viewer.Error("overlay.savePreset", new { id = "hud_v", name = "A", layout }));
        for (var i = 0; i < 9; i++) await phone.Ok("overlay.savePreset", new { id = $"hud_n{i}", name = $"N{i}", layout });
        Assert.Equal("limit", await phone.Error("overlay.savePreset", new { id = "hud_eleven", name = "Elf", layout }));
        // Apply = a copy on the live overlay; changing the overlay later leaves the saved one as it is.
        var applied = await phone.Ok("overlay.applyPreset", new { id = "hud_ranked" });
        Assert.Equal("system", applied.GetProperty("layout").GetProperty("widgets")[0].GetProperty("id").GetString());
        await phone.Ok("overlay.saveLayout", new { layout = new { opacity = 0.5, widgets = Array.Empty<object>() } });
        Assert.Single(s.Settings.Get().OverlayPresets.First(p => p.Id == "hud_ranked").Layout.Widgets);
        Assert.Equal("not-found", await phone.Error("overlay.applyPreset", new { id = "hud_missing" }));
        Assert.True((await phone.Ok("overlay.removePreset", new { id = "hud_ranked" })).GetBoolean());
        Assert.Equal(9, (await viewer.Ok("overlay.presets")).GetProperty("presets").GetArrayLength());
    }
}
