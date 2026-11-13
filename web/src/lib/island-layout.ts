// Layout of the JARVIS island: which tiles lie on the start page and the overview, what each of them shows, and which areas sit in the
// strip at the top (and in which order). The PC keeps it (the island window and every phone see the same island); a device that may not
// change the PC's settings keeps its own copy instead. Everything that comes in is checked here – unknown things fall back to the usual.
import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

export type IslandTab = "home" | "dash" | "game" | "music" | "jarvis" | "focus" | "inbox" | "apps" | "controls" | "system" | "audio" | "pc" | "note";
/** Every area in its usual order. "home" is always there; "game" only appears while a game runs. */
export const ALL_TABS: IslandTab[] = ["home", "dash", "game", "music", "jarvis", "focus", "inbox", "apps", "controls", "audio", "system", "pc", "note"];
export const isTab = (v: unknown): v is IslandTab => typeof v === "string" && (ALL_TABS as string[]).includes(v);

export type TileType = "jarvis" | "game" | "music" | "focus" | "pc" | "calendar" | "weather" | "system" | "volume" | "network" | "battery" | "clock" | "note";
export type OptValue = string | number | boolean;
export interface Tile { id: string; type: TileType; opts?: Record<string, OptValue> }
export interface IslandLayout { tabs?: IslandTab[]; home: Tile[]; dash: Tile[] }
export type LayoutPage = "home" | "dash";

export interface OptDef {
  key: string; label: string;
  kind: "bool" | "number" | "text" | "choice";
  def: OptValue;
  min?: number; max?: number; maxLength?: number;
  choices?: { id: string; label: string }[];
  hint?: string;
}
export interface TileDef { type: TileType; label: string; hint: string; opts: OptDef[] }

/** Time zones offered for the second clock (any other valid IANA name can be typed in, too). */
export const ZONES: { id: string; label: string }[] = [
  { id: "", label: "Hier (Gerätezeit)" }, { id: "Europe/London", label: "London" }, { id: "America/New_York", label: "New York" },
  { id: "America/Los_Angeles", label: "Los Angeles" }, { id: "Asia/Tokyo", label: "Tokio" }, { id: "Asia/Seoul", label: "Seoul" },
  { id: "Australia/Sydney", label: "Sydney" }, { id: "Asia/Dubai", label: "Dubai" }, { id: "America/Sao_Paulo", label: "São Paulo" },
];

export const TILE_DEFS: TileDef[] = [
  { type: "jarvis", label: "JARVIS", hint: "Stimmung und letzte Antwort, Tippen öffnet das Gespräch", opts: [{ key: "last", label: "Letzte Antwort zeigen", kind: "bool", def: true }] },
  { type: "game", label: "Spiel", hint: "Das laufende Spiel mit Bild und Spielzeit", opts: [{ key: "idle", label: "Auch ohne laufendes Spiel zeigen", kind: "bool", def: false }] },
  { type: "music", label: "Musik", hint: "Was am PC läuft, mit Albumbild und Steuerung", opts: [
    { key: "cover", label: "Albumbild als Hintergrund", kind: "bool", def: true },
    { key: "skip", label: "Zurück/Weiter zeigen", kind: "bool", def: false },
  ] },
  { type: "focus", label: "Fokus-Timer", hint: "Ring mit Restzeit, Start und Pause", opts: [{ key: "minutes", label: "Minuten beim Start", kind: "number", def: 25, min: 1, max: 180 }] },
  { type: "pc", label: "PC-Verbindung", hint: "Ob der PC verbunden ist – einschalten oder neu verbinden", opts: [] },
  { type: "calendar", label: "Kalender", hint: "Datum, Kalenderwoche und die Tage der Woche", opts: [
    { key: "kw", label: "Kalenderwoche zeigen", kind: "bool", def: true },
    { key: "week", label: "Wochentage zeigen", kind: "bool", def: true },
  ] },
  { type: "weather", label: "Wetter", hint: "Temperatur, Wetterlage, Höchst- und Tiefstwert (Open-Meteo, ohne Konto)", opts: [
    { key: "place", label: "Ort (leer = dein Heimatort)", kind: "text", def: "", maxLength: 60 },
    { key: "range", label: "Höchst- und Tiefstwert zeigen", kind: "bool", def: true },
  ] },
  { type: "system", label: "System", hint: "CPU, GPU und Arbeitsspeicher des PCs mit Verlaufslinie", opts: [
    { key: "cpu", label: "CPU", kind: "bool", def: true }, { key: "gpu", label: "GPU", kind: "bool", def: true },
    { key: "ram", label: "Arbeitsspeicher", kind: "bool", def: true }, { key: "temp", label: "Temperaturen", kind: "bool", def: true },
  ] },
  { type: "volume", label: "Lautstärke / Helligkeit", hint: "Ein Schieber für den PC", opts: [
    { key: "what", label: "Regelt", kind: "choice", def: "volume", choices: [{ id: "volume", label: "Lautstärke" }, { id: "brightness", label: "Helligkeit" }] },
  ] },
  { type: "network", label: "Netzwerk", hint: "Wie schnell der PC gerade empfängt und sendet", opts: [] },
  { type: "battery", label: "Akku", hint: "Akkustand des PCs (nur mit Akku)", opts: [] },
  { type: "clock", label: "Uhr", hint: "Uhrzeit – auch einer anderen Stadt", opts: [
    { key: "zone", label: "Zeitzone", kind: "choice", def: "", choices: ZONES },
    { key: "label", label: "Name (leer = Stadt)", kind: "text", def: "", maxLength: 24 },
    { key: "seconds", label: "Sekunden zeigen", kind: "bool", def: false },
  ] },
  { type: "note", label: "Notiz", hint: "Ein kurzer Zettel, direkt in der Kachel geschrieben", opts: [{ key: "text", label: "Text", kind: "text", def: "", maxLength: 300 }] },
];
export const tileDef = (type: TileType): TileDef => TILE_DEFS.find((d) => d.type === type)!;
const isType = (v: unknown): v is TileType => TILE_DEFS.some((d) => d.type === v);

export const MAX_TILES: Record<LayoutPage, number> = { home: 6, dash: 8 };
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
