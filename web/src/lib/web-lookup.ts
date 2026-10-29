// JARVIS looks things up that nobody taught him – in several open knowledge sources at once, then takes the best one:
// the game's own wikis (80+ games, see knowledge-sources.ts), Wikipedia (German and English), Klexikon (simple German),
// Wikivoyage (travel), and Q&A sites with votes: Arqade for player questions ("Was ist die stärkste Waffe …"), Super User
// for PC problems, Board & Card Games for board games. With the PC online: matching YouTube videos (only
// with the user's own key) and a German summary of the found passages by the AI chosen at the PC, citing [n].
// Only official interfaces (MediaWiki API, Stack Exchange API) – no search engine is scraped, no site that forbids
// automated access is used. TikTok, Instagram and Reddit offer no allowed search interface: JARVIS opens their search
// as a link, he does not read them. Only the search term leaves the device. The first time he asks before going online
// ("Ja" / "Immer erlauben" / "Nein"). What he finds is kept with its source on "JARVIS-Wissen (nachgeschlagen)".

import { gameInText } from "./challenge-chat";
import { findLearned, learnedKey, noteOpenQuestion, saveLearned, type Learned } from "./jarvis-memory";
import { GAMES, KLEXIKON, QA_SITES, WIKIPEDIA, WIKIVOYAGE, gameMentioned, gameSources, type QaSite, type Source } from "./knowledge-sources";
import { readJson, writeJson } from "./rpc";

export type { Source } from "./knowledge-sources";

/** Game name → its wikis (for the permission text and tests). */
export const GAME_WIKIS: Record<string, Source[]> = Object.fromEntries(GAMES.map((g) => [g.name, g.wikis]));
export const wikisFor = (game: string | null): Source[] => gameSources(game)?.wikis ?? [];

// ------------------------------------------------------------------ understanding the question

export type LookupIntent = { kind: "explicit" | "question"; topic: string; game: string | null; raw: string };

const STOP = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des", "im", "in", "bei", "von", "vom", "zu", "zum", "zur", "und", "oder", "ist", "sind", "war", "mir", "mal", "bitte", "eigentlich", "genau", "man", "ich", "the", "a", "an", "of", "is", "in", "what", "which"]);

/** "Was ist ein Creeper in Minecraft?" → topic "Creeper", game "Minecraft". */
export function topicOf(raw: string, game: string | null): string {
  let s = raw.trim().replace(/^jarvis[,:]?\s*/i, "").replace(/[?!.]+$/, "");
  s = s.replace(/^(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki|nach)\s*(?:nach\s+)?/i, "")
    .replace(/^(?:wikipedia|wiki|nachschlagen)\s*[:\-]?\s*/i, "")
    .replace(/^(?:wo|wie)\s+(?:finde|bekomme|kriege|besiege|töte|craft\w*|baue|findet|bekommt|besiegt|kühle|repariere|behebe|löse)\s+(?:ich|man)\s+/i, "")
    .replace(/^welche[rsn]?\s+((?:\S+\s+){0,1}\S+)\s+gibt\s+es\s+/i, "$1 ")
    .replace(/^was\s+gibt\s+es\s+(?:über|zu|für)?\s*/i, "")
    .replace(/^(?:was\s+tun|was\s+mache\s+ich|wie\s+kann\s+(?:ich|man))\s+(?:wenn|bei|gegen)?\s*/i, "")
    .replace(/^(?:was|wer|wo|wann|wie|welche[rsn]?|warum|wieso|weshalb)\s+(?:ist|sind|war|waren|macht|bedeutet|heißt|heisst|bewirkt|kann|können|gibt es|genau|eigentlich)?\s*/i, "")
    .replace(/^(?:erkläre?|erklär|beschreibe?)\s+(?:mir\s+)?(?:mal\s+)?(?:was\s+)?/i, "")
    .replace(/\s+(?:ist|sind|bedeutet|macht|heißt)$/i, "");
  if (game) s = s.replace(new RegExp(`\\s*(?:\\b(?:in|bei|aus|für|im spiel)\\s+)?${game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+")}`, "i"), " ");
  return s.split(/\s+/).filter((w, i) => w && !(i === 0 && STOP.has(w.toLowerCase()))).join(" ").replace(/^(?:der|die|das|ein|eine|einen|den)\s+/i, "").trim();
}

