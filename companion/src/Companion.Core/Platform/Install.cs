namespace Pgl.Core.Platform;

/// <summary>Installs the single EXE for the current user (no admin rights): own folder, Start menu, "Apps &amp; Features" entry.</summary>
public interface IInstaller
{
    bool Supported { get; }
    InstallStatus Status();
    /// <summary>Copies the program into its folder and creates the entries. Returns an error text or null. With
    /// <paramref name="restart"/> the installed copy is started and this process ends.</summary>
    string? Install(InstallOptions options, bool restart);
    /// <summary>Removes shortcuts, autostart and the uninstall entry, then the program folder (after this process ended).
    /// User data stays unless <paramref name="removeData"/>.</summary>
    string? Uninstall(bool removeData);
}

public sealed record InstallOptions(bool StartMenu = true, bool Desktop = false, bool Autostart = true);

public sealed class InstallStatus
{
    public bool Supported { get; set; }
    /// <summary>The program runs from its install folder.</summary>
    public bool Installed { get; set; }
    public string? CurrentPath { get; set; }
    public string? InstallPath { get; set; }
    public bool StartMenu { get; set; }
    public bool Desktop { get; set; }
    public bool UninstallEntry { get; set; }
    public bool Autostart { get; set; }
    /// <summary>Another copy is installed and this one runs from elsewhere (e.g. Downloads).</summary>
    public bool OtherCopyInstalled { get; set; }
    public string? Reason { get; set; }
}

public sealed class NullInstaller : IInstaller
{
    public static readonly NullInstaller Instance = new();
    public bool Supported => false;
    public InstallStatus Status() => new() { Supported = false, CurrentPath = Environment.ProcessPath, Reason = "Installieren gibt es nur im Windows-Begleiter." };
    public string? Install(InstallOptions options, bool restart) => "Installieren gibt es nur im Windows-Begleiter.";
    public string? Uninstall(bool removeData) => "Deinstallieren gibt es nur im Windows-Begleiter.";
}

/// <summary>
/// Where things go and what is written, without touching the system – the Windows installer only applies this plan,
/// so paths and registry values are checked by tests. Everything is per user (HKCU, %LOCALAPPDATA%), no admin rights.
/// </summary>
public sealed class InstallPlan
{
    public const string AppName = "Nexus Gaming Hub";
    public const string ExeName = "PCGameLauncherCompanion.exe";
    public const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusGamingHub";
    public const string Publisher = "Nexus Gaming Hub (nilshenke-ops)";

    public string Dir { get; }
    public string Exe { get; }
    public string StartMenuLink { get; }
    public string DesktopLink { get; }

    public InstallPlan(string localAppData, string startMenuPrograms, string desktop)
    {
        Dir = Path.Combine(localAppData, "Programs", AppName);
        Exe = Path.Combine(Dir, ExeName);
        StartMenuLink = Path.Combine(startMenuPrograms, AppName + ".lnk");
        DesktopLink = Path.Combine(desktop, AppName + ".lnk");
    }

    public bool IsInstalledPath(string? path) =>
        path != null && string.Equals(Path.GetFullPath(path), Path.GetFullPath(Exe), StringComparison.OrdinalIgnoreCase);

    /// <summary>Values of the "Apps &amp; Features" entry (strings and DWORDs). The size is given in KB as Windows expects.</summary>
    public Dictionary<string, object> UninstallValues(string version, long exeBytes, DateTime today) => new()
    {
        ["DisplayName"] = AppName,
        ["DisplayVersion"] = version,
        ["Publisher"] = Publisher,
        ["DisplayIcon"] = $"\"{Exe}\",0",
        ["InstallLocation"] = Dir,
        ["UninstallString"] = $"\"{Exe}\" --uninstall",
        ["QuietUninstallString"] = $"\"{Exe}\" --uninstall --quiet",
        ["URLInfoAbout"] = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/",
        ["InstallDate"] = today.ToString("yyyyMMdd"),
        ["EstimatedSize"] = (int)Math.Min(int.MaxValue, Math.Max(1, exeBytes / 1024)),
        ["NoModify"] = 1,
        ["NoRepair"] = 1,
    };

    /// <summary>The autostart command for the installed copy (same format as before, so existing entries are recognized).</summary>
    public string AutostartCommand => $"\"{Exe}\" --minimized";
}
