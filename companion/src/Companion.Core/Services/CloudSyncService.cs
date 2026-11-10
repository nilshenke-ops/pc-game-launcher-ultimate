using System.IO.Compression;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class CloudSyncFile
{
    public string? Api { get; set; }
    public string? User { get; set; }
    public string? TokenProtected { get; set; }
    public string? EncProtected { get; set; }
    public DateTime? LinkedAt { get; set; }
    /// <summary>Per item the SHA-256 of the JSON last stored in the cloud – unchanged items are not sent again.</summary>
    public Dictionary<string, string> Pushed { get; set; } = new();
    /// <summary>Ids of changes from other devices that were already taken over (in case the "taken over" answer got lost).</summary>
    public List<string> AppliedOps { get; set; } = new();
    public DateTime? LastPushAt { get; set; }
    public DateTime? LastPullAt { get; set; }
    public DateTime? LastOkAt { get; set; }
    public string? LastError { get; set; }
    public List<string> Conflicts { get; set; } = new();
}

/// <summary>
/// Keeps the account's cloud copy of this PC's data up to date while the companion runs – and takes over changes that other devices of the
/// same account made while the PC was off. The data is sealed with the account's own key (AES-GCM, the same key the website derives from the
/// password) before it leaves the PC, so the cloud only stores ciphertext. Works without any open browser: after a change on the PC (debounced
/// 2 s), every 30 s as a safety net and right after the start. Without internet nothing is lost – what was not sent is sent on the next try.
/// </summary>
public sealed class CloudSyncService : IDisposable
{
    /// <summary>What the cloud copy holds: the same answers the website loads from the PC (empty parameters).</summary>
    public static readonly string[] Items =
    {
        "state.get", "library.list", "launchers.list", "quick.list", "profiles.list", "sounds.list", "settings.get", "history.get",
        "deck.list", "calendar.list", "widgets.list", "quests.get", "deals.list", "layouts.list", "overlay.layout", "activity.get", "plugins.list",
    };
    /// <summary>Changes a device may make through the cloud while the PC is off – data only, never starting programs or changing what runs.</summary>
    public static readonly HashSet<string> OpMethods = new() { "library.update", "settings.save", "memory.configure", "ai.set", "sounds.importUrl" };
    /// <summary>
    /// Takes over account settings that only the PC itself may apply (the memory folder, AI keys): the account owner set them up once on any device,
    /// they arrive sealed with the account key, and the PC applies them with its own rights. Set by <c>CompanionServices</c>.
    /// </summary>
    public Func<string, JsonElement, Task>? AccountSettings { get; set; }
    const int PartSize = 900_000, MaxApplied = 1000;
    static readonly TimeSpan Period = TimeSpan.FromSeconds(30), Debounce = TimeSpan.FromSeconds(2), Heartbeat = TimeSpan.FromMinutes(5);

    readonly JsonStore<CloudSyncFile> _store;
    readonly ISecretProtector _secrets;
    readonly Func<string, JsonElement, Task<object?>> _invoke;
    readonly Func<string> _pcName;
    readonly IHub _hub;
    readonly HttpClient _http;
    readonly SemaphoreSlim _gate = new(1, 1);
    readonly object _lock = new();
    Timer? _timer, _soon;
    string _state = "off";
    bool _syncing;
    int _failures;
    DateTime _nextTry = DateTime.MinValue;

    public CloudSyncService(AppPaths paths, ISecretProtector secrets, Func<string, JsonElement, Task<object?>> invoke, Func<string> pcName, IHub hub, HttpMessageHandler? http = null)
    {
        _store = new JsonStore<CloudSyncFile>(paths.File("cloudsync.json"));
        _secrets = secrets; _invoke = invoke; _pcName = pcName; _hub = hub;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromSeconds(30);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("NexusCompanion/" + UpdateService.CurrentVersion);
        if (Linked) _state = "pending";
    }

    public bool Linked { get { var f = _store.Snapshot(); return f.User != null && f.TokenProtected != null && f.EncProtected != null; } }

    public void Start()
    {
        _timer = new Timer(_ => _ = SyncAsync(), null, TimeSpan.FromSeconds(3), Period);
    }

    /// <summary>A change on the PC: sync shortly (several changes in a row become one upload).</summary>
    public void Changed(string topic)
    {
        if (!Linked || topic == "cloud") return;
        lock (_lock) { _soon?.Dispose(); _soon = new Timer(_ => _ = SyncAsync(force: true), null, Debounce, Timeout.InfiniteTimeSpan); }
    }

