using System.Collections.Concurrent;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
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

    // Device notifications: Windows calls back only when something changes – no polling.
    MMDeviceEnumerator? _notifyEnumerator;
    DeviceNotifications? _notifications;
    Action? _devicesChanged;
    public event Action? DevicesChanged
    {
        add
        {
            _devicesChanged += value;
            if (_notifyEnumerator != null) return;
            try
            {
                _notifyEnumerator = new MMDeviceEnumerator();
                _notifications = new DeviceNotifications(() => _devicesChanged?.Invoke());
                _notifyEnumerator.RegisterEndpointNotificationCallback(_notifications);
            }
            catch (Exception ex) { Log.Warn("audio", "Geräte-Benachrichtigungen nicht verfügbar: " + ex.Message); }
        }
        remove => _devicesChanged -= value;
    }

    sealed class DeviceNotifications(Action changed) : IMMNotificationClient
    {
        public void OnDeviceStateChanged(string deviceId, DeviceState newState) => changed();
        public void OnDeviceAdded(string pwstrDeviceId) => changed();
        public void OnDeviceRemoved(string deviceId) => changed();
        public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId) { if (role == Role.Multimedia) changed(); }
        public void OnPropertyValueChanged(string pwstrDeviceId, PropertyKey key) { } // fires very often (volume etc.) – ignored
    }

    /// <summary>Peak level 0..1 of a capture buffer (32-bit float or 16/24/32-bit PCM).</summary>
    static float Peak(WaveFormat f, byte[] buf, int count)
    {
        float peak = 0;
        if (f.Encoding == WaveFormatEncoding.IeeeFloat || (f.Encoding == WaveFormatEncoding.Extensible && f.BitsPerSample == 32 && f is WaveFormatExtensible { SubFormat: var sf } && sf == NAudio.Dmo.AudioMediaSubtypes.MEDIASUBTYPE_IEEE_FLOAT))
            for (int i = 0; i + 4 <= count; i += 4) peak = Math.Max(peak, Math.Abs(BitConverter.ToSingle(buf, i)));
        else if (f.BitsPerSample == 16)
            for (int i = 0; i + 2 <= count; i += 2) peak = Math.Max(peak, Math.Abs(BitConverter.ToInt16(buf, i) / 32768f));
        else if (f.BitsPerSample == 24)
            for (int i = 0; i + 3 <= count; i += 3) peak = Math.Max(peak, Math.Abs(((buf[i] << 8) | (buf[i + 1] << 16) | (buf[i + 2] << 24)) / 2147483648f));
        else if (f.BitsPerSample == 32)
            for (int i = 0; i + 4 <= count; i += 4) peak = Math.Max(peak, Math.Abs(BitConverter.ToInt32(buf, i) / 2147483648f));
        return Math.Min(peak, 1f);
    }

    public async Task<MicTestResult> MicTestAsync(string? deviceId, TimeSpan duration, Action<float> onLevel)
    {
        MMDevice mic;
        try { mic = Device(deviceId, DataFlow.Capture); }
        catch (Exception ex) { return new MicTestResult(null, 0, 0, "Mikrofon nicht gefunden: " + ex.Message); }
        var name = mic.FriendlyName;
        float max = 0, sum = 0, window = 0; int n = 0;
        var last = DateTime.UtcNow;
        var gate = new object();
        WasapiCapture capture;
        try { capture = new WasapiCapture(mic, true, 50); }
        catch (Exception ex) { return new MicTestResult(name, 0, 0, "Mikrofon kann nicht geöffnet werden: " + ex.Message); }
        capture.DataAvailable += (_, e) =>
        {
            var p = Peak(capture.WaveFormat, e.Buffer, e.BytesRecorded);
            float? report = null;
            lock (gate)
            {
                max = Math.Max(max, p); window = Math.Max(window, p);
                if ((DateTime.UtcNow - last).TotalMilliseconds >= 100) { report = window; sum += window; n++; window = 0; last = DateTime.UtcNow; }
            }
            if (report is { } r) onLevel(r);
        };
        try
        {
            capture.StartRecording();
            await Task.Delay(duration);
        }
        catch (Exception ex) { return new MicTestResult(name, 0, 0, "Aufnahme fehlgeschlagen (Windows-Datenschutz → Mikrofonzugriff für Desktop-Apps prüfen): " + ex.Message); }
        finally
        {
            try { capture.StopRecording(); } catch { }
            capture.Dispose();
        }
        lock (gate) return new MicTestResult(name, max, n == 0 ? 0 : sum / n, null);
    }

    static MMDeviceEnumerator Enumerator() => new();

    public bool MicMuteSupported => true;

    public IReadOnlyList<string> MuteDefaultMics()
    {
        var muted = new List<string>();
        using var en = Enumerator();
        foreach (var role in new[] { Role.Multimedia, Role.Communications })
        {
            if (!en.HasDefaultAudioEndpoint(DataFlow.Capture, role)) continue;
            using var d = en.GetDefaultAudioEndpoint(DataFlow.Capture, role);
            if (muted.Contains(d.ID) || d.AudioEndpointVolume.Mute) continue;
            d.AudioEndpointVolume.Mute = true;
            muted.Add(d.ID);
        }
        return muted;
    }

    public void UnmuteMics(IEnumerable<string> ids)
    {
        using var en = Enumerator();
        foreach (var id in ids)
            try { using var d = en.GetDevice(id); d.AudioEndpointVolume.Mute = false; }
            catch (Exception ex) { Log.Warn("audio", $"Mikrofon {id} nicht wieder eingeschaltet: {ex.Message}"); }
    }

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
            mainOut.Init(r.Loop ? new LoopStream(main) : main);
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
                    monOut.Init(r.Loop ? new LoopStream(mon) : mon);
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
                    var peak = Peak(capture.WaveFormat, e.Buffer, e.BytesRecorded);
                    if (peak > _micPeak) _micPeak = peak;
                };
                var volumeProvider = new VolumeSampleProvider(buffer.ToSampleProvider()) { Volume = Math.Clamp(volume, 0f, 2f) };
                var output2 = new WasapiOut(output, AudioClientShareMode.Shared, true, 40);
                output2.Init(volumeProvider);
                // Microphone unplugged or failed: release both sides, so "active" is reported honestly and the
                // passthrough starts again by itself when the device is back (DevicesChanged → ApplyMic).
                capture.RecordingStopped += (_, e) =>
                {
                    if (Volatile.Read(ref _stoppingMic)) return;
                    Log.Warn("audio", "Mikrofon-Durchleitung unterbrochen" + (e.Exception != null ? ": " + e.Exception.Message : " (Mikrofon getrennt?)") + " – startet wieder, sobald das Gerät zurück ist.");
                    // No immediate restart here (a broken device would loop); Windows reports the device's return.
                    Task.Run(() => { lock (_micLock) if (_micCapture == capture) StopMic(); });
                };
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

    volatile bool _stoppingMic;

    void StopMic()
    {
        _stoppingMic = true;
        try { _micCapture?.StopRecording(); } catch { }
        try { _micOut?.Stop(); } catch { }
        _micCapture?.Dispose(); _micOut?.Dispose();
        _micCapture = null; _micOut = null;
        _stoppingMic = false;
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

/// <summary>Starts the file again from the beginning when it ends (sound with "repeat"); ends only when stopped.</summary>
sealed class LoopStream(WaveStream source) : WaveStream
{
    public override WaveFormat WaveFormat => source.WaveFormat;
    public override long Length => source.Length;
    public override long Position { get => source.Position; set => source.Position = value; }

    public override int Read(byte[] buffer, int offset, int count)
    {
        var total = 0;
        while (total < count)
        {
            var n = source.Read(buffer, offset + total, count - total);
            if (n == 0)
            {
                if (source.Position == 0) break; // empty file: never spin
                source.Position = 0;
                continue;
            }
            total += n;
        }
        return total;
    }
}
