import { useState } from "react";
import { FolderOpen, HardDrive, Lock, Moon, Power, RotateCcw, Wifi, XCircle } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useEvent, useLiveSubscription, useRpc, toast } from "../lib/hooks";
import { bytes, dateTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Loadable, Meter, Sparkline } from "./ui";

export interface NetTarget { id: string; label: string; host: string; samples: number; avg?: number | null; min?: number | null; max?: number | null; jitter?: number | null; lossPercent?: number | null; points: { at: string; ms: number | null }[] }
interface NetSample { at: string; targets: { id: string; label: string; host: string; ms: number | null }[] }

/** Live ping history of all targets; pings run on the PC only while a view using this is open. */
export function useNetworkHistory() {
  const [hist, setHist] = useState<NetTarget[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useLiveSubscription<{ targets: NetTarget[] }>("network", (d) => { setErr(null); setHist(d.targets); }, (e) => setErr(e.message));
  useEvent<NetSample>("network.sample", (s) => setHist((h) => {
    const fresh = (x: NetSample["targets"][number]) => ({ ...x, samples: 0, points: [] as NetTarget["points"] });
    // Targets added meanwhile (own game server) join; removed ones disappear.
    const base = s.targets.map((x) => h?.find((tg) => tg.id === x.id) ?? fresh(x));
    return base.map((tg) => {
      const now = s.targets.find((x) => x.id === tg.id);
      if (!now) return tg;
      const points = [...tg.points, { at: s.at, ms: now.ms }].slice(-150);
      const ok = points.map((p) => p.ms).filter((v): v is number => v != null);
      const jitter = ok.length > 1 ? ok.slice(1).reduce((a, v, i) => a + Math.abs(v - ok[i]), 0) / (ok.length - 1) : null;
      return { ...tg, points, samples: points.length, avg: ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null, min: ok.length ? Math.min(...ok) : null,
        max: ok.length ? Math.max(...ok) : null, jitter, lossPercent: (100 * points.filter((p) => p.ms == null).length) / points.length };
    });
  }));
  return { hist, err };
}

/** Live ping (router + internet) with loss and jitter – pings run only while this card is visible on a device. */
export function NetworkCard() {
  const { hist, err } = useNetworkHistory();
  const fmt = (v?: number | null, unit = " ms") => (v == null ? "–" : `${Math.round(v)}${unit}`);
  return (
    <Card title={t("Netzwerk")} icon={<Wifi size={18} />} meta={t("Ping alle 2 s, nur solange sichtbar")}>
      {err ? <Banner kind="error">{err}</Banner> : !hist ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div className="stack">
          {hist.map((tg) => {
            const last = tg.points[tg.points.length - 1]?.ms;
            return (
              <div key={tg.id} className="stack-sm">
                <div className="row between small"><b>{tg.label} <span className="muted mono tiny">{tg.host}</span></b>
                  <span className={last == null && tg.points.length ? "badge error" : "badge"}>{last == null ? (tg.points.length ? t("keine Antwort") : "–") : `${last} ms`}</span></div>
                <Sparkline values={tg.points.map((p) => p.ms)} max={Math.max(50, ...tg.points.map((p) => p.ms ?? 0))} />
                <div className="row small muted" style={{ gap: 14 }}>
                  <span>{t("Mittel {v}", { v: fmt(tg.avg) })}</span><span>{t("Min {v}", { v: fmt(tg.min) })}</span><span>{t("Max {v}", { v: fmt(tg.max) })}</span>
                  <span>{t("Jitter {v}", { v: fmt(tg.jitter) })}</span>
                  <span className={(tg.lossPercent ?? 0) > 2 ? "text-warn" : ""}>{t("Verlust {v}", { v: tg.lossPercent == null ? "–" : `${tg.lossPercent.toFixed(1)} %` })}</span>
                </div>
              </div>
            );
          })}
          <p className="tiny muted">{t("Verlauf: letzte 30 Minuten, solange die Ansicht offen ist. Manche Router beantworten keinen Ping – dann zählt das als Verlust, obwohl das Internet geht.")}</p>
        </div>
      )}
    </Card>
  );
}

