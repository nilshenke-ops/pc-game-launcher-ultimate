// Widgets im geöffneten Fenster der JARVIS-Insel. Messwerte kommen nur vom PC und nur, solange das Fenster offen ist
// (der PC misst dann; Schließen beendet es). Was der PC nicht messen kann, steht als „n. v.“ da – nie eine erfundene Zahl.
import { useEffect, useState } from "react";
import { StickyNote, Thermometer, Volume1, Volume2, VolumeX, Wifi } from "lucide-react";
import { t } from "../lib/i18n";
import { readJson, writeJson } from "../lib/rpc";
import { useEvent, useLiveSubscription } from "../lib/hooks";
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