    public object Status()
    {
        var f = _store.Snapshot();
        return new
        {
            linked = Linked, user = f.User, api = f.Api, state = Linked ? (_syncing ? "syncing" : _state) : "off",
            lastPushAt = f.LastPushAt, lastPullAt = f.LastPullAt, lastOkAt = f.LastOkAt, lastError = f.LastError,
            conflicts = f.Conflicts.TakeLast(10).ToList(), items = Items.Length,
        };
    }

    /// <summary>Only https – plain http just for a service on this PC itself (local development and the automatic tests).</summary>
    public static string? NormalizeApi(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || !Uri.TryCreate(raw.Trim(), UriKind.Absolute, out var u)) return null;
        var loopback = u.Host is "localhost" or "127.0.0.1" or "[::1]";
        if (u.Scheme != Uri.UriSchemeHttps && !(u.Scheme == Uri.UriSchemeHttp && loopback)) return null;
        if (!string.IsNullOrEmpty(u.Query) || !string.IsNullOrEmpty(u.Fragment) || !string.IsNullOrEmpty(u.UserInfo)) return null;
        return u.GetLeftPart(UriPartial.Authority) + (u.AbsolutePath == "/" ? "" : u.AbsolutePath.TrimEnd('/'));
    }

    /// <summary>Connects this PC with the account: asks the cloud for its own device token (the login key is used once, then forgotten).</summary>
    public async Task<object> LinkAsync(string? api, string user, string authHex, string encB64)
    {
        var a = NormalizeApi(api) ?? throw new RpcException("invalid-params", "Die Cloud-Adresse ist nicht erlaubt (nur https).");
        user = user.Trim().ToLowerInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(user, "^[a-z0-9._-]{3,24}$")) throw new RpcException("invalid-params", "Ungültiger Benutzername.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(authHex, "^[0-9a-f]{64}$")) throw new RpcException("invalid-params", "Ungültiger Anmeldeschlüssel.");
        byte[] enc;
        try { enc = Convert.FromBase64String(encB64); } catch (FormatException) { throw new RpcException("invalid-params", "Ungültiger Datenschlüssel."); }
        if (enc.Length != 32) throw new RpcException("invalid-params", "Ungültiger Datenschlüssel.");
        JsonElement r;
        try { r = await PostAsync(a, "token", new { user, key = authHex, device = "PC " + _pcName() }); }
        catch (HttpRequestException) { throw new RpcException("cloud-unreachable", "Die Cloud ist gerade nicht erreichbar – später erneut versuchen."); }
        catch (TaskCanceledException) { throw new RpcException("cloud-unreachable", "Die Cloud antwortet nicht – später erneut versuchen."); }
        var token = r.TryGetProperty("token", out var t) ? t.GetString() : null;
        if (token == null) throw new RpcException("cloud-error", "Die Cloud hat keinen Zugang ausgestellt.");
        _store.Update(f =>
        {
            var same = f.User == user && f.Api == a;
            f.Api = a; f.User = user; f.TokenProtected = _secrets.Protect(token); f.EncProtected = _secrets.Protect(encB64);
            f.LinkedAt = DateTime.UtcNow; f.LastError = null;
            if (!same) { f.Pushed.Clear(); f.AppliedOps.Clear(); f.Conflicts.Clear(); f.LastPushAt = f.LastPullAt = f.LastOkAt = null; }
        });
        _state = "pending"; _failures = 0; _nextTry = DateTime.MinValue;
        Log.Info("cloud", $"PC mit dem Cloud-Konto „{user}“ verbunden – Daten werden ab jetzt automatisch abgeglichen.");
        _hub.Changed("cloud");
        _ = SyncAsync(force: true);
        return Status();
    }

    public async Task<object> UnlinkAsync()
    {
        var f = _store.Snapshot();
        if (f.Api != null && f.User != null && f.TokenProtected != null && _secrets.Unprotect(f.TokenProtected) is { } token)
            try { await PostAsync(f.Api, "revoke", new { user = f.User, token }); } catch { /* offline: the token simply stays unused */ }
        _store.Update(x => { x.Api = x.User = x.TokenProtected = x.EncProtected = null; x.Pushed.Clear(); x.AppliedOps.Clear(); x.Conflicts.Clear(); x.LastError = null; });
        _state = "off";
        _hub.Changed("cloud");
        return Status();
    }

    /// <summary>One round: take over changes from other devices, then send what changed on this PC. Never runs twice at the same time.</summary>
    public async Task<bool> SyncAsync(bool force = false)
    {
        if (!Linked) return false;
        if (!force && DateTime.UtcNow < _nextTry) return false;
        if (!await _gate.WaitAsync(0)) { if (force) Changed("again"); return false; }
        var f = _store.Snapshot();
        var token = f.TokenProtected == null ? null : _secrets.Unprotect(f.TokenProtected);
        var enc = f.EncProtected == null ? null : _secrets.Unprotect(f.EncProtected);
        try
        {
            if (token == null || enc == null || f.Api == null || f.User == null) { Fail("Der Cloud-Zugang dieses PCs ließ sich nicht lesen – bitte am PC erneut mit dem Konto anmelden."); return false; }
            _syncing = true; _hub.Changed("cloud");
            var key = Convert.FromBase64String(enc);
            await TakeOverAsync(f.Api, f.User, token, key);
            await PushAsync(f.Api, f.User, token, key);
            _failures = 0; _nextTry = DateTime.MinValue; _state = "ok";
            var partial = PushFailures; PushFailures = null;
            _store.Update(x => { x.LastOkAt = DateTime.UtcNow; x.LastError = partial; });
            return true;
        }
        catch (CloudAuthException)
        {
            Fail("Die Cloud kennt diesen PC nicht mehr (Konto gelöscht oder Zugang zurückgezogen) – bitte am PC erneut mit dem Konto anmelden.");
            _store.Update(x => x.TokenProtected = null);
            return false;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or IOException)
        {
            // Offline or the service is down: nothing is lost (unsent items are found again by their hash), try again with growing pauses.
            _failures++;
            _nextTry = DateTime.UtcNow + TimeSpan.FromSeconds(Math.Min(300, 5 * Math.Pow(2, Math.Min(_failures, 6))));
            _state = "unreachable";
            _store.Update(x => x.LastError = "Cloud nicht erreichbar – Änderungen werden nachgeholt, sobald die Verbindung wieder da ist.");
            return false;
        }
        catch (Exception ex)
        {
            Log.Warn("cloud", "Abgleich fehlgeschlagen: " + ex.Message);
            Fail("Abgleich fehlgeschlagen: " + ex.Message);
            return false;
        }
        finally { _syncing = false; _gate.Release(); _hub.Changed("cloud"); }
    }

    void Fail(string message) { _state = "error"; _store.Update(x => x.LastError = message); }

    // ------------------------------------------------------------------ PC → cloud

    async Task PushAsync(string api, string user, string token, byte[] key)
    {
        var f = _store.Snapshot();
        var changed = new List<(string item, string hash, string json)>();
        foreach (var item in Items)
        {
            string json;
            try { json = Volatile(item, Json.Serialize(await _invoke(item, EmptyParams))); }
            catch (Exception ex) { if (ex is not RpcException) Log.Warn("cloud", $"{item}: {ex.Message}"); continue; }   // a part the PC does not offer
            var hash = Sha(json);
            if (!f.Pushed.TryGetValue(item, out var old) || old != hash) changed.Add((item, hash, json));
        }
        var heartbeat = f.LastPushAt == null || DateTime.UtcNow - f.LastPushAt > Heartbeat;
        if (changed.Count == 0 && !heartbeat) return;
        if (changed.Count == 0) changed.Add(("state.get", "", Volatile("state.get", Json.Serialize(await _invoke("state.get", EmptyParams)))));
        // Several small requests instead of one big one (each item may be up to a few MB as ciphertext).
        // One item the cloud refuses (too big, …) must not block all the others: it is retried alone, then without its big pictures, and only then reported.
        var failures = new List<string>();
        foreach (var batch in Batches(changed))
        {
            if (await TryPushAsync(api, user, token, key, batch, null)) continue;
            foreach (var c in batch)
            {
                if (await TryPushAsync(api, user, token, key, new List<(string item, string hash, string json)> { c }, failures)) continue;
                var slim = SlimPictures(c.json);
                if (slim != c.json && await TryPushAsync(api, user, token, key, new List<(string item, string hash, string json)> { (c.item, c.hash, slim) }, failures)) { failures.RemoveAll(x => x.StartsWith(c.item + ":")); Log.Warn("cloud", $"{c.item}: ohne große Bilder übertragen (war zu groß)."); }
            }
        }
        PushFailures = failures.Count == 0 ? null : "Nicht in die Cloud übertragen: " + string.Join("; ", failures);
        if (changed.Any(c => c.hash != "")) Log.Info("cloud", "In die Cloud übertragen: " + string.Join(", ", changed.Where(c => c.hash != "").Select(c => c.item)));
    }

    /// <summary>What went wrong with single items in the last round (shown on the cloud page), or null.</summary>
    string? PushFailures;

    async Task<bool> TryPushAsync(string api, string user, string token, byte[] key, List<(string item, string hash, string json)> batch, List<string>? failures)
    {
        try
        {
            var items = batch.Select(c => new { item = c.item, ver = Ids.Token(10), parts = Split(Seal(key, c.json)) }).ToList();
            await PostAsync(api, "push", new { user, token, pc = _pcName(), items });
            _store.Update(x => { foreach (var c in batch) if (c.hash != "") x.Pushed[c.item] = c.hash; x.LastPushAt = DateTime.UtcNow; });
            return true;
        }
        catch (RpcException ex)
        {
            failures?.Add($"{batch[0].item}: {ex.Message}");
            return false;
        }
    }

    /// <summary>Fallback for an item that is too big for the cloud: every very long text (a picture as data URL) is dropped, everything else stays.</summary>
    static string SlimPictures(string json)
    {
        try
        {
            var node = JsonNode.Parse(json);
            void Walk(JsonNode? n)
            {
                if (n is JsonObject o) foreach (var k in o.Select(x => x.Key).ToList()) { if (o[k] is JsonValue v && v.TryGetValue<string>(out var str) && str.Length > 20_000) o[k] = null; else Walk(o[k]); }
                else if (n is JsonArray a) foreach (var x in a) Walk(x);
            }
            Walk(node);
            return node?.ToJsonString(Json.Options) ?? json;
        }
        catch (JsonException) { return json; }
    }

    static IEnumerable<List<(string item, string hash, string json)>> Batches(List<(string item, string hash, string json)> all)
    {
        var cur = new List<(string, string, string)>(); long size = 0;
        foreach (var c in all)
        {
            if (cur.Count > 0 && size + c.json.Length > 4_000_000) { yield return cur; cur = new(); size = 0; }
            cur.Add(c); size += c.json.Length;
        }
        if (cur.Count > 0) yield return cur;
    }

    static List<string> Split(string blob) { var l = new List<string>(); for (int i = 0; i < blob.Length; i += PartSize) l.Add(blob.Substring(i, Math.Min(PartSize, blob.Length - i))); return l; }

    /// <summary>What changes every few seconds (running games, playing sounds, the asking session) is not part of the copy – it would cause uploads all the time.</summary>
    public static string Volatile(string item, string json)
    {
        if (item is not ("state.get" or "library.list")) return json;
        if (JsonNode.Parse(json) is not JsonObject o) return json;
        if (o.ContainsKey("running")) o["running"] = new JsonArray();
        if (item == "state.get")
        {
            o["playing"] = new JsonObject { ["playing"] = new JsonArray(), ["queued"] = 0 };
            o["relay"] = new JsonObject { ["state"] = "off", ["clients"] = 0 };
            o.Remove("me");
        }
        return o.ToJsonString(Json.Options);
    }

    // ------------------------------------------------------------------ cloud → PC (changes made on devices while the PC was off)

    async Task TakeOverAsync(string api, string user, string token, byte[] key)
    {
        var r = await PostAsync(api, "pull", new { user, token, have = AllHave() });
        _store.Update(x => x.LastPullAt = DateTime.UtcNow);
        if (!r.TryGetProperty("ops", out var ops) || ops.ValueKind != JsonValueKind.Array || ops.GetArrayLength() == 0) return;
        var done = new List<string>();
        var applied = _store.Snapshot().AppliedOps.ToHashSet();
        foreach (var op in ops.EnumerateArray())
        {
            var id = op.TryGetProperty("id", out var i) ? i.GetString() ?? "" : "";
            if (id == "") continue;
            if (applied.Contains(id)) { done.Add(id); continue; }
            var device = op.TryGetProperty("device", out var d) ? d.GetString() ?? "Gerät" : "Gerät";
            try
            {
                var plain = Open(key, op.GetProperty("blob").GetString() ?? "");
                using var doc = JsonDocument.Parse(plain);
                var note = await ApplyAsync(doc.RootElement, device);
                if (note != null) _store.Update(x => { x.Conflicts.Add($"{DateTime.Now:dd.MM. HH:mm} {note}"); if (x.Conflicts.Count > 30) x.Conflicts.RemoveRange(0, x.Conflicts.Count - 30); });
            }
            catch (CryptographicException) { Log.Warn("cloud", $"Änderung {id} ließ sich nicht entschlüsseln (anderes Passwort?) – übersprungen."); }
            catch (Exception ex) when (ex is RpcException or JsonException or FormatException or KeyNotFoundException or InvalidOperationException)
            { Log.Warn("cloud", $"Änderung von {device} nicht übernommen: {ex.Message}"); }
            done.Add(id);
            _store.Update(x => { x.AppliedOps.Add(id); if (x.AppliedOps.Count > MaxApplied) x.AppliedOps.RemoveRange(0, x.AppliedOps.Count - MaxApplied); });
        }
        if (done.Count > 0) await PostAsync(api, "ack", new { user, token, ids = done });
    }

    /// <summary>
    /// Takes over one change. Conflicts are resolved per field with the value the device saw before its change ("base"): a field is only
    /// set if the PC still has that old value – what was changed on the PC in the meantime wins and is kept. Returns a note on conflicts.
    /// </summary>
    public async Task<string?> ApplyAsync(JsonElement op, string device)
    {
        var method = op.GetProperty("method").GetString() ?? "";
        if (!OpMethods.Contains(method)) throw new RpcException("forbidden", $"„{method}“ wird aus der Cloud nicht übernommen.");
        var p = op.GetProperty("params");
        if (p.ValueKind != JsonValueKind.Object) throw new RpcException("invalid-params", "Ungültige Änderung.");
        if (method is "memory.configure" or "ai.set")
        {
            if (AccountSettings == null) throw new RpcException("forbidden", $"„{method}“ wird aus der Cloud nicht übernommen.");
            await AccountSettings(method, p);
            Log.Info("cloud", $"Einstellung von {device} übernommen: {method}");
            return null;
        }
        if (method == "sounds.importUrl")
        {
            // A link a device added while the PC was off: only https, then the same import as from the phone (the PC checks size and format itself).
            var url = p.TryGetProperty("url", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() : null;
            if (url == null || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return $"Link von {device}: nur https-Links werden übernommen – verworfen.";
            try { await _invoke("sounds.importUrl", p.Clone()); Log.Info("cloud", $"Sound-Link von {device} übernommen."); return null; }
            catch (Exception e) { return $"Sound-Link von {device} nicht übernommen: {e.Message}"; }      // any failure (download, format, size) is noted – the change must not stay open forever
        }
        var hasBase = op.TryGetProperty("base", out var b) && b.ValueKind == JsonValueKind.Object;
        JsonElement? current = null;
        if (method == "library.update")
        {
            var id = p.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
            using var list = JsonDocument.Parse(Json.Serialize(await _invoke("library.list", EmptyParams)));
            foreach (var it in list.RootElement.GetProperty("items").EnumerateArray())
                if (it.TryGetProperty("id", out var x) && x.GetString() == id) { current = it.Clone(); break; }
            if (current == null) return $"„{Name(p)}“ von {device}: gibt es am PC nicht mehr – Änderung verworfen.";
        }
        else
        {
            using var s = JsonDocument.Parse(Json.Serialize(await _invoke("settings.get", EmptyParams)));
            current = s.RootElement.GetProperty("settings").Clone();
        }
        var keep = new JsonObject();
        var skipped = new List<string>();
        foreach (var prop in p.EnumerateObject())
        {
            if (prop.Name == "id") { keep[prop.Name] = JsonNode.Parse(prop.Value.GetRawText()); continue; }
            var cur = current.Value.TryGetProperty(prop.Name, out var c) ? c : default;
            // Already the wanted value (e.g. the device also sent it directly) – nothing to do, no conflict.
            if (cur.ValueKind != JsonValueKind.Undefined && Same(cur, prop.Value)) continue;
            if (hasBase && b.TryGetProperty(prop.Name, out var bv) && cur.ValueKind != JsonValueKind.Undefined && !Same(cur, bv)) { skipped.Add(prop.Name); continue; }
            keep[prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
        }
        if (keep.Count > (method == "library.update" ? 1 : 0))
        {
            using var doc = JsonDocument.Parse(keep.ToJsonString());
            await _invoke(method, doc.RootElement.Clone());
            Log.Info("cloud", $"Änderung von {device} übernommen: {method} ({string.Join(", ", keep.Select(k => k.Key).Where(k => k != "id"))})");
        }
        return skipped.Count == 0 ? null
            : $"{(method == "library.update" ? $"„{Name(p, current)}“" : "Einstellungen")} von {device}: {string.Join(", ", skipped)} wurde inzwischen am PC geändert – der Stand vom PC bleibt.";
    }

    static string Name(JsonElement p, JsonElement? cur = null) =>
        cur is { } c && c.TryGetProperty("name", out var n) ? n.GetString() ?? "Eintrag" : p.TryGetProperty("name", out var pn) ? pn.GetString() ?? "Eintrag" : "Eintrag";

    static bool Same(JsonElement a, JsonElement b) => JsonNode.DeepEquals(JsonNode.Parse(a.GetRawText()), JsonNode.Parse(b.GetRawText()));

    Dictionary<string, string> AllHave() => new();   // the PC only needs the open changes, never the items it made itself

    // ------------------------------------------------------------------ sealing (the same format as the website: "g1." + base64(iv ‖ ciphertext ‖ tag) of gzip(JSON))

    public static string Seal(byte[] key, string json)
    {
        using var ms = new MemoryStream();
        using (var gz = new GZipStream(ms, CompressionLevel.SmallestSize, leaveOpen: true)) gz.Write(Encoding.UTF8.GetBytes(json));
        var plain = ms.ToArray();
        var iv = RandomNumberGenerator.GetBytes(12);
        var ct = new byte[plain.Length]; var tag = new byte[16];
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(iv, plain, ct, tag);
        var all = new byte[12 + ct.Length + 16];
        iv.CopyTo(all, 0); ct.CopyTo(all, 12); tag.CopyTo(all, 12 + ct.Length);
        return "g1." + Convert.ToBase64String(all);
    }

    public static string Open(byte[] key, string blob)
    {
        // "g1." = gzip inside, "g0." = without (a browser that cannot compress)
        var gzip = blob.StartsWith("g1.", StringComparison.Ordinal);
        if (!gzip && !blob.StartsWith("g0.", StringComparison.Ordinal)) throw new FormatException("Unbekanntes Format.");
        var all = Convert.FromBase64String(blob[3..]);
        if (all.Length < 12 + 16) throw new FormatException("Zu kurz.");
        var iv = all[..12]; var tag = all[^16..]; var ct = all[12..^16];
        var plain = new byte[ct.Length];
        using (var aes = new AesGcm(key, 16)) aes.Decrypt(iv, ct, tag, plain);
        if (!gzip) return Encoding.UTF8.GetString(plain);
        using var gz = new GZipStream(new MemoryStream(plain), CompressionMode.Decompress);
        using var outMs = new MemoryStream();
        gz.CopyTo(outMs);
        return Encoding.UTF8.GetString(outMs.ToArray());
    }

    static string Sha(string s) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));
    static readonly JsonElement EmptyParams = JsonDocument.Parse("{}").RootElement.Clone();

    sealed class CloudAuthException : Exception { }

    async Task<JsonElement> PostAsync(string api, string action, object body)
    {
        using var res = await _http.PostAsJsonAsync($"{api}/api/sync/{action}", body, Json.Options);
        var text = await res.Content.ReadAsStringAsync();
        if (res.StatusCode == System.Net.HttpStatusCode.Unauthorized && action != "token") throw new CloudAuthException();
        JsonElement root;
        try { root = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text).RootElement.Clone(); }
        catch (JsonException) { throw new HttpRequestException($"Cloud antwortet unerwartet ({(int)res.StatusCode})."); }
        if ((int)res.StatusCode >= 500) throw new HttpRequestException(root.TryGetProperty("message", out var m5) ? m5.GetString() : "Cloud-Fehler");
        if (!res.IsSuccessStatusCode)
            throw new RpcException(action == "token" && res.StatusCode == System.Net.HttpStatusCode.Unauthorized ? "unauthorized" : "cloud-error",
                root.TryGetProperty("message", out var m) ? m.GetString() ?? "Die Cloud hat abgelehnt." : "Die Cloud hat abgelehnt.");
        return root;
    }

    public void Dispose() { _timer?.Dispose(); _soon?.Dispose(); _http.Dispose(); }
}
