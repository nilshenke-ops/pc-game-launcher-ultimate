using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Hosting;

/// <summary>Serves the web app files: embedded in the executable, or from a folder for development.</summary>
public sealed class WebAssets
{
    readonly Dictionary<string, (byte[] data, string etag)> _files = new(StringComparer.Ordinal);
    public string Source { get; }
    public bool Available => _files.ContainsKey("index.html");

    public WebAssets(string? diskDir = null)
    {
        diskDir ??= Environment.GetEnvironmentVariable("PGL_WEB_DIR");
        if (!string.IsNullOrEmpty(diskDir) && File.Exists(Path.Combine(diskDir, "index.html")))
        {
            foreach (var f in Directory.EnumerateFiles(diskDir, "*", SearchOption.AllDirectories))
                Add(Path.GetRelativePath(diskDir, f).Replace('\\', '/'), File.ReadAllBytes(f));
            Source = "Ordner " + diskDir;
            return;
        }
        var asm = typeof(WebAssets).Assembly;
        foreach (var name in asm.GetManifestResourceNames().Where(n => n.StartsWith("webapp/")))
        {
            using var s = asm.GetManifestResourceStream(name)!;
            using var ms = new MemoryStream();
            s.CopyTo(ms);
            Add(name["webapp/".Length..].Replace('\\', '/'), ms.ToArray());
        }
        Source = Available ? "eingebettet" : "nicht vorhanden (Web-App nicht gebaut)";
    }

    void Add(string path, byte[] data) => _files[path] = (data, "\"" + Ids.Sha256Hex(data)[..16] + "\"");

    public bool TryGet(string path, out byte[] data, out string etag)
    {
        if (_files.TryGetValue(path, out var f)) { data = f.data; etag = f.etag; return true; }
        data = Array.Empty<byte>(); etag = "";
        return false;
    }

    public static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".json" or ".webmanifest" => "application/manifest+json; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".png" => "image/png",
        ".ico" => "image/x-icon",
        ".woff2" => "font/woff2",
        ".txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
}

/// <summary>Direct WebSocket connection to a browser.</summary>
sealed class WebSocketChannel(WebSocket ws, string ip, bool loopback) : IClientChannel
{
    readonly SemaphoreSlim _send = new(1, 1);
    public string Id { get; } = Ids.New("ch");
    public string RemoteIp { get; } = ip;
    public bool IsLoopback { get; } = loopback;
    public string Transport => "local";

    public async Task SendAsync(string text)
    {
        if (ws.State != WebSocketState.Open) return;
        if (!await _send.WaitAsync(TimeSpan.FromSeconds(10))) { ws.Abort(); return; }
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            await ws.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, cts.Token);
        }
        catch { ws.Abort(); }
        finally { _send.Release(); }
    }

    public async Task CloseAsync(string reason)
    {
        try { await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, reason, CancellationToken.None); } catch { ws.Abort(); }
    }
}

sealed class NoopHostLifetime : Microsoft.Extensions.Hosting.IHostLifetime
{
    public Task WaitForStartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

public sealed class WebHost : IAsyncDisposable
{
    readonly CompanionServices _svc;
    readonly WebAssets _assets;
    WebApplication? _app;
    readonly RateLimiter _connectLimiter = new(60, TimeSpan.FromMinutes(1));
    readonly ConcurrentDictionary<string, int> _perIp = new();
    (string path, long size, string sha)? _selfExe;

    public int Port { get; private set; }
    public bool LanAccess { get; private set; }
    public string? StartError { get; private set; }
    public WebAssets Assets => _assets;

    public WebHost(CompanionServices svc, WebAssets? assets = null)
    {
        _svc = svc;
        _assets = assets ?? new WebAssets();
    }

