// The decision before every chat answer (routing) and JARVIS' research with sources.
//
//  A knowledge   – stable knowledge ("Unterschied RAM und VRAM"): straight to the chosen AI model.
//  B research    – current or explicitly researched ("neueste Patchnotes", "Was gibt es Neues …", switch "Im Internet suchen"):
//                  a real search first – Claude's web search at the PC, else free official sources (Mojang patch notes,
//                  Steam announcements, open wikis) summarised by the AI at the PC – answer with numbered, clickable sources.
//  C notes       – the user's own gaming notes / memory: answered from the journal (game coach, JARVIS memory).
//  D function    – a website or PC function ("Starte …", "Öffne …"): only the implemented function, result checked.
//  E multi       – several steps ("… und dann …"): planned, done one by one, summarised (JARVIS pipeline).
//  clarify       – a quest/boss/build question without a recognisable game: JARVIS asks which game first.
//
// Nothing is pretended: when no search ran, the answer says so; sources are only the pages really returned.

import { gameInText } from "./challenge-chat";
import { gameMentioned, gameSources } from "./knowledge-sources";
import { readJson, writeJson } from "./rpc";
import type { AssistantReply } from "./assistant";

export type Route = { kind: "knowledge" | "research" | "notes" | "function" | "multi" | "clarify"; why: string; game: string | null; force: boolean };

