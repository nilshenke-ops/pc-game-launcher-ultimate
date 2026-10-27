// Spiele-Infos: pure logic for releases (F12), patch notes (F13), facts and accessibility (F14/F24), "if you like this"
// (F15), editions/DLC (F16) and seasons/events (F17). Nothing here invents data – everything works on what the user
// entered or what an official source returned, and says so when something is missing. Tested in infos.test.ts.

import { norm } from "./journal-logic";

// ------------------------------------------------------------------------------------------ dates and time zones

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Offset of a time zone at an instant (ms, local minus UTC). Throws for unknown zones. */
function tzOffset(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const g = (k: string) => Number(p.find((x) => x.type === k)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a wall-clock time ("2026-11-01T19:00") in a time zone (IANA name, e.g. "America/Los_Angeles");
 * without a zone the device's own. Null for anything invalid – never a guessed time.
 */
export function zonedToUtc(local: string | null | undefined, tz?: string | null): Date | null {
  const m = WALL.exec(local ?? "");
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  if (!tz) { const x = new Date(y, mo - 1, d, h, mi); return isNaN(x.getTime()) ? null : x; }
  try {
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    const off1 = tzOffset(guess, tz);
    let utc = guess - off1;
    const off2 = tzOffset(utc, tz);
    if (off2 !== off1) utc = guess - off2; // across a daylight-saving change
    return new Date(utc);
  } catch { return null; }
}

/** Time zones offered for announcements (the game's own announcement often names one). "" = my own. */
export const TIME_ZONES = ["", "UTC", "Europe/Berlin", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Asia/Seoul", "Asia/Shanghai", "Australia/Sydney"];

/** How a time looks in a zone, with the zone's short name ("19:00 PDT"). */
export function timeIn(d: Date, tz: string | undefined, locale?: string) {
  return d.toLocaleString(locale, { timeZone: tz || undefined, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export type EventState = "upcoming" | "running" | "started" | "ended" | "unknown";

/** Season/event status. Without an end date it is only "started" – whether it still runs is not claimed. */
export function eventState(start: Date | null, end: Date | null, now = new Date()): EventState {
  if (!start) return "unknown";
  if (now < start) return "upcoming";
  if (!end) return "started";
  return now < end ? "running" : "ended";
}

/** Whole days until a date (local days; negative = past). */
export function daysUntil(d: Date, now = new Date()) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / 864e5);
}

// ------------------------------------------------------------------------------------------ F12 releases

export interface ReleaseLike { title?: unknown; date?: unknown; dateStatus?: unknown; window?: unknown }

/** A release's day (local midnight) – only with a day; "window" entries (e.g. "Q1 2027") have none. */
export function releaseDay(r: ReleaseLike): Date | null {
  if (r.dateStatus === "window" || typeof r.date !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.date);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Upcoming releases grouped by month (sorted), past ones and ones without a day kept apart. */
export function releaseGroups<T extends { data: ReleaseLike }>(list: T[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const withDay = list.map((e) => ({ e, day: releaseDay(e.data) }));
  const upcoming = withDay.filter((x) => x.day && x.day.getTime() >= today).sort((a, b) => a.day!.getTime() - b.day!.getTime());
  const months = new Map<string, T[]>();
  for (const x of upcoming) { const k = `${x.day!.getFullYear()}-${String(x.day!.getMonth() + 1).padStart(2, "0")}`; months.set(k, [...(months.get(k) ?? []), x.e]); }
  return {
    months: [...months.entries()],
    undated: withDay.filter((x) => !x.day).map((x) => x.e),
    past: withDay.filter((x) => x.day && x.day.getTime() < today).sort((a, b) => b.day!.getTime() - a.day!.getTime()).map((x) => x.e),
  };
}

// ------------------------------------------------------------------------------------------ F13 patch notes

/** Steam's BBCode (and stray HTML) → plain lines, list items kept as their own lines. The words stay unchanged. */
export function bbcodeToLines(s: string): string[] {
  const text = s
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, "")
    .replace(/\[previewyoutube[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "")
    .replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[\/?\*\]/g, "\n")
    .replace(/\[\/?(p|list|olist|h[1-6]|br|hr|table|tr|td|th|quote|code)\b[^\]]*\]/gi, "\n")
    .replace(/<br\s*\/?>|<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]{1,200}>/g, "")
    .replace(/\[\/?[a-z]{1,15}(=[^\]]*)?\]/gi, "")
    .replace(/\\\[/g, "[").replace(/\\\]/g, "]")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•–]\s+)/, "").trim()).filter((l) => l.length > 0);
}

