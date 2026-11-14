// What uses the PC most right now (3.58): tap CPU or memory in the island and the programs come as a list, the biggest first, each
// with "close". Closing asks first; it is polite (the program may ask to save) and only forced when you say so. Windows' own
// processes and the companion have no close button – the PC refuses them anyway.
import { useEffect, useState } from "react";
import { Cpu, MemoryStick, RefreshCw, ShieldAlert, Wrench, X, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast } from "../lib/hooks";

export type ProcKind = "ram" | "cpu" | "gpu";
/** windows: part of Windows (never end it) · driver: graphics/sound driver (better leave running) · companion: this app · app: everything else */
type Kind = "windows" | "driver" | "companion" | "app";
interface ProcRow { name: string; ramMb: number; cpuPercent: number | null; count: number; closable?: boolean; kind?: Kind; role?: string | null }
interface GpuRow { name: string; gpuPercent: number | null; vramMb: number | null; count: number; closable?: boolean; kind?: Kind; role?: string | null }
interface TopResp { ram: ProcRow[]; cpu: ProcRow[]; gpu?: GpuRow[] | null; gpuSupported?: boolean; cores: number }

/** The mark beside a program: what kind of thing it is, so nothing important gets closed by mistake. */
export function KindBadge({ kind, role }: { kind?: Kind; role?: string | null }) {
  if (kind === "windows") return <span className="isl3-pill kind-win" title={role ?? undefined}><ShieldAlert size={11} aria-hidden /> {t("Windows · wichtig")}</span>;
  if (kind === "driver") return <span className="isl3-pill kind-drv" title={role ?? undefined}><Wrench size={11} aria-hidden /> {t("Treiber")}</span>;
  if (kind === "companion") return <span className="isl3-pill kind-app" title={role ?? undefined}>{t("Nexus")}</span>;
  return null;
}
interface CloseResp { name: string; closed: number; left: number; needsForce: boolean }

