using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Services;

namespace Pgl.Core.Tests;

public class PluginTests
{
    static string RepoRoot()
    {
        var d = new DirectoryInfo(AppContext.BaseDirectory);
        while (d != null && !File.Exists(Path.Combine(d.FullName, "VERSION"))) d = d.Parent;
        return d?.FullName ?? throw new InvalidOperationException("Repository root not found");
    }

    static byte[] Zip(Dictionary<string, string> files)
    {
        using var ms = new MemoryStream();
        using (var z = new ZipArchive(ms, ZipArchiveMode.Create, true))
            foreach (var (name, text) in files)
            {
                using var w = new StreamWriter(z.CreateEntry(name).Open());
                w.Write(text);
            }
        return ms.ToArray();
    }

    static byte[] Folder(string dir) => Zip(Directory.GetFiles(dir, "*", SearchOption.AllDirectories)
        .ToDictionary(f => Path.GetRelativePath(dir, f).Replace('\\', '/'), File.ReadAllText));

    static string Manifest(string id = "de.test.plugin", string version = "1.0.0", string permissions = "[\"history.read\"]", string contributes = "{\"widgets\":[{\"id\":\"w\",\"title\":\"W\",\"entry\":\"w.html\",\"height\":120}]}", string extra = "") =>
        $$"""{"id":"{{id}}","name":"Test","version":"{{version}}","apiVersion":1,"minAppVersion":"1.0.0","author":"Ich","description":"x","category":"information","platforms":["web","windows"],"permissions":{{permissions}},"contributes":{{contributes}}{{extra}}}""";

    static byte[] Pkg(string manifest, params (string name, string text)[] more)
    {
        var files = new Dictionary<string, string> { ["plugin.json"] = manifest, ["w.html"] = "<p>hi</p>" };
        foreach (var (n, t) in more) files[n] = t;
        return Zip(files);
    }

    static PluginService Service(TempDir dir, HttpMessageHandler? http = null, string? catalogUrl = null)
    {
        var settings = new Settings();
        if (catalogUrl != null) settings.PluginCatalogUrl = catalogUrl;
        return new PluginService(new AppPaths(dir.Path), new NullHub(), () => settings, http);
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);
    static JsonElement Installed(PluginService p, string id) => J(p.List()).GetProperty("plugins").EnumerateArray().Single(x => x.GetProperty("id").GetString() == id);

    [Fact]
    public void Example_plugins_in_the_repository_are_valid()
    {
        var examples = Path.Combine(RepoRoot(), "plugins", "examples");
        var packages = Directory.GetDirectories(examples).Select(d => PluginService.Validate(Folder(d))).ToList();
        var ids = packages.Select(p => p.Manifest.Id).ToList();
        Assert.Contains("de.pgl.spielzeit-heute", ids);
        Assert.Contains("de.pgl.neon-themes", ids);
        Assert.Contains("de.pgl.gaming-abend", ids);
        Assert.Contains("de.pgl.wochen-statistik", ids);
        Assert.Contains("de.pgl.clip-knopf", ids);
        Assert.True(ids.Count >= 33);
        Assert.All(packages, p => Assert.Empty(p.Warnings));
    }

    [Theory]
    [InlineData("../evil.html", "Unzulässiger Dateipfad")]
    [InlineData("tool.exe", "Dateityp nicht erlaubt")]
    [InlineData("script.ps1", "Dateityp nicht erlaubt")]
    public void Dangerous_files_are_refused(string name, string message)
    {
        var ex = Assert.Throws<RpcException>(() => PluginService.Validate(Pkg(Manifest(), (name, "x"))));
        Assert.Contains(message, ex.Message);
    }

    [Theory]
    [InlineData("{\"id\":\"Böse ID\"}", "Ungültige Plugin-ID")]
    public void Broken_manifests_are_refused(string manifest, string message) =>
        Assert.Contains(message, Assert.Throws<RpcException>(() => PluginService.Validate(Pkg(manifest))).Message);

    [Fact]
    public void Manifest_rules_permissions_actions_and_compatibility()
    {
        string Err(string m) => Assert.Throws<RpcException>(() => PluginService.Validate(Pkg(m))).Message;
        Assert.Contains("Unbekannte Berechtigung", Err(Manifest(permissions: "[\"system.root\"]")));
        Assert.Contains("braucht die Berechtigung", Err(Manifest(permissions: "[]", contributes: "{\"actions\":[{\"id\":\"a\",\"name\":\"A\",\"steps\":[{\"type\":\"stopAllSounds\"}]}]}")));
        // Item IDs differ on every PC: actions must refer to a setting, never to a fixed ID.
        Assert.Contains("muss auf eine Einstellung verweisen", Err(Manifest(permissions: "[\"library.launch\"]", contributes: "{\"actions\":[{\"id\":\"a\",\"name\":\"A\",\"steps\":[{\"type\":\"launchItem\",\"ref\":\"item_123\"}]}]}")));
        Assert.Contains("Benötigt Launcher-Version", Err(Manifest().Replace("\"minAppVersion\":\"1.0.0\"", "\"minAppVersion\":\"99.0.0\"")));
        Assert.Contains("MAJOR.MINOR.PATCH", Err(Manifest(version: "1.0")));
        Assert.Contains("Einstiegsdatei", Err(Manifest(contributes: "{\"widgets\":[{\"id\":\"w\",\"title\":\"W\",\"entry\":\"fehlt.html\",\"height\":120}]}")));
    }

