using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class ProcessUsageTests
{
    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o, Json.Options);

    [Fact]
    public async Task Sortiert_nach_RAM_und_CPU_und_misst_nicht_bei_jeder_Frage_neu()
    {
        var calls = 0;
        var svc = new ProcessUsageService(_ => { calls++; return Task.FromResult(new List<ProcUsage> { new("chrome", 1800, 4, 12), new("Game", 6200, 61, 1), new("Discord", 450, null, 5) }); });
        var r = J(await svc.TopAsync());
        Assert.Equal("Game", r.GetProperty("ram")[0].GetProperty("name").GetString());
        Assert.Equal("chrome", r.GetProperty("ram")[1].GetProperty("name").GetString());
        Assert.Equal(2, r.GetProperty("cpu").GetArrayLength()); // Discord's processor share was not readable
        await svc.TopAsync();
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Echte_Messung_liefert_Programme_mit_Speicher()
    {
        var r = J(await new ProcessUsageService().TopAsync());
        var ram = r.GetProperty("ram");
        Assert.True(ram.GetArrayLength() > 0);
        Assert.True(ram[0].GetProperty("ramMb").GetDouble() > 0);
        foreach (var c in r.GetProperty("cpu").EnumerateArray()) Assert.InRange(c.GetProperty("cpuPercent").GetDouble(), 0, 100);
    }
}
