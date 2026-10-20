// Files between this device and the PC (one exchange folder on the PC). Without the PC, files to send wait on this
// device (IndexedDB, survives closing the browser) and go automatically after the next login with "manage". Files fetched
// from the PC can be kept here, so they open without the PC. A waiting file is always shown as "wartet auf PC".

import { useSyncExternalStore } from "react";
import { client } from "./rpc";
import { t } from "./i18n";

export interface PcFile { name: string; size: number; modified: string; kind: "image" | "video" | "audio" | "archive" | "document" | "other" }
export interface FilesList { files: PcFile[]; folder: string; totalBytes: number; maxFileBytes: number; freeBytes?: number | null }
export interface OutgoingFile { id: string; name: string; size: number; type: string; data: Blob; addedAt: string; error?: string }
export interface KeptFile { name: string; size: number; type: string; data: Blob; savedAt: string }

export const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** What this device keeps for sending or offline use, all together. */
export const MAX_DEVICE_BYTES = 500 * 1024 * 1024;
const CHUNK = 384 * 1024; // base64 stays well below the PC's 1 MB message limit
const DB = "pgl-files";
const OUT = "outgoing", KEPT = "kept";

let outgoing: OutgoingFile[] = [];
let kept: KeptFile[] = [];
let progress: Record<string, number> = {};
let available = true;
let snapshot = { outgoing, kept, progress, available };
const listeners = new Set<() => void>();
const publish = () => { snapshot = { outgoing, kept, progress, available }; listeners.forEach((l) => l()); };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB fehlt")); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(OUT, { keyPath: "id" }); r.result.createObjectStore(KEPT, { keyPath: "name" }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function reload() {
  try {
    outgoing = ((await tx(OUT, "readonly", (s) => s.getAll())) as OutgoingFile[]).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
    kept = ((await tx(KEPT, "readonly", (s) => s.getAll())) as KeptFile[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    available = true;
  } catch { outgoing = []; kept = []; available = false; }
  publish();
}

export const deviceBytes = () => outgoing.reduce((n, f) => n + f.size, 0) + kept.reduce((n, f) => n + f.size, 0);

const connected = () => client.status.phase === "online" && client.status.auth === "ok";

function toBase64(buf: Uint8Array) {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Sends a file in pieces (only one piece in memory at a time). */
export async function uploadFile(name: string, data: Blob, onProgress?: (p: number) => void): Promise<PcFile> {
  if (data.size > MAX_FILE_BYTES) throw new Error(t("{f}: höchstens 200 MB pro Datei.", { f: name }));
  const { uploadId } = await client.call<{ uploadId: string }>("files.uploadBegin", { name, size: data.size });
  for (let off = 0; off < data.size; off += CHUNK) {
    const part = new Uint8Array(await data.slice(off, off + CHUNK).arrayBuffer());
    await client.call("files.uploadChunk", { uploadId, data: toBase64(part) });
    onProgress?.(Math.min(1, (off + CHUNK) / Math.max(data.size, 1)));
  }
  return client.call<PcFile>("files.uploadEnd", { uploadId });
}

/** Fetches a file from the PC's exchange folder. */
export async function downloadFile(f: PcFile, onProgress?: (p: number) => void): Promise<Blob> {
  const parts: Uint8Array[] = [];
  for (let off = 0; ;) {
    const r = await client.call<{ data: string; size: number; eof: boolean }>("files.read", { name: f.name, offset: off, length: CHUNK });
    const chunk = fromBase64(r.data);
    parts.push(chunk); off += chunk.length;
    onProgress?.(r.size ? off / r.size : 1);
    if (r.eof || chunk.length === 0) break;
  }
  return new Blob(parts as BlobPart[], { type: mimeOf(f.name) });
}

export function mimeOf(name: string) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", pdf: "application/pdf", txt: "text/plain", json: "application/json", zip: "application/zip" } as Record<string, string>)[ext] ?? "application/octet-stream";
}

/** Hands a file to the browser: share sheet on phones that support it, otherwise a normal download. */
export async function saveToDevice(name: string, data: Blob) {
  const file = new File([data], name, { type: data.type || mimeOf(name) });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
    try { await nav.share({ files: [file] }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Files chosen without the PC (or that should wait): kept here, sent later. */
export async function queueFiles(files: File[]): Promise<string[]> {
  await reload();
  const msgs: string[] = [];
  let used = deviceBytes();
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) { msgs.push(t("{f}: höchstens 200 MB pro Datei.", { f: f.name })); continue; }
    if (used + f.size > MAX_DEVICE_BYTES) { msgs.push(t("{f}: Auf diesem Gerät ist kein Platz mehr für wartende Dateien (500 MB).", { f: f.name })); continue; }
    try {
      await tx(OUT, "readwrite", (s) => s.put({ id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: f.name, size: f.size, type: f.type, data: f, addedAt: new Date().toISOString() } satisfies OutgoingFile));
      used += f.size;
    } catch { msgs.push(t("{f}: Konnte auf diesem Gerät nicht gespeichert werden (Speicher voll oder privates Fenster).", { f: f.name })); }
  }
  await reload();
  return msgs;
}

export async function removeOutgoing(id: string) { try { await tx(OUT, "readwrite", (s) => s.delete(id)); } catch { /* gone */ } await reload(); }
export async function retryOutgoing(id: string) {
  const f = outgoing.find((x) => x.id === id);
  if (f) { await tx(OUT, "readwrite", (s) => s.put({ ...f, error: undefined })); await reload(); void syncOutgoing(); }
}

export async function keepFile(name: string, data: Blob): Promise<boolean> {
  await reload();
  if (deviceBytes() + data.size > MAX_DEVICE_BYTES) return false;
  await tx(KEPT, "readwrite", (s) => s.put({ name, size: data.size, type: data.type, data, savedAt: new Date().toISOString() } satisfies KeptFile));
  await reload();
  return true;
}
export async function forgetKept(name: string) { try { await tx(KEPT, "readwrite", (s) => s.delete(name)); } catch { /* gone */ } await reload(); }

let inFlight: Promise<{ sent: number; failed: number }> | null = null;
/** Sends all waiting files. Failed ones keep the PC's reason until removed or retried. */
export function syncOutgoing() {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => { inFlight = null; });
  return inFlight;
}

async function run(): Promise<{ sent: number; failed: number }> {
  if (!connected() || !client.can("manage")) return { sent: 0, failed: 0 };
  await reload();
  let sent = 0, failed = 0;
  for (const f of outgoing.filter((x) => !x.error)) {
    if (!connected()) break;
    try {
      await uploadFile(f.name, f.data, (p) => { progress = { ...progress, [f.id]: p }; publish(); });
      await tx(OUT, "readwrite", (s) => s.delete(f.id));
      sent++;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "offline" || code === "timeout" || code === "needs-pc") break; // next connection
      await tx(OUT, "readwrite", (s) => s.put({ ...f, error: (e as Error).message }));
      failed++;
    } finally {
      const { [f.id]: _, ...rest } = progress; progress = rest;
    }
  }
  await reload();
  return { sent, failed };
}

let started = false;
export function startTransferSync(onDone: (r: { sent: number; failed: number }) => void) {
  if (started) return;
  started = true;
  reload().then(() => { if (connected() && outgoing.length) syncOutgoing().then(onDone); });
  client.on("authenticated", () => { if (outgoing.length) syncOutgoing().then(onDone); });
}

export function useTransfer() {
  return useSyncExternalStore((l) => { listeners.add(l); if (listeners.size === 1) void reload(); return () => listeners.delete(l); }, () => snapshot);
}
