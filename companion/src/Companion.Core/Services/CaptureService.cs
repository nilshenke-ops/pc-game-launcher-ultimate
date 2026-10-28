using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>A program that records games. Actions: "record" (start/stop), "replay" (save the last moments), "buffer" (replay buffer on/off), "overlay".</summary>
public sealed record CaptureProvider(string Id, string Name, string[] Actions, IReadOnlyDictionary<string, string> Defaults, string Note);

public static class CaptureProviders
{
    /// <summary>
    /// OBS is controlled through its WebSocket interface (with feedback). NVIDIA, Xbox Game Bar, Steam and Discord offer no
    /// interface for other programs: the launcher presses their keyboard shortcuts for you. Defaults are only filled in
    /// where they are the documented factory settings; everything else is entered as set up in the respective program.
    /// </summary>
    public static readonly IReadOnlyList<CaptureProvider> All = new[]
    {
        new CaptureProvider("obs", "OBS Studio", new[] { "record", "replay", "buffer" }, new Dictionary<string, string>(),
            "Steuerung über die OBS-WebSocket-Schnittstelle, mit Rückmeldung (Aufnahme läuft, Replay gespeichert)."),
        new CaptureProvider("nvidia", "NVIDIA App / GeForce Experience", new[] { "record", "replay", "buffer", "overlay" },
            new Dictionary<string, string> { ["record"] = "Alt+F9", ["replay"] = "Alt+F10", ["buffer"] = "Alt+Shift+F10", ["overlay"] = "Alt+Z" },
            "Der Launcher drückt die Tastenkürzel der NVIDIA-App. Ob die Aufnahme läuft, zeigt NVIDIA selbst an."),
        new CaptureProvider("xbox", "Xbox Game Bar", new[] { "record", "replay", "overlay" },
            new Dictionary<string, string> { ["record"] = "Alt+Win+R", ["replay"] = "Alt+Win+G", ["overlay"] = "Win+G" },
            "Der Launcher drückt die Tastenkürzel der Game Bar. „Replay speichern“ braucht „Im Hintergrund aufzeichnen“ in den Windows-Einstellungen (Spielen → Aufzeichnungen)."),
        new CaptureProvider("steam", "Steam (Spielaufnahme)", new[] { "record", "replay", "overlay" },
            new Dictionary<string, string> { ["overlay"] = "Shift+Tab" },
            "Funktioniert in Spielen, die über Steam laufen. Die Tasten für Aufnahme und Clip wie in Steam → Einstellungen → Spielaufnahme eintragen."),
        new CaptureProvider("medal", "Medal", new[] { "record", "replay" }, new Dictionary<string, string> { ["replay"] = "F8" },
            "Der Launcher drückt die Tastenkürzel von Medal: Clip = F8 (Werkseinstellung). Für „Aufnahme starten/stoppen“ die Taste wie in Medal → Einstellungen → Hotkeys eintragen. Clips und Screenshots aus dem Medal-Ordner erscheinen automatisch unter Aufnahmen."),
        new CaptureProvider("discord", "Discord", new[] { "replay", "overlay" }, new Dictionary<string, string>(),
            "Discord kann keine durchgehende Aufnahme, nur Clips (die letzten Sekunden). Die Tasten wie in Discord → Einstellungen → Clips bzw. Overlay eintragen."),
    };

    public static CaptureProvider? Get(string? id) => All.FirstOrDefault(p => p.Id == id);

    public static string Label(string action) => action switch
    {
        "record" => "Aufnahme starten/stoppen", "replay" => "Replay speichern", "buffer" => "Replay-Puffer an/aus", "overlay" => "Overlay öffnen", _ => action,
    };
}

/// <summary>Runs recording/replay/overlay actions with the program chosen under "Overlay &amp; Aufnahme".</summary>
public sealed class CaptureService(Func<Settings> settings, SettingsService store, ObsService obs, IPlatform platform)
{
    /// <summary>Combinations registered as the launcher's own hotkeys (sending one of them would only trigger the launcher again).</summary>
    public Func<IEnumerable<string>> OwnHotkeys { get; set; } = () => Array.Empty<string>();

    public string? KeyFor(Settings s, string provider, string action) =>
        s.CaptureKeys.TryGetValue($"{provider}.{action}", out var k) ? (string.IsNullOrEmpty(k) ? null : k)
        : CaptureProviders.Get(provider)?.Defaults.GetValueOrDefault(action);

    public static readonly string[] Functions = { "record", "replay", "buffer" };

    /// <summary>Program for one function: own choice for it (e.g. replays as Discord clips), else the main program.</summary>
    public static string ProviderFor(Settings s, string action) =>
        s.CaptureActionProviders.TryGetValue(action, out var p) && CaptureProviders.Get(p)?.Actions.Contains(action) == true ? p : s.CaptureProvider;

