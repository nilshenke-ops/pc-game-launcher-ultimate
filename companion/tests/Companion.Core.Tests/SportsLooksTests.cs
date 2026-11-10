using Pgl.Core.Assistant;
using Xunit;

namespace Pgl.Core.Tests;

public class SportsLooksTests
{
    // "Wie viel hat Bayern gespielt?" is a question about a match – not about the own play time (the local answer for "gespielt").
    [Theory]
    [InlineData("Wie viel hat Bayern gespielt?")]
    [InlineData("wie viel Bayern gespielt hat")]
    [InlineData("Wie hat Bayern gestern gespielt?")]
    [InlineData("Was hat Dortmund heute gespielt?")]
    public void Questions_about_a_match_look_sporty(string q) => Assert.True(SportsClient.LooksSporty(q));
}
