// Gaming room, launcher collectibles, reward boxes and the progress tree – all cosmetic, all on this device.
// Unlocks come only from the own GameQuest data (level, unlocked achievements, play time). There is no money, no paid
// box, no timer and no advantage anywhere: a box is earned with each level, shows everything it can contain before it
// is opened, every remaining item is equally likely, and nothing comes twice.
import { readJson, writeJson } from "./rpc";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export interface Collectible { id: string; name: string; emoji: string; rarity: Rarity }

export const COLLECTIBLES: Collectible[] = [
  { id: "plant", name: "Pflanze", emoji: "🪴", rarity: "common" }, { id: "mug", name: "Gamer-Tasse", emoji: "☕", rarity: "common" },
  { id: "books", name: "Bücherstapel", emoji: "📚", rarity: "common" }, { id: "headset", name: "Headset", emoji: "🎧", rarity: "common" },
  { id: "candle", name: "Kerze", emoji: "🕯️", rarity: "common" }, { id: "teddy", name: "Teddy", emoji: "🧸", rarity: "common" },
  { id: "dice", name: "Würfel", emoji: "🎲", rarity: "rare" }, { id: "ufo", name: "UFO-Modell", emoji: "🛸", rarity: "rare" },
  { id: "guitar", name: "Gitarre", emoji: "🎸", rarity: "rare" }, { id: "lantern", name: "Laterne", emoji: "🏮", rarity: "rare" },
  { id: "puzzle", name: "Puzzle", emoji: "🧩", rarity: "rare" }, { id: "cat", name: "Katze", emoji: "🐈", rarity: "rare" },
  { id: "dragon", name: "Drachenfigur", emoji: "🐉", rarity: "epic" }, { id: "robot", name: "Roboter", emoji: "🤖", rarity: "epic" },
  { id: "alien", name: "Arcade-Alien", emoji: "👾", rarity: "epic" }, { id: "rocket", name: "Raketenmodell", emoji: "🚀", rarity: "epic" },
  { id: "orb", name: "Kristallkugel", emoji: "🔮", rarity: "epic" }, { id: "crown", name: "Krone", emoji: "👑", rarity: "legendary" },
  { id: "galaxy", name: "Galaxie im Glas", emoji: "🌌", rarity: "legendary" }, { id: "unicorn", name: "Einhorn", emoji: "🦄", rarity: "legendary" },
  { id: "gem", name: "Diamant", emoji: "💎", rarity: "legendary" },
];
export const collectible = (id: string) => COLLECTIBLES.find((c) => c.id === id);
export const RARITY_COLOR: Record<Rarity, string> = { common: "#94a3b8", rare: "#38bdf8", epic: "#c084fc", legendary: "#facc15" };
export const RARITY_NAME: Record<Rarity, string> = { common: "Gewöhnlich", rare: "Selten", epic: "Episch", legendary: "Legendär" };

export const ROOM_STYLES = [
  { id: "neon-loft", name: "Neon-Loft", wall: "#141530", floor: "#0c0d1f", accent: "#22d3ee" },
  { id: "cyber-den", name: "Cyber-Höhle", wall: "#1a0b22", floor: "#0e0614", accent: "#f0abfc" },
  { id: "space-station", name: "Raumstation", wall: "#0a1424", floor: "#070b14", accent: "#a78bfa" },
  { id: "retro-arcade", name: "Retro-Arcade", wall: "#2a0f2e", floor: "#160719", accent: "#facc15" },
  { id: "cozy-wood", name: "Gemütliches Holz", wall: "#2b1d14", floor: "#1a120c", accent: "#fb923c" },
] as const;
export type RoomStyle = (typeof ROOM_STYLES)[number]["id"];

/** Progress tree: three branches. A node opens when its requirement is met and the node before it is open. */
export interface TreeNode { id: string; branch: "level" | "trophies" | "hours"; need: number; reward: { collectible?: string; style?: RoomStyle } }
export const TREE: TreeNode[] = [
  { id: "l1", branch: "level", need: 1, reward: { style: "neon-loft", collectible: "plant" } },
  { id: "l3", branch: "level", need: 3, reward: { style: "cyber-den" } },
  { id: "l5", branch: "level", need: 5, reward: { collectible: "robot" } },
  { id: "l8", branch: "level", need: 8, reward: { collectible: "crown" } },
  { id: "t1", branch: "trophies", need: 1, reward: { collectible: "books" } },
  { id: "t3", branch: "trophies", need: 3, reward: { collectible: "dice" } },
  { id: "t6", branch: "trophies", need: 6, reward: { style: "retro-arcade" } },
  { id: "t10", branch: "trophies", need: 10, reward: { collectible: "gem" } },
  { id: "h5", branch: "hours", need: 5, reward: { collectible: "headset" } },
  { id: "h20", branch: "hours", need: 20, reward: { style: "space-station" } },
  { id: "h50", branch: "hours", need: 50, reward: { style: "cozy-wood" } },
  { id: "h100", branch: "hours", need: 100, reward: { collectible: "galaxy" } },
];
const TREE_ITEMS = new Set(TREE.map((n) => n.reward.collectible).filter(Boolean) as string[]);
/** What a box can contain: everything that is not a fixed reward of the tree. */
export const BOX_POOL = COLLECTIBLES.filter((c) => !TREE_ITEMS.has(c.id)).map((c) => c.id);

export interface Progress { level: number; trophies: number; hours: number }
export const progressOf = (q: { level: number; achievements: { unlocked: boolean }[]; totals: { minutes: number } }): Progress =>
  ({ level: q.level, trophies: q.achievements.filter((a) => a.unlocked).length, hours: Math.floor(q.totals.minutes / 60) });

