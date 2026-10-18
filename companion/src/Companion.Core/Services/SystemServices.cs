using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

// ============================================================ Live PC monitor

/// <summary>Samples only while at least one client has the monitor open (every 2 s). No background polling otherwise.</summary>
public sealed class MonitorService : IDisposable
{
    readonly IMetricsSource _source;
    readonly RpcServer _rpc;
    Timer? _timer;
    MetricsSample? _last;
    readonly object _lock = new();
    int _busy;

    public MonitorService(IMetricsSource source, RpcServer rpc) { _source = source; _rpc = rpc; }

    public MetricsSample? Last => _last;

    public MetricsSample Subscribe(RpcSession s)
    {
        lock (_lock)
        {
            s.Subscriptions.Add("monitor");
            _timer ??= new Timer(_ => Tick(), null, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(2));
        }
        return _last ?? SampleNow();
    }

    public void Unsubscribe(RpcSession s)
    {
        lock (_lock)
        {
            s.Subscriptions.Remove("monitor");
            StopIfIdle();
        }
    }

    void StopIfIdle()
    {
        if (_rpc.Sessions.Any(x => x.Subscriptions.Contains("monitor"))) return;
        _timer?.Dispose();
        _timer = null;
    }

    MetricsSample SampleNow()
    {
        var s = _source.Sample();
        _last = s;
        return s;
    }

    void Tick()
    {
        if (Interlocked.Exchange(ref _busy, 1) == 1) return;
        try
        {
            lock (_lock) StopIfIdle();
            if (_timer == null) return;
            var s = SampleNow();
            _rpc.BroadcastTo(x => x.Authenticated && x.Subscriptions.Contains("monitor"), "monitor.sample", s);
        }
        catch (Exception ex) { Log.Warn("monitor", ex.Message); }
        finally { Interlocked.Exchange(ref _busy, 0); }
    }

    public void Dispose() => _timer?.Dispose();
}

// ============================================================ Network diagnostics

/// <summary>
/// Rules for addresses that other devices or the relay client use. "localhost"/127.0.0.1 always means "this device",
/// so it can never be the address an iPad uses to reach the PC, and the companion's own /ws endpoint is not a relay.
/// </summary>
public static class AddressRules
{
    public static bool IsLoopbackHost(string host) =>
        host.Equals("localhost", StringComparison.OrdinalIgnoreCase) || host.EndsWith(".localhost", StringComparison.OrdinalIgnoreCase) ||
        (IPAddress.TryParse(host.Trim('[', ']'), out var ip) && IPAddress.IsLoopback(ip));

    /// <summary>Host names/addresses under which this PC itself is reachable.</summary>
    public static bool IsThisPc(string host) =>
        IsLoopbackHost(host) || host.Equals(Environment.MachineName, StringComparison.OrdinalIgnoreCase) ||
        NetworkDiagnostics.LocalIPv4().Contains(host);

    /// <summary>Explains why a relay address cannot work, or null if it is plausible.</summary>
    public static string? RelayProblem(string relayUrl, int companionPort)
    {
        if (!Uri.TryCreate(relayUrl, UriKind.Absolute, out var u) || u.Scheme is not ("ws" or "wss"))
            return "Relay-Adresse muss mit wss:// beginnen (ws:// nur im lokalen Netz).";
        if (IsThisPc(u.Host) && u.Port == companionPort)
            return $"{relayUrl} ist die Adresse dieses PC-Begleiters selbst (Port {companionPort}, /ws ist der Endpunkt für Browser) – kein Relay. " +
                   "Der Begleiter würde sich mit sich selbst verbinden. Das Relay ist ein eigener Server (Standard-Port 8788, Endpunkt /companion). " +
                   "Im WLAN wird kein Relay gebraucht: Relay ausschalten oder die Adresse deines Relay-Servers eintragen, z. B. wss://relay.example.com.";
        return null;
    }

    /// <summary>Explains why an address meant for other devices (QR code, "Öffentliche Adresse") cannot work, or null.</summary>
    public static string? PublicUrlProblem(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme is not ("https" or "http"))
            return "Öffentliche Adresse muss mit https:// beginnen.";
        if (IsLoopbackHost(u.Host))
            return $"{u.Host} zeigt auf jedem Gerät auf das Gerät selbst – ein iPad würde damit sich selbst statt deinen PC suchen. Trage die https-Adresse deines Tunnels ein (z. B. https://mein-pc.tail1234.ts.net) oder lass das Feld leer.";
        return null;
    }
}

public sealed class NetworkDiagnostics
{
    readonly Func<object> _relayStatus;
    readonly Func<Settings> _settings;
    readonly Func<IReadOnlyList<string>> _lanUrls;

    public NetworkDiagnostics(Func<object> relayStatus, Func<Settings> settings, Func<IReadOnlyList<string>> lanUrls)
    {
        _relayStatus = relayStatus; _settings = settings; _lanUrls = lanUrls;
    }

