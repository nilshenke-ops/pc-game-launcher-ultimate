import { t } from "./i18n";

// The password of the signed-in account, kept ONLY on this device so it can be shown in the settings (never sent anywhere, not part of the account data).
// By default it is stored plain; the owner may add an extra secret code – then it is sealed with that code (AES-GCM, key from PBKDF2) and cannot be shown without it.
const SECRET_KEY = "pgl.accountSecret";
interface SecretRec { pw?: string; box?: { salt: string; iv: string; ct: string } }

const b64 = (b: ArrayBuffer | Uint8Array) => { const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ""; for (const x of u) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function read(): Record<string, SecretRec> {
  try { return JSON.parse(localStorage.getItem(SECRET_KEY) ?? "{}") as Record<string, SecretRec>; } catch { return {}; }
}
function write(all: Record<string, SecretRec>) {
  try { if (Object.keys(all).length) localStorage.setItem(SECRET_KEY, JSON.stringify(all)); else localStorage.removeItem(SECRET_KEY); } catch { /* storage blocked: the password is then simply not remembered */ }
}
const put = (user: string, rec: SecretRec | null) => { const all = read(); if (rec) all[user] = rec; else delete all[user]; write(all); };

async function codeKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 150_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function sealWithCode(password: string, code: string): Promise<NonNullable<SecretRec["box"]>> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await codeKey(code, salt), new TextEncoder().encode(password));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
async function openWithCode(box: NonNullable<SecretRec["box"]>, code: string): Promise<string> {
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) as BufferSource }, await codeKey(code, unb64(box.salt)), unb64(box.ct) as BufferSource)); }
  catch { throw new Error(t("Der Geheimcode ist falsch.")); }
}

export const MIN_CODE = 4;
export type PasswordState = "unknown" | "visible" | "locked";

/** What this device knows about the password of an account: visible (stored plain), locked (needs the secret code) or unknown (type it once). */
export function passwordState(user: string): PasswordState {
  const r = read()[user];
  return r?.box ? "locked" : r?.pw ? "visible" : "unknown";
}
export const hasAccessCode = (user: string) => !!read()[user]?.box;

/** Remembers the password typed at sign-in (a code-protected one is not overwritten – it needs the code). */
export function rememberPassword(user: string, password: string) {
  if (read()[user]?.box) return;
  put(user, { pw: password });
}

/** The password for display: plain when no code is set, otherwise the secret code opens it. */
export async function revealPassword(user: string, code?: string): Promise<string> {
  const r = read()[user];
  if (r?.box) { if (!code) throw new Error(t("Bitte den Geheimcode eingeben.")); return openWithCode(r.box, code); }
  if (r?.pw) return r.pw;
  throw new Error(t("Das Passwort ist auf diesem Gerät nicht gespeichert."));
}

/** Sets (4+ characters), changes or removes (null) the secret code. Changing or removing needs the old code. */
export async function setCode(user: string, newCode: string | null, oldCode?: string): Promise<void> {
  const cur = read()[user];
  const pw = cur?.box ? await openWithCode(cur.box, oldCode ?? "") : cur?.pw;
  if (!pw) throw new Error(t("Das Passwort ist auf diesem Gerät nicht gespeichert – gib es zuerst einmal ein."));
  if (newCode === null) { put(user, { pw }); return; }
  if (newCode.length < MIN_CODE) throw new Error(t("Der Geheimcode braucht mindestens {n} Zeichen.", { n: MIN_CODE }));
  put(user, { box: await sealWithCode(pw, newCode) });
}

/** After a name/password change: the record moves to the new name (with the new password, or empty when a code protected the old one). */
export function moveSecret(oldUser: string, newUser: string, password: string | null) {
  if (newUser !== oldUser) put(oldUser, null);
  put(newUser, password ? { pw: password } : null);
}