const EXPLICIT = /\b(?:such(?:e|st)?|recherchier\w*|google|schau|guck|sieh)\b.{0,40}\b(?:im internet|im netz|online|im web|nach)\b|^(?:jarvis[,:]?\s*)?(?:such(?:e)?|recherchier\w*)\b|\bim internet\b|\baktuelle(?:n|s)? (?:infos?|informationen|stand)\b/i;
const CURRENT = /\b(?:neu(?:e|en|er|es|este[nmrs]?|igkeit\w*)?|news|patch\w*|patchnotes|update\w*|hotfix\w*|changelog|release\w*|erschein\w*|erscheinungs\w*|veröffentlich\w*|angekündigt|ankündigung\w*|roadmap|season\w*|saison\w*|version\w*|snapshot\w*|aktuell\w*|diese woche|letzte woche|preis\w*|angebot\w*|sale|20[2-9]\d)\b/i;
const FUNCTION = /^(?:jarvis[,:]?\s*)?(?:starte?|öffne|schlie(?:ß|ss)e?|beende|aktivier\w*|deaktivier\w*|spiel(?:e)? (?:den |die |das )?sound|stell\w*|setz\w*|leg\w* (?:an|fest)|erstell\w*|mach\w*|zeig\w*|pack\w*|lösch\w*|nimm|füg\w*|sperr\w*|wechsel\w*|schalt\w*)\b/i;
const MULTI = /\b(?:und dann|danach|anschließend|zuerst .+ dann)\b|,\s*dann\b/i;
const NOTES = /\b(?:wo war ich|meine?n? (?:notiz\w*|projekte?|ziele?|stand|fortschritt|builds?|gedächtnis)|was weißt du über mich|hast du dir gemerkt|was habe ich mir gemerkt|merk dir|meine offenen)\b/i;
const NEEDS_GAME = /\b(?:quest\w*|mission\w*|boss\w*|kapitel|level|build|skillung|walkthrough|lösung|rätsel|achievement\w*|erfolg\w*|trophäe\w*)\b/i;
/** "Erklär mir …", "Wie schaffe ich …" – a request for help, not a statement like "Ich bin gerade bei der Quest …". */
const HELP_REQUEST = /^(?:jarvis[,:]?\s*)?(?:erklär\w*|wie\b|was\b|welche\w*|hilf\w*|gib mir|zeig mir|tipps?\b|ich brauche hilfe|kannst du mir)/i;
/** A game named the app does not know yet ("in E2E Questspiel", "bei Hollow Knight") – then it is no unclear game. */
const NAMED_GAME = /\b(?:in|bei|für|aus)\s+[A-Z0-9ÄÖÜ][\w'’:.-]+/;
const MY_GAME = /\bmein(?:em|en)? (?:angegebenen |aktuellen |letzten |zuletzt gespielten )?spiel\b/i;

/** Which way a chat message goes. `force` = the switch "Im Internet suchen" is on. */
export function routeQuestion(text: string, opts: { force?: boolean; coach?: boolean } = {}): Route {
  const q = text.trim();
  // The game coach ("Ich bin in X bei …", "Was sollte ich in X als Nächstes machen?") owns its sentences – notes (C).
  if (opts.coach && !opts.force) return { kind: "notes", why: "deine gespeicherten Gaming-Notizen", game: gameInText(q) ?? null, force: false };
  const game = gameInText(q) ?? gameMentioned(q) ?? null;
  const force = !!opts.force || EXPLICIT.test(q);
  if (force && !FUNCTION.test(q.replace(/^(?:jarvis[,:]?\s*)?such\w*/i, ""))) return { kind: "research", why: opts.force ? "Schalter „Im Internet suchen“" : "ausdrücklich gewünschte Internetrecherche", game, force: true };
  if (MULTI.test(q) && FUNCTION.test(q)) return { kind: "multi", why: "mehrere Schritte", game, force: false };
  if (FUNCTION.test(q)) return { kind: "function", why: "Funktion der Website/des PCs", game, force: false };
  if (NOTES.test(q)) return { kind: "notes", why: "deine gespeicherten Gaming-Notizen", game, force: false };
  if (CURRENT.test(q) && (game || MY_GAME.test(q) || /\b(?:spiel\w*|game\w*|gaming|minecraft|steam|xbox|playstation|nintendo|switch|patch\w*)\b/i.test(q))) return { kind: "research", why: "aktuelle Information nötig", game, force: false };
  if (NEEDS_GAME.test(q) && HELP_REQUEST.test(q) && !game && !MY_GAME.test(q) && !NAMED_GAME.test(q)) return { kind: "clarify", why: "Spiel unklar", game: null, force: false };
  return { kind: "knowledge", why: "Wissensfrage – direkt an das gewählte Modell", game, force: false };
}

/** "Für welches Spiel?" – asked instead of guessing (spoiler-free once the game is known). */
export function clarifyReply(text: string, recent: string[]): AssistantReply {
  const what = text.match(NEEDS_GAME)?.[0] ?? "Frage";
  return {
    text: `Zu welchem Spiel ist die ${/^quest/i.test(what) ? "Quest" : what}? Nenn mir das Spiel (und wenn möglich den Namen der Quest oder Stelle) – ich antworte dann spoilerfrei, außer du willst ausdrücklich mehr wissen.`,
    actions: [], sources: ["JARVIS"], suggestions: recent.slice(0, 4).map((g) => `${text.replace(/[?.!]+$/, "")} in ${g}`), mode: "device",
  };
}

// ------------------------------------------------------------------ settings of this device (conveniences)

const ENGINE_KEY = "pgl.assistant.engine";
const WEB_KEY = "pgl.assistant.webSearch";
export const chosenEngine = (): string => readJson<string>(ENGINE_KEY) ?? "auto";
export const setChosenEngine = (v: string) => writeJson(ENGINE_KEY, v === "auto" ? null : v);
export const webSwitch = (): boolean => readJson<boolean>(WEB_KEY) === true;
export const setWebSwitch = (v: boolean) => writeJson(WEB_KEY, v || null);

// ------------------------------------------------------------------ research

export interface Cite { n: number; title: string; url: string; provider: string; date?: string | null; cited: boolean; quote?: string | null }
export interface ResearchInfo { searched: boolean; provider: string; searches?: number; queries?: string[]; errors: string[]; note?: string | null; others?: Cite[] }
export type ResearchReply = AssistantReply & { cites: Cite[]; research: ResearchInfo };
export type Phase = "start" | "search" | "sources" | "writing";

interface ServerResult {
  answered: boolean; answer: string | null; sources: Cite[]; others?: Cite[]; searched: boolean; searches?: number; queries?: string[]; searchErrors?: string[];
  searchProvider: string; provider: string | null; model?: string | null; costUsd?: number; note?: string | null;
  passages?: { title: string; source: string; url: string; text: string; date?: string | null }[];
}
type Pc = { call: <T>(method: string, params?: unknown) => Promise<T> };

const safeUrl = (u: string) => /^https:\/\//.test(u) ? u : "";

/** Research one question. With the PC: server search (Claude) or free sources; without: the open wikis in the browser. */
export async function research(question: string, opts: { pc: Pc | null; webSearch: boolean; route: Route; requestId: string; engine: string; onPhase?: (p: Phase, text?: string) => void; fetcher?: typeof fetch }): Promise<ResearchReply> {
  const w = await import("./web-lookup");
  let game = opts.route.game;
  if (!game && MY_GAME.test(question)) {
    const { lastPlayedGame } = await import("./game-coach");
    game = await lastPlayedGame(!!opts.pc).catch(() => null);
    if (!game) return { text: "Welches Spiel meinst du? Ich sehe gerade kein zuletzt gespieltes Spiel – nenn mir bitte den Namen.", actions: [], sources: ["JARVIS"], suggestions: [], mode: "device", cites: [], research: { searched: false, provider: "", errors: [] } };
  }
  const q = game && !question.toLowerCase().includes(game.toLowerCase()) ? `${question.replace(MY_GAME, game)}` : question;
  const engine = opts.engine.startsWith("claude") ? "claude" : opts.engine === "auto" ? "auto" : "free";
  // Claude's web search runs entirely at the PC (it decides what to search).
  if (opts.pc && opts.webSearch && engine !== "free") {
    opts.onPhase?.("start");
    const r = await opts.pc.call<ServerResult>("assistant.research", { question: q, game, force: opts.route.force, requestId: opts.requestId, engine: engine === "claude" ? "claude" : "auto" });
    return fromServer(r);
  }
  // Free sources: the open wikis from here, then the PC adds official patch notes/announcements and summarises.
  opts.onPhase?.("search");
  const intent = w.lookupIntent(q) ?? w.fallbackIntent(q) ?? { kind: "question" as const, topic: q.replace(/[?!.]+$/, ""), game, raw: q };
  const found = await w.lookup(intent.topic, intent.game ?? game, opts.fetcher ?? fetch, q).catch(() => ({ found: null, all: [] as import("./web-lookup").Found[], tried: [] as string[], errors: ["Wikis nicht erreichbar"] }));
  const passages = found.all.slice(0, 5).map((x) => ({ title: x.title, source: x.source.split(" – ")[0], url: x.url, text: x.text }));
  if (opts.pc) {
    opts.onPhase?.("sources");
    const r = await opts.pc.call<ServerResult>("assistant.research", { question: q, game, force: opts.route.force, requestId: opts.requestId, engine: "free", passages });
    return fromServer(r, found.errors);
  }
  // Without the PC: only the open wikis, the best passage word for word.
  const best = found.found;
  const cites = found.all.slice(0, 5).map((x, i) => ({ n: i + 1, title: x.title, url: safeUrl(x.url), provider: x.source.split(" – ")[0], cited: x === best }));
  const text = best
    ? `${best.text}${best.lang === "en" ? "\n(Quelle auf Englisch – wörtlich übernommen.)" : ""} [1]\n\nOhne PC habe ich nur offene Wikis durchsucht – keine Websuche, keine Nachrichtenseiten.`
    : `Ohne PC habe ich nur offene Wikis durchsucht (${found.tried.join(", ")}) und nichts Passendes gefunden – ich erfinde keine Antwort. Für eine echte Websuche den PC verbinden.`;
  return { text, actions: [], sources: best ? [best.source.split(" – ")[0]] : [], suggestions: [], mode: "device", cites: best ? [cites.find((c) => c.cited)!, ...cites.filter((c) => !c.cited)].map((c, i) => ({ ...c, n: i + 1 })) : [], research: { searched: found.tried.length > 0, provider: "offene Wikis (im Browser)", errors: found.errors } };
}

function fromServer(r: ServerResult, extraErrors: string[] = []): ResearchReply {
  const cites = (r.sources ?? []).map((c) => ({ ...c, url: safeUrl(c.url) }));
  const errors = [...(r.searchErrors ?? []), ...extraErrors];
  let text: string;
  if (r.answered && r.answer) text = r.answer;
  else if (r.passages?.length) {
    // No AI at the PC (or the sources don't answer it): the best passage itself, clearly marked.
    const p = r.passages[0];
    text = `${r.note ? r.note + "\n\n" : ""}${p.title}${p.date ? ` (${p.date})` : ""}:\n${p.text.length > 700 ? p.text.slice(0, 697) + " …" : p.text} [1]`;
    if (r.answered === false && r.provider) text = `Die gefundenen Quellen beantworten die Frage nicht direkt – am nächsten dran:\n\n${text}`;
  } else text = r.searched ? `${(r.note ?? "Ich habe gesucht, aber nichts Belastbares gefunden").replace(/\.$/, "")} – ich erfinde keine Antwort.` : "Es konnte keine Suche durchgeführt werden – deshalb keine Antwort mit Quellen.";
  if (!r.searched) text += "\n\n(Keine Internetsuche durchgeführt.)";
  else if (r.note && r.answered) text += `\n\n(${r.note})`;
  const mode: AssistantReply["mode"] = r.provider === "Claude" ? "claude" : r.provider === "Ollama" ? "ollama" : "local";
  return {
    text, actions: [], sources: [], suggestions: [], mode, model: r.model ?? r.provider ?? null, costUsd: r.costUsd ?? null,
    cites, research: { searched: r.searched, provider: r.searchProvider, searches: r.searches, queries: r.queries, errors, note: r.note, others: (r.others ?? []).map((c) => ({ ...c, url: safeUrl(c.url) })) },
  };
}

/** Text for the progress line while a request runs. */
export const phaseText = (p: Phase | null, provider?: string) => p === "start" ? `Recherche startet${provider ? ` (${provider})` : ""} …` : p === "search" ? "Suche läuft …" : p === "sources" ? "Quellen werden ausgewertet …" : p === "writing" ? "Antwort wird erstellt …" : "Antwort wird erstellt …";

export const gameOf = (name: string | null) => (name ? gameSources(name)?.name ?? name : null);
