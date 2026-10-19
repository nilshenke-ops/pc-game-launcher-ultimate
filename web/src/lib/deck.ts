// Nexus Deck: Stream-Deck-like key grid. The layout is stored on the PC (deck.save); a key press calls the same
// command as everywhere else in the app (library.launch, sounds.play …) with the rights of the device.
import { t } from "./i18n";
import { brandBg, brandFor } from "./brands";
import type { LibraryItem, Profile, QuickAction, Sound } from "./types";

export type DeckActionType = "launch" | "quick" | "sound" | "stopSounds" | "profile" | "revertProfile" | "media" | "overlay" | "record" | "replay" | "folder" | "back" | "open" | "none";
export interface DeckAction { type: DeckActionType; ref?: string | null }
export interface DeckKey { id: string; slot: number; label?: string | null; icon?: string | null; color?: string | null; textColor?: string | null; action: DeckAction }
export interface DeckPage { id: string; name: string; keys: DeckKey[] }
export interface Deck { id: string; name: string; cols: number; rows: number; background?: string | null; profileId?: string | null; pages: DeckPage[]; updatedAt?: string }

export const MEDIA_KEYS: [string, string, string][] = [
  ["playpause", "Play/Pause", "play"], ["next", "Nächster Titel", "skip-forward"], ["prev", "Vorheriger Titel", "skip-back"],
  ["volup", "Lauter", "volume-2"], ["voldown", "Leiser", "volume-1"], ["mute", "Ton aus/an", "volume-x"], ["stop", "Stopp", "square"],
];

export const ACTION_TYPES: { type: DeckActionType; label: () => string }[] = [
  { type: "launch", label: () => t("Spiel oder Programm starten") },
  { type: "quick", label: () => t("Quick Action ausführen") },
  { type: "sound", label: () => t("Sound abspielen") },
  { type: "stopSounds", label: () => t("Alle Sounds stoppen") },
  { type: "profile", label: () => t("Gaming-Profil aktivieren") },
  { type: "revertProfile", label: () => t("Zum vorherigen Profil") },
  { type: "media", label: () => t("Medien & Lautstärke") },
  { type: "overlay", label: () => t("Overlay ein/aus") },
  { type: "record", label: () => t("Aufnahme starten/stoppen") },
  { type: "replay", label: () => t("Replay speichern") },
  { type: "folder", label: () => t("Ordner öffnen") },
  { type: "back", label: () => t("Zurück") },
  { type: "open", label: () => t("Seite der App öffnen") },
  { type: "none", label: () => t("Leer (nur Beschriftung)") },
];

export const newId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;

/** Grid for the current screen: landscape swaps columns and rows ("dynamic orientation"). */
export function gridFor(d: Pick<Deck, "cols" | "rows">, landscape: boolean) {
  return landscape ? { cols: d.rows, rows: d.cols } : { cols: d.cols, rows: d.rows };
}

/** The command a key press sends – null for keys that only navigate inside the app. */
export function commandFor(a: DeckAction): { method: string; params: Record<string, unknown> } | null {
  switch (a.type) {
    case "launch": return { method: "library.launch", params: { id: a.ref } };
    case "quick": return null; // runs through runQuickAction (asks first if the action requires it)
    case "sound": return { method: "sounds.play", params: { id: a.ref } };
    case "stopSounds": return { method: "sounds.stopAll", params: {} };
    case "profile": return { method: "profiles.activate", params: { id: a.ref } };
    case "revertProfile": return { method: "profiles.revert", params: {} };
    case "media": return { method: "media.key", params: { key: a.ref } };
    case "overlay": return { method: "overlay.toggle", params: {} };
    case "record": return { method: "capture.recordToggle", params: {} };
    case "replay": return { method: "capture.replaySave", params: {} };
    default: return null;
  }
}

/** Places keys by slot; a deck made for portrait keeps its order in landscape (row by row). */
export function slots(page: DeckPage | undefined, cols: number, rows: number): (DeckKey | null)[] {
  const out: (DeckKey | null)[] = Array(cols * rows).fill(null);
  for (const k of page?.keys ?? []) if (k.slot >= 0 && k.slot < out.length) out[k.slot] = k;
  return out;
}

export function firstFreeSlot(page: DeckPage, total: number) {
  const used = new Set(page.keys.map((k) => k.slot));
  for (let i = 0; i < total; i++) if (!used.has(i)) return i;
  return -1;
}

/** Moves a key to another slot; a key already there swaps places. */
export function moveKey(page: DeckPage, keyId: string, slot: number): DeckPage {
  const k = page.keys.find((x) => x.id === keyId);
  if (!k) return page;
  const other = page.keys.find((x) => x.slot === slot && x.id !== keyId);
  return { ...page, keys: page.keys.map((x) => (x.id === keyId ? { ...x, slot } : other && x.id === other.id ? { ...x, slot: k.slot } : x)) };
}

