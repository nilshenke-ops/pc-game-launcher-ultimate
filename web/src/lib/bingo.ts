// Ultimate Gaming Bingo: understanding a request ("4×4 Minecraft auf mittel"), choosing tasks by difficulty from the
// built-in catalog, own tasks or an AI answer (checked before it is shown), progress, lines, players. Pure logic –
// tested in bingo.test.ts; the card itself is a journal entry of kind "bingo" (browser + PC sync).

import { CATALOG, GENRES, type CatalogGame } from "./bingo-catalog";
import { bingoLines, type Bingo, type BingoCell } from "./play";
import { norm } from "./journal-logic";

export type Level = 1 | 2 | 3 | 4;
export type Difficulty = "easy" | "medium" | "hard" | "veryhard" | "mixed";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "veryhard", "mixed"];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Leicht", medium: "Mittel", hard: "Schwer", veryhard: "Sehr schwer", mixed: "Gemischt" };
export const LEVEL_LABEL: Record<Level, string> = { 1: "Leicht", 2: "Mittel", 3: "Schwer", 4: "Sehr schwer" };

export type Category = "explore" | "combat" | "collect" | "build" | "team" | "fun" | "challenge" | "progress" | "survival";
export const CATEGORIES: Category[] = ["explore", "combat", "collect", "build", "team", "fun", "challenge", "progress", "survival"];
export const CATEGORY_LABEL: Record<Category, string> = { explore: "Erkunden", combat: "Kampf", collect: "Sammeln", build: "Bauen", team: "Team", fun: "Spaß", challenge: "Herausforderung", progress: "Fortschritt", survival: "Überleben" };
const CAT_CODE: Record<string, Category> = { e: "explore", k: "combat", c: "collect", b: "build", t: "team", f: "fun", h: "challenge", p: "progress", s: "survival" };

export type BingoMode = "classic" | "speed" | "survival" | "challenge" | "fun" | "exploration" | "boss" | "achievement" | "coop" | "random" | "custom";
export const MODES: BingoMode[] = ["classic", "speed", "survival", "challenge", "fun", "exploration", "boss", "achievement", "coop", "random", "custom"];
export const MODE_LABEL: Record<BingoMode, string> = { classic: "Klassisch", speed: "Speed-Bingo", survival: "Survival-Bingo", challenge: "Challenge-Bingo", fun: "Fun-Bingo", exploration: "Exploration-Bingo", boss: "Boss-Bingo", achievement: "Achievement-Bingo", coop: "Co-op-Bingo", random: "Random-Bingo", custom: "Custom-Bingo" };
/** The category a mode prefers (classic/random/custom/speed prefer none). */
const MODE_CAT: Partial<Record<BingoMode, Category>> = { survival: "survival", challenge: "challenge", fun: "fun", exploration: "explore", boss: "combat", achievement: "progress", coop: "team" };

export type TaskSource = "catalog" | "genre" | "ai" | "own" | "web";
export interface Task { text: string; level: Level; category: Category; team?: boolean; boss?: boolean; spoiler?: boolean; source: TaskSource; why?: string }

export interface Cell extends BingoCell { level?: Level; category?: Category; source?: TaskSource; why?: string; doneBy?: string[]; doneAt?: string }

/** A card: the 2.39 bingo plus everything the Ultimate Bingo adds (all optional, old cards stay valid). */
export interface Card extends Bingo {
  cells: Cell[];
  v?: 2;
  difficulty?: Difficulty;
  mode?: BingoMode;
  players?: string[];
  /** Shared = one card for everyone; versus = everyone marks for themselves. */
  multi?: "shared" | "versus";
  win?: "line" | "full";
  timeLimitMin?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  rules?: string;
  rating?: number | null;
  favorite?: boolean;
  notes?: string;
  /** Where the tasks came from ("Katalog", "Claude", "DeepSeek (deepseek-flash)", …) – shown honestly on the card. */
  provider?: string;
  genre?: string | null;
  /** Texts of earlier cards in this series, so "new without repeating" really avoids them. */
  history?: string[];
  notesFromMaker?: string[];
}