export interface StorageItem {
  id: string; name: string; kind: string; installDir: string; exists: boolean; launcher?: string;
  size?: { bytes: number; files: number; at: string; partial: boolean; fromLauncher?: boolean } | null;
  update?: { status: "current" | "update" | "updating" | "paused" | "damaged" | "unknown"; bytesToDownload?: number; bytesDownloaded?: number; lastUpdated?: string; buildId?: string } | null;
}
export interface StorageInfo {
  drives: { name: string; label: string; total: number; free: number; format: string }[];
  items: StorageItem[];
  scanning?: string | null;
  checkedAt?: string;
}

/** Update state as the launcher reports it; launchers without a readable state say so instead of "up to date". */
export function UpdateBadge({ u }: { u: StorageItem["update"] }) {
  if (!u) return <span className="badge" title={t("Dieser Launcher gibt keinen Update-Stand preis")}>{t("Update-Stand unbekannt")}</span>;
  const rest = u.bytesToDownload ? Math.max(0, u.bytesToDownload - (u.bytesDownloaded ?? 0)) : 0;
  switch (u.status) {
    case "update": return <span className="badge warn">{rest ? t("Update ausstehend ({n})", { n: bytes(rest) }) : t("Update ausstehend")}</span>;
    case "updating": return <span className="badge info">{t("Wird aktualisiert")}</span>;
    case "paused": return <span className="badge warn">{t("Update pausiert")}</span>;
    case "damaged": return <span className="badge error">{t("Dateien fehlen/beschädigt")}</span>;
    case "current": return <span className="badge ok" title={u.lastUpdated ? t("Zuletzt aktualisiert: {d}", { d: dateTime(u.lastUpdated) }) : undefined}>{t("Aktuell")}</span>;
    default: return <span className="badge">{t("Update-Stand unbekannt")}</span>;
  }
}

const needsAttention = (i: StorageItem) => !!i.update && ["update", "updating", "paused", "damaged"].includes(i.update.status);

