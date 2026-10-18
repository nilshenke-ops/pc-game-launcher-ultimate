using Pgl.Core.Models;

namespace Pgl.Core.Tests;

public class HiddenTests
{
    static DetectedItem Steam(string id, string name) => new("steam:" + id, ItemKind.Game, name, LaunchSource.Steam, id, null, new(), null, "Steam", false);

    [Fact]
    public void Removed_synced_game_stays_removed_until_uninstalled()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var installed = new List<DetectedItem> { Steam("252950", "Rocket League"), Steam("3527290", "PEAK") };
        Assert.Equal((2, 0), s.Library.ReconcileSteam(installed));
        var rl = s.Library.List().Single(i => i.Target == "252950");
        Assert.True(s.Library.Remove(rl.Id));
        Assert.Equal((0, 0), s.Library.ReconcileSteam(installed)); // not added back by the next sync
        Assert.DoesNotContain(s.Library.List(), i => i.Target == "252950");

        // Uninstalled → forgotten; installing it again adds it again.
        s.Library.ReconcileSteam(installed.Skip(1).ToList());
        Assert.Equal((1, 0), s.Library.ReconcileSteam(installed));
    }
}

public class AudioFormTests
{
    [Fact]
    public async Task Test_tone_checks_the_chosen_device_and_mic_test_is_honest_without_audio()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        // Generic platform has no audio engine: the device check fails first (no devices), the mic test reports "unsupported".
        Assert.Equal("Das gewählte Ausgabegerät ist nicht angeschlossen.", s.Audio.TestTone("output", "{abc}", 50));
        var admin = await Fixtures.Admin(s);
        var err = await admin.Error("audio.micTest", new { deviceId = "" });
        Assert.Equal("unsupported", err);
    }
}

public class SecurityCheckTests
{
    [Fact]
    public async Task Diagnostics_contains_security_checks_from_real_configuration()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var r = await admin.Ok("diagnostics.run");
        var areas = r.GetProperty("checks").EnumerateArray().GroupBy(c => c.GetProperty("area").GetString()!).ToDictionary(g => g.Key, g => g.First().GetProperty("status").GetString());
        Assert.Equal("warn", areas["sec-secrets"]);   // generic platform: no OS encryption – reported honestly
        Assert.Equal("ok", areas["sec-admin"]);       // no paired device with admin rights yet
        Assert.Equal("ok", areas["sec-updates"]);     // official source by default
    }
}

public class HotkeyHardwareTests
{
    [Theory]
    [InlineData("mouse4", "Mouse4")]
    [InlineData("Maus5", "Mouse5")]
    [InlineData("ctrl + mouse4", "Ctrl+Mouse4")]
    [InlineData("F13", "F13")]
    [InlineData("alt+ctrl+1", "Ctrl+Alt+1")]
    public void Gaming_mouse_buttons_and_extra_keys_are_accepted(string input, string expected) =>
        Assert.Equal(expected, Pgl.Core.Services.HotkeyService.Normalize(input));

    [Fact]
    public void Plain_letters_stay_refused() => Assert.Null(Pgl.Core.Services.HotkeyService.Normalize("Q"));
}
