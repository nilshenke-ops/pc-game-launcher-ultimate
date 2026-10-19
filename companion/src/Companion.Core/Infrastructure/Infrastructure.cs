using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Pgl.Core.Infrastructure;

/// <summary>Locations of all persisted data. Configuration, libraries and sessions are kept in separate files.</summary>
public sealed class AppPaths
{
    public string DataDir { get; }
    public string SoundsDir => Path.Combine(DataDir, "sounds");
    public string UpdatesDir => Path.Combine(DataDir, "updates");
    public string LogsDir => Path.Combine(DataDir, "logs");
    public string BackupsDir => Path.Combine(DataDir, "backups");
    public string File(string name) => Path.Combine(DataDir, name);

    public AppPaths(string? overrideDir = null)
    {
        var dir = overrideDir ?? Environment.GetEnvironmentVariable("PGL_DATA_DIR");
        if (string.IsNullOrWhiteSpace(dir))
        {
            dir = OperatingSystem.IsWindows()
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PCGameLauncherUltimate")
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "pc-game-launcher-ultimate");
        }
        DataDir = Path.GetFullPath(dir);
        foreach (var d in new[] { DataDir, SoundsDir, UpdatesDir, LogsDir, BackupsDir }) Directory.CreateDirectory(d);
    }
}

public static class Json
{
    public static readonly JsonSerializerOptions Options = Create(false);
    public static readonly JsonSerializerOptions Pretty = Create(true);

    static JsonSerializerOptions Create(bool indented)
    {
        var o = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = indented,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            MaxDepth = 32,
        };
        o.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        return o;
    }

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static T? Deserialize<T>(string s) => JsonSerializer.Deserialize<T>(s, Options);
}

/// <summary>A JSON file with atomic writes (write temp file, then replace) and a thread-safe in-memory copy.</summary>
public sealed class JsonStore<T> where T : class, new()
{
    readonly string _path;
    readonly object _lock = new();
    T _value;

    public JsonStore(string path)
    {
        _path = path;
        _value = Load();
    }

    T Load()
    {
        try
        {
            if (!System.IO.File.Exists(_path)) return new T();
            var text = System.IO.File.ReadAllText(_path);
            return JsonSerializer.Deserialize<T>(text, Json.Options) ?? new T();
        }
        catch (Exception ex)
        {
            // A corrupt file must never take the companion down. Keep a copy for diagnosis and start fresh.
            try { System.IO.File.Copy(_path, _path + ".corrupt-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss"), true); } catch { }
            Log.Warn("store", $"Datei {Path.GetFileName(_path)} war beschädigt und wurde zurückgesetzt: {ex.Message}");
            return new T();
        }
    }

    /// <summary>Returns a deep copy so callers can never mutate state without going through <see cref="Update"/>.</summary>
    public T Snapshot()
    {
        lock (_lock) return JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(_value, Json.Options), Json.Options)!;
    }

    public TOut Get<TOut>(Func<T, TOut> selector)
    {
        lock (_lock) return selector(_value);
    }

    public TOut Update<TOut>(Func<T, TOut> mutate)
    {
        lock (_lock)
        {
            var result = mutate(_value);
            Save();
            return result;
        }
    }

    public void Update(Action<T> mutate) => Update<object?>(v => { mutate(v); return null; });

    /// <summary>Like <see cref="Update"/>, but writes the file only when the callback reports a change (for reads that rarely book something).</summary>
    public TOut UpdateIfChanged<TOut>(Func<T, (TOut result, bool changed)> mutate)
    {
        lock (_lock)
        {
            var (result, changed) = mutate(_value);
            if (changed) Save();
            return result;
        }
    }

    public void Replace(T value)
    {
        lock (_lock) { _value = value; Save(); }
    }

    void Save()
    {
        var tmp = _path + ".tmp";
        System.IO.File.WriteAllText(tmp, JsonSerializer.Serialize(_value, Json.Pretty));
        System.IO.File.Move(tmp, _path, true);
    }
}

