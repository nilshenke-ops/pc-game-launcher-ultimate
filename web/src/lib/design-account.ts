// Account: user name + password carry the own data to another browser/device. Two variants:
//  • Cloud (configured build): our own API on Cloudflare Workers + D1 answers even when the user's PC is off.
//  • PC (no cloud configured): the companion keeps the account – that needs the PC, said plainly in the UI.
// In both cases the browser derives two keys from the password (PBKDF2): one to sign in, one to encrypt (AES-GCM).
// The password itself never leaves the device, and neither the PC nor the cloud can read the stored data.
import { client, readJson, writeJson } from "./rpc";
import {
  cloudAccountConfigured, cloudDelete, cloudLoad, cloudRegister, cloudRekey, cloudSave, cloudSignOut,
  pendingBlob, setPendingBlob,
} from "./cloud-account";
import { ACCOUNT_KEYS, buildAccountBackup, type AccountBackup } from "./account-backup";
import { getPrefs, keepDeviceMotion, onPrefsChange, replacePrefs, sanitizePrefs, type Prefs } from "./prefs";
import { reloadRoom } from "./room";
import { defaultPrefs } from "./prefs-core";
import { forgetCloudCopy } from "./cloud-sync";
import { t } from "./i18n";
import { hasAccessCode, moveSecret, rememberPassword, setCode } from "./account-secret";
import { exportKeyBundle, importKeyBundle, rescopeLocalAi, whenLocalAiReady, wipeLocalAi } from "./free-ai-local";
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

/** keys: the AI keys of this account (only inside the encrypted blob – never in a backup file, never readable by the cloud). */
export interface AccountData { prefs: Prefs; local: Record<string, unknown>; keys?: unknown }

function localData(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ACCOUNT_KEYS) { const v = readJson<unknown>(k); if (v != null) out[k] = v; }
  return out;
}

export async function encryptDesign(enc: string, p: Prefs): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keys = exportKeyBundle();
  const payload = { v: 3, prefs: designOf(p), local: localData(), ...(keys ? { keys } : {}) };
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(enc), new TextEncoder().encode(JSON.stringify(payload))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function decryptDesign(enc: string, blob: string): Promise<AccountData> {
  const all = unb64(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aes(enc), all.slice(12));
  const data = JSON.parse(new TextDecoder().decode(plain));
  // Profiles from 2.23 hold only the design.
  if (data && (data.v === 2 || data.v === 3)) return { prefs: sanitizePrefs(data.prefs), local: typeof data.local === "object" && data.local ? data.local : {}, keys: data.v === 3 ? data.keys : undefined };
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

/** After the session changed: the keys of this account are opened (and those of the account's blob put on this device). */
async function adoptKeys(keys?: unknown) {
  await rescopeLocalAi();
  await importKeyBundle(keys);
}

/** True when this build has a cloud backend: signing in no longer needs the PC. */
export const cloudMode = () => cloudAccountConfigured();

/** Puts the decrypted data on this device. Called only after every step that can fail has succeeded. */
function applyData(data: AccountData, reset = false) {
  if (reset) clearAccountData();
  replacePrefs(keepDeviceMotion({ ...data.prefs, theme: { ...data.prefs.theme, bgImage: data.prefs.theme.bgImage ?? getPrefs().theme.bgImage } }));
  for (const key of ACCOUNT_KEYS) if (key in data.local) writeJson(key, data.local[key]);
  reloadRoom();
}

export async function createProfile(userIn: string, password: string) {
  const user = userIn.trim().toLowerCase();
  if (cloudAccountConfigured()) {
    const k = await deriveKeys(user, password);
    const blob = await encryptDesign(k.enc, getPrefs());
    await cloudRegister(user, k.auth, blob);               // taken name ends here – nothing local changes
    rememberPassword(user, password);
    setPendingBlob(null);
    store({ user, auth: k.auth, enc: k.enc, savedAt: Date.now(), cloud: true });
    await adoptKeys();                                      // keys typed before take the new account – then they travel with it
    void saveNow().catch(() => { /* next change tries again */ });
    return;
  }
  const k = await deriveKeys(user, password);
  await client.call("design.create", { user, key: k.auth, blob: await encryptDesign(k.enc, getPrefs()) });
  rememberPassword(user, password);
  store({ user, ...k, savedAt: Date.now() });
  await adoptKeys();
  void saveNow().catch(() => { /* next change tries again */ });
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
      rememberPassword(user, password);
      store({ user, auth: k.auth, enc: k.enc, savedAt: Date.now(), cloud: true });
      await adoptKeys(data?.keys);                         // the keys of this account, and only these
      if (!data) await saveNow();                          // new cloud account: take the design of this device along
      await flushPending().catch(() => { /* next change tries again */ });
      return;
    } catch (e) {
      // Accounts made before the cloud still live on the PC: an unknown name there is tried on the connected PC once.
      if (!/falsch/i.test((e as Error).message)) throw e;
      // Not in the cloud and no PC to ask: say what is probably the case (the account only exists at the PC) instead of just "wrong".
      if (client.status.auth !== "ok") throw new Error(t("Benutzername oder Passwort falsch – oder das Konto liegt nur am PC. Öffne am PC Einstellungen → Konto & Anmeldedaten und tippe auf „In die Cloud übernehmen“, dann geht die Anmeldung auch hier."));
    }
  }
  const k = await deriveKeys(user, password);
  const r = await client.call<{ blob: string; updatedAt: string }>("design.load", { user, key: k.auth });
  const data = await decryptDesign(k.enc, r.blob);
  applyData(data, true);
  rememberPassword(user, password);
  store({ user, ...k, savedAt: Date.now() });
  await adoptKeys(data.keys);
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
    await adoptKeys(data?.keys);
    await flushPending().catch(() => { /* next change tries again */ });
    notifyAccount();
    return;
  }
  const r = await client.call<{ blob: string; updatedAt: string }>("design.load", { user, key: target.auth });
  const data = await decryptDesign(target.enc, r.blob);
  applyData(data, true);
  store({ user, auth: target.auth, enc: target.enc, savedAt: Date.now() });
  await adoptKeys(data.keys);
  notifyAccount();
}

