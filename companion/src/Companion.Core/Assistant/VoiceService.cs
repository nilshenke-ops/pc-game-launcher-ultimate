using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

public sealed class VoiceUsageMonth { public string Month { get; set; } = ""; public int Chars { get; set; } public int Transcriptions { get; set; } }

public sealed class VoiceFile
{
    /// <summary>JARVIS reads his answers aloud with an ElevenLabs voice. Off until the user switches it on (the text then goes to ElevenLabs).</summary>
    public bool Enabled { get; set; }
    /// <summary>ElevenLabs API key, protected with DPAPI on Windows. Never returned, never in a backup.</summary>
    public string? KeyProtected { get; set; }
    public string? VoiceId { get; set; }
    public string? VoiceName { get; set; }
    /// <summary>Playback volume in percent (0–100).</summary>
    public int Volume { get; set; } = 80;
    /// <summary>At most this many characters per month are sent to ElevenLabs (protects the user's own quota).</summary>
    public int MonthlyChars { get; set; } = 20000;
    public List<VoiceUsageMonth> Usage { get; set; } = new();
    /// <summary>At most this many spoken sentences per month are sent to ElevenLabs for speech → text (their free plan is limited).</summary>
    public int MonthlyTranscriptions { get; set; } = 400;
}

/// <summary>
/// JARVIS' voice through ElevenLabs. The companion talks to ElevenLabs – the key never reaches a browser, a backup or a log.
/// Only ElevenLabs' own ready-made ("premade") voices may be used: no cloned voices, so no voice of a real person is imitated.
/// Only answers the user asked for are sent, in short pieces, and only while the user has switched the voice on.
/// </summary>
public sealed class VoiceService
{
    public const string DefaultBase = "https://api.elevenlabs.io";
    public const int MaxTextChars = 600, MaxAudioBytes = 2_000_000;
    public static readonly Regex VoiceIdFormat = new("^[A-Za-z0-9]{10,40}$", RegexOptions.Compiled);
    public static readonly Regex KeyFormat = new(@"^[A-Za-z0-9_\-]{16,200}$", RegexOptions.Compiled);

    readonly JsonStore<VoiceFile> _store;
    readonly ISecretProtector _secrets;
    readonly Func<DateTime> _now;
    readonly HttpClient _http;
    readonly string _base;
    (string keyHash, DateTime at, HashSet<string> ids)? _premade;

    public VoiceService(AppPaths paths, ISecretProtector secrets, Func<DateTime>? now = null, HttpMessageHandler? handler = null, string? baseUrl = null)
    {
        _store = new JsonStore<VoiceFile>(paths.File("voice.json"));
        _secrets = secrets;
        _now = now ?? (() => DateTime.UtcNow);
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(30);
        _base = (baseUrl ?? DefaultBase).TrimEnd('/');
    }

    string Month => _now().ToString("yyyy-MM");

    public object Status()
    {
        var f = _store.Snapshot();
        return new { enabled = f.Enabled, keySet = f.KeyProtected != null, voiceId = f.VoiceId, voiceName = f.VoiceName, volume = f.Volume, monthlyChars = f.MonthlyChars, used = f.Usage.FirstOrDefault(u => u.Month == Month)?.Chars ?? 0, sttUsed = f.Usage.FirstOrDefault(u => u.Month == Month)?.Transcriptions ?? 0, sttMonthly = f.MonthlyTranscriptions };
    }

    public sealed class Config { public string? Key { get; set; } public bool? Enabled { get; set; } public string? VoiceId { get; set; } public string? VoiceName { get; set; } public int? Volume { get; set; } public int? MonthlyChars { get; set; } }

    /// <summary>Settings. The key can only be entered or removed at the PC itself (never from a phone).</summary>
    public object Configure(Config c, bool atPc)
    {
        if (c.Key != null && !atPc) throw new RpcException("forbidden", "Den ElevenLabs-Schlüssel gibst du nur am PC selbst ein, nicht vom Handy aus.");
        var key = c.Key?.Trim();
        if (key is { Length: > 0 } && !KeyFormat.IsMatch(key)) throw new RpcException("invalid-params", "Der Schlüssel sieht nicht richtig aus (nur Buchstaben, Ziffern, _ und -).");
        if (c.VoiceId is { Length: > 0 } vid && !VoiceIdFormat.IsMatch(vid)) throw new RpcException("invalid-params", "Ungültige Stimmen-Kennung.");
        if (c.Volume is { } v && (v < 0 || v > 100)) throw new RpcException("invalid-params", "Lautstärke muss zwischen 0 und 100 liegen.");
        if (c.MonthlyChars is { } m && (m < 1000 || m > 200000)) throw new RpcException("invalid-params", "Das Monatslimit muss zwischen 1000 und 200000 Zeichen liegen.");
        _store.Update(f =>
        {
            if (key != null) { f.KeyProtected = key.Length == 0 ? null : _secrets.Protect(key); if (key.Length == 0) f.Enabled = false; _premade = null; }
            if (c.VoiceId != null) { f.VoiceId = c.VoiceId.Length == 0 ? null : c.VoiceId; f.VoiceName = c.VoiceId.Length == 0 ? null : (c.VoiceName ?? "")[..Math.Min(60, (c.VoiceName ?? "").Length)]; }
            if (c.Volume != null) f.Volume = c.Volume.Value;
            if (c.MonthlyChars != null) f.MonthlyChars = c.MonthlyChars.Value;
            if (c.Enabled != null) f.Enabled = c.Enabled.Value && f.KeyProtected != null && f.VoiceId != null; // on only with key and voice
        });
        return Status();
    }

