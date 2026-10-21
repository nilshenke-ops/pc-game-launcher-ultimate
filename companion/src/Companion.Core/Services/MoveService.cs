using System.Security.Cryptography;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>One planned or running move of a game to another drive.</summary>
public sealed class MoveJob
{
    public string Id { get; set; } = "";
    public string ItemId { get; set; } = "";
    public string Game { get; set; } = "";
    public string AppId { get; set; } = "";
    /// <summary>Game folder now (…\steamapps\common\&lt;name&gt;).</summary>
    public string Source { get; set; } = "";
    /// <summary>Steam library the game moves to (folder that contains "steamapps").</summary>
    public string TargetLibrary { get; set; } = "";
    public string Target { get; set; } = "";
    /// <summary>planned → copying → copied → switched → done; or interrupted / failed / cancelled.</summary>
    public string Phase { get; set; } = "planned";
    public long TotalBytes { get; set; }
    public int TotalFiles { get; set; }
    public long DoneBytes { get; set; }
    public int DoneFiles { get; set; }
    public string? Error { get; set; }
    public string By { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? CopiedAt { get; set; }
    public List<string> Log { get; set; } = new();
}

public sealed class MovesFile { public List<MoveJob> Jobs { get; set; } = new(); }

/// <summary>
/// Moves Steam games to another drive safely. Steam's own way is the button in Steam (Properties → Installed files →
/// Move install folder) – the app shows it first. The assistant does the same steps Steam does, but checked:
/// 1. copy the game folder into an existing Steam library on the other drive and verify every file (SHA-256);
/// 2. with Steam closed, put the game's manifest into the new library (the old one is kept as backup);
/// 3. only after you confirm that the game starts from the new place, delete the original.
/// Until step 3 everything can be undone. Nothing runs while the game (or for step 2 Steam) is running; an interrupted
/// copy continues where it stopped (files already copied are verified again, not trusted). Other launchers (Xbox, Epic,
/// EA …) are not moved by the app – only their official ways are explained.
/// </summary>
public sealed class MoveService : IDisposable
{
    public const long Reserve = 1L << 30; // 1 GB stays free on the target drive
    readonly JsonStore<MovesFile> _store;
    readonly LibraryService _library;
    readonly Func<IEnumerable<string>> _steamRoots;
    readonly Func<string, bool> _gameRunning;
    readonly Func<bool> _steamRunning;
    readonly Func<string, string> _driveOf;
    readonly Func<string, long?> _freeBytes;
    readonly IHub _hub;
    readonly object _lock = new();
    readonly Dictionary<string, CancellationTokenSource> _running = new();

    public MoveService(AppPaths paths, LibraryService library, Func<IEnumerable<string>> steamRoots, Func<string, bool> gameRunning, Func<bool> steamRunning, IHub hub,
        Func<string, string>? driveOf = null, Func<string, long?>? freeBytes = null)
    {
        _store = new JsonStore<MovesFile>(paths.File("moves.json"));
        _library = library; _steamRoots = steamRoots; _gameRunning = gameRunning; _steamRunning = steamRunning; _hub = hub;
        _driveOf = driveOf ?? (p => (Path.GetPathRoot(Path.GetFullPath(p)) ?? p).ToUpperInvariant());
        _freeBytes = freeBytes ?? (p => { try { return new DriveInfo(Path.GetPathRoot(Path.GetFullPath(p))!).AvailableFreeSpace; } catch { return null; } });
        // A copy that was running when the companion stopped continues only when asked (and is verified again).
        _store.Update(f => { foreach (var j in f.Jobs.Where(j => j.Phase == "copying")) { j.Phase = "interrupted"; Add(j, "Unterbrochen (Begleiter wurde beendet). „Fortsetzen“ prüft die schon kopierten Dateien und macht weiter."); } });
    }

    public List<MoveJob> List() => _store.Snapshot().Jobs.OrderByDescending(j => j.CreatedAt).ToList();
    MoveJob Get(string id) => _store.Get(f => f.Jobs.FirstOrDefault(j => j.Id == id)) ?? throw new RpcException("not-found", "Umzug nicht gefunden.");

