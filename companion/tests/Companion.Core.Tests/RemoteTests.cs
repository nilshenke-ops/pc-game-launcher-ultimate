using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Remote desktop end to end with the developer test picture: rights, pictures, flow control, input, ending.</summary>
public class RemoteTests
{
    static (CompanionServices s, TestScreenSource screen) Setup(TempDir dir)
    {
        var screen = new TestScreenSource();
        return (new CompanionServices(new GenericPlatform { Screen = screen, RemoteInput = screen }, new AppPaths(dir.Path), new Pgl.Core.Hosting.WebAssets(dir.Path)), screen);
    }

    static async Task<List<JsonElement>> Frames(TestClient c, int atLeast, int ms = 3000)
    {
        for (var waited = 0; waited < ms; waited += 20)
        {
            var f = c.Channel.Events("remote.frame").ToList();
            if (f.Count >= atLeast) return f;
            await Task.Delay(20);
        }
        return c.Channel.Events("remote.frame").ToList();
    }

    static async Task Until(Func<bool> cond, int ms = 3000)
    {
        for (var waited = 0; waited < ms && !cond(); waited += 20) await Task.Delay(20);
        Assert.True(cond());
    }

    [Fact]
    public async Task Only_enabled_at_the_pc_and_only_for_devices_with_the_right()
    {
        using var dir = new TempDir();
        var (s, _) = Setup(dir);
        await using var _ = s;
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin); // default rights
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "screen" });
        Assert.DoesNotContain("screen", Security.Permissions.Default);
        Assert.DoesNotContain("remote", Security.Permissions.Default);

        Assert.Equal("forbidden", await phone.Error("remote.start"));
        Assert.Equal("disabled", await viewer.Error("remote.start"));
        Assert.Equal("forbidden", await viewer.Error("remote.configure", new { enabled = true })); // only directly at the PC
        Assert.True((await admin.Ok("remote.configure", new { enabled = true, maxMinutes = 9999 })).GetProperty("enabled").GetBoolean());
        Assert.Equal(480, s.Remote.Settings.MaxMinutes);

        var st = await viewer.Ok("remote.status");
        Assert.True(st.GetProperty("canView").GetBoolean());
        Assert.False(st.GetProperty("canControl").GetBoolean());
        Assert.True(st.GetProperty("testSource").GetBoolean());

        // Viewing only: pictures arrive, input is refused.
        var r = await viewer.Ok("remote.start", new { preset = "balanced" });
        Assert.False(r.GetProperty("control").GetBoolean());
        var id = r.GetProperty("sessionId").GetString()!;
        var f = (await Frames(viewer, 1))[0].GetProperty("d");
        Assert.Equal("image/bmp", f.GetProperty("mime").GetString());
        Assert.Equal("BM", System.Text.Encoding.ASCII.GetString(Convert.FromBase64String(f.GetProperty("data").GetString()!)[..2]));
        Assert.Equal("forbidden", await viewer.Error("remote.tick", new { sessionId = id, ack = 1, events = new[] { new { t = "click", x = 0.5, y = 0.5 } } }));
        Assert.Contains(s.Notifications.List(), n => n.Key == "remote:start" && n.Message!.Contains("sieht deinen Bildschirm"));
        Assert.Equal("Test-iPhone", s.Remote.Active!.Device);
    }

    [Fact]
    public async Task Touches_and_keys_arrive_as_input_at_the_right_place_and_pictures_wait_for_the_device()
    {
        using var dir = new TempDir();
        var (s, screen) = Setup(dir);
        await using var _ = s;
        var admin = await Fixtures.Admin(s);
        await admin.Ok("remote.configure", new { enabled = true });
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "remote" });
        var r = await phone.Ok("remote.start", new { preset = "low", fps = 10 });
        Assert.True(r.GetProperty("control").GetBoolean());
        var id = r.GetProperty("sessionId").GetString()!;

        // Without acknowledgements at most two pictures are on the way (no pile-up on a slow network).
        await Frames(phone, 2);
        await Task.Delay(400);
        Assert.Equal(2, phone.Channel.Events("remote.frame").Count());

        var t = await phone.Ok("remote.tick", new { sessionId = id, ack = 2, events = new object[]
        {
            new { t = "click", x = 0.25, y = 0.5 },
            new { t = "click", b = "right", x = 0.75, y = 0.25 },
            new { t = "wheel", dy = -240 },
            new { t = "text", s = "Grüße ß€\u0007" },
            new { t = "keys", k = new[] { "Ctrl", "C" } },
        } });
        Assert.Equal(5, t.GetProperty("done").GetInt32());
        var log = screen.Log;
        Assert.Contains("down Left 0.250 0.500", log);
        Assert.Contains("up Right 0.750 0.250", log);
        Assert.Contains("wheel -240 0", log);
        Assert.Contains("text Grüße ß€", log); // control characters removed
        Assert.Equal(new[] { "key Ctrl down", "key C down", "key C up", "key Ctrl up" }, log.Where(l => l.StartsWith("key")).ToArray());

        // The next picture shows the click (red mark at 25 % / 50 %).
        var frames = await Frames(phone, 3);
        var bmp = Convert.FromBase64String(frames.Last().GetProperty("d").GetProperty("data").GetString()!);
        int w = BitConverter.ToInt32(bmp, 18), h = BitConverter.ToInt32(bmp, 22), row = (w * 3 + 3) & ~3;
        int px = (int)(0.25 * w), py = (int)(0.5 * h);
        var o = 54 + (h - 1 - py) * row + px * 3;
        Assert.True(bmp[o] < 60 && bmp[o + 2] > 200, "rote Klickmarke an der Stelle des Tippens");

        // Invalid or dangerous input is refused – nothing is pressed.
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, ack = 3, events = new[] { new { t = "click", x = 1.5, y = 0.5 } } }));
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, events = new[] { new { t = "keys", k = new[] { "Ctrl", "Alt", "Delete" } } } }));
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, events = new[] { new { t = "keys", k = new[] { "LaunchMail" } } } }));
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, events = new[] { new { t = "shell", s = "cmd" } } }));
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, events = Enumerable.Repeat(new { t = "move", x = 0.1, y = 0.1 }, 61).ToArray() }));
        Assert.Equal("invalid-params", await phone.Error("remote.tick", new { sessionId = id, events = new[] { new { t = "text", s = new string('a', 501) } } }));

        // Pause: no pictures, no input; drag that was held is released.
        await phone.Ok("remote.tick", new { sessionId = id, events = new object[] { new { t = "move", x = 0.1, y = 0.1 }, new { t = "down", b = "left" } } });
        await phone.Ok("remote.pause", new { sessionId = id, paused = true });
        Assert.Contains(screen.Log, l => l.StartsWith("release") && l.Contains("Left"));
        Assert.Equal("paused", await phone.Error("remote.tick", new { sessionId = id, events = new[] { new { t = "click", x = 0.5, y = 0.5 } } }));
        await phone.Ok("remote.pause", new { sessionId = id, paused = false });

        // Stop from the device: event, input released, no more pictures.
        Assert.True((await phone.Ok("remote.stop", new { sessionId = id })).GetBoolean());
        Assert.Null(s.Remote.Active);
        Assert.Equal("ended", await phone.Error("remote.tick", new { sessionId = id, ack = 9 }));
    }

    [Fact]
    public async Task One_session_at_a_time_and_every_way_of_ending_it_is_honoured()
    {
        using var dir = new TempDir();
        var (s, screen) = Setup(dir);
        await using var _ = s;
        var admin = await Fixtures.Admin(s);
        await admin.Ok("remote.configure", new { enabled = true });
        var (a, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "remote" });
        var (b, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "remote" });
        var id = (await a.Ok("remote.start")).GetProperty("sessionId").GetString()!;
        Assert.Equal("busy", await b.Error("remote.start"));

        // „Beenden“ on the PC.
        Assert.True((await admin.Ok("remote.end")).GetBoolean());
        await Until(() => a.Channel.Events("remote.ended").Any());
        Assert.Equal("Am PC beendet.", a.Channel.Events("remote.ended").Last().GetProperty("d").GetProperty("reason").GetString());
        Assert.Contains(s.Notifications.List(), n => n.Key == "remote:end");

        // Connection closed → ends at once.
        await b.Ok("remote.start");
        s.Rpc.OnClosed(b.Channel);
        Assert.Null(s.Remote.Active);

        // Privacy mode ends it and blocks new sessions until it is off.
        await a.Ok("remote.start");
        var on = await admin.Ok("privacy.on");
        Assert.Contains(on.GetProperty("results").EnumerateArray(), x => x.GetProperty("id").GetString() == "remote" && x.GetProperty("detail").GetString()!.Contains("wurde beendet"));
        Assert.Null(s.Remote.Active);
        Assert.Equal("blocked", await a.Error("remote.start"));
        await admin.Ok("privacy.off");
        await a.Ok("remote.start");

        // Taking the right away at the PC ends it.
        var aid = s.Devices.List().First(d => d.Permissions.Contains("remote")).Id;
        await admin.Ok("devices.setPermissions", new { id = aid, permissions = new[] { "view" } });
        await Until(() => s.Remote.Active == null);
        await admin.Ok("devices.setPermissions", new { id = aid, permissions = new[] { "view", "remote" } });
        await a.Ok("remote.start");

        // Switching it off at the PC ends it.
        await admin.Ok("remote.configure", new { enabled = false });
        Assert.Null(s.Remote.Active);
        Assert.Equal("disabled", await a.Error("remote.start"));
    }

    [Fact]
    public async Task Sessions_end_after_the_set_time_when_idle_or_when_the_device_stops_answering()
    {
        using var dir = new TempDir();
        var screen = new TestScreenSource();
        var now = new DateTime(2026, 10, 21, 12, 0, 0, DateTimeKind.Utc);
        var sent = new List<(string ev, object? d)>();
        var rpc = new RpcServer(new Security.DeviceStore(new AppPaths(dir.Path), new GenericPlatform().Secrets));
        var remote = new RemoteService(new AppPaths(dir.Path), screen, screen, new NullHub(), (_, ev, d) => { lock (sent) sent.Add((ev, d)); return Task.CompletedTask; }, () => now);
        remote.Configure(true, 30, 5);
        var who = rpc.OnConnected(new TestChannel("127.0.0.1", loopback: true));
        who.IsLocalAdmin = true; who.Permissions = new HashSet<string>(Security.Permissions.LocalAdmin);
        string Reason() { lock (sent) return sent.Where(x => x.ev == "remote.ended").Select(x => JsonSerializer.SerializeToElement(x.d, Json.Options).GetProperty("reason").GetString()!).LastOrDefault() ?? ""; }

        var id = JsonSerializer.SerializeToElement(remote.Start(who, 0, "auto", null, null), Json.Options).GetProperty("sessionId").GetString()!;
        now = now.AddMinutes(6); // no input for 6 min (idle limit 5)
        remote.Tick(who, id, 0, default); // still answering, but nobody touched anything
        await Until(() => remote.Active == null);
        Assert.Contains("ohne Eingabe", Reason());

        id = JsonSerializer.SerializeToElement(remote.Start(who, 0, "auto", null, null), Json.Options).GetProperty("sessionId").GetString()!;
        now = now.AddSeconds(25); // no tick for 25 s
        await Until(() => remote.Active == null);
        Assert.Contains("antwortet nicht", Reason());

        remote.Configure(true, 1, 5);
        id = JsonSerializer.SerializeToElement(remote.Start(who, 0, "auto", null, null), Json.Options).GetProperty("sessionId").GetString()!;
        // Active the whole time (input every 10 s) – still ends after the set 1 min; later input is refused as "ended".
        var ended = -1;
        for (var i = 0; i < 9 && ended < 0; i++)
        {
            now = now.AddSeconds(10);
            try { remote.Tick(who, id, 0, JsonSerializer.SerializeToElement(new[] { new { t = "move", x = 0.5, y = 0.5 } })); }
            catch (RpcException e) { Assert.Equal("ended", e.Code); ended = i; }
            await Task.Delay(80);
        }
        Assert.True(ended < 0 || ended >= 6, "nicht vor 1 min beendet");
        await Until(() => remote.Active == null);
        Assert.Contains("Sitzungsdauer (1 min) abgelaufen", Reason());
        Assert.Contains(screen.Log, l => l.StartsWith("release"));
    }
}
