using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>File transfer by QR code (3.64): only with the secret, only after the PC allowed it, one device, encrypted pieces,
/// resume after a lost connection, expiry, revocation, refused programs and the history.</summary>
public class ShareTests
{
    sealed class Ctx : IDisposable
    {
        public readonly TempDir Dir = new();
        public readonly Settings Set = new();
        public readonly TransferService Files;
        public readonly ShareService Shares;
        public readonly List<string> Notes = new();
        public readonly CaptureHub Hub = new();
        public Ctx()
        {
            var paths = new AppPaths(Dir.Path);
            Files = new TransferService(paths, new GenericPlatform(), new NullHub(), null, () => Set);
            Directory.CreateDirectory(Files.Folder);
            Shares = new ShareService(paths, Files, Hub, () => Set, (a, b) => Notes.Add(a + ": " + b));
        }
        public void Dispose() => Dir.Dispose();
    }

    static RpcSession Phone() => new() { Channel = new TestChannel() };
    static string Prop(object o, string name) => Json.Serialize(o) is var j && System.Text.Json.JsonDocument.Parse(j).RootElement.GetProperty(name) is var e
        ? e.ValueKind == System.Text.Json.JsonValueKind.String ? e.GetString()! : e.GetRawText() : "";
    static byte[] B64u(string s) => Convert.FromBase64String(s.Replace('-', '+').Replace('_', '/') + new string('=', (4 - s.Length % 4) % 4));

    /// <summary>What the phone does: hello, prove the secret with the HMAC, join.</summary>
    static (string code, byte[] enc) Join(ShareService sh, string id, string secret, RpcSession phone, string? resume = null)
    {
        var challenge = Convert.FromBase64String(Prop(sh.Hello(id, phone), "challenge"));
        var key = B64u(secret);
        var auth = ShareService.DeriveAuth(key, id);
        var r = sh.Join(id, Convert.ToBase64String(ShareService.Mac(auth, challenge, "join")), "iPhone", resume, phone);
        if (resume == null) Assert.Equal(ShareService.CodeOf(auth, challenge), Prop(r, "code"));
        return (Prop(r, "code"), ShareService.DeriveEnc(key, id));
    }

