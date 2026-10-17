import { CheckCircle2, Link2, LogOut, MonitorSmartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { client, exitDemo, HOSTED, serverUrl } from "../lib/rpc";
import { wsToPcAddress } from "../lib/address";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { Banner, Button, Card } from "../components/ui";
import { DownloadCard } from "../components/DownloadCard";
import { ConnectScreen } from "./ConnectScreen";
import { DevicePairScreen } from "./Pair";

/** "Verbinden" in the navigation: connection status when logged in, otherwise QR code / code entry for the PC. */
export default function Connect() {
  const conn = useConn();

  if (client.demo) {
    return (
      <div className="stack connect-panel">
        <Banner kind="info" title={t("Demo-Ansicht – kein PC verbunden")} actions={<Button size="sm" variant="primary" onClick={exitDemo}>{t("Demo beenden")}</Button>}>
          {t("Beende die Demo, um deinen echten PC zu verbinden.")}
        </Banner>
      </div>
    );
  }

  if (conn.auth === "ok" || conn.me || client.credentials) {
    const online = conn.phase === "online" && conn.auth === "ok";
    return (
      <div className="stack connect-panel">
        <Card>
          <div className="stack" style={{ textAlign: "center" }}>
            <div className={`state-icon ${online ? "" : "warn"}`}>{online ? <CheckCircle2 size={34} /> : <MonitorSmartphone size={34} />}</div>
            <h1>{online ? t("PC verbunden") : t("PC gerade nicht erreichbar")}</h1>
            <p className="muted">
              {online ? t("Verbunden mit „{pc}“ ({how}).", { pc: conn.hello?.info.pcName ?? "", how: conn.hello?.transport === "relay" ? t("Über Relay") : t("direkt") })
                : t("Dieses Gerät ist gekoppelt. Sobald der PC an ist, verbindet sich die App automatisch.")}
            </p>
            {HOSTED && <code>{wsToPcAddress(serverUrl())}</code>}
            <div className="row" style={{ justifyContent: "center" }}>
              {!online && <Button variant="primary" onClick={() => client.reconnectNow()}>{t("Jetzt verbinden")}</Button>}
              {conn.me?.isLocal && <Link to="/pair" className="btn"><Link2 size={16} />{t("Weiteres Gerät koppeln")}</Link>}
              {!conn.me?.isLocal && <Button variant="danger" icon={<LogOut size={16} />} onClick={() => client.logout()}>{t("Abmelden / anderen PC verbinden")}</Button>}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="stack">
      {!HOSTED && conn.phase !== "online" ? <ConnectScreen embedded /> : <DevicePairScreen embedded />}
      <div className="connect-panel" style={{ width: "100%" }}><DownloadCard compact /></div>
    </div>
  );
}
