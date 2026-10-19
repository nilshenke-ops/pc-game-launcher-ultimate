using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Windows;

/// <summary>
/// Own widgets (widget editor) as small borderless windows on the desktop. They stay below all other windows (like
/// desktop gadgets), are not in the taskbar or Alt+Tab, and can be moved by dragging. While a game runs they are hidden
/// and their browser engine is suspended. Start menu, lock screen and the Win+W widget board are closed to normal programs.
/// </summary>
sealed class WindowsDesktopWidgets(UiInvoker ui) : IDesktopWidgets
{
    readonly Dictionary<string, DesktopWidgetForm> _forms = new();
    IReadOnlyList<CustomWidget> _wanted = Array.Empty<CustomWidget>();
    CoreWebView2Environment? _env;
    string? _origin, _token;
    bool _paused;

    public bool Supported => true;
    public event Action<string, double, double>? Moved;

    /// <summary>Set by the main window once WebView2 and the web server are ready – windows wanted before that open now.</summary>
    public void Ready(CoreWebView2Environment? env, string origin, string token)
    {
        _env = env; _origin = origin; _token = token;
        ui.Post(Apply);
    }

    public void Sync(IReadOnlyList<CustomWidget> widgets)
    {
        _wanted = widgets;
        ui.Post(Apply);
    }

    public void SetPaused(bool paused)
    {
        if (_paused == paused) return;
        _paused = paused;
        ui.Post(Apply);
    }

    void Apply()
    {
        if (_env == null || _origin == null || _token == null) return;
        foreach (var id in _forms.Keys.Except(_wanted.Select(w => w.Id)).ToList())
        {
            _forms[id].Dispose();
            _forms.Remove(id);
        }
        foreach (var w in _wanted)
        {
            if (!_forms.TryGetValue(w.Id, out var f))
            {
                var id = w.Id;
                f = new DesktopWidgetForm(_env, _origin, _token, id, (x, y) => Moved?.Invoke(id, x, y));
                _forms[id] = f;
            }
            f.Place(w);
            if (_paused) f.Rest(); else f.ShowWidget();
        }
    }

    public void Dispose() => ui.Invoke(() => { foreach (var f in _forms.Values) f.Dispose(); _forms.Clear(); });
}

sealed class DesktopWidgetForm : Form
{
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
    [DllImport("gdi32.dll")] static extern IntPtr CreateRoundRectRgn(int x1, int y1, int x2, int y2, int w, int h);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
    [StructLayout(LayoutKind.Sequential)] struct WINDOWPOS { public IntPtr hwnd, hwndInsertAfter; public int x, y, cx, cy; public uint flags; }

