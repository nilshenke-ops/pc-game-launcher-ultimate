using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;

namespace Pgl.Core.Services;

/// <summary>Minimal parser for Valve's text KeyValues format (libraryfolders.vdf, appmanifest_*.acf).</summary>
public static class Vdf
{
    public sealed class Node : Dictionary<string, object>
    {
        public Node() : base(StringComparer.OrdinalIgnoreCase) { }
        public Node? Child(string key) => TryGetValue(key, out var v) ? v as Node : null;
        public string? Str(string key) => TryGetValue(key, out var v) ? v as string : null;
    }

    public static Node Parse(string text)
    {
        int i = 0;
        var root = new Node();
        ParseInto(root, text, ref i, topLevel: true);
        return root;
    }

    static void ParseInto(Node node, string s, ref int i, bool topLevel)
    {
        while (true)
        {
            var key = NextToken(s, ref i);
            if (key == null) { if (topLevel) return; throw new FormatException("Unerwartetes Dateiende"); }
            if (key == "}") { if (topLevel) throw new FormatException("Unerwartete '}'"); return; }
            var value = NextToken(s, ref i) ?? throw new FormatException("Wert fehlt für " + key);
            if (value == "{")
            {
                var child = new Node();
                ParseInto(child, s, ref i, topLevel: false);
                node[key] = child;
            }
            else node[key] = value;
        }
    }

    static string? NextToken(string s, ref int i)
    {
        while (i < s.Length)
        {
            var c = s[i];
            if (char.IsWhiteSpace(c)) { i++; continue; }
            if (c == '/' && i + 1 < s.Length && s[i + 1] == '/') { while (i < s.Length && s[i] != '\n') i++; continue; }
            if (c is '{' or '}') { i++; return c.ToString(); }
            if (c == '"')
            {
                i++;
                var sb = new StringBuilder();
                while (i < s.Length && s[i] != '"')
                {
                    if (s[i] == '\\' && i + 1 < s.Length)
                    {
                        var n = s[i + 1];
                        sb.Append(n switch { 'n' => '\n', 't' => '\t', _ => n });
                        i += 2;
                        continue;
                    }
                    sb.Append(s[i++]);
                }
                i++;
                return sb.ToString();
            }
            var start = i;
            while (i < s.Length && !char.IsWhiteSpace(s[i]) && s[i] is not ('{' or '}' or '"')) i++;
            return s[start..i];
        }
        return null;
    }
}

public sealed class SteamDetector(IEnumerable<string> roots) : IDetector
{
    static readonly HashSet<string> SkipAppIds = new() { "228980", "1070560", "1391110", "1628350", "1493710", "2180100", "1826330" };
    public string Name => "Steam";

