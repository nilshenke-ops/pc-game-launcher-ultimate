// Pure preference logic (no DOM access) – shared by the app and unit tests.

// ------------------------------------------------------------------ theme

export interface Palette { name: string; primary: string; accent: string; background: string }

export interface Theme {
  preset: string;
  mode: "dark" | "light";
  primary: string;
  accent: string;
  background: string;
  surfaceAlpha: number; // 0.4 .. 1
  radius: number; // px
  fontScale: number; // 0.85 .. 1.3
  reduceMotion: boolean;
  /** Light rendering: no blur effects, no animations, no glow – for weaker devices, battery, or next to a game. */
  lite?: boolean;
  bgImage?: string | null; // data URL or https URL
  bgScene?: string | null; // built-in background (public/backgrounds/<id>.svg)
  bgDim: number; // 0 .. 0.9
}

/**
 * Built-in backgrounds (drawn SVGs in public/backgrounds) with matching colours that are applied on selection.
 * phone: there is a tall version "<id>-phone.svg" that is used on phones in portrait (scripts/make-cartoon-backgrounds.mjs).
 */
export const BG_SCENES: { id: string; name: string; mode: "dark" | "light"; primary: string; accent: string; background: string; dim: number; sky?: string; phone?: boolean }[] = [
  { id: "cartoon", name: "Cartoon", mode: "light", primary: "#0284c7", accent: "#f59e0b", background: "#e0f2fe", dim: 0.35, sky: "#4fc3f7", phone: true },
  { id: "cartoon-night", name: "Cartoon Nacht", mode: "dark", primary: "#a78bfa", accent: "#fde047", background: "#1e1b4b", dim: 0.3, sky: "#1e1b4b", phone: true },
  { id: "cartoon-sea", name: "Cartoon Unterwasser", mode: "light", primary: "#0369a1", accent: "#f97316", background: "#e0f2fe", dim: 0.45, sky: "#38bdf8", phone: true },
  { id: "cartoon-space", name: "Cartoon Weltall", mode: "dark", primary: "#fb923c", accent: "#38bdf8", background: "#0b1033", dim: 0.3, sky: "#0b1033", phone: true },
  { id: "candy", name: "Candy", mode: "light", primary: "#db2777", accent: "#7c3aed", background: "#fdf2f8", dim: 0.35, sky: "#fbcfe8" },
  { id: "comic", name: "Comic", mode: "light", primary: "#dc2626", accent: "#2563eb", background: "#fff7d6", dim: 0.3 },
  { id: "pixel", name: "Pixel Retro", mode: "light", primary: "#2563eb", accent: "#d97706", background: "#eef6ff", dim: 0.3, sky: "#5c94fc" },
  { id: "synthwave", name: "Synthwave", mode: "dark", primary: "#f472b6", accent: "#818cf8", background: "#0d0716", dim: 0.35, sky: "#0b0221" },
  { id: "space", name: "Weltraum", mode: "dark", primary: "#a78bfa", accent: "#22d3ee", background: "#05050f", dim: 0.3 },
  { id: "neon-city", name: "Neon City", mode: "dark", primary: "#22d3ee", accent: "#f472b6", background: "#0b0726", dim: 0.4, sky: "#0b0726" },
  { id: "arcade", name: "Arcade", mode: "dark", primary: "#f0abfc", accent: "#22d3ee", background: "#140a2e", dim: 0.3 },
  { id: "aurora", name: "Polarlicht", mode: "dark", primary: "#2dd4bf", accent: "#a78bfa", background: "#041016", dim: 0.35, sky: "#020617" },
  { id: "ocean", name: "Ozean", mode: "dark", primary: "#38bdf8", accent: "#fb923c", background: "#061a2b", dim: 0.4, sky: "#1e3a8a" },
  { id: "forest", name: "Wald", mode: "dark", primary: "#34d399", accent: "#fbbf24", background: "#06110f", dim: 0.45, sky: "#9fd1c0" },
  { id: "lava", name: "Vulkan", mode: "dark", primary: "#fb923c", accent: "#ef4444", background: "#120806", dim: 0.35, sky: "#1c0a06" },
];

