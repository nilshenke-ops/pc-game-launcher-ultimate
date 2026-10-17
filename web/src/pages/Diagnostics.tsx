import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Globe, Laptop, Monitor, Play, ScrollText, Stethoscope, Volume2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc } from "../lib/hooks";
import { clock } from "../lib/format";
import type { CheckResult } from "../lib/types";
import { Button, Card, CheckList, PageHead } from "../components/ui";

interface Report { at: string; checks: CheckResult[] }

/** Checks that run inside the browser itself – they tell apart "no internet" from "PC not reachable". */
function browserChecks(conn: ReturnType<typeof useConn>): CheckResult[] {
  let storage = true;
  try { localStorage.setItem("pgl.test", "1"); localStorage.removeItem("pgl.test"); } catch { storage = false; }
  return [
    { label: t("Internet laut Browser"), status: navigator.onLine ? "ok" : "error", detail: navigator.onLine ? t("Online") : t("Das Gerät meldet keine Netzwerkverbindung.") },
    { label: t("Verbindung zum Companion"), status: conn.phase === "online" ? "ok" : "error", detail: `${conn.url} · ${conn.phase}${conn.lastError ? " · " + conn.lastError : ""}` },
    { label: t("Antwortzeit (Ping)"), status: conn.latencyMs == null ? "untested" : conn.latencyMs < 150 ? "ok" : "warn", detail: conn.latencyMs == null ? t("Noch nicht gemessen") : `${conn.latencyMs} ms` },
    { label: t("Verbindungsart"), status: "info", detail: conn.hello?.transport === "relay" ? t("Über Relay") : t("Direkt (lokal)") },
    { label: t("Sicherer Kontext (https)"), status: window.isSecureContext ? "ok" : "info", detail: window.isSecureContext ? t("Ja – Offline-Cache (PWA) verfügbar") : t("Nein (http im WLAN) – App funktioniert, aber ohne Offline-Cache") },
    { label: t("Lokaler Speicher"), status: storage ? "ok" : "error", detail: storage ? t("Verfügbar") : t("Blockiert (privater Modus?) – Kopplung wird nach dem Schließen vergessen.") },
  ];
}

export default function Diagnostics() {
  const conn = useConn();
  const [params] = useSearchParams();
  const [sys, setSys] = useState<Report | null>(null);
  const [net, setNet] = useState<Report | null>(null);
  const [audio, setAudio] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isAdmin = conn.me?.permissions.includes("admin");
  const logs = useRpc<{ entries: { time: string; level: string; area: string; message: string }[] }>("diagnostics.logs", {}, [], !!isAdmin);

  const run = async () => {
    setBusy(true); setErr(null);
    const [a, b, c] = await Promise.allSettled([client.call<Report>("diagnostics.run"), client.call<Report>("network.diagnose"), client.call<Report>("audio.diagnose")]);
    if (a.status === "fulfilled") setSys(a.value); else setErr((a.reason as Error).message);
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
        <Card title={t("Dieser Browser")} icon={<Laptop size={18} />}><CheckList checks={browserChecks(conn)} /></Card>
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
