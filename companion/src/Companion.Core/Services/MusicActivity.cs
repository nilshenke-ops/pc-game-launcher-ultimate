using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Core.Services;

/// <summary>
/// Beat and loudness of the sound the PC is playing, for the JARVIS island's dancing. Only the level of each 100 ms chunk is
/// computed – the samples are thrown away at once, nothing is recorded, stored or sent anywhere except the level number
/// to this PC's own windows. Chunks come about ten times a second; the beat is a clear rise above the recent average.
/// </summary>
public sealed class BeatDetector
{
    double _avg;
    int _sinceBeat = 99;

    /// <summary>Loudness 0..1 (RMS, boosted for display) and whether this chunk is a beat.</summary>
    public (double level, bool beat) Feed(short[] samples)
    {
        if (samples.Length == 0) return (0, false);
        double sum = 0;
        foreach (var s in samples) { var x = s / 32768.0; sum += x * x; }
        var energy = sum / samples.Length;
        var rms = Math.Sqrt(energy);
        _sinceBeat++;
        // A beat: clearly louder than the recent average, loud enough to matter, and not twice within ~300 ms.
        var beat = rms > 0.02 && energy > _avg * 1.5 && _sinceBeat >= 3;
        if (beat) _sinceBeat = 0;
        _avg = _avg * 0.9 + energy * 0.1;
        return (Math.Min(1, rms * 4), beat);
    }
}

public sealed class MusicActivity : IDisposable
{
    /// <summary>Below this loudness it counts as silence (a quiet system sound is not music).</summary>
    public const double SilenceFloor = 0.004;
    /// <summary>After this long without sound the music has stopped.</summary>
    public static readonly TimeSpan StopAfter = TimeSpan.FromSeconds(3);

    readonly IAudioLoopback _audio;
    readonly Action<object> _publish;
    readonly Func<DateTime> _now;
    readonly object _gate = new();
    readonly BeatDetector _beats = new();
    IDisposable? _capture;
    Timer? _timer;
    DateTime _lastSound = DateTime.MinValue;
    bool _playing;

    public MusicActivity(IAudioLoopback audio, Action<object> publish, Func<DateTime>? now = null)
    {
        _audio = audio; _publish = publish; _now = now ?? (() => DateTime.UtcNow);
    }

    public bool Supported => _audio.Supported;
    public bool Running => _capture != null;
    public bool Playing { get { lock (_gate) return _playing; } }

    /// <summary>Starts listening (idempotent). Only while the island is shown – otherwise nothing listens at all.</summary>
    public void Start()
    {
        lock (_gate)
        {
            if (_capture != null || !_audio.Supported) return;
            try { _capture = _audio.Start(OnChunk); }
            catch (Exception ex) { Log.Warn("island", "Musikerkennung nicht möglich: " + ex.Message); return; }
            _timer = new Timer(_ => Tick(), null, 1000, 1000);
        }
    }

    public void Stop()
    {
        bool wasPlaying;
        lock (_gate)
        {
            _timer?.Dispose(); _timer = null;
            _capture?.Dispose(); _capture = null;
            wasPlaying = _playing; _playing = false;
        }
        if (wasPlaying) _publish(new { playing = false, level = 0.0, beat = false });
    }

    void OnChunk(short[] samples, int rate, int channels)
    {
        var (level, beat) = _beats.Feed(samples);
        bool changed;
        lock (_gate)
        {
            if (level >= SilenceFloor * 4) _lastSound = _now();
            var playing = _now() - _lastSound < StopAfter;
            changed = playing != _playing;
            _playing = playing;
            if (!playing && !changed) return; // silence: say nothing
        }
        _publish(new { playing = Playing, level = Math.Round(level, 2), beat });
    }

    void Tick()
    {
        bool stopped;
        lock (_gate)
        {
            stopped = _playing && _now() - _lastSound >= StopAfter;
            if (stopped) _playing = false;
        }
        if (stopped) _publish(new { playing = false, level = 0.0, beat = false });
    }

    public void Dispose() => Stop();
}
