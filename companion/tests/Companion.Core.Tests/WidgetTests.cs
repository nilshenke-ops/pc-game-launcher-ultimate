using System.Text.Json;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CustomWidgetTests
{
    static object Element(string id, string type, object? extra = null)
    {
        var d = new Dictionary<string, object?> { ["id"] = id, ["type"] = type, ["x"] = 5, ["y"] = 5, ["w"] = 40, ["h"] = 20, ["size"] = 16, ["align"] = "left", ["bold"] = false };
        if (extra != null) foreach (var p in extra.GetType().GetProperties()) d[p.Name] = p.GetValue(extra);
        return d;
    }

    [Fact]
    public async Task Widgets_are_saved_checked_and_removed()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        Assert.Equal(0, (await phone.Ok("widgets.list")).GetProperty("widgets").GetArrayLength());

        var saved = await phone.Ok("widgets.save", new
        {
            id = "cw_handy1", name = "  Mein <b>Widget</b>  ", height = 5000, background = "red;}", background2 = "#123456", opacity = 0.01, radius = 99,
            textColor = "#ffffff", desktop = true, desktopX = 7.0, desktopY = -1.0, desktopW = 20,
            elements = new[]
            {
                Element("e1", "text", new { text = "Hallo", x = 150, w = -3, size = 500, color = "url(x)" }),
                Element("e2", "metric", new { kind = "gpu", display = "pie" }),
                Element("e3", "button", new { action = "overlay", @ref = "anything" }),
                Element("e4", "clock", new { kind = "nonsense" }),
            },
        });
        Assert.Equal("cw_handy1", saved.GetProperty("id").GetString()); // id made on the phone is kept (placed offline already)
        Assert.Equal(900, saved.GetProperty("height").GetInt32());
        Assert.Equal("#111827", saved.GetProperty("background").GetString());
        Assert.Equal(0.2, saved.GetProperty("opacity").GetDouble());
        Assert.Equal(40, saved.GetProperty("radius").GetInt32());
        Assert.Equal(0.98, saved.GetProperty("desktopX").GetDouble());
        Assert.Equal(0, saved.GetProperty("desktopY").GetDouble());
        Assert.Equal(160, saved.GetProperty("desktopW").GetInt32());
        var els = saved.GetProperty("elements");
        Assert.Equal(100, els[0].GetProperty("x").GetDouble());
        Assert.Equal(2, els[0].GetProperty("w").GetDouble());
        Assert.Equal(120, els[0].GetProperty("size").GetInt32());
        Assert.False(els[0].TryGetProperty("color", out var c) && c.ValueKind != JsonValueKind.Null); // unsafe colour dropped
        Assert.Equal("number", els[1].GetProperty("display").GetString());
        Assert.Equal("full", els[2].GetProperty("ref").GetString());
        Assert.Equal("time", els[3].GetProperty("kind").GetString());
        Assert.Equal("Mein <b>Widget</b>", saved.GetProperty("name").GetString()); // trimmed; shown as plain text (React escapes it)

        // Saving again with the same id replaces it.
        await phone.Ok("widgets.save", new { id = "cw_handy1", name = "Neu", elements = Array.Empty<object>() });
        var list = (await phone.Ok("widgets.list")).GetProperty("widgets");
        Assert.Equal(1, list.GetArrayLength());
        Assert.Equal("Neu", list[0].GetProperty("name").GetString());

        await phone.Ok("widgets.remove", new { id = "cw_handy1" });
        Assert.Empty(s.Widgets.List());
    }

    [Fact]
    public async Task Invalid_widgets_are_refused()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        async Task Bad(object w) => Assert.Equal("invalid-params", await admin.Error("widgets.save", w));
        await Bad(new { id = "../etc", name = "x", elements = Array.Empty<object>() });
        await Bad(new { name = "x", elements = new[] { Element("e1", "script") } });
        await Bad(new { name = "x", elements = new[] { Element("E1!", "text") } });
        await Bad(new { name = "x", elements = new[] { Element("e1", "text"), Element("e1", "text") } });
        await Bad(new { name = "x", elements = new[] { Element("e1", "metric", new { kind = "disk" }) } });
        await Bad(new { name = "x", elements = new[] { Element("e1", "button", new { action = "shell" }) } });
        // Buttons only refer to ids of this PC – never to commands.
        await Bad(new { name = "x", elements = new[] { Element("e1", "button", new { action = "launch", @ref = "calc.exe /c del" }) } });
        await Bad(new { name = "x", elements = new[] { Element("e1", "button", new { action = "sound" }) } });
        // Pictures: only https or uploaded pictures, and not too large.
        await Bad(new { name = "x", image = "javascript:alert(1)", elements = Array.Empty<object>() });
        await Bad(new { name = "x", image = "http://example.com/a.png", elements = Array.Empty<object>() });
        await Bad(new { name = "x", image = "data:image/svg+xml;base64,PHN2Zz4=", elements = Array.Empty<object>() });
        await Bad(new { name = "x", image = "data:image/png;base64," + new string('A', 210_000), elements = Array.Empty<object>() });
        await Bad(new { name = "x", elements = Enumerable.Range(0, 41).Select(i => Element("e" + i, "shape")).ToArray() });
        var ok = await admin.Ok("widgets.save", new { name = "x", image = "data:image/png;base64,iVBORw0KGgo=", elements = Array.Empty<object>() });
        Assert.StartsWith("cw_", ok.GetProperty("id").GetString());
        Assert.Single(s.Widgets.List());
    }

    [Fact]
    public async Task At_most_30_widgets()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        for (var i = 0; i < 30; i++) s.Widgets.Save(new CustomWidget { Name = "w" + i });
        var ex = Assert.Throws<Pgl.Core.Rpc.RpcException>(() => s.Widgets.Save(new CustomWidget { Name = "zu viel" }));
        Assert.Equal("limit", ex.Code);
    }

    [Fact]
    public async Task Viewing_devices_cannot_change_widgets()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        await viewer.Ok("widgets.list");
        Assert.Equal("forbidden", await viewer.Error("widgets.save", new { name = "x", elements = Array.Empty<object>() }));
        Assert.Equal("forbidden", await viewer.Error("widgets.remove", new { id = "cw_x" }));
    }

    [Fact]
    public async Task Own_widgets_can_be_placed_in_the_overlay()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("overlay.saveLayout", new { layout = new { opacity = 0.9, widgets = new[] { new { id = "custom:cw_abc", visible = true, x = 0.1, y = 0.1, w = 340, h = 0 } } } });
        Assert.Equal("invalid-params", await admin.Error("overlay.saveLayout", new { layout = new { widgets = new[] { new { id = "custom:../x" } } } }));
    }

    [Fact]
    public async Task Desktop_position_is_stored_and_widgets_survive_a_backup()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var w = s.Widgets.Save(new CustomWidget { Name = "Desk", Desktop = true, Elements = { new WidgetElement { Id = "e1", Type = "clock" } } });
        s.Widgets.SetDesktopPosition(w.Id, 0.4, 2);
        Assert.Equal((0.4, 0.98), (s.Widgets.List()[0].DesktopX, s.Widgets.List()[0].DesktopY));
        Assert.Single(s.Widgets.DesktopWidgets());
        Assert.False(s.Platform.DesktopWidgets.Supported); // only the Windows companion shows desktop windows

        var zip = s.Backup.CreateZip(includeSounds: false);
        Assert.Contains("widgets", BackupService.ValidateFile(zip).Parts.Keys);
        s.Widgets.Remove(w.Id);
        s.Backup.Restore(StorageAndBackupTests.UploadFile(s, zip), new[] { "widgets" });
        Assert.Equal("Desk", s.Widgets.List().Single().Name);
    }
}
