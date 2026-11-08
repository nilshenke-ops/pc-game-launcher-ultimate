import { useEffect, useState } from "react";
import { Cloud, CloudOff, HardDrive, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { relTime } from "../lib/format";
import { Banner, Button, Card } from "../components/ui";
import { AccountPanel } from "../components/design-profile";
import { cloudAccountConfigured, cloudApi, pendingBlob } from "../lib/cloud-account";
import { flushPending, listAccounts, saveNow, session, switchAccount } from "../lib/design-account";

/**
 * Everything about the cloud account in one place: sign in, the address of the service, whether a change is still
 * waiting, and an honest list of what travels with the account and what stays on the PC.
 */
export default function CloudPage() {
  const conn = useConn();
  const online = conn.phase === "online";
  const configured = cloudAccountConfigured();
  const endpoint = cloudApi();
  // The account panel below changes the session, so read it again whenever it reports a change.
  const [s, setS] = useState(session);
  const [waiting, setWaiting] = useState(() => !!pendingBlob());
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState(listAccounts);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => { setS(session()); setWaiting(!!pendingBlob()); setAccounts(listAccounts()); };
    window.addEventListener("pgl-account", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("pgl-account", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  const sync = async () => {
    setBusy(true);
    try {
      await flushPending();
      await saveNow();
      toast(t("Alles ist gespeichert."), "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally { setBusy(false); setS(session()); setWaiting(!!pendingBlob()); setAccounts(listAccounts()); }
  };

  const switchTo = async (user: string) => {
    setSwitching(user);
    try {
      await switchAccount(user);
      toast(t("Konto gewechselt: {u}", { u: user }), "success");
    } catch (e) { toast((e as Error).message, "error"); }
    finally { setSwitching(null); setS(session()); setWaiting(!!pendingBlob()); setAccounts(listAccounts()); }
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

      {accounts.length > 0 && (
        <Card title={t("Konten auf diesem Gerät")} icon={<Users size={18} />} meta={<span className="badge">{accounts.length}</span>}>
          <div className="stack-sm">
            {accounts.map((a) => (
              <div key={a.user} className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="small">
                  <b>{a.user}</b>{s?.user === a.user && <> <span className="badge ok">{t("aktiv")}</span></>}
                  {!a.cloud && <span className="tiny muted"> · {t("Konto am PC")}</span>}
                </span>
                <Button size="sm" disabled={s?.user === a.user} busy={switching === a.user} onClick={() => void switchTo(a.user)}>{t("Wechseln")}</Button>
              </div>
            ))}
            <p className="tiny muted" style={{ margin: 0 }}>{t("Wechseln braucht kein Passwort mehr – die Schlüssel liegen verschlüsselt auf diesem Gerät. Jeder Benutzername ist nur einmal vergeben; ein zweites Konto mit demselben Namen lehnt der Dienst ab.")}</p>
          </div>
        </Card>
      )}

      <Card title={t("Konto")} icon={<ShieldCheck size={18} />}>
        <AccountPanel />
        <details style={{ marginTop: 10 }}>
          <summary className="small">{t("Weiteres Konto hinzufügen")}</summary>
          <div style={{ marginTop: 8 }}><AccountPanel forceForm /></div>
        </details>
      </Card>

      <Card title={t("Was in der Cloud liegt")} icon={<Cloud size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Design, Startseite und Leiste, Sprache, Gamer-Pass, Zähler, Pausen-Erinnerung und die Raum-Einstellung – schon im Browser verschlüsselt. Passwort und Schlüssel bleiben auf dem Gerät, der Dienst kann die Daten nicht lesen.")}</p>
        <p className="small" style={{ margin: "8px 0 0" }}>{t("Dazu kommen der Ordner und die Regeln für JARVIS MEMORY, dein Wetter-Ort und die KI-Auswahl – also welcher Anbieter zuerst antwortet. Auf dem Handy ist damit alles schon eingerichtet, bevor der PC verbunden ist. KI-Schlüssel und API-Schlüssel liegen nie im Konto.")}</p>
      </Card>

      <Card title={t("Was am PC bleibt")} icon={<HardDrive size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Spiele, Programme, Profile, Kalender, Dateien und die PC-Steuerung. Dafür muss der PC an sein – die Cloud-Anmeldung gibt keine Rechte am PC.")}</p>
        {!online && <p className="tiny muted" style={{ margin: "8px 0 0" }}><CloudOff size={13} style={{ verticalAlign: -2 }} /> {t("Der PC ist gerade nicht verbunden. Alles zur Cloud funktioniert trotzdem.")}</p>}
      </Card>

      {!configured && <Banner kind="info">{t("Cloud ist in dieser App-Version nicht eingerichtet. Das Konto liegt dann auf dem PC, solange er verbunden ist.")}</Banner>}
    </div>
  );
}
