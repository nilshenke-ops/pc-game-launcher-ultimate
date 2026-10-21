using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>Which protective steps the privacy button takes – chosen beforehand by the user.</summary>
public sealed class PrivacyConfig
{
    public bool StopSounds { get; set; } = true;
    public bool StopMicPassthrough { get; set; } = true;
    public bool MuteMic { get; set; }
    public bool QuietNotifications { get; set; } = true;
    /// <summary>Notification categories kept quiet; empty = all.</summary>
    public List<string> QuietCategories { get; set; } = new();
    public bool PauseOtherDevices { get; set; }
    public bool HideSensitive { get; set; } = true;
}

/// <summary>What one step really did: "active" (protects now), "done" (done once), "failed", "unsupported", "info".</summary>
public sealed record PrivacyResult(string Id, string Label, string Status, string Detail);

public sealed class PrivacyState
{
    public bool Active { get; set; }
    public DateTime? Since { get; set; }
    public string? By { get; set; }
    /// <summary>The device that switched it on – it keeps its connection when other devices are paused.</summary>
    public string? ByDeviceId { get; set; }
    public List<PrivacyResult> Results { get; set; } = new();
    /// <summary>For switching off: exactly what this mode changed (nothing else is touched).</summary>
    public List<string> MutedMics { get; set; } = new();
    public bool PausedOthers { get; set; }
    public bool HideSensitive { get; set; }
    public List<string>? QuietCategories { get; set; }
}

public sealed class PrivacyFile
{
    public PrivacyConfig Config { get; set; } = new();
    public PrivacyState State { get; set; } = new();
}

/// <summary>
/// Privacy / emergency button: stops the soundboard, switches off the mic passthrough, mutes the Windows default
/// microphone (Windows companion only), keeps notifications quiet, pauses other devices and hides sensitive content on
/// connected screens – only the steps the user selected. Every step reports what it really did; nothing claims to mute
/// Discord, games or other programs.
/// </summary>
public sealed class PrivacyService
{
    public static readonly string[] Categories = { "update", "launch", "automation", "plugin", "quest", "deal", "recording", "assistant", "gamemode", "calendar", "system" };

    readonly JsonStore<PrivacyFile> _store;
    readonly IAudioEngine _engine;
    readonly AudioService _audio;
    readonly Action _stopSounds;
    readonly IHub _hub;
    readonly object _lock = new();
    /// <summary>Pauses all device sessions except the given device; returns how many were paused.</summary>
    public Func<string?, int> PauseOthers { get; set; } = _ => 0;

    public PrivacyService(AppPaths paths, IAudioEngine engine, AudioService audio, Action stopSounds, IHub hub)
    {
        _store = new JsonStore<PrivacyFile>(paths.File("privacy.json"));
        _engine = engine; _audio = audio; _stopSounds = stopSounds; _hub = hub;
        audio.MicSuppressed = () => State.Active && State.Results.Any(r => r.Id == "passthrough" && r.Status == "active");
    }

    public PrivacyConfig Config => _store.Snapshot().Config;
    public PrivacyState State => _store.Snapshot().State;

    public PrivacyConfig Configure(PrivacyConfig c)
    {
        c.QuietCategories = c.QuietCategories.Where(Categories.Contains).Distinct().ToList();
        _store.Update(f => f.Config = c);
        _hub.Changed("privacy");
        return c;
    }

    public object Status()
    {
        var f = _store.Snapshot();
        return new
        {
            active = f.State.Active, since = f.State.Since, by = f.State.By, results = f.State.Results, hideSensitive = f.State.Active && f.State.HideSensitive,
            config = f.Config,
            can = new { sounds = _engine.Supported, passthrough = _engine.Supported, micMute = _engine.MicMuteSupported },
        };
    }

    /// <summary>Is this notification category kept quiet right now (no Windows pop-up, no push)?</summary>
    public bool Quiet(string category)
    {
        var s = State;
        return s.Active && s.QuietCategories != null && (s.QuietCategories.Count == 0 || s.QuietCategories.Contains(category));
    }

    /// <summary>Reason why a device may not sign in right now, or null.</summary>
    public string? Blocks(string deviceId)
    {
        var s = State;
        return s.Active && s.PausedOthers && deviceId != s.ByDeviceId ? "Der PC ist im Datenschutzmodus – andere Geräte sind bis zum Ausschalten pausiert. Die Kopplung bleibt bestehen." : null;
    }

