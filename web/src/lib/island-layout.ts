// Layout of the JARVIS island: which tiles lie on the start page and the overview, what each of them shows, and which areas sit in the
// strip at the top (and in which order). The PC keeps it (the island window and every phone see the same island); a device that may not
// change the PC's settings keeps its own copy instead. Everything that comes in is checked here – unknown things fall back to the usual.
import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

export type IslandTab = "home" | "dash" | "game" | "music" | "jarvis" | "focus" | "inbox" | "apps" | "controls" | "system" | "audio" | "pc" | "note" | "shelf" | "tools" | "world" | "lists";
/** Every area in its usual order. "home" is always there; "game" only appears while a game runs. */
export const ALL_TABS: IslandTab[] = ["home", "dash", "game", "music", "jarvis", "focus", "inbox", "apps", "controls", "audio", "system", "shelf", "pc", "note", "tools", "world", "lists"];
/** Areas added in 3.63 – off until someone switches them on. */
export const NEW_TABS: IslandTab[] = ["tools", "world", "lists"];
export const isTab = (v: unknown): v is IslandTab => typeof v === "string" && (ALL_TABS as string[]).includes(v);

export type TileType = "jarvis" | "game" | "music" | "focus" | "pc" | "calendar" | "weather" | "system" | "volume" | "network" | "battery" | "clock" | "note"
  | "dice" | "counter" | "countdown" | "checklist" | "breathe" | "stopwatch" | "links" | "devbattery";
/** How the tiles of a page are laid out: big cards (as always), a compact list, or a grid of small squares. */
export type TileView = "cards" | "list" | "grid";
export const TILE_VIEWS: { id: TileView; label: string }[] = [{ id: "cards", label: "Karten" }, { id: "list", label: "Liste" }, { id: "grid", label: "Raster" }];
export const isView = (v: unknown): v is TileView => v === "cards" || v === "list" || v === "grid";
export type OptValue = string | number | boolean;
export interface Tile { id: string; type: TileType; opts?: Record<string, OptValue> }
export interface IslandLayout { tabs?: IslandTab[]; home: Tile[]; dash: Tile[]; view?: Partial<Record<LayoutPage, TileView>> }
export type LayoutPage = "home" | "dash";

export interface OptDef {
  key: string; label: string;
  kind: "bool" | "number" | "text" | "choice";
  def: OptValue;
  min?: number; max?: number; maxLength?: number;
  choices?: { id: string; label: string }[];
  hint?: string;
}
export type TileCat = "info" | "pc" | "media" | "tools" | "fun";
export const TILE_CATS: { id: TileCat; label: string }[] = [
  { id: "info", label: "Info" }, { id: "pc", label: "PC" }, { id: "media", label: "Medien & Spiel" }, { id: "tools", label: "Werkzeuge" }, { id: "fun", label: "Spaß & Ruhe" },
];
export interface TileDef { type: TileType; label: string; hint: string; opts: OptDef[]; cat: TileCat; isNew?: boolean }

/** Time zones offered for the second clock (any other valid IANA name can be typed in, too). */
export const ZONES: { id: string; label: string }[] = [
  { id: "", label: "Hier (Gerätezeit)" }, { id: "Europe/London", label: "London" }, { id: "America/New_York", label: "New York" },
  { id: "America/Los_Angeles", label: "Los Angeles" }, { id: "Asia/Tokyo", label: "Tokio" }, { id: "Asia/Seoul", label: "Seoul" },
  { id: "Australia/Sydney", label: "Sydney" }, { id: "Asia/Dubai", label: "Dubai" }, { id: "America/Sao_Paulo", label: "São Paulo" },
];

