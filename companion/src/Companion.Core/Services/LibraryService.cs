using System.Text.RegularExpressions;
using Pgl.Core.Infrastructure;
using Pgl.Core.Models;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

/// <summary>Strict validation of launch targets. Nothing reaches the launcher that does not match these rules.</summary>
public static partial class LaunchValidator
{
    [GeneratedRegex(@"^\d{1,10}$")] private static partial Regex SteamId();
    [GeneratedRegex(@"^[A-Za-z0-9._-]{1,128}(:[A-Za-z0-9._-]{1,128}){0,2}$")] private static partial Regex EpicId();
    // Package family name + "!" + app id, or a start-menu id such as "{GUID}\path\app.exe" / "Microsoft.Windows.Explorer".
    [GeneratedRegex(@"^[A-Za-z0-9{}._\\: -]{1,300}(![A-Za-z0-9._-]{1,128})?$")] private static partial Regex AppsFolderId();

    public static string? ValidateTarget(LaunchSource source, string target)
    {
        if (string.IsNullOrWhiteSpace(target)) return "Startziel fehlt.";
        if (target.Contains('"') || target.Contains('\n') || target.Contains('\0')) return "Startziel enthält unzulässige Zeichen.";
        return source switch
        {
            LaunchSource.Steam => SteamId().IsMatch(target) ? null : "Ungültige Steam-App-ID.",
            LaunchSource.Epic => EpicId().IsMatch(target) ? null : "Ungültige Epic-Kennung.",
            LaunchSource.AppsFolder => AppsFolderId().IsMatch(target) && !target.Contains("..") ? null : "Ungültige App-Kennung.",
            LaunchSource.Exe => Path.IsPathFullyQualified(target) ? null : "Es wird ein vollständiger Pfad benötigt.",
            _ => "Unbekannte Startmethode.",
        };
    }

    public static string? ValidateArgs(string? args) =>
        args == null ? null : args.Length > 500 ? "Startparameter sind zu lang (max. 500 Zeichen)." :
        args.Any(c => char.IsControl(c)) ? "Startparameter enthalten Steuerzeichen." : null;
}

public sealed class LibraryService
{
    readonly JsonStore<LibraryFile> _store;
    readonly IPlatform _platform;
    readonly IHub _hub;
    public event Action<LibraryItem, LaunchResult, string>? Launched;
    /// <summary>Raised after items were added (manually or by the Game Pass sync), e.g. to look up covers.</summary>
    public event Action<int>? Added;

    public LibraryService(AppPaths paths, IPlatform platform, IHub hub)
    {
        _store = new JsonStore<LibraryFile>(paths.File("library.json"));
        _platform = platform;
        _hub = hub;
    }

    public List<LibraryItem> List() => _store.Snapshot().Items;
    public LibraryItem? Get(string id) => _store.Get(f => f.Items.FirstOrDefault(i => i.Id == id) is { } i ? Clone(i) : null);
    static LibraryItem Clone(LibraryItem i) => Json.Deserialize<LibraryItem>(Json.Serialize(i))!;

    /// <summary>Whether each item can be found on disk. Null means "cannot be determined" (e.g. store apps).</summary>
    public Dictionary<string, bool?> InstallState()
    {
        var result = new Dictionary<string, bool?>();
        foreach (var i in List())
            result[i.Id] = i.Source switch
            {
                LaunchSource.Exe => File.Exists(i.Target),
                LaunchSource.Steam or LaunchSource.Epic => i.InstallDir == null ? null : Directory.Exists(i.InstallDir),
                _ => null,
            };
        return result;
    }

    public IReadOnlyList<DetectedItem> Detect()
    {
        var existing = _store.Get(f => f.Items.Select(i => (i.Source, i.Target)).ToHashSet());
        var all = new List<DetectedItem>();
        foreach (var d in _platform.Detectors)
        {
            try { all.AddRange(d.Detect()); }
            catch (Exception ex) { Log.Warn("detect", $"{d.Name}: {ex.Message}"); }
        }
        try { all.AddRange(_platform.Desktop.StartMenuApps()); }
        catch (Exception ex) { Log.Warn("detect", $"Startmenü: {ex.Message}"); }
        return all.Select(d => d with { AlreadyAdded = existing.Contains((d.Source, d.Target)) }).ToList();
    }

