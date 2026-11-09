// Account: user name + password carry the own data to another browser/device. Two variants:
//  • Cloud (configured build): our own API on Cloudflare Workers + D1 answers even when the user's PC is off.
//  • PC (no cloud configured): the companion keeps the account – that needs the PC, said plainly in the UI.
// In both cases the browser derives two keys from the password (PBKDF2): one to sign in, one to encrypt (AES-GCM).
// The password itself never leaves the device, and neither the PC nor the cloud can read the stored data.
import { client, readJson, writeJson } from "./rpc";
import {
  cloudAccountConfigured, cloudDelete, cloudLoad, cloudRegister, cloudSave, cloudSignOut,
  pendingBlob, setPendingBlob,
} from "./cloud-account";
import { ACCOUNT_KEYS, buildAccountBackup, type AccountBackup } from "./account-backup";
import { getPrefs, onPrefsChange, replacePrefs, sanitizePrefs, type Prefs } from "./prefs";
import { reloadRoom } from "./room";
import { t } from "./i18n";
export { ACCOUNT_KEYS } from "./account-backup";

const ITERATIONS = 250_000;
const KEY = "pgl.designAccount";
export const USER_RX = /^[a-z0-9._-]{3,24}$/;

export interface DesignSession { user: string; auth: string; enc: string; savedAt?: number; /** Stored in the cloud instead of on the PC. */ cloud?: boolean }

const b64 = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** Login key (hex) and encryption key (stays here) from the account name + password. */
export async function deriveKeys(user: string, password: string): Promise<{ auth: string; enc: string }> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode("nexus-design-v1:" + user.toLowerCase()), iterations: ITERATIONS }, base, 512));
  return { auth: hex(bits.slice(0, 32)), enc: b64(bits.slice(32)) };
}

async function aes(enc: string) { return crypto.subtle.importKey("raw", unb64(enc), "AES-GCM", false, ["encrypt", "decrypt"]); }

/** The design without device-only things; a too big background picture is left out (it would not fit). */
export function designOf(p: Prefs): Prefs {
  const d = structuredClone(p);
  if (d.theme.bgImage && d.theme.bgImage.length > 500_000) d.theme.bgImage = null;
  return d;
}

/** Data of this browser that goes with the account and into a backup – see account-backup.ts (never AI keys). */

export interface AccountData { prefs: Prefs; local: Record<string, unknown> }

function localData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ACCOUNT_KEYS) { const v = readJson<unknown>(k); if (v != null) out[k] = v; }
  return out;
}

export async function encryptDesign(enc: string, p: Prefs): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = { v: 2, prefs: designOf(p), local: localData() };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(enc), new TextEncoder().encode(JSON.stringify(payload))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function decryptDesign(enc: string, blob: string): Promise<AccountData> {
  const all = unb64(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aes(enc), all.slice(12));
  const data = JSON.parse(new TextDecoder().decode(plain));
  // Profiles from 2.23 hold only the design.
  if (data && data.v === 2) return { prefs: sanitizePrefs(data.prefs), local: typeof data.local === "object" && data.local ? data.local : {} };
  return { prefs: sanitizePrefs(data), local: {} };
}

export const session = () => readJson<DesignSession>(KEY);

/** A readable backup of the account data of this device – the same whitelist as the account, never AI keys. */
export function accountBackup(): AccountBackup | null {
  const s = session();
  if (!s) return null;
  return buildAccountBackup(s.user, designOf(getPrefs()), localData(), { savedAt: s.savedAt });
}

const store = (s: DesignSession | null) => { writeJson(KEY, s); if (s) remember(s); };

// Several accounts on one device: the login and encryption keys of each are kept (sealed by the password), so switching
// needs no password again. The names themselves are unique – the cloud refuses a second account with the same name.
const LIST_KEY = "pgl.designAccounts";
export const MAX_ACCOUNTS = 6;

