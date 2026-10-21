// F21 Screenshot-Sortierung: one list over the PC's capture folders and the photo museum – sort, filter (format, size,
// game, category, tags), multi-select with bulk actions, albums, export, and duplicates by SHA-256 only. Nothing is
// deleted without an explicit confirmation; PC files go to the recycle bin.

import { useMemo, useState } from "react";
import { BookHeart, CheckSquare, Copy, FileJson, FileSpreadsheet, FolderPlus, Heart, Images, Search, Square, Tag, Trash2, X } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { bytes } from "../lib/format";
import { readCapture, useThumbs, type Capture, type CaptureList } from "../lib/captures";
import { downloadText, getEntry, newId, useJournal, type Entry } from "../lib/journal";
import { duplicateGroups, filterMedia, formatOf, mediaCsv, SIZE_RANGES, sizeCandidates, sortMedia, type MediaFilter, type MediaItem, type MediaSort } from "../lib/media";
import { Banner, Button, Card, confirmDialog, Empty, Modal } from "./ui";
import { gameLabel as gameName, trySave, useGames } from "./journal-ui";
import { categoryLabel, LazyThumb, newAlbum, PHOTO_CATEGORIES, photoByHash, preparePhoto, removePhoto, savePhoto, setInAlbum, type Album, type Photo } from "./media-shared";

const PAGE = 120;

