// "Was spiele ich?": game finder by available time, challenge generator and gaming bingo – pure logic, tested in
// play.test.ts. Only real data is used (own estimates, the play history, own notes); what is not known is shown as unknown.

import type { LibraryItem } from "./types";
import { pickRandom } from "./backlog";

// ------------------------------------------------------------------------------------------ F1 time finder

export const TIME_PRESETS = [15, 30, 45, 60, 90, 120] as const;
/** 120 means "120 minutes or more": every known session length fits. */
export const OPEN_END = 120;

export interface GameStats { totalMinutes: number; lastPlayed?: string; sessions?: number; typicalMinutes?: number | null }
export type Reason = { key: string; text: string; vars?: Record<string, string | number> };

export interface Suggestion { item: LibraryItem; session: { minutes: number; source: "own" | "history" } | null; reasons: Reason[]; score: number }

export interface FinderOptions {
  minutes: number;
  statuses: string[];
  installedOnly: boolean;
  installed: Record<string, boolean>;
  category?: string;
  /** Only games not played for at least this many days. */
  notPlayedDays?: number;
  /** Games without a known session length are listed separately (never as "fits"). */
  now?: number;
}

/** How long one session of this game takes: own estimate first, otherwise the median of the real sessions. */
export function sessionFor(i: LibraryItem, st?: GameStats): Suggestion["session"] {
  if (i.sessionMinutes && i.sessionMinutes > 0) return { minutes: i.sessionMinutes, source: "own" };
  if (st?.typicalMinutes && st.typicalMinutes > 0) return { minutes: st.typicalMinutes, source: "history" };
  return null;
}

const STATUS_BONUS: Record<string, number> = { next: 3, playing: 2.5, paused: 1, backlog: 1 };

/**
 * Games that fit into the time. Returns games with a known session length that fits ("fits") and games whose length
 * is unknown ("unknown") – each with the reasons it was suggested. Finished, dropped, archived and merged entries are left out.
 */
export function findGames(items: LibraryItem[], stats: Map<string, GameStats>, o: FinderOptions, hasMemory: (i: LibraryItem) => boolean = () => false) {
  const now = o.now ?? Date.now();
  const fits: Suggestion[] = [], unknown: Suggestion[] = [];
  for (const i of items) {
    if (i.kind !== "game" || i.duplicateOf || i.backlogArchived) continue;
    if (i.backlog === "completed" || i.backlog === "dropped") continue;
    if (o.statuses.length && !o.statuses.includes(i.backlog ?? "none")) continue;
    if (o.installedOnly && o.installed[i.id] === false) continue;
    if (o.category && !i.categories.includes(o.category)) continue;
    const st = stats.get(i.id);
    const last = st?.lastPlayed ? Date.parse(st.lastPlayed) : NaN;
    const days = Number.isFinite(last) ? Math.floor((now - last) / 86_400_000) : null;
    if (o.notPlayedDays && days != null && days < o.notPlayedDays) continue;
    const session = sessionFor(i, st);
    const reasons: Reason[] = [];
    let score = 0;
    if (session) {
      if (o.minutes < OPEN_END && session.minutes > o.minutes) continue;
      reasons.push(session.source === "own"
        ? { key: "own", text: "Eine Sitzung dauert laut deiner Angabe etwa {m} Min.", vars: { m: session.minutes } }
        : { key: "history", text: "Laut Verlauf spielst du meist etwa {m} Min. am Stück", vars: { m: session.minutes } });
      // Prefer games that use the time well (a 10-minute game for 2 hours is still fine, just ranked lower).
      score += o.minutes >= OPEN_END ? 1 : session.minutes / o.minutes;
    }
    if (i.backlog && STATUS_BONUS[i.backlog]) {
      score += STATUS_BONUS[i.backlog];
      reasons.push({ key: "status", text: i.backlog === "next" ? "Im Backlog: Als Nächstes" : i.backlog === "playing" ? "Gerade aktiv" : i.backlog === "paused" ? "Pausiert – vielleicht wieder Zeit dafür" : "Im Backlog" });
    }
    if ((i.priority ?? 0) >= 2) { score += i.priority! - 1; reasons.push({ key: "prio", text: i.priority === 3 ? "Priorität hoch" : "Priorität mittel" }); }
    if (hasMemory(i)) { score += 0.5; reasons.push({ key: "memory", text: "Du hast notiert, wo du warst" }); }
    if (days != null && days >= 14) { score += 0.3; reasons.push({ key: "days", text: "Seit {d} Tagen nicht gespielt", vars: { d: days } }); }
    if (!st) reasons.push({ key: "new", text: "Noch nie gespielt (laut Verlauf)" });
    if (i.favorite) { score += 0.3; reasons.push({ key: "fav", text: "Favorit" }); }
    (session ? fits : unknown).push({ item: i, session, reasons, score });
  }
  const order = (a: Suggestion, b: Suggestion) => b.score - a.score || a.item.name.localeCompare(b.item.name);
  return { fits: fits.sort(order), unknown: unknown.sort(order) };
}

