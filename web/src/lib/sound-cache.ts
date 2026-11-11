// The soundboard without the PC: while the phone is connected it keeps a copy of every sound in the device storage (IndexedDB); without the PC
// the tiles play that copy on the phone itself (lib/local-sounds.ts). The files come from the PC in small pieces (sounds.fetch), one sound after
// the other in the background, and only what changed. Per file at most 12 MB, in total at most 120 MB – the oldest copies make room.

import { useSyncExternalStore } from "react";
import { client } from "./rpc";
import type { Sound } from "./types";

const DB = "pgl-sounds", STORE = "sounds";
export const MAX_FILE_BYTES = 12 * 1024 * 1024, MAX_TOTAL_BYTES = 120 * 1024 * 1024;
interface Rec { id: string; sha: string; format: string; blob: Blob; at: number }
export interface SoundCacheState { cached: ReadonlySet<string>; busy: boolean; done: number; total: number; error: string | null; available: boolean }

const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", m4a: "audio/mp4", wma: "audio/x-ms-wma", ogg: "audio/ogg" };
export const soundMime = (format: string) => MIME[format.toLowerCase()] ?? "audio/mpeg";

let dbp: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return (dbp ??= new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  }));
}
const req = <T,>(r: IDBRequest<T>) => new Promise<T | null>((res) => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); });

async function all(): Promise<Rec[]> { const db = await open(); if (!db) return []; return (await req(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<Rec[]>)) ?? []; }
export async function getCachedSound(id: string): Promise<Rec | null> { const db = await open(); if (!db) return null; return (await req(db.transaction(STORE).objectStore(STORE).get(id) as IDBRequest<Rec | undefined>)) ?? null; }
async function put(rec: Rec) { const db = await open(); if (!db) return; await new Promise<void>((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(rec); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
async function drop(id: string) { const db = await open(); if (!db) return; await new Promise<void>((res) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }

let state: SoundCacheState = { cached: new Set(), busy: false, done: 0, total: 0, error: null, available: typeof indexedDB !== "undefined" };
const listeners = new Set<() => void>();
const publish = (p: Partial<SoundCacheState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };
export const useSoundCache = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);
export const soundCacheState = () => state;

/** Reads which sounds are already on this device (at start, so offline pages know immediately). */
export async function loadCachedIds() { publish({ cached: new Set((await all()).map((r) => r.id)) }); }
void loadCachedIds();

const toBytes = (b64: string) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };

async function download(s: Sound): Promise<Rec> {
  const parts: Uint8Array[] = []; let offset = 0, sha = s.sha256, format = s.format;
  for (;;) {
    const r = await client.call<{ data: string; total: number; format: string; sha256: string; done: boolean }>("sounds.fetch", { id: s.id, offset, length: 262_144 });
    const chunk = toBytes(r.data); parts.push(chunk); offset += chunk.length; sha = r.sha256 || sha; format = r.format || format;
    if (r.done || chunk.length === 0) break;
    if (offset > MAX_FILE_BYTES) throw new Error("zu groß");
  }
  return { id: s.id, sha, format, blob: new Blob(parts as BlobPart[], { type: soundMime(format) }), at: Date.now() };
}

let running = false;
/** Fetches what is missing or changed. Quiet in the background; stops by itself when the PC goes away. */
export async function syncSoundCache(sounds: Sound[], missingOnPc: ReadonlySet<string> = new Set()): Promise<void> {
  if (running || !state.available || client.status.phase !== "online" || client.status.auth !== "ok") return;
  running = true;
  try {
    const have = new Map((await all()).map((r) => [r.id, r]));
    const ids = new Set(sounds.map((s) => s.id));
    for (const id of have.keys()) if (!ids.has(id)) { await drop(id); have.delete(id); }              // deleted at the PC: gone here too
    const todo = sounds.filter((s) => !missingOnPc.has(s.id) && s.size <= MAX_FILE_BYTES && have.get(s.id)?.sha !== s.sha256);
    let bytes = [...have.values()].reduce((n, r) => n + r.blob.size, 0);
    publish({ busy: todo.length > 0, done: 0, total: todo.length, error: null, cached: new Set(have.keys()) });
    let done = 0;
    for (const s of todo) {
      if (client.status.phase !== "online") break;
      if (bytes + s.size > MAX_TOTAL_BYTES) {                                                         // full: the oldest copy makes room
        const oldest = [...have.values()].sort((a, b) => a.at - b.at)[0];
        if (!oldest) break;
        await drop(oldest.id); have.delete(oldest.id); bytes -= oldest.blob.size;
      }
      try { const rec = await download(s); await put(rec); have.set(s.id, rec); bytes += rec.blob.size; }
      catch (e) { publish({ error: (e as Error).message }); }                                         // one failing sound does not stop the rest
      done++;
      publish({ done, cached: new Set(have.keys()) });
    }
  } finally { running = false; publish({ busy: false }); }
}

export async function clearSoundCache() { for (const r of await all()) await drop(r.id); publish({ cached: new Set() }); }
