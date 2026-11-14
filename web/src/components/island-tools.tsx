// New island tiles and areas (3.63): Zufall, Zähler, Countdown, Checkliste, Durchatmen, Stoppuhr, Schnell-Links, Akku dieses Geräts –
// and the areas "Werkzeuge", "Weltzeit" and "Listen". Everything works without the PC. Tile values are kept in the island layout (on the
// PC for every device, or on this device); the areas keep theirs on this device only.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BatteryCharging, BatteryMedium, Dices, ExternalLink, Flag, Minus, Pause, Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { readJson, writeJson } from "../lib/rpc";
import { opt, validZone, ZONES, type Tile } from "../lib/island-layout";
import { addItem, breathePhase, bump, clearDone, countdownParts, cryptoRand, parseChecklist, roll, safeLink, toggleItem, type DiceMode } from "../lib/island-tools";
import { useTimer, watchMs, watchReset, watchText, watchToggle } from "../lib/island-timer";
import type { TileCtx } from "./island-tiles";

type P = { tile: Tile; ctx: TileCtx; box: boolean };

// ------------------------------------------------------------------ tiles
export function DiceTile({ tile }: P) {
  const mode = opt<string>(tile, "mode") as DiceMode, max = opt<number>(tile, "max");
  const [res, setRes] = useState<{ text: string; n: number } | null>(null);
  const go = () => setRes((r) => ({ text: roll(mode, max, cryptoRand()).text, n: (r?.n ?? 0) + 1 }));
  const range = mode === "coin" ? t("Kopf oder Zahl") : mode === "d6" ? "1–6" : mode === "d20" ? "1–20" : `1–${max}`;
  return (
    <>
      <span className="isl3-grow" />
      <b key={res?.n} className="isl2-big isl3-dice">{res ? t(res.text) : "?"}</b>
      <span className="isl2-sub">{range}</span>
      <button type="button" className="isl2-chip accent" onClick={go}><Dices size={14} aria-hidden /> {mode === "coin" ? t("Werfen") : t("Würfeln")}</button>
    </>
  );
}

export function CounterTile({ tile, ctx }: P) {
  const name = opt<string>(tile, "name").trim() || t("Zähler");
  const saved = opt<number>(tile, "value"), step = opt<number>(tile, "step");
  const [v, setV] = useState(saved);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setV(saved), [saved]);
  const change = (by: number) => {
    const n = bump(v, by);
    setV(n);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => ctx.setOpt(tile.id, "value", n), 500); // fast taps are saved once
  };
  return (
    <>
      <span className="isl2-sub ellipsis">{name}</span>
      <b className="isl2-big isl3-count" aria-live="polite">{v}</b>
      <span className="isl3-cbtns">
        <button type="button" className="isl2-round" onClick={() => change(-step)} aria-label={t("{n} verringern", { n: name })}><Minus size={16} /></button>
        <button type="button" className="isl2-round big" onClick={() => change(step)} aria-label={t("{n} erhöhen", { n: name })}><Plus size={18} /></button>
        <button type="button" className="isl2-round sm" onClick={() => { setV(0); ctx.setOpt(tile.id, "value", 0); }} aria-label={t("{n} zurücksetzen", { n: name })}><RotateCcw size={13} /></button>
      </span>
    </>
  );
}

