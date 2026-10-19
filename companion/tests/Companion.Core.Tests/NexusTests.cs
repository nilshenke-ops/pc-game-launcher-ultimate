using System.Text.Json;
using Pgl.Core.Models;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class FlowBlockTests
{
    [Fact]
    public async Task Wait_and_conditions_control_the_run()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var notes = new List<string>();
        s.Runner.Notify = notes.Add;
        // Nothing runs here: "only if running" ends the run, the notification after it is not shown.
        var r = await s.Runner.RunAsync(new[]
        {
            new ActionStep { Type = StepType.Wait, Ref = "1" },
            new ActionStep { Type = StepType.IfRunning, Ref = "item_x" },
            new ActionStep { Type = StepType.Notify, Ref = "darf nicht kommen" },
        }, "Test");
        Assert.Equal("1 s gewartet", r[0]);
        Assert.StartsWith("Beendet", r[1]);
        Assert.Equal(2, r.Count);
        Assert.Empty(notes);
        // "only if not running" lets the run continue.
        r = await s.Runner.RunAsync(new[] { new ActionStep { Type = StepType.IfNotRunning, Ref = "item_x" }, new ActionStep { Type = StepType.Notify, Ref = "ok" } }, "Test");
        Assert.StartsWith("Bedingung erfüllt", r[0]);
        Assert.Single(notes);
    }

    [Fact]
    public async Task Flow_blocks_are_checked_when_saving()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "wait", @ref = "0" } } }));
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "wait", @ref = "200" }, new { type = "wait", @ref = "200" } } }));
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "ifRunning", @ref = (string?)null } } }));
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "mediaKey", @ref = "rm -rf" } } }));
        // A single hotkey action has no flow.
        Assert.Equal("invalid-params", await admin.Error("hotkeys.save", new { keys = "Ctrl+Alt+F9", enabled = true, action = new { type = "wait", @ref = "5" } }));
        await admin.Ok("quick.save", new { name = "Gaming starten", steps = new object[] { new { type = "wait", @ref = "3" }, new { type = "mediaKey", @ref = "playpause" } } });
        // Without the Windows companion a media key is reported as an error – never as done.
        var r = await s.Runner.RunAsync(new[] { new ActionStep { Type = StepType.MediaKey, Ref = "playpause" } }, "Test");
        Assert.StartsWith("Fehler", r[0]);
    }

    [Fact]
    public async Task Automation_keeps_a_run_history_and_long_runs_go_to_the_background()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var rule = await admin.Ok("automations.save", new { name = "Hinweis", trigger = "companionStarted", actions = new[] { new { type = "notify", @ref = "Hallo" } } });
        var id = rule.GetProperty("id").GetString()!;
        for (var i = 0; i < 12; i++) await s.Automations.Test(id);
        var saved = s.Automations.List().Single(r => r.Id == id);
        Assert.Equal(10, saved.Runs.Count); // newest 10 kept
        Assert.True(saved.Runs[0].Ok);
        Assert.Equal("Hinweis angezeigt", saved.Runs[0].Results.Single());
        // Saving the rule again keeps its history.
        await admin.Ok("automations.save", new { id, name = "Hinweis 2", trigger = "companionStarted", actions = new[] { new { type = "notify", @ref = "Hallo" } } });
        Assert.Equal(10, s.Automations.List().Single(r => r.Id == id).Runs.Count);
        // A rule with waiting answers at once and finishes on the PC.
        var slow = await admin.Ok("automations.save", new { name = "Langsam", trigger = "companionStarted", actions = new object[] { new { type = "wait", @ref = "6" }, new { type = "notify", @ref = "x" } } });
        var res = await admin.Ok("automations.test", new { id = slow.GetProperty("id").GetString() });
        Assert.True(res.GetProperty("background").GetBoolean());
    }
}

