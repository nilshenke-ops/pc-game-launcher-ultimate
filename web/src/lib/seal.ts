// A secret typed on this device (an API key) goes to the PC sealed with the device key: unreadable and unforgeable on the way – also over
// plain http in the home network – and it only opens in the current session of this device, for this purpose. The same few lines exist in
// the companion (Security/SecretSeal.cs); a shared test vector keeps both in step. Pure TypeScript, because the browser's own crypto
// is not available on a plain-http page.

import { fromHex, hmacSha256, sha256, toHex, utf8 } from "./sha256";

const concat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const derive = (key: Uint8Array, label: string, nonce: Uint8Array) => hmacSha256(key, concat(utf8(label + "|"), nonce));
const be32 = (i: number) => new Uint8Array([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);

export interface Sealed { iv: string; ct: string; tag: string }
export const SEAL_MAX = 400;

export function sealSecret(token: string, nonceHex: string, purpose: string, secret: string, iv: Uint8Array = crypto.getRandomValues(new Uint8Array(16))): Sealed {
  const data = utf8(secret);
  if (data.length === 0 || data.length > SEAL_MAX) throw new Error("Schlüssel zu lang oder leer.");
  const key = sha256(utf8(token)), nonce = fromHex(nonceHex);
  const encKey = derive(key, "pgl-seal-enc", nonce), macKey = derive(key, "pgl-seal-mac", nonce);
  const ct = new Uint8Array(data.length);
  for (let block = 0, pos = 0; pos < data.length; block++) {
    const ks = hmacSha256(encKey, concat(iv, be32(block)));
    for (let j = 0; j < ks.length && pos < data.length; j++, pos++) ct[pos] = data[pos] ^ ks[j];
  }
  const tag = hmacSha256(macKey, concat(utf8(purpose), new Uint8Array([0]), iv, ct));
  return { iv: toHex(iv), ct: toHex(ct), tag: toHex(tag) };
}
