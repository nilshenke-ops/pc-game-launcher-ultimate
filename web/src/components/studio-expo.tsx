// F10 virtual exhibition: rooms with walls on which own collector cards, posters/banners and museum photos hang.
// Arrange with finger or mouse, captions, frames, room styles, fullscreen tour, export of a room as a picture.

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Expand, Landmark, Pencil, Plus, Share2, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { getEntry, listKind, newId, useJournal, useJournalVersion, type Entry } from "../lib/journal";
import { dropMissing, EXPO_TEMPLATES, MAX_ITEMS, MAX_ROOMS, moveItem, newExpo, placeItem, resizeItem, roomTemplate, sanitizeExpo, type Expo, type ExpoItem, type ExpoRoom, type FrameStyle } from "../lib/expo";
import { CARD_H, CARD_W, cardImageIds, drawCard, RARITIES, sanitizeCard, type Card } from "../lib/cards";
import { drawImageFit, fillGradient, safeName, sanitizeDesign, type Design } from "../lib/design";
import type { Photo } from "./media-shared";
import { removeWithLinks } from "./collection-view";
import { JImage, trySave } from "./journal-ui";
import { CardCanvas } from "./studio-cards";
import { canShareFiles, downloadCanvas, loadImages, shareCanvas } from "./studio-shared";
import { Button, confirmDialog, Empty, Field, Modal, Segmented } from "./ui";

/** What hangs on the wall: kind, title and aspect (height / width) of a reference, or null when it is gone. */
function resolve(ref: string): { kind: "card" | "design" | "photo"; title: string; aspect: number; imageId: string | null; card?: Card } | null {
  const [kind, id] = ref.split(":") as ["card" | "design" | "photo", string];
  const e = getEntry<Record<string, unknown>>(id);
  if (!e || e.kind !== kind) return null;
  if (kind === "card") { const c = sanitizeCard(e.data); return { kind, title: c.title, aspect: CARD_H / CARD_W, imageId: null, card: c }; }
  if (kind === "design") { const d = sanitizeDesign(e.data); return { kind, title: d.title, aspect: d.h / d.w, imageId: d.renderId ?? null }; }
  const p = e.data as unknown as Photo;
  return { kind, title: p.title, aspect: p.file?.width && p.file?.height ? p.file.height / p.file.width : 0.5625, imageId: p.imageId };
}