export const TILE_DEFS: TileDef[] = [
  { type: "jarvis", cat: "info", label: "JARVIS", hint: "Stimmung und letzte Antwort, Tippen öffnet das Gespräch", opts: [{ key: "last", label: "Letzte Antwort zeigen", kind: "bool", def: true }] },
  { type: "game", cat: "media", label: "Spiel", hint: "Das laufende Spiel mit Bild und Spielzeit", opts: [{ key: "idle", label: "Auch ohne laufendes Spiel zeigen", kind: "bool", def: false }] },
  { type: "music", cat: "media", label: "Musik", hint: "Was am PC läuft, mit Albumbild und Steuerung", opts: [
    { key: "cover", label: "Albumbild als Hintergrund", kind: "bool", def: true },
    { key: "skip", label: "Zurück/Weiter zeigen", kind: "bool", def: false },
  ] },
  { type: "focus", cat: "tools", label: "Fokus-Timer", hint: "Ring mit Restzeit, Start und Pause", opts: [{ key: "minutes", label: "Minuten beim Start", kind: "number", def: 25, min: 1, max: 180 }] },
  { type: "pc", cat: "pc", label: "PC-Verbindung", hint: "Ob der PC verbunden ist – einschalten oder neu verbinden", opts: [] },
  { type: "calendar", cat: "info", label: "Kalender", hint: "Datum, Kalenderwoche und die Tage der Woche", opts: [
    { key: "kw", label: "Kalenderwoche zeigen", kind: "bool", def: true },
    { key: "week", label: "Wochentage zeigen", kind: "bool", def: true },
  ] },
  { type: "weather", cat: "info", label: "Wetter", hint: "Temperatur, Wetterlage, Höchst- und Tiefstwert (Open-Meteo, ohne Konto)", opts: [
    { key: "place", label: "Ort (leer = dein Heimatort)", kind: "text", def: "", maxLength: 60 },
    { key: "range", label: "Höchst- und Tiefstwert zeigen", kind: "bool", def: true },
  ] },
  { type: "system", cat: "pc", label: "System", hint: "CPU, GPU und Arbeitsspeicher des PCs mit Verlaufslinie", opts: [
    { key: "cpu", label: "CPU", kind: "bool", def: true }, { key: "gpu", label: "GPU", kind: "bool", def: true },
    { key: "ram", label: "Arbeitsspeicher", kind: "bool", def: true }, { key: "temp", label: "Temperaturen", kind: "bool", def: true },
  ] },
  { type: "volume", cat: "pc", label: "Lautstärke / Helligkeit", hint: "Ein Schieber für den PC", opts: [
    { key: "what", label: "Regelt", kind: "choice", def: "volume", choices: [{ id: "volume", label: "Lautstärke" }, { id: "brightness", label: "Helligkeit" }] },
  ] },
  { type: "network", cat: "pc", label: "Netzwerk", hint: "Wie schnell der PC gerade empfängt und sendet", opts: [] },
  { type: "battery", cat: "pc", label: "Akku", hint: "Akkustand des PCs (nur mit Akku)", opts: [] },
  { type: "clock", cat: "info", label: "Uhr", hint: "Uhrzeit – auch einer anderen Stadt", opts: [
    { key: "zone", label: "Zeitzone", kind: "choice", def: "", choices: ZONES },
    { key: "label", label: "Name (leer = Stadt)", kind: "text", def: "", maxLength: 24 },
    { key: "seconds", label: "Sekunden zeigen", kind: "bool", def: false },
  ] },
  { type: "note", cat: "tools", label: "Notiz", hint: "Ein kurzer Zettel, direkt in der Kachel geschrieben", opts: [{ key: "text", label: "Text", kind: "text", def: "", maxLength: 300 }] },
  // 3.63 – new kinds
  { type: "dice", cat: "fun", isNew: true, label: "Zufall", hint: "Würfeln, Münze werfen oder eine Zahl ziehen – z. B. wer anfängt", opts: [
    { key: "mode", label: "Art", kind: "choice", def: "d6", choices: [{ id: "d6", label: "Würfel (1–6)" }, { id: "d20", label: "W20 (1–20)" }, { id: "coin", label: "Münze" }, { id: "num", label: "Zahl 1 bis …" }] },
    { key: "max", label: "Höchste Zahl (bei „Zahl“)", kind: "number", def: 100, min: 2, max: 1000 },
  ] },
  { type: "counter", cat: "tools", isNew: true, label: "Zähler", hint: "Plus und Minus – für Tode, Siege, Runden oder Kills", opts: [
    { key: "name", label: "Name", kind: "text", def: "", maxLength: 24 },
    { key: "value", label: "Stand", kind: "number", def: 0, min: -99999, max: 99999 },
    { key: "step", label: "Schritt", kind: "number", def: 1, min: 1, max: 100 },
  ] },
  { type: "countdown", cat: "info", isNew: true, label: "Countdown", hint: "Tage und Stunden bis zu einem Datum – Release, Turnier, Urlaub", opts: [
    { key: "name", label: "Wofür", kind: "text", def: "", maxLength: 32 },
    { key: "date", label: "Datum (JJJJ-MM-TT)", kind: "text", def: "", maxLength: 10 },
    { key: "time", label: "Uhrzeit (HH:MM, optional)", kind: "text", def: "", maxLength: 5 },
  ] },
  { type: "checklist", cat: "tools", isNew: true, label: "Checkliste", hint: "Kurze Liste zum Abhaken, direkt in der Kachel", opts: [
    { key: "name", label: "Titel", kind: "text", def: "", maxLength: 24 },
    { key: "items", label: "Einträge (einer pro Zeile)", kind: "text", def: "", maxLength: 300 },
  ] },
  { type: "breathe", cat: "fun", isNew: true, label: "Durchatmen", hint: "Ein ruhiger Atemkreis zwischen zwei Runden", opts: [
    { key: "pattern", label: "Rhythmus", kind: "choice", def: "box", choices: [{ id: "box", label: "4-4-4-4 (Box)" }, { id: "calm", label: "4-7-8 (Beruhigen)" }, { id: "even", label: "5-5 (Gleichmäßig)" }] },
  ] },
  { type: "stopwatch", cat: "tools", isNew: true, label: "Stoppuhr", hint: "Starten, anhalten, Runden – dieselbe Stoppuhr wie im Bereich Fokus", opts: [] },
  { type: "links", cat: "tools", isNew: true, label: "Schnell-Links", hint: "Bis zu drei Webseiten mit einem Tipp öffnen", opts: [
    { key: "a", label: "Link 1 (https://…)", kind: "text", def: "", maxLength: 200 },
    { key: "b", label: "Link 2 (https://…)", kind: "text", def: "", maxLength: 200 },
    { key: "c", label: "Link 3 (https://…)", kind: "text", def: "", maxLength: 200 },
  ] },
  { type: "devbattery", cat: "info", isNew: true, label: "Akku dieses Geräts", hint: "Akkustand von Handy, Tablet oder Laptop, auf dem die Insel gerade offen ist", opts: [] },
];
export const tileDef = (type: TileType): TileDef => TILE_DEFS.find((d) => d.type === type)!;
const isType = (v: unknown): v is TileType => TILE_DEFS.some((d) => d.type === v);