export async function saveNow() {
  const s = session();
  if (!s) return;
  await whenLocalAiReady();                                  // a save never leaves out keys that are still being opened
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
    setPendingBlob(null); store(null); forget(s.user); wipeLocalAi(s.user); void rescopeLocalAi(); notifyAccount(); return;
  }
  await client.call("design.delete", { user: s.user, key: s.auth });
  store(null);
  forget(s.user);
  wipeLocalAi(s.user); void rescopeLocalAi();
  notifyAccount();
}

export const signOut = async () => {
  const s = session();
  // Changes that still wait are sent first (a few seconds at most) – after signing out nothing of the account stays on this device.
  if (s && (cloudAccountConfigured() || client.status.auth === "ok")) {
    try { await Promise.race([flushPending(), new Promise((r) => window.setTimeout(r, 2500))]); } catch { /* the account keeps what was saved before */ }
  }
  if (s?.cloud) cloudSignOut();
  store(null);
  if (s) forget(s.user);
  // Back to the standard look and the standard home: design, layout, tiles and the saved lists of the account are removed from this device.
  clearAccountData();
  replacePrefs(keepDeviceMotion({ ...defaultPrefs(), lang: getPrefs().lang }));
  forgetCloudCopy();
  reloadRoom();
  void rescopeLocalAi();                                     // signed out: the keys of the account are no longer open here
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
  const off0 = onPrefsChange(later);
  window.addEventListener("pgl-keys", later);
  const off = () => { off0(); window.removeEventListener("pgl-keys", later); };
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


// ------------------------------------------------------------------ seeing and changing the user name and password
// (the password memory itself – plain or sealed with the optional secret code – lives in account-secret.ts)

export { hasAccessCode, MIN_CODE, passwordState, revealPassword, type PasswordState } from "./account-secret";

/** Checks a typed password against the signed-in account (same keys) and remembers it for display. */
export async function confirmPassword(password: string): Promise<void> {
  const s = session();
  if (!s) throw new Error(t("Nicht angemeldet."));
  const k = await deriveKeys(s.user, password);
  if (k.auth !== s.auth) throw new Error(t("Das Passwort stimmt nicht."));
  rememberPassword(s.user, password);
}

/** Sets, changes or removes the extra secret code of the signed-in account. Without a code the password can be seen straight away (the default). */
export async function setAccessCode(newCode: string | null, oldCode?: string): Promise<void> {
  const s = session();
  if (!s) throw new Error(t("Nicht angemeldet."));
  await setCode(s.user, newCode, oldCode);
}

/**
 * Changes the user name and/or the password of the signed-in cloud account. Both are part of the keys, so the account data is sealed
 * anew and the cloud switches to the new login in one step; the PC takes the new account over by itself (and uploads again).
 */
export async function changeCredentials(o: { currentPassword?: string; newUser?: string; newPassword?: string }): Promise<void> {
  const s = session();
  if (!s?.cloud) throw new Error(t("Das geht nur mit einem Cloud-Konto."));
  const oldUser = s.user;
  const newUser = (o.newUser ?? oldUser).trim().toLowerCase();
  const newPassword = o.newPassword ?? o.currentPassword;
  // A new PASSWORD needs no old one: this device is signed in (its login key proves it to the cloud). A new NAME is part of the keys, so the password is needed.
  if (!newPassword) throw new Error(t("Für einen neuen Benutzernamen wird das Passwort gebraucht."));
  if (!USER_RX.test(newUser)) throw new Error(t("Benutzername: 3–24 Zeichen, nur a–z, Ziffern, Punkt, Minus, Unterstrich."));
  if (newPassword.length < 6) throw new Error(t("Das Passwort braucht mindestens 6 Zeichen."));
  if (newUser === oldUser && newPassword === o.currentPassword) throw new Error(t("Es hat sich nichts geändert."));
  if (o.currentPassword !== undefined) {
    const check = await deriveKeys(oldUser, o.currentPassword);
    if (check.auth !== s.auth) throw new Error(t("Das aktuelle Passwort stimmt nicht."));
  }
  const nk = await deriveKeys(newUser, newPassword);
  await whenLocalAiReady();
  const keys = exportKeyBundle();
  const blob = await encryptDesign(nk.enc, getPrefs());
  await cloudRekey(oldUser, s.auth, newUser, nk.auth, blob);        // refused (name taken, wrong password) = nothing changed anywhere
  // From here the cloud knows only the new login: this device follows at once.
  const hadCode = hasAccessCode(oldUser);
  forget(oldUser);
  moveSecret(oldUser, newUser, hadCode ? null : newPassword);         // protected by a code: type the new password once to see it again
  store({ user: newUser, auth: nk.auth, enc: nk.enc, savedAt: Date.now(), cloud: true });
  setPendingBlob(null);
  await adoptKeys(keys);
  if (newUser !== oldUser) wipeLocalAi(oldUser);
  notifyAccount();
  void import("./cloud-sync").then((m) => { m.setAutoLink(true); return m.linkPcNow(true); }).catch(() => { /* the next round tries again */ });
}


/**
 * A account that lives only on the PC ("Konto am PC") moves into the cloud under the same name and password: afterwards every device can sign in
 * without the PC, and the PC connects to it and uploads its data. If the name already exists in the cloud, the same password signs in to it.
 */
export async function moveToCloud(password: string): Promise<void> {
  const s = session();
  if (!s) throw new Error(t("Nicht angemeldet."));
  if (s.cloud) throw new Error(t("Dieses Konto liegt schon in der Cloud."));
  if (!cloudAccountConfigured()) throw new Error(t("Cloud ist für diese App noch nicht eingerichtet."));
  const k = await deriveKeys(s.user, password);
  if (k.auth !== s.auth) throw new Error(t("Das Passwort stimmt nicht."));
  await whenLocalAiReady();
  const blob = await encryptDesign(k.enc, getPrefs());
  let data: AccountData | null = null;
  try { await cloudRegister(s.user, k.auth, blob); }
  catch (e) {
    if (!/gibt es schon/i.test((e as Error).message)) throw e;
    const remote = await cloudLoad(s.user, k.auth);                  // the name exists: only the same password opens it
    data = remote ? await decryptDesign(k.enc, remote.blob) : null;
  }
  if (data) applyData(data);                                          // an existing cloud account keeps its data
  rememberPassword(s.user, password);
  store({ user: s.user, auth: k.auth, enc: k.enc, savedAt: Date.now(), cloud: true });
  await adoptKeys(data?.keys);
  if (!data) void saveNow().catch(() => { /* next change tries again */ });
  notifyAccount();
  void import("./cloud-sync").then((m) => { m.setAutoLink(true); return m.linkPcNow(true); }).catch(() => { /* the next round tries again */ });
}