export type PatchCat = "gameplay" | "content" | "fixes" | "technical" | "other";
export const PATCH_CATS: PatchCat[] = ["gameplay", "content", "fixes", "technical", "other"];

const KEYWORDS: [PatchCat, RegExp][] = [
  ["fixes", /\b(fix(e[sd])?|bug(s|fix)?|crash(es|ed|ing)?|issue|resolved|exploit|behoben|fehler\w*|absturz|abstürze|korrigiert|glitch)\b/i],
  ["technical", /\b(performance|fps|frame ?rate|memory|server|stabilit(y|ät)|optimi[sz]\w*|directx|dx1[12]|vulkan|driver|treiber|network|netcode|latency|latenz|anti-?cheat|loading|ladezeit\w*|shader\w*|cpu|gpu|vram|leistung|netzwerk|speicherverbrauch|ram|hdr|dlss|fsr|resolution|auflösung)\b/i],
  ["gameplay", /\b(balanc\w*|damage|schaden|nerf\w*|buff\w*|cooldown|abklingzeit|reduced|increased|decreased|adjusted|angepasst|erhöht|verringert|reduziert|health|leben|ammo|munition|movement|bewegung|recoil|rückstoß|ability|fähigkeit\w*|spread|duration|dauer|rate|spawn\w*|matchmaking|difficulty|schwierigkeit)\b/i],
  ["content", /\b(new|neue?[rsnm]?|added|hinzugefügt|introduc\w*|eingeführt|map|karte|weapon|waffe|character|charakter|mode|modus|skin\w*|cosmetic\w*|season|saison|event|quest\w*|mission\w*|level|item\w*|gegenst\w*)\b/i],
];

const HEADINGS: [PatchCat, RegExp][] = [
  ["fixes", /bug ?fix|fixes|fehlerbehebung|behoben/i],
  ["technical", /technical|technik|performance|leistung|stabilit|server|network|netzwerk|engine/i],
  ["gameplay", /gameplay|balanc|weapons?|waffen|abilit|klassen|classes|heroes|helden/i],
  ["content", /new content|neue inhalte|content|inhalt|maps?|karten|cosmetic|events?|season|saison/i],
];

function isHeading(l: string) {
  const s = l.replace(/^[\s[\]#=*–-]+|[\s[\]#=*–:-]+$/g, "");
  return s.length > 0 && s.length <= 40 && (/^\[.*\]$|^#|:$/.test(l.trim()) || (s === s.toUpperCase() && /[A-ZÄÖÜ]/.test(s)));
}

export interface PatchLine { text: string; cat: PatchCat; why: "word" | "heading" | "none" }

/**
 * Sorts each line of the original by keywords (fixes before technical before gameplay before new content); a line
 * without its own keyword takes the heading above it. The words are never changed – it is only a sorting aid.
 */
export function sortPatch(original: string): { lines: PatchLine[]; headings: string[] } {
  const raw = /\[(p|list|\*|h\d)\]/i.test(original) ? bbcodeToLines(original) : original.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•–]\s+)/, "").trim()).filter(Boolean);
  const lines: PatchLine[] = [];
  const headings: string[] = [];
  let ctx: PatchCat | null = null;
  for (const l of raw) {
    if (isHeading(l)) { headings.push(l); ctx = HEADINGS.find(([, re]) => re.test(l))?.[0] ?? null; continue; }
    const own = KEYWORDS.find(([, re]) => re.test(l))?.[0];
    // Below a clear heading ("BUG FIXES", "Gameplay") the heading wins – it is the developer's own sorting.
    if (ctx) lines.push({ text: l, cat: ctx, why: "heading" });
    else if (own) lines.push({ text: l, cat: own, why: "word" });
    else lines.push({ text: l, cat: "other", why: "none" });
  }
  return { lines, headings };
}

/** Short version made only of the original's own lines: count per area and the first lines of each. */
export function patchDigest(lines: PatchLine[], perCat = 2) {
  return PATCH_CATS.map((cat) => { const l = lines.filter((x) => x.cat === cat); return { cat, count: l.length, first: l.slice(0, perCat).map((x) => x.text) }; }).filter((x) => x.count > 0);
}

// ------------------------------------------------------------------------------------------ F14 / F24 facts

export type Tri = "unknown" | "yes" | "partial" | "no";
export const TRI: Tri[] = ["unknown", "yes", "partial", "no"];

