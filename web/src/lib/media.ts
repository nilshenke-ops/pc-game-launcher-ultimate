// Medien: photo museum, memory book, screenshot sorting, clip moments, soundtracks – pure logic, tested in media.test.ts.
// Nothing here guesses: a capture date comes from the picture's EXIF data or is called "file date", duplicates are only
// files with the same SHA-256, a link jumps to a time only where the site documents it.

import { csvCell } from "./collections";

// ------------------------------------------------------------------------------------------ EXIF (JPEG)

/** DateTimeOriginal (or DateTime) of a JPEG as local "YYYY-MM-DDTHH:MM:SS"; null when the picture has none. */
export function exifDate(buf: ArrayBuffer): string | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null;
    const marker = v.getUint8(p + 1), len = v.getUint16(p + 2);
    if (marker === 0xda || len < 2) return null; // image data starts: no EXIF before it
    if (marker === 0xe1 && p + 10 <= v.byteLength && v.getUint32(p + 4) === 0x45786966 && v.getUint16(p + 8) === 0) return tiffDate(v, p + 10, Math.min(v.byteLength, p + 2 + len));
    p += 2 + len;
  }
  return null;
}

function tiffDate(v: DataView, t: number, end: number): string | null {
  if (t + 8 > end) return null;
  const le = v.getUint16(t) === 0x4949;
  if (!le && v.getUint16(t) !== 0x4d4d) return null;
  const u16 = (o: number) => v.getUint16(o, le), u32 = (o: number) => v.getUint32(o, le);
  const tags = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>();
    if (ifd + 2 > end) return out;
    const n = u16(ifd);
    for (let i = 0; i < n && ifd + 2 + i * 12 + 12 <= end; i++) {
      const e = ifd + 2 + i * 12;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 });
    }
    return out;
  };
  const ascii = (e?: { type: number; count: number; at: number }) => {
    if (!e || e.type !== 2 || e.count < 19) return null;
    const o = e.count > 4 ? t + u32(e.at) : e.at;
    if (o + 19 > end) return null;
    let s = "";
    for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(o + i));
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m || m[1] === "0000") return null;
    return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  };
  const ifd0 = tags(t + u32(t + 4));
  const exifPtr = ifd0.get(0x8769);
  const fromExif = exifPtr ? ascii(tags(t + u32(exifPtr.at)).get(0x9003)) : null;
  return fromExif ?? ascii(ifd0.get(0x0132));
}

// ------------------------------------------------------------------------------------------ files, duplicates, sorting

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatOf(name: string, mime?: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? mime?.split("/")[1]?.toLowerCase() ?? "";
  return ext === "jpeg" ? "JPG" : ext.toUpperCase();
}

export const SIZE_RANGES = [
  { key: "s", label: "unter 1 MB", min: 0, max: 1024 ** 2 },
  { key: "m", label: "1–10 MB", min: 1024 ** 2, max: 10 * 1024 ** 2 },
  { key: "l", label: "10–100 MB", min: 10 * 1024 ** 2, max: 100 * 1024 ** 2 },
  { key: "xl", label: "über 100 MB", min: 100 * 1024 ** 2, max: Infinity },
] as const;

/** One list over PC captures and museum photos (the sorting page). */
export interface MediaItem {
  key: string; src: "pc" | "photo"; id: string; name: string; kind: "image" | "video";
  /** ISO time, or only "YYYY-MM-DD" when just the day is known (museum photos) – no made-up time of day. */
  game: string | null; date: string; size: number | null; format: string;
  favorite: boolean; tags: string[]; category: string | null; hash?: string | null;
}

export interface MediaFilter { src?: "" | "pc" | "photo"; kind?: "" | "image" | "video"; format?: string; size?: string; fav?: boolean; tag?: string; category?: string; game?: string; q?: string }

export function filterMedia(items: MediaItem[], f: MediaFilter): MediaItem[] {
  const range = SIZE_RANGES.find((r) => r.key === f.size);
  const q = f.q?.trim().toLowerCase() ?? "";
  return items.filter((i) => (!f.src || i.src === f.src) && (!f.kind || i.kind === f.kind) && (!f.format || i.format === f.format)
    && (!range || (i.size != null && i.size >= range.min && i.size < range.max)) && (!f.fav || i.favorite)
    && (!f.tag || i.tags.some((x) => x.toLowerCase() === f.tag!.toLowerCase())) && (!f.category || i.category === f.category)
    && (!f.game || (f.game === "-" ? !i.game : i.game === f.game))
    && (!q || [i.name, i.game ?? "", i.category ?? "", ...i.tags].some((s) => s.toLowerCase().includes(q))));
}

export type MediaSort = "date" | "name" | "game" | "size";

export function sortMedia(items: MediaItem[], by: MediaSort, desc: boolean): MediaItem[] {
  const cmp = (a: MediaItem, b: MediaItem) => {
    switch (by) {
      case "name": return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      case "game": return (a.game ?? "￿").localeCompare(b.game ?? "￿") || Date.parse(a.date) - Date.parse(b.date);
      case "size": return (a.size ?? -1) - (b.size ?? -1);
      default: return Date.parse(a.date) - Date.parse(b.date);
    }
  };
  const s = [...items].sort(cmp);
  // Items without a game stay last also when descending.
  return desc ? (by === "game" ? [...s.filter((i) => i.game).reverse(), ...s.filter((i) => !i.game)] : s.reverse()) : s;
}