    [Fact]
    public void Install_starts_disabled_and_needs_all_permissions_granted()
    {
        using var dir = new TempDir();
        var p = Service(dir);
        p.Install(Pkg(Manifest()), "unverified", "Datei");
        var x = Installed(p, "de.test.plugin");
        Assert.False(x.GetProperty("enabled").GetBoolean());
        Assert.Throws<RpcException>(() => p.Files("de.test.plugin", preview: false));   // not running while disabled
        Assert.NotNull(p.Files("de.test.plugin", preview: true));                       // test mode preview
        Assert.Equal("permissions", Assert.Throws<RpcException>(() => p.Enable("de.test.plugin", Array.Empty<string>())).Code);
        p.Enable("de.test.plugin", new[] { "history.read" });
        Assert.True(Installed(p, "de.test.plugin").GetProperty("enabled").GetBoolean());
        p.Revoke("de.test.plugin", "history.read");
        Assert.Equal(0, Installed(p, "de.test.plugin").GetProperty("granted").GetArrayLength());
        Assert.Equal("history.read", Installed(p, "de.test.plugin").GetProperty("missingPermissions")[0].GetString());
    }

    [Fact]
    public void Updates_need_a_newer_version_new_permissions_disable_and_rollback_works()
    {
        using var dir = new TempDir();
        var p = Service(dir);
        p.Install(Pkg(Manifest()), "unverified", "Datei");
        p.Enable("de.test.plugin", new[] { "history.read" });
        Assert.Equal("version", Assert.Throws<RpcException>(() => p.Install(Pkg(Manifest()), "unverified", "Datei")).Code);
        p.Install(Pkg(Manifest(version: "1.1.0", permissions: "[\"history.read\",\"network\"]")), "unverified", "Datei");
        var x = Installed(p, "de.test.plugin");
        Assert.Equal("1.1.0", x.GetProperty("version").GetString());
        Assert.False(x.GetProperty("enabled").GetBoolean()); // new permission → must be confirmed again
        Assert.Contains("network", x.GetProperty("disabledReason").GetString());
        p.Rollback("de.test.plugin");
        Assert.Equal("1.0.0", Installed(p, "de.test.plugin").GetProperty("version").GetString());
        p.Uninstall("de.test.plugin");
        Assert.Empty(Directory.GetFiles(Path.Combine(dir.Path, "plugins"), "*.pglplugin"));
    }

    [Fact]
    public void Repeated_errors_disable_the_plugin()
    {
        using var dir = new TempDir();
        var p = Service(dir);
        string? notified = null;
        p.Notify = (title, _) => notified = title;
        p.Install(Pkg(Manifest()), "unverified", "Datei");
        p.Enable("de.test.plugin", new[] { "history.read" });
        for (var i = 0; i < 5; i++) p.ReportError("de.test.plugin", "TypeError " + i);
        var x = Installed(p, "de.test.plugin");
        Assert.False(x.GetProperty("enabled").GetBoolean());
        Assert.Contains("zu viele Fehler", x.GetProperty("disabledReason").GetString());
        Assert.NotNull(notified);
    }

    [Fact]
    public async Task Actions_use_settings_and_respect_revoked_permissions()
    {
        using var dir = new TempDir();
        var p = Service(dir);
        var ran = new List<ActionStep>();
        p.RunSteps = (steps, by) => { ran.AddRange(steps); return Task.FromResult(new List<string> { "Sound gestartet" }); };
        var contributes = "{\"settings\":[{\"key\":\"s\",\"label\":\"Sound\",\"type\":\"sound\"}],\"actions\":[{\"id\":\"go\",\"name\":\"Go\",\"steps\":[{\"type\":\"playSound\",\"ref\":\"{config:s}\"}]}]}";
        p.Install(Pkg(Manifest(permissions: "[\"sounds.play\"]", contributes: contributes)), "unverified", "Datei");
        p.Enable("de.test.plugin", new[] { "sounds.play" });
        Assert.Equal("config", (await Assert.ThrowsAsync<RpcException>(() => p.RunAction("de.test.plugin", "go", "test"))).Code);
        p.SetConfig("de.test.plugin", J(new { s = "snd_42" }));
        await p.RunAction("de.test.plugin", "go", "test");
        Assert.Equal("snd_42", ran.Single().Ref);
        p.Revoke("de.test.plugin", "sounds.play");
        Assert.Equal("forbidden", (await Assert.ThrowsAsync<RpcException>(() => p.RunAction("de.test.plugin", "go", "test"))).Code);
    }

