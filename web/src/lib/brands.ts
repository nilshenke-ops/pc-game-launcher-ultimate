// Finds the real logo of a well-known program (Discord, OBS, Spotify …) from its name or file. Pure data, no network:
// the shapes ship with the app (brand-icons.ts), so logos also show without the PC.
import { BRANDS, type Brand } from "./brand-icons";

export type { Brand };
export { BRANDS };

export function brandFor(item: { name: string; target?: string }): Brand | undefined {
  const name = item.name.toLowerCase().trim();
  const file = (item.target ?? "").toLowerCase();
  return BRANDS.find((b) => b.match.test(name)) ?? (file ? BRANDS.find((b) => b.match.test(file)) : undefined);
}

export const brandById = (id: string) => BRANDS.find((b) => b.id === id);

/** Tile colour for a brand: its own colour; pure black is lifted a little so the tile still has depth. */
export function brandBg(b: Brand) {
  return /^#0{6}$/.test(b.hex) || b.hex === "#101010" || b.hex === "#000000" ? "#1c1f26" : b.hex;
}

/** White logo on dark/strong colours, dark logo on light ones (e.g. Kick, Streamlabs). */
export function brandFg(b: Brand) {
  const n = parseInt(brandBg(b).slice(1), 16);
  const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl > 0.6 ? "#0b1020" : "#ffffff";
}

const SI_GAMES = new Set(["valorant", "lol", "roblox", "fortnite", "cs", "dota", "pubg", "osu", "thefinals"]);
const PLATFORMS = new Set(["xbox", "gamepass", "nintendo"]);
/** For the logo picker: games first, then programs, launchers and platforms. */
export const isGameBrand = (b: Brand) => (b.source === "arcticons" ? !PLATFORMS.has(b.id) : SI_GAMES.has(b.id));