    public LibraryItem AddDetected(string key, ItemKind? kindOverride)
    {
        var d = Detect().FirstOrDefault(x => x.Key == key) ?? throw new RpcException("not-found", "Eintrag wurde bei der Suche nicht (mehr) gefunden.");
        if (d.AlreadyAdded) throw new RpcException("duplicate", $"„{d.Name}“ ist bereits in der Bibliothek.");
        var item = new LibraryItem
        {
            Id = Ids.New("item"),
            Kind = kindOverride ?? d.Kind,
            Name = d.Name,
            Source = d.Source,
            Target = d.Target,
            InstallDir = d.InstallDir,
            ProcessNames = d.ProcessNames,
            CoverUrl = d.CoverUrl,
        };
        item.IconData = SafeIcon(d.Source, d.Target);
        item.IconChecked = true;
        return Add(item);
    }

    /// <summary>Adds a Steam game by app id (e.g. picked on the phone from the Steam library before the PC was connected).
    /// Launching it via steam:// also offers the installation if it is not installed yet. Existing entries are returned unchanged.</summary>
    public LibraryItem AddSteam(string appId, string? name)
    {
        if (LaunchValidator.ValidateTarget(LaunchSource.Steam, appId) is { } err) throw new RpcException("invalid-params", err);
        var existing = List().FirstOrDefault(i => i.Source == LaunchSource.Steam && i.Target == appId);
        if (existing != null) return existing;
        return Add(new LibraryItem
        {
            Id = Ids.New("item"), Kind = ItemKind.Game, Name = Security.DeviceStore.Sanitize(name, 80, "Steam-Spiel " + appId),
            Source = LaunchSource.Steam, Target = appId,
        });
    }

    public LibraryItem AddPath(string path, ItemKind kind, string? name, string? args)
    {
        path = path.Trim();
        var err = LaunchValidator.ValidateTarget(LaunchSource.Exe, path) ?? _platform.Launcher.ValidateExecutable(path) ?? LaunchValidator.ValidateArgs(args);
        if (err != null) throw new RpcException("invalid-target", err);
        if (_store.Get(f => f.Items.Any(i => i.Source == LaunchSource.Exe && string.Equals(i.Target, path, StringComparison.OrdinalIgnoreCase))))
            throw new RpcException("duplicate", "Diese Datei ist bereits freigegeben.");
        var item = new LibraryItem
        {
            Id = Ids.New("item"),
            Kind = kind,
            Name = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(path) : name.Trim(),
            Source = LaunchSource.Exe,
            Target = path,
            Args = args ?? "",
            InstallDir = Path.GetDirectoryName(path),
            ProcessNames = Path.GetExtension(path).Equals(".exe", StringComparison.OrdinalIgnoreCase) ? new() { Path.GetFileNameWithoutExtension(path) } : new(),
            IconData = SafeIcon(LaunchSource.Exe, path),
            IconChecked = true,
            GameIconTried = true,
        };
        return Add(item);
    }

