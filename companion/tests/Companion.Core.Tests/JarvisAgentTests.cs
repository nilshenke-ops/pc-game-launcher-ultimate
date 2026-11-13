using System.Text.Json;
using Pgl.Core.Assistant;
using Pgl.Core.Hosting;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>JARVIS 3.0 control centre: plans from fixed rules, real diagnoses, permission per step, history without secrets.</summary>
public class JarvisAgentTests
{
    static CompanionServices Make(TempDir dir, IAudioEngine? audio = null)
    {
        var s = new CompanionServices(audio == null ? new GenericPlatform() : new GenericPlatform { Audio = audio }, new AppPaths(dir.Path), new WebAssets(dir.Path));
        s.Library.Import(new LibraryFile { Items = {
            new LibraryItem { Id = "item_cs", Kind = ItemKind.Game, Name = "Counter-Strike 2", Source = LaunchSource.Steam, Target = "730", ProcessNames = { "cs2" } },
            new LibraryItem { Id = "item_dc", Kind = ItemKind.Program, Name = "Discord", Source = LaunchSource.Exe, Target = "/nonexistent/Discord.exe", ProcessNames = { "Discord" } },
        } });
        return s;
    }

    [Theory]
    [InlineData("Bereite meinen PC für eine Runde Counter-Strike vor", "prepare")]
    [InlineData("Mach alles startklar für eine Gaming-Session", "prepare")]
    [InlineData("Warum funktioniert mein Soundboard nicht?", "diagnose")]
    [InlineData("Discord hört mich nicht", "diagnose")]
    [InlineData("Wenn ich Counter-Strike starte, öffne Discord", "workflow")]
    [InlineData("Wie spät ist es?", null)]
    [InlineData("Warum ist Elden Ring so schwer?", null)]               // a game question, not a PC diagnosis
    [InlineData("Warum ist meine GPU-Auslastung so hoch?", "diagnose")]
    [InlineData("Prüf mal meinen PC", "diagnose")]
    [InlineData("Starte Counter-Strike", null)] // a plain command stays a command (no plan needed)
    public void Understands_which_requests_become_a_plan(string text, string? kind) => Assert.Equal(kind, JarvisAgent.KindOf(text));

    [Fact]
    public void The_page_gives_the_topic_when_the_question_does_not()
    {
        Assert.Null(JarvisAgent.KindOf("Warum geht das nicht?"));
        Assert.Equal("diagnose", JarvisAgent.KindOf("Warum geht das nicht?", "/audio"));
        Assert.Equal("audio", JarvisAgent.TopicOfPage("/audio"));
        Assert.Equal("network", JarvisAgent.TopicOfPage("/network?x=1"));
        Assert.Null(JarvisAgent.TopicOfPage("/library"));
    }

    [Fact]
    public async Task Prepare_plan_uses_the_own_library_and_profiles_and_runs_nothing_before_confirmation()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        var prof = s.Profiles.Save(new Profile { Name = "Competitive", GameIds = { "item_cs" } });
        var before = s.Profiles.Get().ActiveProfileId;
        var t = (await s.Agent.PlanAsync("Bereite meinen PC für eine Runde Counter-Strike vor, mit Discord", "/library", "dev1", "Handy"))!;
        Assert.Equal("prepare", t.Kind);
        var kinds = t.Steps.Select(x => x.Kind).ToList();
        Assert.Equal(new[] { "check-pc", "check-game", "check-programs", "check-audio", "check-network", "launch", "profile", "launch" }, kinds);
        Assert.Equal("item_dc", t.Steps[5].Ref);           // Discord: named in the request
        Assert.Equal(prof.Id, t.Steps[6].Ref);             // the game's own profile
        Assert.Equal("item_cs", t.Steps[7].Ref);           // the game comes last
        Assert.All(t.Steps.Where(x => x.Kind is "launch" or "profile"), x => Assert.Equal("execute", x.Tier));
        Assert.Equal(before, s.Profiles.Get().ActiveProfileId); // planning changed nothing
        Assert.Equal("planned", t.State);

