import { useState } from "react";
import { Eye, Palette, PlugZap, RefreshCw, Server, WifiOff } from "lucide-react";
import { client, defaultServerUrl, enterDemo, serverUrl, setServerUrl } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useNow } from "../lib/hooks";
import { Banner, Button, Card, Field } from "../components/ui";
import { DownloadCard } from "../components/DownloadCard";

/** Shown when the companion/relay cannot be reached and no session exists yet. Never an endless spinner. */
export function ConnectScreen() {
  const conn = useConn();
  const now = useNow(500);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(serverUrl());
  const first = conn.phase === "connecting" && conn.attempt === 0;
  const seconds = conn.retryAt ? Math.max(0, Math.ceil((conn.retryAt - now) / 1000)) : 0;

  return (
    <div className="center-screen">
      <div className="center-card stack fade-in">
        <div style={{ textAlign: "center" }} className="stack-sm">
          <div className={`state-icon ${first ? "" : "warn"}`}>{first ? <PlugZap size={34} /> : <WifiOff size={34} />}</div>
          <h1>{first ? t("Verbinde mit deinem PC …") : t("PC nicht erreichbar")}</h1>
          <p className="muted">
            {first ? t("Einen Moment – die Verbindung zum PC Game Launcher Companion wird aufgebaut.")
              : t("Diese Seite konnte keine Verbindung zum Companion auf deinem Gaming-PC herstellen.")}
          </p>
        </div>

        {!first && (
          <Card className="flat">
            <div className="stack">
              <b>{t("Häufige Ursachen")}</b>
              <ul className="small muted" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                <li>{t("Der PC ist aus oder der Companion wurde beendet (Symbol im Infobereich prüfen).")}</li>
                <li>{t("Dein Handy ist nicht im selben WLAN wie der PC (mobile Daten ausschalten).")}</li>
                <li>{t("Die Windows-Firewall blockiert den Zugriff – beim ersten Start „Private Netzwerke“ erlauben.")}</li>
                <li>{t("Der Link ist veraltet, z. B. eine alte Vorschau-Adresse. Die richtige Adresse zeigt der Companion unter „Gerät koppeln“.")}</li>
              </ul>
              <div className="row between">
                <span className="small muted">{conn.phase === "connecting" ? t("Verbinde …") : t("Neuer Versuch in {s} s", { s: seconds })}</span>
                <Button variant="primary" icon={<RefreshCw size={16} />} onClick={() => client.reconnectNow()}>{t("Jetzt erneut versuchen")}</Button>
              </div>
              {conn.lastError && <div className="tiny muted">{t("Letzte Meldung:")} {conn.lastError}</div>}
            </div>
          </Card>
        )}

        {!first && (
          <Card className="flat" title={t("Serveradresse")} icon={<Server size={18} />} actions={!editing && <Button size="sm" onClick={() => setEditing(true)}>{t("Ändern")}</Button>}>
            {!editing ? <code>{conn.url}</code> : (
              <div className="stack">
                <Field label={t("WebSocket-Adresse")} hint={t("Normalerweise automatisch. Für ein Relay z. B. wss://relay.example.com/ws?pc=mein-pc")}>
                  <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoCapitalize="off" />
                </Field>
                <div className="row">
                  <Button variant="primary" onClick={() => { setServerUrl(url === defaultServerUrl() ? null : url); setEditing(false); client.restart(); }}>{t("Speichern & verbinden")}</Button>
                  <Button onClick={() => { setServerUrl(null); setUrl(defaultServerUrl()); setEditing(false); client.restart(); }}>{t("Standard")}</Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {!first && location.protocol === "https:" && serverUrl().startsWith("ws://") && (
          <Banner kind="warn">{t("Eine https-Seite darf keine unverschlüsselte ws://-Verbindung öffnen. Nutze eine wss://-Adresse (Relay oder Tunnel).")}</Banner>
        )}
        {!first && (
          <Card className="flat" title={t("Ohne PC umsehen")} icon={<Eye size={18} />}>
            <div className="stack">
              <p className="small muted">{t("Die Demo zeigt die ganze Oberfläche mit Beispieldaten. Es wird nichts auf einem PC ausgeführt.")}</p>
              <div className="row">
                <Button variant="primary" icon={<Palette size={16} />} onClick={() => client.openOffline()}>{t("App ohne PC öffnen")}</Button>
                <Button icon={<Eye size={16} />} onClick={enterDemo}>{t("Demo mit Beispieldaten")}</Button>
              </div>
              <p className="tiny muted">{t("„App ohne PC öffnen“: Design und Layout schon jetzt einstellen – sobald der PC an ist, verbindet sich die App automatisch.")}</p>
            </div>
          </Card>
        )}
        {!first && <DownloadCard compact />}
      </div>
    </div>
  );
}
