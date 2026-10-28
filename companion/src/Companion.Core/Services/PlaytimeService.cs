using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>Twitch app (IGDB) – the secret only encrypted on this PC, set only at the PC itself.</summary>
public sealed class PlaytimeFile
{
    public string? TwitchClientId { get; set; }
    public string? TwitchSecretProtected { get; set; }
    /// <summary>Optional YouTube Data API key (videos for JARVIS) – encrypted, set only at the PC.</summary>
    public string? YouTubeKeyProtected { get; set; }
    /// <summary>Normalised game name → durations found (kept 7 days).</summary>
    public Dictionary<string, GameDurations> Cache { get; set; } = new();
}

/// <summary>Average durations in hours from IGDB "Time to Beat" (players' own submissions).</summary>
public sealed class GameDurations
{
    public long IgdbId { get; set; }
    public string Name { get; set; } = "";
    public string Url { get; set; } = "";
    public double? MainHours { get; set; }
    public double? ExtraHours { get; set; }
    public double? CompleteHours { get; set; }
    /// <summary>How many players submitted their time – few means unreliable.</summary>
    public int Count { get; set; }
    public DateTime FetchedAt { get; set; }
}

/// <summary>
/// "Wie lange brauche ich noch?": brings together what is really known – Steam's total play time (Web API of the linked
/// account, or Steam's own file on this PC), the sessions the companion measured, and the average durations from IGDB
/// (official API, Twitch app of the user). Nothing is estimated here; the web app calculates and labels estimates.
/// </summary>
public sealed class PlaytimeService : IDisposable
{
    readonly JsonStore<PlaytimeFile> _store;
    readonly ISecretProtector _secrets;
    readonly SteamService? _steam;
    readonly HistoryService? _history;
    readonly HttpClient _http;
    (string token, DateTime until)? _token;
    readonly SemaphoreSlim _one = new(1, 1);
    public string TokenBase { get; init; } = "https://id.twitch.tv";
    public string IgdbBase { get; init; } = "https://api.igdb.com";
    public string HelixBase { get; init; } = "https://api.twitch.tv";
    public string YouTubeBase { get; init; } = "https://www.googleapis.com";
    public static readonly TimeSpan CacheFor = TimeSpan.FromDays(7);

