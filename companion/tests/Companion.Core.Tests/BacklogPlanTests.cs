using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Backlog extras (estimate, session length, archive, duplicates) and the typical session from the real history.</summary>
public class BacklogPlanTests
{
    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public async Task Estimate_session_archive_and_duplicate_are_stored_and_checked()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        s.Library.Import(new LibraryFile { Items = { new LibraryItem { Id = "g1", Name = "Hades", Kind = ItemKind.Game }, new LibraryItem { Id = "g2", Name = "Hades (Xbox)", Kind = ItemKind.Game } } });
        var admin = await Fixtures.Admin(s);
        var r = await admin.Ok("library.update", new { id = "g1", estimateHours = 22.25, sessionMinutes = 30, backlogArchived = true, backlog = "next" });
        Assert.Equal(22.3, r.GetProperty("estimateHours").GetDouble());
        Assert.Equal(30, r.GetProperty("sessionMinutes").GetInt32());
        Assert.True(r.GetProperty("backlogArchived").GetBoolean());
        Assert.Equal("next", r.GetProperty("backlog").GetString()); // archived keeps the status
        r = await admin.Ok("library.update", new { id = "g1", estimateHours = 0, sessionMinutes = 0 });
        Assert.False(r.TryGetProperty("estimateHours", out _));
        Assert.False(r.TryGetProperty("sessionMinutes", out _));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = "g1", sessionMinutes = 5000 }));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = "g1", estimateHours = -1 }));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = "g2", duplicateOf = "nope" }));
        Assert.Equal("invalid-params", await admin.Error("library.update", new { id = "g2", duplicateOf = "g2" }));
        Assert.Equal("g1", (await admin.Ok("library.update", new { id = "g2", duplicateOf = "g1" })).GetProperty("duplicateOf").GetString());
        Assert.False((await admin.Ok("library.update", new { id = "g2", duplicateOf = "" })).TryGetProperty("duplicateOf", out _));
    }

    [Fact]
    public void Typical_session_is_the_median_of_real_sessions_and_unknown_with_too_little_data()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var item = new LibraryItem { Id = "g", Name = "Spiel" };
        var t = DateTime.UtcNow.AddDays(-10);
        void Play(double minutes) { s.History.SessionStarted(item, t); s.History.SessionEnded("g", t.AddMinutes(minutes)); t = t.AddHours(5); }
        Play(20); Play(2); // 2 minutes: only a short look, not counted
        var st = J(s.History.Get()).GetProperty("stats")[0];
        Assert.False(st.TryGetProperty("typicalMinutes", out _)); // too little data → unknown
        Play(45); Play(60);
        st = J(s.History.Get()).GetProperty("stats")[0];
        Assert.Equal(45, st.GetProperty("typicalMinutes").GetDouble());
    }
}