// ------------------------------------------------------------------ effects (start animation, moving background, page transitions)

/** Loading screens of the start animation (drawn with CSS only, see components/launch-cinema.tsx). */
export const LAUNCH_STYLES = [
  { id: "neon-portal", name: "Neon-Portal" }, { id: "cyberpunk", name: "Cyberpunk" }, { id: "space", name: "Weltraumreise" }, { id: "minimal", name: "Minimal Dark" },
  { id: "glitch", name: "Digital Glitch" }, { id: "energy", name: "Energiewelle" }, { id: "galaxy", name: "Lila Galaxie" }, { id: "hologram", name: "Blaues Hologramm" },
] as const;
export type LaunchStyle = (typeof LAUNCH_STYLES)[number]["id"];
/** Moving backgrounds (canvas, see components/animated-bg.tsx). */
export const BG_ANIMS = [
  { id: "none", name: "Aus" }, { id: "particles", name: "Partikel" }, { id: "stars", name: "Sternenflug" }, { id: "grid", name: "Neon-Raster" },
  { id: "waves", name: "Wellen" }, { id: "embers", name: "Funken" }, { id: "snow", name: "Eiskristalle" },
] as const;
export type BgAnim = (typeof BG_ANIMS)[number]["id"];
export const TRANSITIONS = [{ id: "none", name: "Keiner" }, { id: "fade", name: "Einblenden" }, { id: "slide", name: "Gleiten" }, { id: "zoom", name: "Zoom" }, { id: "blur", name: "Unschärfe" }] as const;
export type TransitionKind = (typeof TRANSITIONS)[number]["id"];

export interface Fx {
  /** Start animation while the PC starts a game. Never holds the start back – it only shows what the PC reports. */
  launch: { enabled: boolean; style: LaunchStyle; seconds: number; fast: boolean; cover: boolean; tagline: string };
  /** speed 0.25..2, amount 0.2..1, opacity 0.1..1 */
  bg: { kind: BgAnim; speed: number; amount: number; opacity: number };
  transition: { kind: TransitionKind; ms: number };
}
export const DEFAULT_FX: Fx = {
  launch: { enabled: true, style: "neon-portal", seconds: 3, fast: false, cover: true, tagline: "" },
  bg: { kind: "none", speed: 1, amount: 0.6, opacity: 0.6 },
  transition: { kind: "fade", ms: 220 },
};

export function sanitizeFx(input: unknown): Fx {
  const f = (input && typeof input === "object" ? input : {}) as Partial<Fx>;
  const num = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const l = (f.launch ?? {}) as Partial<Fx["launch"]>, b = (f.bg ?? {}) as Partial<Fx["bg"]>, tr = (f.transition ?? {}) as Partial<Fx["transition"]>;
  const d = DEFAULT_FX;
  return {
    launch: {
      enabled: l.enabled !== false, style: LAUNCH_STYLES.some((x) => x.id === l.style) ? l.style! : d.launch.style,
      seconds: num(l.seconds, 1, 8, d.launch.seconds), fast: !!l.fast, cover: l.cover !== false,
      tagline: typeof l.tagline === "string" ? l.tagline.replace(/[\u0000-\u001f]/g, "").slice(0, 60) : "",
    },
    bg: { kind: BG_ANIMS.some((x) => x.id === b.kind) ? b.kind! : "none", speed: num(b.speed, 0.25, 2, 1), amount: num(b.amount, 0.2, 1, 0.6), opacity: num(b.opacity, 0.1, 1, 0.6) },
    transition: { kind: TRANSITIONS.some((x) => x.id === tr.kind) ? tr.kind! : d.transition.kind, ms: num(tr.ms, 100, 700, d.transition.ms) },
  };
}

/** Atmosphere: colours plus a matching moving background and start animation in one tap (everything stays changeable). */
export interface Atmosphere { bg: BgAnim; launch: LaunchStyle; surfaceAlpha?: number }