/** Drives, size and update state of every game with a known install folder. Also without the PC (last known state). */
export function StorageCard({ full = false }: { full?: boolean }) {
  const q = useRpc<StorageInfo>("storage.get", {}, ["storage", "library"]);
  const conn = useConn();
  const online = conn.phase === "online";
  const [filter, setFilter] = useState<"all" | "updates" | "size">("all");
  const scan = () => client.call("storage.scan", {}).then(() => toast(t("Größen werden berechnet – das kann bei großen Spielen dauern"), "info")).catch((e) => toast((e as Error).message, "error"));
  const d = q.data;
  const pending = d?.items.filter(needsAttention) ?? [];
  const shown = (d?.items ?? []).filter((i) => filter !== "updates" || needsAttention(i));
  if (filter === "all") shown.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
  return (
    <Card title={full ? t("Laufwerke") : t("Speicherplatz")} icon={<HardDrive size={18} />} actions={<Button size="sm" busy={!!d?.scanning} disabled={!online} onClick={scan}>{t("Spielgrößen berechnen")}</Button>}>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack">
            {!online && d.checkedAt && <Banner kind="info">{t("Ohne PC: Stand vom {d}", { d: dateTime(d.checkedAt) })}</Banner>}
            {d.drives.map((dr) => (
              <div key={dr.name} className="stack-sm">
                <div className="row between small"><b>{dr.name}{dr.label ? ` · ${dr.label}` : ""}</b><span className="muted">{t("{f} frei von {t}", { f: bytes(dr.free), t: bytes(dr.total) })}</span></div>
                <Meter value={((dr.total - dr.free) / dr.total) * 100} />
              </div>
            ))}
            {d.scanning && <Banner kind="info">{t("Berechne: {n} …", { n: d.scanning })}</Banner>}
            {pending.length > 0 && <Banner kind="warn">{pending.length === 1 ? t("{n} braucht ein Update oder eine Reparatur – im Launcher des Spiels.", { n: pending[0].name }) : t("{n} Spiele brauchen ein Update oder eine Reparatur – im jeweiligen Launcher.", { n: pending.length })}</Banner>}
            {full && d.items.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {([["all", t("Alle")], ["updates", t("Updates ({n})", { n: pending.length })], ["size", t("Nach Größe")]] as const).map(([k, l]) => (
                  <button key={k} type="button" className={`chip ${filter === k ? "on" : ""}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
                ))}
              </div>
            )}
            {d.items.length === 0 ? <p className="small muted">{t("Keine Spiele mit bekanntem Installationsordner (z. B. Steam-, Epic- oder EA-Spiele).")}</p>
              : shown.length === 0 ? <p className="small muted">{t("Keine ausstehenden Updates bei Spielen, die ihren Stand verraten (Steam).")}</p> : (
              <div className="list">
                {shown.slice(0, full ? 500 : 30).map((i) => (
                  <div key={i.id} className="list-item">
                    <div className="grow" style={{ minWidth: 0 }}><div className="title small ellipsis">{i.name}</div><div className="sub tiny mono ellipsis">{i.installDir}</div>
                      {i.kind === "game" && <div className="row" style={{ gap: 6, marginTop: 4 }}><UpdateBadge u={i.update} /></div>}</div>
                    <span className="small" style={{ whiteSpace: "nowrap" }}>{!i.exists ? <span className="badge warn">{t("Ordner fehlt")}</span> : i.size ? `${bytes(i.size.bytes)}${i.size.partial ? " *" : ""}` : "–"}</span>
                    {i.exists && online && <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} aria-label={t("Ordner öffnen")} onClick={() => client.call("storage.openFolder", { id: i.id }).catch((e) => toast((e as Error).message, "error"))} />}
                  </div>
                ))}
              </div>
            )}
            <p className="tiny muted">{t("Steam meldet Größe und Update-Stand selbst; andere Größen werden nur auf Anfrage berechnet. * = einige Ordner waren nicht lesbar. Aktualisieren, Löschen und Deinstallieren im jeweiligen Launcher.")}</p>
          </div>
        )}
      </Loadable>
    </Card>
  );
}

/** Lock, sleep, restart, shut down – with confirmation and a cancel option for restart/shutdown. */
export function PowerCard() {
  const conn = useConn();
  const q = useRpc<{ supported: boolean }>("power.status", {}, []);
  const [delay, setDelay] = useState(60);
  const [pending, setPending] = useState<string | null>(null);
  const admin = !!conn.me?.isLocal || !!conn.me?.permissions?.includes("admin");
  const run = async (action: string, label: string, confirmText: string) => {
    if (action !== "cancel" && !(await confirmDialog(label + "?", confirmText, { danger: action === "shutdown" || action === "restart", ok: label }))) return;
    try {
      await client.call("power.run", { action, delay });
      toast(action === "cancel" ? t("Abgebrochen") : t("{a} angefordert", { a: label }), "success");
      setPending(action === "restart" || action === "shutdown" ? action : null);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Card title={t("Energie")} icon={<Power size={18} />}>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && !q.data.supported ? <Banner kind="info">{t("Energie-Aktionen sind nur im Windows-Begleiter verfügbar.")}</Banner> : (
          <div className="stack">
            {!admin && <p className="small muted">{t("Nur am PC oder mit Admin-Recht (Geräte → Berechtigungen).")}</p>}
            <div className="row">
              <Button icon={<Lock size={16} />} disabled={!admin} onClick={() => run("lock", t("PC sperren"), t("Der PC wird sofort gesperrt."))}>{t("Sperren")}</Button>
              <Button icon={<Moon size={16} />} disabled={!admin} onClick={() => run("sleep", t("Energiesparen"), t("Der PC geht in den Energiesparmodus. Die Verbindung bricht ab, bis er wieder aufwacht."))}>{t("Energiesparen")}</Button>
              <Button icon={<RotateCcw size={16} />} disabled={!admin} onClick={() => run("restart", t("Neu starten"), t("Der PC startet in {s} Sekunden neu. Ungespeicherte Arbeit geht verloren.", { s: delay }))}>{t("Neu starten")}</Button>
              <Button variant="danger" icon={<Power size={16} />} disabled={!admin} onClick={() => run("shutdown", t("Herunterfahren"), t("Der PC fährt in {s} Sekunden herunter. Ungespeicherte Arbeit geht verloren.", { s: delay }))}>{t("Herunterfahren")}</Button>
            </div>
            <label className="row small" style={{ gap: 8 }}>{t("Verzögerung")}
              <select className="input" style={{ maxWidth: 140 }} value={delay} onChange={(e) => setDelay(+e.target.value)}>
                {[0, 30, 60, 120, 300].map((s) => <option key={s} value={s}>{s === 0 ? t("sofort") : t("{s} Sekunden", { s })}</option>)}
              </select></label>
            {pending && <Button icon={<XCircle size={16} />} onClick={() => run("cancel", t("Abbrechen"), "")}>{t("Geplantes Herunterfahren/Neustarten abbrechen")}</Button>}
          </div>
        )}
      </Loadable>
    </Card>
  );
}
