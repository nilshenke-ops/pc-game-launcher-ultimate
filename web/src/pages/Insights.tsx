// Auswertungen: year review (F5), play style (F28) and performance archive (F18) – from the PC's own records.

import type { ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
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
        <PageTabs page="insights" className="no-print" tabs={[["year", <Trophy size={15} />, t("Jahresrückblick")], ["style", <Sparkles size={15} />, t("Spielstil")], ["perf", <Gauge size={15} />, t("Leistungsarchiv")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
        {tab === "year" && <YearView />}
        {tab === "style" && <StyleView />}
        {tab === "perf" && <PerfView focus={focus} />}
      </div>
    </>
  );
}
