// Kreativ-Studio: own collector cards (F6), website badges (F7), poster/cover designer (F8), banner and
// profile-picture workshop (F9) and a virtual exhibition (F10). Everything is kept on this device (and the PC when it
// is connected) – it works without the PC.

import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Award, Frame, IdCard, Landmark, PanelTop } from "lucide-react";
import { t } from "../lib/i18n";
import { getEntry } from "../lib/journal";
import { SyncBadge } from "../components/journal-ui";
import { PageHead } from "../components/ui";
import { CardsView } from "../components/studio-cards";
import { DesignsView } from "../components/studio-designs";
import { ExpoView } from "../components/studio-expo";
import { BadgesView } from "../components/studio-badges";

type Tab = "cards" | "poster" | "banner" | "expo" | "badges";
const TABS: Tab[] = ["cards", "poster", "banner", "expo", "badges"];

export default function StudioPage() {
  const [params, setParams] = useSearchParams();
  const focus = params.get("id");
  // Links to a design ("designs") open the right area.
  const raw = params.get("tab");
  const tab = (raw === "designs" ? ((getEntry<{ area?: string }>(focus ?? "")?.data.area === "banner") ? "banner" : "poster") : TABS.includes(raw as Tab) ? raw : "cards") as Tab;
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Kreativ-Studio")} text={t("Sammelkarten, Poster, Banner und Profilbilder gestalten, in einer eigenen Ausstellung zeigen und Abzeichen sammeln – auf diesem Gerät gespeichert, auch ohne PC.")} actions={<SyncBadge />} />
      <div className="stack">
        <div className="chips j-tabs" role="tablist" aria-label={t("Bereich")}>
          {([["cards", <IdCard size={15} />, t("Sammelkarten")], ["poster", <Frame size={15} />, t("Poster & Cover")], ["banner", <PanelTop size={15} />, t("Banner & Profilbild")], ["expo", <Landmark size={15} />, t("Ausstellung")], ["badges", <Award size={15} />, t("Abzeichen")]] as [Tab, ReactNode, string][]).map(([v, icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => setParams({ tab: v }, { replace: true })}>{icon}{label}</button>
          ))}
        </div>
        {tab === "cards" && <CardsView key={`c${focus ?? ""}`} focus={focus} />}
        {tab === "poster" && <DesignsView key={`p${focus ?? ""}`} area="poster" focus={focus} />}
        {tab === "banner" && <DesignsView key={`b${focus ?? ""}`} area="banner" focus={focus} />}
        {tab === "expo" && <ExpoView key={`e${focus ?? ""}`} focus={focus} />}
        {tab === "badges" && <BadgesView />}
      </div>
    </>
  );
}