    public PlaytimeService(AppPaths paths, ISecretProtector secrets, SteamService? steam, HistoryService? history, HttpMessageHandler? handler = null)
    {
        _store = new JsonStore<PlaytimeFile>(paths.File("playtime.json"));
        _secrets = secrets; _steam = steam; _history = history;
        _http = handler == null ? new HttpClient() : new HttpClient(handler);
        _http.Timeout = TimeSpan.FromSeconds(12);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusGamingHub (+https://github.com/nilshenke-ops/pc-game-launcher-ultimate)");
    }

    public object Status() { var f = _store.Snapshot(); return new { igdb = f.TwitchClientId != null && f.TwitchSecretProtected != null, clientId = f.TwitchClientId, youtube = f.YouTubeKeyProtected != null }; }

    public object ConfigureYouTube(string key, bool isLocalAdmin)
    {
        if (!isLocalAdmin) throw new RpcException("forbidden", "Den YouTube-Schlüssel trägt man nur direkt am PC ein.");
        if (key.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(key, "^AIza[0-9A-Za-z_-]{35}$")) throw new RpcException("invalid-params", "Ein YouTube-API-Schlüssel beginnt mit „AIza“ und hat 39 Zeichen (console.cloud.google.com → YouTube Data API v3 → Anmeldedaten).");
        _store.Update(f => f.YouTubeKeyProtected = key.Length == 0 ? null : _secrets.Protect(key));
        Log.Info("playtime", key.Length == 0 ? "YouTube-Schlüssel entfernt." : "YouTube-Schlüssel gespeichert (geschützt).");
        return Status();
    }

    /// <summary>
    /// "Wer streamt gerade X?": Twitch's own API (Helix) with the user's Twitch app (the same one as for IGDB) – the
    /// category of exactly this game, then its live streams with the most viewers.
    /// </summary>
    public async Task<object> StreamsAsync(string game)
    {
        game = game.Trim();
        if (game.Length is < 2 or > 100) throw new RpcException("invalid-params", "Spielname mit 2–100 Zeichen.");
        var f = _store.Snapshot();
        if (f.TwitchClientId == null || f.TwitchSecretProtected == null) throw new RpcException("not-configured", "Für Twitch braucht JARVIS die kostenlose Twitch-Anwendung – am PC unter Spiele-Journal → Spielzeit eintragen (dieselbe wie für IGDB).");
        var cats = await HelixAsync($"search/categories?query={Uri.EscapeDataString(game)}&first=10", f);
        string? id = null, name = null;
        using (var doc = JsonDocument.Parse(cats))
            foreach (var c in doc.RootElement.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Array ? d.EnumerateArray() : default)
            {
                var n = c.TryGetProperty("name", out var nv) ? nv.GetString() ?? "" : "";
                if (Norm(n) == Norm(game) || (id == null && SteamAchievementsService.SameGame(n, game))) { id = c.GetProperty("id").GetString(); name = n; if (Norm(n) == Norm(game)) break; }
            }
        if (id == null || !System.Text.RegularExpressions.Regex.IsMatch(id, "^[0-9]{1,20}$")) throw new RpcException("not-found", $"Twitch hat keine Kategorie „{game}“.");
        var list = new List<object>();
        using (var doc = JsonDocument.Parse(await HelixAsync($"streams?game_id={id}&first=6", f)))
            foreach (var st in doc.RootElement.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Array ? d.EnumerateArray() : default)
            {
                string S(string k) => st.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
                var login = S("user_login");
                if (!System.Text.RegularExpressions.Regex.IsMatch(login, "^[a-zA-Z0-9_]{2,30}$")) continue;
                list.Add(new { user = S("user_name"), title = S("title") is { Length: > 140 } t ? t[..140] : S("title"), viewers = st.TryGetProperty("viewer_count", out var vc) && vc.TryGetInt32(out var v2) ? v2 : 0, language = S("language"), url = $"https://www.twitch.tv/{login}" });
            }
        return new { game = name, url = $"https://www.twitch.tv/directory/category/{id}", streams = list, fetchedAt = DateTime.UtcNow, source = "Twitch (api.twitch.tv, Helix)" };
    }

    async Task<string> HelixAsync(string path, PlaytimeFile f)
    {
        var token = await TokenAsync(f);
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{HelixBase}/helix/{path}");
        req.Headers.Add("Client-ID", f.TwitchClientId);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var resp = await _http.SendAsync(req);
        if ((int)resp.StatusCode == 401) { _token = null; throw new RpcException("unavailable", "Twitch hat den Zugang abgelehnt – bitte am PC prüfen."); }
        if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Twitch antwortet mit {(int)resp.StatusCode}.");
        return await resp.Content.ReadAsStringAsync();
    }

    /// <summary>
    /// "Zeig mir ein Video zu X": with the user's own YouTube Data API key the top videos (search.list); without a key only
    /// the link to YouTube's own search – nothing is scraped.
    /// </summary>
    public async Task<object> YouTubeAsync(string query)
    {
        query = query.Trim();
        if (query.Length is < 2 or > 150) throw new RpcException("invalid-params", "Suche mit 2–150 Zeichen.");
        var searchUrl = "https://www.youtube.com/results?search_query=" + Uri.EscapeDataString(query);
        var f = _store.Snapshot();
        if (f.YouTubeKeyProtected == null) return new { configured = false, searchUrl, videos = Array.Empty<object>(), source = "YouTube-Suche (Link)" };
        var key = _secrets.Unprotect(f.YouTubeKeyProtected) ?? throw new RpcException("unavailable", "Der gespeicherte YouTube-Schlüssel lässt sich nicht entschlüsseln – bitte am PC neu eintragen.");
        using var resp = await _http.GetAsync($"{YouTubeBase}/youtube/v3/search?part=snippet&type=video&maxResults=5&relevanceLanguage=de&safeSearch=moderate&q={Uri.EscapeDataString(query)}&key={Uri.EscapeDataString(key)}");
        if ((int)resp.StatusCode is 400 or 403) throw new RpcException("unavailable", "YouTube hat den Schlüssel abgelehnt oder das Tageskontingent ist aufgebraucht.");
        if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"YouTube antwortet mit {(int)resp.StatusCode}.");
        var videos = new List<object>();
        using (var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync()))
            foreach (var it in doc.RootElement.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array ? items.EnumerateArray() : default)
            {
                var vid = it.TryGetProperty("id", out var idv) && idv.TryGetProperty("videoId", out var v) ? v.GetString() ?? "" : "";
                if (!System.Text.RegularExpressions.Regex.IsMatch(vid, "^[A-Za-z0-9_-]{11}$") || !it.TryGetProperty("snippet", out var sn)) continue;
                string S(string k) => sn.TryGetProperty(k, out var x) && x.ValueKind == JsonValueKind.String ? System.Net.WebUtility.HtmlDecode(x.GetString() ?? "") : "";
                videos.Add(new { title = S("title"), channel = S("channelTitle"), published = S("publishedAt"), url = $"https://www.youtube.com/watch?v={vid}" });
            }
        return new { configured = true, searchUrl, videos, source = "YouTube (YouTube Data API)" };
    }

    public object Configure(string? clientId, string? secret, bool isLocalAdmin)
    {
        if (!isLocalAdmin) throw new RpcException("forbidden", "Den IGDB-Zugang trägt man nur direkt am PC ein.");
        if (clientId != null && clientId.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(clientId, "^[a-z0-9]{20,40}$")) throw new RpcException("invalid-params", "Die Client-ID einer Twitch-Anwendung hat 20–40 Kleinbuchstaben und Ziffern (dev.twitch.tv → Konsole → Anwendungen).");
        if (secret != null && secret.Length > 0 && !System.Text.RegularExpressions.Regex.IsMatch(secret, "^[a-z0-9]{20,40}$")) throw new RpcException("invalid-params", "Das Client-Geheimnis hat 20–40 Kleinbuchstaben und Ziffern.");
        _store.Update(f =>
        {
            if (clientId != null) f.TwitchClientId = clientId.Length == 0 ? null : clientId;
            if (secret != null) f.TwitchSecretProtected = secret.Length == 0 ? null : _secrets.Protect(secret);
            if (clientId?.Length == 0) f.TwitchSecretProtected = null;
        });
        _token = null;
        Log.Info("playtime", clientId?.Length == 0 ? "IGDB-Zugang entfernt." : "IGDB-Zugang gespeichert (Geheimnis geschützt)."); // never the secret itself
        return Status();
    }

    static string Norm(string s) => System.Text.RegularExpressions.Regex.Replace(s.ToLowerInvariant(), "[^\\p{L}\\p{N}]+", "");

    /// <summary>Everything known about one game's play time; each part says where it comes from and how old it is.</summary>
    public async Task<object> LookupAsync(string game, bool refresh)
    {
        game = game.Trim();
        if (game.Length is < 2 or > 100) throw new RpcException("invalid-params", "Spielname mit 2–100 Zeichen.");
        bool Same(string name) => SteamAchievementsService.SameGame(name, game) || Norm(name) == Norm(game);

        // Steam: the linked account (Web API) and Steam's own record on this PC.
        object? steamApi = null, steamLocal = null;
        string? appId = null; string? steamName = null;
        if (_steam != null)
        {
            var (owned, lastSync) = _steam.Owned();
            var hit = owned.FirstOrDefault(g => Same(g.Name));
            if (hit != null) { appId = hit.AppId.ToString(); steamName = hit.Name; if (hit.PlaytimeMinutes is { } m) steamApi = new { minutes = m, lastPlayed = hit.LastPlayed, updatedAt = lastSync, source = "Steam (dein verknüpftes Konto)" }; }
            if (appId == null) { var inst = _steam.InstalledGames().FirstOrDefault(i => Same(i.name)); if (inst.appId != null) { appId = inst.appId; steamName = inst.name; } }
            if (appId != null && long.TryParse(appId, out var id) && _steam.LocalPlaytime().TryGetValue(id, out var local))
                steamLocal = new { minutes = local.minutes, lastPlayed = local.lastPlayed, updatedAt = DateTime.UtcNow, source = "Steam auf diesem PC (localconfig.vdf)" };
        }
        object? measured = null;
        if (_history != null)
        {
            var h = _history.MeasuredFor(Same);
            if (h.sessions > 0) measured = new { minutes = h.minutes, sessions = h.sessions, since = h.first, lastPlayed = h.last, updatedAt = DateTime.UtcNow, source = "Gaming-Verlauf (vom Begleiter gemessene Sitzungen)" };
        }

        // Average durations: IGDB, only with the user's own Twitch app.
        GameDurations? durations = null; string? durationsError = null;
        var f = _store.Snapshot();
        if (f.TwitchClientId == null || f.TwitchSecretProtected == null) durationsError = "not-configured";
        else
        {
            var key = Norm(steamName ?? game);
            if (!refresh && f.Cache.TryGetValue(key, out var c) && DateTime.UtcNow - c.FetchedAt < CacheFor) durations = c;
            else
            {
                try
                {
                    durations = await FetchDurationsAsync(steamName ?? game, f);
                    if (durations != null) _store.Update(x => { if (x.Cache.Count > 300) x.Cache.Clear(); x.Cache[key] = durations; });
                    else durationsError = "not-found";
                }
                catch (RpcException e) { durationsError = e.Message; }
            }
        }
        return new
        {
            game = steamName ?? durations?.Name ?? game,
            steamAppId = appId,
            steamApi, steamLocal, measured,
            durations = durations == null ? null : new { igdbId = durations.IgdbId, name = durations.Name, url = durations.Url, mainHours = durations.MainHours, extraHours = durations.ExtraHours, completeHours = durations.CompleteHours, count = durations.Count, fetchedAt = durations.FetchedAt, source = "IGDB „Time to Beat“ (igdb.com, Angaben von Spielern)" },
            durationsError,
        };
    }

    async Task<string> TokenAsync(PlaytimeFile f)
    {
        if (_token is { } t && t.until > DateTime.UtcNow.AddMinutes(5)) return t.token;
        var secret = _secrets.Unprotect(f.TwitchSecretProtected!) ?? throw new RpcException("unavailable", "Das gespeicherte IGDB-Geheimnis lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
        using var resp = await _http.PostAsync($"{TokenBase}/oauth2/token?client_id={Uri.EscapeDataString(f.TwitchClientId!)}&client_secret={Uri.EscapeDataString(secret)}&grant_type=client_credentials", null);
        if ((int)resp.StatusCode is 400 or 401 or 403) throw new RpcException("unavailable", "Twitch hat Client-ID oder Geheimnis abgelehnt – bitte unter dev.twitch.tv prüfen und am PC neu eintragen.");
        if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"Twitch antwortet mit {(int)resp.StatusCode}.");
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("access_token").GetString()!;
        var seconds = doc.RootElement.TryGetProperty("expires_in", out var e) ? e.GetInt32() : 3600;
        _token = (token, DateTime.UtcNow.AddSeconds(seconds));
        return token;
    }

    async Task<string> IgdbAsync(string endpoint, string body, PlaytimeFile f)
    {
        var token = await TokenAsync(f);
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{IgdbBase}/v4/{endpoint}") { Content = new StringContent(body, Encoding.UTF8, "text/plain") };
        req.Headers.Add("Client-ID", f.TwitchClientId);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var resp = await _http.SendAsync(req);
        if ((int)resp.StatusCode == 401) { _token = null; throw new RpcException("unavailable", "IGDB hat den Zugang abgelehnt – bitte am PC prüfen."); }
        if (!resp.IsSuccessStatusCode) throw new RpcException("unavailable", $"IGDB antwortet mit {(int)resp.StatusCode}{((int)resp.StatusCode == 429 ? " (zu viele Anfragen – gleich noch einmal)" : "")}.");
        return await resp.Content.ReadAsStringAsync();
    }

    /// <summary>The same game (not another of the series), then its average durations.</summary>
    async Task<GameDurations?> FetchDurationsAsync(string game, PlaytimeFile f)
    {
        await _one.WaitAsync();
        try
        {
            var q = game.Replace("\\", "").Replace("\"", "");
            var games = JsonDocument.Parse(await IgdbAsync("games", $"search \"{q}\"; fields id,name,url; limit 10;", f)).RootElement;
            var pick = PickGame(games, game);
            if (pick == null) return null;
            var ttb = JsonDocument.Parse(await IgdbAsync("game_time_to_beats", $"fields hastily,normally,completely,count; where game_id = {pick.Value.id};", f)).RootElement;
            return ParseDurations(ttb, pick.Value.id, pick.Value.name, pick.Value.url);
        }
        finally { _one.Release(); }
    }

    public static (long id, string name, string url)? PickGame(JsonElement list, string wanted)
    {
        if (list.ValueKind != JsonValueKind.Array) return null;
        var items = list.EnumerateArray().Where(g => g.TryGetProperty("id", out _) && g.TryGetProperty("name", out _))
            .Select(g => (id: g.GetProperty("id").GetInt64(), name: g.GetProperty("name").GetString() ?? "", url: g.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "")).ToList();
        var exact = items.Where(i => Norm(i.name) == Norm(wanted)).ToList();
        if (exact.Count > 0) return exact[0];
        var same = items.FirstOrDefault(i => SteamAchievementsService.SameGame(i.name, wanted));
        return same.name != null ? same : null;
    }

    /// <summary>IGDB gives seconds; "hastily" = main story, "normally" = with side content, "completely" = 100 %.</summary>
    public static GameDurations? ParseDurations(JsonElement list, long id, string name, string url)
    {
        if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() == 0) return null;
        var t = list[0];
        double? H(string k) => t.TryGetProperty(k, out var v) && v.TryGetDouble(out var s) && s > 0 ? Math.Round(s / 3600.0, 1) : null;
        var d = new GameDurations { IgdbId = id, Name = name, Url = url.StartsWith("https://") ? url : $"https://www.igdb.com/games/{id}", MainHours = H("hastily"), ExtraHours = H("normally"), CompleteHours = H("completely"), Count = t.TryGetProperty("count", out var c) && c.TryGetInt32(out var n) ? n : 0, FetchedAt = DateTime.UtcNow };
        return d.MainHours == null && d.ExtraHours == null && d.CompleteHours == null ? null : d;
    }

    public void Dispose() { _http.Dispose(); _one.Dispose(); }
}
