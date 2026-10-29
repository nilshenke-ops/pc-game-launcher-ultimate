// JARVIS looks things up that nobody taught him – in several open knowledge sources at once, then takes the best one:
// the game's own wikis (Minecraft, Terraria, Stardew Valley, Elden Ring, Skyrim/UESP, Fortnite, Cyberpunk, GTA,
// Palworld, Baldur's Gate 3), Wikipedia (German and English) and for game questions Arqade (Stack Exchange, answers
// by players with votes – good for "Was ist die stärkste Waffe …"). With the PC online: matching YouTube videos (only
// with the user's own key) and a German summary of the found passages by the AI chosen at the PC, citing [n].
// Only official interfaces (MediaWiki API, Stack Exchange API) – no search engine is scraped, no site that forbids
// automated access is used. TikTok, Instagram and Reddit offer no allowed search interface: JARVIS opens their search
// as a link, he does not read them. Only the search term leaves the device. The first time he asks before going online
// ("Ja" / "Immer erlauben" / "Nein"). What he finds is kept with its source on "JARVIS-Wissen (nachgeschlagen)".

import { gameInText } from "./challenge-chat";
import { findLearned, learnedKey, noteOpenQuestion, saveLearned, type Learned } from "./jarvis-memory";
import { readJson, writeJson } from "./rpc";

export interface Source { name: string; api: string; page: (title: string) => string; lang: "de" | "en"; extracts: boolean; /** Search only this namespace (UESP keeps each game in its own). */ ns?: number }

const wiki = (name: string, api: string, base: string, lang: "de" | "en", extracts = true, ns?: number): Source =>
  ({ name, api, lang, extracts, ns, page: (t) => base + encodeURIComponent(t.replace(/ /g, "_")).replace(/%3A/g, ":") });

/** Official or community wikis of games, checked to answer with CORS (works on iPhone/iPad without the PC). */
export const GAME_WIKIS: Record<string, Source[]> = {
  "Minecraft": [wiki("Minecraft Wiki", "https://de.minecraft.wiki/api.php", "https://de.minecraft.wiki/w/", "de")],
  "Terraria": [wiki("Terraria Wiki (offiziell)", "https://terraria.wiki.gg/api.php", "https://terraria.wiki.gg/wiki/", "en")],
  "Stardew Valley": [wiki("Stardew Valley Wiki (offiziell)", "https://stardewvalleywiki.com/mediawiki/api.php", "https://stardewvalleywiki.com/", "en")],
  "Elden Ring": [wiki("Elden Ring Wiki (Fandom)", "https://eldenring.fandom.com/api.php", "https://eldenring.fandom.com/wiki/", "en", false)],
  "Skyrim": [wiki("UESP (Elder Scrolls Wiki)", "https://en.uesp.net/w/api.php", "https://en.uesp.net/wiki/", "en", true, 134), wiki("Elder Scrolls Wiki (Fandom)", "https://elderscrolls.fandom.com/api.php", "https://elderscrolls.fandom.com/wiki/", "en", false)],
  "Fortnite": [wiki("Fortnite Wiki (Fandom)", "https://fortnite.fandom.com/api.php", "https://fortnite.fandom.com/wiki/", "en", false)],
  "Cyberpunk 2077": [wiki("Cyberpunk Wiki (Fandom)", "https://cyberpunk.fandom.com/api.php", "https://cyberpunk.fandom.com/wiki/", "en", false)],
  "GTA V": [wiki("GTA Wiki (Fandom)", "https://gta.fandom.com/api.php", "https://gta.fandom.com/wiki/", "en", false)],
  "Palworld": [wiki("Palworld Wiki (offiziell)", "https://palworld.wiki.gg/api.php", "https://palworld.wiki.gg/wiki/", "en")],
  "Baldur's Gate 3": [wiki("bg3.wiki", "https://bg3.wiki/w/api.php", "https://bg3.wiki/wiki/", "en", false)],
};
/** Names a player writes after "in …" that are not (yet) in the game catalog. */
const WIKI_ALIASES: Record<string, string> = { "skyrim": "Skyrim", "elder scrolls": "Skyrim", "the elder scrolls": "Skyrim", "the elder scrolls v": "Skyrim", "tes": "Skyrim", "cyberpunk": "Cyberpunk 2077", "gta": "GTA V", "gta 5": "GTA V", "gta v": "GTA V", "bg3": "Baldur's Gate 3", "baldurs gate 3": "Baldur's Gate 3" };
const WIKIPEDIA = (lang: "de" | "en") => wiki(`Wikipedia (${lang === "de" ? "deutsch" : "englisch"})`, `https://${lang}.wikipedia.org/w/api.php`, `https://${lang}.wikipedia.org/wiki/`, lang);
const ARQADE = "Arqade (Stack Exchange)";

