namespace Pgl.Core.Platform;

/// <summary>
/// Developer test picture for the remote desktop – only used by the headless companion with PGL_REMOTE_TESTSOURCE=1
/// (automatic tests without Windows). It is not a screen: a grid that marks where the pointer is (white) and where the
/// last left/right click went (red/blue), so a test can check that a tap on the phone lands on the right PC pixel.
/// The web app shows it with the label "Testbild – kein echter Bildschirm".
/// </summary>
public sealed class TestScreenSource : IScreenCapture, IRemoteInput, IAudioLoopback
{
    public const int W = 960, H = 540;
    static readonly ScreenInfo Main = new(0, "Testbild (kein echter Bildschirm)", 0, 0, W, H, true);
    readonly object _lock = new();
    double _px = 0.5, _py = 0.5;
    (double x, double y)? _left, _right;
    readonly List<string> _log = new();
    readonly HashSet<string> _down = new();

    public bool Supported => true;
    public string? UnsupportedReason => null;
    public bool IsTestSource => true;
    public IReadOnlyList<ScreenInfo> Screens() => new[] { Main };

    /// <summary>What the test input received, e.g. "click Left 0.250 0.500", "text Hallo", "keys Ctrl+C".</summary>
    public IReadOnlyList<string> Log { get { lock (_lock) return _log.ToList(); } }

    public ScreenFrame Capture(int screen, int maxWidth, int quality)
    {
        if (screen != 0) throw new ArgumentOutOfRangeException(nameof(screen));
        var scale = Math.Min(1.0, maxWidth / (double)W);
        int w = Math.Max(16, (int)(W * scale)), h = Math.Max(9, (int)(H * scale));
        double px, py; (double x, double y)? l, r;
        lock (_lock) { px = _px; py = _py; l = _left; r = _right; }
        var pixels = new byte[w * h * 3];
        for (var y = 0; y < h; y++)
            for (var x = 0; x < w; x++)
            {
                var i = (y * w + x) * 3;
                var grid = x % Math.Max(4, w / 16) == 0 || y % Math.Max(4, h / 9) == 0;
                (byte b, byte g, byte rr) c = grid ? ((byte)90, (byte)70, (byte)60) : ((byte)40, (byte)24, (byte)20);
                if (Near(x, y, w, h, l, 12)) c = (30, 30, 230);
                if (Near(x, y, w, h, r, 12)) c = (230, 120, 30);
                if (Near(x, y, w, h, (px, py), 4)) c = (255, 255, 255);
                pixels[i] = c.b; pixels[i + 1] = c.g; pixels[i + 2] = c.rr;
            }
        return new ScreenFrame(Bmp(w, h, pixels), "image/bmp", w, h, Main);
    }

    static bool Near(int x, int y, int w, int h, (double x, double y)? p, int r) =>
        p is { } q && Math.Abs(x - q.x * w) <= r * w / (double)W + 1 && Math.Abs(y - q.y * h) <= r * h / (double)H + 1;

    static byte[] Bmp(int w, int h, byte[] bgr)
    {
        var row = (w * 3 + 3) & ~3;
        var size = 54 + row * h;
        var b = new byte[size];
        void I32(int o, int v) { b[o] = (byte)v; b[o + 1] = (byte)(v >> 8); b[o + 2] = (byte)(v >> 16); b[o + 3] = (byte)(v >> 24); }
        b[0] = (byte)'B'; b[1] = (byte)'M'; I32(2, size); I32(10, 54); I32(14, 40); I32(18, w); I32(22, h);
        b[26] = 1; b[28] = 24; I32(34, row * h);
        for (var y = 0; y < h; y++) Buffer.BlockCopy(bgr, y * w * 3, b, 54 + (h - 1 - y) * row, w * 3);
        return b;
    }

    void Add(string s)
    {
        lock (_lock) { _log.Add(s); if (_log.Count > 200) _log.RemoveAt(0); }
        Infrastructure.Log.Info("remote-test", s); // test picture only: shows in the companion log what the input would do
    }

    public void MoveTo(ScreenInfo screen, double x, double y) { lock (_lock) { _px = x; _py = y; } }
    public void Button(RemoteButton button, bool down)
    {
        lock (_lock)
        {
            if (down) _down.Add(button.ToString()); else _down.Remove(button.ToString());
            if (!down && button == RemoteButton.Left) _left = (_px, _py);
            if (!down && button == RemoteButton.Right) _right = (_px, _py);
        }
        Add($"{(down ? "down" : "up")} {button} {_px:0.000} {_py:0.000}".Replace(',', '.'));
    }
    public void Wheel(int dy, int dx) => Add($"wheel {dy} {dx}");
    public void Text(string text) => Add("text " + text);
    public void Key(string key, bool down) { lock (_lock) { if (down) _down.Add(key); else _down.Remove(key); } Add($"key {key} {(down ? "down" : "up")}"); }
    // Test sound: a quiet 440 Hz tone, 24 kHz stereo, in 100 ms chunks (the test picture's "PC sound").
    public IDisposable Start(Action<short[], int, int> onChunk)
    {
        var phase = 0.0;
        var timer = new Timer(_ =>
        {
            var buf = new short[2400 * 2];
            for (var i = 0; i < 2400; i++)
            {
                var v = (short)(Math.Sin(phase) * 3000); phase += 2 * Math.PI * 440 / 24000;
                buf[2 * i] = v; buf[2 * i + 1] = v;
            }
            onChunk(buf, 24000, 2);
        }, null, 0, 100);
        return timer;
    }

    public void ReleaseAll() { string[] held; lock (_lock) { held = _down.ToArray(); _down.Clear(); } Add("release " + string.Join(",", held)); }
}
