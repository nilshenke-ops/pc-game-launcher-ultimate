// Steam prices and pictures without the PC: Steam only lets its own pages ask its price API from a browser, so GitHub
// Actions put two lists next to the website (scripts/steam-price-index.mjs): popular games every 6 hours, and every
// game on Steam once a day, split by first letter. The phone downloads them from the website itself – nothing about
// the wish list leaves the device.
import { readJson, writeJson } from "./rpc";
import { sameGame } from "./ms-store";

export type SteamRow = [number, string, number | null, number | null, number, (string | null)?];
export interface SteamIndex { country: string; currency: string; updatedAt: string; items: SteamRow[] }
export interface SteamHit { appId: string; name: string; finalCents: number | null; initialCents: number | null; discountPercent: number; currency: string; image: string | null; at: number }

const key = (c: string) => "pgl.steamIndex." + c;
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ");

/** The real header picture of a Steam game (newer games only have it under a path with an id, not the old one). */
export const steamPicture = (appId: string | number, header?: string | null) =>
  header ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/${header}` : `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;

/** Popular games: fresh list from the website (falls back to the last copy on this device). Null where there is none. */
export async function loadSteamIndex(country: string, fetcher: typeof fetch = fetch): Promise<SteamIndex | null> {
  const c = country.toLowerCase();
  try {
    const r = await fetcher(`prices/steam-${c}.json`, { cache: "no-cache" });
    if (r.ok) {
      const d = (await r.json()) as SteamIndex;
      if (Array.isArray(d.items) && d.updatedAt) { writeJson(key(c), d); return d; }
    }
  } catch { /* offline: last copy */ }
  return readJson<SteamIndex>(key(c));
}

/** First letter of a name – which part of the full catalog holds it (same rule as the script). */
export const shard = (name: string) => (name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]/) ?? ["_"])[0];

const parts = new Map<string, Promise<SteamIndex | null>>();
/** Every game on Steam whose name starts like this one (one part of the daily catalog, loaded only when needed). */
export function loadCatalogPart(name: string, fetcher: typeof fetch = fetch): Promise<SteamIndex | null> {
  const k = shard(name);
  if (!parts.has(k)) parts.set(k, fetcher(`prices/apps/${k}.json`).then((r) => (r.ok ? (r.json() as Promise<SteamIndex>) : null)).catch(() => null));
  return parts.get(k)!;
}

/** Price and picture for a wish-list entry: by Steam app id if known, otherwise by name (exact first, then with an edition name). */
export function lookup(index: SteamIndex, w: { title: string; steamAppId?: string | null }): SteamHit | null {
  const at = Date.parse(index.updatedAt);
  const hit = (row: SteamRow): SteamHit => ({ appId: String(row[0]), name: row[1], finalCents: row[2], initialCents: row[3], discountPercent: row[4], currency: index.currency, image: steamPicture(row[0], row[5]), at });
  if (w.steamAppId) { const row = index.items.find((r) => String(r[0]) === w.steamAppId); return row ? hit(row) : null; }
  const q = tokens(w.title);
  const exact = index.items.filter((r) => tokens(r[1]) === q).sort((a, b) => Number(b[2] != null) - Number(a[2] != null))[0];
  if (exact) return hit(exact);
  const same = index.items.filter((r) => sameGame(w.title, r[1])).sort((a, b) => (a[2] ?? Infinity) - (b[2] ?? Infinity))[0];
  return same ? hit(same) : null;
}