    public static List<string> LocalIPv4()
    {
        var list = new List<string>();
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
            var name = (ni.Name + " " + ni.Description).ToLowerInvariant();
            if (name.Contains("virtual") || name.Contains("vmware") || name.Contains("hyper-v") || name.Contains("vethernet") || name.Contains("docker") || name.Contains("wsl")) continue;
            foreach (var a in ni.GetIPProperties().UnicastAddresses)
                if (a.Address.AddressFamily == AddressFamily.InterNetwork && SoundboardService.IsPrivate(a.Address) && !IPAddress.IsLoopback(a.Address))
                    list.Add(a.Address.ToString());
        }
        return list.Distinct().ToList();
    }

    public async Task<object> Run()
    {
        var checks = new List<object>();
        void Add(string id, string label, string status, string detail, double? ms = null, string? fix = null) => checks.Add(new { id, label, status, detail, ms, fix });

        var ips = LocalIPv4();
        Add("lan", "Lokales Netzwerk", ips.Count > 0 ? "ok" : "error", ips.Count > 0 ? "IP-Adresse(n): " + string.Join(", ", ips) : "Keine Adresse im Heimnetz gefunden.",
            fix: ips.Count > 0 ? null : "PC per WLAN oder Kabel mit dem Router verbinden. (VPN-/virtuelle Adapter zählen nicht.)");
        var s = _settings();
        var lan = _lanUrls();
        if (!s.LanAccess)
            Add("listen", "Begleiter im WLAN erreichbar", "error", "WLAN-Zugriff ist ausgeschaltet – nur dieser PC kann die Web-App öffnen.", fix: "Einstellungen → Verbindung → „Im WLAN erreichbar“ einschalten.");
        else if (lan.Count == 0)
            Add("listen", "Begleiter im WLAN erreichbar", "error", "Der Begleiter lauscht, aber es gibt keine Heimnetz-Adresse, über die ein iPad ihn erreichen kann.", fix: "PC mit dem Router verbinden.");
        else
            Add("listen", "Begleiter im WLAN erreichbar", "ok", "Web-App: " + string.Join("  ", lan), fix: null);

        var gw = NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up)
            .SelectMany(n => n.GetIPProperties().GatewayAddresses).Select(g => g.Address).FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork && !a.Equals(IPAddress.Any));
        if (gw != null)
        {
            var r = await PingAsync(gw);
            Add("gateway", "Router (" + gw + ")", r.ok ? "ok" : "warn", r.ok ? $"Antwortzeit {r.ms} ms" : "Keine Antwort auf Ping (manche Router blockieren Ping).", r.ok ? r.ms : null);
        }
        else Add("gateway", "Router", "warn", "Kein Standardgateway gefunden.");

        var sw = Stopwatch.StartNew();
        try
        {
            await Dns.GetHostAddressesAsync("www.msftconnecttest.com").WaitAsync(TimeSpan.FromSeconds(5));
            Add("dns", "Namensauflösung (DNS)", "ok", $"Funktioniert ({sw.ElapsedMilliseconds} ms)", sw.ElapsedMilliseconds);
        }
        catch (Exception ex) { Add("dns", "Namensauflösung (DNS)", "error", "DNS funktioniert nicht: " + ex.Message); }

        sw.Restart();
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
            var text = await http.GetStringAsync("http://www.msftconnecttest.com/connecttest.txt");
            var ok = text.Contains("Microsoft Connect Test");
            Add("internet", "Internetzugang", ok ? "ok" : "warn", ok ? $"Verbunden ({sw.ElapsedMilliseconds} ms)" : "Antwort unerwartet – evtl. Anmeldeseite (Hotel-/Gast-WLAN).", sw.ElapsedMilliseconds);
        }
        catch (Exception ex) { Add("internet", "Internetzugang", "error", "Kein Internet: " + ex.Message); }

        var ping = await PingAsync(IPAddress.Parse("1.1.1.1"));
        Add("ping", "Ping ins Internet (1.1.1.1)", ping.ok ? "ok" : "warn", ping.ok ? $"{ping.ms} ms" : "Keine Antwort (ICMP evtl. durch Firewall blockiert).", ping.ok ? ping.ms : null);

        if (s.RelayEnabled && s.RelayUrl != null && AddressRules.RelayProblem(s.RelayUrl, s.Port) is { } relayProblem)
            Add("relay", "Relay", "error", relayProblem, fix: "Einstellungen → Verbindung → Relay-Adresse korrigieren oder Relay ausschalten.");
        else if (s.RelayEnabled && s.RelayUrl != null)
        {
            var health = s.RelayUrl.Replace("wss://", "https://").Replace("ws://", "http://");
            health = health[..(health.IndexOf('/', health.IndexOf("//") + 2) is var i && i > 0 ? i : health.Length)] + "/healthz";
            sw.Restart();
            try
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(6) };
                var resp = await http.GetAsync(health);
                Add("relay-http", "Relay erreichbar", resp.IsSuccessStatusCode ? "ok" : "error", $"{health} → HTTP {(int)resp.StatusCode} ({sw.ElapsedMilliseconds} ms)", sw.ElapsedMilliseconds);
            }
            catch (Exception ex) { Add("relay-http", "Relay erreichbar", "error", $"{health}: {ex.Message}"); }
            var st = JsonSerializer.SerializeToElement(_relayStatus(), Json.Options);
            var state = st.TryGetProperty("state", out var se) ? se.GetString() : null;
            var lastError = st.TryGetProperty("lastError", out var le) && le.ValueKind == JsonValueKind.String ? le.GetString() : null;
            Add("relay-ws", "Relay-Verbindung", state == "connected" ? "ok" : "error", state == "connected" ? "Verbunden" : $"{state}: {lastError ?? "noch keine Verbindung"}",
                fix: state == "connected" ? null : "Companion-ID und Schlüssel müssen mit relay.config.json übereinstimmen; Relay-Server läuft?");
        }
        else Add("relay", "Relay", "info", "Nicht eingerichtet (nur nötig für Zugriff von unterwegs).");
        return new { at = DateTime.UtcNow, checks };
    }

    static async Task<(bool ok, double ms)> PingAsync(IPAddress ip)
    {
        try
        {
            using var p = new Ping();
            var r = await p.SendPingAsync(ip, 1500);
            return (r.Status == IPStatus.Success, r.RoundtripTime);
        }
        catch { return (false, 0); }
    }
}

