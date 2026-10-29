// JARVIS looks things up that nobody taught him: open knowledge sources with an official interface (MediaWiki API) –
// the game's own wiki first (Minecraft, Terraria, Stardew Valley, Elden Ring), then Wikipedia (German, then English).
// No search engine is scraped and no site that forbids automated access is used. Only the search term leaves the
// device. The first time JARVIS asks before going online ("Ja" / "Immer erlauben" / "Nein"). What he finds is kept
// with its source on the page "JARVIS-Wissen (nachgeschlagen)" and answered from there next time.

import { gameInText } from "./challenge-chat";
import { findLearned, learnedKey, noteOpenQuestion, saveLearned, type Learned } from "./jarvis-memory";
import { readJson, writeJson } from "./rpc";

export interface Source { name: string; api: string; page: (title: string) => string; lang: "de" | "en"; extracts: boolean }

const wiki = (name: string, api: string, base: string, lang: "de" | "en", extracts = true): Source =>
  ({ name, api, lang, extracts, page: (t) => base + encodeURIComponent(t.replace(/ /g, "_")) });

/** Official or community wikis of games, checked to answer with CORS (works on iPhone/iPad without the PC). */
export const GAME_WIKIS: Record<string, Source> = {
  "Minecraft": wiki("Minecraft Wiki", "https://de.minecraft.wiki/api.php", "https://de.minecraft.wiki/w/", "de"),
  "Terraria": wiki("Terraria Wiki (offiziell)", "https://terraria.wiki.gg/api.php", "https://terraria.wiki.gg/wiki/", "en"),
  "Stardew Valley": wiki("Stardew Valley Wiki (offiziell)", "https://stardewvalleywiki.com/mediawiki/api.php", "https://stardewvalleywiki.com/", "en"),
  "Elden Ring": wiki("Elden Ring Wiki (Fandom)", "https://eldenring.fandom.com/api.php", "https://eldenring.fandom.com/wiki/", "en", false),
};
const WIKIPEDIA = (lang: "de" | "en") => wiki(`Wikipedia (${lang === "de" ? "deutsch" : "englisch"})`, `https://${lang}.wikipedia.org/w/api.php`, `https://${lang}.wikipedia.org/wiki/`, lang);

// ------------------------------------------------------------------ understanding the question

export type LookupIntent = { kind: "explicit" | "question"; topic: string; game: string | null; raw: string };

const STOP = new Set(["der", "die", "das", "ein", "eine", "einen", "einem", "einer", "den", "dem", "des", "im", "in", "bei", "von", "vom", "zu", "zum", "zur", "und", "oder", "ist", "sind", "war", "mir", "mal", "bitte", "eigentlich", "genau", "the", "a", "an", "of"]);

/** "Was ist ein Creeper in Minecraft?" → topic "Creeper", game "Minecraft". */
export function topicOf(raw: string, game: string | null): string {
  let s = raw.trim().replace(/^jarvis[,:]?\s*/i, "").replace(/[?!.]+$/, "");
  s = s.replace(/^(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki|nach)\s*(?:nach\s+)?/i, "")
    .replace(/^(?:wikipedia|wiki|nachschlagen)\s*[:\-]?\s*/i, "")
    .replace(/^(?:was|wer|wo|wann|wie|welche[rsn]?|warum|wieso|weshalb)\s+(?:ist|sind|war|waren|macht|bedeutet|heißt|heisst|bewirkt|kann|können|gibt es|genau|eigentlich)?\s*/i, "")
    .replace(/^(?:erkläre?|erklär|beschreibe?)\s+(?:mir\s+)?(?:mal\s+)?(?:was\s+)?/i, "")
    .replace(/\s+(?:ist|sind|bedeutet|macht|heißt)$/i, "");
  if (game) s = s.replace(new RegExp(`\\s*(?:\\b(?:in|bei|aus|im spiel)\\s+)?${game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]+")}`, "i"), " ");
  return s.split(/\s+/).filter((w, i) => w && !(i === 0 && STOP.has(w.toLowerCase()))).join(" ").replace(/^(?:der|die|das|ein|eine|einen)\s+/i, "").trim();
}

export function lookupIntent(raw: string): LookupIntent | null {
  const q = raw.trim();
  const explicit = /^(?:jarvis[,:]?\s*)?(?:such|schau|guck|sieh)\w*\s+(?:mal\s+)?(?:im internet|online|im web|in der wikipedia|bei wikipedia|im wiki)\b|^(?:jarvis[,:]?\s*)?(?:wikipedia|wiki|nachschlagen)\s*[:\-]/i.test(q);
  const question = /^(?:jarvis[,:]?\s*)?(?:was|wer|wo|wann|welche[rsn]?|warum|wieso|weshalb)\s+(?:ist|sind|war|waren|bedeutet|macht|heißt|heisst|bewirkt)\b|^(?:jarvis[,:]?\s*)?(?:erkläre?|erklär|beschreibe?)\s+(?:mir\s+)?/i.test(q);
  if (!explicit && !question) return null;
  const game = gameInText(q);
  const topic = topicOf(q, game);
  if (topic.length < 2 || topic.length > 80) return null;
  return { kind: explicit ? "explicit" : "question", topic, game, raw: q };
}

// ------------------------------------------------------------------ permission

