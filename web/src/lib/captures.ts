// Screenshots and clips on the PC. The list and the thumbnails seen once are kept on this device, so the library can be
// browsed without the PC; favorites and tags made then are queued. Opening the full file needs the PC (unless saved).

import { useEffect, useState } from "react";
import { client } from "./rpc";

export interface Capture {
  id: string; name: string; folder: string; kind: "image" | "video"; size: number; taken: string;
  game?: string | null; itemId?: string | null; favorite: boolean; tags: string[]; category?: string | null;
}
export interface CaptureList {
  items: Capture[];
  folders: { label: string; source: string; path: string; exists: boolean }[];
  scannedAt?: string | null; scanning: boolean; truncated: boolean; canRecycle: boolean;
}

export type GroupBy = "game" | "day" | "folder";

/** Groups in display order (newest first inside). Items without a recognized game go to "Ohne Spiel". */
export function groupCaptures(items: Capture[], by: GroupBy, noGame: string): [string, Capture[]][] {
  const map = new Map<string, Capture[]>();
  for (const c of items) {
    const key = by === "game" ? (c.game ?? noGame) : by === "folder" ? c.folder : new Date(c.taken).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  const groups = [...map.entries()];
  if (by !== "day") groups.sort((a, b) => (a[0] === noGame ? 1 : b[0] === noGame ? -1 : Date.parse(b[1][0].taken) - Date.parse(a[1][0].taken)));
  return groups;
}

export function filterCaptures(items: Capture[], kind: "all" | "image" | "video" | "fav", q: string) {
  const s = q.trim().toLowerCase();
  return items.filter((c) => (kind === "all" || (kind === "fav" ? c.favorite : c.kind === kind))
    && (!s || c.name.toLowerCase().includes(s) || (c.game ?? "").toLowerCase().includes(s) || c.tags.some((t) => t.toLowerCase().includes(s))));
}

// ------------------------------------------------------------------ thumbnails kept on this device

const DB = "pgl-thumbs", STORE = "thumbs", MAX = 600;
interface ThumbRow { id: string; url: string | null; at: number }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no idb")); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function getMany(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  try {
    const db = await open();
    await Promise.all(ids.map((id) => new Promise<void>((res) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => { const r = req.result as ThumbRow | undefined; if (r) out.set(id, r.url); res(); };
      req.onerror = () => res();
    })));
  } catch { /* no storage: thumbnails only while connected */ }
  return out;
}

async function putMany(rows: ThumbRow[]) {
  try {
    const db = await open();
    const st = db.transaction(STORE, "readwrite").objectStore(STORE);
    rows.forEach((r) => st.put(r));
    const count = st.count();
    count.onsuccess = () => {
      if (count.result <= MAX) return;
      // Oldest first out (a cursor over all rows is fine at this size).
      const all = db.transaction(STORE).objectStore(STORE).getAll();
      all.onsuccess = () => {
        const drop = (all.result as ThumbRow[]).sort((a, b) => a.at - b.at).slice(0, count.result - MAX);
        const w = db.transaction(STORE, "readwrite").objectStore(STORE);
        drop.forEach((d) => w.delete(d.id));
      };
    };
  } catch { /* storage full or blocked */ }
}

const memory = new Map<string, string | null>();

/** A picture without a thumbnail from the PC (e.g. no Windows shell): made here from the file, 320 px JPEG. */
async function makeThumb(c: Capture): Promise<string | null> {
  if (c.kind !== "image" || c.size > 6 * 1024 * 1024 || typeof createImageBitmap === "undefined") return null;
  try {
    const bmp = await createImageBitmap(await readCapture(c));
    const scale = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch { return null; }
}

/** Thumbnails for the shown items: from memory, then this device, then the PC (24 per request); pictures the PC has
 * no thumbnail for are made here once. */
export function useThumbs(items: Capture[], online: boolean): Map<string, string | null> {
  const ids = items.map((c) => c.id);
  const [, bump] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = ids.filter((id) => !memory.has(id));
      if (!missing.length) return;
      const stored = await getMany(missing);
      stored.forEach((v, k) => memory.set(k, v));
      if (stored.size && !cancelled) bump((n) => n + 1);
      const fromPc = missing.filter((id) => !stored.has(id));
      if (!online || !fromPc.length) return;
      for (let i = 0; i < fromPc.length && !cancelled; i += 24) {
        try {
          const r = await client.call<{ thumbs: Record<string, string | null> }>("captures.thumbs", { ids: fromPc.slice(i, i + 24) });
          const rows = Object.entries(r.thumbs).map(([id, url]) => ({ id, url, at: Date.now() }));
          rows.forEach((x) => memory.set(x.id, x.url));
          void putMany(rows.filter((x) => x.url));
          if (!cancelled) bump((n) => n + 1);
          for (const row of rows.filter((x) => !x.url)) {
            if (cancelled) break;
            const c = items.find((x) => x.id === row.id);
            const url = c ? await makeThumb(c) : null;
            if (url) { memory.set(row.id, url); void putMany([{ id: row.id, url, at: Date.now() }]); bump((n) => n + 1); }
          }
        } catch { break; }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, online]);
  return memory;
}

/** The whole file from the PC, in pieces. */
export async function readCapture(c: Capture, onProgress?: (p: number) => void): Promise<Blob> {
  const parts: Uint8Array[] = [];
  for (let off = 0; ;) {
    const r = await client.call<{ data: string; size: number; eof: boolean }>("captures.read", { id: c.id, offset: off, length: 384 * 1024 });
    const s = atob(r.data);
    const chunk = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) chunk[i] = s.charCodeAt(i);
    parts.push(chunk); off += chunk.length;
    onProgress?.(r.size ? off / r.size : 1);
    if (r.eof || chunk.length === 0) break;
  }
  const ext = c.name.toLowerCase().split(".").pop() ?? "";
  const type = c.kind === "image" ? (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`) : ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4";
  return new Blob(parts as BlobPart[], { type });
}