    public async Task<object> Status()
    {
        var s = settings();
        return new
        {
            provider = s.CaptureProvider,
            overlayProvider = s.OverlayProvider,
            actionProviders = s.CaptureActionProviders,
            effectiveProviders = Functions.ToDictionary(a => a, a => ProviderFor(s, a)),
            keys = s.CaptureKeys,
            canSendKeys = platform.KeySender.Supported,
            providers = CaptureProviders.All.Select(p => new
            {
                p.Id, p.Name, p.Actions, p.Note, defaults = p.Defaults,
                effective = p.Actions.ToDictionary(a => a, a => KeyFor(s, p.Id, a)),
            }),
            obs = Functions.Any(a => ProviderFor(s, a) == "obs") ? await obs.Status() : null,
        };
    }

    public Settings Configure(string? provider, string? overlayProvider, Dictionary<string, string?>? keys, Dictionary<string, string?>? actionProviders = null)
    {
        foreach (var (a, p) in actionProviders ?? new())
        {
            if (!Functions.Contains(a)) throw new RpcException("invalid-params", $"Unbekannte Funktion „{a}“.");
            if (p != null && CaptureProviders.Get(p)?.Actions.Contains(a) != true)
                throw new RpcException("invalid-params", $"{CaptureProviders.Get(p)?.Name ?? p} kann „{CaptureProviders.Label(a)}“ nicht.");
        }
        if (provider != null && CaptureProviders.Get(provider) == null) throw new RpcException("invalid-params", "Unbekanntes Aufnahme-Programm.");
        if (overlayProvider != null && overlayProvider != "own" && CaptureProviders.Get(overlayProvider)?.Actions.Contains("overlay") != true)
            throw new RpcException("invalid-params", "Dieses Programm hat kein Overlay, das der Launcher öffnen kann.");
        var clean = new Dictionary<string, string?>();
        foreach (var (k, v) in keys ?? new())
        {
            var parts = k.Split('.');
            if (parts.Length != 2 || CaptureProviders.Get(parts[0]) is not { } p || p.Id == "obs" || !p.Actions.Contains(parts[1]))
                throw new RpcException("invalid-params", $"Unbekannte Taste „{k}“.");
            if (string.IsNullOrWhiteSpace(v)) { clean[k] = v == null ? null : ""; continue; } // null = factory default, "" = none
            var n = HotkeyService.Normalize(v);
            if (n == null || n.Contains("Mouse")) throw new RpcException("invalid-params", $"„{v}“ ist keine sendbare Tastenkombination (Maustasten können nicht gesendet werden).");
            clean[k] = n;
        }
        return store.SetCapture(provider, overlayProvider, clean, actionProviders ?? new());
    }

    /// <summary>Runs "record", "replay" or "buffer" with the program chosen for it. Returns a readable result.</summary>
    public async Task<string> Run(string action)
    {
        var s = settings();
        var provider = ProviderFor(s, action);
        if (provider == "obs")
            return action switch { "record" => await obs.RecordToggle(), "replay" => await obs.ReplaySave(), _ => await obs.ReplayBufferToggle() };
        return await Press(s, provider, action);
    }

    /// <summary>"mini" is always the launcher's own window; "full" opens the chosen program's overlay or the launcher's own one.</summary>
    public async Task<string?> ToggleOverlay(string mode)
    {
        var s = settings();
        if (mode == "mini" || s.OverlayProvider == "own") return platform.Overlay.Toggle(mode);
        try { await Press(s, s.OverlayProvider, "overlay"); return null; }
        catch (RpcException ex) { return ex.Message; }
    }

    async Task<string> Press(Settings s, string providerId, string action)
    {
        var p = CaptureProviders.Get(providerId) ?? throw new RpcException("invalid-params", "Unbekanntes Aufnahme-Programm.");
        var label = CaptureProviders.Label(action);
        if (!p.Actions.Contains(action)) throw new RpcException("unsupported", $"{p.Name} kann „{label}“ nicht.");
        var key = KeyFor(s, p.Id, action) ?? throw new RpcException("unsupported", $"Für {p.Name} ist keine Taste für „{label}“ eingetragen – unter „Overlay & Aufnahme“ dieselbe Taste wie in {p.Name} eintragen.");
        if (OwnHotkeys().Any(h => string.Equals(HotkeyService.Normalize(h) ?? h, key, StringComparison.OrdinalIgnoreCase)))
            throw new RpcException("conflict", $"{key} ist auch ein Hotkey des Launchers – dann bekommt {p.Name} die Taste nie. Entweder den Hotkey im Launcher löschen (dann reagiert {p.Name} direkt) oder in {p.Name} eine andere Taste wählen und hier eintragen.");
        if (await platform.KeySender.SendAsync(key) is { } err) throw new RpcException("unsupported", err);
        Log.Info("capture", $"{label}: {key} an {p.Name} gesendet");
        return $"{label}: {key} an {p.Name} gesendet";
    }
}
