using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Steam link ("Spiele → Steam"):
/// - installed Steam games (from the local Steam library files, no account needed) are added to the library automatically
///   and removed again when they are uninstalled; games the user added by hand are never touched;
/// - optionally the whole Steam library (also games that are not installed) through the official Steam Web API with the
///   user's own Web API key + Steam ID. The key is stored encrypted and never sent to any client.
/// No Steam password is ever asked for or stored.
/// </summary>
public sealed partial class SteamService : IDisposable
{
    static readonly TimeSpan OwnedInterval = TimeSpan.FromHours(6);
    static readonly TimeSpan InstallScanInterval = TimeSpan.FromMinutes(10);

    readonly JsonStore<SteamFile> _store;
    readonly LibraryService _library;
    readonly IPlatform _platform;
    readonly SettingsService _settings;
    readonly SteamDetector _detector;
    readonly IReadOnlyList<string> _roots;
    readonly IHub _hub;
    readonly HttpClient _http;
    readonly SemaphoreSlim _gate = new(1, 1);
    Timer? _timer;
    List<DetectedItem> _installed = new();
    bool _steamFound;
    DateTime _scannedAt = DateTime.MinValue;

    public bool Syncing { get; private set; }

    public SteamService(AppPaths paths, LibraryService library, IPlatform platform, SettingsService settings, IHub hub,
        IEnumerable<string>? steamRoots = null, HttpMessageHandler? http = null)
    {
        _store = new JsonStore<SteamFile>(paths.File("steam.json"));
        _library = library;
        _platform = platform;
        _settings = settings;
        _hub = hub;
        _roots = (steamRoots ?? SteamDetector.DefaultRoots()).ToList();
        _detector = new SteamDetector(_roots);
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(30);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PCGameLauncherUltimate/1.0");
    }