public class PingTargetTests
{
    [Fact]
    public async Task Own_targets_only_host_names_or_addresses()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await viewer.Error("network.setTargets", new { targets = new[] { new { label = "x", host = "1.2.3.4" } } }));
        foreach (var bad in new[] { "http://eu.example.net", "eu.example.net:27015", "a b", "evil.com/path", "" })
            Assert.Equal("invalid-params", await admin.Error("network.setTargets", new { targets = new[] { new { label = "x", host = bad } } }));
        Assert.Equal("invalid-params", await admin.Error("network.setTargets", new { targets = Enumerable.Range(1, 4).Select(i => new { label = "x", host = $"10.0.0.{i}" }).ToArray() }));
        var r = await admin.Ok("network.setTargets", new { targets = new[] { new { label = "EU-Server", host = " eu.example.net " }, new { label = "", host = "192.168.1.20" } } });
        Assert.Equal("eu.example.net", r.GetProperty("targets")[0].GetProperty("host").GetString());
        Assert.Equal("192.168.1.20", r.GetProperty("targets")[1].GetProperty("label").GetString()); // empty name → address
        Assert.Equal(2, (await viewer.Ok("network.targets")).GetProperty("targets").GetArrayLength());
    }

    [Fact]
    public async Task Own_targets_are_pinged_with_the_others()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        s.Settings.SetPingTargets(new() { new PingTarget { Label = "Server", Host = "10.1.2.3" } });
        var pinged = new List<string>();
        var net = new NetworkMonitor(s.Rpc, () => s.Settings.Get().PingTargets, (host, _) => { lock (pinged) pinged.Add(host); return Task.FromResult<double?>(12); });
        var admin = await Fixtures.Admin(s);
        net.Subscribe(s.Rpc.Sessions.First()); // starts the 2-s pings at once
        for (var i = 0; i < 100 && !Locked(pinged).Contains("10.1.2.3"); i++) await Task.Delay(30);
        net.Unsubscribe(s.Rpc.Sessions.First());
        Assert.Contains("10.1.2.3", Locked(pinged));
        Assert.Contains("1.1.1.1", Locked(pinged));
        net.Dispose();
    }

    static List<string> Locked(List<string> l) { lock (l) return l.ToList(); }
}

public class QueuedChangeTests
{
    [Fact]
    public async Task A_queued_change_sent_twice_is_applied_once()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        string Msg(long id) => JsonSerializer.Serialize(new { v = 1, id, m = "quick.save", p = new { name = "Offline-Aktion", steps = new[] { new { type = "stopAllSounds" } } }, op = "q_abc123" });
        var first = await admin.Raw(Msg(100));
        var second = await admin.Raw(Msg(101)); // answer of the first one "got lost"
        Assert.Equal(first.GetProperty("r").GetProperty("id").GetString(), second.GetProperty("r").GetProperty("id").GetString());
        Assert.Single(s.QuickActions.List());
        // Without an op id every call is a new change.
        var third = await admin.Call("quick.save", new { name = "Zweite", steps = new[] { new { type = "stopAllSounds" } } }, 200);
        Assert.True(third.GetProperty("ok").GetBoolean());
        Assert.Equal(2, s.QuickActions.List().Count);
    }
}

public class QueuedChangeInFlightTests
{
    [Fact]
    public async Task A_copy_arriving_while_the_first_runs_waits_for_it()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var notes = new List<string>();
        s.Runner.Notify = n => { lock (notes) notes.Add(n); };
        var qa = await admin.Ok("quick.save", new { name = "Langsam", steps = new object[] { new { type = "wait", @ref = "2" }, new { type = "notify", @ref = "einmal" } } });
        string Msg(long id) => JsonSerializer.Serialize(new { v = 1, id, m = "quick.run", p = new { id = qa.GetProperty("id").GetString() }, op = "q_run1" });
        // Both copies arrive while the first is still waiting.
        await Task.WhenAll(s.Rpc.OnMessageAsync(admin.Channel, Msg(500)), s.Rpc.OnMessageAsync(admin.Channel, Msg(501)));
        Assert.Single(notes);
    }
}

public class SoundLabTests
{
    [Fact]
    public async Task Repeat_flag_and_missing_files_are_reported()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        const string id = "snd_1";
        s.Soundboard.Import(new SoundsFile { Sounds = { new Sound { Id = id, Name = "Hupe", FileName = "hupe.wav", Format = "wav" } } });
        Assert.Contains(id, s.Soundboard.Missing());
        await admin.Ok("sounds.update", new { id, loop = true });
        Assert.True(s.Soundboard.Get().Sounds.Single().Loop);
        var list = await admin.Ok("sounds.list");
        Assert.Equal(id, list.GetProperty("missing")[0].GetString());
        File.WriteAllBytes(Path.Combine(s.Paths.SoundsDir, "hupe.wav"), new byte[10]);
        Assert.Empty(s.Soundboard.Missing());
    }
}

public class HotkeyTestTests
{
    [Fact]
    public async Task Testing_a_hotkey_runs_its_action_with_launch_rights_only()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        var notes = new List<string>();
        s.Runner.Notify = notes.Add;
        var h = await admin.Ok("hotkeys.save", new { keys = "Ctrl+Alt+F9", enabled = true, action = new { type = "notify", @ref = "Test" } });
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        Assert.Equal("forbidden", await viewer.Error("hotkeys.test", new { id = h.GetProperty("id").GetString() }));
        var r = await admin.Ok("hotkeys.test", new { id = h.GetProperty("id").GetString() });
        Assert.Equal("Hinweis angezeigt", r.GetProperty("results")[0].GetString());
        Assert.Single(notes);
        // Media keys are accepted as hotkeys.
        await admin.Ok("hotkeys.save", new { keys = "mediaplaypause", enabled = true, action = new { type = "stopAllSounds" } });
        Assert.Contains(s.Hotkeys.List(), x => x.Keys == "MediaPlayPause");
    }
}
