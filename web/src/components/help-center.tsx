// Settings → Hilfe: works without the PC (plain text in the app). Explains connecting, the fixed name, the
// home-screen app and Tailscale step by step.

import { useEffect, type ReactNode } from "react";
import { HelpCircle, Home, Route, Shield, Wifi } from "lucide-react";
import { t } from "../lib/i18n";
import { Banner, Card } from "./ui";

function Steps({ items }: { items: ReactNode[] }) {
  return <ol className="steps small">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
}

export function HelpCenter() {
  useEffect(() => { if (location.hash.includes("tailscale")) document.getElementById("help-tailscale")?.scrollIntoView({ behavior: "smooth" }); }, []);
  return (
    <div className="stack">
      <Card title={t("So verbindet sich dein Handy mit dem PC")} icon={<Wifi size={18} />}>
        <div className="stack small">
          <p>{t("Einmal koppeln reicht. Danach meldet sich jedes Gerät bei jedem Öffnen selbst an – auch nach einem Neustart von Handy, Browser oder PC.")}</p>
          <Steps items={[
            t("Am PC: Nexus Gaming Hub → „Gerät koppeln“ → „Neuen Code erzeugen“."),
            t("Am iPhone/iPad: QR-Code mit der Kamera scannen (oder die angezeigte Adresse öffnen und den Code eintippen)."),
            t("Am PC „Erlauben“ tippen."),
            t("Am Handy: Geräte & Verbindungen → „Als App auf den Home-Bildschirm“ und in Safari Teilen → „Zum Home-Bildschirm“. Ab dann nur noch das App-Symbol benutzen."),
          ]} />
          <p className="muted">{t("Der Code gilt 5 Minuten und nur einmal – das ist Absicht. Für ein weiteres Gerät einfach einen neuen Code erzeugen.")}</p>
        </div>
      </Card>

      <Card title={t("Fester Name im WLAN – nichts einzurichten")} icon={<Home size={18} />}>
        <div className="stack small">
          <p>{t("Der PC meldet sich im WLAN selbst unter einem festen Namen an, z. B. nexus-gaming-pc.local. Der QR-Code nutzt diesen Namen. Bekommt der PC vom Router eine neue IP-Adresse, findet dein iPhone oder iPad ihn trotzdem – du musst am Router nichts einstellen.")}</p>
          <p className="muted">{t("Das funktioniert mit iPhone, iPad und Mac von selbst. Manche Android-Geräte kennen solche Namen nicht – dann nutzt der QR-Code die IP-Adresse.")}</p>
        </div>
      </Card>

      <span id="help-tailscale" />
      <Card title={t("Unterwegs mit Tailscale")} icon={<Shield size={18} />}>
        <div className="stack small">
          <p>{t("Tailscale ist ein privates, verschlüsseltes Netz nur für deine eigenen Geräte. Dein Handy erreicht den PC damit auch über Mobilfunk oder fremdes WLAN – ohne Portfreigabe am Router, ohne öffentlichen Zugang. Für private Nutzung kostenlos.")}</p>
          <b>{t("Einmal einrichten (ca. 5 Minuten)")}</b>
          <Steps items={[
            t("Am PC: Tailscale von tailscale.com/download installieren und anmelden (z. B. mit Google, Microsoft oder Apple)."),
            t("Am iPhone/iPad: Die App „Tailscale“ aus dem App Store laden und mit demselben Konto anmelden. Die VPN-Erlaubnis bestätigen."),
            t("Einmalig in der Tailscale-Verwaltung (login.tailscale.com → DNS): „MagicDNS“ einschalten und unter „HTTPS Certificates“ auf „Enable HTTPS“ tippen. Hinweis: Dabei werden die Gerätenamen in einem öffentlichen Zertifikats-Verzeichnis eingetragen – Inhalte oder Zugang gibt es dadurch nicht."),
            t("Am PC in Nexus: Einstellungen → Verbindung → „Tailscale-HTTPS einschalten“. Nexus richtet die sichere Adresse selbst ein und prüft sie."),
            t("Am PC „Gerät koppeln“ → neuen Code erzeugen und am Handy scannen. Der QR-Code enthält jetzt die Tailscale-Adresse."),
          ]} />
          <b>{t("Im Alltag")}</b>
          <Steps items={[
            t("Unterwegs am Handy die Tailscale-App einschalten (Schalter in der App oder in den iOS-Einstellungen unter VPN). Dann Nexus öffnen – fertig."),
            t("Zu Hause geht es auch ohne Tailscale über das WLAN. Du kannst Tailscale aber einfach anlassen."),
            t("Der PC muss an sein, der Begleiter laufen und Tailscale am PC angemeldet sein (startet mit Windows)."),
          ]} />
          <Banner kind="info">{t("Ein anderes VPN (z. B. für Streaming) leitet oft auch dein Heimnetz um. Dann erreicht das Handy den PC nicht – die Diagnose zeigt das an. Lösung: im VPN „Zugriff auf lokales Netzwerk“ erlauben oder es kurz ausschalten.")}</Banner>
        </div>
      </Card>

      <Card title={t("Wenn etwas nicht klappt")} icon={<Route size={18} />}>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>{t("Oben rechts steht immer der echte Zustand (Verbunden, Wiederverbinden …, Nicht autorisiert). Antippen öffnet die Diagnose mit 10 Prüfungen und Lösungen.")}</li>
          <li>{t("„Nicht autorisiert“: Das Gerät wurde am PC entfernt oder die Website-Daten wurden gelöscht – einfach neu koppeln.")}</li>
          <li>{t("Privates Surfen in Safari speichert keine Kopplung. Bitte ein normales Fenster oder die Home-Bildschirm-App nutzen.")}</li>
          <li>{t("Die Website (github.io) erreicht den PC zu Hause nur über die PC-App im WLAN oder über Tailscale-HTTPS – sie zeigt dann „Zur PC-App (WLAN)“.")}</li>
        </ul>
      </Card>
      <p className="tiny muted"><HelpCircle size={12} style={{ verticalAlign: -2 }} /> {t("Diese Hilfe funktioniert auch ohne PC-Verbindung.")}</p>
    </div>
  );
}
