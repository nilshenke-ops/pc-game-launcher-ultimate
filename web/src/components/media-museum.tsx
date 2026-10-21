// F3 Gaming-Fotomuseum: import, grid / gallery / full screen, filters, albums, details, links to the memory book and
// the graphics comparison. Pictures are stored like all collection pictures (this device + PC); thumbnails keep big
// galleries fast.

import { useEffect, useMemo, useRef, useState } from "react";
import { BookHeart, ChevronLeft, ChevronRight, Expand, FolderPlus, Grid3x3, Heart, ImagePlus, Images, LayoutGrid, Pencil, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { bytes } from "../lib/format";
import { newId, useJournal, type Entry } from "../lib/journal";
import { matchesQuery, norm } from "../lib/journal-logic";
import { PHOTO } from "../lib/collection-schemas";
import type { Data } from "../lib/collections";
import { Banner, Button, Card, confirmDialog, Empty, Field, Modal } from "./ui";
import { ExportImport, gameLabel, JImage, LinkedList, SearchBox, trySave, useGames } from "./journal-ui";
import { EntryEditor, removeWithLinks } from "./collection-view";
import { categoryLabel, LazyThumb, newAlbum, PHOTO_CATEGORIES, photoByHash, preparePhoto, removePhoto, savePhoto, setInAlbum, type Album, type Photo } from "./media-shared";

const PAGE = 60;
type View = "grid" | "gallery";
type Sort = "taken-desc" | "taken-asc" | "title" | "game" | "added";

export function Museum({ focus, albumFocus }: { focus?: string | null; albumFocus?: string | null }) {
  const photos = useJournal<Photo>("photo");
  const albums = useJournal<Album>("album");
  const games = useGames();
  const [q, setQ] = useState("");
  const [game, setGame] = useState("");
  const [cat, setCat] = useState("");
  const [tag, setTag] = useState("");
  const [fav, setFav] = useState(false);
  const [album, setAlbum] = useState(albumFocus ?? "");
  const [sort, setSort] = useState<Sort>("taken-desc");
  const [view, setView] = useState<View>("grid");
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [full, setFull] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [albumsOpen, setAlbumsOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const gameNames = useMemo(() => [...new Set(photos.map((p) => gameLabel(p.data.game ?? {}, games)).filter(Boolean))].sort(), [photos, games]);
  const tags = useMemo(() => [...new Set(photos.flatMap((p) => p.data.tags ?? []))].sort(), [photos]);
  const albumEntry = albums.find((a) => a.id === album);
  const list = useMemo(() => {
    const l = photos.filter((p) => matchesQuery(p, q) && (!game || gameLabel(p.data.game ?? {}, games) === game) && (!cat || p.data.category === cat)
      && (!tag || (p.data.tags ?? []).some((x) => norm(x) === norm(tag))) && (!fav || p.data.favorite) && (!albumEntry || albumEntry.data.items.includes(`photo:${p.id}`)));
    const d = (p: Entry<Photo>) => p.data.takenAt ?? "";
    const cmp: Record<Sort, (a: Entry<Photo>, b: Entry<Photo>) => number> = {
      "taken-desc": (a, b) => d(b).localeCompare(d(a)) || b.updatedAt - a.updatedAt,
      "taken-asc": (a, b) => d(a).localeCompare(d(b)) || a.updatedAt - b.updatedAt,
      title: (a, b) => a.data.title.localeCompare(b.data.title, undefined, { numeric: true }),
      game: (a, b) => (gameLabel(a.data.game ?? {}, games) || "￿").localeCompare(gameLabel(b.data.game ?? {}, games) || "￿") || d(b).localeCompare(d(a)),
      added: (a, b) => b.id.localeCompare(a.id),
    };
    return [...l].sort(cmp[sort]);
  }, [photos, q, game, cat, tag, fav, albumEntry, sort, games]);
  useEffect(() => setShown(PAGE), [q, game, cat, tag, fav, album, sort]);
  const visible = list.slice(0, shown);
  const cur = open ? photos.find((p) => p.id === open) : undefined;

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const all = [...files].filter((f) => f.type.startsWith("image/"));
    if (all.length < files.length) toast(t("{n} Dateien übersprungen (keine Bilder).", { n: files.length - all.length }), "info");
    setBusy(t("Bilder werden gelesen …"));
    try {
      const prepared: Awaited<ReturnType<typeof preparePhoto>>[] = [];
      for (const f of all.slice(0, 100)) {
        try { prepared.push(await preparePhoto(f, f.name, f.lastModified)); } catch (e) { toast(`${f.name}: ${(e as Error).message}`, "error"); }
      }
      const dupes = prepared.filter((p) => photoByHash(p.hash) || prepared.findIndex((x) => x.hash === p.hash) !== prepared.indexOf(p));
      let use = prepared;
      if (dupes.length && !(await confirmDialog(t("Schon im Museum"), t("{n} der Bilder sind schon im Fotomuseum (gleiche Datei). Trotzdem noch einmal importieren?", { n: dupes.length }), { ok: t("Trotzdem importieren") }))) use = prepared.filter((p) => !dupes.includes(p));
      let n = 0;
      for (const p of use) {
        setBusy(t("Import {i} von {n} …", { i: n + 1, n: use.length }));
        try { const e = await savePhoto(p); if (album) setInAlbum(album, [`photo:${e.id}`], true); n++; } catch (e) { toast(`${p.name}: ${(e as Error).message}`, "error"); }
      }
      if (n) toast(t("{n} Bilder im Museum", { n }), "success");
    } finally { setBusy(null); }
  };

  return (
    <>
      <Card title={t("Fotomuseum")} icon={<Images size={18} />} meta={photos.length ? String(photos.length) : undefined}
        actions={<Button size="sm" variant="primary" icon={<ImagePlus size={15} />} busy={!!busy} onClick={() => input.current?.click()}>{t("Bilder importieren")}</Button>}>
        <input ref={input} type="file" accept="image/*" multiple hidden data-testid="museum-input" onChange={(e) => { void importFiles(e.target.files); e.target.value = ""; }} />
        <div className="small muted" style={{ marginBottom: 10 }}>{t("Deine Screenshots als Galerie – auf diesem Gerät gespeichert und mit dem PC abgeglichen. Gespeichert wird eine Kopie mit höchstens 1600 px; das Original bleibt, wo es ist. Bilder vom PC holst du unter „Sortieren“ dazu.")}</div>
        {busy && <Banner kind="info">{busy}</Banner>}
        {photos.length === 0 ? <Empty icon={<Images size={24} />} title={t("Noch keine Bilder im Museum")} text={t("Importiere Screenshots vom Gerät oder übernimm sie unter „Sortieren“ vom PC.")} /> : (
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <SearchBox value={q} onChange={setQ} />
              {gameNames.length > 0 && <select className="input" style={{ maxWidth: 200 }} value={game} aria-label={t("Spiel")} onChange={(e) => setGame(e.target.value)}><option value="">{t("Spiel")}: {t("alle")}</option>{gameNames.map((g) => <option key={g} value={g}>{g}</option>)}</select>}
              <select className="input" style={{ maxWidth: 200 }} value={cat} aria-label={t("Kategorie")} onChange={(e) => setCat(e.target.value)}><option value="">{t("Kategorie")}: {t("alle")}</option>{PHOTO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}</select>
              <select className="input" style={{ maxWidth: 200 }} value={album} aria-label={t("Sammlung")} onChange={(e) => setAlbum(e.target.value)}><option value="">{t("Sammlung")}: {t("alle")}</option>{albums.map((a) => <option key={a.id} value={a.id}>{a.data.title}</option>)}</select>
              <select className="input" style={{ maxWidth: 210 }} value={sort} aria-label={t("Sortierung")} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="taken-desc">{t("Aufnahmedatum (neueste)")}</option><option value="taken-asc">{t("Aufnahmedatum (älteste)")}</option><option value="title">{t("Titel A–Z")}</option><option value="game">{t("Nach Spiel")}</option><option value="added">{t("Zuletzt importiert")}</option>
              </select>
              <div className="row nowrap" role="group" aria-label={t("Ansicht")} style={{ gap: 4 }}>
                <Button size="sm" variant={view === "grid" ? "primary" : "ghost"} icon={<Grid3x3 size={14} />} aria-pressed={view === "grid"} onClick={() => setView("grid")}>{t("Raster")}</Button>
                <Button size="sm" variant={view === "gallery" ? "primary" : "ghost"} icon={<LayoutGrid size={14} />} aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>{t("Galerie")}</Button>
                <Button size="sm" variant="ghost" icon={<Expand size={14} />} disabled={!list.length} onClick={() => setFull(0)}>{t("Vollbild")}</Button>
              </div>
            </div>
            <div className="chips">
              <button type="button" className={`chip ${fav ? "on" : ""}`} aria-pressed={fav} onClick={() => setFav(!fav)}><Heart size={13} /> {t("Favoriten")}</button>
              {tags.map((tg) => <button key={tg} type="button" className={`chip ${tag === tg ? "on" : ""}`} aria-pressed={tag === tg} onClick={() => setTag(tag === tg ? "" : tg)}>#{tg}</button>)}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="ghost" icon={<FolderPlus size={14} />} onClick={() => setAlbumsOpen(true)}>{t("Sammlungen verwalten")} ({albums.length})</Button>
              <ExportImport kinds={["photo", "album"]} name="fotomuseum" />
            </div>
            {albumEntry && <span className="tiny muted">{t("Sammlung „{n}“: {p} Fotos, {c} Aufnahmen vom PC (die siehst du unter „Sortieren“).", { n: albumEntry.data.title, p: albumEntry.data.items.filter((x) => x.startsWith("photo:")).length, c: albumEntry.data.items.filter((x) => x.startsWith("pc:")).length })}</span>}
          </div>
        )}
      </Card>
      {photos.length > 0 && (list.length === 0 ? <Card><Empty icon={<Images size={24} />} title={t("Nichts passt zum Filter")} /></Card> : (
        <>
          <div className={view === "grid" ? "m-grid" : "m-gallery"}>
            {visible.map((p, i) => (
              <button key={p.id} type="button" className={`m-tile ${focus === p.id ? "focus" : ""}`} onClick={() => setOpen(p.id)} onDoubleClick={() => setFull(i)} aria-label={`${p.data.title}${p.data.favorite ? " · " + t("Favorit") : ""}`}>
                <LazyThumb id={p.data.thumbId || p.data.imageId} alt="" />
                {p.data.favorite && <span className="cap-fav"><Heart size={13} fill="currentColor" /></span>}
                {view === "gallery" && <span className="m-caption"><b>{p.data.title}</b><span className="tiny muted">{[gameLabel(p.data.game ?? {}, games), p.data.takenAt ? new Date(p.data.takenAt).toLocaleDateString() : "", categoryLabel(p.data.category)].filter(Boolean).join(" · ")}</span></span>}
              </button>
            ))}
          </div>
          {list.length > shown && <Button onClick={() => setShown((n) => n + PAGE)}>{t("Mehr anzeigen ({n} weitere)", { n: list.length - shown })}</Button>}
        </>
      ))}
      {cur && <PhotoDetail p={cur} albums={albums} onClose={() => setOpen(null)} onFull={() => { const i = list.findIndex((x) => x.id === cur.id); setOpen(null); setFull(Math.max(0, i)); }} />}
      {full != null && list.length > 0 && <Lightbox list={list} start={Math.min(full, list.length - 1)} onClose={() => setFull(null)} onDetails={(id) => { setFull(null); setOpen(id); }} />}
      {albumsOpen && <AlbumManager albums={albums} onClose={() => setAlbumsOpen(false)} />}
    </>
  );
}

function PhotoDetail({ p, albums, onClose, onFull }: { p: Entry<Photo>; albums: Entry<Album>[]; onClose: () => void; onFull: () => void }) {
  const games = useGames();
  const [edit, setEdit] = useState(false);
  const d = p.data;
  const save = (x: Partial<Photo>) => trySave("photo", p.id, { ...d, ...x });
  const toBook = () => {
    const id = newId();
    if (trySave("book", id, { title: d.title, date: d.takenAt ?? new Date().toISOString().slice(0, 10), game: d.game, category: null, text: d.description ?? "", imageIds: [d.imageId], media: [], tags: d.tags ?? [], favorite: false, links: [p.id] })) {
      toast(t("Im Erinnerungsbuch angelegt"), "success");
      location.hash = `#/media?tab=book&id=${id}`;
    }
  };
  if (edit) return <EntryEditor schema={PHOTO} id={p.id} initial={d as unknown as Data} isNew={false} games={games} onClose={() => setEdit(false)} />;
  const src = d.takenSource && d.takenAt === d.takenAuto ? (d.takenSource === "exif" ? t("aus den Bilddaten (EXIF)") : t("Dateidatum")) : d.takenAt ? t("selbst eingetragen") : "";
  return (
    <Modal title={d.title} wide onClose={onClose} footer={<>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Foto löschen?"), t("Es wird auf allen Geräten aus dem Museum, aus Sammlungen und Verknüpfungen entfernt. Die Originaldatei bleibt unberührt."), { danger: true, ok: t("Löschen") })) { removePhoto(p.id); onClose(); } }}>{t("Löschen")}</Button>
      <Button variant="ghost" icon={<BookHeart size={15} />} onClick={toBook}>{t("Ins Erinnerungsbuch")}</Button>
      <Button variant="ghost" icon={<Expand size={15} />} onClick={onFull}>{t("Vollbild")}</Button>
      <Button variant="primary" icon={<Pencil size={15} />} onClick={() => setEdit(true)}>{t("Bearbeiten")}</Button>
    </>}>
      <div className="stack">
        <div className="cap-view"><JImage id={d.imageId} alt={d.title} /></div>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon={<Heart size={15} fill={d.favorite ? "currentColor" : "none"} />} aria-pressed={d.favorite} onClick={() => save({ favorite: !d.favorite })}>{d.favorite ? t("Favorit") : t("Als Favorit")}</Button>
        </div>
        <dl className="j-dl">
          {gameLabel(d.game ?? {}, games) && <div><dt>{t("Spiel")}</dt><dd>{gameLabel(d.game ?? {}, games)}</dd></div>}
          {d.takenAt && <div><dt>{t("Aufnahmedatum")}</dt><dd>{new Date(d.takenAt).toLocaleDateString()} <span className="tiny muted">({src})</span></dd></div>}
          {d.category && <div><dt>{t("Kategorie")}</dt><dd>{categoryLabel(d.category)}</dd></div>}
          {d.description && <div><dt>{t("Beschreibung")}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{d.description}</dd></div>}
          <div><dt>{t("Datei")}</dt><dd>{[d.file.name, d.file.format, d.file.width && d.file.height ? `${d.file.width} × ${d.file.height}` : "", bytes(d.file.bytes)].filter(Boolean).join(" · ")}</dd></div>
          {d.captureId && <div><dt>{t("Herkunft")}</dt><dd>{t("Aufnahme vom PC")}</dd></div>}
        </dl>
        {d.settings?.length > 0 && <div className="table-wrap"><table className="table"><thead><tr><th>{t("Aufnahmeeinstellungen")}</th><th>{t("Wert")}</th></tr></thead><tbody>{d.settings.map((s, i) => <tr key={i}><td>{s.name}</td><td>{s.value}</td></tr>)}</tbody></table></div>}
        {(d.tags ?? []).length > 0 && <div className="row" style={{ gap: 4 }}>{d.tags.map((tg) => <span key={tg} className="badge">#{tg}</span>)}</div>}
        {albums.length > 0 && (
          <Field label={t("In Sammlungen")}>
            <div className="chips">{albums.map((a) => { const on = a.data.items.includes(`photo:${p.id}`); return <button key={a.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setInAlbum(a.id, [`photo:${p.id}`], !on)}>{a.data.title}</button>; })}</div>
          </Field>
        )}
        <LinkedList entry={p} />
        <span className="tiny muted">{t("Verknüpfen mit Erinnerungen, Grafikvergleichen oder Clip-Momenten: „Bearbeiten“ → „Verknüpft mit“.")}</span>
      </div>
    </Modal>
  );
}

/** Full screen: arrows, swipe, keys ← → Esc; the browser's real full screen where allowed. */
function Lightbox({ list, start, onClose, onDetails }: { list: Entry<Photo>[]; start: number; onClose: () => void; onDetails: (id: string) => void }) {
  const [i, setI] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const go = (d: number) => setI((x) => (x + d + list.length) % list.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    ref.current?.focus();
    return () => { window.removeEventListener("keydown", key); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const p = list[i];
  return (
    <div ref={ref} className="m-light" role="dialog" aria-modal="true" aria-label={t("Vollbild")} tabIndex={-1}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}>
      <div className="m-light-bar">
        <span className="small">{p.data.title} <span className="muted">· {i + 1} / {list.length}</span></span>
        <span className="row nowrap" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => onDetails(p.id)}>{t("Details")}</Button>
          {document.fullscreenEnabled && <Button size="sm" variant="ghost" icon={<Expand size={15} />} aria-label={t("Ganzer Bildschirm")} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void ref.current?.requestFullscreen().catch(() => {}))} />}
          <Button size="sm" variant="ghost" icon={<X size={16} />} aria-label={t("Schließen")} onClick={onClose} />
        </span>
      </div>
      <div className="m-light-img"><JImage key={p.id} id={p.data.imageId} alt={p.data.title} /></div>
      {list.length > 1 && <>
        <button type="button" className="m-light-nav prev" aria-label={t("Vorheriges Bild")} onClick={() => go(-1)}><ChevronLeft size={28} /></button>
        <button type="button" className="m-light-nav next" aria-label={t("Nächstes Bild")} onClick={() => go(1)}><ChevronRight size={28} /></button>
      </>}
    </div>
  );
}

function AlbumManager({ albums, onClose }: { albums: Entry<Album>[]; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <Modal title={t("Sammlungen")} onClose={onClose}>
      <div className="stack">
        <form className="row nowrap" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; newAlbum(name); setName(""); toast(t("Sammlung angelegt"), "success"); }}>
          <input className="input" value={name} maxLength={80} placeholder={t("Name der neuen Sammlung")} aria-label={t("Name der neuen Sammlung")} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim()}>{t("Anlegen")}</Button>
        </form>
        {albums.length === 0 ? <p className="small muted">{t("Noch keine Sammlungen. Fotos und PC-Aufnahmen kannst du mehreren Sammlungen zuordnen.")}</p> : (
          <div className="list">{albums.map((a) => (
            <div key={a.id} className="list-item">
              <input className="input grow" value={a.data.title} maxLength={80} aria-label={t("Name der Sammlung")} onChange={(e) => trySave("album", a.id, { ...a.data, title: e.target.value || a.data.title })} />
              <span className="tiny muted">{a.data.items.length}</span>
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Sammlung löschen")} onClick={async () => { if (await confirmDialog(t("Sammlung löschen?"), t("Nur die Sammlung wird gelöscht – die Fotos und Aufnahmen bleiben."), { danger: true, ok: t("Löschen") })) removeWithLinks(a.id); }} />
            </div>
          ))}</div>
        )}
      </div>
    </Modal>
  );
}
