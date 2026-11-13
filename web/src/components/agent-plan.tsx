// JARVIS 3.0 control centre in the chat (3.59): the plan the PC built, step by step. Every step can be switched off, some can be
// changed (another profile, another game); "Ausführen" runs only what is ticked, critical steps need their own tick. While it
// runs the steps update live, "Stopp" ends it before the next step. A diagnosis shows what was measured and where it comes from.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleDashed, Info, Loader2, ShieldAlert, Square, XCircle } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan } from "../lib/hooks";
import {
  cancelTask, chosenSteps, durationText, executeTask, KIND_LABEL, needsCritical, PERM_LABEL, STATUS_LABEL, stopAll, TIER_LABEL, TOPIC_LABEL,
  type AgentFinding, type AgentStep, type AgentTask,
} from "../lib/jarvis-agent";

const SEV_ICON: Record<AgentFinding["severity"], typeof Info> = { problem: XCircle, warn: AlertTriangle, info: Info, ok: CheckCircle2 };

function StepIcon({ s }: { s: AgentStep }) {
  if (s.status === "running") return <Loader2 size={15} className="spin" aria-hidden />;
  if (s.status === "done") return <CheckCircle2 size={15} className={s.ok === null || s.ok === undefined ? "ag-note" : "ag-ok"} aria-hidden />;
  if (s.status === "failed" || s.status === "refused") return <XCircle size={15} className="ag-bad" aria-hidden />;
  return <CircleDashed size={15} className="ag-idle" aria-hidden />;
}

