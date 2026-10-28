// JARVIS challenge generator: "Erstelle fünf mittelschwere Minecraft-Challenges", "Ich habe nur 20 Minuten – gib mir
// eine Challenge", "sehr schwere Elden-Ring-Challenge ohne Story-Spoiler", "drei lustige für einen Abend mit Freunden",
// "Mach die aktuelle Challenge schwieriger", "Challenge geschafft". The tasks come from the same checked catalog as the
// Gaming-Bingo (game list + genre sets) – nothing about a game is invented. Saved as journal entries of kind "challenge"
// (browser + PC sync), the same list as „Was spiele ich? → Challenges“.

import { CATALOG } from "./bingo-catalog";
import { CATEGORY_LABEL, DIFFICULTY_LABEL, LEVEL_LABEL, harder, easier, poolFor, usable, type Category, type Difficulty, type Level, type Task } from "./bingo";
import { listKind, newId, removeEntry, saveEntry, getEntry, type Entry } from "./journal";
import { norm, type Memory } from "./journal-logic";
import { readCache } from "./offline-cache";
import type { Challenge } from "./play";
import type { LibraryItem } from "./types";

export type ChallengeIntent =
  | { kind: "make"; game: string | null; genre: string | null; count: number; difficulty: Difficulty; category: Category | null; minutes: number | null; noSpoiler: boolean; players: number; speed: boolean }
  | { kind: "harder" | "easier" | "again" }
  | { kind: "done"; text: string | null }
  | { kind: "list" }
  | { kind: "rate"; stars: number };

