using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Services;

// Cross-platform companion without desktop features (no audio, hotkeys, tray).
// Used for development, automated tests and for running the web app on non-Windows machines.
string? dataDir = null;
for (int i = 0; i < args.Length - 1; i++) if (args[i] == "--data") dataDir = args[i + 1];

var services = new CompanionServices(new GenericPlatform(), new AppPaths(dataDir));
await services.StartAsync();
if (services.Web.StartError != null) { Console.Error.WriteLine(services.Web.StartError); return 1; }

var adminUrl = $"http://127.0.0.1:{services.Web.Port}/#admin={services.Rpc.AdminToken}";
Console.WriteLine("PC Game Launcher Ultimate – Companion (headless)");
Console.WriteLine($"PC-Ansicht (nur auf diesem Rechner öffnen): {adminUrl}");
foreach (var u in services.Web.LanUrls()) Console.WriteLine($"Im WLAN: {u}");
var adminFile = Environment.GetEnvironmentVariable("PGL_ADMIN_TOKEN_FILE");
if (!string.IsNullOrEmpty(adminFile)) File.WriteAllText(adminFile, services.Rpc.AdminToken);

var done = new TaskCompletionSource();
using var sigTerm = System.Runtime.InteropServices.PosixSignalRegistration.Create(System.Runtime.InteropServices.PosixSignal.SIGTERM, c => { c.Cancel = true; done.TrySetResult(); });
using var sigInt = System.Runtime.InteropServices.PosixSignalRegistration.Create(System.Runtime.InteropServices.PosixSignal.SIGINT, c => { c.Cancel = true; done.TrySetResult(); });
await done.Task;
await services.DisposeAsync();
return 0;