public static class Ids
{
    public static string New(string prefix) => prefix + "_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(6)).ToLowerInvariant();
    public static string Token(int bytes = 32) => Base64Url(RandomNumberGenerator.GetBytes(bytes));
    public static string Base64Url(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public static string Sha256Hex(byte[] data) => Convert.ToHexString(SHA256.HashData(data)).ToLowerInvariant();
    public static string Sha256Hex(string s) => Sha256Hex(Encoding.UTF8.GetBytes(s));
}

public enum LogLevel { Debug, Info, Warn, Error }

public sealed record LogEntry(DateTime Time, LogLevel Level, string Area, string Message);

/// <summary>Structured, in-memory ring buffer plus daily file. Never log tokens or codes.</summary>
public static class Log
{
    static readonly ConcurrentQueue<LogEntry> Ring = new();
    static string? _dir;
    static readonly object FileLock = new();
    public static event Action<LogEntry>? Written;

    public static void Init(string dir) => _dir = dir;

    public static void Debug(string area, string msg) => Write(LogLevel.Debug, area, msg);
    public static void Info(string area, string msg) => Write(LogLevel.Info, area, msg);
    public static void Warn(string area, string msg) => Write(LogLevel.Warn, area, msg);
    public static void Error(string area, string msg) => Write(LogLevel.Error, area, msg);

    static void Write(LogLevel level, string area, string msg)
    {
        var e = new LogEntry(DateTime.UtcNow, level, area, msg);
        Ring.Enqueue(e);
        while (Ring.Count > 500 && Ring.TryDequeue(out _)) { }
        if (level >= LogLevel.Info && _dir != null)
        {
            try
            {
                lock (FileLock)
                {
                    var file = Path.Combine(_dir, $"companion-{DateTime.UtcNow:yyyy-MM-dd}.log");
                    System.IO.File.AppendAllText(file, JsonSerializer.Serialize(new { t = e.Time, l = level.ToString(), a = area, m = msg }) + "\n");
                }
            }
            catch { }
        }
        if (level >= LogLevel.Info) Console.WriteLine($"[{e.Time:HH:mm:ss}] {level,-5} {area}: {msg}");
        Written?.Invoke(e);
    }

    public static IReadOnlyList<LogEntry> Recent(int max = 300) => Ring.Reverse().Take(max).ToList();

    public static void CleanupOldFiles(int keepDays = 7)
    {
        if (_dir == null) return;
        foreach (var f in Directory.GetFiles(_dir, "companion-*.log"))
            if (System.IO.File.GetLastWriteTimeUtc(f) < DateTime.UtcNow.AddDays(-keepDays)) try { System.IO.File.Delete(f); } catch { }
    }
}

/// <summary>Sliding-window rate limiter keyed by an arbitrary string (IP, device, code).</summary>
public sealed class RateLimiter
{
    readonly int _max;
    readonly TimeSpan _window;
    readonly Func<DateTime> _now;
    readonly ConcurrentDictionary<string, Queue<DateTime>> _hits = new();

    public RateLimiter(int max, TimeSpan window, Func<DateTime>? now = null)
    {
        _max = max; _window = window; _now = now ?? (() => DateTime.UtcNow);
    }

    /// <summary>Records a hit and returns false if the limit for <paramref name="key"/> is exceeded.</summary>
    public bool TryHit(string key)
    {
        var q = _hits.GetOrAdd(key, _ => new Queue<DateTime>());
        lock (q)
        {
            var now = _now();
            while (q.Count > 0 && now - q.Peek() > _window) q.Dequeue();
            if (q.Count >= _max) return false;
            q.Enqueue(now);
            return true;
        }
    }

    public TimeSpan RetryAfter(string key)
    {
        if (!_hits.TryGetValue(key, out var q)) return TimeSpan.Zero;
        lock (q) return q.Count == 0 ? TimeSpan.Zero : _window - (_now() - q.Peek());
    }

    public void Reset(string key) => _hits.TryRemove(key, out _);
}

/// <summary>In-process publish/subscribe for domain events (game started, sound played, ...).</summary>
public sealed class EventBus
{
    readonly ConcurrentDictionary<string, List<Action<object?>>> _handlers = new();

    public void On(string name, Action<object?> handler)
    {
        var list = _handlers.GetOrAdd(name, _ => new());
        lock (list) list.Add(handler);
    }

    public void Emit(string name, object? payload = null)
    {
        if (!_handlers.TryGetValue(name, out var list)) return;
        Action<object?>[] copy;
        lock (list) copy = list.ToArray();
        foreach (var h in copy)
        {
            try { h(payload); }
            catch (Exception ex) { Log.Error("events", $"Handler für {name} fehlgeschlagen: {ex.Message}"); }
        }
    }
}