export const PRESETS: Record<string, Palette & { mode: "dark" | "light"; atmo?: Atmosphere }> = {
  neon: { name: "Neon Cyan", primary: "#22d3ee", accent: "#a78bfa", background: "#070b16", mode: "dark" },
  emerald: { name: "Emerald", primary: "#34d399", accent: "#22d3ee", background: "#06110f", mode: "dark" },
  synth: { name: "Synthwave", primary: "#f472b6", accent: "#818cf8", background: "#0d0716", mode: "dark" },
  ember: { name: "Ember", primary: "#fb923c", accent: "#f43f5e", background: "#120a07", mode: "dark" },
  ocean: { name: "Deep Ocean", primary: "#60a5fa", accent: "#2dd4bf", background: "#060d1a", mode: "dark" },
  daylight: { name: "Daylight", primary: "#0891b2", accent: "#7c3aed", background: "#eef2f7", mode: "light" },
  cyberpunk: { name: "Cyberpunk", primary: "#facc15", accent: "#f0abfc", background: "#0c0612", mode: "dark", atmo: { bg: "grid", launch: "cyberpunk" } },
  neonglow: { name: "Neon", primary: "#22d3ee", accent: "#f472b6", background: "#05030f", mode: "dark", atmo: { bg: "particles", launch: "neon-portal" } },
  space: { name: "Space", primary: "#a78bfa", accent: "#38bdf8", background: "#03030c", mode: "dark", atmo: { bg: "stars", launch: "space" } },
  ice: { name: "Ice", primary: "#7dd3fc", accent: "#e0f2fe", background: "#06121c", mode: "dark", atmo: { bg: "snow", launch: "hologram" } },
  fire: { name: "Fire", primary: "#fb923c", accent: "#facc15", background: "#140604", mode: "dark", atmo: { bg: "embers", launch: "energy" } },
  fantasy: { name: "Fantasy", primary: "#c084fc", accent: "#34d399", background: "#0d0a1a", mode: "dark", atmo: { bg: "particles", launch: "galaxy" } },
  retro: { name: "Retro Arcade", primary: "#f472b6", accent: "#facc15", background: "#12061f", mode: "dark", atmo: { bg: "grid", launch: "glitch" } },
  minimal: { name: "Minimal Dark", primary: "#e5e7eb", accent: "#9ca3af", background: "#0a0a0b", mode: "dark", atmo: { bg: "none", launch: "minimal" } },
  glass: { name: "Glass", primary: "#93c5fd", accent: "#c4b5fd", background: "#0b1220", mode: "dark", atmo: { bg: "waves", launch: "hologram", surfaceAlpha: 0.45 } },
  mono: { name: "Mono", primary: "#f5f5f5", accent: "#a3a3a3", background: "#111111", mode: "dark", atmo: { bg: "none", launch: "minimal" } },
};

export const DEFAULT_THEME: Theme = {
  preset: "neon", mode: "dark", primary: "#22d3ee", accent: "#a78bfa", background: "#070b16",
  surfaceAlpha: 0.72, radius: 16, fontScale: 1, reduceMotion: false, bgImage: null, bgScene: null, bgDim: 0.55,
};

// ------------------------------------------------------------------ dashboard layouts

export type BuiltinWidgetId = "status" | "session" | "profile" | "quick" | "favorites" | "recent" | "system" | "audio" | "playing" | "notifications" | "download" | "devices" | "shortcuts" | "clock" | "notes" | "next" | "start" | "media" | "timer" | "deck" | "calendar" | "activity"
  | "counter" | "break" | "today" | "ping" | "goals" | "level" | "deals" | "controller" | "random" | "visualizer" | "power"
  | "memory" | "night" | "poll" | "photo" | "projects" | "track" | "challenges" | "dice" | "captures" | "storage" | "topplayed" | "bingo";