/** A game (or other context) named at the end: "… in Skyrim", "… bei Hollow Knight". Names start with a capital. */
export function contextOf(raw: string): string | null {
  const m = raw.trim().replace(/[?!.]+$/, "").match(/\s(?:in|bei|für|aus)\s+((?:[A-Z0-9][\w'’:.-]*)(?:\s+[A-Z0-9][\w'’:.-]*){0,4})$/);
  if (!m) return null;
  const name = m[1].trim();
  return gameSources(name)?.name ?? name;
}

export function lookupIntent(raw: string): LookupIntent | null {
  const q = raw.trim();
  const explicit = /^(?:jarvis[,:]?\s*)?(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki)\b|^(?:jarvis[,:]?\s*)?(?:wikipedia|wiki|nachschlagen)\s*[:\-]/i.test(q);
  const question = /^(?:jarvis[,:]?\s*)?(?:was|wer|wo|wann|welche[rsn]?|warum|wieso|weshalb)\s+(?:ist|sind|war|waren|bedeutet|macht|heißt|heisst|bewirkt)\b|^(?:jarvis[,:]?\s*)?(?:erkläre?|erklär|beschreibe?)\s+(?:mir\s+)?|^(?:jarvis[,:]?\s*)?(?:wo|wie)\s+(?:finde|bekomme|kriege|besiege|töte|baue|findet|bekommt|besiegt|kühle|repariere|behebe|löse)\s+(?:ich|man)\s|^(?:jarvis[,:]?\s*)?(?:was|welche[rsn]?(?:\s+\S+){1,2})\s+gibt\s+es\s|^(?:jarvis[,:]?\s*)?(?:was\s+tun|was\s+mache\s+ich|wie\s+kann\s+(?:ich|man))\s/i.test(q);
  if (!explicit && !question) return null;
  let game = gameInText(q) ?? gameMentioned(q) ?? contextOf(q);
  let topic = topicOf(q, game);
  // "Was ist Hollow Knight?" – the game itself is the topic.
  if (topic.length < 2 && game) { topic = game; game = null; }
  if (topic.length < 2 || topic.length > 80) return null;
  return { kind: explicit ? "explicit" : "question", topic, game, raw: q };
}

/**
 * Anything JARVIS could not answer otherwise ("Ship or Burn", "Hornet Hollow Knight"): looked up as well instead of
 * "Das weiß ich nicht". Not for orders (start, open, close …) and not for long texts.
 */
export function fallbackIntent(raw: string, contextGame: string | null = null): LookupIntent | null {
  const q = raw.trim().replace(/^jarvis[,:]?\s*/i, "").replace(/[?!.]+$/, "").trim();
  if (q.length < 2 || q.length > 80 || q.split(/\s+/).length > 10) return null;
  if (/^(?:starte?|öffne|schlie(?:ß|ss)e?|beende|mach|stell|setz|spiel|zeig|leg|lösch|erstell|füg|merk|vergiss|wechsel|aktivier|deaktivier|schalt|spiele?|hallo|hi|hey|danke|ok|ja|nein)\b/i.test(q)) return null;
  if (isFeedback(q)) return null;
  let game = gameInText(q) ?? gameMentioned(q) ?? contextOf(q) ?? contextGame;
  let topic = topicOf(q, game);
  if (topic.length < 2 && game) { topic = game; game = null; }
  if (topic.length < 2) return null;
  return { kind: "question", topic, game, raw: q };
}

/**
 * A reply to the last answer, not a question to look up: "das macht keinen Sinn", "es soll mittel sein", "ich bin
 * Impostor", "passt nicht", "stimmt", "genau", "nein, anders".
 */
