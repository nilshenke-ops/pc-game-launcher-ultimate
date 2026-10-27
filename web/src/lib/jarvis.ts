// JARVIS Gaming – the parts that need no PC and no AI: splitting a request into steps, recognising requests that
// change the website (pages, widgets, sorting, categories, profiles) or ask about the own games, and checking whether
// something is about gaming at all. Everything here is pure (unit-tested in jarvis.test.ts); jarvis-run.ts runs it.

import { fold } from "./knowledge";
import { ALL_WIDGETS, type Layout, type WidgetConf } from "./prefs-core";
import type { LibraryItem, Profile } from "./types";

export const JARVIS_KEY = "pgl.jarvis";
export const MAX_STEPS = 5;

const VERBS = "starte|start|oeffne|offne|öffne|aktiviere|lade|stelle|stell|spiel|spiele|zeig|zeige|erstelle|erstell|mach|ordne|verschieb|verschiebe|bereite|pack|fuege|füge|stopp|stoppe|beende|leg|lege|setz|setze|wechsel|wechsle|pruef|prüfe|finde|such|suche";

/** "Öffne Discord und starte anschließend Minecraft" → two steps. "Rocket League und Minecraft" stays one (no verb after "und"). */
export function splitSteps(text: string): string[] {
  const verb = `(?=(?:${VERBS})(?![a-zäöüß]))`;
  const adverb = "(?:dann|danach|anschließend|anschliessend|im anschluss|zum schluss|als nächstes|als naechstes)";
  const parts = text
    .split(new RegExp(`\\s*(?:,|\\s+und)?\\s+${adverb}\\s*,?\\s+${verb}|\\s*(?:,|\\s+und)\\s+${verb}`, "i"))
    .map((s) => s.replace(new RegExp(`(^|\\s)${adverb}(?=\\s|$)`, "gi"), " ").replace(/\s+/g, " ").replace(/^(und|,)\s+/i, "").replace(/[.!]+$/, "").trim())
    .filter((s) => s.length > 1);
  return parts.length ? parts.slice(0, MAX_STEPS) : [text.trim()];
}

// ------------------------------------------------------------------------------------------ only gaming

const GAMING = /\b(spiel|game|zock|gaming|steam|epic|xbox|launcher|discord|obs|stream|sound|profil|bingo|challenge|quest|level|xp|fps|ruckel|lag|ping|grafik|gpu|cpu|ram|pc|controller|maus|tastatur|headset|mikro|deck|overlay|backlog|wunschliste|deal|key|mod|server|minecraft|clip|aufnahme|screenshot|turnier|team|koop|mehrspieler|multiplayer|soundboard|dashboard|startseite|widget|kategorie|favorit|bibliothek|nexus|jarvis|app|seite|design|leiste|wiki|journal)/;
const OFF = /\b(e ?mail|mail schreiben|brief|bewerbung|hausaufgabe|referat|aufsatz|steuer|excel|word dokument|powerpoint|kochen|rezept|wetter|aktie|boerse|krypto|bitcoin|politik|arzt|krankheit|medikament|diaet|abnehmen|reise buchen|flug|hotel|uebersetze|gedicht|liebesbrief|einkaufsliste|bank|ueberweis|versicherung)/;

/** Clearly outside gaming (same rule as on the PC, so the answer is the same with and without the PC). */
export const offTopic = (text: string) => { const f = fold(text).replace(/[^a-z0-9]+/g, " "); return OFF.test(f) && !GAMING.test(f); };

/** A change to the app's code (new page, new function) – never done at runtime. */
export const codeRequest = (text: string) => /\b(programmier|entwickle|quellcode|code aender|neue (funktion|seite|komponente|feature)|baue? (eine |ein )?neue[sn]? (funktion|seite|feature))/.test(fold(text));

// ------------------------------------------------------------------------------------------ website changes

