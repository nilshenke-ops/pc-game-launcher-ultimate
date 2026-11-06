using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>JARVIS MEMORY against a real folder of Markdown files: read, write, update, search, restart, safety.</summary>
public class MemoryVaultTests
{
    static DateTime T = new(2026, 11, 6, 16, 40, 0, DateTimeKind.Utc);
    static MemoryVault Make(TempDir dir, string vault, bool configure = true)
    {
        var v = new MemoryVault(new AppPaths(Path.Combine(dir.Path, "data")), null, () => T);
        if (configure) v.Configure(vault, true, null, null, null, atPc: true);
        return v;
    }
    static string VaultDir(TempDir d) => Path.Combine(d.Path, "JARVIS-MEMORY");

    [Fact]
    public void Choosing_a_folder_creates_the_vault_structure_and_switches_the_memory_on()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        Assert.True(v.Enabled);
        foreach (var f in MemoryVault.Folders) Assert.True(Directory.Exists(Path.Combine(VaultDir(dir), f)), f);
        Assert.True(File.Exists(Path.Combine(VaultDir(dir), "00-System", "Gedächtnis-Regeln.md")));
        Assert.True(File.Exists(Path.Combine(VaultDir(dir), "02-Projekte", "Minecraft.md")));
        var st = JsonSerializer.SerializeToElement(v.Status());
        Assert.Equal("ok", st.GetProperty("state").GetString()); Assert.True(st.GetProperty("notes").GetInt32() >= 12);
    }

    [Fact]
    public void Read_write_update_and_the_old_version_stays_in_the_history()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        var n = v.Write("05-Wissen/Redstone.md", "---\ntitle: Redstone\n---\n# Redstone\nTakt mit Repeatern.\n", null, createOnly: true);
        Assert.Equal("05-Wissen/Redstone.md", n.Path);
        Assert.Contains("Repeatern", v.Read("05-Wissen/Redstone.md").text);
        Assert.Equal("conflict", Assert.Throws<RpcException>(() => v.Write("05-Wissen/Redstone.md", "x", null, createOnly: true)).Code);
        var read = v.Read("05-Wissen/Redstone.md");
        v.Write("05-Wissen/Redstone.md", "---\ntitle: Redstone\n---\n# Redstone\nTakt mit Comparatoren.\n", read.updated);
        Assert.Contains("Comparatoren", v.Read("05-Wissen/Redstone.md").text);
        var hist = Directory.GetFiles(Path.Combine(VaultDir(dir), "00-System", "Verlauf"));
        Assert.Contains(hist, h => File.ReadAllText(h).Contains("Repeatern"));                      // the replaced version is still there
        T = T.AddHours(1);
        Assert.Equal("conflict", Assert.Throws<RpcException>(() => v.Write("05-Wissen/Redstone.md", "überschrieben", read.updated.AddMinutes(-5))).Code);   // changed in between: nothing is overwritten
        Assert.Contains("Comparatoren", v.Read("05-Wissen/Redstone.md").text);
    }

    [Theory]
    [InlineData("../geheim.md")]
    [InlineData("..\\..\\Windows\\system.ini")]
    [InlineData("/etc/passwd")]
    [InlineData("C:\\Windows\\win.ini")]
    [InlineData("02-Projekte/../../x.md")]
    [InlineData(".obsidian/app.md")]
    [InlineData(".trash/x.md")]
    [InlineData("a/b/c/d/e/f.md")]
    [InlineData("CON.md")]
    [InlineData("")]
    public void Paths_outside_the_vault_or_into_hidden_folders_are_refused(string rel)
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        File.WriteAllText(Path.Combine(dir.Path, "geheim.md"), "GEHEIM");
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => v.Read(rel)).Code);
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => v.Write(rel, "x", null)).Code);
    }

    [Fact]
    public void A_folder_that_is_a_link_out_of_the_vault_is_not_followed()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        var outside = Path.Combine(dir.Path, "outside"); Directory.CreateDirectory(outside); File.WriteAllText(Path.Combine(outside, "geheim.md"), "GEHEIM");
        try { Directory.CreateSymbolicLink(Path.Combine(VaultDir(dir), "05-Wissen", "link"), outside); } catch { return; }      // no symlink right on this system: nothing to prove
        Assert.Throws<RpcException>(() => v.Read("05-Wissen/link/geheim.md"));
        Assert.DoesNotContain(v.Search("GEHEIM"), h => h.Path.Contains("link"));
    }

    [Fact]
    public void Only_a_proper_folder_can_become_the_vault_and_only_at_the_PC()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir), configure: false);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => v.Configure(VaultDir(dir), true, null, null, null, atPc: false)).Code);
        foreach (var bad in new[] { "C:\\", "/", "C:\\Windows\\System32\\x", "relativ/pfad", "\\\\server\\freigabe\\x" })
            Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => v.Configure(bad, true, null, null, null, atPc: true)).Code);
        Assert.False(v.Enabled);
    }

    [Fact]
    public void Search_finds_notes_by_title_and_content_and_combines_several_notes()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Write("02-Projekte/Minecraft.md", "---\ntitle: Minecraft\ntype: projekt\n---\n# Minecraft\n\n**Status:** nicht fertig\n\n## Verlauf\n- 2026-11-01 10:00: Das Schloss ist gebaut, der Turm fehlt noch. Siehe [[Redstone]].\n", null);
        v.Write("05-Wissen/Redstone.md", "---\ntitle: Redstone\n---\n# Redstone\nFür die Zugbrücke braucht das Schloss Kolben und Repeater.\n", null);
        v.Write("05-Wissen/Kochen.md", "# Kochen\nNudeln mit Tomatensoße.\n", null);
        var hits = v.Search("Wo war ich bei meinem Minecraft Projekt stehen geblieben");
        Assert.Equal("02-Projekte/Minecraft.md", hits[0].Path);
        Assert.Contains("Turm fehlt", hits[0].Snippet);
        Assert.DoesNotContain(v.Search("Schloss"), h => h.Path.EndsWith("Kochen.md"));
        Assert.Contains(v.Search("Schloss"), h => h.Path.EndsWith("Redstone.md"));                    // both notes talk about the castle
        Assert.Contains(v.Search("Projekte"), h => h.Path.EndsWith("Minecraft.md"));                  // plural finds the singular
        var (links, back) = v.Related("02-Projekte/Minecraft.md");
        Assert.Contains(links, l => l.Title == "Redstone");
        Assert.Contains(v.Related("05-Wissen/Redstone.md").backlinks, b => b.Title == "Minecraft");
        var ctx = v.ContextFor("Wo war ich bei meinem Minecraft Projekt stehen geblieben?");
        Assert.NotNull(ctx); Assert.True(ctx!.Block.Length <= 1700); Assert.Contains("Turm fehlt", ctx.Block); Assert.DoesNotContain("Nudeln", ctx.Block);
        Assert.Null(v.ContextFor("Welches Wetter ist heute in Hamburg"));                              // nothing fits: nothing is attached
    }

    [Fact]
    public void Remember_files_into_the_right_note_without_duplicates_and_updates_a_changed_status()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        var r1 = v.Remember("Mein Minecraft-Projekt ist noch nicht fertig.");
        Assert.Equal("02-Projekte/Minecraft.md", r1.Path); Assert.Contains("nicht fertig", v.Read(r1.Path).text);
        var again = v.Remember("mein minecraft projekt ist noch nicht fertig");
        Assert.Equal("duplicate", again.Status);
        T = T.AddDays(3);
        var r2 = v.Remember("Mein Minecraft-Projekt ist jetzt fertig.");
        Assert.Equal("updated", r2.Status); Assert.Equal("noch nicht fertig", r2.Previous);
        var text = v.Read(r2.Path).text;
        Assert.Contains("**Status:** fertig", text); Assert.Contains("Status geändert von „noch nicht fertig“ zu „fertig“", text);       // traceable
        Assert.Equal("06-Aufgaben/Offen.md", v.Remember("Ich muss noch die Grafiktreiber aktualisieren").Path);
        Assert.Contains("- [ ]", v.Read("06-Aufgaben/Offen.md").text);
        Assert.Equal("01-Personen/Nutzerprofil.md", v.Remember("Ich wohne in Adendorf").Path);
        Assert.Equal("02-Projekte/Hollow-Welt.md", v.Remember("Mein Hollow-Welt Projekt ist angefangen").Path.Replace("Hollow Welt", "Hollow-Welt"));
        Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => v.Remember("ja")).Code);
    }

    [Fact]
    public void Recall_answers_from_the_notes_and_says_so_when_nothing_is_there()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Remember("Mein Minecraft-Projekt ist noch nicht fertig, der Turm fehlt.");
        var a = v.Recall("Minecraft Projekt")!;
        Assert.Contains("nicht fertig", a); Assert.Contains("Turm fehlt", a); Assert.Contains("02-Projekte/Minecraft.md", a);
        Assert.Null(v.Recall("Raumschiff Konstruktion"));
        Assert.Null(v.Recall("Raumschiff-Projekt"));                                                    // a generic word like "Projekt" alone is no match
        Assert.Null(v.ContextFor("Wo war ich bei meinem Raumschiff-Projekt stehen geblieben?"));                                              // honest: unknown
    }

    [Fact]
    public void The_memory_survives_a_restart_and_a_missing_vault_does_not_break_anything()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Remember("Mein Minecraft-Projekt ist noch nicht fertig.");
        var v2 = Make(dir, VaultDir(dir), configure: false);                                           // a new process: config and notes come from disk
        Assert.True(v2.Enabled); Assert.Contains("nicht fertig", v2.Recall("Minecraft")!);
        Directory.Delete(VaultDir(dir), true);                                                         // vault drive gone / folder removed
        Assert.False(v2.Enabled);
        Assert.Empty(v2.Search("Minecraft")); Assert.Null(v2.ContextFor("Minecraft Projekt")); Assert.Null(v2.Recall("Minecraft"));
        Assert.Equal("missing", JsonSerializer.SerializeToElement(v2.Status()).GetProperty("state").GetString());
        Assert.Equal("memory-off", Assert.Throws<RpcException>(() => v2.Remember("Das ist wichtig genug")).Code);
    }

    [Fact]
    public void Deleting_needs_permission_and_a_confirmation_goes_to_the_trash_and_never_touches_system_notes()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Write("05-Wissen/Weg.md", "# Weg\nweg damit\n", null);
        Assert.Equal("memory-delete-off", Assert.Throws<RpcException>(() => v.Delete("05-Wissen/Weg.md", true)).Code);
        v.Configure(null, null, null, true, null, atPc: true);
        Assert.Equal("confirm-required", Assert.Throws<RpcException>(() => v.Delete("05-Wissen/Weg.md", false)).Code);
        Assert.Equal("forbidden", Assert.Throws<RpcException>(() => v.Delete("00-System/Gedächtnis-Regeln.md", true)).Code);
        v.Delete("05-Wissen/Weg.md", true);
        Assert.False(File.Exists(Path.Combine(VaultDir(dir), "05-Wissen", "Weg.md")));
        Assert.Single(Directory.GetFiles(Path.Combine(VaultDir(dir), ".trash")));                       // recoverable
        Assert.DoesNotContain(v.Search("weg damit"), h => h.Path.Contains(".trash"));
    }

    [Fact]
    public void Read_only_mode_blocks_every_write()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Configure(null, null, false, null, null, atPc: true);
        Assert.Equal("memory-readonly", Assert.Throws<RpcException>(() => v.Write("05-Wissen/X.md", "x", null)).Code);
        Assert.Equal("memory-readonly", Assert.Throws<RpcException>(() => v.Remember("Mein Minecraft-Projekt ist fertig")).Code);
        Assert.NotEmpty(v.List());                                                                      // reading still works
    }

    [Fact]
    public void Upkeep_finds_duplicates_gaps_and_old_unfinished_projects_without_changing_anything()
    {
        using var dir = new TempDir(); var v = Make(dir, VaultDir(dir));
        v.Write("05-Wissen/A.md", "# A\n- Der Schlüssel liegt im blauen Kasten unter dem Schreibtisch im Keller.\n", null);
        v.Write("05-Wissen/B.md", "# B\n- Der Schlüssel liegt im blauen Kasten unter dem Schreibtisch im Keller.\n", null);
        v.Write("02-Projekte/Alt.md", "---\ntitle: Alt\n---\n# Alt\n**Status:** in arbeit\n" + new string('x', 10) + "\n", null);
        T = T.AddDays(90);
        var items = v.Health();
        Assert.Contains(items, i => i.Kind == "duplicate"); Assert.Contains(items, i => i.Kind == "stale" && i.Path.EndsWith("Alt.md"));
        Assert.Contains("blauen Kasten", v.Read("05-Wissen/B.md").text);                                // nothing was touched
    }

    [Theory]
    [InlineData("Merk dir, dass mein Minecraft-Projekt noch nicht fertig ist.", "mein Minecraft-Projekt noch nicht fertig ist")]
    [InlineData("merke dir dass ich in Adendorf wohne", "ich in Adendorf wohne")]
    [InlineData("Merk dir das", "")]
    [InlineData("Speichere meine Netzwerk-Adresse im Gedächtnis", "meine Netzwerk-Adresse")]
    public void Remember_requests_are_understood(string say, string payload) => Assert.Equal(payload, MemoryIntents.RememberText(say));

    [Theory]
    [InlineData("Wo war ich bei meinem Minecraft-Projekt stehen geblieben?", "Minecraft-Projekt")]
    [InlineData("Was weißt du über mein Minecraft Projekt?", "mein Minecraft Projekt")]
    [InlineData("Wie weit bin ich mit dem PC-Launcher?", "PC-Launcher")]
    [InlineData("Was ist der letzte Stand von der Website?", "der Website")]
    public void Recall_questions_are_understood(string say, string topic) => Assert.Equal(topic, MemoryIntents.RecallTopic(say));

    [Theory]
    [InlineData("Ich habe heute mein Minecraft Projekt fertig gebaut", true)]
    [InlineData("Mein Lieblingsspiel ist Hollow Knight und ich mag es sehr", true)]
    [InlineData("Wie wird das Wetter morgen in Berlin?", false)]
    [InlineData("Starte Discord", false)]
    [InlineData("Ich habe Hunger", false)]
    public void Only_lasting_statements_are_worth_keeping(string say, bool worth) => Assert.Equal(worth, MemoryIntents.LooksWorthKeeping(say));
}
