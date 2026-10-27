// The playable bingo field – used on the bingo page, in the assistant chat, as home widget and in the PC overlay.
// Ticks are saved as a journal entry (this device, then the PC and every device connected to it).

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Compass, Hammer, Package, PartyPopper, Shield, Smile, Sparkles, Swords, Target, Timer, TrendingUp, Trophy, Users } from "lucide-react";
import { t } from "../lib/i18n";
import { useJournal, type Entry } from "../lib/journal";
import { CATEGORY_LABEL, LEVEL_LABEL, progress, standings, toggleCell, type Card, type Category } from "../lib/bingo";
import { activeCardId, setActiveCard } from "../lib/bingo-make";
import { trySave } from "./journal-ui";

export const CAT_ICON: Record<Category, ReactNode> = {
  explore: <Compass size={15} />, combat: <Swords size={15} />, collect: <Package size={15} />, build: <Hammer size={15} />, team: <Users size={15} />,
  fun: <Smile size={15} />, challenge: <Target size={15} />, progress: <TrendingUp size={15} />, survival: <Shield size={15} />,
};

const FX_KEY = "pgl.bingo.fx";
export function fxOn() {
  try { if (localStorage.getItem(FX_KEY) === "off") return false; } catch { /* storage blocked */ }
  return !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}
export function setFx(on: boolean) { try { localStorage.setItem(FX_KEY, on ? "on" : "off"); } catch { /* storage blocked */ } }

const Cell = memo(function Cell({ text, done, free, inLine, level, category, who, onClick, compact }: { text: string; done: boolean; free?: boolean; inLine: boolean; level?: number; category?: Category; who?: string; onClick?: () => void; compact?: boolean }) {
  return (
    <button type="button" role="gridcell" aria-pressed={done} disabled={!onClick || free} onClick={onClick}
      aria-label={free ? t("Freies Feld") : `${text}${level ? ` – ${t(LEVEL_LABEL[level as 1])}` : ""}${done ? ` – ${t("erledigt")}` : ""}`}
      className={`bingo-cell ${done ? "done" : ""} ${free ? "free" : ""} ${inLine ? "line" : ""} ${compact ? "compact" : ""}`}>
      {!compact && category && <span className="bingo-cat" aria-hidden>{CAT_ICON[category]}</span>}
      <span className="bingo-text">{free ? t("Frei") : text}</span>
      {!compact && level && !free && <span className={`bingo-level l${level}`} aria-hidden />}
      {done && !free && <Check size={compact ? 11 : 15} className="bingo-check" aria-hidden />}
      {who && !compact && <span className="bingo-who">{who}</span>}
    </button>
  );
});

/** Celebration: a short CSS animation (no library); off when the user turned it off or prefers less motion. */
function Celebrate({ full, onDone }: { full: boolean; onDone: () => void }) {
  useEffect(() => { const id = window.setTimeout(onDone, full ? 4200 : 2600); return () => clearTimeout(id); }, [full, onDone]);
  const bits = useMemo(() => Array.from({ length: full ? 36 : 20 }, (_, i) => ({ left: (i * 37) % 100, delay: (i % 7) * 0.12, hue: (i * 47) % 360 })), [full]);
  return (
    <div className="bingo-celebrate" role="status" onClick={onDone}>
      {bits.map((b, i) => <span key={i} className="bingo-confetti" style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, background: `hsl(${b.hue} 90% 60%)` }} />)}
      <div className="bingo-celebrate-text">{full ? <Trophy size={44} /> : <PartyPopper size={40} />}<b>BINGO!</b><span>{full ? t("Alle Aufgaben erledigt!") : t("Reihe geschafft!")}</span></div>
    </div>
  );
}

