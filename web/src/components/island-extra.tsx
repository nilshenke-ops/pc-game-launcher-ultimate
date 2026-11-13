// Three more areas of the island (3.55), ideas taken from notch apps for Windows and built in this app's own look:
//  · Übersicht – calendar week, focus timer, weather of the home place, load curves of the PC
//  · Regler    – volume and brightness as tall sliders, mute, focus, battery, power plan
//  · System    – tiles for CPU, memory, graphics card, storage, battery and running time
// Every number comes from the PC (or Open-Meteo for the weather). What the PC cannot tell is left out or says so – never a made-up value.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, BatteryCharging, BatteryMedium, BellOff, Clock3, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Cpu, Gauge, HardDrive, Leaf, MemoryStick, Mic, MicOff, Monitor, Moon, Music2, Network, Rocket, Volume1, Wifi, WifiOff, Bluetooth, Sun, Volume2, VolumeX, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useEvent, useLiveSubscription, useRpc } from "../lib/hooks";
import type { MetricsSample } from "../lib/types";
import { countdownView, startCountdown, stopCountdown, useTimer } from "../lib/island-timer";
import { clock } from "../lib/island";
import { homePlace, setHomePlace } from "../lib/weather";
import { fetchLyrics, lineAt, lyricsOn, setLyricsOn, speedText, type Lyrics } from "../lib/island-lyrics";
import { nowPosition, type NowPlaying } from "../lib/now-playing";
import { cachedWeather, gb, loadWeather, pushHistory, sparkPoints, uptimeText, WEATHER_TTL, type IslandWeather } from "../lib/island-dash";

export interface PcControls { supported: boolean; volume: number | null; muted: boolean | null; brightness: number | null; battery: number | null; charging: boolean | null; powerMode: "saver" | "balanced" | "performance" | null; wifi?: boolean | null; bluetooth?: boolean | null }

/** The PC's quick controls – asked once per open island, refreshed when something changes them. */
export function usePcControls(online: boolean) {
  return useRpc<PcControls>("controls.get", {}, ["controls"], online);
}

export interface PcSensors { micMuted: boolean | null; micInUse: boolean | null; micApp: string | null; cameraInUse: boolean | null; cameraApp: string | null }

/** The PC's microphone (muted?) and whether a program uses the microphone or the camera right now. Windows sends no event for that – asked every 5 s while the island is open. */
export function usePcSensors(online: boolean) {
  const q = useRpc<PcSensors>("controls.sensors", {}, ["controls"], online);
  const reload = useRef(q.reload); reload.current = q.reload;
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") reload.current(); }, 5000);
    return () => window.clearInterval(id);
  }, [online]);
  return q;
}

export interface NetSpeed { supported: boolean | null; down: number | null; up: number | null; downHist: (number | null)[]; upHist: (number | null)[] }
/** Download/upload speed of the PC, measured every 2 s while `active` (the System tab is open). Older companions answer "unknown method" – then supported = false. */
export function useNetSpeed(online: boolean, active: boolean): NetSpeed {
  const [s, setS] = useState<NetSpeed>({ supported: null, down: null, up: null, downHist: [], upHist: [] });
  useEffect(() => {
    if (!online || !active) return;
    let gone = false;
    const tick = () => client.call<{ supported: boolean; downBps: number | null; upBps: number | null }>("net.speed", {})
      .then((r) => { if (!gone) setS((o) => ({ supported: r.supported, down: r.downBps, up: r.upBps, downHist: [...o.downHist, r.downBps].slice(-30), upHist: [...o.upHist, r.upBps].slice(-30) })); })
      .catch(() => { if (!gone) setS((o) => ({ ...o, supported: false })); });
    tick();
    const id = window.setInterval(tick, 2000);
    return () => { gone = true; window.clearInterval(id); };
  }, [online, active]);
  return s;
}

