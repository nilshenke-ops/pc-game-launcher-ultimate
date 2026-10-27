// Auswertungen: year review (F5), play style (F28) and performance archive (F18). Only recorded sessions and own
// entries are used – when something was not recorded, the result says "unknown" or "not recorded", never a guess.
// Tested in insights.test.ts.

export interface Session { itemId: string; name: string; startedAt: string; endedAt?: string | null; minutes: number; perf?: { samples?: number; cpuAvg?: number | null; cpuMax?: number | null; ramAvg?: number | null; gpuAvg?: number | null; gpuMax?: number | null } | null }
export interface SessionsInfo { enabled: boolean; kept: number; oldest: string | null; full: boolean; sessions: Session[] }

const local = (iso: string) => new Date(iso);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Sessions that started in a calendar year (local time). */
export function inYear(list: Session[], year: number) { return list.filter((s) => local(s.startedAt).getFullYear() === year); }

/** Years that have sessions, newest first. */
export function yearsWithData(list: Session[]) { return [...new Set(list.map((s) => local(s.startedAt).getFullYear()))].sort((a, b) => b - a); }

export function median(v: number[]) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Longest run of consecutive days with at least one session. */
export function longestStreak(days: string[]) {
  const set = [...new Set(days)].sort();
  let best = 0, cur = 0, prev: number | null = null;
  for (const d of set) {
    const [y, m, dd] = d.split("-").map(Number);
    const t = Date.UTC(y, m - 1, dd) / 864e5;
    cur = prev != null && t - prev === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = t;
  }
  return best;
}

export interface YearReview {
  year: number;
  sessions: number;
  minutes: number;
  activeDays: number;
  games: { itemId: string; name: string; minutes: number; sessions: number }[];
  byMonth: number[];
  longest: Session | null;
  streak: number;
  topWeekday: number | null;
  /** Recording started during the year: the review covers only part of it. */
  coverageFrom: string | null;
  /** First played this year – only known when recording started before the year. */
  newGames: string[] | null;
}

/**
 * The year from recorded sessions. `oldest` is the oldest session the PC still has: when it lies inside the year,
 * the year is only partly covered (said so); "new this year" is only answered when earlier data exists.
 */
export function yearReview(all: Session[], year: number, oldest: string | null): YearReview {
  const list = inYear(all, year);
  const byGame = new Map<string, { itemId: string; name: string; minutes: number; sessions: number }>();
  const byMonth = Array(12).fill(0) as number[];
  const weekday = Array(7).fill(0) as number[];
  for (const s of list) {
    const d = local(s.startedAt);
    byMonth[d.getMonth()] += s.minutes;
    weekday[d.getDay()] += s.minutes;
    const g = byGame.get(s.itemId) ?? { itemId: s.itemId, name: s.name, minutes: 0, sessions: 0 };
    g.minutes += s.minutes; g.sessions++;
    byGame.set(s.itemId, g);
  }
  const start = new Date(year, 0, 1);
  const coverageFrom = oldest && local(oldest) > start && local(oldest).getFullYear() === year ? oldest : null;
  const before = all.filter((s) => local(s.startedAt) < start);
  const known = !!oldest && local(oldest) < start;
  const newGames = known ? [...byGame.values()].filter((g) => !before.some((b) => b.itemId === g.itemId)).map((g) => g.name) : null;
  return {
    year, sessions: list.length, minutes: Math.round(list.reduce((a, s) => a + s.minutes, 0)),
    activeDays: new Set(list.map((s) => dayKey(local(s.startedAt)))).size,
    games: [...byGame.values()].map((g) => ({ ...g, minutes: Math.round(g.minutes) })).sort((a, b) => b.minutes - a.minutes),
    byMonth: byMonth.map(Math.round),
    longest: list.reduce<Session | null>((a, s) => (!a || s.minutes > a.minutes ? s : a), null),
    streak: longestStreak(list.map((s) => dayKey(local(s.startedAt)))),
    topWeekday: list.length ? weekday.indexOf(Math.max(...weekday)) : null,
    coverageFrom,
    newGames,
  };
}

