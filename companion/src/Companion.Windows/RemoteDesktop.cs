using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Picture of one monitor for the remote desktop: GDI copy of the desktop (what is visible, incl. the mouse pointer),
/// scaled down and saved as JPEG. Works without extra drivers; DirectX games in exclusive fullscreen and protected video
/// may appear black. On the lock screen, sign-in or a UAC prompt (secure desktop) no picture is taken – Windows does not
/// allow it, and the app says so instead of showing an old picture.
/// </summary>
sealed class WindowsScreenCapture : IScreenCapture
{
    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);
    [DllImport("user32.dll", SetLastError = true)] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool GetUserObjectInformation(IntPtr obj, int index, [Out] char[] info, int length, out int needed);
    [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO info);
    [DllImport("user32.dll")] static extern bool GetIconInfo(IntPtr icon, out ICONINFO info);
    [DllImport("user32.dll")] static extern bool DrawIconEx(IntPtr hdc, int x, int y, IntPtr icon, int w, int h, int step, IntPtr brush, int flags);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] struct ICONINFO { public bool fIcon; public int xHotspot, yHotspot; public IntPtr hbmMask, hbmColor; }

    const int UOI_NAME = 2, CURSOR_SHOWING = 1, DI_NORMAL = 3;
    static readonly ImageCodecInfo Jpeg = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
    Bitmap? _full, _small;

    public bool Supported => true;
    public string? UnsupportedReason => null;

    public IReadOnlyList<ScreenInfo> Screens() => System.Windows.Forms.Screen.AllScreens
        .Select((s, i) => new ScreenInfo(i, $"Bildschirm {i + 1}{(s.Primary ? " (Haupt)" : "")} – {s.Bounds.Width}×{s.Bounds.Height}", s.Bounds.X, s.Bounds.Y, s.Bounds.Width, s.Bounds.Height, s.Primary)).ToList();

    /// <summary>Name of the desktop that receives input: "Default" normally, "Winlogon" on lock/sign-in/UAC.</summary>
    static string? InputDesktop()
    {
        var d = OpenInputDesktop(0, false, 0x0001 /* DESKTOP_READOBJECTS */);
        if (d == IntPtr.Zero) return null;
        try
        {
            var buf = new char[256];
            return GetUserObjectInformation(d, UOI_NAME, buf, buf.Length * 2, out _) ? new string(buf).TrimEnd('\0') : null;
        }
        finally { CloseDesktop(d); }
    }

    public ScreenFrame Capture(int screen, int maxWidth, int quality)
    {
        var sc = Screens().FirstOrDefault(s => s.Index == screen) ?? throw new ArgumentOutOfRangeException(nameof(screen));
        var desk = InputDesktop();
        if (!string.Equals(desk, "Default", StringComparison.OrdinalIgnoreCase))
            return new ScreenFrame(Array.Empty<byte>(), "", 0, 0, sc, "Windows zeigt gerade den Sperrbildschirm, die Anmeldung oder eine Sicherheitsabfrage (Benutzerkontensteuerung). Das darf nicht übertragen werden – bitte direkt am PC entsperren oder bestätigen.");

        if (_full == null || _full.Width != sc.Width || _full.Height != sc.Height) { _full?.Dispose(); _full = new Bitmap(sc.Width, sc.Height, PixelFormat.Format32bppRgb); }
        using (var g = Graphics.FromImage(_full))
        {
            try { g.CopyFromScreen(sc.X, sc.Y, 0, 0, new Size(sc.Width, sc.Height), CopyPixelOperation.SourceCopy); }
            catch (System.ComponentModel.Win32Exception)
            {
                return new ScreenFrame(Array.Empty<byte>(), "", 0, 0, sc, "Windows lässt gerade keine Bildschirmaufnahme zu (gesperrt oder geschützte Anzeige).");
            }
            DrawCursor(g, sc);
        }
        var scale = Math.Min(1.0, maxWidth / (double)sc.Width);
        Bitmap src = _full;
        if (scale < 1)
        {
            int w = Math.Max(2, (int)(sc.Width * scale)), h = Math.Max(2, (int)(sc.Height * scale));
            if (_small == null || _small.Width != w || _small.Height != h) { _small?.Dispose(); _small = new Bitmap(w, h, PixelFormat.Format24bppRgb); }
            using var g = Graphics.FromImage(_small);
            g.InterpolationMode = InterpolationMode.Bilinear;
            g.PixelOffsetMode = PixelOffsetMode.HighSpeed;
            g.DrawImage(_full, 0, 0, w, h);
            src = _small;
        }
        using var ms = new MemoryStream();
        using var p = new EncoderParameters(1);
        p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)Math.Clamp(quality, 20, 95));
        src.Save(ms, Jpeg, p);
        return new ScreenFrame(ms.ToArray(), "image/jpeg", src.Width, src.Height, sc);
    }

    static void DrawCursor(Graphics g, ScreenInfo sc)
    {
        var ci = new CURSORINFO { cbSize = Marshal.SizeOf<CURSORINFO>() };
        if (!GetCursorInfo(ref ci) || (ci.flags & CURSOR_SHOWING) == 0 || ci.hCursor == IntPtr.Zero) return;
        int hx = 0, hy = 0;
        if (GetIconInfo(ci.hCursor, out var ii))
        {
            hx = ii.xHotspot; hy = ii.yHotspot;
            if (ii.hbmMask != IntPtr.Zero) DeleteObject(ii.hbmMask);
            if (ii.hbmColor != IntPtr.Zero) DeleteObject(ii.hbmColor);
        }
        var x = ci.pt.X - sc.X - hx; var y = ci.pt.Y - sc.Y - hy;
        if (x < -64 || y < -64 || x > sc.Width || y > sc.Height) return;
        var hdc = g.GetHdc();
        try { DrawIconEx(hdc, x, y, ci.hCursor, 0, 0, 0, IntPtr.Zero, DI_NORMAL); }
        finally { g.ReleaseHdc(hdc); }
    }
}

