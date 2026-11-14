// Crypto of the QR transfer (3.64) – the same derivation as the companion's ShareService. Pure JavaScript (@noble), because on the
// phone the page often runs over plain http in the home network, where the browser's own crypto (crypto.subtle) is not available.
// The random numbers still come from crypto.getRandomValues, which every browser offers everywhere.
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

const enc = new TextEncoder();

export function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface ShareKeys { auth: Uint8Array; enc: Uint8Array }
export function deriveKeys(secret: Uint8Array, id: string): ShareKeys {
  const salt = enc.encode(id);
  return { auth: hkdf(sha256, secret, salt, enc.encode("nexus-share-auth"), 32), enc: hkdf(sha256, secret, salt, enc.encode("nexus-share-enc"), 32) };
}
const concat = (a: Uint8Array, b: Uint8Array) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
export const mac = (key: Uint8Array, challenge: Uint8Array, what: string) => hmac(sha256, key, concat(challenge, enc.encode(what)));
/** The 4 digits both sides show (from the challenge of this connection): first 4 bytes little-endian, mod 10000. */
export function codeOf(auth: Uint8Array, challenge: Uint8Array): string {
  const m = mac(auth, challenge, "code");
  const n = (m[0] | (m[1] << 8) | (m[2] << 16) | (m[3] << 24)) >>> 0;
  return String(n % 10000).padStart(4, "0");
}
const aad = (id: string, name: string, offset: number) => enc.encode(`${id}|${name}|${offset}`);

/** nonce(12) | ciphertext | tag(16) as base64 – the format of ShareService.Seal. */
export function seal(key: Uint8Array, plain: Uint8Array, id: string, name: string, offset: number): string {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = gcm(key, nonce, aad(id, name, offset)).encrypt(plain);
  return b64(concat(nonce, ct));
}
/** Throws when a piece was changed on the way or belongs to another file/position. */
export function open(key: Uint8Array, data: string, id: string, name: string, offset: number): Uint8Array {
  const all = unb64(data);
  if (all.length < 28) throw new Error("bad piece");
  return gcm(key, all.subarray(0, 12), aad(id, name, offset)).decrypt(all.subarray(12));
}

/** "#/x/<id>.<secret>" → its parts (the secret never leaves the fragment, so no server sees it). */
export function parseShareToken(token: string): { id: string; secret: Uint8Array } | null {
  const m = /^([A-Za-z0-9_-]{8,20})\.([A-Za-z0-9_-]{40,50})$/.exec(token.trim());
  if (!m) return null;
  try { const secret = unb64(m[2]); return secret.length === 32 ? { id: m[1], secret } : null; } catch { return null; }
}