export function ExpoView({ focus }: { focus: string | null }) {
  const expos = useJournal<Expo>("expo");
  const [open, setOpen] = useState<string | null>(focus && expos.some((e) => e.id === focus) ? focus : null);
  const cur = open ? expos.find((e) => e.id === open) : null;
  const create = () => { const id = newId(); if (trySave("expo", id, newExpo(t("Meine Ausstellung")))) setOpen(id); };
  if (cur) return <ExpoEditor key={cur.id} entry={cur} onBack={() => setOpen(null)} />;
  return (
    <div className="stack">
      <p className="small muted">{t("Deine eigene Ausstellung: Räume gestalten und eigene Sammelkarten, Poster und Fotos aufhängen, verschieben und beschriften.")}</p>
      <div><Button variant="primary" icon={<Plus size={16} />} onClick={create}>{t("Neue Ausstellung")}</Button></div>
      {expos.length === 0 ? <Empty icon={<Landmark size={28} />} title={t("Noch keine Ausstellung")} text={t("Lege eine an und hänge Karten, Poster oder Fotos auf.")} /> : (
        <div className="studio-expos">
          {expos.map((e) => {
            const x = sanitizeExpo(e.data), tpl = EXPO_TEMPLATES.find((v) => v.id === x.template)!;
            return (
              <button key={e.id} type="button" className="studio-expo-tile" onClick={() => setOpen(e.id)} style={{ background: `linear-gradient(160deg, ${tpl.wall[0]}, ${tpl.wall[1]})` }}>
                <b>{x.title}</b>
                <span className="tiny">{t("{r} Räume · {n} Bilder", { r: x.rooms.length, n: x.rooms.reduce((s, r) => s + r.items.length, 0) })}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExpoEditor({ entry, onBack }: { entry: Entry<Expo>; onBack: () => void }) {
  useJournalVersion(); // re-render when cards/posters/photos change
  const [x, setX] = useState(() => dropMissing(sanitizeExpo(entry.data), (r) => !!resolve(r)));
  const [ri, setRi] = useState(0);
  const [edit, setEdit] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [full, setFull] = useState(false);
  const wall = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const room = x.rooms[Math.min(ri, x.rooms.length - 1)];
  const tpl = roomTemplate(x, room);
  const item = room.items.find((i) => i.id === sel) ?? null;

  const persist = (next: Expo) => { const clean = sanitizeExpo(next); setX(clean); trySave("expo", entry.id, clean); };
  const setRoom = (r: ExpoRoom) => persist({ ...x, rooms: x.rooms.map((o) => (o.id === r.id ? r : o)) });
  const setItem = (p: Partial<ExpoItem>) => item && setRoom({ ...room, items: room.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)) });

  const down = (e: RPointerEvent, it: ExpoItem) => {
    if (!edit) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSel(it.id);
    drag.current = { id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y };
  };
  const move = (e: RPointerEvent) => {
    const g = drag.current, w = wall.current; if (!g || !w) return;
    const r = w.getBoundingClientRect();
    setX((cur) => ({ ...cur, rooms: cur.rooms.map((o) => (o.id === room.id ? moveItem(o, g.id, g.ox + ((e.clientX - g.sx) / r.width) * 100, g.oy + ((e.clientY - g.sy) / r.height) * 100) : o)) }));
  };
  const up = () => { if (drag.current) { drag.current = null; persist(x); } };

  const goFull = async () => {
    setEdit(false); setSel(null);
    const el = wall.current?.parentElement;
    try { if (el?.requestFullscreen) { await el.requestFullscreen(); return; } } catch { /* fall back below */ }
    setFull(true); // iPhone: no element fullscreen – cover the screen instead
  };
  useEffect(() => { const f = () => { if (!document.fullscreenElement) setFull(false); }; document.addEventListener("fullscreenchange", f); return () => document.removeEventListener("fullscreenchange", f); }, []);

  const removeExpo = async () => { if (await confirmDialog(t("Ausstellung löschen?"), t("„{n}“ wird gelöscht. Karten, Poster und Fotos bleiben erhalten.", { n: x.title }), { danger: true, ok: t("Löschen") })) { removeWithLinks(entry.id); onBack(); } };
  const addRoom = () => { if (x.rooms.length >= MAX_ROOMS) return; persist({ ...x, rooms: [...x.rooms, { id: Math.random().toString(36).slice(2, 10), title: t("Raum {n}", { n: x.rooms.length + 1 }), description: "", template: null, items: [] }] }); setRi(x.rooms.length); };
  const removeRoom = async () => { if (x.rooms.length <= 1) return; if (await confirmDialog(t("Raum entfernen?"), t("Die Bilder in diesem Raum werden abgehängt (nicht gelöscht)."), { danger: true })) { persist({ ...x, rooms: x.rooms.filter((r) => r.id !== room.id) }); setRi(0); } };

  return (
    <div className="stack">
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" icon={<ChevronLeft size={15} />} onClick={onBack}>{t("Alle Ausstellungen")}</Button>
        <span className="grow" />
        <Button size="sm" variant={edit ? "primary" : "ghost"} icon={<Pencil size={15} />} onClick={() => { setEdit(!edit); setSel(null); }}>{edit ? t("Bearbeiten an") : t("Bearbeiten")}</Button>
        <Button size="sm" icon={<Expand size={15} />} onClick={() => void goFull()}>{t("Vollbild")}</Button>
        <Button size="sm" icon={<Download size={15} />} onClick={async () => downloadCanvas(await renderRoom(x, room), safeName(`${x.title}-${room.title}`))}>{t("Raum als Bild")}</Button>
        {canShareFiles() && <Button size="sm" icon={<Share2 size={15} />} onClick={async () => shareCanvas(await renderRoom(x, room), safeName(x.title), x.title)}>{t("Teilen")}</Button>}
        <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={removeExpo}>{t("Löschen")}</Button>
      </div>
      {edit && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label={t("Titel")}><input className="input" maxLength={60} value={x.title} onChange={(e) => setX({ ...x, title: e.target.value })} onBlur={() => persist(x)} /></Field>
          <Field label={t("Stil der Ausstellung")}>
            <select className="input" value={x.template} onChange={(e) => persist({ ...x, template: e.target.value as Expo["template"] })}>{EXPO_TEMPLATES.map((v) => <option key={v.id} value={v.id}>{t(v.label)}</option>)}</select>
          </Field>
        </div>
      )}
      <div className="chips" role="tablist" aria-label={t("Räume")}>
        {x.rooms.map((r, i) => <button key={r.id} type="button" role="tab" aria-selected={i === ri} className={`chip ${i === ri ? "on" : ""}`} onClick={() => { setRi(i); setSel(null); }}>{r.title}</button>)}
        {edit && x.rooms.length < MAX_ROOMS && <button type="button" className="chip" onClick={addRoom}><Plus size={14} />{t("Raum")}</button>}
      </div>
      <div className={`expo-stage ${full ? "expo-full" : ""}`}>
        {full && <button type="button" className="expo-close" onClick={() => setFull(false)} aria-label={t("Schließen")}><X size={20} /></button>}
        <div ref={wall} className={`expo-wall ${edit ? "editing" : ""}`} style={{ background: `radial-gradient(ellipse at 50% 0%, ${tpl.light}, transparent 60%), linear-gradient(180deg, ${tpl.wall[0]}, ${tpl.wall[1]})` }}
          onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerDown={() => setSel(null)}>
          <div className="expo-floor" style={{ background: tpl.floor }} />
          {room.items.length === 0 && <div className="expo-empty">{edit ? t("Leere Wand – „Bild aufhängen“ wählen.") : t("Dieser Raum ist noch leer.")}</div>}
          {room.items.map((it) => <WallPiece key={it.id} it={it} selected={it.id === sel} onDown={(e) => down(e, it)} />)}
        </div>
        {(full || !edit) && x.rooms.length > 1 && (
          <div className="expo-nav">
            <Button size="sm" icon={<ChevronLeft size={15} />} disabled={ri === 0} onClick={() => setRi(ri - 1)}>{t("Zurück")}</Button>
            <span className="small">{room.title}</span>
            <Button size="sm" icon={<ChevronRight size={15} />} disabled={ri >= x.rooms.length - 1} onClick={() => setRi(ri + 1)}>{t("Weiter")}</Button>
          </div>
        )}
      </div>
      {room.description && !edit && <p className="small muted">{room.description}</p>}
      {edit && (
        <div className="grid-2">
          <div className="stack-sm">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button variant="primary" icon={<Plus size={15} />} disabled={room.items.length >= MAX_ITEMS} onClick={() => setAdding(true)}>{t("Bild aufhängen")}</Button>
              {x.rooms.length > 1 && <Button variant="ghost" icon={<Trash2 size={15} />} onClick={removeRoom}>{t("Raum entfernen")}</Button>}
            </div>
            <Field label={t("Raumname")}><input className="input" maxLength={60} value={room.title} onChange={(e) => setX({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? { ...r, title: e.target.value } : r)) })} onBlur={() => persist(x)} /></Field>
            <Field label={t("Beschreibung")}><textarea className="input" rows={2} maxLength={300} value={room.description} onChange={(e) => setX({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? { ...r, description: e.target.value } : r)) })} onBlur={() => persist(x)} /></Field>
            <Field label={t("Stil dieses Raums")}>
              <select className="input" value={room.template ?? ""} onChange={(e) => setRoom({ ...room, template: (e.target.value || null) as ExpoRoom["template"] })}>
                <option value="">{t("Wie die Ausstellung")}</option>{EXPO_TEMPLATES.map((v) => <option key={v.id} value={v.id}>{t(v.label)}</option>)}
              </select>
            </Field>
          </div>
          <div className="stack-sm">
            {item ? <>
              <b className="small">{resolve(item.ref)?.title}</b>
              <Field label={t("Größe")}><input type="range" min={5} max={80} value={item.w} onChange={(e) => setRoom(resizeItem(room, item.id, +e.target.value))} /></Field>
              <Field label={t("Beschriftung")}><input className="input" maxLength={80} value={item.caption} onChange={(e) => setX({ ...x, rooms: x.rooms.map((r) => (r.id === room.id ? { ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, caption: e.target.value } : i)) } : r)) })} onBlur={() => persist(x)} /></Field>
              <Segmented value={item.frame} onChange={(frame) => setItem({ frame: frame as FrameStyle })} label={t("Rahmen")} options={[{ value: "none", label: t("Ohne") }, { value: "thin", label: t("Schmal") }, { value: "gold", label: t("Gold") }, { value: "neon", label: t("Neon") }]} />
              <div><Button variant="ghost" icon={<X size={15} />} onClick={() => { setRoom({ ...room, items: room.items.filter((i) => i.id !== item.id) }); setSel(null); }}>{t("Abhängen")}</Button></div>
            </> : <p className="small muted">{t("Ein Bild antippen, um es zu verschieben, zu vergrößern oder zu beschriften.")}</p>}
          </div>
        </div>
      )}
      {adding && <AddPiece onClose={() => setAdding(false)} onAdd={(ref) => { setRoom(placeItem(room, ref)); setAdding(false); }} />}
    </div>
  );
}

