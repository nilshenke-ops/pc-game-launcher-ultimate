using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>A date in the gaming calendar (raid, tournament, LAN party, release …).</summary>
public sealed class CalendarEvent
{
    /// <summary>Made on the device ("cal_…"), so an event created without the PC keeps its id.</summary>
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    /// <summary>Start in UTC. All-day events: midnight of that day in the PC's time zone.</summary>
    public DateTime Start { get; set; }
    /// <summary>0 = no end shown.</summary>
    public int DurationMinutes { get; set; } = 60;
    public bool AllDay { get; set; }
    /// <summary>none, daily, weekly, monthly – repeated in local time (stays at 20:00 across daylight saving).</summary>
    public string Repeat { get; set; } = "none";
    public DateTime? RepeatUntil { get; set; }
    /// <summary>Minutes before the start for a reminder (0 = at the start); null = no reminder.</summary>
    public int? RemindMinutes { get; set; }
    /// <summary>Game or program from the library (e.g. to start it from the event).</summary>
    public string? ItemId { get; set; }
    public string? Note { get; set; }
    public string? Color { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public sealed class CalendarFile
{
    public List<CalendarEvent> Events { get; set; } = new();
    /// <summary>"id@start" of occurrences already reminded of – a reminder comes once, also after a restart.</summary>
    public List<string> Reminded { get; set; } = new();
}

/// <summary>Gaming calendar: stored on the PC, the same on every device; reminders as notifications on the PC (and in the app).</summary>
public sealed class CalendarService : IDisposable
{
    public const int MaxEvents = 500;
    static readonly Regex Id = new("^cal_[A-Za-z0-9_-]{1,40}$");
    static readonly Regex ItemIdRx = new(@"^[A-Za-z0-9_-]{1,64}$");
    static readonly Regex Hex = new("^#[0-9a-fA-F]{6}$");
    static readonly string[] Repeats = { "none", "daily", "weekly", "monthly" };

    readonly JsonStore<CalendarFile> _store;
    readonly IHub _hub;
    readonly NotificationCenter? _notify;
    readonly TimeZoneInfo _zone;
    Timer? _timer;

    public CalendarService(AppPaths paths, IHub hub, NotificationCenter? notify = null, TimeZoneInfo? zone = null)
    {
        _store = new JsonStore<CalendarFile>(paths.File("calendar.json"));
        _hub = hub;
        _notify = notify;
        _zone = zone ?? TimeZoneInfo.Local;
    }

    /// <summary>Checks for due reminders every 30 s (cheap: a few date calculations, no disk access unless one is due).</summary>
    public void Start() => _timer = new Timer(_ => { try { CheckReminders(DateTime.UtcNow); } catch (Exception ex) { Log.Warn("calendar", ex.Message); } }, null, TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(30));
    public void Dispose() => _timer?.Dispose();

    public List<CalendarEvent> List() => _store.Snapshot().Events.OrderBy(e => e.Start).ToList();

    public CalendarEvent Save(CalendarEvent e)
    {
        Validate(e);
        e.UpdatedAt = DateTime.UtcNow;
        _store.Update(f =>
        {
            var i = f.Events.FindIndex(x => x.Id == e.Id);
            if (i >= 0) f.Events[i] = e;
            else
            {
                if (f.Events.Count >= MaxEvents) throw new RpcException("invalid-params", $"Höchstens {MaxEvents} Termine.");
                f.Events.Add(e);
            }
            // A moved event may remind again.
            f.Reminded.RemoveAll(r => r.StartsWith(e.Id + "@", StringComparison.Ordinal));
        });
        _hub.Changed("calendar");
        return e;
    }

    public void Remove(string id)
    {
        _store.Update(f => { f.Events.RemoveAll(x => x.Id == id); f.Reminded.RemoveAll(r => r.StartsWith(id + "@", StringComparison.Ordinal)); });
        _hub.Changed("calendar");
    }

    public static void Validate(CalendarEvent e)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        if (!Id.IsMatch(e.Id ?? "")) throw Bad("Ungültige Termin-Kennung.");
        e.Title = DeviceStore.Sanitize(e.Title, 80, "");
        if (e.Title.Length == 0) throw Bad("Der Termin braucht einen Titel.");
        if (e.Start.Year is < 2000 or > 2100) throw Bad("Ungültiges Datum.");
        e.Start = DateTime.SpecifyKind(e.Start.Kind == DateTimeKind.Local ? e.Start.ToUniversalTime() : e.Start, DateTimeKind.Utc);
        if (e.DurationMinutes is < 0 or > 7 * 24 * 60) throw Bad("Dauer: höchstens eine Woche.");
        if (!Repeats.Contains(e.Repeat ?? "")) throw Bad("Wiederholung: keine, täglich, wöchentlich oder monatlich.");
        if (e.RepeatUntil is { } until && until < e.Start) throw Bad("Das Ende der Wiederholung liegt vor dem Termin.");
        if (e.RemindMinutes is < 0 or > 7 * 24 * 60) throw Bad("Erinnerung: höchstens eine Woche vorher.");
        if (e.ItemId != null && !ItemIdRx.IsMatch(e.ItemId)) throw Bad("Ungültiges Spiel.");
        e.Note = e.Note == null ? null : (e.Note.Length > 500 ? e.Note[..500] : e.Note);
        if (e.Color != null && !Hex.IsMatch(e.Color)) throw Bad("Farbe als #RRGGBB.");
    }

    /// <summary>Start of the first occurrence that ends at or after <paramref name="from"/> (UTC); null if none.</summary>
    public DateTime? NextOccurrence(CalendarEvent e, DateTime from)
    {
        var length = TimeSpan.FromMinutes(Math.Max(e.DurationMinutes, 1));
        if (e.Repeat == "none") return e.Start + length > from ? e.Start : null;
        var local = TimeZoneInfo.ConvertTimeFromUtc(e.Start, _zone);
        for (var n = 0; n < 5000; n++)
        {
            var occLocal = e.Repeat switch { "daily" => local.AddDays(n), "weekly" => local.AddDays(7 * n), _ => local.AddMonths(n) };
            var occ = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(occLocal, DateTimeKind.Unspecified), _zone);
            if (e.RepeatUntil is { } until && occ > until) return null;
            if (occ + length > from) return occ;
        }
        return null;
    }

