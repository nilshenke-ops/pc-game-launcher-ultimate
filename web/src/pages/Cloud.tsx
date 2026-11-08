import { useState } from "react";
import { Cloud, CloudOff, HardDrive, RefreshCw, ShieldCheck } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { relTime } from "../lib/format";
import { Banner, Button, Card } from "../components/ui";
import { AccountPanel } from "../components/design-profile";
import { cloudAccountConfigured, cloudApi, pendingBlob } from "../lib/cloud-account";
import { flushPending, saveNow, session } from "../lib/design-account";

/**
 * Everything about the cloud account in one place: sign in, the address of the service, whether a change is still
 * waiting, and an honest list of what travels with the account and what stays on the PC.
 */
export default function CloudPage() {
  const conn = useConn();
  const online = conn.phase === "online";
  const configured = cloudAccountConfigured();
  const endpoint = cloudApi();
  const s = session();
  const waiting = !!pendingBlob();
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    setBusy(true);
    try {
      await flushPending();
      await saveNow();
      toast(t("Alles ist gespeichert."), "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div className="row between" style={{ gap: 10, flexWrap: "wrap" }}>
        <h1 className="h1" style={{ margin: 0 }}><Cloud size={26} style={{ verticalAlign: -4 }} /> {t("Konto & Cloud")}</h1>
        {s?.cloud && <Button size="sm" icon={<RefreshCw size={14} />} busy={busy} onClick={() => void sync()}>{t("Jetzt synchronisieren")}</Button>}
      </div>

      <div className="card stack-sm">
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small muted">{t("Cloud-Dienst")}</span>
          <span className="mono tiny" title={endpoint ?? undefined}>{configured ? endpoint : t("Nicht eingerichtet")}</span>
        </div>
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small muted">{t("Status")}</span>
          <span className="small">
            {s?.cloud
              ? <>{t("Angemeldet als {u}", { u: s.user })}{s.savedAt ? <span className="muted"> · {t("gespeichert {d}", { d: relTime(s.savedAt) })}</span> : null}</>
              : t("Nicht angemeldet")}
          </span>
        </div>
        {s?.cloud && waiting && <Banner kind="warn">{t("Eine Änderung wartet noch – sie wird gesendet, sobald die Cloud wieder erreichbar ist.")}</Banner>}
        {!s?.cloud && <p className="tiny muted" style={{ margin: 0 }}>{t("Anmelden geht auch bei ausgeschaltetem PC. Ohne Anmeldung bleibt alles auf diesem Gerät und am PC.")}</p>}
      </div>

      <Card title={t("Konto")} icon={<ShieldCheck size={18} />}>
        <AccountPanel />
      </Card>

      <Card title={t("Was in der Cloud liegt")} icon={<Cloud size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Design, Startseite und Leiste, Sprache, Gamer-Pass, Zähler, Pausen-Erinnerung und die Raum-Einstellung – schon im Browser verschlüsselt. Passwort und Schlüssel bleiben auf dem Gerät, der Dienst kann die Daten nicht lesen.")}</p>
      </Card>

      <Card title={t("Was am PC bleibt")} icon={<HardDrive size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Spiele, Programme, Profile, Kalender, Dateien und die PC-Steuerung. Dafür muss der PC an sein – die Cloud-Anmeldung gibt keine Rechte am PC.")}</p>
        {!online && <p className="tiny muted" style={{ margin: "8px 0 0" }}><CloudOff size={13} style={{ verticalAlign: -2 }} /> {t("Der PC ist gerade nicht verbunden. Alles zur Cloud funktioniert trotzdem.")}</p>}
      </Card>

      {!configured && <Banner kind="info">{t("Cloud ist in dieser App-Version nicht eingerichtet. Das Konto liegt dann auf dem PC, solange er verbunden ist.")}</Banner>}
    </div>
  );
}