// ============================================================ Updates

/// <summary>
/// Update signature: ECDSA P-256 / SHA-256 over "pgl-update-v1\n{version}\n{sha256}\n{size}" (IEEE P1363, Base64).
/// Only the public key is in the program; the private key stays with the publisher (GitHub secret).
/// </summary>
public static class UpdateSignature
{
    public const string OfficialPublicKey = """
        -----BEGIN PUBLIC KEY-----
        MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/hiMoSFzmijh6kpNVq6is8OV4+aS
        oL4zBwKfkXibFAkVJtzToNjtJEoYEx0O6B19dMMLko/XKEXUzIIz6EzM7g==
        -----END PUBLIC KEY-----
        """;

    public static byte[] Payload(string version, string sha256, long size) => System.Text.Encoding.UTF8.GetBytes($"pgl-update-v1\n{version}\n{sha256.ToLowerInvariant()}\n{size}");

    public static bool Verify(string version, string sha256, long size, string? signature, string publicKeyPem = OfficialPublicKey)
    {
        if (string.IsNullOrWhiteSpace(signature)) return false;
        try
        {
            using var key = ECDsa.Create();
            key.ImportFromPem(publicKeyPem);
            return key.VerifyData(Payload(version, sha256, size), Convert.FromBase64String(signature), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation);
        }
        catch (FormatException) { return false; }
        catch (CryptographicException) { return false; }
    }
}

public sealed class UpdateService
{
    readonly AppPaths _paths;
    readonly Func<Settings> _settings;
    readonly IUpdateInstaller _installer;
    readonly IHub _hub;
    /// <summary>Raised when checking or downloading an update fails (automation trigger "Update fehlgeschlagen").</summary>
    public event Action<string>? Failed;
    readonly HttpClient _http;
    /// <summary>Raised once per new version found by the automatic daily check.</summary>
    public event Action<Manifest>? Available;
    /// <summary>Creates a restore point (backup of all settings and lists) before an update is installed; returns its file name.</summary>
    public Func<string, string?>? CreateRestorePoint { get; set; }
    Timer? _timer;
    string? _announced;
    public static string CurrentVersion => typeof(UpdateService).Assembly.GetName().Version?.ToString(3) ?? "0.0.0";
    /// <summary>Overridable for the release check (pretend an older installed version); null = real version.</summary>
    public string? VersionOverride { get; set; }
    string Installed => VersionOverride ?? CurrentVersion;
    public string PublicKeyPem { get; set; } = UpdateSignature.OfficialPublicKey;

    public sealed class Changes
    {
        public List<string> Neu { get; set; } = new();
        public List<string> Verbessert { get; set; } = new();
        public List<string> Behoben { get; set; } = new();
    }

    public sealed class Manifest
    {
        public string Version { get; set; } = "";
        public string? Date { get; set; }
        public string Url { get; set; } = "";
        public string? FileName { get; set; }
        public string Sha256 { get; set; } = "";
        public long? Size { get; set; }
        public string? Notes { get; set; }
        public Changes? Changes { get; set; }
        public string? Signature { get; set; }
        /// <summary>Set by the companion: signature checked against the built-in key.</summary>
        public bool Signed { get; set; }
        public string? Source { get; set; }
    }

