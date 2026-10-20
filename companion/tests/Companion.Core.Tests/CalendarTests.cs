using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CalendarTests
{
    static CalendarEvent Ev(string id, DateTime start, string repeat = "none", int? remind = null) =>
        new() { Id = id, Title = "Raid", Start = start, DurationMinutes = 120, Repeat = repeat, RemindMinutes = remind };

    [Fact]
    public async Task Events_made_on_a_phone_keep_their_id_are_checked_and_only_manage_may_change_them()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var ok = new { id = "cal_handy1", title = "  LAN-Party  ", start = "2026-11-07T17:00:00Z", durationMinutes = 360, allDay = false, repeat = "none", remindMinutes = 60 };
        Assert.Equal("forbidden", await viewer.Error("calendar.save", ok));
        var saved = await admin.Ok("calendar.save", ok);
        Assert.Equal("cal_handy1", saved.GetProperty("id").GetString());
        Assert.Equal("LAN-Party", saved.GetProperty("title").GetString());
        Assert.Equal(1, (await viewer.Ok("calendar.list")).GetProperty("events").GetArrayLength()); // every device sees it

        async Task Bad(object e) => Assert.Equal("invalid-params", await admin.Error("calendar.save", e));
        await Bad(new { id = "../x", title = "x", start = "2026-11-07T17:00:00Z", repeat = "none" });
        await Bad(new { id = "cal_a", title = "   ", start = "2026-11-07T17:00:00Z", repeat = "none" });
        await Bad(new { id = "cal_a", title = "x", start = "2026-11-07T17:00:00Z", repeat = "yearly" });
        await Bad(new { id = "cal_a", title = "x", start = "2026-11-07T17:00:00Z", repeat = "none", remindMinutes = -5 });
        await Bad(new { id = "cal_a", title = "x", start = "2026-11-07T17:00:00Z", repeat = "weekly", repeatUntil = "2026-01-01T00:00:00Z" });
        await Bad(new { id = "cal_a", title = "x", start = "2026-11-07T17:00:00Z", repeat = "none", color = "red;}" });

        await admin.Ok("calendar.remove", new { id = "cal_handy1" });
        Assert.Empty(s.Calendar.List());
    }

    [Fact]
    public void Weekly_events_stay_at_the_same_local_time_across_daylight_saving()
    {
        using var dir = new TempDir();
        var berlin = TimeZoneInfo.FindSystemTimeZoneById(OperatingSystem.IsWindows() ? "W. Europe Standard Time" : "Europe/Berlin");
        var cal = new CalendarService(new AppPaths(dir.Path), new NullHub(), null, berlin);
        var e = Ev("cal_w", new DateTime(2026, 10, 20, 18, 0, 0, DateTimeKind.Utc), "weekly"); // 20:00 summer time
        var next = cal.NextOccurrence(e, new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc))!.Value; // after the switch on 25.10.
        Assert.Equal(new DateTime(2026, 10, 27, 19, 0, 0, DateTimeKind.Utc), next); // still 20:00 local (now UTC+1)
        e.RepeatUntil = new DateTime(2026, 10, 30, 0, 0, 0, DateTimeKind.Utc);
        Assert.Null(cal.NextOccurrence(e, new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public async Task A_reminder_comes_once_on_time_and_again_after_the_event_was_moved()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var start = new DateTime(2030, 3, 1, 19, 0, 0, DateTimeKind.Utc);
        s.Calendar.Save(Ev("cal_r", start, remind: 15));
        Assert.Equal(0, s.Calendar.CheckReminders(start.AddMinutes(-20))); // too early
        Assert.Equal(1, s.Calendar.CheckReminders(start.AddMinutes(-14)));
        Assert.Equal(0, s.Calendar.CheckReminders(start.AddMinutes(-13))); // only once
        Assert.Contains(s.Notifications.List(), n => n.Key == "calendar:cal_r" && n.Title.StartsWith("Raid"));
        s.Calendar.Save(Ev("cal_r", start.AddHours(1), remind: 15)); // moved: reminds again for the new time
        Assert.Equal(1, s.Calendar.CheckReminders(start.AddMinutes(46)));
        Assert.Equal(0, s.Calendar.CheckReminders(start.AddHours(3))); // long over: no late reminder
    }

    [Fact]
    public async Task Calendar_survives_a_backup_and_broken_events_are_skipped()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        s.Calendar.Save(Ev("cal_b", new DateTime(2026, 12, 24, 18, 0, 0, DateTimeKind.Utc)));
        var file = s.Calendar.Export();
        file.Events.Add(new CalendarEvent { Id = "kaputt", Title = "x", Start = DateTime.UtcNow });
        s.Calendar.ImportChecked(file);
        Assert.Equal(new[] { "cal_b" }, s.Calendar.List().Select(e => e.Id));
    }
}
