// Three more areas of the island (3.55), ideas taken from notch apps for Windows and built in this app's own look:
//  · Übersicht – calendar week, focus timer, weather of the home place, load curves of the PC
//  · Regler    – volume and brightness as tall sliders, mute, focus, battery, power plan
//  · System    – tiles for CPU, memory, graphics card, storage, battery and running time
// Every number comes from the PC (or Open-Meteo for the weather). What the PC cannot tell is left out or says so – never a made-up value.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BatteryCharging, BatteryMedium, BellOff, Clock3, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Cpu, Gauge, HardDrive, Leaf, MemoryStick, Minus, Monitor, Pause, Play, Plus, Rocket, Sun, Volume2, VolumeX, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useEvent, useLiveSubscription, useRpc } from "../lib/hooks";
import type { MetricsSample } from "../lib/types";
import { addCountdown, countdownView, pauseCountdown, resumeCountdown, startCountdown, stopCountdown, useTimer } from "../lib/island-timer";
import { clock } from "../lib/island";
import { homePlace, setHomePlace, weatherText } from "../lib/weather";
import { cachedWeather, gb, isoWeek, loadWeather, pushHistory, sparkPoints, uptimeText, weekStrip, WEATHER_TTL, type IslandWeather } from "../lib/island-dash";

export interface PcControls { supported: boolean; volume: number | null; muted: boolean | null; brightness: number | null; battery: number | null; charging: boolean | null; powerMode: "saver" | "balanced" | "performance" | null }

/** The PC's quick controls – asked once per open island, refreshed when something changes them. */
export function usePcControls(online: boolean) {
  return useRpc<PcControls>("controls.get", {}, ["controls"], online);
}

export function useMetrics(online: boolean) {
  const [m, setM] = useState<MetricsSample | null>(null);
  useLiveSubscription<MetricsSample>("monitor", setM, undefined, online);
  useEvent<MetricsSample>("monitor.sample", (d) => { if (online) setM(d); });
  return online ? m : null;
}

// ------------------------------------------------------------------ weather
export function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  const I = code === 0 || code === 1 ? Sun : code === 2 ? CloudSun : code === 3 ? Cloud : code === 45 || code === 48 ? CloudFog
    : code >= 51 && code <= 57 ? CloudDrizzle : (code >= 61 && code <= 67) || (code >= 80 && code <= 82) ? CloudRain : (code >= 71 && code <= 77) || code === 85 || code === 86 ? CloudSnow : code >= 95 ? CloudLightning : Cloud;
  return <I size={size} aria-hidden />;
}
/** Weather of the home place: shown from the device's copy at once, refreshed every half hour while the island is open. */
export function useIslandWeather(): { place: string | null; w: IslandWeather | null; loading: boolean; setPlace: (p: string) => void } {
  const [place, setPlaceState] = useState(() => homePlace());
  const [w, setW] = useState<IslandWeather | null>(() => cachedWeather(homePlace()));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!place) { setW(null); return; }
    let gone = false;
    const run = () => {
      const have = cachedWeather(place);
      if (have) setW(have);
      if (have && Date.now() - have.at < WEATHER_TTL) return;
      setLoading(true);
      void loadWeather(place).then((x) => { if (gone) return; setLoading(false); if (x) setW(x); });
    };
    run();
    const id = window.setInterval(run, 5 * 60_000);
    return () => { gone = true; window.clearInterval(id); };
  }, [place]);
  return { place, w, loading, setPlace: (p) => { const v = p.trim().slice(0, 60); setHomePlace(v || null); setPlaceState(v || null); } };
}

