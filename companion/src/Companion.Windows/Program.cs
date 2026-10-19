using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pgl.Core.Infrastructure;
using Pgl.Core.Services;

namespace Pgl.Windows;

static class Program
{
    static TrayAppContext? _context;

    [STAThread]
    static int Main(string[] args)
    {
        // One companion per PC (all Windows sessions): two would fight for the same port.
        using var mutex = new Mutex(true, @"Global\PCGameLauncherUltimate.Companion", out var first);
        // After an update/rollback the previous process is still shutting down: wait for it instead of exiting.
        if (!first && args.Contains("--updated"))
        {
            try { first = mutex.WaitOne(TimeSpan.FromSeconds(30)); }
            catch (AbandonedMutexException) { first = true; }
        }
        if (!first)
        {
            // Already running: bring the existing window to front instead of starting twice.
            try { using var ev = EventWaitHandle.OpenExisting(@"Local\PCGameLauncherUltimate.Show"); ev.Set(); }
            catch
            {
                // Not in this Windows session: another user on this PC runs it.
                MessageBox.Show("Nexus Gaming Hub läuft bereits in einer anderen Windows-Sitzung (anderer Benutzer) auf diesem PC. Es kann nur einer gleichzeitig laufen.", "Nexus Gaming Hub", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return 0;
        }
        // The previous version is kept as "<exe>.old" so it can be restored (Updates → Vorherige Version, or tray menu).
        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += (_, e) => Log.Error("ui", e.Exception.ToString());
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log.Error("app", e.ExceptionObject.ToString() ?? "");

        _context = new TrayAppContext(startMinimized: args.Contains("--minimized"));
        Application.Run(_context);
        return 0;
    }

    public static void RequestExit() => _context?.ExitApp();
}

/// <summary>Owns the tray icon, the main window and the companion services for the whole app lifetime.</summary>
sealed class TrayAppContext : ApplicationContext
{
    readonly MainForm _form;
    readonly TrayIcon _tray;
    readonly CompanionServices _services;
    readonly WindowsOverlay _overlay;
    readonly WindowsDesktopWidgets _desktopWidgets;
    readonly EventWaitHandle _showSignal = new(false, EventResetMode.AutoReset, @"Local\PCGameLauncherUltimate.Show");
    bool _exiting;

    public TrayAppContext(bool startMinimized)
    {
        _form = new MainForm();
        _ = _form.Handle; // creates the UI thread's synchronization context target
        var ui = new UiInvoker(_form);
        TrayIcon? trayRef = null;
        var platform = new WindowsPlatform(ui, () => trayRef);
        ((WindowsAutostart)platform.Autostart).RepairMovedPath();
        _overlay = platform.OverlayWindows;
        _desktopWidgets = platform.DesktopWidgetWindows;
        _services = new CompanionServices(platform, new AppPaths());
        _overlay.Corner = () => _services.Settings.Get().OverlayCorner;
        _services.Obs.RecordingChanged += (active, _) => _overlay.Recording = active;
        _tray = new TrayIcon(this, _services);
        trayRef = _tray;
        _form.Attach(_services, this);

        var settings = _services.Settings.Get();
        if (!(startMinimized && settings.StartMinimized)) _form.Show();

        new Thread(() =>
        {
            while (true)
            {
                _showSignal.WaitOne();
                if (_exiting) return;
                ui.Post(() => ShowWindow());
            }
        }) { IsBackground = true, Name = "show-signal" }.Start();

        _ = StartAsync();
    }

    async Task StartAsync()
    {
        await _services.StartAsync();
        _tray.Update();
        await _form.LoadUiAsync();
        // The overlay uses the same WebView2 environment and the same per-launch admin token as the main window.
        _overlay.Environment = _form.WebEnvironment;
        _overlay.Origin = $"http://127.0.0.1:{_services.Web.Port}";
        _overlay.AdminToken = _services.Rpc.AdminToken;
        _desktopWidgets.Ready(_form.WebEnvironment, _overlay.Origin, _services.Rpc.AdminToken);
        if (_services.Web.StartError != null)
            MessageBox.Show(_services.Web.StartError, "Nexus Gaming Hub – Webserver", MessageBoxButtons.OK, MessageBoxIcon.Warning);
    }

    public string LocalUrl(string hash = "") => $"http://127.0.0.1:{_services.Web.Port}/{hash}";

    public void ShowWindow(string? hash = null)
    {
        if (!_form.Visible) _form.Show();
        if (_form.WindowState == FormWindowState.Minimized) _form.WindowState = FormWindowState.Normal;
        _form.Activate();
        _form.BringToFront();
        if (hash != null) _form.Navigate(hash);
    }

    public void OpenInBrowser()
    {
        // The admin token is passed in the URL fragment, which browsers never send to a server.
        Process.Start(new ProcessStartInfo(LocalUrl("#admin=" + _services.Rpc.AdminToken)) { UseShellExecute = true })?.Dispose();
    }

    public bool KeepInTray => !_exiting && _services.Settings.Get().KeepRunningInTray;
    public bool Exiting => _exiting;
    public void HintRunningInTray() => _tray.HintRunningInTray();

    public async void ExitApp()
    {
        if (_exiting) return;
        _exiting = true;
        _showSignal.Set();
        _tray.Dispose();
        _form.Hide();
        try { _overlay.Dispose(); } catch { }
        try { _desktopWidgets.Dispose(); } catch { }
        try { await _services.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(5)); } catch { }
        _form.Close();
        ExitThread();
    }
}

sealed class TrayIcon : IDisposable
{
    readonly NotifyIcon _icon;
    readonly TrayAppContext _app;
    readonly CompanionServices _s;
    readonly ToolStripMenuItem _status = new("Startet…") { Enabled = false };
    bool _hintShown;