export const wikisFor = (game: string | null): Source[] => (game ? GAME_WIKIS[game] ?? GAME_WIKIS[WIKI_ALIASES[game.toLowerCase()] ?? ""] ?? [] : []);

// ------------------------------------------------------------------ understanding the question

export type LookupIntent = { kind: "explicit" | "question"; topic: string; game: string | null; raw: string };

const STOP = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des", "im", "in", "bei", "von", "vom", "zu", "zum", "zur", "und", "oder", "ist", "sind", "war", "mir", "mal", "bitte", "eigentlich", "genau", "man", "ich", "the", "a", "an", "of", "is", "in", "what", "which"]);

/** "Was ist ein Creeper in Minecraft?" → topic "Creeper", game "Minecraft". */
export function topicOf(raw: string, game: string | null): string {
  let s = raw.trim().replace(/^jarvis[,:]?\s*/i, "").replace(/[?!.]+$/, "");
  s = s.replace(/^(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki|nach)\s*(?:nach\s+)?/i, "")
    .replace(/^(?:wikipedia|wiki|nachschlagen)\s*[:\-]?\s*/i, "")
    .replace(/^(?:wo|wie)\s+(?:finde|bekomme|kriege|besiege|töte|craft\w*|baue|findet|bekommt|besiegt)\s+(?:ich|man)\s+/i, "")
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
  return WIKI_ALIASES[name.toLowerCase()] ?? name;
}

export function lookupIntent(raw: string): LookupIntent | null {
  const q = raw.trim();
  const explicit = /^(?:jarvis[,:]?\s*)?(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki)\b|^(?:jarvis[,:]?\s*)?(?:wikipedia|wiki|nachschlagen)\s*[:\-]/i.test(q);
  const question = /^(?:jarvis[,:]?\s*)?(?:was|wer|wo|wann|welche[rsn]?|warum|wieso|weshalb)\s+(?:ist|sind|war|waren|bedeutet|macht|heißt|heisst|bewirkt)\b|^(?:jarvis[,:]?\s*)?(?:erkläre?|erklär|beschreibe?)\s+(?:mir\s+)?|^(?:jarvis[,:]?\s*)?(?:wo|wie)\s+(?:finde|bekomme|kriege|besiege|töte|baue|findet|bekommt|besiegt)\s+(?:ich|man)\s/i.test(q);
  if (!explicit && !question) return null;
  const game = gameInText(q) ?? contextOf(q);
  const topic = topicOf(q, game);
  if (topic.length < 2 || topic.length > 80) return null;
  return { kind: explicit ? "explicit" : "question", topic, game, raw: q };
}

// ------------------------------------------------------------------ permission

const KEY = "pgl.jarvis.web";
export type WebPermission = "ask" | "always" | "never";
export const webPermission = (): WebPermission => { const v = readJson<string>(KEY); return v === "always" || v === "never" ? v : "ask"; };
export const setWebPermission = (v: WebPermission) => writeJson(KEY, v === "ask" ? null : v);

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
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1]).replace(/\[\d+\]/g, "")).filter((p) => p.length > 40 && !/^(?:for other uses|this article|not to be confused|main article)/i.test(p));
  return paras.slice(0, 2).join(" ");
}