const KEY = "pgl.jarvis.web";
export type WebPermission = "ask" | "always" | "never";
export const webPermission = (): WebPermission => { const v = readJson<string>(KEY); return v === "always" || v === "never" ? v : "ask"; };
export const setWebPermission = (v: WebPermission) => writeJson(KEY, v === "ask" ? null : v);

// ------------------------------------------------------------------ looking up

export interface Found { title: string; text: string; url: string; source: string; lang: "de" | "en" }
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9äöüß]+/).filter((w) => w.length >= 3 && !STOP.has(w));
/** The hit must really be about the topic: every important word of the topic appears in its title. */
export function relevant(topic: string, title: string): boolean {
  const t = words(title).join(" ");
  const need = words(topic);
  return need.length > 0 && need.every((w) => t.includes(w) || (w.length > 5 && t.includes(w.slice(0, -2))));
}
const strip = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();

async function getJson(f: Fetch, url: string, ms = 6000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await f(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function ask(src: Source, topic: string, f: Fetch, context: string | null): Promise<Found | null> {
  const q = context ? `${topic} ${context}` : topic;
  const search = await getJson(f, `${src.api}?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&srprop=snippet&format=json&origin=*`) as { query?: { search?: { title: string; snippet: string }[] } };
  const hit = (search.query?.search ?? []).find((h) => relevant(topic, h.title));
  if (!hit) return null;
  let text = strip(hit.snippet);
  if (src.extracts) {
    const ex = await getJson(f, `${src.api}?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=3&redirects=1&titles=${encodeURIComponent(hit.title)}&format=json&origin=*`) as { query?: { pages?: Record<string, { extract?: string }> } };
    const e = Object.values(ex.query?.pages ?? {})[0]?.extract?.trim();
    if (e) text = e;
  }
  if (text.length < 20) return null;
  return { title: hit.title, text: text.length > 600 ? text.slice(0, 597).replace(/\s\S*$/, "") + " …" : text, url: src.page(hit.title), source: src.name, lang: src.lang };
}

/** Game wiki first, then Wikipedia de/en. Returns what was found and which sources were asked. */
export async function lookup(topic: string, game: string | null, f: Fetch = fetch): Promise<{ found: Found | null; tried: string[]; errors: string[] }> {
  const sources: [Source, string | null][] = [];
  if (game && GAME_WIKIS[game]) sources.push([GAME_WIKIS[game], null]);
  sources.push([WIKIPEDIA("de"), game], [WIKIPEDIA("en"), game]);
  const tried: string[] = [], errors: string[] = [];
  for (const [src, ctx] of sources) {
    tried.push(src.name);
    try {
      const r = await ask(src, topic, f, ctx) ?? (ctx ? await ask(src, topic, f, null) : null);
      if (r) return { found: r, tried, errors };
    } catch (e) { errors.push(`${src.name}: ${(e as Error).name === "AbortError" ? "keine Antwort" : (e as Error).message}`); }
  }
  return { found: null, tried, errors };
}

// ------------------------------------------------------------------ chat answer

export interface LookupReply { text: string; ok: boolean | null; links: { label: string; url: string }[]; source?: string; ask?: boolean }

export function fromMemory(i: LookupIntent): Learned | undefined { return findLearned(learnedKey(i.topic, i.game)); }

export function askPermission(i: LookupIntent): LookupReply {
  return { text: `Dazu habe ich nichts eingespeichert. Darf ich im Internet nachsehen? Ich frage nur offene Wissensquellen (${i.game && GAME_WIKIS[i.game] ? `${GAME_WIKIS[i.game].name}, ` : ""}Wikipedia) – keine Suchmaschine, gesendet wird nur der Suchbegriff „${i.topic}“.`, ok: null, links: [], ask: true };
}

export function learnedReply(l: Learned): LookupReply {
  return { text: `JARVIS – ${l.title}\n${l.text}\n\nQuelle: ${l.source} (von mir nachgeschlagen am ${l.at}) – steht unter „JARVIS-Wissen“.`, ok: true, links: [{ label: `${l.source}: ${l.title}`.slice(0, 60), url: l.url }], source: l.source };
}

export async function lookupAnswer(i: LookupIntent, f: Fetch = fetch): Promise<LookupReply> {
  const r = await lookup(i.topic, i.game, f);
  if (!r.found) {
    noteOpenQuestion(i.raw);
    const why = r.errors.length === r.tried.length ? ` Die Quellen waren nicht erreichbar (${r.errors.join("; ")}).` : "";
    return { text: `Dazu habe ich in ${r.tried.join(", ")} nichts Passendes gefunden – ich erfinde keine Antwort.${why} Die Frage steht jetzt unter „JARVIS: offene Fragen“.`, ok: null, links: [] };
  }
  const x = r.found;
  saveLearned({ key: learnedKey(i.topic, i.game), title: x.title, text: x.text, source: x.source, url: x.url });
  return { text: `JARVIS – ${x.title}${i.game ? ` (${i.game})` : ""}\n${x.text}${x.lang === "en" ? "\n(Quelle auf Englisch – wörtlich übernommen, nicht übersetzt.)" : ""}\n\nQuelle: ${x.source} – gerade nachgeschlagen und unter „JARVIS-Wissen“ gemerkt.`, ok: true, links: [{ label: `${x.source}: ${x.title}`.slice(0, 60), url: x.url }], source: x.source };
}
