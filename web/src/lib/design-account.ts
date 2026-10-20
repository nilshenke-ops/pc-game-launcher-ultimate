// Design profile: user name + password carry the own design (colors, background, home layouts, bottom bar …) to another
// browser. End-to-end encrypted: the browser derives two keys from the password (PBKDF2) – one to sign in, one to
// encrypt the design (AES-GCM). The PC only stores a hash of the first and the encrypted design.
import { client, readJson, writeJson } from "./rpc";
import { getPrefs, onPrefsChange, replacePrefs, sanitizePrefs, type Prefs } from "./prefs";

const ITERATIONS = 250_000;
const KEY = "pgl.designAccount";
export const USER_RX = /^[a-z0-9._-]{3,24}$/;

export interface DesignSession { user: string; auth: string; enc: string; savedAt?: number }

const b64 = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export const cryptoAvailable = () => typeof crypto !== "undefined" && !!crypto.subtle;

/** Login key (hex, sent to the PC) and encryption key (stays here) from user name + password. */
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

export async function encryptDesign(enc: string, p: Prefs): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(enc), new TextEncoder().encode(JSON.stringify(designOf(p)))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function decryptDesign(enc: string, blob: string): Promise<Prefs> {
  const all = unb64(blob);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aes(enc), all.slice(12));
  return sanitizePrefs(JSON.parse(new TextDecoder().decode(plain)));
}

export const session = () => readJson<DesignSession>(KEY);
const store = (s: DesignSession | null) => writeJson(KEY, s);

export async function createProfile(userIn: string, password: string) {
  const user = userIn.trim().toLowerCase();
  const k = await deriveKeys(user, password);
  await client.call("design.create", { user, key: k.auth, blob: await encryptDesign(k.enc, getPrefs()) });
  store({ user, ...k, savedAt: Date.now() });
}

/** Signs in and puts the stored design on this browser. */
export async function signIn(userIn: string, password: string) {
  const user = userIn.trim().toLowerCase();
  const k = await deriveKeys(user, password);
  const r = await client.call<{ blob: string; updatedAt: string }>("design.load", { user, key: k.auth });
  const design = await decryptDesign(k.enc, r.blob);
  // Keep the background picture of this browser if the stored design had to leave it out.
  replacePrefs({ ...design, theme: { ...design.theme, bgImage: design.theme.bgImage ?? getPrefs().theme.bgImage } });
  store({ user, ...k, savedAt: Date.now() });
}

export async function saveNow() {
  const s = session();
  if (!s) return;
  await client.call("design.save", { user: s.user, key: s.auth, blob: await encryptDesign(s.enc, getPrefs()) });
  store({ ...s, savedAt: Date.now() });
}

export async function deleteProfile() {
  const s = session();
  if (!s) return;
  await client.call("design.delete", { user: s.user, key: s.auth });
  store(null);
}

export const signOut = () => store(null);

let timer: number | undefined;
/** While signed in, every design change is saved to the profile a few seconds later (when the PC is reachable). */
export function startDesignAutoSave() {
  return onPrefsChange(() => {
    if (!session()) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (client.status.auth === "ok") saveNow().catch(() => { /* next change tries again */ }); }, 3000);
  });
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
