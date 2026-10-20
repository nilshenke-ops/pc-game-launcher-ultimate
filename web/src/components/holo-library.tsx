// Holo view of the game library: a turning showcase with the chosen game big in the middle and its real data below
// (play time and last start only from the PC's history). Only the cards near the middle are drawn, so it stays fast
// with thousands of games. Arrow keys, swipe, mouse wheel, the slider or a tap on a side card move it.
import { useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Loader2, MoreVertical, Play, Star } from "lucide-react";
import { t } from "../lib/i18n";
import { gradientFor, initials, relTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { Button } from "./ui";

const WINDOW = 4;

export interface HoloInfo { minutes?: number; lastPlayed?: number }

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
  const go = (n: number) => { const it = items[Math.max(0, Math.min(items.length - 1, n))]; if (it) setCurId(it.id); };
  const start = useRef<{ x: number; id: number } | null>(null);
  const swipedAt = useRef(0);
  const wheelAt = useRef(0);

  if (!items.length) return null;
  const cur = items[i];
  const meta = info.get(cur.id);
  const lo = Math.max(0, i - WINDOW), hi = Math.min(items.length - 1, i + WINDOW);
  const shown: number[] = [];
  for (let k = lo; k <= hi; k++) shown.push(k);

  return (
    <div className="holo" tabIndex={0} role="region" aria-roledescription={t("Karussell")} aria-label={t("Holo-Ansicht: {n} von {m}", { n: i + 1, m: items.length })}
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
        onPointerDown={(e) => { start.current = { x: e.clientX, id: e.pointerId }; }}
        onPointerUp={(e) => { const s = start.current; start.current = null; if (s && s.id === e.pointerId && Math.abs(e.clientX - s.x) > 40) { swipedAt.current = Date.now(); go(i + (e.clientX < s.x ? 1 : -1)); } }}>
        {shown.map((k) => {
          const it = items[k], off = k - i, a = Math.abs(off);
          const style = { "--off": off, "--abs": a, zIndex: 20 - a, opacity: a > 3 ? 0 : 1 - a * 0.22 } as CSSProperties;
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
      <div className="holo-panel" aria-live="polite">
        <div className="row between" style={{ gap: 8, alignItems: "flex-start" }}>
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