/** The accounts remembered on this device, oldest first. */
export function listAccounts(): DesignSession[] {
  const all = readJson<DesignSession[]>(LIST_KEY);
  if (!Array.isArray(all)) return [];
  return all.filter((a) => a && typeof a.user === "string" && !!a.auth && !!a.enc).slice(-MAX_ACCOUNTS);
}

function remember(s: DesignSession) {
  writeJson(LIST_KEY, [...listAccounts().filter((a) => a.user !== s.user), { ...s }].slice(-MAX_ACCOUNTS));
}
function forget(user: string) { writeJson(LIST_KEY, listAccounts().filter((a) => a.user !== user)); }

/** Removes everything that belongs to an account from this device (before another account is put on it). */
function clearAccountData() {
  for (const key of ACCOUNT_KEYS) writeJson(key, null);
  setPendingBlob(null);
}

/** Tells the UI (cloud page, status lines) that the session or its saved state changed – e.g. a waiting change was sent. */
function notifyAccount() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pgl-account"));
}

/** True when this build has a cloud backend: signing in no longer needs the PC. */
export const cloudMode = () => cloudAccountConfigured();

/** Puts the decrypted data on this device. Called only after every step that can fail has succeeded. */
function applyData(data: AccountData, reset = false) {
  if (reset) clearAccountData();
  replacePrefs({ ...data.prefs, theme: { ...data.prefs.theme, bgImage: data.prefs.theme.bgImage ?? getPrefs().theme.bgImage } });
  for (const key of ACCOUNT_KEYS) if (key in data.local) writeJson(key, data.local[key]);
  reloadRoom();
}

export async function createProfile(userIn: string, password: string) {
  const user = userIn.trim().toLowerCase();
  if (cloudAccountConfigured()) {
    const k = await deriveKeys(user, password);
    const blob = await encryptDesign(k.enc, getPrefs());
    await cloudRegister(user, k.auth, blob);               // taken name ends here – nothing local changes
    setPendingBlob(null);
    store({ user, auth: k.auth, enc: k.enc, savedAt: Date.now(), cloud: true });
    return;
  }
  const k = await deriveKeys(user, password);
  await client.call("design.create", { user, key: k.auth, blob: await encryptDesign(k.enc, getPrefs()) });
  store({ user, ...k, savedAt: Date.now() });
}

/** Signs in and puts the stored data on this browser. A failure leaves the data here untouched. */
export async function signIn(userIn: string, password: string) {
  const user = userIn.trim().toLowerCase();
  if (cloudAccountConfigured()) {
    const k = await deriveKeys(user, password);
    try {
      const remote = await cloudLoad(user, k.auth);         // wrong name/key ends here
      const data = remote ? await decryptDesign(k.enc, remote.blob) : null; // a wrong key ends here as well
      if (data) applyData(data, true);                     // nothing of the account before stays on this device
      store({ user, auth: k.auth, enc: k.enc, savedAt: Date.now(), cloud: true });
      if (!data) await saveNow();                          // new cloud account: take the design of this device along
      await flushPending().catch(() => { /* next change tries again */ });
      return;
    } catch (e) {
      // Accounts made before the cloud still live on the PC: an unknown name there is tried on the connected PC once.
      if (!/falsch/i.test((e as Error).message) || client.status.auth !== "ok") throw e;
    }
  }
  const k = await deriveKeys(user, password);
  const r = await client.call<{ blob: string; updatedAt: string }>("design.load", { user, key: k.auth });
  const data = await decryptDesign(k.enc, r.blob);
  applyData(data, true);
  store({ user, ...k, savedAt: Date.now() });
  notifyAccount();
}

/**
 * Switches to another account that is already remembered on this device – no password needed, because the login and
 * encryption keys of that account are stored here. Nothing changes when the data cannot be loaded.
 */
