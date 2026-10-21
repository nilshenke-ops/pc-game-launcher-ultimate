using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>Set at the PC only: whether remote desktop is allowed at all and how long a session may last.</summary>
public sealed class RemoteSettings
{
    public bool Enabled { get; set; }
    /// <summary>Longest session; then the device has to connect again (1–480 min).</summary>
    public int MaxMinutes { get; set; } = 60;
    /// <summary>Ends a session after this long without any touch or key (1–120 min).</summary>
    public int IdleMinutes { get; set; } = 15;
}

/// <summary>What a device asks for. "auto" adapts picture size and quality to the measured round trip.</summary>
public sealed record RemoteQuality(string Preset, int MaxWidth, int Quality, int Fps)
{
    public static readonly string[] Presets = { "auto", "low", "balanced", "high" };
    public static RemoteQuality For(string preset, int? maxWidth, int? fps) => preset switch
    {
        "low" => new("low", Math.Min(maxWidth ?? 960, 960), 40, Math.Min(fps ?? 10, 10)),
        "high" => new("high", maxWidth ?? 1920, 75, fps ?? 24),
        "balanced" => new("balanced", Math.Min(maxWidth ?? 1280, 1600), 60, fps ?? 15),
        _ => new("auto", maxWidth ?? 1600, 65, fps ?? 20),
    };
}

/// <summary>
/// Remote desktop: shows a monitor of the PC on a paired device and – with the extra right „Fernsteuern“ – takes its
/// touches and keys as normal Windows input. Only when enabled at the PC and only for devices with the right. The
/// picture is captured only while a session runs and the device has received the previous picture (at most two on the
/// way), so a slow network makes it slower, never piles up. Nothing is stored; every session is visible on the PC
/// (notification + bar with „Beenden“) and ends after the set time, when idle, when the device disconnects or is
/// paused/removed, in privacy mode, or with „Beenden“ on the PC.
/// </summary>
public sealed class RemoteService : IDisposable
{
    public const int MaxEventsPerTick = 60;
    public static readonly TimeSpan NoAnswer = TimeSpan.FromSeconds(20);

    readonly JsonStore<RemoteSettings> _store;
    readonly IScreenCapture _screen;
    readonly IRemoteInput _input;
    readonly IHub _hub;
    readonly Func<RpcSession, string, object?, Task> _send;
    readonly Func<DateTime> _now;
    readonly object _lock = new();
    Session? _active;

    /// <summary>A session started or ended (for the bar on the PC). Null = none.</summary>
    public event Action<RemoteSessionInfo?>? Changed;
    public Action<string, string, string>? Notify { get; set; }
    /// <summary>Reason why no session may start right now (privacy mode), or null.</summary>
    public Func<string?> Blocked { get; set; } = () => null;

    public RemoteService(AppPaths paths, IScreenCapture screen, IRemoteInput input, IHub hub, Func<RpcSession, string, object?, Task> send, Func<DateTime>? now = null)
    {
        _store = new JsonStore<RemoteSettings>(paths.File("remote.json"));
        _screen = screen; _input = input; _hub = hub; _send = send; _now = now ?? (() => DateTime.UtcNow);
    }

    public RemoteSettings Settings => _store.Snapshot();

    public RemoteSettings Configure(bool? enabled, int? maxMinutes, int? idleMinutes)
    {
        var r = _store.Update(s =>
        {
            if (enabled != null) s.Enabled = enabled.Value;
            if (maxMinutes != null) s.MaxMinutes = Math.Clamp(maxMinutes.Value, 1, 480);
            if (idleMinutes != null) s.IdleMinutes = Math.Clamp(idleMinutes.Value, 1, 120);
            return new RemoteSettings { Enabled = s.Enabled, MaxMinutes = s.MaxMinutes, IdleMinutes = s.IdleMinutes };
        });
        if (!r.Enabled) End("Remote Desktop wurde am PC ausgeschaltet.");
        _hub.Changed("remote");
        return r;
    }

    public sealed record RemoteSessionInfo(string Id, string Device, bool Control, DateTime Since, int Screen);

    public RemoteSessionInfo? Active { get { lock (_lock) return _active?.Info; } }

