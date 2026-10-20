import { Check, CircleDashed, Loader2, RotateCcw, Square, X, Minus } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useNow, useRpc } from "../lib/hooks";
import { Button, Card } from "./ui";

export interface RunStep { label: string; status: "pending" | "running" | "done" | "failed" | "skipped"; result?: string | null }
export interface ActionRun {
  id: string; name: string; actionId?: string | null; by: string; startedAt: string; endedAt?: string | null;
  state: "running" | "done" | "failed" | "cancelled" | "stopped"; steps: RunStep[]; profileChanged: boolean;
}

const ICON = { pending: CircleDashed, running: Loader2, done: Check, failed: X, skipped: Minus } as const;
const STATE: Record<ActionRun["state"], () => string> = {
  running: () => t("läuft"), done: () => t("fertig"), failed: () => t("mit Fehlern"), cancelled: () => t("abgebrochen"), stopped: () => t("Bedingung nicht erfüllt"),
};

/** Scenes running on the PC (and the ones that ended in the last 10 minutes) with every step, cancel and restore. */
export function RunsPanel() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const q = useRpc<{ runs: ActionRun[] }>("runs.list", {}, ["runs"]);
  const canLaunch = useCan("launch");
  const now = useNow(15000);
  if (!online) return null; // a run on the PC is only known while connected – nothing old is shown as running
  const runs = (q.data?.runs ?? []).filter((r) => r.state === "running" || (r.endedAt && now - Date.parse(r.endedAt) < 10 * 60000)).slice(0, 4);
  if (!runs.length) return null;
  return (
    <Card title={t("Abläufe")} style={{ marginBottom: 16 }}>
      <div className="stack">
        {runs.map((r) => {
          const finished = r.steps.filter((s) => s.status === "done" || s.status === "failed").length;
          return (
            <div key={r.id} className="run-box" aria-live="polite">
              <div className="row between" style={{ gap: 8 }}>
                <b className="ellipsis">{r.name}</b>
                <span className={`badge ${r.state === "running" ? "info" : r.state === "done" ? "ok" : "warn"}`}>{STATE[r.state]()}</span>
              </div>
              <div className={`run-bar ${r.state}`} role="progressbar" aria-valuemin={0} aria-valuemax={r.steps.length} aria-valuenow={finished} aria-label={t("Fortschritt")}><span style={{ width: `${r.steps.length ? (finished / r.steps.length) * 100 : 100}%` }} /></div>
              <ol className="run-steps">
                {r.steps.map((s, i) => {
                  const Icon = ICON[s.status];
                  return (
                    <li key={i} className={`run-step ${s.status}`}>
                      <Icon size={14} className={s.status === "running" ? "spin" : undefined} aria-hidden />
                      <span className="grow">{s.label}</span>
                      {s.status === "failed" && s.result && <span className="tiny muted">{s.result.replace(/^Fehler: /, "")}</span>}
                    </li>
                  );
                })}
              </ol>
              <div className="row" style={{ gap: 8 }}>
                {r.state === "running" && canLaunch && <Button size="sm" variant="danger" icon={<Square size={13} />} onClick={() => client.call("runs.cancel", { id: r.id }).catch((e: Error) => toast(e.message, "error"))}>{t("Abbrechen")}</Button>}
                {r.state === "cancelled" && r.profileChanged && canLaunch && <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => client.call("profiles.revert", {}).then(() => toast(t("Vorheriges Profil wieder aktiv"), "success"), (e: Error) => toast(e.message, "error"))}>{t("Profil zurücksetzen")}</Button>}
                {r.state === "cancelled" && <span className="tiny muted">{t("Schon erledigte Schritte bleiben erledigt (z. B. gestartete Programme).")}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