export const MAX_TILES: Record<LayoutPage, number> = { home: 8, dash: 12 };
const ID_RX = /^[a-z0-9]{1,16}$/;

/** The value of an option: what the tile says if it is valid, else the default. */
export function opt<T extends OptValue>(tile: Tile, key: string): T {
  const d = tileDef(tile.type).opts.find((o) => o.key === key);
  const v = tile.opts?.[key];
  return (d && v !== undefined && validOpt(d, v) ? v : d?.def) as T;
}

function validOpt(d: OptDef, v: unknown): v is OptValue {
  if (d.kind === "bool") return typeof v === "boolean";
  if (d.kind === "number") return typeof v === "number" && Number.isFinite(v) && v >= (d.min ?? -Infinity) && v <= (d.max ?? Infinity);
  if (d.kind === "choice") return typeof v === "string" && (d.key === "zone" ? v === "" || validZone(v) : !!d.choices?.some((c) => c.id === v));
  return typeof v === "string" && v.length <= (d.maxLength ?? 200);
}

/** A time zone the browser knows (so "Mars/Base" does not break the clock). */
export function validZone(z: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z_+-]+){0,2}$/.test(z)) return false;
  try { new Intl.DateTimeFormat("de-DE", { timeZone: z }); return true; } catch { return false; }
}

let seq = 0;
export const newTileId = () => (Date.now().toString(36) + (seq++).toString(36)).slice(-12);
export const makeTile = (type: TileType): Tile => ({ id: newTileId(), type });