    Manifest? _available;
    string? _downloaded;
    string _state = "idle";
    string? _error;
    DateTime? _checkedAt;

    public UpdateService(AppPaths paths, Func<Settings> settings, IUpdateInstaller installer, IHub hub, HttpMessageHandler? http = null)
    {
        _paths = paths; _settings = settings; _installer = installer; _hub = hub;
        _http = http == null ? new HttpClient() : new HttpClient(http);
        _http.Timeout = TimeSpan.FromMinutes(10);
        _http.DefaultRequestHeaders.UserAgent.ParseAdd("PCGameLauncherUltimate/" + CurrentVersion);
    }

    bool Official => _settings().UpdateManifestUrl == new Settings().UpdateManifestUrl;

    /// <summary>Checks 2 minutes after start and then once a day (one small download). Never installs on its own.</summary>
    public void StartAutoCheck()
    {
        _timer = new Timer(async _ =>
        {
            if (string.IsNullOrEmpty(_settings().UpdateManifestUrl) || _state is "downloading") return;
            await Check();
            if (_available is { } m && _announced != m.Version) { _announced = m.Version; Available?.Invoke(m); }
        }, null, TimeSpan.FromMinutes(2), TimeSpan.FromHours(24));
    }

    public void Dispose() => _timer?.Dispose();

    public object Status() => new
    {
        current = Installed,
        source = _settings().UpdateManifestUrl,
        official = Official,
        state = _state,
        error = _error,
        checkedAt = _checkedAt,
        available = _available,
        downloaded = _downloaded != null,
        canInstall = _installer.Supported,
        canRollback = _installer.CanRollback,
    };

    public async Task<object> Check()
    {
        var url = _settings().UpdateManifestUrl;
        if (string.IsNullOrEmpty(url)) { _state = "no-source"; _error = "Keine Update-Quelle eingetragen (Einstellungen → Updates)."; return Status(); }
        try
        {
            // Cache-busting query: a CDN must never hand out an old manifest.
            var fetchUrl = url + (url.Contains('?') ? "&" : "?") + "t=" + DateTime.UtcNow.Ticks;
            using var req = new HttpRequestMessage(HttpMethod.Get, fetchUrl);
            req.Headers.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue { NoCache = true };
            using var resp = await _http.SendAsync(req);
            resp.EnsureSuccessStatusCode();
            var m = JsonSerializer.Deserialize<Manifest>(await resp.Content.ReadAsStringAsync(), Json.Options) ?? throw new Exception("Leeres Manifest");
            Validate(m, url);
            _checkedAt = DateTime.UtcNow;
            _available = Version.Parse(m.Version) > Version.Parse(Installed) ? m : null;
            _state = _available != null ? "available" : "up-to-date";
            _error = null;
            if (_downloaded != null && _available?.Version is { } av && !_downloaded.Contains(av)) _downloaded = null;
        }
        catch (Exception ex) { _state = "error"; _error = "Prüfung fehlgeschlagen: " + ex.Message; Failed?.Invoke(_error); }
        _hub.Changed("updates");
        return Status();
    }

    /// <summary>Checks a manifest. Official source: a valid signature is required. Own source: a signature, if present, must be valid.</summary>
    internal void Validate(Manifest m, string manifestUrl)
    {
        if (!Regex.IsMatch(m.Version ?? "", @"^\d+\.\d+\.\d+$") || !Version.TryParse(m.Version, out _)) throw new Exception("Ungültige Versionsangabe im Manifest (erwartet MAJOR.MINOR.PATCH)");
        if (!Regex.IsMatch(m.Sha256 ?? "", "^[0-9a-fA-F]{64}$")) throw new Exception("Manifest enthält keine gültige SHA-256-Prüfsumme");
        if (m.Size is not > 0) throw new Exception("Manifest enthält keine Dateigröße");
        if (!Uri.TryCreate(new Uri(manifestUrl), m.Url, out var abs) || abs.Scheme != "https") throw new Exception("Download-Adresse muss https sein");
        m.Url = abs.ToString();
        m.Source = abs.Host;
        m.Signed = UpdateSignature.Verify(m.Version!, m.Sha256!, m.Size.Value, m.Signature, PublicKeyPem);
        if (!m.Signed && (Official || !string.IsNullOrWhiteSpace(m.Signature)))
            throw new Exception(string.IsNullOrWhiteSpace(m.Signature) ? "Update ist nicht signiert – aus Sicherheitsgründen abgelehnt." : "Signatur des Updates ist ungültig – Update wurde abgelehnt.");
    }