// ------------------------------------------------------------------ Übersicht
function Spark({ list, color }: { list: (number | null)[]; color: string }) {
  const pts = sparkPoints(list, 100, 22);
  return (
    <svg className="isl3-spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden>
      {pts ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

export function IslandDash({ online, now, weather }: { online: boolean; now: number; weather: ReturnType<typeof useIslandWeather> }) {
  const d = new Date(now);
  const tm = useTimer();
  const view = countdownView(tm, now);
  const [preset, setPreset] = useState(25);
  const m = useMetrics(online);
  const hist = useRef<{ cpu: (number | null)[]; gpu: (number | null)[]; ram: (number | null)[] }>({ cpu: [], gpu: [], ram: [] });
  const [, bump] = useState(0);
  useEffect(() => {
    if (!m) return;
    const ram = m.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
    hist.current = { cpu: pushHistory(hist.current.cpu, m.cpuPercent), gpu: pushHistory(hist.current.gpu, m.gpus?.[0]?.utilPercent), ram: pushHistory(hist.current.ram, ram) };
    bump((x) => x + 1);
  }, [m]);
  const [placeIn, setPlaceIn] = useState("");
  const pct = (v: number | null | undefined) => (v == null ? (m ? "n. v." : "–") : `${Math.round(v)} %`);
  const temp = (v: number | null | undefined) => (v == null ? "" : `${Math.round(v)}°`);
  const ramPct = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const { w } = weather;
  return (
    <div className="isl3-dash">
      <section className="isl3-tile isl3-cal" aria-label={t("Kalender")}>
        <div className="isl3-calhead">
          <b className="isl3-daynum">{d.getDate()}</b>
          <span className="isl3-dayname"><b>{d.toLocaleDateString([], { weekday: "short" }).replace(".", "")}</b><span>{d.toLocaleDateString([], { month: "short" }).replace(".", "")}</span></span>
          <span className="isl3-kw">{t("KW {n}", { n: isoWeek(d) })}</span>
        </div>
        <div className="isl3-week" role="list">
          {weekStrip(d).map((x) => (
            <span key={x.date.toISOString()} role="listitem" className={x.today ? "today" : ""} aria-current={x.today ? "date" : undefined}>
              <i>{x.date.toLocaleDateString([], { weekday: "narrow" })}</i><b>{x.day}</b>
            </span>
          ))}
        </div>
      </section>

      <section className={`isl3-tile isl3-focus${view ? " running" : ""}${view?.paused ? " paused" : ""}`} aria-label={t("Fokus-Timer")}>
        <span className="isl3-ring" style={{ ["--p" as string]: view ? view.progress : 0 } as CSSProperties}><b>{view ? clock(view.left) : `${preset}:00`}</b></span>
        <div className="isl3-ftext">
          <b>{t("Fokus-Timer")}</b>
          <span className="isl2-sub">{view ? (view.paused ? t("Pausiert") : t("Läuft")) : t("{n} min", { n: preset })}</span>
          <div className="isl3-fbtns">
            <button type="button" className="isl2-round" onClick={() => (view ? (view.paused ? resumeCountdown() : pauseCountdown()) : startCountdown(preset))} aria-label={view ? (view.paused ? t("Fortsetzen") : t("Pausieren")) : t("Fokus starten")}>{view && !view.paused ? <Pause size={15} /> : <Play size={15} />}</button>
            <button type="button" className="isl3-mini" onClick={() => (view ? addCountdown(-1) : setPreset((p) => Math.max(5, p - 5)))} aria-label={t("Kürzer")}><Minus size={14} /></button>
            <button type="button" className="isl3-mini" onClick={() => (view ? addCountdown(1) : setPreset((p) => Math.min(90, p + 5)))} aria-label={t("Länger")}><Plus size={14} /></button>
            {view && <button type="button" className="isl3-mini wide" onClick={stopCountdown}>{t("Stopp")}</button>}
          </div>
        </div>
      </section>

      <section className="isl3-tile isl3-weather" aria-label={t("Wetter")}>
        {w ? (
          <>
            <div className="isl3-whead"><b className="isl3-temp">{w.temp}°</b><span className="isl3-wicon"><WeatherIcon code={w.code} size={30} /></span></div>
            <div className="isl3-wfoot"><span className="ellipsis">{t(weatherText(w.code)).replace(/^./, (c) => c.toUpperCase())} · {w.place}</span>
              {w.hi != null && w.lo != null && <span className="isl3-hilo">H {w.hi}° T {w.lo}°</span>}</div>
          </>
        ) : weather.place ? (
          <div className="isl3-wempty"><CloudSun size={22} aria-hidden /><span>{weather.loading ? t("Wetter wird geladen …") : t("Wetter für „{p}“ gerade nicht erreichbar.", { p: weather.place })}</span></div>
        ) : (
          <form className="isl3-wform" onSubmit={(e) => { e.preventDefault(); if (placeIn.trim()) weather.setPlace(placeIn); }}>
            <span className="isl2-sub">{t("Wetter für deinen Ort (Open-Meteo, ohne Konto):")}</span>
            <span className="isl2-custom"><input className="input" value={placeIn} maxLength={60} placeholder={t("z. B. Köln")} aria-label={t("Ort für das Wetter")} onChange={(e) => setPlaceIn(e.target.value)} /><button type="submit" className="isl2-chip" disabled={!placeIn.trim()}>{t("OK")}</button></span>
          </form>
        )}
      </section>

      <section className="isl3-tile isl3-sys" aria-label={t("PC-Werte")}>
        {online ? ([["CPU", hist.current.cpu, "#f8fafc", pct(m?.cpuPercent), temp(m?.cpuTempC)], ["GPU", hist.current.gpu, "#c084fc", pct(m?.gpus?.[0]?.utilPercent), temp(m?.gpus?.[0]?.tempC)], ["RAM", hist.current.ram, "#fbbf24", pct(ramPct), ""]] as const).map(([name, list, color, value, tc]) => (
          <div key={name} className="isl3-sysrow"><span className="isl3-sysname">{name}</span><Spark list={list} color={color} /><b>{value}</b><span className="isl3-systemp">{tc}</span></div>
        )) : <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Regler
function TallSlider({ value, onChange, icon, label, disabled }: { value: number; onChange: (v: number) => void; icon: ReactNode; label: string; disabled?: boolean }) {
  return (
    <label className={`isl3-tall${disabled ? " off" : ""}`} style={{ ["--v" as string]: value } as CSSProperties}>
      <span className="isl3-tallfill" aria-hidden />
      <b className="isl3-tallpct">{value}%</b>
      <span className="isl3-tallicon" aria-hidden>{icon}</span>
      <input type="range" min={0} max={100} value={value} disabled={disabled} aria-label={label} title={label} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function IslandControls({ online, canUse, controls, now, press }: { online: boolean; canUse: boolean; controls: ReturnType<typeof usePcControls>; now: number; press: (key: string) => void }) {
  const c = controls.data;
  const [local, setLocal] = useState<Partial<PcControls>>({});
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setLocal({}); }, [c?.volume, c?.muted, c?.brightness, c?.powerMode]);
  const send = (patch: Partial<Pick<PcControls, "volume" | "muted" | "brightness" | "powerMode">>, wait = 110) => {
    setLocal((l) => ({ ...l, ...patch }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { client.call("controls.set", patch).catch((e) => { toast((e as Error).message, "error"); setLocal({}); controls.reload(); }); }, wait);
  };
  const tm = useTimer();
  const view = countdownView(tm, now);
  if (!online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden – die Regler steuern den PC.")}</span></div>;
  if (!c) return <div className="isl2-empty"><Gauge size={18} aria-hidden /><span>{controls.loading ? t("Regler werden gelesen …") : t("Der Begleiter auf dem PC kennt die Regler noch nicht – bitte aktualisieren.")}</span></div>;
  const vol = local.volume ?? c.volume, muted = local.muted ?? c.muted, bright = local.brightness ?? c.brightness, mode = local.powerMode ?? c.powerMode;
  const off = !canUse;
  return (
    <div className="isl3-ctl">
      {bright != null && <TallSlider value={bright} label={t("Helligkeit")} icon={<Sun size={18} />} disabled={off} onChange={(v) => send({ brightness: v }, 220)} />}
      {vol != null
        ? <TallSlider value={muted ? 0 : vol} label={t("Lautstärke am PC")} icon={muted ? <VolumeX size={18} /> : <Volume2 size={18} />} disabled={off} onChange={(v) => send({ volume: v, ...(muted ? { muted: false } : {}) })} />
        : null}
      <div className="isl3-toggles">
        {muted != null
          ? <button type="button" className={`isl3-tog${muted ? " on" : ""}`} aria-pressed={!!muted} disabled={off} onClick={() => send({ muted: !muted }, 0)}><span className="isl3-togic">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</span><span><b>{t("Stumm")}</b><i>{muted ? t("Ton aus") : t("Ton an")}</i></span></button>
          : <button type="button" className="isl3-tog" disabled={off} onClick={() => press("mute")}><span className="isl3-togic"><VolumeX size={16} /></span><span><b>{t("Stumm")}</b><i>{t("umschalten")}</i></span></button>}
        <button type="button" className={`isl3-tog${view ? " on" : ""}`} aria-pressed={!!view} onClick={() => (view ? stopCountdown() : startCountdown(25))}><span className="isl3-togic"><BellOff size={16} /></span><span><b>{t("Fokus")}</b><i>{view ? clock(view.left) : t("Aus")}</i></span></button>
        {c.battery != null && (
          <div className={`isl3-tog info${c.charging ? " on" : ""}`}><span className="isl3-togic">{c.charging ? <BatteryCharging size={16} /> : <BatteryMedium size={16} />}</span><span><b>{c.battery}%</b><i>{c.charging ? t("Netzbetrieb") : t("Akku")}</i></span></div>
        )}
        {vol == null && (
          <div className="isl3-tog info"><span className="isl3-togic"><Volume2 size={16} /></span><span><b>{t("Lautstärke")}</b><i>{c.supported ? t("nicht lesbar") : t("nur Windows-Begleiter")}</i></span></div>
        )}
      </div>
      {mode != null && (
        <div className="isl3-modes" role="radiogroup" aria-label={t("Energiemodus")}>
          {([["saver", t("Sparen"), Leaf], ["balanced", t("Ausgewogen"), Gauge], ["performance", t("Leistung"), Rocket]] as const).map(([id, label, I]) => (
            <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? "on" : ""} disabled={off} onClick={() => send({ powerMode: id }, 0)}><I size={14} /> {label}</button>
          ))}
        </div>
      )}
      {!c.supported && <p className="tiny muted isl3-note">{t("Lautstärke, Helligkeit und Energiemodus regelt nur der Windows-Begleiter.")}</p>}
      {off && c.supported && <p className="tiny muted isl3-note">{t("Dieses Gerät darf den PC nicht steuern (Berechtigung „Starten“ fehlt).")}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ System
function Tile({ icon, name, value, sub, pct, color }: { icon: ReactNode; name: string; value: string; sub?: string; pct?: number | null; color: string }) {
  return (
    <div className="isl3-stat" style={{ ["--c" as string]: color } as CSSProperties}>
      <span className="isl3-stathead">{icon}{name}</span>
      <b>{value}</b>
      {pct != null && <span className="isl3-bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})` }} /></span>}
      {sub && <span className="isl2-sub ellipsis">{sub}</span>}
    </div>
  );
}

export function IslandSystem({ online, controls }: { online: boolean; controls: ReturnType<typeof usePcControls> }) {
  const m = useMetrics(online);
  if (!online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  const na = m ? "n. v." : "–";
  const gpu = m?.gpus?.[0];
  const disk = m?.disks?.[0];
  const ramPct = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const c = controls.data;
  return (
    <div className="isl3-stats">
      <Tile color="#38bdf8" icon={<Cpu size={13} />} name="CPU" value={m?.cpuPercent != null ? `${Math.round(m.cpuPercent)} %` : na} pct={m?.cpuPercent} sub={m?.cpuTempC != null ? `${Math.round(m.cpuTempC)} °C` : m?.cpuName} />
      <Tile color="#c084fc" icon={<MemoryStick size={13} />} name={t("Arbeitsspeicher")} value={m?.memUsedBytes != null ? gb(m.memUsedBytes) : na} pct={ramPct} sub={m?.memTotalBytes ? t("von {n}", { n: gb(m.memTotalBytes) }) : undefined} />
      <Tile color="#34d399" icon={<Zap size={13} />} name="GPU" value={gpu?.utilPercent != null ? `${Math.round(gpu.utilPercent)} %` : na} pct={gpu?.utilPercent} sub={gpu?.tempC != null ? `${Math.round(gpu.tempC)} °C` : gpu?.name} />
      <Tile color="#fbbf24" icon={<HardDrive size={13} />} name={t("Speicher")} value={disk ? t("{n} frei", { n: gb(disk.freeBytes) }) : na} pct={disk ? ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100 : null} sub={disk ? t("von {n}", { n: gb(disk.totalBytes) }) + (disk.label ? ` · ${disk.label}` : "") : undefined} />
      <Tile color="#4ade80" icon={c?.charging ? <BatteryCharging size={13} /> : <BatteryMedium size={13} />} name={t("Akku")} value={c?.battery != null ? `${c.battery} %` : t("kein Akku")} pct={c?.battery ?? null} sub={c?.battery != null ? (c.charging ? t("Netzbetrieb") : t("Akkubetrieb")) : c && !c.supported ? t("nur Windows-Begleiter") : undefined} />
      <Tile color="#facc15" icon={<Clock3 size={13} />} name={t("Laufzeit")} value={uptimeText(m?.uptimeHours)} sub={t("seit dem letzten Start")} />
    </div>
  );
}