const cleanTile = (v: unknown): Tile | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !ID_RX.test(o.id) || !isType(o.type)) return null;
  const opts: Record<string, OptValue> = {};
  if (o.opts && typeof o.opts === "object") {
    for (const d of tileDef(o.type).opts) {
      const val = (o.opts as Record<string, unknown>)[d.key];
      if (val !== undefined && validOpt(d, val)) opts[d.key] = val;
    }
  }
  return Object.keys(opts).length ? { id: o.id, type: o.type, opts } : { id: o.id, type: o.type };
};
const cleanTiles = (v: unknown, max: number): Tile[] | null => {
  if (!Array.isArray(v)) return null;
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const x of v) { const t = cleanTile(x); if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); } if (out.length >= max) break; }
  return out;
};

/** The island as it always was: on the start page JARVIS, the running game, music and focus (the last two only if switched on). */
export function defaultLayout(widgets: string[] = ["music", "focus"]): IslandLayout {
  const home: Tile[] = [{ id: "hjarvis", type: "jarvis" }, { id: "hgame", type: "game" }];
  if (widgets.includes("music")) home.push({ id: "hmusic", type: "music" });
  if (widgets.includes("focus")) home.push({ id: "hfocus", type: "focus" });
  return { home, dash: [{ id: "dcal", type: "calendar" }, { id: "dfocus", type: "focus" }, { id: "dweather", type: "weather" }, { id: "dsys", type: "system" }] };
}

/** Checks a saved layout; null when there is none (or nothing usable). */
export function cleanLayout(v: unknown): IslandLayout | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const home = cleanTiles(o.home, MAX_TILES.home), dash = cleanTiles(o.dash, MAX_TILES.dash);
  if (!home && !dash && !Array.isArray(o.tabs)) return null;
  const base = defaultLayout();
  const out: IslandLayout = { home: home ?? base.home, dash: dash ?? base.dash };
  if (o.view && typeof o.view === "object" && !Array.isArray(o.view)) {
    const vw = o.view as Record<string, unknown>, view: Partial<Record<LayoutPage, TileView>> = {};
    if (isView(vw.home)) view.home = vw.home;
    if (isView(vw.dash)) view.dash = vw.dash;
    if (Object.keys(view).length) out.view = view;
  }
  if (Array.isArray(o.tabs)) {
    const tabs = [...new Set(o.tabs.filter(isTab))];
    if (!tabs.includes("home")) tabs.unshift("home");
    out.tabs = tabs;
  }
  return out;
}

/** The areas in the strip: the person's own choice and order, or (without one) the usual set from the widget switches. */
export function tabsOf(layout: IslandLayout | null, fallback: IslandTab[], gameRunning: boolean): IslandTab[] {
  if (!layout?.tabs) return fallback;
  const list = layout.tabs.filter((t) => t !== "game" || gameRunning);
  // A running game always gets its area (right after the start page) unless it was switched off on purpose.
  return list;
}

