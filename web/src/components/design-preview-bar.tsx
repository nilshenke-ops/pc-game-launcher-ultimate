import { Check, X } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { commitPreview, discardPreview, usePreview } from "../lib/prefs";
import { Button } from "./ui";

/** Shown while a design preview from the design editor (JARVIS) is active: nothing is saved before "Übernehmen". */
export function DesignPreviewBar() {
  const p = usePreview();
  if (!p) return null;
  return (
    <div className="design-preview-bar" role="region" aria-label={t("Design-Vorschau")}>
      <div className="grow small"><b>{t("Design-Vorschau")}</b><div className="tiny muted">{p.changes.join(" · ")} – {t("noch nicht gespeichert")}</div></div>
      <Button size="sm" icon={<X size={15} />} onClick={() => { discardPreview(); toast(t("Vorschau verworfen"), "info"); }}>{t("Verwerfen")}</Button>
      <Button size="sm" variant="primary" icon={<Check size={15} />} onClick={() => { commitPreview(); toast(t("Design übernommen – „Letzte Designänderung rückgängig“ holt das vorherige zurück"), "success"); }}>{t("Übernehmen")}</Button>
    </div>
  );
}