export interface BingoOptions {
  game: string;
  size: 3 | 4 | 5;
  difficulty: Difficulty;
  mode: BingoMode;
  players: number;
  categories: Category[];
  /** Where tasks come from: AI (or catalog without AI), only own tasks, or both. */
  taskSource: "auto" | "own" | "mixed";
  beginner?: boolean;
  expert?: boolean;
  spoilers?: boolean;
  freeCenter?: boolean;
  timeLimitMin?: number | null;
  rules?: string;
  progress?: string;
  exclude?: string[];
  /** Texts of the last cards of this game – used only when there are not enough other tasks (a new card differs). */
  avoid?: string[];
  /** Tasks of older cards – avoided too, but before the last card's tasks are repeated, these come first. */
  avoidOld?: string[];
  /** Tasks from the game's Steam achievements (only after the user agreed to look on the internet). */
  web?: boolean;
  genre?: string | null;
}

export const DEFAULT_OPTIONS: BingoOptions = { game: "", size: 4, difficulty: "medium", mode: "classic", players: 1, categories: [], taskSource: "auto" };

// ------------------------------------------------------------------------------------------ catalog

export function parseLine(line: string, source: TaskSource): Task | null {
  const m = /^([1-4])([ekcbtfhps])([TB!]*)\|(.{3,90})$/.exec(line);
  if (!m) return null;
  return { text: m[4], level: Number(m[1]) as Level, category: CAT_CODE[m[2]], team: m[3].includes("T") || undefined, boss: m[3].includes("B") || undefined, spoiler: m[3].includes("!") || undefined, source };
}

/** The built-in game for a name ("Minecraft: Java Edition" → Minecraft), or null. */
export function findGame(name: string): CatalogGame | null {
  const n = norm(name).replace(/[™®©]/g, "").trim();
  if (n.length < 2) return null;
  return CATALOG.find((g) => g.aliases.includes(n)) ?? CATALOG.find((g) => g.aliases.some((a) => a.length >= 4 && (n.startsWith(a + " ") || n.startsWith(a + ":")))) ?? null;
}

export function capsFor(game: string, genre?: string | null) {
  const g = findGame(game);
  return g?.caps ?? GENRES[genre ?? "generic"]?.caps ?? GENRES.generic.caps;
}

/** Modes that make sense for a game (no boss bingo without bosses, no co-op bingo alone …). */
export function modesFor(game: string, players: number, genre?: string | null): BingoMode[] {
  const c = capsFor(game, genre);
  return MODES.filter((m) => !(m === "boss" && !c.boss) && !(m === "coop" && (players < 2 || !c.team)) && !(m === "survival" && !c.survival));
}

export function categoriesFor(game: string, players: number, genre?: string | null): Category[] {
  const c = capsFor(game, genre);
  return CATEGORIES.filter((x) => !(x === "build" && !c.build) && !(x === "team" && (players < 2 || !c.team)) && !(x === "survival" && !c.survival));
}

export function poolFor(game: string, genre?: string | null): { tasks: Task[]; from: "catalog" | "genre"; name: string; note?: string } {
  const g = findGame(game);
  if (g) return { tasks: g.tasks.map((l) => parseLine(l, "catalog")).filter((x): x is Task => !!x), from: "catalog", name: g.name, note: g.note };
  const gen = GENRES[genre ?? "generic"] ?? GENRES.generic;
  return { tasks: gen.tasks.map((l) => parseLine(l, "genre")).filter((x): x is Task => !!x), from: "genre", name: gen.name };
}

// ------------------------------------------------------------------------------------------ difficulty

/** How many tasks of each level (1–4) a card gets. Shares, rounded so the sum is exactly n. */
export function levelPlan(d: Difficulty, n: number): [number, number, number, number] {
  const fixedMixed: Record<number, [number, number, number, number]> = { 9: [3, 3, 2, 1], 16: [4, 5, 4, 3], 25: [6, 7, 7, 5] };
  if (d === "mixed" && fixedMixed[n]) return fixedMixed[n];
  const share: Record<Difficulty, number[]> = { easy: [0.7, 0.3, 0, 0], medium: [0.2, 0.6, 0.2, 0], hard: [0, 0.2, 0.6, 0.2], veryhard: [0, 0, 0.35, 0.65], mixed: [0.25, 0.3, 0.25, 0.2] };
  const raw = share[d].map((s) => s * n);
  const out = raw.map(Math.floor);
  let rest = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).filter((x) => share[d][x.i] > 0).sort((a, b) => b.f - a.f || share[d][b.i] - share[d][a.i]);
  for (let k = 0; rest > 0; k++, rest--) out[order[k % order.length].i]++;
  return out as [number, number, number, number];
}

