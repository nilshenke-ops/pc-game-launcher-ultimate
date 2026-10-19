using Pgl.Core.Infrastructure;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class LanAddressWatchTests
{
    [Fact]
    public void Reports_a_new_address_only_when_phones_are_paired_and_none_of_the_old_ones_is_left()
    {
        using var dir = new TempDir();
        var ips = new List<string> { "192.168.178.20" };
        var paired = false;
        var reports = new List<string>();
        LanAddressWatch W() => new(new AppPaths(dir.Path), () => ips, () => paired) { Changed = (o, n) => reports.Add($"{string.Join(",", o)}>{string.Join(",", n)}") };

        Assert.False(W().Check()); // first start: remembers the address
        ips = new() { "192.168.178.20", "10.0.0.5" };
        Assert.False(W().Check()); // second adapter added, old one still there
        ips = new();
        Assert.False(W().Check()); // Wi-Fi not up yet: no comparison, nothing forgotten
        ips = new() { "192.168.178.31" };
        Assert.False(W().Check()); // changed, but no phone paired → nobody to warn
        Assert.Empty(reports);
        ips = new() { "192.168.178.44" };
        paired = true;
        Assert.True(W().Check()); // changed again after a restart, with a paired phone
        Assert.Equal("192.168.178.31>192.168.178.44", Assert.Single(reports));
        Assert.False(W().Check()); // same address: reported only once
    }
}
