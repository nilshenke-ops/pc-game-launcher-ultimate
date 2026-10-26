import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe, Laptop, Monitor, Play, ScrollText, Stethoscope, Volume2 } from "lucide-react";
import { client, HOSTED, lanPc, type RpcError } from "../lib/rpc";
import { hostIsIp, isStandaloneApp } from "../components/keep-access";
import { isLoopbackAddress } from "../lib/address";
import { t } from "../lib/i18n";
import { useConn, useRpc } from "../lib/hooks";
import { clock } from "../lib/format";
import type { CheckResult } from "../lib/types";
import { Button, Card, CheckList, PageHead } from "../components/ui";

interface Report { at: string; checks: CheckResult[] }

/** Checks that run inside the browser itself (e.g. on the iPad) – they work even when the PC is not reachable. */
function browserChecks(conn: ReturnType<typeof useConn>, persisted: boolean | null): CheckResult[] {
  let storage = true;
  try { localStorage.setItem("pgl.test", "1"); localStorage.removeItem("pgl.test"); } catch { storage = false; }
  const checks: CheckResult[] = [];
  const add = (label: string, status: CheckResult["status"], detail: string, fix?: string) => checks.push({ label, status, detail, fix });
  const pageHttps = location.protocol === "https:";
  const url = conn.url;

  add(t("Internet laut Browser"), navigator.onLine ? "ok" : "error", navigator.onLine ? t("Online") : t("Das Gerät meldet keine Netzwerkverbindung."),
    navigator.onLine ? undefined : t("WLAN oder mobile Daten am Gerät einschalten."));

  // Address of the PC this device connects to.
  if (client.demo) add(t("PC-Adresse"), "info", t("Demo – es wird keine Verbindung aufgebaut."));
  else if (conn.needsServer || !url) add(t("PC-Adresse"), "error", t("Noch keine PC-Adresse gespeichert."), t("Unten auf „Verbinden“ tippen und den QR-Code vom PC scannen oder Code und PC-Adresse eingeben."));
  else if (isLoopbackAddress(url) && !isLoopbackAddress(location.hostname))
    add(t("PC-Adresse"), "error", t("{u} zeigt auf dieses Gerät selbst, nicht auf den PC.", { u: url }), t("Unter „Verbinden“ abmelden und die Adresse aus dem Nexus Gaming Hub („Gerät koppeln“) verwenden."));
  else if (pageHttps && url.startsWith("ws:"))
    add(t("PC-Adresse"), "error", t("Diese https-Seite darf keine unverschlüsselte Verbindung ({u}) öffnen – der Browser blockiert sie.", { u: url }), t("Im WLAN den QR-Code am PC scannen (öffnet die App direkt vom PC), oder am PC Tailscale Funnel einrichten und die https-Adresse verwenden."));
  else add(t("PC-Adresse"), "ok", url);

  // WebSocket connection (real state of this page's connection).
  const wsStatus = conn.phase === "online" ? "ok" : client.preview && !url ? "info" : "error";
  add(t("WebSocket-Verbindung"), wsStatus,
    conn.phase === "online" ? t("Verbunden ({how})", { how: conn.hello?.transport === "relay" ? t("über Relay") : t("direkt") })
      : `${conn.phase === "connecting" ? t("Verbinde …") : t("Getrennt")}${conn.attempt ? " · " + t("Versuch {n}", { n: conn.attempt }) : ""}${conn.lastError ? " · " + conn.lastError : ""}`,
    conn.phase === "online" ? undefined : t("PC einschalten und Nexus Gaming Hub starten (Symbol im Infobereich). Gleiche WLAN-Adresse wie im Nexus Gaming Hub verwenden. Fragt Windows nach der Firewall: „Private Netzwerke“ erlauben. Die App verbindet sich danach automatisch neu."));
  add(t("Antwortzeit (Ping)"), conn.latencyMs == null ? "untested" : conn.latencyMs < 150 ? "ok" : "warn", conn.latencyMs == null ? t("Noch nicht gemessen") : `${conn.latencyMs} ms`,
    conn.latencyMs != null && conn.latencyMs >= 150 ? t("Langsames WLAN oder Umweg über das Internet. Näher an den Router gehen oder im selben WLAN die direkte Adresse nutzen.") : undefined);
  if (conn.relayCompanion === "offline") add(t("Relay-Dienst"), "error", t("Das Relay ist erreichbar, aber der PC ist dort nicht angemeldet."), t("Am PC Diagnose öffnen: Relay-Adresse, Companion-ID und Schlüssel prüfen."));

  // Pairing / login of this device.
  const cred = !!client.credentials;
  if (conn.auth === "ok") add(t("Kopplungsstatus"), "ok", conn.me?.isLocal ? t("Direkt am PC angemeldet") : t("Gekoppelt und angemeldet als „{n}“", { n: conn.me?.device?.name ?? "" }));
  else if (conn.auth === "revoked") add(t("Kopplungsstatus"), "error", conn.authError ?? t("Dieses Gerät wurde am PC entfernt."), t("Neu koppeln: „Verbinden“ → QR-Code scannen."));
  else if (conn.auth === "failed") add(t("Kopplungsstatus"), "error", conn.authError ?? t("Anmeldung abgelehnt."), t("Neu koppeln: „Verbinden“ → QR-Code scannen."));
  else if (cred) add(t("Kopplungsstatus"), "info", t("Gekoppelt – Anmeldung erfolgt, sobald der PC erreichbar ist."));
  else add(t("Kopplungsstatus"), "warn", t("Dieses Gerät ist noch nicht gekoppelt."), t("Am PC „Gerät koppeln → Neuen Code erzeugen“, QR-Code scannen, am PC „Erlauben“."));
  if (conn.me) {
    const missing = ["view", "launch", "soundboard", "manage"].filter((p) => !conn.me!.permissions.includes(p));
    add(t("Berechtigungen"), missing.length ? "warn" : "ok", conn.me.permissions.join(", "), missing.length ? t("Am PC unter Geräte → dieses Gerät → Berechtigungen freigeben: {m}", { m: missing.join(", ") }) : undefined);
  }

  // Address of this page: the browser keeps the pairing per address.
  const web = HOSTED && pageHttps;
  if (web) add(t("Adresse dieser Seite"), "info", t("{h} (Website) – erreicht den PC nur über eine https-Adresse (Tailscale/Relay), nicht über die WLAN-Adresse.", { h: location.host }), lanPc() ? t("Im WLAN: „Zur PC-App (WLAN)“ oben benutzen ({u}).", { u: lanPc()! }) : undefined);
  else if (isLoopbackAddress(location.hostname)) add(t("Adresse dieser Seite"), "ok", t("{h} – direkt am PC", { h: location.host }));
  else if (hostIsIp(location.host)) add(t("Adresse dieser Seite"), "warn", t("{h} ist eine IP-Adresse. Gibt der Router dem PC eine andere, ist die Kopplung unter dieser Adresse weg.", { h: location.host }),
    t("Geräte & Verbindungen → „Andere Adresse nutzen“ (Router-Name oder Tailscale), oder im Router dem PC immer dieselbe IP geben."));
  else add(t("Adresse dieser Seite"), "ok", t("{h} – fester Name, bleibt auch bei neuer IP gleich", { h: location.host }));
  const standalone = isStandaloneApp();
  add(t("Home-Bildschirm-App"), "info", standalone ? t("Läuft als App vom Home-Bildschirm – sie hat einen eigenen Speicher und eine eigene Kopplung.") : t("Läuft im Browser. Eine App vom Home-Bildschirm hat auf iPhone/iPad einen eigenen Speicher."),
    standalone ? undefined : t("Geräte & Verbindungen → „Als App auf den Home-Bildschirm“ – damit ist die App sofort gekoppelt."));
  if (persisted != null) add(t("Dauerhafter Speicher"), persisted ? "ok" : "info", persisted ? t("Der Browser löscht die Kopplung nicht von selbst.") : t("Nicht zugesichert – der Browser darf Daten bei Platzmangel oder langer Nichtnutzung löschen (Safari: nach 7 Tagen ohne Besuch, nicht für Home-Bildschirm-Apps)."),
    persisted ? undefined : t("Als App zum Home-Bildschirm hinzufügen; in Chrome/Edge die Seite installieren."));

  add(t("Sicherer Kontext (https)"), window.isSecureContext ? "ok" : "info", window.isSecureContext ? t("Ja – Offline-Cache (PWA) verfügbar") : t("Nein (http im WLAN) – App funktioniert, aber ohne Offline-Cache"));
  add(t("Lokaler Speicher"), storage ? "ok" : "error", storage ? t("Verfügbar") : t("Blockiert (privater Modus?) – Kopplung wird nach dem Schließen vergessen."), storage ? undefined : t("Privaten Modus beenden bzw. Website-Daten für diese Seite erlauben."));
  return checks;
}

