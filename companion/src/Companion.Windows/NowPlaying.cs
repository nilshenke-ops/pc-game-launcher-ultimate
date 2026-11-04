using Windows.Media.Control;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// What the PC plays right now – read from Windows' own media sessions (the ones behind the volume flyout and the lock screen):
/// Spotify, a video in Firefox/Chrome/Edge, VLC, the Windows media player … Title and artist/channel as the program reports them;
/// nothing is recorded or sent anywhere except to the windows asking this PC.
/// </summary>
sealed class WindowsNowPlaying : INowPlaying
{
    GlobalSystemMediaTransportControlsSessionManager? _manager;

    public bool Supported => OperatingSystem.IsWindowsVersionAtLeast(10, 0, 17763);

    public NowPlayingInfo? Current()
    {
        if (!Supported) return null;
        try
        {
            _manager ??= GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask().GetAwaiter().GetResult();
            NowPlayingInfo? paused = null;
            foreach (var s in _manager.GetSessions())
            {
                var status = s.GetPlaybackInfo().PlaybackStatus;
                if (status is not (GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing or GlobalSystemMediaTransportControlsSessionPlaybackStatus.Paused)) continue;
                var props = s.TryGetMediaPropertiesAsync().AsTask().GetAwaiter().GetResult();
                var title = (props?.Title ?? "").Trim();
                if (title.Length == 0) continue;
                var app = AppName(s.SourceAppUserModelId);
                var artist = Clip((props?.Artist ?? "").Trim(), 80);
                var playing = status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
                var (pos, dur) = Timeline(s, playing);
                var key = CoverKeyOf(app, title, artist);
                var info = new NowPlayingInfo(app, Clip(title, 120), artist, playing, pos, dur, CoverOf(key, props), key);
                if (info.Playing) return info;
                paused ??= info;
            }
            return paused;
        }
        catch (Exception ex) { Log.Warn("media", "Mediensitzung nicht lesbar: " + ex.Message); _manager = null; return null; }
    }

    /// <summary>Position and length of the song in milliseconds; while it plays the position is brought up to now (Windows reports it at the time of its last update).</summary>
    static (long pos, long dur) Timeline(GlobalSystemMediaTransportControlsSession s, bool playing)
    {
        try
        {
            var t = s.GetTimelineProperties();
            var dur = (long)Math.Max(0, (t.EndTime - t.StartTime).TotalMilliseconds);
            if (dur <= 0) return (0, 0);
            var pos = (t.Position - t.StartTime).TotalMilliseconds;
            if (playing) pos += Math.Max(0, (DateTimeOffset.Now - t.LastUpdatedTime).TotalMilliseconds) * (s.GetPlaybackInfo().PlaybackRate ?? 1.0);
            return ((long)Math.Clamp(pos, 0, dur), dur);
        }
        catch { return (0, 0); }
    }

    // The cover is read once per song (the key says which song), made small (a few KB) and handed out as a data URL.
    string _coverKey = ""; string? _cover;
    static string CoverKeyOf(string app, string title, string artist) => Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{app}\n{title}\n{artist}")))[..12].ToLowerInvariant();
    string? CoverOf(string key, GlobalSystemMediaTransportControlsSessionMediaProperties? props)
    {
        if (key == _coverKey) return _cover;
        _coverKey = key; _cover = null;
        try
        {
            if (props?.Thumbnail is not { } thumb) return null;
            using var raw = thumb.OpenReadAsync().AsTask().GetAwaiter().GetResult();
            using var ms = new MemoryStream();
            using (var src = raw.AsStreamForRead()) src.CopyTo(ms);
            if (ms.Length == 0 || ms.Length > 8_000_000) return null;
            ms.Position = 0;
            using var img = System.Drawing.Image.FromStream(ms);
            const int size = 128;
            using var bmp = new System.Drawing.Bitmap(size, size);
            using (var g = System.Drawing.Graphics.FromImage(bmp))
            {
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                // centre crop to a square
                var side = Math.Min(img.Width, img.Height);
                g.DrawImage(img, new System.Drawing.Rectangle(0, 0, size, size), new System.Drawing.Rectangle((img.Width - side) / 2, (img.Height - side) / 2, side, side), System.Drawing.GraphicsUnit.Pixel);
            }
            using var outMs = new MemoryStream();
            var jpeg = System.Drawing.Imaging.ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == System.Drawing.Imaging.ImageFormat.Jpeg.Guid);
            using var ep = new System.Drawing.Imaging.EncoderParameters(1);
            ep.Param[0] = new System.Drawing.Imaging.EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 78L);
            bmp.Save(outMs, jpeg, ep);
            _cover = "data:image/jpeg;base64," + Convert.ToBase64String(outMs.ToArray());
        }
        catch (Exception ex) { Log.Warn("media", "Titelbild nicht lesbar: " + ex.Message); _cover = null; }
        return _cover;
    }

    static string Clip(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";

    /// <summary>A readable name for the program behind a media session ("Spotify.exe", a browser's hash id …).</summary>
    internal static string AppName(string? id)
    {
        var s = (id ?? "").Trim();
        var l = s.ToLowerInvariant();
        if (l.Contains("spotify")) return "Spotify";
        if (l.Contains("firefox") || System.Text.RegularExpressions.Regex.IsMatch(s, "^[0-9A-Fa-f]{16}$")) return "Firefox"; // Firefox reports a hash as its id
        if (l.Contains("chrome")) return "Chrome";
        if (l.Contains("msedge") || l.Contains("edge")) return "Edge";
        if (l.Contains("opera")) return "Opera";
        if (l.Contains("brave")) return "Brave";
        if (l.Contains("vlc")) return "VLC";
        if (l.Contains("zunemusic") || l.Contains("media.player") || l.Contains("mediaplayer")) return "Medienwiedergabe";
        if (l.Contains("discord")) return "Discord";
        var last = s.Split('!', '\\', '/').Last();
        last = last.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? last[..^4] : last;
        return last.Length == 0 ? "Medien" : last;
    }
}
