// Widgets im geöffneten Fenster der JARVIS-Insel. Messwerte kommen nur vom PC und nur, solange das Fenster offen ist
// (der PC misst dann; Schließen beendet es). Was der PC nicht messen kann, steht als „n. v.“ da – nie eine erfundene Zahl.
import { useEffect, useState } from "react";
import { Music2, Pause, Play, Rocket, RotateCcw, StickyNote, Swords, Thermometer, Timer, Volume1, Volume2, VolumeX, Wifi } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { readJson, writeJson } from "../lib/rpc";
import { toast, useEvent, useLiveSubscription, useRpc } from "../lib/hooks";
import { homeRecent, type HistoryData } from "../lib/home-data";
import { islandAnswer } from "../lib/island";
import { useTimer, watchMs, watchReset, watchText, watchToggle } from "../lib/island-timer";
import type { LibraryItem, ProfilesFile, SoundsFile } from "../lib/types";
import { islandStats } from "../lib/island-stats";
import { cleanNote, islandTemps, netRows, NOTE_MAX } from "../lib/island-widgets";
import type { MetricsSample } from "../lib/types";
import { useNetworkHistory } from "./MonitorExtras";

function useIslandMetrics(online: boolean) {
  const [m, setM] = useState<MetricsSample | null>(null);
  useLiveSubscription<MetricsSample>("monitor", setM, undefined, online);
  useEvent<MetricsSample>("monitor.sample", (d) => { if (online) setM(d); });
  return online ? m : null;
}

/** CPU, RAM and GPU load. */
export function IslandStats({ online }: { online: boolean }) {
  const stats = islandStats(useIslandMetrics(online));
  return (
    <div className="isl-card isl-stats" aria-label={t("PC-Werte")}>
      {stats.map((x) => (
        <div key={x.id} className="isl-stat"><span className="tiny muted">{x.label}</span><b>{x.text}</b><i style={{ transform: `scaleX(${(x.pct ?? 0) / 100})` }} /></div>
      ))}
    </div>
  );
}

/** CPU and GPU temperature; FPS only when the PC really measures it (the companion has no frame-capture service yet). */
export function IslandTemps({ online }: { online: boolean }) {
  const x = islandTemps(useIslandMetrics(online));
  return (
    <div className="isl-card isl-stats isl-temps" aria-label={t("Temperatur & FPS")}>
      <span className="isl-ic"><Thermometer size={18} /></span>
      <div className="isl-stat"><span className="tiny muted">CPU</span><b>{x.cpu}</b></div>
      <div className="isl-stat"><span className="tiny muted">GPU</span><b>{x.gpu}</b></div>
      <div className="isl-stat"><span className="tiny muted">FPS</span><b title={x.fps === "n. v." ? t("Der PC kann FPS gerade nicht messen (dafür braucht der Begleiter einen Frame-Capture-Dienst wie PresentMon).") : undefined}>{x.fps}</b></div>
    </div>
  );
}

function NetLive() {
  const { hist, err } = useNetworkHistory();
  const rows = netRows(hist);
  return (
    <div className="isl-main">
      <b>{t("Netzwerk")}</b>
      {err ? <span className="tiny muted">{err}</span> : rows.length === 0 ? <span className="tiny muted">{t("Misst …")}</span>
        : rows.map((r) => <div key={r.id} className="row between tiny"><span className="muted">{r.label}</span><b className={r.ok ? "" : "isl-bad"}>{r.text}</b></div>)}
    </div>
  );
}
/** Ping to router and internet – the PC pings only while this card is on screen. */
export function IslandNet({ online }: { online: boolean }) {
  return (
    <div className="isl-card">
      <span className="isl-ic"><Wifi size={18} /></span>
      {online ? <NetLive /> : <div className="isl-main"><b>{t("Netzwerk")}</b><span className="tiny muted">{t("PC nicht verbunden")}</span></div>}
    </div>
  );
}

/** System volume with the media keys of the PC (quieter, mute, louder) – the PC does not report the current level. */
export function IslandVolume({ enabled, press }: { enabled: boolean; press: (key: string) => void }) {
  return (
    <div className="isl-card">
      <div className="isl-main">
        <b>{t("Lautstärke am PC")}</b>
        <div className="row isl-mini">
          <button type="button" className="btn icon sm" disabled={!enabled} onClick={() => press("voldown")} aria-label={t("Leiser")}><Volume1 size={16} /></button>
          <button type="button" className="btn icon sm" disabled={!enabled} onClick={() => press("mute")} aria-label={t("Stumm")}><VolumeX size={16} /></button>
          <button type="button" className="btn icon sm" disabled={!enabled} onClick={() => press("volup")} aria-label={t("Lauter")}><Volume2 size={16} /></button>
        </div>
      </div>
    </div>
  );
}

