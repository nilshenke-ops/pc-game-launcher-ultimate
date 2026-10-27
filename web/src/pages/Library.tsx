import { useEffect, useMemo, useState } from "react";
import { Box, Check, FolderOpen, Wand2, Gamepad2, LayoutGrid, List, Loader2, MoreVertical, Pencil, Play, Plus, Radar, RefreshCw, Search, Star, Trash2 } from "lucide-react";
import { client, readJson, writeJson } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc, toast, useCan, useIncremental } from "../lib/hooks";
import { dateTime, gradientFor, initials, relTime } from "../lib/format";
import { Link } from "react-router-dom";
import { useJournal } from "../lib/journal";
import { memorySummary, type Memory } from "../lib/journal-logic";
import { HoloLibrary, type HoloInfo } from "../components/holo-library";
import { IconWorkshop } from "../components/icon-workshop";
import { exportIcon, loadSafeImage } from "../lib/icon-art";
import type { DetectedItem, ItemKind, LibraryItem, ProfilesFile } from "../lib/types";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Segmented, Thumb } from "../components/ui";
import { CompatPanel } from "../components/compat-panel";
import { AppTile, useLaunch } from "../components/launch-tiles";
import { GamePassView } from "./GamePass";
import { SteamView } from "./Steam";
import { LauncherView, type Source as LauncherSource } from "./Launchers";

type Sort = "name" | "recent" | "added" | "rating";
type View = "grid" | "list" | "holo";
const VIEW_KEY = "pgl.libView";
const LIB_SORT_KEY = "pgl.libSort";
const SOURCE_LABEL: Record<string, string> = { steam: "Steam", epic: "Epic Games", appsFolder: "Store / Startmenü", exe: "Datei" };

interface ListResult { items: LibraryItem[]; installed: Record<string, boolean | null>; running: string[]; coversFromCdn: boolean }