/** min: a game's own wiki may hit on the title alone (Fandom search has no snippets); Wikipedia needs more. */
async function askWiki(src: Source, query: string, f: Fetch, context: string | null, min = 0.6): Promise<Found | null> {
  const q = context ? `${query} ${context}` : query;
  const search = await getJson(f, `${src.api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&srprop=snippet${src.ns !== undefined ? `&srnamespace=${src.ns}` : ""}&format=json&origin=*`) as { query?: { search?: { title: string; snippet: string }[] } };
  const ranked = (search.query?.search ?? []).map((h) => ({ ...h, s: score(query, h.title, strip(h.snippet ?? "")) })).sort((a, b) => b.s - a.s);
  const hit = ranked[0];
  if (!hit || hit.s < min) return null;
  const snippet = strip(hit.snippet ?? "");
  let text = snippet;
  if (src.extracts) {
    const ex = await getJson(f, `${src.api}?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=4&redirects=1&titles=${encodeURIComponent(hit.title)}&format=json&origin=*`) as { query?: { pages?: Record<string, { extract?: string }> } };
    const e = Object.values(ex.query?.pages ?? {})[0]?.extract?.trim();
    if (e) text = e;
  } else {
    try {
      const p = await getJson(f, `${src.api}?action=parse&page=${encodeURIComponent(hit.title)}&prop=text&section=0&redirects=1&format=json&origin=*`) as { parse?: { text?: { "*"?: string } | string } };
      const html = typeof p.parse?.text === "string" ? p.parse.text : p.parse?.text?.["*"] ?? "";
      const intro = introFromHtml(html);
      if (intro) text = intro;
    } catch { /* the search snippet is enough */ }
  }
  // The snippet shows the place where the asked words stand – keep it when the intro does not contain them.
  if (snippet && text !== snippet && score(query, "", text) < score(query, "", snippet)) text = `${clip(text, 400)} … ${snippet} …`;
  if (text.length < 20) return null;
  const kind = src.name.startsWith("Wikipedia") ? "wikipedia" : "wiki";
  return { title: hit.title, text: clip(text, 700), url: src.page(hit.title), source: src.name, lang: src.lang, score: hit.s, kind };
}

/** Arqade: player questions with answers and votes (CC BY-SA). Two requests: matching question, then its best answer. */
async function askArqade(query: string, context: string | null, f: Fetch): Promise<Found | null> {
  const q = [query, context].filter(Boolean).join(" ");
  const s = await getJson(f, `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&answers=1&site=gaming&pagesize=5`) as { items?: { question_id: number; title: string; score: number; is_answered: boolean; tags?: string[] }[] };
  const ranked = (s.items ?? []).map((x) => ({ ...x, s: score(query, strip(x.title), "") })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s || b.score - a.score);
  const qn = ranked[0];
  if (!qn) return null;
  const a = await getJson(f, `https://api.stackexchange.com/2.3/questions/${qn.question_id}/answers?order=desc&sort=votes&site=gaming&filter=withbody&pagesize=1`) as { items?: { answer_id: number; score: number; is_accepted: boolean; body: string; owner?: { display_name?: string } }[] };
  const ans = a.items?.[0];
  if (!ans || ans.score < 0) return null;
  const body = strip(ans.body);
  if (body.length < 30) return null;
  const by = ans.owner?.display_name ? `Antwort von ${strip(ans.owner.display_name)}, ` : "";
  return { title: strip(qn.title), text: clip(body, 900), url: `https://gaming.stackexchange.com/a/${ans.answer_id}`, source: `${ARQADE} – ${by}${ans.score} Stimmen${ans.is_accepted ? ", akzeptiert" : ""}, CC BY-SA`, lang: "en", score: Math.min(1, qn.s + Math.min(0.2, ans.score / 50) + (ans.is_accepted ? 0.1 : 0)), kind: "qa" };
}

