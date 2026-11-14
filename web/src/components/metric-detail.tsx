// Every value of the island can be tapped (3.66): CPU, GPU, VRAM, RAM, drives, FPS, network, ping, battery – and the analysis.
// The detail opens over the island (no page change): the live value, its history (1 min / 10 min / 1 h – only what the PC measured
// while somebody looked; gaps stay gaps), the facts, and what the value means. Nothing here is estimated: a value the PC does not
// report says so.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, ArrowDown, ArrowUp, BatteryMedium, Cpu, Gauge, HardDrive, Info, Lightbulb, MemoryStick, Network, Radio, ShieldCheck, Sparkles, X, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useEvent, useLiveSubscription } from "../lib/hooks";
import { dataSize, fileSpeed, mbit, netSpeed } from "../lib/units";
import type { DriveHealth, FpsSession, HistoryPoint, MetricsSample, PerfFinding } from "../lib/types";

export type DetailKind = "cpu" | "gpu" | "vram" | "ram" | "disk" | "fps" | "net" | "ping" | "battery" | "insights";
const KINDS: { id: DetailKind; label: string; icon: ReactNode }[] = [
  { id: "insights", label: "Analyse", icon: <Sparkles size={13} /> },
  { id: "fps", label: "FPS", icon: <Gauge size={13} /> },
  { id: "cpu", label: "CPU", icon: <Cpu size={13} /> },
  { id: "gpu", label: "GPU", icon: <Zap size={13} /> },
  { id: "vram", label: "VRAM", icon: <Zap size={13} /> },
  { id: "ram", label: "RAM", icon: <MemoryStick size={13} /> },
  { id: "disk", label: "Speicher", icon: <HardDrive size={13} /> },
  { id: "net", label: "Netzwerk", icon: <Network size={13} /> },
  { id: "ping", label: "Ping", icon: <Radio size={13} /> },
  { id: "battery", label: "Akku", icon: <BatteryMedium size={13} /> },
];
const RANGES = [{ s: 60, l: "1 min" }, { s: 600, l: "10 min" }, { s: 3600, l: "1 h" }] as const;
const pct = (n: number | null | undefined) => (n == null ? "n. v." : `${Math.round(n)} %`);
const gb = (b: number | null | undefined) => (b == null ? "n. v." : `${(b / 1073741824).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`);
const deg = (n: number | null | undefined) => (n == null ? null : `${Math.round(n)} °C`);
const num = (n: number | null | undefined, d = 0) => (n == null ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: d }));

/** The live sample (the island already subscribes; this shares it). */
function useLive(online: boolean) {
  const [m, setM] = useState<MetricsSample | null>(null);
  useLiveSubscription<MetricsSample>("monitor", setM, undefined, online);
  useEvent<MetricsSample>("monitor.sample", (d) => { if (online) setM(d); });
  return m;
}

function useHistory(seconds: number, online: boolean) {
  const [pts, setPts] = useState<HistoryPoint[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!online) return;
    let gone = false;
    client.call<{ points: HistoryPoint[] }>("monitor.history", { seconds, points: 90 }).then((r) => { if (!gone) setPts(r.points); }, () => { if (!gone) setPts([]); });
    const id = window.setTimeout(() => setTick((x) => x + 1), seconds <= 60 ? 4000 : 15000);
    return () => { gone = true; window.clearTimeout(id); };
  }, [seconds, online, tick]);
  return pts;
}