export default function Library({ kind }: { kind: ItemKind }) {
  const q = useRpc<ListResult>("library.list", {}, ["library"]);
  const hist = useRpc<{ launches: { itemId: string; at: string }[]; stats?: { itemId: string; totalMinutes: number; lastPlayed: string }[] }>("history.get", {}, ["history"]);
  const [view, setView] = useState<View>(() => { const v = readJson<string>(VIEW_KEY); return v === "list" || v === "holo" ? v : "grid"; });
  useEffect(() => { writeJson(VIEW_KEY, view); }, [view]);
  const [search, setSearch] = useState("");
  // Nothing remembered from the PC yet and no PC: start with the Game Pass catalog, which can be shown without a PC.
  const [cat, setCat] = useState<string>(() => kind === "game" && !q.data && q.error?.code === "offline" ? "__gamepass" : "__all");
  // Remembered on this device (also set by JARVIS: „Zuletzt gespielte nach oben“).
  const [sort, setSort] = useState<Sort>(() => { const v = readJson<string>(LIB_SORT_KEY); return v === "recent" || v === "added" || v === "rating" ? v : "name"; });
  useEffect(() => { writeJson(LIB_SORT_KEY, sort); }, [sort]);
  const [editing, setEditing] = useState<LibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  /** Steam, Epic, EA and Xbox now (instead of waiting for the next automatic round); a launcher switched off is skipped. */
  const syncAll = async () => {
    setSyncing(true);
    const calls: [string, Promise<unknown>][] = [["Steam", client.call("steam.sync")], ...(["epic", "ea", "xbox"] as const).map((source) => [source, client.call("launchers.sync", { source })] as [string, Promise<unknown>])];
    const results = await Promise.allSettled(calls.map(([, p]) => p));
    const failed = results.map((r, i) => (r.status === "rejected" && (r.reason as { code?: string })?.code !== "disabled" ? calls[i][0] : null)).filter(Boolean);
    setSyncing(false);
    toast(failed.length ? t("Abgleich fertig – Fehler bei: {l}", { l: failed.join(", ") }) : t("Abgleich fertig"), failed.length ? "error" : "success");
  };
  const canManage = useCan("manage");
  const isGame = kind === "game";

  const items = useMemo(() => (q.data?.items ?? []).filter((i) => i.kind === kind), [q.data, kind]);
  // "Game Pass" has its own chip (whole catalog), so it is not repeated as a normal category.
  const categories = useMemo(() => [...new Set(items.flatMap((i) => i.categories))].filter((c) => c !== "Game Pass").sort(), [items]);
  const lastLaunch = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of hist.data?.launches ?? []) if (!m.has(l.itemId)) m.set(l.itemId, Date.parse(l.at));
    return m;
  }, [hist.data]);
  // Play time and last start per game – only what the PC recorded.
  const info = useMemo(() => {
    const m = new Map<string, HoloInfo>();
    for (const st of hist.data?.stats ?? []) m.set(st.itemId, { minutes: st.totalMinutes, lastPlayed: Date.parse(st.lastPlayed) || undefined });
    for (const [id, at] of lastLaunch) { const x = m.get(id) ?? {}; if (!x.lastPlayed || at > x.lastPlayed) m.set(id, { ...x, lastPlayed: at }); }
    return m;
  }, [hist.data, lastLaunch]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = items.filter((i) => (!s || i.name.toLowerCase().includes(s) || i.categories.some((c) => c.toLowerCase().includes(s))) &&
      (cat === "__all" || (cat === "__fav" ? i.favorite : cat === "__running" ? q.data?.running.includes(i.id) : cat.startsWith("src:") ? i.source === cat.slice(4) : i.categories.includes(cat))));
    list = [...list].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name) : sort === "recent" ? (lastLaunch.get(b.id) ?? 0) - (lastLaunch.get(a.id) ?? 0) : Date.parse(b.addedAt) - Date.parse(a.addedAt));
    return [...list.filter((i) => i.favorite), ...list.filter((i) => !i.favorite)];
  }, [items, search, cat, sort, lastLaunch, q.data]);

  // Tap on the tile = start (like an app icon); while the PC answers, the tile shows a spinner.
  const { launch, launching } = useLaunch();
  // Programs: "Bearbeiten" switches the icons to edit mode (tap opens the settings), like on a phone's home screen.
  const [editMode, setEditMode] = useState(false);
  const fav = (i: LibraryItem) => client.call("library.update", { id: i.id, favorite: !i.favorite }).catch((e) => toast(e.message, "error"));
  const sources = [...new Set(items.map((i) => i.source))];
  const running = useMemo(() => new Set(q.data?.running ?? []), [q.data]);
  const inc = useIncremental(shown, `${kind}|${search}|${cat}|${sort}|${view}`);
  const more = inc.more && <div ref={inc.sentinel} className="tiny muted" style={{ padding: 12, textAlign: "center" }}>{t("{n} von {m} – weitere beim Scrollen", { n: inc.visible.length, m: shown.length })}</div>;
  const coverOf = (i: LibraryItem) => (i.coverUrl && (q.data?.coversFromCdn || !i.coverUrl.includes("steamstatic")) ? i.coverUrl : undefined);

  return (
    <>
      <PageHead eyebrow={t("Bibliothek")} title={isGame ? t("Spiele") : t("Programme")}
        text={isGame ? t("Starte Spiele von Steam, Epic, Xbox/Microsoft Store und eigene EXE-Dateien – direkt vom Handy.") : t("Freigegebene Windows-Programme wie Discord, Browser oder OBS mit einem Tipp starten.")}
        actions={canManage && <>
          {!isGame && items.length > 0 && <Button icon={editMode ? <Check size={16} /> : <Pencil size={16} />} variant={editMode ? "primary" : undefined} aria-pressed={editMode} onClick={() => setEditMode(!editMode)}>{editMode ? t("Fertig") : t("Bearbeiten")}</Button>}
          <Button variant="primary" icon={<Plus size={17} />} onClick={() => setAdding(true)}>{t("Hinzufügen")}</Button>
        </>} />
      {!isGame && editMode && <p className="small muted" style={{ marginTop: -8 }}>{t("Tippe auf ein Programm, um es zu bearbeiten. Tipp: Lange drücken geht auch ohne Bearbeiten-Modus.")}</p>}

      <div className="stack" style={{ marginBottom: 18 }}>
        <div className="row">
          <div className="input-icon grow" style={{ minWidth: 200 }}>
            <Search size={17} />
            <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={isGame ? t("Spiele durchsuchen …") : t("Programme durchsuchen …")} aria-label={t("Suche")} />
          </div>
          {isGame && <Segmented<View> value={view} onChange={setView} label={t("Ansicht")} options={[{ value: "grid", label: <><LayoutGrid size={15} /> {t("Raster")}</> }, { value: "list", label: <><List size={15} /> {t("Liste")}</> }, { value: "holo", label: <><Box size={15} /> {t("Holo")}</> }]} />}
          <Segmented<Sort> value={sort} onChange={setSort} label={t("Sortierung")} options={[{ value: "name", label: t("A–Z") }, { value: "recent", label: t("Zuletzt") }, { value: "added", label: t("Neu") }, { value: "rating", label: "★ " + t("Bewertung") }]} />
        </div>
        <div className="chips" role="toolbar" aria-label={t("Filter")}>
          {[["__all", t("Alle")], ["__fav", "★ " + t("Favoriten")], ["__running", t("Läuft")], ...(isGame ? [["__steam", "Steam"], ["__epic", "Epic"], ["__ea", "EA"], ["__xbox", "Xbox"], ["__gamepass", "Game Pass"]] : []), ...sources.filter((s) => !(isGame && (s === "steam" || s === "epic"))).map((s) => ["src:" + s, SOURCE_LABEL[s] ?? s]), ...categories.map((c) => [c, c])].map(([k, label]) => (
            <button key={k} className={`chip ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{label}</button>
          ))}
        </div>
      </div>

      {cat === "__gamepass" ? <GamePassView search={search} /> : cat === "__steam" ? <SteamView search={search} /> : cat === "__epic" || cat === "__ea" || cat === "__xbox" ? <LauncherView key={cat} source={cat.slice(2) as LauncherSource} search={search} /> : (<>
      {q.stale && !q.updatedAt && <div style={{ marginBottom: 14 }}><Banner kind="info" title={t("Noch kein PC verbunden")}>{isGame
        ? t("Deine installierten Spiele erkennt der PC beim ersten Verbinden. Steam-Spiele kannst du schon jetzt unter „Steam“ zur Bibliothek hinzufügen; Bewertung, Favorit und Kategorien lassen sich bearbeiten – übertragen wird später.")
        : t("Programme gibt der PC selbst frei (aus Sicherheitsgründen nur direkt am PC). Sie erscheinen hier nach dem Verbinden.")}</Banner></div>}
      {q.stale && q.updatedAt && <div style={{ marginBottom: 14 }}><Banner kind="info" title={t("Gespeicherte Liste (Stand {d})", { d: new Date(q.updatedAt).toLocaleString() })}>{t("Dein PC ist gerade nicht verbunden. Du siehst die Spiele vom letzten Mal – starten kannst du sie, sobald der PC verbunden ist.")}</Banner></div>}
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {items.length === 0 ? (
          <Card><Empty icon={isGame ? <Gamepad2 size={28} /> : <LayoutGrid size={28} />} title={isGame ? t("Noch keine Spiele") : t("Noch keine Programme")}
            text={isGame
              ? t("Installierte Spiele von Steam, Epic, EA und der Xbox-App kommen automatisch hierher – kurz nach dem Start des Begleiters und danach alle 10 Minuten. Fehlt ein Spiel, lass den PC suchen oder gib eine EXE-Datei frei.")
              : t("Lass den PC nach installierten Spielen und Apps suchen oder gib eine EXE-Datei frei.")}
            action={canManage && <span className="row" style={{ gap: 8, justifyContent: "center" }}>
              {isGame && <Button busy={syncing} icon={<RefreshCw size={17} />} onClick={() => void syncAll()}>{t("Jetzt abgleichen")}</Button>}
              <Button variant="primary" icon={<Radar size={17} />} onClick={() => setAdding(true)}>{t("Jetzt suchen")}</Button>
            </span>} /></Card>
        ) : shown.length === 0 ? (
          <Card><Empty icon={<Search size={26} />} title={t("Keine Treffer")} text={t("Filter oder Suchbegriff anpassen.")} /></Card>
        ) : isGame && view === "holo" ? (
          <HoloLibrary items={shown} coverOf={coverOf} running={running} installed={q.data?.installed ?? {}} launching={launching} info={info}
            onLaunch={(i) => void launch(i)} onEdit={canManage ? setEditing : undefined} onFav={(i) => void fav(i)} />
        ) : isGame && view === "list" ? (
          <><div className="lib-list">
            {inc.visible.map((i) => {
              const m = info.get(i.id), cover = coverOf(i);
              return (
                <article key={i.id} className={`lib-row tappable ${launching.has(i.id) ? "busy" : ""}`} role="button" tabIndex={0} aria-label={t("{name} starten", { name: i.name })}
                  onClick={() => launch(i)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void launch(i); } }}>
                  <Thumb name={i.name} icon={i.iconData} cover={cover} gradient={gradientFor(i.name)} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <b className="ellipsis">{i.name}</b>
                    <div className="row tiny muted" style={{ gap: 6, flexWrap: "wrap" }}>
                      {running.has(i.id) && <span className="badge ok">● {t("Läuft")}</span>}
                      {q.data?.installed[i.id] === false && <span className="badge error">{t("Nicht gefunden")}</span>}
                      {(i.rating ?? 0) > 0 && <span style={{ color: "#fde047" }}>{"★".repeat(i.rating!)}</span>}
                      <span>{m?.minutes ? t("{h} h gespielt", { h: (Math.round(m.minutes / 6) / 10).toLocaleString() }) : t("Noch keine Spielzeit erfasst")}</span>
                      {m?.lastPlayed && <span>· {t("zuletzt {d}", { d: relTime(m.lastPlayed) })}</span>}
                    </div>
                  </div>
                  <button className={`btn icon sm ghost ${i.favorite ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); void fav(i); }} aria-label={i.favorite ? t("Favorit entfernen") : t("Als Favorit markieren")} aria-pressed={i.favorite}><Star size={15} fill={i.favorite ? "currentColor" : "none"} /></button>
                  {canManage && <Button size="sm" variant="ghost" icon={<MoreVertical size={15} />} onClick={(e) => { e.stopPropagation(); setEditing(i); }} aria-label={t("Bearbeiten")} />}
                  <Button variant="primary" size="sm" icon={launching.has(i.id) ? <Loader2 size={14} className="spin" /> : <Play size={14} />} onClick={(e) => { e.stopPropagation(); void launch(i); }}>{t("Spielen")}</Button>
                </article>
              );
            })}
          </div>{more}</>
        ) : isGame ? (
          <><div className="lib-grid">
            {inc.visible.map((i) => {
              const running = q.data?.running.includes(i.id);
              const installed = q.data?.installed[i.id];
              const cover = i.coverUrl && (q.data?.coversFromCdn || !i.coverUrl.includes("steamstatic")) ? i.coverUrl : undefined;
              return (
                <article key={i.id} className={`game-card tappable ${launching.has(i.id) ? "busy" : ""}`} role="button" tabIndex={0} aria-label={t("{name} starten", { name: i.name })}
                  onClick={() => launch(i)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); void launch(i); } }}>
                  {launching.has(i.id) && <span className="tile-busy"><Loader2 size={28} className="spin" /></span>}
                  <div className="cover" style={{ background: gradientFor(i.name) }}>{cover && <img src={cover} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
                  {!cover && <div className="initials">{initials(i.name)}</div>}
                  <div className="shade" />
                  <div className="top">
                    {running && <span className="badge ok">● {t("Läuft")}</span>}
                    {installed === false && <span className="badge error">{t("Nicht gefunden")}</span>}
                    {i.gamePassId && <span className="badge gp">Game Pass</span>}
                    <button className={`btn icon sm fav ${i.favorite ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); void fav(i); }} aria-label={i.favorite ? t("Favorit entfernen") : t("Als Favorit markieren")} aria-pressed={i.favorite}><Star size={15} fill={i.favorite ? "currentColor" : "none"} /></button>
                  </div>
                  <div className="bottom">
                    <b>{i.name}</b>
                    {(i.rating ?? 0) > 0 && <span className="tiny" aria-label={t("{n} von 5 Sternen", { n: i.rating! })} style={{ color: "#fde047" }}>{"★".repeat(i.rating!)}<span style={{ opacity: 0.35 }}>{"★".repeat(5 - i.rating!)}</span></span>}
                    <div className="row nowrap">
                      <Button variant="primary" size="sm" className="play grow" icon={<Play size={14} />} onClick={(e) => { e.stopPropagation(); void launch(i); }}>{t("Spielen")}</Button>
                      {canManage && <Button size="sm" icon={<MoreVertical size={15} />} onClick={(e) => { e.stopPropagation(); setEditing(i); }} aria-label={t("Bearbeiten")} style={{ background: "rgba(0,0,0,.45)", color: "#fff" }} />}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>{more}</>
        ) : (
          <div className="app-grid">
            {shown.map((i) => (
              <AppTile key={i.id} item={i} running={q.data?.running.includes(i.id)} busy={launching.has(i.id)} onLaunch={() => launch(i)} onEdit={canManage ? () => setEditing(i) : undefined} editing={editMode} />
            ))}
          </div>
        )}
      </Loadable>
      </>)}

      {editing && <EditItem item={editing} onClose={() => setEditing(null)} />}
      {adding && <AddItems kind={kind} onClose={() => setAdding(false)} />}
    </>
  );
}

function EditItem({ item, onClose }: { item: LibraryItem; onClose: () => void }) {
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const profiles = useRpc<ProfilesFile>("profiles.list");
  const [f, setF] = useState({ ...item, categoriesText: item.categories.join(", "), processText: item.processNames.join(", ") });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await client.call("library.update", {
        id: item.id, name: f.name, kind: f.kind, favorite: f.favorite, coverUrl: f.coverUrl ?? "", profileId: f.profileId ?? "", notes: f.notes ?? "", rating: f.rating ?? 0,
        categories: f.categoriesText.split(",").map((s) => s.trim()).filter(Boolean),
        processNames: f.processText.split(",").map((s) => s.trim()).filter(Boolean),
        ...(f.iconData !== item.iconData ? { iconData: f.iconData ?? "" } : {}),
      });
      if (isLocal && (f.target !== item.target || f.args !== item.args || (f.workingDir ?? "") !== (item.workingDir ?? "")))
        await client.call("library.updateTarget", { id: item.id, target: f.target, args: f.args, workingDir: f.workingDir ?? "" });
      toast(t("Gespeichert"), "success");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Eintrag entfernen?"), t("„{n}“ wird aus der Bibliothek entfernt. Das Programm selbst bleibt installiert.", { n: item.name }), { danger: true, ok: t("Entfernen") }))) return;
    await client.call("library.remove", { id: item.id }).catch((e) => toast(e.message, "error"));
    onClose();
  };
  // Asks the PC to look up the real cover (Steam / Microsoft Store, exact title only).
  const findCover = async () => {
    setBusy(true);
    try {
      const r = await client.call<{ cover: string | null }>("library.findCover", { id: item.id });
      if (r.cover) { set({ coverUrl: r.cover }); toast(t("Cover gefunden"), "success"); }
      else toast(t("Kein passendes Cover gefunden – du kannst ein eigenes Bild hochladen."), "info");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  // The picture is drawn again (no SVG, no metadata) and made small enough for the PC.
  const uploadCover = async (file?: File) => {
    if (!file) return;
    try {
      const cv = await loadSafeImage(file);
      const out = document.createElement("canvas"); const k = Math.min(1, 900 / Math.max(cv.width, cv.height));
      out.width = Math.round(cv.width * k); out.height = Math.round(cv.height * k); out.getContext("2d")!.drawImage(cv, 0, 0, out.width, out.height);
      set({ coverUrl: exportIcon(out, 680_000) });
    } catch (e) { toast(t((e as Error).message), "error"); }
  };
  const [workshop, setWorkshop] = useState(false);

  return (
    <Modal title={t("„{n}“ bearbeiten", { n: item.name })} onClose={onClose} wide footer={<>
      <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove} style={{ marginRight: "auto" }}>{t("Entfernen")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" busy={busy} onClick={save}>{t("Speichern")}</Button>
    </>}>
      {item.kind === "game" && <MemoryNote item={item} />}
      <div className="grid-2">
        <Field label={t("Name")}><input className="input" value={f.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t("Typ")}>
          <Segmented<ItemKind> value={f.kind} onChange={(kind) => set({ kind })} options={[{ value: "game", label: t("Spiel") }, { value: "program", label: t("Programm") }]} />
        </Field>
        <Field label={t("Kategorien")} hint={t("Kommagetrennt, z. B. Shooter, Koop")}><input className="input" value={f.categoriesText} onChange={(e) => set({ categoriesText: e.target.value })} /></Field>
        <Field label={t("Gaming-Profil beim Start")} hint={t("Wird automatisch aktiviert, solange das Spiel läuft.")}>
          <select className="input" value={f.profileId ?? ""} onChange={(e) => set({ profileId: e.target.value || undefined })}>
            <option value="">{t("Keins")}</option>
            {profiles.data?.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t("Cover-Bild")} hint={t("https-Adresse oder eigenes Bild hochladen")}>
          <div className="row nowrap">
            <input className="input" value={f.coverUrl?.startsWith("data:") ? t("(eigenes Bild)") : f.coverUrl ?? ""} onChange={(e) => set({ coverUrl: e.target.value })} placeholder="https://…" />
            <label className="btn icon" aria-label={t("Bild hochladen")}><FolderOpen size={16} /><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = ""; }} /></label>
            <Button icon={<Wand2 size={16} />} aria-label={t("Icon-Werkstatt")} title={t("Icon-Werkstatt: eigenes Icon oder Cover gestalten")} onClick={() => setWorkshop(true)} />
            {f.kind === "game" && <Button icon={<Search size={16} />} busy={busy} onClick={findCover} aria-label={t("Cover automatisch suchen")} title={t("Cover automatisch suchen")} />}
          </div>
        </Field>
        <Field label={t("Prozessnamen zur Erkennung")} hint={t("Ohne .exe, kommagetrennt. Leer = Erkennung über Installationsordner.")}><input className="input mono" value={f.processText} onChange={(e) => set({ processText: e.target.value })} /></Field>
      </div>
      <div className="divider" />
      <h3>{t("Start")}</h3>
      {!isLocal && <Banner kind="info">{t("Startziel und Startparameter können aus Sicherheitsgründen nur direkt am PC geändert werden.")}</Banner>}
      <div className="grid-2">
        <Field label={t("Startziel")} hint={SOURCE_LABEL[item.source]}><input className="input mono" value={f.target} disabled={!isLocal || item.source !== "exe"} onChange={(e) => set({ target: e.target.value })} /></Field>
        <Field label={t("Startparameter")}><input className="input mono" value={f.args} disabled={!isLocal || item.source !== "exe"} maxLength={500} onChange={(e) => set({ args: e.target.value })} placeholder="-fullscreen" /></Field>
      </div>
      <Field label={t("Bewertung")}>
        <div className="row" role="radiogroup" aria-label={t("Bewertung")} style={{ gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={(f.rating ?? 0) === n} aria-label={t("{n} von 5 Sternen", { n })} className="btn icon sm ghost"
              onClick={() => set({ rating: (f.rating ?? 0) === n ? 0 : n })}><Star size={18} fill={(f.rating ?? 0) >= n ? "#fde047" : "none"} color="#fde047" /></button>
          ))}
        </div>
      </Field>
      <Field label={t("Notizen")}><textarea className="input" value={f.notes ?? ""} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} /></Field>
      {item.source === "steam" && item.kind === "game" && <>
        <div className="divider" />
        <h3>{t("Läuft das auf meinem PC?")}</h3>
        <CompatPanel appId={item.target} itemId={item.id} />
      </>}
      {workshop && <IconWorkshop name={f.name} format={f.kind === "program" ? "icon" : undefined} applyLabel={t("Für „{n}“ übernehmen", { n: f.name })}
        onApply={(url, format) => set(format === "icon" ? { iconData: url } : { coverUrl: url })} onClose={() => setWorkshop(false)} />}
      {f.iconData !== item.iconData && <p className="tiny muted">{t("Neues Icon gewählt – wird mit „Speichern“ übernommen.")}</p>}
    </Modal>
  );
}

function AddItems({ kind, onClose }: { kind: ItemKind; onClose: () => void }) {
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const [tab, setTab] = useState<"detect" | "file">("detect");
  const det = useRpc<{ items: DetectedItem[]; detectors: string[] }>("library.detect");
  const [filter, setFilter] = useState("");
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [args, setArgs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (d: DetectedItem, k: ItemKind) => {
    setBusy(d.key);
    try { await client.call("library.addDetected", { key: d.key, kind: k }); toast(t("„{n}“ hinzugefügt", { n: d.name }), "success"); det.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const addPath = async () => {
    setBusy("path");
    try { await client.call("library.addPath", { path, kind, name: name || undefined, args: args || undefined }); toast(t("Freigegeben"), "success"); onClose(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(null);
  };
  const pick = async () => {
    try { const r = await client.call<{ path: string | null }>("library.pickFile"); if (r.path) setPath(r.path); }
    catch (e) { toast((e as Error).message, "error"); }
  };

  const list = (det.data?.items ?? []).filter((d) => (kind === "game" ? d.kind === "game" || d.origin !== "Startmenü" : true) && d.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Modal title={kind === "game" ? t("Spiele hinzufügen") : t("Programme hinzufügen")} onClose={onClose} wide>
      <Segmented value={tab} onChange={setTab} options={[{ value: "detect", label: t("Auf dem PC gefunden") }, { value: "file", label: t("Datei freigeben") }]} />
      {tab === "detect" ? (
        <Loadable loading={det.loading} error={det.error} onRetry={det.reload}>
          <div className="stack">
            <p className="small muted">{t("Durchsucht: {d}. Es wird nur angezeigt, was tatsächlich installiert ist.", { d: det.data?.detectors.join(", ") ?? "" })}</p>
            <div className="input-icon"><Search size={17} /><input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("Filtern …")} /></div>
            {list.length === 0 ? <Empty icon={<Radar size={26} />} title={t("Nichts gefunden")} text={t("Keine passenden Einträge. Du kannst eine EXE-Datei direkt am PC freigeben.")} /> : (
              <div className="list" style={{ maxHeight: "50vh", overflow: "auto" }}>
                {list.slice(0, 300).map((d) => (
                  <div key={d.key} className="list-item">
                    <Thumb name={d.name} cover={d.coverUrl} gradient={gradientFor(d.name)} />
                    <div className="grow"><div className="title ellipsis">{d.name}</div><div className="sub">{d.origin}</div></div>
                    {d.alreadyAdded ? <span className="badge ok">{t("Hinzugefügt")}</span> : (
                      <div className="row nowrap">
                        <Button size="sm" variant={kind === "game" ? "primary" : undefined} busy={busy === d.key} onClick={() => add(d, "game")}>{t("Als Spiel")}</Button>
                        <Button size="sm" variant={kind === "program" ? "primary" : undefined} busy={busy === d.key} onClick={() => add(d, "program")}>{t("Als Programm")}</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Loadable>
      ) : !isLocal ? (
        <Banner kind="info" title={t("Nur direkt am PC möglich")}>{t("Neue ausführbare Dateien freizugeben ist aus Sicherheitsgründen nur im Companion am PC erlaubt. So kann niemand über das Internet beliebige Programme auf deinem PC hinterlegen.")}</Banner>
      ) : (
        <div className="stack">
          <Field label={t("Datei (.exe oder .lnk)")}>
            <div className="row nowrap">
              <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\Program Files\\…\\app.exe" />
              {conn.hello?.info.features.pickFile && <Button icon={<FolderOpen size={16} />} onClick={pick}>{t("Durchsuchen")}</Button>}
            </div>
          </Field>
          <div className="grid-2">
            <Field label={t("Anzeigename (optional)")}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label={t("Startparameter (optional)")}><input className="input mono" value={args} onChange={(e) => setArgs(e.target.value)} /></Field>
          </div>
          <Banner kind="info">{t("Kommandozeilen und Skript-Hosts (cmd, PowerShell …) können nicht freigegeben werden.")}</Banner>
          <div><Button variant="primary" busy={busy === "path"} disabled={!path} onClick={addPath}>{t("Freigeben")}</Button></div>
        </div>
      )}
    </Modal>
  );
}

/** "Wo war ich noch mal?" for this game – from the game journal (works without the PC). */
function MemoryNote({ item }: { item: LibraryItem }) {
  const list = useJournal<Memory>("memory");
  const s = memorySummary(list, { gameId: item.id, gameName: item.name });
  return (
    <div className="j-item" style={{ marginBottom: 12 }}>
      <b className="small">{t("Wo war ich noch mal?")}</b>
      {s ? <>
        <span className="tiny muted">{t("Deine Notiz vom {d}", { d: dateTime(s.lastAt) })}</span>
        <span className="small">{s.lastDid}{s.where && ` · ${s.where}`}</span>
        {s.next && <span className="small">{t("Als Nächstes")}: {s.next}</span>}
      </> : <span className="small muted">{t("Noch nichts notiert.")}</span>}
      <div className="row" style={{ gap: 6 }}>
        {s && <Link className="btn sm" to={`/journal?tab=memory&id=${s.latestId}`}>{t("Verlauf")}</Link>}
        <Link className="btn sm ghost" to={`/journal?tab=memory&new=${item.id}`}>{t("Neuer Eintrag")}</Link>
      </div>
    </div>
  );
}
