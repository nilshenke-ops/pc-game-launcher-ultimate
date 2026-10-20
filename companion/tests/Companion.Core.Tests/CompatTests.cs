using System.Net;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class CompatTests
{
    // Shaped like the real answer of store.steampowered.com/api/appdetails (pc_requirements as HTML snippets).
    const string Answer = """
        {"730":{"success":true,"data":{"name":"Counter-Strike 2","pc_requirements":{
        "minimum":"<strong>Mindestanforderungen:</strong><br><ul class=\"bb_ul\"><li><strong>Betriebssystem:</strong> Windows&nbsp;10<br></li><li><strong>Prozessor:</strong> 4 hardware CPU threads - Intel® Core™ i5 750<br></li><li><strong>Arbeitsspeicher:</strong> 8 GB RAM<br></li><li><strong>Grafik:</strong> Video card must be 1 GB or more and DirectX 11 compatible<br></li><li><strong>Speicherplatz:</strong> 85 GB verfügbarer Speicherplatz</li></ul>",
        "recommended":"<strong>Empfohlen:</strong><br><ul class=\"bb_ul\"><li><strong>Arbeitsspeicher:</strong> 32 GB RAM<br></li><li><strong>Grafik:</strong> RTX 3070 mit 8 GB VRAM<br></li><li><strong>Speicherplatz:</strong> 85 GB verfügbarer Speicherplatz</li></ul>"}}}}
        """;

    sealed class FakeStore(string body, HttpStatusCode code = HttpStatusCode.OK) : HttpMessageHandler
    {
        public int Calls;
        public bool Fail;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Calls++;
            if (Fail) throw new HttpRequestException("offline");
            Assert.Contains("appids=730", request.RequestUri!.Query);
            return Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body) });
        }
    }

    sealed class Pc(long ram, long vram, long free) : IMetricsSource
    {
        public MetricsSample Sample() => new()
        {
            CpuName = "Intel Core 7 240H", MemTotalBytes = ram,
            Gpus = { new GpuSample { Name = "NVIDIA GeForce RTX 5060 Laptop GPU", MemTotalBytes = vram } },
            Disks = { new DiskSample("C:\\", "", 1_000_000_000_000, free) },
        };
    }

    const long GB = 1024L * 1024 * 1024;

    static (CompatService svc, FakeStore store) Make(TempDir dir, IMetricsSource pc)
    {
        var paths = new AppPaths(dir.Path);
        var store = new FakeStore(Answer);
        return (new CompatService(paths, pc, new LibraryService(paths, new GenericPlatform(), new NullHub()), store), store);
    }

    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public void Steam_requirement_html_becomes_readable_lines()
    {
        var lines = CompatService.ParseHtml("<strong>Minimum:</strong><br><ul><li><strong>Memory:</strong> 16 GB RAM<br></li><li><strong>Storage:</strong> 50&nbsp;GB available space</li></ul>");
        Assert.Equal(new[] { ("Memory", "16 GB RAM"), ("Storage", "50 GB available space") }, lines.Select(l => (l.Label, l.Text)));
        Assert.Empty(CompatService.ParseHtml(null));
    }

    [Fact]
    public async Task Only_numbers_are_judged_and_the_answer_is_cached()
    {
        using var dir = new TempDir();
        var (svc, store) = Make(dir, new Pc(24 * GB - 300_000_000, 8 * GB, 120 * GB)); // 24 GB laptop shows a bit less
        var r = J(await svc.CheckAsync("730", null, false));
        Assert.Equal("minimum", r.GetProperty("verdict").GetString()); // 24 GB < 32 GB recommended
        var min = r.GetProperty("minimum").GetProperty("checks").EnumerateArray().ToDictionary(c => c.GetProperty("what").GetString()!, c => c.GetProperty("verdict").GetString());
        Assert.Equal("ok", min["Arbeitsspeicher"]);
        Assert.Equal("ok", min["Speicherplatz"]);
        Assert.False(min.ContainsKey("Grafikspeicher")); // "Video card must be 1 GB" names no VRAM: not judged
        var rec = r.GetProperty("recommended").GetProperty("checks").EnumerateArray().ToDictionary(c => c.GetProperty("what").GetString()!, c => c.GetProperty("verdict").GetString());
        Assert.Equal("low", rec["Arbeitsspeicher"]);
        Assert.Equal("ok", rec["Grafikspeicher"]);
        Assert.Equal("Intel Core 7 240H", r.GetProperty("pc").GetProperty("cpu").GetString());

        await svc.CheckAsync("730", null, false);
        Assert.Equal(1, store.Calls); // cached
        store.Fail = true;
        var offline = J(await svc.CheckAsync("730", null, true)); // refresh without internet: last known requirements
        Assert.True(offline.GetProperty("fromCache").GetBoolean());
    }

    [Fact]
    public async Task Too_little_free_space_is_below_minimum_and_bad_ids_are_refused()
    {
        using var dir = new TempDir();
        var (svc, _) = Make(dir, new Pc(32 * GB, 8 * GB, 40 * GB));
        Assert.Equal("below-minimum", J(await svc.CheckAsync("730", null, false)).GetProperty("verdict").GetString());
        Assert.Equal("invalid-params", (await Assert.ThrowsAsync<RpcException>(() => svc.CheckAsync("73?0&x=1", null, false))).Code);
    }
}
