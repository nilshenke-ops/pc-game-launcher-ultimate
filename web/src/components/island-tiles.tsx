// Tiles of the JARVIS island (3.57): every kind can lie on the start page (tall cards) or the overview (boxes), each with its own
// settings. The editing parts (catalog, settings form, areas list) are used inside the island and on the island settings page.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown, ArrowUp, BatteryCharging, BatteryMedium, CalendarDays, ChevronLeft, ChevronRight, Clock3, CloudSun, Cpu, Gamepad2, LayoutGrid,
  MessageCircle, Minus, Monitor, Music, Network, Pause, Play, Plus, Settings2, SkipBack, SkipForward, StickyNote, Sun, Timer, Volume2, VolumeX, X,
  Dices, Hash, Hourglass, ListChecks, Wind, Watch, Link2, Smartphone, Search, LayoutList, Grid2x2, Rows3,
} from "lucide-react";
import { BreatheTile, ChecklistTile, CountdownTile, CounterTile, DevBatteryTile, DiceTile, LinksTile, StopwatchTile } from "./island-tools";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast } from "../lib/hooks";
import { clock, MOOD_LABEL, type Mood } from "../lib/island";
import { addCountdown, countdownView, pauseCountdown, resumeCountdown, startCountdown, stopCountdown, useTimer } from "../lib/island-timer";
import { isoWeek, weekStrip } from "../lib/island-dash";
import { weatherText } from "../lib/weather";
import { nowPosition, nowSub, songTime, type NowPlaying } from "../lib/now-playing";
import { speedText } from "../lib/island-lyrics";
import { ALL_TABS, catalog, moveTab, NEW_TABS, opt, sortTabs, tileDef, TILE_CATS, TILE_VIEWS, ZONES, type IslandTab, type OptDef, type OptValue, type Tile, type TileCat, type TileSort, type TileType, type TileView } from "../lib/island-layout";
import { Spark, speedCurve, useNetSpeed, useWeatherAt, WeatherIcon, type MetricsHistory, type PcControls, type useIslandWeather } from "./island-extra";
import { sparkPoints } from "../lib/island-dash";

export const TILE_ICON: Record<TileType, typeof Music> = {
  jarvis: MessageCircle, game: Gamepad2, music: Music, focus: Timer, pc: Monitor, calendar: CalendarDays, weather: CloudSun, system: Cpu,
  volume: Volume2, network: Network, battery: BatteryMedium, clock: Clock3, note: StickyNote,
  dice: Dices, counter: Hash, countdown: Hourglass, checklist: ListChecks, breathe: Wind, stopwatch: Watch, links: Link2, devbattery: Smartphone,
};
export const TAB_LABEL: Record<IslandTab, string> = {
  home: "Home", dash: "Übersicht", game: "Spiel", music: "Musik", jarvis: "JARVIS", focus: "Fokus", inbox: "Meldungen", apps: "Apps",
  controls: "Regler", audio: "Audio", system: "System", pc: "PC", note: "Notiz", shelf: "Ablage", tools: "Werkzeuge", world: "Weltzeit", lists: "Listen",
};

/** Everything a tile may need from the island around it. */
export interface TileCtx {
  online: boolean; now: number; canUse: boolean;
  open: (tab: IslandTab) => void;
  mood: Mood; last: string | null;
  np: NowPlaying | null | undefined; media: (key: string) => void; accent?: CSSProperties;
  game: { name: string; since: number; cover?: string; style?: CSSProperties; logo?: ReactNode } | null;
  controls: { data?: PcControls; reload: () => void };
  weather: ReturnType<typeof useIslandWeather>;
  metrics: MetricsHistory;
  pc: { title: string; sub: string; action?: ReactNode };
  setOpt: (id: string, key: string, value: OptValue) => void;
  /** Opens the list of programs that use the most memory or processor. */
  procs?: (k: "ram" | "cpu") => void;
}
type P = { tile: Tile; ctx: TileCtx; box: boolean };

