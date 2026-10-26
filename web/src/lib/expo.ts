// Virtual exhibition: rooms (walls 16:9) on which own posters, collector cards and museum photos hang. Positions in
// percent of the wall, so the same exhibition looks the same on phone, iPad and PC. Journal kind "expo".

export type ExpoTemplate = "gallery" | "neon" | "wood" | "space" | "museum";
export const EXPO_TEMPLATES: { id: ExpoTemplate; label: string; wall: [string, string]; floor: string; light: string }[] = [
  { id: "gallery", label: "Weiße Galerie", wall: ["#f4f4f5", "#d4d4d8"], floor: "#a1a1aa", light: "rgba(255,255,255,0.7)" },
  { id: "museum", label: "Museum (dunkelrot)", wall: ["#4c0519", "#1c0410"], floor: "#3f2a1d", light: "rgba(253,230,138,0.35)" },
  { id: "neon", label: "Neon-Lounge", wall: ["#0b0620", "#1e0b3a"], floor: "#05030d", light: "rgba(34,211,238,0.35)" },
  { id: "wood", label: "Holz-Hütte", wall: ["#7c4a21", "#4a2a12"], floor: "#2b1a0c", light: "rgba(254,215,170,0.3)" },
  { id: "space", label: "Raumstation", wall: ["#0f172a", "#020617"], floor: "#1e293b", light: "rgba(148,163,184,0.3)" },
];
export type FrameStyle = "none" | "thin" | "gold" | "neon";

export interface ExpoItem { id: string; ref: string; x: number; y: number; w: number; caption: string; frame: FrameStyle }
export interface ExpoRoom { id: string; title: string; description: string; template: ExpoTemplate | null; items: ExpoItem[] }
export interface Expo { title: string; description: string; template: ExpoTemplate; rooms: ExpoRoom[] }

export const MAX_ROOMS = 8, MAX_ITEMS = 40;
const REF = /^(card|design|photo):j_[A-Za-z0-9_-]{6,40}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const rid = () => Math.random().toString(36).slice(2, 10);
const tpl = (v: unknown): ExpoTemplate | null => (EXPO_TEMPLATES.some((t) => t.id === v) ? (v as ExpoTemplate) : null);

export function sanitizeExpo(raw: unknown): Expo {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rooms = (Array.isArray(r.rooms) ? r.rooms : []).slice(0, MAX_ROOMS).map((x): ExpoRoom => {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" && /^[a-z0-9]{4,12}$/.test(o.id) ? o.id : rid(),
      title: str(o.title, 60) || "Raum", description: str(o.description, 300), template: tpl(o.template),
      items: (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).flatMap((it): ExpoItem[] => {
        const i = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        if (typeof i.ref !== "string" || !REF.test(i.ref)) return [];
        const w = num(i.w, 5, 80, 20);
        return [{ id: typeof i.id === "string" && /^[a-z0-9]{4,12}$/.test(i.id) ? i.id : rid(), ref: i.ref, w, x: num(i.x, 0, 100 - w, 5), y: num(i.y, 0, 95, 10), caption: str(i.caption, 80), frame: (["none", "thin", "gold", "neon"] as const).includes(i.frame as FrameStyle) ? (i.frame as FrameStyle) : "thin" }];
      }),
    };
  });
  return { title: str(r.title, 60) || "Meine Ausstellung", description: str(r.description, 500), template: tpl(r.template) ?? "gallery", rooms: rooms.length ? rooms : [{ id: rid(), title: "Raum 1", description: "", template: null, items: [] }] };
}

export const newExpo = (title = "Meine Ausstellung", template: ExpoTemplate = "gallery"): Expo => sanitizeExpo({ title, template, rooms: [{ title: "Raum 1" }] });

/** A new picture on the wall: next free spot in a 4-column grid, then on top of the others. */
export function placeItem(room: ExpoRoom, ref: string): ExpoRoom {
  if (room.items.length >= MAX_ITEMS || !REF.test(ref)) return room;
  const n = room.items.length, col = n % 4, row = Math.floor(n / 4) % 3;
  return { ...room, items: [...room.items, { id: rid(), ref, w: 18, x: 4 + col * 24, y: 8 + row * 30, caption: "", frame: "thin" }] };
}

export function moveItem(room: ExpoRoom, id: string, x: number, y: number): ExpoRoom {
  return { ...room, items: room.items.map((i) => (i.id === id ? { ...i, x: num(x, 0, 100 - i.w, i.x), y: num(y, 0, 95, i.y) } : i)) };
}

export function resizeItem(room: ExpoRoom, id: string, w: number): ExpoRoom {
  return { ...room, items: room.items.map((i) => { if (i.id !== id) return i; const nw = num(w, 5, 80, i.w); return { ...i, w: nw, x: Math.min(i.x, 100 - nw) }; }) };
}

/** Removes pictures whose card/poster/photo was deleted – no broken spots on the wall. */
export function dropMissing(expo: Expo, exists: (ref: string) => boolean): Expo {
  return { ...expo, rooms: expo.rooms.map((r) => ({ ...r, items: r.items.filter((i) => exists(i.ref)) })) };
}

export const roomTemplate = (expo: Expo, room: ExpoRoom) => EXPO_TEMPLATES.find((t) => t.id === (room.template ?? expo.template)) ?? EXPO_TEMPLATES[0];
