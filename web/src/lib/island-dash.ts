// Helpers of the island's overview, quick controls and system tiles: the calendar week, the weather of the home place (Open-Meteo, the same
// service JARVIS uses), short histories for the small load curves, and plain formatting. Nothing here guesses a value the PC did not measure.
import { readJson, writeJson } from "./rpc";

/** ISO 8601 week number (the week with the year's first Thursday is week 1; weeks start on Monday). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

export interface WeekDay { date: Date; day: number; today: boolean }
/** The seven days (Monday first) of the week that holds `d`. */
export function weekStrip(d: Date): WeekDay[] {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i); return { date: x, day: x.getDate(), today: x.toDateString() === d.toDateString() }; });
}

/** Bytes as "15,2 GB" / "953 GB" / "512 MB" (one decimal below 100). */
export function gb(bytes: number | null | undefined, locale?: string): string {
  if (bytes == null || !Number.isFinite(bytes)) return "–";
  const g = bytes / 1024 ** 3;
  if (g < 1) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${g < 100 ? g.toLocaleString(locale, { maximumFractionDigits: 1 }) : Math.round(g).toLocaleString(locale)} GB`;
}

/** Hours since the PC started as "9 min", "3 h 12 min" or "2 T 4 h". */
export function uptimeText(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return "–";
  const min = Math.round(hours * 60);
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} T ${Math.floor((min % 1440) / 60)} h`;
}

/** Keeps the last `max` values of a curve (null = not measured at that moment). */
export function pushHistory(list: (number | null)[], v: number | null | undefined, max = 40): (number | null)[] {
  const next = [...list, v == null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, v))];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Points of a small curve (0–100 %) for an SVG polyline in a w × h box; gaps (null) are skipped. Empty string below two measured values. */
export function sparkPoints(list: (number | null)[], w = 100, h = 24): string {
  const pts = list.map((v, i) => (v == null ? null : `${(list.length <= 1 ? 0 : (i / (list.length - 1)) * w).toFixed(1)},${(h - (v / 100) * (h - 2) - 1).toFixed(1)}`)).filter(Boolean);
  return pts.length < 2 ? "" : pts.join(" ");
}

// ------------------------------------------------------------------ weather of the home place
export interface IslandWeather { place: string; temp: number; code: number; hi: number | null; lo: number | null; at: number }
const WEATHER_KEY = "pgl.island.weather";
export const WEATHER_TTL = 30 * 60_000;
export const cachedWeather = (place: string | null, now = Date.now()): IslandWeather | null => {
  const w = readJson<IslandWeather>(WEATHER_KEY);
  return w && place && w.place.toLowerCase() === place.toLowerCase() && now - w.at < 6 * 3_600_000 ? w : null;   // shown up to six hours old, refreshed every half hour
};
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
/** Weather now and today's high/low for a place name. Null when the place is unknown or the service cannot be reached. */
export async function loadWeather(place: string, f: Fetcher = fetch, now = Date.now()): Promise<IslandWeather | null> {
  try {
    const opt: RequestInit = { referrerPolicy: "no-referrer", credentials: "omit" };
    const g = await (await f(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=de&format=json`, opt)).json() as { results?: { name: string; latitude: number; longitude: number }[] };
    const hit = g.results?.[0];
    if (!hit) return null;
    const fc = await (await f(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto`, opt)).json() as
      { current?: { temperature_2m?: number; weather_code?: number }; daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] } };
    if (typeof fc.current?.temperature_2m !== "number") return null;
    const r = (n: number | undefined) => (typeof n === "number" ? Math.round(n) : null);
    const w: IslandWeather = { place, temp: Math.round(fc.current.temperature_2m), code: fc.current.weather_code ?? -1, hi: r(fc.daily?.temperature_2m_max?.[0]), lo: r(fc.daily?.temperature_2m_min?.[0]), at: now };
    writeJson(WEATHER_KEY, w);
    return w;
  } catch { return null; }
}
