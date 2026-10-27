using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

public sealed class PricePoint
{
    public DateTime At { get; set; }
    /// <summary>Price in cents (as reported by the store).</summary>
    public int Final { get; set; }
    public int Initial { get; set; }
}

public sealed class WishItem
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    /// <summary>Steam app id – needed for the price check; without it the entry is a plain wish list entry.</summary>
    public string? SteamAppId { get; set; }
    /// <summary>Desired price in cents; null = no target.</summary>
    public int? TargetCents { get; set; }
    public string? Notes { get; set; }
    public DateTime AddedAt { get; set; }
    public string? Currency { get; set; }
    public int? FinalCents { get; set; }
    public int? InitialCents { get; set; }
    public int? DiscountPercent { get; set; }
    public DateTime? CheckedAt { get; set; }
    public string? Error { get; set; }
    /// <summary>Own measurements (one point per change or day), newest last, at most 120.</summary>
    public List<PricePoint> History { get; set; } = new();
    /// <summary>Price at which the user was last told "target reached" – told again only after a new drop.</summary>
    public int? NotifiedAtCents { get; set; }
    /// <summary>Came from the Steam wish list (removed again when it leaves that list, unless target or notes were set).</summary>
    public bool FromSteamWishlist { get; set; }
    /// <summary>Microsoft Store (Xbox app): cheapest edition that matches the title.</summary>
    public string? MsProductId { get; set; }
    public string? MsTitle { get; set; }
    public int? MsFinalCents { get; set; }
    public int? MsInitialCents { get; set; }
    public string? MsCurrency { get; set; }
    public string? MsError { get; set; }
    /// <summary>Store picture (https://store-images.s-microsoft.com only) – for games that are not on Steam.</summary>
    public string? MsImage { get; set; }
    /// <summary>Real header picture from Steam (newer games only have it under a path with an id, not the old one).</summary>
    public string? SteamImage { get; set; }
    /// <summary>GG.deals (official API, own key): cheapest key shop and cheapest official store price, plus their lows.</summary>
    public int? GgKeyshopCents { get; set; }
    public int? GgRetailCents { get; set; }
    public int? GgKeyshopLowCents { get; set; }
    public int? GgRetailLowCents { get; set; }
    public string? GgCurrency { get; set; }
    public string? GgUrl { get; set; }
    public string? GgError { get; set; }
    public DateTime? GgCheckedAt { get; set; }
    /// <summary>Key shop price at which "target reached" was last told.</summary>
    public int? GgNotifiedAtCents { get; set; }
    /// <summary>"game" or "dlc" (set by the user).</summary>
    public string Kind { get; set; } = "game";
    /// <summary>For a DLC: the game it belongs to (free text).</summary>
    public string? BaseGame { get; set; }
    /// <summary>0 = low, 1 = normal, 2 = high.</summary>
    public int Priority { get; set; } = 1;
    /// <summary>Own categories ("Koop", "Geschenk" …), at most 8.</summary>
    public List<string> Categories { get; set; } = new();
    /// <summary>A shop or official page chosen by the user (https only) – a link, never read by the PC.</summary>
    public string? ShopUrl { get; set; }
}

public sealed class DealsFile
{
    public bool Enabled { get; set; }
    /// <summary>Steam store country (price and currency), e.g. "de".</summary>
    public string Country { get; set; } = "de";
    public DateTime? LastRunAt { get; set; }
    /// <summary>Also compare with the Microsoft Store (prices of the Xbox app).</summary>
    public bool CompareMicrosoft { get; set; } = true;
    /// <summary>Take over the Steam wish list of the linked/signed-in Steam account (it must be public).</summary>
    public bool SyncSteamWishlist { get; set; } = true;
    public DateTime? WishlistSyncedAt { get; set; }
    public string? WishlistError { get; set; }
    public List<WishItem> Items { get; set; } = new();
}

/// <summary>
/// Deal Radar: wish list with target prices. Prices come from the Steam store (the public endpoint its own web shop
/// uses; not an official API with guarantees) – only when switched on, at most every 6 hours, never during a game.
/// Price history = only prices this PC has seen itself. Nothing is invented: without a check there is no price.
/// </summary>
public sealed class DealService : IDisposable
{
    public const string Source = "Steam-Shop (store.steampowered.com)";
    public const string MsSource = "Microsoft Store / Xbox (displaycatalog.mp.microsoft.com)";
    public const string GgSource = "GG.deals (api.gg.deals, mit deinem Schlüssel)";
    public const int MaxItems = 300;
    static readonly Regex AppId = new("^[0-9]{1,10}$");
    static readonly Regex ClientId = new("^wish_[A-Za-z0-9_-]{4,40}$");
    static readonly Regex Country = new("^[a-z]{2}$");
    public static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    readonly JsonStore<DealsFile> _store;
    readonly IHub _hub;
    readonly HttpClient _http;
    readonly Func<DateTime> _now;
    readonly Timer? _timer;
    readonly SemaphoreSlim _running = new(1, 1);
    public Action<string, string>? TargetReached { get; set; }
    public string StoreBase { get; init; } = "https://store.steampowered.com";
    public string ApiBase { get; init; } = "https://api.steampowered.com";
    public string MsBase { get; init; } = "https://displaycatalog.mp.microsoft.com";
    public string GgBase { get; init; } = "https://api.gg.deals";
    /// <summary>The GG.deals API key (decrypted only for the request), null when none is set.</summary>
    public Func<string?>? GgDealsKey { get; set; }
    /// <summary>SteamID64 of the linked or signed-in Steam account (for the wish list), null if none.</summary>
    public Func<string?>? SteamId { get; set; }