/// <summary>
/// Mouse and keyboard for the remote desktop with SendInput – exactly what a USB mouse/keyboard would send. Windows does
/// not let a normal program send input to programs running as administrator (UIPI), and Ctrl+Alt+Del is never possible.
/// Text is typed as Unicode characters, so umlauts and symbols work regardless of the keyboard layout.
/// </summary>
sealed class WindowsRemoteInput : IRemoteInput
{
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);

    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

    const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
    const uint MOVE = 0x1, LDOWN = 0x2, LUP = 0x4, RDOWN = 0x8, RUP = 0x10, MDOWN = 0x20, MUP = 0x40, WHEEL = 0x800, HWHEEL = 0x1000, VIRTUALDESK = 0x4000, ABSOLUTE = 0x8000;
    const uint KEYUP = 2, UNICODE = 4, EXTENDED = 1;
    const int SM_XVIRTUALSCREEN = 76, SM_YVIRTUALSCREEN = 77, SM_CXVIRTUALSCREEN = 78, SM_CYVIRTUALSCREEN = 79;

    static readonly Dictionary<string, (ushort vk, bool ext)> Vk = new()
    {
        ["Enter"] = (0x0D, false), ["Escape"] = (0x1B, false), ["Tab"] = (0x09, false), ["Backspace"] = (0x08, false), ["Delete"] = (0x2E, true),
        ["Insert"] = (0x2D, true), ["Home"] = (0x24, true), ["End"] = (0x23, true), ["PageUp"] = (0x21, true), ["PageDown"] = (0x22, true),
        ["Up"] = (0x26, true), ["Down"] = (0x28, true), ["Left"] = (0x25, true), ["Right"] = (0x27, true), ["Space"] = (0x20, false),
        ["PrintScreen"] = (0x2C, true), ["ContextMenu"] = (0x5D, true), ["Ctrl"] = (0x11, false), ["Alt"] = (0x12, false), ["Shift"] = (0x10, false), ["Win"] = (0x5B, true),
    };

    readonly object _lock = new();
    readonly HashSet<RemoteButton> _buttons = new();
    readonly HashSet<string> _keys = new();
    bool _warned;

    static WindowsRemoteInput()
    {
        for (var i = 1; i <= 12; i++) Vk["F" + i] = ((ushort)(0x6F + i), false);
        for (var c = 'A'; c <= 'Z'; c++) Vk[c.ToString()] = (c, false);
        for (var d = 0; d <= 9; d++) Vk[d.ToString()] = ((ushort)('0' + d), false);
    }

    public bool Supported => true;

    void Send(params INPUT[] inputs)
    {
        var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
        if (sent != inputs.Length && !_warned)
        {
            _warned = true;
            Log.Warn("remote", $"Windows hat Eingaben abgelehnt (Fehler {Marshal.GetLastWin32Error()}) – z. B. bei Programmen, die als Administrator laufen.");
        }
    }

    static INPUT Mouse(uint flags, int dx = 0, int dy = 0, uint data = 0) => new() { type = INPUT_MOUSE, u = new InputUnion { mi = new MOUSEINPUT { dx = dx, dy = dy, mouseData = data, dwFlags = flags } } };
    static INPUT KeyIn(ushort vk, ushort scan, uint flags) => new() { type = INPUT_KEYBOARD, u = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = scan, dwFlags = flags } } };

    public void MoveTo(ScreenInfo screen, double x, double y)
    {
        int vx = GetSystemMetrics(SM_XVIRTUALSCREEN), vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        int vw = Math.Max(2, GetSystemMetrics(SM_CXVIRTUALSCREEN)), vh = Math.Max(2, GetSystemMetrics(SM_CYVIRTUALSCREEN));
        var px = screen.X + x * (screen.Width - 1);
        var py = screen.Y + y * (screen.Height - 1);
        var nx = (int)Math.Round((px - vx) * 65535.0 / (vw - 1));
        var ny = (int)Math.Round((py - vy) * 65535.0 / (vh - 1));
        Send(Mouse(MOVE | ABSOLUTE | VIRTUALDESK, nx, ny));
    }

    public void Button(RemoteButton button, bool down)
    {
        var flag = (button, down) switch
        {
            (RemoteButton.Left, true) => LDOWN, (RemoteButton.Left, false) => LUP,
            (RemoteButton.Right, true) => RDOWN, (RemoteButton.Right, false) => RUP,
            (RemoteButton.Middle, true) => MDOWN, _ => MUP,
        };
        lock (_lock) { if (down) _buttons.Add(button); else _buttons.Remove(button); }
        Send(Mouse(flag));
    }

    public void Wheel(int dy, int dx)
    {
        if (dy != 0) Send(Mouse(WHEEL, data: unchecked((uint)dy)));
        if (dx != 0) Send(Mouse(HWHEEL, data: unchecked((uint)dx)));
    }

    public void Text(string text)
    {
        var list = new List<INPUT>();
        foreach (var ch in text)
        {
            if (ch == '\n') { list.Add(KeyIn(0x0D, 0, 0)); list.Add(KeyIn(0x0D, 0, KEYUP)); continue; }
            if (ch == '\t') { list.Add(KeyIn(0x09, 0, 0)); list.Add(KeyIn(0x09, 0, KEYUP)); continue; }
            list.Add(KeyIn(0, ch, UNICODE));
            list.Add(KeyIn(0, ch, UNICODE | KEYUP));
        }
        if (list.Count > 0) Send(list.ToArray());
    }

    public void Key(string key, bool down)
    {
        if (!Vk.TryGetValue(key, out var k)) return;
        lock (_lock) { if (down) _keys.Add(key); else _keys.Remove(key); }
        Send(KeyIn(k.vk, 0, (down ? 0 : KEYUP) | (k.ext ? EXTENDED : 0)));
    }

    public void ReleaseAll()
    {
        RemoteButton[] buttons; string[] keys;
        lock (_lock) { buttons = _buttons.ToArray(); keys = _keys.ToArray(); }
        foreach (var b in buttons) Button(b, false);
        foreach (var k in keys) Key(k, false);
    }
}

