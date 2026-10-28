using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class SoundIconTests
{
    [Theory]
    [InlineData("🔥", "🔥")]
    [InlineData("😂", "😂")]
    [InlineData("👻🎃", "👻🎃")]
    [InlineData("", null)]
    [InlineData("abc", null)]
    [InlineData("<b>", null)]
    [InlineData("🔥 x", null)]
    [InlineData("🔥🔥🔥🔥🔥", null)] // too long (10 UTF-16 units)
    public void Nur_Emoji_als_Kachel_Icon(string input, string? expected) => Assert.Equal(expected, SoundboardService.CleanIcon(input));
}
