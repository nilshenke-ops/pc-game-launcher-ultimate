// Gaming room: a drawn 2.5D room (CSS only, no 3D engine) whose objects lead to existing areas – PC → library,
// poster → your favourite game, shelf → backlog, trophy → trophy room, lamp → design, speaker → soundboard,
// controller → deck. Styles, light, shown objects and decorations are saved per variant on this device.
import { useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Copy, LayoutDashboard, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { useRpc } from "../lib/hooks";
import { useAppState } from "../lib/state";
import type { LibraryItem } from "../lib/types";
import type { PassInput } from "../lib/gamerpass";
import {
  activeVariant, collectible, getRoom, owned, progressOf, ROOM_OBJECTS, ROOM_STYLES, setRoom, subscribeRoom, TREE, unlockedStyles,
  type RoomObject, type RoomState, type RoomVariant,
} from "../lib/room";
import { Banner, Button, Card, confirmDialog, Field, PageHead, Switch } from "../components/ui";

export const useRoom = () => useSyncExternalStore(subscribeRoom, getRoom);

const OBJECT_INFO: Record<RoomObject, { label: string; to: string; target: string }> = {
  pc: { label: "PC", to: "/games", target: "Spiele öffnen" },
  poster: { label: "Poster", to: "/games", target: "Lieblingsspiel in der Bibliothek" },
  shelf: { label: "Regal", to: "/backlog", target: "Backlog öffnen" },
  trophy: { label: "Pokal", to: "/trophies", target: "Trophäenraum öffnen" },
  lamp: { label: "Lampe", to: "/settings?s=design", target: "Design ändern" },
  speaker: { label: "Lautsprecher", to: "/soundboard", target: "Soundboard öffnen" },
  controller: { label: "Controller", to: "/deck", target: "Deck öffnen" },
};
const LIGHTS = ["#22d3ee", "#f472b6", "#a78bfa", "#facc15", "#fb923c", "#4ade80", "#f8fafc"];
const styleNeed = (id: string) => TREE.find((n) => n.reward.style === id);
const NEED_LABEL = { level: "Ab Level {n}", trophies: "Ab {n} Trophäen", hours: "Ab {n} Stunden Spielzeit" } as const;

export default function RoomPage({ asStart }: { asStart?: boolean }) {
  const room = useRoom();
  const v = activeVariant(room);
  const q = useRpc<PassInput>("quests.get", {}, ["quests", "history"]);
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const { state } = useAppState();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const prog = q.data ? progressOf(q.data) : { level: 1, trophies: 0, hours: 0 };
  const mine = useMemo(() => new Set(owned(prog, room)), [prog.level, prog.trophies, prog.hours, room]);
  const styles = unlockedStyles(prog);
  const style = ROOM_STYLES.find((s) => s.id === v.style && styles.has(s.id)) ?? ROOM_STYLES[0];
  const games = (lib.data?.items ?? []).filter((i) => i.kind === "game");
  const poster = games.find((g) => g.favorite && g.coverUrl) ?? games.find((g) => g.favorite) ?? games.find((g) => g.coverUrl);
  const playing = state?.running?.[0]?.name;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<string | null>(null);

  const update = (fn: (x: RoomVariant) => RoomVariant) => setRoom({ ...room, variants: room.variants.map((x) => (x.id === v.id ? fn(x) : x)) });
  const set = (p: Partial<RoomState>) => setRoom({ ...room, ...p });
  const shown = (o: RoomObject) => !v.hidden.includes(o);
  const decor = v.decor.filter((d) => mine.has(d.id));

  const moveTo = (id: string, e: PointerEvent) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    update((s) => ({ ...s, decor: s.decor.map((d) => (d.id === id ? { ...d, x, y } : d)) }));
  };
  const nudge = (id: string, e: KeyboardEvent) => {
    const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key];
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); update((s) => ({ ...s, decor: s.decor.filter((x) => x.id !== id) })); setSel(null); return; }
    if (!d) return;
    e.preventDefault();
    update((s) => ({ ...s, decor: s.decor.map((x) => (x.id === id ? { ...x, x: x.x + d[0], y: x.y + d[1] } : x)) }));
  };

  const obj = (o: RoomObject, cls: string, content: ReactNode) => shown(o) && (
    <button type="button" className={`room-obj ${cls}`} aria-label={`${t(OBJECT_INFO[o].label)} – ${t(OBJECT_INFO[o].target)}`} disabled={editing}
      onClick={() => nav(OBJECT_INFO[o].to)}>{content}<span className="room-tip">{t(OBJECT_INFO[o].target)}</span></button>
  );

  const shelfItems = room.shelf.filter((x): x is string => !!x && mine.has(x)).slice(0, 6);

  return (
    <>
      <PageHead eyebrow={t("Gaming-Raum")} title={v.name}
        text={t("Dein Raum als Startpunkt: tippe auf PC, Poster, Regal, Pokal, Lampe, Lautsprecher oder Controller.")}
        actions={<>
          {asStart && <Link className="btn" to="/dashboard"><LayoutDashboard size={16} />{t("Dashboard")}</Link>}
          <Button variant={editing ? "primary" : undefined} icon={editing ? <X size={16} /> : <Pencil size={16} />} onClick={() => { setEditing(!editing); setSel(null); }}>{editing ? t("Fertig") : t("Raum bearbeiten")}</Button>
        </>} />
      <div ref={box} className={`room ${editing ? "editing" : ""}`} style={{ "--wall": style.wall, "--floor": style.floor, "--room-accent": style.accent, "--light": v.light } as CSSProperties}
        onPointerMove={(e) => { if (drag.current) moveTo(drag.current, e); }} onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
        <div className="room-wall" aria-hidden /><div className="room-side" aria-hidden /><div className="room-floor" aria-hidden /><div className="room-glow" aria-hidden />
        {obj("poster", "room-poster", <><span>{poster?.name ?? t("Dein Lieblingsspiel")}</span>{poster?.coverUrl && <img src={poster.coverUrl} alt="" onError={(e) => e.currentTarget.remove()} />}</>)}
        {obj("shelf", "room-shelf", <><i /><i /><span className="room-shelf-items">{shelfItems.map((id) => <b key={id}>{collectible(id)?.emoji}</b>)}</span></>)}
        {obj("trophy", "room-trophy", <span>🏆</span>)}
        {obj("lamp", "room-lamp", <><span className="room-lamp-cone" /><span className="room-lamp-head" /><span className="room-lamp-pole" /></>)}
        <div className="room-desk" aria-hidden />
        {obj("pc", "room-pc", <span className="room-screen">{playing ? t("Läuft: {n}", { n: playing }) : t("{n} Spiele", { n: games.length })}</span>)}
        {obj("controller", "room-controller", <span>🎮</span>)}
        {obj("speaker", "room-speaker", <span className="room-speaker-cone" />)}
        {decor.map((d) => (
          <span key={d.id} className={`room-decor ${sel === d.id ? "sel" : ""}`} style={{ left: `${d.x}%`, top: `${d.y}%` }} role={editing ? "button" : undefined} tabIndex={editing ? 0 : -1}
            aria-label={editing ? t("{n} verschieben (Pfeiltasten, Entf entfernt)", { n: t(collectible(d.id)!.name) }) : t(collectible(d.id)!.name)}
            onPointerDown={(e) => { if (!editing) return; e.preventDefault(); drag.current = d.id; setSel(d.id); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current === d.id) moveTo(d.id, e); }}
            onPointerUp={() => { drag.current = null; }}
            onKeyDown={(e) => editing && nudge(d.id, e)} onFocus={() => editing && setSel(d.id)}>{collectible(d.id)!.emoji}</span>
        ))}
      </div>
      {q.stale && <p className="tiny muted">{t("Ohne PC: Fortschritt vom letzten Stand.")}</p>}

      {editing && (
        <div className="grid-2" style={{ marginTop: 16 }}>
          <Card title={t("Varianten")}>
            <div className="stack-sm">
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {room.variants.map((x) => <button key={x.id} type="button" className={`chip ${x.id === v.id ? "on" : ""}`} aria-pressed={x.id === v.id} onClick={() => set({ active: x.id })}>{x.name}</button>)}
              </div>
              <Field label={t("Name")}><input className="input" value={v.name} maxLength={30} onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} /></Field>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <Button size="sm" icon={<Copy size={14} />} disabled={room.variants.length >= 6} onClick={() => { const id = "v" + Date.now().toString(36); setRoom({ ...room, active: id, variants: [...room.variants, { ...structuredClone(v), id, name: t("{n} (Kopie)", { n: v.name }).slice(0, 30) }] }); }}>{t("Als neue Variante")}</Button>
                <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={room.variants.length <= 1} onClick={async () => { if (await confirmDialog(t("Variante löschen?"), t("„{n}“ wird gelöscht.", { n: v.name }), { danger: true, ok: t("Löschen") })) { const rest = room.variants.filter((x) => x.id !== v.id); setRoom({ ...room, variants: rest, active: rest[0].id }); } }}>{t("Löschen")}</Button>
              </div>
              <Switch checked={room.startPage} onChange={(startPage) => set({ startPage })} label={t("Als Startseite verwenden")} hint={t("Statt des Dashboards erscheint beim Öffnen der Raum. Das Dashboard bleibt über den Knopf „Dashboard“ erreichbar.")} />
            </div>
          </Card>
          <Card title={t("Stil & Licht")}>
            <div className="stack-sm">
              <div className="room-styles">
                {ROOM_STYLES.map((s) => {
                  const ok = styles.has(s.id), need = styleNeed(s.id);
                  return (
                    <button key={s.id} type="button" className={`room-style ${v.style === s.id ? "on" : ""}`} disabled={!ok} aria-pressed={v.style === s.id}
                      style={{ background: `linear-gradient(180deg, ${s.wall} 60%, ${s.floor} 60%)`, borderColor: v.style === s.id ? s.accent : undefined }} onClick={() => update((x) => ({ ...x, style: s.id }))}>
                      <span>{t(s.name)}</span>{!ok && need && <small><Lock size={11} /> {t(NEED_LABEL[need.branch], { n: need.need })}</small>}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="small"><b>{t("Licht")}</b></span>
                {LIGHTS.map((c) => <button key={c} type="button" className={`pass-swatch ${v.light === c ? "on" : ""}`} style={{ background: c, width: 32 }} aria-label={c} aria-pressed={v.light === c} onClick={() => update((x) => ({ ...x, light: c }))} />)}
                <input type="color" value={v.light} aria-label={t("Eigene Lichtfarbe")} onChange={(e) => update((x) => ({ ...x, light: e.target.value }))} />
              </div>
              <span className="small"><b>{t("Objekte")}</b></span>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {ROOM_OBJECTS.map((o) => <button key={o} type="button" className={`chip ${shown(o) ? "on" : ""}`} aria-pressed={shown(o)} onClick={() => update((x) => ({ ...x, hidden: shown(o) ? [...x.hidden, o] : x.hidden.filter((h) => h !== o) }))}>{t(OBJECT_INFO[o].label)}</button>)}
              </div>
            </div>
          </Card>
          <Card title={t("Deko")}>
            <div className="stack-sm">
              {mine.size === 0 ? <Banner kind="info">{t("Noch keine Sammelstücke – sie kommen aus dem Fortschrittsbaum und den Belohnungskisten im Trophäenraum.")}</Banner> : (
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {[...mine].map((id) => {
                    const placed = v.decor.some((d) => d.id === id), c = collectible(id)!;
                    return <button key={id} type="button" className={`chip ${placed ? "on" : ""}`} aria-pressed={placed}
                      onClick={() => update((x) => ({ ...x, decor: placed ? x.decor.filter((d) => d.id !== id) : [...x.decor, { id, x: 20 + Math.random() * 60, y: 72 }] }))}>{c.emoji} {t(c.name)}</button>;
                  })}
                </div>
              )}
              <p className="tiny muted" style={{ margin: 0 }}>{t("Antippen stellt in den Raum oder nimmt heraus. Im Raum ziehen zum Verschieben – oder auswählen und mit den Pfeiltasten bewegen, Entf entfernt.")}</p>
              {sel && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => { update((x) => ({ ...x, decor: x.decor.filter((d) => d.id !== sel) })); setSel(null); }}>{t("Ausgewähltes entfernen")}</Button>}
              <Link className="btn sm" to="/trophies?tab=collection"><Plus size={14} />{t("Sammlung & Fortschritt")}</Link>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
