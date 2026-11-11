// Holo view of the game library: a turning showcase with the chosen game big in the middle and its real data below
// (play time and last start only from the PC's history). Only the cards near the middle are drawn, so it stays fast
// with thousands of games. Arrow keys, swipe, mouse wheel, the slider or a tap on a side card move it.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Loader2, MoreVertical, Play, Star } from "lucide-react";
import { t } from "../lib/i18n";
import { gradientFor, initials, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Button } from "./ui";
import { isSettled, stepSpring } from "../lib/island-spring";
import { motionOff } from "../lib/motion";

const WINDOW = 5;
/** The carousel spring (card numbers): soft, a hair of overshoot – like the island's. */
const HK = 64, HC = 2 * Math.sqrt(HK) * 0.86;

export interface HoloInfo { minutes?: number; lastPlayed?: number }

/** Distance between two neighbouring cards in pixels (the same numbers as in the CSS), so a finger and the cards move together. */
function pitchPx(stage: HTMLElement | null): number {
  const card = stage?.querySelector<HTMLElement>(".holo-card"); const w = card?.offsetWidth ?? 220;
  return Math.max(60, Math.min(w * 0.58, 170) + w * 0.2);
}

function Cover({ item, cover }: { item: LibraryItem; cover?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="holo-cover" style={{ background: gradientFor(item.name) }}>
      {cover && !broken ? <img src={cover} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} /> : <span className="holo-initials">{initials(item.name)}</span>}
    </div>
  );
}

