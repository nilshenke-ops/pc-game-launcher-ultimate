using System.Text.Json;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Device identity vs. session, device limit, unauthorised commands and commands that arrive twice.</summary>
public class SessionTests
{
    [Fact]
    public async Task An_old_session_is_renewed_with_the_device_key_without_pairing_again()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (_, id, token) = await Fixtures.PairedDevice(s, admin);
        s.Rpc.SessionLifetime = TimeSpan.FromMilliseconds(300);
        var phone = new TestClient(s.Rpc);
        var hello1 = await phone.Ok("hello");
        await phone.Ok("auth.login", new { deviceId = id, proof = Fixtures.Proof(token, hello1.GetProperty("nonce").GetString()!) });
        await phone.Ok("library.list");
        await Task.Delay(400);
        // Nothing runs on the old session …
        Assert.Equal("session-expired", await phone.Error("library.list"));
        Assert.Equal("unauthenticated", await phone.Error("library.list"));
        // … the old proof (old nonce) is worthless now …
        var hello2 = await phone.Ok("hello");
        Assert.NotEqual(hello1.GetProperty("nonce").GetString(), hello2.GetProperty("nonce").GetString());
        Assert.Equal("auth-failed", await phone.Error("auth.login", new { deviceId = id, proof = Fixtures.Proof(token, hello1.GetProperty("nonce").GetString()!) }));
        // … and the same device key gives a new session at once.
        s.Rpc.SessionLifetime = TimeSpan.FromHours(12);
        await phone.Ok("auth.login", new { deviceId = id, proof = Fixtures.Proof(token, hello2.GetProperty("nonce").GetString()!) });
        await phone.Ok("library.list");
    }

    [Fact]
    public async Task A_revoked_device_gets_no_new_session()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (_, id, token) = await Fixtures.PairedDevice(s, admin);
        await admin.Ok("devices.revoke", new { id });
        var phone = new TestClient(s.Rpc);
        var hello = await phone.Ok("hello");
        Assert.Equal("auth-failed", await phone.Error("auth.login", new { deviceId = id, proof = Fixtures.Proof(token, hello.GetProperty("nonce").GetString()!) }));
    }

    [Fact]
    public async Task Unauthorised_devices_cannot_send_commands()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (item, marker) = await AddFakeGame(s, admin, dir);
        // Not signed in at all.
        var stranger = new TestClient(s.Rpc, new TestChannel("192.168.1.99"));
        await stranger.Ok("hello");
        Assert.Equal("unauthenticated", await stranger.Error("library.launch", new { id = item }));
        // A made-up device id / proof.
        Assert.Equal("auth-failed", await stranger.Error("auth.login", new { deviceId = "dev_erfunden", proof = new string('a', 64) }));
        // Paired, but without the right to start things.
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await viewer.Error("library.launch", new { id = item }));
        // The PC-only admin login does not work from another device.
        Assert.Equal("forbidden", await stranger.Error("auth.login", new { adminToken = s.Rpc.AdminToken }));
        await Task.Delay(200);
        Assert.False(File.Exists(marker), "Ein nicht berechtigtes Gerät hat etwas gestartet");
    }

    [Fact]
    public async Task A_command_that_arrives_twice_is_carried_out_once()
    {
        if (OperatingSystem.IsWindows()) return; // Unix executable
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (item, marker) = await AddFakeGame(s, admin, dir, counting: true);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin);
        string Msg(long id) => JsonSerializer.Serialize(new { v = 1, id, m = "library.launch", p = new { id = item }, op = "cmd-0001" });
        var first = await phone.Raw(Msg(100));
        var again = await phone.Raw(Msg(101)); // same command id, e.g. sent again after a lost answer
        Assert.True(first.GetProperty("ok").GetBoolean());
        Assert.True(again.GetProperty("ok").GetBoolean());
        await Task.Delay(600);
        Assert.Single(File.ReadAllLines(marker));
        // Replaying the very same message (same sequence number) is refused outright.
        Assert.Equal("replay", (await phone.Raw(Msg(101))).GetProperty("e").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Missing_program_gives_a_clear_answer()
    {
        if (OperatingSystem.IsWindows()) return;
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (item, _) = await AddFakeGame(s, admin, dir);
        File.Delete(Path.Combine(dir.Path, "fake-game.sh")); // uninstalled meanwhile
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin);
        Assert.Equal("invalid-target", await phone.Error("library.launch", new { id = item }));
        Assert.Equal("not-found", await phone.Error("library.launch", new { id = "itm_gibtsnicht" }));
    }

    [Fact]
    public async Task The_device_limit_is_enforced_for_codes_and_transfers()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (first, _, _) = await Fixtures.PairedDevice(s, admin);
        var handoff = (await first.Ok("devices.handoff")).GetProperty("code").GetString();
        for (int i = s.Devices.List().Count; i < Security.DeviceStore.MaxDevices; i++) s.Devices.Create($"Gerät {i}", "web", Security.Permissions.Default, null);
        var code = (await admin.Ok("pairing.create")).GetProperty("code").GetString();
        var extra = new TestClient(s.Rpc, new TestChannel("192.168.1.77"));
        await extra.Ok("hello");
        Assert.Equal("device-limit", await extra.Error("pairing.request", new { code, deviceName = "Zu viel", platform = "iPad" }));
        Assert.Equal("device-limit", await extra.Error("pairing.handoff", new { code = handoff }));
        var list = await admin.Ok("devices.list");
        Assert.Equal(Security.DeviceStore.MaxDevices, list.GetProperty("max").GetInt32());
        Assert.True(list.GetProperty("pc").GetProperty("online").GetBoolean());
    }

    [Fact]
    public async Task Three_devices_are_managed_independently()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (iphone, iphoneId, _) = await Fixtures.PairedDevice(s, admin);
        var (ipad, ipadId, _) = await Fixtures.PairedDevice(s, admin);
        var (third, thirdId, _) = await Fixtures.PairedDevice(s, admin);
        await admin.Ok("devices.rename", new { id = ipadId, name = "iPad Wohnzimmer" });
        await admin.Ok("devices.revoke", new { id = iphoneId });
        await Task.Delay(100);
        Assert.Contains(iphone.Channel.Events("auth.revoked"), _ => true);
        await ipad.Ok("library.list");
        await third.Ok("library.list");
        var names = (await admin.Ok("devices.list")).GetProperty("devices").EnumerateArray().Select(d => d.GetProperty("name").GetString()).ToList();
        Assert.Contains("iPad Wohnzimmer", names);
        Assert.Equal(2, names.Count);
        Assert.Contains(thirdId, (await admin.Ok("devices.list")).GetProperty("devices").EnumerateArray().Select(d => d.GetProperty("id").GetString()));
    }

    static async Task<(string id, string marker)> AddFakeGame(Services.CompanionServices s, TestClient admin, TempDir dir, bool counting = false)
    {
        var exe = Path.Combine(dir.Path, "fake-game.sh");
        var marker = Path.Combine(dir.Path, "started.txt");
        File.WriteAllText(exe, $"#!/bin/sh\necho ok {(counting ? ">>" : ">")} '{marker}'\n");
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(exe, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var item = await admin.Ok("library.addPath", new { path = exe, kind = "game", name = "Fake Game" });
        return (item.GetProperty("id").GetString()!, marker);
    }
}
