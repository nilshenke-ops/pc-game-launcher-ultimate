using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class UpdateTests
{
    /// <summary>Test key pair – plays the role of the publisher's signing key.</summary>
    static readonly ECDsa Key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    static string PublicPem => Key.ExportSubjectPublicKeyInfoPem();

    static string Sign(string version, string sha, long size) =>
        Convert.ToBase64String(Key.SignData(UpdateSignature.Payload(version, sha, size), HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));

    static byte[] Exe(string text) => Encoding.ASCII.GetBytes("MZ" + text);
    static string Sha(byte[] b) => Convert.ToHexString(SHA256.HashData(b)).ToLowerInvariant();

    /// <summary>Serves update.json and the file. <paramref name="manifest"/> may tamper with any field.</summary>
    sealed class FakeSite(string version, byte[] file, Func<Dictionary<string, object?>, Dictionary<string, object?>>? manifest = null, bool sign = true) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var url = r.RequestUri!.GetLeftPart(UriPartial.Path);
            if (url.EndsWith("update.json"))
            {
                var sha = Sha(file);
                var m = new Dictionary<string, object?>
                {
                    ["version"] = version, ["date"] = "2026-10-18", ["url"] = "PCGameLauncherCompanion.exe", ["sha256"] = sha, ["size"] = (long)file.Length,
                    ["changes"] = new { neu = new[] { "Plugin Center" }, verbessert = Array.Empty<string>(), behoben = Array.Empty<string>() },
                    ["signature"] = sign ? Sign(version, sha, file.Length) : null,
                };
                if (manifest != null) m = manifest(m);
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(m), Encoding.UTF8, "application/json") });
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(file) });
        }
    }

    sealed class NoInstaller : IUpdateInstaller { public bool Supported => false; public string? Install(string f) => "nicht unterstützt"; }

    static UpdateService Service(TempDir dir, CompanionServices s, HttpMessageHandler site) =>
        new(new AppPaths(dir.Path), s.Settings.Get, new NoInstaller(), s.Rpc, site) { PublicKeyPem = PublicPem };

    static async Task<JsonElement> Run(Func<Task<object>> f) => JsonSerializer.SerializeToElement(await f(), Json.Options);

    [Fact]
    public void Default_source_is_the_project_site_and_empty_switches_checks_off()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        Assert.Equal("https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/update.json", s.Settings.Get().UpdateManifestUrl);
        s.Settings.SaveSecurity(new SettingsService.SecurityUpdate { UpdateManifestUrl = "" }, s.Platform.Secrets);
        Assert.Equal("", Fixtures.Services(dir).Settings.Get().UpdateManifestUrl); // stays off after a restart
    }

    [Fact]
    public async Task Signed_newer_version_is_found_downloaded_and_verified()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var u = Service(dir, s, new FakeSite("99.0.0", Exe("neue exe")));
        var st = await Run(u.Check);
        Assert.Equal("available", st.GetProperty("state").GetString());
        var av = st.GetProperty("available");
        Assert.Equal("https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/PCGameLauncherCompanion.exe", av.GetProperty("url").GetString());
        Assert.True(av.GetProperty("signed").GetBoolean());
        Assert.Equal("Plugin Center", av.GetProperty("changes").GetProperty("neu")[0].GetString());
        st = await Run(u.Download);
        Assert.Equal("ready", st.GetProperty("state").GetString());
        Assert.True(st.GetProperty("downloaded").GetBoolean());
    }

    [Fact]
    public async Task Official_source_rejects_unsigned_and_forged_updates()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var unsigned = Service(dir, s, new FakeSite("99.0.0", Exe("x"), sign: false));
        var st = await Run(unsigned.Check);
        Assert.Equal("error", st.GetProperty("state").GetString());
        Assert.Contains("nicht signiert", st.GetProperty("error").GetString());

        // Signature belongs to a different file (e.g. swapped EXE with recomputed checksum).
        var forged = Service(dir, s, new FakeSite("99.0.0", Exe("böse"), m => { m["sha256"] = Sha(Exe("andere")); return m; }));
        st = await Run(forged.Check);
        Assert.Contains("ungültig", st.GetProperty("error").GetString());

        // Version must be MAJOR.MINOR.PATCH.
        var badVersion = Service(dir, s, new FakeSite("99.0", Exe("x")));
        Assert.Contains("MAJOR.MINOR.PATCH", (await Run(badVersion.Check)).GetProperty("error").GetString());
    }

    [Fact]
    public async Task Own_source_may_be_unsigned_but_is_marked()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        s.Settings.SaveSecurity(new SettingsService.SecurityUpdate { UpdateManifestUrl = "https://example.org/update.json" }, s.Platform.Secrets);
        var u = Service(dir, s, new FakeSite("99.0.0", Exe("x"), sign: false));
        var st = await Run(u.Check);
        Assert.Equal("available", st.GetProperty("state").GetString());
        Assert.False(st.GetProperty("available").GetProperty("signed").GetBoolean());
        Assert.False(st.GetProperty("official").GetBoolean());
    }

    [Fact]
    public async Task Same_version_is_up_to_date_and_damaged_downloads_are_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var same = Service(dir, s, new FakeSite(UpdateService.CurrentVersion, Exe("x")));
        Assert.Equal("up-to-date", (await Run(same.Check)).GetProperty("state").GetString());

        // Manifest signed for a file the server does not deliver (e.g. a broken or manipulated download).
        var file = Exe("geliefert");
        var bad = Service(dir, s, new FakeSite("99.0.0", file, m => { var sha = Sha(Exe("erwartet")); m["sha256"] = sha; m["signature"] = Sign("99.0.0", sha, file.Length); return m; }));
        await bad.Check();
        var st = await Run(bad.Download);
        Assert.Equal("error", st.GetProperty("state").GetString());
        Assert.Contains("Prüfsumme", st.GetProperty("error").GetString());
        Assert.False(st.GetProperty("downloaded").GetBoolean());

        // Correct checksum and signature, but not a Windows program.
        var notExe = Encoding.ASCII.GetBytes("<html>Fehlerseite</html>");
        var html = Service(dir, s, new FakeSite("99.0.0", notExe));
        await html.Check();
        Assert.Contains("Keine Windows-Programmdatei", (await Run(html.Download)).GetProperty("error").GetString());
        Assert.Empty(Directory.GetFiles(new AppPaths(dir.Path).UpdatesDir, "*.part"));
    }

    [Fact]
    public void Release_check_can_pretend_an_older_installed_version()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var u = Service(dir, s, new FakeSite("1.0.0", Exe("x")));
        u.VersionOverride = "0.9.0";
        Assert.Equal("0.9.0", JsonSerializer.SerializeToElement(u.Status(), Json.Options).GetProperty("current").GetString());
    }

    [Fact]
    public void Signature_from_the_release_script_is_accepted()
    {
        // Created with scripts/release-manifest.mjs' signing code (Node.js crypto, throwaway key).
        const string pub = """
            -----BEGIN PUBLIC KEY-----
            MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE51Ge2wZMOxqkL2FTiLznhgaxg1Lg
            1wUmivr9mo01tiVBT4wnZlJ1M7w/YQZsSoejLc+Nd/1tkPjmnBy8UBwUmw==
            -----END PUBLIC KEY-----
            """;
        const string sig = "URs36gKEt05DTmYRoOXdx+dwhBbpRYBoXkWjVBkpw3kit1LI8I2FBdHQ+pZ7j7jXaWMSh37xX+VoWzpvFRf+Xg==";
        var sha = string.Concat(Enumerable.Repeat("ab", 32));
        Assert.True(UpdateSignature.Verify("1.2.0", sha, 12345, sig, pub));
        Assert.False(UpdateSignature.Verify("1.2.1", sha, 12345, sig, pub));   // other version
        Assert.False(UpdateSignature.Verify("1.2.0", sha, 12346, sig, pub));   // other size
        Assert.False(UpdateSignature.Verify("1.2.0", sha, 12345, sig));        // not the project's key
        Assert.False(UpdateSignature.Verify("1.2.0", sha, 12345, "kein base64!", pub));
    }
}