/** Items that share a size with another item – only those need a checksum (different size = never identical). */
export function sizeCandidates(items: MediaItem[]): MediaItem[] {
  const n = new Map<string, number>();
  const k = (i: MediaItem) => `${i.src}:${i.size}`;
  for (const i of items) if (i.size != null) n.set(k(i), (n.get(k(i)) ?? 0) + 1);
  return items.filter((i) => i.size != null && (n.get(k(i)) ?? 0) > 1);
}

/** Groups of identical files: same source and same SHA-256 (a PC file and a museum copy are never compared – the museum keeps a smaller copy). */
export function duplicateGroups(items: MediaItem[]): MediaItem[][] {
  const m = new Map<string, MediaItem[]>();
  for (const i of items) if (i.hash) m.set(`${i.src}:${i.hash}`, [...(m.get(`${i.src}:${i.hash}`) ?? []), i]);
  return [...m.values()].filter((g) => g.length > 1).map((g) => [...g].sort((a, b) => Date.parse(a.date) - Date.parse(b.date)));
}

export function mediaCsv(items: MediaItem[]): string {
  const head = ["Quelle", "Name", "Art", "Spiel", "Datum", "Größe (Bytes)", "Format", "Favorit", "Kategorie", "Tags", "SHA-256"];
  const rows = items.map((i) => [i.src === "pc" ? "PC" : "Fotomuseum", i.name, i.kind === "video" ? "Video" : "Bild", i.game ?? "", i.date, i.size == null ? "" : String(i.size), i.format, i.favorite ? "ja" : "nein", i.category ?? "", i.tags.join(", "), i.hash ?? ""]);
  return "﻿" + [head, ...rows].map((l) => l.map(csvCell).join(";")).join("\r\n");
}

// ------------------------------------------------------------------------------------------ clip moments

/** "1:02:03", "2:05", "125", "1h2m3s", "2m5s" → seconds; null when it is not a time. */
export function parseTime(s: string): number | null {
  const v = s.trim().toLowerCase();
  if (!v) return null;
  let m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  if (m && (m[1] || m[2] || m[3])) return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
  m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(v);
  if (m) { if (+m[3] > 59 || (m[1] && +m[2] > 59)) return null; return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3]; }
  if (/^\d{1,6}$/.test(v)) return +v;
  return null;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * The link opened at a time – only where it is documented: YouTube (t=…s), Twitch videos (t=…h…m…s) and plain video
 * files (#t=…, Media Fragments). Anything else: null (the link opens at the start).
 */
export function linkAt(url: string, sec: number): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const s = Math.max(0, Math.floor(sec));
  if (host === "youtu.be" || ((host === "youtube.com" || host === "music.youtube.com") && (u.pathname === "/watch" || u.pathname.startsWith("/live/") || u.pathname.startsWith("/shorts/")))) { u.searchParams.set("t", `${s}s`); return u.toString(); }
  if (host === "twitch.tv" && /^\/videos\/\d+/.test(u.pathname)) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    u.searchParams.set("t", `${h}h${m}m${r}s`); return u.toString();
  }
  if (/\.(mp4|webm|m4v|mov|ogv)$/i.test(u.pathname)) { u.hash = `t=${s}`; return u.toString(); }
  return null;
}

// ------------------------------------------------------------------------------------------ soundtracks

const SERVICES: [RegExp, string][] = [
  [/(^|\.)spotify\.com$/, "Spotify"], [/(^|\.)music\.apple\.com$/, "Apple Music"], [/^music\.youtube\.com$/, "YouTube Music"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "YouTube"], [/(^|\.)bandcamp\.com$/, "Bandcamp"], [/(^|\.)soundcloud\.com$/, "SoundCloud"],
  [/(^|\.)deezer\.com$/, "Deezer"], [/(^|\.)tidal\.com$/, "Tidal"], [/^music\.amazon\.[a-z.]+$/, "Amazon Music"],
  [/^store\.steampowered\.com$/, "Steam"], [/(^|\.)qobuz\.com$/, "Qobuz"],
];

/** Name of the music service a link points to; null for other sites (shown as "Website"). */
export function musicService(url: string): string | null {
  try { const h = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); return SERVICES.find(([rx]) => rx.test(h))?.[1] ?? null; } catch { return null; }
}

// ------------------------------------------------------------------------------------------ memory book timeline

/** Entries by year and month, newest first (dates "YYYY-MM-DD" or ISO). */
export function timeline<T extends { date: string }>(items: T[]): { year: number; months: { month: number; items: T[] }[] }[] {
  const valid = items.filter((i) => !isNaN(Date.parse(i.date))).sort((a, b) => b.date.localeCompare(a.date));
  const years: { year: number; months: { month: number; items: T[] }[] }[] = [];
  for (const i of valid) {
    const y = +i.date.slice(0, 4), m = +i.date.slice(5, 7);
    let Y = years.find((x) => x.year === y);
    if (!Y) years.push(Y = { year: y, months: [] });
    let M = Y.months.find((x) => x.month === m);
    if (!M) Y.months.push(M = { month: m, items: [] });
    M.items.push(i);
  }
  return years;
}
