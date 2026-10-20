using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class DesignAccountTests
{
    static readonly string Key = new('a', 64), Wrong = new('b', 64);
    static JsonElement J(object o) => JsonSerializer.SerializeToElement(o);

    [Fact]
    public void A_design_profile_is_created_loaded_saved_and_only_with_the_right_key()
    {
        using var dir = new TempDir();
        var s = new DesignAccountService(new AppPaths(dir.Path));
        s.Create("Nils_99", Key, "ZW5jcnlwdGVk");
        Assert.Equal("conflict", Assert.Throws<RpcException>(() => s.Create("nils_99", Key, "eA==")).Code); // names are case-insensitive
        Assert.Equal("ZW5jcnlwdGVk", J(s.Load("NILS_99", Key, "1.2.3.4")).GetProperty("blob").GetString());
        Assert.Equal("unauthorized", Assert.Throws<RpcException>(() => s.Load("nils_99", Wrong, "1.2.3.4")).Code);
        Assert.Equal("unauthorized", Assert.Throws<RpcException>(() => s.Load("niemand", Key, "1.2.3.4")).Code); // same answer for unknown names
        s.Save("nils_99", Key, "bmV1", "1.2.3.4");
        Assert.Equal("bmV1", J(s.Load("nils_99", Key, "1.2.3.4")).GetProperty("blob").GetString());
        Assert.Throws<RpcException>(() => s.Save("nils_99", Wrong, "aGFjaw==", "1.2.3.4"));
        Assert.Equal("bmV1", J(s.Load("nils_99", Key, "1.2.3.4")).GetProperty("blob").GetString());

        // The PC never stores the key itself – only a salted hash – and cannot read the design.
        var file = File.ReadAllText(Path.Combine(dir.Path, "design-accounts.json"));
        Assert.DoesNotContain(Key, file);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => s.Create("ab", Key, "eA==")).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => s.Create("ok_name", "nothex", "eA==")).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => s.Create("ok_name", Key, new string('A', DesignAccountService.MaxBlob + 4))).Code);
    }

    [Fact]
    public void Guessing_passwords_is_stopped_after_a_few_tries()
    {
        using var dir = new TempDir();
        var s = new DesignAccountService(new AppPaths(dir.Path));
        s.Create("gamer", Key, "eA==");
        for (var i = 0; i < 8; i++) Assert.Equal("unauthorized", Assert.Throws<RpcException>(() => s.Load("gamer", Wrong, "9.9.9.9")).Code);
        Assert.Equal("rate-limited", Assert.Throws<RpcException>(() => s.Load("gamer", Key, "9.9.9.9")).Code);
        Assert.Equal("eA==", J(s.Load("gamer", Key, "8.8.8.8")).GetProperty("blob").GetString()); // other device unaffected
        s.Delete("gamer", Key, "8.8.8.8");
        Assert.Equal("unauthorized", Assert.Throws<RpcException>(() => s.Load("gamer", Key, "7.7.7.7")).Code);
    }
}
