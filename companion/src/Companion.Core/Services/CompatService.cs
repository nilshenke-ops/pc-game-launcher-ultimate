using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class CompatLine
{
    public string Label { get; set; } = "";
    public string Text { get; set; } = "";
}

public sealed class CompatRequirements
{
    public string AppId { get; set; } = "";
    public string? Name { get; set; }
    public List<CompatLine> Minimum { get; set; } = new();
    public List<CompatLine> Recommended { get; set; } = new();
    public DateTime FetchedAt { get; set; }
}

public sealed class CompatFile { public Dictionary<string, CompatRequirements> Apps { get; set; } = new(); }

/// <summary>One value that can be compared honestly (RAM, storage, video memory); CPU and graphics card names are only shown.</summary>
public sealed record CompatCheck(string What, double? NeedGb, double? HaveGb, string Verdict, string Detail);

/// <summary>
/// "Does this game run on my PC?": the system requirements from the Steam store (fetched only when asked, cached on the PC)
/// next to this PC's real values. Only numbers are judged (RAM, free space, video memory) – processor and graphics card
/// names cannot be ranked reliably by name, so they are shown side by side instead of guessing.
/// </summary>
public sealed class CompatService
{
    static readonly Regex AppIdRx = new("^[0-9]{1,10}$");
    static readonly System.Globalization.CultureInfo De = System.Globalization.CultureInfo.GetCultureInfo("de-DE");
    static string G(double v) => v.ToString("0.#", De);
    static readonly Regex Gb = new(@"(\d+(?:[.,]\d+)?)\s*(GB|MB|TB)", RegexOptions.IgnoreCase);
    readonly JsonStore<CompatFile> _store;
    readonly IMetricsSource _metrics;
    readonly LibraryService _library;
    readonly HttpClient _http;
    public string StoreBase { get; init; } = "https://store.steampowered.com";

    public CompatService(AppPaths paths, IMetricsSource metrics, LibraryService library, HttpMessageHandler? http = null)
    {
        _store = new JsonStore<CompatFile>(paths.File("compat.json"));
        _metrics = metrics; _library = library;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(10);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub/2 (+compat)");
    }

    /// <summary>Requirement lines from Steam's HTML snippet ("&lt;strong&gt;Arbeitsspeicher:&lt;/strong&gt; 8 GB RAM&lt;br&gt;").</summary>
    public static List<CompatLine> ParseHtml(string? html)
    {
        var list = new List<CompatLine>();
        if (string.IsNullOrWhiteSpace(html)) return list;
        foreach (var raw in Regex.Split(html, @"<li>|<br\s*/?>", RegexOptions.IgnoreCase))
        {
            var text = WebUtility.HtmlDecode(Regex.Replace(raw, "<[^>]+>", " ")).Replace(' ', ' ');
            text = Regex.Replace(text, @"\s+", " ").Trim();
            if (text.Length == 0 || text.Length > 300 || Regex.IsMatch(text, "^(Mindestanforderungen|Empfohlen|Minimum|Recommended):?$", RegexOptions.IgnoreCase)) continue;
            var i = text.IndexOf(':');
            if (i > 0 && i < 40) list.Add(new CompatLine { Label = text[..i].Trim(), Text = text[(i + 1)..].Trim() });
            else list.Add(new CompatLine { Label = "", Text = text });
            if (list.Count >= 15) break;
        }
        return list;
    }

    static double? GbIn(string text)
    {
        var m = Gb.Match(text);
        if (!m.Success || !double.TryParse(m.Groups[1].Value.Replace(',', '.'), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var v)) return null;
        return m.Groups[2].Value.ToUpperInvariant() switch { "MB" => v / 1024, "TB" => v * 1024, _ => v };
    }

    static string? Find(List<CompatLine> lines, params string[] labels) =>
        lines.FirstOrDefault(l => labels.Any(x => l.Label.Contains(x, StringComparison.OrdinalIgnoreCase)))?.Text;

    async Task<CompatRequirements> Fetch(string appId)
    {
        using var res = await _http.GetAsync($"{StoreBase}/api/appdetails?appids={appId}&l=german&filters=basic,pc_requirements");
        if (!res.IsSuccessStatusCode) throw new RpcException("unavailable", $"Steam-Shop antwortet nicht ({(int)res.StatusCode}).");
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
        if (!doc.RootElement.TryGetProperty(appId, out var app) || !app.TryGetProperty("success", out var ok) || !ok.GetBoolean() || !app.TryGetProperty("data", out var data))
            throw new RpcException("not-found", "Der Steam-Shop kennt dieses Spiel nicht (mehr).");
        string? Html(string k) => data.TryGetProperty("pc_requirements", out var r) && r.ValueKind == JsonValueKind.Object && r.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        return new CompatRequirements
        {
            AppId = appId,
            Name = data.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString() : null,
            Minimum = ParseHtml(Html("minimum")),
            Recommended = ParseHtml(Html("recommended")),
            FetchedAt = DateTime.UtcNow,
        };
    }