// ------------------------------------------------------------------ editing (pure, so they can be tested)
export function addTile(l: IslandLayout, page: LayoutPage, type: TileType): IslandLayout {
  if (l[page].length >= MAX_TILES[page]) return l;
  return { ...l, [page]: [...l[page], makeTile(type)] };
}
export function removeTile(l: IslandLayout, page: LayoutPage, id: string): IslandLayout {
  return { ...l, [page]: l[page].filter((t) => t.id !== id) };
}
export function moveTile(l: IslandLayout, page: LayoutPage, id: string, by: -1 | 1): IslandLayout {
  const list = [...l[page]];
  const i = list.findIndex((t) => t.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return l;
  [list[i], list[j]] = [list[j], list[i]];
  return { ...l, [page]: list };
}
export function setTileOpt(l: IslandLayout, page: LayoutPage, id: string, key: string, value: OptValue): IslandLayout {
  return { ...l, [page]: l[page].map((t) => (t.id === id ? cleanTile({ ...t, opts: { ...t.opts, [key]: value } }) ?? t : t)) };
}
export function setTabs(l: IslandLayout, tabs: IslandTab[]): IslandLayout {
  const list = [...new Set(tabs.filter(isTab))];
  if (!list.includes("home")) list.unshift("home");
  return { ...l, tabs: list };
}
export const viewOf = (l: IslandLayout, page: LayoutPage): TileView => l.view?.[page] ?? "cards";
export function setView(l: IslandLayout, page: LayoutPage, v: TileView): IslandLayout {
  const view = { ...l.view, [page]: v };
  if (v === "cards") delete view[page];
  return { ...l, view: Object.keys(view).length ? view : undefined };
}

/** Sorting the tiles of a page: by name, by kind (category, then name), or simply the other way round. */
export type TileSort = "az" | "za" | "cat" | "reverse";
export function sortTiles(l: IslandLayout, page: LayoutPage, how: TileSort, label: (t: TileType) => string = (x) => tileDef(x).label): IslandLayout {
  const list = [...l[page]];
  const cmp = (a: Tile, b: Tile) => label(a.type).localeCompare(label(b.type), "de");
  const catIx = (x: TileType) => TILE_CATS.findIndex((c) => c.id === tileDef(x).cat);
  if (how === "az") list.sort(cmp);
  else if (how === "za") list.sort((a, b) => cmp(b, a));
  else if (how === "cat") list.sort((a, b) => catIx(a.type) - catIx(b.type) || cmp(a, b));
  else list.reverse();
  return { ...l, [page]: list };
}

/** Sorting the areas: the usual order or by name. "Home" always stays first. */
export function sortTabs(tabs: IslandTab[], how: "usual" | "az", label: (t: IslandTab) => string): IslandTab[] {
  const rest = tabs.filter((x) => x !== "home");
  if (how === "usual") rest.sort((a, b) => ALL_TABS.indexOf(a) - ALL_TABS.indexOf(b));
  else rest.sort((a, b) => label(a).localeCompare(label(b), "de"));
  return ["home", ...rest];
}

/** The catalog of tiles: filter by category and words, sorted by name, kind or "new first". */
export function catalog(filter: { cat?: TileCat | "all" | "new"; query?: string; sort?: "cat" | "az" | "new" }, label: (d: TileDef) => string = (d) => d.label, hint: (d: TileDef) => string = (d) => d.hint): TileDef[] {
  const q = (filter.query ?? "").trim().toLowerCase();
  let list = TILE_DEFS.filter((d) => !filter.cat || filter.cat === "all" || (filter.cat === "new" ? d.isNew : d.cat === filter.cat));
  if (q) list = list.filter((d) => (label(d) + " " + hint(d)).toLowerCase().includes(q));
  const cmp = (a: TileDef, b: TileDef) => label(a).localeCompare(label(b), "de");
  const catIx = (d: TileDef) => TILE_CATS.findIndex((c) => c.id === d.cat);
  if (filter.sort === "az") list = [...list].sort(cmp);
  else if (filter.sort === "new") list = [...list].sort((a, b) => Number(!!b.isNew) - Number(!!a.isNew) || cmp(a, b));
  else list = [...list].sort((a, b) => catIx(a) - catIx(b) || cmp(a, b));
  return list;
}

export function moveTab(tabs: IslandTab[], tab: IslandTab, by: -1 | 1): IslandTab[] {
  const list = [...tabs];
  const i = list.indexOf(tab), j = i + by;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

// ------------------------------------------------------------------ this device's copy
// What the PC said last (so the island looks right at once, before the PC answers) and – on a device that may not change the PC's
// settings – the device's own layout.
const CACHE = "pgl.island.layout", OWN = "pgl.island.layout.own";
type Snap = { cached: IslandLayout | null; own: IslandLayout | null };
let snap: Snap = { cached: cleanLayout(readJson(CACHE)), own: cleanLayout(readJson(OWN)) };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function cacheLayout(l: IslandLayout | null) {
  if (JSON.stringify(l) === JSON.stringify(snap.cached)) return;
  snap = { ...snap, cached: l };
  try { writeJson(CACHE, l); } catch { /* storage blocked */ }
  emit();
}
export function setOwnLayout(l: IslandLayout | null) {
  snap = { ...snap, own: l };
  try { writeJson(OWN, l); } catch { /* storage blocked */ }
  emit();
}
if (typeof window !== "undefined") window.addEventListener("storage", (e) => {
  if (e.key === CACHE || e.key === OWN) { snap = { cached: cleanLayout(readJson(CACHE)), own: cleanLayout(readJson(OWN)) }; emit(); }
});
export function useLayoutStore(): Snap {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap, () => snap);
}
