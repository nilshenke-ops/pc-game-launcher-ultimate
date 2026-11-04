// Was die Startseite zeigt – aus den echten Daten des PCs (Bibliothek, Verlauf, Messwerte). Reine Funktionen, einzeln getestet.
import type { LibraryItem, MetricsSample } from "./types";
import { sortLibrary } from "./library-sort";

export interface HistoryData { launches?: { itemId: string; at: string }[]; stats?: { itemId: string; totalMinutes: number; lastPlayed: string }[] }

/** Last start per item (newest first in the history). */
export function lastLaunchMap(h: HistoryData | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of h?.launches ?? []) if (!m.has(l.itemId)) { const at = Date.parse(l.at); if (Number.isFinite(at)) m.set(l.itemId, at); }
  return m;
}

/** "Deine Spiele": games, favourites first, then the most recently started. At most `max`. */
export function homeGames(items: LibraryItem[] | undefined, h: HistoryData | undefined, max = 3): LibraryItem[] {
  const games = (items ?? []).filter((i) => i.kind === "game");
  return sortLibrary(games, "recent", lastLaunchMap(h)).slice(0, max);
}

/** "Zuletzt verwendet": only what was really started, newest first (games and programs). */
export function homeRecent(items: LibraryItem[] | undefined, h: HistoryData | undefined, max = 5): LibraryItem[] {
  const last = lastLaunchMap(h);
  return (items ?? []).filter((i) => last.has(i.id)).sort((a, b) => last.get(b.id)! - last.get(a.id)!).slice(0, max);
}

/** "Schnellzugriff": favourite programs and apps. */
export function homeQuick(items: LibraryItem[] | undefined, max = 4): LibraryItem[] {
  return (items ?? []).filter((i) => i.kind !== "game" && i.favorite).slice(0, max);
}

/** Total play time in hours as the PC recorded it; null without any record (no invented number). */
export function totalHours(h: HistoryData | undefined): number | null {
  const mins = (h?.stats ?? []).reduce((a, s) => a + (s.totalMinutes || 0), 0);
  return mins > 0 ? Math.round(mins / 6) / 10 : null;
}

/** Load word for the performance card from the real CPU load: no sample → null. */
export function perfState(cpu: number | null | undefined): "optimal" | "busy" | "high" | null {
  if (cpu == null || !Number.isFinite(cpu)) return null;
  return cpu < 60 ? "optimal" : cpu < 85 ? "busy" : "high";
}

export function addPoint(points: number[], m: MetricsSample | null, max = 40): number[] {
  if (m?.cpuPercent == null) return points;
  return [...points, Math.max(0, Math.min(100, m.cpuPercent))].slice(-max);
}

/** SVG path of a sparkline in a w × h box (null for fewer than two points). */
export function sparkPath(points: number[], w = 160, h = 40): string | null {
  if (points.length < 2) return null;
  const step = w / (points.length - 1);
  return points.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(h - (v / 100) * h).toFixed(1)}`).join(" ");
}

const NAME_KEY = "pgl.userName";
export const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) : "");
export { NAME_KEY };

/** The name for the greeting: the one typed in, else the first name part of the signed-in account ("nils.henke" → "Nils"), else nothing. */
export function greetingName(typed: string, account?: string | null): string {
  const own = cleanName(typed);
  if (own) return own;
  const base = String(account ?? "").split("@")[0];
  const first = base.split(/[\s._-]+/).find((x) => /\p{L}{2,}/u.test(x)) ?? "";
  const letters = first.replace(/[^\p{L}]/gu, "");
  return letters ? letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase() : "";
}
