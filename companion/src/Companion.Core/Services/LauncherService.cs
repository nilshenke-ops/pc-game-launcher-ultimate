using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// "Spiele → Epic" and "Spiele → EA". Neither Epic nor EA offers an official API for a user's game list, and logging in
/// on their behalf would mean impersonating their launchers – so only what the launchers store on this PC is used:
/// - Epic: installed games (launcher manifests) plus the launcher's own library cache (catcache.bin), which also lists
///   owned games that are not installed, with cover art;
/// - EA: installed EA app games (Windows uninstall entries published by Electronic Arts).
/// Installed games are added to the library automatically and removed again when uninstalled (only the ones added here).
/// </summary>
public sealed partial class LauncherService : IDisposable
{
    public const string Epic = "epic", Ea = "ea";
    readonly LibraryService _library;
    readonly IPlatform _platform;
    readonly SettingsService _settings;
    readonly IHub _hub;
    readonly EpicDetector _epic;
    readonly string? _epicCatalogFile;
    readonly Func<IReadOnlyList<DetectedItem>> _ea;
    readonly Func<bool> _eaFound;
    /// <summary>Cover lookup by title for owned Epic games without picture in the launcher cache.</summary>
    public Func<string, Task<string?>>? CoverByName { get; set; }
    readonly System.Collections.Concurrent.ConcurrentDictionary<string, string?> _covers = new();
    Timer? _timer;

    public LauncherService(LibraryService library, IPlatform platform, SettingsService settings, IHub hub,
        string? epicManifestDir = null, string? epicCatalogFile = null, Func<IReadOnlyList<DetectedItem>>? eaInstalled = null, Func<bool>? eaFound = null)
    {
        _library = library;
        _platform = platform;
        _settings = settings;
        _hub = hub;
        _epic = new EpicDetector(epicManifestDir ?? EpicDetector.DefaultManifestDir());
        _epicCatalogFile = epicCatalogFile ?? DefaultEpicCatalog();
        _ea = eaInstalled ?? (() => EaDetector.Detect());
        _eaFound = eaFound ?? EaDetector.Present;
    }