    public static IEnumerable<string> DefaultRoots()
    {
        var list = new List<string>();
        if (OperatingSystem.IsWindows())
        {
            try
            {
                using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Valve\Steam");
                if (k?.GetValue("SteamPath") is string p) list.Add(p.Replace('/', '\\'));
            }
            catch { }
            list.Add(@"C:\Program Files (x86)\Steam");
        }
        else
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            list.Add(Path.Combine(home, ".steam", "steam"));
            list.Add(Path.Combine(home, ".local", "share", "Steam"));
        }
        return list.Distinct(StringComparer.OrdinalIgnoreCase);
    }

    public IEnumerable<DetectedItem> Detect()
    {
        var seen = new HashSet<string>();
        foreach (var root in roots)
        {
            var libFile = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(libFile)) continue;
            var libraries = new List<string> { root };
            try
            {
                var vdf = Vdf.Parse(File.ReadAllText(libFile));
                var folders = vdf.Child("libraryfolders");
                if (folders != null)
                    foreach (var (_, v) in folders)
                        if (v is Vdf.Node n && n.Str("path") is { } p) libraries.Add(p);
            }
            catch (Exception ex) { Log.Warn("detect", $"Steam-Bibliotheksliste nicht lesbar: {ex.Message}"); }

            foreach (var lib in libraries.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var apps = Path.Combine(lib, "steamapps");
                if (!Directory.Exists(apps)) continue;
                foreach (var manifest in Directory.EnumerateFiles(apps, "appmanifest_*.acf"))
                {
                    DetectedItem? item = null;
                    try { item = ParseManifest(File.ReadAllText(manifest), apps); }
                    catch (Exception ex) { Log.Warn("detect", $"{Path.GetFileName(manifest)} nicht lesbar: {ex.Message}"); }
                    if (item != null && seen.Add(item.Target)) yield return item;
                }
            }
        }
    }

    public static DetectedItem? ParseManifest(string text, string steamappsDir)
    {
        var state = Vdf.Parse(text).Child("AppState");
        if (state == null) return null;
        var appId = state.Str("appid");
        var name = state.Str("name");
        if (appId == null || name == null || SkipAppIds.Contains(appId)) return null;
        if (name.Contains("Redistributable", StringComparison.OrdinalIgnoreCase) || name.StartsWith("Proton", StringComparison.OrdinalIgnoreCase) || name.StartsWith("Steam Linux Runtime", StringComparison.OrdinalIgnoreCase)) return null;
        // StateFlags bit 4 = fully installed. Anything else (downloading, update required) is not reported as installed.
        if (!int.TryParse(state.Str("StateFlags"), out var flags) || (flags & 4) == 0) return null;
        var installDir = state.Str("installdir");
        var full = installDir == null ? null : Path.Combine(steamappsDir, "common", installDir);
        return new DetectedItem("steam:" + appId, ItemKind.Game, name, LaunchSource.Steam, appId, full, new(),
            $"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg", "Steam", false);
    }
}

/// <summary>Install and update state of a Steam game, read from its appmanifest (what the Steam client itself writes).</summary>
public sealed record SteamAppState(string Status, long? SizeOnDisk, long? BytesToDownload, long? BytesDownloaded, DateTime? LastUpdated, string? BuildId)
{
    // StateFlags of the Steam client: 2 update required, 4 fully installed, 32 files missing, 128 files corrupt,
    // 256 update running, 512 update paused, 1024 update started, 1048576 downloading, 2097152 staging, 4194304 committing.
    const int UpdateRequired = 2, FilesMissing = 32, FilesCorrupt = 128, UpdatePaused = 512;
    const int Busy = 256 | 1024 | 1048576 | 2097152 | 4194304;

    /// <summary>appmanifest next to the "common" folder of the install dir; null if missing or unreadable.</summary>
    public static SteamAppState? ForInstallDir(string? installDir, string appId)
    {
        if (string.IsNullOrEmpty(installDir) || !System.Text.RegularExpressions.Regex.IsMatch(appId, "^[0-9]{1,10}$")) return null;
        var steamapps = Path.GetDirectoryName(Path.GetDirectoryName(installDir.TrimEnd('/', '\\')));
        if (steamapps == null) return null;
        var file = Path.Combine(steamapps, $"appmanifest_{appId}.acf");
        try { return File.Exists(file) ? Parse(File.ReadAllText(file)) : null; }
        catch (Exception ex) { Log.Warn("storage", $"{Path.GetFileName(file)} nicht lesbar: {ex.Message}"); return null; }
    }

    public static SteamAppState? Parse(string text)
    {
        var st = Vdf.Parse(text).Child("AppState");
        if (st == null || !int.TryParse(st.Str("StateFlags"), out var flags)) return null;
        static long? L(string? v) => long.TryParse(v, out var x) && x >= 0 ? x : null;
        var toDl = L(st.Str("BytesToDownload"));
        var done = L(st.Str("BytesDownloaded"));
        var status = (flags & Busy) != 0 ? "updating"
            : (flags & UpdatePaused) != 0 ? "paused"
            : (flags & (FilesMissing | FilesCorrupt)) != 0 ? "damaged"
            : (flags & UpdateRequired) != 0 || (toDl > 0 && done < toDl) ? "update"
            : (flags & 4) != 0 ? "current" : "unknown";
        DateTime? updated = L(st.Str("LastUpdated")) is { } u and > 0 ? DateTimeOffset.FromUnixTimeSeconds(u).UtcDateTime : null;
        return new SteamAppState(status, L(st.Str("SizeOnDisk")), toDl, done, updated, st.Str("buildid"));
    }
}