export function openNodes(p: Progress): Set<string> {
  const open = new Set<string>();
  for (const branch of ["level", "trophies", "hours"] as const) {
    for (const n of TREE.filter((x) => x.branch === branch).sort((a, b) => a.need - b.need)) {
      if (p[branch] >= n.need) open.add(n.id); else break;
    }
  }
  return open;
}

// ------------------------------------------------------------------ stored state

export const ROOM_OBJECTS = ["pc", "poster", "shelf", "trophy", "lamp", "speaker", "controller"] as const;
export type RoomObject = (typeof ROOM_OBJECTS)[number];
export interface Decor { id: string; x: number; y: number }
export interface RoomVariant { id: string; name: string; style: RoomStyle; light: string; hidden: RoomObject[]; decor: Decor[] }
export const SHELF_SLOTS = 12;
export interface RoomState { startPage: boolean; active: string; variants: RoomVariant[]; fromBoxes: string[]; shelf: (string | null)[] }

export const defaultVariant = (id = "main", name = "Mein Raum"): RoomVariant => ({ id, name, style: "neon-loft", light: "#22d3ee", hidden: [], decor: [] });
export const DEFAULT_ROOM: RoomState = { startPage: false, active: "main", variants: [defaultVariant()], fromBoxes: [], shelf: Array(SHELF_SLOTS).fill(null) };

const HEX = /^#[0-9a-fA-F]{6}$/;
const pct = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.min(96, Math.max(2, v)) : 50);
const known = (id: unknown): id is string => typeof id === "string" && !!collectible(id);

export function sanitizeRoom(input: unknown): RoomState {
  const v = (input && typeof input === "object" ? input : {}) as Partial<RoomState>;
  const variants = (Array.isArray(v.variants) ? v.variants : []).filter((x) => x && typeof x.id === "string").slice(0, 6).map((x): RoomVariant => ({
    id: x.id.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "v",
    name: typeof x.name === "string" ? x.name.replace(/[\u0000-\u001f]/g, "").slice(0, 30) || "Raum" : "Raum",
    style: ROOM_STYLES.some((s) => s.id === x.style) ? x.style : "neon-loft",
    light: typeof x.light === "string" && HEX.test(x.light) ? x.light : "#22d3ee",
    hidden: Array.isArray(x.hidden) ? [...new Set(x.hidden.filter((o): o is RoomObject => (ROOM_OBJECTS as readonly string[]).includes(o)))] : [],
    decor: Array.isArray(x.decor) ? x.decor.filter((d) => d && known(d.id)).filter((d, i, all) => all.findIndex((e) => e.id === d.id) === i).slice(0, 24).map((d) => ({ id: d.id, x: pct(d.x), y: pct(d.y) })) : [],
  }));
  if (!variants.length) variants.push(defaultVariant());
  const fromBoxes = Array.isArray(v.fromBoxes) ? [...new Set(v.fromBoxes.filter((id) => known(id) && BOX_POOL.includes(id)))] : [];
  const shelf = Array.from({ length: SHELF_SLOTS }, (_, i) => (Array.isArray(v.shelf) && known(v.shelf[i]) ? v.shelf[i] : null));
  // One collectible stands on the shelf only once.
  shelf.forEach((id, i) => { if (id && shelf.indexOf(id) !== i) shelf[i] = null; });
  return { startPage: !!v.startPage, active: variants.some((x) => x.id === v.active) ? v.active! : variants[0].id, variants, fromBoxes, shelf };
}

/** Collectibles this device has: fixed rewards of open tree nodes plus what came out of boxes. */
export function owned(p: Progress, s: RoomState): string[] {
  const open = openNodes(p);
  const fromTree = TREE.filter((n) => open.has(n.id) && n.reward.collectible).map((n) => n.reward.collectible!);
  return [...new Set([...fromTree, ...s.fromBoxes])];
}
export function unlockedStyles(p: Progress): Set<RoomStyle> {
  const open = openNodes(p);
  return new Set<RoomStyle>(["neon-loft", ...TREE.filter((n) => open.has(n.id) && n.reward.style).map((n) => n.reward.style!)]);
}

/** One box per level above 1 – earned only by playing. */
export const boxesEarned = (p: Progress) => Math.max(0, p.level - 1);
export const boxesLeft = (p: Progress, s: RoomState) => Math.max(0, boxesEarned(p) - s.fromBoxes.length);
export const boxRemaining = (s: RoomState) => BOX_POOL.filter((id) => !s.fromBoxes.includes(id));

/** Opens a box: every remaining item equally likely, never one already owned. Null = no box earned or all collected. */
export function openBox(p: Progress, s: RoomState, rand: () => number = Math.random): { state: RoomState; item: string } | null {
  const pool = boxRemaining(s);
  if (boxesLeft(p, s) <= 0 || !pool.length) return null;
  const item = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { state: { ...s, fromBoxes: [...s.fromBoxes, item] }, item };
}

// ------------------------------------------------------------------ store (this device; goes with the own account)

export const ROOM_KEY = "pgl.room";
let state: RoomState = sanitizeRoom(readJson(ROOM_KEY) ?? DEFAULT_ROOM);
const listeners = new Set<() => void>();
export const getRoom = () => state;
export function setRoom(next: RoomState) {
  state = sanitizeRoom(next);
  writeJson(ROOM_KEY, state);
  listeners.forEach((l) => l());
}
export const subscribeRoom = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** After signing in elsewhere the account writes the stored copy – read it again. */
export function reloadRoom() { state = sanitizeRoom(readJson(ROOM_KEY) ?? DEFAULT_ROOM); listeners.forEach((l) => l()); }
export const activeVariant = (s: RoomState) => s.variants.find((v) => v.id === s.active) ?? s.variants[0];