    public DealService(AppPaths paths, IHub hub, HttpMessageHandler? http = null, Func<DateTime>? now = null, bool timer = true)
    {
        _store = new JsonStore<DealsFile>(paths.File("deals.json"));
        _hub = hub;
        _now = now ?? (() => DateTime.UtcNow);
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(15);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2.2 (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
        if (timer)
            _timer = new Timer(_ =>
            {
                var f = _store.Snapshot();
                if (f.Enabled && f.Items.Count > 0 && (f.LastRunAt == null || _now() - f.LastRunAt > Interval - TimeSpan.FromMinutes(5)))
                    GameActivity.RunWhenIdle("deals", () => CheckAllAsync());
            }, null, TimeSpan.FromMinutes(3), TimeSpan.FromMinutes(30));
    }

    public object List()
    {
        var f = _store.Snapshot();
        return new
        {
            enabled = f.Enabled, country = f.Country, lastRunAt = f.LastRunAt, source = Source, msSource = MsSource, intervalHours = Interval.TotalHours, items = f.Items,
            compareMicrosoft = f.CompareMicrosoft, syncSteamWishlist = f.SyncSteamWishlist, wishlistSyncedAt = f.WishlistSyncedAt, wishlistError = f.WishlistError,
            steamAccount = SteamId?.Invoke() != null,
            ggKeySet = GgDealsKey?.Invoke() != null, ggSource = GgSource,
        };
    }

    public object Configure(bool? enabled, string? country, bool? compareMicrosoft = null, bool? syncSteamWishlist = null)
    {
        if (compareMicrosoft != null || syncSteamWishlist != null)
            _store.Update(f => { if (compareMicrosoft != null) f.CompareMicrosoft = compareMicrosoft.Value; if (syncSteamWishlist != null) f.SyncSteamWishlist = syncSteamWishlist.Value; });
        if (country != null && !Country.IsMatch(country)) throw new RpcException("invalid-params", "Land als zwei Buchstaben, z. B. de.");
        _store.Update(f =>
        {
            if (enabled != null) f.Enabled = enabled.Value;
            if (country != null && country != f.Country)
            {
                f.Country = country;
                foreach (var i in f.Items) { i.FinalCents = i.InitialCents = i.DiscountPercent = null; i.Currency = null; i.History.Clear(); i.NotifiedAtCents = null; i.MsFinalCents = i.MsInitialCents = null; i.MsCurrency = null; ClearGg(i); } // other currency
            }
        });
        _hub.Changed("deals");
        return List();
    }

    public WishItem Save(WishItem w)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        if (!string.IsNullOrEmpty(w.Id) && !ClientId.IsMatch(w.Id)) throw Bad("Ungültige ID.");
        if (w.SteamAppId != null && !AppId.IsMatch(w.SteamAppId)) throw Bad("Steam-App-ID besteht nur aus Ziffern.");
        if (w.TargetCents is < 0 or > 100_000_00) throw Bad("Zielpreis ungültig.");
        w.Title = DeviceStore.Sanitize(w.Title, 80, "Spiel");
        w.Notes = w.Notes == null ? null : DeviceStore.Sanitize(w.Notes, 300, "");
        w.Kind = w.Kind is "dlc" ? "dlc" : "game";
        w.BaseGame = w.Kind == "dlc" && !string.IsNullOrWhiteSpace(w.BaseGame) ? DeviceStore.Sanitize(w.BaseGame, 80, "") : null;
        if (w.Priority is < 0 or > 2) throw Bad("Priorität ungültig.");
        w.Categories = (w.Categories ?? new()).Select(c => DeviceStore.Sanitize(c ?? "", 30, "")).Where(c => c.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (w.Categories.Count > 8) throw Bad("Höchstens 8 Kategorien.");
        if (!string.IsNullOrWhiteSpace(w.ShopUrl))
        {
            if (w.ShopUrl.Length > 500 || !Uri.TryCreate(w.ShopUrl.Trim(), UriKind.Absolute, out var u) || u.Scheme != Uri.UriSchemeHttps) throw Bad("Shop-Link muss mit https:// beginnen.");
            w.ShopUrl = u.ToString();
        }
        else w.ShopUrl = null;
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(w.Id)) w.Id = Ids.New("wish");
            var i = f.Items.FindIndex(x => x.Id == w.Id);
            if (i < 0)
            {
                if (f.Items.Count >= MaxItems) throw new RpcException("limit", $"Höchstens {MaxItems} Einträge.");
                if (w.SteamAppId != null && f.Items.Any(x => x.SteamAppId == w.SteamAppId)) throw new RpcException("conflict", "Das Spiel steht schon auf der Wunschliste.");
                w.AddedAt = _now(); w.History = new(); w.FinalCents = w.InitialCents = w.DiscountPercent = null; w.CheckedAt = null; w.Error = null; w.NotifiedAtCents = null;
                // Store data only ever comes from the PC's own checks, never from the device.
                w.MsProductId = w.MsTitle = w.MsCurrency = w.MsError = w.MsImage = w.SteamImage = null; w.MsFinalCents = w.MsInitialCents = null; w.FromSteamWishlist = false;
                ClearGg(w);
                f.Items.Add(w);
                return w;
            }
            // Editing keeps the measured prices (they come from the store, not from the device).
            var old = f.Items[i];
            if (old.Title != w.Title) { old.MsProductId = null; old.MsTitle = null; old.MsImage = null; old.MsFinalCents = old.MsInitialCents = null; }
            old.Title = w.Title; old.Notes = w.Notes;
            old.Kind = w.Kind; old.BaseGame = w.BaseGame; old.Priority = w.Priority; old.Categories = w.Categories; old.ShopUrl = w.ShopUrl;
            if (old.TargetCents != w.TargetCents) { old.NotifiedAtCents = null; old.GgNotifiedAtCents = null; }
            old.TargetCents = w.TargetCents;
            if (old.SteamAppId != w.SteamAppId) { ClearGg(old); old.SteamAppId = w.SteamAppId; old.SteamImage = null; old.History.Clear(); old.FinalCents = old.InitialCents = old.DiscountPercent = null; old.CheckedAt = null; }
            return old;
        });
        _hub.Changed("deals");
        return r;
    }

    public void Remove(string id) { _store.Update(f => f.Items.RemoveAll(x => x.Id == id)); _hub.Changed("deals"); }

    /// <summary>Search in the Steam store (only with the radar switched on – it is a request to Steam).</summary>
    public async Task<object> SearchAsync(string term)
    {
        var f = _store.Snapshot();
        if (!f.Enabled) throw new RpcException("disabled", "Preisabfrage ist aus – erst im Deal Radar einschalten (sendet Anfragen an den Steam-Shop).");
        term = term.Trim();
        if (term.Length is < 2 or > 80) throw new RpcException("invalid-params", "Suchbegriff mit 2–80 Zeichen.");
        using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{StoreBase}/api/storesearch/?term={Uri.EscapeDataString(term)}&cc={f.Country}&l=german"));
        var items = new List<object>();
        if (doc.RootElement.TryGetProperty("items", out var arr))
            foreach (var it in arr.EnumerateArray().Take(10))
            {
                if (it.TryGetProperty("type", out var t) && t.GetString() != "app") continue;
                int? fin = null, ini = null; string? cur = null;
                if (it.TryGetProperty("price", out var p) && p.ValueKind == JsonValueKind.Object)
                { fin = p.GetProperty("final").GetInt32(); ini = p.GetProperty("initial").GetInt32(); cur = p.GetProperty("currency").GetString(); }
                items.Add(new { appId = it.GetProperty("id").GetRawText().Trim('"'), name = it.GetProperty("name").GetString(), finalCents = fin, initialCents = ini, currency = cur });
            }
        return new { items, source = Source };
    }

    static string Norm(string s) => Regex.Replace(Regex.Replace(s.ToLowerInvariant(), @"[®™©:'’\-–—.,!]", " "), @"\s+", " ").Trim();

    public const string NotOnSteam = "Bei Steam gibt es kein Spiel mit genau diesem Namen – vielleicht wird es dort nicht verkauft (z. B. Minecraft). Der Vergleich läuft dann nur über den Microsoft Store.";

    /// <summary>Words that only name an edition or platform – "Forza Horizon 5 Premium Edition" is still Forza Horizon 5,
    /// "Minecraft Legends" is another game than "Minecraft".</summary>
    static readonly HashSet<string> EditionWords = new(StringComparer.Ordinal)
    {
        "edition", "standard", "deluxe", "premium", "ultimate", "gold", "complete", "definitive", "goty", "game", "of", "the", "year",
        "for", "für", "fur", "pc", "windows", "10", "11", "launcher", "java", "bedrock", "digital", "and", "und", "remastered", "enhanced",
    };

    static List<string> Tokens(string s) => Regex.Split(s.ToLowerInvariant(), @"[^\p{L}\p{N}]+").Where(x => x.Length > 0).ToList();

    /// <summary>True if <paramref name="title"/> is the searched game itself, possibly with an edition name after it.</summary>
    public static bool SameGame(string query, string title)
    {
        var q = Tokens(query); var t = Tokens(title);
        if (q.Count == 0 || t.Count < q.Count || !q.SequenceEqual(t.Take(q.Count))) return false;
        return t.Skip(q.Count).All(EditionWords.Contains);
    }

    /// <summary>The Steam game for a name: an exact name match first, then the game with an edition name after it.
    /// No guess: "Minecraft" never becomes "Minecraft Dungeons".</summary>
    async Task<(string appId, string name)?> FindSteamAsync(string title, string country)
    {
        using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{StoreBase}/api/storesearch/?term={Uri.EscapeDataString(title)}&cc={country}&l=german"));
        if (!doc.RootElement.TryGetProperty("items", out var arr)) return null;
        var apps = arr.EnumerateArray().Where(it => !it.TryGetProperty("type", out var t) || t.GetString() == "app")
            .Select(it => (appId: it.GetProperty("id").GetRawText().Trim('"'), name: it.GetProperty("name").GetString() ?? "")).Take(10).ToList();
        if (apps.Count == 0) return null;
        var q = Norm(title);
        if (apps.FirstOrDefault(a => Norm(a.name) == q) is { appId: not null } exact) return exact;
        return apps.FirstOrDefault(a => SameGame(title, a.name)) is { appId: not null } same ? same : null;
    }

    /// <summary>"Just type the name": the PC finds the game itself. With the radar off (or no hit) the name is kept and
    /// matched at the next check.</summary>
    public async Task<WishItem> AddByNameAsync(string title, int? targetCents)
    {
        title = DeviceStore.Sanitize(title, 80, "");
        if (title.Length < 2) throw new RpcException("invalid-params", "Bitte den Namen des Spiels eingeben.");
        var f = _store.Snapshot();
        (string appId, string name)? hit = null;
        var searched = false;
        if (f.Enabled) { try { hit = await FindSteamAsync(title, f.Country); searched = true; } catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { /* kept by name, matched later */ } }
        if (hit is { } h && f.Items.Any(x => x.SteamAppId == h.appId)) throw new RpcException("conflict", $"„{h.name}“ steht schon auf der Wunschliste.");
        var item = Save(new WishItem { Title = hit?.name ?? title, SteamAppId = hit?.appId, TargetCents = targetCents });
        if (searched && hit == null) { _store.Update(x => { var i = x.Items.FirstOrDefault(y => y.Id == item.Id); if (i != null) i.Error = NotOnSteam; }); item.Error = NotOnSteam; }
        if (f.Enabled) _ = Task.Run(async () => { try { await CheckOneAsync(item.Id); } catch (Exception ex) { Log.Warn("deals", ex.Message); } });
        return item;
    }

    async Task CheckOneAsync(string id)
    {
        var f = _store.Snapshot();
        var item = f.Items.FirstOrDefault(i => i.Id == id);
        if (item == null) return;
        if (item.SteamAppId != null) { var (price, error) = await FetchAsync(item.SteamAppId, f.Country); Record(item.Id, price, error); await FillSteamImagesAsync(f.Country); }
        if (f.CompareMicrosoft) await CheckMicrosoftAsync(item, f.Country);
        _hub.Changed("deals");
    }

    /// <summary>Takes over the Steam wish list (public profiles only). Own entries are never removed; entries that came from
    /// Steam go again when they leave the Steam list, unless a target price or note was set here.</summary>
    public async Task<object> SyncWishlistAsync()
    {
        var f = _store.Snapshot();
        var steamId = SteamId?.Invoke();
        if (steamId == null) throw new RpcException("not-configured", "Kein Steam-Konto bekannt – unter Spiele → Steam die Bibliothek verbinden oder am PC bei Steam angemeldet sein.");
        List<string> appIds;
        try
        {
            using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{ApiBase}/IWishlistService/GetWishlist/v1/?steamid={steamId}"));
            appIds = doc.RootElement.GetProperty("response").TryGetProperty("items", out var items)
                ? items.EnumerateArray().Select(i => i.GetProperty("appid").GetRawText()).Distinct().Take(MaxItems).ToList() : new();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException)
        {
            _store.Update(x => x.WishlistError = "Steam nicht erreichbar: " + ex.Message);
            _hub.Changed("deals");
            throw new RpcException("unavailable", "Steam nicht erreichbar.");
        }
        if (appIds.Count == 0)
        {
            _store.Update(x => { x.WishlistError = "Die Steam-Wunschliste ist leer oder nicht öffentlich (Steam → Profil → Privatsphäre → „Spieldetails“ auf Öffentlich)."; x.WishlistSyncedAt = _now(); });
            _hub.Changed("deals");
            return new { added = 0, removed = 0, total = 0 };
        }
        var known = f.Items.Where(i => i.SteamAppId != null).Select(i => i.SteamAppId!).ToHashSet();
        var names = await SteamNamesAsync(appIds.Where(a => !known.Contains(a)).ToList(), f.Country);
        int added = 0, removed = 0;
        _store.Update(x =>
        {
            foreach (var a in appIds.Where(a => !known.Contains(a)))
            {
                if (x.Items.Count >= MaxItems) break;
                x.Items.Add(new WishItem { Id = Ids.New("wish"), Title = DeviceStore.Sanitize(names.GetValueOrDefault(a, "Steam-App " + a), 80, "Spiel"), SteamAppId = a, AddedAt = _now(), FromSteamWishlist = true });
                added++;
            }
            removed = x.Items.RemoveAll(i => i.FromSteamWishlist && i.SteamAppId != null && !appIds.Contains(i.SteamAppId) && i.TargetCents == null && string.IsNullOrEmpty(i.Notes));
            x.WishlistError = null; x.WishlistSyncedAt = _now();
        });
        await FillSteamImagesAsync(f.Country);
        _hub.Changed("deals");
        return new { added, removed, total = appIds.Count };
    }

    async Task<Dictionary<string, string>> SteamNamesAsync(List<string> appIds, string country)
    {
        var names = new Dictionary<string, string>();
        foreach (var chunk in appIds.Chunk(50))
        {
            var input = JsonSerializer.Serialize(new { ids = chunk.Select(a => new { appid = int.Parse(a) }), context = new { language = "german", country_code = country.ToUpperInvariant() } });
            try
            {
                using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{ApiBase}/IStoreBrowseService/GetItems/v1/?input_json={Uri.EscapeDataString(input)}"));
                if (doc.RootElement.GetProperty("response").TryGetProperty("store_items", out var arr))
                    foreach (var it in arr.EnumerateArray())
                        if (it.TryGetProperty("name", out var n) && it.TryGetProperty("appid", out var id)) names[id.GetRawText()] = n.GetString() ?? "";
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException) { Log.Warn("deals", "Steam-Namen: " + ex.Message); }
        }
        return names;
    }

    /// <summary>Microsoft Store (what the Xbox app sells): the cheapest buyable edition whose name contains the title.</summary>
    static readonly string[] AddOnWords = { "add-on", "addon", "upgrade", "season pass", "dlc", "erweiterung", "expansion", "car pack", "vip" };

    /// <summary>Add-on words the user did not type ("Premium Add-ons-Bundle", "Upgrade"). Note: the "SellableBy" relation
    /// is no sign of an add-on – the real Minecraft has it too.</summary>
    static bool IsAddOn(JsonElement p, string title, string query)
    {
        var lower = title.ToLowerInvariant();
        return AddOnWords.Any(w => lower.Contains(w) && !query.Contains(Norm(w)));
    }

    /// <summary>Wide store picture (hero art, else box art), only from Microsoft's own image host.</summary>
    static string? StoreImage(JsonElement p)
    {
        if (!p.GetProperty("LocalizedProperties")[0].TryGetProperty("Images", out var imgs) || imgs.ValueKind != JsonValueKind.Array) return null;
        foreach (var purpose in new[] { "SuperHeroArt", "TitledHeroArt", "BoxArt", "Poster" })
            foreach (var im in imgs.EnumerateArray())
                if (im.TryGetProperty("ImagePurpose", out var pp) && pp.GetString() == purpose && im.TryGetProperty("Uri", out var u))
                {
                    var url = u.GetString() ?? "";
                    if (url.StartsWith("//")) url = "https:" + url;
                    if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.Host == "store-images.s-microsoft.com") return uri.ToString();
                }
        return null;
    }

    async Task CheckMicrosoftAsync(WishItem item, string country)
    {
        var market = country.ToUpperInvariant();
        var lang = country is "de" or "at" or "ch" ? "de-de" : "en-us";
        string? error = null; (string id, string title, int final, int initial, string cur, string? image)? best = null;
        try
        {
            using var sug = JsonDocument.Parse(await _http.GetStringAsync($"{MsBase}/v7.0/productFamilies/autosuggest?market={market}&languages={lang}&query={Uri.EscapeDataString(item.Title)}&productFamilyNames=Games"));
            var ids = sug.RootElement.GetProperty("Results").EnumerateArray().SelectMany(r => r.GetProperty("Products").EnumerateArray())
                .Where(p => p.TryGetProperty("Type", out var t) && t.GetString() == "Game").Select(p => p.GetProperty("ProductId").GetString()!).Distinct().Take(8).ToList();
            if (ids.Count == 0) error = "Im Microsoft Store nicht gefunden.";
            else
            {
                using var det = JsonDocument.Parse(await _http.GetStringAsync($"{MsBase}/v7.0/products?bigIds={string.Join(",", ids)}&market={market}&languages={lang}"));
                var q = Norm(item.Title);
                foreach (var p in det.RootElement.GetProperty("Products").EnumerateArray())
                {
                    if (p.TryGetProperty("ProductKind", out var kind) && kind.GetString() != "Game") continue;
                    var title = p.GetProperty("LocalizedProperties")[0].GetProperty("ProductTitle").GetString() ?? "";
                    if (!SameGame(item.Title, title)) continue; // other game with a similar name ("Minecraft Legends" for "Minecraft")
                    if (IsAddOn(p, title, q)) continue;     // add-on bundles and upgrades need the game – not a price for the game
                    foreach (var sku in p.GetProperty("DisplaySkuAvailabilities").EnumerateArray().Take(1))
                        foreach (var a in sku.GetProperty("Availabilities").EnumerateArray())
                        {
                            if (!a.TryGetProperty("Actions", out var actions) || !actions.EnumerateArray().Any(x => x.GetString() == "Purchase")) continue;
                            // Prices that need a subscription first (Game Pass member discount, shown as "Upsell") are not the shop price.
                            if (a.TryGetProperty("RemediationRequired", out var rem) && rem.ValueKind == JsonValueKind.True) continue;
                            if (!a.TryGetProperty("OrderManagementData", out var om) || !om.TryGetProperty("Price", out var pr)) continue;
                            var list = pr.GetProperty("ListPrice").GetDouble(); var msrp = pr.GetProperty("MSRP").GetDouble();
                            if (list <= 0) continue; // free/trial/bundle entries
                            var final = (int)Math.Round(list * 100); var initial = (int)Math.Round(Math.Max(msrp, list) * 100);
                            if (best == null || final < best.Value.final) best = (p.GetProperty("ProductId").GetString()!, title, final, initial, pr.GetProperty("CurrencyCode").GetString() ?? "", StoreImage(p));
                            break;
                        }
                }
                if (best == null) error = "Im Microsoft Store kein kaufbares Angebot mit diesem Namen.";
            }
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException or IndexOutOfRangeException)
        { error = "Microsoft Store nicht erreichbar oder Antwort unbrauchbar."; }
        _store.Update(f =>
        {
            var i = f.Items.FirstOrDefault(x => x.Id == item.Id);
            if (i == null) return;
            i.MsError = error;
            if (best is { } b) { i.MsProductId = b.id; i.MsTitle = b.title; i.MsFinalCents = b.final; i.MsInitialCents = b.initial; i.MsCurrency = b.cur; i.MsImage = b.image; }
            else { i.MsFinalCents = i.MsInitialCents = null; }
        });
    }

    /// <summary>Checks all prices now (one request per game, a short pause between them).</summary>
    public async Task<object> CheckAllAsync(bool force = false)
    {
        var f0 = _store.Snapshot();
        if (!f0.Enabled && !force) return List();
        if (!f0.Enabled) throw new RpcException("disabled", "Preisabfrage ist aus.");
        if (!await _running.WaitAsync(0)) return List();
        try
        {
            if (f0.SyncSteamWishlist && SteamId?.Invoke() != null)
                try { await SyncWishlistAsync(); } catch (RpcException) { /* reason kept in WishlistError */ }
            // Entries added by name only (e.g. on the phone without the PC) get their Steam game now.
            foreach (var item in _store.Snapshot().Items.Where(i => i.SteamAppId == null).Take(20))
            {
                try
                {
                    var hit = await FindSteamAsync(item.Title, f0.Country);
                    if (hit is { } h && !_store.Snapshot().Items.Any(x => x.SteamAppId == h.appId))
                        _store.Update(f => { var i = f.Items.FirstOrDefault(x => x.Id == item.Id); if (i != null) { i.SteamAppId = h.appId; i.Title = DeviceStore.Sanitize(h.name, 80, i.Title); i.Error = null; } });
                    else if (hit == null)
                        _store.Update(f => { var i = f.Items.FirstOrDefault(x => x.Id == item.Id); if (i != null) i.Error = NotOnSteam; });
                }
                catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { break; }
                await Task.Delay(force ? 100 : 800);
            }
            await FillSteamImagesAsync(f0.Country);
            var compareMs = _store.Snapshot().CompareMicrosoft;
            foreach (var item in _store.Snapshot().Items.Take(MaxItems))
            {
                if (item.SteamAppId != null)
                {
                    var (price, error) = await FetchAsync(item.SteamAppId!, f0.Country);
                    Record(item.Id, price, error);
                }
                if (compareMs) await CheckMicrosoftAsync(item, f0.Country);
                await Task.Delay(force ? 200 : 1500);
            }
            if (GgDealsKey?.Invoke() is { } gg) await CheckGgDealsAsync(gg, f0.Country, force);
            _store.Update(f => f.LastRunAt = _now());
        }
        finally { _running.Release(); }
        _hub.Changed("deals");
        return List();
    }

    /// <summary>Header pictures for entries that have none yet (100 per request, from Steam's own item data).</summary>
    async Task FillSteamImagesAsync(string country)
    {
        var ids = _store.Snapshot().Items.Where(i => i.SteamAppId != null && i.SteamImage == null).Select(i => i.SteamAppId!).Distinct().Take(300).ToList();
        foreach (var chunk in ids.Chunk(100))
        {
            var input = JsonSerializer.Serialize(new { ids = chunk.Select(a => new { appid = int.Parse(a) }), context = new { language = "german", country_code = country.ToUpperInvariant() }, data_request = new { include_assets = true } });
            try
            {
                using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{ApiBase}/IStoreBrowseService/GetItems/v1/?input_json={Uri.EscapeDataString(input)}"));
                if (!doc.RootElement.GetProperty("response").TryGetProperty("store_items", out var arr)) continue;
                var found = new Dictionary<string, string>();
                foreach (var it in arr.EnumerateArray())
                    if (it.TryGetProperty("appid", out var id) && it.TryGetProperty("assets", out var a) && a.TryGetProperty("header", out var h) && h.GetString() is { } header
                        && Regex.IsMatch(header, @"^([0-9a-f]{40}/)?[A-Za-z0-9_.-]{1,60}\.(jpg|png)$"))
                        found[id.GetRawText()] = $"https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{id.GetRawText()}/{header}";
                if (found.Count > 0) _store.Update(f => { foreach (var i in f.Items) if (i.SteamAppId != null && i.SteamImage == null && found.TryGetValue(i.SteamAppId, out var u)) i.SteamImage = u; });
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException) { Log.Warn("deals", "Steam-Bilder: " + ex.Message); }
        }
    }

    async Task<((int final, int initial, int discount, string currency)? price, string? error)> FetchAsync(string appId, string country)
    {
        try
        {
            using var doc = JsonDocument.Parse(await _http.GetStringAsync($"{StoreBase}/api/appdetails?appids={appId}&cc={country}&filters=price_overview"));
            var e = doc.RootElement.GetProperty(appId);
            if (!e.GetProperty("success").GetBoolean()) return (null, "Steam kennt diese App-ID nicht (oder sie ist in diesem Land nicht erhältlich).");
            // Free games and games not for sale have no price_overview.
            if (e.GetProperty("data").ValueKind != JsonValueKind.Object || !e.GetProperty("data").TryGetProperty("price_overview", out var p))
                return (null, "Kein Preis im Shop (kostenlos, noch nicht erschienen oder nicht käuflich).");
            return ((p.GetProperty("final").GetInt32(), p.GetProperty("initial").GetInt32(), p.GetProperty("discount_percent").GetInt32(), p.GetProperty("currency").GetString() ?? "?"), null);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException)
        {
            return (null, "Steam-Shop nicht erreichbar oder Antwort unbrauchbar: " + ex.Message);
        }
    }

    internal void Record(string id, (int final, int initial, int discount, string currency)? price, string? error)
    {
        (string title, string text)? notify = null;
        _store.Update(f =>
        {
            var i = f.Items.FirstOrDefault(x => x.Id == id);
            if (i == null) return;
            i.CheckedAt = _now();
            i.Error = error;
            if (price is not { } p) return;
            i.FinalCents = p.final; i.InitialCents = p.initial; i.DiscountPercent = p.discount; i.Currency = p.currency;
            var last = i.History.LastOrDefault();
            if (last == null || last.Final != p.final || last.At.Date != _now().Date)
            {
                i.History.Add(new PricePoint { At = _now(), Final = p.final, Initial = p.initial });
                if (i.History.Count > 120) i.History.RemoveRange(0, i.History.Count - 120);
            }
            if (i.TargetCents is { } target && p.final <= target && (i.NotifiedAtCents == null || p.final < i.NotifiedAtCents))
            {
                i.NotifiedAtCents = p.final;
                notify = ($"Zielpreis erreicht: {i.Title}", $"{Money(p.final)} {p.currency}" + (p.discount > 0 ? $" (−{p.discount} %)" : "") + $" – Ziel {Money(target)}");
            }
            if (i.TargetCents is { } t2 && p.final > t2) i.NotifiedAtCents = null; // above target again: next drop is reported
        });
        if (notify is { } n) TargetReached?.Invoke(n.title, n.text);
    }

    // ------------------------------------------------------------------ GG.deals (official API, the user's own free key)

    public static readonly Regex GgKey = new("^[A-Za-z0-9_-]{16,128}$");
    public string CountryCode => _store.Snapshot().Country;

    static void ClearGg(WishItem w)
    {
        w.GgKeyshopCents = w.GgRetailCents = w.GgKeyshopLowCents = w.GgRetailLowCents = w.GgNotifiedAtCents = null;
        w.GgCurrency = w.GgUrl = w.GgError = null; w.GgCheckedAt = null;
    }

    /// <summary>Checks a key with one real request (Portal 2) – an invalid key is refused before it is stored.</summary>
    public async Task<string?> TestGgKeyAsync(string key, string country)
    {
        try
        {
            using var r = await _http.GetAsync(GgUrl(key, new[] { "620" }, country));
            var body = await r.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(body);
            if (r.IsSuccessStatusCode && doc.RootElement.TryGetProperty("success", out var ok) && ok.ValueKind == JsonValueKind.True) return null;
            return "GG.deals lehnt den Schlüssel ab: " + GgMessage(doc.RootElement, (int)r.StatusCode);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { return "GG.deals nicht erreichbar: " + ex.Message; }
    }

    string GgUrl(string key, IEnumerable<string> ids, string country) =>
        $"{GgBase}/v1/prices/by-steam-app-id/?key={Uri.EscapeDataString(key)}&ids={string.Join(',', ids)}&region={country}";

    static string GgMessage(JsonElement root, int status) =>
        root.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Object && d.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String
            ? DeviceStore.Sanitize(m.GetString()!, 160, $"HTTP {status}") : $"HTTP {status}";

    /// <summary>"18.50", 18.5 or null → cents.</summary>
    internal static int? GgCents(JsonElement e, string name)
    {
        if (!e.TryGetProperty(name, out var v)) return null;
        decimal? d = v.ValueKind switch
        {
            JsonValueKind.Number when v.TryGetDecimal(out var n) => n,
            JsonValueKind.String when decimal.TryParse(v.GetString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var n) => n,
            _ => null,
        };
        return d is { } x && x >= 0 && x < 100_000 ? (int)Math.Round(x * 100, MidpointRounding.AwayFromZero) : null;
    }

    async Task CheckGgDealsAsync(string key, string country, bool force)
    {
        var ids = _store.Snapshot().Items.Where(i => i.SteamAppId != null).Select(i => i.SteamAppId!).Distinct().ToList();
        foreach (var chunk in ids.Chunk(20))
        {
            Dictionary<string, JsonElement?> found;
            string? error = null;
            JsonDocument? doc = null;
            try
            {
                using var r = await _http.GetAsync(GgUrl(key, chunk, country));
                doc = JsonDocument.Parse(await r.Content.ReadAsStringAsync());
                var root = doc.RootElement;
                if (!r.IsSuccessStatusCode || !root.TryGetProperty("success", out var ok) || ok.ValueKind != JsonValueKind.True) error = "GG.deals: " + GgMessage(root, (int)r.StatusCode);
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException) { error = "GG.deals nicht erreichbar: " + ex.Message; }
            found = new();
            if (error == null && doc!.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object)
                foreach (var p in data.EnumerateObject()) found[p.Name] = p.Value.ValueKind == JsonValueKind.Object ? p.Value.Clone() : null;
            else error ??= "GG.deals: Antwort hat ein unbekanntes Format.";
            doc?.Dispose();
            var notes = new List<(string title, string text)>();
            _store.Update(f =>
            {
                foreach (var i in f.Items.Where(i => i.SteamAppId != null && chunk.Contains(i.SteamAppId)))
                {
                    i.GgCheckedAt = _now();
                    if (error != null) { i.GgError = error; continue; }
                    if (!found.TryGetValue(i.SteamAppId!, out var g) || g is not { } game || !game.TryGetProperty("prices", out var prices) || prices.ValueKind != JsonValueKind.Object)
                    {
                        i.GgError = "GG.deals kennt dieses Spiel nicht (oder hat dafür in diesem Land keine Preise).";
                        i.GgKeyshopCents = i.GgRetailCents = i.GgKeyshopLowCents = i.GgRetailLowCents = null;
                        continue;
                    }
                    i.GgError = null;
                    i.GgKeyshopCents = GgCents(prices, "currentKeyshops");
                    i.GgRetailCents = GgCents(prices, "currentRetail");
                    i.GgKeyshopLowCents = GgCents(prices, "historicalKeyshops");
                    i.GgRetailLowCents = GgCents(prices, "historicalRetail");
                    i.GgCurrency = prices.TryGetProperty("currency", out var c) && c.ValueKind == JsonValueKind.String && Regex.IsMatch(c.GetString()!, "^[A-Z]{3}$") ? c.GetString() : null;
                    i.GgUrl = game.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String && u.GetString()!.StartsWith("https://gg.deals/", StringComparison.Ordinal) ? u.GetString() : null;
                    if (i.TargetCents is { } target && i.GgKeyshopCents is { } k)
                    {
                        if (k <= target && (i.GgNotifiedAtCents == null || k < i.GgNotifiedAtCents))
                        {
                            i.GgNotifiedAtCents = k;
                            notes.Add(($"Zielpreis erreicht (Key-Shop): {i.Title}", $"ab {Money(k)} {i.GgCurrency ?? ""} laut GG.deals – Ziel {Money(target)}".Replace("  ", " ")));
                        }
                        else if (k > target) i.GgNotifiedAtCents = null;
                    }
                }
            });
            foreach (var n in notes) TargetReached?.Invoke(n.title, n.text);
            if (error != null && error.Contains("Schlüssel")) break;
            await Task.Delay(force ? 200 : 1000);
        }
    }

    static readonly System.Globalization.CultureInfo German = new("de-DE");
    static string Money(int cents) => (cents / 100.0).ToString("0.00", German); // notifications are German like all others

    internal DealsFile Export() => _store.Snapshot();
    internal void Import(DealsFile f) { _store.Replace(f); _hub.Changed("deals"); }

    /// <summary>Restore from a backup: only well-formed entries; the price check stays as it is on this PC (no request is switched on by a backup).</summary>
    internal void ImportChecked(DealsFile f)
    {
        var cur = _store.Snapshot();
        var items = f.Items.Where(i => (ClientId.IsMatch(i.Id) || Regex.IsMatch(i.Id, "^wish_[0-9a-f]{12}$")) && (i.SteamAppId == null || AppId.IsMatch(i.SteamAppId)) && i.TargetCents is null or (>= 0 and <= 100_000_00))
            .GroupBy(i => i.SteamAppId ?? i.Id).Select(g => g.First()).Take(MaxItems).ToList();
        foreach (var i in items)
        {
            i.Title = DeviceStore.Sanitize(i.Title, 80, "Spiel");
            i.Notes = i.Notes == null ? null : DeviceStore.Sanitize(i.Notes, 300, "");
            i.Error = null;
            if (i.History.Count > 120) i.History.RemoveRange(0, i.History.Count - 120);
        }
        Import(new DealsFile { Enabled = cur.Enabled, Country = Country.IsMatch(f.Country) ? f.Country : cur.Country, LastRunAt = null, Items = items, CompareMicrosoft = cur.CompareMicrosoft, SyncSteamWishlist = cur.SyncSteamWishlist });
    }
    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }
}
