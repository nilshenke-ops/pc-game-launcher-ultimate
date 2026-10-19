using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>
/// A widget built in the widget editor: a box (size, background) with freely placed elements. Positions and sizes of
/// elements are percentages of the box, so the widget looks the same on the phone, in the PC app, in the overlay and
/// as a desktop widget.
/// </summary>
public sealed class CustomWidget
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Height in pixels (the width follows the place where it is shown; desktop widgets use DesktopW).</summary>
    public int Height { get; set; } = 220;
    public string Background { get; set; } = "#111827";
    /// <summary>Second colour for a gradient (top left → bottom right); null = plain colour.</summary>
    public string? Background2 { get; set; }
    /// <summary>Background picture: https address or data:image (max. ~150 KB).</summary>
    public string? Image { get; set; }
    public double Opacity { get; set; } = 1;
    public int Radius { get; set; } = 16;
    public string TextColor { get; set; } = "#f8fafc";
    public List<WidgetElement> Elements { get; set; } = new();
    /// <summary>Shown as its own small window on the Windows desktop.</summary>
    public bool Desktop { get; set; }
    /// <summary>Desktop window: position as share of the screen and width in pixels.</summary>
    public double DesktopX { get; set; } = 0.75;
    public double DesktopY { get; set; } = 0.08;
    public int DesktopW { get; set; } = 320;
    public DateTime UpdatedAt { get; set; }
}

public sealed class WidgetElement
{
    public string Id { get; set; } = "";
    /// <summary>text, clock, metric, button, image, playtime, nowPlaying, shape.</summary>
    public string Type { get; set; } = "text";
    /// <summary>Position and size in percent of the widget box.</summary>
    public double X { get; set; }
    public double Y { get; set; }
    public double W { get; set; } = 40;
    public double H { get; set; } = 20;
    public string? Text { get; set; }
    public int Size { get; set; } = 16;
    public string? Color { get; set; }
    public string? Fill { get; set; }
    public string Align { get; set; } = "left";
    public bool Bold { get; set; }
    /// <summary>metric: cpu, ram, gpu, gputemp; clock: time, date, both; playtime: today, week.</summary>
    public string? Kind { get; set; }
    /// <summary>metric: number, bar, ring.</summary>
    public string? Display { get; set; }
    /// <summary>button: quick, launch, sound, profile, overlay, record, replay, stopSounds.</summary>
    public string? Action { get; set; }
    public string? Ref { get; set; }
    public string? Icon { get; set; }
    public string? Image { get; set; }
}

public sealed class CustomWidgetsFile { public List<CustomWidget> Widgets { get; set; } = new(); }

public sealed class CustomWidgetService
{
    static readonly Regex Color = new("^#[0-9a-fA-F]{6}$");
    static readonly Regex LocalId = new("^[a-z0-9_-]{1,40}$");
    static readonly string[] Types = { "text", "clock", "metric", "button", "image", "playtime", "nowPlaying", "shape", "icon", "timer" };
    static readonly string[] Metrics = { "cpu", "ram", "gpu", "gputemp" };
    static readonly string[] Actions = { "quick", "launch", "sound", "profile", "overlay", "record", "replay", "stopSounds", "media", "open" };
    const int MaxWidgets = 30, MaxElements = 40, MaxImage = 200_000;

    readonly JsonStore<CustomWidgetsFile> _store;
    readonly IHub _hub;
    public event Action? Changed;