const OPINION = /\b(?:st(?:ä|ae)rkst|best|schnellst|seltenst|teuerst|gef(?:ä|ae)hrlichst|schwierigst|einfachst|leichtest|lohnt|sollte ich|empfiehl)/i;
const looksGaming = (s: string) => /\b(?:spiel|game|boss|waffe|level|quest|mod|build|skill|loot|craft|server|map|item|charakter|klasse)/i.test(s);

/** Players' answers fit "which is best / how / where" questions – not "what is X" (that is what wikis are for). */
const wantsPlayers = (topic: string, game: string | null, raw: string) => (!!game || looksGaming(topic)) && (OPINION.test(topic) || /^(?:jarvis[,:]?\s*)?(?:wie|wo|welche[rsn]?|warum|wieso|lohnt|sollte)\b/i.test(raw));

/** Sources for a question: game wikis, Arqade (game how-to/opinion questions), Wikipedia de/en. */
export function sourcesFor(topic: string, game: string | null, raw = ""): string[] {
  const g = wikisFor(game).map((s) => s.name);
  return [...g, ...(wantsPlayers(topic, game, raw) ? [ARQADE] : []), WIKIPEDIA("de").name, WIKIPEDIA("en").name];
}

/** All sources at once; each hit is scored, the best one first. */
export async function lookup(topic: string, game: string | null, f: Fetch = fetch, raw = ""): Promise<{ found: Found | null; all: Found[]; tried: string[]; errors: string[] }> {
  const en = toEnglish(topic) || topic;
  const opinion = OPINION.test(topic);
  const jobs: [string, () => Promise<Found | null>, number][] = [];
  for (const src of wikisFor(game)) jobs.push([src.name, () => askWiki(src, src.lang === "en" ? en : topic, f, null, 0.5), 0.25]);
  if (wantsPlayers(topic, game, raw)) jobs.push([ARQADE, () => askArqade(en, game, f), opinion ? 0.3 : 0.05]);
  // Wikipedia always with the game as context – else the general meaning of a word would answer a game question.
  const wp = (lang: "de" | "en") => () => askWiki(WIKIPEDIA(lang), lang === "en" ? en : topic, f, game);
  jobs.push([WIKIPEDIA("de").name, wp("de"), 0.08], [WIKIPEDIA("en").name, wp("en"), 0]);
  const tried = jobs.map((j) => j[0]);
  const errors: string[] = [];
  const res = await Promise.all(jobs.map(async ([name, run, bonus]) => {
    try { const r = await run(); return r ? { ...r, score: r.score + bonus } : null; } catch (e) { errors.push(`${name}: ${(e as Error).name === "AbortError" ? "keine Antwort" : (e as Error).message}`); return null; }
  }));
  const all = res.filter((x): x is Found => !!x).sort((a, b) => b.score - a.score);
  return { found: all[0] ?? null, all, tried, errors };
}

// ------------------------------------------------------------------ chat answer

export interface LookupReply { text: string; ok: boolean | null; links: { label: string; url: string }[]; source?: string; ask?: boolean }
/** What JARVIS can use from the PC (when online): videos with the user's YouTube key, an AI summary of the passages. */
export interface PcHelp { call: <T>(method: string, params?: unknown) => Promise<T> }
type Summary = { answered: boolean; answer: string; best: number; provider: string; model: string };

export function fromMemory(i: LookupIntent): Learned | undefined { return findLearned(learnedKey(i.topic, i.game)); }

export function askPermission(i: LookupIntent): LookupReply {
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
    text = `JARVIS – ${i.topic}${i.game ? ` (${i.game})` : ""}\n${summary.answer}\n\nQuellen (beste: ${sourceLabel(best)}):\n${list}\n(Zusammengefasst von ${summary.provider === "claude" ? "Claude" : summary.provider === "ollama" ? "deiner lokalen KI" : summary.provider} nur aus diesen Quellen.)`;
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
