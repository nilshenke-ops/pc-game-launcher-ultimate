using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// In-game overlay with two modes:
/// "full" – interactive panel over the current screen (web app page #/overlay with the plugin widgets marked for the overlay);
/// "mini" – small click-through window with live values in a screen corner, drawn natively (no browser engine while playing).
/// Works over games in window or borderless mode. Games in exclusive fullscreen usually cover every other window –
/// Windows decides that; the launcher does not inject anything into games (anti-cheat safe).
/// </summary>
sealed class WindowsOverlay(UiInvoker ui, IMetricsSource metrics) : IOverlay
{
    FullOverlayForm? _full;
    MiniOverlayForm? _mini;
    bool _fullOn, _miniOn;

    /// <summary>Set by the main window once WebView2 and the web server are ready.</summary>
    public CoreWebView2Environment? Environment { get; set; }
    public string? Origin { get; set; }
    public string? AdminToken { get; set; }
    public Func<string> Corner { get; set; } = () => "top-right";
    public bool Recording { get => _recording; set { _recording = value; ui.Post(() => _mini?.Refresh(value)); } }
    volatile bool _recording;

    public bool Supported => true;
    public string? Visible => _fullOn ? "full" : _miniOn ? "mini" : null;
    public event Action? Changed;

    public string? Toggle(string mode)
    {
        var error = ui.Invoke(() =>
        {
            if (mode == "mini")
            {
                _miniOn = !_miniOn;
                if (_miniOn && !_fullOn) ShowMini(); else _mini?.Hide();
                return null;
            }
            if (_fullOn) { HideFull(); return null; }
            if (Environment == null || Origin == null || AdminToken == null)
                return "Das Overlay ist noch nicht bereit: Die Oberfläche des Begleiters startet noch oder die WebView2-Runtime fehlt.";
            _full ??= new FullOverlayForm(Environment, Origin, AdminToken, () => { HideFull(); Changed?.Invoke(); });
            _mini?.Hide();
            _fullOn = true;
            _full.ShowOver(Screen.FromPoint(Cursor.Position));
            return (string?)null;
        });
        if (error == null) Changed?.Invoke();
        return error;
    }

    public void Hide()
    {
        ui.Invoke(() => { if (_fullOn) HideFull(); });
        Changed?.Invoke();
    }

    void HideFull()
    {
        _fullOn = false;
        _full?.HideOverlay();
        if (_miniOn) ShowMini();
    }

    void ShowMini()
    {
        _mini ??= new MiniOverlayForm(metrics);
        _mini.ShowIn(Corner());
        _mini.Refresh(_recording);
    }

    public void Dispose() => ui.Invoke(() => { _full?.Dispose(); _mini?.Dispose(); });
}

/// <summary>Interactive overlay: a dimmed picture of the screen as background, the overlay page of the web app on top.</summary>
sealed class FullOverlayForm : Form
{
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);

    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Transparent };
    readonly CoreWebView2Environment _env;
    readonly string _origin, _token;
    readonly Action _requestHide;
    Bitmap? _backdrop;
    IntPtr _previous;
    bool _started;

    public FullOverlayForm(CoreWebView2Environment env, string origin, string token, Action requestHide)
    {
        _env = env; _origin = origin; _token = token; _requestHide = requestHide;
        Text = "PC Game Launcher – Overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(6, 8, 16);
        BackgroundImageLayout = ImageLayout.Stretch;
        Controls.Add(_web);
    }

    public async void ShowOver(Screen screen)
    {
        _previous = GetForegroundWindow();
        Bounds = screen.Bounds;
        BackgroundImage = null;
        _backdrop?.Dispose();
        _backdrop = null;
        try { _backdrop = DimmedCapture(screen.Bounds); BackgroundImage = _backdrop; }
        catch (Exception ex) { Log.Warn("overlay", "Bildschirmfoto für den Hintergrund nicht möglich: " + ex.Message); }
        Show();
        Activate();
        try
        {
            if (!_started)
            {
                _started = true;
                await _web.EnsureCoreWebView2Async(_env);
                var core = _web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                await core.AddScriptToExecuteOnDocumentCreatedAsync($"if (location.origin === '{_origin}') {{ window.__PGL_ADMIN__ = '{_token}'; window.__PGL_EMBEDDED__ = true; window.__PGL_OVERLAY__ = true; }}");
                core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(_origin + "/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                core.NewWindowRequested += (_, e) => e.Handled = true;
                core.Navigate(_origin + "/#/overlay");
            }
            else
            {
                _web.Visible = true;
                if (_web.CoreWebView2.IsSuspended) _web.CoreWebView2.Resume();
                _web.CoreWebView2.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
                await _web.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('pgl-overlay-shown'))");
            }
            _web.Focus();
        }
        catch (Exception ex) { Log.Error("overlay", "Overlay-Oberfläche konnte nicht starten: " + ex.Message); }
    }

    static Bitmap DimmedCapture(Rectangle r)
    {
        var b = new Bitmap(r.Width, r.Height);
        using var g = Graphics.FromImage(b);
        g.CopyFromScreen(r.Location, Point.Empty, r.Size);
        using var dim = new SolidBrush(Color.FromArgb(70, 0, 0, 0)); // only slightly darker: the game stays visible behind the widgets
        g.FillRectangle(dim, 0, 0, r.Width, r.Height);
        return b;
    }

    public void HideOverlay()
    {
        Hide();
        if (_previous != IntPtr.Zero) SetForegroundWindow(_previous); // back to the game
        BackgroundImage = null; // the screenshot is only needed while the overlay is open
        _backdrop?.Dispose();
        _backdrop = null;
        _ = Rest();
    }

    /// <summary>While hidden, the overlay's browser engine is suspended: no CPU, less memory, during the game.</summary>
    async Task Rest()
    {
        if (_web.CoreWebView2 is not { } core) return;
        try
        {
            _web.Visible = false;
            core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
            await core.TrySuspendAsync();
        }
        catch (Exception ex) { Log.Warn("overlay", "Overlay ruhen lassen: " + ex.Message); }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; _requestHide(); return; } // Alt+F4 only hides
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _backdrop?.Dispose(); _web.Dispose(); }
        base.Dispose(disposing);
    }
}

