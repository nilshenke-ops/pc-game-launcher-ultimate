using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public sealed class LayoutWindow
{
    public string Process { get; set; } = "";
    /// <summary>Part of the window title to pick one of several windows of a program (optional).</summary>
    public string? TitleContains { get; set; }
    public string MonitorId { get; set; } = "";
    public string? MonitorName { get; set; }
    /// <summary>Position relative to the monitor's work area – the layout still fits when monitors are arranged differently.</summary>
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string State { get; set; } = "normal";
    /// <summary>Position as a preset instead of exact pixels (made without the PC): max, left, right, top, bottom,
    /// top-left, top-right, bottom-left, bottom-right, center. Computed from the monitor when the layout is applied.</summary>
    public string? Preset { get; set; }
    /// <summary>With a preset: which monitor (0 = main monitor, 1 = the next one …) if no monitor id is stored.</summary>
    public int? MonitorIndex { get; set; }
}

public sealed class WindowLayout
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<LayoutWindow> Windows { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}

public sealed class WindowLayoutsFile { public List<WindowLayout> Layouts { get; set; } = new(); }

public sealed record LayoutResult(string Process, string Result, bool Ok);

/// <summary>
/// Window and monitor layouts: save where programs sit (e.g. Discord on the second monitor, OBS maximized) and put them
/// back with one tap. Only windows that are open are moved – nothing is started. A missing monitor is reported and the
/// window goes to the main monitor instead.
/// </summary>
public sealed class WindowLayoutService
{
    static readonly Regex Id = new("^lay_[A-Za-z0-9_-]{1,40}$");
    static readonly Regex Proc = new(@"^[A-Za-z0-9 ._()\-]{1,80}$");
    static readonly string[] States = { "normal", "maximized", "minimized" };
    public static readonly string[] Presets = { "max", "left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right", "center" };

    /// <summary>Rectangle of a preset on a monitor (work area) – relative to the monitor's top left corner.</summary>
    public static (int x, int y, int w, int h) PresetRect(string preset, int mw, int mh) => preset switch
    {
        "left" => (0, 0, mw / 2, mh), "right" => (mw - mw / 2, 0, mw / 2, mh),
        "top" => (0, 0, mw, mh / 2), "bottom" => (0, mh - mh / 2, mw, mh / 2),
        "top-left" => (0, 0, mw / 2, mh / 2), "top-right" => (mw - mw / 2, 0, mw / 2, mh / 2),
        "bottom-left" => (0, mh - mh / 2, mw / 2, mh / 2), "bottom-right" => (mw - mw / 2, mh - mh / 2, mw / 2, mh / 2),
        "center" => (mw / 6, mh / 6, mw * 2 / 3, mh * 2 / 3),
        _ => (0, 0, mw, mh),
    };
    readonly JsonStore<WindowLayoutsFile> _store;
    readonly IWindowManager _wm;
    readonly IHub _hub;

    public WindowLayoutService(AppPaths paths, IWindowManager wm, IHub hub)
    {
        _store = new JsonStore<WindowLayoutsFile>(paths.File("window-layouts.json"));
        _wm = wm; _hub = hub;
    }

    public object List() => new { layouts = _store.Snapshot().Layouts, supported = _wm.Supported, monitors = _wm.Monitors() };

    /// <summary>Open windows right now (to pick which go into a layout).</summary>
    public object Current()
    {
        if (!_wm.Supported) throw new RpcException("not-supported", "Fenster-Layouts gehen nur im Windows-Begleiter.");
        return new { monitors = _wm.Monitors(), windows = _wm.Windows().Select(w => new { w.Process, w.Title, w.State, w.MonitorId }) };
    }

    /// <summary>Saves the current position of the chosen programs (all open program windows if none are given).</summary>
    public WindowLayout Capture(string id, string name, IReadOnlyCollection<string>? processes)
    {
        if (!_wm.Supported) throw new RpcException("not-supported", "Fenster-Layouts gehen nur im Windows-Begleiter.");
        var monitors = _wm.Monitors();
        var windows = _wm.Windows().Where(w => processes == null || processes.Count == 0 || processes.Contains(w.Process, StringComparer.OrdinalIgnoreCase))
            .GroupBy(w => w.Process, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).Take(30).ToList();
        if (windows.Count == 0) throw new RpcException("not-found", "Keines der gewählten Programme hat gerade ein offenes Fenster.");
        var layout = new WindowLayout
        {
            Id = id, Name = name,
            Windows = windows.Select(w =>
            {
                var m = monitors.FirstOrDefault(x => x.Id == w.MonitorId) ?? monitors.FirstOrDefault(x => x.Primary) ?? new MonitorInfo("", "", 0, 0, 0, 0, true);
                return new LayoutWindow { Process = w.Process, MonitorId = m.Id, MonitorName = m.Name, X = w.X - m.X, Y = w.Y - m.Y, Width = w.Width, Height = w.Height, State = w.State == "minimized" ? "normal" : w.State };
            }).ToList(),
        };
        return Save(layout);
    }