/** Bytes per second as 0–100 of the fastest value in both lists – for the small curve (so a quiet line is not flat next to a peak). */
export function speedCurve(list: (number | null)[], other: (number | null)[]): (number | null)[] {
  const peak = Math.max(1, ...list.map((v) => v ?? 0), ...other.map((v) => v ?? 0));
  return list.map((v) => (v == null ? null : (v / peak) * 100));
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
/** Weather of a place: shown from the device's copy at once, refreshed every half hour while the island is open. */
export function useWeatherAt(place: string | null): { w: IslandWeather | null; loading: boolean } {
  const [w, setW] = useState<IslandWeather | null>(() => cachedWeather(place));
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
  return { w, loading };
}

/** Weather of the home place (the header and every weather tile without a place of its own). */
export function useIslandWeather(): { place: string | null; w: IslandWeather | null; loading: boolean; setPlace: (p: string) => void } {
  const [place, setPlaceState] = useState(() => homePlace());
  const { w, loading } = useWeatherAt(place);
  return { place, w, loading, setPlace: (p) => { const v = p.trim().slice(0, 60); setHomePlace(v || null); setPlaceState(v || null); } };
}

export interface MetricsHistory { m: MetricsSample | null; cpu: (number | null)[]; gpu: (number | null)[]; ram: (number | null)[] }
/** The PC's values and their last 40 readings (for the small curves). */
export function useMetricsHistory(online: boolean): MetricsHistory {
  const m = useMetrics(online);
  const [h, setH] = useState<Omit<MetricsHistory, "m">>({ cpu: [], gpu: [], ram: [] });
  useEffect(() => {
    if (!m) return;
    const ram = m.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
    setH((o) => ({ cpu: pushHistory(o.cpu, m.cpuPercent), gpu: pushHistory(o.gpu, m.gpus?.[0]?.utilPercent), ram: pushHistory(o.ram, ram) }));
  }, [m]);
  return { m, ...h };
}

// ------------------------------------------------------------------ Übersicht
export function Spark({ list, color }: { list: (number | null)[]; color: string }) {
  const pts = sparkPoints(list, 100, 22);
  return (
    <svg className="isl3-spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden>
      {pts ? <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" strokeOpacity=".2" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
    </svg>
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

export function IslandControls({ online, canUse, controls, sensors, now, press }: { online: boolean; canUse: boolean; controls: ReturnType<typeof usePcControls>; sensors: ReturnType<typeof usePcSensors>; now: number; press: (key: string) => void }) {
  const c = controls.data;
  const sn = sensors.data;
  const [micLocal, setMicLocal] = useState<boolean | null>(null);
  useEffect(() => { setMicLocal(null); }, [sn?.micMuted]);
  const micMuted = micLocal ?? sn?.micMuted ?? null;
  const toggleMic = () => {
    const next = !micMuted;
    setMicLocal(next);
    client.call("controls.micMute", { muted: next }).then(() => sensors.reload(), (e) => { toast((e as Error).message, "error"); setMicLocal(null); });
  };
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
  const setRadio = (kind: "wifi" | "bluetooth", on: boolean) => {
    client.call("controls.setRadio", { kind, on }).then(() => controls.reload(), (e: Error) => toast(e.message, "error"));
  };
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
        {micMuted != null && (
          <button type="button" className={`isl3-tog mic${micMuted ? " on" : ""}`} aria-pressed={micMuted} disabled={off} onClick={toggleMic}>
            <span className="isl3-togic">{micMuted ? <MicOff size={16} /> : <Mic size={16} />}</span>
            <span><b>{t("Mikrofon")}</b><i>{micMuted ? t("stumm") : sn?.micInUse ? t("benutzt: {n}", { n: sn.micApp ?? "?" }) : t("an")}</i></span>
          </button>
        )}
        {c.wifi != null && (
          <button type="button" className={`isl3-tog radio${c.wifi ? " on" : ""}`} aria-pressed={c.wifi} disabled={off} onClick={() => setRadio("wifi", !c.wifi)}>
            <span className="isl3-togic">{c.wifi ? <Wifi size={16} /> : <WifiOff size={16} />}</span><span><b>{t("WLAN")}</b><i>{c.wifi ? t("an") : t("aus")}</i></span>
          </button>
        )}
        {c.bluetooth != null && (
          <button type="button" className={`isl3-tog radio${c.bluetooth ? " on" : ""}`} aria-pressed={c.bluetooth} disabled={off} onClick={() => setRadio("bluetooth", !c.bluetooth)}>
            <span className="isl3-togic"><Bluetooth size={16} /></span><span><b>{t("Bluetooth")}</b><i>{c.bluetooth ? t("an") : t("aus")}</i></span>
          </button>
        )}
        {c.supported && (
          <button type="button" className="isl3-tog" disabled={off} onClick={() => client.call("controls.openSettings", { page: "nightlight" }).then(() => toast(t("Die Nachtmodus-Einstellung ist am PC geöffnet."), "success"), (e: Error) => toast(e.message, "error"))}
            title={t("Windows lässt Programme den Nachtmodus nicht direkt schalten – das öffnet die Einstellung am PC.")}>
            <span className="isl3-togic"><Moon size={16} /></span><span><b>{t("Nachtmodus")}</b><i>{t("Einstellung öffnen")}</i></span>
          </button>
        )}
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
function Tile({ icon, name, value, sub, pct, color, onOpen }: { icon: ReactNode; name: string; value: string; sub?: string; pct?: number | null; color: string; onOpen?: () => void }) {
  const El = onOpen ? "button" : "div";
  return (
    <El {...(onOpen ? { type: "button" as const, onClick: onOpen, "aria-label": t("{n}: was am meisten verbraucht", { n: name }) } : {})} className={`isl3-stat${onOpen ? " tap" : ""}`} style={{ ["--c" as string]: color } as CSSProperties}>
      <span className="isl3-stathead">{icon}{name}</span>
      <b>{value}</b>
      {pct != null && <span className="isl3-bar"><i style={{ transform: `scaleX(${Math.max(0, Math.min(100, pct)) / 100})` }} /></span>}
      {sub && <span className="isl2-sub ellipsis">{sub}</span>}
    </El>
  );
}

export function IslandSystem({ online, controls, onDetails }: { online: boolean; controls: ReturnType<typeof usePcControls>; onDetails?: (k: "ram" | "cpu") => void }) {
  const m = useMetrics(online);
  const net = useNetSpeed(online, true);
  if (!online) return <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{t("PC nicht verbunden")}</span></div>;
  const na = m ? "n. v." : "–";
  const gpu = m?.gpus?.[0];
  const disk = m?.disks?.[0];
  const ramPct = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const c = controls.data;
  return (
    <div className="isl3-stats">
      <Tile onOpen={onDetails && (() => onDetails("cpu"))} color="#38bdf8" icon={<Cpu size={13} />} name="CPU" value={m?.cpuPercent != null ? `${Math.round(m.cpuPercent)} %` : na} pct={m?.cpuPercent} sub={m?.cpuTempC != null ? `${Math.round(m.cpuTempC)} °C` : m?.cpuName} />
      <Tile onOpen={onDetails && (() => onDetails("ram"))} color="#c084fc" icon={<MemoryStick size={13} />} name={t("Arbeitsspeicher")} value={m?.memUsedBytes != null ? gb(m.memUsedBytes) : na} pct={ramPct} sub={m?.memTotalBytes ? t("von {n}", { n: gb(m.memTotalBytes) }) : undefined} />
      <Tile color="#34d399" icon={<Zap size={13} />} name="GPU" value={gpu?.utilPercent != null ? `${Math.round(gpu.utilPercent)} %` : na} pct={gpu?.utilPercent} sub={gpu?.tempC != null ? `${Math.round(gpu.tempC)} °C` : gpu?.name} />
      <Tile color="#fbbf24" icon={<HardDrive size={13} />} name={t("Speicher")} value={disk ? t("{n} frei", { n: gb(disk.freeBytes) }) : na} pct={disk ? ((disk.totalBytes - disk.freeBytes) / disk.totalBytes) * 100 : null} sub={disk ? t("von {n}", { n: gb(disk.totalBytes) }) + (disk.label ? ` · ${disk.label}` : "") : undefined} />
      <Tile color="#4ade80" icon={c?.charging ? <BatteryCharging size={13} /> : <BatteryMedium size={13} />} name={t("Akku")} value={c?.battery != null ? `${c.battery} %` : t("kein Akku")} pct={c?.battery ?? null} sub={c?.battery != null ? (c.charging ? t("Netzbetrieb") : t("Akkubetrieb")) : c && !c.supported ? t("nur Windows-Begleiter") : undefined} />
      <Tile color="#facc15" icon={<Clock3 size={13} />} name={t("Laufzeit")} value={uptimeText(m?.uptimeHours)} sub={t("seit dem letzten Start")} />
      <div className="isl3-stat wide isl3-net" style={{ ["--c" as string]: "#60a5fa" } as CSSProperties}>
        <span className="isl3-stathead"><Network size={13} />{t("Netzwerk")}</span>
        {net.supported === false
          ? <span className="isl2-sub">{t("Der Begleiter auf dem PC misst das noch nicht – bitte aktualisieren.")}</span>
          : (
            <div className="isl3-netrow">
              <span className="isl3-netval down" aria-label={t("Empfangen: {n}", { n: speedText(net.down) })}><ArrowDown size={14} aria-hidden /><b>{speedText(net.down)}</b></span>
              <span className="isl3-netval up" aria-label={t("Senden: {n}", { n: speedText(net.up) })}><ArrowUp size={14} aria-hidden /><b>{speedText(net.up)}</b></span>
              <svg className="isl3-netspark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden>
                <polyline className="down" points={sparkPoints(speedCurve(net.downHist, net.upHist))} />
                <polyline className="up" points={sparkPoints(speedCurve(net.upHist, net.downHist))} />
              </svg>
            </div>
          )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lyrics
/** Lyrics of the song the PC plays. Off until switched on here (title and artist then go to lrclib.net). Timed lyrics follow the song. */
export function IslandLyrics({ np, now }: { np: NowPlaying | null | undefined; now: number }) {
  const [on, setOn] = useState(() => lyricsOn());
  const [state, setState] = useState<{ key: string; lyrics: Lyrics | null; error: boolean; loading: boolean }>({ key: "", lyrics: null, error: false, loading: false });
  const listRef = useRef<HTMLOListElement>(null);
  const key = np?.active ? `${np.title}\n${np.artist}` : "";
  useEffect(() => {
    if (!on || !key || !np) return;
    let gone = false;
    setState({ key, lyrics: null, error: false, loading: true });
    fetchLyrics(np.title, np.artist, np.durationMs).then(
      (lyrics) => { if (!gone) setState({ key, lyrics, error: false, loading: false }); },
      () => { if (!gone) setState({ key, lyrics: null, error: true, loading: false }); },
    );
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);
  const pos = nowPosition(np, now);
  const synced = state.key === key ? state.lyrics?.synced ?? null : null;
  const at = synced && pos ? lineAt(synced, pos.ms) : -1;
  // The line being sung always stands in the middle of the view: the list moves under it (no scrolling, no jumps).
  const viewRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const place = () => {
      const list = listRef.current, view = viewRef.current;
      if (!list || !view) return;
      const el = list.children[Math.max(0, at)] as HTMLElement | undefined;
      if (!el) return;
      setShift(Math.round(view.clientHeight / 2 - (el.offsetTop + el.offsetHeight / 2)));
    };
    place();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (ro && viewRef.current) ro.observe(viewRef.current);
    return () => ro?.disconnect();
  }, [at, synced]);

  if (!on) return (
    <div className="isl3-lyr consent">
      <Music2 size={18} aria-hidden />
      <p>{t("Liedtexte kommen von lrclib.net (kostenlos, ohne Konto). Dafür werden Titel und Interpret des laufenden Lieds dorthin geschickt.")}</p>
      <button type="button" className="isl2-chip" onClick={() => { setLyricsOn(true); setOn(true); }}>{t("Liedtexte einschalten")}</button>
    </div>
  );
  if (!np?.active) return <div className="isl3-lyr"><span className="isl2-sub">{t("Gerade läuft nichts.")}</span></div>;
  const off = <button type="button" className="isl3-lyroff" onClick={() => { setLyricsOn(false); setOn(false); }}>{t("Liedtexte ausschalten")}</button>;
  if (state.key !== key || state.loading) return <div className="isl3-lyr"><span className="isl2-sub">{t("Liedtext wird gesucht …")}</span></div>;
  if (state.error) return <div className="isl3-lyr"><span className="isl2-sub">{t("lrclib.net ist gerade nicht erreichbar.")}</span>{off}</div>;
  if (!state.lyrics) return <div className="isl3-lyr"><span className="isl2-sub">{t("Für dieses Lied gibt es dort keinen Liedtext.")}</span>{off}</div>;
  return (
    <div className="isl3-lyr">
      {synced
        ? (
          <div className="isl3-lyrview" ref={viewRef}>
            <ol className="isl3-lines" ref={listRef} aria-label={t("Liedtext")} style={{ transform: `translateY(${shift}px)` }}>
              {synced.map((l, i) => <li key={i} className={i === at ? "now" : i < at ? "past" : Math.abs(i - at) === 1 ? "near" : undefined} aria-current={i === at ? "true" : undefined}>{l.text || "♪"}</li>)}
            </ol>
          </div>
        )
        : <pre className="isl3-plain" aria-label={t("Liedtext")}>{state.lyrics.plain}</pre>}
      <span className="isl3-lyrsrc">{t("Quelle: lrclib.net")} · {off}</span>
    </div>
  );
}

// ------------------------------------------------------------------ volume bar (music, PC area)
/** The PC's volume as one wide bar with a mute button – instead of separate quieter/louder keys. Without volume control (no Windows companion)
 *  it falls back to the media keys, shown as one compact group. */
export function PcVolumeBar({ controls, canUse, press }: { controls: ReturnType<typeof usePcControls>; canUse: boolean; press: (key: string) => void }) {
  const c = controls.data;
  const [local, setLocal] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setLocal(null), [c?.volume, c?.muted]);
  if (c?.volume == null) return (
    <span className="isl3-vkeys" role="group" aria-label={t("Lautstärke am PC")}>
      <button type="button" disabled={!canUse} onClick={() => press("voldown")} aria-label={t("Leiser")}><Volume1 size={15} /></button>
      <button type="button" disabled={!canUse} onClick={() => press("mute")} aria-label={t("Stumm")}><VolumeX size={15} /></button>
      <button type="button" disabled={!canUse} onClick={() => press("volup")} aria-label={t("Lauter")}><Volume2 size={15} /></button>
    </span>
  );
  const muted = !!c.muted;
  const v = local ?? c.volume;
  const send = (patch: Record<string, unknown>, wait: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => client.call("controls.set", patch).then(() => controls.reload(), (e: Error) => { toast(e.message, "error"); setLocal(null); }), wait);
  };
  return (
    <span className="isl3-vbar" style={{ ["--v" as string]: muted ? 0 : v } as CSSProperties}>
      <button type="button" className={muted ? "on" : ""} disabled={!canUse} aria-pressed={muted} aria-label={t("Stumm")} onClick={() => send({ muted: !muted }, 0)}>{muted ? <VolumeX size={15} /> : v < 40 ? <Volume1 size={15} /> : <Volume2 size={15} />}</button>
      <span className="isl3-hbar sm"><span className="isl3-hfill" aria-hidden /><input type="range" min={0} max={100} value={v} disabled={!canUse} aria-label={t("Lautstärke am PC")} onChange={(e) => { const x = Number(e.target.value); setLocal(x); send({ volume: x, ...(muted ? { muted: false } : {}) }, 110); }} /></span>
      <i>{muted ? t("Stumm") : `${v}`}</i>
    </span>
  );
}

/** "Continue on the phone": the PC pauses and the phone opens the same song in Spotify (or YouTube for a song from the browser).
 *  The place in the song is not carried over – the PC does not say where it is in a way another device could use. */
export function handoffUrl(np: Pick<NowPlaying, "app" | "title" | "artist">): string {
  const q = encodeURIComponent(`${np.title} ${np.artist}`.trim());
  if (/spotify/i.test(np.app)) return `https://open.spotify.com/search/${q}`;
  if (/firefox|chrome|edge|opera|brave|browser/i.test(np.app)) return `https://www.youtube.com/results?search_query=${q}`;
  return `https://music.youtube.com/search?q=${q}`;
}
export const onTouchDevice = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