export default function Diagnostics() {
  const conn = useConn();
  const [params] = useSearchParams();
  const [sys, setSys] = useState<Report | null>(null);
  const [net, setNet] = useState<Report | null>(null);
  const [audio, setAudio] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted, () => {}); }, []);
  const [err, setErr] = useState<string | null>(null);
  const isAdmin = conn.me?.permissions.includes("admin");
  const logs = useRpc<{ entries: { time: string; level: string; area: string; message: string }[] }>("diagnostics.logs", {}, [], !!isAdmin);

  const run = async () => {
    setBusy(true); setErr(null);
    const [a, b, c] = await Promise.allSettled([client.call<Report>("diagnostics.run"), client.call<Report>("network.diagnose"), client.call<Report>("audio.diagnose")]);
    if (a.status === "fulfilled") setSys(a.value);
    else setErr((a.reason as RpcError).code === "needs-pc" || (a.reason as RpcError).code === "offline" ? t("Die PC-Prüfungen brauchen eine Verbindung zum PC. Die Prüfungen dieses Geräts oben zeigen, woran es liegt.") : (a.reason as Error).message);
    if (b.status === "fulfilled") setNet(b.value);
    if (c.status === "fulfilled") setAudio(c.value);
    setBusy(false);
    logs.reload();
  };
  useEffect(() => { if (params.get("run")) run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHead eyebrow={t("System")} title={t("Diagnose")} text={t("Prüft Companion, Netzwerk, Relay, Audio und diesen Browser. Es werden nur echte Messwerte angezeigt.")}
        actions={<Button variant="primary" icon={<Play size={16} />} busy={busy} onClick={run}>{t("Diagnose ausführen")}</Button>} />
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
      <div className="grid-2">
        <Card title={t("Dieses Gerät (z. B. iPad)")} icon={<Laptop size={18} />}><CheckList checks={browserChecks(conn, persisted)} /></Card>
        <Card title={t("Companion")} icon={<Monitor size={18} />} meta={sys && clock(sys.at)}>{sys ? <CheckList checks={sys.checks} /> : <p className="small muted">{t("Noch nicht ausgeführt.")}</p>}</Card>
        <Card title={t("Netzwerk")} icon={<Globe size={18} />} meta={net && clock(net.at)}>{net ? <CheckList checks={net.checks} /> : <p className="small muted">{t("Internet, DNS, Router, Ping und Relay – vom PC aus geprüft.")}</p>}</Card>
        <Card title={t("Audio")} icon={<Volume2 size={18} />} meta={audio && clock(audio.at)}>{audio ? <CheckList checks={audio.checks} /> : <p className="small muted">{t("Noch nicht ausgeführt.")}</p>}</Card>
      </div>
      {isAdmin && (
        <Card title={t("Protokoll")} icon={<ScrollText size={18} />} style={{ marginTop: 16 }} actions={<Button size="sm" onClick={logs.reload}>{t("Aktualisieren")}</Button>}>
          <div className="log">
            {(logs.data?.entries ?? []).map((e, i) => <div key={i} className={e.level}>{clock(e.time)} {e.level.padEnd(5)} [{e.area}] {e.message}</div>)}
            {!logs.data?.entries.length && <div className="muted">{t("Keine Einträge.")}</div>}
          </div>
        </Card>
      )}
      {!busy && !sys && <p className="tiny muted" style={{ marginTop: 14 }}><Stethoscope size={13} style={{ verticalAlign: -2 }} /> {t("Tipp: Bei Verbindungsproblemen zuerst hier prüfen, ob das Problem am Internet, am WLAN oder am Companion liegt.")}</p>}
    </>
  );
}