    static string? DefaultEpicCatalog() => Environment.GetEnvironmentVariable("PGL_EPIC_CATCACHE") is { Length: > 0 } dev ? dev : OperatingSystem.IsWindows()
        ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "Epic", "EpicGamesLauncher", "Data", "Catalog", "catcache.bin")
        : null;

    public void Start()
    {
        _timer = new Timer(_ =>
        {
            try { foreach (var s in new[] { Epic, Ea }) if (Enabled(s)) Sync(s); }
            catch (Exception ex) { Log.Warn("launchers", ex.Message); }
        }, null, TimeSpan.FromSeconds(25), TimeSpan.FromMinutes(10));
    }

    public void Dispose() => _timer?.Dispose();

    bool Enabled(string source) => source == Epic ? _settings.Get().EpicEnabled : _settings.Get().EaEnabled;

    static string Check(string source) => source is Epic or Ea ? source : throw new RpcException("invalid-params", "Unbekannter Launcher.");

    IReadOnlyList<DetectedItem> Installed(string source)
    {
        try { return source == Epic ? _epic.Detect().ToList() : _ea(); }
        catch (Exception ex) { Log.Warn("launchers", $"{source}: {ex.Message}"); return Array.Empty<DetectedItem>(); }
    }

    bool Found(string source) => source == Epic
        ? (_epic.ManifestDir is { } d && Directory.Exists(d)) || (_epicCatalogFile != null && File.Exists(_epicCatalogFile))
        : _eaFound();

    /// <summary>Adds/removes installed games in the library. Without a launcher installation nothing is removed.</summary>
    public object Sync(string source)
    {
        Check(source);
        if (!Enabled(source)) throw new RpcException("disabled", "Nicht verknüpft.");
        if (Found(source))
        {
            var installed = Installed(source);
            var (added, removed) = _library.ReconcileLauncher(source, installed);
            if (added + removed > 0) Log.Info("launchers", $"{source}: {added} hinzugefügt, {removed} entfernt.");
            if (source == Epic)
            {
                var owned = EpicOwned();
                if (CoverByName != null)
                    _ = Task.Run(async () =>
                    {
                        foreach (var o in owned.Where(o => o.Cover == null && !_covers.ContainsKey(o.CatalogItemId)).Take(30))
                            _covers[o.CatalogItemId] = await CoverByName(o.Title);
                        _hub.Changed("launchers");
                    });
                foreach (var i in _library.List().Where(i => i.Source == LaunchSource.Epic && string.IsNullOrEmpty(i.CoverUrl)))
                    if (owned.FirstOrDefault(o => i.Target.Split(':').ElementAtOrDefault(1) == o.CatalogItemId) is { Cover: { } c }) _library.SetCover(i.Id, c);
            }
        }
        _hub.Changed("launchers");
        return List(source);
    }

    public object List(string source)
    {
        Check(source);
        var enabled = Enabled(source);
        var installed = enabled ? Installed(source) : Array.Empty<DetectedItem>();
        var items = _library.List();
        var games = new List<LauncherGame>();
        string Key(DetectedItem d) => d.Source == LaunchSource.Epic ? d.Target.Split(':').ElementAtOrDefault(1) ?? d.Target : d.Target;
        var installedKeys = installed.Select(Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        LibraryItem? Item(DetectedItem d) => items.FirstOrDefault(i => i.Source == d.Source && string.Equals(i.Target, d.Target, StringComparison.OrdinalIgnoreCase));
        foreach (var d in installed)
        {
            var item = Item(d);
            games.Add(new LauncherGame(Key(d), d.Name, item?.CoverUrl ?? d.CoverUrl, true, item?.Id, false));
        }
        string? note = null;
        if (source == Epic && enabled)
        {
            var owned = EpicOwned();
            foreach (var o in owned.Where(o => !installedKeys.Contains(o.CatalogItemId)))
                games.Add(new LauncherGame(o.CatalogItemId, o.Title, o.Cover ?? _covers.GetValueOrDefault(o.CatalogItemId), false, null, o.AppName != null));
            if (owned.Count == 0) note = "Nicht installierte Epic-Spiele erscheinen, sobald der Epic Games Launcher auf dem PC einmal deine Bibliothek geladen hat.";
        }
        if (source == Ea) note = "EA bietet keine Schnittstelle für die ganze Bibliothek – angezeigt werden die auf dem PC installierten EA-Spiele.";
        return new
        {
            source, enabled, found = enabled && Found(source), note,
            games = games.OrderByDescending(g => g.Installed).ThenBy(g => g.Name, StringComparer.CurrentCultureIgnoreCase).ToList(),
        };
    }

    public sealed record LauncherGame(string Id, string Name, string? Cover, bool Installed, string? ItemId, bool Installable);
    public sealed record EpicGame(string CatalogItemId, string Namespace, string? AppName, string Title, string? Cover);

    /// <summary>Owned games from the Epic Games Launcher's library cache (Base64-encoded JSON). Add-ons/DLC and apps are left out.</summary>
    public List<EpicGame> EpicOwned()
    {
        if (_epicCatalogFile == null || !File.Exists(_epicCatalogFile)) return new();
        try { return ParseEpicCatalog(File.ReadAllText(_epicCatalogFile)); }
        catch (Exception ex) { Log.Warn("launchers", "Epic-Bibliothekscache nicht lesbar: " + ex.Message); return new(); }
    }

    public static List<EpicGame> ParseEpicCatalog(string content)
    {
        var text = content.TrimStart().StartsWith('[') ? content : Encoding.UTF8.GetString(Convert.FromBase64String(content.Trim()));
        using var doc = JsonDocument.Parse(text);
        var list = new List<EpicGame>();
        foreach (var it in doc.RootElement.EnumerateArray())
        {
            string? S(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            var id = S(it, "id"); var ns = S(it, "namespace"); var title = S(it, "title");
            if (id == null || ns == null || string.IsNullOrWhiteSpace(title)) continue;
            if (it.TryGetProperty("mainGameItem", out var main) && main.ValueKind == JsonValueKind.Object) continue; // DLC / add-on
            var cats = it.TryGetProperty("categories", out var c) && c.ValueKind == JsonValueKind.Array ? c.EnumerateArray().Select(x => S(x, "path")).OfType<string>().ToList() : new List<string>();
            if (!cats.Contains("games") || cats.Any(x => x.StartsWith("addons", StringComparison.Ordinal) || x == "digitalextras")) continue;
            string? app = null;
            if (it.TryGetProperty("releaseInfo", out var ri) && ri.ValueKind == JsonValueKind.Array)
                foreach (var r in ri.EnumerateArray())
                    if (S(r, "appId") is { } a && (!r.TryGetProperty("platform", out var p) || p.EnumerateArray().Any(x => x.GetString() == "Windows"))) { app = a; break; }
            string? cover = null;
            if (it.TryGetProperty("keyImages", out var imgs) && imgs.ValueKind == JsonValueKind.Array)
                foreach (var type in new[] { "DieselGameBoxTall", "OfferImageTall", "DieselGameBox", "Thumbnail" })
                {
                    cover = imgs.EnumerateArray().Where(i => S(i, "type") == type).Select(i => S(i, "url")).FirstOrDefault(u => u != null && u.StartsWith("https://", StringComparison.Ordinal));
                    if (cover != null) break;
                }
            if (LaunchValidator.ValidateTarget(LaunchSource.Epic, $"{ns}:{id}:{app ?? "x"}") != null) continue;
            if (list.All(x => x.CatalogItemId != id)) list.Add(new EpicGame(id, ns, app, title.Trim(), cover));
        }
        return list;
    }

    public string? Install(string source, string id)
    {
        Check(source);
        if (source != Epic) throw new RpcException("unsupported", "Installieren geht hier nur für Epic-Spiele. EA-Spiele installierst du in der EA app.");
        var g = EpicOwned().FirstOrDefault(x => x.CatalogItemId == id) ?? throw new RpcException("not-found", "Spiel nicht in der Epic-Bibliothek gefunden.");
        if (g.AppName == null) throw new RpcException("unsupported", "Für dieses Spiel kennt der Epic-Launcher keine Windows-Version.");
        return _platform.Desktop.OpenEpicInstall($"{g.Namespace}:{g.CatalogItemId}:{g.AppName}");
    }
}
