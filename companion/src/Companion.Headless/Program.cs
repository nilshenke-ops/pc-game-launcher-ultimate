using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

// Cross-platform companion without desktop features (no audio, hotkeys, tray).
// Used for development, automated tests and for running the web app on non-Windows machines.
// Release check: "--check-update <manifest-url> [--assume-version 1.1.0] [--download]" runs the companion's real update
// check (manifest, https, signature) and optionally the download with size/checksum/file check. Exit code 0 = OK.
if (args.Length > 1 && args[0] == "--check-update")
{
    var tmp = Directory.CreateTempSubdirectory("pgl-update-check").FullName;
    var settings = new Pgl.Core.Models.Settings { UpdateManifestUrl = args[1] };
    var updates = new UpdateService(new AppPaths(tmp), () => settings, new NullUpdateInstaller(), new Pgl.Core.Rpc.NullHub());
    var assume = Array.IndexOf(args, "--assume-version") is var ai && ai > 0 && ai + 1 < args.Length ? args[ai + 1] : null;
    updates.VersionOverride = assume;
    var status = System.Text.Json.JsonSerializer.SerializeToElement(await updates.Check(), Json.Options);
    if (args.Contains("--download") && status.GetProperty("state").GetString() == "available")
        status = System.Text.Json.JsonSerializer.SerializeToElement(await updates.Download(), Json.Options);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(status, Json.Pretty));
    try { Directory.Delete(tmp, true); } catch { }
    return status.GetProperty("state").GetString() is "available" or "ready" or "up-to-date" ? 0 : 2;
}

string? dataDir = null;
for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--data") dataDir = args[i + 1];

// PGL_POWER_DRYRUN=1: lock/restart/shut down only write to the log (to try the app on a test machine).
// PGL_REMOTE_TESTSOURCE=1: remote desktop shows a test picture (marked as such in the app) instead of "Windows only".
var testScreen = Environment.GetEnvironmentVariable("PGL_REMOTE_TESTSOURCE") == "1" ? new TestScreenSource() : null;
var platform = new GenericPlatform
{
    Power = Environment.GetEnvironmentVariable("PGL_POWER_DRYRUN") == "1" ? new DryRunPower() : NullPower.Instance,
    Screen = testScreen ?? (IScreenCapture)NullScreenCapture.Instance,
    RemoteInput = testScreen ?? (IRemoteInput)NullRemoteInput.Instance,
};
var services = new CompanionServices(platform, new AppPaths(dataDir));
await services.StartAsync();
if (services.Web.StartError != null) { Console.Error.WriteLine(services.Web.StartError); return 1; }

var adminUrl = $"http://127.0.0.1:{services.Web.Port}/#admin={services.Rpc.AdminToken}";
Console.WriteLine("Nexus Gaming Hub – Companion (headless)");
Console.WriteLine($"PC-Ansicht (nur auf diesem Rechner öffnen): {adminUrl}");
Console.WriteLine($"Auf diesem PC: {services.Web.LocalUrl}");
foreach (var u in services.Web.LanUrls()) Console.WriteLine($"Im WLAN (iPad/Handy): {u}");
if (services.Web.LanUrls().Count == 0) Console.WriteLine("Im WLAN: keine Adresse (WLAN-Zugriff aus oder kein Netzwerkadapter im Heimnetz). 127.0.0.1 funktioniert nur auf diesem PC selbst.");
var adminFile = Environment.GetEnvironmentVariable("PGL_ADMIN_TOKEN_FILE");
if (!string.IsNullOrEmpty(adminFile)) File.WriteAllText(adminFile, services.Rpc.AdminToken);

var done = new TaskCompletionSource();
using var sigTerm = System.Runtime.InteropServices.PosixSignalRegistration.Create(System.Runtime.InteropServices.PosixSignal.SIGTERM, c => { c.Cancel = true; done.TrySetResult(); });
using var sigInt = System.Runtime.InteropServices.PosixSignalRegistration.Create(System.Runtime.InteropServices.PosixSignal.SIGINT, c => { c.Cancel = true; done.TrySetResult(); });
await done.Task;
await services.DisposeAsync();
return 0;
