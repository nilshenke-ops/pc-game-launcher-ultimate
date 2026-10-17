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

public sealed class EpicDetector(string? manifestDir) : IDetector
{
    public string Name => "Epic Games";

    public static string? DefaultManifestDir() => OperatingSystem.IsWindows()
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
        var procs = exe == null ? new List<string>() : new List<string> { Path.GetFileNameWithoutExtension(exe) };
        return new DetectedItem("epic:" + app, ItemKind.Game, name, LaunchSource.Epic, target, install, procs, null, "Epic Games", false);
    }
}