const NOTE_KEY = "pgl.island.note";
/** A short note, kept only on this PC (the window's own storage). */
export function IslandNote() {
  const [text, setText] = useState(() => cleanNote(readJson<string>(NOTE_KEY)));
  useEffect(() => {
    const id = window.setTimeout(() => writeJson(NOTE_KEY, text || null), 400);
    return () => window.clearTimeout(id);
  }, [text]);
  return (
    <div className="isl-card isl-note">
      <span className="isl-ic"><StickyNote size={18} /></span>
      <div className="isl-main">
        <textarea className="input" rows={3} maxLength={NOTE_MAX} value={text} placeholder={t("Notiz …")} aria-label={t("Notiz")} onChange={(e) => setText(cleanNote(e.target.value))} />
        <span className="tiny muted">{t("Nur auf diesem PC gespeichert · {n}/{m}", { n: text.length, m: NOTE_MAX })}</span>
      </div>
    </div>
  );
}


/** Stopwatch – keeps running when the panel is closed (the state lives in island-timer). */
export function IslandStopwatch() {
  const tm = useTimer();
  const [now, setNow] = useState(Date.now());
  const running = tm.watchStart != null;
  useEffect(() => { if (!running) return; const id = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(id); }, [running]);
  return (
    <div className="isl-card isl3-swcard">
      <span className="isl-ic"><Timer size={18} /></span>
      <div className="isl-main">
        <b className="isl-big" aria-label={t("Stoppuhr")}>{watchText(watchMs(tm, running ? now : Date.now()))}</b>
        <div className="row isl-mini">
          <button type="button" className="chip" onClick={() => { setNow(Date.now()); watchToggle(); }}>{running ? <><Pause size={13} /> {t("Anhalten")}</> : <><Play size={13} /> {tm.watchAcc > 0 ? t("Weiter") : t("Start")}</>}</button>
          {(tm.watchAcc > 0 || running) && <button type="button" className="chip" onClick={watchReset} aria-label={t("Zurücksetzen")}><RotateCcw size={13} /></button>}
        </div>
      </div>
    </div>
  );
}

/** The game or program started last – one tap starts it again (needs the PC and the right to launch). */
export function IslandStart({ online, canLaunch }: { online: boolean; canLaunch: boolean }) {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"], online);
  const hist = useRpc<HistoryData>("history.get", {}, ["history"], online);
  const last = homeRecent(lib.data?.items, hist.data, 1)[0];
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!last) return;
    setBusy(true);
    try { await client.call("library.launch", { id: last.id }); islandAnswer(t("{n} wird gestartet", { n: last.name }), true); }
    catch (e) { islandAnswer((e as Error).message, false); }
    finally { window.setTimeout(() => setBusy(false), 900); }
  };
  return (
    <div className="isl-card">
      <span className="isl-ic"><Rocket size={18} /></span>
      <div className="isl-main">
        <b className="ellipsis">{last ? last.name : t("Noch nichts gestartet")}</b>
        <div className="row isl-mini">
          <button type="button" className="chip" disabled={!last || !online || !canLaunch || busy} onClick={() => void go()}><Play size={13} /> {t("Starten")}</button>
        </div>
      </div>
    </div>
  );
}

/** Profiles of the PC. A tap does not switch at once: JARVIS asks first (the question bar with Erlauben/Ablehnen). */
export function IslandProfiles({ online, canLaunch }: { online: boolean; canLaunch: boolean }) {
  const q = useRpc<ProfilesFile>("profiles.list", {}, ["profiles"], online);
  const list = (q.data?.profiles ?? []).slice(0, 4);
  return (
    <div className="isl-card">
      <span className="isl-ic"><Swords size={18} /></span>
      <div className="isl-main">
        <b>{t("Profile")}</b>
        {list.length === 0 ? <span className="tiny muted">{online ? t("Noch kein Profil angelegt") : t("PC nicht verbunden")}</span> : (
          <div className="row isl-mini">
            {list.map((p) => (
              <button key={p.id} type="button" className={`chip ${q.data?.activeProfileId === p.id ? "on" : ""}`} disabled={!online || !canLaunch} aria-pressed={q.data?.activeProfileId === p.id}
                onClick={() => islandAnswer(t("Profil „{n}“ aktivieren?", { n: p.name }), null, [{ kind: "run", label: t("Profil „{n}“ aktivieren", { n: p.name }), method: "profiles.activate", params: { id: p.id }, confirm: true }])}>{p.name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The first sounds of the soundboard – a tap plays one on the PC. */
export function IslandSounds({ online, canPlay }: { online: boolean; canPlay: boolean }) {
  const q = useRpc<{ data: SoundsFile }>("sounds.list", {}, ["sounds"], online);
  const list = (q.data?.data.sounds ?? []).slice(0, 4);
  return (
    <div className="isl-card">
      <span className="isl-ic"><Music2 size={18} /></span>
      <div className="isl-main">
        <b>{t("Sounds")}</b>
        {list.length === 0 ? <span className="tiny muted">{online ? t("Noch keine Sounds") : t("PC nicht verbunden")}</span> : (
          <div className="row isl-mini">
            {list.map((x) => <button key={x.id} type="button" className="chip" disabled={!online || !canPlay} onClick={() => client.call("sounds.play", { id: x.id }).catch((e: Error) => toast(e.message, "error"))}>{x.name.length > 14 ? x.name.slice(0, 13) + "…" : x.name}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}
