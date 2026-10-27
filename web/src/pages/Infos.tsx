// Spiele-Infos: release/DLC calendar (F12), update explainer (F13), fact check (F14), "if you like this" (F15),
// editions/DLC comparison (F16), seasons/events (F17) and accessibility finder (F24). Everything is entered by the
// user or comes from an official source on request – kept on this device (and the PC when connected), works without it.

import type { ReactNode } from "react";
import { PageTabs } from "../components/page-tabs";
import { useSearchParams } from "react-router-dom";
import { Accessibility, Flag, Layers, ListChecks, Rocket, ScrollText, Sparkles } from "lucide-react";
import { t } from "../lib/i18n";
import { SyncBadge } from "../components/journal-ui";
import { PageHead } from "../components/ui";
import { EventsView, ReleasesView } from "../components/infos-time";
import { PatchesView } from "../components/infos-patch";
import { AccessView, EditionsView, FactsView } from "../components/infos-facts";
import { RecsView } from "../components/infos-recs";

type Tab = "releases" | "events" | "patches" | "facts" | "access" | "editions" | "recs";
const TABS: Tab[] = ["releases", "events", "patches", "facts", "access", "editions", "recs"];

export default function InfosPage() {
  const [params, setParams] = useSearchParams();
  const focus = params.get("id");
  const raw = params.get("tab");
  const tab = (TABS.includes(raw as Tab) ? raw : "releases") as Tab;
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Spiele-Infos")} text={t("Releases, Events, Patchnotes, Fakten, Barrierefreiheit, Editionen und Empfehlungen – nur mit deinen Angaben oder offiziellen Quellen, Unbekanntes bleibt als unbekannt markiert.")} actions={<SyncBadge />} />
      <div className="stack">
        <PageTabs page="infos" tabs={[["releases", <Rocket size={15} />, t("Releases")], ["events", <Flag size={15} />, t("Saisons & Events")], ["patches", <ScrollText size={15} />, t("Update-Erklärer")], ["facts", <ListChecks size={15} />, t("Faktencheck")], ["access", <Accessibility size={15} />, t("Barrierefreiheit")], ["editions", <Layers size={15} />, t("Editionen & DLCs")], ["recs", <Sparkles size={15} />, t("Empfehlungen")]] as [Tab, ReactNode, string][]} value={tab} onChange={(v) => setParams({ tab: v }, { replace: true })} />
        {tab === "releases" && <ReleasesView focus={focus} />}
        {tab === "events" && <EventsView focus={focus} />}
        {tab === "patches" && <PatchesView focus={focus} />}
        {tab === "facts" && <FactsView focus={focus} />}
        {tab === "access" && <AccessView focus={focus} />}
        {tab === "editions" && <EditionsView focus={focus} />}
        {tab === "recs" && <RecsView />}
      </div>
    </>
  );
}
