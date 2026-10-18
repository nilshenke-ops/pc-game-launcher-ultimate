import { CheckCircle2, Link2, LogOut, Monitor, MonitorSmartphone, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { client, exitDemo, forgetPc, HOSTED, isActivePc, savedPcs, serverUrl } from "../lib/rpc";
import { wsToPcAddress } from "../lib/address";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { Banner, Button, Card, confirmDialog } from "../components/ui";

/** Several Windows PCs: each keeps its own pairing, games, profiles and sounds; one is connected at a time. */
function MyPcs() {
  const [list, setList] = useState(savedPcs());
  const conn = useConn();
  if (conn.me?.isLocal) return null;
  return (
    <Card title={t("Meine PCs")} icon={<Monitor size={18} />}>
      <div className="stack">
        {list.length === 0 ? <p className="small muted">{t("Noch kein PC gespeichert.")}</p> : (
          <div className="list">{list.map((p) => (
            <div key={p.id} className="list-item">
              <div className="grow"><div className="title small">{p.name}</div><div className="sub tiny mono ellipsis">{p.server ? wsToPcAddress(p.server) : t("diese Adresse")}</div></div>
              {isActivePc(p) ? <span className="badge ok">{t("Aktiv")}</span>
                : <Button size="sm" variant="primary" onClick={() => client.switchPc(p.id)}>{t("Wechseln")}</Button>}
              {!isActivePc(p) && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Vergessen")} onClick={async () => {
                if (await confirmDialog(t("PC vergessen?"), t("„{n}“ wird von diesem Gerät entfernt. Zum erneuten Verbinden musst du neu koppeln.", { n: p.name }), { danger: true, ok: t("Vergessen") })) { forgetPc(p.id); setList(savedPcs()); }
              }} />}
            </div>
          ))}</div>
        )}
        {HOSTED && <div><Button icon={<Plus size={16} />} onClick={() => client.addAnotherPc()}>{t("Weiteren PC hinzufügen")}</Button></div>}
        <p className="tiny muted">{HOSTED
          ? t("Jeder PC behält seine eigenen Spiele, Profile, Sounds und Einstellungen. Es ist immer ein PC verbunden; Wechseln geht ohne neue Kopplung.")
          : t("Weitere PCs verbindest du am besten über die Webseite (github.io) – hier ist die App fest mit diesem PC verbunden.")}</p>
      </div>
    </Card>
  );
}
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
        <MyPcs />
      </div>
    );
  }

  return (
    <div className="stack">
      {!HOSTED && conn.phase !== "online" ? <ConnectScreen embedded /> : <DevicePairScreen embedded />}
      {savedPcs().length > 0 && <div className="connect-panel" style={{ width: "100%" }}><MyPcs /></div>}
      <div className="connect-panel" style={{ width: "100%" }}><DownloadCard compact /></div>
    </div>
  );
}
