using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>The home place the account carries is put on the PC by the website – no dialog, no second entry.</summary>
public class HomePlaceTests
{
    [Fact]
    public async Task Home_place_can_be_set_and_cleared_from_the_account()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);

        Assert.Equal("", (await admin.Ok("assistant.status")).GetProperty("homePlace").GetString());

        var r = await admin.Ok("assistant.homePlace", new { place = "  Adendorf " });
        Assert.Equal("Adendorf", r.GetProperty("homePlace").GetString());
        Assert.Equal("Adendorf", (await admin.Ok("assistant.status")).GetProperty("homePlace").GetString());

        await admin.Ok("assistant.homePlace", new { place = "" });
        Assert.Equal("", (await admin.Ok("assistant.status")).GetProperty("homePlace").GetString());
    }

    [Fact]
    public async Task A_too_long_place_is_refused_and_phones_without_admin_rights_cannot_set_it()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);

        Assert.Equal("invalid-params", await admin.Error("assistant.homePlace", new { place = new string('x', 81) }));

        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await phone.Error("assistant.homePlace", new { place = "Adendorf" }));
        Assert.Equal("", (await admin.Ok("assistant.status")).GetProperty("homePlace").GetString());
    }
}