export function isFeedback(raw: string) {
  const q = raw.trim().toLowerCase();
  if (/^(?:das|es|passt|stimmt|genau|super|cool|toll|nice|perfekt|aber|nicht|nee|nö|doch|eher|lieber|besser|anders)\b/.test(q) && !/\?\s*$/.test(raw.trim())) return true;
  if (/\b(?:macht|ergibt) (?:noch )?(?:teilweise |oft |gar )?(?:kein(?:en)?|wenig) sinn\b|\bpasst (?:noch )?nicht\b|\bsoll(?:te)? (?:lieber |eher )?\w+ sein\b/.test(q)) return true;
  if (/^ich (?:bin|spiele|habe|hab|will|möchte|finde|meinte|meine)\b/.test(q) && !/\?\s*$/.test(raw.trim())) return true;
  return false;
}

// ------------------------------------------------------------------ permission

const KEY = "pgl.jarvis.web";
export type WebPermission = "ask" | "always" | "never";
export const webPermission = (): WebPermission => { const v = readJson<string>(KEY); return v === "always" || v === "never" ? v : "ask"; };
export const setWebPermission = (v: WebPermission) => writeJson(KEY, v === "ask" ? null : v);

/** Where answers to knowledge questions come from: sources (AI only on a tap), sources then the AI automatically, the AI directly. */
const MODE_KEY = "pgl.jarvis.answerFrom";
export type AnswerMode = "sources" | "auto" | "ai";
export const answerMode = (): AnswerMode => { const v = readJson<string>(MODE_KEY); return v === "auto" || v === "ai" ? v : "sources"; };
export const setAnswerMode = (v: AnswerMode) => writeJson(MODE_KEY, v === "sources" ? null : v);

// ------------------------------------------------------------------ words, relevance, English search terms

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s: string) => norm(s).split(/[^a-z0-9ß]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** German game words → English, for the English wikis and Arqade (prefix match, longest first). */
const GLOSSARY: [string, string][] = Object.entries({
  starkst: "strongest", best: "best", schnellst: "fastest", seltenst: "rarest", teuerst: "most expensive", gefahrlichst: "most dangerous", schwierigst: "hardest", einfachst: "easiest", leichtest: "easiest",
  waffe: "weapon", rustung: "armor", zauber: "spell", schwert: "sword", bogen: "bow", schild: "shield", axt: "axe", dolch: "dagger", hammer: "hammer", magie: "magic", trank: "potion", tranke: "potions",
  erz: "ore", diamant: "diamond", eisen: "iron", gold: "gold", endboss: "final boss", boss: "boss", gegner: "enemy", drache: "dragon", drachen: "dragons", fundort: "location", versteck: "hideout",
  rezept: "recipe", verzauber: "enchantment", fahigkeit: "skill", talent: "perk", klasse: "class", rasse: "race", begleiter: "follower", pferd: "horse", haus: "house", schatz: "treasure", schlussel: "key",
  karte: "map", aufgabe: "quest", schaden: "damage", ausrustung: "gear", skillung: "build", fahrzeug: "vehicle", auto: "car", geld: "money", ende: "ending", geheim: "secret",
  treiber: "driver", grafikkarte: "graphics card", prozessor: "cpu", arbeitsspeicher: "ram", festplatte: "hard drive", bildschirm: "monitor", tastatur: "keyboard", maus: "mouse", lufter: "fan",
  netzteil: "power supply", absturz: "crash", sturzt: "crashes", ruckel: "stutter", langsam: "slow", uberhitz: "overheating", heiss: "hot", laut: "loud", fehler: "error", startet: "start",
  installier: "install", deinstallier: "uninstall", mikrofon: "microphone", kopfhorer: "headset", lautsprecher: "speakers", ton: "sound", verbindung: "connection", internet: "internet",
  regel: "rules", wurfel: "dice", karten: "cards", zug: "turn", punkte: "points", gewinn: "win",
}).sort((a, b) => b[0].length - a[0].length);
export function toEnglish(topic: string): string {
  return topic.split(/\s+/).map((w) => {
    const n = norm(w).replace(/[^a-z0-9ß]/g, "");
    const hit = GLOSSARY.find(([de]) => n.startsWith(de));
    return hit ? hit[1] : STOP.has(n) ? "" : w;
  }).filter(Boolean).join(" ");
}

const has = (hay: string, w: string) => hay.includes(w) || (w.length > 5 && hay.includes(w.slice(0, -2)));
/** The hit must really be about the topic: every important word of the topic appears in its title. */
export function relevant(topic: string, title: string): boolean {
  const t = words(title).join(" ");
  const need = words(topic);
  return need.length > 0 && need.every((w) => has(t, w));
}
/** 0…1: how well title (counts fully) and text (counts 0.6) cover the words of the search term. */
export function score(query: string, title: string, text: string): number {
  const need = words(query);
  if (!need.length) return 0;
  const t = words(title).join(" "), x = words(text).join(" ");
  return need.reduce((sum, w) => sum + (has(t, w) ? 1 : has(x, w) ? 0.6 : 0), 0) / need.length;
}
const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 3).replace(/\s\S*$/, "") + " …" : s);

