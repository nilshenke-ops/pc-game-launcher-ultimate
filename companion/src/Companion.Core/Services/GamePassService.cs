using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Keeps the "Game Pass" category in sync with Microsoft's public PC Game Pass catalog:
/// - the catalog (all PC games, with title, cover and package family name) is read from catalog.gamepass.com
///   and displaycatalog.mp.microsoft.com (the same public endpoints the Xbox website uses), at most every 12 hours;
/// - installed Xbox-app games are matched by package family name against the start-menu apps of this PC;
/// - installed catalog games are added to the library automatically (category "Game Pass") and removed again when
///   they are uninstalled or leave Game Pass. Games the user added by hand only get or lose the category.
/// Ownership (bought vs. Game Pass) cannot be read locally; membership means "currently in the PC Game Pass catalog".
/// </summary>
public sealed partial class GamePassService : IDisposable
{
    public const string Category = "Game Pass";
    /// <summary>Catalog list "Alle PC-Spiele" (PC Game Pass, all games).</summary>
    const string PcAllGamesList = "609d944c-d395-4c0a-9ea4-e9f39b52c1ad";
    static readonly TimeSpan CatalogInterval = TimeSpan.FromHours(12);
    static readonly TimeSpan InstallScanInterval = TimeSpan.FromMinutes(15);
    static readonly TimeSpan NewFor = TimeSpan.FromDays(14);

    readonly JsonStore<GamePassFile> _store;
    readonly LibraryService _library;
    readonly IPlatform _platform;
    readonly Func<Settings> _settings;
    readonly IHub _hub;
    readonly HttpClient _http;
    readonly SemaphoreSlim _gate = new(1, 1);
    Timer? _timer;
    Dictionary<string, string> _installed = new(StringComparer.OrdinalIgnoreCase); // package family name → AppsFolder id
    DateTime _installedScannedAt = DateTime.MinValue;

    public bool Syncing { get; private set; }

    public GamePassService(AppPaths paths, LibraryService library, IPlatform platform, Func<Settings> settings, IHub hub, HttpMessageHandler? http = null)
    {
        _store = new JsonStore<GamePassFile>(paths.File("gamepass.json"));
        _library = library;
        _platform = platform;
        _settings = settings;
        _hub = hub;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(30);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PCGameLauncherUltimate/1.0");
    }

