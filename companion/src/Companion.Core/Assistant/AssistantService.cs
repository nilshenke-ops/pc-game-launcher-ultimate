using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Assistant;

public sealed class AssistantUsageMonth
{
    public string Month { get; set; } = "";
    public int Requests { get; set; }
    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long CacheWriteTokens { get; set; }
    public double CostUsd { get; set; }
}

public sealed class AssistantFile
{
    /// <summary>local = only the built-in assistant; claude = Claude answers (needs a key).</summary>
    public string Mode { get; set; } = "local";
    public string Model { get; set; } = ClaudeAssistant.DefaultModel;
    /// <summary>Recognised commands ("Starte …") are answered locally even in Claude mode – instant and free.</summary>
    public bool LocalFirst { get; set; } = true;
    public double MonthlyLimitUsd { get; set; } = 5;
    /// <summary>Anthropic API key, protected with DPAPI on Windows. Never returned, never in a backup.</summary>
    public string? KeyProtected { get; set; }
    public List<AssistantUsageMonth> Usage { get; set; } = new();
}

/// <summary>Entry point for the assistant: chooses local or Claude, keeps conversations, counts cost against the monthly limit.</summary>
public sealed class AssistantService
{
    readonly JsonStore<AssistantFile> _store;
    readonly ISecretProtector _secrets;
    readonly IHub _hub;
    readonly Func<DateTime> _now;
    public AssistantData Data { get; }
    public LocalAssistant Local { get; }
    public ClaudeAssistant Claude { get; }

    sealed class Conv { public required string Owner; public ClaudeAssistant.Conversation Claude = new(); public DateTime LastUsed; public int Turns; public readonly SemaphoreSlim Lock = new(1, 1); }
    readonly ConcurrentDictionary<string, Conv> _convs = new();
    const int MaxTurns = 30;

    public AssistantService(AppPaths paths, ISecretProtector secrets, IHub hub, AssistantData data, ClaudeAssistant? claude = null, Func<DateTime>? now = null)
    {
        _store = new JsonStore<AssistantFile>(paths.File("assistant.json"));
        _secrets = secrets; _hub = hub; Data = data; _now = now ?? (() => DateTime.UtcNow);
        Local = new LocalAssistant(data);
        Claude = claude ?? new ClaudeAssistant(data);
    }

    string MonthKey => _now().ToString("yyyy-MM");

