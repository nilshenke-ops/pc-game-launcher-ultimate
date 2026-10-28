// "Dauerhaft auf diesem Gerät": the browser keeps a pairing per address, and on iPhone/iPad the home-screen app has its
// own storage. A one-time transfer link (10 minutes, single use) adds a further access without pairing again.

import { useEffect, useState } from "react";
import { ArrowRightLeft, Home, MapPin } from "lucide-react";
import { client, readJson, writeJson } from "../lib/rpc";
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
      <StableAddressOffer />
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

const DISMISS_KEY = "pgl.stable-offer";

/** Asks a fixed address (router name, .local) whether it reaches the same companion – from this phone, in its network. */
export async function findStableAddress(addresses: Address[], timeoutMs = 2500): Promise<Address | null> {
  const get = async (base: string) => {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), timeoutMs);
    try { const r = await fetch(`${base.replace(/\/+$/, "")}/healthz`, { signal: c.signal, cache: "no-store" }); return r.ok ? ((await r.json()) as { instance?: string }).instance ?? null : null; }
    catch { return null; }
    finally { clearTimeout(timer); }
  };
  const mine = await get(location.origin);
  if (!mine) return null;
  for (const a of addresses.filter((x) => (x.kind === "router" || x.kind === "mdns") && x.url.startsWith("http://") && new URL(x.url).origin !== location.origin)) {
    if ((await get(a.url)) === mine) return a;
  }
  return null;
}

/**
 * Opened via the QR code under the PC's IP: if this phone also reaches the PC under its fixed name, offer to move there
 * in one tap – then the pairing stays when the router gives the PC another IP.
 */
export function StableAddressOffer() {
  const [found, setFound] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!hostIsIp(location.host) || client.demo) return;
    let dismissed = false;
    try { dismissed = readJson<string>(DISMISS_KEY) === location.host; } catch { /* storage blocked */ }
    if (dismissed) return;
    let alive = true;
    client.call<{ device: unknown; addresses?: Address[] | null }>("devices.me")
      .then((me) => (me.device && me.addresses?.length ? findStableAddress(me.addresses) : null))
      .then((a) => { if (alive) setFound(a); }, () => {});
    return () => { alive = false; };
  }, []);
  if (!found) return null;
  const move = async () => {
    setBusy(true);
    try {
      const r = await client.call<{ code: string }>("devices.handoff");
      location.href = handoffLink(found.url, r.code);
    } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  };
  const later = () => { try { writeJson(DISMISS_KEY, location.host); } catch { /* ignore */ } setFound(null); };
  return (
    <Banner kind="info" title={t("Feste Adresse gefunden: {h}", { h: new URL(found.url).host })}
      actions={<><Button variant="primary" size="sm" busy={busy} onClick={move}>{t("Jetzt umziehen")}</Button><Button size="sm" onClick={later}>{t("Später")}</Button></>}>
      {t("Du bist über die IP-Adresse verbunden. Vergibt der Router dem PC eine neue, findet dieses Handy ihn nicht mehr. Unter dem festen Namen bleibt die Verbindung – ein Tipp, ohne neu zu koppeln. Danach diese Adresse als Lesezeichen bzw. auf den Home-Bildschirm legen.")} {t("Achtung: Läuft am Handy ein VPN (auch Tailscale) oder „Privates DNS“, findet es den Namen oft nicht – dann lieber bei der IP bleiben. Die IP-Seite bleibt gekoppelt.")}
    </Banner>
  );
}
