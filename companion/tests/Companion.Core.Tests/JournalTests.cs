using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Collections made in the browser: copy on the PC, newer change wins, lost changes kept, pictures, backup.</summary>
public class JournalTests
{
    static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    static object Change(string id, long at, object? data, long? baseAt = null, bool deleted = false, string kind = "wiki") =>
        new { id, kind, updatedAt = at, deleted, @base = baseAt, data };
    static string Status(JsonElement r, int i = 0) => r.GetProperty("results")[i].GetProperty("status").GetString()!;

    [Fact]
    public async Task Changes_from_two_devices_meet_on_the_pc_and_a_lost_change_is_kept()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        var (tablet, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage" });
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var t0 = Now - 10_000;

        Assert.Equal("ok", Status(await phone.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0, new { title = "Creeper" }) } })));
        // Sent twice (no answer the first time): applied once.
        var again = await phone.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0, new { title = "Creeper" }) } });
        Assert.Equal("ok", Status(again));
        var pull = await tablet.Ok("journal.pull", new { since = 0 });
        Assert.Equal(1, pull.GetProperty("rev").GetInt64());
        Assert.Equal("Creeper", pull.GetProperty("entries")[0].GetProperty("data").GetProperty("title").GetString());
        Assert.Equal(0, (await tablet.Ok("journal.pull", new { since = 1 })).GetProperty("entries").GetArrayLength());

        // Viewers may read, not write.
        Assert.Equal("forbidden", await viewer.Error("journal.push", new { changes = Array.Empty<object>() }));
        Assert.Equal(1, (await viewer.Ok("journal.pull")).GetProperty("entries").GetArrayLength());

        // Both change the same page offline; the tablet's change is newer and wins, the phone's older one is kept.
        Assert.Equal("ok", Status(await tablet.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0 + 2000, new { title = "Creeper (Tablet)" }, t0) } })));
        Assert.Equal("older", Status(await phone.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0 + 1000, new { title = "Creeper (Handy)" }, t0) } })));
        var c = (await phone.Ok("journal.conflicts")).GetProperty("conflicts");
        Assert.Equal("Creeper (Handy)", c[0].GetProperty("data").GetProperty("title").GetString());
        // Phone changes it once more, later, without having seen the tablet's change: it wins, the tablet's version is kept.
        Assert.Equal("ok", Status(await phone.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0 + 3000, new { title = "Creeper (Handy 2)" }, t0) } })));
        c = (await phone.Ok("journal.conflicts")).GetProperty("conflicts");
        Assert.Equal(2, c.GetArrayLength());
        Assert.Contains(c.EnumerateArray(), x => x.GetProperty("data").GetProperty("title").GetString() == "Creeper (Tablet)");
        await phone.Ok("journal.dismissConflict", new { id = c[0].GetProperty("id").GetString() });
        Assert.Equal(1, (await phone.Ok("journal.conflicts")).GetProperty("conflicts").GetArrayLength());

        // Deleting leaves a marker without data, so the other devices learn about it.
        await phone.Ok("journal.push", new { changes = new[] { Change("j_page000001", t0 + 4000, null, t0 + 3000, deleted: true) } });
        var del = (await tablet.Ok("journal.pull", new { since = pull.GetProperty("rev").GetInt64() })).GetProperty("entries");
        Assert.True(del[del.GetArrayLength() - 1].GetProperty("deleted").GetBoolean());
        Assert.False(del[del.GetArrayLength() - 1].TryGetProperty("data", out _));
    }

    [Fact]
    public async Task Bad_input_is_refused_and_big_collections_are_fetched_in_pages()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("invalid-params", await admin.Error("journal.push", new { changes = new[] { Change("../etc", Now, new { }) } }));
        Assert.Equal("invalid-params", await admin.Error("journal.push", new { changes = new[] { Change("j_ok000001", Now, new { }, kind: "Wiki!") } }));
        Assert.Equal("invalid-params", await admin.Error("journal.push", new { changes = new[] { Change("j_ok000001", Now + 10L * 86_400_000, new { }) } }));
        Assert.Equal("invalid-params", await admin.Error("journal.push", new { changes = new[] { Change("j_ok000001", Now, null) } }));
        Assert.Equal("invalid-params", await admin.Error("journal.push", new { changes = new[] { Change("j_ok000001", Now, new { body = new string('x', 300_000) }) } }));
        Assert.Equal(0, (await admin.Ok("journal.pull")).GetProperty("entries").GetArrayLength()); // nothing half stored

        // Same id, other kind: refused for that entry only.
        await admin.Ok("journal.push", new { changes = new[] { Change("j_ok000001", Now, new { a = 1 }) } });
        var mixed = await admin.Ok("journal.push", new { changes = new[] { Change("j_ok000001", Now + 1, new { a = 2 }, kind: "goal"), Change("j_ok000002", Now, new { a = 3 }) } });
        Assert.Equal("refused", Status(mixed, 0));
        Assert.Equal("ok", Status(mixed, 1));

        for (var b = 0; b < 3; b++)
            await admin.Ok("journal.push", new { changes = Enumerable.Range(0, 200).Select(i => Change($"j_bulk{b}{i:0000}", Now, new { i })).ToArray() });
        var all = new HashSet<string>();
        long since = 0; var pages = 0;
        while (true)
        {
            var p = await admin.Ok("journal.pull", new { since });
            foreach (var e in p.GetProperty("entries").EnumerateArray()) all.Add(e.GetProperty("id").GetString()!);
            since = p.GetProperty("rev").GetInt64(); pages++;
            if (!p.GetProperty("more").GetBoolean()) break;
        }
        Assert.Equal(602, all.Count);
        Assert.Equal(2, pages);

        // Survives a restart of the companion.
        await s.DisposeAsync();
        await using var s2 = Fixtures.Services(dir);
        Assert.Equal(602, ((JsonElement)JsonSerializer.SerializeToElement(s2.Journal.Stats(), Json.Options)).GetProperty("entries").GetInt32());
    }

    [Fact]
    public async Task Pictures_are_checked_stored_once_cleaned_up_and_go_into_the_backup()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4 };
        Assert.True((await admin.Ok("journal.putImage", new { id = "img_abc12345", mime = "image/jpeg", data = Convert.ToBase64String(jpeg) })).GetProperty("stored").GetBoolean());
        Assert.False((await admin.Ok("journal.putImage", new { id = "img_abc12345", mime = "image/jpeg", data = Convert.ToBase64String(jpeg) })).GetProperty("stored").GetBoolean());
        Assert.Equal("invalid-params", await admin.Error("journal.putImage", new { id = "img_bad00001", mime = "image/png", data = Convert.ToBase64String(jpeg) })); // not a PNG
        Assert.Equal("invalid-params", await admin.Error("journal.putImage", new { id = "img_bad00001", mime = "image/svg+xml", data = "PHN2Zz4=" }));
        Assert.Equal("invalid-params", await admin.Error("journal.putImage", new { id = "../x", mime = "image/jpeg", data = Convert.ToBase64String(jpeg) }));
        Assert.Equal(Convert.ToBase64String(jpeg), (await admin.Ok("journal.image", new { id = "img_abc12345" })).GetProperty("data").GetString());
        Assert.Equal(new[] { "img_abc12345" }, (await admin.Ok("journal.hasImages", new { ids = new[] { "img_abc12345", "img_nope0000" } })).GetProperty("ids").EnumerateArray().Select(x => x.GetString()));

        await admin.Ok("journal.push", new { changes = new[] { Change("j_find000001", Now, new { title = "Diamanten", imageIds = new[] { "img_abc12345" } }, kind: "find") } });
        await admin.Ok("journal.putImage", new { id = "img_orphan01", mime = "image/jpeg", data = Convert.ToBase64String(jpeg) });
        // Unused pictures go only after a day (their entry may still be on the way).
        Assert.Equal(0, s.Journal.CleanImages());
        Assert.Equal(1, s.Journal.CleanImages(DateTime.UtcNow.AddDays(2)));
        Assert.Equal("not-found", await admin.Error("journal.image", new { id = "img_orphan01" }));

        var zip = s.Backup.CreateZip(includeSounds: true);
        Assert.Contains("journal", BackupService.ValidateFile(zip).Parts.Keys);
        await admin.Ok("journal.push", new { changes = new[] { Change("j_find000001", Now + 5, null, deleted: true, kind: "find") } });
        File.Delete(Directory.EnumerateFiles(s.Journal.ImageDir).Single());
        var before = (await admin.Ok("journal.pull")).GetProperty("rev").GetInt64();
        s.Backup.Restore(StorageAndBackupTests.UploadFile(s, zip), new[] { "journal" });
        var p = await admin.Ok("journal.pull", new { since = before });
        Assert.Equal("Diamanten", p.GetProperty("entries")[0].GetProperty("data").GetProperty("title").GetString()); // devices see the restored state as new
        Assert.Equal(Convert.ToBase64String(jpeg), (await admin.Ok("journal.image", new { id = "img_abc12345" })).GetProperty("data").GetString());
    }
}