/// <summary>
/// Always-visible bar at the top of the main screen while a remote session runs: who is connected, and „Beenden“.
/// Excluded from the picture that is sent (so it does not cover the remote view), but always visible at the PC.
/// </summary>
sealed class RemoteIndicator : IDisposable
{
    [DllImport("user32.dll")] static extern bool SetWindowDisplayAffinity(IntPtr hwnd, uint affinity);
    const uint WDA_EXCLUDEFROMCAPTURE = 0x11;

    readonly UiInvoker _ui;
    readonly Action _end;
    System.Windows.Forms.Form? _form;
    System.Windows.Forms.Label? _label;

    public RemoteIndicator(UiInvoker ui, Action end) { _ui = ui; _end = end; }

    public void Show(string? text) => _ui.Post(() =>
    {
        if (text == null) { _form?.Hide(); return; }
        if (_form == null) Create();
        _label!.Text = "●  " + text;
        var area = System.Windows.Forms.Screen.PrimaryScreen!.WorkingArea;
        _form!.Location = new Point(area.X + (area.Width - _form.Width) / 2, area.Y + 6);
        _form.Show();
        _form.TopMost = true;
    });

    void Create()
    {
        var f = new System.Windows.Forms.Form
        {
            FormBorderStyle = System.Windows.Forms.FormBorderStyle.None, ShowInTaskbar = false, TopMost = true, StartPosition = System.Windows.Forms.FormStartPosition.Manual,
            BackColor = Color.FromArgb(28, 20, 24), Size = new Size(520, 44), Text = "Remote Desktop aktiv",
        };
        var label = new System.Windows.Forms.Label { ForeColor = Color.FromArgb(255, 200, 120), Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), AutoSize = false, Location = new Point(12, 0), Size = new Size(380, 44), TextAlign = ContentAlignment.MiddleLeft };
        var stop = new System.Windows.Forms.Button { Text = "Beenden", Location = new Point(404, 7), Size = new Size(104, 30), FlatStyle = System.Windows.Forms.FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(190, 50, 60) };
        stop.Click += (_, _) => _end();
        f.Controls.Add(label); f.Controls.Add(stop);
        f.HandleCreated += (_, _) => { try { SetWindowDisplayAffinity(f.Handle, WDA_EXCLUDEFROMCAPTURE); } catch { /* older Windows: bar is visible in the picture */ } };
        _form = f; _label = label;
    }

    public void Dispose() => _ui.Post(() => { _form?.Close(); _form?.Dispose(); });
}