export function CountdownTile({ tile, ctx }: P) {
  const name = opt<string>(tile, "name").trim(), date = opt<string>(tile, "date"), time = opt<string>(tile, "time");
  const c = countdownParts(date, time, ctx.now);
  if (!c) return (
    <>
      <span className="isl3-grow" />
      <b className="isl2-big">{name || t("Countdown")}</b>
      <span className="isl2-sub">{t("Datum in den Einstellungen der Kachel eintragen (Zahnrad beim Bearbeiten).")}</span>
    </>
  );
  return (
    <>
      <span className="isl2-sub ellipsis">{name || c.at.toLocaleDateString()}</span>
      <span className="isl3-grow" />
      <b className="isl2-big isl3-cd">{c.past ? t("vorbei") : c.days > 0 ? t("{d} T {h} Std", { d: c.days, h: c.hours }) : t("{h} Std {m} Min", { h: c.hours, m: c.minutes })}</b>
      <span className="isl2-sub">{c.at.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{time ? ` · ${time}` : ""}</span>
    </>
  );
}

export function ChecklistTile({ tile, ctx }: P) {
  const saved = opt<string>(tile, "items");
  const [s, setS] = useState(saved);
  const [draft, setDraft] = useState("");
  useEffect(() => setS(saved), [saved]);
  const save = (x: string) => { setS(x); ctx.setOpt(tile.id, "items", x); };
  const items = parseChecklist(s);
  const done = items.filter((i) => i.done).length;
  return (
    <div className="isl3-check">
      <span className="isl2-sub">{opt<string>(tile, "name").trim() || t("Checkliste")} · {done}/{items.length}</span>
      <ul>
        {items.map((it, i) => (
          <li key={i}><label><input type="checkbox" checked={it.done} onChange={() => save(toggleItem(s, i))} /><span className={it.done ? "done" : ""}>{it.text}</span></label></li>
        ))}
      </ul>
      <form className="isl3-addrow" onSubmit={(e) => { e.preventDefault(); save(addItem(s, draft)); setDraft(""); }}>
        <input className="input" value={draft} maxLength={60} placeholder={t("Neuer Eintrag …")} aria-label={t("Neuer Eintrag")} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className="isl3-mini" disabled={!draft.trim()} aria-label={t("Hinzufügen")}><Plus size={14} /></button>
        {done > 0 && <button type="button" className="isl3-mini" onClick={() => save(clearDone(s))} aria-label={t("Erledigte entfernen")} title={t("Erledigte entfernen")}><Trash2 size={13} /></button>}
      </form>
    </div>
  );
}

/** A circle that grows while breathing in and shrinks while breathing out. Runs only while it is on screen. */
export function Breather({ pattern, big }: { pattern: string; big?: boolean }) {
  const [on, setOn] = useState(false);
  const start = useRef(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!on) return;
    start.current = performance.now();
    const id = window.setInterval(() => tick((x) => x + 1), 200);
    return () => window.clearInterval(id);
  }, [on]);
  const ph = on ? breathePhase(pattern, performance.now() - start.current) : null;
  return (
    <div className={`isl3-breathe${big ? " big" : ""}`}>
      <span className="isl3-bcircle" style={{ ["--b" as string]: ph ? ph.size : 0.15 } as CSSProperties} aria-hidden />
      <b className="isl3-bphase" aria-live="polite">{ph ? `${t(ph.label)} · ${ph.left}` : t("Bereit")}</b>
      <button type="button" className="isl2-chip" onClick={() => setOn((v) => !v)}>{on ? <><Pause size={13} aria-hidden /> {t("Stopp")}</> : <><Play size={13} aria-hidden /> {t("Start")}</>}</button>
    </div>
  );
}
export function BreatheTile({ tile }: P) { return <Breather pattern={opt<string>(tile, "pattern")} />; }

/** The island's one stopwatch (the same as in the focus area), with laps kept while the island is open. */
export function StopwatchView({ big }: { big?: boolean }) {
  const tm = useTimer();
  const running = tm.watchStart != null;
  const [now, setNow] = useState(Date.now());
  const [laps, setLaps] = useState<number[]>([]);
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id); }, [running]);
  const ms = watchMs(tm, running ? now : Date.now());
  return (
    <div className={`isl3-sw${big ? " big" : ""}`}>
      <b className="isl2-big isl2-time" aria-label={t("Stoppuhr")}>{watchText(ms)}</b>
      <span className="isl3-cbtns">
        <button type="button" className="isl2-round big" onClick={() => { setNow(Date.now()); watchToggle(); }} aria-label={running ? t("Anhalten") : t("Start")}>{running ? <Pause size={17} /> : <Play size={17} />}</button>
        <button type="button" className="isl2-round" disabled={!running} onClick={() => setLaps((l) => [ms, ...l].slice(0, 20))} aria-label={t("Runde")} title={t("Runde")}><Flag size={15} /></button>
        <button type="button" className="isl2-round" disabled={!running && ms === 0} onClick={() => { watchReset(); setLaps([]); }} aria-label={t("Zurücksetzen")}><RotateCcw size={15} /></button>
      </span>
      {laps.length > 0 && (
        <ol className="isl3-laps" aria-label={t("Runden")}>
          {laps.map((l, i) => <li key={laps.length - i}><span>{t("Runde {n}", { n: laps.length - i })}</span><b>{watchText(l - (laps[i + 1] ?? 0))}</b></li>)}
        </ol>
      )}
    </div>
  );
}
export function StopwatchTile() { return <StopwatchView />; }

