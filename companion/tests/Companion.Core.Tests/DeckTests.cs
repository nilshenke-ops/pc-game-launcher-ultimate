using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class DeckTests
{
    static object Key(string id, int slot, string type, string? @ref = null, string? icon = null) =>
        new { id, slot, label = "K " + id, icon, color = "#22d3ee", action = new { type, @ref } };

    static object DeckJson(params object[] keys) => new
    {
        id = "deck_main", name = "Gaming", cols = 3, rows = 4,
        pages = new object[] { new { id = "p1", name = "Start", keys }, new { id = "p2", name = "Sounds", keys = new[] { Key("b", 0, "back") } } },
    };

    [Fact]
    public async Task Deck_is_checked_stored_for_all_devices_and_only_manage_may_change_it()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });

        var ok = DeckJson(Key("a", 0, "launch", "item_1", "cover"), Key("f", 1, "folder", "p2", "emoji:🎵"), Key("m", 2, "media", "volup", "icon:volume-2"), Key("o", 3, "open", "/soundboard"), Key("d", 4, "launch", "item_2", "brand:discord"));
        Assert.Equal("forbidden", await viewer.Error("deck.save", ok));
        var r = await admin.Ok("deck.save", ok);
        Assert.Equal("Gaming", r.GetProperty("name").GetString());
        var list = await viewer.Ok("deck.list"); // every device sees the same deck
        Assert.Equal(5, list.GetProperty("decks")[0].GetProperty("pages")[0].GetProperty("keys").GetArrayLength());

        // Refused: key outside the grid, two keys on one slot, folder to nowhere, unknown action, unknown media key, bad image, foreign app path.
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 12, "none"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 1, "none"), Key("b", 1, "none"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "folder", "p9"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "shell", "calc.exe"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "media", "shutdown"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "power", "format"))));
        await admin.Ok("deck.save", DeckJson(Key("p", 0, "power", "shutdown", "icon:power"))); // power keys only ask on the device and need the "power" right on the PC
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "none", null, "javascript:alert(1)"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "none", null, "brand:../../x"))));
        Assert.Equal("invalid-params", await admin.Error("deck.save", DeckJson(Key("a", 0, "open", "https://evil.example"))));

        // Media keys need the launch right; on Linux the headless companion has no key sender – an honest error, no silent success.
        Assert.Equal("media-key", await viewer.Error("media.key", new { key = "volup" }));
        Assert.Equal("invalid-params", await viewer.Error("media.key", new { key = "power" }));

        // Backup: a manipulated deck is skipped, the valid one comes back.
        var file = s.Decks.Export();
        file.Decks.Add(new Deck { Id = "bad", Name = "Bad", Cols = 99, Rows = 1, Pages = { new DeckPage { Id = "x" } } });
        s.Decks.ImportChecked(file);
        Assert.Equal(new[] { "deck_main" }, s.Decks.List().Select(d => d.Id));
    }
}