    public async Task<object> Download()
    {
        var m = _available ?? throw new RpcException("no-update", "Kein Update verfügbar. Bitte zuerst prüfen.");
        var target = Path.Combine(_paths.UpdatesDir, $"PCGameLauncherCompanion-{m.Version}.exe");
        _state = "downloading";
        _hub.Changed("updates");
        try
        {
            using var resp = await _http.GetAsync(m.Url, HttpCompletionOption.ResponseHeadersRead);
            resp.EnsureSuccessStatusCode();
            var total = resp.Content.Headers.ContentLength ?? m.Size;
            if (total > m.Size) throw new Exception("Datei ist größer als angekündigt.");
            await using var input = await resp.Content.ReadAsStreamAsync();
            await using (var output = File.Create(target + ".part"))
            {
                var buf = new byte[1 << 16];
                long done = 0; int n; var lastReport = DateTime.MinValue;
                while ((n = await input.ReadAsync(buf)) > 0)
                {
                    done += n;
                    if (done > m.Size) throw new Exception("Datei ist größer als angekündigt.");
                    await output.WriteAsync(buf.AsMemory(0, n));
                    if (DateTime.UtcNow - lastReport > TimeSpan.FromMilliseconds(400))
                    {
                        lastReport = DateTime.UtcNow;
                        _hub.Broadcast("update.progress", new { done, total });
                    }
                }
            }
            if (VerifyFile(target + ".part", m) is { } bad) { File.Delete(target + ".part"); throw new Exception(bad); }
            File.Move(target + ".part", target, true);
            _downloaded = target;
            _state = "ready";
            _error = null;
        }
        catch (Exception ex)
        {
            try { File.Delete(target + ".part"); } catch { }
            _state = "error"; _error = "Download fehlgeschlagen: " + ex.Message; Failed?.Invoke(_error);
        }
        _hub.Changed("updates");
        return Status();
    }

    static string? VerifyFile(string path, Manifest m)
    {
        var info = new FileInfo(path);
        if (!info.Exists) return "Datei fehlt.";
        if (info.Length != m.Size) return $"Unvollständiger Download ({info.Length} statt {m.Size} Bytes) – Datei wurde verworfen.";
        using var f = File.OpenRead(path);
        var hash = Convert.ToHexString(SHA256.HashData(f)).ToLowerInvariant();
        if (hash != m.Sha256.ToLowerInvariant()) return "Prüfsumme stimmt nicht – Datei wurde verworfen.";
        // Windows executables start with "MZ"; anything else is not a supported update file.
        f.Position = 0;
        if (f.ReadByte() != 'M' || f.ReadByte() != 'Z') return "Keine Windows-Programmdatei – Datei wurde verworfen.";
        return null;
    }

    /// <summary>Installs only after consent at the PC (local permission). Checks the file again right before replacing the program.</summary>
    public string? Install()
    {
        if (_downloaded == null || !File.Exists(_downloaded) || _available == null) return "Kein heruntergeladenes Update vorhanden.";
        if (VerifyFile(_downloaded, _available) is { } bad) { try { File.Delete(_downloaded); } catch { } _downloaded = null; return bad; }
        var point = CreateRestorePoint?.Invoke($"vor-update-{_available.Version}");
        Log.Info("updates", $"Installiere {_available.Version} (Wiederherstellungspunkt: {point ?? "keiner"})");
        var err = _installer.Install(_downloaded);
        if (err != null) { _state = "error"; _error = err + " Die bisherige Version bleibt unverändert nutzbar."; Failed?.Invoke(_error); _hub.Changed("updates"); }
        return err;
    }

    public string? Rollback() => _installer.CanRollback ? _installer.Rollback() : "Keine vorherige Version vorhanden.";
}

// ============================================================ Backup

public sealed class BackupService
{
    public const string Format = "pgl-backup";
    public const int Version = 1;
    const long MaxBackupBytes = 300L * 1024 * 1024;
    static readonly Regex SoundEntry = new(@"^sounds/snd_[0-9a-f]{12}\.(mp3|wav|flac|m4a|wma)$", RegexOptions.Compiled);
    static readonly string[] Parts = { "settings", "library", "quickactions", "profiles", "automations", "hotkeys", "sounds", "audio", "history", "uiprefs" };

    readonly AppPaths _paths;
    readonly CompanionServices _svc;
    readonly Dictionary<string, (string path, DateTime created)> _transfers = new();
    readonly object _lock = new();

    public BackupService(AppPaths paths, CompanionServices svc) { _paths = paths; _svc = svc; }

