using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Security;

namespace Pgl.Core.Services;

/// <summary>What a deck key does. Executed by the device through the existing commands (with its own rights) – the deck only stores the layout.</summary>
public sealed class DeckAction
{
    /// <summary>launch, quick, sound, stopSounds, profile, revertProfile, media, overlay, record, replay, folder, back, open, none</summary>
    public string Type { get; set; } = "none";
    /// <summary>Id of the game/program, quick action, sound, profile or folder page; media key name; app path for "open".</summary>
    public string? Ref { get; set; }
}

public sealed class DeckKey
{
    public string Id { get; set; } = "";
    /// <summary>Position on the page (0 = top left, row by row).</summary>
    public int Slot { get; set; }
    public string? Label { get; set; }
    /// <summary>"icon:&lt;name&gt;" (built-in symbol), "emoji:&lt;text&gt;", "cover" (picture of the game/program) or a small uploaded image (data:image/…).</summary>
    public string? Icon { get; set; }
    public string? Color { get; set; }
    public string? TextColor { get; set; }
    public DeckAction Action { get; set; } = new();
}

public sealed class DeckPage
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public List<DeckKey> Keys { get; set; } = new();
}

public sealed class Deck
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "Deck";
    /// <summary>Grid in portrait; landscape swaps columns and rows.</summary>
    public int Cols { get; set; } = 3;
    public int Rows { get; set; } = 5;
    /// <summary>Own background colour (#RRGGBB) or built-in background id; null = the app's design.</summary>
    public string? Background { get; set; }
    /// <summary>Shown automatically while this gaming profile is active (profile switching).</summary>
    public string? ProfileId { get; set; }
    /// <summary>First page = main page; further pages are folders or swipe pages.</summary>
    public List<DeckPage> Pages { get; set; } = new();
    public DateTime UpdatedAt { get; set; }
}

public sealed class DecksFile
{
    public List<Deck> Decks { get; set; } = new();
}

/// <summary>Stream-Deck-like key grids for phone and tablet. Stored on the PC so every device shows the same deck.</summary>
public sealed class DeckService
{
    public static readonly HashSet<string> ActionTypes = new() { "launch", "quick", "sound", "stopSounds", "profile", "revertProfile", "media", "power", "overlay", "record", "replay", "folder", "back", "open", "none" };
    public static readonly HashSet<string> MediaKeys = new(ActionRunner.MediaKeys.Keys);
    public const int MaxDecks = 20, MaxPages = 30, MaxKeys = 64, MaxImageChars = 60_000;
    static readonly Regex Id = new(@"^[A-Za-z0-9_-]{1,64}$");
    static readonly Regex Hex = new("^#[0-9a-fA-F]{6}$");
    static readonly Regex IconName = new("^(icon|brand):[a-z0-9-]{1,40}$"); // brand: = logo shipped with the app (Discord, OBS …)
    static readonly Regex Bg = new("^(#[0-9a-fA-F]{6}|[a-z0-9-]{1,40})$");
    static readonly Regex AppPath = new(@"^/[a-z-]{0,30}$");
    static readonly Regex Image = new(@"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$");

    readonly JsonStore<DecksFile> _store;
    readonly IHub _hub;

    public DeckService(AppPaths paths, IHub hub)
    {
        _store = new JsonStore<DecksFile>(paths.File("decks.json"));
        _hub = hub;
    }

    public List<Deck> List() => _store.Snapshot().Decks;

    public Deck Save(Deck d)
    {
        Validate(d);
        d.UpdatedAt = DateTime.UtcNow;
        _store.Update(f =>
        {
            var i = f.Decks.FindIndex(x => x.Id == d.Id);
            if (i >= 0) f.Decks[i] = d;
            else
            {
                if (f.Decks.Count >= MaxDecks) throw new RpcException("invalid-params", $"Höchstens {MaxDecks} Decks.");
                f.Decks.Add(d);
            }
        });
        _hub.Changed("deck");
        return d;
    }

    public void Remove(string id)
    {
        _store.Update(f => f.Decks.RemoveAll(d => d.Id == id));
        _hub.Changed("deck");
    }