    [Fact]
    public void PC_to_phone_needs_the_secret_and_the_PCs_ok_and_the_pieces_are_encrypted()
    {
        using var c = new Ctx();
        var content = Encoding.UTF8.GetBytes(string.Concat(Enumerable.Repeat("Nexus-", 1000)));
        File.WriteAllBytes(Path.Combine(c.Files.Folder, "bild.png"), content);
        File.WriteAllText(Path.Combine(c.Files.Folder, "geheim.txt"), "nicht teilen");
        var created = c.Shares.Create("send", new[] { "bild.png" }, "PC");
        var id = Prop(created, "id"); var secret = Prop(created, "secret");
        var phone = Phone();

        // a wrong proof is refused
        c.Shares.Hello(id, phone);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.Join(id, Convert.ToBase64String(new byte[32]), "x", null, phone)).Code);
        var (_, enc) = Join(c.Shares, id, secret, phone);
        Assert.Contains(c.Notes, n => n.Contains("Bitte am PC bestätigen"));

        // knowing the QR code is not enough: nothing before the PC allows it
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.Info(id, phone)).Code);
        c.Shares.Approve(id);
        Assert.Contains("bild.png", Json.Serialize(c.Shares.Info(id, phone)));
        // only the shared file, only for this phone
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.Read(id, "geheim.txt", 0, 1000, phone)).Code);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.Read(id, "bild.png", 0, 1000, Phone())).Code);

        var got = new List<byte>();
        long off = 0;
        while (true)
        {
            var r = c.Shares.Read(id, "bild.png", off, 2500, phone);
            var data = Prop(r, "data");
            Assert.DoesNotContain("Nexus-", Encoding.UTF8.GetString(Convert.FromBase64String(data))); // not readable on the way
            var plain = ShareService.Open(enc, data, Encoding.UTF8.GetBytes($"{id}|bild.png|{off}"));
            got.AddRange(plain); off += plain.Length;
            if (Prop(r, "eof") == "true") break;
        }
        Assert.Equal(content, got.ToArray());
        // a piece moved to another position does not decrypt
        var first = Prop(c.Shares.Read(id, "bild.png", 0, 2500, phone), "data");
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => ShareService.Open(enc, first, Encoding.UTF8.GetBytes($"{id}|bild.png|2500"))).Code);
        Assert.Equal("done", Prop(c.Shares.Done(id, "bild.png", phone), "state"));
        Assert.Contains("\"result\":\"done\"", Json.Serialize(c.Shares.List()));
    }

    [Fact]
    public void After_a_lost_connection_the_same_phone_resumes_another_device_cannot_take_over()
    {
        using var c = new Ctx();
        File.WriteAllText(Path.Combine(c.Files.Folder, "a.txt"), "hallo");
        var created = c.Shares.Create("send", new[] { "a.txt" }, "PC");
        var id = Prop(created, "id"); var secret = Prop(created, "secret");
        var phone = Phone();
        Join(c.Shares, id, secret, phone);
        c.Shares.Approve(id);
        var resume = c.Hub.Sent.Last(x => x.ev == "share.state").resume; // the token goes only to the approved phone
        Assert.NotNull(resume);
        var again = Phone();
        // a stranger with the QR secret but without the resume token cannot take the approved share
        Assert.Equal("conflict", Assert.Throws<RpcException>(() => Join(c.Shares, id, secret, Phone())).Code);
        Join(c.Shares, id, secret, again, resume);
        Assert.Contains("a.txt", Json.Serialize(c.Shares.Info(id, again)));
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.Info(id, phone)).Code); // the old connection is out
    }

    public sealed class CaptureHub : IHub
    {
        public readonly List<(string ev, string? resume)> Sent = new();
        public void Broadcast(string ev, object? data, string permission = Security.Permissions.View) { }
        public void SendTo(RpcSession session, string ev, object? data) { var j = Json.Serialize(data); Sent.Add((ev, j.Contains("\"resume\"") ? Prop(data!, "resume") : null)); }
        public void BroadcastTo(Func<RpcSession, bool> filter, string ev, object? data) { }
    }

    [Fact]
    public void Phone_to_PC_lands_in_the_folder_programs_are_refused_and_pieces_must_be_genuine()
    {
        using var c = new Ctx();
        var created = c.Shares.Create("receive", null, "PC");
        var id = Prop(created, "id"); var secret = Prop(created, "secret");
        var phone = Phone();
        var (_, enc) = Join(c.Shares, id, secret, phone);
        c.Shares.Approve(id);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.UploadBegin(id, "virus.exe", 10, phone)).Code);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.UploadBegin(id, "skript.ps1", 10, phone)).Code);
        var data = Encoding.UTF8.GetBytes("Foto vom Handy");
        var (up, _) = c.Shares.UploadBegin(id, "foto.jpg", data.Length, phone);
        // a piece encrypted with another key is refused
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => c.Shares.UploadChunk(id, up, 0, ShareService.Seal(new byte[32], data, Encoding.UTF8.GetBytes($"{id}|foto.jpg|0")), phone)).Code);
        var piece = ShareService.Seal(enc, data, Encoding.UTF8.GetBytes($"{id}|foto.jpg|0"));
        Assert.Equal(data.Length, c.Shares.UploadChunk(id, up, 0, piece, phone));
        Assert.Equal(data.Length, c.Shares.UploadChunk(id, up, 0, piece, phone)); // repeated after a lost answer: written once
        var e = c.Shares.UploadEnd(id, up, phone);
        Assert.Equal("Foto vom Handy", File.ReadAllText(Path.Combine(c.Files.Folder, e.Name)));
        Assert.Equal("done", Prop(c.Shares.Finish(id, phone), "state"));
        Assert.Contains(c.Notes, n => n.Contains("empfangen"));
    }

    [Fact]
    public void Expired_revoked_and_guessed_shares_are_closed()
    {
        using var c = new Ctx();
        File.WriteAllText(Path.Combine(c.Files.Folder, "a.txt"), "x");
        var created = c.Shares.Create("send", new[] { "a.txt" }, "PC");
        var id = Prop(created, "id"); var secret = Prop(created, "secret");
        // revoked: the code no longer works
        c.Shares.Revoke(id);
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => c.Shares.Hello(id, Phone())).Code);
        // five wrong tries close the share
        var b = c.Shares.Create("send", new[] { "a.txt" }, "PC");
        var bid = Prop(b, "id");
        var p = Phone();
        for (var i = 0; i < ShareService.MaxFailedJoins; i++) { c.Shares.Hello(bid, p); Assert.Throws<RpcException>(() => c.Shares.Join(bid, Convert.ToBase64String(new byte[32]), "x", null, p)); }
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => c.Shares.Hello(bid, p)).Code);
        // only paired devices, when switched on
        c.Set.ShareKnownOnly = true;
        var k = c.Shares.Create("send", new[] { "a.txt" }, "PC");
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => Join(c.Shares, Prop(k, "id"), Prop(k, "secret"), Phone())).Code);
        // files that are not in the folder cannot be shared; the QR code lasts the set minutes
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => c.Shares.Create("send", new[] { "../../etc/passwd" }, "PC")).Code);
        c.Set.ShareTtlMinutes = 2;
        var t = c.Shares.Create("send", new[] { "a.txt" }, "PC");
        Assert.InRange((DateTime.Parse(Prop(t, "expiresAt")).ToUniversalTime() - DateTime.UtcNow).TotalMinutes, 1.9, 2.1);
    }

    [Fact]
    public void The_receiving_folder_can_be_changed_but_not_to_a_system_folder()
    {
        using var c = new Ctx();
        var own = Path.Combine(c.Dir.Path, "Nexus Transfers");
        Assert.Equal(own, TransferService.CheckFolder(own));
        Assert.True(Directory.Exists(own));
        c.Set.TransferFolder = own;
        Assert.Equal(own, c.Files.Folder);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => TransferService.CheckFolder("relativ/pfad")).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => TransferService.CheckFolder(OperatingSystem.IsWindows() ? "C:\\" : "/")).Code);
        if (!OperatingSystem.IsWindows()) Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => TransferService.CheckFolder("/etc/nexus")).Code);
        // size limit from the settings
        c.Set.TransferMaxMb = 1;
        Assert.Equal("too-large", Assert.Throws<RpcException>(() => c.Files.UploadBegin("gross.bin", 2 * 1024 * 1024, "x")).Code);
    }

    /// <summary>The website (TypeScript, @noble) and the companion derive the same keys, proofs and codes, and read each other's pieces.</summary>
    [Fact]
    public void Website_and_companion_agree_on_keys_proofs_codes_and_pieces()
    {
        var secret = Enumerable.Range(0, 32).Select(i => (byte)i).ToArray();
        const string id = "abcDEF123_-x";
        var auth = ShareService.DeriveAuth(secret, id);
        var enc = ShareService.DeriveEnc(secret, id);
        var ch = Enumerable.Range(0, 16).Select(i => (byte)(200 - i)).ToArray();
        // values computed by web/src/lib/share-crypto.ts
        Assert.Equal("VXA/4S/P6xhVJ6IIIev96s8DQ0ESwtKyQJVKHhgCeAc=", Convert.ToBase64String(auth));
        Assert.Equal("SqN/85iY8BrBeerrDZ/yrwEgJNHf4v7W40sMjLeJcS0=", Convert.ToBase64String(enc));
        Assert.Equal("A/6urdaZqP9SgMuDfPs5/jVuHC/jK/p7hMfWLv5T8AI=", Convert.ToBase64String(ShareService.Mac(auth, ch, "join")));
        Assert.Equal("6632", ShareService.CodeOf(auth, ch));
        // a piece sealed by the website
        Assert.Equal("Hallo vom Handy", Encoding.UTF8.GetString(ShareService.Open(enc, "yGB4KEkQrH5ZfBYVIYM89sk6kmWstszFMnLadG0xPLgLQAyIFAjN/0JbIQ==", Encoding.UTF8.GetBytes(id + "|foto.jpg|4096"))));
    }
}