/** A line chart of real points; a missing value breaks the line (no invented values in between). */
export function Chart({ values, max, color, label, unit }: { values: (number | null | undefined)[]; max?: number; color: string; label: string; unit: string }) {
  const ok = values.filter((v): v is number => v != null);
  if (ok.length < 2) return <p className="isl2-sub md-empty">{t("Noch kein Verlauf. Der PC misst nur, während jemand zusieht – lass die Ansicht offen, dann füllt sich die Kurve.")}</p>;
  const top = max ?? Math.max(1, ...ok) * 1.15;
  const n = values.length;
  const segs: string[] = []; let cur: string[] = [];
  values.forEach((v, i) => {
    if (v == null) { if (cur.length > 1) segs.push(cur.join(" ")); cur = []; return; }
    cur.push(`${((i / Math.max(1, n - 1)) * 100).toFixed(2)},${(40 - (Math.min(v, top) / top) * 38).toFixed(2)}`);
  });
  if (cur.length > 1) segs.push(cur.join(" "));
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  return (
    <figure className="md-chart" style={{ ["--c" as string]: color } as CSSProperties}>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={t("{l}: Verlauf, Durchschnitt {a}", { l: label, a: `${num(avg, 1)} ${unit}` })}>
        {segs.map((p, i) => <polyline key={i} points={p} />)}
      </svg>
      <figcaption className="tiny muted">{t("Min. {a} · Ø {b} · Max. {c}", { a: `${num(Math.min(...ok), 1)} ${unit}`, b: `${num(avg, 1)} ${unit}`, c: `${num(Math.max(...ok), 1)} ${unit}` })}</figcaption>
    </figure>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className="md-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}
function Explain({ children }: { children: ReactNode }) { return <p className="md-explain"><Info size={13} aria-hidden /> <span>{children}</span></p>; }

export function MetricDetail({ kind, onKind, onClose, online, floating, onProcs, battery }: {
  kind: DetailKind; onKind: (k: DetailKind) => void; onClose: () => void; online: boolean; floating?: boolean;
  onProcs?: (k: "cpu" | "ram") => void; battery?: { battery: number | null; charging?: boolean | null; supported?: boolean } | null;
}) {
  const m = useLive(online);
  const [range, setRange] = useState<number>(60);
  const hist = useHistory(range, online && kind !== "insights" && kind !== "ping");
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const meta = KINDS.find((k) => k.id === kind)!;
  const series = (f: (p: HistoryPoint) => number | null | undefined) => (hist ?? []).map(f);

  let body: ReactNode = null;
  const gpu = m?.gpus?.[0];
  if (!online) body = <p className="isl2-sub">{t("PC nicht verbunden.")}</p>;
  else if (kind === "insights") body = <Insights onProcs={onProcs} onKind={onKind} />;
  else if (kind === "fps") body = <FpsDetail live={m?.fps ?? null} chart={<Chart values={series((p) => p.fps)} color="#f472b6" label="FPS" unit="FPS" />} />;
  else if (kind === "ping") body = <PingDetail />;
  else if (kind === "cpu") body = (
    <>
      <Big value={pct(m?.cpuPercent)} sub={[deg(m?.cpuTempC), m?.cpuName].filter(Boolean).join(" · ")} />
      <Chart values={series((p) => p.cpu)} max={100} color="#38bdf8" label="CPU" unit="%" />
      {series((p) => p.cpuTemp).some((v) => v != null) && <Chart values={series((p) => p.cpuTemp)} color="#fb923c" label={t("CPU-Temperatur")} unit="°C" />}
      <Rows rows={[[t("Kerne"), num(m?.cpuCores)], [t("Temperatur"), deg(m?.cpuTempC) ?? <span className="muted">{t("nicht verfügbar")}</span>], [t("Begleiter selbst"), m?.self ? `${num(m.self.cpuPercent, 1)} % · ${num(m.self.ramMb)} MB` : "–"]]} />
      {m?.cpuTempC == null && m?.cpuTempSource && m.cpuTempSource.length > 20 && <p className="tiny muted">{m.cpuTempSource}</p>}
      {onProcs && <button type="button" className="isl3-chipbtn" onClick={() => onProcs("cpu")}>{t("Programme nach CPU-Last")}</button>}
      <Explain>{t("Die Auslastung ist der Anteil der Zeit, in der der Prozessor rechnet. Dauerhaft über 90 % im Spiel kann bedeuten, dass er das Spiel bremst – dann wartet die Grafikkarte.")}</Explain>
    </>
  );
  else if (kind === "gpu") body = (
    <>
      <Big value={pct(gpu?.utilPercent)} sub={[deg(gpu?.tempC), gpu?.name].filter(Boolean).join(" · ")} />
      <Chart values={series((p) => p.gpu)} max={100} color="#34d399" label="GPU" unit="%" />
      {series((p) => p.gpuTemp).some((v) => v != null) && <Chart values={series((p) => p.gpuTemp)} color="#fb923c" label={t("GPU-Temperatur")} unit="°C" />}
      <Rows rows={[[t("Grafikkarte"), gpu?.name ?? "–"], [t("Temperatur"), deg(gpu?.tempC) ?? <span className="muted">{t("nicht verfügbar")}</span>], [t("Grafikspeicher"), gpu?.memTotalBytes ? `${gb(gpu.memUsedBytes)} / ${gb(gpu.memTotalBytes)}` : <span className="muted">{t("nicht verfügbar")}</span>], [t("Quelle"), gpu?.source ?? "–"]]} />
      <button type="button" className="isl3-chipbtn" onClick={() => onKind("vram")}>{t("Grafikspeicher (VRAM)")}</button>
      <Explain>{t("Im Spiel ist eine hohe GPU-Last normal: Sie liefert so viele Bilder wie möglich. Takt und Lüfter liefert Windows ohne Herstellerwerkzeug nicht zuverlässig – sie werden deshalb nicht gezeigt.")}</Explain>
    </>
  );
  else if (kind === "vram") {
    const vp = gpu?.memTotalBytes && gpu.memUsedBytes != null ? (gpu.memUsedBytes / gpu.memTotalBytes) * 100 : null;
    body = (
      <>
        <Big value={vp == null ? "n. v." : pct(vp)} sub={gpu?.memTotalBytes ? `${gb(gpu.memUsedBytes)} / ${gb(gpu.memTotalBytes)}` : t("Dieser PC meldet den Grafikspeicher nicht (nur NVIDIA über nvidia-smi).")} />
        <Chart values={series((p) => p.vram)} max={100} color="#a78bfa" label="VRAM" unit="%" />
        <Explain>{t("Der Grafikspeicher hält Texturen und Bilder. Ist er voll, kommen Daten über den langsameren Arbeitsspeicher – typisch sind kurze Hänger. Abhilfe: Texturqualität senken.")}</Explain>
      </>
    );
  } else if (kind === "ram") {
    const rp = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
    body = (
      <>
        <Big value={pct(rp)} sub={m?.memTotalBytes ? `${gb(m.memUsedBytes)} / ${gb(m.memTotalBytes)}` : undefined} />
        <Chart values={series((p) => p.ram)} max={100} color="#c084fc" label="RAM" unit="%" />
        <Rows rows={[[t("Belegt"), gb(m?.memUsedBytes)], [t("Verfügbar"), m?.memTotalBytes != null && m.memUsedBytes != null ? gb(m.memTotalBytes - m.memUsedBytes) : "–"], [t("Gesamt"), gb(m?.memTotalBytes)]]} />
        {onProcs && <button type="button" className="isl3-chipbtn" onClick={() => onProcs("ram")}>{t("Programme nach Arbeitsspeicher")}</button>}
        <Explain>{t("Über etwa 90 % lagert Windows auf das Laufwerk aus – das führt zu Rucklern. Browser mit vielen Tabs brauchen oft am meisten.")}</Explain>
      </>
    );
  } else if (kind === "disk") body = <DiskDetail m={m} chart={<><Chart values={series((p) => p.diskRead)} color="#fbbf24" label={t("Lesen")} unit="B/s" /><Chart values={series((p) => p.diskWrite)} color="#f97316" label={t("Schreiben")} unit="B/s" /></>} />;
  else if (kind === "net") body = (
    <>
      <div className="md-big2">
        <span><ArrowDown size={16} aria-hidden /><b>{netSpeed(m?.net?.downBps)}</b><i>{t("Download")}</i></span>
        <span><ArrowUp size={16} aria-hidden /><b>{netSpeed(m?.net?.upBps)}</b><i>{t("Upload")}</i></span>
      </div>
      <Chart values={series((p) => (p.down == null ? null : mbit(p.down)))} color="#60a5fa" label={t("Download")} unit="Mbit/s" />
      <Chart values={series((p) => (p.up == null ? null : mbit(p.up)))} color="#22d3ee" label={t("Upload")} unit="Mbit/s" />
      <Rows rows={[
        ...(m?.net?.links ?? []).map((l): [string, ReactNode] => [l.kind === "wlan" ? t("WLAN") : l.kind === "ethernet" ? t("LAN-Kabel") : l.kind === "mobile" ? t("Mobilfunk") : t("Verbindung"), `${l.name}${l.speedBps ? ` · ${t("Verbindung mit {s}", { s: netSpeed(l.speedBps / 8) })}` : ""}`]),
        [t("Empfangen seit Begleiter-Start"), dataSize(m?.net?.rxSinceStart)],
        [t("Gesendet seit Begleiter-Start"), dataSize(m?.net?.txSinceStart)],
      ]} />
      <button type="button" className="isl3-chipbtn" onClick={() => onKind("ping")}>{t("Ping und Paketverlust")}</button>
      <Explain>{t("Geschwindigkeit in Mbit/s (wie beim Anbieter und in Speedtests), Datenmengen in MB/GB. Gezeigt wird, was der PC gerade wirklich überträgt – kein Speedtest.")}</Explain>
    </>
  );
  else if (kind === "battery") body = battery?.battery != null
    ? <><Big value={`${battery.battery} %`} sub={battery.charging ? t("Netzbetrieb") : t("Akkubetrieb")} /><Explain>{t("Den Energieverbrauch in Watt meldet Windows nicht zuverlässig – er wird deshalb nicht gezeigt.")}</Explain></>
    : <p className="isl2-sub">{battery && !battery.supported ? t("Den Akku liest nur der Windows-Begleiter.") : t("Dieser PC hat keinen Akku (läuft am Netz).")}</p>;

  const box = (
    <div className={`isl3-sheet md${floating ? " modal" : ""}`} role="dialog" aria-modal={floating || undefined} aria-label={t("{n} im Detail", { n: t(meta.label) })}>
      <div className="isl3-sheethead">
        <b>{meta.icon} {t(meta.label)}</b>
        <button type="button" className="isl3-mini" onClick={onClose} aria-label={t("Zurück zur Insel")}><X size={15} /></button>
      </div>
      <nav className="md-kinds" aria-label={t("Messwert wählen")}>
        {KINDS.map((k) => <button key={k.id} type="button" className={k.id === kind ? "on" : ""} aria-pressed={k.id === kind} onClick={() => onKind(k.id)}>{k.icon}{t(k.label)}</button>)}
      </nav>
      <div className="isl3-sheetbody md-body">
        {kind !== "insights" && kind !== "ping" && kind !== "battery" && (
          <span className="isl3-seg md-range" role="radiogroup" aria-label={t("Zeitraum")}>
            {RANGES.map((r) => <button key={r.s} type="button" role="radio" aria-checked={range === r.s} className={range === r.s ? "on" : ""} onClick={() => setRange(r.s)}>{r.l}</button>)}
          </span>
        )}
        {body}
      </div>
    </div>
  );
  return floating ? createPortal(<div className="isl3-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>{box}</div>, document.body) : box;
}

function Big({ value, sub }: { value: string; sub?: string }) {
  return <div className="md-big"><b>{value}</b>{sub && <span className="isl2-sub">{sub}</span>}</div>;
}

// ------------------------------------------------------------------ FPS
function FpsDetail({ live, chart }: { live: MetricsSample["fps"]; chart: ReactNode }) {
  const [sessions, setSessions] = useState<FpsSession[] | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { client.call<{ sessions: FpsSession[] }>("fps.sessions", {}).then((r) => setSessions(r.sessions), () => setSessions([])); }, []);
  if (!live) return <p className="isl2-sub">{t("Der Begleiter auf dem PC misst noch keine FPS – bitte aktualisieren.")}</p>;
  const allow = () => client.call<{ message: string }>("fps.allow", {}).then((r) => setMsg(r.message), (e: Error) => setMsg(/local|nur am PC|Berechtigung/i.test(e.message) ? t("„Erlauben“ geht nur direkt am PC (Windows fragt dort nach).") : e.message));
  const ft = live.frameTimes ?? [];
  return (
    <>
      {live.state === "measuring" ? (
        <>
          <Big value={`${num(live.fps)} FPS`} sub={[live.game, live.api].filter(Boolean).join(" · ")} />
          <Rows rows={[[t("Durchschnitt"), `${num(live.avg, 1)} FPS`], [t("1 % Low"), live.low1 != null ? `${num(live.low1, 1)} FPS` : t("noch zu wenig Bilder")], [t("0,1 % Low"), live.low01 != null ? `${num(live.low01, 1)} FPS` : t("noch zu wenig Bilder")], [t("Bildzeit"), `${num(live.frameMs, 1)} ms`], [t("Ruckler"), num(live.stutters)], [t("GPU beschäftigt"), live.gpuBusy != null ? `${num(live.gpuBusy)} %` : t("nicht gemeldet")], [t("Gemessen seit"), `${Math.round((live.seconds ?? 0) / 60)} min`]]} />
          {ft.length > 1 && <Chart values={ft} color="#f472b6" label={t("Bildzeit")} unit="ms" />}
        </>
      ) : (
        <div className={`md-state ${live.state}`}>
          {live.state === "permission" ? <ShieldCheck size={18} aria-hidden /> : <Activity size={18} aria-hidden />}
          <span>
            <b>{live.state === "idle" ? t("Bereit") : live.state === "waiting" ? t("Warte auf das Spiel") : live.state === "off" ? t("Ausgeschaltet") : live.state === "permission" ? t("Einmal erlauben") : live.state === "stopped" ? t("Messung beendet") : t("Nicht verfügbar")}</b>
            <span className="isl2-sub">{live.message}</span>
          </span>
          {live.state === "permission" && live.canRequestPermission && <button type="button" className="isl3-chipbtn on" onClick={() => void allow()}>{t("Erlauben")}</button>}
        </div>
      )}
      {msg && <p className="isl2-sub" role="status">{msg}</p>}
      {chart}
      <h4 className="md-h">{t("Letzte Spielsitzungen")}</h4>
      {!sessions ? <p className="isl2-sub">{t("Wird geladen …")}</p> : !sessions.length ? <p className="isl2-sub">{t("Noch keine gemessene Sitzung. Nach dem nächsten Spiel steht sie hier – mit Durchschnitt, 1 %-Low und Vergleich zum letzten Mal.")}</p> : (
        <ul className="md-sessions">
          {sessions.slice(0, 8).map((s) => (
            <li key={s.id}>
              <span><b className="ellipsis">{s.game}</b><i>{new Date(s.startedAt).toLocaleString([], { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {num(s.minutes, 1)} min{s.api ? ` · ${s.api}` : ""}</i></span>
              <span className="md-sv"><b>{num(s.avg)} FPS</b><i>1 % {num(s.low1)}{s.cpuAvg != null ? ` · CPU ${num(s.cpuAvg)} %` : ""}{s.gpuAvg != null ? ` · GPU ${num(s.gpuAvg)} %` : ""}</i></span>
              {s.compare && <span className="tiny muted md-cmp">{s.compare}</span>}
            </li>
          ))}
        </ul>
      )}
      <Explain>{t("Gemessen mit Intel PresentMon: Es liest die Bildausgabe aus Windows (DirectX 9–12, Vulkan, OpenGL) und greift nicht in das Spiel ein. 1 %-Low ist die Bildrate der langsamsten 1 % aller Bilder – sie zeigt Ruckler besser als der Durchschnitt.")}</Explain>
    </>
  );
}

// ------------------------------------------------------------------ drives
function DiskDetail({ m, chart }: { m: MetricsSample | null; chart: ReactNode }) {
  const [health, setHealth] = useState<DriveHealth[] | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const io = m?.diskIo ?? [];
  const check = () => { setBusy(true); client.call<{ drives: DriveHealth[] | null }>("disk.health", {}).then((r) => setHealth(r.drives), (e: Error) => { toast(e.message, "error"); setHealth(null); }).finally(() => setBusy(false)); };
  return (
    <>
      <ul className="md-drives">
        {(m?.disks ?? []).map((d) => {
          const used = d.totalBytes - d.freeBytes, p = d.totalBytes ? (used / d.totalBytes) * 100 : 0;
          const a = io.find((x) => d.name.toUpperCase().startsWith(x.name.toUpperCase()));
          return (
            <li key={d.name} className={p >= 90 ? "low" : ""}>
              <span className="md-dname"><b>{d.name}</b>{d.label && <i>{d.label}</i>}</span>
              <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${p / 100})` }} /></span>
              <span className="tiny">{t("{f} frei von {t} ({p} belegt)", { f: dataSize(d.freeBytes), t: dataSize(d.totalBytes), p: `${Math.round(p)} %` })}</span>
              {a && <span className="tiny muted">{t("Lesen {r} · Schreiben {w} · Aktivität {b}", { r: fileSpeed(a.readBps), w: fileSpeed(a.writeBps), b: a.busyPercent == null ? "–" : `${Math.round(a.busyPercent)} %` })}</span>}
            </li>
          );
        })}
      </ul>
      {!m?.disks?.length && <p className="isl2-sub">{m?.off?.includes("disks") ? t("Laufwerke sind in den Einstellungen ausgeschaltet.") : t("Keine Laufwerke gemeldet.")}</p>}
      {chart}
      <div className="md-health">
        <button type="button" className="isl3-chipbtn" disabled={busy} onClick={check}>{busy ? t("Wird geprüft …") : t("Zustand prüfen (SMART)")}</button>
        {health === null && <p className="isl2-sub">{t("Der Zustand der Laufwerke ist auf diesem PC nicht lesbar (nur Windows, manche Laufwerke melden ihn nicht).")}</p>}
        {health && (
          <ul className="md-rows-list">
            {health.map((h) => (
              <li key={h.name}><b>{h.name}</b> <span className={`badge ${h.health && !/healthy|ok/i.test(h.health) ? "warn" : ""}`}>{h.health ?? "?"}</span>
                <span className="tiny muted">{[h.mediaType, h.tempC != null ? `${Math.round(h.tempC)} °C` : null, h.wearPercent != null ? t("Abnutzung {n} %", { n: h.wearPercent }) : null, h.powerOnHours != null ? t("{n} Betriebsstunden", { n: h.powerOnHours }) : null, (h.readErrors ?? 0) + (h.writeErrors ?? 0) > 0 ? t("{n} Lese-/Schreibfehler", { n: (h.readErrors ?? 0) + (h.writeErrors ?? 0) }) : null].filter(Boolean).join(" · ")}</span></li>
            ))}
          </ul>
        )}
      </div>
      <Explain>{t("Laufwerksgeschwindigkeit in MB/s. Nichts wird automatisch gelöscht – was viel Platz braucht, zeigt die Seite „Speicher“.")}</Explain>
    </>
  );
}

// ------------------------------------------------------------------ ping
interface NetHist { targets: { id: string; label: string; host: string; samples: number; avg: number | null; min: number | null; max: number | null; jitter: number | null; lossPercent: number | null; points: { at: string; ms: number | null }[] }[] }
function PingDetail() {
  const [h, setH] = useState<NetHist | null>(null);
  useEffect(() => {
    let gone = false;
    void client.call("network.subscribe", {}).catch(() => undefined);
    const load = () => client.call<NetHist>("network.history", {}).then((r) => { if (!gone) setH(r); }, () => undefined);
    void load();
    const id = window.setInterval(load, 3000);
    return () => { gone = true; window.clearInterval(id); void client.call("network.unsubscribe", {}).catch(() => undefined); };
  }, []);
  if (!h) return <p className="isl2-sub">{t("Ping wird gemessen …")}</p>;
  return (
    <>
      {h.targets.map((x) => (
        <section key={x.id} className="md-ping">
          <div className="md-big"><b>{x.avg != null ? `${num(x.avg)} ms` : "–"}</b><span className="isl2-sub">{x.label} · {x.host}</span></div>
          <Chart values={x.points.map((p) => p.ms)} color={x.id === "router" ? "#4ade80" : "#60a5fa"} label={x.label} unit="ms" />
          <Rows rows={[[t("Jitter"), x.jitter != null ? `${num(x.jitter, 1)} ms` : "–"], [t("Paketverlust"), x.lossPercent != null ? `${num(x.lossPercent, 1)} %` : "–"], [t("Messungen"), num(x.samples)]]} />
        </section>
      ))}
      <Explain>{t("Gemessen wird alle 2 Sekunden, solange diese Ansicht offen ist. Hoher Ping oder Verlust schon zum Router liegt am Heimnetz (WLAN), sonst am Internet.")}</Explain>
    </>
  );
}

// ------------------------------------------------------------------ analysis
function Insights({ onProcs, onKind }: { onProcs?: (k: "cpu" | "ram") => void; onKind: (k: DetailKind) => void }) {
  const [d, setD] = useState<{ findings: PerfFinding[]; gaming: boolean; self?: MetricsSample["self"] } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    client.call<{ findings: PerfFinding[]; gaming: boolean; self?: MetricsSample["self"] }>("perf.insights", {}).then((r) => { if (!gone) { setD(r); setErr(""); } }, (e: Error) => { if (!gone) setErr(e.message); });
    const id = window.setTimeout(() => setTick((x) => x + 1), 15000);
    return () => { gone = true; window.clearTimeout(id); };
  }, [tick]);
  const act = useMemo(() => (a?: string | null) => {
    if (!a) return null;
    if (a === "procs:cpu" || a === "procs:ram") return onProcs ? <button type="button" className="isl3-chipbtn" onClick={() => onProcs(a === "procs:cpu" ? "cpu" : "ram")}>{t("Programme ansehen")}</button> : null;
    const to: Partial<Record<string, DetailKind>> = { fps: "fps", storage: "disk", network: "ping" };
    return to[a] ? <button type="button" className="isl3-chipbtn" onClick={() => onKind(to[a]!)}>{t("Details")}</button> : null;
  }, [onProcs, onKind]);
  if (err) return <p className="isl2-sub">{/unknown method|unbekannt/i.test(err) ? t("Der Begleiter auf dem PC kann das noch nicht – bitte aktualisieren.") : err}</p>;
  if (!d) return <p className="isl2-sub">{t("Wird ausgewertet …")}</p>;
  return (
    <>
      {d.findings.length === 0 ? (
        <div className="md-state ok"><ShieldCheck size={18} aria-hidden /><span><b>{t("Alles im grünen Bereich")}</b><span className="isl2-sub">{t("Nichts Auffälliges in den gemessenen Werten.")}</span></span></div>
      ) : (
        <ul className="md-findings">
          {d.findings.map((f) => (
            <li key={f.id} className={f.level}>
              <button type="button" className="md-fhead" aria-expanded={open === f.id} onClick={() => setOpen(open === f.id ? null : f.id)}>
                {f.level === "info" ? <Lightbulb size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
                <b>{f.title}</b>
                <span className={`badge ${f.kind === "suspicion" ? "" : "ok"}`}>{f.kind === "suspicion" ? t("Vermutung") : t("gemessen")}</span>
              </button>
              <p className="isl2-sub">{f.what}</p>
              {open === f.id && (
                <div className="md-fbody">
                  <p><b>{t("Warum wichtig:")}</b> {f.why}</p>
                  <p><b>{t("Was hilft:")}</b> {f.fix}</p>
                  <p className="tiny muted"><b>{t("Risiko:")}</b> {f.risk}</p>
                  {act(f.action)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {d.self && <p className="tiny muted">{t("Der Begleiter selbst: {c} CPU, {r} Arbeitsspeicher.", { c: d.self.cpuPercent != null ? `${num(d.self.cpuPercent, 1)} %` : "–", r: `${num(d.self.ramMb)} MB` })}</p>}
      <Explain>{t("Die Analyse liest nur echte Messwerte. „Vermutung“ heißt: eine wahrscheinliche Erklärung, kein Beweis. Nichts wird von selbst geändert – jede Maßnahme ist ein eigener Schritt mit Bestätigung. FPS-Steigerungen kann niemand garantieren.")}</Explain>
    </>
  );
}