/** Changing the grid: keys that no longer fit are not lost but moved to free places (or reported). */
export function resize(d: Deck, cols: number, rows: number): { deck: Deck; dropped: number } {
  const total = cols * rows;
  let dropped = 0;
  const pages = d.pages.map((p) => {
    const keep = p.keys.filter((k) => k.slot < total);
    const move = p.keys.filter((k) => k.slot >= total);
    const page = { ...p, keys: keep };
    for (const k of move) {
      const free = firstFreeSlot(page, total);
      if (free < 0) { dropped++; continue; }
      page.keys = [...page.keys, { ...k, slot: free }];
    }
    return page;
  });
  return { deck: { ...d, cols, rows, pages }, dropped };
}

/** A first deck from what the user already has: favourite games, programs, quick actions, sounds and profiles. */
export function starterDeck(items: LibraryItem[], quick: QuickAction[], sounds: Sound[], profiles: Profile[]): Deck {
  const main: DeckPage = { id: "main", name: t("Start"), keys: [] };
  const soundsPage: DeckPage = { id: "sounds", name: t("Sounds"), keys: [] };
  const profPage: DeckPage = { id: "profiles", name: t("Profile"), keys: [] };
  const cols = 3, rows = 5, total = cols * rows;
  const add = (p: DeckPage, k: Omit<DeckKey, "id" | "slot">) => { const s = firstFreeSlot(p, total); if (s >= 0) p.keys.push({ ...k, id: newId("key"), slot: s }); };
  const games = [...items].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  // Real logos where known (Discord, OBS, Valorant …) on the brand's colour, otherwise the game's picture.
  const face = (i: LibraryItem, fallback: string): Pick<DeckKey, "icon" | "color"> => {
    const b = brandFor(i);
    if (b && (i.kind === "program" || !(i.coverUrl || i.iconData))) return { icon: `brand:${b.id}`, color: brandBg(b) };
    return i.coverUrl || i.iconData ? { icon: "cover", color: "#1e293b" } : { icon: fallback, color: "#4f46e5" };
  };
  for (const i of games.filter((g) => g.kind === "game").slice(0, 6)) add(main, { label: i.name.slice(0, 24), ...face(i, "icon:gamepad-2"), action: { type: "launch", ref: i.id } });
  for (const i of games.filter((g) => g.kind === "program").slice(0, 3)) add(main, { label: i.name.slice(0, 24), ...face(i, "icon:monitor"), action: { type: "launch", ref: i.id } });
  for (const q of quick.slice(0, 2)) add(main, { label: q.name.slice(0, 24), icon: "icon:zap", color: "#7c3aed", action: { type: "quick", ref: q.id } });
  add(main, { label: t("Sounds"), icon: "icon:music", color: "#0284c7", action: { type: "folder", ref: "sounds" } });
  add(main, { label: t("Profile"), icon: "icon:swords", color: "#db2777", action: { type: "folder", ref: "profiles" } });
  add(main, { label: t("Leiser"), icon: "icon:volume-1", color: "#0d9488", action: { type: "media", ref: "voldown" } });
  add(main, { label: t("Lauter"), icon: "icon:volume-2", color: "#16a34a", action: { type: "media", ref: "volup" } });
  add(soundsPage, { label: t("Zurück"), icon: "icon:arrow-left", color: "#475569", action: { type: "back" } });
  add(soundsPage, { label: t("Stopp"), icon: "icon:square", color: "#dc2626", action: { type: "stopSounds" } });
  for (const s of [...sounds].sort((a, b) => Number(b.favorite) - Number(a.favorite)).slice(0, total - 2)) add(soundsPage, { label: s.name.slice(0, 24), icon: "icon:music", color: s.color && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : "#0f766e", action: { type: "sound", ref: s.id } });
  add(profPage, { label: t("Zurück"), icon: "icon:arrow-left", color: "#475569", action: { type: "back" } });
  for (const p of profiles.slice(0, total - 2)) add(profPage, { label: p.name.slice(0, 24), icon: `icon:${p.icon}`, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#1e293b", textColor: "#04121a", action: { type: "profile", ref: p.id } });
  add(profPage, { label: t("Vorheriges"), icon: "icon:undo-2", color: "#475569", action: { type: "revertProfile" } });
  return { id: newId("deck"), name: t("Mein Deck"), cols, rows, pages: [main, soundsPage, profPage] };
}

/** Readable text colour for a key colour. */
export function textOn(hex?: string | null) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!m) return "#ffffff";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#04121a" : "#ffffff";
}

/** Shrinks an uploaded picture to a small square key image (server limit ~40 KB). */
export async function keyImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(t("Bitte ein Bild (PNG, JPEG, WebP) wählen."));
  const bmp = await createImageBitmap(file);
  const size = 144;
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const s = Math.min(bmp.width, bmp.height);
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  for (const q of [0.85, 0.7, 0.5]) {
    const url = c.toDataURL("image/webp", q);
    const data = url.startsWith("data:image/webp") ? url : c.toDataURL("image/jpeg", q);
    if (data.length <= 58000) return data;
  }
  throw new Error(t("Bild ist zu groß."));
}