    /// <summary>Checks everything a device sends. Unknown values are refused, not silently changed – so nothing surprising is stored.</summary>
    public static void Validate(Deck d)
    {
        static RpcException Bad(string m) => new("invalid-params", m);
        if (!Id.IsMatch(d.Id ?? "")) throw Bad("Ungültige Deck-Kennung.");
        d.Name = DeviceStore.Sanitize(d.Name, 30, "Deck");
        if (d.Cols is < 2 or > 8 || d.Rows is < 2 or > 10) throw Bad("Raster: 2–8 Spalten und 2–10 Zeilen.");
        if (d.Background != null && !Bg.IsMatch(d.Background)) throw Bad("Ungültiger Hintergrund.");
        if (d.ProfileId != null && !Id.IsMatch(d.ProfileId)) throw Bad("Ungültiges Profil.");
        if (d.Pages.Count is 0 or > MaxPages) throw Bad($"1 bis {MaxPages} Seiten.");
        var pageIds = d.Pages.Select(p => p.Id).ToHashSet();
        if (pageIds.Count != d.Pages.Count) throw Bad("Seiten-Kennungen doppelt.");
        foreach (var p in d.Pages)
        {
            if (!Id.IsMatch(p.Id ?? "")) throw Bad("Ungültige Seiten-Kennung.");
            p.Name = DeviceStore.Sanitize(p.Name, 30, "Seite");
            if (p.Keys.Count > MaxKeys) throw Bad($"Höchstens {MaxKeys} Tasten pro Seite.");
            if (p.Keys.Select(k => k.Slot).Distinct().Count() != p.Keys.Count) throw Bad("Zwei Tasten auf demselben Platz.");
            foreach (var k in p.Keys)
            {
                if (!Id.IsMatch(k.Id ?? "")) throw Bad("Ungültige Tasten-Kennung.");
                if (k.Slot < 0 || k.Slot >= d.Cols * d.Rows) throw Bad("Taste liegt außerhalb des Rasters.");
                k.Label = k.Label == null ? null : DeviceStore.Sanitize(k.Label, 24, "");
                if (k.Color != null && !Hex.IsMatch(k.Color)) throw Bad("Farbe als #RRGGBB.");
                if (k.TextColor != null && !Hex.IsMatch(k.TextColor)) throw Bad("Farbe als #RRGGBB.");
                if (k.Icon != null && !(IconName.IsMatch(k.Icon) || k.Icon == "cover" || (k.Icon.StartsWith("emoji:") && k.Icon.Length <= 20) ||
                    (k.Icon.Length <= MaxImageChars && Image.IsMatch(k.Icon))))
                    throw Bad("Ungültiges Symbol (Bilder höchstens ca. 40 KB, PNG/JPEG/WebP).");
                var a = k.Action ?? throw Bad("Taste ohne Aktion.");
                if (!ActionTypes.Contains(a.Type)) throw Bad($"Unbekannte Aktion „{a.Type}“.");
                switch (a.Type)
                {
                    case "launch" or "quick" or "sound" or "profile":
                        if (!Id.IsMatch(a.Ref ?? "")) throw Bad("Die Aktion braucht ein Ziel.");
                        break;
                    case "folder":
                        if (a.Ref == null || !pageIds.Contains(a.Ref) || a.Ref == p.Id) throw Bad("Ordner zeigt auf keine andere Seite.");
                        break;
                    case "media":
                        if (!MediaKeys.Contains(a.Ref ?? "")) throw Bad("Unbekannte Medientaste.");
                        break;
                    case "open":
                        if (!AppPath.IsMatch(a.Ref ?? "")) throw Bad("Ungültige Seite.");
                        break;
                    case "power":
                        if (a.Ref is not ("lock" or "sleep" or "restart" or "shutdown")) throw Bad("Unbekannte Energie-Aktion.");
                        break;
                    default:
                        a.Ref = null;
                        break;
                }
            }
        }
    }

    internal DecksFile Export() => _store.Snapshot();

    /// <summary>From a backup: broken decks are left out instead of failing the whole restore.</summary>
    internal void ImportChecked(DecksFile f)
    {
        var ok = new List<Deck>();
        foreach (var d in f.Decks.Take(MaxDecks))
        {
            try { Validate(d); ok.Add(d); } catch (RpcException ex) { Log.Warn("deck", $"Deck „{d.Name}“ aus dem Backup übersprungen: {ex.Message}"); }
        }
        _store.Replace(new DecksFile { Decks = ok });
        _hub.Changed("deck");
    }
}
