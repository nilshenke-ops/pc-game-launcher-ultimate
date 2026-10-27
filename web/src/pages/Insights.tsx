// Auswertungen: year review (F5), play style (F28) and performance archive (F18) – from the PC's own records.

import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Gauge, Sparkles, Trophy } from "lucide-react";
import { t } from "../lib/i18n";
import { PageHead } from "../components/ui";
import { SyncBadge } from "../components/journal-ui";
import { PerfView, StyleView, YearView } from "../components/insights-views";

type Tab = "year" | "style" | "perf";
const TABS: Tab[] = ["year", "style", "perf"];

export default function InsightsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "year") as Tab;
  const focus = params.get("id");
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Auswertungen")} text={t("Jahresrückblick, dein Spielstil und ein Archiv deiner Leistungsmessungen – nur aus dem, was wirklich aufgezeichnet oder von dir eingetragen wurde.")} actions={<SyncBadge />} />
      <div className="stack">
        <div className="chips j-tabs no-print" role="tablist" aria-label={t("Bereich")}>
          {([["year", <Trophy size={15} />, t("Jahresrückblick")], ["style", <Sparkles size={15} />, t("Spielstil")], ["perf", <Gauge size={15} />, t("Leistungsarchiv")]] as [Tab, ReactNode, string][]).map(([v, icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => setParams({ tab: v }, { replace: true })}>{icon}{label}</button>
          ))}
        </div>
        {tab === "year" && <YearView />}
        {tab === "style" && <StyleView />}
        {tab === "perf" && <PerfView focus={focus} />}
      </div>
    </>
  );
}
