using System.Text.Json;
using Pgl.Core.Models;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class HistorySessionsTests
{
    static JsonElement Json(object o) => JsonSerializer.SerializeToElement(o, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });

    [Fact]
    public void Sessions_are_returned_raw_within_the_range_with_the_recording_start()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var game = new LibraryItem { Id = "item_a", Name = "Alpha", Kind = ItemKind.Game };
        var t0 = new DateTime(2025, 12, 31, 20, 0, 0, DateTimeKind.Utc);
        s.History.SessionStarted(game, t0);
        s.History.SessionEnded("item_a", t0.AddMinutes(90));
        s.History.SessionStarted(game, t0.AddDays(2));
        s.History.SessionEnded("item_a", t0.AddDays(2).AddMinutes(30));

        var all = Json(s.History.Sessions(null, null));
        Assert.True(all.GetProperty("enabled").GetBoolean());
        Assert.Equal(2, all.GetProperty("kept").GetInt32());
        Assert.False(all.GetProperty("full").GetBoolean());
        Assert.Equal(t0, all.GetProperty("oldest").GetDateTime().ToUniversalTime());

        var y2026 = Json(s.History.Sessions(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), new DateTime(2027, 1, 1, 0, 0, 0, DateTimeKind.Utc)));
        var only = y2026.GetProperty("sessions").EnumerateArray().Single();
        Assert.Equal("Alpha", only.GetProperty("name").GetString());
        Assert.Equal(30, only.GetProperty("minutes").GetDouble());
    }
}