    /// <summary>Requirements (cached for 7 days, or fresh on request) compared with this PC.</summary>
    public async Task<object> CheckAsync(string appId, string? itemId, bool refresh)
    {
        if (!AppIdRx.IsMatch(appId)) throw new RpcException("invalid-params", "Steam-App-ID besteht nur aus Ziffern.");
        var cached = _store.Get(f => f.Apps.GetValueOrDefault(appId));
        var req = cached;
        if (req == null || refresh || DateTime.UtcNow - req.FetchedAt > TimeSpan.FromDays(7))
        {
            try
            {
                req = await Fetch(appId);
                _store.Update(f => { f.Apps[appId] = req; if (f.Apps.Count > 300) foreach (var old in f.Apps.Values.OrderBy(a => a.FetchedAt).Take(f.Apps.Count - 300).ToList()) f.Apps.Remove(old.AppId); });
            }
            catch (Exception ex) when (cached != null && ex is HttpRequestException or TaskCanceledException or RpcException { Code: "unavailable" }) { req = cached; } // offline: last known state
            catch (HttpRequestException) { throw new RpcException("unavailable", "Steam-Shop nicht erreichbar (keine Internetverbindung?)."); }
            catch (TaskCanceledException) { throw new RpcException("unavailable", "Steam-Shop antwortet nicht."); }
        }

        var m = _metrics.Sample();
        var ramGb = m.MemTotalBytes is { } mem ? mem / 1024d / 1024 / 1024 : (double?)null;
        var gpu = m.Gpus.OrderByDescending(g => g.MemTotalBytes ?? 0).FirstOrDefault();
        var vramGb = gpu?.MemTotalBytes is { } vm ? vm / 1024d / 1024 / 1024 : (double?)null;
        var item = itemId == null ? null : _library.Get(itemId);
        var installed = item?.InstallDir != null && Directory.Exists(item.InstallDir);
        double? freeGb = null; string? drive = null;
        try
        {
            if (installed) { var d = new DriveInfo(Path.GetPathRoot(item!.InstallDir!)!); freeGb = d.AvailableFreeSpace / 1024d / 1024 / 1024; drive = d.Name; }
            else if (m.Disks.Count > 0) { var d = m.Disks.OrderByDescending(x => x.FreeBytes).First(); freeGb = d.FreeBytes / 1024d / 1024 / 1024; drive = d.Name; }
        }
        catch { /* unknown drive */ }

        List<CompatCheck> Judge(List<CompatLine> lines)
        {
            var checks = new List<CompatCheck>();
            var ram = Find(lines, "Arbeitsspeicher", "Memory");
            if (ram != null) checks.Add(Cmp("Arbeitsspeicher", GbIn(ram), ramGb, 0.6, ramGb == null ? "Arbeitsspeicher nicht gemessen" : $"{G(ramGb!.Value)} GB im PC"));
            var store = Find(lines, "Speicherplatz", "Storage", "Festplatte", "Hard Drive");
            if (store != null)
                checks.Add(installed ? new CompatCheck("Speicherplatz", GbIn(store), null, "ok", "Schon installiert")
                    : Cmp("Speicherplatz", GbIn(store), freeGb, 0, freeGb == null ? "Freier Speicher unbekannt" : $"{G(freeGb!.Value)} GB frei auf {drive}"));
            var gfx = Find(lines, "Grafik", "Graphics");
            if (gfx != null && Regex.IsMatch(gfx, "VRAM|Videospeicher|video memory", RegexOptions.IgnoreCase))
                checks.Add(Cmp("Grafikspeicher", GbIn(gfx), vramGb, 0.25, vramGb == null ? "Grafikspeicher nicht gemessen" : $"{G(vramGb!.Value)} GB auf {gpu!.Name}"));
            return checks;
        }

        var min = Judge(req.Minimum);
        var rec = Judge(req.Recommended);
        var verdict = min.Any(c => c.Verdict == "low") ? "below-minimum"
            : rec.Count > 0 && rec.All(c => c.Verdict == "ok") ? "recommended"
            : min.Count > 0 && min.All(c => c.Verdict == "ok") ? "minimum"
            : "unknown";
        return new
        {
            appId, name = req.Name, verdict, fetchedAt = req.FetchedAt, fromCache = req == cached,
            minimum = new { lines = req.Minimum, checks = min },
            recommended = new { lines = req.Recommended, checks = rec },
            pc = new { cpu = m.CpuName, ramGb, gpu = gpu?.Name, vramGb, freeGb, drive },
            note = "Prozessor und Grafikkarte bitte selbst vergleichen – ihre Namen lassen sich nicht zuverlässig automatisch einstufen.",
        };
    }

    static CompatCheck Cmp(string what, double? need, double? have, double slack, string detail) =>
        need == null || have == null ? new CompatCheck(what, need, have, "unknown", detail)
        : new CompatCheck(what, need, have, have + slack >= need ? "ok" : "low", detail);
}
