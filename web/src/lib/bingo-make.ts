// Creating a bingo card: tasks from the AI chosen on the PC (DeepSeek, Claude or Ollama – checked there and again
// here), else from the built-in catalog; own tasks from the journal ("bingotask"). One creation at a time.

import { client } from "./rpc";
import { getEntry, listKind, newId, saveEntry } from "./journal";
import { norm } from "./journal-logic";
import {
  cardTitle, levelPlan, pickTasks, poolFor, sanitizeAiTasks, toCells, webTasks, NotEnoughTasks,
  type BingoOptions, type Card, type Category, type Level, type Task, type WebAchievement,
} from "./bingo";

export interface OwnTask { title: string; game?: { gameId?: string | null; gameName?: string | null }; allGames?: boolean; level?: string; category?: string; description?: string; favorite?: boolean; archived?: boolean }

/** Own tasks that fit the game (or are marked for all games). */
export function ownTasksFor(game: string): Task[] {
  const g = norm(game);
  return listKind<OwnTask>("bingotask").filter((e) => !e.data.archived && (e.data.allGames || norm(e.data.game?.gameName ?? "") === g)).map((e) => ({
    text: String(e.data.title).slice(0, 90), level: (Number(e.data.level) >= 1 && Number(e.data.level) <= 4 ? Number(e.data.level) : 2) as Level,
    category: (e.data.category ?? "challenge") as Category, source: "own" as const, why: e.data.description || undefined,
  }));
}

/** Task texts of the last card of this game and of the two before it. */
export function recentTasks(game: string): { last: string[]; older: string[] } {
  const g = norm(game);
  const cards = listKind<Card>("bingo").filter((e) => norm(e.data.gameName ?? "") === g).sort((a, b) => (b.data.createdAt ?? "").localeCompare(a.data.createdAt ?? "") || b.updatedAt - a.updatedAt).slice(0, 3);
  const texts = (c?: (typeof cards)[number]) => (c ? c.data.cells.filter((x) => !x.free).map((x) => x.text) : []);
  return { last: texts(cards[0]), older: [...texts(cards[1]), ...texts(cards[2])] };
}

let running: Promise<unknown> | null = null;
export const isCreating = () => running !== null;

export interface Made { id: string; card: Card }

/**
 * Makes and saves a card. `useAi`: ask the PC's AI when one is set up; without PC or AI the catalog is used and
 * the card says so ("Katalog" / "Allgemeine Aufgaben"). AI errors are reported as such – the catalog is offered,
 * never swapped in silently.
 */
export async function createCard(input: BingoOptions, opts: { useAi: boolean; aiAvailable: boolean; title?: string; players?: string[] }): Promise<Made> {
  if (running) throw new Error("Es wird schon ein Bingo erstellt – einen Moment.");
  const p = (async () => {
    let o = input;
    const own = o.taskSource === "auto" ? [] : ownTasksFor(o.game);
    const n = o.size * o.size - (o.freeCenter && o.size % 2 === 1 ? 1 : 0);
    let pool: Task[];
    let provider: string;
    const notes: string[] = [];
    const base = poolFor(o.game, o.genre);
    // A new card should not repeat the last ones: their tasks are used only when nothing else is left.
    const recent = recentTasks(o.game);
    o = { ...o, avoid: [...(o.avoid ?? []), ...recent.last], avoidOld: recent.older };
    if (o.taskSource !== "own" && o.web) {
      const r = await client.call<{ name: string; appId: number; achievements: WebAchievement[] }>("bingo.webTasks", { game: o.game });
      pool = webTasks(r.achievements);
      provider = `Steam-Erfolge (${r.name})`;
      if (r.name.toLowerCase() !== o.game.toLowerCase()) notes.push(`Bei Steam gefunden als „${r.name}“.`);
      if (!o.spoilers && r.achievements.some((a) => a.hidden)) notes.push("Versteckte Erfolge sind nicht dabei (Spoiler) – mit „mit Spoiler“ kommen sie dazu.");
    } else if (o.taskSource !== "own" && opts.useAi && opts.aiAvailable) {
      const levels = levelPlan(o.difficulty === "mixed" ? "mixed" : o.difficulty, n - (o.taskSource === "mixed" ? Math.floor(n / 2) : 0));
      const r = await client.call<{ known: boolean; tasks: unknown[]; provider: string; model?: string | null; costUsd?: number }>("assistant.bingoPlan", {
        game: o.game, size: o.size, levels, mode: o.mode, players: o.players, categories: o.categories, exclude: [...(o.exclude ?? []), ...(o.avoid ?? []), ...(o.avoidOld ?? [])].slice(-60), rules: o.rules, progress: o.progress, spoilers: !!o.spoilers,
      });
      pool = sanitizeAiTasks(r, o.game);
      provider = r.model ? `${r.provider} (${r.model})` : r.provider;
      if (!r.known) notes.push("Die KI kennt das Spiel nicht sicher – sie hat allgemeine Aufgaben geschrieben.");
    } else {
      pool = base.tasks;
      provider = base.from === "catalog" ? "Katalog" : `Allgemeine Aufgaben (${base.name})`;
      if (base.from === "genre") notes.push("Für dieses Spiel gibt es keine eigenen Katalog-Aufgaben – die Aufgaben sind allgemein. Mit einer KI am PC werden sie spielspezifisch.");
      if (base.note) notes.push(base.note);
    }
    let picked: { tasks: Task[]; notes: string[] };
    try { picked = pickTasks(pool, own, o); }
    catch (e) {
      if (e instanceof NotEnoughTasks) throw new Error(o.taskSource === "own" ? `Für ${o.size}×${o.size} braucht es ${e.need} eigene Aufgaben zu diesem Spiel – vorhanden: ${e.have}.` : `Nicht genug passende Aufgaben (${e.have} von ${e.need}). Andere Einstellungen wählen oder eigene Aufgaben ergänzen.`);
      throw e;
    }
    const players = opts.players?.length ? opts.players : o.players > 1 ? Array.from({ length: o.players }, (_, i) => `Spieler ${i + 1}`) : ["Ich"];
    const card: Card = {
      v: 2, title: (opts.title || cardTitle(o)).slice(0, 80), size: o.size, cells: toCells(picked.tasks, o.size, !!o.freeCenter), freeCenter: !!o.freeCenter,
      gameName: o.game, difficulty: o.difficulty, mode: o.mode, players, multi: players.length > 1 ? "shared" : undefined, win: "line",
      timeLimitMin: o.mode === "speed" ? (o.timeLimitMin ?? 30) : o.timeLimitMin ?? null, rules: o.rules, createdAt: new Date().toISOString(), provider, genre: o.genre ?? null,
      history: o.exclude?.slice(-200), notesFromMaker: [...notes, ...picked.notes], rating: null, favorite: false,
    };
    const id = newId();
    saveEntry("bingo", id, card);
    return { id, card };
  })();
  running = p;
  try { return await p; } finally { running = null; }
}

/** The card the widget and overlay show: the chosen one, else the last one in progress. */
export const ACTIVE_KEY = "pgl.bingo.active";
export function activeCardId(): string | null {
  try { const id = localStorage.getItem(ACTIVE_KEY); if (id && getEntry(id)) return id; } catch { /* storage blocked */ }
  const cards = listKind<Card>("bingo").filter((e) => !e.data.finishedAt);
  return cards.sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null;
}
export function setActiveCard(id: string) { try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* storage blocked */ } }