    /// <summary>Sends due reminders. Public for tests (time is passed in).</summary>
    public int CheckReminders(DateTime nowUtc)
    {
        var f = _store.Snapshot();
        var due = new List<(CalendarEvent e, DateTime start)>();
        foreach (var e in f.Events.Where(x => x.RemindMinutes != null))
        {
            var start = NextOccurrence(e, nowUtc - TimeSpan.FromMinutes(Math.Max(e.DurationMinutes, 1)));
            if (start is not { } s) continue;
            var at = s - TimeSpan.FromMinutes(e.RemindMinutes!.Value);
            // Due from the reminder time until 10 minutes after the start (PC was asleep: still useful), never earlier.
            if (nowUtc >= at && nowUtc <= s + TimeSpan.FromMinutes(10) && !f.Reminded.Contains($"{e.Id}@{s:O}")) due.Add((e, s));
        }
        if (due.Count == 0) return 0;
        _store.Update(file =>
        {
            foreach (var (e, s) in due) file.Reminded.Add($"{e.Id}@{s:O}");
            if (file.Reminded.Count > 300) file.Reminded.RemoveRange(0, file.Reminded.Count - 300);
        });
        foreach (var (e, s) in due)
        {
            var minutes = (int)Math.Round((s - nowUtc).TotalMinutes);
            var when = minutes > 0 ? $"in {minutes} Minuten" : "jetzt";
            var local = TimeZoneInfo.ConvertTimeFromUtc(s, _zone);
            _notify?.Push($"calendar:{e.Id}", Severity.Warning, $"{e.Title} – {when}", e.AllDay ? $"Heute ({local:dd.MM.})" : $"Beginn {local:HH:mm} Uhr", "/calendar");
        }
        return due.Count;
    }

    internal CalendarFile Export() => _store.Snapshot();

    internal void ImportChecked(CalendarFile f)
    {
        var ok = new List<CalendarEvent>();
        foreach (var e in f.Events.Take(MaxEvents))
        {
            try { Validate(e); ok.Add(e); } catch (RpcException ex) { Log.Warn("calendar", $"Termin „{e.Title}“ aus dem Backup übersprungen: {ex.Message}"); }
        }
        _store.Replace(new CalendarFile { Events = ok, Reminded = f.Reminded.Take(300).ToList() });
        _hub.Changed("calendar");
    }
}