// ------------------------------------------------------------------ the tiles
function CalendarTile({ tile, ctx, box }: P) {
  const d = new Date(ctx.now);
  const kw = opt<boolean>(tile, "kw"), week = opt<boolean>(tile, "week");
  return (
    <>
      <div className="isl3-calhead">
        <b className="isl3-daynum">{d.getDate()}</b>
        <span className="isl3-dayname"><b>{d.toLocaleDateString([], { weekday: "short" }).replace(".", "")}</b><span>{d.toLocaleDateString([], { month: "short" }).replace(".", "")}</span></span>
        {kw && <span className="isl3-kw">{t("KW {n}", { n: isoWeek(d) })}</span>}
      </div>
      {week && (
        <div className={`isl3-week${box ? "" : " slim"}`} role="list">
          {weekStrip(d).map((x) => (
            <span key={x.date.toISOString()} role="listitem" className={x.today ? "today" : ""} aria-current={x.today ? "date" : undefined}>
              <i>{x.date.toLocaleDateString([], { weekday: "narrow" })}</i><b>{x.day}</b>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function FocusTile({ tile, ctx, box }: P) {
  const tm = useTimer();
  const view = countdownView(tm, ctx.now);
  const base = opt<number>(tile, "minutes");
  const [preset, setPreset] = useState(base);
  useEffect(() => setPreset(base), [base]);
  const go = () => (view ? (view.paused ? resumeCountdown() : pauseCountdown()) : startCountdown(preset));
  const label = view ? (view.paused ? t("Fortsetzen") : t("Pausieren")) : t("Fokus starten");
  if (!box) return (
    <>
      <b className="isl2-big isl2-time">{view ? clock(view.left) : `${preset}:00`}</b>
      <span className="isl2-sub">{view ? (view.paused ? t("Pausiert") : t("Läuft")) : t("Bereit zu starten")}</span>
      {view && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${view.progress})` }} /></span>}
      <button type="button" className="isl2-round" onClick={go} aria-label={label}>{view && !view.paused ? <Pause size={16} /> : <Play size={16} />}</button>
    </>
  );
  return (
    <div className="isl3-focusin">
      <span className="isl3-ring" style={{ ["--p" as string]: view ? view.progress : 0 } as CSSProperties}><b>{view ? clock(view.left) : `${preset}:00`}</b></span>
      <div className="isl3-ftext">
        <span className="isl2-sub">{view ? (view.paused ? t("Pausiert") : t("Läuft")) : t("{n} min", { n: preset })}</span>
        <div className="isl3-fbtns">
          <button type="button" className="isl2-round" onClick={go} aria-label={label}>{view && !view.paused ? <Pause size={15} /> : <Play size={15} />}</button>
          <button type="button" className="isl3-mini" onClick={() => (view ? addCountdown(-1) : setPreset((p) => Math.max(1, p - 5)))} aria-label={t("Kürzer")}><Minus size={14} /></button>
          <button type="button" className="isl3-mini" onClick={() => (view ? addCountdown(1) : setPreset((p) => Math.min(180, p + 5)))} aria-label={t("Länger")}><Plus size={14} /></button>
          {view && <button type="button" className="isl3-mini wide" onClick={stopCountdown}>{t("Stopp")}</button>}
        </div>
      </div>
    </div>
  );
}

function WeatherTile({ tile, ctx, box }: P) {
  const own = opt<string>(tile, "place").trim();
  const there = useWeatherAt(own || null);
  const w = own ? there.w : ctx.weather.w;
  const loading = own ? there.loading : ctx.weather.loading;
  const place = own || ctx.weather.place;
  const [placeIn, setPlaceIn] = useState("");
  if (!place) return (
    <form className="isl3-wform" onSubmit={(e) => { e.preventDefault(); if (placeIn.trim()) ctx.weather.setPlace(placeIn); }}>
      <span className="isl2-sub">{t("Wetter für deinen Ort (Open-Meteo, ohne Konto):")}</span>
      <span className="isl2-custom"><input className="input" value={placeIn} maxLength={60} placeholder={t("z. B. Köln")} aria-label={t("Ort für das Wetter")} onChange={(e) => setPlaceIn(e.target.value)} /><button type="submit" className="isl2-chip" disabled={!placeIn.trim()}>{t("OK")}</button></span>
    </form>
  );
  if (!w) return <div className="isl3-wempty"><CloudSun size={22} aria-hidden /><span>{loading ? t("Wetter wird geladen …") : t("Wetter für „{p}“ gerade nicht erreichbar.", { p: place })}</span></div>;
  const range = opt<boolean>(tile, "range") && w.hi != null && w.lo != null;
  return (
    <>
      <div className="isl3-whead"><b className="isl3-temp">{w.temp}°</b><span className="isl3-wicon"><WeatherIcon code={w.code} size={box ? 30 : 26} /></span></div>
      <div className="isl3-wfoot">
        <span className="ellipsis">{t(weatherText(w.code)).replace(/^./, (c) => c.toUpperCase())} · {w.place}</span>
        {range && <span className="isl3-hilo">H {w.hi}° T {w.lo}°</span>}
      </div>
    </>
  );
}

function SystemTile({ tile, ctx }: P) {
  const { m, cpu, gpu, ram } = ctx.metrics;
  if (!ctx.online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  const pct = (v: number | null | undefined) => (v == null ? (m ? "n. v." : "–") : `${Math.round(v)} %`);
  const temps = opt<boolean>(tile, "temp");
  const deg = (v: number | null | undefined) => (temps && v != null ? `${Math.round(v)}°` : "");
  const ramPct = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const rows = ([
    ["cpu", "CPU", cpu, "#f8fafc", pct(m?.cpuPercent), deg(m?.cpuTempC)],
    ["gpu", "GPU", gpu, "#c084fc", pct(m?.gpus?.[0]?.utilPercent), deg(m?.gpus?.[0]?.tempC)],
    ["ram", "RAM", ram, "#fbbf24", pct(ramPct), ""],
  ] as const).filter(([k]) => opt<boolean>(tile, k));
  if (!rows.length) return <span className="isl2-sub">{t("Keine Werte gewählt – in den Einstellungen der Kachel einschalten.")}</span>;
  return <>{rows.map(([k, name, list, color, value, tc]) => (
    k !== "gpu" && ctx.procs
      ? <button key={k} type="button" className="isl3-sysrow tap" onClick={() => ctx.procs!(k as "ram" | "cpu")} aria-label={t("{n}: was am meisten verbraucht", { n: name })}><span className="isl3-sysname">{name}</span><Spark list={list} color={color} /><b>{value}</b><span className="isl3-systemp">{tc}</span></button>
      : <div key={k} className="isl3-sysrow"><span className="isl3-sysname">{name}</span><Spark list={list} color={color} /><b>{value}</b><span className="isl3-systemp">{tc}</span></div>
  ))}</>;
}

function MusicTile({ tile, ctx, box }: P) {
  const np = ctx.np;
  const pos = nowPosition(np, ctx.now);
  const ctl = !ctx.online || !ctx.canUse;
  const playing = !!np?.active && np.playing;
  const fill = opt<boolean>(tile, "cover") && !!np?.cover;
  const skip = opt<boolean>(tile, "skip");
  return (
    <>
      {fill && <img className="isl2-fill" src={np!.cover!} alt="" key={np!.cover} decoding="async" />}
      {box && !fill && <span className="isl2-art" aria-hidden>{np?.cover ? <img className="isl2-cover" src={np.cover} alt="" /> : <Music size={20} />}</span>}
      {!box && !fill && <span className="isl2-art" aria-hidden><Music size={22} /></span>}
      <span className="isl3-grow" />
      <b className="isl2-big ellipsis" title={np?.title}>{np?.active ? np.title : t("Stille")}</b>
      <span className="isl2-sub ellipsis">{np?.active ? nowSub(np) : ctx.online ? t("Gerade läuft nichts") : t("PC nicht verbunden")}</span>
      {pos && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${pos.ratio})` }} /></span>}
      {pos && box && <span className="isl3-times" aria-hidden><span>{songTime(pos.ms)}</span><span>{songTime(pos.total)}</span></span>}
      <div className="isl3-mctl">
        {skip && <button type="button" className="isl2-round sm" disabled={ctl} onClick={() => ctx.media("prev")} aria-label={t("Vorheriger Titel")}><SkipBack size={14} /></button>}
        <button type="button" className="isl2-round" disabled={ctl} onClick={() => ctx.media("playpause")} aria-label={t("Wiedergabe/Pause")}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        {skip && <button type="button" className="isl2-round sm" disabled={ctl} onClick={() => ctx.media("next")} aria-label={t("Nächster Titel")}><SkipForward size={14} /></button>}
      </div>
    </>
  );
}

function GameTile({ ctx }: P) {
  const g = ctx.game;
  if (!g) return <><span className="isl2-art" aria-hidden><Gamepad2 size={22} /></span><span className="isl3-grow" /><b className="isl2-big">{t("Kein Spiel")}</b><span className="isl2-sub">{t("Startet ein Spiel, steht es hier.")}</span></>;
  const mins = Math.max(0, Math.floor((ctx.now - g.since) / 60_000));
  return (
    <>
      {g.cover ? <img className="isl2-fill" src={g.cover} alt="" decoding="async" /> : g.logo}
      <span className="isl3-grow" />
      <b className="isl2-big ellipsis" title={g.name}>{g.name}</b>
      <span className="isl2-sub">{mins < 60 ? t("{n} min", { n: mins }) : `${Math.floor(mins / 60)} h ${mins % 60} min`}</span>
    </>
  );
}

function VolumeTile({ tile, ctx }: P) {
  const what = opt<string>(tile, "what") === "brightness" ? "brightness" : "volume";
  const c = ctx.controls.data;
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const server = what === "volume" ? c?.volume : c?.brightness;
  useEffect(() => setLocal(null), [server]);
  if (!ctx.online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  if (server == null) return <span className="isl2-sub">{c && !c.supported ? t("Nur mit dem Windows-Begleiter.") : what === "brightness" ? t("Dieser Bildschirm lässt seine Helligkeit nicht regeln.") : t("Lautstärke nicht lesbar.")}</span>;
  const value = local ?? server;
  const muted = what === "volume" && !!c?.muted;
  const send = (patch: Record<string, unknown>, wait: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => client.call("controls.set", patch).then(() => ctx.controls.reload(), (e: Error) => { toast(e.message, "error"); setLocal(null); }), wait);
  };
  const label = what === "volume" ? t("Lautstärke am PC") : t("Helligkeit");
  return (
    <div className="isl3-vol" style={{ ["--v" as string]: muted ? 0 : value } as CSSProperties}>
      <div className="isl3-volhead">
        {what === "volume"
          ? <button type="button" className={`isl3-mini${muted ? " on" : ""}`} disabled={!ctx.canUse} aria-pressed={muted} aria-label={t("Stumm")} onClick={() => send({ muted: !muted }, 0)}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
          : <span className="isl3-mini info" aria-hidden><Sun size={15} /></span>}
        <b>{muted ? t("Stumm") : `${value} %`}</b>
      </div>
      <label className="isl3-hbar">
        <span className="isl3-hfill" aria-hidden />
        <input type="range" min={0} max={100} value={value} disabled={!ctx.canUse} aria-label={label} onChange={(e) => { const v = Number(e.target.value); setLocal(v); send(what === "volume" ? { volume: v, ...(muted ? { muted: false } : {}) } : { brightness: v }, what === "volume" ? 110 : 220); }} />
      </label>
    </div>
  );
}

function NetworkTile({ ctx }: P) {
  const net = useNetSpeed(ctx.online, true);
  if (!ctx.online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  if (net.supported === false) return <span className="isl2-sub">{t("Der Begleiter auf dem PC misst das noch nicht – bitte aktualisieren.")}</span>;
  return (
    <>
      <span className="isl3-netval down" aria-label={t("Empfangen: {n}", { n: speedText(net.down) })}><ArrowDown size={14} aria-hidden /><b>{speedText(net.down)}</b></span>
      <span className="isl3-netval up" aria-label={t("Senden: {n}", { n: speedText(net.up) })}><ArrowUp size={14} aria-hidden /><b>{speedText(net.up)}</b></span>
      <svg className="isl3-netspark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
        <polyline className="down" points={sparkPoints(speedCurve(net.downHist, net.upHist))} />
        <polyline className="up" points={sparkPoints(speedCurve(net.upHist, net.downHist))} />
      </svg>
    </>
  );
}

function BatteryTile({ ctx }: P) {
  const c = ctx.controls.data;
  if (!ctx.online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  if (c?.battery == null) return <><span className="isl2-art" aria-hidden><BatteryMedium size={22} /></span><span className="isl3-grow" /><b className="isl2-big">{t("Kein Akku")}</b><span className="isl2-sub">{c && !c.supported ? t("Nur mit dem Windows-Begleiter.") : t("Dieser PC läuft am Netz.")}</span></>;
  return (
    <>
      <span className={`isl2-art${c.charging ? " ok" : ""}`} aria-hidden>{c.charging ? <BatteryCharging size={22} /> : <BatteryMedium size={22} />}</span>
      <span className="isl3-grow" />
      <b className="isl2-big">{c.battery} %</b>
      <span className="isl2-sub">{c.charging ? t("Netzbetrieb") : t("Akkubetrieb")}</span>
      <span className={`isl2-prog${c.battery <= 20 && !c.charging ? " low" : ""}`} aria-hidden><i style={{ transform: `scaleX(${c.battery / 100})` }} /></span>
    </>
  );
}

/** Hours between a time zone and this device ("+8 h"), from what the browser knows about both. */
export function zoneDiff(zone: string, at: Date): string {
  if (!zone) return "";
  try {
    const there = new Date(at.toLocaleString("en-US", { timeZone: zone }));
    const here = new Date(at.toLocaleString("en-US"));
    const h = Math.round(((there.getTime() - here.getTime()) / 3_600_000) * 2) / 2;
    return h === 0 ? t("gleiche Zeit") : `${h > 0 ? "+" : "−"}${Math.abs(h).toLocaleString("de-DE")} h`;
  } catch { return ""; }
}
function ClockTile({ tile, ctx, box }: P) {
  const zone = opt<string>(tile, "zone"), secs = opt<boolean>(tile, "seconds");
  const name = opt<string>(tile, "label").trim() || ZONES.find((z) => z.id === zone)?.label || zone.split("/").pop()?.replace(/_/g, " ") || t("Hier");
  const d = new Date(ctx.now);
  let time = "", day = "";
  try {
    time = d.toLocaleTimeString("de-DE", { timeZone: zone || undefined, hour: "2-digit", minute: "2-digit", ...(secs ? { second: "2-digit" } : {}) });
    day = d.toLocaleDateString("de-DE", { timeZone: zone || undefined, weekday: "short", day: "numeric", month: "short" });
  } catch { time = "–"; }
  return (
    <>
      <span className="isl3-grow" />
      <b className={`isl2-big isl3-clock${box ? " box" : ""}`}>{time}</b>
      <span className="isl2-sub ellipsis">{name}{zone ? ` · ${zoneDiff(zone, d)}` : ` · ${day}`}</span>
    </>
  );
}

function NoteTile({ tile, ctx }: P) {
  const saved = opt<string>(tile, "text");
  const [v, setV] = useState(saved);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setV(saved); }, [saved]);
  return (
    <textarea className="isl3-note" value={v} maxLength={300} placeholder={t("Notiz …")} aria-label={t("Notiz")}
      onChange={(e) => { const x = e.target.value; setV(x); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => ctx.setOpt(tile.id, "text", x), 600); }} />
  );
}

function JarvisTile({ tile, ctx }: P) {
  return (
    <>
      <span className={`isl3-orb m-${ctx.mood}`} aria-hidden><i /><i /></span>
      <span className="isl3-grow" />
      <b className="isl2-big">{t(MOOD_LABEL[ctx.mood])}</b>
      <span className="isl2-sub ellipsis">{opt<boolean>(tile, "last") && ctx.last ? ctx.last : t("Tippen zum Fragen")}</span>
    </>
  );
}

function PcTile({ ctx }: P) {
  return (
    <>
      <span className={`isl2-art${ctx.online ? " ok" : ""}`} aria-hidden><Monitor size={22} /></span>
      <span className="isl3-grow" />
      <b className="isl2-big">{ctx.pc.title}</b>
      <span className="isl2-sub ellipsis">{ctx.pc.sub}</span>
      {ctx.pc.action}
    </>
  );
}

const BODY: Record<TileType, (p: P) => ReactNode> = {
  jarvis: JarvisTile, game: GameTile, music: MusicTile, focus: FocusTile, pc: PcTile, calendar: CalendarTile, weather: WeatherTile, system: SystemTile,
  volume: VolumeTile, network: NetworkTile, battery: BatteryTile, clock: ClockTile, note: NoteTile,
  dice: DiceTile, counter: CounterTile, countdown: CountdownTile, checklist: ChecklistTile, breathe: BreatheTile, stopwatch: StopwatchTile, links: LinksTile, devbattery: DevBatteryTile,
};
/** Where tapping a tile's title leads. */
const TARGET: Partial<Record<TileType, IslandTab>> = { jarvis: "jarvis", game: "game", music: "music", focus: "focus", pc: "pc", system: "system", volume: "controls", battery: "system", network: "system", stopwatch: "focus" };

/** One tile, as a tall card (start page) or a box (overview). */
export function IslandTile({ tile, ctx, box, style, className }: P & { style?: CSSProperties; className?: string }) {
  const Body = BODY[tile.type];
  const label = t(tileDef(tile.type).label);
  const target = TARGET[tile.type];
  const Icon = TILE_ICON[tile.type];
  const filled = (tile.type === "music" && opt<boolean>(tile, "cover") && !!ctx.np?.cover) || (tile.type === "game" && !!ctx.game?.cover);
  return (
    <section className={`isl3-t t-${tile.type}${box ? " box" : " card"}${filled ? " filled" : ""}${className ? ` ${className}` : ""}`} aria-label={label}
      style={{ ...(tile.type === "music" ? ctx.accent : tile.type === "game" ? ctx.game?.style : undefined), ...style }}>
      {target
        ? <button type="button" className="isl3-thead" onClick={() => ctx.open(target)}><Icon size={13} aria-hidden />{label}</button>
        : <span className="isl3-thead"><Icon size={13} aria-hidden />{label}</span>}
      <Body tile={tile} ctx={ctx} box={box} />
    </section>
  );
}

// ------------------------------------------------------------------ editing
/** The settings of one tile, built from what the tile offers. Changes apply at once. */
export function TileSettings({ tile, onChange }: { tile: Tile; onChange: (key: string, value: OptValue) => void }) {
  const def = tileDef(tile.type);
  if (!def.opts.length) return <p className="isl2-sub">{t("Diese Kachel hat keine Einstellungen.")}</p>;
  return (
    <div className="isl3-form">
      {def.opts.map((o) => <OptField key={o.key} o={o} value={opt(tile, o.key)} onChange={(v) => onChange(o.key, v)} />)}
    </div>
  );
}
function OptField({ o, value, onChange }: { o: OptDef; value: OptValue; onChange: (v: OptValue) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const timer = useRef<number | undefined>(undefined);
  if (o.kind === "bool") return (
    <label className="isl3-frow"><span>{t(o.label)}</span><input type="checkbox" className="isl2-switch" checked={value === true} onChange={(e) => onChange(e.target.checked)} /></label>
  );
  if (o.kind === "choice") return (
    <label className="isl3-frow col"><span>{t(o.label)}</span>
      <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {o.choices!.map((c) => <option key={c.id} value={c.id}>{t(c.label)}</option>)}
      </select>
    </label>
  );
  if (o.kind === "number") return (
    <label className="isl3-frow"><span>{t(o.label)}</span>
      <span className="isl3-num">
        <button type="button" className="isl3-mini" aria-label={t("{n} verringern", { n: t(o.label) })} onClick={() => onChange(Math.max(o.min ?? 0, Number(value) - 5))}><Minus size={13} /></button>
        <input className="input" type="number" min={o.min} max={o.max} value={text} aria-label={t(o.label)}
          onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= (o.min ?? -Infinity) && n <= (o.max ?? Infinity)) onChange(Math.round(n)); }} />
        <button type="button" className="isl3-mini" aria-label={t("{n} erhöhen", { n: t(o.label) })} onClick={() => onChange(Math.min(o.max ?? 999, Number(value) + 5))}><Plus size={13} /></button>
      </span>
    </label>
  );
  const long = (o.maxLength ?? 0) > 80;
  return (
    <label className="isl3-frow col"><span>{t(o.label)}</span>
      {long
        ? <textarea className="input" rows={3} maxLength={o.maxLength} value={text} onChange={(e) => { setText(e.target.value); const x = e.target.value; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => onChange(x), 500); }} />
        : <input className="input" maxLength={o.maxLength} value={text} onChange={(e) => { setText(e.target.value); const x = e.target.value; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => onChange(x), 500); }} />}
    </label>
  );
}