    public object Status(RpcSession who)
    {
        var s = Settings;
        Session? a; lock (_lock) a = _active;
        return new
        {
            enabled = s.Enabled, maxMinutes = s.MaxMinutes, idleMinutes = s.IdleMinutes,
            supported = _screen.Supported, reason = _screen.UnsupportedReason, inputSupported = _input.Supported, testSource = _screen.IsTestSource,
            screens = _screen.Supported ? _screen.Screens() : Array.Empty<ScreenInfo>(),
            canView = who.Has(Security.Permissions.Screen), canControl = who.Has(Security.Permissions.Remote),
            session = a == null ? null : new { a.Info.Id, a.Info.Device, a.Info.Control, a.Info.Since, a.Info.Screen, mine = a.Rpc == who, a.Paused },
            audio = false,
        };
    }

    // ------------------------------------------------------------------ sessions

    sealed class Session
    {
        public required RemoteSessionInfo Info;
        public required RpcSession Rpc;
        public required ScreenInfo Screen;
        public RemoteQuality Want = RemoteQuality.For("auto", null, null);
        public int Level; // auto: 0 = best … 4 = smallest
        public bool Paused;
        public long Seq, Acked;
        public readonly Dictionary<long, long> SentAt = new();
        public double Rtt = 100;
        public DateTime LastTick, LastInput, LastLevelChange;
        public string? LastHash, Problem;
        public long LastSentTicks;
        public readonly CancellationTokenSource Cts = new();
        public int Frames; public long Bytes; public double CaptureMs;
        /// <summary>Pictures in a row that did not change – then the PC captures less often (saves CPU while gaming).</summary>
        public int Unchanged;
    }

    static readonly (int width, int quality)[] AutoLevels = { (1920, 75), (1600, 65), (1280, 58), (1024, 50), (800, 42) };

    public object Start(RpcSession who, int screen, string preset, int? maxWidth, int? fps)
    {
        if (!_screen.Supported) throw new RpcException("unsupported", _screen.UnsupportedReason ?? "Bildschirmübertragung nicht verfügbar.");
        var cfg = Settings;
        if (!cfg.Enabled) throw new RpcException("disabled", "Remote Desktop ist am PC ausgeschaltet. Am PC: Remote Desktop → „Remote Desktop erlauben“.");
        if (Blocked() is { } why) throw new RpcException("blocked", why);
        if (!RemoteQuality.Presets.Contains(preset)) throw new RpcException("invalid-params", "Unbekannte Qualitätsstufe.");
        if (maxWidth is { } mw && (mw < 480 || mw > 3840)) throw new RpcException("invalid-params", "Breite muss zwischen 480 und 3840 Pixel liegen.");
        if (fps is { } f && (f < 1 || f > 30)) throw new RpcException("invalid-params", "Bildrate muss zwischen 1 und 30 liegen.");
        var screens = _screen.Screens();
        var sc = screens.FirstOrDefault(x => x.Index == screen) ?? throw new RpcException("invalid-params", "Diesen Bildschirm gibt es nicht.");
        var control = who.Has(Security.Permissions.Remote) && _input.Supported;
        Session s;
        lock (_lock)
        {
            if (_active != null && _active.Rpc != who && !(who.Device != null && _active.Rpc.Device?.Id == who.Device.Id))
                throw new RpcException("busy", $"Gerade ist „{_active.Info.Device}“ verbunden. Am PC unter Remote Desktop beenden oder warten, bis die Sitzung endet.");
            StopLocked("Neue Sitzung von diesem Gerät.", notify: false);
            var now = _now();
            s = new Session
            {
                Info = new RemoteSessionInfo("rs_" + Ids.Token(8), Who(who), control, now, sc.Index), Rpc = who, Screen = sc,
                Want = RemoteQuality.For(preset, maxWidth, fps), LastTick = now, LastInput = now, LastLevelChange = now,
            };
            s.Level = s.Want.Preset == "auto" ? Array.FindIndex(AutoLevels, l => l.width <= s.Want.MaxWidth) is var i and >= 0 ? Math.Max(i, 2) : 4 : 0;
            _active = s;
        }
        Log.Info("remote", $"Sitzung gestartet: {s.Info.Device} ({(control ? "steuern" : "nur ansehen")}, Bildschirm {sc.Index + 1}).");
        Notify?.Invoke("remote:start", control ? "Fernsteuerung aktiv" : "Bildschirmübertragung aktiv",
            $"„{s.Info.Device}“ {(control ? "sieht und steuert" : "sieht")} deinen Bildschirm. Beenden: Leiste oben am Bildschirm oder Begleiter → Remote Desktop.");
        Changed?.Invoke(s.Info);
        _hub.Changed("remote");
        _ = Task.Run(() => Loop(s));
        return new { sessionId = s.Info.Id, control, screen = sc, quality = Effective(s), testSource = _screen.IsTestSource };
    }