    string Key(VoiceFile f) => f.KeyProtected == null ? throw new RpcException("voice-key", "Für die Stimme ist noch kein ElevenLabs-Schlüssel eingetragen (am PC unter KI-Assistent → Stimme).")
        : _secrets.Unprotect(f.KeyProtected) ?? throw new RpcException("voice-key", "Der gespeicherte ElevenLabs-Schlüssel lässt sich nicht lesen. Bitte neu eintragen.");

    async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string key, HttpContent? body, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(method, _base + path) { Content = body };
        req.Headers.Add("xi-api-key", key);
        HttpResponseMessage res;
        try { res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct); }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested) { throw new RpcException("voice-unavailable", "ElevenLabs antwortet nicht (Zeitüberschreitung)."); }
        catch (HttpRequestException) { throw new RpcException("voice-unavailable", "ElevenLabs ist nicht erreichbar (Internetverbindung?)."); }
        if (res.IsSuccessStatusCode) return res;
        var code = (int)res.StatusCode;
        res.Dispose();
        throw code switch
        {
            401 or 403 => new RpcException("voice-key", "ElevenLabs lehnt den Schlüssel ab. Bitte prüfen und neu eintragen."),
            402 or 429 => new RpcException("voice-limit", "Das ElevenLabs-Kontingent oder die Anfragegrenze ist erreicht."),
            _ => new RpcException("voice-unavailable", $"ElevenLabs meldet einen Fehler (HTTP {code})."),
        };
    }

    public sealed record VoiceInfo(string Id, string Name, string? Gender, string? Accent);

    /// <summary>ElevenLabs' own ready-made voices ("premade") – cloned or community voices are left out on purpose.</summary>
    public async Task<List<VoiceInfo>> VoicesAsync(CancellationToken ct)
    {
        var f = _store.Snapshot();
        using var res = await SendAsync(HttpMethod.Get, "/v1/voices", Key(f), null, ct);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var list = new List<VoiceInfo>();
        if (doc.RootElement.TryGetProperty("voices", out var arr) && arr.ValueKind == JsonValueKind.Array)
            foreach (var v in arr.EnumerateArray())
            {
                if (!v.TryGetProperty("category", out var cat) || cat.GetString() != "premade") continue;
                var id = v.TryGetProperty("voice_id", out var i) ? i.GetString() : null;
                var name = v.TryGetProperty("name", out var n) ? n.GetString() : null;
                if (id == null || name == null || !VoiceIdFormat.IsMatch(id)) continue;
                string? Label(string k) => v.TryGetProperty("labels", out var l) && l.ValueKind == JsonValueKind.Object && l.TryGetProperty(k, out var x) && x.ValueKind == JsonValueKind.String ? x.GetString() : null;
                list.Add(new VoiceInfo(id, name[..Math.Min(60, name.Length)], Label("gender"), Label("accent")));
                if (list.Count >= 50) break;
            }
        _premade = (Hash(Key(f)), _now(), list.Select(x => x.Id).ToHashSet());
        return list;
    }

    static string Hash(string key) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)))[..16];

    async Task<bool> IsPremadeAsync(string voiceId, string key, CancellationToken ct)
    {
        if (_premade is { } p && p.keyHash == Hash(key) && _now() - p.at < TimeSpan.FromMinutes(10)) return p.ids.Contains(voiceId);
        await VoicesAsync(ct);
        return _premade!.Value.ids.Contains(voiceId);
    }

    public sealed record Speech(string Base64, string Mime, int Chars, int Volume);

    /// <summary>Text → spoken audio (MP3). Only when switched on, only a stock voice, short text, within the monthly cap.</summary>
    public async Task<Speech> SpeakAsync(string? text, CancellationToken ct)
    {
        var f = _store.Snapshot();
        if (!f.Enabled) throw new RpcException("voice-off", "Die ElevenLabs-Stimme ist ausgeschaltet.");
        var key = Key(f);
        if (f.VoiceId == null) throw new RpcException("voice-key", "Es ist noch keine Stimme gewählt.");
        var clean = Regex.Replace(text ?? "", @"[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "").Trim();
        if (clean.Length == 0) throw new RpcException("invalid-params", "Kein Text zum Vorlesen.");
        if (clean.Length > MaxTextChars) throw new RpcException("invalid-params", $"Der Text ist zu lang (höchstens {MaxTextChars} Zeichen).");
        var used = f.Usage.FirstOrDefault(u => u.Month == Month)?.Chars ?? 0;
        if (used + clean.Length > f.MonthlyChars) throw new RpcException("voice-limit", $"Das Monatslimit von {f.MonthlyChars} Zeichen ist erreicht (am PC einstellbar).");
        if (!await IsPremadeAsync(f.VoiceId, key, ct)) throw new RpcException("voice-not-stock", "Diese Stimme ist keine Standardstimme von ElevenLabs. Nachgebaute oder geklonte Stimmen werden nicht benutzt.");
        var body = new StringContent(JsonSerializer.Serialize(new { text = clean, model_id = "eleven_multilingual_v2" }), System.Text.Encoding.UTF8, "application/json");
        using var res = await SendAsync(HttpMethod.Post, $"/v1/text-to-speech/{Uri.EscapeDataString(f.VoiceId)}?output_format=mp3_44100_64", key, body, ct);
        if (res.Content.Headers.ContentLength > MaxAudioBytes) throw new RpcException("voice-unavailable", "Die Sprachausgabe ist zu groß.");
        var bytes = await res.Content.ReadAsByteArrayAsync(ct);
        if (bytes.Length == 0 || bytes.Length > MaxAudioBytes) throw new RpcException("voice-unavailable", "ElevenLabs hat keine brauchbare Sprachausgabe geliefert.");
        _store.Update(s =>
        {
            var u = s.Usage.FirstOrDefault(x => x.Month == Month);
            if (u == null) { u = new VoiceUsageMonth { Month = Month }; s.Usage.Add(u); s.Usage = s.Usage.OrderByDescending(x => x.Month).Take(6).ToList(); }
            u.Chars += clean.Length;
        });
        return new Speech(Convert.ToBase64String(bytes), "audio/mpeg", clean.Length, f.Volume);
    }

    public const int MaxAudioInBytes = 3_000_000;

    /// <summary>Speech → text with ElevenLabs Scribe, with the key stored at the PC (so a phone or iPad without its own key can use it). One spoken sentence,
    /// counted per month; needs only the key (the voice for speaking does not have to be chosen or switched on).</summary>
    public async Task<string> TranscribeAsync(string? base64, string? mime, string? lang, CancellationToken ct)
    {
        var f = _store.Snapshot();
        var key = Key(f);
        if (string.IsNullOrEmpty(base64)) throw new RpcException("invalid-params", "Keine Aufnahme.");
        byte[] audio;
        try { audio = Convert.FromBase64String(base64); } catch (FormatException) { throw new RpcException("invalid-params", "Die Aufnahme ist beschädigt."); }
        if (audio.Length < 1500) return "";
        if (audio.Length > MaxAudioInBytes) throw new RpcException("invalid-params", "Die Aufnahme ist zu lang.");
        var used = f.Usage.FirstOrDefault(u => u.Month == Month)?.Transcriptions ?? 0;
        if (used >= f.MonthlyTranscriptions) throw new RpcException("voice-limit", $"Das Monatslimit von {f.MonthlyTranscriptions} Spracherkennungen ist erreicht.");
        var ext = mime != null && mime.Contains("mp4") ? "mp4" : mime != null && mime.Contains("ogg") ? "ogg" : mime != null && mime.Contains("wav") ? "wav" : "webm";
        var form = new MultipartFormDataContent
        {
            { new StringContent("scribe_v1"), "model_id" },
            { new StringContent(lang != null && lang.StartsWith("en", StringComparison.OrdinalIgnoreCase) ? "eng" : "deu"), "language_code" },
            { new StringContent("false"), "tag_audio_events" },
            { new ByteArrayContent(audio), "file", $"sprache.{ext}" },
        };
        using var res = await SendAsync(HttpMethod.Post, "/v1/speech-to-text", key, form, ct);
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        var text = doc.RootElement.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
        _store.Update(s =>
        {
            var u = s.Usage.FirstOrDefault(x => x.Month == Month);
            if (u == null) { u = new VoiceUsageMonth { Month = Month }; s.Usage.Add(u); s.Usage = s.Usage.OrderByDescending(x => x.Month).Take(6).ToList(); }
            u.Transcriptions++;
        });
        return Regex.Replace(text, @"\s+", " ").Trim()[..Math.Min(600, Regex.Replace(text, @"\s+", " ").Trim().Length)];
    }
}
