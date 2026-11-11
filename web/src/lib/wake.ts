// "PC einschalten": the FRITZ!Box wakes the PC (Wake-on-LAN), triggered through the cloud by a signed-in device.
// The access to the FRITZ!Box (MyFRITZ address, user, password) is typed in once, sealed with the account's own key and kept on the device
// (it travels with the account, still sealed). It is sent to the cloud only at the moment of a start signal and is never stored there.
//
// Honest states: "sent" only means the FRITZ!Box sent the wake packet. Whether Windows starts is seen from the FRITZ!Box (device active in the
// home network) and from the PC itself (it reports to the cloud and reconnects).

import { useSyncExternalStore } from "react";
import { readJson, writeJson, client } from "./rpc";
import { session } from "./design-account";
import { openBlob, sealBlob } from "./cloud-seal";
import { cloudCall, cloudSyncStatus, pullNow } from "./cloud-sync";
import { t } from "./i18n";

export interface WakeConfig { host: string; port: number; fbUser: string; fbPass: string; mac: string }
export interface WakeHostInfo { known: boolean; active?: boolean; name?: string; iface?: string; ip?: string }
export type WakePhase = "idle" | "sending" | "sent" | "booting" | "connecting" | "failed";
export interface WakeState { phase: WakePhase; sentAt: number | null; error: string | null; info: WakeHostInfo | null; infoAt: number | null; configured: boolean }

const KEY = "pgl.wake";
export const MAC_RX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;
export const normalizeMac = (m: string) => m.trim().toUpperCase().replace(/-/g, ":");
export const cleanHost = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
export const hostLooksRight = (h: string) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.myfritz\.(net|link)$/.test(cleanHost(h));
/** Splits "https://xyz.myfritz.net:44321" into address and port (people paste the whole thing from the FRITZ!Box). */
export function splitAddress(text: string): { host: string; port: number | null } {
  const m = /^(?:https?:\/\/)?([^:/\s]+)(?::(\d{1,5}))?/i.exec(text.trim());
  return { host: m ? m[1].toLowerCase() : "", port: m?.[2] ? Number(m[2]) : null };
}
/** How long the whole start may take before the app says "not reachable" (boot + Windows sign-in + companion). */
export const WAKE_TIMEOUT_MS = 4 * 60_000;
const POLL_MS = 6000;

let state: WakeState = { phase: "idle", sentAt: null, error: null, info: null, infoAt: null, configured: !!readJson<{ box?: string }>(KEY)?.box };
const listeners = new Set<() => void>();
const publish = (p: Partial<WakeState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const wakeState = () => state;
export const useWake = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);
if (typeof window !== "undefined") window.addEventListener("pgl-account", () => publish({ configured: !!readJson<{ box?: string }>(KEY)?.box }));

export async function loadWakeConfig(): Promise<WakeConfig | null> {
  const s = session(), box = readJson<{ box?: string }>(KEY)?.box;
  if (!s || !box) return null;
  try { return JSON.parse(await openBlob(s.enc, box)) as WakeConfig; }
  catch { return null; }                                                    // sealed with another password: it has to be typed in again
}
export async function saveWakeConfig(c: WakeConfig): Promise<void> {
  const s = session();
  if (!s) throw new Error(t("Dafür musst du mit deinem Cloud-Konto angemeldet sein."));
  writeJson(KEY, { box: await sealBlob(s.enc, JSON.stringify({ ...c, host: cleanHost(c.host), mac: normalizeMac(c.mac) })) });
  publish({ configured: true, error: null });
  window.dispatchEvent(new Event("pgl-keys"));                               // the account saves it (sealed) so other devices get it
}
export function clearWakeConfig() { writeJson(KEY, null); publish({ configured: false, info: null }); window.dispatchEvent(new Event("pgl-keys")); }

const target = (c: WakeConfig) => ({ host: c.host, port: c.port, fbUser: c.fbUser, fbPass: c.fbPass, mac: c.mac });