    public object Status()
    {
        var f = _store.Snapshot();
        var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey) ?? new AssistantUsageMonth { Month = MonthKey };
        return new
        {
            mode = f.Mode, model = f.Model, localFirst = f.LocalFirst, monthlyLimitUsd = f.MonthlyLimitUsd, keySet = f.KeyProtected != null,
            claudeReady = f.Mode == "claude" && f.KeyProtected != null,
            models = ClaudeAssistant.Models.Select(m => new { m.Id, m.Label, m.Input, m.Output, m.CacheRead, m.Note }),
            usage = month, history = f.Usage.OrderByDescending(u => u.Month).Take(6),
            examples = LocalAssistant.Examples,
            knowledgeSections = Data.Knowledge.Sections.Count,
        };
    }

    public sealed class Config { public string? Mode { get; set; } public string? Model { get; set; } public bool? LocalFirst { get; set; } public double? MonthlyLimitUsd { get; set; } public string? ApiKey { get; set; } }

    /// <param name="atPc">The key may only be set or removed at the PC itself (it costs money and leaves the home network).</param>
    public object Configure(Config c, bool atPc)
    {
        if (c.ApiKey != null && !atPc) throw new RpcException("forbidden", "Den API-Schlüssel kannst du nur direkt am PC eintragen oder löschen.");
        if (c.Mode is not (null or "local" or "claude")) throw new RpcException("invalid-params", "Modus muss „local“ oder „claude“ sein.");
        if (c.Model != null && ClaudeAssistant.Models.All(m => m.Id != c.Model)) throw new RpcException("invalid-params", "Unbekanntes Modell.");
        if (c.MonthlyLimitUsd is < 0 or > 500) throw new RpcException("invalid-params", "Monatslimit zwischen 0 und 500 $.");
        var key = c.ApiKey?.Trim();
        if (!string.IsNullOrEmpty(key) && (key.Length is < 20 or > 300 || key.Any(char.IsWhiteSpace) || !key.StartsWith("sk-ant-")))
            throw new RpcException("invalid-params", "Das sieht nicht wie ein Anthropic-API-Schlüssel aus (beginnt mit „sk-ant-“).");
        _store.Update(f =>
        {
            if (c.Mode != null)
            {
                if (c.Mode == "claude" && f.KeyProtected == null && string.IsNullOrEmpty(key)) throw new RpcException("assistant-key", "Für Claude zuerst am PC einen API-Schlüssel eintragen.");
                f.Mode = c.Mode;
            }
            if (c.Model != null) f.Model = c.Model;
            if (c.LocalFirst != null) f.LocalFirst = c.LocalFirst.Value;
            if (c.MonthlyLimitUsd != null) f.MonthlyLimitUsd = Math.Round(c.MonthlyLimitUsd.Value, 2);
            if (key != null)
            {
                f.KeyProtected = key.Length == 0 ? null : _secrets.Protect(key);
                if (key.Length == 0) f.Mode = "local";
            }
        });
        if (key != null) Log.Info("assistant", key.Length == 0 ? "Claude-Schlüssel entfernt." : "Claude-Schlüssel gespeichert (geschützt)."); // never the key itself
        _hub.Changed("assistant");
        return Status();
    }

    public void Reset(string owner, string? conversationId)
    {
        if (conversationId != null && _convs.TryGetValue(conversationId, out var c) && c.Owner == owner) _convs.TryRemove(conversationId, out _);
    }

    void Cleanup()
    {
        foreach (var kv in _convs.Where(kv => _now() - kv.Value.LastUsed > TimeSpan.FromHours(3)).ToList()) _convs.TryRemove(kv.Key, out _);
        while (_convs.Count > 50) { var oldest = _convs.OrderBy(kv => kv.Value.LastUsed).First(); _convs.TryRemove(oldest.Key, out _); }
    }

    /// <param name="owner">Device (or "local") – a conversation belongs to the device that started it.</param>
    public async Task<object> AskAsync(string owner, string who, string? conversationId, string text, CancellationToken ct = default)
    {
        text = text.Trim();
        if (text.Length is 0 or > 2000) throw new RpcException("invalid-params", "Frage mit 1–2000 Zeichen.");
        Cleanup();
        var note = (string?)null;
        if (conversationId == null || !_convs.TryGetValue(conversationId, out var conv) || conv.Owner != owner)
        {
            conversationId = Ids.New("conv");
            conv = new Conv { Owner = owner };
            _convs[conversationId] = conv;
        }
        else if (conv.Turns >= MaxTurns)
        {
            conversationId = Ids.New("conv");
            conv = new Conv { Owner = owner };
            _convs[conversationId] = conv;
            note = "Das Gespräch war sehr lang – ich habe ein neues begonnen (das spart Kosten).";
        }
        await conv.Lock.WaitAsync(ct);
        try
        {
            conv.LastUsed = _now(); conv.Turns++;
            var f = _store.Snapshot();
            AssistantReply reply;
            var useClaude = f.Mode == "claude" && f.KeyProtected != null;
            // Short single requests only – "Wie geht es meinem PC und …" needs Claude to answer every part.
            var simple = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length <= 8 && !Regex.IsMatch(" " + text.ToLowerInvariant() + " ", @" (und|and|dann|then|aber|but|oder|or) ");
            if (useClaude && f.LocalFirst && simple)
            {
                var local = await Local.AnswerAsync(text);
                // Only commands and live-data answers count; help-text guesses go to Claude, which explains better.
                if (local.Confident && (local.Actions.Any(a => a.Kind != "navigate") || local.Sources.Any(s => !s.Contains(':'))))
                {
                    local.Sources.Add("lokal beantwortet (kostenlos)");
                    return Done(conversationId, local, note);
                }
            }
            if (!useClaude)
            {
                reply = await Local.AnswerAsync(text);
                return Done(conversationId, reply, note);
            }
            var month = f.Usage.FirstOrDefault(u => u.Month == MonthKey);
            if (f.MonthlyLimitUsd <= 0 || (month?.CostUsd ?? 0) >= f.MonthlyLimitUsd)
            {
                reply = await Local.AnswerAsync(text);
                reply.Text = $"Das Monatslimit für Claude ({f.MonthlyLimitUsd:0.00} $) ist erreicht – ich antworte lokal. (Limit änderbar unter Assistent → Einstellungen.)\n\n" + reply.Text;
                return Done(conversationId, reply, note);
            }
            var key = _secrets.Unprotect(f.KeyProtected!) ?? throw new RpcException("assistant-key", "Der gespeicherte Schlüssel lässt sich nicht entschlüsseln (anderer Windows-Benutzer?). Bitte am PC neu eintragen.");
            var context = $"[Kontext – nicht vom Nutzer: Zeit {TimeZoneInfo.ConvertTimeFromUtc(_now(), TimeZoneInfo.Local):dddd, dd.MM.yyyy HH:mm}, Gerät: {who}]";
            var result = await Claude.AskAsync(key, f.Model, conv.Claude, text, context, ct);
            var cost = ClaudeAssistant.Cost(result.ServedBy, result.Input, result.Output, result.CacheRead, result.CacheWrite);
            _store.Update(file =>
            {
                var m = file.Usage.FirstOrDefault(u => u.Month == MonthKey);
                if (m == null) { m = new AssistantUsageMonth { Month = MonthKey }; file.Usage.Add(m); }
                m.Requests++; m.InputTokens += result.Input; m.OutputTokens += result.Output; m.CacheReadTokens += result.CacheRead; m.CacheWriteTokens += result.CacheWrite;
                m.CostUsd = Math.Round(m.CostUsd + cost, 4);
                if (file.Usage.Count > 24) file.Usage.RemoveAt(0);
            });
            _hub.Changed("assistant");
            result.Reply.CostUsd = Math.Round(cost, 4);
            return Done(conversationId, result.Reply, note);
        }
        finally { conv.Lock.Release(); }
    }

    static object Done(string conversationId, AssistantReply reply, string? note)
    {
        if (note != null) reply.Text = note + "\n\n" + reply.Text;
        return new { conversationId, reply };
    }

    internal AssistantFile Export() => _store.Snapshot();
}
