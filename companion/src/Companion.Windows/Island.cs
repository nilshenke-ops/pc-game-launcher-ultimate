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
            _form.ShowIsland();
            return null;
        });
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
        ["panel"] = new Size(580, 470),
    };

    readonly WebView2 _web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(7, 9, 13) };
    readonly CoreWebView2Environment _env;
    readonly string _origin, _token;
    bool _started;
    string _size = "notch";

    public IslandForm(CoreWebView2Environment env, string origin, string token)
    {
        _env = env; _origin = origin; _token = token;
        Text = "Nexus Gaming Hub – JARVIS";
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

    void Place()
    {
        var screen = Screen.PrimaryScreen!.Bounds;
        var logical = Sizes[_size];
        var w = LogicalToDeviceUnits(logical.Width);
        var h = LogicalToDeviceUnits(logical.Height);
        var r = LogicalToDeviceUnits(_size == "panel" ? 22 : 18);
        Bounds = new Rectangle(screen.Left + (screen.Width - w) / 2, screen.Top, w, h);
        // Square at the top edge, round at the bottom – like a notch hanging from the screen edge.
        var rgn = CreateRoundRectRgn(0, -r, w + 1, h + 1, r * 2, r * 2);
        Region = Region.FromHrgn(rgn);
        DeleteObject(rgn);
        SetWindowPos(Handle, HWND_TOPMOST, Left, Top, Width, Height, SWP_NOACTIVATE | SWP_SHOWWINDOW);
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
        Place();
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
        if (disposing) _web.Dispose();
        base.Dispose(disposing);
    }
}