export function harder(d: Difficulty): Difficulty { return ({ easy: "medium", medium: "hard", hard: "veryhard", veryhard: "veryhard", mixed: "hard" } as const)[d]; }
export function easier(d: Difficulty): Difficulty { return ({ easy: "easy", medium: "easy", hard: "medium", veryhard: "hard", mixed: "medium" } as const)[d]; }

/** Short reason why a task has its level – shown on request, written from level and kind, not invented per game. */
export function whyLevel(t: Pick<Task, "level" | "category" | "team" | "boss">): string {
  const base = { 1: "Leicht: kurz und auch für Einsteiger machbar.", 2: "Mittel: braucht etwas Spielerfahrung.", 3: "Schwer: braucht Können, Planung oder mehr Zeit.", 4: "Sehr schwer: für erfahrene Spieler – fordernd, aber machbar." }[t.level];
  const extra = t.boss ? " Bosskampf." : t.team ? " Nur gemeinsam zu schaffen." : "";
  return base + extra;
}

// ------------------------------------------------------------------------------------------ choosing tasks

export class NotEnoughTasks extends Error {
  constructor(public need: number, public have: number) { super(`Nicht genug passende Aufgaben (${have} von ${need}).`); }
}

const key = (s: string) => norm(s).replace(/[^\p{L}\p{N} ]/gu, "");

function shuffle<T>(a: T[], rnd: () => number): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
}