    [Fact]
    public void Dependencies_are_checked()
    {
        using var dir = new TempDir();
        var p = Service(dir);
        p.Install(Pkg(Manifest(id: "de.test.child", extra: ",\"dependencies\":{\"de.test.base\":\">=1.0.0\"}")), "unverified", "Datei");
        Assert.Equal("dependencies", Assert.Throws<RpcException>(() => p.Enable("de.test.child", new[] { "history.read" })).Code);
        p.Install(Pkg(Manifest(id: "de.test.base")), "unverified", "Datei");
        p.Enable("de.test.base", new[] { "history.read" });
        p.Enable("de.test.child", new[] { "history.read" });
        Assert.Equal("in-use", Assert.Throws<RpcException>(() => p.Uninstall("de.test.base")).Code);
    }

    // ------------------------------------------------------------ signed catalog

    static readonly ECDsa Key = ECDsa.Create(ECCurve.NamedCurves.nistP256);

    sealed class FakeCatalog(byte[] catalog, string signature, Dictionary<string, byte[]> files) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var path = r.RequestUri!.AbsolutePath;
            byte[]? body = path.EndsWith("catalog.json") ? catalog : path.EndsWith("catalog.json.sig") ? Encoding.ASCII.GetBytes(signature) : files.GetValueOrDefault(path.Split('/').Last());
            return Task.FromResult(body == null ? new HttpResponseMessage(HttpStatusCode.NotFound) : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(body) });
        }
    }

    static (FakeCatalog site, byte[] pkg) Catalog(bool tamperPackage = false, bool badSignature = false)
    {
        var pkg = Pkg(Manifest(id: "de.pgl.demo"));
        var entry = new { id = "de.pgl.demo", name = "Demo", version = "1.0.0", description = "", author = "PGL", category = "information", platforms = new[] { "web" }, permissions = new[] { "history.read" },
            minAppVersion = "1.0.0", trust = "official", url = "https://example.org/plugins/demo.pglplugin", sha256 = Ids.Sha256Hex(pkg), size = pkg.Length };
        var cat = JsonSerializer.SerializeToUtf8Bytes(new { version = 1, plugins = new[] { entry } });
        var sig = Convert.ToBase64String(Key.SignData(badSignature ? new byte[] { 1 } : cat, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation));
        var served = tamperPackage ? Pkg(Manifest(id: "de.pgl.demo", permissions: "[\"history.read\"]", extra: ",\"homepage\":\"https://evil.example\"")) : pkg;
        return (new FakeCatalog(cat, sig, new() { ["demo.pglplugin"] = served }), pkg);
    }

    [Fact]
    public async Task Official_catalog_must_be_signed_and_packages_must_match()
    {
        using var dir = new TempDir();
        var (site, _) = Catalog();
        var p = Service(dir, site);
        p.PublicKeyPem = Key.ExportSubjectPublicKeyInfoPem();
        var info = J(await p.CatalogInfo(refresh: true));
        Assert.True(info.GetProperty("verified").GetBoolean());
        await p.InstallFromCatalog("de.pgl.demo");
        Assert.Equal("official", Installed(p, "de.pgl.demo").GetProperty("trust").GetString());

        using var dir2 = new TempDir();
        var (tampered, _) = Catalog(tamperPackage: true);
        var p2 = Service(dir2, tampered);
        p2.PublicKeyPem = Key.ExportSubjectPublicKeyInfoPem();
        Assert.Equal("integrity", (await Assert.ThrowsAsync<RpcException>(() => p2.InstallFromCatalog("de.pgl.demo"))).Code);

        using var dir3 = new TempDir();
        var (forged, _) = Catalog(badSignature: true);
        var p3 = Service(dir3, forged);
        p3.PublicKeyPem = Key.ExportSubjectPublicKeyInfoPem();
        var bad = J(await p3.CatalogInfo(refresh: true));
        Assert.Contains("Signatur", bad.GetProperty("error").GetString());
        Assert.Equal(0, bad.GetProperty("plugins").GetArrayLength());
    }

    [Fact]
    public async Task Own_catalog_entries_count_as_unverified_and_local_files_too()
    {
        using var dir = new TempDir();
        var (site, pkg) = Catalog(badSignature: true);
        var p = Service(dir, site, catalogUrl: "https://example.org/plugins/catalog.json");
        p.PublicKeyPem = Key.ExportSubjectPublicKeyInfoPem();
        var info = J(await p.CatalogInfo(refresh: true));
        Assert.False(info.GetProperty("verified").GetBoolean());
        Assert.Equal("unverified", info.GetProperty("plugins")[0].GetProperty("trust").GetString());

        var id = p.ImportBegin(pkg.Length);
        p.ImportChunk(id, Convert.ToBase64String(pkg));
        var check = J(p.ImportEnd(id, check: true, by: "test"));
        Assert.Equal("de.pgl.demo", check.GetProperty("manifest").GetProperty("id").GetString());
        p.ImportEnd(id, check: false, by: "test");
        Assert.Equal("unverified", Installed(p, "de.pgl.demo").GetProperty("trust").GetString());
    }
}
