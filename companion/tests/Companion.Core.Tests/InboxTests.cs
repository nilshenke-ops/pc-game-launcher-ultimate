using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class InboxTests
{
    sealed class FakeLauncher : ILauncher
    {
        public List<string> Opened { get; } = new();
        public string? Fail { get; set; }
        public LaunchResult Launch(LibraryItem item) => new(true, "ok");
        public string? ValidateExecutable(string path) => null;
        public string? ExtractIcon(string path) => null;
        public string? OpenUrl(string url) { if (Fail != null) return Fail; Opened.Add(url); return null; }
    }

    static DateTime T = new(2026, 11, 6, 20, 0, 0, DateTimeKind.Utc);
    static (InboxService inbox, FakeLauncher launcher) Make(TempDir dir)
    {
        var l = new FakeLauncher();
        return (new InboxService(new AppPaths(Path.Combine(dir.Path, "data")), new NullHub(), l, () => T), l);
    }

    [Theory]
    [InlineData("https://example.org/a?b=1", true)]
    [InlineData("http://192.168.0.5:8080/x", true)]
    [InlineData("  https://example.org  ", true)]
    [InlineData("file:///C:/Windows/system32/cmd.exe", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("steam://rungameid/10", false)]
    [InlineData("ftp://example.org/x", false)]
    [InlineData("C:\\Windows\\notepad.exe", false)]
    [InlineData("https://example.org und noch Text", false)]
    [InlineData("https://", false)]
    [InlineData("", false)]
    public void Only_a_single_http_or_https_address_counts_as_a_link(string text, bool link) => Assert.Equal(link, InboxService.AsLink(text) != null);

    [Fact]
    public void A_sent_link_or_text_is_kept_with_its_kind_and_sender_and_survives_a_restart()
    {
        using var dir = new TempDir(); var (inbox, _) = Make(dir);
        var a = inbox.Add("https://example.org/x", "Nils iPad"); var b = inbox.Add("Der Code lautet 4711", "Nils iPad");
        Assert.Equal("link", a.Kind); Assert.Equal("text", b.Kind); Assert.Equal("Nils iPad", a.From);
        var again = Make(dir).inbox.List();                                                                  // a new instance on the same folder
        Assert.Equal(2, again.Count); Assert.Contains(again, i => i.Text == "Der Code lautet 4711");
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => inbox.Add("   ", "x")).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => inbox.Add(new string('x', InboxService.MaxText + 1), "x")).Code);
    }

    [Fact]
    public void The_same_thing_twice_within_a_minute_is_kept_once_old_items_expire_and_the_list_is_capped()
    {
        using var dir = new TempDir(); var (inbox, _) = Make(dir);
        inbox.Add("doppelt", "Handy"); inbox.Add("doppelt", "Handy");
        Assert.Single(inbox.List());
        T = T.AddMinutes(5); inbox.Add("doppelt", "Handy"); Assert.Equal(2, inbox.List().Count);              // a minute later it is a new message
        T = T.AddDays(31);
        Assert.Empty(inbox.List());                                                                          // 30 days are over
        for (var i = 0; i < InboxService.MaxItems + 7; i++) { T = T.AddSeconds(90); inbox.Add("Eintrag " + i, "Handy"); }
        var list = inbox.List();
        Assert.Equal(InboxService.MaxItems, list.Count); Assert.Equal("Eintrag " + (InboxService.MaxItems + 6), list[0].Text);   // the newest stay
    }

    [Fact]
    public void Only_links_can_be_opened_on_the_PC_and_the_browser_gets_exactly_the_checked_address()
    {
        using var dir = new TempDir(); var (inbox, launcher) = Make(dir);
        var link = inbox.Add("https://example.org/seite", "Handy"); var text = inbox.Add("nur Text", "Handy");
        Assert.Equal("Am PC geöffnet", inbox.Open(link.Id));
        Assert.Equal(new[] { "https://example.org/seite" }, launcher.Opened);
        Assert.True(inbox.List().First(i => i.Id == link.Id).Opened);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => inbox.Open(text.Id)).Code);          // a text is never "opened"
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => inbox.Open("gibt-es-nicht")).Code);
        launcher.Fail = "Kein Browser"; Assert.Equal("unsupported", Assert.Throws<RpcException>(() => inbox.Open(link.Id)).Code);
        Assert.Single(launcher.Opened);
    }

    [Fact]
    public void Entries_can_be_removed_one_by_one_or_all_at_once()
    {
        using var dir = new TempDir(); var (inbox, _) = Make(dir);
        var a = inbox.Add("eins", "Handy"); inbox.Add("zwei", "Handy");
        Assert.True(inbox.Remove(a.Id)); Assert.False(inbox.Remove(a.Id)); Assert.Single(inbox.List());
        inbox.Clear(); Assert.Empty(inbox.List());
    }
}