    static string Who(RpcSession s) => s.IsLocalAdmin ? "PC" : s.Device?.Name ?? "Gerät";

    object Effective(Session s)
    {
        var (w, q) = s.Want.Preset == "auto" ? AutoLevels[s.Level] : (s.Want.MaxWidth, s.Want.Quality);
        return new { preset = s.Want.Preset, maxWidth = Math.Min(w, s.Want.MaxWidth), quality = q, fps = s.Want.Fps };
    }

    Session Mine(RpcSession who, string id)
    {
        lock (_lock)
            return _active is { } a && a.Info.Id == id && a.Rpc == who ? a : throw new RpcException("ended", "Diese Sitzung ist beendet. Bitte neu verbinden.");
    }

    public object Pause(RpcSession who, string id, bool paused)
    {
        var s = Mine(who, id);
        s.Paused = paused;
        if (paused) _input.ReleaseAll();
        _hub.Changed("remote");
        return new { paused };
    }

    public object SetQuality(RpcSession who, string id, string preset, int? maxWidth, int? fps)
    {
        var s = Mine(who, id);
        if (!RemoteQuality.Presets.Contains(preset)) throw new RpcException("invalid-params", "Unbekannte Qualitätsstufe.");
        s.Want = RemoteQuality.For(preset, maxWidth is { } mw ? Math.Clamp(mw, 480, 3840) : null, fps is { } f ? Math.Clamp(f, 1, 30) : null);
        s.Level = 2; s.LastHash = null;
        return Effective(s);
    }

    public bool Stop(RpcSession who, string id)
    {
        lock (_lock)
        {
            if (_active is not { } a || a.Info.Id != id || a.Rpc != who) return false;
            StopLocked("Vom Gerät beendet.", notify: true);
            return true;
        }
    }

    /// <summary>Ends the running session (PC button, privacy mode, setting switched off, device paused).</summary>
    public bool End(string reason)
    {
        lock (_lock) { var had = _active != null; StopLocked(reason, notify: true); return had; }
    }

    /// <summary>The connection of a device closed – its session ends at once (it can start a new one after reconnecting).</summary>
    public void Closed(RpcSession who)
    {
        lock (_lock) if (_active?.Rpc == who) StopLocked("Verbindung zum Gerät getrennt.", notify: false);
    }

    void StopLocked(string reason, bool notify)
    {
        if (_active is not { } s) return;
        _active = null;
        s.Cts.Cancel();
        try { if (s.Info.Control) _input.ReleaseAll(); } catch (Exception ex) { Log.Warn("remote", ex.Message); }
        Log.Info("remote", $"Sitzung beendet ({s.Info.Device}): {reason} – {s.Frames} Bilder, {s.Bytes / 1024} KB.");
        _ = _send(s.Rpc, "remote.ended", new { sessionId = s.Info.Id, reason });
        if (notify) Notify?.Invoke("remote:end", "Fernsteuerung beendet", $"„{s.Info.Device}“: {reason}");
        Changed?.Invoke(null);
        _hub.Changed("remote");
        // Pictures are large strings (large object heap): give that memory back once the session is over.
        _ = Task.Run(async () =>
        {
            await Task.Delay(1500);
            System.Runtime.GCSettings.LargeObjectHeapCompactionMode = System.Runtime.GCLargeObjectHeapCompactionMode.CompactOnce;
            GC.Collect(2, GCCollectionMode.Forced, blocking: true, compacting: true);
            Log.Info("remote", $"Speicher nach der Sitzung: {GC.GetTotalMemory(false) / 1048576} MB belegt.");
        });
    }

    /// <summary>Acknowledges pictures and carries the touches/keys collected since the last tick.</summary>
    public object Tick(RpcSession who, string id, long ack, JsonElement events)
    {
        var s = Mine(who, id);
        var now = _now();
        s.LastTick = now;
        // Input first, then the acknowledgement – so the next picture already shows the result of the touch.
        var done = 0;
        if (events.ValueKind == JsonValueKind.Array && events.GetArrayLength() > 0)
        {
            if (!s.Info.Control) throw new RpcException("forbidden", "Dieses Gerät darf nur ansehen. Fernsteuern muss am PC unter Geräte erlaubt werden.");
            if (s.Paused) throw new RpcException("paused", "Übertragung pausiert – zuerst fortsetzen.");
            if (events.GetArrayLength() > MaxEventsPerTick) throw new RpcException("invalid-params", "Zu viele Eingaben auf einmal.");
            foreach (var e in events.EnumerateArray()) { Apply(s, e); done++; }
            s.LastInput = now;
            s.Unchanged = 0; // input usually changes the picture: back to the full rate at once
        }
        if (ack > s.Acked && ack <= s.Seq)
        {
            s.Acked = ack;
            if (s.SentAt.Remove(ack, out var sent))
            {
                var rtt = (Stopwatch.GetTimestamp() - sent) * 1000.0 / Stopwatch.Frequency;
                s.Rtt = s.Rtt * 0.7 + rtt * 0.3;
                Adapt(s, now);
            }
            foreach (var k in s.SentAt.Keys.Where(k => k < ack).ToList()) s.SentAt.Remove(k);
        }
        return new { done, rtt = Math.Round(s.Rtt), quality = Effective(s) };
    }