    public CustomWidgetService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<CustomWidgetsFile>(paths.File("widgets.json"));
        _hub = hub;
    }

    public List<CustomWidget> List() => _store.Snapshot().Widgets;

    public CustomWidget Save(CustomWidget w)
    {
        Check(w);
        w.UpdatedAt = DateTime.UtcNow;
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(w.Id)) w.Id = Ids.New("cw");
            var i = f.Widgets.FindIndex(x => x.Id == w.Id);
            if (i < 0 && f.Widgets.Count >= MaxWidgets) throw new RpcException("limit", $"Höchstens {MaxWidgets} eigene Widgets.");
            if (i >= 0) f.Widgets[i] = w; else f.Widgets.Add(w);
            return w;
        });
        _hub.Changed("widgets");
        Changed?.Invoke();
        return r;
    }

    public void Remove(string id)
    {
        _store.Update(f => f.Widgets.RemoveAll(w => w.Id == id));
        _hub.Changed("widgets");
        Changed?.Invoke();
    }

    /// <summary>A desktop widget window was moved on the PC: only the position changes.</summary>
    public void SetDesktopPosition(string id, double x, double y)
    {
        if (!double.IsFinite(x) || !double.IsFinite(y)) return;
        var found = _store.Update(f =>
        {
            var w = f.Widgets.FirstOrDefault(w => w.Id == id);
            if (w == null) return false;
            w.DesktopX = Math.Clamp(x, 0, 0.98); w.DesktopY = Math.Clamp(y, 0, 0.98);
            return true;
        });
        if (found) _hub.Changed("widgets"); // no Changed event: the window is already where it should be
    }

    public List<CustomWidget> DesktopWidgets() => List().Where(w => w.Desktop).ToList();

    /// <summary>Every value is checked and bounded: widgets come from any paired device and are shown on all of them.</summary>
    static void Check(CustomWidget w)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        static string? Img(string? v) => v == null ? null
            : v.Length > MaxImage ? throw Bad("Bild ist zu groß (höchstens ca. 150 KB).")
            : v.StartsWith("https://", StringComparison.Ordinal) || Regex.IsMatch(v, "^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$") ? v
            : throw Bad("Bild muss eine https-Adresse oder ein hochgeladenes Bild sein.");
        static string Col(string? v, string def) => v != null && Color.IsMatch(v) ? v : def;

        if (!string.IsNullOrEmpty(w.Id) && !Regex.IsMatch(w.Id, "^cw_[A-Za-z0-9_-]{1,40}$")) throw Bad("Ungültige Widget-ID.");
        w.Name = DeviceStore.Sanitize(w.Name, 40, "Mein Widget");
        w.Height = Math.Clamp(w.Height, 60, 900);
        w.Background = Col(w.Background, "#111827");
        w.Background2 = w.Background2 != null && Color.IsMatch(w.Background2) ? w.Background2 : null;
        w.Image = Img(w.Image);
        w.Opacity = double.IsFinite(w.Opacity) ? Math.Clamp(w.Opacity, 0.2, 1) : 1;
        w.Radius = Math.Clamp(w.Radius, 0, 40);
        w.TextColor = Col(w.TextColor, "#f8fafc");
        w.DesktopX = double.IsFinite(w.DesktopX) ? Math.Clamp(w.DesktopX, 0, 0.98) : 0.75;
        w.DesktopY = double.IsFinite(w.DesktopY) ? Math.Clamp(w.DesktopY, 0, 0.98) : 0.08;
        w.DesktopW = Math.Clamp(w.DesktopW, 160, 1200);
        if (w.Elements.Count > MaxElements) throw Bad($"Höchstens {MaxElements} Elemente pro Widget.");
        if (w.Elements.Select(e => e.Id).Distinct().Count() != w.Elements.Count) throw Bad("Element-ID doppelt.");
        foreach (var e in w.Elements)
        {
            if (!LocalId.IsMatch(e.Id ?? "")) throw Bad("Ungültige Element-ID.");
            if (!Types.Contains(e.Type)) throw Bad($"Unbekannter Element-Typ „{e.Type}“.");
            static double P(double v, double min) => double.IsFinite(v) ? Math.Clamp(v, min, 100) : min;
            e.X = P(e.X, 0); e.Y = P(e.Y, 0); e.W = P(e.W, 2); e.H = P(e.H, 2);
            e.Text = e.Text == null ? null : DeviceStore.Sanitize(e.Text, 200, "");
            e.Size = Math.Clamp(e.Size, 8, 120);
            e.Color = e.Color != null && Color.IsMatch(e.Color) ? e.Color : null;
            e.Fill = e.Fill != null && Color.IsMatch(e.Fill) ? e.Fill : null;
            e.Align = e.Align is "center" or "right" ? e.Align : "left";
            e.Icon = e.Icon == null ? null : DeviceStore.Sanitize(e.Icon, 30, "zap");
            e.Image = Img(e.Image);
            switch (e.Type)
            {
                case "metric":
                    if (!Metrics.Contains(e.Kind ?? "")) throw Bad("Messwert muss cpu, ram, gpu oder gputemp sein.");
                    e.Display = e.Display is "bar" or "ring" ? e.Display : "number";
                    break;
                case "clock": e.Kind = e.Kind is "date" or "both" ? e.Kind : "time"; break;
                case "playtime": e.Kind = e.Kind == "week" ? "week" : "today"; break;
                case "icon": e.Icon ??= "zap"; break;
                case "timer":
                    // Stopwatch or countdown (Ref = seconds, 1 s – 24 h). Runs on the device; nothing is sent to the PC.
                    e.Kind = e.Kind == "countdown" ? "countdown" : "stopwatch";
                    e.Ref = e.Kind == "countdown" ? (int.TryParse(e.Ref, out var sec) && sec is >= 1 and <= 86400 ? sec.ToString() : throw Bad("Countdown: 1 Sekunde bis 24 Stunden.")) : null;
                    break;
                case "button":
                    if (!Actions.Contains(e.Action ?? "")) throw Bad("Unbekannte Aktion für den Knopf.");
                    // Only ids, never commands: what a button may do is decided by the PC (with the device's permissions).
                    e.Ref = e.Action is "quick" or "launch" or "sound" or "profile" ? (e.Ref is { Length: > 0 and <= 64 } r && Regex.IsMatch(r, "^[A-Za-z0-9_:-]+$") ? r : throw Bad("Der Knopf braucht ein Ziel."))
                        : e.Action == "overlay" ? (e.Ref == "mini" ? "mini" : "full")
                        : e.Action == "media" ? (ActionRunner.MediaKeys.ContainsKey(e.Ref ?? "") ? e.Ref : throw Bad("Unbekannte Medientaste."))
                        : e.Action == "open" ? (e.Ref is { } path && Regex.IsMatch(path, @"^/[a-z-]{0,30}$") ? path : throw Bad("Ungültige Seite."))
                        : null;
                    break;
            }
        }
    }

    internal CustomWidgetsFile Export() => _store.Snapshot();
    /// <summary>From a backup: every widget is checked like a new one; invalid ones are left out.</summary>
    internal void ImportChecked(CustomWidgetsFile f)
    {
        var ok = new List<CustomWidget>();
        foreach (var w in f.Widgets.Take(MaxWidgets)) { try { Check(w); ok.Add(w); } catch (RpcException ex) { Log.Warn("widgets", $"„{w.Name}“ aus dem Backup übersprungen: {ex.Message}"); } }
        _store.Replace(new CustomWidgetsFile { Widgets = ok });
        _hub.Changed("widgets");
        Changed?.Invoke();
    }
}