    static void Add(MoveJob j, string text) { j.Log.Add($"{DateTime.UtcNow:u} {text}"); if (j.Log.Count > 60) j.Log.RemoveAt(0); j.UpdatedAt = DateTime.UtcNow; }

    // ------------------------------------------------------------------ Steam libraries

    public sealed record SteamLibrary(string Path, string Drive, long? FreeBytes);

    public List<SteamLibrary> Libraries()
    {
        var list = new List<string>();
        foreach (var root in _steamRoots())
        {
            var file = System.IO.Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(file)) continue;
            list.Add(root);
            try
            {
                var folders = Vdf.Parse(File.ReadAllText(file)).Child("libraryfolders");
                if (folders != null) foreach (var (_, v) in folders) if (v is Vdf.Node n && n.Str("path") is { } p) list.Add(p);
            }
            catch (Exception ex) { Log.Warn("move", "libraryfolders.vdf nicht lesbar: " + ex.Message); }
        }
        return list.Select(p => p.TrimEnd('\\', '/')).Distinct(StringComparer.OrdinalIgnoreCase).Where(p => Directory.Exists(System.IO.Path.Combine(p, "steamapps")))
            .Select(p => new SteamLibrary(p, _driveOf(p), _freeBytes(p))).ToList();
    }

    static string? LibraryOf(string gameFolder)
    {
        var common = System.IO.Path.GetDirectoryName(gameFolder.TrimEnd('\\', '/'));
        var steamapps = common == null ? null : System.IO.Path.GetDirectoryName(common);
        return steamapps != null && string.Equals(System.IO.Path.GetFileName(common), "common", StringComparison.OrdinalIgnoreCase)
            && string.Equals(System.IO.Path.GetFileName(steamapps), "steamapps", StringComparison.OrdinalIgnoreCase) ? System.IO.Path.GetDirectoryName(steamapps) : null;
    }

    /// <summary>Everything inside the folder – never follows a link (junction/symlink) out of it.</summary>
    static IEnumerable<FileSystemInfo> Walk(string dir)
    {
        var stack = new Stack<DirectoryInfo>();
        stack.Push(new DirectoryInfo(dir));
        while (stack.Count > 0)
            foreach (var e in stack.Pop().EnumerateFileSystemInfos())
            {
                yield return e;
                if (e is DirectoryInfo d && !d.Attributes.HasFlag(FileAttributes.ReparsePoint)) stack.Push(d);
            }
    }

    static IEnumerable<FileInfo> Files(string dir) => Walk(dir).OfType<FileInfo>().Where(f => !f.Attributes.HasFlag(FileAttributes.ReparsePoint));

    static (long bytes, int files) Measure(string dir)
    {
        long b = 0; var n = 0;
        foreach (var f in Files(dir)) { b += f.Length; n++; }
        return (b, n);
    }

    static string? LinkInside(string dir) => Walk(dir).FirstOrDefault(e => e.Attributes.HasFlag(FileAttributes.ReparsePoint))?.FullName;