/** Difference to another year: only what both years have. */
export function compareYears(a: YearReview, b: YearReview) {
  const pct = (x: number, y: number) => (y > 0 ? Math.round(((x - y) / y) * 100) : null);
  return { minutes: pct(a.minutes, b.minutes), sessions: pct(a.sessions, b.sessions), activeDays: pct(a.activeDays, b.activeDays), partly: !!(a.coverageFrom || b.coverageFrom) };
}

// ------------------------------------------------------------------------------------------ F28 play style

export interface LibraryLike { id: string; name: string; kind?: string; categories?: string[]; rating?: number | null; favorite?: boolean; backlog?: string | null }

export const DAYPARTS = ["Morgens (5–11 Uhr)", "Mittags (11–17 Uhr)", "Abends (17–23 Uhr)", "Nachts (23–5 Uhr)"];
export const daypart = (h: number) => (h >= 5 && h < 11 ? 0 : h >= 11 && h < 17 ? 1 : h >= 17 && h < 23 ? 2 : 3);

export interface PlayStyle {
  sessions: number;
  enough: boolean;
  dayparts: number[];
  weekdays: number[];
  medianMinutes: number | null;
  /** Rule-based labels with the numbers they come from. */
  traits: { text: string; vars?: Record<string, string | number> }[];
  topCategories: { name: string; minutes: number }[];
  variety: number | null;
  topShare: number | null;
  ratings: { count: number; average: number | null; best: { name: string; rating: number }[] };
  favorites: string[];
  backlog: { completed: number; dropped: number; playing: number; total: number };
}

/** Minimum of sessions before any trait is named (fewer would be a guess). */
export const MIN_SESSIONS = 10;

export function playStyle(list: Session[], library: LibraryLike[]): PlayStyle {
  const dayparts = [0, 0, 0, 0], weekdays = Array(7).fill(0) as number[];
  const byGame = new Map<string, number>();
  for (const s of list) {
    const d = local(s.startedAt);
    dayparts[daypart(d.getHours())] += s.minutes;
    weekdays[d.getDay()] += s.minutes;
    byGame.set(s.itemId, (byGame.get(s.itemId) ?? 0) + s.minutes);
  }
  const total = list.reduce((a, s) => a + s.minutes, 0);
  const med = median(list.filter((s) => s.endedAt).map((s) => s.minutes));
  const enough = list.length >= MIN_SESSIONS;
  const traits: PlayStyle["traits"] = [];
  if (enough && total > 0) {
    const dp = dayparts.indexOf(Math.max(...dayparts));
    traits.push({ text: "Meist gespielt: {p} ({n} %)", vars: { p: DAYPARTS[dp], n: Math.round((dayparts[dp] / total) * 100) } });
    if (med != null) traits.push(med < 30 ? { text: "Kurze Runden: typische Sitzung {m} Min.", vars: { m: Math.round(med) } } : med >= 120 ? { text: "Lange Sitzungen: typisch {m} Min.", vars: { m: Math.round(med) } } : { text: "Mittlere Sitzungen: typisch {m} Min.", vars: { m: Math.round(med) } });
    const weekend = (weekdays[0] + weekdays[6]) / total;
    traits.push(weekend >= 0.5 ? { text: "Wochenend-Spieler: {n} % der Spielzeit am Wochenende", vars: { n: Math.round(weekend * 100) } } : { text: "Unter der Woche aktiv: {n} % der Spielzeit Mo–Fr", vars: { n: Math.round((1 - weekend) * 100) } });
    const top = Math.max(...byGame.values());
    const share = top / total;
    traits.push(share >= 0.5 ? { text: "Treu: ein Spiel macht {n} % deiner Spielzeit aus", vars: { n: Math.round(share * 100) } } : { text: "Abwechslungsreich: {g} verschiedene Spiele", vars: { g: byGame.size } });
  }
  const cats = new Map<string, number>();
  for (const [id, m] of byGame) for (const c of library.find((l) => l.id === id)?.categories ?? []) cats.set(c, (cats.get(c) ?? 0) + m);
  const games = library.filter((l) => (l.kind ?? "game") === "game");
  const rated = games.filter((l) => typeof l.rating === "number" && l.rating > 0);
  return {
    sessions: list.length, enough, dayparts: dayparts.map(Math.round), weekdays: weekdays.map(Math.round), medianMinutes: med,
    traits,
    topCategories: [...cats.entries()].map(([name, minutes]) => ({ name, minutes: Math.round(minutes) })).sort((a, b) => b.minutes - a.minutes).slice(0, 6),
    variety: list.length ? byGame.size : null,
    topShare: total > 0 ? Math.round((Math.max(...byGame.values()) / total) * 100) : null,
    ratings: { count: rated.length, average: rated.length ? Math.round((rated.reduce((a, l) => a + (l.rating ?? 0), 0) / rated.length) * 10) / 10 : null, best: rated.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5).map((l) => ({ name: l.name, rating: l.rating! })) },
    favorites: games.filter((l) => l.favorite).map((l) => l.name),
    backlog: { completed: games.filter((l) => l.backlog === "completed").length, dropped: games.filter((l) => l.backlog === "dropped").length, playing: games.filter((l) => l.backlog === "playing").length, total: games.filter((l) => l.backlog).length },
  };
}

