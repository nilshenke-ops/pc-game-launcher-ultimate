import { Link } from "react-router-dom";
import { BookOpen, Cable, Globe, Keyboard, Link2, Rocket, Wrench } from "lucide-react";
import { t } from "../lib/i18n";
import { useAppState } from "../lib/state";
import { Card, PageHead } from "../components/ui";
import { DownloadCard } from "../components/DownloadCard";

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <Card title={title} icon={icon}><div className="stack small" style={{ lineHeight: 1.6 }}>{children}</div></Card>;
}

export default function Help() {
  const { state } = useAppState();
  return (
    <>
      <PageHead eyebrow={t("Hilfe")} title={t("Hilfe & Anleitung")} text={t("Kurz erklärt, wie alles zusammenspielt. Ausführliche Anleitungen liegen im Projekt (INSTALLATION.md, TROUBLESHOOTING.md).")} />
      <div className="grid-2">
        <Section icon={<Rocket size={18} />} title={t("Erste Schritte")}>
          <ol className="steps">
            <li>{t("PCGameLauncherCompanion.exe auf dem PC starten (keine Installation nötig). Beim ersten Start „Private Netzwerke“ in der Firewall-Abfrage erlauben.")}</li>
            <li>{t("Im Companion „Gerät koppeln“ → „Neuen Code erzeugen“.")}</li>
            <li>{t("QR-Code mit dem Handy scannen, Code bestätigen, am PC „Erlauben“ klicken.")}</li>
            <li>{t("Unter „Spiele“ → „Hinzufügen“ installierte Spiele übernehmen.")}</li>
            <li>{t("Tipp: Auf dem iPhone in Safari „Teilen → Zum Home-Bildschirm“ wählen.")}</li>
          </ol>
        </Section>
        <Section icon={<Link2 size={18} />} title={t("Welche Adresse öffne ich?")}>
          <p>{t("Die Web-App wird vom Companion auf deinem PC ausgeliefert. Im selben WLAN:")}</p>
          {(state?.lanUrls ?? []).map((u) => <code key={u}>{u}</code>)}
          <p className="muted">{t("Diese Adresse funktioniert, solange der PC an ist und der Companion läuft. Vorschau-Links aus Entwicklungsumgebungen sind nur vorübergehend und nicht zum Weitergeben geeignet.")}</p>
        </Section>
        <Section icon={<Globe size={18} />} title={t("Zugriff von unterwegs")}>
          <p>{t("Ohne Zusatz ist der PC nur im Heimnetz erreichbar – es werden keine Router-Ports geöffnet. Für unterwegs gibt es zwei sichere Wege:")}</p>
          <p><b>{t("1. Cloudflare Tunnel")}</b> – {t("cloudflared auf dem PC leitet eine https-Adresse auf http://localhost:8787 weiter. Die Adresse in Einstellungen → Verbindung als „Öffentliche Adresse“ eintragen. Schnell-Tunnel (trycloudflare.com) sind temporär und ändern sich bei jedem Start.")}</p>
          <p><b>{t("2. Eigenes Relay")}</b> – {t("den mitgelieferten Relay-Server auf einem kleinen Server mit https betreiben und im Companion eintragen.")}</p>
        </Section>
        <Section icon={<Cable size={18} />} title={t("Discord & Soundboard")}>
          <p>{t("Damit andere im Sprachkanal deine Sounds hören, wird ein virtuelles Audiokabel benötigt (z. B. VB-Audio Virtual Cable). Soundboard-Ausgabe = CABLE Input, Mikrofon-Durchleitung an, in Discord Eingabegerät = CABLE Output. Details im Audio Center.")}</p>
        </Section>
        <Section icon={<Keyboard size={18} />} title={t("Hotkeys & Automatisierungen")}>
          <p>{t("Hotkeys funktionieren global am PC, auch im Spiel. Automatisierungen reagieren auf Spielstart/-ende, Profilwechsel oder fehlende Audiogeräte. Spiele werden über ihren Prozessnamen oder Installationsordner erkannt.")}</p>
        </Section>
        <Section icon={<Wrench size={18} />} title={t("Probleme?")}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>{t("„PC nicht erreichbar“: Companion läuft? Gleiches WLAN? Firewall erlaubt?")}</li>
            <li>{t("Spiel startet nicht: Ist Steam/Epic installiert und angemeldet? Fehlermeldung unter Verlauf.")}</li>
            <li>{t("Kein Sound in Discord: Audio-Diagnose ausführen.")}</li>
            <li>{t("Code abgelaufen: Codes gelten 5 Minuten – einfach neuen erzeugen.")}</li>
          </ul>
          <Link className="btn sm" to="/diagnostics?run=1" style={{ alignSelf: "flex-start" }}>{t("Diagnose ausführen")}</Link>
        </Section>
      </div>
      <div style={{ marginTop: 16 }}><DownloadCard /></div>
      <p className="tiny muted" style={{ marginTop: 16 }}><BookOpen size={13} style={{ verticalAlign: -2 }} /> PC Game Launcher Ultimate {state ? `v${state.version}` : ""}</p>
    </>
  );
}