    /// <summary>Checks every 15 minutes whether something is due (catalog every 12 h, installed games every 15 min). Off when disabled.</summary>
    public void Start()
    {
        _timer?.Dispose();
        _timer = new Timer(_ => { if (_settings().GamePassEnabled) GameActivity.RunWhenIdle("gamepass", () => SyncAsync(force: false)); }, null, TimeSpan.FromSeconds(20), InstallScanInterval);
    }

    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }

    public static string? ValidProductId(string? id) => id != null && ProductIdRegex().IsMatch(id) ? id : null;
    [GeneratedRegex("^[0-9A-Z]{12}$")] private static partial Regex ProductIdRegex();

    public object List()
    {
        var f = _store.Snapshot();
        RefreshInstalledIfOld(TimeSpan.FromMinutes(2));
        var items = _library.List();
        var now = DateTime.UtcNow;
        return new
        {
            enabled = _settings().GamePassEnabled,
            market = _settings().GamePassMarket,
            lastSync = f.LastSync,
            error = f.Error,
            syncing = Syncing,
            installScanSupported = _platform.Desktop.CanListApps,
            games = f.Games.Select(g =>
            {
                var item = items.FirstOrDefault(i => i.GamePassId == g.Id) ?? items.FirstOrDefault(i => g.Pfn != null && IsPackageOf(i, g.Pfn));
                return new
                {
                    id = g.Id, title = g.Title, cover = g.Cover, category = g.Category,
                    installed = g.Pfn != null && _installed.ContainsKey(g.Pfn),
                    launchable = g.Pfn != null,
                    itemId = item?.Id,
                    isNew = f.InitialSyncAt != null && g.FirstSeen > f.InitialSyncAt && now - g.FirstSeen < NewFor,
                };
            }).OrderBy(g => g.title, StringComparer.CurrentCultureIgnoreCase).ToList(),
        };
    }

    static bool IsPackageOf(LibraryItem i, string pfn) =>
        i.Source == LaunchSource.AppsFolder && i.Target.StartsWith(pfn + "!", StringComparison.OrdinalIgnoreCase);

    void RefreshInstalledIfOld(TimeSpan maxAge)
    {
        if (!_platform.Desktop.CanListApps || DateTime.UtcNow - _installedScannedAt < maxAge) return;
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            foreach (var app in _platform.Desktop.StartMenuApps())
            {
                var bang = app.Target.IndexOf('!');
                if (app.Source == LaunchSource.AppsFolder && bang > 0) map.TryAdd(app.Target[..bang], app.Target);
            }
            _installed = map;
            _installedScannedAt = DateTime.UtcNow;
        }
        catch (Exception ex) { Log.Warn("gamepass", "Installierte Apps nicht lesbar: " + ex.Message); }
    }

    /// <summary>Reads the catalog if due (or forced), scans installed games and updates the library.</summary>
    public async Task<object> SyncAsync(bool force)
    {
        if (!_settings().GamePassEnabled) throw new RpcException("disabled", "Game Pass ist ausgeschaltet (Spiele → Game Pass → Einschalten).");
        if (!await _gate.WaitAsync(0)) return List(); // already running
        Syncing = true;
        _hub.Changed("gamepass");
        try
        {
            var f = _store.Snapshot();
            if (force || f.LastSync == null || DateTime.UtcNow - f.LastSync > CatalogInterval || f.Games.Count == 0)
                await FetchCatalog();
            RefreshInstalledIfOld(force ? TimeSpan.Zero : InstallScanInterval - TimeSpan.FromMinutes(1));
            Reconcile();
        }
        finally
        {
            Syncing = false;
            _gate.Release();
            _hub.Changed("gamepass");
        }
        return List();
    }

    async Task FetchCatalog()
    {
        var s = _settings();
        var market = s.GamePassMarket;
        var lang = s.Language == "en" ? "en-us" : "de-de";
        try
        {
            using var doc = JsonDocument.Parse(await _http.GetStringAsync($"https://catalog.gamepass.com/sigls/v2?id={PcAllGamesList}&language={lang}&market={market}"));
            var ids = doc.RootElement.EnumerateArray().Select(e => e.TryGetProperty("id", out var id) ? ValidProductId(id.GetString()) : null).OfType<string>().Distinct().ToList();
            if (ids.Count == 0) throw new InvalidOperationException("Der Katalog war leer.");

            var games = new List<GamePassGame>();
            foreach (var batch in ids.Chunk(20))
            {
                using var d = JsonDocument.Parse(await _http.GetStringAsync($"https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds={string.Join(',', batch)}&market={market}&languages={lang}&MS-CV=PGLauncher.0"));
                foreach (var p in d.RootElement.GetProperty("Products").EnumerateArray())
                    if (Parse(p) is { } g) games.Add(g);
            }
            // A catalog that suddenly shrinks a lot is more likely a broken response than half of Game Pass leaving.
            var before = _store.Get(x => x.Games.Count);
            if (before > 50 && games.Count < before / 2) throw new InvalidOperationException($"Antwort unvollständig ({games.Count} statt ~{before} Spiele) – Bibliothek bleibt unverändert.");

            _store.Update(x =>
            {
                var firstSeen = x.Games.ToDictionary(g => g.Id, g => g.FirstSeen);
                foreach (var g in games) g.FirstSeen = firstSeen.TryGetValue(g.Id, out var fs) ? fs : DateTime.UtcNow;
                x.InitialSyncAt ??= DateTime.UtcNow;
                x.Games = games;
                x.LastSync = DateTime.UtcNow;
                x.Error = null;
            });
            Log.Info("gamepass", $"Game-Pass-Katalog aktualisiert: {games.Count} PC-Spiele ({market}).");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or KeyNotFoundException)
        {
            var msg = ex is TaskCanceledException ? "Zeitüberschreitung beim Abruf des Katalogs." : ex.Message;
            _store.Update(x => x.Error = "Katalog nicht aktualisiert: " + msg);
            Log.Warn("gamepass", "Katalog nicht aktualisiert: " + msg);
        }
    }

    internal static GamePassGame? Parse(JsonElement p)
    {
        var id = ValidProductId(p.TryGetProperty("ProductId", out var pid) ? pid.GetString() : null);
        if (id == null || !p.TryGetProperty("LocalizedProperties", out var lps) || lps.GetArrayLength() == 0) return null;
        var lp = lps[0];
        var title = lp.TryGetProperty("ProductTitle", out var t) ? t.GetString() : null;
        if (string.IsNullOrWhiteSpace(title)) return null;
        string? cover = null;
        if (lp.TryGetProperty("Images", out var imgs))
            foreach (var purpose in new[] { "Poster", "BoxArt" })
            {
                var img = imgs.EnumerateArray().FirstOrDefault(i => i.TryGetProperty("ImagePurpose", out var ip) && ip.GetString() == purpose);
                if (img.ValueKind == JsonValueKind.Object && img.TryGetProperty("Uri", out var u) && u.GetString() is { } uri)
                {
                    cover = (uri.StartsWith("//") ? "https:" + uri : uri);
                    if (!cover.StartsWith("https://store-images.s-microsoft.com/", StringComparison.Ordinal)) cover = null;
                    if (cover != null) break;
                }
            }
        string? pfn = null;
        if (p.TryGetProperty("DisplaySkuAvailabilities", out var skus))
            foreach (var sku in skus.EnumerateArray())
            {
                if (!sku.TryGetProperty("Sku", out var s) || !s.TryGetProperty("Properties", out var sp) || !sp.TryGetProperty("Packages", out var pkgs) || pkgs.ValueKind != JsonValueKind.Array) continue;
                foreach (var pkg in pkgs.EnumerateArray())
                {
                    var desktop = pkg.TryGetProperty("PlatformDependencies", out var deps) && deps.EnumerateArray().Any(dd => dd.TryGetProperty("PlatformName", out var pn) && pn.GetString() == "Windows.Desktop");
                    if (desktop && pkg.TryGetProperty("PackageFamilyName", out var f) && f.GetString() is { Length: > 0 } fam) { pfn = fam; break; }
                }
                if (pfn != null) break;
            }
        var category = p.TryGetProperty("Properties", out var props) && props.TryGetProperty("Category", out var c) ? c.GetString() : null;
        return new GamePassGame { Id = id, Title = title.Trim(), Cover = cover, Pfn = pfn, Category = category };
    }

    /// <summary>Brings the library in line with catalog + installed games. Never touches anything when the catalog is unknown.</summary>
    void Reconcile()
    {
        var games = _store.Get(x => x.Games.ToList());
        if (games.Count == 0) return;
        if (!_platform.Desktop.CanListApps) return; // without an installed-apps list nothing can be matched safely
        var (added, removed) = _library.ReconcileGamePass(games, _installed);
        if (added + removed > 0) Log.Info("gamepass", $"Bibliothek abgeglichen: {added} hinzugefügt, {removed} entfernt.");
    }

    /// <summary>Opens the game's page in the Xbox app (falls back to the Microsoft Store) to install it.</summary>
    public string? OpenInstallPage(string productId)
    {
        var id = ValidProductId(productId) ?? throw new RpcException("invalid-params", "Ungültige Produkt-ID.");
        if (_store.Get(x => x.Games.All(g => g.Id != id))) throw new RpcException("not-found", "Dieses Spiel ist nicht im Game-Pass-Katalog.");
        return _platform.Desktop.OpenStoreProduct(id);
    }
}

public sealed class GamePassGame
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Cover { get; set; }
    /// <summary>Package family name of the PC version (null e.g. for games installed through the EA app).</summary>
    public string? Pfn { get; set; }
    public string? Category { get; set; }
    public DateTime FirstSeen { get; set; }
}

public sealed class GamePassFile
{
    public List<GamePassGame> Games { get; set; } = new();
    public DateTime? LastSync { get; set; }
    /// <summary>First successful sync – games seen before it are not marked "new".</summary>
    public DateTime? InitialSyncAt { get; set; }
    public string? Error { get; set; }
}
