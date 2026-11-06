using System.Net;
using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>JARVIS' ElevenLabs voice – against a fake server. Key only at the PC, only stock voices, caps, honest errors.</summary>
public class VoiceTests
{
    const string Key = "test-eleven-key-0123456789";
    const string Stock = "21m00Tcm4TlvDq8ikWAM", Cloned = "Zz9999999999AAAAbbbb";
    static readonly byte[] Mp3 = { 0xFF, 0xFB, 0x90, 0x00, 1, 2, 3, 4 };

    sealed class Fake : HttpMessageHandler
    {
        public readonly List<(string method, string url, string? key, string body)> Requests = new();
        public HttpStatusCode SpeakStatus = HttpStatusCode.OK;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var body = r.Content == null ? "" : await r.Content.ReadAsStringAsync(ct);
            var key = r.Headers.TryGetValues("xi-api-key", out var v) ? v.First() : null;
            Requests.Add((r.Method.Method, r.RequestUri!.AbsoluteUri, key, body));
            if (key != Key) return new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("{}") };
            if (r.RequestUri.AbsolutePath == "/v1/voices")
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { voices = new object[]
                {
                    new { voice_id = Stock, name = "Rachel", category = "premade", labels = new { gender = "female", accent = "american" } },
                    new { voice_id = Cloned, name = "Mein Klon", category = "cloned" },
                    new { voice_id = "Prof1111111111", name = "Community", category = "professional" },
                } })) };
            if (r.RequestUri.AbsolutePath.StartsWith("/v1/text-to-speech/"))
                return SpeakStatus == HttpStatusCode.OK ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(Mp3) } : new HttpResponseMessage(SpeakStatus) { Content = new StringContent("{}") };
            if (r.RequestUri.AbsolutePath == "/v1/speech-to-text")
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"text\":\" Starte  Among Us. \",\"language_code\":\"deu\"}") };
            return new HttpResponseMessage(HttpStatusCode.NotFound);
        }
    }

    static VoiceService Make(TempDir dir, Fake fake, Func<DateTime>? now = null) => new(new AppPaths(dir.Path), new GenericPlatform().Secrets, now, fake, "http://127.0.0.1:1");
    static void Ready(VoiceService v, string voice = Stock) => v.Configure(new VoiceService.Config { Key = Key, VoiceId = voice, VoiceName = "x", Enabled = true }, atPc: true);

    [Fact]
    public async Task Speaks_with_a_stock_voice_and_books_the_characters()
    {
        using var dir = new TempDir(); var fake = new Fake(); var v = Make(dir, fake);
        Ready(v);
        var r = await v.SpeakAsync("Hallo, ich bin JARVIS.", default);
        Assert.Equal(Mp3, Convert.FromBase64String(r.Base64));
        Assert.Equal("audio/mpeg", r.Mime);
        Assert.Equal(22, r.Chars);
        var post = fake.Requests.Last(x => x.method == "POST");
        Assert.Contains($"/v1/text-to-speech/{Stock}", post.url);
        Assert.Equal(Key, post.key);
        Assert.Contains("Hallo, ich bin JARVIS.", post.body);
        Assert.Contains("\"used\":22", JsonSerializer.Serialize(v.Status()));
    }

    [Fact]
    public async Task Only_ElevenLabs_ready_made_voices_are_listed_and_a_cloned_voice_is_refused()
    {
        using var dir = new TempDir(); var fake = new Fake(); var v = Make(dir, fake);
        Ready(v);
        var voices = await v.VoicesAsync(default);
        Assert.Equal(new[] { Stock }, voices.Select(x => x.Id));
        Assert.Equal("female", voices[0].Gender);
        Ready(v, Cloned);
        var e = await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync("Test", default));
        Assert.Equal("voice-not-stock", e.Code);
        Assert.DoesNotContain(fake.Requests, x => x.url.Contains("text-to-speech/" + Cloned)); // nothing was sent for it
    }

    [Fact]
    public void The_key_can_only_be_entered_at_the_PC_and_is_never_returned()
    {
        using var dir = new TempDir(); var v = Make(dir, new Fake());
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => v.Configure(new VoiceService.Config { Key = Key }, atPc: false)).Code);
        v.Configure(new VoiceService.Config { Key = Key }, atPc: true);
        var json = JsonSerializer.Serialize(v.Status());
        Assert.Contains("\"keySet\":true", json);
        Assert.DoesNotContain(Key, json);
        // (In the file the key is protected by the platform – DPAPI on Windows – so that is not asserted on this test platform.)
        v.Configure(new VoiceService.Config { Volume = 40 }, atPc: false); // other settings may come from a phone
        Assert.Contains("\"volume\":40", JsonSerializer.Serialize(v.Status()));
    }

    [Fact]
    public async Task It_is_off_until_switched_on_and_only_with_key_and_voice()
    {
        using var dir = new TempDir(); var fake = new Fake(); var v = Make(dir, fake);
        Assert.Equal("voice-off", (await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync("Hi", default))).Code);
        v.Configure(new VoiceService.Config { Enabled = true }, atPc: true); // no key, no voice: stays off
        Assert.Contains("\"enabled\":false", JsonSerializer.Serialize(v.Status()));
        Ready(v);
        v.Configure(new VoiceService.Config { Key = "" }, atPc: true); // removing the key switches it off
        Assert.Contains("\"enabled\":false", JsonSerializer.Serialize(v.Status()));
        Assert.Empty(fake.Requests);
    }

    [Fact]
    public async Task Monthly_cap_text_length_and_bad_input_are_enforced()
    {
        using var dir = new TempDir(); var fake = new Fake(); var v = Make(dir, fake);
        Ready(v);
        v.Configure(new VoiceService.Config { MonthlyChars = 1000 }, atPc: true);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync(new string('a', 601), default))).Code);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync("  \u0007 ", default))).Code);
        await v.SpeakAsync(new string('a', 500), default);
        await v.SpeakAsync(new string('b', 400), default);
        Assert.Equal("voice-limit", (await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync(new string('c', 200), default))).Code); // 900 + 200 > 1000
        foreach (var bad in new[] { new VoiceService.Config { Volume = 101 }, new VoiceService.Config { MonthlyChars = 10 }, new VoiceService.Config { VoiceId = "../x" }, new VoiceService.Config { Key = "zu kurz!" } })
            Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => v.Configure(bad, atPc: true)).Code);
    }

    [Fact]
    public async Task A_new_month_starts_with_a_fresh_count()
    {
        using var dir = new TempDir(); var fake = new Fake(); var now = new DateTime(2026, 11, 30, 12, 0, 0, DateTimeKind.Utc);
        var v = Make(dir, fake, () => now);
        Ready(v);
        v.Configure(new VoiceService.Config { MonthlyChars = 1000 }, atPc: true);
        await v.SpeakAsync(new string('a', 500), default);
        await v.SpeakAsync(new string('a', 400), default); // 900 of 1000 in November
        await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync(new string('a', 200), default));
        now = now.AddDays(2);
        await v.SpeakAsync(new string('a', 500), default); // December: counted from zero again
        Assert.Contains("\"used\":500", JsonSerializer.Serialize(v.Status()));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "voice-key")] [InlineData(HttpStatusCode.TooManyRequests, "voice-limit")] [InlineData(HttpStatusCode.PaymentRequired, "voice-limit")] [InlineData(HttpStatusCode.InternalServerError, "voice-unavailable")]
    public async Task ElevenLabs_errors_become_clear_messages_and_book_nothing(HttpStatusCode status, string code)
    {
        using var dir = new TempDir(); var fake = new Fake { SpeakStatus = status }; var v = Make(dir, fake);
        Ready(v);
        Assert.Equal(code, (await Assert.ThrowsAsync<RpcException>(() => v.SpeakAsync("Hallo", default))).Code);
        Assert.Contains("\"used\":0", JsonSerializer.Serialize(v.Status()));
    }

    [Fact]
    public async Task A_wrong_key_is_reported_as_such()
    {
        using var dir = new TempDir(); var v = Make(dir, new Fake());
        v.Configure(new VoiceService.Config { Key = "wrong-key-0123456789ab", VoiceId = Stock, Enabled = true }, atPc: true);
        Assert.Equal("voice-key", (await Assert.ThrowsAsync<RpcException>(() => v.VoicesAsync(default))).Code);
    }

    [Fact]
    public async Task Speech_to_text_uses_the_key_at_the_PC_needs_no_voice_and_is_counted_and_capped()
    {
        using var dir = new TempDir(); var fake = new Fake(); var v = Make(dir, fake);
        var audio = Convert.ToBase64String(new byte[4000]);
        Assert.Equal("voice-key", (await Assert.ThrowsAsync<RpcException>(() => v.TranscribeAsync(audio, "audio/webm", "de", default))).Code);       // no key yet
        v.Configure(new VoiceService.Config { Key = Key }, atPc: true);                                                                              // key only – no voice chosen, voice not switched on
        Assert.Equal("Starte Among Us.", await v.TranscribeAsync(audio, "audio/webm;codecs=opus", "de-DE", default));
        var req = fake.Requests.Single(r => r.url.EndsWith("/v1/speech-to-text"));
        Assert.Equal(Key, req.key); Assert.Contains("scribe_v1", req.body); Assert.Contains("deu", req.body);
        Assert.Equal("", await v.TranscribeAsync(Convert.ToBase64String(new byte[100]), "audio/webm", "de", default));                             // too short: nothing is sent
        Assert.Single(fake.Requests, r => r.url.EndsWith("/v1/speech-to-text"));
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => v.TranscribeAsync("###", "audio/webm", "de", default))).Code);
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => v.TranscribeAsync(Convert.ToBase64String(new byte[VoiceService.MaxAudioInBytes + 10]), "audio/webm", "de", default))).Code);
        Assert.Equal(1, JsonSerializer.SerializeToElement(v.Status()).GetProperty("sttUsed").GetInt32());
    }
}