    public TrayIcon(TrayAppContext app, CompanionServices s)
    {
        _app = app; _s = s;
        var menu = new ContextMenuStrip();
        menu.Items.Add(_status);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Öffnen", null, (_, _) => _app.ShowWindow());
        menu.Items.Add("Im Browser öffnen", null, (_, _) => _app.OpenInBrowser());
        menu.Items.Add("Gerät koppeln…", null, (_, _) => _app.ShowWindow("#/pair"));
        menu.Items.Add("Relay trennen / verbinden", null, async (_, _) =>
        {
            var set = _s.Settings.Get();
            if (string.IsNullOrWhiteSpace(set.RelayUrl) || string.IsNullOrWhiteSpace(set.RelayCompanionId))
            {
                MessageBox.Show("Es ist noch kein Relay eingerichtet. Einstellungen → Verbindung → Relay.", "Nexus Gaming Hub", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            _s.Settings.SaveSecurity(new SettingsService.SecurityUpdate { RelayEnabled = !set.RelayEnabled }, _s.Platform.Secrets);
            await Task.Delay(300);
            Update();
        });
        menu.Items.Add("Datenordner öffnen", null, (_, _) => _s.Platform.Desktop.OpenFolder(_s.Paths.DataDir));
        // Works even if the new version's window does not load: tray → back to the previous version.
        var rollback = new ToolStripMenuItem("Vorherige Version wiederherstellen…", null, (_, _) =>
        {
            if (MessageBox.Show("Zur vorherigen Version zurückkehren? Der Begleiter startet neu. Einstellungen und Listen bleiben erhalten.", "Nexus Gaming Hub", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            if (_s.Updates.Rollback() is { } err) MessageBox.Show(err, "Nexus Gaming Hub", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        });
        menu.Items.Add(rollback);
        menu.Opening += (_, _) => rollback.Visible = _s.Platform.UpdateInstaller.CanRollback;
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Beenden", null, (_, _) => _app.ExitApp());
        menu.Opening += (_, _) => Update();
        using var stream = typeof(TrayIcon).Assembly.GetManifestResourceStream("app.ico");
        _icon = new NotifyIcon
        {
            Icon = stream != null ? new Icon(stream) : SystemIcons.Application,
            Text = "Nexus Gaming Hub",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _icon.DoubleClick += (_, _) => _app.ShowWindow();
        _icon.BalloonTipClicked += (_, _) => _app.ShowWindow();
    }

    public void Update()
    {
        var clients = _s.Rpc.Sessions.Count(x => x.Authenticated && !x.IsLocalAdmin);
        var relay = _s.Relay.State switch { "connected" => "Relay verbunden", "disabled" => "Relay aus", _ => "Relay: " + _s.Relay.State };
        _status.Text = _s.Web.StartError != null ? "Webserver-Fehler" : $"Bereit · {clients} Gerät(e) · {relay}";
        var text = $"Nexus Gaming Hub · {clients} Gerät(e)";
        _icon.Text = text.Length > 63 ? text[..63] : text;
    }

    public void Balloon(string title, string message)
    {
        _icon.BalloonTipTitle = title;
        _icon.BalloonTipText = string.IsNullOrEmpty(message) ? " " : message;
        _icon.ShowBalloonTip(5000);
    }

    public void PairingRequest(string device)
    {
        Balloon("Kopplungsanfrage", $"„{device}“ möchte sich verbinden. Bitte im Companion bestätigen oder ablehnen.");
        _app.ShowWindow("#/pair");
    }

    public void HintRunningInTray()
    {
        if (_hintShown) return;
        _hintShown = true;
        Balloon("Läuft im Hintergrund weiter", "Der Companion ist weiter erreichbar. Beenden über das Symbol im Infobereich.");
    }

    public void Dispose() { _icon.Visible = false; _icon.Dispose(); }
}

sealed class MainForm : Form
{
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    WebView2? _web;
    CompanionServices? _s;
    public CoreWebView2Environment? WebEnvironment { get; private set; }
    TrayAppContext? _app;
    readonly Panel _fallback = new() { Dock = DockStyle.Fill, Visible = false, BackColor = Color.FromArgb(10, 14, 26) };
    readonly Label _fallbackText = new() { Dock = DockStyle.Top, Height = 140, ForeColor = Color.Gainsboro, Font = new Font("Segoe UI", 11f), Padding = new Padding(24) };

    public MainForm()
    {
        Text = "Nexus Gaming Hub";
        Size = new Size(1320, 860);
        MinimumSize = new Size(820, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(10, 14, 26);
        using (var stream = typeof(MainForm).Assembly.GetManifestResourceStream("app.ico")) if (stream != null) Icon = new Icon(stream);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 60, Padding = new Padding(20, 0, 0, 0) };
        buttons.Controls.Add(MakeButton("Im Browser öffnen", () => _app?.OpenInBrowser()));
        buttons.Controls.Add(MakeButton("WebView2-Runtime herunterladen", () =>
            Process.Start(new ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true })?.Dispose()));
        _fallback.Controls.Add(buttons);
        _fallback.Controls.Add(_fallbackText);
        Controls.Add(_fallback);
    }

    static Button MakeButton(string text, Action click)
    {
        var b = new Button { Text = text, AutoSize = true, Padding = new Padding(10, 6, 10, 6), FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(14, 116, 144), Margin = new Padding(0, 10, 12, 0) };
        b.Click += (_, _) => click();
        return b;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int dark = 1;
        try { DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int)); } catch { }
    }

    public void Attach(CompanionServices s, TrayAppContext app) { _s = s; _app = app; }

    public async Task LoadUiAsync()
    {
        if (_s == null || _app == null) return;
        if (_s.Web.StartError != null) { ShowFallback("Der eingebaute Webserver konnte nicht starten:\n" + _s.Web.StartError); return; }
        try
        {
            var dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PCGameLauncherUltimate", "WebView2");
            var env = await CoreWebView2Environment.CreateAsync(null, dataDir);
            WebEnvironment = env;
            _web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(10, 14, 26) };
            Controls.Add(_web);
            _web.BringToFront();
            await _web.EnsureCoreWebView2Async(env);
            var core = _web.CoreWebView2;
            var origin = $"http://127.0.0.1:{_s.Web.Port}";
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = true;
            // The per-launch admin token is injected only into the companion's own origin.
            await core.AddScriptToExecuteOnDocumentCreatedAsync($"if (location.origin === '{origin}') {{ window.__PGL_ADMIN__ = '{_s.Rpc.AdminToken}'; window.__PGL_EMBEDDED__ = true; }}");
            core.NavigationStarting += (_, e) =>
            {
                if (e.Uri.StartsWith(origin + "/", StringComparison.OrdinalIgnoreCase) || e.Uri == origin) return;
                e.Cancel = true;
                OpenExternal(e.Uri);
            };
            core.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
            core.Navigate(origin + "/");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            ShowFallback("Für die eingebaute Oberfläche wird die Microsoft Edge WebView2-Runtime benötigt (bei Windows 11 vorinstalliert).\nDer Companion läuft trotzdem – du kannst die Oberfläche im Browser öffnen.");
        }
        catch (Exception ex)
        {
            Log.Error("ui", "WebView2 konnte nicht starten: " + ex.Message);
            ShowFallback("Die eingebaute Oberfläche konnte nicht starten: " + ex.Message + "\nDer Companion läuft trotzdem – du kannst die Oberfläche im Browser öffnen.");
        }
    }

    static void OpenExternal(string uri)
    {
        if (Uri.TryCreate(uri, UriKind.Absolute, out var u) && u.Scheme is "https" or "http")
            Process.Start(new ProcessStartInfo(u.ToString()) { UseShellExecute = true })?.Dispose();
    }

    void ShowFallback(string text)
    {
        _fallbackText.Text = text;
        _fallback.Visible = true;
        _fallback.BringToFront();
    }

    // Hidden in the tray or minimized (typical while gaming): the browser engine is suspended and gives memory back,
    // so it uses no CPU at all. It continues where it was as soon as the window is shown again.
    protected override void OnVisibleChanged(EventArgs e) { base.OnVisibleChanged(e); _ = WebActive(Visible && WindowState != FormWindowState.Minimized); }
    protected override void OnResize(EventArgs e) { base.OnResize(e); _ = WebActive(Visible && WindowState != FormWindowState.Minimized); }

    bool _webActive = true;
    async Task WebActive(bool active)
    {
        if (_web?.CoreWebView2 is not { } core || active == _webActive) return;
        _webActive = active;
        try
        {
            if (active)
            {
                _web.Visible = true;
                if (core.IsSuspended) core.Resume();
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Normal;
            }
            else
            {
                _web.Visible = false; // suspending needs an invisible WebView
                core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
                await core.TrySuspendAsync();
            }
        }
        catch (Exception ex) { Log.Warn("ui", "WebView2 ruhen/aufwecken: " + ex.Message); }
    }

    public void Navigate(string hash)
    {
        if (_web?.CoreWebView2 == null) return;
        var safe = new string(hash.Where(c => char.IsLetterOrDigit(c) || c is '#' or '/' or '-').ToArray());
        _ = _web.CoreWebView2.ExecuteScriptAsync($"location.hash = '{safe}';");
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing && _app != null && _app.KeepInTray)
        {
            e.Cancel = true;
            Hide();
            _app.HintRunningInTray();
            return;
        }
        if (e.CloseReason == CloseReason.UserClosing && _app != null && !_app.Exiting) { e.Cancel = true; _app.ExitApp(); return; }
        base.OnFormClosing(e);
    }
}
