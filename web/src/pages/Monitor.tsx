import { useEffect, useRef, useState } from "react";
import { Cpu, Gauge as GaugeIcon, HardDrive, MemoryStick, MonitorPlay, Timer } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useEvent } from "../lib/hooks";
import { bytes, clock } from "../lib/format";
import type { MetricsSample } from "../lib/types";
import { Banner, Card, OfflineState, Gauge, Meter, PageHead, Sparkline } from "../components/ui";

const NA = () => t("Nicht verfügbar");

export default function Monitor() {
  const [m, setM] = useState<MetricsSample | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hist = useRef<{ cpu: (number | undefined)[]; ram: (number | undefined)[]; gpu: (number | undefined)[] }>({ cpu: [], ram: [], gpu: [] });

  const push = (s: MetricsSample) => {
    const h = hist.current;
    const ram = s.memTotalBytes && s.memUsedBytes != null ? (s.memUsedBytes / s.memTotalBytes) * 100 : undefined;
    h.cpu = [...h.cpu, s.cpuPercent].slice(-60);
    h.ram = [...h.ram, ram].slice(-60);
    h.gpu = [...h.gpu, s.gpus[0]?.utilPercent].slice(-60);
    setM(s);
  };
  // Sampling on the PC only runs while this page (or the dashboard widget) is open.
  const authed = useConn().auth === "ok";
  useEffect(() => {
    setErr(null);
    client.call<MetricsSample>("monitor.subscribe").then(push).catch((e) => setErr(e.message));
    return () => { client.call("monitor.unsubscribe").catch(() => {}); };
  }, [authed]);
  useEvent<MetricsSample>("monitor.sample", push);

  const ramPct = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const gpu = m?.gpus[0];
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("PC Monitor")} text={t("Live-Werte deines Gaming-PCs. Abgefragt wird nur, solange diese Ansicht offen ist (alle 2 Sekunden).")} />
      {!m && !authed ? <OfflineState /> : err && <Banner kind="error">{err}</Banner>}
      {!m && !authed ? null : !m ? <div className="grid-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}</div> : (
        <div className="stack">
          <div className="grid-3">
            <Card title="CPU" icon={<Cpu size={18} />} meta={m.sources.cpu}>
              <div className="row nowrap"><Gauge value={m.cpuPercent} label="CPU" /><div className="stack-sm grow"><b className="small">{m.cpuName ?? NA()}</b><span className="small muted">{m.cpuCores} {t("Kerne")}</span><span className="small muted">{t("Temperatur")}: {m.cpuTempC != null ? `${m.cpuTempC} °C` : NA()}</span></div></div>
              <Sparkline values={hist.current.cpu} />
              {m.cpuTempC == null && <p className="tiny muted">{m.cpuTempSource}</p>}
            </Card>
            <Card title={t("Arbeitsspeicher")} icon={<MemoryStick size={18} />} meta={m.sources.ram}>
              <div className="row nowrap"><Gauge value={ramPct} label="RAM" /><div className="stack-sm grow"><b>{bytes(m.memUsedBytes)}</b><span className="small muted">{t("von {x}", { x: bytes(m.memTotalBytes) })}</span></div></div>
              <Sparkline values={hist.current.ram} />
            </Card>
            <Card title={t("Grafikkarte")} icon={<MonitorPlay size={18} />} meta={gpu?.source}>
              {gpu ? (
                <>
                  <div className="row nowrap"><Gauge value={gpu.utilPercent} label="GPU" /><div className="stack-sm grow"><b className="small">{gpu.name}</b>
                    <span className="small muted">{t("Temperatur")}: {gpu.tempC != null ? `${gpu.tempC} °C` : NA()}</span>
                    <span className="small muted">VRAM: {gpu.memTotalBytes ? `${bytes(gpu.memUsedBytes)} / ${bytes(gpu.memTotalBytes)}` : NA()}</span></div></div>
                  <Sparkline values={hist.current.gpu} />
                </>
              ) : <p className="muted">{t("Keine Datenquelle vorhanden.")}</p>}
            </Card>
          </div>
          <div className="grid-2">
            <Card title={t("Datenträger")} icon={<HardDrive size={18} />}>
              <div className="stack">
                {m.disks.length === 0 && <p className="muted small">{NA()}</p>}
                {m.disks.map((d) => (
                  <div key={d.name} className="stack-sm">
                    <div className="row between small"><b>{d.name} {d.label && d.label !== d.name ? `· ${d.label}` : ""}</b><span className="muted">{t("{f} frei von {t}", { f: bytes(d.freeBytes), t: bytes(d.totalBytes) })}</span></div>
                    <Meter value={((d.totalBytes - d.freeBytes) / d.totalBytes) * 100} />
                  </div>
                ))}
              </div>
            </Card>
            <Card title={t("FPS & Frametime")} icon={<GaugeIcon size={18} />}>
              <div className="stack">
                <span className="badge warn">{NA()}</span>
                <p className="small muted">{m.fpsStatus}</p>
                <div className="row small"><Timer size={15} className="muted" />{t("Laufzeit: {h} h", { h: m.uptimeHours ?? "–" })}</div>
                <p className="tiny muted">{t("Zuletzt aktualisiert: {t}", { t: clock(m.at) })}</p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
