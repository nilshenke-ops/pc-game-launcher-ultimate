using System.Collections.Concurrent;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Soundboard playback with WASAPI (shared mode). Each sound gets its own output stream; Windows mixes them.
/// Discord workflow: soundboard output = virtual cable input, microphone passthrough copies the mic into the
/// same cable, Discord uses the cable output as its microphone. No driver is installed by this program.
/// </summary>
public sealed class NAudioEngine : IAudioEngine
{
    static readonly string[] VirtualCableNames = { "CABLE Input", "CABLE Output", "VB-Audio", "VoiceMeeter", "Voicemeeter", "Virtual Audio Cable", "Hi-Fi Cable" };

    sealed class Playback
    {
        public required List<IWavePlayer> Outputs { get; init; }
        public required List<IDisposable> Readers { get; init; }
        public int Stopped;
    }

    readonly ConcurrentDictionary<string, Playback> _playing = new();
    readonly object _micLock = new();
    WasapiCapture? _micCapture;
    WasapiOut? _micOut;
    float _micPeak;

    public bool Supported => true;
    public string? UnsupportedReason => null;

    static MMDeviceEnumerator Enumerator() => new();

    public IReadOnlyList<AudioDevice> Devices()
    {
        var list = new List<AudioDevice>();
        using var en = Enumerator();
        foreach (var (flow, name) in new[] { (DataFlow.Render, "render"), (DataFlow.Capture, "capture") })
        {
            string? defaultId = null;
            try { if (en.HasDefaultAudioEndpoint(flow, Role.Multimedia)) defaultId = en.GetDefaultAudioEndpoint(flow, Role.Multimedia).ID; } catch { }
            foreach (var d in en.EnumerateAudioEndPoints(flow, DeviceState.Active))
            {
                var friendly = d.FriendlyName;
                list.Add(new AudioDevice(d.ID, friendly, name, d.ID == defaultId, VirtualCableNames.Any(v => friendly.Contains(v, StringComparison.OrdinalIgnoreCase))));
                d.Dispose();
            }
        }
        return list;
    }

    static MMDevice Device(string? id, DataFlow flow)
    {
        using var en = Enumerator();
        if (string.IsNullOrEmpty(id) || id == "default") return en.GetDefaultAudioEndpoint(flow, Role.Multimedia);
        try { return en.GetDevice(id); }
        catch { throw new InvalidOperationException("Das gewählte Audiogerät ist nicht verfügbar (nicht angeschlossen?)."); }
    }

    public TimeSpan? Play(PlayRequest r, Action<string, string?> onEnded)
    {
        var outputs = new List<IWavePlayer>();
        var readers = new List<IDisposable>();
        TimeSpan? duration = null;
        try
        {
            var main = new AudioFileReader(r.FilePath) { Volume = Math.Clamp(r.Volume, 0f, 2f) };
            readers.Add(main);
            duration = main.TotalTime;
            var mainOut = new WasapiOut(Device(r.OutputDeviceId, DataFlow.Render), AudioClientShareMode.Shared, true, 60);
            mainOut.Init(main);
            outputs.Add(mainOut);

            if (r.MonitorDeviceId != null)
            {
                var monDevice = Device(r.MonitorDeviceId, DataFlow.Render);
                var mainId = r.OutputDeviceId ?? Device(null, DataFlow.Render).ID;
                if (monDevice.ID != mainId) // monitoring on the same device would double the sound
                {
                    var mon = new AudioFileReader(r.FilePath) { Volume = Math.Clamp(r.MonitorVolume, 0f, 2f) };
                    readers.Add(mon);
                    var monOut = new WasapiOut(monDevice, AudioClientShareMode.Shared, true, 60);
                    monOut.Init(mon);
                    outputs.Add(monOut);
                }
            }
        }
        catch
        {
            foreach (var o in outputs) o.Dispose();
            foreach (var x in readers) x.Dispose();
            throw;
        }

        var pb = new Playback { Outputs = outputs, Readers = readers };
        _playing[r.PlaybackId] = pb;
        outputs[0].PlaybackStopped += (_, e) =>
        {
            Finish(r.PlaybackId);
            onEnded(r.PlaybackId, e.Exception?.Message);
        };
        foreach (var o in outputs) o.Play();
        return duration;
    }

