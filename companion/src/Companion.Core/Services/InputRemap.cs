using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>Keys and mouse buttons by name, with their Windows virtual-key code (mouse buttons use the VK codes 1–6).</summary>
public static class KeyCatalog
{
    public static readonly IReadOnlyDictionary<string, int> Codes = Build();
    public static readonly IReadOnlyDictionary<int, string> Names = Codes.GroupBy(kv => kv.Value).ToDictionary(g => g.Key, g => g.First().Key);
    /// <summary>Modifiers allowed in front of a target key ("Ctrl+Shift+M").</summary>
    public static readonly IReadOnlyDictionary<string, int> Modifiers = new Dictionary<string, int> { ["Ctrl"] = 0xA2, ["Shift"] = 0xA0, ["Alt"] = 0xA4, ["Win"] = 0x5B };
    public static readonly int[] MouseCodes = { 0x01, 0x02, 0x04, 0x05, 0x06 };
    public const int F12 = 0x7B;

    static Dictionary<string, int> Build()
    {
        var d = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var c = 'A'; c <= 'Z'; c++) d[c.ToString()] = c;
        for (var i = 0; i <= 9; i++) { d[i.ToString()] = 0x30 + i; d["Num" + i] = 0x60 + i; }
        for (var i = 1; i <= 24; i++) d["F" + i] = 0x6F + i;
        foreach (var (n, v) in new (string, int)[]
        {
            ("Esc", 0x1B), ("Tab", 0x09), ("CapsLock", 0x14), ("LShift", 0xA0), ("RShift", 0xA1), ("LCtrl", 0xA2), ("RCtrl", 0xA3),
            ("LAlt", 0xA4), ("RAlt", 0xA5), ("LWin", 0x5B), ("RWin", 0x5C), ("Menu", 0x5D), ("Space", 0x20), ("Enter", 0x0D), ("Backspace", 0x08),
            ("Insert", 0x2D), ("Delete", 0x2E), ("Home", 0x24), ("End", 0x23), ("PageUp", 0x21), ("PageDown", 0x22),
            ("Left", 0x25), ("Up", 0x26), ("Right", 0x27), ("Down", 0x28), ("PrintScreen", 0x2C), ("ScrollLock", 0x91), ("Pause", 0x13), ("NumLock", 0x90),
            ("NumMul", 0x6A), ("NumAdd", 0x6B), ("NumSub", 0x6D), ("NumDecimal", 0x6E), ("NumDiv", 0x6F),
            ("Oem1", 0xBA), ("OemPlus", 0xBB), ("OemComma", 0xBC), ("OemMinus", 0xBD), ("OemPeriod", 0xBE), ("Oem2", 0xBF), ("Oem3", 0xC0),
            ("Oem4", 0xDB), ("Oem5", 0xDC), ("Oem6", 0xDD), ("Oem7", 0xDE), ("Oem102", 0xE2),
            ("VolumeMute", 0xAD), ("VolumeDown", 0xAE), ("VolumeUp", 0xAF), ("MediaNext", 0xB0), ("MediaPrev", 0xB1), ("MediaStop", 0xB2), ("MediaPlayPause", 0xB3),
            ("MouseLeft", 0x01), ("MouseRight", 0x02), ("MouseMiddle", 0x04), ("Mouse4", 0x05), ("Mouse5", 0x06),
        }) d[n] = v;
        return d;
    }

    public static string Name(int code) => Names.TryGetValue(code, out var n) ? n : $"0x{code:X2}";
}

/// <summary>A parsed target: optional modifiers plus one key or mouse button – or nothing (the key is switched off).</summary>
public sealed record RemapTarget(int[] Modifiers, int Key)
{
    public bool Disabled => Key == 0;

    /// <summary>"None" = switch off; otherwise "Key" or "Ctrl+Shift+Key". One key only – sequences/macros are not possible.</summary>
    public static RemapTarget? Parse(string? s)
    {
        if (string.IsNullOrWhiteSpace(s) || s == "None") return new RemapTarget(Array.Empty<int>(), 0);
        var parts = s.Split('+');
        if (parts.Length > 4) return null;
        var mods = new List<int>();
        foreach (var p in parts[..^1])
        {
            if (!KeyCatalog.Modifiers.TryGetValue(p, out var m) || mods.Contains(m)) return null;
            mods.Add(m);
        }
        if (!KeyCatalog.Codes.TryGetValue(parts[^1], out var key)) return null;
        return new RemapTarget(mods.ToArray(), key);
    }
}

