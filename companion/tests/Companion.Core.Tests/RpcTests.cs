using System.Text.Json;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Tests;

public class RpcTests
{
    [Fact]
    public void Every_protocol_method_is_implemented()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir); // RpcApi.Register throws if anything is missing
        Assert.Equal(s.Rpc.ProtocolPermissions.Keys.OrderBy(x => x), s.Rpc.RegisteredMethods.OrderBy(x => x));
    }

    [Fact]
    public async Task Unauthenticated_clients_can_only_hello_and_pair()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var c = new TestClient(s.Rpc);
        await c.Ok("hello");
        Assert.Equal("unauthenticated", await c.Error("library.list"));
        Assert.Equal("unauthenticated", await c.Error("library.launch", new { id = "x" }));
        Assert.Equal("unauthenticated", await c.Error("state.get"));
    }

    [Fact]
    public async Task Replayed_or_old_request_ids_are_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var c = new TestClient(s.Rpc);
        Assert.True((await c.Call("ping", null, 5)).GetProperty("ok").GetBoolean());
        var dup = await c.Call("ping", null, 5);
        Assert.Equal("replay", dup.GetProperty("e").GetProperty("code").GetString());
        var older = await c.Call("ping", null, 3);
        Assert.Equal("replay", older.GetProperty("e").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Wrong_protocol_version_and_garbage_are_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var c = new TestClient(s.Rpc);
        Assert.Equal("protocol", (await c.Raw("{\"v\":99,\"id\":1,\"m\":\"ping\"}")).GetProperty("e").GetProperty("code").GetString());
        Assert.Equal("bad-request", (await c.Raw("not json")).GetProperty("e").GetProperty("code").GetString());
        Assert.Equal("unknown-method", (await c.Raw("{\"v\":1,\"id\":2,\"m\":\"system.exec\",\"p\":{\"cmd\":\"calc\"}}")).GetProperty("e").GetProperty("code").GetString());
    }

    [Fact]
    public async Task Admin_token_only_works_on_direct_loopback()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var remote = new TestClient(s.Rpc, new TestChannel("192.168.1.9", loopback: false));
        await remote.Ok("hello");
        Assert.Equal("forbidden", await remote.Error("auth.login", new { adminToken = s.Rpc.AdminToken }));
        var relayed = new TestClient(s.Rpc, new TestChannel("127.0.0.1", loopback: false, transport: "relay"));
        Assert.Equal("forbidden", await relayed.Error("auth.login", new { adminToken = s.Rpc.AdminToken }));
        var local = new TestClient(s.Rpc, new TestChannel("127.0.0.1", loopback: true));
        Assert.Equal("auth-failed", await local.Error("auth.login", new { adminToken = "wrong-token-wrong-token" }));
        await local.Ok("auth.login", new { adminToken = s.Rpc.AdminToken });
    }

    [Fact]
    public async Task Full_pairing_flow_and_permissions()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, deviceId, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "launch" });

        await phone.Ok("library.list");
        Assert.Equal("forbidden", await phone.Error("library.remove", new { id = "x" }));      // needs manage
        Assert.Equal("forbidden", await phone.Error("library.addPath", new { path = "/bin/sh" })); // PC only
        Assert.Equal("forbidden", await phone.Error("pairing.create"));                         // PC only
        Assert.Equal("forbidden", await phone.Error("devices.list"));                           // needs admin

        var devices = await admin.Ok("devices.list");
        Assert.Contains(devices.GetProperty("devices").EnumerateArray(), d => d.GetProperty("id").GetString() == deviceId && d.GetProperty("online").GetBoolean());
    }

    [Fact]
    public async Task Revoking_a_device_closes_its_session()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, deviceId, token) = await Fixtures.PairedDevice(s, admin);
        await admin.Ok("devices.revoke", new { id = deviceId });
        Assert.Single(phone.Channel.Events("auth.revoked"));
        Assert.True(phone.Channel.Closed);
        var again = new TestClient(s.Rpc);
        var hello = await again.Ok("hello");
        Assert.Equal("auth-failed", await again.Error("auth.login", new { deviceId, proof = Fixtures.Proof(token, hello.GetProperty("nonce").GetString()!) }));
    }

    [Fact]
    public async Task Remote_device_cannot_change_network_settings_even_with_admin()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view", "manage", "admin" });
        Assert.Equal("forbidden", await phone.Error("settings.saveSecurity", new { lanAccess = false }));
        Assert.Equal("forbidden", await phone.Error("settings.saveSecurity", new { relayUrl = "wss://evil.example" }));
        await phone.Ok("settings.saveSecurity", new { publicUrl = "https://games.example.com" });
    }

    [Fact]
    public async Task Launch_of_unknown_item_returns_clear_error()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("not-found", await admin.Error("library.launch", new { id = "item_missing" }));
    }

    [Fact]
    public async Task Local_admin_can_allow_an_executable_and_launch_it()
    {
        if (OperatingSystem.IsWindows()) return; // uses a Unix executable
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var exe = Path.Combine(dir.Path, "fake-game.sh");
        var marker = Path.Combine(dir.Path, "started.txt");
        File.WriteAllText(exe, $"#!/bin/sh\necho ok > '{marker}'\n");
        File.SetUnixFileMode(exe, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        var item = await admin.Ok("library.addPath", new { path = exe, kind = "game", name = "Fake Game" });
        Assert.Equal("Fake Game", item.GetProperty("name").GetString());
        await admin.Ok("library.launch", new { id = item.GetProperty("id").GetString() });
        for (int i = 0; i < 50 && !File.Exists(marker); i++) await Task.Delay(50);
        Assert.True(File.Exists(marker), "Programm wurde nicht gestartet");
        var hist = await admin.Ok("history.get");
        Assert.True(hist.GetProperty("launches")[0].GetProperty("ok").GetBoolean());
    }

    [Fact]
    public async Task UiPrefs_are_stored_per_device()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        await admin.Ok("ui.savePrefs", new { prefs = new { theme = "x" } });
        var r = await admin.Ok("ui.getPrefs");
        Assert.Contains("\"theme\"", r.GetProperty("prefs").GetString());
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin);
        Assert.False((await phone.Ok("ui.getPrefs")).TryGetProperty("prefs", out _)); // nothing stored for the new device
    }

    [Fact]
    public async Task Settings_validation_rejects_bad_values()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("invalid-params", await admin.Error("settings.saveSecurity", new { port = 80 }));
        Assert.Equal("invalid-params", await admin.Error("settings.saveSecurity", new { relayUrl = "http://x" }));
        Assert.Equal("invalid-params", await admin.Error("settings.saveSecurity", new { relaySecret = "short" }));
        Assert.Equal("invalid-params", await admin.Error("settings.save", new { language = "fr" }));
        var set = await admin.Ok("settings.get");
        Assert.False(set.GetProperty("settings").TryGetProperty("relaySecretProtected", out _));
    }

    [Fact]
    public async Task Profiles_seeded_and_activation_reports_reason()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var list = await admin.Ok("profiles.list");
        Assert.True(list.GetProperty("profiles").GetArrayLength() >= 4);
        await admin.Ok("profiles.activate", new { id = "prof_competitive" });
        var state = await admin.Ok("state.get");
        Assert.Equal("Competitive", state.GetProperty("activeProfile").GetProperty("name").GetString());
        await admin.Ok("profiles.revert");
        Assert.Equal("prof_general", s.Profiles.Get().ActiveProfileId);
    }

    [Fact]
    public void Profile_for_game_uses_item_or_profile_assignment()
    {
        var item = new LibraryItem { Id = "g1" };
        var file = new ProfilesFile { Profiles = { new Profile { Id = "p1" }, new Profile { Id = "p2", GameIds = { "g1" } } } };
        Assert.Equal("p2", Services.CompanionServices.ProfileFor(item, file));
        item.ProfileId = "p1";
        Assert.Equal("p1", Services.CompanionServices.ProfileFor(item, file));
        item.ProfileId = "deleted";
        Assert.Equal("p2", Services.CompanionServices.ProfileFor(item, file));
    }
}