export function LinksTile({ tile }: P) {
  const links = (["a", "b", "c"] as const).map((k) => safeLink(opt<string>(tile, k))).filter((x): x is { url: string; name: string } => !!x);
  if (!links.length) return <span className="isl2-sub">{t("Bis zu drei Webseiten in den Einstellungen der Kachel eintragen.")}</span>;
  return (
    <div className="isl3-links">
      {links.map((l) => <a key={l.url} className="isl2-chip" href={l.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} aria-hidden /> <span className="ellipsis">{l.name}</span></a>)}
    </div>
  );
}

type Battery = { level: number; charging: boolean } | "unsupported" | null;
interface BatteryManagerLike extends EventTarget { level: number; charging: boolean }
export function useDeviceBattery(): Battery {
  const [b, setB] = useState<Battery>(null);
  useEffect(() => {
    const get = (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery;
    if (!get) { setB("unsupported"); return; }
    let bm: BatteryManagerLike | null = null;
    const read = () => bm && setB({ level: bm.level, charging: bm.charging });
    get.call(navigator).then((x) => { bm = x; read(); x.addEventListener("levelchange", read); x.addEventListener("chargingchange", read); }, () => setB("unsupported"));
    return () => { bm?.removeEventListener("levelchange", read); bm?.removeEventListener("chargingchange", read); };
  }, []);
  return b;
}
export function DevBatteryTile() {
  const b = useDeviceBattery();
  if (b === "unsupported") return <span className="isl2-sub">{t("Dieser Browser zeigt den Akkustand nicht an (z. B. Safari auf iPhone und iPad).")}</span>;
  if (!b) return <span className="isl2-sub">…</span>;
  const pct = Math.round(b.level * 100);
  return (
    <>
      <span className={`isl2-art${b.charging ? " ok" : ""}`} aria-hidden>{b.charging ? <BatteryCharging size={22} /> : <BatteryMedium size={22} />}</span>
      <span className="isl3-grow" />
      <b className="isl2-big">{pct} %</b>
      <span className="isl2-sub">{b.charging ? t("Lädt") : t("Akku")}</span>
      <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${b.level})` }} /></span>
    </>
  );
}

// ------------------------------------------------------------------ areas (kept on this device)
function useLocal<T>(key: string, init: T, check: (v: unknown) => v is T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { const x = readJson(key); return check(x) ? x : init; });
  return [v, (n: T) => { setV(n); try { writeJson(key, n); } catch { /* storage blocked: only for this visit */ } }];
}
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length <= 300;
const isZones = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 8 && v.every((z) => typeof z === "string" && (z === "" || validZone(z)));

/** "Werkzeuge": dice, a counter, the stopwatch and breathing, side by side. */
export function ToolsArea() {
  const [res, setRes] = useState<string | null>(null);
  const [mode, setMode] = useState<DiceMode>("d6");
  const [count, setCount] = useLocal("pgl.island.tools.count", 0, isNum);
  return (
    <div className="isl3-area tools">
      <section className="isl3-acard">
        <span className="isl3-ahead">{t("Zufall")}</span>
        <b className="isl2-big isl3-dice" key={res ?? ""}>{res ? t(res) : "?"}</b>
        <div className="isl3-seg" role="radiogroup" aria-label={t("Art")}>
          {(["d6", "d20", "coin"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{m === "coin" ? t("Münze") : m.toUpperCase()}</button>)}
        </div>
        <button type="button" className="isl2-chip accent" onClick={() => setRes(roll(mode, 0, cryptoRand()).text)}><Dices size={14} aria-hidden /> {t("Los")}</button>
      </section>
      <section className="isl3-acard">
        <span className="isl3-ahead">{t("Zähler")}</span>
        <b className="isl2-big isl3-count">{count}</b>
        <span className="isl3-cbtns">
          <button type="button" className="isl2-round" onClick={() => setCount(bump(count, -1))} aria-label={t("Zähler verringern")}><Minus size={16} /></button>
          <button type="button" className="isl2-round big" onClick={() => setCount(bump(count, 1))} aria-label={t("Zähler erhöhen")}><Plus size={18} /></button>
          <button type="button" className="isl2-round sm" onClick={() => setCount(0)} aria-label={t("Zähler zurücksetzen")}><RotateCcw size={13} /></button>
        </span>
      </section>
      <section className="isl3-acard"><span className="isl3-ahead">{t("Stoppuhr")}</span><StopwatchView /></section>
      <section className="isl3-acard"><span className="isl3-ahead">{t("Durchatmen")}</span><Breather pattern="box" /></section>
    </div>
  );
}

/** "Weltzeit": up to six cities at a glance. */
export function WorldArea({ now }: { now: number }) {
  const [zones, setZones] = useLocal("pgl.island.world", ["", "Europe/London", "America/New_York", "Asia/Tokyo"], isZones);
  const [adding, setAdding] = useState(false);
  const d = new Date(now);
  const nameOf = (z: string) => t(ZONES.find((x) => x.id === z)?.label ?? z.split("/").pop()!.replace(/_/g, " "));
  return (
    <div className="isl3-area world">
      {zones.map((z) => {
        let time = "–", day = "", night = false;
        try {
          time = d.toLocaleTimeString("de-DE", { timeZone: z || undefined, hour: "2-digit", minute: "2-digit" });
          day = d.toLocaleDateString("de-DE", { timeZone: z || undefined, weekday: "short" });
          const h = Number(d.toLocaleString("en-US", { timeZone: z || undefined, hour: "numeric", hour12: false }));
          night = h < 6 || h >= 20;
        } catch { /* unknown zone: dash */ }
        return (
          <section key={z || "here"} className={`isl3-acard wclock${night ? " night" : ""}`}>
            <span className="isl3-ahead">{nameOf(z)}</span>
            <b className="isl2-big">{time}</b>
            <span className="isl2-sub">{day}{night ? ` · ${t("Nacht")}` : ""}</span>
            {zones.length > 1 && <button type="button" className="isl3-mini rm" onClick={() => setZones(zones.filter((x) => x !== z))} aria-label={t("{n} entfernen", { n: nameOf(z) })}><X size={13} /></button>}
          </section>
        );
      })}
      {zones.length < 6 && (adding ? (
        <section className="isl3-acard">
          <span className="isl3-ahead">{t("Stadt hinzufügen")}</span>
          <select className="input" aria-label={t("Stadt")} defaultValue="" onChange={(e) => { if (e.target.value && !zones.includes(e.target.value)) setZones([...zones, e.target.value]); setAdding(false); }}>
            <option value="">{t("Bitte wählen …")}</option>
            {ZONES.filter((z) => z.id && !zones.includes(z.id)).map((z) => <option key={z.id} value={z.id}>{t(z.label)}</option>)}
          </select>
        </section>
      ) : <button type="button" className="isl3-addtile" onClick={() => setAdding(true)} aria-label={t("Stadt hinzufügen")}><Plus size={20} /><span>{t("Stadt")}</span></button>)}
    </div>
  );
}

/** "Listen": three small lists (e.g. To-do, Einkauf, Spiele für später) kept on this device. */
export function ListsArea() {
  const NAMES = ["To-do", "Spiele für später", "Einkauf"];
  const [lists, setLists] = useLocal<string[]>("pgl.island.lists", ["", "", ""], (v): v is string[] => Array.isArray(v) && v.length === 3 && v.every(isStr));
  const [drafts, setDrafts] = useState(["", "", ""]);
  const set = (i: number, s: string) => setLists(lists.map((x, j) => (j === i ? s : x)));
  return (
    <div className="isl3-area lists">
      {lists.map((s, i) => {
        const items = parseChecklist(s);
        return (
          <section key={i} className="isl3-acard isl3-check">
            <span className="isl3-ahead">{t(NAMES[i])} · {items.filter((x) => x.done).length}/{items.length}</span>
            <ul>{items.map((it, k) => <li key={k}><label><input type="checkbox" checked={it.done} onChange={() => set(i, toggleItem(s, k))} /><span className={it.done ? "done" : ""}>{it.text}</span></label></li>)}</ul>
            <form className="isl3-addrow" onSubmit={(e) => { e.preventDefault(); set(i, addItem(s, drafts[i])); setDrafts(drafts.map((x, j) => (j === i ? "" : x))); }}>
              <input className="input" value={drafts[i]} maxLength={60} placeholder={t("Neuer Eintrag …")} aria-label={t("Neuer Eintrag in {n}", { n: t(NAMES[i]) })} onChange={(e) => setDrafts(drafts.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="submit" className="isl3-mini" disabled={!drafts[i].trim()} aria-label={t("Hinzufügen")}><Plus size={14} /></button>
              {items.some((x) => x.done) && <button type="button" className="isl3-mini" onClick={() => set(i, clearDone(s))} aria-label={t("Erledigte entfernen")}><Trash2 size={13} /></button>}
            </form>
          </section>
        );
      })}
      <p className="tiny muted isl3-anote">{useMemo(() => t("Die Listen bleiben auf diesem Gerät."), [])}</p>
    </div>
  );
}
