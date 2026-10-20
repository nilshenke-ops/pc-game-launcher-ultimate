// More widgets for the home screen and the in-game overlay. Everything shows real data (from the PC or this device);
// widgets that only need this device keep working without the PC.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Dices, Minus, Play, Plus, RotateCcw } from "lucide-react";
import { client, readJson, writeJson } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useNow, useRpc } from "../lib/hooks";
import { duration } from "../lib/format";
import { useAppState } from "../lib/state";
import { money } from "../lib/quest-deal";
import type { LibraryItem } from "../lib/types";
import { Button, confirmDialog, Meter } from "./ui";
import { useNetworkHistory } from "./MonitorExtras";

// ---------------------------------------------------------------- counter (deaths, tries, kills …) – this device only

interface Counter { name: string; value: number }
const COUNTER_KEY = "pgl.widget.counters";

export function CounterWidget() {
  const [list, setList] = useState<Counter[]>(() => readJson<Counter[]>(COUNTER_KEY) ?? [{ name: t("Tode"), value: 0 }, { name: t("Versuche"), value: 0 }]);
  useEffect(() => writeJson(COUNTER_KEY, list), [list]);
  const change = (i: number, d: number) => { navigator.vibrate?.(8); setList(list.map((c, j) => (j === i ? { ...c, value: Math.max(0, c.value + d) } : c))); };
  const rename = (i: number) => { const n = window.prompt(t("Name des Zählers"), list[i].name); if (n && n.trim()) setList(list.map((c, j) => (j === i ? { ...c, name: n.trim().slice(0, 20) } : c))); };
  return (
    <div className="stack-xs">
      {list.map((c, i) => (
        <div key={i} className="counter-row">
          <button type="button" className="counter-name" onClick={() => rename(i)} title={t("Umbenennen")}>{c.name}</button>
          <button type="button" className="counter-btn" aria-label={t("{n} minus 1", { n: c.name })} onClick={() => change(i, -1)}><Minus size={16} /></button>
          <b className="counter-value" aria-live="polite">{c.value}</b>
          <button type="button" className="counter-btn plus" aria-label={t("{n} plus 1", { n: c.name })} onClick={() => change(i, 1)}><Plus size={16} /></button>
        </div>
      ))}
      <div className="row" style={{ gap: 6 }}>
        {list.length < 4 && <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setList([...list, { name: t("Zähler {n}", { n: list.length + 1 }), value: 0 }])}>{t("Zähler")}</Button>}
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setList(list.map((c) => ({ ...c, value: 0 })))}>{t("Alle auf 0")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- break reminder

const BREAK_KEY = "pgl.widget.break";

/** Reminds you to take a break every N minutes while a game runs (or since you pressed start). Vibrates on phones. */
export function BreakWidget() {
  const { state } = useAppState();
  const now = useNow(15000);
  const [cfg, setCfg] = useState<{ every: number; manualStart: number | null }>(() => readJson(BREAK_KEY) ?? { every: 60, manualStart: null });
  useEffect(() => writeJson(BREAK_KEY, cfg), [cfg]);
  const game = state?.running?.[0];
  const since = game ? Date.parse(game.since) : cfg.manualStart;
  const minutes = since ? Math.max(0, Math.floor((now - since) / 60000)) : null;
  const due = minutes != null && minutes >= cfg.every;
  const warned = useRef(-1);
  useEffect(() => {
    if (minutes == null || !due) return;
    const slot = Math.floor(minutes / cfg.every);
    if (warned.current !== slot) { warned.current = slot; navigator.vibrate?.([300, 150, 300]); }
  }, [minutes, due, cfg.every]);
  return (
    <div className="stack-xs" style={{ alignItems: "center", textAlign: "center" }}>
      {minutes == null ? <span className="small muted">{t("Kein Spiel läuft.")}</span> : (
        <>
          <span className="home-time" style={{ color: due ? "var(--warning, #fbbf24)" : undefined }}>{duration(minutes)}</span>
          <span className="small">{due ? t("Zeit für eine kurze Pause – Augen und Hände entspannen.") : t("Pause in {n} min", { n: cfg.every - (minutes % cfg.every) })}</span>
          {game && <span className="tiny muted">{game.name}</span>}
        </>
      )}
      <div className="chips" style={{ justifyContent: "center" }}>
        {[30, 45, 60, 90].map((m) => <button key={m} type="button" className={`chip ${cfg.every === m ? "on" : ""}`} onClick={() => setCfg({ ...cfg, every: m })}>{m} min</button>)}
      </div>
      {!game && <Button size="sm" onClick={() => setCfg({ ...cfg, manualStart: cfg.manualStart ? null : Date.now() })}>{cfg.manualStart ? t("Stopp") : t("Jetzt starten")}</Button>}
    </div>
  );
}

// ---------------------------------------------------------------- play time today / this week

interface HistorySessions { sessions: { itemId: string; name: string; startedAt: string; endedAt?: string | null; minutes: number }[] }

export function minutesSince(sessions: HistorySessions["sessions"], from: number, now: number) {
  return sessions.reduce((sum, s) => {
    const a = Math.max(Date.parse(s.startedAt), from);
    const b = s.endedAt ? Date.parse(s.endedAt) : now;
    return b > a ? sum + (b - a) / 60000 : sum;
  }, 0);
}

export function TodayWidget() {
  const q = useRpc<HistorySessions>("history.get", {}, ["history"]);
  const now = useNow(60000);
  if (!q.data) return <span className="small muted">{q.error ? t("Braucht einmal den PC (Gaming-Verlauf).") : "…"}</span>;
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  const today = minutesSince(q.data.sessions, d.getTime(), now);
  const w = new Date(d); w.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const week = minutesSince(q.data.sessions, w.getTime(), now);
  return (
    <div className="stack-xs">
      <div className="row between"><span className="small muted">{t("Heute")}</span><b>{duration(Math.round(today))}</b></div>
      <div className="row between"><span className="small muted">{t("Diese Woche")}</span><b>{duration(Math.round(week))}</b></div>
      {q.stale && <span className="tiny muted">{t("Stand vom letzten Verbinden")}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- ping

export function PingWidget() {
  const conn = useConn();
  if (conn.phase !== "online" || conn.auth !== "ok") return <span className="small muted">{t("Ping misst der PC – braucht die Verbindung.")}</span>;
  return <PingLive />;
}

function PingLive() {
  const { hist, err } = useNetworkHistory();
  if (err) return <span className="small muted">{err}</span>;
  if (!hist) return <span className="small muted">…</span>;
  return (
    <div className="stack-xs">
      {hist.slice(0, 3).map((h) => {
        const last = [...h.points].reverse().find((p) => p.ms != null)?.ms;
        const bad = (h.lossPercent ?? 0) > 2 || (last ?? 0) > 80;
        return (
          <div key={h.id} className="row between">
            <span className="small ellipsis">{h.label}</span>
            <b style={{ color: bad ? "var(--danger)" : undefined }}>{last != null ? `${Math.round(last)} ms` : "–"}{(h.lossPercent ?? 0) > 0 ? ` · ${Math.round(h.lossPercent!)} % ${t("Verlust")}` : ""}</b>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- GameQuest goals and level

interface QuestLite { xp: number; level: number; levelFrom: number; levelTo: number; goals: { id: string; title: string; target: number; value?: number | null; done?: boolean; active: boolean }[] }

export function GoalsWidget() {
  const q = useRpc<QuestLite>("quests.get", {}, ["quests", "history"]);
  const goals = (q.data?.goals ?? []).filter((g) => g.active).slice(0, 4);
  if (!q.data) return <span className="small muted">…</span>;
  if (!goals.length) return <span className="small muted">{t("Keine aktiven Ziele.")} <Link to="/quests">{t("Ziel anlegen")}</Link></span>;
  return (
    <div className="stack-xs">
      {goals.map((g) => (
        <div key={g.id} className="stack-xs">
          <div className="row between small"><span className="ellipsis">{g.done ? "✓ " : ""}{g.title}</span><span className="muted">{Math.round(g.value ?? 0)}/{g.target}</span></div>
          <Meter value={Math.min(g.target, g.value ?? 0)} max={g.target} />
        </div>
      ))}
    </div>
  );
}

export function LevelWidget() {
  const q = useRpc<QuestLite>("quests.get", {}, ["quests", "history"]);
  if (!q.data) return <span className="small muted">…</span>;
  const d = q.data;
  return (
    <Link to="/trophies" className="stack-xs" style={{ color: "inherit", textDecoration: "none" }}>
      <div className="row between"><b>{t("Level {n}", { n: d.level })}</b><span className="small muted">{d.xp} XP</span></div>
      <Meter value={d.xp - d.levelFrom} max={Math.max(1, d.levelTo - d.levelFrom)} />
      <span className="tiny muted">{t("noch {n} XP bis Level {l}", { n: Math.max(0, d.levelTo - d.xp), l: d.level + 1 })}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- deals at target

interface DealLite { items: { id: string; title: string; targetCents?: number | null; finalCents?: number | null; currency?: string | null; discountPercent?: number | null; msFinalCents?: number | null; msCurrency?: string | null }[] }

export function DealsWidget() {
  const q = useRpc<DealLite>("deals.list", {}, ["deals"]);
  if (!q.data) return <span className="small muted">…</span>;
  const best = (w: DealLite["items"][number]) => Math.min(w.finalCents ?? Infinity, w.msCurrency === w.currency || w.finalCents == null ? w.msFinalCents ?? Infinity : Infinity);
  const items = [...q.data.items].filter((w) => isFinite(best(w)))
    .sort((a, b) => Number(b.targetCents != null && best(b) <= b.targetCents) - Number(a.targetCents != null && best(a) <= a.targetCents) || (b.discountPercent ?? 0) - (a.discountPercent ?? 0)).slice(0, 4);
  if (!items.length) return <span className="small muted">{t("Noch keine Preise.")} <Link to="/deals">{t("Deal Radar")}</Link></span>;
  return (
    <div className="stack-xs">
      {items.map((w) => {
        const hit = w.targetCents != null && best(w) <= w.targetCents;
        return (
          <Link key={w.id} to="/deals" className="row between small" style={{ color: "inherit", textDecoration: "none" }}>
            <span className="ellipsis">{hit ? "🎯 " : ""}{w.title}</span>
            <b style={{ color: hit ? "var(--success)" : undefined }}>{money(best(w), w.currency ?? w.msCurrency)}{w.discountPercent ? ` −${w.discountPercent} %` : ""}</b>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- controller battery

export function ControllerWidget() {
  const conn = useConn();
  const q = useRpc<{ supported: boolean; controllers: { index: number; connected: boolean; battery: string }[] }>("controllers.list", {}, []);
  useEffect(() => { if (conn.auth !== "ok") return; const id = window.setInterval(() => document.visibilityState === "visible" && q.reload(), 60000); return () => clearInterval(id); }, [conn.auth, q.reload]);
  if (!q.data) return <span className="small muted">…</span>;
  if (!q.data.supported) return <span className="small muted">{t("Controller erkennt nur der Windows-Begleiter.")}</span>;
  const list = q.data.controllers.filter((c) => c.connected);
  if (!list.length) return <span className="small muted">{t("Kein Controller verbunden.")}</span>;
  return <div className="stack-xs">{list.map((c) => <div key={c.index} className="row between small"><span>{t("Controller {n}", { n: c.index + 1 })}</span><b>{c.battery}</b></div>)}</div>;
}

// ---------------------------------------------------------------- random game

export function RandomGameWidget() {
  const q = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const conn = useConn();
  const canLaunch = useCan("launch");
  const games = useMemo(() => (q.data?.items ?? []).filter((i) => i.kind === "game"), [q.data]);
  const [pick, setPick] = useState<string | null>(null);
  const roll = () => { if (!games.length) return; navigator.vibrate?.(10); let g = games[Math.floor(Math.random() * games.length)]; if (games.length > 1) while (g.id === pick) g = games[Math.floor(Math.random() * games.length)]; setPick(g.id); };
  const game = games.find((g) => g.id === pick);
  const start = async () => {
    if (!game) return;
    if (!(await confirmDialog(t("{n} starten?", { n: game.name }), t("Das Spiel startet am PC."), { ok: t("Starten") }))) return;
    client.call("library.launch", { id: game.id }).then(() => toast(t("{name} wird gestartet", { name: game.name }), "success"), (e: Error) => toast(e.message, "error"));
  };
  if (!q.data) return <span className="small muted">…</span>;
  if (!games.length) return <span className="small muted">{t("Noch keine Spiele in der Bibliothek.")}</span>;
  return (
    <div className="stack-xs" style={{ alignItems: "center", textAlign: "center" }}>
      <b className="ellipsis" style={{ maxWidth: "100%", fontSize: "1.1rem" }}>{game ? game.name : t("Was spiele ich?")}</b>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" icon={<Dices size={15} />} onClick={roll}>{game ? t("Nochmal") : t("Würfeln")}</Button>
        {game && canLaunch && conn.auth === "ok" && conn.phase === "online" && <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => void start()}>{t("Starten")}</Button>}
      </div>
    </div>
  );
}
