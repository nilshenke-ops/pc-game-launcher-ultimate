using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class AutomationBlocksTests
{
    static ActionStep S(StepType t, string? r = null) => new() { Type = t, Ref = r };

    [Fact]
    public void Uhrzeit_auch_ueber_Mitternacht_und_Wochentage()
    {
        Assert.True(ActionRunner.InTimeRange("18:00-23:00", new DateTime(2026, 10, 28, 18, 0, 0)));
        Assert.False(ActionRunner.InTimeRange("18:00-23:00", new DateTime(2026, 10, 28, 23, 0, 0)));
        Assert.True(ActionRunner.InTimeRange("22:00-02:00", new DateTime(2026, 10, 28, 1, 30, 0)));
        Assert.False(ActionRunner.InTimeRange("22:00-02:00", new DateTime(2026, 10, 28, 12, 0, 0)));
        Assert.Equal(3, ActionRunner.WeekdayOf(new DateTime(2026, 10, 28))); // Wednesday
        Assert.Equal(7, ActionRunner.WeekdayOf(new DateTime(2026, 11, 1)));  // Sunday
    }

    [Fact]
    public void Pruefung_der_neuen_Bausteine()
    {
        Assert.Throws<RpcException>(() => ActionRunner.Check(new[] { S(StepType.CloseItem) }));
        Assert.Throws<RpcException>(() => ActionRunner.Check(new[] { S(StepType.IfTime, "25:00-26:00") }));
        Assert.Throws<RpcException>(() => ActionRunner.Check(new[] { S(StepType.IfWeekday, "0,8") }));
        Assert.Throws<RpcException>(() => ActionRunner.Check(new[] { S(StepType.RunQuickAction, "x; rm") }));
        Assert.Throws<RpcException>(() => ActionRunner.Check(new[] { S(StepType.IfGameRunning) }, allowControl: false));
        ActionRunner.Check(new[] { S(StepType.IfTime, "22:00-02:00"), S(StepType.IfWeekday, "6,7"), S(StepType.CloseItem, "item_mc"), S(StepType.CloseOtherGames), S(StepType.RunQuickAction, "qa_abc") });
    }

    [Fact]
    public async Task Bedingungen_beenden_den_Ablauf_und_Schliessen_laeuft_nur_wenn_erfuellt()
    {
        var closed = new List<string?>();
        var runner = new ActionRunner
        {
            Now = () => new DateTime(2026, 10, 28, 20, 0, 0), // Wednesday 20:00
            AnyGameRunning = () => true,
            CloseItem = id => { closed.Add(id); return Task.FromResult("Minecraft geschlossen"); },
            CloseGames = except => { closed.Add("others-except-" + except); return Task.FromResult("Hades geschlossen"); },
        };
        var r = await runner.RunAsync(new[] { S(StepType.IfWeekday, "1,2,3,4,5"), S(StepType.IfTime, "18:00-23:00"), S(StepType.IfGameRunning), S(StepType.CloseItem, "item_mc") }, "Test");
        Assert.Equal("Minecraft geschlossen", r[^1]);
        r = await runner.RunAsync(new[] { S(StepType.IfWeekday, "6,7"), S(StepType.CloseItem, "item_mc") }, "Test");
        Assert.StartsWith("Beendet: Heute ist Mi", r[^1]);
        r = await runner.RunAsync(new[] { S(StepType.IfNoGameRunning), S(StepType.CloseItem, "item_mc") }, "Test");
        Assert.Single(r);
        Assert.Single(closed); // only the first run closed something

        // "Alle anderen Spiele schließen" keeps the game that triggered the rule.
        ActionRunner.TriggerItem.Value = "item_valorant";
        await runner.RunAsync(new[] { S(StepType.CloseOtherGames) }, "Test");
        ActionRunner.TriggerItem.Value = null;
        Assert.Equal("others-except-item_valorant", closed[^1]);
    }

    [Fact]
    public async Task Quick_Action_aufrufen_ohne_Endlosschleife_und_ohne_Rueckfrage_zu_umgehen()
    {
        var launched = new List<string>();
        var qas = new Dictionary<string, QuickAction>
        {
            ["qa_discord"] = new() { Id = "qa_discord", Name = "Discord", Steps = { S(StepType.LaunchItem, "item_discord") } },
            ["qa_loop"] = new() { Id = "qa_loop", Name = "Schleife", Steps = { S(StepType.RunQuickAction, "qa_loop") } },
            ["qa_ask"] = new() { Id = "qa_ask", Name = "Mit Frage", RequireConfirm = true, Steps = { S(StepType.LaunchItem, "item_x") } },
        };
        var runner = new ActionRunner
        {
            QuickAction = id => qas.GetValueOrDefault(id),
            LaunchItem = (id, _) => { launched.Add(id); return new LaunchResult(true, "ok"); },
        };
        var r = await runner.RunAsync(new[] { S(StepType.RunQuickAction, "qa_discord") }, "Test");
        Assert.Equal(new[] { "item_discord" }, launched);
        Assert.Contains("„Discord“: Gestartet", r[0]);
        r = await runner.RunAsync(new[] { S(StepType.RunQuickAction, "qa_loop") }, "Test");
        Assert.Contains("wird nicht ausgeführt", r[0]);
        r = await runner.RunAsync(new[] { S(StepType.RunQuickAction, "qa_ask") }, "Test");
        Assert.Contains("nur von Hand", r[0]);
        Assert.Single(launched);
    }

    [Fact]
    public async Task Uhrzeit_Ausloeser_und_Programm_Ausloeser()
    {
        using var dir = new TempDir();
        var fired = new List<string>();
        var runner = new ActionRunner { Notify = t => fired.Add(t) };
        var engine = new AutomationEngine(new AppPaths(Path.Combine(dir.Path, "data")), new NullHub(), runner);
        Assert.Throws<RpcException>(() => engine.Save(new AutomationRule { Name = "ohne Zeit", Trigger = TriggerType.Schedule, Actions = { S(StepType.Notify, "x") } }));
        engine.Save(new AutomationRule { Name = "Abends", Trigger = TriggerType.Schedule, TriggerRef = "20:00|1,2,3,4,5", Actions = { S(StepType.Notify, "Feierabend") } });
        engine.Save(new AutomationRule { Name = "Discord zu Spielen", Trigger = TriggerType.GameStarted, Actions = { S(StepType.Notify, "Spiel") } });
        engine.Save(new AutomationRule { Name = "Spotify", Trigger = TriggerType.ProgramStarted, TriggerRef = "item_spotify", Actions = { S(StepType.Notify, "Programm") } });

        await engine.CheckSchedule(new DateTime(2026, 10, 31, 20, 0, 10)); // Saturday – not on the list
        await engine.CheckSchedule(new DateTime(2026, 10, 28, 19, 59, 50));
        await engine.CheckSchedule(new DateTime(2026, 10, 28, 20, 0, 5));
        await engine.CheckSchedule(new DateTime(2026, 10, 28, 20, 0, 30)); // same minute: once
        Assert.Equal(new[] { "Feierabend" }, fired);

        // A program start does not count as "Spiel startet"; it has its own trigger.
        await engine.FireItem(new LibraryItem { Id = "item_spotify", Name = "Spotify", Kind = ItemKind.Program }, started: true);
        Assert.Equal(new[] { "Feierabend", "Programm" }, fired);
        await engine.FireItem(new LibraryItem { Id = "item_hades", Name = "Hades", Kind = ItemKind.Game }, started: true);
        Assert.Equal("Spiel", fired[^1]);
    }
}
