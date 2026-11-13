// Lyrics for the song the PC plays – only when switched on (the song's title and artist then go to lrclib.net, a free lyrics
// database without account or key). Timed lyrics follow the song; plain ones are shown as text. Nothing is invented: no hit = said so.
import { readJson, writeJson } from "./rpc";

export interface LyricLine { ms: number; text: string }
export interface Lyrics { synced: LyricLine[] | null; plain: string | null }

const KEY = "pgl.island.lyrics";
export const lyricsOn = (): boolean => readJson<boolean>(KEY) === true;
export const setLyricsOn = (on: boolean): void => writeJson(KEY, on);

/** "[01:23.45] text" lines → sorted list; lines without a time stamp or text are left out. */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const m = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+)(.*)$/.exec(raw.trim());
    if (!m) continue;
    const text = m[2].trim();
    for (const tag of m[1].matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)) {
      const frac = tag[3] ? Number(tag[3].padEnd(3, "0")) : 0;
      out.push({ ms: Number(tag[1]) * 60_000 + Number(tag[2]) * 1000 + frac, text });
    }
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** Index of the line being sung at `ms` (-1 before the first one). */
export function lineAt(lines: LyricLine[], ms: number): number {
  let lo = 0, hi = lines.length - 1, at = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].ms <= ms) { at = mid; lo = mid + 1; } else hi = mid - 1; }
  return at;
}

const cache = new Map<string, Lyrics | null>();
const BASE = "https://lrclib.net/api";

/** Looks the song up (exact match first, then the search). null = this database has no lyrics for it. Throws when it cannot be reached. */
export async function fetchLyrics(title: string, artist: string, durationMs?: number): Promise<Lyrics | null> {
  const key = `${title}\n${artist}`.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const pick = (r: { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean } | null | undefined): Lyrics | null => {
    if (!r || r.instrumental) return null;
    const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : [];
    const plain = r.plainLyrics?.trim() || null;
    return synced.length || plain ? { synced: synced.length ? synced : null, plain } : null;
  };
  const q = new URLSearchParams({ track_name: title, artist_name: artist });
  if (durationMs && durationMs > 0) q.set("duration", String(Math.round(durationMs / 1000)));
  let found: Lyrics | null = null;
  const exact = await fetch(`${BASE}/get?${q}`, { signal: AbortSignal.timeout(8000) });
  if (exact.ok) found = pick(await exact.json());
  else if (exact.status !== 404) throw new Error(`lrclib ${exact.status}`);
  if (!found) {
    const s = await fetch(`${BASE}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, { signal: AbortSignal.timeout(8000) });
    if (s.ok) { const list = (await s.json()) as Parameters<typeof pick>[0][]; found = pick(Array.isArray(list) ? list.find((x) => x?.syncedLyrics) ?? list[0] : null); }
    else if (s.status !== 404) throw new Error(`lrclib ${s.status}`);
  }
  cache.set(key, found);
  return found;
}

/** "1,2 MB/s", "340 kB/s", "0 kB/s". */
export function speedText(bps: number | null | undefined): string {
  if (bps == null) return "–";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB/s`;
  return `${Math.round(bps / 1000)} kB/s`;
}