export function randomSuggestion(list: Suggestion[], rnd?: () => number) {
  return pickRandom(list.map((s) => ({ ...s, priority: s.item.priority })), true, rnd);
}

// ------------------------------------------------------------------------------------------ F5 challenges

export type ChallengeSource = "generic" | "data" | "own" | "catalog" | "genre";
export interface Challenge {
  text: string; source: ChallengeSource; gameId?: string | null; gameName?: string | null; status: "open" | "done"; doneAt?: string | null; minutes?: number | null; note?: string; links?: string[];
  /** From the bingo catalog: 1 = leicht … 4 = sehr schwer, and its category (JARVIS challenges). */
  level?: 1 | 2 | 3 | 4; category?: string;
  /** Own rating 1–5 stars. */
  rating?: number | null;
}

/** Generic ideas: they do not claim anything about a particular game ("falls das Spiel es erlaubt"). */
export const GENERIC_CHALLENGES: { text: string; minutes?: number; tags: string[] }[] = [
  { text: "Spiele eine Sitzung ohne Schnellreise", tags: ["erkunden"] },
  { text: "Erkunde ein Gebiet, das du noch nicht kennst", minutes: 30, tags: ["erkunden"] },
  { text: "Schließe eine Nebenaufgabe ab, die du bisher liegen gelassen hast", minutes: 30, tags: ["fortschritt"] },
  { text: "Mach 5 Screenshots, die dir richtig gefallen (Fotomodus, falls vorhanden)", minutes: 15, tags: ["kreativ"] },
  { text: "Probiere eine Waffe, Klasse oder Figur, die du sonst nie nimmst", tags: ["abwechslung"] },
  { text: "Spiele einen kurzen Abschnitt auf Zeit und versuche dich zu verbessern", minutes: 20, tags: ["können"] },
  { text: "Bis zum nächsten Speicherpunkt ohne Heilgegenstände (falls das Spiel es erlaubt)", tags: ["können"] },
  { text: "Eine Sitzung auf einer höheren Schwierigkeit", tags: ["können"] },
  { text: "Spiele ohne Minikarte oder Wegmarker (falls abschaltbar)", tags: ["erkunden"] },
  { text: "Baue etwas nur aus einem einzigen Material", tags: ["kreativ", "bauen"] },
  { text: "Sammle 10 Dinge für deine Fundsammlung", tags: ["sammeln"] },
  { text: "Räume dein Inventar auf und verkaufe oder lagere alles Überflüssige", minutes: 15, tags: ["ordnung"] },
  { text: "Spiele mit Standard-Ausrüstung statt deiner besten", tags: ["abwechslung"] },
  { text: "Schaffe einen Abschnitt, ohne einmal zu sterben", tags: ["können"] },
  { text: "Lies die Texte und Gespräche einer Quest ganz statt sie zu überspringen", minutes: 20, tags: ["story"] },
];

export interface ChallengeContext {
  games: LibraryItem[];
  stats: Map<string, GameStats>;
  /** Next open stage of each own goal path. */
  nextStages: { pathId: string; title: string; stage: string }[];
  openFinds: { id: string; title: string }[];
  now?: number;
}

/** Suggestions from the user's own data (named with the real source). */
export type Tr = (text: string, vars?: Record<string, string | number>) => string;
const fill: Tr = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => String(vars?.[k] ?? ""));

export function dataChallenges(c: ChallengeContext, tr: Tr = fill): Challenge[] {
  const now = c.now ?? Date.now();
  const out: Challenge[] = [];
  for (const g of c.games) {
    if (g.kind !== "game" || g.duplicateOf || g.backlogArchived || g.backlog === "dropped" || g.backlog === "completed") continue;
    const last = Date.parse(c.stats.get(g.id)?.lastPlayed ?? "");
    if (Number.isFinite(last) && now - last > 30 * 86_400_000) out.push({ text: tr("Spiele wieder einmal {g} – zuletzt vor {d} Tagen", { g: g.name, d: Math.floor((now - last) / 86_400_000) }), source: "data", gameId: g.id, gameName: g.name, status: "open" });
    if (g.backlog === "next" && !c.stats.get(g.id)) out.push({ text: tr("Fang {g} an – steht bei dir auf „Als Nächstes“", { g: g.name }), source: "data", gameId: g.id, gameName: g.name, status: "open" });
  }
  for (const s of c.nextStages) out.push({ text: tr("Nächste Etappe in „{p}“: {s}", { p: s.title, s: s.stage }), source: "data", status: "open", links: [s.pathId] });
  for (const f of c.openFinds) out.push({ text: tr("Offener Fund: {f}", { f: f.title }), source: "data", status: "open", links: [f.id] });
  return out;
}