/** Fields of the fact check (F14) – yes/partial/no/unknown each. */
export const FACT_KEYS: { key: string; label: string }[] = [
  { key: "singleplayer", label: "Einzelspieler" }, { key: "multiplayer", label: "Mehrspieler" }, { key: "crossplay", label: "Crossplay" },
  { key: "coop", label: "Koop" }, { key: "localMp", label: "Lokaler Mehrspieler (ein Bildschirm)" }, { key: "onlineMp", label: "Online-Mehrspieler" },
  { key: "offline", label: "Offline spielbar" }, { key: "controller", label: "Controller" }, { key: "cloudSaves", label: "Cloud-Speicherstände" },
  { key: "ultrawide", label: "Ultrawide (21:9)" }, { key: "mods", label: "Mods" }, { key: "accessibility", label: "Barrierefreiheits-Optionen" },
];

/** Fields of the accessibility finder (F24). */
export const ACCESS_KEYS: { key: string; label: string }[] = [
  { key: "subtitles", label: "Untertitel" }, { key: "subtitleSize", label: "Untertitel-Größe einstellbar" }, { key: "remap", label: "Tasten frei belegbar" },
  { key: "colorblind", label: "Farbenblind-Modi" }, { key: "contrast", label: "Hoher Kontrast" }, { key: "textScale", label: "Textgröße einstellbar" },
  { key: "difficulty", label: "Schwierigkeit anpassbar" }, { key: "assists", label: "Hilfen (Zielhilfe, Navigation …)" }, { key: "controllerA11y", label: "Volle Controller-Unterstützung" },
  { key: "gameSpeed", label: "Spieltempo einstellbar" }, { key: "audioCues", label: "Visuelle Hinweise für Töne" }, { key: "holdToggle", label: "Halten statt Drücken umschaltbar" },
];

/** Comparison of several games over the given fields; "missing" lists fields nobody filled in. */
export function compareFacts(entries: { title: string; data: Record<string, unknown> }[], keys: { key: string }[]) {
  const rows = keys.map((k) => ({ key: k.key, values: entries.map((e) => (TRI.includes(e.data[k.key] as Tri) ? (e.data[k.key] as Tri) : "unknown")) }));
  return { rows, allUnknown: rows.filter((r) => r.values.every((v) => v === "unknown")).map((r) => r.key), differs: rows.filter((r) => new Set(r.values).size > 1).map((r) => r.key) };
}

/** Share of filled fields (not "unknown") – shown as "x of y known". */
export function known(d: Record<string, unknown>, keys: { key: string }[]) {
  return { known: keys.filter((k) => TRI.includes(d[k.key] as Tri) && d[k.key] !== "unknown").length, of: keys.length };
}

/** Filter: every required field must be "yes" (or "partial" when allowed). */
export function meets(d: Record<string, unknown>, required: string[], allowPartial = false) {
  return required.every((k) => d[k] === "yes" || (allowPartial && d[k] === "partial"));
}

// ------------------------------------------------------------------------------------------ F15 "if you like this"

export interface Candidate {
  key: string; title: string;
  /** Own genre / feel words (from the fact check). */
  feel: string[];
  /** Library categories. */
  cats: string[];
  /** Fact-check values (yes/partial/no/unknown). */
  flags: Record<string, string>;
  platforms: string[];
  played: boolean;
  /** Price in cents, only if measured (wish list). */
  priceCents: number | null;
  where: ("library" | "wish" | "facts")[];
}

/** A visible reason; `words` are filled into {w} (fact names are translated, the user's own words are not). */
export interface Reason { text: string; words: string[]; translate?: boolean }
export interface Rec { c: Candidate; score: number; reasons: Reason[] }

const MODE_KEYS = ["coop", "localMp", "onlineMp", "singleplayer", "multiplayer", "crossplay", "offline"];

/**
 * Rule-based suggestions: shared own genre/feel words (3 points each), shared library categories (2 each), the same
 * play modes being "yes" in both (1 each, only on top of a shared word or category – "both work offline" alone does
 * not make two games similar); liked words +2, disliked words exclude. Every point has a visible reason –
 * there is no hidden model and no outside database.
 */