    public async Task StartAsync()
    {
        var s = _svc.Settings.Get();
        Port = s.Port;
        LanAccess = s.LanAccess;
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { Args = Array.Empty<string>() });
        builder.Logging.ClearProviders();
        // The companion owns process shutdown (tray "Beenden", SIGTERM in the headless host); Kestrel must not.
        builder.Services.AddSingleton<Microsoft.Extensions.Hosting.IHostLifetime, NoopHostLifetime>();
        builder.WebHost.ConfigureKestrel(k =>
        {
            k.Limits.MaxRequestBodySize = 64 * 1024;
            k.Limits.MaxConcurrentConnections = 200;
            k.AddServerHeader = false;
            if (LanAccess) k.Listen(IPAddress.Any, Port);
            else { k.Listen(IPAddress.Loopback, Port); }
        });
        var app = builder.Build();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(20) });
        app.Use(async (ctx, next) =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["Referrer-Policy"] = "no-referrer";
            h["X-Frame-Options"] = "DENY";
            h["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; media-src 'self' blob: data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
            await next();
        });

        app.MapGet("/healthz", () => Results.Json(new { ok = true, app = "PC Game Launcher Ultimate", version = UpdateService.CurrentVersion, role = "companion" }));
        app.MapGet("/download/info", DownloadInfo);
        app.MapGet("/download/{file}", Download);
        app.Map("/ws", HandleWebSocket);
        app.MapFallback("{**path}", ServeStatic); // the default fallback skips paths with file extensions

        try
        {
            await app.StartAsync();
            _app = app;
            Log.Info("web", $"Web-App läuft auf Port {Port} ({(LanAccess ? "im WLAN erreichbar" : "nur dieser PC")}), Quelle: {_assets.Source}");
        }
        catch (Exception ex)
        {
            StartError = ex is IOException || ex.InnerException is System.Net.Sockets.SocketException
                ? $"Port {Port} ist bereits belegt (läuft der Companion schon?). Anderen Port in den Einstellungen wählen."
                : ex.Message;
            Log.Error("web", "Webserver konnte nicht starten: " + StartError);
            await app.DisposeAsync();
        }
    }

    public IReadOnlyList<string> LanUrls() =>
        LanAccess ? NetworkDiagnostics.LocalIPv4().Select(ip => $"http://{ip}:{Port}").ToList() : new List<string> { $"http://127.0.0.1:{Port}" };

    static bool IsForwarded(HttpRequest r) =>
        r.Headers.ContainsKey("X-Forwarded-For") || r.Headers.ContainsKey("CF-Connecting-IP") || r.Headers.ContainsKey("Forwarded") || r.Headers.ContainsKey("X-Real-IP");

    async Task HandleWebSocket(HttpContext ctx)
    {
        if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
        var remote = ctx.Connection.RemoteIpAddress ?? IPAddress.None;
        if (remote.IsIPv4MappedToIPv6) remote = remote.MapToIPv4();
        var forwarded = IsForwarded(ctx.Request);
        var ip = forwarded ? (ctx.Request.Headers["CF-Connecting-IP"].FirstOrDefault() ?? ctx.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',')[0].Trim() ?? remote.ToString()) : remote.ToString();
        var loopback = IPAddress.IsLoopback(remote) && !forwarded;

        if (!OriginAllowed(ctx.Request)) { ctx.Response.StatusCode = 403; Log.Warn("web", $"WebSocket von fremder Herkunft abgelehnt: {ctx.Request.Headers.Origin}"); return; }
        if (!_connectLimiter.TryHit(ip)) { ctx.Response.StatusCode = 429; return; }
        if (_perIp.AddOrUpdate(ip, 1, (_, n) => n + 1) > 20) { _perIp.AddOrUpdate(ip, 0, (_, n) => n - 1); ctx.Response.StatusCode = 429; return; }

        try
        {
            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
            var channel = new WebSocketChannel(ws, ip, loopback);
            _svc.Rpc.OnConnected(channel);
            try
            {
                var buffer = new byte[64 * 1024];
                using var ms = new MemoryStream();
                while (ws.State == WebSocketState.Open)
                {
                    var r = await ws.ReceiveAsync(buffer, ctx.RequestAborted);
                    if (r.MessageType == WebSocketMessageType.Close) break;
                    ms.Write(buffer, 0, r.Count);
                    if (ms.Length > RpcServer.MaxMessageBytes) { await ws.CloseAsync(WebSocketCloseStatus.MessageTooBig, "too big", CancellationToken.None); break; }
                    if (!r.EndOfMessage) continue;
                    var text = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                    ms.SetLength(0);
                    _ = _svc.Rpc.OnMessageAsync(channel, text);
                }
            }
            catch (OperationCanceledException) { }
            catch (WebSocketException) { }
            finally { _svc.Rpc.OnClosed(channel); }
        }
        finally { _perIp.AddOrUpdate(ip, 0, (_, n) => Math.Max(0, n - 1)); }
    }

    /// <summary>Blocks cross-site WebSocket hijacking: browsers must come from this server's own page, the public URL or the hosted web app.</summary>
    bool OriginAllowed(HttpRequest req)
    {
        var origin = req.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrEmpty(origin)) return true; // non-browser client; still needs a token
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var o)) return false;
        if (string.Equals(o.Authority, req.Host.Value, StringComparison.OrdinalIgnoreCase)) return true;
        var set = _svc.Settings.Get();
        foreach (var allowed in new[] { set.PublicUrl, set.WebAppUrl })
            if (allowed != null && Uri.TryCreate(allowed, UriKind.Absolute, out var a) && string.Equals(a.Scheme, o.Scheme, StringComparison.OrdinalIgnoreCase) && string.Equals(a.Authority, o.Authority, StringComparison.OrdinalIgnoreCase)) return true;
        // Vite dev server during development.
        return Environment.GetEnvironmentVariable("PGL_DEV") == "1" && o.Host is "localhost" or "127.0.0.1";
    }

    (string path, long size, string sha)? SelfExe()
    {
        if (_selfExe != null) return _selfExe;
        var path = Environment.ProcessPath;
        if (path == null || !path.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(path).Equals("dotnet.exe", StringComparison.OrdinalIgnoreCase)) return null;
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var sha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(fs)).ToLowerInvariant();
        _selfExe = (path, fs.Length, sha);
        return _selfExe;
    }

    IResult DownloadInfo()
    {
        var exe = SelfExe();
        if (exe == null)
            return Results.Json(new { available = false, reason = "not-built", message = "Dieser Server ist kein gebauter Windows-Companion (Entwicklungsmodus). Die EXE entsteht mit scripts/publish-companion." });
        return Results.Json(new { available = true, fileName = "PCGameLauncherCompanion.exe", size = exe.Value.size, sha256 = exe.Value.sha, version = UpdateService.CurrentVersion, url = "/download/PCGameLauncherCompanion.exe" });
    }

    IResult Download(string file)
    {
        if (file != "PCGameLauncherCompanion.exe") return Results.NotFound();
        var exe = SelfExe();
        if (exe == null) return Results.NotFound();
        var stream = new FileStream(exe.Value.path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        return Results.File(stream, "application/vnd.microsoft.portable-executable", "PCGameLauncherCompanion.exe", enableRangeProcessing: true);
    }

    async Task ServeStatic(HttpContext ctx)
    {
        var path = ctx.Request.Path.Value?.TrimStart('/') ?? "";
        if (path == "") path = "index.html";
        if (path.Contains("..")) { ctx.Response.StatusCode = 400; return; }
        if (!_assets.TryGet(path, out var data, out var etag))
        {
            if (Path.HasExtension(path) || !_assets.TryGet("index.html", out data, out etag))
            {
                ctx.Response.StatusCode = 404;
                ctx.Response.ContentType = "text/html; charset=utf-8";
                await ctx.Response.WriteAsync(_assets.Available ? "Nicht gefunden" :
                    "<h1>Web-App nicht gebaut</h1><p>Bitte <code>npm run build</code> im Ordner web ausführen und den Companion neu bauen.</p>");
                return;
            }
            path = "index.html";
        }
        ctx.Response.Headers.ETag = etag;
        ctx.Response.Headers.CacheControl = path.StartsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache";
        if (ctx.Request.Headers.IfNoneMatch == etag) { ctx.Response.StatusCode = 304; return; }
        ctx.Response.ContentType = WebAssets.ContentType(path);
        ctx.Response.ContentLength = data.Length;
        await ctx.Response.Body.WriteAsync(data);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app != null) { await _app.StopAsync(); await _app.DisposeAsync(); }
    }
}
