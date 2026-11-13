using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class DownloadWatchTests
{
    [Fact]
    public void Reports_a_file_once_when_it_stopped_growing_and_ignores_partial_downloads()
    {
        var dir = Directory.CreateTempSubdirectory("pgl-dl-").FullName;
        try
        {
            var seen = new List<string>();
            using var w = new DownloadWatchService((name, _) => seen.Add(name), () => true);
            var done = Path.Combine(dir, "spiel-setup.exe"); var part = Path.Combine(dir, "film.mkv.crdownload"); var empty = Path.Combine(dir, "leer.txt");
            File.WriteAllText(done, "abc"); File.WriteAllText(part, "abc"); File.WriteAllText(empty, "");
            w.NoteForTest(done); w.NoteForTest(part); w.NoteForTest(empty);
            var t0 = DateTime.UtcNow;
            w.Check(t0);                                  // first look: remembers the size
            Assert.Empty(seen);
            File.AppendAllText(done, "def");              // still growing
            w.Check(t0.AddSeconds(2));
            Assert.Empty(seen);
            w.Check(t0.AddSeconds(3));                    // same size, but not long enough
            Assert.Empty(seen);
            w.Check(t0.AddSeconds(4));                    // 2 s unchanged: finished
            Assert.Equal(new[] { "spiel-setup.exe" }, seen);
            w.NoteForTest(done); w.Check(t0.AddSeconds(10)); w.Check(t0.AddSeconds(20));
            Assert.Single(seen);                          // never twice
            Assert.True(DownloadWatchService.IsPartial("x.part")); Assert.True(DownloadWatchService.IsPartial("~lock.docx")); Assert.False(DownloadWatchService.IsPartial("bild.png"));
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void Says_nothing_while_switched_off()
    {
        var dir = Directory.CreateTempSubdirectory("pgl-dl-").FullName;
        try
        {
            var seen = new List<string>();
            using var w = new DownloadWatchService((name, _) => seen.Add(name), () => false);
            var f = Path.Combine(dir, "a.zip"); File.WriteAllText(f, "abc");
            w.NoteForTest(f); var t0 = DateTime.UtcNow; w.Check(t0); w.Check(t0.AddSeconds(5)); w.Check(t0.AddSeconds(9));
            Assert.Empty(seen);
        }
        finally { Directory.Delete(dir, true); }
    }
}
