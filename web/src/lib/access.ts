// Access code asked once per device before the app opens (a view lock against people who only have the link).
// It is checked in the browser, so it is not a security boundary: control of the PC is protected by pairing + confirmation
// on the PC. Only a salted SHA-256 of the code is stored here, never the code itself.
import { sha256, toHex, utf8 } from "./sha256";

const SALT = "pgl-access-v1:";
/** SHA-256("pgl-access-v1:" + code). Change it to change the code; devices are then asked again. */
export const ACCESS_HASH = "195e98124fe23aa42b97dc0acf7dae8a89bbef3e7d0ab0038d96212a2058a337";
const KEY = "pgl.access";

export const hashCode = (code: string) => toHex(sha256(utf8(SALT + code.trim())));

export function isUnlocked(): boolean {
  try { return localStorage.getItem(KEY) === ACCESS_HASH; } catch { return false; }
}

/** Checks the code; on success the device is remembered (storage per browser and website address). */
export function unlock(code: string): boolean {
  if (hashCode(code) !== ACCESS_HASH) return false;
  try { localStorage.setItem(KEY, ACCESS_HASH); } catch { /* private mode: asked again next time */ }
  return true;
}