/** All kinds of tiles to pick from: search, a filter by kind (or only the new ones) and the order. The ones already there are marked. */
export function TileCatalog({ have, onPick, full }: { have: TileType[]; onPick: (type: TileType) => void; full: boolean }) {
  const [cat, setCat] = useState<TileCat | "all" | "new">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"cat" | "az" | "new">("cat");
  const list = catalog({ cat, query, sort }, (d) => t(d.label), (d) => t(d.hint));
  return (
    <div className="isl3-catwrap">
      <div className="isl3-catbar">
        <label className="isl3-catsearch"><Search size={14} aria-hidden /><input className="input" value={query} placeholder={t("Kachel suchen …")} aria-label={t("Kachel suchen")} onChange={(e) => setQuery(e.target.value)} /></label>
        <select className="input isl3-catsort" value={sort} aria-label={t("Sortieren")} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="cat">{t("Nach Art")}</option><option value="az">{t("A–Z")}</option><option value="new">{t("Neue zuerst")}</option>
        </select>
      </div>
      <div className="isl3-catchips" role="radiogroup" aria-label={t("Art der Kachel")}>
        {([["all", "Alle"], ["new", "Neu"], ...TILE_CATS.map((c) => [c.id, c.label])] as [TileCat | "all" | "new", string][]).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={cat === id} className={`isl2-chip${cat === id ? " on" : ""}`} onClick={() => setCat(id)}>{t(label)}</button>
        ))}
      </div>
      {full && <p className="isl2-sub">{t("Diese Seite ist voll – nimm erst eine Kachel weg.")}</p>}
      <div className="isl3-catalog" role="list" aria-label={t("Kacheln zum Hinzufügen")}>
        {list.map((d) => {
          const Icon = TILE_ICON[d.type];
          return (
            <button key={d.type} type="button" role="listitem" className="isl3-catitem" disabled={full} onClick={() => onPick(d.type)} aria-label={t("{n} hinzufügen", { n: t(d.label) })}>
              <span className="isl3-caticon" aria-hidden><Icon size={18} /></span>
              <span className="isl3-cattext"><b>{t(d.label)}{have.includes(d.type) ? " ✓" : ""}{d.isNew && <em className="isl3-new">{t("Neu")}</em>}</b><i>{t(d.hint)}</i></span>
              <Plus size={16} aria-hidden />
            </button>
          );
        })}
        {!list.length && <p className="isl2-sub">{t("Keine Kachel passt zur Suche.")}</p>}
      </div>
    </div>
  );
}

