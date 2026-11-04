using System.Text.RegularExpressions;

namespace Pgl.Core.Services;

/// <summary>
/// Programs that sit in the game list but are not played: a live wallpaper runs all day next to everything else. They are
/// no "game running" for the island and the game mode, and in the displays they only stand for the game when nothing
/// else runs.
/// </summary>
public static class AmbientApps
{
    static readonly Regex Names = new(@"wallpaper ?engine|lively wallpaper|rainmeter|wallpaper ?alive|nexus wallpaper", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    public static bool IsAmbient(string? name) => !string.IsNullOrWhiteSpace(name) && Names.IsMatch(name);
}