    void Adapt(Session s, DateTime now)
    {
        if (s.Want.Preset != "auto" || now - s.LastLevelChange < TimeSpan.FromSeconds(2)) return;
        if (s.Rtt > 350 && s.Level < AutoLevels.Length - 1) { s.Level++; s.LastLevelChange = now; }
        else if (s.Rtt < 120 && s.Level > 0 && now - s.LastLevelChange > TimeSpan.FromSeconds(5) && AutoLevels[s.Level - 1].width <= s.Want.MaxWidth) { s.Level--; s.LastLevelChange = now; }
    }

    static double Coord(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.GetDouble() is var d && d >= 0 && d <= 1 ? d : throw new RpcException("invalid-params", $"Ungültige Position ({name}).");

    static RemoteButton Btn(JsonElement e) => (e.TryGetProperty("b", out var b) ? b.GetString() : "left") switch
    {
        "left" => RemoteButton.Left, "right" => RemoteButton.Right, "middle" => RemoteButton.Middle,
        _ => throw new RpcException("invalid-params", "Unbekannte Maustaste."),
    };

    void Apply(Session s, JsonElement e)
    {
        var t = e.TryGetProperty("t", out var tv) && tv.ValueKind == JsonValueKind.String ? tv.GetString() : null;
        switch (t)
        {
            case "move": _input.MoveTo(s.Screen, Coord(e, "x"), Coord(e, "y")); break;
            case "down": _input.Button(Btn(e), true); break;
            case "up": _input.Button(Btn(e), false); break;
            case "click":
            {
                var b = Btn(e);
                if (e.TryGetProperty("x", out _)) _input.MoveTo(s.Screen, Coord(e, "x"), Coord(e, "y"));
                var n = e.TryGetProperty("n", out var nv) && nv.TryGetInt32(out var nn) ? Math.Clamp(nn, 1, 2) : 1;
                for (var i = 0; i < n; i++) { _input.Button(b, true); _input.Button(b, false); }
                break;
            }
            case "wheel":
            {
                int Get(string k) => e.TryGetProperty(k, out var v) && v.TryGetInt32(out var x) ? Math.Clamp(x, -2400, 2400) : 0;
                _input.Wheel(Get("dy"), Get("dx"));
                break;
            }
            case "text":
            {
                var text = e.TryGetProperty("s", out var sv) && sv.ValueKind == JsonValueKind.String ? sv.GetString() ?? "" : "";
                if (text.Length > 500) throw new RpcException("invalid-params", "Text zu lang (höchstens 500 Zeichen auf einmal).");
                text = new string(text.Where(c => !char.IsControl(c) || c is '\n' or '\t').ToArray());
                if (text.Length > 0) _input.Text(text);
                break;
            }
            case "keys":
            {
                if (!e.TryGetProperty("k", out var kv) || kv.ValueKind != JsonValueKind.Array || kv.GetArrayLength() is 0 or > 5) throw new RpcException("invalid-params", "Ungültige Tastenkombination.");
                var keys = kv.EnumerateArray().Select(k => k.GetString() ?? "").ToList();
                if (keys.Any(k => !RemoteKeys.Names.Contains(k))) throw new RpcException("invalid-params", "Diese Taste ist nicht erlaubt.");
                if (keys.Contains("Ctrl") && keys.Contains("Alt") && keys.Contains("Delete")) throw new RpcException("invalid-params", "Strg+Alt+Entf schützt Windows – das geht nur direkt am PC.");
                foreach (var k in keys) _input.Key(k, true);
                foreach (var k in Enumerable.Reverse(keys)) _input.Key(k, false);
                break;
            }
            case "key":
            {
                var k = e.TryGetProperty("k", out var kk) ? kk.GetString() ?? "" : "";
                if (!RemoteKeys.Modifiers.Contains(k)) throw new RpcException("invalid-params", "Gedrückt halten geht nur für Strg, Alt, Umschalt und Windows.");
                _input.Key(k, e.TryGetProperty("down", out var dv) && dv.ValueKind == JsonValueKind.True);
                break;
            }
            case "release": _input.ReleaseAll(); break;
            default: throw new RpcException("invalid-params", "Unbekannte Eingabe.");
        }
    }

    async Task Loop(Session s)
    {
        var ct = s.Cts.Token;
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var now = _now();
                var cfg = Settings;
                if (!s.Rpc.Authenticated) { End("Gerät abgemeldet."); return; }
                if (!s.Rpc.Has(Security.Permissions.Screen) || (s.Info.Control && !s.Rpc.Has(Security.Permissions.Remote))) { End("Das Recht dafür wurde am PC entzogen."); return; }
                if (now - s.Info.Since > TimeSpan.FromMinutes(cfg.MaxMinutes)) { End($"Sitzungsdauer ({cfg.MaxMinutes} min) abgelaufen – bitte neu verbinden."); return; }
                if (now - s.LastTick > NoAnswer) { End("Das Gerät antwortet nicht mehr."); return; }
                if (now - s.LastInput > TimeSpan.FromMinutes(cfg.IdleMinutes)) { End($"{cfg.IdleMinutes} min ohne Eingabe – automatisch beendet."); return; }
                if (s.Paused || s.Seq - s.Acked >= 2) { await Task.Delay(40, ct); continue; }

                var start = Stopwatch.GetTimestamp();
                var (w, q) = s.Want.Preset == "auto" ? AutoLevels[s.Level] : (s.Want.MaxWidth, s.Want.Quality);
                ScreenFrame f;
                try { f = _screen.Capture(s.Screen.Index, Math.Min(w, s.Want.MaxWidth), q); }
                catch (Exception ex) { f = new ScreenFrame(Array.Empty<byte>(), "", 0, 0, s.Screen, "Bild konnte nicht aufgenommen werden: " + ex.Message); }
                var capMs = (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
                s.CaptureMs = s.CaptureMs * 0.8 + capMs * 0.2;

                if (f.Problem != null)
                {
                    if (f.Problem != s.Problem) { s.Problem = f.Problem; s.LastHash = null; await _send(s.Rpc, "remote.state", new { sessionId = s.Info.Id, problem = f.Problem }); }
                    await Task.Delay(1000, ct);
                    continue;
                }
                if (s.Problem != null) { s.Problem = null; await _send(s.Rpc, "remote.state", new { sessionId = s.Info.Id, problem = (string?)null }); }

                var hash = Convert.ToHexString(SHA256.HashData(f.Data));
                // An unchanged picture is not sent again – only every 2 s, so the device sees the session is alive.
                if (hash == s.LastHash) s.Unchanged++; else s.Unchanged = 0;
                if (hash != s.LastHash || Stopwatch.GetElapsedTime(s.LastSentTicks) > TimeSpan.FromSeconds(2))
                {
                    s.LastHash = hash;
                    var seq = ++s.Seq;
                    s.SentAt[seq] = Stopwatch.GetTimestamp();
                    s.LastSentTicks = Stopwatch.GetTimestamp();
                    s.Frames++; s.Bytes += f.Data.Length;
                    await _send(s.Rpc, "remote.frame", new
                    {
                        sessionId = s.Info.Id, seq, mime = f.Mime, data = Convert.ToBase64String(f.Data), w = f.Width, h = f.Height,
                        sw = f.Screen.Width, sh = f.Screen.Height, quality = q, bytes = f.Data.Length, captureMs = Math.Round(capMs, 1), rtt = Math.Round(s.Rtt),
                    });
                }
                // Still picture: only 4 captures per second until something changes or the device sends input.
                var interval = s.Unchanged >= 3 ? Math.Max(250, 1000.0 / Math.Max(1, s.Want.Fps)) : 1000.0 / Math.Max(1, s.Want.Fps);
                var wait = interval - (Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency;
                var until = Stopwatch.GetTimestamp() + (long)(Math.Max(5, wait) * Stopwatch.Frequency / 1000);
                while (Stopwatch.GetTimestamp() < until && !(s.Unchanged == 0 && interval >= 250 && s.Want.Fps > 4)) await Task.Delay(10, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { Log.Error("remote", ex.Message); End("Fehler bei der Übertragung: " + ex.Message); }
    }

    public void Dispose() => End("Begleiter wird beendet.");
}