/** Widgets that are useful without a connected PC (shown on the home screen while offline). */
export const OFFLINE_WIDGETS = new Set<string>(["status", "shortcuts", "clock", "notes", "next", "start", "download", "timer", "deck", "calendar", "activity", "counter", "break", "today", "goals", "level", "deals", "random", "visualizer", "memory", "night", "poll", "photo", "projects", "track", "challenges", "dice", "captures", "storage", "topplayed", "bingo"]);
/** Built-in widget, a plugin widget "plugin:<plugin-id>:<widget-id>" or an own widget from the editor "custom:cw_…". */
export type WidgetId = BuiltinWidgetId | `plugin:${string}` | `custom:${string}`;
export const PLUGIN_WIDGET = /^plugin:[a-z0-9.-]{3,64}:[a-z0-9-]{1,32}$/;
export const CUSTOM_WIDGET = /^custom:cw_[A-Za-z0-9_-]{1,40}$/;
export type WidgetSize = "s" | "m" | "l";
export interface WidgetConf { id: WidgetId; visible: boolean; size: WidgetSize }
export interface Layout { id: string; name: string; widgets: WidgetConf[] }

export const ALL_WIDGETS: { id: BuiltinWidgetId; label: string; sizes: WidgetSize[] }[] = [
  { id: "status", label: "Verbindung & PC", sizes: ["s", "m"] },
  { id: "session", label: "Aktuelle Spielesitzung", sizes: ["s", "m", "l"] },
  { id: "profile", label: "Gaming-Profil", sizes: ["s", "m"] },
  { id: "quick", label: "Quick Actions", sizes: ["m", "l"] },
  { id: "favorites", label: "Favoriten", sizes: ["m", "l"] },
  { id: "recent", label: "Zuletzt gestartet", sizes: ["s", "m", "l"] },
  { id: "system", label: "PC-Auslastung", sizes: ["s", "m", "l"] },
  { id: "audio", label: "Audio", sizes: ["s", "m"] },
  { id: "playing", label: "Laufende Sounds", sizes: ["s", "m"] },
  { id: "notifications", label: "Benachrichtigungen", sizes: ["s", "m", "l"] },
  { id: "download", label: "Begleiter & Updates", sizes: ["s", "m"] },
  { id: "devices", label: "Geräte", sizes: ["s", "m"] },
  { id: "shortcuts", label: "Schnellstart", sizes: ["m", "l"] },
  { id: "clock", label: "Uhr & Datum", sizes: ["s", "m"] },
  { id: "notes", label: "Notizen", sizes: ["s", "m", "l"] },
  { id: "next", label: "Als Nächstes spielen", sizes: ["s", "m", "l"] },
  { id: "start", label: "Erste Schritte", sizes: ["m", "l"] },
  { id: "media", label: "Medien & Lautstärke", sizes: ["s", "m"] },
  { id: "timer", label: "Stoppuhr & Countdown", sizes: ["s", "m"] },
  { id: "deck", label: "Mini-Deck", sizes: ["m", "l"] },
  { id: "calendar", label: "Termine", sizes: ["s", "m", "l"] },
  { id: "activity", label: "Mein Status", sizes: ["s", "m", "l"] },
  { id: "counter", label: "Zähler", sizes: ["s", "m"] },
  { id: "break", label: "Pausen-Erinnerung", sizes: ["s", "m"] },
  { id: "today", label: "Spielzeit heute", sizes: ["s", "m"] },
  { id: "ping", label: "Ping", sizes: ["s", "m"] },
  { id: "goals", label: "Aktive Ziele", sizes: ["s", "m", "l"] },
  { id: "level", label: "Level & XP", sizes: ["s", "m"] },
  { id: "deals", label: "Deals", sizes: ["s", "m", "l"] },
  { id: "controller", label: "Controller-Akku", sizes: ["s", "m"] },
  { id: "random", label: "Zufallsspiel", sizes: ["s", "m"] },
  { id: "visualizer", label: "Musik-Visualizer", sizes: ["m", "l"] },
  { id: "power", label: "PC-Energie", sizes: ["s", "m"] },
  { id: "memory", label: "Wo war ich?", sizes: ["s", "m"] },
  { id: "night", label: "Nächster Gaming-Abend", sizes: ["s", "m"] },
  { id: "poll", label: "Offene Abstimmung", sizes: ["s", "m"] },
  { id: "photo", label: "Foto des Tages", sizes: ["s", "m", "l"] },
  { id: "projects", label: "Bauprojekte", sizes: ["s", "m"] },
  { id: "track", label: "Soundtrack-Tipp", sizes: ["s", "m"] },
  { id: "challenges", label: "Offene Challenges", sizes: ["s", "m"] },
  { id: "dice", label: "Würfel & Münze", sizes: ["s", "m"] },
  { id: "captures", label: "Letzte Aufnahmen", sizes: ["m", "l"] },
  { id: "storage", label: "Speicherplatz", sizes: ["s", "m"] },
  { id: "topplayed", label: "Meistgespielt (7 Tage)", sizes: ["s", "m"] },
  { id: "bingo", label: "Bingo", sizes: ["m", "l"] },
];

