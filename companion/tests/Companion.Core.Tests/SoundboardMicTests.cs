using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>
/// 3.59: with the soundboard in the virtual cable (the Discord way) the own voice always goes with it, the cable is never taken
/// as "microphone", and one button puts everything back to normal.
/// </summary>
public class SoundboardMicTests
{
    internal sealed class CableAudio : IAudioEngine
    {
        public List<AudioDevice> List = new()
        {
            new("spk", "Kopfhörer", "render", true, false),
            new("cable-in", "CABLE Input (VB-Audio Virtual Cable)", "render", false, true),
            new("mic", "Headset-Mikrofon", "capture", true, false),
            new("cable-out", "CABLE Output (VB-Audio Virtual Cable)", "capture", false, true),
        };
        public (bool on, string? mic, string? output)? Last;
        public bool Supported => true;
        public string? UnsupportedReason => null;
        public IReadOnlyList<AudioDevice> Devices() => List;
        public TimeSpan? Play(PlayRequest request, Action<string, string?> onEnded) => null;
        public void Stop(string playbackId) { }
        public void Pause(string playbackId) { }
        public void Resume(string playbackId) { }
        public void StopAll() { }
        public string? SetMicPassthrough(bool enabled, string? micDeviceId, string? outputDeviceId, float volume) { Last = (enabled, micDeviceId, outputDeviceId); return null; }
        public bool MicPassthroughActive => Last?.on == true;
        public float? MicLevel => null;
        public string? PlayTestTone(string? deviceId, float volume) => null;
        public Task<MicTestResult> MicTestAsync(string? deviceId, TimeSpan duration, Action<float> onLevel) => Task.FromResult(new MicTestResult(null, 0, 0, null));
        public event Action? DevicesChanged { add { } remove { } }
    }

    static AudioService Make(TempDir dir, CableAudio engine) => new(new AppPaths(dir.Path), engine, new NullHub());

    [Fact]
    public void Soundboard_into_the_cable_takes_the_own_microphone_along_even_with_the_switch_off()
    {
        using var dir = new TempDir();
        var engine = new CableAudio();
        var audio = Make(dir, engine);
        // What people did: soundboard output = CABLE Input, passthrough left off → Discord heard only the sounds.
        audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicPassthrough = false });
        Assert.Equal((true, (string?)null, (string?)"cable-in"), engine.Last); // default mic (the headset) goes into the cable
        Assert.True(AudioService.MicWanted(audio.Settings(), engine.List));
    }

    [Fact]
    public void The_cable_is_never_used_as_the_microphone()
    {
        using var dir = new TempDir();
        var engine = new CableAudio();
        // Windows' default recording device was switched to "CABLE Output" (Discord guides say so) – the cable would only hear itself.
        engine.List = engine.List.Select(d => d.Flow == "capture" ? d with { IsDefault = d.IsVirtualCable } : d).ToList();
        var audio = Make(dir, engine);
        audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicPassthrough = true });
        Assert.Equal("mic", engine.Last!.Value.mic);
        // Chosen by hand: the cable's end → the real microphone instead.
        audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicPassthrough = true, MicDeviceId = "cable-out" });
        Assert.Equal("mic", engine.Last!.Value.mic);
        Assert.Equal((false, (string?)null), AudioService.ResolveMic(new AudioSettings(), engine.List.Where(d => d.Id != "mic").ToList()));
    }

    [Fact]
    public void Switching_the_automatic_off_is_respected()
    {
        using var dir = new TempDir();
        var engine = new CableAudio();
        var audio = Make(dir, engine);
        audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicFollowsSoundboard = false });
        Assert.False(engine.Last!.Value.on);
    }

    [Fact]
    public void Reset_puts_soundboard_passthrough_and_windows_defaults_back_to_real_devices()
    {
        using var dir = new TempDir();
        var engine = new CableAudio();
        engine.List = engine.List.Select(d => d with { IsDefault = d.IsVirtualCable }).ToList(); // Windows records from and plays into the cable
        var audio = Make(dir, engine);
        audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicPassthrough = true, MicDeviceId = "mic" });
        var set = new List<string>();
        var r = System.Text.Json.JsonSerializer.SerializeToElement(audio.ResetRouting((id, flow) => { set.Add(flow + ":" + id); return null; }));
        Assert.Null(audio.Settings().OutputDeviceId);
        Assert.False(audio.Settings().MicPassthrough);
        Assert.False(engine.Last!.Value.on); // no cable in the way any more → nothing to pass through
        Assert.Equal(new[] { "capture:mic", "render:spk" }, set);
        Assert.Equal("Headset-Mikrofon", r.GetProperty("micRestored").GetString());
        Assert.Equal("Kopfhörer", r.GetProperty("outRestored").GetString());
    }
}
