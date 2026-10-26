// One place that turns the real connection state into words (top bar, device list, diagnosis). Nothing here guesses:
// "Verbunden" only when this connection is open AND signed in right now.

import type { ConnStatus } from "./rpc";
import { t } from "./i18n";

export type ConnKey = "demo" | "connected" | "signing-in" | "connecting" | "reconnecting" | "pc-unreachable" | "pc-not-at-relay" | "login-needed" | "not-authorized" | "paused" | "no-pc";
export interface ConnView { key: ConnKey; label: string; short: string; tone: "ok" | "warn" | "error" }

export function connView(c: ConnStatus, opts: { demo?: boolean; hasCredentials?: boolean } = {}): ConnView {
  const v = (key: ConnKey, label: string, short: string, tone: ConnView["tone"]): ConnView => ({ key, label: t(label), short: t(short), tone });
  if (opts.demo) return v("demo", "Demo – keine echte Verbindung", "Demo", "warn");
  if (c.auth === "revoked") return v("not-authorized", "Gerät nicht autorisiert – am PC entfernt", "Nicht autorisiert", "error");
  if (c.auth === "failed") return v("not-authorized", "Gerät nicht autorisiert – bitte neu koppeln", "Nicht autorisiert", "error");
  if (c.needsServer) return v("no-pc", "Noch kein PC eingerichtet", "Kein PC", "warn");
  if (c.phase === "online") {
    if (c.relayCompanion === "offline") return v("pc-not-at-relay", "PC nicht erreichbar – Relay läuft, PC ist dort nicht angemeldet", "PC offline", "error");
    if (c.auth === "ok") return v("connected", "Verbunden", "Verbunden", "ok");
    if (c.auth === "paused") return v("paused", "Vom PC pausiert (Datenschutzmodus)", "Pausiert", "warn");
    if (c.auth === "checking") return v("signing-in", "Anmeldung läuft", "Anmeldung …", "warn");
    return v("login-needed", opts.hasCredentials ? "Anmeldung erforderlich" : "Anmeldung erforderlich – Gerät noch nicht gekoppelt", "Nicht angemeldet", "warn");
  }
  if (c.phase === "connecting" && !c.everConnected) return v("connecting", "Verbindung wird aufgebaut", "Verbinde …", "warn");
  if (c.everConnected) return v("reconnecting", c.attempt > 0 ? t("Verbindung unterbrochen – automatische Wiederverbindung (Versuch {n})", { n: c.attempt }) : "Verbindung unterbrochen – automatische Wiederverbindung", "Wiederverbinden …", "error");
  return v("pc-unreachable", "PC nicht erreichbar", "Offline", "error");
}

/** Host of a PC address that only works inside the home network (or a VPN that lets it through). */
export function isHomeNetworkHost(url: string): boolean {
  let h = "";
  try { h = new URL(url).hostname.toLowerCase(); } catch { return false; }
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return /\.(fritz\.box|local|lan|home|speedport\.ip)$/.test(h);
}
