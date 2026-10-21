using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public static class AudioFileValidator
{
    public const long MaxBytes = 20 * 1024 * 1024;
    public static readonly string[] Playable = { "mp3", "wav", "flac", "m4a", "wma" };

    /// <summary>Detects the format from the file header (magic bytes), never from the file name alone.</summary>
    public static string? Detect(ReadOnlySpan<byte> h)
    {
        if (h.Length < 12) return null;
        if (h[0] == 'I' && h[1] == 'D' && h[2] == '3') return "mp3";
        if (h[0] == 0xFF && (h[1] & 0xE0) == 0xE0) return "mp3";
        if (h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' && h[8] == 'W' && h[9] == 'A' && h[10] == 'V' && h[11] == 'E') return "wav";
        if (h[0] == 'f' && h[1] == 'L' && h[2] == 'a' && h[3] == 'C') return "flac";
        if (h[0] == 'O' && h[1] == 'g' && h[2] == 'g' && h[3] == 'S') return "ogg";
        if (h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p') return "m4a";
        if (h[0] == 0x30 && h[1] == 0x26 && h[2] == 0xB2 && h[3] == 0x75) return "wma";
        return null;
    }

    public static string? Problem(string? format) => format switch
    {
        null => "Keine unterstützte Audiodatei (erkannt werden MP3, WAV, FLAC, M4A/AAC, WMA).",
        "ogg" => "OGG/Opus kann Windows ohne Zusatzcodecs nicht abspielen. Bitte als MP3 oder WAV speichern.",
        _ => null,
    };
}

public sealed class AudioService
{
    readonly JsonStore<AudioSettings> _store;
    readonly IAudioEngine _engine;
    readonly IHub _hub;
    Timer? _levelTimer;

    public AudioService(AppPaths paths, IAudioEngine engine, IHub hub)
    {
        _store = new JsonStore<AudioSettings>(paths.File("audio.json"));
        _engine = engine;
        _hub = hub;
    }

    public IAudioEngine Engine => _engine;
    public AudioSettings Settings() => _store.Snapshot();

    public IReadOnlyList<AudioDevice> Devices()
    {
        try { return _engine.Devices(); }
        catch (Exception ex) { Log.Warn("audio", $"Geräteliste nicht verfügbar: {ex.Message}"); return Array.Empty<AudioDevice>(); }
    }

    public object State()
    {
        var s = Settings();
        var devices = Devices();
        return new
        {
            supported = _engine.Supported,
            unsupportedReason = _engine.UnsupportedReason,
            settings = s,
            devices,
            virtualCable = devices.FirstOrDefault(d => d.IsVirtualCable && d.Flow == "render"),
            micPassthroughActive = _engine.MicPassthroughActive,
            missing = MissingDevices(s, devices),
        };
    }

    public static List<string> MissingDevices(AudioSettings s, IReadOnlyList<AudioDevice> devices)
    {
        var ids = devices.Select(d => d.Id).ToHashSet();
        var missing = new List<string>();
        if (s.OutputDeviceId != null && !ids.Contains(s.OutputDeviceId)) missing.Add("Soundboard-Ausgabe");
        if (s.MonitorEnabled && s.MonitorDeviceId != null && !ids.Contains(s.MonitorDeviceId)) missing.Add("Monitoring-Gerät");
        if (s.MicPassthrough && s.MicDeviceId != null && !ids.Contains(s.MicDeviceId)) missing.Add("Mikrofon");
        return missing;
    }

    public AudioSettings Save(AudioSettings u)
    {
        u.SoundboardVolume = Math.Clamp(u.SoundboardVolume, 0, 100);
        u.MonitorVolume = Math.Clamp(u.MonitorVolume, 0, 100);
        u.MicVolume = Math.Clamp(u.MicVolume, 0, 200);
        u.MaxConcurrent = Math.Clamp(u.MaxConcurrent, 1, 16);
        if (u.PlayMode is not ("overlap" or "queue" or "replace")) u.PlayMode = "overlap";
        var before = Settings();
        _store.Replace(u);
        // Restarting the mic passthrough causes a short dropout in Discord – only do it when mic settings changed.
        var err = MicChanged(before, u) ? ApplyMic() : null;
        _hub.Changed("audio");
        if (err != null) throw new RpcException("audio", "Gespeichert, aber Mikrofon-Durchleitung fehlgeschlagen: " + err);
        return u;
    }

    static bool MicChanged(AudioSettings a, AudioSettings b) =>
        a.MicPassthrough != b.MicPassthrough || a.MicDeviceId != b.MicDeviceId || a.MicVolume != b.MicVolume || a.OutputDeviceId != b.OutputDeviceId;

    public void Update(Action<AudioSettings> change)
    {
        var before = Settings();
        _store.Update(change);
        if (MicChanged(before, Settings())) ApplyMic();
        _hub.Changed("audio");
    }

    /// <summary>While true (privacy mode) the mic passthrough stays off, even after settings or device changes.</summary>
    public Func<bool> MicSuppressed { get; set; } = () => false;
    public bool MicPassthroughActive => _engine.MicPassthroughActive;

    public string? ApplyMic()
    {
        var s = Settings();
        var err = _engine.SetMicPassthrough(s.MicPassthrough && !MicSuppressed(), s.MicDeviceId, s.OutputDeviceId, s.MicVolume / 100f);
        if (err == null && s.MicPassthrough && !MicSuppressed() && _engine.Supported)
            _levelTimer ??= new Timer(_ =>
            {
                // Only sent to devices that have the Audio Center open (audio.subscribe) – nothing goes out otherwise.
                var level = _engine.MicLevel;
                if (level != null) _hub.BroadcastTo(x => x.Authenticated && x.Subscriptions.Contains(LevelTopic), "audio.level", new { mic = Math.Round(level.Value, 3) });
            }, null, 250, 250);
        else { _levelTimer?.Dispose(); _levelTimer = null; }
        if (err != null) Log.Warn("audio", err);
        return err;
    }

    public const string LevelTopic = "audio.level";

    /// <summary>Plays a short tone. <paramref name="deviceId"/>/<paramref name="volume"/> come from the form (not saved yet);
    /// without them the saved settings are used. "" = Windows default device.</summary>
    public string? TestTone(string target, string? deviceId = null, int? volume = null)
    {
        var s = Settings();
        var device = deviceId ?? (target == "monitor" ? s.MonitorDeviceId : s.OutputDeviceId);
        if (device == "") device = null;
        if (device != null && Devices().All(d => d.Id != device || d.Flow != "render")) return "Das gewählte Ausgabegerät ist nicht angeschlossen.";
        var vol = Math.Clamp(volume ?? (target == "monitor" ? s.MonitorVolume : s.SoundboardVolume), 0, 100) / 100f;
        return _engine.PlayTestTone(device, vol);
    }

    int _micTest;

    /// <summary>Records the microphone for 4 seconds; the level goes live only to the requesting device. Nothing is stored.</summary>
    public async Task<object> MicTest(RpcSession session, string? deviceId)
    {
        if (!_engine.Supported) throw new RpcException("unsupported", _engine.UnsupportedReason ?? "Audio wird auf diesem System nicht unterstützt.");
        if (deviceId == "") deviceId = null;
        if (deviceId != null && Devices().All(d => d.Id != deviceId || d.Flow != "capture")) throw new RpcException("not-found", "Das gewählte Mikrofon ist nicht angeschlossen.");
        if (Interlocked.Exchange(ref _micTest, 1) == 1) throw new RpcException("busy", "Es läuft bereits ein Mikrofon-Test.");
        try
        {
            var r = await _engine.MicTestAsync(deviceId, TimeSpan.FromSeconds(4), level => _hub.SendTo(session, "audio.micTest", new { level = Math.Round(level, 3) }));
            if (r.Error != null) throw new RpcException("audio", r.Error);
            // Thresholds: below -50 dBFS (0.003) is practically silence; above 0.98 the signal clips.
            var verdict = r.Peak < 0.003f ? "silent" : r.Peak < 0.05f ? "quiet" : r.Peak >= 0.98f ? "clipping" : "ok";
            return new { device = r.Device, peak = Math.Round(r.Peak, 3), average = Math.Round(r.Average, 3), verdict };
        }
        finally { Volatile.Write(ref _micTest, 0); }
    }

    Timer? _deviceDebounce;
    string _lastMissing = "";

    /// <summary>Reacts to devices being plugged in/removed (Windows notification, debounced): refreshes the UI, warns once per
    /// change about missing saved devices and restarts the mic passthrough when its devices are back.</summary>
    public void WatchDevices(Action<IReadOnlyList<string>> missingChanged)
    {
        if (!_engine.Supported) return;
        _lastMissing = string.Join("|", MissingDevices(Settings(), Devices())); // the start-up check already warned about these
        _engine.DevicesChanged += () =>
        {
            lock (this)
            {
                _deviceDebounce?.Dispose();
                _deviceDebounce = new Timer(_ =>
                {
                    try
                    {
                        _hub.Changed("audio");
                        var s = Settings();
                        var missing = MissingDevices(s, Devices());
                        var key = string.Join("|", missing);
                        if (key != _lastMissing)
                        {
                            _lastMissing = key;
                            if (missing.Count > 0) missingChanged(missing);
                            else if (s.MicPassthrough && !_engine.MicPassthroughActive) ApplyMic(); // device is back
                        }
                    }
                    catch (Exception ex) { Log.Warn("audio", ex.Message); }
                }, null, 1500, Timeout.Infinite);
            }
        };
    }

    public List<object> Diagnose()
    {
        var r = new List<object>();
        void Add(string id, string label, string status, string detail) => r.Add(new { id, label, status, detail });
        if (!_engine.Supported)
        {
            Add("engine", "Audio-Engine", "unsupported", _engine.UnsupportedReason ?? "Nicht unterstützt");
            return r;
        }
        var s = Settings();
        var devices = Devices();
        var renders = devices.Where(d => d.Flow == "render").ToList();
        var captures = devices.Where(d => d.Flow == "capture").ToList();
        Add("output", "Ausgabegeräte", renders.Count > 0 ? "ok" : "error", renders.Count > 0 ? $"{renders.Count} gefunden, Standard: {renders.FirstOrDefault(d => d.IsDefault)?.Name ?? "keins"}" : "Kein Ausgabegerät gefunden.");
        Add("mic", "Mikrofon", captures.Count > 0 ? "ok" : "warn", captures.Count > 0 ? $"{captures.Count} gefunden, Standard: {captures.FirstOrDefault(d => d.IsDefault)?.Name ?? "keins"}" : "Kein Mikrofon erkannt (Datenschutzeinstellungen von Windows prüfen).");
        var cable = renders.FirstOrDefault(d => d.IsVirtualCable);
        Add("cable", "Virtuelles Audiokabel", cable != null ? "ok" : "warn", cable != null ? $"Gefunden: {cable.Name}" : "Nicht installiert. Ohne virtuelles Kabel hören andere in Discord die Sounds nicht.");
        var outName = s.OutputDeviceId == null ? "Windows-Standard" : devices.FirstOrDefault(d => d.Id == s.OutputDeviceId)?.Name;
        Add("route", "Soundboard-Ausgabe", outName == null ? "error" : "ok", outName == null ? "Gewähltes Gerät fehlt." : outName);
        if (cable != null)
        {
            var routed = s.OutputDeviceId == cable.Id;
            Add("discord", "Discord-Weg", routed && s.MicPassthrough ? "ok" : "warn",
                routed ? (s.MicPassthrough ? "Sounds + Mikrofon gehen in das virtuelle Kabel. In Discord als Eingabegerät „" + cable.Name.Replace("Input", "Output") + "“ wählen." : "Mikrofon-Durchleitung ist aus – in Discord wäre nur der Sound hörbar, nicht deine Stimme.")
                       : "Soundboard-Ausgabe ist nicht das virtuelle Kabel – Sounds sind nur lokal hörbar.");
        }
        Add("discord-check", "Hören andere Teilnehmer den Sound?", "untested", "Kann der Companion nicht prüfen: das hängt von den Discord-Einstellungen ab. Bitte mit einer zweiten Person oder dem Discord-Mikrofontest prüfen.");
        foreach (var m in MissingDevices(s, devices)) Add("missing-" + m, m, "error", "Das gespeicherte Gerät ist nicht angeschlossen.");
        return r;
    }

    internal AudioSettings Export() => Settings();
    internal void Import(AudioSettings s) { _store.Replace(s); ApplyMic(); _hub.Changed("audio"); }
}

public sealed class SoundboardService
{
    readonly JsonStore<SoundsFile> _store;
    readonly AppPaths _paths;
    readonly AudioService _audio;
    readonly IHub _hub;
    readonly HttpClient _http;
    readonly Dictionary<string, (string soundId, string name, DateTime startedAt, double? durationMs, bool paused)> _playing = new();
    readonly Queue<string> _queue = new();
    readonly Dictionary<string, (string name, string path, long expected, long received, DateTime started)> _uploads = new();
    readonly object _lock = new();
    public event Action<Sound>? Played;

    public SoundboardService(AppPaths paths, AudioService audio, IHub hub, HttpClient? http = null)
    {
        _store = new JsonStore<SoundsFile>(paths.File("sounds.json"));
        _paths = paths;
        _audio = audio;
        _hub = hub;
        _http = http ?? new HttpClient(new SocketsHttpHandler { ConnectCallback = SafeConnect, AllowAutoRedirect = true, MaxAutomaticRedirections = 3 }) { Timeout = TimeSpan.FromSeconds(20) };
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PCGameLauncherUltimate/1.0 (+soundboard import)");
    }

    public SoundsFile Get() => _store.Snapshot();

    public object Playing()
    {
        lock (_lock) return new { playing = _playing.Select(kv => new { playbackId = kv.Key, kv.Value.soundId, kv.Value.name, kv.Value.startedAt, kv.Value.durationMs, kv.Value.paused }).ToList(), queued = _queue.Count };
    }

    void PublishPlaying() => _hub.Broadcast("sounds.playing", Playing());

    // ---------------------------------------------------------------- import

    public string UploadBegin(string name, long size)
    {
        if (size <= 0 || size > AudioFileValidator.MaxBytes) throw new RpcException("too-large", "Datei ist zu groß (max. 20 MB).");
        var id = Ids.New("up");
        var tmp = Path.Combine(_paths.SoundsDir, id + ".part");
        File.WriteAllBytes(tmp, Array.Empty<byte>());
        lock (_lock)
        {
            foreach (var old in _uploads.Where(u => DateTime.UtcNow - u.Value.started > TimeSpan.FromMinutes(10)).ToList())
            { _uploads.Remove(old.Key); try { File.Delete(old.Value.path); } catch { } }
            _uploads[id] = (DeviceStore.Sanitize(name, 80, "Sound"), tmp, size, 0, DateTime.UtcNow);
        }
        return id;
    }

    public void UploadChunk(string uploadId, string base64)
    {
        byte[] data;
        try { data = Convert.FromBase64String(base64); } catch { throw new RpcException("invalid-params", "Ungültige Daten."); }
        lock (_lock)
        {
            if (!_uploads.TryGetValue(uploadId, out var u)) throw new RpcException("not-found", "Upload nicht gefunden oder abgelaufen.");
            if (u.received + data.Length > u.expected) throw new RpcException("too-large", "Mehr Daten als angekündigt.");
            using (var fs = new FileStream(u.path, FileMode.Append)) fs.Write(data);
            _uploads[uploadId] = u with { received = u.received + data.Length };
        }
    }

    public Sound UploadEnd(string uploadId)
    {
        (string name, string path, long expected, long received, DateTime started) u;
        lock (_lock)
        {
            if (!_uploads.Remove(uploadId, out u)) throw new RpcException("not-found", "Upload nicht gefunden.");
        }
        try
        {
            if (u.received != u.expected) throw new RpcException("incomplete", "Upload unvollständig.");
            return AddFromBytes(File.ReadAllBytes(u.path), u.name, null);
        }
        finally { try { File.Delete(u.path); } catch { } }
    }

    public Sound AddFromBytes(byte[] data, string name, string? sourceUrl)
    {
        if (data.Length > AudioFileValidator.MaxBytes) throw new RpcException("too-large", "Datei ist zu groß (max. 20 MB).");
        var format = AudioFileValidator.Detect(data);
        if (AudioFileValidator.Problem(format) is { } problem) throw new RpcException("invalid-audio", problem);
        var sha = Ids.Sha256Hex(data);
        var dup = _store.Get(f => f.Sounds.FirstOrDefault(s => s.Sha256 == sha));
        if (dup != null) throw new RpcException("duplicate", $"Dieser Sound ist bereits vorhanden („{dup.Name}“).");
        var id = Ids.New("snd");
        var file = id + "." + format;
        File.WriteAllBytes(Path.Combine(_paths.SoundsDir, file), data);
        var sound = new Sound { Id = id, Name = DeviceStore.Sanitize(Path.GetFileNameWithoutExtension(name), 60, "Sound"), FileName = file, Format = format!, Size = data.Length, Sha256 = sha, SourceUrl = sourceUrl };
        _store.Update(f => f.Sounds.Add(sound));
        Log.Info("sounds", $"Sound importiert: {sound.Name} ({format}, {data.Length / 1024} KB)");
        _hub.Changed("sounds");
        return sound;
    }

    static readonly Regex MyInstantsMp3 = new(@"/media/sounds/[A-Za-z0-9_\-\.%]+\.mp3", RegexOptions.Compiled);

    /// <summary>
    /// Imports from a direct audio link or a MyInstants "instant" page (the page exposes the MP3 path publicly).
    /// Anything else is rejected with an explanation; no protection is bypassed.
    /// </summary>
    public async Task<Sound> ImportUrl(string url, string? name)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            throw new RpcException("invalid-url", "Bitte eine vollständige http(s)-Adresse einfügen.");
        using var resp = await Get(uri);
        var type = resp.Content.Headers.ContentType?.MediaType ?? "";
        if (type.Contains("html"))
        {
            var html = await ReadLimited(resp, 2 * 1024 * 1024);
            var text = System.Text.Encoding.UTF8.GetString(html);
            var m = MyInstantsMp3.Match(text);
            if (!uri.Host.EndsWith("myinstants.com", StringComparison.OrdinalIgnoreCase) || !m.Success)
                throw new RpcException("unsupported-url", "Diese Seite enthält keinen direkt nutzbaren Audio-Link. Unterstützt werden direkte Audio-Links (.mp3/.wav) und MyInstants-Seiten. Alternativ die Datei herunterladen und lokal importieren.");
            var titleMatch = Regex.Match(text, "<h1[^>]*>([^<]{1,80})</h1>");
            name ??= titleMatch.Success ? WebUtility.HtmlDecode(titleMatch.Groups[1].Value.Trim()) : null;
            var mp3 = new Uri(uri, m.Value);
            using var resp2 = await Get(mp3);
            return AddFromBytes(await ReadLimited(resp2, AudioFileValidator.MaxBytes), name ?? Path.GetFileNameWithoutExtension(mp3.LocalPath), mp3.ToString());
        }
        var bytes = await ReadLimited(resp, AudioFileValidator.MaxBytes);
        return AddFromBytes(bytes, name ?? Uri.UnescapeDataString(Path.GetFileNameWithoutExtension(uri.LocalPath)), uri.ToString());
    }

    async Task<HttpResponseMessage> Get(Uri uri)
    {
        HttpResponseMessage resp;
        try { resp = await _http.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead); }
        catch (HttpRequestException ex) { throw new RpcException("download-failed", "Download fehlgeschlagen: " + ex.Message); }
        catch (TaskCanceledException) { throw new RpcException("download-failed", "Zeitüberschreitung beim Download."); }
        if (!resp.IsSuccessStatusCode) { resp.Dispose(); throw new RpcException("download-failed", $"Server antwortete mit {(int)resp.StatusCode}."); }
        return resp;
    }

    static async Task<byte[]> ReadLimited(HttpResponseMessage resp, long max)
    {
        if (resp.Content.Headers.ContentLength > max) throw new RpcException("too-large", "Datei ist zu groß (max. 20 MB).");
        await using var s = await resp.Content.ReadAsStreamAsync();
        using var ms = new MemoryStream();
        var buf = new byte[81920];
        int n;
        while ((n = await s.ReadAsync(buf)) > 0)
        {
            ms.Write(buf, 0, n);
            if (ms.Length > max) throw new RpcException("too-large", "Datei ist zu groß (max. 20 MB).");
        }
        return ms.ToArray();
    }

    /// <summary>Prevents the import from being abused to reach devices in the local network (SSRF).</summary>
    static async ValueTask<Stream> SafeConnect(SocketsHttpConnectionContext ctx, CancellationToken ct)
    {
        var addresses = await Dns.GetHostAddressesAsync(ctx.DnsEndPoint.Host, ct);
        var addr = addresses.FirstOrDefault(a => !IsPrivate(a)) ?? throw new HttpRequestException("Adressen im lokalen Netzwerk sind für Importe gesperrt.");
        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try { await socket.ConnectAsync(addr, ctx.DnsEndPoint.Port, ct); return new NetworkStream(socket, ownsSocket: true); }
        catch { socket.Dispose(); throw; }
    }

    public static bool IsPrivate(IPAddress a)
    {
        if (IPAddress.IsLoopback(a)) return true;
        if (a.IsIPv4MappedToIPv6) a = a.MapToIPv4();
        if (a.AddressFamily == AddressFamily.InterNetworkV6) return a.IsIPv6LinkLocal || a.IsIPv6SiteLocal || a.IsIPv6UniqueLocal;
        var b = a.GetAddressBytes();
        return b[0] == 10 || b[0] == 127 || b[0] == 0 || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) || (b[0] == 192 && b[1] == 168) || (b[0] == 169 && b[1] == 254) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127);
    }

    // ---------------------------------------------------------------- edit

    public sealed class SoundUpdate
    {
        public string Id { get; set; } = "";
        public string? Name { get; set; }
        public List<string>? Categories { get; set; }
        public bool? Favorite { get; set; }
        public int? Volume { get; set; }
        public string? Color { get; set; }
        public bool? Loop { get; set; }
    }

    public Sound Update(SoundUpdate u)
    {
        var r = _store.Update(f =>
        {
            var s = f.Sounds.FirstOrDefault(x => x.Id == u.Id) ?? throw new RpcException("not-found", "Sound nicht gefunden.");
            if (u.Name != null) s.Name = DeviceStore.Sanitize(u.Name, 60, s.Name);
            if (u.Categories != null) s.Categories = u.Categories.Select(c => DeviceStore.Sanitize(c, 30, "")).Where(c => c != "").Distinct().Take(10).ToList();
            if (u.Favorite != null) s.Favorite = u.Favorite.Value;
            if (u.Volume != null) s.Volume = Math.Clamp(u.Volume.Value, 0, 200);
            if (u.Color != null) s.Color = Regex.IsMatch(u.Color, "^#[0-9a-fA-F]{6}$") ? u.Color : null;
            if (u.Loop != null) s.Loop = u.Loop.Value;
            return s;
        });
        _hub.Changed("sounds");
        return r;
    }

    /// <summary>Sounds whose audio file is no longer on the PC (deleted or moved by hand).</summary>
    public List<string> Missing() => Get().Sounds.Where(x => !File.Exists(Path.Combine(_paths.SoundsDir, x.FileName))).Select(x => x.Id).ToList();

    public void Remove(string id)
    {
        var file = _store.Update(f =>
        {
            var s = f.Sounds.FirstOrDefault(x => x.Id == id);
            if (s == null) return null;
            f.Sounds.Remove(s);
            foreach (var c in f.Collections) c.SoundIds.Remove(id);
            return s.FileName;
        });
        if (file != null) try { File.Delete(Path.Combine(_paths.SoundsDir, file)); } catch { }
        _hub.Changed("sounds");
    }

    public SoundCollection SaveCollection(SoundCollection c)
    {
        c.Name = DeviceStore.Sanitize(c.Name, 40, "Sammlung");
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(c.Id)) c.Id = Ids.New("col");
            c.SoundIds = c.SoundIds.Where(id => f.Sounds.Any(s => s.Id == id)).Distinct().ToList();
            var i = f.Collections.FindIndex(x => x.Id == c.Id);
            if (i >= 0) f.Collections[i] = c; else f.Collections.Add(c);
            return c;
        });
        _hub.Changed("sounds");
        return r;
    }

    public void RemoveCollection(string id)
    {
        _store.Update(f => { f.Collections.RemoveAll(c => c.Id == id); if (f.ActiveCollectionId == id) f.ActiveCollectionId = null; });
        _hub.Changed("sounds");
    }

    public void SetActiveCollection(string? id)
    {
        _store.Update(f => f.ActiveCollectionId = id != null && f.Collections.Any(c => c.Id == id) ? id : null);
        _hub.Changed("sounds");
    }

    // ---------------------------------------------------------------- playback

    public string? Play(string soundId, bool fromQueue = false)
    {
        var engine = _audio.Engine;
        if (!engine.Supported) return engine.UnsupportedReason;
        var sound = _store.Get(f => f.Sounds.FirstOrDefault(s => s.Id == soundId));
        if (sound == null) return "Sound nicht gefunden.";
        var path = Path.Combine(_paths.SoundsDir, sound.FileName);
        if (!File.Exists(path)) return "Audiodatei fehlt auf dem PC.";
        var a = _audio.Settings();
        lock (_lock)
        {
            if (!fromQueue)
            {
                if (a.PlayMode == "replace") { engine.StopAll(); _playing.Clear(); _queue.Clear(); }
                else if (a.PlayMode == "queue" && _playing.Count > 0) { if (_queue.Count < 50) _queue.Enqueue(soundId); PublishPlaying(); return null; }
                else if (_playing.Count >= a.MaxConcurrent) return $"Maximal {a.MaxConcurrent} Sounds gleichzeitig.";
            }
        }
        var vol = a.SoundboardVolume / 100f * sound.Volume / 100f;
        var playbackId = Ids.New("pb");
        TimeSpan? duration;
        try
        {
            duration = engine.Play(new PlayRequest
            {
                FilePath = path,
                PlaybackId = playbackId,
                OutputDeviceId = a.OutputDeviceId,
                Volume = Math.Clamp(vol, 0f, 2f),
                MonitorDeviceId = a.MonitorEnabled ? a.MonitorDeviceId ?? "default" : null,
                MonitorVolume = a.MonitorVolume / 100f * sound.Volume / 100f,
                Loop = sound.Loop,
            }, OnEnded);
        }
        catch (Exception ex)
        {
            Log.Warn("sounds", $"Wiedergabe fehlgeschlagen: {ex.Message}");
            return "Wiedergabe fehlgeschlagen: " + ex.Message;
        }
        lock (_lock) _playing[playbackId] = (sound.Id, sound.Name, DateTime.UtcNow, sound.Loop ? null : duration?.TotalMilliseconds, false);
        PublishPlaying();
        Played?.Invoke(sound);
        return null;
    }

    void OnEnded(string playbackId, string? error)
    {
        string? next = null;
        lock (_lock)
        {
            _playing.Remove(playbackId);
            if (_playing.Count == 0 && _queue.Count > 0) next = _queue.Dequeue();
        }
        if (error != null) Log.Warn("sounds", "Wiedergabe abgebrochen: " + error);
        PublishPlaying();
        if (next != null) Play(next, fromQueue: true);
    }

    public void Stop(string playbackId) { _audio.Engine.Stop(playbackId); lock (_lock) _playing.Remove(playbackId); PublishPlaying(); }

    public void StopAll()
    {
        lock (_lock) _queue.Clear(); // first, so the end of the stopped sounds cannot start the next queued one
        _audio.Engine.StopAll();
        lock (_lock) { _playing.Clear(); _queue.Clear(); }
        PublishPlaying();
    }

    public void Pause(string playbackId, bool pause)
    {
        if (pause) _audio.Engine.Pause(playbackId); else _audio.Engine.Resume(playbackId);
        lock (_lock) if (_playing.TryGetValue(playbackId, out var p)) _playing[playbackId] = p with { paused = pause };
        PublishPlaying();
    }

    // ---------------------------------------------------------------- config import/export (metadata only)

    public object ExportConfig() => new { format = "pgl-soundboard", version = 1, sounds = Get().Sounds, collections = Get().Collections };

    /// <summary>Applies names, categories, favourites and collections to sounds that exist locally (matched by SHA-256).</summary>
    public int ImportConfig(System.Text.Json.JsonElement cfg)
    {
        if (!cfg.TryGetProperty("format", out var fmt) || fmt.GetString() != "pgl-soundboard")
            throw new RpcException("invalid-file", "Keine Soundboard-Konfiguration.");
        var sounds = cfg.GetProperty("sounds").Deserialize<List<Sound>>(Json.Options) ?? new();
        var collections = cfg.TryGetProperty("collections", out var c) ? c.Deserialize<List<SoundCollection>>(Json.Options) ?? new() : new();
        int applied = 0;
        _store.Update(f =>
        {
            var idMap = new Dictionary<string, string>();
            foreach (var s in sounds.Take(2000))
            {
                var local = f.Sounds.FirstOrDefault(x => x.Sha256 == s.Sha256);
                if (local == null) continue;
                idMap[s.Id] = local.Id;
                local.Name = DeviceStore.Sanitize(s.Name, 60, local.Name);
                local.Categories = s.Categories.Take(10).ToList();
                local.Favorite = s.Favorite;
                local.Volume = Math.Clamp(s.Volume, 0, 200);
                applied++;
            }
            foreach (var col in collections.Take(100))
            {
                var mapped = new SoundCollection { Id = Ids.New("col"), Name = DeviceStore.Sanitize(col.Name, 40, "Sammlung"), SoundIds = col.SoundIds.Where(idMap.ContainsKey).Select(id => idMap[id]).ToList() };
                if (mapped.SoundIds.Count > 0) f.Collections.Add(mapped);
            }
        });
        _hub.Changed("sounds");
        return applied;
    }

    internal SoundsFile Export() => _store.Snapshot();
    internal void Import(SoundsFile f) { _store.Replace(f); _hub.Changed("sounds"); }
}
