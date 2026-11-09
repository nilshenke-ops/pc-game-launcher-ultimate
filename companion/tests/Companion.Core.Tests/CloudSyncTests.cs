using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CloudSyncTests
{
    static readonly byte[] Key = Enumerable.Range(1, 32).Select(i => (byte)i).ToArray();
    static readonly string Enc = Convert.ToBase64String(Key);

    [Fact]
    public void Sealed_data_opens_with_the_account_key_only_and_is_not_readable()
    {
        var json = "{\"items\":[{\"id\":\"g1\",\"name\":\"Hollow Knight\"}]}";
        var blob = CloudSyncService.Seal(Key, json);
        Assert.StartsWith("g1.", blob);
        Assert.DoesNotContain("Hollow", blob);
        Assert.Equal(json, CloudSyncService.Open(Key, blob));
        var other = Key.Select(b => (byte)(b ^ 1)).ToArray();
        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => CloudSyncService.Open(other, blob));
        Assert.NotEqual(blob, CloudSyncService.Seal(Key, json));                    // a new random IV every time
    }

    [Theory]
    [InlineData("https://nexus.example.workers.dev", "https://nexus.example.workers.dev")]
    [InlineData("https://nexus.example.dev/base/", "https://nexus.example.dev/base")]
    [InlineData("http://127.0.0.1:8799", "http://127.0.0.1:8799")]
    [InlineData("http://192.168.1.5:8799", null)]                                  // plain http only on this PC itself
    [InlineData("ftp://example.org", null)]
    [InlineData("https://user:pw@example.org", null)]
    [InlineData("", null)]
    public void Only_https_cloud_addresses(string raw, string? expected) => Assert.Equal(expected, CloudSyncService.NormalizeApi(raw));

    [Fact]
    public void What_changes_every_few_seconds_is_not_part_of_the_copy()
    {
        var a = CloudSyncService.Volatile("state.get", "{\"pcName\":\"PC\",\"running\":[{\"id\":\"x\"}],\"playing\":{\"playing\":[1],\"queued\":2},\"me\":{\"name\":\"Cloud\"}}");
        var b = CloudSyncService.Volatile("state.get", "{\"pcName\":\"PC\",\"running\":[],\"playing\":{\"playing\":[],\"queued\":0},\"me\":{\"name\":\"iPad\"}}");
        Assert.Equal(a, b);
        Assert.Contains("\"pcName\":\"PC\"", a);
        Assert.Equal("{\"x\":1}", CloudSyncService.Volatile("quick.list", "{\"x\":1}"));
    }

    // ------------------------------------------------------------------ a small stand-in for the cloud service (same answers as cloud-account-worker/src/sync.js)

    sealed class FakeCloud : HttpMessageHandler
    {
        public readonly Dictionary<string, (string ver, List<string> parts)> Items = new();
        public readonly List<(string id, string blob, string device)> Ops = new();
        public readonly List<string> Calls = new();
        public bool Offline;
        public string? Token;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (Offline) throw new HttpRequestException("offline");
            var action = request.RequestUri!.AbsolutePath.Split('/').Last();
            Calls.Add(action);
            var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(ct))!.AsObject();
            object answer;
            switch (action)
            {
                case "token":
                    if (body["key"]!.GetValue<string>() != new string('a', 64)) return new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("{\"ok\":false,\"error\":\"unauthorized\",\"message\":\"Benutzername oder Passwort falsch.\"}") };
                    Token = new string('f', 64); answer = new { ok = true, token = Token }; break;
                case "push":
                    if (body["token"]!.GetValue<string>() != Token) return new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("{}") };
                    foreach (var it in body["items"]!.AsArray()) Items[it!["item"]!.GetValue<string>()] = (it["ver"]!.GetValue<string>(), it["parts"]!.AsArray().Select(p => p!.GetValue<string>()).ToList());
                    answer = new { ok = true, seq = 1 }; break;
                case "pull":
                    answer = new { ok = true, seq = 1, items = Array.Empty<object>(), ops = Ops.Select(o => new { id = o.id, blob = o.blob, at = "2026-11-09T10:00:00Z", device = o.device }) }; break;
                case "ack":
                    var ids = body["ids"]!.AsArray().Select(x => x!.GetValue<string>()).ToHashSet();
                    Ops.RemoveAll(o => ids.Contains(o.id)); answer = new { ok = true, seq = 2 }; break;
                default: answer = new { ok = true }; break;
            }
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(answer), Encoding.UTF8, "application/json") };
        }
        public string ItemJson(string item) => CloudSyncService.Open(Key, string.Concat(Items[item].parts));
    }

    /// <summary>The PC's answers – library and settings that the "methods" change, like the real ones.</summary>
    sealed class FakePc
    {
        public JsonObject Library = JsonNode.Parse("{\"items\":[{\"id\":\"g1\",\"name\":\"Hollow Knight\",\"favorite\":false,\"categories\":[],\"rating\":0},{\"id\":\"g2\",\"name\":\"Celeste\",\"favorite\":true,\"categories\":[\"Indie\"],\"rating\":4}],\"installed\":{},\"running\":[]}")!.AsObject();
        public JsonObject Settings = JsonNode.Parse("{\"settings\":{\"pcName\":\"GAMING\",\"theme\":\"dark\"}}")!.AsObject();
        public List<string> Calls = new();
        public Task<object?> Invoke(string method, JsonElement p)
        {
            Calls.Add(method);
            switch (method)
            {
                case "library.list": return Task.FromResult<object?>(JsonDocument.Parse(Library.ToJsonString()).RootElement.Clone());
                case "settings.get": return Task.FromResult<object?>(JsonDocument.Parse(Settings.ToJsonString()).RootElement.Clone());
                case "library.update":
                    var id = p.GetProperty("id").GetString();
                    var item = Library["items"]!.AsArray().First(i => i!["id"]!.GetValue<string>() == id)!.AsObject();
                    foreach (var prop in p.EnumerateObject()) if (prop.Name != "id") item[prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
                    return Task.FromResult<object?>(true);
                case "settings.save":
                    foreach (var prop in p.EnumerateObject()) Settings["settings"]![prop.Name] = JsonNode.Parse(prop.Value.GetRawText());
                    return Task.FromResult<object?>(true);
                default: throw new RpcException("unknown-method", method);   // an item the PC does not offer is skipped
            }
        }
        public JsonObject Item(string id) => Library["items"]!.AsArray().First(i => i!["id"]!.GetValue<string>() == id)!.AsObject();
    }

    static (CloudSyncService sync, FakeCloud cloud, FakePc pc, TempDir dir) Make()
    {
        var dir = new TempDir();
        var cloud = new FakeCloud(); var pc = new FakePc();
        var sync = new CloudSyncService(new AppPaths(dir.Path), new GenericPlatform().Secrets, pc.Invoke, () => "GAMING", new NullHub(), cloud);
        return (sync, cloud, pc, dir);
    }

    static string Op(string method, object @params, object? @base = null) =>
        CloudSyncService.Seal(Key, JsonSerializer.Serialize(new { method, @params, @base, at = "2026-11-09T10:00:00Z", device = "iPad" }));

    [Fact]
    public async Task Linking_needs_the_right_account_key_and_then_the_PC_uploads_its_data_sealed()
    {
        var (sync, cloud, pc, dir) = Make();
        using var _ = dir; using var __ = sync;
        var bad = await Assert.ThrowsAsync<RpcException>(() => sync.LinkAsync("https://cloud.example", "nils", new string('b', 64), Enc));
        Assert.Equal("unauthorized", bad.Code);
        Assert.False(sync.Linked);
        await sync.LinkAsync("https://cloud.example", "nils", new string('a', 64), Enc);
        Assert.True(sync.Linked);
        Assert.True(await sync.SyncAsync(force: true));
        Assert.Contains("Hollow Knight", cloud.ItemJson("library.list"));
        Assert.Contains("GAMING", cloud.ItemJson("settings.get"));
        Assert.DoesNotContain("Hollow", string.Concat(cloud.Items["library.list"].parts));    // only ciphertext in the cloud
        // Nothing changed → nothing sent again; a change on the PC → only that item.
        cloud.Calls.Clear();
        Assert.True(await sync.SyncAsync(force: true));
        Assert.DoesNotContain("push", cloud.Calls);
        pc.Item("g1")["favorite"] = true;
        var verBefore = cloud.Items["settings.get"].ver;
        Assert.True(await sync.SyncAsync(force: true));
        Assert.Contains("\"favorite\":true", cloud.ItemJson("library.list").Replace(" ", ""));
        Assert.Equal(verBefore, cloud.Items["settings.get"].ver);
        // The login key is not stored at all; token and data key go through the platform's protector (DPAPI on Windows; "plain:" in this
        // test platform – which is why only the protector's use is checked here, not that the text is unreadable).
        var file = File.ReadAllText(Path.Combine(dir.Path, "cloudsync.json"));
        Assert.DoesNotContain(new string('a', 64), file);
        Assert.Contains(new GenericPlatform().Secrets.Protect(cloud.Token!), file);
    }

    [Fact]
    public async Task Offline_nothing_is_lost_and_it_is_sent_as_soon_as_the_cloud_answers_again()
    {
        var (sync, cloud, pc, dir) = Make();
        using var _ = dir; using var __ = sync;
        await sync.LinkAsync("https://cloud.example", "nils", new string('a', 64), Enc);
        Assert.True(await sync.SyncAsync(force: true));
        cloud.Offline = true;
        pc.Item("g2")["rating"] = 5;
        Assert.False(await sync.SyncAsync(force: true));
        Assert.Contains("\"state\":\"unreachable\"", Json.Serialize(sync.Status()));
        cloud.Offline = false;
        Assert.True(await sync.SyncAsync(force: true));
        Assert.Contains("\"rating\":5", cloud.ItemJson("library.list").Replace(" ", ""));
        Assert.Contains("\"state\":\"ok\"", Json.Serialize(sync.Status()));
    }

    [Fact]
    public async Task Changes_from_another_device_are_taken_over_once_and_a_newer_change_on_the_PC_wins()
    {
        var (sync, cloud, pc, dir) = Make();
        using var _ = dir; using var __ = sync;
        await sync.LinkAsync("https://cloud.example", "nils", new string('a', 64), Enc);
        // iPad (PC off): Hollow Knight favourite + category; Celeste: rating 4 → 2 – but on the PC Celeste was meanwhile rated 5.
        pc.Item("g2")["rating"] = 5;
        cloud.Ops.Add(("op_aaaaaaaa1", Op("library.update", new { id = "g1", favorite = true, categories = new[] { "Metroidvania" } }, new { favorite = false, categories = Array.Empty<string>() }), "iPad"));
        cloud.Ops.Add(("op_aaaaaaaa2", Op("library.update", new { id = "g2", rating = 2 }, new { rating = 4 }), "iPad"));
        cloud.Ops.Add(("op_aaaaaaaa3", Op("settings.save", new { theme = "light" }, new { theme = "dark" }), "iPad"));
        cloud.Ops.Add(("op_aaaaaaaa4", Op("library.launch", new { id = "g1" }), "iPad"));               // never from the cloud
        Assert.True(await sync.SyncAsync(force: true));
        Assert.True(pc.Item("g1")["favorite"]!.GetValue<bool>());
        Assert.Equal("Metroidvania", pc.Item("g1")["categories"]![0]!.GetValue<string>());
        Assert.Equal(5, pc.Item("g2")["rating"]!.GetValue<int>());                                         // the PC's newer value stays
        Assert.Equal("light", pc.Settings["settings"]!["theme"]!.GetValue<string>());
        Assert.DoesNotContain("library.launch", pc.Calls);
        Assert.Empty(cloud.Ops);                                                                               // all taken over (acknowledged)
        Assert.Contains("rating", Json.Serialize(sync.Status()));                                             // the conflict is reported
        // The PC's copy in the cloud already shows the result.
        Assert.Contains("Metroidvania", cloud.ItemJson("library.list"));
        // The same change again (an ack got lost): not applied twice, only acknowledged.
        pc.Calls.Clear();
        cloud.Ops.Add(("op_aaaaaaaa1", Op("library.update", new { id = "g1", favorite = false }, new { favorite = false }), "iPad"));
        Assert.True(await sync.SyncAsync(force: true));
        Assert.True(pc.Item("g1")["favorite"]!.GetValue<bool>());
        Assert.DoesNotContain("library.update", pc.Calls);
    }

    [Fact]
    public async Task An_entry_deleted_on_the_PC_and_an_undecryptable_change_do_not_stop_the_sync()
    {
        var (sync, cloud, pc, dir) = Make();
        using var _ = dir; using var __ = sync;
        await sync.LinkAsync("https://cloud.example", "nils", new string('a', 64), Enc);
        cloud.Ops.Add(("op_bbbbbbbb1", Op("library.update", new { id = "gone", favorite = true }), "iPhone"));
        cloud.Ops.Add(("op_bbbbbbbb2", CloudSyncService.Seal(Key.Select(b => (byte)~b).ToArray(), "{}"), "iPhone"));
        cloud.Ops.Add(("op_bbbbbbbb3", Op("library.update", new { id = "g1", name = "Hollow Knight: Silksong" }), "iPhone"));
        Assert.True(await sync.SyncAsync(force: true));
        Assert.Equal("Hollow Knight: Silksong", pc.Item("g1")["name"]!.GetValue<string>());
        Assert.Empty(cloud.Ops);
        Assert.Contains("gibt es am PC nicht mehr", Json.Serialize(sync.Status()));
    }

    [Fact]
    public async Task Unlink_forgets_the_account_on_the_PC()
    {
        var (sync, cloud, _, dir) = Make();
        using var __ = dir; using var ___ = sync;
        await sync.LinkAsync("https://cloud.example", "nils", new string('a', 64), Enc);
        await sync.UnlinkAsync();
        Assert.False(sync.Linked);
        Assert.Contains("revoke", cloud.Calls);
        Assert.False(await sync.SyncAsync(force: true));
    }
}
