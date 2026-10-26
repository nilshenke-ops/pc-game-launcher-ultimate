// Connection check with the ten parts of the way from this device to a program on the PC. Every check is a real
// request or the real state of this page's connection – nothing is assumed. Repairs only do safe things in the app
// (reconnect, go to pairing, open the PC app); nothing on the PC or in the network is changed from here.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, RefreshCw } from "lucide-react";
import { t } from "../lib/i18n";
import { useConn } from "../lib/hooks";
import { client, HOSTED, lanPc, serverUrl } from "../lib/rpc";
import { isHomeNetworkHost } from "../lib/conn-state";
import { clock } from "../lib/format";
import { Button, Card, StatusIcon, statusLabel } from "./ui";

type Status = "ok" | "warn" | "error" | "info";
interface Check { id: number; label: string; status: Status; detail: string; fix?: string; at: string; repair?: { label: string; run: () => void } }

async function reachable(url: string, ms = 3000): Promise<boolean> {
  try { await fetch(url, { mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout?.(ms) }); return true; } catch { return false; }
}
const timed = async <T,>(f: () => Promise<T>) => { const s = performance.now(); const r = await f(); return { r, ms: Math.round(performance.now() - s) }; };

export function ConnectionCheck() {
  const conn = useConn();
  const nav = useNavigate();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    const now = () => new Date().toISOString();
    const add = (c: Omit<Check, "at" | "id">) => out.push({ ...c, id: out.length + 1, at: now() });
    const c = client.status;
    const url = client.demo ? "" : serverUrl();
    let wsHttp: string | null = null;
    try { const u = new URL(url); wsHttp = `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`; } catch { /* no address */ }
    const viaRelay = c.hello?.transport === "relay" || /[?&]pc=/.test(url);
    const pageHttps = location.protocol === "https:";
    const home = url ? isHomeNetworkHost(url) : false;
    const reconnect = { label: t("Neu verbinden"), run: () => client.restart() };
    const vpnHint = home && navigator.onLine ? " " + t("Ist am Handy ein VPN aktiv? Viele VPNs leiten auch Verbindungen ins Heimnetz um – dann ist der PC nicht erreichbar.") : "";
    const vpnFix = home ? t("Im VPN „Zugriff auf lokales Netzwerk“ bzw. Split-Tunneling erlauben oder das VPN kurz ausschalten. Unterwegs: Tailscale (am PC und Handy) oder das Relay nutzen.") : undefined;

    // 1 Website
    const site = await reachable(location.origin + location.pathname);
    add({ label: t("Website erreichbar"), status: site ? "ok" : "warn", detail: site ? location.origin : t("Die Seite kommt gerade aus dem Offline-Speicher (keine Netzverbindung zur Website)."), fix: site ? undefined : t("WLAN oder mobile Daten prüfen. Gekoppelt bleibt das Gerät trotzdem.") });

    // 2 Backend (the server the app talks to: the PC itself or the relay)
    if (client.demo) add({ label: t("Backend erreichbar"), status: "info", detail: t("Demo – es wird keine Verbindung aufgebaut.") });
    else if (!wsHttp) add({ label: t("Backend erreichbar"), status: "error", detail: t("Keine PC-Adresse gespeichert."), fix: t("„PC verbinden“ öffnen und den QR-Code vom PC scannen."), repair: { label: t("PC verbinden"), run: () => nav("/connect") } });
    else if (pageHttps && wsHttp.startsWith("http:")) add({ label: t("Backend erreichbar"), status: "error", detail: t("Diese https-Seite darf {u} nicht abfragen (der Browser blockiert https → http).", { u: wsHttp }), fix: t("Im WLAN die App direkt vom PC öffnen, oder für die Website eine https-Adresse (Tailscale/Relay) einrichten."), repair: lanPc() ? { label: t("Zur PC-App (WLAN)"), run: () => { location.href = `${lanPc()}/#/`; } } : undefined });
    else {
      const { r: ok, ms } = await timed(() => reachable(`${wsHttp}/healthz`));
      add({ label: t("Backend erreichbar"), status: ok ? "ok" : "error", detail: ok ? t("{u} antwortet ({ms} ms)", { u: wsHttp, ms }) : t("{u} antwortet nicht.", { u: wsHttp }) + vpnHint, fix: ok ? undefined : (vpnFix ?? t("PC einschalten und den Begleiter starten. Im Router dem PC immer dieselbe Adresse geben.")), repair: ok ? undefined : reconnect });
    }

    // 3 Relay
    if (!viaRelay) add({ label: t("Relay erreichbar"), status: "info", detail: t("Nicht verwendet – direkte Verbindung zum PC (im WLAN oder über VPN). Nur für unterwegs ohne Tailscale nötig.") });
    else {
      const ok = wsHttp ? await reachable(`${wsHttp}/healthz`) : false;
      add({ label: t("Relay erreichbar"), status: ok ? "ok" : "error", detail: ok ? t("Relay {u} antwortet", { u: wsHttp ?? "" }) : t("Relay {u} antwortet nicht.", { u: wsHttp ?? "" }), fix: ok ? undefined : t("Läuft der Relay-Server? Die App versucht es automatisch weiter (alle paar Sekunden)."), repair: ok ? undefined : reconnect });
    }

    // 4 WebSocket (this page's one connection, measured with a real ping)
    if (c.phase === "online") {
      try { const { ms } = await timed(() => client.call("ping")); add({ label: t("WebSocket-Verbindung"), status: "ok", detail: t("Offen, Antwort in {ms} ms ({how})", { ms, how: viaRelay ? t("über Relay") : t("direkt") }) }); }
      catch (e) { add({ label: t("WebSocket-Verbindung"), status: "error", detail: (e as Error).message, repair: reconnect }); }
    } else add({ label: t("WebSocket-Verbindung"), status: "error", detail: `${c.phase === "connecting" ? t("Wird aufgebaut …") : t("Getrennt")}${c.attempt ? " · " + t("Versuch {n}", { n: c.attempt }) : ""}${c.lastError ? " · " + c.lastError : ""}` + vpnHint, fix: vpnFix ?? t("Die App verbindet sich automatisch neu, sobald der PC erreichbar ist."), repair: reconnect });

    // 5 Companion
    if (c.phase === "online" && c.hello && c.relayCompanion !== "offline") add({ label: t("Windows-Begleiter erreichbar"), status: "ok", detail: `${c.hello.info.app} ${c.hello.info.version} · ${c.hello.info.pcName}` });
    else add({ label: t("Windows-Begleiter erreichbar"), status: "error", detail: c.relayCompanion === "offline" ? t("Das Relay läuft, aber der Begleiter auf dem PC ist dort nicht angemeldet.") : t("Keine Antwort vom Begleiter."), fix: t("Am PC den Nexus Gaming Hub starten (Symbol im Infobereich) – mit „Mit Windows starten“ ist er nach jedem Neustart da.") });

    // 6 Authentication
    const authOk = c.auth === "ok";
    add({ label: t("Authentifizierung"), status: authOk ? "ok" : c.auth === "paused" ? "warn" : "error",
      detail: authOk ? (c.me?.isLocal ? t("Direkt am PC angemeldet") : t("Mit dem Geräteschlüssel angemeldet (Sitzung wird bei Bedarf selbst erneuert)")) : c.auth === "paused" ? t("Vom PC pausiert (Datenschutzmodus).") : c.authError ?? (client.credentials ? t("Noch nicht angemeldet.") : t("Dieses Gerät hat hier keinen Schlüssel – noch nicht gekoppelt.")),
      fix: authOk ? undefined : client.credentials ? undefined : t("Am PC „Gerät koppeln“ öffnen und den Code hier eingeben oder den QR-Code scannen."),
      repair: authOk ? undefined : client.credentials ? reconnect : { label: t("Gerät koppeln"), run: () => nav("/pair") } });

    // 7 Device authorised (asked at the PC)
    if (authOk) {
      try {
        const me = await client.call<{ isLocal: boolean; device: { id: string; name: string } | null; permissions: string[] }>("devices.me");
        add({ label: t("Gerät autorisiert"), status: "ok", detail: me.isLocal ? t("PC selbst") : t("„{n}“ ist am PC eingetragen · Rechte: {p}", { n: me.device?.name ?? "", p: me.permissions.join(", ") }) });
      } catch (e) { add({ label: t("Gerät autorisiert"), status: "error", detail: (e as Error).message, repair: { label: t("Gerät koppeln"), run: () => nav("/pair") } }); }
    } else add({ label: t("Gerät autorisiert"), status: c.auth === "revoked" || c.auth === "failed" ? "error" : "info", detail: c.auth === "revoked" ? t("Am PC entfernt – dieses Gerät hat keinen Zugriff mehr.") : c.auth === "failed" ? t("Der PC kennt dieses Gerät nicht (mehr).") : t("Erst nach der Anmeldung prüfbar."), repair: c.auth === "revoked" || c.auth === "failed" ? { label: t("Neu koppeln"), run: () => nav("/pair") } : undefined });

    // 8 PC online (answers a real request with data)
    let items: { id: string; name: string }[] = [];
    if (authOk) {
      try { const { r, ms } = await timed(() => client.call<{ items: { id: string; name: string }[] }>("library.list")); items = r.items ?? []; add({ label: t("PC online"), status: "ok", detail: t("„{n}“ beantwortet Anfragen ({ms} ms)", { n: c.hello?.info.pcName ?? "PC", ms }) }); }
      catch (e) { add({ label: t("PC online"), status: "error", detail: (e as Error).message, repair: reconnect }); }
    } else add({ label: t("PC online"), status: c.phase === "online" ? "info" : "error", detail: c.phase === "online" ? t("Der PC antwortet, Daten erst nach der Anmeldung.") : t("Keine Verbindung zum PC.") + vpnHint, fix: c.phase === "online" ? undefined : vpnFix });

    // 9 Device connection active (heartbeat)
    const age = client.lastPong ? Math.round((Date.now() - client.lastPong) / 1000) : null;
    add({ label: t("Geräteverbindung aktiv"), status: authOk && age != null && age < 75 ? "ok" : authOk ? "warn" : "error",
      detail: age == null ? t("Noch kein Herzschlag beantwortet.") : t("Letzter Herzschlag vor {s} s (alle 15 s, im Hintergrund alle 60 s)", { s: age }),
      fix: authOk && (age == null || age >= 75) ? t("Die Verbindung wird geprüft und bei Bedarf neu aufgebaut.") : undefined, repair: authOk && (age == null || age >= 75) ? reconnect : undefined });

    // 10 Programs and allowed actions
    if (authOk) {
      const canLaunch = c.me?.permissions.includes("launch");
      add({ label: t("Programme und Aktionen verfügbar"), status: canLaunch && items.length ? "ok" : canLaunch ? "warn" : "error",
        detail: canLaunch ? t("{n} Spiele/Programme am PC freigegeben, Recht „Starten“ vorhanden", { n: items.length }) : t("Diesem Gerät fehlt das Recht „Starten“."),
        fix: !canLaunch ? t("Am PC unter Geräte → dieses Gerät → Berechtigungen „Starten“ erlauben.") : !items.length ? t("Am PC unter Spiele oder Programme etwas freigeben (installierte Steam-, Epic-, EA- und Xbox-Spiele kommen von selbst).") : undefined });
    } else add({ label: t("Programme und Aktionen verfügbar"), status: "info", detail: t("Erst nach der Anmeldung prüfbar. Deck-Tasten lassen sich schon vorbereiten, gestartet wird erst mit Verbindung.") });

    setChecks(out);
    setBusy(false);
  }, [nav]);

  useEffect(() => { void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const bad = checks?.filter((x) => x.status === "error").length ?? 0;
  return (
    <Card title={t("Verbindungs-Check (10 Prüfungen)")} icon={<Play size={18} />} meta={checks ? (bad ? t("{n} Probleme", { n: bad }) : t("Alles in Ordnung")) : undefined}
      actions={<Button size="sm" icon={<RefreshCw size={15} />} busy={busy} onClick={() => void run()}>{t("Erneut prüfen")}</Button>}>
      {!checks ? <p className="small muted">{t("Prüfe …")}</p> : (
        <div>
          {checks.map((c) => (
            <div key={c.id} className="check-row" data-check={c.id}>
              <StatusIcon status={c.status} />
              <div className="grow">
                <div className="row between"><b>{c.id}. {c.label}</b><span className={`badge ${c.status === "ok" ? "ok" : c.status === "error" ? "error" : c.status === "warn" ? "warn" : ""}`}>{statusLabel(c.status)}</span></div>
                <div className="small muted" style={{ wordBreak: "break-word" }}>{c.detail}</div>
                {c.fix && <div className="small check-fix"><b>{t("Lösung:")}</b> {c.fix}</div>}
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <span className="tiny muted">{t("Geprüft {t}", { t: clock(c.at) })}</span>
                  {c.repair && <Button size="sm" variant="ghost" onClick={() => { c.repair!.run(); setTimeout(() => void run(), 2500); }}>{c.repair.label}</Button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {conn.phase !== "online" && HOSTED && <p className="tiny muted">{t("Hinweis: Eine https-Website erreicht den PC nur über eine https-Adresse – Details in den Prüfungen 2 und 4.")}</p>}
    </Card>
  );
}
