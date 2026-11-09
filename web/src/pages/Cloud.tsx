import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cloud, CloudOff, Download, HardDrive, KeyRound, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { t } from "../lib/i18n";
import { toast, useConn } from "../lib/hooks";
import { relTime } from "../lib/format";
import { Banner, Button, Card } from "../components/ui";
import { AccountPanel } from "../components/design-profile";
import { AndroidAppCard } from "../components/android-app-card";
import { CLOUD_WEB, cloudAccountConfigured, cloudApi, cloudHealth, pendingBlob, type CloudHealth } from "../lib/cloud-account";
import { accountBackup, flushPending, listAccounts, saveNow, session, switchAccount } from "../lib/design-account";
import { LOCAL_NAME, LOCAL_PROVIDERS, SEARCH_NAME, SEARCH_PROVIDERS, useLocalAi } from "../lib/free-ai-local";

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
  const localAi = useLocalAi();
  const [health, setHealth] = useState<CloudHealth | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const refresh = () => { setS(session()); setWaiting(!!pendingBlob()); setAccounts(listAccounts()); };
    window.addEventListener("pgl-account", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("pgl-account", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  // Reachability of the service says more than a vague error: it separates "cloud is down" from "password is wrong".
  useEffect(() => {
    if (!configured) return;
    let alive = true;
    setChecking(true);
    void cloudHealth().then((h) => { if (alive) setHealth(h); }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [configured]);

  const checkHealth = async () => {
    setChecking(true);
    try { setHealth(await cloudHealth()); } finally { setChecking(false); }
  };

  // The keys themselves are deliberately not part of the account; this only shows which ones stay here.
  const localKeys = [
    ...LOCAL_PROVIDERS.map((p) => ({ id: p, name: LOCAL_NAME[p], state: localAi[p] })),
    ...SEARCH_PROVIDERS.map((p) => ({ id: p, name: `${SEARCH_NAME[p]} · ${t("Websuche")}`, state: localAi.search?.[p] ?? "none" })),
    { id: "elevenlabs", name: "ElevenLabs", state: localAi.eleven ?? "none" },
  ].filter((x) => x.state !== "none");

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

  const downloadBackup = () => {
    const backup = accountBackup();
    if (!backup) { toast(t("Zum Sichern bitte erst anmelden."), "error"); return; }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-konto-${backup.user}-${backup.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t("Backup heruntergeladen."), "success");
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
          <span className="small muted">Cloudflare</span>
          <a className="small" href={CLOUD_WEB} target="_blank" rel="noreferrer">{t("Cloud speichern")}</a>
        </div>
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small muted">{t("Status")}</span>
          <span className="small">
            {s?.cloud
              ? <>{t("Angemeldet als {u}", { u: s.user })}{s.savedAt ? <span className="muted"> · {t("gespeichert {d}", { d: relTime(s.savedAt) })}</span> : null}</>
              : t("Nicht angemeldet")}
          </span>
        </div>
        <div className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="small muted">{t("Dienst")}</span>
          <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="small" role="status">
              {!configured ? t("Nicht eingerichtet") : checking ? t("Wird geprüft …") : health?.ok ? t("Erreichbar") : health ? t("Nicht erreichbar") : t("Noch nicht geprüft")}
            </span>
            {configured && <Button size="sm" variant="ghost" busy={checking} onClick={() => void checkHealth()}>{t("Prüfen")}</Button>}
          </span>
        </div>
        {configured && health && !health.ok && <p className="tiny muted" style={{ margin: 0 }}>{health.message}</p>}
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
            <p className="tiny muted" style={{ margin: 0 }}>{t("Wechseln braucht kein Passwort mehr – die Schlüssel liegen verschlüsselt auf diesem Gerät. Jeden Benutzernamen gibt es nur einmal – ein zweites Konto mit demselben Namen lehnt der Dienst ab.")}</p>
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

      <Card title={t("KI-Schlüssel bleiben auf diesem Gerät")} icon={<KeyRound size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("KI-Schlüssel und API-Schlüssel liegen verschlüsselt auf diesem Gerät – die am PC eingerichteten bleiben am PC. Anmelden, Abmelden, Kontowechsel und „Konto löschen“ ändern daran nichts. Ins Konto reist nur die KI-Auswahl, also welcher Anbieter zuerst antwortet – nie ein Schlüssel.")}</p>
        {localKeys.length > 0 ? (
          <div className="stack-sm" style={{ marginTop: 8 }}>
            {localKeys.map((k) => (
              <div key={k.id} className="row between" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="small">{k.name}</span>
                <span className={`badge ${k.state === "ready" ? "ok" : "warn"}`}>{k.state === "ready" ? t("Bereit") : t("Gesperrt")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>{t("Noch kein Schlüssel auf diesem Gerät eingerichtet – in der KI-Verwaltung eintragen, dann bleibt er hier.")}</p>
        )}
        <div className="row" style={{ marginTop: 10 }}>
          <Link to="/assistant" className="btn sm">{t("Zur KI-Verwaltung")}</Link>
        </div>
      </Card>

      <Card title={t("Backup der Kontodaten")} icon={<Download size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Sichert den Stand dieses Kontos auf diesem Gerät als lesbare JSON-Datei: Design, Startseite und Leiste, Sprache, Gamer-Pass, Zähler, Pausen-Erinnerung, Raum-Einstellung, JARVIS-MEMORY-Ordner und -Regeln, Wetter-Ort und KI-Auswahl. KI- und API-Schlüssel sind nicht enthalten – sie bleiben verschlüsselt auf dem Gerät.")}</p>
        {s ? (
          <div className="row" style={{ gap: 10, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Button size="sm" icon={<Download size={14} />} onClick={downloadBackup}>{t("Backup herunterladen")}</Button>
            <span className="tiny muted">{t("Konto: {u}", { u: s.user })}</span>
          </div>
        ) : (
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>{t("Zum Sichern bitte erst anmelden – ohne Konto gibt es keine Kontodaten.")}</p>
        )}
        <p className="tiny muted" style={{ margin: "8px 0 0" }}>{t("Die Datei ist nicht verschlüsselt – bitte sicher aufbewahren.")}</p>
      </Card>

      <AndroidAppCard />

      <Card title={t("Was am PC bleibt")} icon={<HardDrive size={18} />}>
        <p className="small" style={{ margin: 0 }}>{t("Spiele, Programme, Profile, Kalender, Dateien und die PC-Steuerung. Dafür muss der PC an sein – die Cloud-Anmeldung gibt keine Rechte am PC.")}</p>
        {!online && <p className="tiny muted" style={{ margin: "8px 0 0" }}><CloudOff size={13} style={{ verticalAlign: -2 }} /> {t("Der PC ist gerade nicht verbunden. Alles zur Cloud funktioniert trotzdem.")}</p>}
      </Card>

      {!configured && <Banner kind="info">{t("Cloud ist in dieser App-Version nicht eingerichtet. Das Konto liegt dann auf dem PC, solange er verbunden ist.")}</Banner>}
    </div>
  );
}