/** Tasks a card may use at all: fits the players, no spoilers unless wanted, nothing excluded. */
export function usable(tasks: Task[], o: Pick<BingoOptions, "players" | "spoilers" | "exclude" | "beginner" | "expert">): Task[] {
  const ex = new Set((o.exclude ?? []).map(key));
  const seen = new Set<string>();
  return tasks.filter((t) => {
    const k = key(t.text);
    if (seen.has(k) || ex.has(k)) return false;
    if (t.team && o.players < 2) return false;
    if (t.spoiler && !o.spoilers) return false;
    if (o.beginner && t.level > 2) return false;
    if (o.expert && t.level < 2) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Picks exactly n tasks: own tasks first (as wanted), then per level from the pool; the mode's and the chosen
 * categories come first within a level. A level that runs short is filled from the neighbouring level – said in `notes`.
 */
export function pickTasks(pool: Task[], own: Task[], o: BingoOptions, rnd: () => number = Math.random): { tasks: Task[]; notes: string[] } {
  const n = o.size * o.size - (o.freeCenter && o.size % 2 === 1 ? 1 : 0);
  const notes: string[] = [];
  const ownOk = usable(own, o);
  let chosen: Task[] = [];
  if (o.taskSource === "own" || o.mode === "custom") {
    if (ownOk.length < n) throw new NotEnoughTasks(n, ownOk.length);
    return { tasks: shuffle(ownOk, rnd).slice(0, n), notes };
  }
  if (o.taskSource === "mixed") chosen = shuffle(ownOk, rnd).slice(0, Math.floor(n / 2));
  const taken = new Set(chosen.map((t) => key(t.text)));
  const rest = usable(pool, o).filter((t) => !taken.has(key(t.text)));
  const prefer = new Set<Category>([...o.categories, ...(MODE_CAT[o.mode] ? [MODE_CAT[o.mode]!] : [])]);
  const diff = o.mode === "challenge" ? harder(o.difficulty) : o.mode === "speed" ? easier(o.difficulty) : o.difficulty;
  const plan = levelPlan(diff, n - chosen.length);
  // Boss bingo: boss tasks count as preferred everywhere. Tasks of the last cards come last (only if nothing else is left).
  const avoid = new Set((o.avoid ?? []).map(key));
  const avoidOld = new Set((o.avoidOld ?? []).map(key));
  const rank = (t: Task) => (avoid.has(key(t.text)) ? 4 : avoidOld.has(key(t.text)) ? 2 : 0) + (prefer.has(t.category) || (o.mode === "boss" && t.boss) ? 0 : 1);
  const byLevel = (l: number) => shuffle(rest.filter((t) => t.level === l), rnd).sort((a, b) => rank(a) - rank(b));
  const left: Task[][] = [byLevel(1), byLevel(2), byLevel(3), byLevel(4)];
  const short: number[] = [0, 0, 0, 0];
  plan.forEach((count, i) => { const got = left[i].splice(0, count); chosen.push(...got); short[i] = count - got.length; });
  // Fill gaps from the nearest levels.
  short.forEach((miss, i) => {
    for (const j of [i + 1, i - 1, i + 2, i - 2, i + 3, i - 3]) {
      if (miss <= 0) break;
      if (j < 0 || j > 3) continue;
      const got = left[j].splice(0, miss);
      if (got.length) notes.push(`${got.length} × „${LEVEL_LABEL[(i + 1) as Level]}“ fehlten – mit „${LEVEL_LABEL[(j + 1) as Level]}“ ergänzt.`);
      chosen.push(...got);
      miss -= got.length;
    }
    if (miss > 0) short[i] = miss; else short[i] = 0;
  });
  if (chosen.length < n) throw new NotEnoughTasks(n, chosen.length);
  if (prefer.size && !chosen.some((t) => prefer.has(t.category))) notes.push("Für die gewählte Art gab es keine passenden Aufgaben – andere wurden genommen.");
  const again = chosen.slice(0, n).filter((t) => avoid.has(key(t.text))).length;
  if (again) notes.push(`${again} Aufgaben gab es schon in deinem letzten Bingo zu diesem Spiel – mehr verschiedene gibt es dafür nicht.`);
  return { tasks: chosen.slice(0, n), notes };
}

// ------------------------------------------------------------------------------------------ Steam achievements

export interface WebAchievement { name: string; description: string; hidden: boolean; percent: number | null }

/** Difficulty from the worldwide unlock rate: many players have it → easy, very few → very hard. */
export function levelFromPercent(p: number | null): Level {
  if (p == null) return 2;
  return p >= 35 ? 1 : p >= 12 ? 2 : p >= 3 ? 3 : 4;
}

/** A game's achievements as tasks: name and description as Steam writes them, hidden ones only with spoilers. */
export function webTasks(list: WebAchievement[]): Task[] {
  return list.filter((a) => a.name.trim()).map((a) => {
    const text = (a.description ? `${a.name}: ${a.description}` : a.hidden ? `Versteckter Erfolg „${a.name}“` : a.name).replace(/\s+/g, " ").trim();
    const level = levelFromPercent(a.percent);
    return {
      text: text.length > 90 ? text.slice(0, 89) + "…" : text, level, category: (level >= 3 ? "challenge" : "progress") as Category, source: "web" as const, spoiler: a.hidden || undefined,
      why: a.percent == null ? "Steam-Erfolg – wie viele ihn haben, ist nicht bekannt" : `${a.percent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} % aller Steam-Spieler haben diesen Erfolg`,
    };
  });
}

/** Tasks on a board (shuffled), with the optional free centre (odd sizes only). */
export function toCells(tasks: Task[], size: number, freeCenter: boolean, rnd: () => number = Math.random): Cell[] {
  const cells: Cell[] = shuffle(tasks, rnd).map((t) => ({ text: t.text, level: t.level, category: t.category, source: t.source, why: t.why ?? whyLevel(t), done: false }));
  if (freeCenter && size % 2 === 1) cells.splice((size * size - 1) / 2, 0, { text: "Frei", free: true, done: true });
  return cells;
}

// ------------------------------------------------------------------------------------------ AI answers

/** What the PC returns for AI tasks; checked here again before anything is shown (never trust a model). */
export function sanitizeAiTasks(v: unknown, game: string): Task[] {
  const list = (v as { tasks?: unknown })?.tasks;
  if (!Array.isArray(list)) return [];
  const out: Task[] = [];
  const seen = new Set<string>();
  for (const x of list.slice(0, 60)) {
    const o = x as Record<string, unknown>;
    const text = typeof o?.text === "string" ? o.text.replace(/\s+/g, " ").trim() : typeof x === "string" ? x.trim() : "";
    if (text.length < 3 || text.length > 90 || !/\p{L}/u.test(text) || /[<>{}]/.test(text)) continue;
    const k = key(text);
    if (seen.has(k)) continue;
    seen.add(k);
    const lv = Number(o?.level);
    const level = (lv >= 1 && lv <= 4 ? Math.round(lv) : 2) as Level;
    const category = CATEGORIES.includes(o?.category as Category) ? (o.category as Category) : "challenge";
    const why = typeof o?.why === "string" && o.why.length <= 160 ? o.why.trim() : undefined;
    out.push({ text, level, category, team: o?.team === true || undefined, source: "ai", why });
  }
  void game;
  return out;
}

// ------------------------------------------------------------------------------------------ playing

export const ME = "Ich";

export function cellDone(c: Cell, player?: string) { return player ? !!c.free || !!c.doneBy?.includes(player) : !!c.done || !!c.free; }

/** Marks or unmarks a field – for one player in versus mode, otherwise for the card (remembering who did it). */
export function toggleCell(card: Card, i: number, player: string = ME, now = new Date()): Card {
  const c = card.cells[i];
  if (!c || c.free) return card;
  const by = new Set(c.doneBy ?? (c.done ? [player] : []));
  if (card.multi === "versus") { if (by.has(player)) by.delete(player); else by.add(player); }
  else if (c.done) by.clear(); else by.add(player);
  const doneBy = [...by];
  const cells = card.cells.map((x, j) => (j === i ? { ...x, doneBy, done: card.multi === "versus" ? doneBy.length > 0 : doneBy.length > 0, doneAt: doneBy.length ? now.toISOString() : undefined } : x));
  const next: Card = { ...card, cells, startedAt: card.startedAt ?? now.toISOString() };
  const p = progress(next);
  next.finishedAt = p.complete ? (card.finishedAt ?? now.toISOString()) : null;
  return next;
}

export function progress(card: Card, player?: string) {
  const playable = card.cells.filter((c) => !c.free);
  const done = playable.filter((c) => cellDone(c, card.multi === "versus" ? player ?? ME : undefined)).length;
  const marks: BingoCell[] = card.cells.map((c) => ({ text: c.text, free: c.free, done: cellDone(c, card.multi === "versus" ? player ?? ME : undefined) }));
  const lines = bingoLines(marks, card.size);
  const complete = playable.length > 0 && done === playable.length;
  return { done, total: playable.length, left: playable.length - done, percent: playable.length ? Math.round((done / playable.length) * 100) : 0, lines, complete, won: card.win === "full" ? complete : lines.length > 0 };
}

export type Status = "new" | "running" | "done";
export const STATUS_LABEL: Record<Status, string> = { new: "Nicht gestartet", running: "In Bearbeitung", done: "Abgeschlossen" };
export function status(card: Card): Status {
  const p = progress(card);
  if (p.complete || (card.multi === "versus" && (card.players ?? []).some((pl) => progress(card, pl).complete))) return "done";
  return card.cells.some((c) => !c.free && (c.done || c.doneBy?.length)) ? "running" : "new";
}

/** Standings in versus mode: lines first, then marked fields. */
export function standings(card: Card) {
  return (card.players ?? [ME]).map((p) => ({ player: p, ...progress(card, p) })).sort((a, b) => b.lines.length - a.lines.length || b.done - a.done);
}

export function resetCard(card: Card): Card {
  return { ...card, cells: card.cells.map((c) => (c.free ? c : { ...c, done: false, doneBy: [], doneAt: undefined })), startedAt: null, finishedAt: null };
}

/** Same tasks, new places (marks stay with their task). */
export function shuffleCard(card: Card, rnd: () => number = Math.random): Card {
  const free = card.cells.findIndex((c) => c.free);
  const tasks = shuffle(card.cells.filter((c) => !c.free), rnd);
  if (free >= 0) tasks.splice(free, 0, card.cells[free]);
  return { ...card, cells: tasks };
}

/** Exchanges one field for an unused task of the same level if possible (never one already on the card or used before). */
export function replaceCell(card: Card, i: number, pool: Task[], rnd: () => number = Math.random): Card | null {
  const cur = card.cells[i];
  if (!cur || cur.free) return null;
  const used = new Set([...card.cells.map((c) => key(c.text)), ...(card.history ?? []).map(key)]);
  const players = card.players?.length ?? 1;
  const free = pool.filter((t) => !used.has(key(t.text)) && !(t.team && players < 2) && !t.spoiler);
  if (!free.length) return null;
  const same = free.filter((t) => t.level === (cur.level ?? 2));
  const pick = (same.length ? same : free)[Math.floor(rnd() * (same.length ? same : free).length)];
  const cells = card.cells.map((c, j) => (j === i ? { text: pick.text, level: pick.level, category: pick.category, source: pick.source, why: pick.why ?? whyLevel(pick), done: false, doneBy: [] } : c));
  return { ...card, cells, history: [...(card.history ?? []), cur.text].slice(-200) };
}

// ------------------------------------------------------------------------------------------ chat requests

export interface Request {
  /** "create" = new card; "ask" = a question is needed first. */
  action: "create" | "ask";
  options: Partial<BingoOptions>;
  /** The game should be drawn from the library. */
  randomGame?: boolean;
  /** Based on the previous card (harder/easier/new without repeating). */
  fromPrevious?: "harder" | "easier" | "fresh" | null;
  question?: string;
}

const NUM: Record<string, number> = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Is this chat message about a bingo at all? */
export function isBingoRequest(text: string, hasPrevious = false) {
  const s = text.toLowerCase();
  // "Bingo-Widget auf die Startseite" is a setup command, not a new card.
  if (/widget|overlay|startseite|home-bildschirm/.test(s)) return false;
  return /bingo/.test(s) || (hasPrevious && /\b(vorherige|letzte|das)\b.*\b(schwieriger|schwerer|leichter|einfacher)\b/.test(s));
}

/**
 * Settings from a sentence like "Erstelle ein 5×5-Bingo für Elden Ring auf sehr schwer für zwei Spieler".
 * Games are recognised from the built-in list and the given library names; anything else after "für"/"zu" is taken
 * as the game name as written.
 */
export function parseRequest(text: string, ctx: { library?: string[]; previous?: Card | null } = {}): Request {
  const s = " " + text.toLowerCase().replace(/[„“”"!?.]/g, " ").replace(/\s+/g, " ") + " ";
  const o: Partial<BingoOptions> = {};
  const size = /([345])\s*(?:x|×|\*|mal)\s*[345]/.exec(s) ?? /\b([345])er[- ]?bingo/.exec(s);
  if (size) o.size = Number(size[1]) as 3 | 4 | 5;
  else if (/\b(klein|kleines)\b/.test(s)) o.size = 3; else if (/\b(groß|großes|riesig)\b/.test(s)) o.size = 5;
  if (/sehr schwer|extrem|very hard|brutal|unmöglich schwer/.test(s)) o.difficulty = "veryhard";
  else if (/gemischt|mix|einfachen, mittleren|verschiedenen schwierigkeit/.test(s)) o.difficulty = "mixed";
  else if (/\b(schwer|schwierig|hard)\b/.test(s)) o.difficulty = "hard";
  else if (/\b(mittel|normal|medium)\b/.test(s)) o.difficulty = "medium";
  else if (/\b(leicht|einfach|easy)\b/.test(s)) o.difficulty = "easy";
  const pl = /\b(?:für|mit) (\d|ein|eine|zwei|drei|vier|fünf|sechs|sieben|acht)\s+(?:spieler|spielerinnen|personen|leute)/.exec(s) ?? /\bzu (zweit|dritt|viert|fünft)\b/.exec(s);
  if (pl) o.players = /^\d$/.test(pl[1]) ? Number(pl[1]) : NUM[pl[1]] ?? ({ zweit: 2, dritt: 3, viert: 4, fünft: 5 } as Record<string, number>)[pl[1]];
  const friends = /mit (\d|einem|zwei|drei|vier) (?:freund|freunden|kumpel)/.exec(s);
  if (!o.players && friends) o.players = 1 + (/^\d$/.test(friends[1]) ? Number(friends[1]) : friends[1] === "einem" ? 1 : NUM[friends[1]] ?? 1);
  if (/gaming-abend|gemeinsam|koop|co-op|coop|team/.test(s) && !o.players) o.players = 2;
  if (/lustig|witzig|fun\b/.test(s)) o.mode = "fun";
  else if (/speed|zeitlimit|auf zeit/.test(s)) o.mode = "speed";
  else if (/boss/.test(s)) o.mode = "boss";
  else if (/erkund|exploration|geheimnis/.test(s)) o.mode = "exploration";
  else if (/survival|überleben/.test(s) && !/minecraft-survival|survival-welt/.test(s)) o.mode = "survival";
  else if (/erfolg|achievement|trophäe/.test(s)) o.mode = "achievement";
  else if (/challenge|herausforderung/.test(s)) o.mode = "challenge";
  else if (/koop|co-op|coop|gaming-abend/.test(s)) o.mode = "coop";
  const lim = /(\d{1,3})\s*(?:min|minuten)/.exec(s);
  if (lim) { o.timeLimitMin = Math.min(600, Number(lim[1])); o.mode ??= "speed"; }
  if (/ganz am anfang|anfänger|einsteiger|neu angefangen|noch am anfang/.test(s)) { o.beginner = true; o.progress = "Ganz am Anfang"; o.difficulty ??= "easy"; }
  if (/durchgespielt|erfahren|profi|veteran|endgame/.test(s)) { o.expert = true; o.progress = "Durchgespielt / erfahren"; o.spoilers = true; o.difficulty ??= "hard"; }
  if (/mit spoiler/.test(s)) o.spoilers = true;
  if (/freie mitte|freies feld|mit frei/.test(s)) o.freeCenter = true;
  if (/eigene(n)? aufgaben/.test(s)) o.taskSource = /nur|ausschließlich/.test(s) ? "own" : "mixed";

  // The game: built-in names, library names, then "für X" / "X-Bingo".
  const lib = (ctx.library ?? []).filter((n) => n.length >= 2);
  const known = [...CATALOG.flatMap((g) => g.aliases.map((a) => ({ a, name: g.name }))), ...lib.map((n) => ({ a: n.toLowerCase(), name: n }))].sort((a, b) => b.a.length - a.a.length);
  const plain = s.replace(/-/g, " "); // "Elden-Ring-Bingo"
  const hit = known.find((k) => new RegExp(`(^|[^\\p{L}])${k.a.replace(/-/g, " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u").test(plain));
  if (hit) o.game = hit.name;
  else {
    const m = /\b(?:für|zu|in) ([\p{L}\d][\p{L}\d' :&.-]{1,40}?)(?=\s+(?:auf|mit|für|ohne|in|im|bei|und|als|,)\b|\s*$)/u.exec(s.trim()) ?? /\b([\p{L}\d][\p{L}\d' &.]{1,30})-bingo/u.exec(s);
    let cand = m?.[1]?.trim().replace(/^(ein|eine|einen|das|die|der|mein|meine)\s+/, "");
    // "für Celeste leicht" / "für Fortnite 5x5": size and difficulty words at the end are not part of the name.
    for (let i = 0; cand && i < 3; i++) cand = cand.replace(/\s+(?:auf\s+)?(?:sehr schwer|leicht|einfach|mittel|mittleres|normal|schwer|schwierig|gemischt|mix|extrem|bingo|[345]\s*(?:x|×|\*)\s*[345])$/u, "").trim();
    if (cand && !/^(\d|zwei|drei|vier|spieler|leicht|mittel|schwer|anfänger|beliebiges|ein beliebiges spiel|meine spielebibliothek|heute|morgen|gleich|jetzt|später|nachher|abend|den abend|wochenende|das wochenende|am wochenende|zwischendurch)/.test(cand) && !/spieler|personen|freund/.test(cand)) o.game = cand.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  }
  const randomGame = /beliebig|zufällig(es)? spiel|aus meiner (spiele)?bibliothek/.test(s);
  if (/zufällig/.test(s) && !randomGame) o.mode ??= "random";
  let fromPrevious: Request["fromPrevious"] = null;
  if (ctx.previous) {
    if (/schwieriger|schwerer/.test(s)) fromPrevious = "harder";
    else if (/leichter|einfacher/.test(s)) fromPrevious = "easier";
    else if (/ohne (aufgaben aus|wiederhol)|nicht wiederhol|komplett neu/.test(s)) fromPrevious = "fresh";
  }
  if (!o.game && !randomGame && !fromPrevious) return { action: "ask", options: o, question: "Für welches Spiel soll das Bingo sein?" };
  return { action: "create", options: o, randomGame, fromPrevious };
}

/** Options for a request, filled with defaults and the previous card where it says so. */
export function resolveOptions(r: Request, previous: Card | null, pickGame: () => string | null): BingoOptions | { error: string } {
  const base: BingoOptions = { ...DEFAULT_OPTIONS };
  if (r.fromPrevious && previous) {
    base.game = previous.gameName ?? "";
    base.size = previous.size;
    base.difficulty = previous.difficulty ?? "medium";
    base.mode = previous.mode ?? "classic";
    base.players = previous.players?.length || 1;
    base.genre = previous.genre ?? null;
    base.freeCenter = !!previous.freeCenter;
    if (r.fromPrevious === "harder") base.difficulty = harder(base.difficulty);
    if (r.fromPrevious === "easier") base.difficulty = easier(base.difficulty);
    base.exclude = [...previous.cells.filter((c) => !c.free).map((c) => c.text), ...(previous.history ?? [])];
  }
  const o: BingoOptions = { ...base, ...Object.fromEntries(Object.entries(r.options).filter(([, v]) => v !== undefined)) } as BingoOptions;
  if (r.fromPrevious === "harder" && previous && !r.options.difficulty) o.difficulty = harder(previous.difficulty ?? "medium");
  if (r.randomGame) { const g = pickGame(); if (!g) return { error: "In deiner Bibliothek ist noch kein Spiel – nenne einfach eins." }; o.game = g; }
  if (!o.game) return { error: "Für welches Spiel soll das Bingo sein?" };
  if (o.players < 1 || o.players > 8) o.players = Math.min(8, Math.max(1, o.players || 1));
  if (o.mode === "coop" && o.players < 2) o.players = 2;
  return o;
}

/** A readable title, e.g. "Minecraft – 4×4 Bingo". */
export const cardTitle = (o: Pick<BingoOptions, "game" | "size">) => `${o.game} – ${o.size}×${o.size} Bingo`.slice(0, 80);

/** A shared card from a link: everything checked, unknown fields dropped. */
export function sanitizeCard(v: unknown): Card | null {
  const b = v as Partial<Card> | null;
  if (!b || typeof b.title !== "string" || ![3, 4, 5].includes(b.size as number) || !Array.isArray(b.cells) || b.cells.length !== b.size! * b.size!) return null;
  const cells: Cell[] = b.cells.map((c) => {
    const x = c as Cell;
    return { text: String(x?.text ?? "").slice(0, 90), free: !!x?.free, done: !!x?.done, level: [1, 2, 3, 4].includes(x?.level as number) ? x.level : undefined, category: CATEGORIES.includes(x?.category as Category) ? x.category : undefined };
  });
  if (cells.some((c) => !c.text)) return null;
  return {
    title: b.title.slice(0, 80), size: b.size as 3 | 4 | 5, cells, freeCenter: !!b.freeCenter, gameName: typeof b.gameName === "string" ? b.gameName.slice(0, 100) : null, v: 2,
    difficulty: DIFFICULTIES.includes(b.difficulty as Difficulty) ? b.difficulty : undefined, mode: MODES.includes(b.mode as BingoMode) ? b.mode : undefined,
  };
}