export const DEFAULT_LAYOUT: Layout = {
  id: "default",
  name: "Standard",
  widgets: [
    { id: "status", visible: true, size: "m" },
    { id: "shortcuts", visible: true, size: "m" },
    { id: "start", visible: true, size: "m" },
    { id: "next", visible: true, size: "m" },
    { id: "activity", visible: true, size: "s" },
    { id: "calendar", visible: true, size: "m" },
    { id: "profile", visible: true, size: "s" },
    { id: "session", visible: true, size: "s" },
    { id: "favorites", visible: true, size: "l" },
    { id: "quick", visible: true, size: "m" },
    { id: "system", visible: true, size: "m" },
    { id: "recent", visible: true, size: "m" },
    { id: "audio", visible: true, size: "s" },
    { id: "playing", visible: true, size: "s" },
    { id: "notifications", visible: true, size: "m" },
    { id: "download", visible: false, size: "s" },
    { id: "devices", visible: false, size: "s" },
    { id: "clock", visible: false, size: "s" },
    { id: "notes", visible: false, size: "m" },
  ],
};

export interface Prefs {
  version: 1;
  updatedAt: number;
  lang: "de" | "en";
  theme: Theme;
  palettes: Palette[];
  layouts: Layout[];
  activeLayout: { desktop: string; mobile: string };
  usage: Record<string, number>;
  /** Navigation: own order and hidden sections, shortcuts in the phone bar (paths like "/games"). */
  nav: NavPrefs;
  /** Show the theme of the active gaming profile (e.g. switched on by a game start). Off = always the own design on this device. */
  profileThemes: boolean;
  /** Areas in the "Schnellstart" home widget (paths); empty = default set. */
  homeShortcuts: string[];
  /** Start animation, moving background, page transitions. */
  fx: Fx;
  /** Tabs moved into "Weitere" per page (page id → tab ids), e.g. { friends: ["servers"] }. */
  tabs: Record<string, string[]>;
}

/** colors: coloured symbols in the navigation and the bottom bar (false = plain, like before 2.8). */
export interface NavPrefs {
  order: string[];
  /** Removed from the bar – they wait in the folder "Weitere Funktionen" and can be added back in "Bearbeiten". */
  hidden: string[];
  bottom: string[];
  colors: boolean;
  /** Folded categories in the sidebar (category ids). */
  collapsed: string[];
  /** The tidy default was applied once (from 2.61.0). */
  tidied: boolean;
}
/** A calm bar to start with: everyday sections stay, the rest waits in "Weitere Funktionen" (one tap away, nothing is lost). */
export const TIDY_HIDDEN = [
  "/mods", "/vault", "/gamestate", "/calendar", "/wiki", "/worlds", "/builds", "/friends", "/media", "/studio", "/infos", "/insights", "/widgets",
  "/automations", "/layouts", "/hotkeys", "/input", "/peripherals", "/storage", "/move", "/network", "/start-times", "/inventory", "/crashes",
  "/history", "/overlay-settings", "/files", "/quests", "/room", "/trophies", "/deals",
];
export const DEFAULT_NAV: NavPrefs = { order: [], hidden: [...TIDY_HIDDEN], bottom: ["/", "/deck", "/games", "/soundboard"], colors: true, collapsed: [], tidied: true };
/** The bar before 2.7.0 – untouched old defaults get the new bar (with the deck). */
const OLD_DEFAULT_BOTTOM = "/,/games,/soundboard,/quick";