export function AgentPlan({ task: initial, onTask }: { task: AgentTask; onTask?: (t: AgentTask) => void }) {
  const [task, setTask] = useState(initial);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [critical, setCritical] = useState(false);
  const [busy, setBusy] = useState(false);
  const perms = { view: true, launch: useCan("launch"), manage: useCan("manage") } as Record<string, boolean>;
  const update = (x: AgentTask) => { setTask(x); onTask?.(x); };
  useEffect(() => client.on("jarvis.task", (d) => { const x = d as AgentTask; if (x?.id === task.id) setTask(x); }), [task.id]);

  const planned = task.state === "planned";
  const ids = useMemo(() => chosenSteps(task, picked), [task, picked]);
  const crit = needsCritical(task, ids);
  const runnable = ids.filter((id) => task.steps.find((s) => s.id === id)?.kind !== "verify");

  const run = async () => {
    if (crit && !critical) { toast(t("Bitte die kritischen Schritte ausdrücklich bestätigen."), "info"); return; }
    setBusy(true);
    try { update(await executeTask(task.id, ids, refs, critical)); }
    catch (e) { toast((e as Error).message, "error"); }
    finally { setBusy(false); }
  };
  const discard = async () => { try { await cancelTask(task.id); update({ ...task, state: "cancelled", steps: task.steps.map((s) => ({ ...s, status: "cancelled" })) }); } catch (e) { toast((e as Error).message, "error"); } };
  const stop = () => { stopAll().then((r) => toast(r.stopped ? t("Gestoppt – der laufende Schritt endet, weitere starten nicht.") : t("Es läuft gerade nichts."), "info"), (e: Error) => toast(e.message, "error")); };

  return (
    <div className={`ag-card ag-${task.state}`} aria-label={t("JARVIS-Auftrag")}>
      <div className="ag-head">
        <span className="badge info">{t(KIND_LABEL[task.kind])}{task.topic ? " · " + t(TOPIC_LABEL[task.topic] ?? task.topic) : ""}</span>
        <span className={`badge ${task.state === "done" ? "ok" : task.state === "failed" ? "error" : task.state === "running" ? "info" : ""}`} role="status">
          {task.state === "planned" ? t("Wartet auf deine Bestätigung") : task.state === "running" ? t("Wird ausgeführt …") : task.state === "done" ? t("Erledigt") : task.state === "failed" ? t("Teilweise fehlgeschlagen") : t("Abgebrochen")}
        </span>
      </div>

      {task.findings.length > 0 && (
        <ul className="ag-findings" aria-label={t("Befund")}>
          {task.findings.map((f, i) => {
            const Icon = SEV_ICON[f.severity];
            return (
              <li key={i} className={`ag-f ${f.severity}`}>
                <Icon size={16} aria-hidden />
                <div>
                  <b>{f.title}</b>
                  <p>{f.evidence}</p>
                  {f.advice && <p className="ag-advice">{f.advice}</p>}
                  <span className="tiny muted">{t("Quelle: {s}", { s: f.source })}{f.page && <> · <Link to={f.page}>{t("Öffnen")}</Link></>}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {task.steps.length > 0 && (
        <ol className="ag-steps" aria-label={t("Schritte")}>
          {task.steps.map((s) => {
            const on = picked[s.id] ?? s.selected;
            const allowed = perms[s.permission] !== false;
            return (
              <li key={s.id} className={`ag-step ${s.status} t-${s.tier}`}>
                {planned
                  ? <input type="checkbox" checked={on && allowed} disabled={!allowed || s.kind === "verify" && !task.steps.some((x) => x.kind !== "verify" && (x.tier === "execute" || x.tier === "critical"))}
                      aria-label={s.title} onChange={(e) => setPicked((p) => ({ ...p, [s.id]: e.target.checked }))} />
                  : <StepIcon s={s} />}
                <div className="ag-sbody">
                  <span className="ag-stitle">
                    <b>{s.title}</b>
                    <span className={`badge ${s.tier === "critical" ? "error" : s.tier === "execute" ? "warn" : ""}`}>{t(TIER_LABEL[s.tier])}</span>
                    {!allowed && <span className="badge error">{t("Recht „{p}“ fehlt", { p: t(PERM_LABEL[s.permission] ?? s.permission) })}</span>}
                    {!planned && <span className="tiny muted">{t(STATUS_LABEL[s.status])}{s.ms != null && s.status !== "skipped" ? ` · ${s.ms} ms` : ""}</span>}
                  </span>
                  {planned && (s.options?.length ?? 0) > 1 && (
                    <select className="input ag-opt" value={refs[s.id] ?? s.ref ?? ""} aria-label={t("Auswahl für „{s}“", { s: s.title })}
                      onChange={(e) => { setRefs((r) => ({ ...r, [s.id]: e.target.value })); setPicked((p) => ({ ...p, [s.id]: true })); }}>
                      {s.options!.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
                    </select>
                  )}
                  {s.result ? <p className={`ag-result${s.ok === false ? " bad" : ""}`}>{s.result}</p> : s.detail && <p className="tiny muted">{s.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {planned && crit && (
        <label className="ag-crit"><ShieldAlert size={16} aria-hidden />
          <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
          <span>{t("Ich bestätige die kritischen Schritte (sie ändern Windows-Einstellungen oder schließen Programme).")}</span>
        </label>
      )}

      <div className="row wrap ag-actions">
        {planned && task.steps.length > 0 && (
          <button type="button" className="btn sm primary" disabled={busy || runnable.length === 0 || (crit && !critical)} onClick={() => void run()}>
            {busy ? <Loader2 size={15} className="spin" aria-hidden /> : null}
            {runnable.length === 0 ? t("Nichts ausgewählt") : t("Ausführen ({n} Schritte)", { n: runnable.length })}
          </button>
        )}
        {planned && task.steps.length > 0 && <button type="button" className="btn sm ghost" disabled={busy} onClick={() => void discard()}>{t("Verwerfen")}</button>}
        {task.state === "running" && <button type="button" className="btn sm danger" onClick={stop}><Square size={14} aria-hidden /> {t("Stopp")}</button>}
        {task.problemsAfter != null && task.problemsBefore != null && (
          <span className={`badge ${task.problemsAfter < task.problemsBefore ? "ok" : task.problemsAfter === 0 ? "ok" : "warn"}`}>
            {t("Vorher {a}, jetzt {b} Auffälligkeiten", { a: task.problemsBefore, b: task.problemsAfter })}
          </span>
        )}
      </div>
      <div className="tiny muted ag-meta">{task.model} · 0 €{durationText(task) ? " · " + durationText(task) : ""} · {t("Jeder Schritt wird am PC mit den Rechten dieses Geräts geprüft.")}</div>
    </div>
  );
}
