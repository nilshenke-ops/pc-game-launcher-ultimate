// AI Activity Island (3.60): the current JARVIS task inside the open island – what he does, how far, and the decision right here.
// "Ausführen" runs what the plan ticked; critical steps (Windows settings, closing programs) are left out and need the full plan.
import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Play, Square, X, XCircle } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast } from "../lib/hooks";
import { agentLine, agentPhase, agentProgress, useAgentBrief } from "../lib/island-agent";

export function AgentIslandCard({ now }: { now: number }) {
  const b = useAgentBrief();
  const phase = agentPhase(b, now);
  const [busy, setBusy] = useState(false);
  if (!b || !phase) return null;
  const run = async () => {
    setBusy(true);
    try { await client.call("jarvis.execute", { taskId: b.id, default: true }); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const call = (m: string) => client.call(m, m === "jarvis.cancelTask" ? { taskId: b.id } : {}).catch((e: Error) => toast(e.message, "error"));
  return (
    <section className={`isl3-agent p-${phase}`} aria-label={t("JARVIS-Auftrag")} role="status">
      <span className="isl3-agenticon" aria-hidden>
        {phase === "working" ? <Loader2 size={18} className="spin" /> : phase === "done" ? <CheckCircle2 size={18} /> : phase === "error" ? <XCircle size={18} /> : <Play size={18} />}
      </span>
      <div className="isl3-agentbody">
        <b>{agentLine(b, phase)}</b>
        {(phase === "working" || phase === "done") && <span className="isl3-agentprog" style={{ ["--p" as string]: agentProgress(b) } as React.CSSProperties} aria-hidden><i /></span>}
        <span className="isl2-sub">{t("Auftrag von {w}", { w: b.by })}{b.critical && phase === "decide" ? " · " + t("kritische Schritte nur im ganzen Plan") : ""}</span>
        <span className="isl3-agentbtns">
          {phase === "decide" && <button type="button" className="isl3-chipbtn primary" disabled={busy} onClick={() => void run()}><Play size={13} aria-hidden /> {t("Ausführen")}</button>}
          {phase === "decide" && <button type="button" className="isl3-chipbtn" disabled={busy} onClick={() => void call("jarvis.cancelTask")}><X size={13} aria-hidden /> {t("Verwerfen")}</button>}
          {phase === "working" && <button type="button" className="isl3-chipbtn danger" onClick={() => void call("jarvis.stop")}><Square size={13} aria-hidden /> {t("Stopp")}</button>}
          <Link className="isl3-chipbtn" to="/assistant">{t("Ganzer Plan")}</Link>
        </span>
      </div>
    </section>
  );
}