export async function switchAccount(userIn: string) {
  const user = userIn.trim().toLowerCase();
  if (session()?.user === user) return;
  const target = listAccounts().find((a) => a.user === user);
  if (!target) throw new Error(t("Dieses Konto ist auf diesem Gerät nicht gespeichert – bitte einmal mit Passwort anmelden."));
  if (target.cloud) {
    const remote = await cloudLoad(user, target.auth);        // wrong name/key or no connection ends here – nothing changed
    const data = remote ? await decryptDesign(target.enc, remote.blob) : null;
    if (data) applyData(data, true); else clearAccountData();
    store({ user, auth: target.auth, enc: target.enc, savedAt: Date.now(), cloud: true });
    await flushPending().catch(() => { /* next change tries again */ });
    notifyAccount();
    return;
  }
  const r = await client.call<{ blob: string; updatedAt: string }>("design.load", { user, key: target.auth });
  const data = await decryptDesign(target.enc, r.blob);
  applyData(data, true);
  store({ user, auth: target.auth, enc: target.enc, savedAt: Date.now() });
  notifyAccount();
}

export async function saveNow() {
  const s = session();
  if (!s) return;
  const blob = await encryptDesign(s.enc, getPrefs());
  if (s.cloud) {
    try { await cloudSave(s.user, s.auth, blob); setPendingBlob(null); }
    catch (e) { setPendingBlob(blob); throw e; }            // kept on this device, sent at the next opportunity
    store({ ...s, savedAt: Date.now() });
    notifyAccount();
    return;
  }
  await client.call("design.save", { user: s.user, key: s.auth, blob });
  store({ ...s, savedAt: Date.now() });
  notifyAccount();
}

/** Sends a change that was made while the cloud was unreachable. */
export async function flushPending() {
  const s = session();
  const blob = pendingBlob();
  if (!s?.cloud || !blob) return;
  await cloudSave(s.user, s.auth, blob);
  setPendingBlob(null);
  store({ ...s, savedAt: Date.now() });
  notifyAccount();
}

export async function deleteProfile() {
  const s = session();
  if (!s) return;
  if (s.cloud) {
    try { await cloudDelete(s.user, s.auth); } catch (e) {
      // Already gone in the cloud: then only forget it here.
      if (!/falsch|abgelehnt|nicht eingerichtet/i.test((e as Error).message)) throw e;
    }
    setPendingBlob(null); store(null); forget(s.user); notifyAccount(); return;
  }
  await client.call("design.delete", { user: s.user, key: s.auth });
  store(null);
  forget(s.user);
  notifyAccount();
}

export const signOut = () => {
  const s = session();
  if (s?.cloud) cloudSignOut();
  store(null);
  if (s) forget(s.user);
  notifyAccount();
};

let timer: number | undefined;
/** While signed in, every change is saved a few seconds later – to the cloud (no PC needed) or to the PC. */
export function startDesignAutoSave() {
  const reachable = () => cloudAccountConfigured() || client.status.auth === "ok";
  const later = () => {
    if (!session()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (reachable()) saveNow().catch(() => { /* next change tries again */ }); }, 3000);
  };
  const off = onPrefsChange(later);
  const onVisible = () => {
    if (!session()) return;
    if (document.visibilityState === "hidden") { if (reachable()) saveNow().catch(() => {}); }
    else void flushPending().catch(() => {});              // back on screen: send what waited
  };
  document.addEventListener("visibilitychange", onVisible);
  const onOnline = () => void flushPending().catch(() => {});
  window.addEventListener("online", onOnline);
  return () => { off(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("online", onOnline); };
}

// ------------------------------------------------------------------ design code (works without any PC)

/** The design as a text code to copy into another browser (no account, no PC). */
export function designCode(): string {
  return "NXD1:" + b64(new TextEncoder().encode(JSON.stringify(designOf(getPrefs()))));
}

export function applyDesignCode(code: string): boolean {
  const c = code.trim();
  if (!c.startsWith("NXD1:")) return false;
  try { replacePrefs(sanitizePrefs(JSON.parse(new TextDecoder().decode(unb64(c.slice(5)))))); return true; }
  catch { return false; }
}