function Countdown({ card }: { card: Card }) {
  const [now, setNow] = useState(Date.now());
  const end = card.startedAt && card.timeLimitMin ? Date.parse(card.startedAt) + card.timeLimitMin * 60000 : null;
  useEffect(() => { if (!end || card.finishedAt) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [end, card.finishedAt]);
  if (!card.timeLimitMin) return null;
  if (!end) return <span className="badge"><Timer size={13} /> {t("{n} Min. – startet mit dem ersten Häkchen", { n: card.timeLimitMin })}</span>;
  const left = Math.max(0, end - now);
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return <span className={`badge ${left === 0 ? "danger" : left < 60000 ? "warn" : "accent"}`}><Timer size={13} /> {left === 0 ? t("Zeit abgelaufen") : `${mm}:${String(ss).padStart(2, "0")}`}</span>;
}

/**
 * Field, progress and players for one card. `player` marks for this player (several players); everyone else
 * just taps. `compact` = widget/overlay size.
 */
export function BingoBoard({ e, compact, player, onPlayer, readOnly }: { e: Entry<Card>; compact?: boolean; player?: string; onPlayer?: (p: string) => void; readOnly?: boolean }) {
  const card = e.data;
  const players = card.players?.length ? card.players : ["Ich"];
  const [own, setOwn] = useState(players[0]);
  const chosen = player ?? own;
  const me = players.includes(chosen) ? chosen : players[0];
  const pick = onPlayer ?? setOwn;
  const versus = card.multi === "versus";
  const p = progress(card, versus ? me : undefined);
  const inLine = useMemo(() => new Set(p.lines.flatMap((l) => l.cells)), [p.lines]);
  const [party, setParty] = useState<null | "line" | "full">(null);
  const before = useRef({ lines: p.lines.length, complete: p.complete });
  const toggle = (i: number) => {
    const next = toggleCell(card, i, me);
    if (!trySave("bingo", e.id, next)) return;
    const q = progress(next, versus ? me : undefined);
    if (fxOn()) { if (q.complete && !before.current.complete) setParty("full"); else if (q.lines.length > before.current.lines) setParty("line"); }
    before.current = { lines: q.lines.length, complete: q.complete };
  };
  useEffect(() => { before.current = { lines: p.lines.length, complete: p.complete }; }, [e.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineText = p.lines.map((l) => l.kind === "row" ? t("Reihe {n}", { n: l.index + 1 }) : l.kind === "col" ? t("Spalte {n}", { n: l.index + 1 }) : l.index === 0 ? t("Diagonale ↘") : t("Diagonale ↙")).join(", ");
  return (
    <div className={`bingo-board ${compact ? "compact" : ""}`}>
      {players.length > 1 && (
        <div className="chips" role="radiogroup" aria-label={t("Wer hakt ab?")}>
          {players.map((pl) => <button key={pl} type="button" role="radio" aria-checked={pl === me} className={`chip ${pl === me ? "on" : ""}`} onClick={() => pick(pl)}>{pl}</button>)}
        </div>
      )}
      <div className="bingo-progress" aria-label={t("Fortschritt")}>
        <div className="row between small"><span>{t("{n} von {m} erledigt", { n: p.done, m: p.total })}{!compact && ` · ${t("{n} offen", { n: p.left })}`}</span><b>{p.percent} %</b></div>
        <div className="bingo-bar"><span style={{ width: `${p.percent}%` }} /></div>
      </div>
      <div className="bingo-grid" role="grid" aria-label={card.title} style={{ gridTemplateColumns: `repeat(${card.size}, minmax(0, 1fr))` }}>
        {card.cells.map((c, i) => {
          const done = versus ? !!c.free || !!c.doneBy?.includes(me) : !!c.done || !!c.free;
          const who = !versus && players.length > 1 && c.done && c.doneBy?.length ? c.doneBy.join(", ") : undefined;
          return <Cell key={i} text={c.text} done={done} free={c.free} inLine={inLine.has(i)} level={c.level} category={c.category} who={who} compact={compact} onClick={readOnly ? undefined : () => toggle(i)} />;
        })}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Countdown card={card} />
        {p.lines.length > 0 && <span className="badge ok"><Sparkles size={13} /> {compact ? t("{n} × Bingo", { n: p.lines.length }) : `${t("Bingo")}: ${lineText}`}</span>}
      </div>
      {versus && !compact && (
        <div className="bingo-standings">
          {standings(card).map((s, i) => <div key={s.player} className="row between small"><span>{i + 1}. {s.player}</span><span>{t("{n} Felder", { n: s.done })} · {t("{n} × Bingo", { n: s.lines.length })}{s.complete ? " · " + t("Alles!") : ""}</span></div>)}
        </div>
      )}
      {party && <Celebrate full={party === "full"} onDone={() => setParty(null)} />}
    </div>
  );
}

/** Home widget and overlay: the active card, tap to tick – no need to open the app. */
export function BingoWidget() {
  const cards = useJournal<Card>("bingo");
  const [, force] = useState(0);
  const id = activeCardId();
  const cur = cards.find((c) => c.id === id);
  if (!cur) return <div className="small muted">{t("Kein laufendes Bingo.")} <Link to="/play?tab=bingo">{t("Bingo erstellen")}</Link></div>;
  const open = cards.filter((c) => !c.data.finishedAt || c.id === cur.id);
  return (
    <div className="stack-sm">
      {open.length > 1 && (
        <select className="input" aria-label={t("Bingo wählen")} value={cur.id} onChange={(ev) => { setActiveCard(ev.target.value); force((x) => x + 1); }}>
          {open.map((c) => <option key={c.id} value={c.id}>{c.data.title}</option>)}
        </select>
      )}
      {open.length <= 1 && <b className="small ellipsis">{cur.data.title}</b>}
      <BingoBoard e={cur} compact />
      <Link className="tiny" to={`/play?tab=bingo&id=${cur.id}`}>{t("Ganzes Bingo öffnen")}</Link>
    </div>
  );
}

export const CATEGORY_TEXT = (c: Category) => t(CATEGORY_LABEL[c]);