// ------------------------------------------------------------------------------------------ F18 performance archive

export interface PerfRun {
  title?: string; game?: { gameId?: string | null; gameName?: string | null }; date?: string; source?: "measured" | "manual";
  preset?: string; resolution?: string; fpsAvg?: number | null; fpsLow?: number | null; frametimeMs?: number | null;
  cpuAvg?: number | null; cpuMax?: number | null; gpuAvg?: number | null; gpuMax?: number | null; ramAvg?: number | null; cpuTemp?: number | null; gpuTemp?: number | null;
}

export const PERF_METRICS: { key: keyof PerfRun; label: string; unit: string; better: "high" | "low" }[] = [
  { key: "fpsAvg", label: "FPS (Durchschnitt)", unit: "fps", better: "high" }, { key: "fpsLow", label: "1 % Low", unit: "fps", better: "high" },
  { key: "frametimeMs", label: "Frametime", unit: "ms", better: "low" }, { key: "cpuAvg", label: "CPU-Last Ø", unit: "%", better: "low" },
  { key: "gpuAvg", label: "GPU-Last Ø", unit: "%", better: "high" }, { key: "ramAvg", label: "RAM Ø", unit: "%", better: "low" },
  { key: "cpuTemp", label: "CPU-Temperatur", unit: "°C", better: "low" }, { key: "gpuTemp", label: "GPU-Temperatur", unit: "°C", better: "low" },
];

/** A run made from a recorded session: only the loads the PC measured – FPS has no source on the PC and stays empty. */
export function runFromSession(s: Session): PerfRun | null {
  if (!s.perf || !s.perf.samples) return null;
  const r1 = (v?: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  return { title: `${s.name} – ${new Date(s.startedAt).toLocaleDateString()}`, game: { gameId: s.itemId, gameName: s.name }, date: s.startedAt.slice(0, 10), source: "measured", cpuAvg: r1(s.perf.cpuAvg), cpuMax: r1(s.perf.cpuMax), gpuAvg: r1(s.perf.gpuAvg), gpuMax: r1(s.perf.gpuMax), ramAvg: r1(s.perf.ramAvg), fpsAvg: null, fpsLow: null };
}

/** Two runs side by side: per metric the change and whether it is better (only where both have a value). */
export function compareRuns(a: PerfRun, b: PerfRun) {
  return PERF_METRICS.map((m) => {
    const x = a[m.key] as number | null | undefined, y = b[m.key] as number | null | undefined;
    if (x == null || y == null) return { ...m, a: x ?? null, b: y ?? null, diff: null, better: null as boolean | null };
    const diff = Math.round((y - x) * 10) / 10;
    return { ...m, a: x, b: y, diff, better: diff === 0 ? null : m.better === "high" ? diff > 0 : diff < 0 };
  });
}
