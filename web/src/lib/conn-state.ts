// One place that turns the real connection state into words (top bar, device list, diagnosis). Nothing here guesses:
// "Verbunden" only when this connection is open AND signed in right now.

import type { ConnStatus } from "./rpc";
import { t } from "./i18n";

export type ConnKey = "pc-offline-cloud" | "cloud-down" | "demo" | "connected" | "signing-in" | "connecting" | "reconnecting" | "pc-unreachable" | "pc-not-at-relay" | "login-needed" | "not-authorized" | "paused" | "no-pc";
export interface ConnView { key: ConnKey; label: string; short: string; tone: "ok" | "warn" | "error" }

/** Failed tries in a row after which "Wiederverbindung läuft" turns into "PC nicht erreichbar" (about 10 seconds in the foreground). */
export const UNREACHABLE_AFTER = 20;

export function connView(c: ConnStatus, opts: { demo?: boolean; hasCredentials?: boolean } = {}): ConnView {
  const v = (key: ConnKey, label: string, short: string, tone: ConnView["tone"]): ConnView => ({ key, label: t(label), short: t(short), tone });
  if (opts.demo) return v("demo", "Demo – keine echte Verbindung", "Demo", "warn");
  if (c.auth === "revoked") return v("not-authorized", "Gerät nicht autorisiert – am PC entfernt", "Nicht autorisiert", "error");
  if (c.auth === "failed") return v("not-authorized", "Gerät nicht autorisiert – bitte neu koppeln", "Nicht autorisiert", "error");
  if (c.needsServer) return v("no-pc", "Noch kein PC eingerichtet", "Kein PC", "warn");
  // The account's cloud link is connected and waits for the PC: nothing is guessed and nothing is retried – the cloud reports the PC the moment its companion is up.
  if (c.phase !== "online" && c.cloudLink === "waiting") return v("pc-offline-cloud", "PC offline – verbindet sich von selbst, sobald er läuft", "PC offline", "warn");
  if (c.phase === "online") {
    if (c.relayCompanion === "offline") return v("pc-not-at-relay", "PC nicht erreichbar – Relay läuft, PC ist dort nicht angemeldet", "PC offline", "error");
    if (c.auth === "ok") return v("connected", "Verbunden", "Verbunden", "ok");
    if (c.auth === "paused") return v("paused", "Vom PC pausiert (Datenschutzmodus)", "Pausiert", "warn");
    if (c.auth === "checking") return v("signing-in", "Anmeldung läuft", "Anmeldung …", "warn");
    return v("login-needed", opts.hasCredentials ? "Anmeldung erforderlich" : "Anmeldung erforderlich – Gerät noch nicht gekoppelt", "Nicht angemeldet", "warn");
  }
  if (c.phase === "connecting" && c.via === "cloud") return v("connecting", "PC wird gesucht", "PC wird gesucht …", "warn");
  if (c.phase === "connecting" && !c.everConnected) return v("connecting", "Verbindung wird aufgebaut", "Verbinde …", "warn");
  if (c.phase === "offline" && c.cloudLink === "down" && c.via === "cloud") return v("cloud-down", "Cloud nicht erreichbar – neuer Versuch läuft", "Cloud offline", "error");
  // Many failed tries in a row: say plainly that the PC cannot be reached (it keeps trying in the background).
  if (c.everConnected && c.attempt >= UNREACHABLE_AFTER) return v("pc-unreachable", t("PC nicht erreichbar – die App versucht es weiter (Versuch {n})", { n: c.attempt }), "PC offline", "error");
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

/** The PC's companion does not know an action this (newer) page asks for: say so and where to update, instead of a bare error. */
export function outdatedCompanionMessage(companionVersion?: string, action?: string): string {
  const v = companionVersion ? ` (v${companionVersion})` : "";
  return t("Der Companion auf deinem PC{v} kennt diese Funktion noch nicht{a}. Bitte unter Einstellungen → Updates aktualisieren.", { v, a: action ? ` – „${action}“` : "" });
}
