import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { client } from "../lib/rpc";
import { PageHead, OfflineState, Card } from "../components/ui";
import { LatestRelease, PcUpdates, WebsiteVersion } from "../components/UpdateCenter";
import { Monitor } from "lucide-react";

/** "Updates & Versionen": newest Windows version (download from any device), the PC's installed version, this website. */
export default function Updates() {
  const conn = useConn();
  const pc = conn.auth === "ok" || client.demo;
  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Updates & Versionen")} text={t("Neueste Windows-Version herunterladen – auch vom Handy oder Tablet – und den Begleiter auf deinem PC aktualisieren.")} />
      <div className="grid-2">
        <LatestRelease />
        <div className="stack">
          {pc ? <PcUpdates /> : <Card title={t("Dein PC (Begleiter)")} icon={<Monitor size={18} />}><OfflineState /></Card>}
          <WebsiteVersion />
        </div>
      </div>
    </>
  );
}