export type SiteIntent =
  | { kind: "pageFor"; name: string }
  | { kind: "tidyHome" }
  | { kind: "librarySort"; sort: "recent" | "rating" | "name" | "added" }
  | { kind: "favoritesFirst" }
  | { kind: "favoritesCategory"; category: string }
  | { kind: "category"; category: string; game: string | null }
  | { kind: "profileFor"; game: string | null; next: boolean }
  | { kind: "profileDashboard"; profile: string | null }
  | { kind: "coopGames" }
  | { kind: "soundboardReady" };

const cap = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40).replace(/^./, (c) => c.toUpperCase());
/** The words after "für" as typed (umlauts kept), without filler at the end. */
function after(raw: string, word: RegExp): string | null {
  const m = word.exec(raw);
  if (!m) return null;
  const rest = raw.slice(m.index + m[0].length).replace(/\b(bitte|mal|an|ein|einrichten|anlegen|erstellen|machen)\b/gi, " ").replace(/[.!?"„“]+/g, " ").trim();
  return rest ? cap(rest) : null;
}

/** Requests that change this website (or read the own library) – handled without AI. Null = not one of these. */
export function siteIntent(raw: string): SiteIntent | null {
  const f = fold(raw).replace(/[!?.]+$/, "").trim();
  const home = /(startseite|dashboard|home|anordnung|startbildschirm)/.test(f);
  const create = /(erstell|leg|mach|bau|richte|neue)/.test(f);
  if (/(zu zweit|zu dritt|koop|co.?op|mehrspieler|multiplayer|mit freunden|zusammen spielen|splitscreen)/.test(f) && /(welche|zeig|liste|finde|was kann|gibt es|spielbar)/.test(f)) return { kind: "coopGames" };
  if (/soundboard/.test(f) && /(bereit|vorbereit|laden)/.test(f)) return { kind: "soundboardReady" };
  if (/profil/.test(f) && home && /(pass|anpass|abstimm|verknuepf|zuordn)/.test(f)) {
    const name = /profil\s+(?:„|")?([^„“"]+?)(?:“|")?\s+(?:an|$)/i.exec(raw)?.[1];
    return { kind: "profileDashboard", profile: name && !/^(mein|neue)/i.test(name) ? cap(name) : null };
  }
  if (/profil/.test(f) && create) {
    if (/(naechste|nächste)s? spiel/.test(f)) return { kind: "profileFor", game: null, next: true };
    return { kind: "profileFor", game: after(raw, /\bprofil\b.*?\b(für|fuer)\b\s*/i), next: false };
  }
  if (home && create && /\b(für|fuer)\b/.test(f)) { const name = after(raw, /\b(für|fuer)\b\s*/i); if (name) return { kind: "pageFor", name }; }
  if (home && /(uebersichtlich|übersichtlich|ordne|aufraeum|aufräum|sortier|neu anordn|ordentlich|aufgeraeumt)/.test(f) && !/(widget|uhr|notiz)\b.*(zeig|ein)/.test(f)) return { kind: "tidyHome" };
  if (/zuletzt gespielt/.test(f) && /(oben|vorne|zuerst|nach vorn|hoch)/.test(f) && !home) return { kind: "librarySort", sort: "recent" };
  if (/(spiele|bibliothek|spieleuebersicht|spieleübersicht)/.test(f) && /(uebersichtlich|übersichtlich|sortier)/.test(f)) return { kind: "librarySort", sort: /bewert/.test(f) ? "rating" : /neu/.test(f) ? "added" : /name|alphabet/.test(f) ? "name" : "recent" };
  if (/favorit/.test(f) && /(oben|vorne|zuerst|nach vorn|hoch)/.test(f) && !home) return { kind: "favoritesFirst" };
  if (/kategorie/.test(f) && create) {
    if (/(lieblings|favorit)/.test(f)) return { kind: "favoritesCategory", category: /kategorie\s+(?:namens\s+)?(?:„|")([^„“"]+)/i.exec(raw)?.[1] ?? "Lieblingsspiele" };
    const named = /kategorie\s+(?:namens\s+|mit dem namen\s+)?(?:„|")?([^„“"]+?)(?:“|")?(?:\s+(?:für|fuer|mit)\s+(.+))?$/i.exec(raw.replace(/[.!?]+$/, ""));
    if (named) return { kind: "category", category: cap(named[1].replace(/^(eine|neue|meine)\s+/i, "")), game: named[2] ? cap(named[2].replace(/\s+(an|anlegen|erstellen|hinzufuegen|hinzufügen)$/i, "")) : null };
  }
  return null;
}

// ------------------------------------------------------------------------------------------ pieces used by the steps

/** Widgets for a game's own home page (all built-in, all work with and without the PC). */
export const GAME_PAGE: WidgetConf[] = (["recent", "session", "system", "memory", "bingo", "challenges", "notes", "favorites"] as const)
  .filter((id) => ALL_WIDGETS.some((w) => w.id === id)).map((id) => ({ id, visible: true, size: id === "bingo" || id === "recent" ? "m" : "s" }));

/** Order for "übersichtlicher": visible widgets first in a fixed importance, hidden ones at the end; nothing is removed. */
const IMPORTANCE = ["status", "session", "recent", "favorites", "next", "quick", "profile", "system", "bingo", "deck", "shortcuts", "notifications", "playing", "media", "clock", "notes", "timer"];
export function tidy(l: Layout): Layout {
  const rank = (w: WidgetConf) => { const i = IMPORTANCE.indexOf(w.id); return i < 0 ? IMPORTANCE.length : i; };
  const visible = l.widgets.filter((w) => w.visible).sort((a, b) => rank(a) - rank(b));
  return { ...l, widgets: [...visible, ...l.widgets.filter((w) => !w.visible)] };
}

/** The game for "mein nächstes Spiel": backlog "Als Nächstes" with the highest priority, then "Gerade aktiv". */
export function nextGame(items: LibraryItem[]): LibraryItem | null {
  const pick = (s: string) => items.filter((i) => i.kind === "game" && i.backlog === s).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name))[0];
  return pick("next") ?? pick("playing") ?? null;
}