    public void Start()
    {
        _timer?.Dispose();
        _timer = new Timer(_ => { if (_settings.Get().SteamEnabled) _ = SyncAsync(force: false).ContinueWith(t => _ = t.Exception); }, null, TimeSpan.FromSeconds(15), InstallScanInterval);
    }

    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }

    [GeneratedRegex(@"^\d{17}$")] private static partial Regex SteamId64();
    [GeneratedRegex(@"^[0-9A-Fa-f]{32}$")] private static partial Regex ApiKey();

    void ScanInstalled()
    {
        _steamFound = _roots.Any(r => File.Exists(Path.Combine(r, "steamapps", "libraryfolders.vdf")));
        try { _installed = _detector.Detect().ToList(); }
        catch (Exception ex) { Log.Warn("steam", "Steam-Bibliothek nicht lesbar: " + ex.Message); }
        _scannedAt = DateTime.UtcNow;
    }

    /// <summary>Steam account that is logged in on this PC (from Steam's own loginusers.vdf) – used to prefill the link.</summary>
    public (string steamId, string? name)? LocalAccount()
    {
        foreach (var root in _roots)
        {
            var file = Path.Combine(root, "config", "loginusers.vdf");
            if (!File.Exists(file)) continue;
            try
            {
                var users = Vdf.Parse(File.ReadAllText(file)).Child("users");
                if (users == null) continue;
                var list = users.Where(u => SteamId64().IsMatch(u.Key) && u.Value is Vdf.Node).Select(u => (id: u.Key, n: (Vdf.Node)u.Value)).ToList();
                var pick = list.FirstOrDefault(u => u.n.Str("MostRecent") == "1");
                if (pick.id == null && list.Count > 0) pick = list[0];
                if (pick.id != null) return (pick.id, pick.n.Str("PersonaName"));
            }
            catch (Exception ex) { Log.Warn("steam", "loginusers.vdf nicht lesbar: " + ex.Message); }
        }
        return null;
    }

    public object List()
    {
        if (DateTime.UtcNow - _scannedAt > TimeSpan.FromMinutes(1)) ScanInstalled();
        var f = _store.Snapshot();
        var s = _settings.Get();
        var items = _library.List();
        var installedIds = _installed.Select(i => i.Target).ToHashSet();
        var games = new Dictionary<string, (string name, int? playtime, DateTime? lastPlayed)>();
        foreach (var g in f.Owned) games[g.AppId.ToString()] = (g.Name, g.PlaytimeMinutes, g.LastPlayed);
        foreach (var i in _installed) if (!games.ContainsKey(i.Target)) games[i.Target] = (i.Name, null, null);
        var local = LocalAccount();
        return new
        {
            enabled = s.SteamEnabled,
            steamFound = _steamFound,
            linked = f.SteamId != null && s.SteamApiKeyProtected != null,
            steamId = f.SteamId,
            persona = f.Persona,
            keySet = s.SteamApiKeyProtected != null,
            localAccount = local == null ? null : new { steamId = local.Value.steamId, name = local.Value.name },
            lastSync = f.LastSync,
            error = f.Error,
            syncing = Syncing,
            games = games.Select(kv => new
            {
                appId = kv.Key,
                name = kv.Value.name,
                cover = f.Covers.TryGetValue(kv.Key, out var c) ? c : SteamArt.OldCover(kv.Key),
                installed = installedIds.Contains(kv.Key),
                itemId = items.FirstOrDefault(i => i.Source == LaunchSource.Steam && i.Target == kv.Key)?.Id,
                playtimeMinutes = kv.Value.playtime,
                lastPlayed = kv.Value.lastPlayed,
            }).OrderByDescending(g => g.installed).ThenBy(g => g.name, StringComparer.CurrentCultureIgnoreCase).ToList(),
        };
    }

    /// <summary>Stores Steam ID + Web API key (encrypted). An empty key keeps the stored one.</summary>
    public async Task<object> Link(string profile, string? apiKey)
    {
        var key = string.IsNullOrWhiteSpace(apiKey) ? null : apiKey.Trim();
        if (key != null && !ApiKey().IsMatch(key)) throw new RpcException("invalid-params", "Der Steam-Web-API-Schlüssel hat 32 Zeichen (0–9, A–F). Du bekommst ihn unter steamcommunity.com/dev/apikey.");
        if (key == null && _settings.Get().SteamApiKeyProtected == null) throw new RpcException("invalid-params", "Bitte den Steam-Web-API-Schlüssel eintragen.");
        var id = await ResolveSteamId(profile.Trim());
        _settings.SetSteamKey(key == null ? null : _platform.Secrets.Protect(key), keep: key == null);
        _store.Update(x => { x.SteamId = id; x.Error = null; x.LastSync = null; });
        return await SyncAsync(force: true);
    }

    public object Unlink()
    {
        _settings.SetSteamKey(null, keep: false);
        _store.Update(x => { x.SteamId = null; x.Persona = null; x.Owned.Clear(); x.LastSync = null; x.Error = null; });
        _hub.Changed("steam");
        return List();
    }

    async Task<string> ResolveSteamId(string profile)
    {
        if (SteamId64().IsMatch(profile)) return profile;
        var m = Regex.Match(profile, @"steamcommunity\.com/(profiles|id)/([^/?#\s]+)", RegexOptions.IgnoreCase);
        if (m.Success && m.Groups[1].Value.Equals("profiles", StringComparison.OrdinalIgnoreCase) && SteamId64().IsMatch(m.Groups[2].Value)) return m.Groups[2].Value;
        var vanity = m.Success ? m.Groups[2].Value : profile;
        if (!Regex.IsMatch(vanity, "^[A-Za-z0-9_-]{2,32}$")) throw new RpcException("invalid-params", "Bitte deinen Steam-Profillink (steamcommunity.com/id/… oder /profiles/…) oder die 17-stellige Steam-ID eingeben.");
        try
        {
            var xml = XDocument.Parse(await _http.GetStringAsync($"https://steamcommunity.com/id/{vanity}/?xml=1"));
            var id = xml.Root?.Element("steamID64")?.Value;
            if (id != null && SteamId64().IsMatch(id)) return id;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or System.Xml.XmlException) { }
        throw new RpcException("not-found", $"Steam-Profil „{vanity}“ wurde nicht gefunden.");
    }

    public async Task<object> SyncAsync(bool force)
    {
        if (!_settings.Get().SteamEnabled) throw new RpcException("disabled", "Steam ist nicht verknüpft (Spiele → Steam → Verknüpfen).");
        if (!await _gate.WaitAsync(0)) return List();
        Syncing = true;
        _hub.Changed("steam");
        try
        {
            ScanInstalled();
            // Without any Steam installation found nothing is removed (e.g. drive not connected).
            if (_steamFound)
            {
                var (added, removed) = _library.ReconcileSteam(_installed);
                if (added + removed > 0) Log.Info("steam", $"Bibliothek abgeglichen: {added} hinzugefügt, {removed} entfernt.");
            }
            await ResolveCovers();
            var f = _store.Snapshot();
            if (f.SteamId != null && _settings.Get().SteamApiKeyProtected != null && (force || f.LastSync == null || DateTime.UtcNow - f.LastSync > OwnedInterval))
                await FetchOwned(f.SteamId);
        }
        finally
        {
            Syncing = false;
            _gate.Release();
            _hub.Changed("steam");
        }
        return List();
    }

    async Task FetchOwned(string steamId)
    {
        var key = _platform.Secrets.Unprotect(_settings.Get().SteamApiKeyProtected!);
        if (key == null) { _store.Update(x => x.Error = "Der gespeicherte Steam-Schlüssel ist nicht lesbar. Bitte neu eintragen."); return; }
        try
        {
            using var resp = await _http.GetAsync($"https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key={key}&steamid={steamId}&include_appinfo=1&include_played_free_games=1&format=json");
            if ((int)resp.StatusCode is 401 or 403) throw new InvalidOperationException("Steam hat den Web-API-Schlüssel abgelehnt. Bitte unter steamcommunity.com/dev/apikey prüfen und neu eintragen.");
            resp.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var r = doc.RootElement.GetProperty("response");
            if (!r.TryGetProperty("games", out var games))
                throw new InvalidOperationException("Steam liefert keine Spiele für dieses Profil. Stelle in Steam unter Profil → Privatsphäre-Einstellungen „Spieldetails“ auf „Öffentlich“.");
            var owned = games.EnumerateArray().Select(g => new SteamOwnedGame
            {
                AppId = g.GetProperty("appid").GetInt64(),
                Name = g.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "",
                PlaytimeMinutes = g.TryGetProperty("playtime_forever", out var p) ? p.GetInt32() : null,
                LastPlayed = g.TryGetProperty("rtime_last_played", out var lp) && lp.GetInt64() > 0 ? DateTimeOffset.FromUnixTimeSeconds(lp.GetInt64()).UtcDateTime : null,
            }).Where(g => g.Name.Length > 0).ToList();
            string? persona = null;
            try { persona = XDocument.Parse(await _http.GetStringAsync($"https://steamcommunity.com/profiles/{steamId}/?xml=1")).Root?.Element("steamID")?.Value; } catch { /* optional */ }
            _store.Update(x => { x.Owned = owned; x.LastSync = DateTime.UtcNow; x.Error = null; x.Persona = persona ?? x.Persona; });
            await ResolveCovers();
            Log.Info("steam", $"Steam-Bibliothek geladen: {owned.Count} Spiele.");
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or KeyNotFoundException)
        {
            var msg = ex is TaskCanceledException ? "Steam antwortet nicht (Zeitüberschreitung)." : ex.Message;
            _store.Update(x => x.Error = msg);
            Log.Warn("steam", msg);
        }
    }

    /// <summary>Looks up real covers for Steam games that do not have one yet and fixes library items with the old, broken path.</summary>
    async Task ResolveCovers()
    {
        var known = _store.Get(x => x.Covers.Keys.ToHashSet());
        var ids = _store.Get(x => x.Owned.Select(o => o.AppId.ToString()).ToList()).Concat(_installed.Select(i => i.Target))
            .Concat(_library.List().Where(i => i.Source == LaunchSource.Steam).Select(i => i.Target)).Where(id => !known.Contains(id)).Distinct().ToList();
        if (ids.Count > 0)
        {
            var found = await SteamArt.ResolveAsync(_http, ids);
            if (found.Count > 0) _store.Update(x => { foreach (var (k, v) in found) x.Covers[k] = v; });
        }
        _library.ReplaceSteamCovers(_store.Get(x => new Dictionary<string, string>(x.Covers)));
    }

    public string? Install(string appId)
    {
        if (!Regex.IsMatch(appId, @"^\d{1,10}$")) throw new RpcException("invalid-params", "Ungültige Steam-App-ID.");
        return _platform.Desktop.OpenSteamInstall(appId);
    }
}

