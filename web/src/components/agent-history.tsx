// JARVIS task history (3.59): every plan with time, model, planned and executed steps, results, errors and duration – kept on the
// PC, searchable, deletable one by one or all at once. The request text is kept only when allowed; keys and passwords never.
import { useState } from "react";
import { History, Search, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useRpc } from "../lib/hooks";
import { confirmDialog, Empty, Loadable, Switch } from "./ui";
import { durationText, KIND_LABEL, STATUS_LABEL, TOPIC_LABEL, type AgentHistory as History_, type AgentTask } from "../lib/jarvis-agent";

const STATE_LABEL: Record<AgentTask["state"], string> = { planned: "geplant", running: "läuft", done: "erledigt", failed: "fehlgeschlagen", cancelled: "abgebrochen" };

export function AgentHistory() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const canManage = useCan("manage");
  const q = useRpc<History_>("jarvis.history", { query: query.trim() || undefined, kind: kind || undefined, state: state || undefined, limit: 100 }, ["jarvis"]);
  const del = (id: string) => client.call("jarvis.historyDelete", { taskId: id }).then(() => q.reload(), (e: Error) => toast(e.message, "error"));
  const clear = async () => {
    if (!(await confirmDialog(t("Ganzen Verlauf löschen?"), t("Alle JARVIS-Aufträge werden am PC gelöscht."), { danger: true, ok: t("Löschen") }))) return;
    client.call("jarvis.historyClear", {}).then(() => q.reload(), (e: Error) => toast(e.message, "error"));
  };
  const configure = (p: { keep?: boolean; keepRequests?: boolean }) => client.call("jarvis.historyConfigure", p).then(() => q.reload(), (e: Error) => toast(e.message, "error"));

  return (
    <div className="card ag-history" aria-label={t("JARVIS-Verlauf")}>
      <div className="row wrap ag-hfilter">
        <label className="ag-search"><Search size={15} aria-hidden /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Verlauf durchsuchen …")} aria-label={t("Verlauf durchsuchen")} /></label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t("Art")}>
          <option value="">{t("Alle Arten")}</option>
          {(["diagnose", "prepare", "workflow"] as const).map((k) => <option key={k} value={k}>{t(KIND_LABEL[k])}</option>)}
        </select>
        <select className="input" value={state} onChange={(e) => setState(e.target.value)} aria-label={t("Ergebnis")}>
          <option value="">{t("Alle Ergebnisse")}</option>
          {(["done", "failed", "cancelled", "planned"] as const).map((k) => <option key={k} value={k}>{t(STATE_LABEL[k])}</option>)}
        </select>
        {canManage && <button type="button" className="btn sm ghost" onClick={() => void clear()} disabled={!q.data?.total}><Trash2 size={14} aria-hidden /> {t("Alles löschen")}</button>}
      </div>
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        {q.data && (q.data.tasks.length === 0
          ? <Empty icon={<History size={22} />} title={t("Noch keine Aufträge")} text={t("Frag JARVIS z. B. „Warum funktioniert mein Soundboard nicht?“ oder „Bereite meinen PC für eine Runde vor“.")} />
          : (
            <ul className="ag-hlist">
              {q.data.tasks.map((x) => (
                <li key={x.id}>
                  <details>
                    <summary>
                      <span className={`badge ${x.state === "done" ? "ok" : x.state === "failed" ? "error" : ""}`}>{t(STATE_LABEL[x.state])}</span>
                      <b className="ellipsis">{x.request ?? t(KIND_LABEL[x.kind]) + (x.topic ? " · " + t(TOPIC_LABEL[x.topic] ?? x.topic) : "")}</b>
                      <span className="tiny muted">{new Date(x.createdAt).toLocaleString()}</span>
                    </summary>
                    <div className="ag-hdetail">
                      <p className="small">{x.summary}</p>
                      <p className="tiny muted">{t("Modell: {m}", { m: x.model })} · {t("Kosten: 0 €")}{durationText(x) ? " · " + t("Dauer: {d}", { d: durationText(x)! }) : ""} · {t("Von: {w}", { w: x.by })}</p>
                      {x.steps.length > 0 && (
                        <ol className="small">
                          {x.steps.map((s) => <li key={s.id}><b>{s.title}</b> – {t(STATUS_LABEL[s.status])}{s.result ? `: ${s.result}` : ""}</li>)}
                        </ol>
                      )}
                      {canManage && <button type="button" className="btn sm ghost" onClick={() => void del(x.id)}><Trash2 size={14} aria-hidden /> {t("Diesen Eintrag löschen")}</button>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ))}
        {q.data && canManage && (
          <div className="stack-sm ag-hprivacy">
            <Switch checked={q.data.keep} onChange={(keep) => void configure({ keep })} label={t("Aufträge im Verlauf behalten")} hint={t("Aus: nichts wird gespeichert, der Verlauf wird geleert.")} />
            <Switch checked={q.data.keepRequests} onChange={(keepRequests) => void configure({ keepRequests })} label={t("Auftragstext speichern")} hint={t("Aus: nur Art, Schritte und Ergebnisse. Schlüssel und Passwörter werden nie gespeichert.")} />
          </div>
        )}
      </Loadable>
    </div>
  );
}