export function defaultPrefs(): Prefs {
  const lang = (navigator.language || "de").toLowerCase().startsWith("de") ? "de" : "en";
  return { version: 1, updatedAt: 0, lang, theme: { ...DEFAULT_THEME }, palettes: [], layouts: [structuredClone(DEFAULT_LAYOUT)], activeLayout: { desktop: "default", mobile: "default" }, usage: {}, nav: structuredClone(DEFAULT_NAV), profileThemes: true, homeShortcuts: [], fx: structuredClone(DEFAULT_FX), tabs: {} };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Validates prefs from storage, the companion or an imported file. Unknown/invalid values fall back to defaults. */
export function sanitizePrefs(input: unknown): Prefs {
  const d = defaultPrefs();
  if (!input || typeof input !== "object") return d;
  const p = input as Partial<Prefs>;
  const t = (p.theme ?? {}) as Partial<Theme>;
  const num = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const theme: Theme = {
    preset: typeof t.preset === "string" ? t.preset : d.theme.preset,
    mode: t.mode === "light" ? "light" : "dark",
    primary: HEX.test(t.primary ?? "") ? t.primary! : d.theme.primary,
    accent: HEX.test(t.accent ?? "") ? t.accent! : d.theme.accent,
    background: HEX.test(t.background ?? "") ? t.background! : d.theme.background,
    surfaceAlpha: num(t.surfaceAlpha, 0.35, 1, d.theme.surfaceAlpha),
    radius: num(t.radius, 0, 28, d.theme.radius),
    fontScale: num(t.fontScale, 0.85, 1.35, d.theme.fontScale),
    reduceMotion: !!t.reduceMotion,
    lite: !!t.lite,
    bgImage: typeof t.bgImage === "string" && (t.bgImage.startsWith("data:image/") || t.bgImage.startsWith("https://")) && t.bgImage.length < 1_200_000 ? t.bgImage : null,
    bgScene: typeof t.bgScene === "string" && BG_SCENES.some((s) => s.id === t.bgScene) ? t.bgScene : null,
    bgDim: num(t.bgDim, 0, 0.9, d.theme.bgDim),
  };
  const ids = new Set(ALL_WIDGETS.map((w) => w.id));
  const layouts = Array.isArray(p.layouts)
    ? p.layouts.filter((l) => l && typeof l.id === "string" && Array.isArray(l.widgets)).slice(0, 20).map((l) => {
        const seen = new Set<string>();
        let plugins = 0, custom = 0;
        const known = (id: string) => ids.has(id as BuiltinWidgetId) || (PLUGIN_WIDGET.test(id) && ++plugins <= 60) || (CUSTOM_WIDGET.test(id) && ++custom <= 30);
        const widgets: WidgetConf[] = l.widgets.filter((w) => typeof w?.id === "string" && known(w.id) && !seen.has(w.id) && seen.add(w.id)).map((w) => ({ id: w.id, visible: !!w.visible, size: (["s", "m", "l"].includes(w.size) ? w.size : "m") as WidgetSize }));
        // Layouts from before 2.7.0 get the new home widgets "Schnellstart" and "Als Nächstes spielen" right after the first widget.
        for (const id of ["next", "shortcuts"] as BuiltinWidgetId[]) if (!seen.has(id)) { seen.add(id); widgets.splice(Math.min(1, widgets.length), 0, { id, visible: true, size: "m" }); }
        // Layouts from before 2.14.0 show "Mein Status" and "Termine" once (hidden by the user, they stay hidden).
        for (const [id, size] of [["calendar", "m"], ["activity", "s"]] as [BuiltinWidgetId, WidgetSize][]) if (!seen.has(id)) { seen.add(id); widgets.splice(Math.min(3, widgets.length), 0, { id, visible: true, size }); }
        for (const w of ALL_WIDGETS) if (!seen.has(w.id)) widgets.push({ id: w.id, visible: false, size: w.sizes[0] });
        return { id: l.id.slice(0, 40), name: String(l.name ?? "Layout").slice(0, 40), widgets };
      })
    : [];
  if (!layouts.length) layouts.push(structuredClone(DEFAULT_LAYOUT));
  const has = (id?: string) => layouts.some((l) => l.id === id);
  return {
    version: 1,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
    lang: p.lang === "en" ? "en" : p.lang === "de" ? "de" : d.lang,
    theme,
    palettes: Array.isArray(p.palettes) ? p.palettes.filter((x) => x && HEX.test(x.primary) && HEX.test(x.accent) && HEX.test(x.background)).slice(0, 30).map((x) => ({ name: String(x.name).slice(0, 30), primary: x.primary, accent: x.accent, background: x.background })) : [],
    layouts,
    activeLayout: {
      desktop: has(p.activeLayout?.desktop) ? p.activeLayout!.desktop : layouts[0].id,
      mobile: has(p.activeLayout?.mobile) ? p.activeLayout!.mobile : layouts[0].id,
    },
    nav: sanitizeNav(p.nav),
    profileThemes: p.profileThemes !== false,
    homeShortcuts: Array.isArray(p.homeShortcuts) ? [...new Set(p.homeShortcuts.filter((x): x is string => typeof x === "string" && NAV_PATH.test(x)))].slice(0, 8) : [],
    fx: sanitizeFx(p.fx),
    tabs: sanitizeTabs(p.tabs),
    usage: p.usage && typeof p.usage === "object" ? Object.fromEntries(Object.entries(p.usage).filter(([, v]) => typeof v === "number").slice(0, 300)) : {},
  };
}

const NAV_PATH = /^\/[a-z-]{0,30}$/;

function sanitizeTabs(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => /^[a-z]{2,20}$/.test(k) && Array.isArray(x)).slice(0, 40)
    .map(([k, x]) => [k, [...new Set((x as unknown[]).filter((id): id is string => typeof id === "string" && /^[a-z-]{1,20}$/.test(id)))].slice(0, 20)]));
}
function sanitizeNav(n: unknown): NavPrefs {
  const v = (n && typeof n === "object" ? n : {}) as Partial<NavPrefs>;
  const paths = (x: unknown, max: number) => (Array.isArray(x) ? [...new Set(x.filter((p): p is string => typeof p === "string" && NAV_PATH.test(p)))].slice(0, max) : []);
  const bottom = paths(v.bottom, 4);
  const migrated = bottom.join() === OLD_DEFAULT_BOTTOM ? [...DEFAULT_NAV.bottom] : bottom;
  const hidden = paths(v.hidden, 60);
  // Until 2.60 nothing was tucked away by default: an untouched bar gets the tidy one once (all sections stay reachable).
  const tidy = v.tidied !== true && hidden.length === 0;
  const collapsed = Array.isArray(v.collapsed) ? [...new Set(v.collapsed.filter((x): x is string => typeof x === "string" && /^[a-z]{2,12}$/.test(x)))].slice(0, 20) : [];
  return { order: paths(v.order, 60), hidden: tidy ? [...TIDY_HIDDEN] : hidden, bottom: migrated.length ? migrated : [...DEFAULT_NAV.bottom], colors: v.colors !== false, collapsed, tidied: true };
}

// ------------------------------------------------------------------ colours & theme application

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return "#" + x.map((c, i) => Math.round(c + (y[i] - c) * t).toString(16).padStart(2, "0")).join("");
}


/** The device's own theme with the active profile's colours on top (validated – the values come from the PC). */
export function withProfileTheme(own: Theme, pt: { mode?: string; primary?: string; accent?: string; background?: string; bgScene?: string | null } | null | undefined): Theme {
  if (!pt || !HEX.test(pt.primary ?? "") || !HEX.test(pt.accent ?? "") || !HEX.test(pt.background ?? "")) return own;
  const scene = pt.bgScene && BG_SCENES.some((s) => s.id === pt.bgScene) ? pt.bgScene : null;
  return { ...own, preset: "profile", mode: pt.mode === "light" ? "light" : "dark", primary: pt.primary!, accent: pt.accent!, background: pt.background!, ...(scene ? { bgScene: scene, bgImage: null } : {}) };
}
