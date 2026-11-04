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
                var info = new NowPlayingInfo(AppName(s.SourceAppUserModelId), Clip(title, 120), Clip((props?.Artist ?? "").Trim(), 80), status == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing);
                if (info.Playing) return info;
                paused ??= info;
            }
            return paused;
        }
        catch (Exception ex) { Log.Warn("media", "Mediensitzung nicht lesbar: " + ex.Message); _manager = null; return null; }
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
