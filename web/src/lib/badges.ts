// Website badges: given only for things that really exist in the saved data (counted live from the journal), with
// the condition and the progress shown. Nothing is stored as "earned" without the data – the date of the first time a
// condition was met is kept (entry "j_badgedates"), but a badge is only shown as earned while its condition holds.

import { bingoLines, type Bingo } from "./play";

export type Counter =
  | "collections" | "projects" | "notes" | "bingo" | "cards" | "posters" | "banners" | "expos"
  | "photos" | "memories" | "builds" | "worlds" | "players" | "servers";

/** What each counter counts, so the condition can be shown in words. */
export const COUNTERS: Record<Counter, { label: string; kinds: string[] }> = {
  collections: { label: "Sammlungen (Foto-Sammlungen und Fundstücke-Sammlungen)", kinds: ["album", "find"] },
  projects: { label: "Bauprojekte", kinds: ["project"] },
  notes: { label: "Notizen „Wo war ich?“", kinds: ["memory"] },
  bingo: { label: "Bingo-Karten mit mindestens einer vollen Reihe", kinds: ["bingo"] },
  cards: { label: "Eigene Sammelkarten", kinds: ["card"] },
  posters: { label: "Poster und Cover", kinds: ["design"] },
  banners: { label: "Banner und Profilbilder", kinds: ["design"] },
  expos: { label: "Ausstellungen", kinds: ["expo"] },
  photos: { label: "Fotos im Fotomuseum", kinds: ["photo"] },
  memories: { label: "Einträge im Erinnerungsbuch", kinds: ["book"] },
  builds: { label: "Builds / Loadouts", kinds: ["build"] },
  worlds: { label: "Minecraft-Welten", kinds: ["world"] },
  players: { label: "Spieler-Karten", kinds: ["player"] },
  servers: { label: "Server-Favoriten", kinds: ["server"] },
};

export type BadgeTier = "bronze" | "silver" | "gold" | "diamond";
export interface BadgeDef { id: string; name: string; description: string; icon: string; tier: BadgeTier; counter: Counter; need: number; custom?: boolean }

export const BADGES: BadgeDef[] = [
  { id: "first-collection", name: "Sammler", description: "Erste Sammlung angelegt", icon: "Images", tier: "bronze", counter: "collections", need: 1 },
  { id: "first-project", name: "Baumeister", description: "Erstes Bauprojekt erstellt", icon: "Hammer", tier: "bronze", counter: "projects", need: 1 },
  { id: "ten-notes", name: "Chronist", description: "Zehn persönliche Notizen gespeichert", icon: "NotebookPen", tier: "silver", counter: "notes", need: 10 },
  { id: "first-bingo", name: "Bingo!", description: "Erstes Bingo abgeschlossen (eine volle Reihe, Spalte oder Diagonale)", icon: "Grid3x3", tier: "bronze", counter: "bingo", need: 1 },
  { id: "first-card", name: "Kartenkünstler", description: "Erste eigene Sammelkarte gestaltet", icon: "IdCard", tier: "bronze", counter: "cards", need: 1 },
  { id: "card-deck", name: "Eigenes Deck", description: "Zwölf eigene Sammelkarten gestaltet", icon: "Layers", tier: "gold", counter: "cards", need: 12 },
  { id: "first-poster", name: "Plakatkunst", description: "Erstes Poster oder Cover gestaltet", icon: "Frame", tier: "bronze", counter: "posters", need: 1 },
  { id: "first-banner", name: "Aushängeschild", description: "Erstes Banner oder Profilbild gestaltet", icon: "PanelTop", tier: "bronze", counter: "banners", need: 1 },
  { id: "first-expo", name: "Kurator", description: "Erste Ausstellung eröffnet", icon: "Landmark", tier: "silver", counter: "expos", need: 1 },
  { id: "photos-25", name: "Museumsdirektor", description: "25 Fotos im Fotomuseum", icon: "Camera", tier: "silver", counter: "photos", need: 25 },
  { id: "memories-10", name: "Erinnerungsbuch", description: "Zehn Erinnerungen aufgeschrieben", icon: "BookHeart", tier: "silver", counter: "memories", need: 10 },
  { id: "first-player", name: "Gemeinsam stark", description: "Erste Spieler-Karte für einen Freund angelegt", icon: "Users", tier: "bronze", counter: "players", need: 1 },
];

export interface CountInput { kind: string; data: unknown }

/** Counts from journal entries (already without deleted ones). */
export function countAll(entries: CountInput[]): Record<Counter, number> {
  const out = Object.fromEntries(Object.keys(COUNTERS).map((k) => [k, 0])) as Record<Counter, number>;
  for (const e of entries) {
    for (const [k, def] of Object.entries(COUNTERS) as [Counter, (typeof COUNTERS)[Counter]][]) {
      if (!def.kinds.includes(e.kind)) continue;
      if (k === "bingo") { const b = e.data as Bingo; if (Array.isArray(b?.cells) && bingoLines(b.cells, b.size).length > 0) out.bingo++; continue; }
      if (k === "posters" || k === "banners") { const area = (e.data as { area?: string })?.area === "banner" ? "banners" : "posters"; if (area === k) out[k]++; continue; }
      out[k]++;
    }
  }
  return out;
}

export interface BadgeState { def: BadgeDef; have: number; earned: boolean; since: string | null }

/** Earned = the condition holds now. `dates` remembers when it was first met (shown, never used to award). */
export function evaluate(defs: BadgeDef[], counts: Record<Counter, number>, dates: Record<string, string>): { states: BadgeState[]; newDates: Record<string, string> } {
  const newDates: Record<string, string> = {};
  const states = defs.map((def) => {
    const have = counts[def.counter] ?? 0;
    const earned = have >= def.need;
    let since = dates[def.id] ?? null;
    if (earned && !since) { since = new Date().toISOString(); newDates[def.id] = since; }
    return { def, have, earned, since: earned ? since : null };
  });
  return { states, newDates };
}

/** Own badges: name, counter and target from the user – checked like the built-in ones. */
export function sanitizeCustomBadge(raw: unknown, id: string): BadgeDef | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 40) : "";
  if (!name || !(typeof r.counter === "string" && r.counter in COUNTERS)) return null;
  const need = Math.round(Number(r.need));
  if (!Number.isFinite(need) || need < 1 || need > 10000) return null;
  return {
    id, name, custom: true, counter: r.counter as Counter, need,
    description: typeof r.description === "string" && r.description.trim() ? r.description.trim().slice(0, 120) : `${need} × ${COUNTERS[r.counter as Counter].label}`,
    icon: typeof r.icon === "string" && /^[A-Za-z0-9]{2,30}$/.test(r.icon) ? r.icon : "Award",
    tier: (["bronze", "silver", "gold", "diamond"] as const).includes(r.tier as BadgeTier) ? (r.tier as BadgeTier) : "bronze",
  };
}

export const TIER_COLOR: Record<BadgeTier, string> = { bronze: "#d08b57", silver: "#cbd5e1", gold: "#facc15", diamond: "#67e8f9" };