/// <summary>Small always-on-top window with CPU/RAM/GPU and the recording state. Mouse clicks go through to the game.</summary>
sealed class MiniOverlayForm : Form
{
    const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20, WS_EX_TOOLWINDOW = 0x80, WS_EX_NOACTIVATE = 0x08000000, WS_EX_TOPMOST = 0x8;

    readonly IMetricsSource _metrics;
    readonly Label _values = new() { AutoSize = true, ForeColor = Color.FromArgb(226, 232, 240), Font = new Font("Segoe UI Semibold", 10.5f), Location = new Point(10, 8) };
    readonly Label _rec = new() { AutoSize = true, ForeColor = Color.FromArgb(248, 113, 113), Font = new Font("Segoe UI Semibold", 10.5f), Text = "● REC", Visible = false };
    readonly System.Windows.Forms.Timer _timer = new() { Interval = 2000 };
    int _busy;

    public MiniOverlayForm(IMetricsSource metrics)
    {
        _metrics = metrics;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(10, 14, 26);
        Opacity = 0.85;
        AutoSize = true;
        AutoSizeMode = AutoSizeMode.GrowAndShrink;
        Padding = new Padding(0, 0, 12, 10);
        _values.Text = "CPU –   RAM –";
        Controls.Add(_values);
        Controls.Add(_rec);
        _timer.Tick += (_, _) => Sample();
    }

    protected override CreateParams CreateParams
    {
        get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST; return cp; }
    }

    protected override bool ShowWithoutActivation => true;

    string _corner = "top-right";
    Rectangle _screen;

    public void ShowIn(string corner)
    {
        _corner = corner;
        _screen = Screen.FromPoint(Cursor.Position).Bounds;
        Show();
        Place();
        Sample();
        _timer.Start();
    }

    /// <summary>Keeps the window in its corner when the text (and so the size) changes.</summary>
    void Place()
    {
        const int margin = 16;
        Location = new Point(
            _corner.EndsWith("left") ? _screen.Left + margin : _screen.Right - Width - margin,
            _corner.StartsWith("top") ? _screen.Top + margin : _screen.Bottom - Height - margin);
    }

    public void Refresh(bool recording)
    {
        _rec.Visible = recording;
        _rec.Location = new Point(10, _values.Bottom + 2);
        Place();
    }

    void Sample()
    {
        if (!Visible || Interlocked.Exchange(ref _busy, 1) == 1) return;
        Task.Run(() =>
        {
            try
            {
                var m = _metrics.Sample();
                var gpu = m.Gpus.FirstOrDefault();
                string P(double? v) => v == null ? "–" : $"{v:0} %";
                var line1 = $"CPU {P(m.CpuPercent)}   RAM {P(m.MemTotalBytes is > 0 ? 100.0 * m.MemUsedBytes / m.MemTotalBytes : null)}";
                var line2 = gpu == null ? null : $"GPU {P(gpu.UtilPercent)}" + (gpu.TempC is { } t ? $" · {t:0} °C" : "");
                BeginInvoke(() => { _values.Text = line2 == null ? line1 : line1 + "\n" + line2; Refresh(_rec.Visible); });
            }
            catch (Exception ex) { Log.Warn("overlay", "Messwerte nicht lesbar: " + ex.Message); }
            finally { Interlocked.Exchange(ref _busy, 0); }
        });
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (!Visible) _timer.Stop(); // no sampling while hidden
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _timer.Dispose();
        base.Dispose(disposing);
    }
}