    const int WS_EX_TOOLWINDOW = 0x80, WM_WINDOWPOSCHANGING = 0x46, WM_NCLBUTTONDOWN = 0xA1, HTCAPTION = 2;
    const uint SWP_NOSIZE = 0x1, SWP_NOMOVE = 0x2, SWP_NOZORDER = 0x4, SWP_NOACTIVATE = 0x10;
    static readonly IntPtr HWND_BOTTOM = new(1);

    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(17, 24, 39) };
    readonly CoreWebView2Environment _env;
    readonly string _origin, _token, _id;
    readonly Action<double, double> _moved;
    bool _started;
    (double x, double y, int w, int h, int r) _placed = (-1, -1, 0, 0, 0);

    public DesktopWidgetForm(CoreWebView2Environment env, string origin, string token, string id, Action<double, double> moved)
    {
        _env = env; _origin = origin; _token = token; _id = id; _moved = moved;
        Text = "Nexus Gaming Hub – Widget";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(17, 24, 39);
        Controls.Add(_web);
    }

    /// <summary>Not in Alt+Tab.</summary>
    protected override CreateParams CreateParams { get { var cp = base.CreateParams; cp.ExStyle |= WS_EX_TOOLWINDOW; return cp; } }
    protected override bool ShowWithoutActivation => true;

    /// <summary>Always stays at the bottom of the window order – even when clicked.</summary>
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_WINDOWPOSCHANGING)
        {
            var pos = Marshal.PtrToStructure<WINDOWPOS>(m.LParam);
            if ((pos.flags & SWP_NOZORDER) == 0) { pos.hwndInsertAfter = HWND_BOTTOM; Marshal.StructureToPtr(pos, m.LParam, false); }
        }
        base.WndProc(ref m);
    }

    /// <summary>Size from the widget (designed 360 px wide, scaled to DesktopW and the screen's DPI), position as share of the screen.</summary>
    public void Place(CustomWidget w)
    {
        var width = LogicalToDeviceUnits(w.DesktopW);
        var height = Math.Max(40, (int)Math.Round(width * (double)w.Height / 360));
        var radius = LogicalToDeviceUnits((int)Math.Round(w.Radius * (double)w.DesktopW / 360));
        if (_placed == (w.DesktopX, w.DesktopY, width, height, radius)) return;
        _placed = (w.DesktopX, w.DesktopY, width, height, radius);
        var vs = SystemInformation.VirtualScreen;
        var p = new Point(vs.Left + (int)(w.DesktopX * vs.Width), vs.Top + (int)(w.DesktopY * vs.Height));
        // Lost screen (monitor unplugged): back onto the main screen.
        if (!Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(new Rectangle(p, new Size(width, 40)))))
            p = new Point(Screen.PrimaryScreen!.WorkingArea.Right - width - 24, Screen.PrimaryScreen.WorkingArea.Top + 24);
        Bounds = new Rectangle(p, new Size(width, height));
        var rgn = CreateRoundRectRgn(0, 0, width + 1, height + 1, radius * 2, radius * 2);
        Region = Region.FromHrgn(rgn);
        DeleteObject(rgn);
    }

    public async void ShowWidget()
    {
        if (!Visible) Show();
        SetWindowPos(Handle, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
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
                await core.AddScriptToExecuteOnDocumentCreatedAsync($"if (location.origin === '{_origin}') {{ window.__PGL_ADMIN__ = '{_token}'; window.__PGL_EMBEDDED__ = true; window.__PGL_DESKTOP_WIDGET__ = true; }}");
                core.NavigationStarting += (_, e) => { if (!e.Uri.StartsWith(_origin + "/", StringComparison.OrdinalIgnoreCase)) e.Cancel = true; };
                core.NewWindowRequested += (_, e) => e.Handled = true;
                core.WebMessageReceived += OnMessage;
                core.Navigate($"{_origin}/#/desktop-widget/{Uri.EscapeDataString(_id)}");
            }
            else if (_web.CoreWebView2 is { } core)
            {
                _web.Visible = true;
                if (core.IsSuspended) core.Resume();
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
        }
        catch (Exception ex) { Log.Error("widgets", "Desktop-Widget konnte nicht starten: " + ex.Message); }
    }

    /// <summary>The page asks to move the window (pointer pressed outside of buttons): Windows moves it like at a title bar.</summary>
    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            if (!doc.RootElement.TryGetProperty("type", out var type) || type.GetString() != "drag") return;
        }
        catch (JsonException) { return; }
        var before = Location;
        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, IntPtr.Zero); // returns when the mouse is released
        if (Location == before) return;
        var vs = SystemInformation.VirtualScreen;
        var x = (double)(Left - vs.Left) / vs.Width;
        var y = (double)(Top - vs.Top) / vs.Height;
        _placed = (x, y, _placed.w, _placed.h, _placed.r);
        _moved(x, y);
    }

    /// <summary>While a game runs: hidden, browser engine suspended (no CPU, less memory).</summary>
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
        catch (Exception ex) { Log.Warn("widgets", "Desktop-Widget ruhen lassen: " + ex.Message); }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; return; } // Alt+F4: the widget is switched off in the app
        base.OnFormClosing(e);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _web.Dispose();
        base.Dispose(disposing);
    }
}