    void Finish(string id)
    {
        if (!_playing.TryRemove(id, out var pb) || Interlocked.Exchange(ref pb.Stopped, 1) == 1) return;
        // Dispose asynchronously: disposing inside PlaybackStopped can deadlock WASAPI.
        Task.Run(() =>
        {
            foreach (var o in pb.Outputs) { try { o.Stop(); o.Dispose(); } catch { } }
            foreach (var x in pb.Readers) { try { x.Dispose(); } catch { } }
        });
    }

    public void Stop(string playbackId)
    {
        if (_playing.TryGetValue(playbackId, out var pb)) foreach (var o in pb.Outputs) try { o.Stop(); } catch { }
    }

    public void Pause(string playbackId)
    {
        if (_playing.TryGetValue(playbackId, out var pb)) foreach (var o in pb.Outputs) try { o.Pause(); } catch { }
    }

    public void Resume(string playbackId)
    {
        if (_playing.TryGetValue(playbackId, out var pb)) foreach (var o in pb.Outputs) try { o.Play(); } catch { }
    }

    public void StopAll()
    {
        foreach (var id in _playing.Keys.ToList()) Stop(id);
    }

    public bool MicPassthroughActive { get { lock (_micLock) return _micOut?.PlaybackState == PlaybackState.Playing; } }
    public float? MicLevel { get { lock (_micLock) return _micCapture == null ? null : Interlocked.Exchange(ref _micPeak, 0f); } }

    public string? SetMicPassthrough(bool enabled, string? micDeviceId, string? outputDeviceId, float volume)
    {
        lock (_micLock)
        {
            StopMic();
            if (!enabled) return null;
            try
            {
                var output = Device(outputDeviceId, DataFlow.Render);
                using (var en = Enumerator())
                    if (string.IsNullOrEmpty(outputDeviceId) || output.ID == en.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID)
                        return "Mikrofon-Durchleitung ist nur auf ein separates Ausgabegerät (virtuelles Kabel) möglich – sonst hörst du dich selbst als Echo.";
                var mic = Device(micDeviceId, DataFlow.Capture);
                var capture = new WasapiCapture(mic, true, 20);
                var buffer = new BufferedWaveProvider(capture.WaveFormat) { DiscardOnBufferOverflow = true, BufferDuration = TimeSpan.FromMilliseconds(400) };
                capture.DataAvailable += (_, e) =>
                {
                    buffer.AddSamples(e.Buffer, 0, e.BytesRecorded);
                    if (capture.WaveFormat.Encoding == WaveFormatEncoding.IeeeFloat)
                    {
                        float peak = 0;
                        for (int i = 0; i + 4 <= e.BytesRecorded; i += 4) peak = Math.Max(peak, Math.Abs(BitConverter.ToSingle(e.Buffer, i)));
                        if (peak > _micPeak) _micPeak = peak;
                    }
                };
                var volumeProvider = new VolumeSampleProvider(buffer.ToSampleProvider()) { Volume = Math.Clamp(volume, 0f, 2f) };
                var output2 = new WasapiOut(output, AudioClientShareMode.Shared, true, 40);
                output2.Init(volumeProvider);
                capture.StartRecording();
                output2.Play();
                _micCapture = capture;
                _micOut = output2;
                Log.Info("audio", $"Mikrofon-Durchleitung aktiv: {mic.FriendlyName} → {output.FriendlyName}");
                return null;
            }
            catch (Exception ex)
            {
                StopMic();
                return ex.Message;
            }
        }
    }

    void StopMic()
    {
        try { _micCapture?.StopRecording(); } catch { }
        try { _micOut?.Stop(); } catch { }
        _micCapture?.Dispose(); _micOut?.Dispose();
        _micCapture = null; _micOut = null;
    }

    public string? PlayTestTone(string? deviceId, float volume)
    {
        try
        {
            var tone = new SignalGenerator(48000, 2) { Frequency = 660, Gain = 0.25 * Math.Clamp(volume, 0f, 1f), Type = SignalGeneratorType.Sin }.Take(TimeSpan.FromMilliseconds(700));
            var output = new WasapiOut(Device(deviceId, DataFlow.Render), AudioClientShareMode.Shared, true, 60);
            output.Init(tone);
            output.PlaybackStopped += (_, _) => Task.Run(output.Dispose);
            output.Play();
            return null;
        }
        catch (Exception ex) { return "Testton fehlgeschlagen: " + ex.Message; }
    }
}
