using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// The JARVIS island: a small black window at the top centre of the main screen, always on top, not in the taskbar or
/// Alt+Tab, and it never takes the focus from a game or program by itself. Collapsed it only shows JARVIS' eyes; the
/// page (#/island) asks for a bigger size on hover, on a tap or when JARVIS has something, and the window grows downwards
/// from the top edge. While hidden its browser engine is suspended. Windows does not let programs draw on the lock
/// screen – the island ends at the desktop.
/// </summary>
sealed class WindowsDesktopIsland(UiInvoker ui) : IDesktopIsland
{
    IslandForm? _form;
    CoreWebView2Environment? _env;
    string? _origin, _token;
    bool _wanted;

    public bool Supported => true;
    public bool Visible => _form?.Visible == true;

    /// <summary>Set by the main window once WebView2 and the web server are ready – a wanted island opens now.</summary>
    public void Ready(CoreWebView2Environment? env, string origin, string token)
    {
        _env = env; _origin = origin; _token = token;
        if (_wanted) ui.Post(() => SetVisible(true));
    }

    public string? SetVisible(bool on)
    {
        _wanted = on;
        return ui.Invoke(() =>
        {
            if (!on) { _form?.Rest(); return (string?)null; }
            if (_env == null || _origin == null || _token == null) return null; // opens as soon as the window is ready
            _form ??= new IslandForm(_env, _origin, _token);
            _form.SetLook(_position, _opacity);
            _form.ShowIsland();
            return null;
        });
    }

    string _position = "center"; int _opacity = 100;
    public void SetLook(string position, int opacityPercent)
    {
        _position = position is "left" or "right" ? position : "center";
        _opacity = Math.Clamp(opacityPercent, 50, 100);
        ui.Post(() => _form?.SetLook(_position, _opacity));
    }

    public void Dispose() => ui.Invoke(() => _form?.Dispose());
}

sealed class IslandForm : Form
{
    [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    const int WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOPMOST = 0x8;
    const uint SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    static readonly IntPtr HWND_TOPMOST = new(-1);

    /// <summary>Sizes in logical pixels: only the eyes, the bar, the open panel.</summary>
    static readonly Dictionary<string, Size> Sizes = new()
    {
        ["notch"] = new Size(150, 34),
        ["bar"] = new Size(460, 40),
        ["ask"] = new Size(560, 40),
        ["panel"] = new Size(580, 520),
    };

    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(7, 9, 13) };
    readonly CoreWebView2Environment _env;
    readonly string _origin, _token;
    bool _started;
    string _size = "notch";
    string _position = "center";

    public IslandForm(CoreWebView2Environment env, string origin, string token)
    {
        _env = env; _origin = origin; _token = token;
        Text = WindowsForegroundWatcher.IslandTitle;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(7, 9, 13);
        Controls.Add(_web);
        _anim.Tick += OnAnimTick;
    }

