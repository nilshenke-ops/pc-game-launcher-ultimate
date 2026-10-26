// "Dauerhaft auf diesem Gerät": the browser keeps a pairing per address, and on iPhone/iPad the home-screen app has its
// own storage. A one-time transfer link (10 minutes, single use) adds a further access without pairing again.

import { useState } from "react";
import { ArrowRightLeft, Home, MapPin } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { Banner, Button, Modal } from "./ui";

interface Address { url: string; kind: "public" | "tailscale-https" | "router" | "mdns" | "tailscale" | "lan" }

export function isStandaloneApp() {
  try { return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; }
}

/** An IP address as host means: the pairing is lost when the router hands out another one. */
export function hostIsIp(host: string) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(host.split(":")[0]) || host.startsWith("["); }

export function kindLabel(kind: Address["kind"]) {
  return { public: t("Eigene https-Adresse"), "tailscale-https": t("Tailscale (https, auch unterwegs)"), router: t("Router-Name (fest im WLAN)"), mdns: t("Fester Name im WLAN (automatisch)"), tailscale: t("Tailscale (auch unterwegs)"), lan: t("WLAN-IP (kann sich ändern)") }[kind];
}

/** Link that opens the app under `base` and adds that address as a further access of this device. */
export function handoffLink(base: string, code: string) {
  return `${base.replace(/\/+$/, "")}/?handoff=${encodeURIComponent(code)}#/`;
}

export function KeepAccess() {
  const [busy, setBusy] = useState(false);
  const [homeScreen, setHomeScreen] = useState(false);
  const [moves, setMoves] = useState<{ code: string; addresses: Address[] } | null>(null);
  const standalone = isStandaloneApp();
  const here = location.origin;
  const onIp = hostIsIp(location.host);

  const create = async () => {
    setBusy(true);
    try { return await client.call<{ code: string; expiresAt: string; addresses: Address[] }>("devices.handoff"); }
    catch (e) { toast((e as Error).message, "error"); return null; }
    finally { setBusy(false); }
  };

  const toHomeScreen = async () => {
    const r = await create();
    if (!r) return;
    // The home-screen app starts with the address shown now – it carries the one-time code.
    history.replaceState(null, "", `${location.pathname}?handoff=${encodeURIComponent(r.code)}${location.hash}`);
    setHomeScreen(true);
  };
  const closeHomeScreen = () => { history.replaceState(null, "", location.pathname + location.hash); setHomeScreen(false); };

  const showMoves = async () => {
    const r = await create();
    if (r) setMoves({ code: r.code, addresses: r.addresses.filter((a) => new URL(a.url).origin !== here) });
  };

  return (
    <div className="stack-sm">
      <b className="small">{t("Dauerhaft auf diesem Gerät")}</b>
      <div className="small muted"><MapPin size={13} style={{ verticalAlign: -2 }} /> {t("Gekoppelt unter {h}", { h: location.host })}{onIp ? " · " + t("IP-Adresse – ändert der Router sie, ist die Kopplung hier weg.") : ""}</div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        {!standalone && <Button size="sm" icon={<Home size={15} />} busy={busy} onClick={toHomeScreen}>{t("Als App auf den Home-Bildschirm")}</Button>}
        <Button size="sm" icon={<ArrowRightLeft size={15} />} busy={busy} onClick={showMoves}>{t("Andere Adresse nutzen")}</Button>
      </div>
      {homeScreen && (
        <Modal title={t("Als App auf den Home-Bildschirm")} onClose={closeHomeScreen} footer={<Button variant="primary" onClick={closeHomeScreen}>{t("Fertig")}</Button>}>
          <div className="stack">
            <ol className="steps small">
              <li>{t("Jetzt in Safari unten (iPhone) bzw. oben (iPad) auf das Teilen-Symbol tippen.")}</li>
              <li>{t("„Zum Home-Bildschirm“ wählen und „Hinzufügen“.")}</li>
              <li>{t("Die App vom Home-Bildschirm öffnen – sie meldet sich selbst an und erscheint als eigenes Gerät in der Liste.")}</li>
            </ol>
            <Banner kind="info">{t("Der Link in der Adresszeile gilt 10 Minuten und nur einmal. Die Home-Bildschirm-App hat auf iPhone und iPad einen eigenen Speicher – deshalb braucht sie diesen eigenen Zugang. Android/Chrome: Menü → „App installieren“.")}</Banner>
          </div>
        </Modal>
      )}
      {moves && (
        <Modal title={t("Andere Adresse nutzen")} onClose={() => setMoves(null)} footer={<Button onClick={() => setMoves(null)}>{t("Schließen")}</Button>}>
          <div className="stack">
            <p className="small muted">{t("Unter jeder Adresse merkt sich der Browser die Kopplung getrennt. Mit diesem Link bekommt die gewählte Adresse einen eigenen Zugang (10 Minuten gültig, einmal).")}</p>
            {moves.addresses.length === 0 ? <Banner kind="info">{t("Der PC kennt keine weitere Adresse. Eine feste Adresse gibt es mit einem Router-Namen (z. B. FRITZ!Box) oder mit Tailscale – siehe Diagnose → „Feste Adresse“.")}</Banner> : (
              <div className="list">
                {moves.addresses.map((a) => (
                  <a key={a.url} className="list-item" href={handoffLink(a.url, moves.code)}>
                    <div className="grow"><div className="title">{new URL(a.url).host}</div><div className="sub">{kindLabel(a.kind)}</div></div>
                    {a.kind !== "lan" && onIp && <span className="badge ok">{t("Empfohlen")}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
