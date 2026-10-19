using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class NotificationTests
{
    static (NotificationCenter n, List<string> toasts) Make(TempDir dir, Func<bool>? gaming = null)
    {
        var settings = new SettingsService(new AppPaths(dir.Path), new NullHub());
        var n = new NotificationCenter(new NullHub(), settings, new AppPaths(dir.Path)) { IsGaming = gaming ?? (() => false) };
        var toasts = new List<string>();
        n.OnDesktop = x => toasts.Add(x.Title);
        return (n, toasts);
    }

    [Fact]
    public void History_read_state_and_categories_survive_a_restart()
    {
        using var dir = new TempDir();
        var (n, _) = Make(dir);
        n.Push("update-available", Severity.Info, "Update 2.5.0 verfügbar");
        var failed = n.Push("launch-failed:x", Severity.Error, "Start fehlgeschlagen: X")!;
        n.Push("deal:Hades", Severity.Success, "Zielpreis erreicht");
        Assert.Equal(3, n.Unread());
        Assert.Equal("update", n.List().First(x => x.Key == "update-available").Category);
        Assert.Equal("launch", failed.Category);
        Assert.Equal("deal", n.List(category: "deal").Single().Category);

        n.MarkRead(failed.Id);
        n.Dismiss(n.List().First(x => x.Key == "deal:Hades").Id);
        Assert.Equal(1, n.Unread());

        var (again, _) = Make(dir); // companion restarted
        Assert.Equal(2, again.List().Count);                  // open ones
        Assert.Equal(3, again.List(history: true).Count);     // incl. closed
        Assert.Equal(1, again.Unread());
        Assert.True(again.List().Single(x => x.Id == failed.Id).Read);
        again.MarkRead(null);
        Assert.Equal(0, again.Unread());
        again.ClearHistory();
        Assert.Equal(2, again.List(history: true).Count);
    }

    [Fact]
    public void A_repeat_is_unread_again_and_counted()
    {
        using var dir = new TempDir();
        var (n, _) = Make(dir);
        var a = n.Push("obs-replay", Severity.Warning, "Replay")!;
        n.MarkRead(null);
        n.Push("obs-replay", Severity.Warning, "Replay");
        Assert.Equal(2, n.List().Single().Count);
        Assert.False(n.List().Single().Read);
        Assert.Equal("recording", a.Category);
    }

    [Fact]
    public void While_gaming_only_errors_pop_up_on_the_desktop_but_everything_is_kept()
    {
        using var dir = new TempDir();
        var gaming = true;
        var (n, toasts) = Make(dir, () => gaming);
        n.Push("plugin:x", Severity.Warning, "Plugin-Warnung");
        n.Push("launch-failed:y", Severity.Error, "Start fehlgeschlagen");
        n.Push("quest:z", Severity.Success, "Ziel erreicht"); // info/success are held back while gaming (setting "quiet while gaming")
        Assert.Equal(new[] { "Start fehlgeschlagen" }, toasts);
        Assert.Equal(2, n.List().Count);
        gaming = false;
        n.Push("plugin:w", Severity.Warning, "Andere Warnung");
        Assert.Contains("Andere Warnung", toasts);
    }

    [Fact]
    public void Old_entries_and_overflow_are_trimmed()
    {
        using var dir = new TempDir();
        var (n, _) = Make(dir);
        for (var i = 0; i < NotificationCenter.MaxItems + 30; i++) n.Push("k" + i, Severity.Warning, "N" + i);
        Assert.Equal(NotificationCenter.MaxItems, n.List(history: true).Count);
        var file = new JsonStore<NotificationsFile>(new AppPaths(dir.Path).File("notifications.json"));
        file.Update(f => f.Items[0].At = DateTime.UtcNow.AddDays(-40));
        var (again, _) = Make(dir);
        Assert.Equal(NotificationCenter.MaxItems - 1, again.List(history: true).Count);
    }

    [Fact]
    public async Task Rpc_lists_open_and_history_with_unread_count()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        s.Notifications.Push("deal:x", Severity.Warning, "Deal");
        var r = await admin.Ok("notifications.list", new { history = false });
        Assert.True(r.GetProperty("unread").GetInt32() >= 1);
        await admin.Ok("notifications.markRead", new { });
        Assert.Equal(0, (await admin.Ok("notifications.list")).GetProperty("unread").GetInt32());
        Assert.Equal(0, (await admin.Ok("state.get")).GetProperty("counts").GetProperty("notifications").GetInt32());
    }
}