/** n different suggestions (generic and from the data), random but never twice the same; `exclude` = texts already shown/saved. */
export function generateChallenges(c: ChallengeContext, n: number, opts: { maxMinutes?: number; withData: boolean; exclude?: string[] }, rnd: () => number = Math.random, tr: Tr = fill): Challenge[] {
  const ex = new Set(opts.exclude ?? []);
  const pool: Challenge[] = [
    ...GENERIC_CHALLENGES.filter((g) => !opts.maxMinutes || !g.minutes || g.minutes <= opts.maxMinutes).map((g) => ({ text: tr(g.text), source: "generic" as const, minutes: g.minutes ?? null, status: "open" as const })),
    ...(opts.withData ? dataChallenges(c, tr) : []),
  ].filter((x) => !ex.has(x.text));
  const out: Challenge[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

// ------------------------------------------------------------------------------------------ F6 bingo

export interface BingoCell { text: string; done?: boolean; free?: boolean }
export interface Bingo { title: string; size: 3 | 4 | 5; cells: BingoCell[]; gameId?: string | null; gameName?: string | null; freeCenter?: boolean; links?: string[] }

export const BINGO_TEMPLATES: { id: string; title: string; tasks: string[] }[] = [
  { id: "general", title: "Allgemein", tasks: ["Einen Boss besiegt", "Ein Geheimnis gefunden", "Einen tollen Screenshot gemacht", "Ein neues Gebiet betreten", "Eine Nebenaufgabe erledigt", "Einen seltenen Gegenstand gefunden", "Ohne Tod durch einen Abschnitt", "Etwas Neues ausprobiert", "Ein Rätsel gelöst", "Eine Figur kennengelernt", "Etwas gebaut oder hergestellt", "Einen Erfolg / eine Trophäe freigeschaltet", "Mit Freunden gespielt", "Eine Einstellung verbessert", "Ein Easter Egg entdeckt", "Ein Level / eine Stufe aufgestiegen", "Eine Sammlung vervollständigt", "Eine Notiz im Journal geschrieben", "Eine alte Quest abgeschlossen", "Etwas gehandelt oder gekauft", "Eine neue Fähigkeit gelernt", "Einen Ort zum Wohlfühlen gefunden", "Gegen einen Freund gewonnen", "Einen Fehler gemacht und gelacht", "Den Sonnenuntergang im Spiel angeschaut"] },
  { id: "coop", title: "Koop-Abend", tasks: ["Jemand ist von einer Klippe gefallen", "Wir haben uns verlaufen", "Ein perfektes Teamplay", "Jemand hat den Boss allein gelegt", "Wir haben eine Abkürzung gefunden", "Alle gleichzeitig AFK", "Jemand hat den falschen Knopf gedrückt", "Gemeinsam etwas gebaut", "Einer hat alle gerettet", "Wir haben einen Plan gemacht – und ihn verworfen", "Lachkrampf im Voice-Chat", "Ein Gegenstand wurde fair geteilt", "Jemand hat die Story erklärt", "Neues Spiel gemeinsam ausprobiert", "Ein Rekord gebrochen", "Revanche gefordert"] },
];

export class BingoError extends Error {
  constructor(public size: number, public need: number, public have: number) { super(`Für ${size}×${size} braucht es ${need} verschiedene Aufgaben (vorhanden: ${have}).`); }
}

export function cellsNeeded(size: number, freeCenter: boolean) { return size * size - (freeCenter && size % 2 === 1 ? 1 : 0); }

/** A new card: tasks shuffled; the centre is free when wanted (odd sizes). Throws when there are too few tasks. */
export function makeBoard(tasks: string[], size: 3 | 4 | 5, freeCenter: boolean, rnd: () => number = Math.random): BingoCell[] {
  const uniq = [...new Set(tasks.map((x) => x.trim()).filter(Boolean))];
  const need = cellsNeeded(size, freeCenter);
  if (uniq.length < need) throw new BingoError(size, need, uniq.length);
  const pool = [...uniq];
  const picked: string[] = [];
  while (picked.length < need) picked.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const cells: BingoCell[] = picked.map((text) => ({ text, done: false }));
  if (freeCenter && size % 2 === 1) cells.splice((size * size - 1) / 2, 0, { text: "Frei", free: true, done: true });
  return cells;
}

export interface BingoLine { kind: "row" | "col" | "diag"; index: number; cells: number[] }

/** Completed rows, columns and the two diagonals. */
export function bingoLines(cells: BingoCell[], size: number): BingoLine[] {
  if (cells.length !== size * size) return [];
  const on = (i: number) => !!(cells[i].done || cells[i].free);
  const lines: BingoLine[] = [];
  for (let r = 0; r < size; r++) { const c = Array.from({ length: size }, (_, k) => r * size + k); if (c.every(on)) lines.push({ kind: "row", index: r, cells: c }); }
  for (let col = 0; col < size; col++) { const c = Array.from({ length: size }, (_, k) => k * size + col); if (c.every(on)) lines.push({ kind: "col", index: col, cells: c }); }
  const d1 = Array.from({ length: size }, (_, k) => k * size + k), d2 = Array.from({ length: size }, (_, k) => k * size + (size - 1 - k));
  if (d1.every(on)) lines.push({ kind: "diag", index: 0, cells: d1 });
  if (d2.every(on)) lines.push({ kind: "diag", index: 1, cells: d2 });
  return lines;
}

// ------------------------------------------------------------------------------------------ share links (data only in the link)

/**
 * Share links carry the data in the part after "#" – browsers never send that part to any server, so the content
 * only reaches whoever gets the link. Nothing is stored online; the link cannot be guessed (it *is* the content).
 */
export const MAX_SHARE_CHARS = 6000;

export function encodeShare(obj: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const s = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (s.length > MAX_SHARE_CHARS) throw new Error("Zu viel Inhalt für einen Link – exportiere lieber eine Datei.");
  return s;
}

export function decodeShare<T>(s: string): T | null {
  try {
    if (!/^[A-Za-z0-9_-]{1,8000}$/.test(s)) return null;
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as T;
  } catch { return null; }
}

/** A shared bingo card is checked before it is shown (it comes from outside). */
export function sanitizeSharedBingo(v: unknown): Bingo | null {
  const b = v as Partial<Bingo> | null;
  if (!b || typeof b.title !== "string" || ![3, 4, 5].includes(b.size as number) || !Array.isArray(b.cells) || b.cells.length !== b.size! * b.size!) return null;
  const cells = b.cells.map((c) => ({ text: String((c as BingoCell)?.text ?? "").slice(0, 80), done: !!(c as BingoCell)?.done, free: !!(c as BingoCell)?.free }));
  if (cells.some((c) => !c.text)) return null;
  return { title: b.title.slice(0, 80), size: b.size as 3 | 4 | 5, cells, freeCenter: !!b.freeCenter, gameName: typeof b.gameName === "string" ? b.gameName.slice(0, 100) : null };
}

// ------------------------------------------------------------------------------------------ F7 backlog: duplicates and merging

/** Name without edition/platform marks, for spotting the same game twice in the library. */
export function baseName(name: string) {
  return name.toLowerCase().replace(/[™®©]/g, "").replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(pc|windows|steam|xbox|microsoft store|epic|game of the year|goty|edition|deluxe|standard|definitive|remastered|premium|ultimate|complete|gold)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Groups of library games that are probably the same game (same base name). Already merged ones are left out. */
export function duplicateGames(items: LibraryItem[]): LibraryItem[][] {
  const m = new Map<string, LibraryItem[]>();
  for (const i of items) {
    if (i.kind !== "game" || i.duplicateOf) continue;
    const k = baseName(i.name);
    if (k.length < 2) continue;
    m.set(k, [...(m.get(k) ?? []), i]);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

const STATUS_RANK: Record<string, number> = { playing: 6, next: 5, paused: 4, backlog: 3, completed: 2, dropped: 1 };

/** What the kept entry gets when `other` is merged into it: nothing of either is lost (notes joined, tags joined, the higher value kept). */
export function mergeBacklog(keep: LibraryItem, other: LibraryItem) {
  const status = [keep.backlog, other.backlog].filter(Boolean).sort((a, b) => (STATUS_RANK[b!] ?? 0) - (STATUS_RANK[a!] ?? 0))[0] ?? null;
  const notes = [keep.notes, other.notes].map((x) => x?.trim()).filter(Boolean);
  return {
    backlog: keep.backlog ?? status ?? "",
    priority: Math.max(keep.priority ?? 0, other.priority ?? 0),
    rating: Math.max(keep.rating ?? 0, other.rating ?? 0),
    categories: [...new Set([...keep.categories, ...other.categories])].slice(0, 10),
    notes: [...new Set(notes)].join("\n").slice(0, 1000),
    goalHours: keep.goalHours ?? other.goalHours ?? 0,
    estimateHours: keep.estimateHours ?? other.estimateHours ?? 0,
    sessionMinutes: keep.sessionMinutes ?? other.sessionMinutes ?? 0,
  };
}