public sealed class SteamOwnedGame
{
    public long AppId { get; set; }
    public string Name { get; set; } = "";
    public int? PlaytimeMinutes { get; set; }
    public DateTime? LastPlayed { get; set; }
}

public sealed class SteamFile
{
    public string? SteamId { get; set; }
    public string? Persona { get; set; }
    public List<SteamOwnedGame> Owned { get; set; } = new();
    /// <summary>App id → real cover URL (from the store API).</summary>
    public Dictionary<string, string> Covers { get; set; } = new();
    public DateTime? LastSync { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Real Steam cover art. Newer games only have hashed image paths (the old cdn …/apps/&lt;id&gt;/library_600x900.jpg returns 404),
/// so the paths come from Steam's public store API (IStoreBrowseService/GetItems, no key needed). Portrait art first, else header.
/// </summary>
public static class SteamArt
{
    public static string OldCover(string appId) => $"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg";

    public static async Task<Dictionary<string, string>> ResolveAsync(HttpClient http, IEnumerable<string> appIds, string apiBase = "https://api.steampowered.com")
    {
        var result = new Dictionary<string, string>();
        foreach (var batch in appIds.Where(id => Regex.IsMatch(id, @"^\d{1,10}$")).Distinct().Chunk(50))
        {
            var input = JsonSerializer.Serialize(new
            {
                ids = batch.Select(id => new { appid = long.Parse(id) }),
                context = new { language = "german", country_code = "DE" },
                data_request = new { include_assets = true },
            });
            try
            {
                using var doc = JsonDocument.Parse(await http.GetStringAsync($"{apiBase}/IStoreBrowseService/GetItems/v1/?input_json={Uri.EscapeDataString(input)}"));
                if (!doc.RootElement.TryGetProperty("response", out var r) || !r.TryGetProperty("store_items", out var items)) continue;
                foreach (var it in items.EnumerateArray())
                {
                    if (!it.TryGetProperty("appid", out var aid) || !it.TryGetProperty("assets", out var a) || !a.TryGetProperty("asset_url_format", out var fmt)) continue;
                    var file = a.TryGetProperty("library_capsule", out var lc) ? lc.GetString() : a.TryGetProperty("header", out var h) ? h.GetString() : null;
                    if (file == null || fmt.GetString() is not { } f) continue;
                    result[aid.GetInt64().ToString()] = "https://shared.akamai.steamstatic.com/store_item_assets/" + f.Replace("${FILENAME}", file);
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { Log.Warn("steam", "Cover nicht abrufbar: " + ex.Message); }
        }
        return result;
    }
}