export function HoloLibrary({ items, coverOf, running, installed, launching, info, onLaunch, onEdit, onFav }: {
  items: LibraryItem[]; coverOf: (i: LibraryItem) => string | undefined; running: Set<string>; installed: Record<string, boolean | null>;
  launching: Set<string>; info: Map<string, HoloInfo>; onLaunch: (i: LibraryItem) => void; onEdit?: (i: LibraryItem) => void; onFav: (i: LibraryItem) => void;
}) {
  // The chosen game is kept by id: a new sort or a new favourite keeps it in the middle; a filter without it starts at the first.
  const [curId, setCurId] = useState<string | null>(null);
  const i = Math.max(0, curId ? items.findIndex((x) => x.id === curId) : 0);
  const go = (n: number) => { const it = items[Math.max(0, Math.min(items.length - 1, n))]; if (it) { dirRef.current = n >= i ? 1 : -1; setCurId(it.id); } };
  const start = useRef<{ x: number; id: number; t: number; lastX: number; lastT: number; v: number; moved: boolean; pos0: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const holoRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef<1 | -1>(1);
  const prevI = useRef(0);
  const swipedAt = useRef(0);
  const wheelAt = useRef(0);
  // The position of the carousel as a fractional card number, moved by a spring (or by the finger) and written to --pos each frame.
  const posA = useRef([0]), velA = useRef([0]), tgtA = useRef([0]), raf = useRef(0), lastT = useRef(0);
  const writePos = () => stageRef.current?.style.setProperty("--pos", posA.current[0].toFixed(4));
  const frame = (now: number) => {
    const dt = lastT.current ? Math.min(0.05, Math.max(0.001, (now - lastT.current) / 1000)) : 1 / 60; lastT.current = now;
    stepSpring(posA.current, velA.current, tgtA.current, dt, HK, HC);
    if (isSettled(posA.current, velA.current, tgtA.current, 0.002, 0.02)) { posA.current[0] = tgtA.current[0]; velA.current[0] = 0; raf.current = 0; lastT.current = 0; writePos(); return; }
    writePos(); raf.current = requestAnimationFrame(frame);
  };
  const kick = () => { if (motionOff()) { posA.current[0] = tgtA.current[0]; velA.current[0] = 0; writePos(); return; } if (!raf.current) { lastT.current = 0; raf.current = requestAnimationFrame(frame); } };
  useLayoutEffect(() => { posA.current[0] = tgtA.current[0] = i; writePos(); return () => cancelAnimationFrame(raf.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dragging.current) { tgtA.current[0] = i; kick(); } }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const dragging = useRef(false);

  if (!items.length) return null;
  prevI.current = i;
  const cur = items[i];
  const meta = info.get(cur.id);
  const lo = Math.max(0, i - WINDOW), hi = Math.min(items.length - 1, i + WINDOW);
  const shown: number[] = [];
  for (let k = lo; k <= hi; k++) shown.push(k);

  return (
    <div ref={holoRef} className="holo" tabIndex={0} role="region" aria-roledescription={t("Karussell")} aria-label={t("Holo-Ansicht: {n} von {m}", { n: i + 1, m: items.length })}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
        else if (e.key === "Home") { e.preventDefault(); go(0); }
        else if (e.key === "End") { e.preventDefault(); go(items.length - 1); }
        else if (e.key === "Enter") { e.preventDefault(); onLaunch(cur); }
      }}
      onWheel={(e) => {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
        if (Math.abs(d) < 20 || Date.now() - wheelAt.current < 180) return;
        wheelAt.current = Date.now(); go(i + (d > 0 ? 1 : -1));
      }}>
      <div className="holo-stage"
        ref={stageRef}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("input,[data-no-drag]")) return;
          start.current = { x: e.clientX, id: e.pointerId, t: performance.now(), lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, pos0: posA.current[0] };
        }}
        onPointerMove={(e) => {
          const s0 = start.current; if (!s0 || s0.id !== e.pointerId) return;
          const dx = e.clientX - s0.x;
          if (!s0.moved && Math.abs(dx) < 6) return;                      // a tap stays a tap
          if (!s0.moved) { s0.moved = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable */ } holoRef.current?.classList.add("dragging"); dragging.current = true; cancelAnimationFrame(raf.current); raf.current = 0; velA.current[0] = 0; }
          const now = performance.now(), dt = Math.max(1, now - s0.lastT);
          s0.v = 0.8 * s0.v + 0.2 * ((e.clientX - s0.lastX) / dt);         // px/ms, smoothed
          s0.lastX = e.clientX; s0.lastT = now;
          // The cards follow the finger (1 = one card further); at the ends they resist a little, like rubber.
          const pitch = pitchPx(stageRef.current);
          let p = s0.pos0 - dx / pitch;
          const max = items.length - 1;
          if (p < 0) p = -(1 - Math.exp(-(-p) * 1.4)) * 0.35; else if (p > max) p = max + (1 - Math.exp(-(p - max) * 1.4)) * 0.35;
          posA.current[0] = p; writePos();
        }}
        onPointerUp={(e) => {
          const s0 = start.current; start.current = null;
          holoRef.current?.classList.remove("dragging"); dragging.current = false;
          if (!s0 || s0.id !== e.pointerId || !s0.moved) return;
          const pitch = pitchPx(stageRef.current), dx = e.clientX - s0.x;
          // The cards carry on with the speed of the finger: the target is where they would glide to, then the spring takes over.
          const v = Math.max(-30, Math.min(30, (-s0.v * 1000) / pitch));        // cards per second
          const tgt = Math.max(0, Math.min(items.length - 1, Math.round(posA.current[0] + v * 0.2)));
          velA.current[0] = v; tgtA.current[0] = tgt;
          if (Math.abs(dx) > 6) swipedAt.current = Date.now();                    // a drag is no tap on a card
          dirRef.current = tgt >= i ? 1 : -1;
          if (tgt !== i) setCurId(items[tgt].id);
          kick();
        }}
        onPointerCancel={() => { start.current = null; holoRef.current?.classList.remove("dragging"); dragging.current = false; tgtA.current[0] = i; kick(); }}>
        {shown.map((k) => {
          const it = items[k], off = k - i, a = Math.abs(off);
          const style = { "--off": off, "--k": k, "--abs": a, zIndex: 20 - a, opacity: a > 3 ? 0 : 1 - a * 0.22 } as CSSProperties;
          const isCur = off === 0;
          return (
            <button key={it.id} type="button" className={`holo-card ${isCur ? "cur" : ""} ${running.has(it.id) ? "running" : ""}`} style={style} tabIndex={-1}
              aria-label={isCur ? t("{name} starten", { name: it.name }) : t("{name} auswählen", { name: it.name })}
              onClick={() => { if (Date.now() - swipedAt.current < 400) return; if (isCur) onLaunch(it); else go(k); }}>
              <Cover item={it} cover={coverOf(it)} />
              {launching.has(it.id) && <span className="tile-busy"><Loader2 size={30} className="spin" /></span>}
            </button>
          );
        })}
        <div className="holo-floor" aria-hidden />
      </div>
      <div className="holo-nav">
        <Button size="sm" icon={<ChevronLeft size={18} />} aria-label={t("Vorheriges Spiel")} disabled={i === 0} onClick={() => go(i - 1)} />
        <input type="range" min={0} max={items.length - 1} value={i} aria-label={t("Spiel wählen")} onChange={(e) => go(+e.target.value)} disabled={items.length < 2} />
        <span className="tiny muted" style={{ minWidth: 64, textAlign: "center" }}>{i + 1} / {items.length}</span>
        <Button size="sm" icon={<ChevronRight size={18} />} aria-label={t("Nächstes Spiel")} disabled={i === items.length - 1} onClick={() => go(i + 1)} />
      </div>
      <div className="holo-panel" aria-live="polite" style={{ ["--hdir" as string]: dirRef.current }}>
        <div className="row between holo-panel-in" key={cur.id} style={{ gap: 8, alignItems: "flex-start" }}>
          <div className="stack-xs" style={{ minWidth: 0 }}>
            <h2 className="holo-title">{cur.name}</h2>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {running.has(cur.id) && <span className="badge ok">● {t("Läuft")}</span>}
              {installed[cur.id] === false && <span className="badge error">{t("Nicht gefunden")}</span>}
              {cur.gamePassId && <span className="badge gp">Game Pass</span>}
              {(cur.rating ?? 0) > 0 && <span className="tiny" style={{ color: "#fde047" }} aria-label={t("{n} von 5 Sternen", { n: cur.rating! })}>{"★".repeat(cur.rating!)}</span>}
              {cur.categories.filter((c) => c !== "Game Pass").slice(0, 3).map((c) => <span key={c} className="badge">{c}</span>)}
            </div>
            <span className="small muted">
              {meta?.minutes ? t("{h} h gespielt", { h: (Math.round(meta.minutes / 6) / 10).toLocaleString() }) : t("Noch keine Spielzeit erfasst")}
              {meta?.lastPlayed ? " · " + t("zuletzt {d}", { d: relTime(meta.lastPlayed) }) : ""}
            </span>
          </div>
          <div className="row nowrap" style={{ gap: 6 }}>
            <Button size="sm" variant="ghost" icon={<Star size={16} fill={cur.favorite ? "currentColor" : "none"} />} aria-pressed={cur.favorite} aria-label={cur.favorite ? t("Favorit entfernen") : t("Als Favorit markieren")} onClick={() => onFav(cur)} />
            {onEdit && <Button size="sm" variant="ghost" icon={<MoreVertical size={16} />} aria-label={t("Bearbeiten")} onClick={() => onEdit(cur)} />}
            <Button variant="primary" icon={<Play size={15} />} busy={launching.has(cur.id)} onClick={() => onLaunch(cur)}>{t("Spielen")}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