    public object On(string by, string? deviceId)
    {
        lock (_lock)
        {
            if (State.Active) return Status();
            var c = Config;
            var r = new List<PrivacyResult>();
            var st = new PrivacyState { Active = true, Since = DateTime.UtcNow, By = by, ByDeviceId = deviceId };

            if (c.StopSounds)
            {
                if (!_engine.Supported) r.Add(new("sounds", "Soundboard stoppen", "unsupported", "Soundboard-Wiedergabe gibt es nur im Windows-Begleiter."));
                else try { _stopSounds(); r.Add(new("sounds", "Soundboard stoppen", "done", "Alle laufenden Sounds wurden gestoppt.")); }
                    catch (Exception ex) { r.Add(new("sounds", "Soundboard stoppen", "failed", ex.Message)); }
            }
            if (c.StopMicPassthrough)
            {
                if (!_engine.Supported) r.Add(new("passthrough", "Mikrofon-Durchleitung aus", "unsupported", "Die Durchleitung ins virtuelle Kabel gibt es nur im Windows-Begleiter."));
                else
                {
                    var was = _audio.MicPassthroughActive;
                    r.Add(new("passthrough", "Mikrofon-Durchleitung aus", "active", was
                        ? "Dein Mikrofon geht nicht mehr über das virtuelle Kabel (z. B. zu Discord) – bis zum Ausschalten."
                        : "War nicht an und bleibt bis zum Ausschalten aus."));
                }
            }
            if (c.MuteMic)
            {
                if (!_engine.MicMuteSupported) r.Add(new("mic", "Windows-Mikrofon stumm", "unsupported", "Das Windows-Mikrofon stummschalten geht nur im Windows-Begleiter."));
                else try
                    {
                        var ids = _engine.MuteDefaultMics();
                        st.MutedMics = ids.ToList();
                        r.Add(new("mic", "Windows-Mikrofon stumm", "active", ids.Count > 0
                            ? "Das Standard-Mikrofon ist in Windows stummgeschaltet. Andere Mikrofone (nicht Standard) sind nicht erfasst."
                            : "Das Standard-Mikrofon war schon stummgeschaltet – es bleibt so."));
                    }
                    catch (Exception ex) { r.Add(new("mic", "Windows-Mikrofon stumm", "failed", ex.Message)); }
            }
            if (c.QuietNotifications)
            {
                st.QuietCategories = c.QuietCategories.ToList();
                r.Add(new("notifications", "Benachrichtigungen leise", "active", (c.QuietCategories.Count == 0 ? "Alle Benachrichtigungen" : $"{c.QuietCategories.Count} Kategorien")
                    + " ohne Windows-Hinweis und ohne Push-Nachricht; sie werden weiter gespeichert. Benachrichtigungen anderer Programme sind nicht betroffen."));
            }
            if (c.PauseOtherDevices)
            {
                st.PausedOthers = true;
                // Saved before pausing so a device signing in again right away is already refused.
                _store.Update(f => f.State = st);
                var n = PauseOthers(deviceId);
                r.Add(new("devices", "Andere Geräte pausieren", "active", $"{n} {(n == 1 ? "Gerät" : "Geräte")} abgemeldet; bis zum Ausschalten keine neue Anmeldung (der PC selbst{(deviceId != null ? " und dieses Gerät" : "")} ausgenommen). Die Kopplungen bleiben bestehen."));
            }
            if (c.HideSensitive)
            {
                st.HideSensitive = true;
                r.Add(new("hide", "Inhalte verdecken", "active", "Benachrichtigungen, Dashboard-Widgets, Chats, Dateien und Aufnahmen werden in dieser App auf verbundenen Geräten verdeckt. Andere Programme und Bildschirmaufnahmen sind nicht betroffen."));
            }
            r.Add(new("note", "Nicht erfasst", "info", "Discord, Spiele und andere Programme werden nicht stummgeschaltet oder versteckt – nur die oben aufgeführten Schritte wirken."));
            st.Results = r;
            _store.Update(f => f.State = st);
            if (st.Results.Any(x => x.Id == "passthrough" && x.Status == "active")) _audio.ApplyMic();
            Log.Info("privacy", $"Datenschutzmodus an (von {by}).");
            _hub.Changed("privacy");
            return Status();
        }
    }

    public object Off(string by)
    {
        lock (_lock)
        {
            var st = State;
            if (!st.Active) return Status();
            if (st.MutedMics.Count > 0) try { _engine.UnmuteMics(st.MutedMics); } catch (Exception ex) { Log.Warn("privacy", ex.Message); }
            var passthrough = st.Results.Any(x => x.Id == "passthrough" && x.Status == "active");
            _store.Update(f => f.State = new PrivacyState());
            if (passthrough) _audio.ApplyMic(); // back to what the audio settings say
            Log.Info("privacy", $"Datenschutzmodus aus (von {by}).");
            _hub.Changed("privacy");
            return Status();
        }
    }
}
