namespace Pgl.Core.Platform;

/// <summary>
/// Which well-known app or website is in front – only to colour the island like it ("Discord blue"). Works from the program's name and, for
/// browsers, the end of the window title ("… - YouTube - Google Chrome"). Only the short id leaves this class, never the title.
/// </summary>
public static class ForegroundBrand
{
    static readonly (string proc, string brand)[] Programs =
    {
        ("discord", "discord"), ("discordptb", "discord"), ("discordcanary", "discord"), ("spotify", "spotify"), ("steam", "steam"), ("steamwebhelper", "steam"),
        ("obs64", "obs"), ("obs", "obs"), ("code", "vscode"), ("whatsapp", "whatsapp"), ("telegram", "telegram"), ("epicgameslauncher", "epic"),
        ("battle.net", "battlenet"), ("ms-teams", "teams"), ("teams", "teams"), ("slack", "slack"), ("zoom", "zoom"), ("twitch", "twitch"),
        ("riotclientux", "riot"), ("leagueclientux", "riot"), ("eadesktop", "ea"), ("ubisoftconnect", "ubisoft"), ("xboxpcapp", "xbox"), ("gamebar", "xbox"),
    };
    static readonly string[] Browsers = { "chrome", "msedge", "firefox", "brave", "opera", "opera_gx", "vivaldi", "arc" };
    static readonly (string title, string brand)[] Sites =
    {
        ("youtube", "youtube"), ("twitch", "twitch"), ("discord", "discord"), ("netflix", "netflix"), ("spotify", "spotify"), ("github", "github"),
        ("reddit", "reddit"), ("whatsapp", "whatsapp"), ("instagram", "instagram"), ("prime video", "prime"), ("disney+", "disney"), ("twitter", "x"),
        ("chatgpt", "chatgpt"), ("claude", "claude"), ("gmail", "gmail"), ("steam", "steam"), ("kick", "kick"), ("tiktok", "tiktok"),
    };
    public static readonly string[] All = Programs.Select(p => p.brand).Concat(Sites.Select(s => s.brand)).Concat(new[] { "browser" }).Distinct().ToArray();

    /// <summary>The brand id, "browser" for a browser on another site, or null for anything else.</summary>
    public static string? Detect(string? processName, string? title)
    {
        var p = (processName ?? "").Trim().ToLowerInvariant();
        if (p.EndsWith(".exe")) p = p[..^4];
        if (p.Length == 0) return null;
        if (Browsers.Contains(p))
        {
            // the site's name stands at the end of the title, before the browser's own name
            var parts = (title ?? "").Split(new[] { " - ", " – ", " | ", " — " }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            foreach (var part in Enumerable.Reverse(parts).Skip(parts.Length > 1 ? 1 : 0).Take(2))
            {
                var l = part.ToLowerInvariant();
                foreach (var (t, b) in Sites) if (l == t || l.StartsWith(t + " ") || l.EndsWith(" " + t)) return b;
            }
            return "browser";
        }
        foreach (var (proc, b) in Programs) if (p == proc) return b;
        return null;
    }
}