/** What the FRITZ!Box knows about the PC right now (also the test of the access data). */
export async function wakeHostInfo(c?: WakeConfig): Promise<WakeHostInfo> {
  const cfg = c ?? await loadWakeConfig();
  if (!cfg) throw new Error(t("„PC einschalten“ ist noch nicht eingerichtet."));
  const r = await cloudCall("wakeinfo", target(cfg));
  const info: WakeHostInfo = { known: r.known === true, active: r.active === true, name: typeof r.name === "string" ? r.name : undefined, iface: typeof r.iface === "string" ? r.iface : undefined, ip: typeof r.ip === "string" ? r.ip : undefined };
  if (!c) publish({ info, infoAt: Date.now() });
  return info;
}

let timer: number | undefined;
const stopWatch = () => { if (timer) window.clearInterval(timer); timer = undefined; };
const pcOnline = () => client.status.phase === "online" && client.status.auth === "ok";

/** Follows the start: FRITZ!Box sees the PC → the PC reports to the cloud → the connection is back. Stops by itself. */
function watch(sentAt: number) {
  stopWatch();
  let n = 0;
  timer = window.setInterval(async () => {
    n++;
    if (pcOnline()) { stopWatch(); publish({ phase: "idle", sentAt: null, error: null }); return; }
    if (Date.now() - sentAt > WAKE_TIMEOUT_MS) {
      stopWatch();
      publish({ phase: "failed", error: state.info?.active
        ? t("Der PC ist im Heimnetz angekommen, aber der Begleiter hat sich nicht gemeldet. Startet er automatisch mit Windows, und ist Windows angemeldet?")
        : t("Der PC ist nicht gestartet. Das Startsignal wurde gesendet – vermutlich nimmt der Laptop es nicht an (LAN-Kabel, Netzteil, BIOS- und Windows-Einstellungen prüfen).") });
      return;
    }
    if (n % 2 === 0) void pullNow().catch(() => undefined);
    const synced = cloudSyncStatus().pcSyncedAt;
    if (synced && synced > sentAt) { publish({ phase: "connecting" }); client.reconnectNow(); return; }
    try { const info = await wakeHostInfo(); if (info.active && state.phase === "sent") publish({ phase: "booting" }); } catch { /* the next round tries again */ }
  }, POLL_MS);
}

/** Sends the start signal. Never twice at once; a second tap within 20 s is refused (also by the cloud). */
export async function sendWake(): Promise<void> {
  if (state.phase === "sending" || (state.sentAt && Date.now() - state.sentAt < 20_000)) return;
  const cfg = await loadWakeConfig();
  if (!cfg) { publish({ phase: "failed", error: t("„PC einschalten“ ist noch nicht eingerichtet.") }); return; }
  publish({ phase: "sending", error: null });
  try {
    await cloudCall("wake", target(cfg));
    const sentAt = Date.now();
    publish({ phase: "sent", sentAt });
    watch(sentAt);
  } catch (e) { publish({ phase: "failed", error: (e as Error).message, sentAt: null }); }
}

/** The PC is back (seen by the page): the start is over. */
export function wakeDone() { if (state.phase !== "idle") { stopWatch(); publish({ phase: "idle", sentAt: null, error: null }); } }
export function wakeReset() { stopWatch(); publish({ phase: "idle", sentAt: null, error: null }); }

/** The one line the UI shows, by state (see the table in docs/WAKE-ON-LAN.md). */
export function wakeLabel(s: WakeState, online: boolean, signedIn: boolean): { key: "connected" | "off" | "sent" | "booting" | "connecting" | "unreachable" | "unavailable"; text: string } {
  if (online) return { key: "connected", text: t("PC verbunden") };
  if (s.phase === "sending" || s.phase === "sent") return { key: "sent", text: t("PC wird gestartet") };
  if (s.phase === "booting") return { key: "booting", text: t("PC startet gerade") };
  if (s.phase === "connecting") return { key: "connecting", text: t("Verbindung wird hergestellt") };
  if (!signedIn || !s.configured) return { key: "unavailable", text: t("Wake-on-LAN nicht verfügbar") };
  if (s.phase === "failed") return { key: "unreachable", text: t("PC nicht erreichbar") };
  if (s.info && s.info.known && s.info.active === false) return { key: "off", text: t("PC ausgeschaltet") };
  if (s.info && s.info.active) return { key: "unreachable", text: t("PC nicht erreichbar") };       // on in the home network, but the companion does not answer
  return { key: "off", text: t("PC ausgeschaltet") };
}
