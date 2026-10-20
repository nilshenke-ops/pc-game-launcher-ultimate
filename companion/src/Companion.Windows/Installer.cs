using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using Microsoft.Win32;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

namespace Pgl.Windows;

/// <summary>
/// Installs the single EXE for the current user without an extra setup program and without administrator rights:
/// %LOCALAPPDATA%\Programs\Nexus Gaming Hub, Start menu entry, optional desktop icon, autostart and an entry in
/// "Apps &amp; Features" whose "Deinstallieren" runs this EXE with --uninstall. Settings and data stay in their own folder.
/// </summary>
sealed class WindowsInstaller(Action exit) : IInstaller
{
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string RunName = "PCGameLauncherUltimate";
    public static InstallPlan Plan { get; } = new(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));

    public bool Supported => Environment.ProcessPath?.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) == true;

    public InstallStatus Status()
    {
        var installed = Plan.IsInstalledPath(Environment.ProcessPath);
        using var run = Registry.CurrentUser.OpenSubKey(RunKey);
        using var un = Registry.CurrentUser.OpenSubKey(InstallPlan.UninstallKey);
        return new InstallStatus
        {
            Supported = Supported, Installed = installed, CurrentPath = Environment.ProcessPath, InstallPath = Plan.Exe,
            StartMenu = File.Exists(Plan.StartMenuLink), Desktop = File.Exists(Plan.DesktopLink), UninstallEntry = un != null,
            Autostart = run?.GetValue(RunName) is string v && v.Contains(Plan.Exe, StringComparison.OrdinalIgnoreCase),
            OtherCopyInstalled = !installed && File.Exists(Plan.Exe),
        };
    }

    public string? Install(InstallOptions o, bool restart)
    {
        if (!Supported) return "Nur die Windows-EXE kann installiert werden.";
        var me = Environment.ProcessPath!;
        var fromElsewhere = !Plan.IsInstalledPath(me);
        try
        {
            Directory.CreateDirectory(Plan.Dir);
            // Only this process runs (one companion per PC), so the installed copy is not in use.
            if (fromElsewhere) File.Copy(me, Plan.Exe, overwrite: true);
            Link(Plan.StartMenuLink, o.StartMenu);
            Link(Plan.DesktopLink, o.Desktop);
            using (var k = Registry.CurrentUser.CreateSubKey(InstallPlan.UninstallKey))
                foreach (var (name, value) in Plan.UninstallValues(UpdateService.CurrentVersion, new FileInfo(Plan.Exe).Length, DateTime.Now))
                    k.SetValue(name, value, value is int ? RegistryValueKind.DWord : RegistryValueKind.String);
            using (var run = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (o.Autostart) run.SetValue(RunName, Plan.AutostartCommand);
                else if (run.GetValue(RunName) is string v && v.Contains(Plan.Exe, StringComparison.OrdinalIgnoreCase)) run.DeleteValue(RunName, false);
            }
            Log.Info("install", $"Installiert nach {Plan.Dir} (Startmenü {o.StartMenu}, Desktop {o.Desktop}, Autostart {o.Autostart})");
        }
        catch (Exception ex) { return "Installation fehlgeschlagen: " + ex.Message; }
        if (restart && fromElsewhere)
        {
            // The installed copy waits until this one has ended (same handover as after an update).
            Process.Start(new ProcessStartInfo(Plan.Exe, "--updated") { UseShellExecute = false })?.Dispose();
            exit();
        }
        return null;
    }

    void Link(string path, bool wanted)
    {
        if (!wanted) { if (File.Exists(path)) File.Delete(path); return; }
        var link = (IShellLinkW)new ShellLink();
        try
        {
            link.SetPath(Plan.Exe);
            link.SetWorkingDirectory(Plan.Dir);
            link.SetIconLocation(Plan.Exe, 0);
            link.SetDescription("Nexus Gaming Hub – Gaming-Zentrale für PC und Handy");
            ((IPersistFile)link).Save(path, false);
        }
        finally { Marshal.ReleaseComObject(link); }
    }

    /// <summary>From the PC's own app: the installed copy is started with --uninstall (it asks nothing, the user confirmed
    /// here) and this process ends, so the program file is free.</summary>
    public string? Uninstall(bool removeData)
    {
        if (!File.Exists(Plan.Exe)) return "Nicht installiert.";
        Process.Start(new ProcessStartInfo(Plan.Exe, "--uninstall --quiet" + (removeData ? " --remove-data" : "")) { UseShellExecute = false })?.Dispose();
        exit();
        return null;
    }

    /// <summary>The actual removal (run as its own process with --uninstall, never while the companion runs).</summary>
    public static int RunUninstall(bool quiet, bool removeData)
    {
        if (!quiet)
        {
            if (MessageBox.Show("Nexus Gaming Hub von diesem PC entfernen?\n\nStartmenü-Eintrag, Desktop-Symbol, Autostart und das Programm werden entfernt.",
                    "Nexus Gaming Hub deinstallieren", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return 1;
            removeData = MessageBox.Show("Auch deine Einstellungen und Daten löschen (Bibliothek, Profile, Sounds, Kalender, Kopplungen …)?\n\n„Nein“ behält sie – bei einer neuen Installation ist dann alles wieder da.",
                "Nexus Gaming Hub deinstallieren", MessageBoxButtons.YesNo, MessageBoxIcon.Question, MessageBoxDefaultButton.Button2) == DialogResult.Yes;
        }
        var problems = new List<string>();
        void Try(string what, Action a) { try { a(); } catch (Exception ex) { problems.Add($"{what}: {ex.Message}"); } }
        Try("Autostart", () =>
        {
            using var run = Registry.CurrentUser.OpenSubKey(RunKey, writable: true);
            if (run?.GetValue(RunName) is string v && v.Contains(Plan.Exe, StringComparison.OrdinalIgnoreCase)) run.DeleteValue(RunName, false);
        });
        Try("Startmenü", () => { if (File.Exists(Plan.StartMenuLink)) File.Delete(Plan.StartMenuLink); });
        Try("Desktop", () => { if (File.Exists(Plan.DesktopLink)) File.Delete(Plan.DesktopLink); });
        Try("Apps & Features", () => Registry.CurrentUser.DeleteSubKeyTree(InstallPlan.UninstallKey, throwOnMissingSubKey: false));
        if (removeData) Try("Daten", () => { var d = new AppPaths().DataDir; if (Directory.Exists(d)) Directory.Delete(d, true); });
        Try("Programmordner", () =>
        {
            // A running program file cannot be deleted, but it can be moved: it goes to the temp folder (Windows cleans it up
            // with the disk cleanup) and the program folder is removed completely.
            var me = Environment.ProcessPath!;
            if (Plan.IsInstalledPath(me))
            {
                var parked = Path.Combine(Path.GetTempPath(), $"NexusGamingHub-entfernt-{Guid.NewGuid():N}.exe");
                File.Move(me, parked);
            }
            if (Directory.Exists(Plan.Dir)) Directory.Delete(Plan.Dir, true);
        });
        if (!quiet || problems.Count > 0)
            MessageBox.Show(problems.Count == 0 ? "Nexus Gaming Hub wurde entfernt." + (removeData ? "" : "\nDeine Daten sind noch da (für eine spätere Installation).")
                : "Nexus Gaming Hub wurde entfernt, aber nicht alles:\n\n" + string.Join("\n", problems), "Nexus Gaming Hub", MessageBoxButtons.OK,
                problems.Count == 0 ? MessageBoxIcon.Information : MessageBoxIcon.Warning);
        return problems.Count == 0 ? 0 : 2;
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    class ShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    interface IShellLinkW
    {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
}
