import { t } from "./i18n";

// Published versions of the Windows companion. The manifest lives on the project website (GitHub Pages), the files
// themselves in GitHub Releases. Nothing here is guessed: if the manifest cannot be loaded, the UI says so.

declare const __APP_VERSION__: string;
/** Version of this web app build (same VERSION file as the companion). */
export const WEB_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export const RELEASE_SITE = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/";

export interface ReleaseChanges { neu: string[]; verbessert: string[]; behoben: string[] }
export interface ReleaseFile { fileName: string; url: string; size: number; sha256: string }
export interface Release extends ReleaseFile {
  version: string;
  date?: string;
  channel?: string;
  notes?: string;
  changes?: ReleaseChanges;
  signature?: string | null;
  zip?: ReleaseFile;
}

/** Project public key for update signatures (same key as in the companion). */
const PUBLIC_KEY_SPKI_B64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE/hiMoSFzmijh6kpNVq6is8OV4+aSoL4zBwKfkXibFAkVJtzToNjtJEoYEx0O6B19dMMLko/XKEXUzIIz6EzM7g==";

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Fresh copy (no browser/CDN/service-worker cache) – the phone must never show an outdated version. */
async function fetchJson<T>(name: string): Promise<T> {
  const r = await fetch(`${RELEASE_SITE}${name}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(r.status === 404 ? t("Noch keine Version veröffentlicht") : `HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Download addresses may be relative to the manifest (older manifests); resolve them like the companion does. */
function resolve(m: Partial<Release>): Partial<Release> {
  const abs = (u?: string) => { try { return u ? new URL(u, RELEASE_SITE).href : u; } catch { return u; } };
  return { ...m, url: abs(m.url), zip: m.zip ? { ...m.zip, url: abs(m.zip.url)! } : undefined };
}

export function validRelease(m: Partial<Release>): m is Release {
  return !!m && /^\d+\.\d+\.\d+$/.test(m.version ?? "") && /^https:\/\//.test(m.url ?? "") && /^[0-9a-f]{64}$/.test(m.sha256 ?? "") && (m.size ?? 0) > 0;
}

export async function loadLatest(): Promise<Release> {
  const m = resolve(await fetchJson<Partial<Release>>("update.json"));
  if (!validRelease(m)) throw new Error(t("Versionsangaben auf dem Server sind unvollständig"));
  return m;
}

export async function loadHistory(): Promise<Release[]> {
  try { return (await fetchJson<Partial<Release>[]>("releases.json")).map(resolve).filter(validRelease); }
  catch { return []; }
}

/** Checks the publisher's signature in the browser (WebCrypto, ECDSA P-256). Null = browser cannot check (e.g. http). */
export async function verifySignature(r: Release): Promise<boolean | null> {
  if (!r.signature) return false;
  if (!globalThis.crypto?.subtle) return null;
  try {
    const key = await crypto.subtle.importKey("spki", fromB64(PUBLIC_KEY_SPKI_B64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const payload = new TextEncoder().encode(`pgl-update-v1\n${r.version}\n${r.sha256.toLowerCase()}\n${r.size}`);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64(r.signature), payload);
  } catch { return false; }
}

/** -1 / 0 / 1 for MAJOR.MINOR.PATCH strings. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  return 0;
}

export const isMobileDevice = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