/** How the tiles of a page are shown (cards, list, grid) and one-tap sorting. */
export function TileViewSheet({ view, onView, onSort, count }: { view: TileView; onView: (v: TileView) => void; onSort: (how: TileSort) => void; count: number }) {
  const ICON: Record<TileView, typeof LayoutGrid> = { cards: Rows3, list: LayoutList, grid: Grid2x2 };
  return (
    <div className="isl3-form">
      <div className="isl3-frow col">
        <span>{t("Ansicht")}</span>
        <div className="isl3-views" role="radiogroup" aria-label={t("Ansicht")}>
          {TILE_VIEWS.map((v) => { const I = ICON[v.id]; return (
            <button key={v.id} type="button" role="radio" aria-checked={view === v.id} className={`isl3-viewbtn${view === v.id ? " on" : ""}`} onClick={() => onView(v.id)}>
              <span className={`isl3-vprev v-${v.id}`} aria-hidden><i /><i /><i /><i /></span><span><I size={13} aria-hidden /> {t(v.label)}</span>
            </button>
          ); })}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{t("Karten: groß mit allen Infos. Liste: eine Zeile je Kachel, passt viel auf den Bildschirm. Raster: kleine Quadrate.")}</p>
      </div>
      <div className="isl3-frow col">
        <span>{t("Sortieren")}</span>
        <div className="isl3-sortbtns">
          {([["az", "A–Z"], ["za", "Z–A"], ["cat", "Nach Art"], ["reverse", "Umdrehen"]] as [TileSort, string][]).map(([id, label]) => (
            <button key={id} type="button" className="isl2-chip" disabled={count < 2} onClick={() => onSort(id)}>{t(label)}</button>
          ))}
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>{t("Sortiert einmal sofort; danach lassen sich einzelne Kacheln wie gewohnt verschieben.")}</p>
      </div>
    </div>
  );
}