    public string CreateZip(bool includeSounds, string? targetPath = null)
    {
        var path = targetPath ?? Path.Combine(_paths.BackupsDir, $"backup-{DateTime.Now:yyyyMMdd-HHmmss}-{Ids.Token(4)}.zip");
        using var zip = ZipFile.Open(path, ZipArchiveMode.Create);
        void Put(string name, object value)
        {
            var e = zip.CreateEntry(name, CompressionLevel.Optimal);
            using var w = new StreamWriter(e.Open());
            w.Write(JsonSerializer.Serialize(value, Json.Pretty));
        }
        var settings = _svc.Settings.Get();
        settings.RelaySecretProtected = null; // secrets never leave the PC
        settings.SteamApiKeyProtected = null;
        settings.ObsPasswordProtected = null;
        Put("manifest.json", new { format = Format, version = Version, createdAt = DateTime.UtcNow, app = UpdateService.CurrentVersion, includesSounds = includeSounds, pc = settings.PcName });
        Put("settings.json", settings);
        Put("library.json", _svc.Library.Export());
        Put("quickactions.json", _svc.QuickActions.Export());
        Put("profiles.json", _svc.Profiles.Get());
        Put("automations.json", _svc.Automations.Export());
        Put("hotkeys.json", _svc.Hotkeys.Export());
        Put("sounds.json", _svc.Soundboard.Export());
        Put("audio.json", _svc.Audio.Export());
        Put("history.json", _svc.History.Export());
        Put("uiprefs.json", new Dictionary<string, string?> { ["local"] = _svc.Devices.GetUiPrefs("local") });
        if (includeSounds)
            foreach (var s in _svc.Soundboard.Export().Sounds)
            {
                var file = Path.Combine(_paths.SoundsDir, s.FileName);
                if (File.Exists(file) && SoundEntry.IsMatch("sounds/" + s.FileName)) zip.CreateEntryFromFile(file, "sounds/" + s.FileName, CompressionLevel.NoCompression);
            }
        return path;
    }

    // ---- chunked transfer over the message channel (works locally and via relay)

    public object ExportBegin(bool includeSounds)
    {
        var path = CreateZip(includeSounds);
        var id = Register(path);
        var bytes = File.ReadAllBytes(path);
        return new { exportId = id, size = bytes.Length, sha256 = Ids.Sha256Hex(bytes), fileName = Path.GetFileName(path) };
    }

    public object ExportChunk(string id, long offset)
    {
        var path = Lookup(id);
        using var fs = File.OpenRead(path);
        if (offset < 0 || offset > fs.Length) throw new RpcException("invalid-params", "Ungültiger Offset.");
        fs.Seek(offset, SeekOrigin.Begin);
        var buf = new byte[512 * 1024];
        var n = fs.Read(buf, 0, buf.Length);
        return new { data = Convert.ToBase64String(buf, 0, n), done = offset + n >= fs.Length };
    }

    // ------------------------------------------------------------ restore points (ZIPs in the backups folder)

    static string PointKind(string name) =>
        name.StartsWith("auto-") ? "Automatisch (wöchentlich)" : name.StartsWith("vor-update-") ? "Vor einem Update" :
        name.StartsWith("vor-wiederherstellung-") ? "Vor einer Wiederherstellung" : name.StartsWith("punkt-") ? "Manuell" : "Export";

    public object Points() => new
    {
        points = new DirectoryInfo(_paths.BackupsDir).EnumerateFiles("*.zip")
            .Where(f => !f.Name.StartsWith("upload-", StringComparison.Ordinal))
            .OrderByDescending(f => f.CreationTimeUtc)
            .Select(f => new { name = f.Name, kind = PointKind(f.Name), size = f.Length, createdAt = f.CreationTimeUtc }).Take(50).ToList(),
    };

    public object CreatePoint() => new { name = Path.GetFileName(CreateZip(includeSounds: false, Path.Combine(_paths.BackupsDir, $"punkt-{DateTime.Now:yyyyMMdd-HHmmss}.zip"))) };