const NUM: Record<string, number> = { eine: 1, einen: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
const GENRE_WORDS: [RegExp, string][] = [[/horror/, "horror"], [/survival|überleben/, "survival"], [/renn|racing/, "racing"], [/shooter|ego-?shooter/, "shooter"], [/koop-?spiel|co-?op-?spiel/, "coop"], [/strategie/, "strategy"], [/rollenspiel|rpg/, "rpg"], [/sandbox|aufbau/, "sandbox"], [/open.?world/, "openworld"], [/sport/, "sports"], [/rätsel|puzzle/, "puzzle"], [/jump.?n.?run|platformer/, "platformer"], [/roguelike|roguelite/, "roguelike"]];

/** The game named in a sentence: built-in catalog first, then the library (also "Minecraft-Challenges", "Elden-Ring-Challenge"). */
export function gameInText(text: string, library: string[] = libraryNames()): string | null {
  const s = " " + norm(text.replace(/[-–]/g, " ")).replace(/[?!.,;:]/g, " ") + " ";
  let best: string | null = null;
  const consider = (name: string, alias: string) => { if (alias.length >= 3 && s.includes(" " + alias + " ") && (!best || alias.length > best.length)) best = name; };
  for (const g of CATALOG) for (const a of g.aliases) consider(g.name, norm(a.replace(/[-–]/g, " ")));
  const fromCatalog = best;
  best = null;
  for (const n of library) consider(n, norm(n.replace(/[-–]/g, " ").replace(/[™®©:]/g, "")).replace(/\s+/g, " ").trim());
  return best ?? fromCatalog;
}

function libraryNames(): string[] {
  const c = readCache<{ items: LibraryItem[] }>("library.list");
  return (c?.data.items ?? []).filter((i) => i.kind === "game" && !i.duplicateOf).map((i) => i.name);
}

export function challengeIntent(raw: string): ChallengeIntent | null {
  const q = raw.trim().replace(/^jarvis[,:]?\s*/i, "");
  const s = q.toLowerCase();
  if (/bingo/.test(s)) return null; // "Challenge-Bingo" is the bingo's job
  const about = /\b(challenges?|herausforderung(en)?)\b/.test(s);
  if (!about && !/^(noch eine|eine andere|nochmal)\b/.test(s)) return null;
  if (/\b(schwieriger|schwerer|härter)\b/.test(s) && /\b(mach|die|diese|aktuelle|letzte)\b/.test(s)) return { kind: "harder" };
  if (/\b(leichter|einfacher)\b/.test(s) && /\b(mach|die|diese|aktuelle|letzte)\b/.test(s)) return { kind: "easier" };
  if (/^(noch eine|eine andere|nochmal|andere)\b|\b(andere|neue|weitere) challenge\b.*\?*$/.test(s) && !/\bfür\b|\bin\b/.test(s.replace(/^(noch eine|eine andere)\s+(challenge)?/, ""))) return { kind: "again" };
  let m: RegExpExecArray | null;
  if ((m = /\b(?:bewerte|bewertung)\b.*?\b([1-5])\s*(?:stern\w*|von 5)/.exec(s))) return { kind: "rate", stars: Number(m[1]) };
  if (/\b(geschafft|erledigt|fertig|abgeschlossen)\b/.test(s) && !/\b(erstell|gib|mach mir|generier|schlag)\b/.test(s)) {
    const t = /„(.+?)“|"(.+?)"/.exec(q);
    return { kind: "done", text: t ? (t[1] ?? t[2]) : null };
  }
  if (/\b(meine|offene|welche|zeig)\b.*\bchallenges\b/.test(s) && !/\b(erstell|gib|generier|mach|schlag)\b/.test(s)) return { kind: "list" };
  // A wish ("gib mir …") – or a short order naming a game, genre or difficulty ("sehr schwere Elden-Ring-Challenge").
  const wish = /\b(erstell|gib|generier|mach|schlag|würfel|hast du|brauche|will|möchte|such|ausdenk|denk)\w*/.test(s) || /^\s*(\w+\s+)?challenges?\b/.test(s) || /\bchallenge für\b/.test(s);
  if (!wish && !(gameInText(q) || GENRE_WORDS.some(([re]) => re.test(s)) || /leicht|mittel|schwer|schwierig|lustig|koop/.test(s))) return null;
  if (!wish && /^(was|wie|wo|warum|wer)\b/.test(s)) return null;

  // No \b here: in JavaScript it does not see "ü" (fünf) as a letter.
  const countWord = /(?:^|\s)(\d{1,2}|einen|eine|ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)(?=\s+(?:[\wäöüß'.-]+\s+){0,3}[\wäöüß'.-]*?(?:challenges?|herausforderung))/.exec(s);
  let count = countWord ? (NUM[countWord[1]] ?? Number(countWord[1])) : /challenges\b|herausforderungen/.test(s) ? 3 : 1;
  count = Math.max(1, Math.min(10, count || 1));
  const difficulty: Difficulty = /sehr schwer|extrem|brutal|hardcore|unmöglich/.test(s) ? "veryhard" : /mittel/.test(s) ? "medium" : /schwer|schwierig|knackig/.test(s) ? "hard" : /leicht|einfach|entspannt|chillig/.test(s) ? "easy" : /gemischt|bunt gemischt/.test(s) ? "mixed" : "mixed";
  const speed = /geschwindigkeit|speed|schnell|auf zeit|zeitlimit/.test(s);
  const category: Category | null = /erkund|entdeck/.test(s) ? "explore" : /kampf|kämpf|boss|gegner/.test(s) ? "combat" : /sammel/.test(s) ? "collect" : /\bbau|baue|bauen|kreativ/.test(s) ? "build"
    : /überleb|survival-challenge/.test(s) ? "survival" : /lustig|witzig|spaß|spass|fun/.test(s) ? "fun" : /koop|co-?op|team/.test(s) ? "team" : /geschick|speed|schnell|auf zeit|besondere/.test(s) ? "challenge" : null;
  const players = /zu dritt/.test(s) ? 3 : /zu viert/.test(s) ? 4 : /mit freunden|koop|co-?op|zu zweit|gaming-?abend|gemeinsam|team/.test(s) ? 2 : 1;
  const minM = /(\d{1,3})\s*(?:min|minuten)\b/.exec(s) ?? /(eine|1)\s*stunde/.exec(s);
  const minutes = minM ? (/stunde/.test(minM[0]) ? 60 : Number(minM[1])) : null;
  const game = gameInText(q);
  const genre = game ? null : (GENRE_WORDS.find(([re]) => re.test(s))?.[1] ?? null);
  return { kind: "make", game, genre, count, difficulty, category, minutes, noSpoiler: !/spoiler (sind )?(ok|erlaubt)|mit spoilern/.test(s), players, speed };
}

// ------------------------------------------------------------------------------------------ making

const levelsFor = (d: Difficulty): Level[] => d === "easy" ? [1] : d === "medium" ? [2] : d === "hard" ? [3] : d === "veryhard" ? [4] : [1, 2, 3, 4];

/** Texts of saved challenges (open and done) – never suggested again. */
const usedTexts = () => listKind<Challenge>("challenge").map((e) => norm(e.data.text.replace(/^.*?:\s/, "")));

export interface Made { tasks: Task[]; game: string | null; poolName: string; from: "catalog" | "genre"; notes: string[]; note?: string }

export function makeChallenges(i: Extract<ChallengeIntent, { kind: "make" }>, rnd: () => number = Math.random, extraExclude: string[] = []): Made {
  const notes: string[] = [];
  const pool = poolFor(i.game ?? "", i.genre);
  const used = new Set([...usedTexts(), ...extraExclude.map(norm)]);
  let list = usable(pool.tasks, { players: i.players, spoilers: !i.noSpoiler, exclude: [] }).filter((t) => !used.has(norm(t.text)));
  // Little time: only light and medium tasks.
  let levels = levelsFor(i.difficulty);
  if (i.minutes && i.minutes <= 30) { const short = levels.filter((l) => l <= 2); if (short.length) levels = short; else { levels = [2]; notes.push(`Für ${i.minutes} Minuten passt „${DIFFICULTY_LABEL[i.difficulty]}“ kaum – ich nehme mittlere Aufgaben.`); } }
  let byLevel = list.filter((t) => levels.includes(t.level));
  if (!byLevel.length && list.length) { notes.push(`Keine unbenutzte Aufgabe der Stufe „${DIFFICULTY_LABEL[i.difficulty]}“ mehr – ich nehme die nächstliegende.`); byLevel = list.sort((a, b) => Math.abs(a.level - levels[0]) - Math.abs(b.level - levels[0])).slice(0, Math.max(i.count * 2, 4)); }
  list = byLevel;
  if (i.category) {
    const cat = list.filter((t) => t.category === i.category || (i.category === "team" && t.team));
    if (cat.length) list = cat; else notes.push(`Für „${CATEGORY_LABEL[i.category]}“ habe ich ${pool.from === "catalog" ? `bei ${pool.name}` : "hier"} keine passende Aufgabe – ich nehme andere Kategorien.`);
  }
  const out: Task[] = [];
  const bag = [...list];
  while (out.length < i.count && bag.length) out.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
  if (out.length < i.count) notes.push(`Nur ${out.length} von ${i.count} – mehr unbenutzte passende Aufgaben gibt der Katalog gerade nicht her.`);
  return { tasks: out, game: pool.from === "catalog" ? pool.name : i.game, poolName: pool.name, from: pool.from, notes, note: pool.note };
}

// ------------------------------------------------------------------------------------------ chat

let last: { ids: string[]; intent: Extract<ChallengeIntent, { kind: "make" }> } | null = null;
export function _resetChallengeChat() { last = null; }

export interface ChallengeReply { text: string; ok: boolean | null; navigate: { label: string; path: string }[] }

const MEMORY_KEY = "pgl.challenge.toMemory";
/** Finished challenges also go into the game's memory ("Wo war ich?") – on by default, switchable on the challenges page. */
export function doneToMemory(): boolean { try { return localStorage.getItem(MEMORY_KEY) !== "0"; } catch { return true; } }
export function setDoneToMemory(on: boolean) { try { localStorage.setItem(MEMORY_KEY, on ? "1" : "0"); } catch { /* blocked */ } }

/** Marks a challenge done (and, if wanted, notes it in the game's memory). */
export function finishChallenge(e: Entry<Challenge>, now = new Date()) {
  saveEntry<Challenge>("challenge", e.id, { ...e.data, status: "done", doneAt: now.toISOString() });
  if (doneToMemory() && e.data.gameName)
    saveEntry<Memory>("memory", newId(), { gameName: e.data.gameName, at: now.toISOString(), did: `Challenge geschafft: ${e.data.text.replace(/^.*?:\s/, "")}`, imageIds: [], links: [] });
}

const nav = (label: string, path: string) => ({ label, path });
const PAGE = nav("Meine Challenges", "/play?tab=challenges");

function describe(c: Challenge) { return `${c.text}${c.level ? ` [${LEVEL_LABEL[c.level]}${c.category ? ` · ${CATEGORY_LABEL[c.category as Category] ?? c.category}` : ""}]` : ""}`; }

function save(made: Made): Entry<Challenge>[] {
  return made.tasks.map((t) => saveEntry<Challenge>("challenge", newId(), {
    text: made.game ? `${made.game}: ${t.text}` : t.text, source: made.from, gameName: made.game, status: "open", level: t.level, category: t.category, links: [],
  }));
}

export function challengeAnswer(i: ChallengeIntent, rnd: () => number = Math.random): ChallengeReply {
  const open = () => listKind<Challenge>("challenge").filter((e) => e.data.status === "open").sort((a, b) => b.updatedAt - a.updatedAt);
  switch (i.kind) {
    case "make": {
      const made = makeChallenges(i, rnd);
      if (!made.tasks.length) return { text: `Dazu habe ich gerade keine unbenutzte, passende Challenge${made.game ? ` für ${made.game}` : ""}. Probier eine andere Schwierigkeit oder Kategorie – oder leg eine eigene an.`, ok: null, navigate: [PAGE] };
      const saved = save(made);
      last = { ids: saved.map((e) => e.id), intent: i };
      const head = `JARVIS – ${saved.length === 1 ? "Challenge" : `${saved.length} Challenges`}${made.game ? ` für ${made.game}` : made.from === "genre" ? ` (${made.poolName})` : ""} · ${DIFFICULTY_LABEL[i.difficulty]}${i.minutes ? ` · ${i.minutes} Min.` : ""}${i.players > 1 ? " · mit Freunden" : ""}`;
      const lines = [head, ...saved.map((e) => "• " + describe(e.data).replace(/^.*?:\s/, ""))];
      if (i.speed) lines.push("⏱ Auf Zeit: stopp mit, wie lange du brauchst, und versuch es danach schneller.");
      if (i.minutes && i.minutes <= 30) lines.push(`Passt grob in ${i.minutes} Minuten – das ist meine Einschätzung, keine Messung.`);
      lines.push(...made.notes.map((n) => "ℹ " + n));
      if (made.note) lines.push("ℹ " + made.note);
      lines.push("", made.from === "catalog" ? `Quelle: geprüfter Aufgaben-Katalog für ${made.poolName} (derselbe wie beim Gaming-Bingo).` : `Quelle: allgemeine ${made.poolName}-Aufgaben – passen nicht zu jedem Spiel („falls das Spiel es erlaubt“).`,
        `${i.noSpoiler ? "Ohne Story-Spoiler. " : ""}Gespeichert unter „Meine Challenges“. Sag „schwieriger“, „leichter“, „noch eine“ oder „Challenge geschafft“.`);
      return { text: lines.join("\n"), ok: true, navigate: [PAGE] };
    }
    case "harder":
    case "easier":
    case "again": {
      if (!last) return { text: "Welche Challenge meinst du? Sag z. B. „Gib mir eine Minecraft-Challenge“.", ok: null, navigate: [PAGE] };
      const prev = last.ids.map((id) => getEntry<Challenge>(id)).filter((e): e is Entry<Challenge> => !!e);
      const shown = prev.map((e) => e.data.text.replace(/^.*?:\s/, ""));
      const d = i.kind === "harder" ? harder(last.intent.difficulty === "mixed" ? "medium" : last.intent.difficulty) : i.kind === "easier" ? easier(last.intent.difficulty === "mixed" ? "medium" : last.intent.difficulty) : last.intent.difficulty;
      if (i.kind !== "again" && d === last.intent.difficulty) return { text: i.kind === "harder" ? "Schwerer als „Sehr schwer“ gibt es nicht – sag „noch eine“ für eine andere." : "Leichter als „Leicht“ gibt es nicht – sag „noch eine“ für eine andere.", ok: null, navigate: [PAGE] };
      const intent = { ...last.intent, difficulty: d };
      // The previous suggestions are replaced (only those still open and unchanged).
      for (const e of prev) if (e.data.status === "open") removeEntry(e.id);
      const made = makeChallenges(intent, rnd, shown);
      if (!made.tasks.length) { last = null; return { text: `Keine weitere passende Challenge auf „${DIFFICULTY_LABEL[d]}“ übrig.`, ok: null, navigate: [PAGE] }; }
      const saved = save(made);
      last = { ids: saved.map((e) => e.id), intent };
      return { text: [`JARVIS – ${i.kind === "again" ? "neue Challenge" : `jetzt ${DIFFICULTY_LABEL[d]}`}${made.game ? ` (${made.game})` : ""}`, ...saved.map((e) => "• " + describe(e.data).replace(/^.*?:\s/, "")), ...made.notes.map((n) => "ℹ " + n), "", "Die vorherige habe ich ersetzt."].join("\n"), ok: true, navigate: [PAGE] };
    }
    case "done": {
      const list = open();
      const want = i.text ? norm(i.text) : null;
      const e = (want ? list.find((x) => norm(x.data.text).includes(want)) : null) ?? (last ? list.find((x) => last!.ids.includes(x.id)) : null) ?? (list.length === 1 ? list[0] : null);
      if (!e) return { text: list.length ? `Welche? Offen sind: ${list.slice(0, 5).map((x) => `„${x.data.text}“`).join(", ")}. Sag z. B. Challenge „${list[0].data.text.replace(/^.*?:\s/, "").slice(0, 30)}“ geschafft.` : "Du hast keine offene Challenge.", ok: null, navigate: [PAGE] };
      finishChallenge(e);
      const mem = doneToMemory() && e.data.gameName;
      return { text: `🏆 Geschafft: ${e.data.text}${mem ? `\nIm Gedächtnis von ${e.data.gameName} als erledigtes Ziel notiert (abschaltbar unter „Meine Challenges“).` : ""}\nBewerten? Sag „Bewerte die Challenge mit 4 Sternen“.`, ok: true, navigate: [PAGE] };
    }
    case "rate": {
      const all = listKind<Challenge>("challenge").sort((a, b) => b.updatedAt - a.updatedAt);
      const e = (last ? all.find((x) => last!.ids.includes(x.id)) : null) ?? all[0];
      if (!e) return { text: "Es gibt noch keine Challenge zum Bewerten.", ok: null, navigate: [PAGE] };
      saveEntry<Challenge>("challenge", e.id, { ...e.data, rating: i.stars });
      return { text: `✓ ${"★".repeat(i.stars)}${"☆".repeat(5 - i.stars)} für „${e.data.text}“.`, ok: true, navigate: [PAGE] };
    }
    case "list": {
      const list = open();
      const done = listKind<Challenge>("challenge").filter((e) => e.data.status === "done").length;
      if (!list.length) return { text: `Keine offene Challenge${done ? ` (${done} geschafft)` : ""}. Sag „Gib mir eine Challenge für …“.`, ok: true, navigate: [PAGE] };
      return { text: [`JARVIS – offene Challenges (${list.length}${done ? `, ${done} geschafft` : ""})`, ...list.slice(0, 12).map((e) => "• " + describe(e.data)), list.length > 12 ? `… und ${list.length - 12} weitere` : ""].filter(Boolean).join("\n"), ok: true, navigate: [PAGE] };
    }
  }
}
