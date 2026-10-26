// Settings → Verbindung: Tailscale for "unterwegs". The PC reads the Tailscale status and, on one click at the PC,
// switches https in the own tailnet on or off (fixed commands in the companion – nothing to type).

import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Shield } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card } from "./ui";

interface Info { installed: boolean; running: boolean; name: string | null; https: boolean; url: string | null }

export function TailscaleCard() {
  const conn = useConn();
  const isLocal = !!conn.me?.isLocal;
  const q = useRpc<Info>("tailscale.get", {}, ["pairing"], isLocal);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  const toggle = async (on: boolean) => {
    setBusy(true); setOut(null);
    try {
      const r = await client.call<{ ok: boolean; output: string; info: Info }>("tailscale.serve", { on });
      if (r.ok) toast(on ? t("Tailscale-HTTPS ist an") : t("Tailscale-HTTPS ist aus"), "success");
      else setOut(r.output || t("Tailscale hat den Befehl abgelehnt."));
      q.reload();
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const d = q.data;
  return (
    <Card title={t("Unterwegs mit Tailscale")} icon={<Shield size={18} />} meta={d ? <span className={`badge ${d.https ? "ok" : d.running ? "warn" : ""}`}>{d.https ? t("https aktiv") : d.running ? t("verbunden, ohne https") : d.installed ? t("nicht verbunden") : t("nicht installiert")}</span> : undefined}>
      <div className="stack">
        <p className="small muted">{t("Tailscale verbindet dein Handy und deinen PC über ein privates, verschlüsseltes Netz – auch über Mobilfunk, ohne Router-Einstellungen. Kostenlos für private Nutzung.")}</p>
        {!isLocal && <Banner kind="info">{t("Ein- und ausschalten geht nur direkt am PC.")}</Banner>}
        {isLocal && d && !d.installed && <Banner kind="info" title={t("Tailscale ist auf diesem PC nicht installiert")}>{t("Installiere Tailscale auf dem PC und auf dem iPhone/iPad und melde dich auf beiden mit demselben Konto an. Danach hier „Tailscale-HTTPS einschalten“.")}</Banner>}
        {isLocal && d?.installed && !d.running && <Banner kind="warn">{t("Tailscale ist installiert, aber nicht angemeldet oder ausgeschaltet. Tailscale am PC öffnen und anmelden.")}</Banner>}
        {d?.name && <div className="small">{t("Name im Tailnet")}: <code>{d.name}</code>{d.url && <> · <a href={d.url} target="_blank" rel="noreferrer">{d.url} <ExternalLink size={12} /></a></>}</div>}
        {isLocal && d?.running && (
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {!d.https ? <Button variant="primary" busy={busy} onClick={() => void toggle(true)}>{t("Tailscale-HTTPS einschalten")}</Button>
              : <Button busy={busy} onClick={() => void toggle(false)}>{t("Tailscale-HTTPS ausschalten")}</Button>}
          </div>
        )}
        {out && <Banner kind="warn" title={t("Tailscale meldet")}><pre className="small" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{out}</pre>{t("Meist fehlt die einmalige Freigabe in der Tailscale-Verwaltung: DNS → MagicDNS an und „Enable HTTPS“. Schritt für Schritt unter Hilfe.")}</Banner>}
        {d?.https && <Banner kind="ok">{t("Fertig: Der QR-Code unter „Gerät koppeln“ nutzt jetzt diese https-Adresse – damit funktioniert auch die Website von unterwegs, sobald Tailscale am Handy an ist.")}</Banner>}
        <Link to="/settings?s=help#tailscale" className="small">{t("Wie funktioniert das? → Hilfe")}</Link>
      </div>
    </Card>
  );
}