    /// <summary>Not in Alt+Tab, never activated by showing or resizing (the game keeps the focus).</summary>
    protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST; return cp; } }
    protected override bool ShowWithoutActivation => true;

    // The window never "jumps" between sizes: it grows and shrinks like a drop. The window itself is first made large enough
    // for both sizes (cheap – no re-layout of the page per frame); only its visible shape (a rounded region anchored at the
    // top edge) is animated, and at the end the window gets exactly the target size.
    readonly System.Windows.Forms.Timer _anim = new() { Interval = 8 };
    readonly System.Diagnostics.Stopwatch _clock = new();
    long _lastTicks;
    // A real spring (not a fixed curve): it starts fast, overshoots a little and settles – and it keeps its speed when the
    // size is changed again in the middle of a movement, so quick hover in/out never looks jerky.
    const double Stiffness = 520, Damping = 30, MaxMs = 1000;
    double _p, _v;                  // progress 0 → 1 of the current movement and its speed
    int _curW, _curH;               // the visible shape right now (device pixels)
    int _fromW, _fromH, _toW, _toH; // movement start / target
    int _toRadius;
    bool _animating;

    int TargetX(int w, Rectangle screen) => _position == "left" ? screen.Left + LogicalToDeviceUnits(24) : _position == "right" ? screen.Right - w - LogicalToDeviceUnits(24) : screen.Left + (screen.Width - w) / 2;

    /// <summary>A rounded shape of w × h anchored at the top edge of the window (square at the top, round at the bottom).</summary>
    void Shape(int w, int h, int radius, int windowW)
    {
        var off = _position == "left" ? 0 : _position == "right" ? windowW - w : (windowW - w) / 2;
        var rgn = CreateRoundRectRgn(off, -radius, off + w + 1, h + 1, radius * 2, radius * 2);
        var old = Region;
        Region = Region.FromHrgn(rgn);
        old?.Dispose();
        DeleteObject(rgn);
    }

    void Place(bool animate = false)
    {
        var screen = Screen.PrimaryScreen!.Bounds;
        var logical = Sizes[_size];
        var w = LogicalToDeviceUnits(logical.Width);
        var h = LogicalToDeviceUnits(logical.Height);
        var r = LogicalToDeviceUnits(_size == "panel" ? 22 : 18);
        if (!animate || !Visible || _curW == 0)
        {
            _anim.Stop(); _animating = false;
            Bounds = new Rectangle(TargetX(w, screen), screen.Top, w, h);
            Shape(w, h, r, w);
            _curW = w; _curH = h;
            SetWindowPos(Handle, HWND_TOPMOST, Left, Top, Width, Height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
            return;
        }
        // From what is visible now to the new size; the window covers both (plus room for the overshoot) while it moves.
        _fromW = _curW; _fromH = _curH; _toW = w; _toH = h; _toRadius = r;
        var uw = Math.Max(_fromW, _toW) + (int)(Math.Abs(_toW - _fromW) * 0.22) + 4;
        var uh = Math.Max(_fromH, _toH) + (int)(Math.Abs(_toH - _fromH) * 0.22) + 4;
        Bounds = new Rectangle(TargetX(uw, screen), screen.Top, uw, uh);
        SetWindowPos(Handle, HWND_TOPMOST, Left, Top, Width, Height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        // A running movement keeps its speed: continue from the shape that is visible now (progress restarts at 0 with the same speed share).
        _p = 0; _v = _animating ? _v * 0.6 : 0;
        _clock.Restart(); _lastTicks = 0; _animating = true;
        _anim.Start();
    }

    void OnAnimTick(object? sender, EventArgs e)
    {
        try
        {
            var now = _clock.ElapsedTicks;
            var dt = Math.Clamp((now - _lastTicks) / (double)System.Diagnostics.Stopwatch.Frequency, 0.001, 0.05);
            _lastTicks = now;
            // Integrate the spring in small steps (stable at any frame rate).
            var steps = Math.Max(1, (int)Math.Ceiling(dt / 0.004)); var h = dt / steps;
            for (var i = 0; i < steps; i++) { var a = Stiffness * (1 - _p) - Damping * _v; _v += a * h; _p += _v * h; }
            var w = (int)Math.Round(_fromW + (_toW - _fromW) * _p);
            var hh = (int)Math.Round(_fromH + (_toH - _fromH) * _p);
            _curW = Math.Max(1, Math.Min(w, Width)); _curH = Math.Max(1, Math.Min(hh, Height));
            Shape(_curW, _curH, _toRadius, Width);
            var settled = Math.Abs(1 - _p) < 0.002 && Math.Abs(_v) < 0.02;
            if (!settled && _clock.ElapsedMilliseconds < MaxMs) return;
            // Done: the window gets exactly the target size.
            _anim.Stop(); _animating = false; _v = 0;
            Place(false);
        }
        catch (Exception ex) { _anim.Stop(); _animating = false; Log.Warn("island", "Animation abgebrochen: " + ex.Message); Place(false); }
    }

    /// <summary>Place at the top edge (center, left, right) and window opacity in percent.</summary>
    public void SetLook(string position, int opacityPercent)
    {
        Opacity = Math.Clamp(opacityPercent, 50, 100) / 100.0;
        if (_position == position) return;
        _position = position;
        if (Visible) Place(false);
    }

    public async void ShowIsland()
    {
        if (!Visible) { Show(); Place(); }
        try
        {
            if (!_started)
            {
                _started = true;
                await _web.EnsureCoreWebView2Async(_env);
                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                await core.AddScriptToExecuteOnDocumentCreatedAsync($"if (location.origin === '{_origin}') {{ window.__PGL_ADMIN__ = '{_token}'; window.__PGL_EMBEDDED__ = true; window.__PGL_ISLAND__ = true; }}");
                core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(_origin + "/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                core.NewWindowRequested += (_, e) => e.Handled = true;
                core.WebMessageReceived += OnMessage;
                core.Navigate($"{_origin}/#/island");
            }
            else if (_web.CoreWebView2 is { } core)
            {
                _web.Visible = true;
                if (core.IsSuspended) core.Resume();
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
        }
        catch (Exception ex) { Log.Error("island", "JARVIS-Insel konnte nicht starten: " + ex.Message); }
    }

    /// <summary>The page asks for a size ("notch", "bar", "ask", "panel"); only known sizes, only these messages.</summary>
    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? size;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (!doc.RootElement.TryGetProperty("type", out var type) || type.GetString() != "island-size") return;
            size = doc.RootElement.TryGetProperty("size", out var s) ? s.GetString() : null;
        }
        catch (JsonException) { return; }
        if (size == null || !Sizes.ContainsKey(size) || size == _size) return;
        _size = size;
        Place(true);
        // Typing a question needs the keyboard: only the open panel takes the focus – after a click into it.
        if (size == "panel") Activate();
    }

    /// <summary>Hidden (switched off, or a game runs): browser engine suspended – no CPU, less memory.</summary>
    public async void Rest()
    {
        if (!Visible) return;
        Hide();
        if (_web.CoreWebView2 is not { } core) return;
        try
        {
            _web.Visible = false;
            core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
            await core.TrySuspendAsync();
        }
        catch (Exception ex) { Log.Warn("island", "JARVIS-Insel ruhen lassen: " + ex.Message); }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Rest(); return; } // Alt+F4 only hides
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _anim.Dispose(); _web.Dispose(); }
        base.Dispose(disposing);
    }
}