    public WindowLayout Save(WindowLayout l)
    {
        if (!Id.IsMatch(l.Id ?? "")) throw new RpcException("invalid-params", "Ungültige Kennung.");
        l.Name = DeviceStore.Sanitize(l.Name, 40, "");
        if (l.Name.Length == 0) throw new RpcException("invalid-params", "Das Layout braucht einen Namen.");
        if (l.Windows.Count > 30) throw new RpcException("invalid-params", "Höchstens 30 Fenster pro Layout.");
        foreach (var w in l.Windows)
        {
            if (!Proc.IsMatch(w.Process ?? "")) throw new RpcException("invalid-params", "Ungültiger Programmname.");
            if (!States.Contains(w.State)) throw new RpcException("invalid-params", "Ungültiger Fensterzustand.");
            if (w.Preset != null)
            {
                if (!Presets.Contains(w.Preset)) throw new RpcException("invalid-params", "Unbekannte Position.");
                if (w.MonitorIndex is < 0 or > 8) throw new RpcException("invalid-params", "Ungültiger Monitor.");
                if (w.Preset == "max") w.State = "maximized";
                w.X = w.Y = 0; w.Width = Math.Max(w.Width, 100); w.Height = Math.Max(w.Height, 80);
            }
            if (w.Width is < 100 or > 16000 || w.Height is < 80 or > 16000 || Math.Abs(w.X) > 16000 || Math.Abs(w.Y) > 16000) throw new RpcException("invalid-params", "Ungültige Fenstergröße.");
            w.TitleContains = string.IsNullOrWhiteSpace(w.TitleContains) ? null : DeviceStore.Sanitize(w.TitleContains, 60, "");
            w.MonitorId = (w.MonitorId ?? "").Length > 64 ? "" : w.MonitorId ?? "";
        }
        l.UpdatedAt = DateTime.UtcNow;
        _store.Update(f =>
        {
            var i = f.Layouts.FindIndex(x => x.Id == l.Id);
            if (i >= 0) f.Layouts[i] = l;
            else { if (f.Layouts.Count >= 30) throw new RpcException("invalid-params", "Höchstens 30 Layouts."); f.Layouts.Add(l); }
        });
        _hub.Changed("layouts");
        return l;
    }

    public void Remove(string id) { _store.Update(f => f.Layouts.RemoveAll(x => x.Id == id)); _hub.Changed("layouts"); }

    /// <summary>Puts every open window of the layout back. Programs that are not open are skipped (named in the result).</summary>
    public List<LayoutResult> Apply(string id)
    {
        if (!_wm.Supported) throw new RpcException("not-supported", "Fenster-Layouts gehen nur im Windows-Begleiter.");
        var l = _store.Get(f => f.Layouts.FirstOrDefault(x => x.Id == id)) ?? throw new RpcException("not-found", "Layout nicht gefunden.");
        var monitors = _wm.Monitors();
        var windows = _wm.Windows();
        var results = new List<LayoutResult>();
        foreach (var e in l.Windows)
        {
            var w = windows.FirstOrDefault(x => x.Process.Equals(e.Process, StringComparison.OrdinalIgnoreCase) && (e.TitleContains == null || x.Title.Contains(e.TitleContains, StringComparison.OrdinalIgnoreCase)));
            if (w == null) { results.Add(new LayoutResult(e.Process, "nicht geöffnet – übersprungen", false)); continue; }
            var ordered = monitors.OrderByDescending(x => x.Primary).ThenBy(x => x.X).ThenBy(x => x.Y).ToList();
            var m = e.MonitorId.Length > 0 ? monitors.FirstOrDefault(x => x.Id == e.MonitorId)
                : e.MonitorIndex is int mi ? ordered.ElementAtOrDefault(mi) : ordered.FirstOrDefault();
            var note = "";
            if (m == null) { m = monitors.FirstOrDefault(x => x.Primary) ?? monitors.FirstOrDefault(); note = $" (Monitor „{e.MonitorName ?? (e.MonitorIndex is int mi2 ? $"Monitor {mi2 + 1}" : e.MonitorId)}“ fehlt – auf den Hauptmonitor)"; }
            if (m == null) { results.Add(new LayoutResult(e.Process, "kein Monitor gefunden", false)); continue; }
            if (e.Preset != null)
            {
                var (px, py, pw, ph) = PresetRect(e.Preset, m.Width, m.Height);
                var perr = _wm.Place(w.Handle, m.X + px, m.Y + py, pw, ph, e.Preset == "max" ? "maximized" : "normal");
                results.Add(new LayoutResult(e.Process, perr ?? ("an seinen Platz" + note), perr == null));
                continue;
            }
            // Keep the window on the monitor even if that one is smaller now.
            var width = Math.Min(e.Width, m.Width); var height = Math.Min(e.Height, m.Height);
            var x = m.X + Math.Clamp(e.X, 0, Math.Max(0, m.Width - width));
            var y = m.Y + Math.Clamp(e.Y, 0, Math.Max(0, m.Height - height));
            var err = _wm.Place(w.Handle, x, y, width, height, e.State);
            results.Add(new LayoutResult(e.Process, err ?? ("an seinen Platz" + note), err == null));
        }
        return results;
    }

    internal WindowLayoutsFile Export() => _store.Snapshot();
    internal void ImportChecked(WindowLayoutsFile f)
    {
        var ok = new List<WindowLayout>();
        foreach (var l in f.Layouts.Take(30)) { try { Save(l); ok.Add(l); } catch (RpcException ex) { Log.Warn("layouts", $"Layout „{l.Name}“ übersprungen: {ex.Message}"); } }
        _store.Replace(new WindowLayoutsFile { Layouts = ok });
        _hub.Changed("layouts");
    }
}
