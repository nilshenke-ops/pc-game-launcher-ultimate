// Creating a bingo card: tasks from the AI chosen on the PC (DeepSeek, Claude or Ollama – checked there and again
// here), else from the built-in catalog; own tasks from the journal ("bingotask"). One creation at a time.

import { client } from "./rpc";
import { getEntry, listKind, newId, saveEntry } from "./journal";
import { norm } from "./journal-logic";
import { GENRES } from "./bingo-catalog";
import { lookupGame } from "./game-lookup";
import {
  cardTitle, genresFromInfo, levelPlan, poolForGenres, pickTasks, poolFor, sanitizeAiTasks, toCells, webTasks, NotEnoughTasks,
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
/** First sentence, at most `max` characters, cut at a word. */
/** The own rules for the AI plus the played role ("Ich spiele als Impostor …"), so it writes only tasks that role can do. */
const aiRules = (o: BingoOptions) => [o.role === "impostor" ? "Ich spiele als Impostor: nur Aufgaben, die ein Impostor machen kann (z. B. Sabotage, Lüftungsschächte, Ausschalten, Täuschen) oder die für alle gelten – keine Crewmate-Aufgaben." : o.role === "crewmate" ? "Ich spiele als Crewmate: nur Aufgaben, die ein Crewmate machen kann (z. B. Aufgaben erledigen, Leichen melden, Notfall-Meeting, Impostor überführen) oder die für alle gelten – keine Impostor-Aufgaben." : "", o.rules].filter(Boolean).join(" ").slice(0, 300) || undefined;
const shortText = (s: string, max: number) => { const first = s.split(/(?<=[a-zäöüß)"“][.!?])\s+(?=[A-ZÄÖÜ])/)[0]; return first.length <= max ? first : first.slice(0, first.lastIndexOf(" ", max)) + " …"; };

export async function createCard(input: BingoOptions, opts: { useAi: boolean; aiAvailable: boolean; title?: string; players?: string[]; /** false: no PC – this device looks the game up itself (Microsoft Store, Wikipedia). */ pcOnline?: boolean }): Promise<Made> {
  if (running) throw new Error("Es wird schon ein Bingo erstellt – einen Moment.");
  const p = (async () => {
    let o = input;
    const own = o.taskSource === "auto" ? [] : ownTasksFor(o.game);
    const n = o.size * o.size - (o.freeCenter && o.size % 2 === 1 ? 1 : 0);
    let pool: Task[];
    let provider: string;
    const notes: string[] = [];
    let mix: ((webCount: number, aiCount: number) => string) | null = null;
    const base = poolFor(o.game, o.genre);
    // A new card should not repeat the last ones: their tasks are used only when nothing else is left.
    const recent = recentTasks(o.game);
    o = { ...o, avoid: [...(o.avoid ?? []), ...recent.last], avoidOld: recent.older };
    if (o.taskSource !== "own" && o.web) {
      // With the PC: Steam (achievements), else Microsoft Store/Wikipedia through the PC. Without the PC (or when it fails):
      // this device asks the Microsoft Store and Wikipedia itself – Steam allows that only to the PC.
      type WebInfo = { name: string; appId: number | null; source: string; achievements: WebAchievement[]; genres?: string[]; categories?: string[]; description?: string | null; text?: string | null };
      const fromBrowser = async (): Promise<WebInfo> => { const g = await lookupGame(o.game); return { ...g, appId: null, achievements: [] }; };
      let r: WebInfo;
      if (opts.pcOnline !== false) {
        try { r = await client.call<WebInfo>("bingo.webTasks", { game: o.game }); }
        catch (e) { r = await fromBrowser(); notes.push(`Über den PC hat die Suche nicht geklappt (${(e as Error).message}) – dieses Gerät hat selbst nachgesehen.`); }
      } else r = await fromBrowser();
      // What kind of game it is decides the extra tasks. Real achievements, the own catalog (if any) and the fitting
      // sets for every kind of game found (e.g. stealth + horror + puzzles) are mixed, so cards fit and do not repeat.
      const kinds = genresFromInfo(r);
      const genre = kinds[0];
      const kindNames = kinds.filter((k) => GENRES[k] && k !== "generic").map((k) => GENRES[k].name);
      const asked = o.game;
      const found = r.name || o.game;
      const again = norm(found) !== norm(asked) ? recentTasks(found) : { last: [], older: [] };
      o = { ...o, genre, game: base.from === "catalog" ? base.name : found, avoid: [...(o.avoid ?? []), ...again.last], avoidOld: [...(o.avoidOld ?? []), ...again.older] };
      const web = webTasks(r.achievements);
      const extra = base.from === "catalog" ? base.tasks : poolForGenres(kinds);
      const where = r.appId ? "Steam" : [/microsoft/i.test(r.source) ? "Microsoft Store (Xbox)" : "", /wikipedia/i.test(r.source) ? "Wikipedia" : ""].filter(Boolean).join(" und ") || "Internet";
      // With an AI on the PC: it gets what was found and writes tasks that make sense for exactly this game.
      let ai: Task[] = [];
      let aiName = "";
      if (opts.useAi && opts.aiAvailable) {
        const facts = [`${r.name} (${where})`, r.genres?.length ? `Genre: ${r.genres.join(", ")}` : "", r.categories?.length ? `Merkmale: ${r.categories.slice(0, 8).join(", ")}` : "",
          r.description ? `Beschreibung: ${r.description}` : "", r.achievements.length ? `Steam-Erfolge: ${r.achievements.filter((a) => !a.hidden).slice(0, 30).map((a) => a.name + (a.description ? ` (${a.description})` : "")).join("; ")}` : ""].filter(Boolean).join("\n").slice(0, 2000);
        try {
          const levels = levelPlan(o.difficulty === "mixed" ? "mixed" : o.difficulty, n);
          const res = await client.call<{ known: boolean; tasks: unknown[]; provider: string; model?: string | null }>("assistant.bingoPlan", {
            game: o.game, size: o.size, levels, mode: o.mode, players: o.players, categories: o.categories, exclude: [...(o.exclude ?? []), ...(o.avoid ?? []), ...(o.avoidOld ?? [])].slice(-60), rules: aiRules(o), progress: o.progress, spoilers: !!o.spoilers, facts,
          });
          ai = sanitizeAiTasks(res, o.game);
          aiName = res.model ? `${res.provider} (${res.model})` : res.provider;
        } catch (e) { notes.push(`Die KI konnte diesmal nicht mitschreiben (${(e as Error).message}) – Aufgaben ohne KI.`); }
      }
      // Game-specific tasks (achievements, AI with the found facts) first; the general set only when they are too few.
      pool = web.length + ai.length >= Math.ceil(n * 1.25) && ai.length ? [...web, ...ai] : [...web, ...ai, ...extra];
      provider = `${base.from === "catalog" ? "Katalog + " : ""}${where} (${r.name})${aiName ? ` + ${aiName}` : ""}`;
      if (norm(r.name) !== norm(asked) && base.from !== "catalog") notes.push(`Gefunden als „${r.name}“.`);
      const kind = [...(r.genres ?? []).filter((g) => !/^(other|andere|sonstige)$/i.test(g.trim())), ...(r.categories ?? []).filter((c) => /mehrspieler|koop|geteilt|online/i.test(c))].slice(0, 5).join(", ");
      if (kind || r.description) notes.push(`Laut ${where}: ${kind ? kind + ". " : ""}${shortText(r.description ?? "", 180)}`);
      mix = (w, k) => {
        const g = n - w - k;
        const parts = [w ? `${w} echte Steam-Erfolge` : "", k ? `${k} Aufgaben, die die KI mit diesen Infos geschrieben hat` : "",
          g ? `${g} ${base.from === "catalog" ? `eingebaute ${base.name}-Aufgaben` : kindNames.length ? `Aufgaben passend zu ${kindNames.join(", ")}` : "allgemeine Aufgaben"}` : ""].filter(Boolean);
        return `Auf der Karte: ${parts.join(", ")} – jede neue Karte wird anders.`;
      };
      if (!o.spoilers && r.achievements.some((a) => a.hidden)) notes.push("Versteckte Erfolge sind nicht dabei (Spoiler) – mit „mit Spoiler“ kommen sie dazu.");
    } else if (o.taskSource !== "own" && opts.useAi && opts.aiAvailable) {
      const levels = levelPlan(o.difficulty === "mixed" ? "mixed" : o.difficulty, n - (o.taskSource === "mixed" ? Math.floor(n / 2) : 0));
      const r = await client.call<{ known: boolean; tasks: unknown[]; provider: string; model?: string | null; costUsd?: number }>("assistant.bingoPlan", {
        game: o.game, size: o.size, levels, mode: o.mode, players: o.players, categories: o.categories, exclude: [...(o.exclude ?? []), ...(o.avoid ?? []), ...(o.avoidOld ?? [])].slice(-60), rules: aiRules(o), progress: o.progress, spoilers: !!o.spoilers,
      });
      pool = sanitizeAiTasks(r, o.game);
      provider = r.model ? `${r.provider} (${r.model})` : r.provider;
      if (!r.known) notes.push("Die KI kennt das Spiel nicht sicher – sie hat allgemeine Aufgaben geschrieben.");
    } else {
      pool = base.tasks;
      provider = base.from === "catalog" ? "Katalog" : `Allgemeine Aufgaben (${base.name})`;
      if (base.from === "genre") notes.push("Für dieses Spiel gibt es keine eigenen Katalog-Aufgaben – ohne Suche im Internet sind die Aufgaben allgemein. Mit „im Internet nachsehen“ werden sie passend zum Spiel.");
      if (base.note) notes.push(base.note);
    }
    let picked: { tasks: Task[]; notes: string[] };
    try { picked = pickTasks(pool, own, o); }
    catch (e) {
      if (e instanceof NotEnoughTasks) throw new Error(o.taskSource === "own" ? `Für ${o.size}×${o.size} braucht es ${e.need} eigene Aufgaben zu diesem Spiel – vorhanden: ${e.have}.` : `Nicht genug passende Aufgaben (${e.have} von ${e.need}). Andere Einstellungen wählen oder eigene Aufgaben ergänzen.`);
      throw e;
    }
    if (mix) notes.push(mix(picked.tasks.filter((t) => t.source === "web").length, picked.tasks.filter((t) => t.source === "ai").length));
    const players = opts.players?.length ? opts.players : o.players > 1 ? Array.from({ length: o.players }, (_, i) => `Spieler ${i + 1}`) : ["Ich"];
    const card: Card = {
      v: 2, title: (opts.title || cardTitle(o)).slice(0, 80), size: o.size, cells: toCells(picked.tasks, o.size, !!o.freeCenter), freeCenter: !!o.freeCenter,
      gameName: o.game, difficulty: o.difficulty, mode: o.mode, players, multi: players.length > 1 ? "shared" : undefined, win: "line",
      timeLimitMin: o.mode === "speed" ? (o.timeLimitMin ?? 30) : o.timeLimitMin ?? null, rules: o.rules, role: o.role ?? null, createdAt: new Date().toISOString(), provider, genre: o.genre ?? null,
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
