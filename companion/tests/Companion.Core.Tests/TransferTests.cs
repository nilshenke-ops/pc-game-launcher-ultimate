using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class TransferTests
{
    static async Task<string> Send(TestClient c, string name, byte[] data)
    {
        var id = (await c.Ok("files.uploadBegin", new { name, size = data.Length })).GetProperty("uploadId").GetString()!;
        for (var i = 0; i < data.Length; i += 100_000)
            await c.Ok("files.uploadChunk", new { uploadId = id, data = Convert.ToBase64String(data, i, Math.Min(100_000, data.Length - i)) });
        return (await c.Ok("files.uploadEnd", new { uploadId = id })).GetProperty("name").GetString()!;
    }

    [Fact]
    public async Task A_file_from_the_phone_arrives_in_the_folder_and_comes_back_byte_for_byte()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var data = new byte[1_234_567]; Random.Shared.NextBytes(data);
        Assert.Equal("clip.mp4", await Send(admin, "clip.mp4", data));
        Assert.Equal("clip (2).mp4", await Send(admin, "clip.mp4", data)); // never overwrites
        Assert.True(File.Exists(Path.Combine(s.Paths.TransferDir, "clip.mp4")));

        var list = await admin.Ok("files.list");
        Assert.Equal(2, list.GetProperty("files").GetArrayLength());
        Assert.Equal("video", list.GetProperty("files")[0].GetProperty("kind").GetString());

        var back = new List<byte>();
        for (long off = 0; ;)
        {
            var r = await admin.Ok("files.read", new { name = "clip.mp4", offset = off });
            var chunk = Convert.FromBase64String(r.GetProperty("data").GetString()!);
            back.AddRange(chunk); off += chunk.Length;
            if (r.GetProperty("eof").GetBoolean()) break;
        }
        Assert.Equal(data, back.ToArray());

        await admin.Ok("files.remove", new { name = "clip (2).mp4" });
        Assert.Single((await admin.Ok("files.list")).GetProperty("files").EnumerateArray());
        Assert.Contains(s.Notifications.List(), n => n.Key == "files:clip.mp4");
    }

    [Fact]
    public async Task Only_the_exchange_folder_is_reachable_and_only_with_manage_rights()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await viewer.Error("files.list"));
        Assert.Equal("forbidden", await viewer.Error("files.uploadBegin", new { name = "x.txt", size = 1 }));

        // Names cannot leave the folder: a path is reduced to its file name.
        Assert.Equal("settings.json", await Send(admin, "../../settings.json", new byte[] { 1, 2, 3 }));
        Assert.Equal(new byte[] { 1, 2, 3 }, File.ReadAllBytes(Path.Combine(s.Paths.TransferDir, "settings.json")));
        Assert.Equal("not-found", await admin.Error("files.read", new { name = "../settings.json" }));
        Assert.Equal("not-found", await admin.Error("files.remove", new { name = "../devices.json" }));
        Assert.True(File.Exists(s.Paths.File("devices.json")));

        Assert.Equal("too-large", await admin.Error("files.uploadBegin", new { name = "big.iso", size = TransferService.MaxFileBytes + 1 }));
        var id = (await admin.Ok("files.uploadBegin", new { name = "a.txt", size = 2 })).GetProperty("uploadId").GetString();
        Assert.Equal("too-large", await admin.Error("files.uploadChunk", new { uploadId = id, data = Convert.ToBase64String(new byte[3]) }));
        Assert.Equal("incomplete", await admin.Error("files.uploadEnd", new { uploadId = id }));
        Assert.DoesNotContain(Directory.GetFiles(s.Paths.TransferDir), f => f.EndsWith("a.txt"));
    }

    [Theory]
    [InlineData("CON.txt", "_CON.txt")]
    [InlineData("a<b>:c?.png", "a_b__c_.png")]
    [InlineData("  .hidden  ", "hidden")]
    [InlineData("...", "Datei")]
    [InlineData("C:\\Users\\x\\evil.exe", "evil.exe")]
    public void Names_are_made_safe_for_windows(string input, string expected) => Assert.Equal(expected, TransferService.SafeName(input));
}
