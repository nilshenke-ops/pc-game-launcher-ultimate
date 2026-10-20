// Steam prices without the PC: Steam only lets its own pages ask its price API from a browser, so a GitHub Action
// puts a price list of popular games next to the website every 6 hours (scripts/steam-price-index.mjs). The phone
// downloads that list from the website itself – nothing about the wish list leaves the device.
import { readJson, writeJson } from "./rpc";
import { sameGame } from "./ms-store";

export interface SteamIndex { country: string; currency: string; updatedAt: string; items: [number, string, number, number, number][] }
export interface SteamHit { appId: string; name: string; finalCents: number; initialCents: number; discountPercent: number; currency: string; at: number }

const key = (c: string) => "pgl.steamIndex." + c;
const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(" ");

/** Fresh list from the website (falls back to the last copy on this device). Null where there is no list (e.g. PC view). */
export async function loadSteamIndex(country: string, fetcher: typeof fetch = fetch): Promise<SteamIndex | null> {
  const c = country.toLowerCase();
  try {
    const r = await fetcher(`prices/steam-${c}.json`, { cache: "no-cache" });
    if (r.ok) {
      const d = (await r.json()) as SteamIndex;
      if (Array.isArray(d.items) && d.updatedAt) { try { writeJson(key(c), d); } catch { /* storage full: keep in memory only */ } return d; }
    }
  } catch { /* offline: last copy */ }
  return readJson<SteamIndex>(key(c));
}

/** Price for a wish-list entry: by Steam app id if known, otherwise by name (exact first, then with an edition name). */
export function lookup(index: SteamIndex, w: { title: string; steamAppId?: string | null }): SteamHit | null {
  const at = Date.parse(index.updatedAt);
  const hit = (row: SteamIndex["items"][number]): SteamHit => ({ appId: String(row[0]), name: row[1], finalCents: row[2], initialCents: row[3], discountPercent: row[4], currency: index.currency, at });
  if (w.steamAppId) { const row = index.items.find((r) => String(r[0]) === w.steamAppId); return row ? hit(row) : null; }
  const q = tokens(w.title);
  const exact = index.items.find((r) => tokens(r[1]) === q);
  if (exact) return hit(exact);
  const same = index.items.filter((r) => sameGame(w.title, r[1])).sort((a, b) => a[2] - b[2])[0];
  return same ? hit(same) : null;
}
