using Pgl.Core.Assistant;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Xunit;
using Xunit.Abstractions;

namespace Pgl.Core.Tests;

/// <summary>
/// Real network, no key needed: the public OpenRouter model list and the anonymous Pollinations endpoint. Switched on with PGL_LIVE=1
/// (otherwise they return at once), so the normal test run does not depend on the internet.
/// </summary>
public class FreeAiLiveTests(ITestOutputHelper log)
{
    static bool Live => Environment.GetEnvironmentVariable("PGL_LIVE") == "1";

    [Fact]
    public async Task OpenRouter_Modellliste_live_nur_Gratis_Modelle_kommen_durch_den_Kostenwaechter()
    {
        if (!Live) return;
        using var dir = new TempDir();
        var hub = new FreeAiHub(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets);
        hub.Set("openrouter", null, "sk-or-v1-0123456789abcdef0123456789", null, null);
        var key = typeof(FreeAiHub);
        // the list is public – refreshing needs no key
        var models = await hub.RefreshModelsAsync("openrouter");
        log.WriteLine($"OpenRouter: {models.Count} kostenlose Chat-Modelle");
        foreach (var m in models.Take(12)) log.WriteLine($"  {m.Id}  ctx={m.Context}  rank={m.Rank}");
        Assert.NotEmpty(models);
        Assert.All(models, m => Assert.True(CostGuard.IsFreeId(m.Id), m.Id));
        Assert.Equal("openrouter/free", models[0].Id);                                      // the free router is first choice
        Assert.DoesNotContain(models, m => m.Id is "openrouter/auto" or "openrouter/fusion" or "openrouter/pareto-code" or "openrouter/bodybuilder");
    }

    [Fact]
    public async Task Pollinations_anonym_live_liefert_eine_Antwort_oder_eine_klar_erkannte_Budget_Meldung()
    {
        if (!Live) return;
        using var dir = new TempDir();
        var hub = new FreeAiHub(new AppPaths(Path.Combine(dir.Path, "d")), new GenericPlatform().Secrets);
        hub.Set("pollinations", null, null, null, true);
        hub.Set("pollinations", true, null, null, null);
        try
        {
            var a = await hub.AskAsync("pollinations", "Antworte kurz.", new[] { new ChatTurn("user", "Wie hoch ist der Mount Everest?") });
            log.WriteLine($"Pollinations antwortet ({a.Model}): {a.Text}");
            Assert.False(string.IsNullOrWhiteSpace(a.Text));
            Assert.False(CostGuard.LooksLikePaymentNotice(a.Text, a.OutputTokens));
        }
        catch (ProviderException e)
        {
            log.WriteLine($"Pollinations nicht nutzbar ({e.Kind}): {e.Message}");   // an honest, classified failure – never a payment request shown as an answer
            Assert.Contains(e.Kind, new[] { "limit", "busy", "down", "offline", "empty", "error", "model" });
        }
    }
}
