using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>Island shelf (3.60): renaming in the exchange folder keeps the type, stays inside the folder and never overwrites.</summary>
public class ShelfRenameTests
{
    static TransferService Make(TempDir dir, out string folder)
    {
        var t = new TransferService(new AppPaths(dir.Path), new GenericPlatform(), new NullHub());
        folder = t.Folder;
        Directory.CreateDirectory(folder);
        return t;
    }

    [Fact]
    public void Rename_keeps_the_type_cleans_the_name_and_never_overwrites()
    {
        using var dir = new TempDir();
        var t = Make(dir, out var folder);
        File.WriteAllText(Path.Combine(folder, "notiz.txt"), "a");
        File.WriteAllText(Path.Combine(folder, "andere.txt"), "b");
        Assert.Equal("einkauf.txt", t.Rename("notiz.txt", "einkauf").Name);
        Assert.True(File.Exists(Path.Combine(folder, "einkauf.txt")));
        Assert.Equal("exists", Assert.Throws<RpcException>(() => t.Rename("einkauf.txt", "andere.txt")).Code);
        Assert.Equal("b", File.ReadAllText(Path.Combine(folder, "andere.txt")));
        // a path in the new name cannot leave the folder
        var moved = t.Rename("einkauf.txt", "../../boese.txt");
        Assert.Equal("boese.txt", moved.Name);
        Assert.True(File.Exists(Path.Combine(folder, "boese.txt")));
        Assert.Equal("not-found", Assert.Throws<RpcException>(() => t.Rename("gibtsnicht.txt", "x")).Code);
    }
}
