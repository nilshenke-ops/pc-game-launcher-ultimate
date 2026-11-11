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
    /// <summary>Sets the window's cut-out directly (without a repaint of the whole window per frame – Form.Region does that and makes the opening/closing stutter). The system owns the region afterwards.</summary>
    [DllImport("user32.dll")] static extern int SetWindowRgn(IntPtr hWnd, IntPtr hRgn, bool redraw);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    const int WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOPMOST = 0x8;
    const uint SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;
    static readonly IntPtr HWND_TOPMOST = new(-1);

    /// <summary>
    /// The window is always as big as the open island plus room for the spring's overshoot (logical pixels; the page knows the same
    /// numbers as WINDOW_W / WINDOW_H in island-spring.ts). It never changes size – only its visible shape does.
    /// </summary>
    const int WindowW = 620, WindowH = 380;
    /// <summary>The closed island (eyes only), shown from the first moment until the page reports its own shape.</summary>
    const int NotchW = 132, NotchH = 34, NotchR = 17;

    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(7, 9, 13) };
    readonly CoreWebView2Environment _env;
    readonly string _origin, _token;
    bool _started;
    string _size = "notch";
    string _position = "center";
    // The shape the page reported last (device pixels): width, height, corner radius.
    int _curW, _curH, _curR;

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
    }

    /// <summary>Not in Alt+Tab, never activated by showing or resizing (the game keeps the focus).</summary>
    protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST; return cp; } }
    protected override bool ShowWithoutActivation => true;

    // The page runs the spring (island-spring.ts) and tells the window the shape of every frame ("island-rect"); the window itself
    // keeps its size. No timer in here, so screen and cut-out can never drift apart, and the page is never re-laid out while moving.
    int TargetX(int w, Rectangle screen) => _position == "left" ? screen.Left + LogicalToDeviceUnits(24) : _position == "right" ? screen.Right - w - LogicalToDeviceUnits(24) : screen.Left + (screen.Width - w) / 2;

    /// <summary>A rounded shape of w × h hanging from the top edge of the window (square at the top, round at the bottom).</summary>
    void Shape(int w, int h, int radius, int windowW)
    {
        w = Math.Max(1, Math.Min(w, windowW)); h = Math.Max(1, Math.Min(h, Height));
        var off = _position == "left" ? 0 : _position == "right" ? windowW - w : (windowW - w) / 2;
        var rgn = CreateRoundRectRgn(off, -radius, off + w + 1, h + 1, radius * 2, radius * 2);
        if (!IsHandleCreated || SetWindowRgn(Handle, rgn, false) == 0) DeleteObject(rgn);   // not applied: free it ourselves (applied: the system frees it)
        _curW = w; _curH = h; _curR = radius;
    }

    void Place()
    {
        var screen = Screen.PrimaryScreen!.Bounds;
        var w = LogicalToDeviceUnits(WindowW);
        var h = LogicalToDeviceUnits(WindowH);
        Bounds = new Rectangle(TargetX(w, screen), screen.Top, w, h);
        // Until the page reports a shape the closed island is shown – never the whole window.
        if (_curW == 0) Shape(LogicalToDeviceUnits(NotchW), LogicalToDeviceUnits(NotchH), LogicalToDeviceUnits(NotchR), w);
        else Shape(_curW, _curH, _curR, w);
        SetWindowPos(Handle, HWND_TOPMOST, Left, Top, Width, Height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }

    /// <summary>Place at the top edge (center, left, right) and window opacity in percent.</summary>
    public void SetLook(string position, int opacityPercent)
    {
        Opacity = Math.Clamp(opacityPercent, 50, 100) / 100.0;
        if (_position == position) return;
        _position = position;
        if (Visible) Place();
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

    /// <summary>
    /// Messages of the page: "island-rect" (the shape of this frame: w, h, r in logical pixels) and "island-size" (which size the
    /// island aims at – only the open panel matters here: it takes the keyboard focus for typing). Nothing else is accepted.
    /// </summary>
    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var type)) return;
            switch (type.GetString())
            {
                case "island-rect":
                    if (!Visible || !root.TryGetProperty("w", out var w) || !root.TryGetProperty("h", out var h) || !root.TryGetProperty("r", out var r)) return;
                    if (w.ValueKind != JsonValueKind.Number || h.ValueKind != JsonValueKind.Number || r.ValueKind != JsonValueKind.Number) return;
                    var lw = Math.Clamp(w.GetDouble(), 1, WindowW); var lh = Math.Clamp(h.GetDouble(), 1, WindowH); var lr = Math.Clamp(r.GetDouble(), 0, 60);
                    var k = DeviceDpi / 96.0; // the page measures in logical pixels (fractions allowed – the spring is smooth)
                    Shape((int)Math.Round(lw * k), (int)Math.Round(lh * k), (int)Math.Round(lr * k), Width);
                    break;
                case "island-size":
                    var size = root.TryGetProperty("size", out var s) ? s.GetString() : null;
                    if (size is not ("notch" or "bar" or "ask" or "panel") || size == _size) return;
                    _size = size;
                    // Typing a question needs the keyboard: only the open panel takes the focus – after a click into it.
                    if (size == "panel") Activate();
                    break;
            }
        }
        catch (JsonException) { /* not ours */ }
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
        if (disposing) { _web.Dispose(); }
        base.Dispose(disposing);
    }
}