    /// <summary>The program's own icon from Windows (EXE file or start-menu/Store app). Null where there is none.</summary>
    string? SafeIcon(LaunchSource source, string target)
    {
        try
        {
            return source switch
            {
                LaunchSource.Exe => _platform.Launcher.ExtractIcon(target),
                LaunchSource.AppsFolder => _platform.Launcher.ExtractIcon(@"shell:AppsFolder\" + target),
                _ => null,
            };
        }
        catch { return null; }
    }

    /// <summary>Own icon of any item: for Steam and Epic games the icon of the game's EXE in its install folder – the exact
    /// original logo (e.g. RocketLeague.exe).</summary>
    string? SafeIcon(LibraryItem i)
    {
        if (i.Source is LaunchSource.Steam or LaunchSource.Epic)
        {
            try { return GameExe(i) is { } exe ? _platform.Launcher.ExtractIcon(exe) : null; } catch { return null; }
        }
        return SafeIcon(i.Source, i.Target);
    }

    // Helpers that ship with many games but are not the game.
    static readonly System.Text.RegularExpressions.Regex NotTheGame = new(@"^(unins\d*|uninstall.*|setup.*|.*redist.*|dxsetup|dotnet.*|crash.*|.*crashhandler.*|unitycrashhandler.*|easyanticheat.*|beservice.*|battleye.*|start_protected_game|cefsharp.*|.*helper|ue4prereqsetup.*|ueprereqsetup.*|prereq.*|redist.*|.*updater|.*launcherhelper.*|dowser|cleanup|touchup)\.exe$",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    static readonly System.Text.RegularExpressions.Regex HelperFolder = new(@"(^|[\\/])(_?commonredist|redist|redistributables?|installers?|prereq\w*|directx|support|extras|easyanticheat|battleye|tools)[\\/]",
        System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    /// <summary>The game's EXE: the one named like its process (known for Epic), otherwise the largest EXE in the first
    /// three folder levels, ignoring installers, crash handlers and anti-cheat helpers.</summary>
    internal static string? GameExe(LibraryItem i)
    {
        if (i.InstallDir is not { Length: > 0 } dir || !Directory.Exists(dir)) return null;
        var opts = new EnumerationOptions { RecurseSubdirectories = true, MaxRecursionDepth = 3, IgnoreInaccessible = true };
        var exes = Directory.EnumerateFiles(dir, "*.exe", opts).Take(500)
            .Where(p => !NotTheGame.IsMatch(Path.GetFileName(p)) && !HelperFolder.IsMatch(Path.GetRelativePath(dir, p))).ToList();
        var names = i.ProcessNames.Select(n => n.ToLowerInvariant()).ToHashSet();
        return exes.FirstOrDefault(p => names.Contains(Path.GetFileNameWithoutExtension(p).ToLowerInvariant()))
            ?? exes.OrderByDescending(p => new FileInfo(p).Length).FirstOrDefault();
    }

    /// <summary>Reads the icon of programs added before icons were read for start-menu and Store apps (once per item).
    /// Runs in the background; reading happens outside the store lock.</summary>
    public int FillMissingIcons()
    {
        static bool Due(LibraryItem i) => i.IconData == null && (i.Source is LaunchSource.Exe or LaunchSource.AppsFolder ? !i.IconChecked : i.Source is LaunchSource.Steam or LaunchSource.Epic && !i.GameIconTried);
        var todo = List().Where(Due).Take(50).ToList();
        if (todo.Count == 0) return 0;
        var found = todo.ToDictionary(i => i.Id, SafeIcon);
        var n = 0;
        _store.Update(f =>
        {
            foreach (var i in f.Items.Where(x => found.ContainsKey(x.Id) && Due(x)))
            {
                i.IconChecked = i.GameIconTried = true;
                if (i.IconData == null && found[i.Id] is { } ic && ic.Length <= 200_000) { i.IconData = ic; n++; }
            }
            return n;
        });
        if (n > 0) _hub.Changed("library");
        return n;
    }

    /// <summary>
    /// Game Pass sync: installed catalog games are added (category "Game Pass", marked AutoAdded); auto-added games that are
    /// uninstalled or left Game Pass are removed. Games the user added by hand only gain or lose the category.
    /// </summary>
    public (int added, int removed) ReconcileGamePass(IReadOnlyList<GamePassGame> catalog, IReadOnlyDictionary<string, string> installedByPfn)
    {
        int added = 0, removed = 0;
        var byPfn = catalog.Where(g => g.Pfn != null).GroupBy(g => g.Pfn!, StringComparer.OrdinalIgnoreCase).ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);
        var catalogIds = catalog.Select(g => g.Id).ToHashSet();
        static string? PfnOf(LibraryItem i) => i.Source == LaunchSource.AppsFolder && i.Target.IndexOf('!') is var b && b > 0 ? i.Target[..b] : null;
        _store.Update(f =>
        {
            foreach (var i in f.Items.ToList())
            {
                var pfn = PfnOf(i);
                var game = pfn != null && byPfn.TryGetValue(pfn, out var g) ? g : null;
                var inPass = game != null || (i.GamePassId != null && catalogIds.Contains(i.GamePassId));
                var installed = pfn != null && installedByPfn.ContainsKey(pfn);
                if (i.AutoAdded && (!inPass || !installed)) { f.Items.Remove(i); removed++; continue; }
                if (inPass)
                {
                    i.GamePassId ??= game?.Id;
                    if (!i.Categories.Contains(GamePassService.Category)) i.Categories.Add(GamePassService.Category);
                    if (i.CoverUrl == null && game?.Cover != null) i.CoverUrl = game.Cover;
                }
                else if (i.Categories.Remove(GamePassService.Category)) i.GamePassId = null;
            }
            ForgetHidden(f, LaunchSource.AppsFolder, installedByPfn.Values);
            foreach (var (pfn, aumid) in installedByPfn)
            {
                if (!byPfn.TryGetValue(pfn, out var game)) continue;
                if (IsHidden(f, LaunchSource.AppsFolder, aumid)) continue;
                if (f.Items.Any(i => string.Equals(PfnOf(i), pfn, StringComparison.OrdinalIgnoreCase))) continue;
                if (LaunchValidator.ValidateTarget(LaunchSource.AppsFolder, aumid) != null) continue;
                f.Items.Add(new LibraryItem
                {
                    Id = Ids.New("item"), Kind = ItemKind.Game, Name = game.Title, Source = LaunchSource.AppsFolder, Target = aumid,
                    Categories = new() { GamePassService.Category }, CoverUrl = game.Cover, GamePassId = game.Id, AutoAdded = true,
                });
                added++;
            }
        });
        if (added + removed > 0) _hub.Changed("library");
        if (added > 0) Added?.Invoke(added);
        return (added, removed);
    }

    /// <summary>
    /// Steam link: installed Steam games that are not in the library yet are added (AutoAdded); auto-added Steam games that are
    /// no longer installed are removed. Games the user added by hand stay.
    /// </summary>
    public (int added, int removed) ReconcileSteam(IReadOnlyList<DetectedItem> installed)
    {
        int added = 0, removed = 0;
        var ids = installed.Select(d => d.Target).ToHashSet();
        _store.Update(f =>
        {
            removed = f.Items.RemoveAll(i => i.AutoAdded && i.Source == LaunchSource.Steam && !ids.Contains(i.Target));
            ForgetHidden(f, LaunchSource.Steam, ids);
            foreach (var d in installed)
            {
                if (f.Items.Any(i => i.Source == LaunchSource.Steam && i.Target == d.Target)) continue;
                if (IsHidden(f, LaunchSource.Steam, d.Target)) continue;
                if (LaunchValidator.ValidateTarget(LaunchSource.Steam, d.Target) != null) continue;
                f.Items.Add(new LibraryItem
                {
                    Id = Ids.New("item"), Kind = ItemKind.Game, Name = d.Name, Source = LaunchSource.Steam, Target = d.Target,
                    InstallDir = d.InstallDir, ProcessNames = d.ProcessNames, CoverUrl = d.CoverUrl, AutoAdded = true,
                });
                added++;
            }
        });
        if (added + removed > 0) _hub.Changed("library");
        if (added > 0) Added?.Invoke(added);
        return (added, removed);
    }

    /// <summary>Epic/EA link: like the Steam sync – adds installed games, removes the ones this sync added once they are uninstalled.</summary>
    public (int added, int removed) ReconcileLauncher(string autoSource, IReadOnlyList<DetectedItem> installed)
    {
        int added = 0, removed = 0;
        var targets = installed.Select(d => d.Target).ToHashSet(StringComparer.OrdinalIgnoreCase);
        _store.Update(f =>
        {
            removed = f.Items.RemoveAll(i => i.AutoAdded && i.AutoSource == autoSource && !targets.Contains(i.Target));
            foreach (var src in installed.Select(d => d.Source).Append(autoSource == LauncherService.Epic ? LaunchSource.Epic : LaunchSource.Exe).Distinct())
                ForgetHidden(f, src, installed.Where(d => d.Source == src).Select(d => d.Target));
            foreach (var d in installed)
            {
                if (f.Items.Any(i => i.Source == d.Source && string.Equals(i.Target, d.Target, StringComparison.OrdinalIgnoreCase))) continue;
                if (IsHidden(f, d.Source, d.Target)) continue;
                if (LaunchValidator.ValidateTarget(d.Source, d.Target) != null) continue;
                f.Items.Add(new LibraryItem
                {
                    Id = Ids.New("item"), Kind = ItemKind.Game, Name = d.Name, Source = d.Source, Target = d.Target, InstallDir = d.InstallDir,
                    ProcessNames = d.ProcessNames, CoverUrl = d.CoverUrl, AutoAdded = true, AutoSource = autoSource,
                });
                added++;
            }
        });
        if (added + removed > 0) _hub.Changed("library");
        if (added > 0) Added?.Invoke(added);
        return (added, removed);
    }

    /// <summary>Replaces missing or old-style (now broken) Steam cover paths with the real ones. Covers the user chose stay.</summary>
    public void ReplaceSteamCovers(IReadOnlyDictionary<string, string> covers)
    {
        var changed = _store.Update(f =>
        {
            var n = 0;
            foreach (var i in f.Items.Where(i => i.Source == LaunchSource.Steam && covers.ContainsKey(i.Target)))
                if ((string.IsNullOrEmpty(i.CoverUrl) || i.CoverUrl == SteamArt.OldCover(i.Target)) && i.CoverUrl != covers[i.Target]) { i.CoverUrl = covers[i.Target]; n++; }
            return n;
        });
        if (changed > 0) _hub.Changed("library");
    }

    /// <summary>Result of the automatic cover search. Never overwrites a cover the user set in the meantime.</summary>
    public void SetCover(string id, string? coverUrl)
    {
        var changed = _store.Update(f =>
        {
            var i = f.Items.FirstOrDefault(x => x.Id == id);
            if (i == null) return false;
            i.CoverLookupAt = DateTime.UtcNow;
            if (coverUrl == null || !string.IsNullOrEmpty(i.CoverUrl)) return false;
            i.CoverUrl = coverUrl;
            return true;
        });
        if (changed) _hub.Changed("library");
    }

    internal static string HiddenKey(LaunchSource source, string target) => $"{source}:{target}".ToLowerInvariant();
    static bool IsHidden(LibraryFile f, LaunchSource source, string target) => f.Hidden.Contains(HiddenKey(source, target));
    /// <summary>Forgets removed games that are no longer installed – reinstalling one adds it again.</summary>
    static void ForgetHidden(LibraryFile f, LaunchSource source, IEnumerable<string> installedTargets)
    {
        var keep = installedTargets.Select(t => HiddenKey(source, t)).ToHashSet();
        var prefix = (source + ":").ToLowerInvariant();
        f.Hidden.RemoveAll(h => h.StartsWith(prefix, StringComparison.Ordinal) && !keep.Contains(h));
    }

    LibraryItem Add(LibraryItem item)
    {
        _store.Update(f => { f.Items.Add(item); f.Hidden.Remove(HiddenKey(item.Source, item.Target)); });
        Log.Info("library", $"Hinzugefügt: {item.Name} ({item.Source})");
        _hub.Changed("library");
        Added?.Invoke(1);
        return item;
    }

    public sealed class MetadataUpdate
    {
        public string Id { get; set; } = "";
        public string? Name { get; set; }
        public ItemKind? Kind { get; set; }
        public List<string>? Categories { get; set; }
        public bool? Favorite { get; set; }
        public string? CoverUrl { get; set; }
        public string? IconData { get; set; }
        public string? ProfileId { get; set; }
        public List<string>? ProcessNames { get; set; }
        public string? Notes { get; set; }
        public int? Rating { get; set; }
        /// <summary>Backlog status; "" removes the game from the backlog.</summary>
        public string? Backlog { get; set; }
        public int? Priority { get; set; }
        /// <summary>Own goal in hours; 0 removes it.</summary>
        public double? GoalHours { get; set; }
    }

    /// <summary>Changes display data only. Launch target and arguments need <see cref="UpdateTarget"/> (PC only).</summary>
    public LibraryItem UpdateMetadata(MetadataUpdate u)
    {
        if (u.CoverUrl is { Length: > 0 } c && !(c.StartsWith("https://") || c.StartsWith("data:image/")))
            throw new RpcException("invalid-params", "Cover muss eine https-Adresse oder ein hochgeladenes Bild sein.");
        if ((u.CoverUrl?.Length ?? 0) > 700_000 || (u.IconData?.Length ?? 0) > 200_000)
            throw new RpcException("invalid-params", "Bild ist zu groß (max. ca. 500 KB).");
        if (u.IconData is { Length: > 0 } ic && !ic.StartsWith("data:image/"))
            throw new RpcException("invalid-params", "Ungültiges Icon.");
        if (u.Backlog is { Length: > 0 } bl && !Models.Backlog.Statuses.Contains(bl))
            throw new RpcException("invalid-params", "Unbekannter Backlog-Status.");
        if (u.GoalHours is { } gh && (double.IsNaN(gh) || gh < 0 || gh > 10_000))
            throw new RpcException("invalid-params", "Ziel muss zwischen 0 und 10 000 Stunden liegen.");
        var r = _store.Update(f =>
        {
            var i = f.Items.FirstOrDefault(x => x.Id == u.Id) ?? throw new RpcException("not-found", "Eintrag nicht gefunden.");
            if (u.Name != null) i.Name = Security.DeviceStore.Sanitize(u.Name, 80, i.Name);
            if (u.Kind != null) i.Kind = u.Kind.Value;
            if (u.Categories != null) i.Categories = u.Categories.Select(x => Security.DeviceStore.Sanitize(x, 30, "")).Where(x => x != "").Distinct().Take(10).ToList();
            if (u.Favorite != null) i.Favorite = u.Favorite.Value;
            if (u.CoverUrl != null) i.CoverUrl = u.CoverUrl == "" ? null : u.CoverUrl;
            if (u.IconData != null) { i.IconData = u.IconData == "" ? null : u.IconData; i.IconCustom = i.IconData != null; i.IconChecked = i.GameIconTried = true; }
            if (u.ProfileId != null) i.ProfileId = u.ProfileId == "" ? null : u.ProfileId;
            if (u.ProcessNames != null) i.ProcessNames = u.ProcessNames.Select(p => Path.GetFileNameWithoutExtension(p.Trim())).Where(p => p.Length is > 0 and < 100).Distinct().Take(10).ToList();
            if (u.Notes != null) i.Notes = u.Notes.Length > 1000 ? u.Notes[..1000] : u.Notes;
            if (u.Rating != null) i.Rating = Math.Clamp(u.Rating.Value, 0, 5);
            if (u.Backlog != null && (u.Backlog == "" ? null : u.Backlog) != i.Backlog) { i.Backlog = u.Backlog == "" ? null : u.Backlog; i.BacklogChangedAt = DateTime.UtcNow; }
            if (u.Priority != null) i.Priority = Math.Clamp(u.Priority.Value, 0, 3);
            if (u.GoalHours != null) i.GoalHours = u.GoalHours.Value <= 0 ? null : Math.Round(u.GoalHours.Value, 1);
            return Clone(i);
        });
        _hub.Changed("library");
        return r;
    }

    /// <summary>The game moved to another folder (drive move assistant).</summary>
    public void SetInstallDir(string id, string dir)
    {
        _store.Update(f => { if (f.Items.FirstOrDefault(x => x.Id == id) is { } i) i.InstallDir = dir; });
        _hub.Changed("library");
    }

    public LibraryItem UpdateTarget(string id, string? target, string? args, string? workingDir)
    {
        var r = _store.Update(f =>
        {
            var i = f.Items.FirstOrDefault(x => x.Id == id) ?? throw new RpcException("not-found", "Eintrag nicht gefunden.");
            if (target != null)
            {
                var err = LaunchValidator.ValidateTarget(i.Source, target) ?? (i.Source == LaunchSource.Exe ? _platform.Launcher.ValidateExecutable(target) : null);
                if (err != null) throw new RpcException("invalid-target", err);
                i.Target = target;
            }
            if (args != null)
            {
                if (LaunchValidator.ValidateArgs(args) is { } e) throw new RpcException("invalid-params", e);
                i.Args = args;
            }
            if (workingDir != null)
            {
                if (workingDir != "" && !Directory.Exists(workingDir)) throw new RpcException("invalid-params", "Arbeitsordner existiert nicht.");
                i.WorkingDir = workingDir == "" ? null : workingDir;
            }
            return Clone(i);
        });
        _hub.Changed("library");
        return r;
    }

    public bool Remove(string id)
    {
        var ok = _store.Update(f =>
        {
            var item = f.Items.FirstOrDefault(i => i.Id == id);
            if (item == null) return false;
            f.Items.Remove(item);
            // Removing a synced game is meant to last – otherwise the next sync would add it straight back.
            if (item.AutoAdded && !IsHidden(f, item.Source, item.Target)) f.Hidden.Add(HiddenKey(item.Source, item.Target));
            return true;
        });
        if (ok) _hub.Changed("library");
        return ok;
    }

    public LaunchResult Launch(string id, string by)
    {
        var item = Get(id);
        if (item == null) return new LaunchResult(false, "Eintrag nicht gefunden.", "not-found");
        var err = LaunchValidator.ValidateTarget(item.Source, item.Target) ?? LaunchValidator.ValidateArgs(item.Args)
            ?? (item.Source == LaunchSource.Exe ? _platform.Launcher.ValidateExecutable(item.Target) : null); // also covers entries from a restored backup
        LaunchResult result;
        if (err != null) result = new LaunchResult(false, err, "invalid-target");
        else
        {
            try { result = _platform.Launcher.Launch(item); }
            catch (System.ComponentModel.Win32Exception ex) { result = new LaunchResult(false, $"Start fehlgeschlagen: {ex.Message}", "start-failed"); }
            catch (Exception ex) { result = new LaunchResult(false, $"Start fehlgeschlagen: {ex.Message}", "start-failed"); }
        }
        Log.Info("launch", $"{item.Name}: {(result.Ok ? "gestartet" : result.Message)} (durch {by})");
        Launched?.Invoke(item, result, by);
        return result;
    }

    internal LibraryFile Export() => _store.Snapshot();
    internal void Import(LibraryFile f) { _store.Replace(f); _hub.Changed("library"); }
}