// ------------------------------------------------------------------ asking the sources

export interface Found { title: string; text: string; url: string; source: string; lang: "de" | "en"; score: number; kind: "wiki" | "wikipedia" | "qa" }
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(f: Fetch, url: string, ms = 7000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(url, { signal: ctl.signal });
    if (!r.ok) { const e = await r.json().catch(() => null) as { error_message?: string } | null; throw new Error(`HTTP ${r.status}${e?.error_message ? ` (${e.error_message})` : ""}`); }
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** First paragraphs of a page without infoboxes, tables and "For other uses" notes (wikis without TextExtracts). */
export function introFromHtml(html: string): string {
  const clean = html.replace(/<(style|script|aside|table|figure|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<div[^>]*class="[^"]*(?:hatnote|notice|dablink|navbox)[^"]*"[\s\S]*?<\/div>/gi, " ");
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1]).replace(/\[\s*\d+\s*\]/g, "").replace(/\s+([,.;:!?])/g, "$1")).filter((p) => p.length > 40 && !/^(?:for other uses|for the article|this article|not to be confused|main article)/i.test(p));
  return paras.slice(0, 2).join(" ");
}

/** The text of one page: TextExtracts where the wiki has it, else the first paragraphs from action=parse. */
async function pageText(src: Source, title: string, f: Fetch): Promise<string> {
  if (src.extracts) {
    const ex = await getJson(f, `${src.api}?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=4&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`) as { query?: { pages?: Record<string, { extract?: string }> } };
    const e = (Object.values(ex.query?.pages ?? {})[0]?.extract ?? "").replace(/^(?:for (?:the article|other uses)|this article is about|not to be confused)[^.]*\.\s*/i, "").trim();
    if (e) return e;
  }
  // No TextExtracts, or an empty extract (intro built from templates): the first paragraphs of the rendered page.
  try {
    const p = await getJson(f, `${src.api}?action=parse&page=${encodeURIComponent(title)}&prop=text&section=0&redirects=1&format=json&origin=*`) as { parse?: { text?: { "*"?: string } | string } };
    return introFromHtml(typeof p.parse?.text === "string" ? p.parse.text : p.parse?.text?.["*"] ?? "");
  } catch { return ""; }
}

/** Exact title ("Ganondorf", "Pikachu (Pokémon)") before sub-pages and longer titles ("Geralt of Rivia/Netflix series"). */
function titleRank(query: string, title: string): number {
  const q = words(query).join(" "), t = words(title.replace(/\s*\([^)]*\)$/, "")).join(" ");
  return (t === q ? 1 : 0) - (title.includes("/") ? 0.5 : 0) - Math.max(0, words(title).length - words(query).length) * 0.05;
}

