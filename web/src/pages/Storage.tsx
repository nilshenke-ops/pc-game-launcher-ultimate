import { t } from "../lib/i18n";
import { PageHead } from "../components/ui";
import { StorageCard } from "../components/MonitorExtras";

/** Drives, game sizes and update state – the last known state is also shown without the PC. */
export default function StoragePage() {
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Speicher & Updates")}
        text={t("Wie voll deine Laufwerke sind, welche Spiele wie viel Platz brauchen und ob Updates ausstehen. Ohne PC siehst du den letzten Stand.")} />
      <StorageCard full />
    </>
  );
}
