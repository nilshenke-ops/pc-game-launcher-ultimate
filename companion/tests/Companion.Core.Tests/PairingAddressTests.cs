using Pgl.Core.Api;
using Xunit;

namespace Pgl.Core.Tests;

public class PairingAddressTests
{
    static readonly (string, string)[] WithTailscaleHttps =
    {
        ("https://gaming.tail72a60b.ts.net", "tailscale-https"),
        ("http://gaming.fritz.box:8787", "router"),
        ("http://192.168.178.116:8787", "lan"),
        ("http://gaming.tail72a60b.ts.net:8787", "tailscale"),
    };

    [Fact]
    public void QR_code_opens_the_Wi_Fi_IP_first_when_the_https_name_only_works_inside_Tailscale()
    {
        var urls = RpcApi.OrderPairingUrls(WithTailscaleHttps, "https://nilshenke-ops.github.io/pc-game-launcher-ultimate", "KKEP-9VMG");
        Assert.Equal("http://192.168.178.116:8787/#/pair?code=KKEP-9VMG", urls[0]); // the phone next to the PC, same Wi-Fi
        // The website link with the Tailscale address stays selectable, the router name comes after it.
        Assert.Equal("https://nilshenke-ops.github.io/pc-game-launcher-ultimate/#/pair?code=KKEP-9VMG&pc=gaming.tail72a60b.ts.net", urls[1]);
        Assert.True(urls.IndexOf("http://gaming.fritz.box:8787/#/pair?code=KKEP-9VMG") > urls.IndexOf("https://gaming.tail72a60b.ts.net/#/pair?code=KKEP-9VMG"));
    }

    [Fact]
    public void An_own_public_address_works_everywhere_and_leads()
    {
        var urls = RpcApi.OrderPairingUrls(new[] { ("https://pc.example.org", "public"), ("http://192.168.178.116:8787", "lan") }, "https://site.example", "ABCD-EFGH");
        Assert.Equal("https://site.example/#/pair?code=ABCD-EFGH&pc=pc.example.org", urls[0]);
    }

    [Fact]
    public void PC_address_to_type_is_https_or_else_the_IP_never_a_name_phones_cannot_resolve()
    {
        Assert.Equal("gaming.tail72a60b.ts.net", RpcApi.PickPcAddress(WithTailscaleHttps));
        Assert.Equal("http://192.168.178.116:8787", RpcApi.PickPcAddress(new[] { ("http://gaming.fritz.box:8787", "router"), ("http://192.168.178.116:8787", "lan"), ("http://gaming.local:8787", "mdns") }));
        Assert.Null(RpcApi.PickPcAddress(Array.Empty<(string, string)>()));
        // Without an https address the website (https) gets no link at all – only the direct ones.
        var urls = RpcApi.OrderPairingUrls(new[] { ("http://gaming.fritz.box:8787", "router"), ("http://192.168.178.116:8787", "lan") }, "https://site.example", "ABCD-EFGH");
        Assert.Equal("http://192.168.178.116:8787/#/pair?code=ABCD-EFGH", urls[0]);
        Assert.DoesNotContain(urls, u => u.StartsWith("https://site.example"));
    }
}