        // Run only the checks and the profile; launching is left out by the person.
        var chosen = t.Steps.Where(x => x.Kind.StartsWith("check") || x.Kind == "profile").Select(x => x.Id).ToHashSet();
        var updates = new List<string>();
        var done = await s.Agent.ExecuteAsync("dev1", t.Id, chosen, new Dictionary<string, string>(), false, _ => true, x => updates.Add(x.State));
        Assert.Equal(prof.Id, s.Profiles.Get().ActiveProfileId);
        Assert.All(done.Steps.Where(x => x.Kind == "launch"), x => Assert.Equal("skipped", x.Status));
        Assert.Equal("done", done.Steps.Single(x => x.Kind == "check-game").Status);
        Assert.Contains("Counter-Strike 2", done.Steps.Single(x => x.Kind == "check-game").Result);
        Assert.Contains("running", updates);

        // The same plan never runs twice; another person cannot run it.
        Assert.Equal("invalid", (await Assert.ThrowsAsync<RpcException>(() => s.Agent.ExecuteAsync("dev1", t.Id, chosen, new Dictionary<string, string>(), false, _ => true, null))).Code);
        var t2 = (await s.Agent.PlanAsync("Mach den PC startklar", null, "dev1", "Handy"))!;
        Assert.Equal("not-found", (await Assert.ThrowsAsync<RpcException>(() => s.Agent.ExecuteAsync("dev2", t2.Id, new HashSet<string>(), new Dictionary<string, string>(), false, _ => true, null))).Code);
    }

    [Fact]
    public async Task Every_step_needs_the_devices_own_permission_and_critical_steps_their_own_confirmation()
    {
        using var dir = new TempDir();
        var engine = new SoundboardMicTests.CableAudio();
        await using var s = Make(dir, engine);
        s.Audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicFollowsSoundboard = false });
        var t = (await s.Agent.PlanAsync("Warum hören mich meine Freunde in Discord nicht?", null, "dev1", "Handy"))!;
        Assert.Equal("audio", t.Topic);
        Assert.Equal("problem", t.Findings[0].Severity);
        Assert.Contains("Stimme", t.Findings[0].Title);
        Assert.Contains("virtuelles Kabel", t.Findings[0].Evidence); // the evidence names what was read
        var voice = t.Steps.Single(x => x.Kind == "audio-voice");
        var reset = t.Steps.Single(x => x.Kind == "audio-reset");
        Assert.Equal("critical", reset.Tier);
        Assert.False(reset.Selected);

        // A device with only "view": the fix is refused, nothing changes.
        var r = await s.Agent.ExecuteAsync("dev1", t.Id, new HashSet<string> { voice.Id, reset.Id }, new Dictionary<string, string>(), false, p => p == "view", null);
        Assert.Equal("refused", r.Steps.Single(x => x.Kind == "audio-voice").Status);
        Assert.Contains("Verwalten", r.Steps.Single(x => x.Kind == "audio-voice").Result);
        Assert.False(s.Audio.Settings().MicFollowsSoundboard);
        Assert.Equal("failed", r.State);
    }

    [Fact]
    public async Task Fix_then_check_again_reports_the_real_difference()
    {
        using var dir = new TempDir();
        var engine = new SoundboardMicTests.CableAudio();
        await using var s = Make(dir, engine);
        s.Audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicFollowsSoundboard = false });
        var t = (await s.Agent.PlanAsync("Mein Soundboard funktioniert nicht", "/audio", "dev1", "PC"))!;
        var voice = t.Steps.Single(x => x.Kind == "audio-voice");
        var verify = t.Steps.Single(x => x.Kind == "verify");
        var r = await s.Agent.ExecuteAsync("dev1", t.Id, new HashSet<string> { voice.Id, verify.Id }, new Dictionary<string, string>(), false, _ => true, null);
        Assert.Equal("done", r.Steps.Single(x => x.Kind == "audio-voice").Status);
        Assert.True(engine.Last!.Value.on);
        Assert.Equal("done", r.Steps.Single(x => x.Kind == "verify").Status);
        Assert.True(r.ProblemsAfter < r.ProblemsBefore);
        Assert.Equal("done", r.State);
    }

    [Fact]
    public async Task Critical_steps_run_only_with_explicit_confirmation()
    {
        using var dir = new TempDir();
        var engine = new SoundboardMicTests.CableAudio();
        await using var s = Make(dir, engine);
        s.Audio.Save(new AudioSettings { OutputDeviceId = "cable-in", MicFollowsSoundboard = false });
        var t = (await s.Agent.PlanAsync("Discord hört mich nicht", null, "dev1", "PC"))!;
        var reset = t.Steps.Single(x => x.Kind == "audio-reset");
        var r = await s.Agent.ExecuteAsync("dev1", t.Id, new HashSet<string> { reset.Id }, new Dictionary<string, string>(), false, _ => true, null);
        Assert.Equal("refused", r.Steps.Single(x => x.Kind == "audio-reset").Status);
        Assert.Equal("cable-in", s.Audio.Settings().OutputDeviceId);

        var t2 = (await s.Agent.PlanAsync("Discord hört mich nicht", null, "dev1", "PC"))!;
        var r2 = await s.Agent.ExecuteAsync("dev1", t2.Id, new HashSet<string> { t2.Steps.Single(x => x.Kind == "audio-reset").Id }, new Dictionary<string, string>(), true, _ => true, null);
        Assert.Equal("done", r2.Steps.Single(x => x.Kind == "audio-reset").Status);
        Assert.Null(s.Audio.Settings().OutputDeviceId);
    }

    [Fact]
    public async Task Workflow_becomes_one_of_the_existing_automations_and_is_never_created_twice()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        var prof = s.Profiles.Get().Profiles.Single(p => p.Name == "Competitive"); // one of the profiles every PC starts with
        var t = (await s.Agent.PlanAsync("Wenn ich Counter-Strike starte, öffne Discord und aktiviere das Profil Competitive", null, "dev1", "PC"))!;
        var step = Assert.Single(t.Steps);
        Assert.Equal("automation", step.Kind);
        Assert.Equal(TriggerType.GameStarted, step.Rule!.Trigger);
        Assert.Equal("item_cs", step.Rule.TriggerRef);
        Assert.Equal(new[] { (StepType.LaunchItem, (string?)"item_dc"), (StepType.ActivateProfile, (string?)prof.Id) }, step.Rule.Actions.Select(a => (a.Type, a.Ref)));
        Assert.DoesNotContain(s.Automations.List(), r => r.TriggerRef == "item_cs");
        await s.Agent.ExecuteAsync("dev1", t.Id, new HashSet<string> { step.Id }, new Dictionary<string, string>(), false, _ => true, null);
        Assert.Single(s.Automations.List(), r => r.TriggerRef == "item_cs");

        var again = (await s.Agent.PlanAsync("Wenn ich Counter-Strike starte, öffne Discord und aktiviere das Profil Competitive", null, "dev1", "PC"))!;
        Assert.False(again.Steps.Single().Selected);
        Assert.Contains("gibt es schon", again.Steps.Single().Detail);
    }

    [Fact]
    public async Task Ordinary_questions_are_not_plans_and_unknown_games_are_said_plainly()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        Assert.Null(await s.Agent.PlanAsync("Erzähl mir einen Witz", null, "dev1", "PC"));
        var t = (await s.Agent.PlanAsync("Wenn ich Fantasiespiel starte, öffne Discord", null, "dev1", "PC"))!;
        Assert.Equal("failed", t.State);
        Assert.Empty(t.Steps);
    }

    [Fact]
    public async Task History_is_searchable_deletable_and_never_keeps_secrets()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        await s.Agent.PlanAsync("Warum geht mein Netzwerk nicht? Mein Passwort: Geheim123 und der Schlüssel sk-abcdefghijklmnop1234", null, "dev1", "PC");
        var h = JsonSerializer.SerializeToElement(s.Agent.History(null, null, null), Json.Options);
        var req = h.GetProperty("tasks")[0].GetProperty("request").GetString()!;
        Assert.DoesNotContain("Geheim123", req);
        Assert.DoesNotContain("sk-abcdefghijklmnop1234", req);
        Assert.Contains("[entfernt]", req);
        Assert.Equal(1, JsonSerializer.SerializeToElement(s.Agent.History("netzwerk", null, null), Json.Options).GetProperty("tasks").GetArrayLength());
        Assert.Equal(0, JsonSerializer.SerializeToElement(s.Agent.History("minecraft", null, null), Json.Options).GetProperty("tasks").GetArrayLength());

        s.Agent.Configure(null, keepRequests: false);
        Assert.False(JsonSerializer.SerializeToElement(s.Agent.History(null, null, null), Json.Options).GetProperty("tasks")[0].TryGetProperty("request", out _)); // request no longer kept
        var id = JsonSerializer.SerializeToElement(s.Agent.History(null, null, null), Json.Options).GetProperty("tasks")[0].GetProperty("id").GetString()!;
        Assert.True(s.Agent.Delete(id));
        Assert.Equal(0, JsonSerializer.SerializeToElement(s.Agent.History(null, null, null), Json.Options).GetProperty("total").GetInt32());
        s.Agent.Configure(keep: false, null);
        await s.Agent.PlanAsync("Warum ruckelt mein Spiel?", null, "dev1", "PC");
        Assert.Equal(0, JsonSerializer.SerializeToElement(s.Agent.History(null, null, null), Json.Options).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Over_rpc_a_view_only_device_can_plan_but_not_switch_a_profile_and_cannot_delete_history()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        var prof = s.Profiles.Save(new Profile { Name = "Competitive", GameIds = { "item_cs" } });
        var admin = await Fixtures.Admin(s);
        var (viewer, _, _) = await Fixtures.PairedDevice(s, admin, new[] { "view" });
        var plan = await viewer.Ok("jarvis.plan", new { text = "Bereite den PC für Counter-Strike vor", page = "/library" });
        var task = plan.GetProperty("task");
        var profileStep = task.GetProperty("steps").EnumerateArray().Single(x => x.GetProperty("kind").GetString() == "profile").GetProperty("id").GetString();
        var r = await viewer.Ok("jarvis.execute", new { taskId = task.GetProperty("id").GetString(), steps = new[] { profileStep } });
        Assert.Equal("refused", r.GetProperty("steps").EnumerateArray().Single(x => x.GetProperty("kind").GetString() == "profile").GetProperty("status").GetString());
        Assert.NotEqual(prof.Id, s.Profiles.Get().ActiveProfileId);
        Assert.NotEmpty(viewer.Channel.Events("jarvis.task"));
        Assert.Equal("forbidden", await viewer.Error("jarvis.historyClear"));
        Assert.False((await viewer.Ok("jarvis.plan", new { text = "Hallo" })).TryGetProperty("task", out _)); // an ordinary question: no plan
    }

    [Fact]
    public async Task The_island_sees_the_current_task_and_the_PC_itself_may_decide_on_a_phone_task()
    {
        using var dir = new TempDir();
        await using var s = Make(dir);
        var t = (await s.Agent.PlanAsync("Bereite meinen PC für eine Runde vor", null, "phone1", "Handy"))!;
        Assert.Equal(t.Id, s.Agent.Current(null)!.Id);            // the PC sees every task
        Assert.Equal(t.Id, s.Agent.Current("phone1")!.Id);
        Assert.Null(s.Agent.Current("tablet"));                    // another device does not see it
        var brief = JsonSerializer.SerializeToElement(JarvisAgent.Brief(t), Json.Options);
        Assert.Equal("planned", brief.GetProperty("state").GetString());
        Assert.False(brief.TryGetProperty("request", out _));      // the island never gets the request text or findings
        Assert.False(brief.TryGetProperty("findings", out _));
        // Another device may not run it; the PC (owner null) may.
        await Assert.ThrowsAsync<RpcException>(() => s.Agent.ExecuteAsync("tablet", t.Id, new HashSet<string>(), new Dictionary<string, string>(), false, _ => true, null));
        var check = t.Steps.First(x => x.Kind == "check-pc").Id;
        var r = await s.Agent.ExecuteAsync(null, t.Id, new HashSet<string> { check }, new Dictionary<string, string>(), false, _ => true, null);
        Assert.Equal("done", r.Steps.Single(x => x.Kind == "check-pc").Status);
        Assert.Null(s.Agent.Current(null));                        // finished: nothing waits any more
    }
}