/** Best library match by name (whole name, then all words). */
export function findItem(items: LibraryItem[], name: string): LibraryItem | null {
  const n = fold(name).trim();
  if (!n) return null;
  return items.find((i) => fold(i.name) === n) ?? items.find((i) => fold(i.name).startsWith(n)) ?? items.find((i) => n.split(/\s+/).every((w) => fold(i.name).includes(w))) ?? null;
}

export function findProfile(list: Profile[], name: string | null): Profile | null {
  if (!list.length) return null;
  if (!name) return null;
  const n = fold(name).trim();
  return list.find((p) => fold(p.name) === n) ?? list.find((p) => fold(p.name).includes(n) || n.includes(fold(p.name))) ?? null;
}

const COOP_CAT = /(koop|co.?op|mehrspieler|multiplayer|splitscreen|split screen|lokal|online|pvp|mmo)/;
export interface CoopResult { yes: { item: LibraryItem; why: string }[]; unknown: number }
/**
 * Games for two: from the own fact check (Koop / local or online multiplayer "Ja") and from the own library categories.
 * Nothing is looked up or guessed – the rest is counted as unknown.
 */
export function coopGames(items: LibraryItem[], facts: { title?: string; game?: { gameId?: string; gameName?: string } | null; coop?: string; localMp?: string; onlineMp?: string; multiplayer?: string }[]): CoopResult {
  const yes: CoopResult["yes"] = [];
  let unknown = 0;
  for (const i of items.filter((x) => x.kind === "game")) {
    const f = facts.find((x) => x.game?.gameId === i.id || fold(x.title ?? "") === fold(i.name) || fold(x.game?.gameName ?? "") === fold(i.name));
    const factYes = f && (["coop", "localMp", "onlineMp", "multiplayer"] as const).filter((k) => f[k] === "yes");
    const cat = i.categories.find((c) => COOP_CAT.test(fold(c)));
    if (factYes && factYes.length) yes.push({ item: i, why: "fact:" + factYes.join(",") });
    else if (cat) yes.push({ item: i, why: "cat:" + cat });
    else if (!f) unknown++;
  }
  return { yes, unknown };
}
