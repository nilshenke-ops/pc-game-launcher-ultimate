using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>
/// Finds real cover art for games without one (Epic, Microsoft Store/Xbox, own EXE files):
/// 1. Store/Xbox apps: Microsoft Store entry by package family name (exact).
/// 2. Otherwise by name: Steam store search, then Microsoft Store search – only on an exact (normalised) title match,
///    so a wrong cover ("Hades" → "Hades II") is never taken. No match → the game keeps its initials.
/// Each game is looked up once (again after 30 days if nothing was found). Only public store APIs are used.
/// </summary>
public sealed partial class CoverService : IDisposable
{
    static readonly TimeSpan RetryAfter = TimeSpan.FromDays(30);
    readonly LibraryService _library;
    readonly Func<Settings> _settings;
    readonly HttpClient _http;
    readonly SemaphoreSlim _gate = new(1, 1);
    Timer? _timer;

    public CoverService(LibraryService library, Func<Settings> settings, HttpMessageHandler? http = null)
    {
        _library = library;
        _settings = settings;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(15);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PCGameLauncherUltimate/1.0");
    }

    /// <summary>Runs shortly after start and then hourly; new games are handled right after they are added.</summary>
    public void Start()
    {
        _timer = new Timer(_ => GameActivity.RunWhenIdle("covers", () => FillMissingAsync()), null, TimeSpan.FromSeconds(30), TimeSpan.FromHours(1));
        _library.Added += count => { _ = FillMissingAsync(); };
    }

    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }

    /// <summary>Looks up covers for up to 25 games that have none. Returns how many were found.</summary>
    public async Task<int> FillMissingAsync(bool force = false)
    {
        if (!_settings().CoverSearch) return 0;
        if (!await _gate.WaitAsync(0)) return 0;
        var found = 0;
        try
        {
            var steamIds = _library.List().Where(i => i.Source == LaunchSource.Steam && (string.IsNullOrEmpty(i.CoverUrl) || i.CoverUrl == SteamArt.OldCover(i.Target))).Select(i => i.Target).ToList();
            if (steamIds.Count > 0)
            {
                var steam = await SteamArt.ResolveAsync(_http, steamIds);
                _library.ReplaceSteamCovers(steam);
                found += steam.Count;
            }
            var due = _library.List().Where(i => i.Kind == ItemKind.Game && string.IsNullOrEmpty(i.CoverUrl)
                && (force || i.CoverLookupAt == null || DateTime.UtcNow - i.CoverLookupAt > RetryAfter)).Take(25).ToList();
            foreach (var item in due)
            {
                string? cover = null;
                try { cover = await FindAsync(item); }
                catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { Log.Warn("covers", $"{item.Name}: {ex.Message}"); continue; }
                _library.SetCover(item.Id, cover);
                if (cover != null) found++;
            }
            if (found > 0) Log.Info("covers", $"{found} Cover gefunden.");
        }
        finally { _gate.Release(); }
        return found;
    }

    /// <summary>For one game (e.g. the "Cover suchen" button). Throws if covers are switched off.</summary>
    public async Task<string?> FindForAsync(string itemId)
    {
        if (!_settings().CoverSearch) throw new RpcException("disabled", "Automatische Cover-Suche ist ausgeschaltet (Einstellungen → Allgemein).");
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Eintrag nicht gefunden.");
        var cover = await FindAsync(item);
        _library.SetCover(item.Id, cover);
        return cover;
    }

    /// <summary>Cover by title only (Steam, then Microsoft Store; exact title). Null if switched off or not found.</summary>
    public async Task<string?> FindByNameAsync(string name)
    {
        if (!_settings().CoverSearch) return null;
        try { return await FindAsync(new LibraryItem { Name = name, Source = LaunchSource.Exe, Target = "-" }); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { return null; }
    }

    async Task<string?> FindAsync(LibraryItem item)
    {
        var market = _settings().GamePassMarket;
        var lang = _settings().Language == "en" ? "en-us" : "de-de";
        // 1. Store/Xbox app: exact lookup by package family name.
        if (item.Source == LaunchSource.AppsFolder && item.Target.IndexOf('!') is var bang && bang > 0)
        {
            var pfn = item.Target[..bang];
            using var d = await GetJson($"https://displaycatalog.mp.microsoft.com/v7.0/products/lookup?alternateId=PackageFamilyName&value={Uri.EscapeDataString(pfn)}&market={market}&languages={lang}&MS-CV=PGLauncher.0");
            if (d != null && d.RootElement.TryGetProperty("Products", out var ps) && ps.GetArrayLength() > 0 && GamePassService.Parse(ps[0]) is { Cover: { } c }) return c;
        }
        var name = Normalize(item.Name);
        if (name.Length < 2) return null;
        // 2. Steam (portrait library art), exact title only.
        using (var s = await GetJson($"https://store.steampowered.com/api/storesearch/?term={Uri.EscapeDataString(item.Name)}&cc={market}&l=german"))
        {
            if (s != null && s.RootElement.TryGetProperty("items", out var items))
                foreach (var it in items.EnumerateArray())
                    if (it.TryGetProperty("name", out var n) && Normalize(n.GetString()) == name && it.TryGetProperty("id", out var id) && id.TryGetInt64(out var appId))
                    {
                        var url = $"https://cdn.cloudflare.steamstatic.com/steam/apps/{appId}/library_600x900.jpg";
                        if (await Exists(url)) return url;
                    }
        }
        // 3. Microsoft Store search (also finds Epic/Xbox titles such as Rocket League), exact title only.
        using (var m = await GetJson($"https://displaycatalog.mp.microsoft.com/v7.0/productFamilies/autosuggest?market={market}&languages={lang}&query={Uri.EscapeDataString(item.Name)}&productFamilyNames=Games&MS-CV=PGLauncher.0"))
        {
            if (m == null || !m.RootElement.TryGetProperty("Results", out var results)) return null;
            var id = results.EnumerateArray().SelectMany(r => r.TryGetProperty("Products", out var p) ? p.EnumerateArray() : Enumerable.Empty<JsonElement>())
                .Where(p => p.TryGetProperty("Title", out var tt) && Normalize(tt.GetString()) == name)
                .Select(p => GamePassService.ValidProductId(p.TryGetProperty("ProductId", out var pid) ? pid.GetString() : null)).FirstOrDefault(x => x != null);
            if (id == null) return null;
            using var d = await GetJson($"https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds={id}&market={market}&languages={lang}&MS-CV=PGLauncher.0");
            if (d != null && d.RootElement.TryGetProperty("Products", out var ps) && ps.GetArrayLength() > 0) return GamePassService.Parse(ps[0])?.Cover;
        }
        return null;
    }

    async Task<JsonDocument?> GetJson(string url)
    {
        using var r = await _http.GetAsync(url);
        if (!r.IsSuccessStatusCode) return null;
        return JsonDocument.Parse(await r.Content.ReadAsStringAsync());
    }

    async Task<bool> Exists(string url)
    {
        using var r = await _http.SendAsync(new HttpRequestMessage(HttpMethod.Head, url));
        return r.IsSuccessStatusCode;
    }

    /// <summary>"Rocket League®" = "rocket league"; "FORZA HORIZON 5 – Standard Edition" = "forza horizon 5".</summary>
    public static string Normalize(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return "";
        s = s.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder();
        foreach (var ch in s)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark) sb.Append(char.ToLowerInvariant(ch));
        var t = Noise().Replace(sb.ToString(), " ");
        t = Edition().Replace(t, "");
        return Spaces().Replace(t, " ").Trim();
    }
    [GeneratedRegex(@"[®™©:\-–—_.,!?'’""()\[\]]")] private static partial Regex Noise();
    [GeneratedRegex(@"\s+(standard|deluxe|ultimate|premium|game of the year|goty|definitive|pc|windows)( edition)?\s*$")] private static partial Regex Edition();
    [GeneratedRegex(@"\s+")] private static partial Regex Spaces();
}
