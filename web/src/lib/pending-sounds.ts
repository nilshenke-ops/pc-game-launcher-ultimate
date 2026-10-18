// Sounds added while no PC is connected. They are kept on this device (IndexedDB, survives closing the browser)
// and uploaded automatically as soon as this device is logged in to the PC with the "manage" permission.
// Nothing here pretends a sound is on the PC: pending entries are always shown as "wartet auf PC".

import { useSyncExternalStore } from "react";
import { client } from "./rpc";
import { t } from "./i18n";
import type { Sound } from "./types";
import { outbox, substituteIds } from "./outbox";

/** Hotkeys, quick actions … made offline may refer to a waiting sound as "pending:<id>"; replaced by the PC's id after upload. */
export const pendingRef = (id: string) => `pending:${id}`;

export const MAX_SOUND_BYTES = 20 * 1024 * 1024;
const CHUNK = 256 * 1024;
const DB = "pgl-pending";
const STORE = "sounds";

export interface PendingSound {
  id: string;
  kind: "file" | "url";
  name: string;
  size: number;
  data?: ArrayBuffer; // file contents (kind "file")
  url?: string; // link the PC downloads later (kind "url")
  addedAt: string;
  error?: string; // last upload error reported by the PC
}

let items: PendingSound[] = [];
let syncing = false;
let available = true;
let snapshot = { items, syncing, available };
const listeners = new Set<() => void>();
const publish = () => { snapshot = { items, syncing, available }; listeners.forEach((l) => l()); };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB fehlt")); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function reload() {
  try { items = ((await tx("readonly", (s) => s.getAll())) as PendingSound[]).sort((a, b) => a.addedAt.localeCompare(b.addedAt)); available = true; }
  catch { items = []; available = false; }
  publish();
}

/** Checks the first bytes so obviously unsupported files are refused right away instead of hours later on the PC. */
export function sniffAudio(head: Uint8Array): string | null {
  const ascii = (o: number, n: number) => String.fromCharCode(...head.subarray(o, o + n));
  if (ascii(0, 3) === "ID3" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "mp3";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "wav";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(4, 4) === "ftyp") return "m4a";
  if (head[0] === 0x30 && head[1] === 0x26 && head[2] === 0xb2 && head[3] === 0x75) return "wma";
  return null;
}

/** Stores files on this device. Returns one message per file (ok or reason). */
export async function addPendingFiles(files: File[]): Promise<{ name: string; ok: boolean; msg: string }[]> {
  const out: { name: string; ok: boolean; msg: string }[] = [];
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  for (const f of files) {
    if (f.size > MAX_SOUND_BYTES) { out.push({ name: f.name, ok: false, msg: t("{f}: Datei ist zu groß (max. 20 MB).", { f: f.name }) }); continue; }
    const data = await f.arrayBuffer();
    if (!sniffAudio(new Uint8Array(data, 0, Math.min(16, data.byteLength)))) { out.push({ name: f.name, ok: false, msg: t("{f}: Kein unterstütztes Audioformat (MP3, WAV, FLAC, M4A, WMA).", { f: f.name }) }); continue; }
    const entry: PendingSound = { id: crypto.randomUUID(), kind: "file", name: f.name, size: f.size, data, addedAt: new Date().toISOString() };
    try { await tx("readwrite", (s) => s.put(entry)); out.push({ name: f.name, ok: true, msg: t("Gespeichert – wird übertragen, sobald der PC verbunden ist") }); }
    catch (e) { out.push({ name: f.name, ok: false, msg: t("Konnte nicht auf diesem Gerät gespeichert werden ({e}). Privater Modus?", { e: String(e) }) }); }
  }
  await reload();
  return out;
}

export async function addPendingUrl(url: string) {
  let u: URL;
  try { u = new URL(url.trim()); } catch { throw new Error(t("Ungültiger Link.")); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(t("Ungültiger Link."));
  await tx("readwrite", (s) => s.put({ id: crypto.randomUUID(), kind: "url", name: u.toString(), size: 0, url: u.toString(), addedAt: new Date().toISOString() } satisfies PendingSound));
  await reload();
}

export async function removePending(id: string) {
  try { await tx("readwrite", (s) => s.delete(id)); } catch { /* already gone */ }
  await reload();
}

/** Plays a pending file on this device only (the PC does not have it yet). */
export function previewPending(p: PendingSound) {
  if (!p.data) return;
  const audio = new Audio(URL.createObjectURL(new Blob([p.data])));
  audio.onended = () => URL.revokeObjectURL(audio.src);
  audio.play().catch(() => URL.revokeObjectURL(audio.src));
}

function toBase64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Uploads audio bytes to the PC in 256 KB chunks over the existing connection (works via relay, too). */
export async function uploadBytes(name: string, data: Uint8Array, onProgress?: (p: number) => void) {
  if (data.length > MAX_SOUND_BYTES) throw new Error(t("{f}: Datei ist zu groß (max. 20 MB).", { f: name }));
  const { uploadId } = await client.call<{ uploadId: string }>("sounds.uploadBegin", { name, size: data.length });
  for (let off = 0; off < data.length; off += CHUNK) {
    await client.call("sounds.uploadChunk", { uploadId, data: toBase64(data.subarray(off, off + CHUNK)) });
    onProgress?.(Math.min(1, (off + CHUNK) / data.length));
  }
  return client.call<Sound>("sounds.uploadEnd", { uploadId });
}

const connected = () => client.status.phase === "online" && client.status.auth === "ok";

/** Sends all waiting sounds to the PC. Failed ones stay with the PC's reason (e.g. duplicate) until removed. */
let inFlight: Promise<{ sent: number; failed: number }> | null = null;
/** Callers that come while an upload is running wait for that same run (the change queue needs the new sound ids). */
export function syncPending(): Promise<{ sent: number; failed: number }> {
  if (inFlight) return inFlight;
  inFlight = runPending().finally(() => { inFlight = null; });
  return inFlight;
}

async function runPending(): Promise<{ sent: number; failed: number }> {
  if (syncing || !connected() || !client.can("manage")) return { sent: 0, failed: 0 };
  syncing = true;
  publish();
  let sent = 0, failed = 0;
  try {
    await reload();
    for (const p of items.filter((x) => !x.error)) {
      if (!connected()) break;
      try {
        let sound: Sound | undefined;
        if (p.kind === "file" && p.data) sound = await uploadBytes(p.name, new Uint8Array(p.data));
        else if (p.url) sound = await client.call<Sound>("sounds.importUrl", { url: p.url });
        if (sound?.id) outbox.replaceAll(outbox.all().map((x) => ({ ...x, params: substituteIds(x.params, new Map([[pendingRef(p.id), sound!.id]])) })));
        await tx("readwrite", (s) => s.delete(p.id));
        sent++;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "offline" || code === "timeout" || code === "needs-pc") break; // try again on the next connection
        await tx("readwrite", (s) => s.put({ ...p, error: (e as Error).message }));
        failed++;
      }
    }
  } finally {
    syncing = false;
    await reload();
  }
  return { sent, failed };
}

export async function retryPending(id: string) {
  const p = items.find((x) => x.id === id);
  if (p) { await tx("readwrite", (s) => s.put({ ...p, error: undefined })); await reload(); }
  return syncPending();
}

export function usePendingSounds() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snapshot);
}

let started = false;
/** Loads the list and uploads automatically after every login to the PC. */
export function startPendingSync(onDone: (r: { sent: number; failed: number }) => void) {
  if (started) return;
  started = true;
  reload().then(() => { if (connected()) syncPending().then(onDone); });
  client.on("authenticated", () => { syncPending().then(onDone); });
}