export function SortView() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const caps = useRpc<CaptureList>("captures.list", {}, ["captures"]);
  const photos = useJournal<Photo>("photo");
  const albums = useJournal<Album>("album");
  const games = useGames();
  const [f, setF] = useState<MediaFilter>({});
  const [album, setAlbum] = useState("");
  const [sort, setSort] = useState<MediaSort>("date");
  const [desc, setDesc] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [hashes, setHashes] = useState<Record<string, string | null>>({});
  const [dupes, setDupes] = useState<MediaItem[][] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tagText, setTagText] = useState("");
  const [albumPick, setAlbumPick] = useState(false);

  const pcItems = caps.data?.items ?? [];
  const all: MediaItem[] = useMemo(() => [
    ...pcItems.map((c): MediaItem => ({ key: `pc:${c.id}`, src: "pc", id: c.id, name: c.name, kind: c.kind, game: c.game ?? null, date: c.taken, size: c.size, format: formatOf(c.name), favorite: c.favorite, tags: c.tags, category: c.category ?? null, hash: hashes[c.id] })),
    ...photos.map((p): MediaItem => ({ key: `photo:${p.id}`, src: "photo", id: p.id, name: p.data.file?.name || p.data.title, kind: "image", game: gameName(p.data.game ?? {}, games) || null, date: p.data.takenAt ?? new Date(p.updatedAt).toISOString(), size: p.data.file?.bytes ?? null, format: p.data.file?.format ?? "JPG", favorite: !!p.data.favorite, tags: p.data.tags ?? [], category: p.data.category ?? null, hash: p.data.hash })),
  ], [pcItems, photos, games, hashes]);
  const albumEntry = albums.find((a) => a.id === album);
  const list = useMemo(() => sortMedia(filterMedia(all, f).filter((i) => !albumEntry || albumEntry.data.items.includes(i.key)), sort, desc), [all, f, albumEntry, sort, desc]);
  const visible = list.slice(0, shown);
  const thumbs = useThumbs(visible.filter((i) => i.src === "pc").map((i) => pcItems.find((c) => c.id === i.id)!).filter(Boolean), online);
  const selected = all.filter((i) => sel.has(i.key));
  const formats = [...new Set(all.map((i) => i.format).filter(Boolean))].sort();
  const gamesIn = [...new Set(all.map((i) => i.game).filter((g): g is string => !!g))].sort();
  const tags = [...new Set(all.flatMap((i) => i.tags))].sort();
  const set = (x: Partial<MediaFilter>) => { setF((o) => ({ ...o, ...x })); setShown(PAGE); };
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // ---------------------------------------------------------------- bulk actions
  const updatePc = (i: MediaItem, x: { favorite?: boolean; tags?: string[]; category?: string }) => client.call("captures.update", { id: i.id, ...x }).catch((e: Error) => toast(e.message, "error"));
  const updatePhoto = (i: MediaItem, x: Partial<Photo>) => { const p = getEntry<Photo>(i.id); if (p) trySave("photo", p.id, { ...p.data, ...x }); };
  const bulk = async (fn: (i: MediaItem) => unknown, done: string) => {
    const pcNeedsRights = selected.some((i) => i.src === "pc") && !canManage;
    if (pcNeedsRights) { toast(t("Für Aufnahmen vom PC braucht dieses Gerät das Recht „Verwalten“."), "error"); return; }
    for (const i of selected) await fn(i);
    toast(done, "success");
  };
  const setFav = (v: boolean) => bulk((i) => (i.src === "pc" ? updatePc(i, { favorite: v }) : updatePhoto(i, { favorite: v })), v ? t("Als Favorit markiert") : t("Favorit entfernt"));
  const addTag = () => {
    const tg = tagText.trim();
    if (!tg) return;
    if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(tg)) { toast(t("Schlagwörter: Buchstaben, Ziffern, Leerzeichen, - und _ (höchstens 24 Zeichen)."), "error"); return; }
    void bulk((i) => { const next = [...new Set([...i.tags, tg])].slice(0, 10); return i.src === "pc" ? updatePc(i, { tags: next }) : updatePhoto(i, { tags: next }); }, t("Tag „{t}“ gesetzt", { t: tg }));
    setTagText("");
  };
  const setCat = (v: string) => bulk((i) => (i.src === "pc" ? updatePc(i, { category: v }) : updatePhoto(i, { category: v || null })), t("Kategorie gesetzt"));

  /** PC pictures into the museum (a 1600 px copy; the file on the PC stays). */
  const importPc = async (items: MediaItem[]): Promise<string[]> => {
    const ids: string[] = [];
    const pics = items.filter((i) => i.src === "pc" && i.kind === "image");
    if (!pics.length) return ids;
    if (!online) { toast(t("Bilder vom PC übernehmen geht nur, wenn der PC verbunden ist."), "error"); return ids; }
    let n = 0;
    for (const i of pics) {
      setBusy(t("Übernehme {i} von {n} …", { i: ++n, n: pics.length }));
      const c = pcItems.find((x) => x.id === i.id);
      if (!c) continue;
      try {
        const blob = await readCapture(c);
        const prep = await preparePhoto(blob, c.name, Date.parse(c.taken));
        const existing = photoByHash(prep.hash);
        if (existing) { ids.push(existing.id); continue; }
        const e = await savePhoto(prep, { game: { gameId: c.itemId ?? null, gameName: c.game ?? null }, captureId: c.id, tags: c.tags, favorite: c.favorite });
        ids.push(e.id);
      } catch (e) { toast(`${c.name}: ${(e as Error).message}`, "error"); }
    }
    setBusy(null);
    return ids;
  };
  const toMuseum = async () => {
    const ids = await importPc(selected);
    if (ids.length) toast(t("{n} Bilder im Fotomuseum", { n: ids.length }), "success");
    if (selected.some((i) => i.kind === "video")) toast(t("Clips kommen nicht ins Museum – merke dir Stellen unter „Clip-Momente“."), "info");
  };
  const toBook = async () => {
    const photoIds = [...selected.filter((i) => i.src === "photo").map((i) => i.id), ...(await importPc(selected))];
    if (!photoIds.length) { toast(t("Keine Bilder ausgewählt, die ins Buch können."), "error"); return; }
    const first = getEntry<Photo>(photoIds[0])?.data;
    const id = newId();
    if (trySave("book", id, { title: first?.title ?? t("Erinnerung"), date: first?.takenAt ?? new Date().toISOString().slice(0, 10), game: first?.game ?? { gameId: null, gameName: null }, category: null, text: "", imageIds: [], media: [], tags: [], favorite: false, links: [...new Set(photoIds)] })) {
      toast(t("Im Erinnerungsbuch angelegt – Text ergänzen"), "success");
      location.hash = `#/media?tab=book&id=${id}`;
    }
  };
  const remove = async () => {
    const pc = selected.filter((i) => i.src === "pc"), ph = selected.filter((i) => i.src === "photo");
    if (pc.length && (!online || !caps.data?.canRecycle || !canManage)) { toast(t("Dateien vom PC löschen geht nur mit verbundenem Windows-PC und dem Recht „Verwalten“ (sie kommen in den Papierkorb)."), "error"); return; }
    const text = [pc.length ? t("{n} Dateien am PC kommen in den Papierkorb (dort wiederherstellbar).", { n: pc.length }) : "", ph.length ? t("{n} Fotos werden aus dem Museum gelöscht (auf allen Geräten).", { n: ph.length }) : ""].filter(Boolean).join(" ");
    if (!(await confirmDialog(t("{n} ausgewählte löschen?", { n: selected.length }), text, { danger: true, ok: t("Löschen") }))) return;
    let failed = 0;
    for (const i of pc) await client.call("captures.remove", { id: i.id }).catch(() => { failed++; });
    for (const i of ph) removePhoto(i.id);
    setSel(new Set()); setDupes(null);
    toast(failed ? t("{n} Dateien konnten nicht verschoben werden (vielleicht gerade geöffnet).", { n: failed }) : t("Gelöscht"), failed ? "error" : "success");
  };
  const exportIt = (kind: "csv" | "json") => {
    const items = selected.length ? sortMedia(selected, sort, desc) : list;
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === "csv") downloadText(`nexus-screenshots-${stamp}.csv`, mediaCsv(items), "text/csv");
    else downloadText(`nexus-screenshots-${stamp}.json`, JSON.stringify({ format: "nexus-screenshot-list", version: 1, exportedAt: new Date().toISOString(), items: items.map(({ key: _k, ...rest }) => rest) }, null, 2));
  };

  // ---------------------------------------------------------------- duplicates
  const findDupes = async () => {
    const cands = sizeCandidates(all.filter((i) => i.src === "pc"));
    const need = cands.filter((i) => hashes[i.id] === undefined);
    const got: Record<string, string | null> = { ...hashes };
    if (need.length && !online) toast(t("Für Dateien am PC muss der PC verbunden sein – geprüft wird jetzt nur das Fotomuseum."), "info");
    else if (need.length) {
      try {
        for (let k = 0; k < need.length; k += 40) {
          setBusy(t("Prüfsummen am PC: {i} von {n} …", { i: Math.min(k + 40, need.length), n: need.length }));
          const r = await client.call<{ hashes: Record<string, string | null> }>("captures.hashes", { ids: need.slice(k, k + 40).map((i) => i.id) });
          Object.assign(got, r.hashes);
        }
      } catch (e) { toast((e as Error).message, "error"); }
      setHashes(got);
    }
    setBusy(null);
    setDupes(duplicateGroups(all.map((i) => (i.src === "pc" ? { ...i, hash: got[i.id] } : i))));
  };
  const selectAllButOldest = () => setSel(new Set((dupes ?? []).flatMap((g) => g.slice(1).map((i) => i.key))));

  const folders = caps.data?.folders.map((x) => x.label).join(", ");
  return (
    <>
      <Card title={t("Screenshots sortieren")} icon={<Images size={18} />} meta={String(all.length)}>
        <div className="small muted" style={{ marginBottom: 10 }}>
          {t("Eine Liste aus zwei Quellen: Aufnahmen vom PC (nur aus diesen Ordnern: {f}) und Bilder im Fotomuseum. Andere Dateien auf dem PC sieht Nexus nicht.", { f: folders || t("noch keine – PC verbinden") })}
        </div>
        {caps.stale && <Banner kind="info">{t("Ohne PC: Liste der PC-Aufnahmen vom letzten Abruf. Favoriten, Tags und Kategorien werden vorgemerkt.")}</Banner>}
        {busy && <Banner kind="info">{busy}</Banner>}
        <div className="stack-sm">
          <div className="row" style={{ gap: 8 }}>
            <label className="search-inline grow"><Search size={15} /><input className="input" placeholder={t("Suchen (Name, Spiel, Tag)")} value={f.q ?? ""} onChange={(e) => set({ q: e.target.value })} aria-label={t("Screenshots suchen")} /></label>
            <select className="input" style={{ maxWidth: 170 }} value={f.src ?? ""} aria-label={t("Quelle")} onChange={(e) => set({ src: e.target.value as MediaFilter["src"] })}><option value="">{t("Quelle")}: {t("alle")}</option><option value="pc">{t("PC")}</option><option value="photo">{t("Fotomuseum")}</option></select>
            <select className="input" style={{ maxWidth: 150 }} value={f.kind ?? ""} aria-label={t("Art")} onChange={(e) => set({ kind: e.target.value as MediaFilter["kind"] })}><option value="">{t("Art")}: {t("alle")}</option><option value="image">{t("Bilder")}</option><option value="video">{t("Clips")}</option></select>
            <select className="input" style={{ maxWidth: 150 }} value={f.format ?? ""} aria-label={t("Format")} onChange={(e) => set({ format: e.target.value })}><option value="">{t("Format")}: {t("alle")}</option>{formats.map((x) => <option key={x} value={x}>{x}</option>)}</select>
            <select className="input" style={{ maxWidth: 170 }} value={f.size ?? ""} aria-label={t("Dateigröße")} onChange={(e) => set({ size: e.target.value })}><option value="">{t("Größe")}: {t("alle")}</option>{SIZE_RANGES.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}</select>
            <select className="input" style={{ maxWidth: 200 }} value={f.game ?? ""} aria-label={t("Spiel")} onChange={(e) => set({ game: e.target.value })}><option value="">{t("Spiel")}: {t("alle")}</option><option value="-">{t("Ohne erkanntes Spiel")}</option>{gamesIn.map((g) => <option key={g} value={g}>{g}</option>)}</select>
            <select className="input" style={{ maxWidth: 190 }} value={f.category ?? ""} aria-label={t("Kategorie")} onChange={(e) => set({ category: e.target.value })}><option value="">{t("Kategorie")}: {t("alle")}</option>{PHOTO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}</select>
            {albums.length > 0 && <select className="input" style={{ maxWidth: 190 }} value={album} aria-label={t("Sammlung")} onChange={(e) => setAlbum(e.target.value)}><option value="">{t("Sammlung")}: {t("alle")}</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.data.title}</option>)}</select>}
            <select className="input" style={{ maxWidth: 170 }} value={sort} aria-label={t("Sortieren nach")} onChange={(e) => setSort(e.target.value as MediaSort)}><option value="date">{t("Nach Datum")}</option><option value="name">{t("Nach Dateiname")}</option><option value="game">{t("Nach Spiel")}</option><option value="size">{t("Nach Größe")}</option></select>
            <Button size="sm" variant="ghost" aria-label={t("Reihenfolge umkehren")} onClick={() => setDesc(!desc)}>{desc ? "↓" : "↑"}</Button>
          </div>
          <div className="chips">
            <button type="button" className={`chip ${f.fav ? "on" : ""}`} aria-pressed={!!f.fav} onClick={() => set({ fav: !f.fav })}><Heart size={13} /> {t("Favoriten")}</button>
            {tags.slice(0, 30).map((tg) => <button key={tg} type="button" className={`chip ${f.tag === tg ? "on" : ""}`} aria-pressed={f.tag === tg} onClick={() => set({ tag: f.tag === tg ? "" : tg })}>#{tg}</button>)}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} busy={!!busy} onClick={() => void findDupes()}>{t("Doppelte finden")}</Button>
            <Button size="sm" variant="ghost" icon={<FileSpreadsheet size={14} />} onClick={() => exportIt("csv")}>{selected.length ? t("Auswahl als CSV") : t("Liste als CSV")}</Button>
            <Button size="sm" variant="ghost" icon={<FileJson size={14} />} onClick={() => exportIt("json")}>{selected.length ? t("Auswahl als JSON") : t("Liste als JSON")}</Button>
          </div>
        </div>
      </Card>

      {dupes && (
        <Card title={t("Doppelte Dateien")} icon={<Copy size={18} />} actions={<Button size="sm" variant="ghost" icon={<X size={14} />} aria-label={t("Schließen")} onClick={() => setDupes(null)} />}>
          {dupes.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Keine identischen Dateien gefunden. Verglichen wird der Inhalt (SHA-256) – nicht Name oder Größe.")}</p> : (
            <div className="stack-sm">
              <p className="small muted" style={{ margin: 0 }}>{t("{n} Gruppen mit identischem Inhalt (SHA-256). Gelöscht wird nur, was du auswählst und bestätigst; die älteste Datei ist jeweils zuerst genannt.", { n: dupes.length })}</p>
              {dupes.map((g, k) => <div key={k} className="j-item"><span className="small">{g.map((i, j) => <span key={i.key} className="row nowrap" style={{ gap: 6 }}>{j === 0 ? <span className="badge ok">{t("älteste")}</span> : <span className="badge warn">{t("Kopie")}</span>}<span className="ellipsis">{i.name}</span><span className="tiny muted">{[i.src === "pc" ? t("PC") : t("Fotomuseum"), i.size != null ? bytes(i.size) : "", (i.date.length === 10 ? new Date(i.date).toLocaleDateString() : new Date(i.date).toLocaleString())].filter(Boolean).join(" · ")}</span></span>)}</span></div>)}
              <div><Button size="sm" onClick={selectAllButOldest}>{t("Alle Kopien auswählen (älteste bleibt)")}</Button></div>
            </div>
          )}
        </Card>
      )}

      {selected.length > 0 && (
        <div className="m-bulk card" role="region" aria-label={t("Auswahl")}>
          <b className="small">{t("{n} ausgewählt", { n: selected.length })}</b>
          <Button size="sm" variant="ghost" icon={<Heart size={14} />} onClick={() => void setFav(true)}>{t("Favorit")}</Button>
          <Button size="sm" variant="ghost" onClick={() => void setFav(false)}>{t("Kein Favorit")}</Button>
          <span className="row nowrap" style={{ gap: 4 }}>
            <input className="input" style={{ width: 130 }} value={tagText} maxLength={24} placeholder={t("Tag")} aria-label={t("Tag für die Auswahl")} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTag(); }} />
            <Button size="sm" variant="ghost" icon={<Tag size={14} />} disabled={!tagText.trim()} onClick={addTag}>{t("Taggen")}</Button>
          </span>
          <select className="input" style={{ width: "auto" }} value="" aria-label={t("Kategorie für die Auswahl")} onChange={(e) => { if (e.target.value) void setCat(e.target.value === "-" ? "" : e.target.value); }}>
            <option value="">{t("Kategorie …")}</option>{PHOTO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}<option value="-">{t("(keine)")}</option>
          </select>
          <Button size="sm" variant="ghost" icon={<FolderPlus size={14} />} onClick={() => setAlbumPick(true)}>{t("Zur Sammlung")}</Button>
          {selected.some((i) => i.src === "pc" && i.kind === "image") && <Button size="sm" variant="ghost" icon={<Images size={14} />} disabled={!online} onClick={() => void toMuseum()}>{t("Ins Fotomuseum")}</Button>}
          <Button size="sm" variant="ghost" icon={<BookHeart size={14} />} onClick={() => void toBook()}>{t("Ins Erinnerungsbuch")}</Button>
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove()}>{t("Löschen …")}</Button>
          <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setSel(new Set())}>{t("Auswahl aufheben")}</Button>
        </div>
      )}

      {list.length === 0 ? <Card><Empty icon={<Images size={24} />} title={all.length ? t("Nichts passt zum Filter") : t("Noch keine Screenshots")} text={all.length ? undefined : t("Verbinde den PC (Aufnahmen aus den bekannten Ordnern) oder importiere Bilder im Fotomuseum.")} /></Card> : (
        <>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant="ghost" icon={<CheckSquare size={14} />} onClick={() => setSel(new Set([...sel, ...list.map((i) => i.key)]))}>{t("Alle {n} auswählen", { n: list.length })}</Button>
            <span className="tiny muted" style={{ alignSelf: "center" }}>{t("{n} Einträge", { n: list.length })}</span>
          </div>
          <div className="m-sort-grid">
            {visible.map((i) => {
              const on = sel.has(i.key);
              const photo = i.src === "photo" ? getEntry<Photo>(i.id) : undefined;
              const th = i.src === "pc" ? thumbs.get(i.id) : null;
              return (
                <button key={i.key} type="button" className={`m-sort-tile ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(i.key)} aria-label={`${i.name} · ${on ? t("ausgewählt") : t("nicht ausgewählt")}`}>
                  <span className="m-sort-img">{photo ? <LazyThumb id={photo.data.thumbId || photo.data.imageId} /> : th ? <img src={th} alt="" loading="lazy" /> : <span className="cap-ph">{i.kind === "video" ? "▶" : <Images size={22} />}</span>}</span>
                  <span className="m-sort-check">{on ? <CheckSquare size={16} /> : <Square size={16} />}</span>
                  {i.favorite && <span className="cap-fav"><Heart size={12} fill="currentColor" /></span>}
                  <span className="m-sort-meta">
                    <span className="tiny ellipsis">{i.name}</span>
                    <span className="tiny muted ellipsis">{[i.src === "pc" ? "PC" : t("Museum"), i.format, i.size != null ? bytes(i.size) : "", i.game ?? "", categoryLabel(i.category)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {list.length > shown && <Button onClick={() => setShown((n) => n + PAGE)}>{t("Mehr anzeigen ({n} weitere)", { n: list.length - shown })}</Button>}
        </>
      )}
      {albumPick && <AlbumPick albums={albums} keys={selected.map((i) => i.key)} onClose={() => setAlbumPick(false)} />}
    </>
  );
}

function AlbumPick({ albums, keys, onClose }: { albums: Entry<Album>[]; keys: string[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const add = (id: string, title: string) => { setInAlbum(id, keys, true); toast(t("{n} zu „{a}“ hinzugefügt", { n: keys.length, a: title }), "success"); onClose(); };
  return (
    <Modal title={t("Zur Sammlung hinzufügen")} onClose={onClose}>
      <div className="stack-sm">
        {albums.map((a) => <Button key={a.id} block variant="ghost" onClick={() => add(a.id, a.data.title)}>{a.data.title} <span className="tiny muted">({a.data.items.length})</span></Button>)}
        <form className="row nowrap" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) add(newAlbum(name), name.trim()); }}>
          <input className="input" value={name} maxLength={80} placeholder={t("Neue Sammlung")} aria-label={t("Name der neuen Sammlung")} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>{t("Anlegen")}</Button>
        </form>
      </div>
    </Modal>
  );
}

// PC videos to choose from for the clip moments (the list seen last when the PC is off).
export function useCaptureVideos(): Capture[] {
  const caps = useRpc<CaptureList>("captures.list", {}, ["captures"]);
  return (caps.data?.items ?? []).filter((c) => c.kind === "video");
}
