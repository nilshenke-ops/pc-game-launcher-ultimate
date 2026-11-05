import { CheckCircle2, CircleDashed, CircleSlash, Clock3, TriangleAlert } from "lucide-react";
import { t } from "../lib/i18n";
import { relTime } from "../lib/format";
import { useRpc } from "../lib/hooks";
import { useFreeAiConsent } from "../lib/free-ai";
import { useLocalAi } from "../lib/free-ai-local";
import { buildPlan, buildRoster, rosterSummary, type AssistantLite, type RosterState } from "../lib/ai-roster";
import type { AiOverview } from "./ai-manager";

const ICON: Record<RosterState, typeof CheckCircle2> = { works: CheckCircle2, limit: Clock3, problem: TriangleAlert, begun: CircleDashed, none: CircleSlash };
const LABEL: Record<RosterState, string> = { works: "Funktioniert", limit: "Am Limit", problem: "Problem", begun: "Angefangen", none: "Nicht eingerichtet" };

/** "Meine KIs": which AI works, which one is started but not finished, which one is not set up – one look, no digging. */
export function AiRoster({ online, ai, compact = false, selected }: { online: boolean; ai?: AiOverview | null; compact?: boolean; /** What is chosen for the next question in the island ("Automatisch", "Groq" …). */ selected?: string }) {
  const st = useRpc<AssistantLite>("assistant.status", {}, ["assistant"], online);
  const device = useLocalAi();
  const consent = useFreeAiConsent();
  const rows = buildRoster(online ? ai : null, online ? st.data : null, device, consent, (iso) => relTime(iso));
  const sum = rosterSummary(rows);
  const plan = online ? buildPlan(ai, rows) : null;
  const summary = (
    <>
      {t("{a} funktionieren · {b} angefangen · {c} nicht eingerichtet", { a: sum.works, b: sum.begun + sum.problems, c: sum.none })}
      {!online ? ` · ${t("PC nicht verbunden: nur das, was auf diesem Gerät steht")}` : ""}
    </>
  );
  const planBlock = plan && (
    <div className="aim-plan" aria-label={t("So antwortet JARVIS gerade")}>
      <b className="tiny">{t("So antwortet JARVIS gerade")}</b>
      {selected && <span className="tiny">{t("Ausgewählt für die nächste Frage: {s}", { s: selected })}</span>}
      <span className="tiny">{t("Fragen: {h}", { h: plan.how })}</span>
      {plan.steps.length > 0
        ? <ol className="tiny aim-steps">{plan.steps.map((x) => <li key={x.id}><b>{x.name}</b>{x.model ? <> · <span className="mono">{x.model}</span></> : null}</li>)}</ol>
        : <span className="tiny muted">{t("Noch keine KI bereit – nur die eingebaute Hilfe antwortet.")}</span>}
      <span className="tiny muted">{plan.commands}</span>
      {plan.last && <span className="tiny">{t("Zuletzt geantwortet: {n}{m}{w}", { n: plan.last.name, m: plan.last.model ? ` · ${plan.last.model}` : "", w: plan.last.at ? ` · ${relTime(plan.last.at)}` : "" })}</span>}
    </div>
  );
  const list = (
    <ul className="aim-rlist">
      {rows.map((r) => {
        const Icon = ICON[r.state];
        return (
          <li key={r.id} className={`aim-rrow ${r.state}`}>
            <Icon size={16} aria-hidden className="aim-ricon" />
            <div className="aim-rtext">
              <span><b>{t(r.name)}</b> <span className={`aim-badge ${r.state === "works" ? "ready" : r.state === "limit" ? "cooldown" : r.state === "problem" ? "error" : "off"}`}>{t(LABEL[r.state])}</span>{r.kind === "paid" ? <span className="aim-badge off">{t("kostenpflichtig")}</span> : null}</span>
              <span className="tiny muted">{t(r.text)}{r.next ? ` → ${t(r.next)}` : ""}</span>
              {r.model && <span className="tiny">{t("Modell")}: <span className="mono">{r.model}</span>{r.more?.length ? ` ${t("(Ersatz: {m})", { m: r.more.join(", ") })}` : ""}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
  return (
    <section className="aim-roster" aria-label={t("Meine KIs")}>
      {compact
        ? <details><summary><b className="aim-modetitle">{t("Meine KIs")}</b> <span className="tiny" role="status">{summary}</span></summary>{planBlock}{list}</details>
        : <><b className="aim-modetitle">{t("Meine KIs")}</b><p className="tiny" role="status">{summary}</p>{planBlock}{list}</>}
    </section>
  );
}
