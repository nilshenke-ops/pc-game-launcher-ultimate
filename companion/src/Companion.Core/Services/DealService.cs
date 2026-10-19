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
}

public sealed class DealsFile
{
    public bool Enabled { get; set; }
    /// <summary>Steam store country (price and currency), e.g. "de".</summary>
    public string Country { get; set; } = "de";
    public DateTime? LastRunAt { get; set; }
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
        return new { enabled = f.Enabled, country = f.Country, lastRunAt = f.LastRunAt, source = Source, intervalHours = Interval.TotalHours, items = f.Items };
    }

    public object Configure(bool? enabled, string? country)
    {
        if (country != null && !Country.IsMatch(country)) throw new RpcException("invalid-params", "Land als zwei Buchstaben, z. B. de.");
        _store.Update(f =>
        {
            if (enabled != null) f.Enabled = enabled.Value;
            if (country != null && country != f.Country)
            {
                f.Country = country;
                foreach (var i in f.Items) { i.FinalCents = i.InitialCents = i.DiscountPercent = null; i.Currency = null; i.History.Clear(); i.NotifiedAtCents = null; } // other currency
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
        var r = _store.Update(f =>
        {
            if (string.IsNullOrEmpty(w.Id)) w.Id = Ids.New("wish");
            var i = f.Items.FindIndex(x => x.Id == w.Id);
            if (i < 0)
            {
                if (f.Items.Count >= 100) throw new RpcException("limit", "Höchstens 100 Einträge.");
                if (w.SteamAppId != null && f.Items.Any(x => x.SteamAppId == w.SteamAppId)) throw new RpcException("conflict", "Das Spiel steht schon auf der Wunschliste.");
                w.AddedAt = _now(); w.History = new(); w.FinalCents = w.InitialCents = w.DiscountPercent = null; w.CheckedAt = null; w.Error = null; w.NotifiedAtCents = null;
                f.Items.Add(w);
                return w;
            }
            // Editing keeps the measured prices (they come from the store, not from the device).
            var old = f.Items[i];
            old.Title = w.Title; old.Notes = w.Notes;
            if (old.TargetCents != w.TargetCents) old.NotifiedAtCents = null;
            old.TargetCents = w.TargetCents;
            if (old.SteamAppId != w.SteamAppId) { old.SteamAppId = w.SteamAppId; old.History.Clear(); old.FinalCents = old.InitialCents = old.DiscountPercent = null; old.CheckedAt = null; }
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

    /// <summary>Checks all prices now (one request per game, a short pause between them).</summary>
    public async Task<object> CheckAllAsync(bool force = false)
    {
        var f0 = _store.Snapshot();
        if (!f0.Enabled && !force) return List();
        if (!f0.Enabled) throw new RpcException("disabled", "Preisabfrage ist aus.");
        if (!await _running.WaitAsync(0)) return List();
        try
        {
            foreach (var item in f0.Items.Where(i => i.SteamAppId != null).Take(100))
            {
                var (price, error) = await FetchAsync(item.SteamAppId!, f0.Country);
                Record(item.Id, price, error);
                await Task.Delay(force ? 200 : 1500);
            }
            _store.Update(f => f.LastRunAt = _now());
        }
        finally { _running.Release(); }
        _hub.Changed("deals");
        return List();
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

    static readonly System.Globalization.CultureInfo German = new("de-DE");
    static string Money(int cents) => (cents / 100.0).ToString("0.00", German); // notifications are German like all others

    internal DealsFile Export() => _store.Snapshot();
    internal void Import(DealsFile f) { _store.Replace(f); _hub.Changed("deals"); }

    /// <summary>Restore from a backup: only well-formed entries; the price check stays as it is on this PC (no request is switched on by a backup).</summary>
    internal void ImportChecked(DealsFile f)
    {
        var cur = _store.Snapshot();
        var items = f.Items.Where(i => (ClientId.IsMatch(i.Id) || Regex.IsMatch(i.Id, "^wish_[0-9a-f]{12}$")) && (i.SteamAppId == null || AppId.IsMatch(i.SteamAppId)) && i.TargetCents is null or (>= 0 and <= 100_000_00))
            .GroupBy(i => i.SteamAppId ?? i.Id).Select(g => g.First()).Take(100).ToList();
        foreach (var i in items)
        {
            i.Title = DeviceStore.Sanitize(i.Title, 80, "Spiel");
            i.Notes = i.Notes == null ? null : DeviceStore.Sanitize(i.Notes, 300, "");
            i.Error = null;
            if (i.History.Count > 120) i.History.RemoveRange(0, i.History.Count - 120);
        }
        Import(new DealsFile { Enabled = cur.Enabled, Country = Country.IsMatch(f.Country) ? f.Country : cur.Country, LastRunAt = null, Items = items });
    }
    public void Dispose() { _timer?.Dispose(); _http.Dispose(); }
}