export function recommend(seed: Candidate, all: Candidate[], prefs: { liked: string[]; disliked: string[] }, opts: { hidePlayed?: boolean; platform?: string; budgetCents?: number | null } = {}): Rec[] {
  const n = (a: string[]) => a.map(norm);
  const liked = new Set(n(prefs.liked)), disliked = new Set(n(prefs.disliked));
  const sFeel = new Set(n(seed.feel)), sCats = new Set(n(seed.cats));
  const out: Rec[] = [];
  for (const c of all) {
    if (c.key === seed.key) continue;
    if (opts.hidePlayed && c.played) continue;
    if (opts.platform && !n(c.platforms).includes(norm(opts.platform))) continue;
    if (opts.budgetCents != null && c.priceCents != null && c.priceCents > opts.budgetCents) continue;
    const feel = n(c.feel);
    if (feel.some((f) => disliked.has(f))) continue;
    const reasons: Reason[] = [];
    let score = 0;
    const sharedFeel = c.feel.filter((f) => sFeel.has(norm(f)));
    if (sharedFeel.length) { score += 3 * sharedFeel.length; reasons.push({ text: "Gleiches Spielgefühl: {w}", words: sharedFeel }); }
    const sharedCats = c.cats.filter((x) => sCats.has(norm(x)));
    if (sharedCats.length) { score += 2 * sharedCats.length; reasons.push({ text: "Gleiche Kategorie in deiner Bibliothek: {w}", words: sharedCats }); }
    if (score === 0) continue;
    const modes = MODE_KEYS.filter((k) => seed.flags[k] === "yes" && c.flags[k] === "yes");
    if (modes.length) { score += modes.length; reasons.push({ text: "Beide laut Faktencheck: {w}", words: modes.map((k) => FACT_KEYS.find((f) => f.key === k)?.label ?? k), translate: true }); }
    const likes = c.feel.filter((f) => liked.has(norm(f)));
    if (likes.length) { score += 2 * likes.length; reasons.push({ text: "Magst du: {w}", words: likes }); }
    out.push({ c, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title));
}

/** Merges the same game from library, wish list and facts into one candidate (by normalised title). */
export function mergeCandidates(parts: Candidate[]): Candidate[] {
  const m = new Map<string, Candidate>();
  for (const p of parts) {
    const k = norm(p.title);
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...p, key: k, feel: [...p.feel], cats: [...p.cats], platforms: [...p.platforms], where: [...p.where] }); continue; }
    const uniq = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.some((y) => norm(y) === norm(x)))];
    cur.feel = uniq(cur.feel, p.feel); cur.cats = uniq(cur.cats, p.cats); cur.platforms = uniq(cur.platforms, p.platforms);
    cur.flags = { ...p.flags, ...cur.flags };
    for (const [fk, fv] of Object.entries(p.flags)) if (cur.flags[fk] === "unknown" || cur.flags[fk] == null) cur.flags[fk] = fv;
    cur.played ||= p.played;
    cur.priceCents ??= p.priceCents;
    cur.where = [...new Set([...cur.where, ...p.where])];
  }
  return [...m.values()];
}

// ------------------------------------------------------------------------------------------ F16 editions / DLC

export interface EditionRow { name?: string | null; contents?: string | null; owned?: boolean; kind?: string | null }

export const splitContents = (s: string | null | undefined) => (s ?? "").split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

/** Every content item of all editions/DLCs and which row contains it. */
export function editionMatrix(rows: EditionRow[]) {
  const items: string[] = [];
  for (const r of rows) for (const it of splitContents(r.contents)) if (!items.some((x) => norm(x) === norm(it))) items.push(it);
  return { items, has: items.map((it) => rows.map((r) => splitContents(r.contents).some((x) => norm(x) === norm(it)))) };
}

/**
 * Double purchases: for each row not owned, the contents already owned through other rows; and contents that two
 * owned rows both include (paid twice).
 */
export function duplicates(rows: EditionRow[]) {
  const owned = rows.map((r, i) => ({ r, i })).filter((x) => x.r.owned);
  const ownedItems = (except: number) => new Map(owned.filter((x) => x.i !== except).flatMap((x) => splitContents(x.r.contents).map((it) => [norm(it), x.r.name ?? ""] as [string, string])));
  const wouldDuplicate = rows.map((r, i) => ({ r, i })).filter((x) => !x.r.owned).map(({ r, i }) => {
    const have = ownedItems(i);
    const items = splitContents(r.contents).filter((it) => have.has(norm(it))).map((it) => ({ item: it, via: have.get(norm(it))! }));
    return { row: i, name: r.name ?? "", items, all: items.length > 0 && items.length === splitContents(r.contents).length };
  }).filter((x) => x.items.length > 0);
  const counts = new Map<string, string[]>();
  for (const x of owned) for (const it of splitContents(x.r.contents)) counts.set(norm(it), [...(counts.get(norm(it)) ?? []), x.r.name ?? ""]);
  const paidTwice = [...counts.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ item: k, rows: v }));
  return { wouldDuplicate, paidTwice };
}