/** min: a game's own wiki may hit on the title alone (Fandom search has no snippets); Wikipedia needs more. */
async function askWiki(src: Source, query: string, f: Fetch, context: string | null, min = 0.6): Promise<Found | null> {
  const q = context ? `${query} ${context}` : query;
  const search = await getJson(f, `${src.api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&srprop=snippet${src.ns !== undefined ? `&srnamespace=${src.ns}` : ""}&format=json&origin=*`) as { query?: { search?: { title: string; snippet: string }[] } };
  const hits = (search.query?.search ?? []).map((h) => ({ title: h.title, snippet: strip(h.snippet ?? ""), s: score(query, h.title, strip(h.snippet ?? "")) }));
  // The page named exactly like the topic, even when the search lists it further down (or not at all).
  if (src.ns === undefined && words(query).length <= 3 && !hits.some((h) => titleRank(query, h.title) >= 1)) hits.push({ title: query, snippet: "", s: 1 });
  const ranked = hits.filter((h) => h.s >= min).sort((a, b) => b.s + titleRank(query, b.title) - (a.s + titleRank(query, a.title)));
  for (const hit of ranked.slice(0, 3)) {
    // Search snippets of template-heavy pages are wiki code ("|Sprite HW= File:…") – no answer.
    const snippet = /\|\s*\w+\s*=|File:|\{\{|\[\[/.test(hit.snippet) ? "" : hit.snippet;
    let text = (await pageText(src, hit.title, f)) || snippet;
    // The snippet shows the place where the asked words stand – keep it when the intro does not contain them.
    if (snippet && text !== snippet && score(query, "", text) < score(query, "", snippet)) text = `${clip(text, 400)} … ${snippet} …`;
    if (text.length < 40) continue;
    const kind = src.name.startsWith("Wikipedia") ? "wikipedia" : "wiki";
    return { title: hit.title, text: clip(text, 700), url: src.page(hit.title), source: src.name, lang: src.lang, score: hit.s, kind };
  }
  return null;
}

/** Stack Exchange: matching question, then its best answer (with votes and author, CC BY-SA). Two requests. */
async function askQa(key: QaSite, query: string, context: string | null, f: Fetch): Promise<Found | null> {
  const site = QA_SITES[key];
  const q = [query, context].filter(Boolean).join(" ");
  const s = await getJson(f, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&answers=1&site=${site.site}&pagesize=5`) as { items?: { question_id: number; title: string; score: number; is_answered: boolean; tags?: string[] }[] };
  const ranked = (s.items ?? []).map((x) => ({ ...x, s: score(query, strip(x.title), "") })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s || b.score - a.score);
  const qn = ranked[0];
  if (!qn) return null;
  const a = await getJson(f, `https://api.stackexchange.com/2.3/questions/${qn.question_id}/answers?order=desc&sort=votes&site=${site.site}&filter=withbody&pagesize=1`) as { items?: { answer_id: number; score: number; is_accepted: boolean; body: string; owner?: { display_name?: string } }[] };
  const ans = a.items?.[0];
  if (!ans || ans.score < 0) return null;
  const body = strip(ans.body);
  if (body.length < 30) return null;
  const by = ans.owner?.display_name ? `Antwort von ${strip(ans.owner.display_name)}, ` : "";
  return { title: strip(qn.title), text: clip(body, 900), url: `https://${site.host}/a/${ans.answer_id}`, source: `${site.name} – ${by}${ans.score} Stimmen${ans.is_accepted ? ", akzeptiert" : ""}, CC BY-SA`, lang: "en", score: Math.min(1, qn.s + Math.min(0.2, ans.score / 50) + (ans.is_accepted ? 0.1 : 0)), kind: "qa" };
}

const OPINION = /\b(?:st(?:ä|ae)rkst|best|schnellst|seltenst|teuerst|gef(?:ä|ae)hrlichst|schwierigst|einfachst|leichtest|lohnt|sollte ich|empfiehl)/i;
const looksGaming = (s: string) => /\b(?:spiel|game|boss|waffe|level|quest|mod|build|skill|loot|craft|server|map|item|charakter|klasse)/i.test(s);
const looksPc = (s: string) => /\b(?:pc|computer|laptop|windows|treiber|grafikkarte|gpu|cpu|prozessor|ram|arbeitsspeicher|ssd|festplatte|monitor|bildschirm|tastatur|maus|headset|mikrofon|lüfter|luefter|netzteil|bios|wlan|lan|router|bluescreen|fps|ruckel|absturz|abstürz|stürzt|berhitz|nvidia|amd|intel|steam|discord|usb|bluetooth|controller)/i.test(s);
const looksBoardGame = (s: string) => /\b(?:brettspiel|kartenspiel|schach|monopoly|catan|siedler|uno|mau[- ]?mau|skat|poker|würfel|wuerfel|mensch ärgere|carcassonne|magic the gathering|yu-?gi-?oh)/i.test(s);
const looksTravel = (s: string) => /\b(?:reise|urlaub|sehenswürdig|sehenswuerdig|ausflug|städtetrip|staedtetrip|anreise|unterkunft|strand|insel)/i.test(s);
const howOrWhy = (raw: string) => /^(?:jarvis[,:]?\s*)?(?:wie|wo|welche[rsn]?|warum|wieso|weshalb|lohnt|sollte|kann ich|was tun|was mache ich)\b/i.test(raw);

/** Players' answers fit "which is best / how / where" questions – not "what is X" (that is what wikis are for). */
const wantsPlayers = (topic: string, game: string | null, raw: string) => (wikisFor(game).length > 0 || looksGaming(topic)) && (OPINION.test(topic) || howOrWhy(raw));

type Job = { name: string; run: () => Promise<Found | null>; bonus: number };
/** Which sources fit the question – game wikis, Q&A sites by topic, Klexikon/Wikivoyage by topic, always Wikipedia. */
function plan(topic: string, game: string | null, raw: string, f: Fetch): Job[] {
  const en = toEnglish(topic) || topic;
  const all = `${topic} ${raw}`;
  // "… in Rom" is a place, not a game: only a known game turns the topic sources off.
  const isGame = wikisFor(game).length > 0 || looksGaming(all);
  const jobs: Job[] = [];
  for (const src of wikisFor(game)) jobs.push({ name: src.name, run: () => askWiki(src, src.lang === "en" ? en : topic, f, null, 0.5), bonus: 0.25 });
  if (wantsPlayers(topic, game, raw)) jobs.push({ name: QA_SITES.gaming.name, run: () => askQa("gaming", en, game, f), bonus: OPINION.test(topic) ? 0.3 : 0.05 });
  if (!isGame && looksPc(all) && howOrWhy(raw)) jobs.push({ name: QA_SITES.superuser.name, run: () => askQa("superuser", en, null, f), bonus: 0.2 });
  if (looksBoardGame(all)) jobs.push({ name: QA_SITES.boardgames.name, run: () => askQa("boardgames", en, null, f), bonus: howOrWhy(raw) ? 0.2 : 0 });
  if (!isGame && looksTravel(all)) jobs.push({ name: WIKIVOYAGE.name, run: () => askWiki(WIKIVOYAGE, game ?? topic, f, null), bonus: 0.15 });
  // Simple German for everything that is not about a game.
  if (!isGame) jobs.push({ name: KLEXIKON.name, run: () => askWiki(KLEXIKON, topic, f, null, 0.8), bonus: 0.05 });
  // Wikipedia always with the game as context – else the general meaning of a word would answer a game question.
  jobs.push({ name: WIKIPEDIA("de").name, run: () => askWiki(WIKIPEDIA("de"), topic, f, game), bonus: 0.08 }, { name: WIKIPEDIA("en").name, run: () => askWiki(WIKIPEDIA("en"), en, f, game), bonus: 0 });
  return jobs;
}

/** The sources JARVIS would ask for this question (shown before he asks for permission). */
export function sourcesFor(topic: string, game: string | null, raw = ""): string[] {
  return plan(topic, game, raw, fetch).map((j) => j.name);
}

/** All sources at once; each hit is scored, the best one first. */
export async function lookup(topic: string, game: string | null, f: Fetch = fetch, raw = ""): Promise<{ found: Found | null; all: Found[]; tried: string[]; errors: string[] }> {
  const jobs = plan(topic, game, raw, f);
  const errors: string[] = [];
  const res = await Promise.all(jobs.map(async (j) => {
    try { const r = await j.run(); return r ? { ...r, score: r.score + j.bonus } : null; } catch (e) { errors.push(`${j.name}: ${(e as Error).name === "AbortError" ? "keine Antwort" : (e as Error).message}`); return null; }
  }));
  const all = res.filter((x): x is Found => !!x).sort((a, b) => b.score - a.score);
  return { found: all[0] ?? null, all, tried: jobs.map((j) => j.name), errors };
}

// ------------------------------------------------------------------ chat answer

export interface LookupReply { text: string; ok: boolean | null; links: { label: string; url: string }[]; source?: string; ask?: boolean; /** The AI really answered (not: no AI set up / error). */ aiAnswered?: boolean }
/** What JARVIS can use from the PC (when online): videos with the user's YouTube key, an AI summary of the passages. */
export interface PcHelp { call: <T>(method: string, params?: unknown) => Promise<T> }
type Summary = { answered: boolean; answer: string; best: number; provider: string; model: string };

export function fromMemory(i: LookupIntent): Learned | undefined { return findLearned(learnedKey(i.topic, i.game)); }

export function askPermission(i: LookupIntent, mode: AnswerMode = "sources"): LookupReply {
  if (mode === "ai") return { text: `Dazu habe ich nichts eingespeichert. Darf ich die KI an deinem PC fragen (z. B. das kostenlose Gemini)? Gesendet wird nur deine Frage „${i.raw}“. Die Antwort kommt dann ohne Quelle – ich markiere sie so.`, ok: null, links: [], ask: true };
  return { text: `Dazu habe ich nichts eingespeichert. Darf ich im Internet nachsehen? Ich frage mehrere offene Wissensquellen gleichzeitig (${sourcesFor(i.topic, i.game, i.raw).join(", ")}) und nehme die beste – keine Suchmaschine, gesendet wird nur der Suchbegriff „${i.topic}${i.game ? ` ${i.game}` : ""}“. Mit verbundenem PC kommen passende YouTube-Videos dazu (nur mit deinem eigenen Schlüssel); TikTok, Instagram und Reddit öffne ich dir nur als Suche.`, ok: null, links: [], ask: true };
}

export function learnedReply(l: Learned): LookupReply {
  return { text: `JARVIS – ${l.title}\n${l.text}\n\nQuelle: ${l.source} (von mir nachgeschlagen am ${l.at}) – steht unter „JARVIS-Wissen“.`, ok: true, links: [{ label: `${l.source}: ${l.title}`.slice(0, 60), url: l.url }], source: l.source };
}

/** Search pages to look at yourself – opened as links, never read by JARVIS. */
export function socialLinks(topic: string, game: string | null): { label: string; url: string }[] {
  const q = encodeURIComponent([topic, game].filter(Boolean).join(" "));
  const tag = (game ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    { label: "YouTube-Suche", url: `https://www.youtube.com/results?search_query=${q}` },
    { label: "TikTok-Suche", url: `https://www.tiktok.com/search?q=${q}` },
    { label: "Reddit-Suche", url: `https://www.reddit.com/search/?q=${q}` },
    ...(tag ? [{ label: `Instagram #${tag}`, url: `https://www.instagram.com/explore/tags/${tag}/` }] : []),
  ];
}

const sourceLabel = (x: Found) => x.source.split(" – ")[0];

export async function lookupAnswer(i: LookupIntent, f: Fetch = fetch, pc?: PcHelp): Promise<LookupReply> {
  const query = [i.topic, i.game].filter(Boolean).join(" ");
  const [r, videos] = await Promise.all([
    lookup(i.topic, i.game, f, i.raw),
    pc ? pc.call<{ configured: boolean; videos: { title: string; channel: string; url: string }[] }>("media.youtube", { query }).then((v) => (v.configured ? v.videos.slice(0, 3) : []), () => []) : Promise.resolve([]),
  ]);
  const social = socialLinks(i.topic, i.game);
  const videoLines = videos.length ? `\n\nPassende Videos (YouTube):\n${videos.map((v) => `• ${v.title} – ${v.channel}`).join("\n")}` : "";
  const videoLinks = videos.slice(0, 2).map((v) => ({ label: `▶ ${v.title}`.slice(0, 50), url: v.url }));
  if (!r.found) {
    noteOpenQuestion(i.raw);
    const why = r.errors.length === r.tried.length ? ` Die Quellen waren nicht erreichbar (${r.errors.join("; ")}).` : "";
    return { text: `Dazu habe ich in ${r.tried.join(", ")} nichts Passendes gefunden – ich erfinde keine Antwort.${why} Die Frage steht jetzt unter „JARVIS: offene Fragen“.${videoLines}\n\nSelbst nachsehen: YouTube, TikTok, Reddit${i.game ? ", Instagram" : ""} (öffne ich dir als Suche, ich lese sie nicht aus).`, ok: null, links: [...videoLinks, ...social] };
  }
  const top = r.all.slice(0, 5);
  // With the PC: a German answer written only from these passages, with [n] citations.
  let summary: Summary | null = null;
  if (pc) {
    try {
      summary = await pc.call<Summary>("assistant.summarize", { question: i.raw, passages: top.map((x) => ({ title: x.title, source: sourceLabel(x), url: x.url, text: x.text })) });
    } catch { summary = null; /* no AI at the PC (or limit reached): the best passage itself */ }
  }
  const best = summary?.answered && summary.best >= 1 && summary.best <= top.length ? top[summary.best - 1] : r.found;
  const others = top.filter((x) => x !== best);
  const list = top.map((x, n) => `[${n + 1}] ${x.source}: ${x.title}`).join("\n");
  let text: string;
  if (summary?.answered) {
    text = `JARVIS – ${i.topic}${i.game ? ` (${i.game})` : ""}\n${summary.answer}\n\nQuellen (beste: ${sourceLabel(best)}):\n${list}\n(Zusammengefasst von ${providerLabel(summary.provider)} nur aus diesen Quellen.)`;
  } else {
    const en = best.lang === "en" ? "\n(Quelle auf Englisch – wörtlich übernommen, nicht übersetzt.)" : "";
    const note = summary && !summary.answered ? "\nDie Quellen beantworten die Frage nicht direkt – das hier kommt ihr am nächsten." : "";
    text = `JARVIS – ${best.title}${i.game ? ` (${i.game})` : ""}\n${best.text}${en}${note}\n\nBeste Quelle: ${best.source}${others.length ? `\nWeitere Quellen: ${others.map((x) => `${sourceLabel(x)} („${x.title}“)`).join(", ")}` : ""}`;
  }
  text += `${videoLines}\n\n– gerade nachgeschlagen und unter „JARVIS-Wissen“ gemerkt.`;
  const saved = summary?.answered ? summary.answer.replace(/\s*\[\d+\]/g, "") : best.text;
  saveLearned({ key: learnedKey(i.topic, i.game), title: summary?.answered ? i.topic : best.title, text: saved.replace(/\s+/g, " "), source: best.source, url: best.url });
  const links = [best, ...others.slice(0, 2)].map((x) => ({ label: `${sourceLabel(x)}: ${x.title}`.slice(0, 60), url: x.url }));
  return { text, ok: true, links: [...links, ...videoLinks, ...social], source: sourceLabel(best) };
}

const providerLabel = (p: string) => ({ claude: "Claude", ollama: "deiner lokalen KI", gemini: "Gemini (kostenlos)", deepseek: "DeepSeek" } as Record<string, string>)[p.toLowerCase()] ?? p;

/** "KI fragen (ohne Quelle)": the AI at the PC answers from its own knowledge – shown as unchecked, never saved as knowledge. */
export async function aiAnswer(i: LookupIntent, pc: PcHelp): Promise<LookupReply> {
  try {
    const r = await pc.call<{ answer: string; sure: boolean; provider: string; model: string }>("assistant.freeAnswer", { question: i.raw });
    return { text: `⚠ KI-Antwort von ${providerLabel(r.provider)} – ohne Quelle, nicht nachgeprüft, kann falsch sein:\n${r.answer}${r.sure ? "" : "\n\n(Die KI ist sich selbst nicht sicher.)"}\n\nDas merke ich mir nicht als Wissen – dafür brauche ich eine Quelle.`, ok: null, links: [], source: providerLabel(r.provider), aiAnswered: true };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { text: code === "assistant-local" ? "Am PC ist noch keine KI eingerichtet. Kostenlos geht es mit einem Gemini-Schlüssel (KI-Assistent → „Kostenlose KI für JARVIS-Recherche“) oder mit Ollama auf dem PC." : `Die KI konnte nicht antworten: ${(e as Error).message}`, ok: code === "assistant-local" ? null : false, links: [] };
  }
}