    /// <summary>What is possible for this game: official way, target libraries with free space, checks.</summary>
    public object Options(string itemId)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        var official = item.Source switch
        {
            LaunchSource.Steam => "Steam selbst: Bibliothek → Rechtsklick auf das Spiel → Eigenschaften → Installierte Dateien → „Installationsordner verschieben“. Das Ziel-Laufwerk braucht eine Steam-Bibliothek (Steam → Einstellungen → Speicher → „Laufwerk hinzufügen“).",
            LaunchSource.AppsFolder => "Microsoft Store / Xbox-App: Spiel → „…“ → Verwalten → Dateien → „Verschieben“ (Microsoft-Store-Spiele lassen sich nur dort verschieben).",
            LaunchSource.Epic => "Epic hat keine Verschieben-Funktion: Spiel deinstallieren und auf dem anderen Laufwerk neu installieren – oder Ordner kopieren, in Epic „Installieren“ auf den neuen Ordner zeigen und „Überprüfen“ lassen.",
            _ => "Für diesen Launcher kennt der Begleiter keinen sicheren Weg – bitte die Funktion des Launchers verwenden (meist Deinstallieren und auf dem anderen Laufwerk neu installieren).",
        };
        if (item.Source != LaunchSource.Steam || string.IsNullOrEmpty(item.InstallDir))
            return new { itemId, game = item.Name, supported = false, official, reason = "Der Umzugsassistent kann nur Steam-Spiele verschieben.", targets = Array.Empty<object>() };
        var src = item.InstallDir;
        var srcLib = LibraryOf(src);
        var checks = new List<object>();
        void C(string label, bool ok, string detail) => checks.Add(new { label, status = ok ? "ok" : "error", detail });
        var exists = Directory.Exists(src);
        C("Spielordner", exists && srcLib != null, exists ? srcLib != null ? src : "Liegt nicht in einer Steam-Bibliothek." : "Ordner fehlt.");
        var state = SteamAppState.ForInstallDir(src, item.Target);
        C("Vollständig installiert", state?.Status == "current", state == null ? "Steam-Manifest nicht gefunden." : state.Status == "current" ? "Kein Update oder Download offen." : "Erst Update/Download in Steam abschließen.");
        C("Spiel läuft nicht", !_gameRunning(item.Id), _gameRunning(item.Id) ? "Bitte das Spiel beenden." : "OK");
        var link = exists ? LinkInside(src) : null;
        var (bytes, files) = exists ? Measure(src) : (0, 0);
        C("Keine Verknüpfungen im Ordner", link == null, link == null ? $"{files} Dateien" : $"„{link}“ ist eine Verknüpfung – solche Ordner werden nicht verschoben.");
        var srcDrive = _driveOf(src);
        var targets = Libraries().Where(l => !string.Equals(l.Drive, srcDrive, StringComparison.OrdinalIgnoreCase))
            .Select(l => (object)new { library = l.Path, drive = l.Drive, freeBytes = l.FreeBytes, fits = l.FreeBytes is { } fb && fb - Reserve >= bytes }).ToList();
        return new { itemId, game = item.Name, supported = true, official, source = src, sourceDrive = srcDrive, sizeBytes = bytes, files, checks, targets,
            noTarget = targets.Count == 0 ? "Auf einem anderen Laufwerk gibt es noch keine Steam-Bibliothek. In Steam: Einstellungen → Speicher → „Laufwerk hinzufügen“ – danach erscheint es hier." : null };
    }

    // ------------------------------------------------------------------ plan, copy

    public MoveJob Plan(string itemId, string targetLibrary, string by)
    {
        var item = _library.Get(itemId) ?? throw new RpcException("not-found", "Spiel nicht gefunden.");
        if (item.Source != LaunchSource.Steam || string.IsNullOrEmpty(item.InstallDir) || LibraryOf(item.InstallDir) == null) throw new RpcException("unsupported", "Der Umzugsassistent kann nur Steam-Spiele verschieben.");
        var lib = Libraries().FirstOrDefault(l => string.Equals(l.Path, targetLibrary.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase))
            ?? throw new RpcException("invalid-params", "Das Ziel ist keine Steam-Bibliothek dieses PCs.");
        if (string.Equals(lib.Drive, _driveOf(item.InstallDir), StringComparison.OrdinalIgnoreCase)) throw new RpcException("invalid-params", "Ziel liegt auf demselben Laufwerk.");
        if (List().Any(j => j.ItemId == itemId && j.Phase is "planned" or "copying" or "copied" or "switched" or "interrupted")) throw new RpcException("exists", "Für dieses Spiel gibt es schon einen offenen Umzug.");
        var job = new MoveJob
        {
            Id = "mv_" + Ids.Token(8), ItemId = itemId, Game = item.Name, AppId = item.Target, Source = item.InstallDir, TargetLibrary = lib.Path,
            Target = System.IO.Path.Combine(lib.Path, "steamapps", "common", System.IO.Path.GetFileName(item.InstallDir.TrimEnd('\\', '/'))), By = by,
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
        };
        Add(job, $"Vorbereitet von {by}: {job.Source} → {job.Target}");
        _store.Update(f => f.Jobs.Add(job));
        _hub.Changed("moves");
        return job;
    }

    void Save(MoveJob j) { _store.Update(f => { var i = f.Jobs.FindIndex(x => x.Id == j.Id); if (i >= 0) f.Jobs[i] = j; }); }

    /// <summary>Starts (or continues) copying – only after checking everything again.</summary>
    public MoveJob Start(string id)
    {
        var j = Get(id);
        if (j.Phase is not ("planned" or "interrupted" or "failed")) throw new RpcException("invalid-state", "Dieser Umzug läuft schon oder ist fertig.");
        if (_gameRunning(j.ItemId)) throw new RpcException("busy", $"{j.Game} läuft – bitte erst beenden.");
        var item = _library.Get(j.ItemId) ?? throw new RpcException("not-found", "Spiel nicht mehr in der Bibliothek.");
        if (!string.Equals(item.InstallDir, j.Source, StringComparison.OrdinalIgnoreCase)) throw new RpcException("changed", "Das Spiel liegt inzwischen woanders – bitte neu vorbereiten.");
        if (!Directory.Exists(j.Source)) throw new RpcException("not-found", "Spielordner fehlt.");
        if (SteamAppState.ForInstallDir(j.Source, j.AppId)?.Status != "current") throw new RpcException("busy", "Steam lädt gerade ein Update oder das Spiel ist nicht vollständig – erst in Steam abschließen.");
        if (LinkInside(j.Source) is { } link) throw new RpcException("invalid-params", $"„{link}“ ist eine Verknüpfung – nicht verschoben.");
        var fresh = j.Phase == "planned";
        if (fresh && Directory.Exists(j.Target)) throw new RpcException("exists", $"Im Ziel gibt es schon „{j.Target}“ – nichts wird überschrieben.");
        var (bytes, files) = Measure(j.Source);
        var already = Directory.Exists(j.Target) ? Measure(j.Target).bytes : 0;
        var free = _freeBytes(j.TargetLibrary);
        if (free is { } fb && fb - Reserve < bytes - already) throw new RpcException("no-space", $"Zu wenig Platz: nötig {(bytes - already) / 1048576} MB + 1 GB Reserve, frei {fb / 1048576} MB.");
        j.TotalBytes = bytes; j.TotalFiles = files; j.DoneBytes = 0; j.DoneFiles = 0; j.Error = null; j.Phase = "copying";
        Add(j, fresh ? $"Kopieren gestartet ({files} Dateien, {bytes / 1048576} MB)." : "Fortgesetzt – schon kopierte Dateien werden geprüft.");
        Save(j);
        var cts = new CancellationTokenSource();
        lock (_lock) _running[j.Id] = cts;
        _ = Task.Run(() => Copy(j, cts.Token));
        _hub.Changed("moves");
        return j;
    }

    static string HashFile(string path, byte[] buffer)
    {
        using var s = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16);
        using var h = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        int n;
        while ((n = s.Read(buffer, 0, buffer.Length)) > 0) h.AppendData(buffer, 0, n);
        return Convert.ToHexString(h.GetHashAndReset());
    }

    void Copy(MoveJob j, CancellationToken ct)
    {
        var buffer = new byte[1 << 20];
        var lastReport = DateTime.MinValue;
        try
        {
            Directory.CreateDirectory(j.Target);
            var root = System.IO.Path.GetFullPath(j.Source).TrimEnd('\\', '/') + System.IO.Path.DirectorySeparatorChar;
            foreach (var f in Files(j.Source).OrderBy(f => f.FullName, StringComparer.Ordinal).ToList())
            {
                ct.ThrowIfCancellationRequested();
                if (_gameRunning(j.ItemId)) throw new IOException("Das Spiel wurde gestartet – Kopieren angehalten.");
                var rel = f.FullName[root.Length..];
                var dest = System.IO.Path.Combine(j.Target, rel);
                Directory.CreateDirectory(System.IO.Path.GetDirectoryName(dest)!);
                var srcHash = HashFile(f.FullName, buffer);
                if (!(File.Exists(dest) && new FileInfo(dest).Length == f.Length && HashFile(dest, buffer) == srcHash))
                {
                    var part = dest + ".nexus-part";
                    using (var i = new FileStream(f.FullName, FileMode.Open, FileAccess.Read, FileShare.Read, 1 << 16))
                    using (var o = new FileStream(part, FileMode.Create, FileAccess.Write, FileShare.None, 1 << 16))
                    {
                        int n;
                        while ((n = i.Read(buffer, 0, buffer.Length)) > 0) { ct.ThrowIfCancellationRequested(); o.Write(buffer, 0, n); }
                        o.Flush(true);
                    }
                    if (HashFile(part, buffer) != srcHash) { File.Delete(part); throw new IOException($"Prüfsumme stimmt nicht: {rel}"); }
                    File.Move(part, dest, true);
                    File.SetLastWriteTimeUtc(dest, f.LastWriteTimeUtc);
                }
                j.DoneBytes += f.Length; j.DoneFiles++;
                if (DateTime.UtcNow - lastReport > TimeSpan.FromMilliseconds(500))
                {
                    lastReport = DateTime.UtcNow;
                    Save(j);
                    _hub.Broadcast("move.progress", new { j.Id, j.DoneBytes, j.TotalBytes, j.DoneFiles, j.TotalFiles });
                }
            }
            j.Phase = "copied"; j.CopiedAt = DateTime.UtcNow;
            Add(j, $"Kopiert und geprüft: {j.DoneFiles} Dateien, alle Prüfsummen gleich. Nächster Schritt: Steam schließen und „Umstellen“.");
        }
        catch (OperationCanceledException) { j.Phase = "interrupted"; Add(j, "Angehalten. „Fortsetzen“ macht weiter, „Abbrechen“ löscht die Kopie."); }
        catch (Exception ex) { j.Phase = "failed"; j.Error = ex.Message; Add(j, "Fehler: " + ex.Message + " – das Original ist unverändert."); }
        finally
        {
            lock (_lock) _running.Remove(j.Id);
            Save(j);
            _hub.Broadcast("move.progress", new { j.Id, j.DoneBytes, j.TotalBytes, j.DoneFiles, j.TotalFiles });
            _hub.Changed("moves");
        }
    }

    public MoveJob Pause(string id)
    {
        lock (_lock) if (_running.TryGetValue(id, out var c)) c.Cancel();
        return Get(id);
    }

    // ------------------------------------------------------------------ switch, finish, undo

    string ManifestIn(string library, string appId) => System.IO.Path.Combine(library, "steamapps", $"appmanifest_{appId}.acf");

    /// <summary>Steam closed: the game's manifest moves to the new library (old one kept as backup) – Steam then uses the copy.</summary>
    public MoveJob Switch(string id)
    {
        var j = Get(id);
        if (j.Phase != "copied") throw new RpcException("invalid-state", "Erst kopieren und prüfen.");
        if (_steamRunning()) throw new RpcException("steam-running", "Bitte Steam ganz schließen (auch im Infobereich: Rechtsklick → Beenden) – sonst schreibt Steam die alte Stelle zurück.");
        if (_gameRunning(j.ItemId)) throw new RpcException("busy", $"{j.Game} läuft – bitte erst beenden.");
        // Changed since the copy (update, saved settings in the game folder)? Then copy again instead of losing it.
        var changed = Files(j.Source).FirstOrDefault(f => f.LastWriteTimeUtc > j.CopiedAt!.Value.AddSeconds(1));
        if (changed != null || Measure(j.Source) != Measure(j.Target))
        {
            j.Phase = "interrupted"; Add(j, "Seit der Kopie hat sich etwas im Spielordner geändert – „Fortsetzen“ gleicht es ab."); Save(j); _hub.Changed("moves");
            throw new RpcException("changed", "Seit der Kopie hat sich etwas im Spielordner geändert (Update?). Bitte „Fortsetzen“ – dann erneut umstellen.");
        }
        var srcLib = LibraryOf(j.Source)!;
        var from = ManifestIn(srcLib, j.AppId);
        var to = ManifestIn(j.TargetLibrary, j.AppId);
        if (!File.Exists(from)) throw new RpcException("not-found", "Steam-Manifest des Spiels fehlt.");
        File.Copy(from, to + ".nexus-part", true);
        if (Ids.Sha256Hex(File.ReadAllBytes(to + ".nexus-part")) != Ids.Sha256Hex(File.ReadAllBytes(from))) { File.Delete(to + ".nexus-part"); throw new RpcException("broken", "Manifest-Kopie fehlerhaft – nichts geändert."); }
        File.Move(to + ".nexus-part", to, true);
        File.Move(from, from + ".nexus-moved", true);
        UpdateInstallDir(j.ItemId, j.Target);
        j.Phase = "switched";
        Add(j, "Umgestellt: Steam nutzt jetzt die Kopie. Bitte Steam öffnen und das Spiel einmal starten – dann „Funktioniert – Original löschen“. Bis dahin ist „Rückgängig“ möglich.");
        Save(j); _hub.Changed("moves");
        return j;
    }

    void UpdateInstallDir(string itemId, string dir) => _library.SetInstallDir(itemId, dir);

    /// <summary>After the user confirmed that the game starts from the new place: delete the original and the backup.</summary>
    public MoveJob Finish(string id, bool confirmed)
    {
        var j = Get(id);
        if (j.Phase != "switched") throw new RpcException("invalid-state", "Erst umstellen und das Spiel am neuen Ort starten.");
        if (!confirmed) throw new RpcException("confirm", "Bitte bestätigen, dass das Spiel am neuen Ort startet.");
        if (_gameRunning(j.ItemId)) throw new RpcException("busy", $"{j.Game} läuft – bitte erst beenden.");
        var srcLib = LibraryOf(j.Source);
        if (srcLib == null) throw new RpcException("invalid-state", "Quellordner liegt nicht (mehr) in einer Steam-Bibliothek – nichts gelöscht.");
        if (!File.Exists(ManifestIn(j.TargetLibrary, j.AppId)) || !Directory.Exists(j.Target) || Measure(j.Target).files != j.TotalFiles)
            throw new RpcException("broken", "Die Kopie am neuen Ort ist nicht vollständig – das Original wird nicht gelöscht.");
        Directory.Delete(j.Source, true);
        var backup = ManifestIn(srcLib, j.AppId) + ".nexus-moved";
        if (File.Exists(backup)) File.Delete(backup);
        j.Phase = "done";
        Add(j, $"Fertig: Original gelöscht, {j.TotalBytes / 1048576} MB auf dem alten Laufwerk frei.");
        Save(j); _hub.Changed("moves");
        return j;
    }

    /// <summary>Back to how it was: manifest back, library entry back, the copy is removed. Never touches the original.</summary>
    public MoveJob Undo(string id)
    {
        var j = Get(id);
        lock (_lock) if (_running.ContainsKey(id)) throw new RpcException("busy", "Kopieren läuft – erst anhalten.");
        if (j.Phase is "done" or "cancelled") throw new RpcException("invalid-state", "Dieser Umzug ist abgeschlossen.");
        if (j.Phase == "switched")
        {
            if (_steamRunning()) throw new RpcException("steam-running", "Bitte Steam ganz schließen, dann „Rückgängig“.");
            var srcLib = LibraryOf(j.Source)!;
            var backup = ManifestIn(srcLib, j.AppId) + ".nexus-moved";
            if (File.Exists(backup)) File.Move(backup, ManifestIn(srcLib, j.AppId), true);
            var moved = ManifestIn(j.TargetLibrary, j.AppId);
            if (File.Exists(moved)) File.Delete(moved);
            UpdateInstallDir(j.ItemId, j.Source);
        }
        if (Directory.Exists(j.Target) && j.Phase != "planned") Directory.Delete(j.Target, true);
        j.Phase = "cancelled";
        Add(j, "Abgebrochen – alles wie vorher, die Kopie ist entfernt.");
        Save(j); _hub.Changed("moves");
        return j;
    }

    public bool Remove(string id)
    {
        var j = Get(id);
        if (j.Phase is not ("done" or "cancelled" or "planned")) throw new RpcException("invalid-state", "Offene Umzüge erst abbrechen.");
        var ok = _store.Update(f => f.Jobs.RemoveAll(x => x.Id == id) > 0);
        _hub.Changed("moves");
        return ok;
    }

    public void Dispose() { lock (_lock) foreach (var c in _running.Values) c.Cancel(); }
}
