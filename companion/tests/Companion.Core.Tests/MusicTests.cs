using Pgl.Core.Platform;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class MusicTests
{
    static short[] Tone(double amp, int n = 4800) => Enumerable.Range(0, n).Select(i => (short)(Math.Sin(i * 0.2) * amp * 32767)).ToArray();

    sealed class FakeLoopback : IAudioLoopback
    {
        public Action<short[], int, int>? Chunk;
        public int Starts, Stops;
        public bool Supported => true;
        public string? UnsupportedReason => null;
        public IDisposable Start(Action<short[], int, int> onChunk) { Starts++; Chunk = onChunk; return new Stop(this); }
        sealed class Stop(FakeLoopback f) : IDisposable { public void Dispose() => f.Stops++; }
    }

    [Fact]
    public void Silence_has_no_level_and_no_beat_while_loud_hits_over_a_quiet_bed_are_beats()
    {
        var d = new BeatDetector();
        Assert.Equal((0.0, false), d.Feed(new short[4800]));
        // A steady quiet bed, then a hit: beat. The same loud level again right away is no new beat.
        for (var i = 0; i < 40; i++) d.Feed(Tone(0.05)); // the average settles first
        var (level, beat) = d.Feed(Tone(0.6));
        Assert.True(beat);
        Assert.InRange(level, 0.9, 1.0);
        Assert.False(d.Feed(Tone(0.6)).beat);
        // Steady loud sound without hits stops being a beat once the average catches up.
        for (var i = 0; i < 40; i++) d.Feed(Tone(0.6));
        Assert.False(d.Feed(Tone(0.6)).beat);
    }

    [Fact]
    public void Music_is_reported_while_sound_plays_and_ends_after_the_silence_timeout_without_recording_anything()
    {
        var now = new DateTime(2026, 11, 2, 12, 0, 0, DateTimeKind.Utc);
        var sent = new List<(bool playing, double level)>();
        var fake = new FakeLoopback();
        using var m = new MusicActivity(fake, o => { var t = o.GetType(); sent.Add(((bool)t.GetProperty("playing")!.GetValue(o)!, (double)t.GetProperty("level")!.GetValue(o)!)); }, () => now);
        Assert.False(m.Running);
        m.Start(); m.Start(); // idempotent
        Assert.Equal(1, fake.Starts);
        // Silence says nothing at all.
        fake.Chunk!(new short[4800], 24000, 2);
        Assert.Empty(sent);
        Assert.False(m.Playing);
        // Music: reported with its level.
        fake.Chunk!(Tone(0.3), 24000, 2);
        Assert.True(m.Playing);
        Assert.Contains(sent, s => s.playing && s.level > 0.5);
        // Short gap: still playing. Long gap: the next silent chunk ends it with one "not playing" message.
        now += TimeSpan.FromSeconds(2);
        fake.Chunk!(new short[4800], 24000, 2);
        Assert.True(m.Playing);
        now += TimeSpan.FromSeconds(2);
        fake.Chunk!(new short[4800], 24000, 2);
        Assert.False(m.Playing);
        Assert.False(sent.Last().playing);
        // Stopping the island stops the listening completely.
        m.Stop();
        Assert.Equal(1, fake.Stops);
        Assert.False(m.Running);
    }

    [Fact]
    public void Without_audio_support_nothing_listens()
    {
        using var m = new MusicActivity(NullAudioLoopback.Instance, _ => { });
        m.Start();
        Assert.False(m.Running);
        Assert.False(m.Supported);
    }
}