public sealed class KeyMapping
{
    public string From { get; set; } = "";
    /// <summary>"None" switches the key off, else a key or a shortcut like "Ctrl+Shift+M".</summary>
    public string To { get; set; } = "None";
}

public sealed class RemapProfile
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public bool Enabled { get; set; } = true;
    /// <summary>Program names (without .exe) for which the profile applies; empty = everywhere.</summary>
    public List<string> Processes { get; set; } = new();
    public List<KeyMapping> Mappings { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}

public sealed class RemapFile { public List<RemapProfile> Profiles { get; set; } = new(); }

/// <summary>
/// Decides for every real key/button event what is sent instead. Profiles for the program in the foreground override
/// the ones for "everywhere" key by key. A key pressed while mapped is released as mapped, even if the profile changes
/// in between – nothing gets stuck. Ctrl+Alt+F12 pauses/resumes all mappings (emergency stop).
/// </summary>
public sealed class RemapEngine
{
    readonly Dictionary<int, RemapTarget> _global = new();
    readonly Dictionary<string, Dictionary<int, RemapTarget>> _perProcess = new(StringComparer.OrdinalIgnoreCase);
    readonly Dictionary<int, InputAction[]> _held = new();
    readonly HashSet<int> _physical = new();
    readonly object _lock = new();
    bool _swallowF12Up;

    public bool Paused { get; private set; }
    public event Action<bool>? PausedChanged;
    public bool UsesKeyboard { get; }
    public bool UsesMouse { get; }

    public RemapEngine(IEnumerable<RemapProfile> profiles, bool paused = false)
    {
        Paused = paused;
        var enabled = profiles.Where(p => p.Enabled).ToList();
        foreach (var p in enabled.Where(p => p.Processes.Count == 0)) Add(_global, p);
        foreach (var p in enabled.Where(p => p.Processes.Count > 0))
            foreach (var proc in p.Processes)
            {
                if (!_perProcess.TryGetValue(proc, out var map)) _perProcess[proc] = map = new Dictionary<int, RemapTarget>(_global);
                Add(map, p);
            }
        var sources = _global.Keys.Concat(_perProcess.Values.SelectMany(m => m.Keys)).ToHashSet();
        UsesMouse = sources.Any(KeyCatalog.MouseCodes.Contains);
        UsesKeyboard = sources.Any(c => !KeyCatalog.MouseCodes.Contains(c));
    }

    static void Add(Dictionary<int, RemapTarget> map, RemapProfile p)
    {
        foreach (var m in p.Mappings)
            if (KeyCatalog.Codes.TryGetValue(m.From, out var from) && RemapTarget.Parse(m.To) is { } t) map[from] = t;
    }

    public bool IsEmpty => _global.Count == 0 && _perProcess.Count == 0;

    /// <summary>Takes over keys that are held right now from the engine this one replaces (a profile saved mid-press
    /// must still release the mapped key).</summary>
    public void Adopt(RemapEngine? old)
    {
        if (old == null) return;
        lock (old._lock) lock (_lock)
        {
            foreach (var (k, v) in old._held) _held[k] = v;
            foreach (var k in old._physical) _physical.Add(k);
            _swallowF12Up = old._swallowF12Up;
        }
    }

    static bool Any(HashSet<int> s, params int[] codes) => codes.Any(s.Contains);