    /// <summary>Opens a restore point for the normal check-and-restore flow (backup.validate / backup.restore).</summary>
    public string OpenPoint(string name)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(name, @"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}\.zip$") || name.StartsWith("upload-", StringComparison.Ordinal))
            throw new RpcException("invalid-params", "Ungültiger Name.");
        var path = Path.Combine(_paths.BackupsDir, name);
        if (!File.Exists(path)) throw new RpcException("not-found", "Wiederherstellungspunkt nicht gefunden.");
        return Register(path);
    }

    /// <summary>Once a week a small automatic restore point (without sound files); the newest 5 are kept.</summary>
    public void EnsureAutoPoint()
    {
        try
        {
            var autos = new DirectoryInfo(_paths.BackupsDir).EnumerateFiles("auto-*.zip").OrderByDescending(f => f.CreationTimeUtc).ToList();
            if (autos.Count == 0 || DateTime.UtcNow - autos[0].CreationTimeUtc > TimeSpan.FromDays(7))
            {
                CreateZip(includeSounds: false, Path.Combine(_paths.BackupsDir, $"auto-{DateTime.Now:yyyyMMdd-HHmmss}.zip"));
                autos = new DirectoryInfo(_paths.BackupsDir).EnumerateFiles("auto-*.zip").OrderByDescending(f => f.CreationTimeUtc).ToList();
            }
            foreach (var old in autos.Skip(5)) old.Delete();
        }
        catch (Exception ex) { Log.Warn("backup", "Automatischer Wiederherstellungspunkt fehlgeschlagen: " + ex.Message); }
    }

    public string UploadBegin(long size)
    {
        if (size <= 0 || size > MaxBackupBytes) throw new RpcException("too-large", "Backup ist zu groß.");
        var path = Path.Combine(_paths.BackupsDir, "upload-" + Ids.Token(8) + ".zip");
        File.WriteAllBytes(path, Array.Empty<byte>());
        return Register(path);
    }

    public void UploadChunk(string id, string base64)
    {
        var path = Lookup(id);
        byte[] data;
        try { data = Convert.FromBase64String(base64); } catch { throw new RpcException("invalid-params", "Ungültige Daten."); }
        if (new FileInfo(path).Length + data.Length > MaxBackupBytes) throw new RpcException("too-large", "Backup ist zu groß.");
        using var fs = new FileStream(path, FileMode.Append);
        fs.Write(data);
    }

    string Register(string path)
    {
        lock (_lock)
        {
            foreach (var old in _transfers.Where(t => DateTime.UtcNow - t.Value.created > TimeSpan.FromMinutes(15)).ToList())
            {
                _transfers.Remove(old.Key);
                if (Path.GetFileName(old.Value.path).StartsWith("upload-")) try { File.Delete(old.Value.path); } catch { }
            }
            var id = Ids.New("xfer");
            _transfers[id] = (path, DateTime.UtcNow);
            return id;
        }
    }

    string Lookup(string id)
    {
        lock (_lock) return _transfers.TryGetValue(id, out var t) ? t.path : throw new RpcException("not-found", "Übertragung abgelaufen. Bitte erneut starten.");
    }

    public sealed record Validated(Dictionary<string, object> Parts, Dictionary<string, byte[]> SoundFiles, JsonElement Manifest);

    /// <summary>Reads and fully validates a backup in memory. Nothing is written to the live configuration.</summary>
    public Validated Validate(string id) => ValidateFile(Lookup(id));

    public static Validated ValidateFile(string path)
    {
        ZipArchive zip;
        try { zip = ZipFile.OpenRead(path); }
        catch { throw new RpcException("invalid-backup", "Datei ist kein gültiges Backup (kein ZIP)."); }
        using (zip)
        {
            if (zip.Entries.Count > 5000) throw new RpcException("invalid-backup", "Backup enthält zu viele Dateien.");
            string ReadText(string name)
            {
                var e = zip.GetEntry(name) ?? throw new RpcException("invalid-backup", $"{name} fehlt im Backup.");
                if (e.Length > 50 * 1024 * 1024) throw new RpcException("invalid-backup", $"{name} ist zu groß.");
                using var r = new StreamReader(e.Open());
                return r.ReadToEnd();
            }
            JsonElement manifest;
            try { manifest = JsonDocument.Parse(ReadText("manifest.json")).RootElement.Clone(); }
            catch (JsonException) { throw new RpcException("invalid-backup", "manifest.json ist beschädigt."); }
            if (!manifest.TryGetProperty("format", out var f) || f.GetString() != Format) throw new RpcException("invalid-backup", "Keine PC-Game-Launcher-Sicherung.");
            if (!manifest.TryGetProperty("version", out var v) || v.GetInt32() > Version) throw new RpcException("invalid-backup", "Backup stammt aus einer neueren Version.");

            var parts = new Dictionary<string, object>();
            T Parse<T>(string name)
            {
                try { return JsonSerializer.Deserialize<T>(ReadText(name + ".json"), Json.Options) ?? throw new JsonException("leer"); }
                catch (JsonException ex) { throw new RpcException("invalid-backup", $"{name}.json ist beschädigt: {ex.Message}"); }
            }
            parts["settings"] = Parse<Settings>("settings");
            var lib = Parse<LibraryFile>("library");
            foreach (var i in lib.Items)
                if (LaunchValidator.ValidateTarget(i.Source, i.Target) is { } err) throw new RpcException("invalid-backup", $"Eintrag „{i.Name}“: {err}");
            parts["library"] = lib;
            parts["quickactions"] = Parse<QuickActionsFile>("quickactions");
            parts["profiles"] = Parse<ProfilesFile>("profiles");
            parts["automations"] = Parse<AutomationsFile>("automations");
            parts["hotkeys"] = Parse<HotkeysFile>("hotkeys");
            parts["sounds"] = Parse<SoundsFile>("sounds");
            parts["audio"] = Parse<AudioSettings>("audio");
            if (zip.GetEntry("history.json") != null) parts["history"] = Parse<HistoryFile>("history");
            if (zip.GetEntry("uiprefs.json") != null) parts["uiprefs"] = Parse<Dictionary<string, string?>>("uiprefs");

            var files = new Dictionary<string, byte[]>();
            foreach (var e in zip.Entries.Where(e => e.FullName.StartsWith("sounds/") && e.Length > 0))
            {
                if (!SoundEntry.IsMatch(e.FullName)) throw new RpcException("invalid-backup", $"Unerwartete Datei im Backup: {e.FullName}");
                if (e.Length > AudioFileValidator.MaxBytes) throw new RpcException("invalid-backup", $"{e.FullName} ist zu groß.");
                using var ms = new MemoryStream();
                using (var s = e.Open()) s.CopyTo(ms);
                var bytes = ms.ToArray();
                if (AudioFileValidator.Problem(AudioFileValidator.Detect(bytes)) != null) throw new RpcException("invalid-backup", $"{e.FullName} ist keine gültige Audiodatei.");
                files[e.Name] = bytes;
            }
            return new Validated(parts, files, manifest);
        }
    }

    public static object Summary(Validated v)
    {
        var lib = (LibraryFile)v.Parts["library"];
        return new
        {
            manifest = v.Manifest,
            parts = v.Parts.Keys,
            games = lib.Items.Count(i => i.Kind == ItemKind.Game),
            programs = lib.Items.Count(i => i.Kind == ItemKind.Program),
            profiles = ((ProfilesFile)v.Parts["profiles"]).Profiles.Count,
            sounds = ((SoundsFile)v.Parts["sounds"]).Sounds.Count,
            soundFiles = v.SoundFiles.Count,
            automations = ((AutomationsFile)v.Parts["automations"]).Rules.Count,
            hotkeys = ((HotkeysFile)v.Parts["hotkeys"]).Hotkeys.Count,
        };
    }

    /// <summary>Restores the selected parts. A safety backup of the current state is written first.</summary>
    /// <param name="fromThisPc">Programs can only be released at the PC itself (library.addPath is local), so a library from a
    /// backup file is only restored there – otherwise a remote admin could release any program via a crafted backup.</param>
    public object Restore(string id, IReadOnlyCollection<string> selected, bool fromThisPc = true)
    {
        var v = Validate(id);
        if (!fromThisPc && selected.Contains("library") && v.Parts.ContainsKey("library"))
            throw new RpcException("local-only", "Die Spiele-/Programmliste kann nur direkt am PC wiederhergestellt werden (Programme werden nur dort freigegeben). Wähle „Bibliothek“ ab oder stelle am PC wieder her.");
        if (v.Parts.TryGetValue("library", out var libPart))
            foreach (var i in ((LibraryFile)libPart).Items.Where(i => i.Source == LaunchSource.Exe))
                if (_svc.Platform.Launcher.ValidateExecutable(i.Target) is { } bad) throw new RpcException("invalid-backup", $"Eintrag „{i.Name}“: {bad}");
        var safety = CreateZip(includeSounds: false, Path.Combine(_paths.BackupsDir, $"vor-wiederherstellung-{DateTime.Now:yyyyMMdd-HHmmss}.zip"));
        var restored = new List<string>();
        foreach (var part in Parts.Where(p => selected.Contains(p) && v.Parts.ContainsKey(p)))
        {
            switch (part)
            {
                case "settings": _svc.Settings.Import((Settings)v.Parts[part], _svc.Settings.Get()); break;
                case "library": _svc.Library.Import((LibraryFile)v.Parts[part]); break;
                case "quickactions": _svc.QuickActions.Import((QuickActionsFile)v.Parts[part]); break;
                case "profiles": _svc.Profiles.Import((ProfilesFile)v.Parts[part]); break;
                case "automations": _svc.Automations.Import((AutomationsFile)v.Parts[part]); break;
                case "hotkeys": _svc.Hotkeys.Import((HotkeysFile)v.Parts[part]); break;
                case "audio": _svc.Audio.Import((AudioSettings)v.Parts[part]); break;
                case "uiprefs":
                    if (((Dictionary<string, string?>)v.Parts[part]).TryGetValue("local", out var p) && p != null) _svc.Devices.SaveUiPrefs("local", p);
                    break;
                case "sounds":
                    var sf = (SoundsFile)v.Parts[part];
                    foreach (var (name, bytes) in v.SoundFiles) File.WriteAllBytes(Path.Combine(_paths.SoundsDir, name), bytes);
                    sf.Sounds = sf.Sounds.Where(s => File.Exists(Path.Combine(_paths.SoundsDir, s.FileName))).ToList();
                    _svc.Soundboard.Import(sf);
                    break;
                case "history": _svc.History.Import((HistoryFile)v.Parts[part]); break;
            }
            restored.Add(part);
        }
        Log.Info("backup", $"Wiederhergestellt: {string.Join(", ", restored)} (Sicherung vorher: {Path.GetFileName(safety)})");
        return new { restored, safetyBackup = Path.GetFileName(safety) };
    }
}