function WallPiece({ it, selected, onDown }: { it: ExpoItem; selected: boolean; onDown: (e: RPointerEvent) => void }) {
  const r = resolve(it.ref);
  if (!r) return null;
  return (
    <figure className={`expo-piece frame-${it.frame} ${selected ? "on" : ""}`} style={{ left: `${it.x}%`, top: `${it.y}%`, width: `${it.w}%` }} onPointerDown={onDown}>
      <div className="expo-img" style={{ aspectRatio: `1 / ${r.aspect}` }}>
        {r.card ? <CardCanvas card={r.card} scale={0.5} /> : r.imageId ? <JImage id={r.imageId} alt={r.title} /> : <span className="tiny">{t("Noch nicht gespeichert")}</span>}
      </div>
      {it.caption && <figcaption>{it.caption}</figcaption>}
    </figure>
  );
}

function AddPiece({ onAdd, onClose }: { onAdd: (ref: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"card" | "design" | "photo">("card");
  const cards = listKind<Card>("card"), designs = listKind<Design>("design").filter((d) => d.data.renderId), photos = listKind<Photo>("photo");
  const items: { id: string; title: string; el: React.ReactNode }[] = kind === "card" ? cards.map((c) => ({ id: c.id, title: c.data.title, el: <CardCanvas card={sanitizeCard(c.data)} scale={0.25} /> }))
    : kind === "design" ? designs.map((d) => ({ id: d.id, title: d.data.title, el: <JImage id={d.data.thumbId || d.data.renderId!} alt={d.data.title} /> }))
    : photos.map((p) => ({ id: p.id, title: p.data.title, el: <JImage id={p.data.thumbId || p.data.imageId} alt={p.data.title} /> }));
  return (
    <Modal title={t("Bild aufhängen")} onClose={onClose} wide>
      <div className="stack">
        <Segmented value={kind} onChange={setKind} label={t("Art")} options={[{ value: "card", label: t("Sammelkarten") }, { value: "design", label: t("Poster & Banner") }, { value: "photo", label: t("Fotos") }]} />
        {items.length === 0 ? <p className="small muted">{kind === "card" ? t("Noch keine Sammelkarten.") : kind === "design" ? t("Noch keine gespeicherten Poster oder Banner.") : t("Noch keine Fotos im Fotomuseum.")}</p> : (
          <div className="studio-pick">
            {items.map((i) => <button key={i.id} type="button" className="studio-pick-item" onClick={() => onAdd(`${kind}:${i.id}`)}>{i.el}<span className="tiny">{i.title}</span></button>)}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** One room as a 1920 × 1080 picture: wall, floor, pictures with frame and caption. */
async function renderRoom(x: Expo, room: ExpoRoom): Promise<HTMLCanvasElement> {
  const W = 1920, H = 1080, cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  const tpl = roomTemplate(x, room);
  fillGradient(ctx, W, H, tpl.wall[0], tpl.wall[1], 90);
  ctx.fillStyle = tpl.floor; ctx.fillRect(0, H * 0.88, W, H * 0.12);
  for (const it of room.items) {
    const r = resolve(it.ref); if (!r) continue;
    const w = (it.w / 100) * W, h = w * r.aspect, px = (it.x / 100) * W, py = (it.y / 100) * H;
    let src: (CanvasImageSource & { width: number; height: number }) | undefined;
    if (r.card) { const c = document.createElement("canvas"); drawCard(c, r.card, await loadImages(cardImageIds(r.card)), { scale: 1, rarityLabel: t(RARITIES.find((v) => v.id === r.card!.rarity)!.label) }); src = c; }
    else if (r.imageId) src = (await loadImages([r.imageId])).get(r.imageId);
    const fw = it.frame === "none" ? 0 : it.frame === "thin" ? 6 : 14;
    if (fw) { ctx.save(); ctx.fillStyle = it.frame === "gold" ? "#c9a227" : it.frame === "neon" ? "#22d3ee" : "#111827"; if (it.frame === "neon") { ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 30; } ctx.fillRect(px - fw, py - fw, w + 2 * fw, h + 2 * fw); ctx.restore(); }
    if (src) drawImageFit(ctx, src, px, py, w, h, "cover");
    if (it.caption) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.font = "600 24px system-ui, sans-serif"; const tw = ctx.measureText(it.caption).width + 24; ctx.fillRect(px + w / 2 - tw / 2, py + h + fw + 10, tw, 36); ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(it.caption, px + w / 2, py + h + fw + 28); ctx.textAlign = "left"; }
  }
  return cv;
}
