using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class WebPushTests
{
    static ECDiffieHellman Key(string priv, string pub)
    {
        var q = B64.Decode(pub);
        return ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, D = B64.Decode(priv), Q = new ECPoint { X = q[1..33], Y = q[33..65] } });
    }

    [Fact]
    public void Encryption_matches_the_example_of_RFC_8291()
    {
        // RFC 8291, section 5 ("Push Message Encryption Example").
        using var asKey = Key("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw", "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
        var body = WebPushService.Encrypt(Encoding.UTF8.GetBytes("When I grow up, I want to be a watermelon"),
            B64.Decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"), B64.Decode("BTBZMqHH6r4Tts7J_aSIgg"),
            asKey, B64.Decode("DGv6ra1nlYgDCS1FRnbzlw"));
        Assert.Equal("DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN", B64.Encode(body));
    }

    [Fact]
    public void The_vapid_token_is_signed_with_the_public_key_and_bound_to_the_push_service()
    {
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var jwt = WebPushService.VapidJwt(new Uri("https://fcm.googleapis.com/fcm/send/abc"), key, "https://example.org/", new DateTime(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc));
        var parts = jwt.Split('.');
        Assert.True(key.VerifyData(Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]), B64.Decode(parts[2]), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        var claims = JsonDocument.Parse(B64.Decode(parts[1])).RootElement;
        Assert.Equal("https://fcm.googleapis.com", claims.GetProperty("aud").GetString());
        Assert.Equal(new DateTimeOffset(2026, 10, 21, 0, 0, 0, TimeSpan.Zero).ToUnixTimeSeconds(), claims.GetProperty("exp").GetInt64());
    }

    [Theory]
    [InlineData("https://fcm.googleapis.com/fcm/send/x", true)]
    [InlineData("https://updates.push.services.mozilla.com/wpush/v2/x", true)]
    [InlineData("https://web.push.apple.com/x", true)]
    [InlineData("https://db5p.notify.windows.com/w/?token=x", true)]
    [InlineData("http://fcm.googleapis.com/x", false)]           // no TLS
    [InlineData("https://192.168.1.10/x", false)]                 // LAN address (SSRF)
    [InlineData("https://fcm.googleapis.com.evil.example/x", false)]
    [InlineData("https://fcm.googleapis.com:8443/x", false)]
    public void Only_the_known_push_services_are_contacted(string endpoint, bool ok)
    {
        if (ok) WebPushService.CheckEndpoint(endpoint);
        else Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => WebPushService.CheckEndpoint(endpoint)).Code);
    }

    sealed class FakePushService(HttpStatusCode code) : HttpMessageHandler
    {
        public List<(HttpRequestMessage req, byte[] body)> Got = new();
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Got.Add((request, await request.Content!.ReadAsByteArrayAsync(ct)));
            return new HttpResponseMessage(code);
        }
    }

    /// <summary>The receiving side of RFC 8291, as a browser does it – proves the phone can read what the PC sends.</summary>
    static string Decrypt(byte[] body, ECDiffieHellman ua, byte[] auth)
    {
        var salt = body[..16]; var idlen = body[20]; var asPub = body[21..(21 + idlen)];
        using var asKey = ECDiffieHellman.Create(new ECParameters { Curve = ECCurve.NamedCurves.nistP256, Q = new ECPoint { X = asPub[1..33], Y = asPub[33..65] } });
        var uaPub = new byte[] { 4 }.Concat(ua.ExportParameters(false).Q.X!).Concat(ua.ExportParameters(false).Q.Y!).ToArray();
        var ecdh = ua.DeriveRawSecretAgreement(asKey.PublicKey);
        var ikm = HKDF.Expand(HashAlgorithmName.SHA256, HKDF.Extract(HashAlgorithmName.SHA256, ecdh, auth), 32, Encoding.ASCII.GetBytes("WebPush: info\0").Concat(uaPub).Concat(asPub).ToArray());
        var prk = HKDF.Extract(HashAlgorithmName.SHA256, ikm, salt);
        var cek = HKDF.Expand(HashAlgorithmName.SHA256, prk, 16, Encoding.ASCII.GetBytes("Content-Encoding: aes128gcm\0"));
        var nonce = HKDF.Expand(HashAlgorithmName.SHA256, prk, 12, Encoding.ASCII.GetBytes("Content-Encoding: nonce\0"));
        var data = body[(21 + idlen)..];
        var plain = new byte[data.Length - 16];
        using (var gcm = new AesGcm(cek, 16)) gcm.Decrypt(nonce, data[..^16], data[^16..], plain);
        Assert.Equal(2, plain[^1]);
        return Encoding.UTF8.GetString(plain[..^1]);
    }

    [Fact]
    public async Task A_calendar_reminder_reaches_the_phone_encrypted_and_dead_or_revoked_subscriptions_are_dropped()
    {
        using var dir = new TempDir();
        var paths = new AppPaths(dir.Path);
        var http = new FakePushService(HttpStatusCode.Created);
        var paired = new HashSet<string> { "dev_phone" };
        var push = new WebPushService(paths, new GenericPlatform().Secrets, id => paired.Contains(id), http);
        using var ua = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        var q = ua.ExportParameters(false).Q;
        var auth = RandomNumberGenerator.GetBytes(16);
        push.Subscribe("dev_phone", "https://fcm.googleapis.com/fcm/send/abc", B64.Encode(new byte[] { 4 }.Concat(q.X!).Concat(q.Y!).ToArray()), B64.Encode(auth), new[] { "calendar", "bogus" });
        Assert.Equal(new[] { "calendar" }, push.ForDevice("dev_phone")[0].Categories);

        push.OnNotification(new Notification { Key = "launch:x", Category = "launch", Severity = Severity.Error, Title = "Start fehlgeschlagen" }); // not chosen
        push.OnNotification(new Notification { Key = "calendar:cal_1", Category = "calendar", Severity = Severity.Warning, Title = "Raid – in 15 Minuten", Message = "Beginn 20:00 Uhr", Link = "/calendar" });
        for (var i = 0; i < 50 && http.Got.Count == 0; i++) await Task.Delay(20);
        await Task.Delay(100);
        var (req, body) = Assert.Single(http.Got);
        Assert.Equal("aes128gcm", req.Content!.Headers.ContentEncoding.Single());
        Assert.StartsWith("vapid t=", req.Headers.GetValues("Authorization").Single());
        var msg = JsonDocument.Parse(Decrypt(body, ua, auth)).RootElement;
        Assert.Equal("Raid – in 15 Minuten", msg.GetProperty("title").GetString());
        Assert.Equal("/calendar", msg.GetProperty("link").GetString());

        var gone = new WebPushService(paths, new GenericPlatform().Secrets, id => paired.Contains(id), new FakePushService(HttpStatusCode.Gone));
        Assert.NotNull(await gone.SendAsync(gone.ForDevice("dev_phone")[0], "{}"));
        Assert.Empty(gone.ForDevice("dev_phone")); // expired at the push service: removed

        push.Subscribe("dev_phone", "https://fcm.googleapis.com/fcm/send/def", B64.Encode(new byte[] { 4 }.Concat(q.X!).Concat(q.Y!).ToArray()), B64.Encode(auth), null);
        paired.Clear(); // device revoked on the PC
        Assert.Equal("Gerät nicht mehr gekoppelt.", await push.SendAsync(push.ForDevice("dev_phone")[0], "{}"));
        Assert.Empty(push.ForDevice("dev_phone"));
    }

    [Fact]
    public async Task Push_setup_needs_a_paired_device_and_valid_keys()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (phone, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var info = await phone.Ok("push.info");
        Assert.Equal(65, B64.Decode(info.GetProperty("publicKey").GetString()!).Length);
        Assert.Equal("not-supported", await admin.Error("push.subscribe", new { endpoint = "https://fcm.googleapis.com/x", p256dh = "AA", auth = "AA" }));
        Assert.Equal("invalid-params", await phone.Error("push.subscribe", new { endpoint = "https://fcm.googleapis.com/x", p256dh = "AAAA", auth = "AAAA" }));
        Assert.Equal("invalid-params", await phone.Error("push.subscribe", new { endpoint = "https://10.0.0.1/x", p256dh = "AAAA", auth = "AAAA" }));
        Assert.Equal("not-found", await phone.Error("push.test"));
        Assert.DoesNotContain(File.ReadAllText(s.Paths.File("webpush.json")), "\"d\""); // the private key is not stored in the clear as a field "d"
    }
}
