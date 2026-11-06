using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed class InboxItem
{
    public string Id { get; set; } = "";
    /// <summary>"link" (an http/https address) or "text".</summary>
    public string Kind { get; set; } = "text";
    public string Text { get; set; } = "";
    public string From { get; set; } = "";
    public DateTime At { get; set; }
    /// <summary>A link that was opened on the PC.</summary>
    public bool Opened { get; set; }
}

public sealed class InboxFile { public List<InboxItem> Items { get; set; } = new(); }

/// <summary>
/// "An PC senden": a link or a text sent from the phone or tablet. A link can be opened in the PC's browser right away (only http and https –
/// never a file path, a program or another protocol); a text stays in the inbox until it is copied or deleted. Kept for 30 days, at most 50 items.
/// </summary>
public sealed class InboxService
{
    public const int MaxItems = 50, MaxText = 4000, MaxLink = 2000;
    public static readonly TimeSpan Keep = TimeSpan.FromDays(30);
    readonly JsonStore<InboxFile> _store;
    readonly IHub _hub;
    readonly ILauncher _launcher;
    readonly Func<DateTime> _now;

    public InboxService(AppPaths paths, IHub hub, ILauncher launcher, Func<DateTime>? now = null)
    {
        _store = new JsonStore<InboxFile>(paths.File("inbox.json"));
        _hub = hub; _launcher = launcher; _now = now ?? (() => DateTime.UtcNow);
    }

    /// <summary>The address if the text is exactly one http(s) link, else null.</summary>
    public static string? AsLink(string text)
    {
        var t = text.Trim();
        if (t.Length is 0 or > MaxLink || Regex.IsMatch(t, @"[\s\u0000-\u001f]")) return null;
        return Uri.TryCreate(t, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttp || u.Scheme == Uri.UriSchemeHttps) && !string.IsNullOrEmpty(u.Host) ? u.AbsoluteUri : null;
    }

    public List<InboxItem> List()
    {
        var cut = _now() - Keep;
        return _store.Snapshot().Items.Where(i => i.At >= cut).OrderByDescending(i => i.At).ToList();
    }

    public InboxItem Add(string text, string from)
    {
        var t = (text ?? "").Trim();
        if (t.Length == 0) throw new RpcException("invalid-params", "Es gibt nichts zu senden.");
        if (t.Length > MaxText) throw new RpcException("invalid-params", $"Der Text ist zu lang (höchstens {MaxText} Zeichen).");
        var link = AsLink(t);
        var item = new InboxItem { Id = Ids.New("in"), Kind = link != null ? "link" : "text", Text = link ?? t, From = string.IsNullOrWhiteSpace(from) ? "Ein Gerät" : from.Trim()[..Math.Min(from.Trim().Length, 60)], At = _now() };
        _store.Update(f =>
        {
            var cut = _now() - Keep;
            f.Items.RemoveAll(i => i.At < cut);
            // the same thing sent twice within a minute (double tap, a retry) is kept once
            f.Items.RemoveAll(i => i.Text == item.Text && i.From == item.From && (_now() - i.At) < TimeSpan.FromMinutes(1));
            f.Items.Add(item);
            while (f.Items.Count > MaxItems) f.Items.Remove(f.Items.OrderBy(i => i.At).First());
        });
        _hub.Changed("inbox");
        return item;
    }

    /// <summary>Opens a received link in the PC's browser. Nothing else is ever opened.</summary>
    public string Open(string id)
    {
        var item = _store.Snapshot().Items.FirstOrDefault(i => i.Id == id) ?? throw new RpcException("not-found", "Diesen Eintrag gibt es nicht (mehr).");
        var link = item.Kind == "link" ? AsLink(item.Text) : null;
        if (link == null) throw new RpcException("invalid-params", "Nur Links lassen sich am PC öffnen.");
        var err = _launcher.OpenUrl(link);
        if (err != null) throw new RpcException("unsupported", err);
        _store.Update(f => { var i = f.Items.FirstOrDefault(x => x.Id == id); if (i != null) i.Opened = true; });
        _hub.Changed("inbox");
        return "Am PC geöffnet";
    }

    public bool Remove(string id)
    {
        var removed = false;
        _store.Update(f => removed = f.Items.RemoveAll(i => i.Id == id) > 0);
        if (removed) _hub.Changed("inbox");
        return removed;
    }

    public void Clear() { _store.Update(f => f.Items.Clear()); _hub.Changed("inbox"); }
}