export const memText = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB` : `${Math.round(mb)} MB`);

export function ProcSheet({ kind, onKind, onClose, canClose }: { kind: ProcKind; onKind: (k: ProcKind) => void; onClose: () => void; canClose: boolean }) {
  const [data, setData] = useState<TopResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [force, setForce] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    client.call<TopResp>("system.topProcesses", {}).then((r) => { if (!gone) { setData(r); setErr(null); } }, (e: Error) => { if (!gone) setErr(e.message); });
    const id = window.setTimeout(() => setTick((x) => x + 1), 5000);
    return () => { gone = true; window.clearTimeout(id); };
  }, [tick]);

  const close = async (name: string, hard: boolean) => {
    setBusy(name); setAsk(null);
    try {
      const r = await client.call<CloseResp>("system.closeProgram", { name, force: hard });
      if (r.left === 0) { toast(t("{n} geschlossen", { n: name }), "success"); setForce(null); }
      else if (r.needsForce) { setForce(name); toast(t("{n} hat sich nicht beendet – vielleicht fragt es nach dem Speichern. Sonst: Erzwingen.", { n: name }), "info"); }
      else toast(t("{n}: {k} Prozesse laufen noch.", { n: name, k: r.left }), "info");
      setTick((x) => x + 1);
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(null); }
  };

  type Row = (ProcRow | GpuRow) & { closable?: boolean; kind?: Kind; role?: string | null };
  const rows: Row[] = (kind === "ram" ? data?.ram : kind === "cpu" ? data?.cpu : data?.gpu) ?? [];
  const val = (r: Row) => (kind === "ram" ? (r as ProcRow).ramMb : kind === "cpu" ? (r as ProcRow).cpuPercent ?? 0 : (r as GpuRow).gpuPercent ?? 0);
  const max = Math.max(1, ...rows.map(val));
  const label = kind === "ram" ? t("Programme nach Arbeitsspeicher") : kind === "cpu" ? t("Programme nach CPU-Last") : t("Programme nach GPU-Last");
  return (
    <div className="isl3-sheet" role="dialog" aria-label={t("Was am meisten verbraucht")}>
      <div className="isl3-sheethead">
        <b>{t("Was am meisten verbraucht")}</b>
        <span className="isl3-seg" role="tablist" aria-label={t("Messwert")}>
          <button type="button" role="tab" aria-selected={kind === "ram"} className={kind === "ram" ? "on" : ""} onClick={() => onKind("ram")}><MemoryStick size={13} /> RAM</button>
          <button type="button" role="tab" aria-selected={kind === "cpu"} className={kind === "cpu" ? "on" : ""} onClick={() => onKind("cpu")}><Cpu size={13} /> CPU</button>
          <button type="button" role="tab" aria-selected={kind === "gpu"} className={kind === "gpu" ? "on" : ""} onClick={() => onKind("gpu")}><Zap size={13} /> GPU</button>
        </span>
        <button type="button" className="isl3-mini" onClick={() => setTick((x) => x + 1)} aria-label={t("Neu messen")}><RefreshCw size={14} /></button>
        <button type="button" className="isl3-mini" onClick={onClose} aria-label={t("Schließen")}><X size={15} /></button>
      </div>
      <div className="isl3-sheetbody">
        {err ? <p className="isl2-sub">{err}</p> : !data ? <p className="isl2-sub">{t("Wird gemessen …")}</p>
          : kind === "gpu" && !data.gpuSupported ? <p className="isl2-sub">{t("Die Grafikkarten-Nutzung je Programm liest nur der Windows-Begleiter (wie der Task-Manager).")}</p>
          : kind === "gpu" && !rows.length ? <p className="isl2-sub">{t("Gerade nutzt kein Programm die Grafikkarte nennenswert.")}</p> : (
          <ul className="isl3-procs" aria-label={label}>
            {rows.map((r, i) => {
              const v = val(r);
              const shown = kind === "ram" ? memText((r as ProcRow).ramMb) : kind === "cpu" ? ((r as ProcRow).cpuPercent == null ? "n. v." : `${(r as ProcRow).cpuPercent!.toLocaleString("de-DE")} %`)
                : `${(r as GpuRow).gpuPercent == null ? "–" : `${(r as GpuRow).gpuPercent!.toLocaleString("de-DE")} %`}${(r as GpuRow).vramMb != null ? ` · ${memText((r as GpuRow).vramMb!)}` : ""}`;
              return (
                <li key={r.name} className={r.kind ? `k-${r.kind}` : ""} style={{ ["--w" as string]: `${(v / max) * 100}%`, ["--i" as string]: i } as React.CSSProperties}>
                  <span className="isl3-pbar" aria-hidden />
                  <span className="isl3-pname"><b className="ellipsis">{r.name}</b>
                    {r.role ? <i>{r.role}{r.count > 1 ? ` · ${t("{n} Prozesse", { n: r.count })}` : ""}</i> : r.count > 1 && <i>{t("{n} Prozesse", { n: r.count })}</i>}</span>
                  <KindBadge kind={r.kind} role={r.role} />
                  <b className="isl3-pval">{shown}</b>
                  {r.closable === false ? null
                    : ask === r.name ? (
                      <span className="isl3-pask">
                        {r.kind === "driver" && <span className="tiny">{t("Treiber – Bild oder Ton können kurz ausfallen.")}</span>}
                        <button type="button" className="isl3-chipbtn danger" disabled={busy === r.name} onClick={() => void close(r.name, false)}>{t("Ja, schließen")}</button>
                        <button type="button" className="isl3-chipbtn" onClick={() => setAsk(null)}>{t("Abbrechen")}</button>
                      </span>
                    ) : force === r.name ? (
                      <button type="button" className="isl3-chipbtn danger" disabled={!canClose || busy === r.name} onClick={() => void close(r.name, true)} title={t("Beendet das Programm sofort – nicht Gespeichertes geht verloren.")}>{t("Erzwingen")}</button>
                    ) : (
                      <button type="button" className="isl3-chipbtn" disabled={!canClose || busy === r.name} onClick={() => setAsk(r.name)} aria-label={t("{n} schließen", { n: r.name })}>{busy === r.name ? t("Schließt …") : t("Schließen")}</button>
                    )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="isl3-legend tiny"><KindBadge kind="windows" /> {t("Teil von Windows – hält den PC am Laufen, lässt sich hier nicht beenden.")} <KindBadge kind="driver" /> {t("Grafik-, Ton- oder Zubehör-Treiber – besser laufen lassen.")}</p>
        <p className="tiny muted">{canClose
          ? t("„Schließen“ bittet das Programm zu beenden – es kann noch nach dem Speichern fragen. Teile von Windows und der Begleiter lassen sich nicht schließen.")
          : t("Schließen darf nur ein Gerät mit dem Recht „Verwalten“.")}</p>
      </div>
    </div>
  );
}