    /// <summary>Returns null to let the event through, otherwise the events to send instead (empty = swallow).</summary>
    public InputAction[]? Handle(int code, bool down, string? process)
    {
        bool? pausedNow = null;
        InputAction[]? result;
        lock (_lock)
        {
            if (down) _physical.Add(code); else _physical.Remove(code);
            if (code == KeyCatalog.F12 && down && Any(_physical, 0xA2, 0xA3, 0x11) && Any(_physical, 0xA4, 0xA5, 0x12))
            {
                Paused = !Paused; pausedNow = Paused; _swallowF12Up = true;
                // Release everything that is held as mapped, so no key stays pressed.
                result = _held.Values.SelectMany(a => a).ToArray();
                _held.Clear();
            }
            else if (code == KeyCatalog.F12 && !down && _swallowF12Up) { _swallowF12Up = false; result = Array.Empty<InputAction>(); }
            else if (!down && _held.Remove(code, out var ups)) result = ups;
            else if (Paused) result = null;
            else
            {
                var map = process != null && _perProcess.TryGetValue(process, out var m) ? m : _global;
                if (!map.TryGetValue(code, out var t)) result = null;
                else if (t.Disabled) { if (down) _held[code] = Array.Empty<InputAction>(); result = down ? Array.Empty<InputAction>() : null; }
                else if (!down) result = null; // pressed before the mapping existed: release normally
                else if (_held.ContainsKey(code)) result = new[] { new InputAction(t.Key, true) }; // auto-repeat
                else
                {
                    result = t.Modifiers.Select(x => new InputAction(x, true)).Append(new InputAction(t.Key, true)).ToArray();
                    _held[code] = new[] { new InputAction(t.Key, false) }.Concat(t.Modifiers.Reverse().Select(x => new InputAction(x, false))).ToArray();
                }
            }
        }
        if (pausedNow is { } p) PausedChanged?.Invoke(p);
        return result;
    }
}

/// <summary>
/// Key and mouse-button remapping on the PC: profiles for everywhere or per game, switched by the program in the
/// foreground. One key becomes another key, a shortcut, a mouse button or nothing – never a sequence (no macros).
/// </summary>
public sealed class InputRemapService : IDisposable
{
    static readonly Regex Id = new("^rmp_[A-Za-z0-9_-]{1,40}$");
    static readonly Regex Proc = new(@"^[A-Za-z0-9 ._()\-]{1,80}$");
    public const int MaxProfiles = 30, MaxMappings = 100;
    readonly JsonStore<RemapFile> _store;
    readonly IInputHook _hook;
    readonly IHub _hub;
    RemapEngine? _engine;
    bool _paused;
    string? _hookError;

    public InputRemapService(AppPaths paths, IInputHook hook, IHub hub)
    {
        _store = new JsonStore<RemapFile>(paths.File("input-remap.json"));
        _hook = hook; _hub = hub;
        Apply();
    }

    public object List() => new
    {
        profiles = _store.Snapshot().Profiles, supported = _hook.Supported, paused = _paused, active = _engine != null && !_engine.IsEmpty,
        hookError = _hookError, maxMappings = MaxMappings,
    };

    public object Devices()
    {
        var list = _hook.Devices();
        return new
        {
            supported = _hook.Supported,
            devices = list.Select(d => new { d.Kind, d.Name, d.Manufacturer, d.Vid, d.Pid, brand = Brand(d) }),
        };
    }

    /// <summary>Recognized only by the name the device reports – the remapping itself works for every keyboard and mouse.</summary>
    internal static string? Brand(InputDevice d)
    {
        var s = $"{d.Manufacturer} {d.Name}".ToLowerInvariant();
        if (s.Contains("royal kludge") || s.Contains("royalkludge") || Regex.IsMatch(s, @"\brk[- ]?(61|68|71|75|84|87|96|98|100|m65|m75|r65|h81|s98)\b")) return "Royal Kludge";
        if (s.Contains("attack shark") || s.Contains("attackshark")) return "Attack Shark";
        return null;
    }