public sealed class EpicDetector(string? manifestDir) : IDetector
{
    public string Name => "Epic Games";
    public string? ManifestDir => manifestDir;

    public static string? DefaultManifestDir() => Environment.GetEnvironmentVariable("PGL_EPIC_MANIFESTS") is { Length: > 0 } dev ? dev : OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Epic", "EpicGamesLauncher", "Data", "Manifests")
        : null;

    public IEnumerable<DetectedItem> Detect()
    {
        if (manifestDir == null || !Directory.Exists(manifestDir)) yield break;
        foreach (var file in Directory.EnumerateFiles(manifestDir, "*.item"))
        {
            DetectedItem? item = null;
            try { item = ParseManifest(File.ReadAllText(file)); }
            catch (Exception ex) { Log.Warn("detect", $"Epic-Manifest {Path.GetFileName(file)} nicht lesbar: {ex.Message}"); }
            if (item != null) yield return item;
        }
    }

    public static DetectedItem? ParseManifest(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        string? S(string k) => r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var name = S("DisplayName");
        var app = S("AppName");
        var ns = S("CatalogNamespace");
        var cat = S("CatalogItemId");
        var install = S("InstallLocation");
        var exe = S("LaunchExecutable");
        if (name == null || app == null || ns == null || cat == null) return null;
        if (r.TryGetProperty("bIsIncompleteInstall", out var inc) && inc.ValueKind == JsonValueKind.True) return null;
        var target = $"{ns}:{cat}:{app}";
        if (LaunchValidator.ValidateTarget(LaunchSource.Epic, target) != null) return null;
        var procs = exe == null ? new List<string>() : new List<string> { Path.GetFileNameWithoutExtension(exe.Replace('\\', '/')) };
        return new DetectedItem("epic:" + app, ItemKind.Game, name, LaunchSource.Epic, target, install, procs, null, "Epic Games", false);
    }
}

/// <summary>
/// Installed EA app games, from the Windows uninstall entries that Electronic Arts' installer writes
/// (publisher "Electronic Arts", install folder and game executable). The EA app itself is left out.
/// </summary>
public static class EaDetector
{
    public sealed record Entry(string DisplayName, string? Publisher, string? InstallLocation, string? DisplayIcon);

