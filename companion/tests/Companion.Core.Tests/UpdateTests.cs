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
    sealed class FakeSite(string version, byte[] file, string? sha = null) : HttpMessageHandler
    {
        public readonly List<string> Calls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var url = r.RequestUri!.ToString();
            Calls.Add(url);
            if (url.EndsWith("update.json"))
            {
                var json = JsonSerializer.Serialize(new { version, url = "PCGameLauncherCompanion.exe", sha256 = sha ?? Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant(), size = file.Length });
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(file) });
        }
    }

    sealed class NoInstaller : IUpdateInstaller { public bool Supported => false; public string? Install(string f) => "nicht unterstützt"; }

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
    public async Task Newer_version_is_found_downloaded_and_verified()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var exe = Encoding.UTF8.GetBytes("neue exe");
        var u = new UpdateService(new AppPaths(dir.Path), s.Settings.Get, new NoInstaller(), s.Rpc, new FakeSite("99.0.0", exe));
        var st = JsonSerializer.SerializeToElement(await u.Check(), Json.Options);
        Assert.Equal("available", st.GetProperty("state").GetString());
        Assert.Equal("https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/PCGameLauncherCompanion.exe", st.GetProperty("available").GetProperty("url").GetString());
        st = JsonSerializer.SerializeToElement(await u.Download(), Json.Options);
        Assert.Equal("ready", st.GetProperty("state").GetString());
        Assert.True(st.GetProperty("downloaded").GetBoolean());
    }

    [Fact]
    public async Task Same_version_is_up_to_date_and_wrong_checksum_is_rejected()
    {
        using var dir = new TempDir();
        var s = Fixtures.Services(dir);
        var same = new UpdateService(new AppPaths(dir.Path), s.Settings.Get, new NoInstaller(), s.Rpc, new FakeSite(UpdateService.CurrentVersion, new byte[] { 1 }));
        Assert.Equal("up-to-date", JsonSerializer.SerializeToElement(await same.Check(), Json.Options).GetProperty("state").GetString());

        var bad = new UpdateService(new AppPaths(dir.Path), s.Settings.Get, new NoInstaller(), s.Rpc, new FakeSite("99.0.0", new byte[] { 1, 2 }, new string('a', 64)));
        await bad.Check();
        var st = JsonSerializer.SerializeToElement(await bad.Download(), Json.Options);
        Assert.Equal("error", st.GetProperty("state").GetString());
        Assert.Contains("Prüfsumme", st.GetProperty("error").GetString());
        Assert.False(st.GetProperty("downloaded").GetBoolean());
    }
}