    public RemapProfile Save(RemapProfile p)
    {
        if (!Id.IsMatch(p.Id ?? "")) throw new RpcException("invalid-params", "Ungültige Kennung.");
        p.Name = DeviceStore.Sanitize(p.Name, 40, "");
        if (p.Name.Length == 0) throw new RpcException("invalid-params", "Das Profil braucht einen Namen.");
        p.Processes = (p.Processes ?? new()).Select(x => x.Trim().EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? x.Trim()[..^4] : x.Trim())
            .Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (p.Processes.Count > 10 || p.Processes.Any(x => !Proc.IsMatch(x))) throw new RpcException("invalid-params", "Ungültiger Programmname (höchstens 10).");
        p.Mappings ??= new();
        if (p.Mappings.Count > MaxMappings) throw new RpcException("invalid-params", $"Höchstens {MaxMappings} Belegungen pro Profil.");
        var seen = new HashSet<int>();
        foreach (var m in p.Mappings)
        {
            if (!KeyCatalog.Codes.TryGetValue(m.From ?? "", out var from)) throw new RpcException("invalid-params", $"Unbekannte Taste „{m.From}“.");
            if (from == 0x01) throw new RpcException("invalid-params", "Die linke Maustaste lässt sich nicht umlegen – sonst kommst du nicht mehr an die Einstellungen.");
            if (!seen.Add(from)) throw new RpcException("invalid-params", $"„{m.From}“ ist doppelt belegt.");
            if (RemapTarget.Parse(m.To) is null) throw new RpcException("invalid-params", $"Ungültige Belegung „{m.To}“ – erlaubt sind eine Taste, eine Tastenkombination (z. B. Ctrl+Shift+M), eine Maustaste oder „aus“.");
            m.From = KeyCatalog.Name(from);
            m.To = string.IsNullOrWhiteSpace(m.To) ? "None" : m.To;
        }
        p.UpdatedAt = DateTime.UtcNow;
        _store.Update(f =>
        {
            var i = f.Profiles.FindIndex(x => x.Id == p.Id);
            if (i >= 0) f.Profiles[i] = p;
            else { if (f.Profiles.Count >= MaxProfiles) throw new RpcException("limit", $"Höchstens {MaxProfiles} Profile."); f.Profiles.Add(p); }
        });
        Apply();
        return p;
    }

    public void Remove(string id) { _store.Update(f => f.Profiles.RemoveAll(x => x.Id == id)); Apply(); }

    public void SetEnabled(string id, bool enabled)
    {
        var found = false;
        _store.Update(f => { var p = f.Profiles.FirstOrDefault(x => x.Id == id); if (p != null) { p.Enabled = enabled; found = true; } });
        if (!found) throw new RpcException("not-found", "Profil nicht gefunden.");
        Apply();
    }

    /// <summary>Pause/resume all mappings (same as Ctrl+Alt+F12 on the PC).</summary>
    public void SetPaused(bool paused) { _paused = paused; Apply(); }

    /// <summary>Waits until a key or mouse button is pressed on the PC (to pick it without searching the list).</summary>
    public async Task<object> CaptureAsync(CancellationToken ct)
    {
        if (!_hook.Supported) throw new RpcException("not-supported", "Tasten abfragen geht nur im Windows-Begleiter.");
        var code = await _hook.CaptureNextAsync(TimeSpan.FromSeconds(10), ct);
        Apply(); // the capture may have replaced the hooks
        if (code == null) throw new RpcException("timeout", "In 10 Sekunden wurde keine Taste am PC gedrückt.");
        return new { key = KeyCatalog.Name(code.Value), known = KeyCatalog.Names.ContainsKey(code.Value) };
    }

    void Apply()
    {
        var engine = new RemapEngine(_store.Snapshot().Profiles, _paused);
        engine.Adopt(_engine);
        engine.PausedChanged += p => { _paused = p; Log.Info("input", p ? "Tastenbelegung pausiert (Strg+Alt+F12)" : "Tastenbelegung wieder an"); _hub.Changed("input"); };
        _engine = engine;
        _hookError = null;
        if (!_hook.Supported) { _hub.Changed("input"); return; }
        try
        {
            if (engine.IsEmpty) _hook.Stop();
            else _hook.Start(engine.Handle, keyboard: true, mouse: engine.UsesMouse); // keyboard always: Ctrl+Alt+F12 must work
        }
        catch (Exception ex) { _hookError = "Windows hat die Tastenbelegung nicht zugelassen: " + ex.Message; Log.Warn("input", _hookError); }
        _hub.Changed("input");
    }

    internal RemapFile Export() => _store.Snapshot();
    internal void ImportChecked(RemapFile f)
    {
        var ok = new List<RemapProfile>();
        _store.Replace(new RemapFile());
        foreach (var p in f.Profiles.Take(MaxProfiles)) { try { Save(p); ok.Add(p); } catch (RpcException ex) { Log.Warn("input", $"Profil „{p.Name}“ übersprungen: {ex.Message}"); } }
        Apply();
    }

    public void Dispose() { try { _hook.Stop(); } catch { } }
}