/** The buttons laid over a tile while editing. */
export function TileEditBar({ label, first, last, onMove, onSettings, onRemove }: { label: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void; onSettings: () => void; onRemove: () => void }) {
  return (
    <div className="isl3-ebar">
      <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={t("{n} nach vorne", { n: label })}><ChevronLeft size={15} /></button>
      <button type="button" onClick={onSettings} aria-label={t("{n} einstellen", { n: label })}><Settings2 size={15} /></button>
      <button type="button" className="rm" onClick={onRemove} aria-label={t("{n} entfernen", { n: label })}><X size={15} /></button>
      <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={t("{n} nach hinten", { n: label })}><ChevronRight size={15} /></button>
    </div>
  );
}

/** Which areas sit in the strip and in which order: every area in one list with a switch, arrows for the order and one-tap sorting.
 *  "Home" always stays first; "Spiel" only shows while a game runs. */
export function TabsEditor({ tabs, onChange }: { tabs: IslandTab[]; onChange: (tabs: IslandTab[]) => void }) {
  const off = ALL_TABS.filter((x) => !tabs.includes(x));
  const label = (x: IslandTab) => t(TAB_LABEL[x]);
  return (
    <div className="isl3-tabsed">
      <div className="isl3-sortbtns">
        <span className="isl2-sub">{t("{n} von {m} Bereichen in der Leiste", { n: tabs.length, m: ALL_TABS.length })}</span>
        <button type="button" className="isl2-chip" onClick={() => onChange(sortTabs(tabs, "usual", label))}>{t("Übliche Reihenfolge")}</button>
        <button type="button" className="isl2-chip" onClick={() => onChange(sortTabs(tabs, "az", label))}>{t("A–Z")}</button>
        <button type="button" className="isl2-chip" disabled={off.length === 0} onClick={() => onChange([...tabs, ...off])}>{t("Alle zeigen")}</button>
      </div>
      <ul className="isl3-tlist" aria-label={t("Bereiche in der Leiste")}>
        {[...tabs, ...off].map((x) => {
          const on = tabs.includes(x), i = tabs.indexOf(x);
          return (
            <li key={x} className={on ? "" : "off"}>
              <label className="isl3-tname">
                <input type="checkbox" role="switch" className="isl2-switch" checked={on} disabled={x === "home"} onChange={(e) => onChange(e.target.checked ? [...tabs, x] : tabs.filter((y) => y !== x))} aria-label={t("{n} in der Leiste", { n: label(x) })} />
                <span>{label(x)}{NEW_TABS.includes(x) && <em className="isl3-new">{t("Neu")}</em>}{x === "game" ? <i>{t("nur während eines Spiels")}</i> : null}</span>
              </label>
              {on && <>
                <button type="button" className="isl3-mini" disabled={i <= 1 || x === "home"} onClick={() => onChange(moveTab(tabs, x, -1))} aria-label={t("{n} nach vorne", { n: label(x) })}><ArrowUp size={14} /></button>
                <button type="button" className="isl3-mini" disabled={x === "home" || i === tabs.length - 1} onClick={() => onChange(moveTab(tabs, x, 1))} aria-label={t("{n} nach hinten", { n: label(x) })}><ArrowDown size={14} /></button>
              </>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const LayoutIcon = LayoutGrid;