    public static bool Present()
    {
        if (!OperatingSystem.IsWindows()) return false;
        try
        {
            using var k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Electronic Arts\EA Desktop") ?? Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Electronic Arts\EA Desktop");
            return k != null || Detect().Count > 0;
        }
        catch { return false; }
    }

    public static IReadOnlyList<DetectedItem> Detect()
    {
        var entries = new List<Entry>();
        if (OperatingSystem.IsWindows())
            foreach (var path in new[] { @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall" })
            {
                try
                {
                    using var root = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(path);
                    if (root == null) continue;
                    foreach (var name in root.GetSubKeyNames())
                    {
                        using var k = root.OpenSubKey(name);
                        if (k?.GetValue("DisplayName") is string dn)
                            entries.Add(new Entry(dn, k.GetValue("Publisher") as string, k.GetValue("InstallLocation") as string, k.GetValue("DisplayIcon") as string));
                    }
                }
                catch (Exception ex) { Log.Warn("detect", "EA-Einträge nicht lesbar: " + ex.Message); }
            }
        return FromEntries(entries, File.Exists);
    }

    public static IReadOnlyList<DetectedItem> FromEntries(IEnumerable<Entry> entries, Func<string, bool> fileExists)
    {
        var list = new List<DetectedItem>();
        foreach (var e in entries)
        {
            if (e.Publisher == null || !e.Publisher.Contains("Electronic Arts", StringComparison.OrdinalIgnoreCase)) continue;
            if (e.DisplayName.Contains("EA app", StringComparison.OrdinalIgnoreCase) || e.DisplayName.Contains("EA Desktop", StringComparison.OrdinalIgnoreCase) || e.DisplayName.StartsWith("Origin", StringComparison.OrdinalIgnoreCase)) continue;
            // DisplayIcon is "C:\Games\X\game.exe,0" or quoted; it points at the game executable.
            var exe = e.DisplayIcon?.Split(',')[0].Trim().Trim('"');
            if (exe == null || !exe.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || !fileExists(exe)) continue;
            if (Path.GetFileName(exe).StartsWith("unins", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(exe).Contains("Cleanup", StringComparison.OrdinalIgnoreCase)) continue;
            if (LaunchValidator.ValidateTarget(LaunchSource.Exe, exe) != null) continue;
            if (list.Any(x => string.Equals(x.Target, exe, StringComparison.OrdinalIgnoreCase))) continue;
            list.Add(new DetectedItem("ea:" + exe, ItemKind.Game, e.DisplayName.Trim(), LaunchSource.Exe, exe, e.InstallLocation ?? Path.GetDirectoryName(exe),
                new List<string> { Path.GetFileNameWithoutExtension(exe) }, null, "EA app", false));
        }
        return list;
    }
}

/// <summary>
/// Installed Xbox app / PC Game Pass games (GDK): every game folder holds a <c>MicrosoftGame.config</c> with the package
/// name, the publisher and the executable id. The Windows start id ("AUMID") is package family name + "!" + id; the family
/// name is the package name plus a hash of the publisher. A folder only counts when Windows lists that package as an app
/// (so leftovers of uninstalled games are skipped).
/// </summary>
public static class XboxDetector
{
    public sealed record Config(string IdentityName, string? Publisher, string DisplayName, string? ExeName, string AppId, string InstallDir);

    /// <summary>The XboxGames folders on all drives: the default "X:\XboxGames" plus folders listed in "X:\.GamingRoot".</summary>
    public static List<string> GameRoots(IEnumerable<string> driveRoots, Func<string, bool> dirExists, Func<string, byte[]?> readFile)
    {
        var roots = new List<string>();
        foreach (var drive in driveRoots)
        {
            var cands = new List<string> { Path.Combine(drive, "XboxGames") };
            if (readFile(Path.Combine(drive, ".GamingRoot")) is { } data) cands.AddRange(ParseGamingRoot(data).Select(r => Path.Combine(drive, r.TrimStart('\\', '/').Replace('\\', Path.DirectorySeparatorChar))));
            foreach (var c in cands) if (dirExists(c) && !roots.Contains(c, StringComparer.OrdinalIgnoreCase)) roots.Add(c);
        }
        return roots;
    }

    /// <summary>".GamingRoot": "RGBX", a version/count word, then UTF-16 folder names (relative to the drive), 0-terminated.</summary>
    public static List<string> ParseGamingRoot(byte[] data)
    {
        if (data.Length < 10 || data[0] != 'R' || data[1] != 'G' || data[2] != 'B' || data[3] != 'X') return new();
        var text = Encoding.Unicode.GetString(data, 8, (data.Length - 8) / 2 * 2);
        return text.Split('\0').Select(s => s.Trim()).Where(s => s.Length is > 0 and < 200 && !s.Contains("..") && s.All(c => !char.IsControl(c))).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public static Config? ParseConfig(string xml, string installDir)
    {
        System.Xml.Linq.XDocument doc;
        try { doc = System.Xml.Linq.XDocument.Parse(xml); } catch (System.Xml.XmlException) { return null; }
        var root = doc.Root;
        if (root == null || root.Name.LocalName != "Game") return null;
        System.Xml.Linq.XElement? El(string n) => root.Elements().FirstOrDefault(e => e.Name.LocalName == n);
        var identity = El("Identity");
        var name = identity?.Attribute("Name")?.Value;
        if (string.IsNullOrWhiteSpace(name) || !System.Text.RegularExpressions.Regex.IsMatch(name, @"^[A-Za-z0-9.\-]{3,50}$")) return null;
        var exe = El("ExecutableList")?.Elements().FirstOrDefault(e => e.Name.LocalName == "Executable");
        var appId = exe?.Attribute("Id")?.Value is { Length: > 0 } id && System.Text.RegularExpressions.Regex.IsMatch(id, @"^[A-Za-z][A-Za-z0-9.]{0,63}$") ? id : "Game";
        var display = El("ShellVisuals")?.Attribute("DefaultDisplayName")?.Value;
        if (string.IsNullOrWhiteSpace(display) || display.StartsWith("ms-resource:", StringComparison.OrdinalIgnoreCase))
            display = Path.GetFileName(installDir.TrimEnd('\\', '/')) is { Length: > 0 } folder && !folder.Equals("Content", StringComparison.OrdinalIgnoreCase)
                ? folder : Path.GetFileName(Path.GetDirectoryName(installDir.TrimEnd('\\', '/')) ?? name);
        var exeName = exe?.Attribute("Name")?.Value;
        return new Config(name, identity!.Attribute("Publisher")?.Value, display!.Trim(), exeName, appId, installDir);
    }

    /// <summary>Publisher id of a package family name (Windows' own rule: SHA-256 of the UTF-16 publisher, first 8 bytes, base32).</summary>
    public static string PublisherId(string publisher)
    {
        const string alphabet = "0123456789abcdefghjkmnpqrstvwxyz";
        var hash = System.Security.Cryptography.SHA256.HashData(Encoding.Unicode.GetBytes(publisher));
        ulong v = 0;
        for (var i = 0; i < 8; i++) v = (v << 8) | hash[i];
        var sb = new StringBuilder();
        // 64 bits + one 0 bit = 13 groups of 5 bits.
        for (var i = 0; i < 13; i++)
        {
            var shift = 59 - i * 5;
            var bits = shift >= 0 ? (int)((v >> shift) & 31) : (int)((v << -shift) & 31);
            sb.Append(alphabet[bits]);
        }
        return sb.ToString();
    }

    /// <summary>
    /// Games in the given roots. <paramref name="installedAumids"/> = start ids Windows lists (null when the list is not
    /// available; then the computed id is used).
    /// </summary>
    public static IReadOnlyList<DetectedItem> Detect(IEnumerable<string> roots, IReadOnlyCollection<string>? installedAumids)
    {
        var result = new List<DetectedItem>();
        foreach (var root in roots)
        {
            IEnumerable<string> dirs;
            try { dirs = Directory.EnumerateDirectories(root).ToList(); } catch { continue; }
            foreach (var dir in dirs)
            {
                var file = new[] { Path.Combine(dir, "Content", "MicrosoftGame.config"), Path.Combine(dir, "MicrosoftGame.config") }.FirstOrDefault(File.Exists);
                if (file == null) continue;
                Config? c;
                try { c = ParseConfig(File.ReadAllText(file), Path.GetDirectoryName(file)!); }
                catch (Exception ex) { Log.Warn("detect", $"Xbox: {dir}: {ex.Message}"); continue; }
                if (c == null) continue;
                var aumid = Aumid(c, installedAumids);
                if (aumid == null || LaunchValidator.ValidateTarget(LaunchSource.AppsFolder, aumid) != null) continue;
                if (result.Any(r => string.Equals(r.Target, aumid, StringComparison.OrdinalIgnoreCase))) continue;
                var procs = c.ExeName is { Length: > 0 } e ? new List<string> { Path.GetFileNameWithoutExtension(e.Replace('\\', '/')) } : new List<string>();
                result.Add(new DetectedItem("xbox:" + c.IdentityName, ItemKind.Game, c.DisplayName, LaunchSource.AppsFolder, aumid, c.InstallDir, procs, null, "Xbox", false));
            }
        }
        return result;
    }

    static string? Aumid(Config c, IReadOnlyCollection<string>? installed)
    {
        if (installed != null)
        {
            var ofPackage = installed.Where(a => a.StartsWith(c.IdentityName + "_", StringComparison.OrdinalIgnoreCase)).ToList();
            return ofPackage.FirstOrDefault(a => a.EndsWith("!" + c.AppId, StringComparison.OrdinalIgnoreCase)) ?? ofPackage.FirstOrDefault();
        }
        return c.Publisher is { Length: > 0 } p ? $"{c.IdentityName}_{PublisherId(p)}!{c.AppId}" : null;
    }
}
