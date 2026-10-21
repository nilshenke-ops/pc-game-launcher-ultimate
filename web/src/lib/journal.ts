// Personal gaming collections (game memory, goal paths, finds, story notes, wiki – and later more): one shared entry
// model with stable ids. Stored in this browser (IndexedDB), so everything works while the PC is off; when the PC is
// connected the entries are compared with its copy (newer change wins, the losing one is kept on the PC as a conflict
// copy) – that is how the other devices get them and how they get into the PC backup. No polling: it compares on
// connect, after own changes and when the PC reports a change.

import { useSyncExternalStore } from "react";
import { client } from "./rpc";

export interface Entry<T = unknown> {
  id: string;
  kind: string;
  /** ms since 1970 of the last change on any device. */
  updatedAt: number;
  deleted?: boolean;
  /** The PC's version this change was made on (to tell "both changed it" apart). */
  base?: number;
  data: T;
}

export interface SyncState {
  phase: "local" | "syncing" | "synced" | "error";
  /** Changes not yet on the (current) PC. */
  pending: number;
  lastAt?: number;
  error?: string;
  /** Refused by the PC, with its reason (e.g. too big). */
  refused: { id: string; reason: string }[];
  /** Versions that lost against a newer change on another device and are kept on the PC. */
  conflicts: number;
  /** false: this browser cannot store (private mode, blocked) – entries last only for this visit. */
  persistent: boolean;
}

interface Meta { rev: number; acked: Record<string, number> }
interface ImageRow { id: string; mime: string; data: string; uploaded?: Record<string, boolean>; at: number }

const DB = "pgl-journal", ENTRIES = "entries", IMAGES = "images", META = "meta";
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
let sync: SyncState = { phase: "local", pending: 0, refused: [], conflicts: 0, persistent: true };
const metas: Record<string, Meta> = {};

// ------------------------------------------------------------------------------------------ storage

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no idb")); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(ENTRIES, { keyPath: "id" });
      r.result.createObjectStore(IMAGES, { keyPath: "id" });
      r.result.createObjectStore(META);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

async function store(name: string, mode: IDBTransactionMode = "readonly") { return (await db()).transaction(name, mode).objectStore(name); }

async function persist(list: Entry[]) {
  try {
    const st = await store(ENTRIES, "readwrite");
    await Promise.all(list.map((e) => req(st.put(e))));
  } catch {
    if (sync.persistent) setSync({ persistent: false });
  }
}

async function saveMeta(pc: string) { try { await req((await store(META, "readwrite")).put(metas[pc], pc)); } catch { /* memory only */ } }

export const ready: Promise<void> = (async () => {
  try {
    const all = await req((await store(ENTRIES)).getAll()) as Entry[];
    for (const e of all) entries.set(e.id, e);
    const st = await store(META);
    const keys = await req(st.getAllKeys()) as string[];
    const vals = await req(st.getAll()) as Meta[];
    keys.forEach((k, i) => { metas[k] = vals[i]; });
  } catch { sync = { ...sync, persistent: false }; }
  changed();
})();

// ------------------------------------------------------------------------------------------ reading

function changed() { version++; listeners.forEach((l) => l()); }
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

let cacheVersion = -1;
const byKind = new Map<string, Entry[]>();
/** Entries of one kind (without deleted ones), newest change first. The same array as long as nothing changed. */
export function listKind<T>(kind: string): Entry<T>[] {
  if (cacheVersion !== version) { byKind.clear(); cacheVersion = version; }
  let l = byKind.get(kind);
  if (!l) { l = [...entries.values()].filter((e) => e.kind === kind && !e.deleted).sort((a, b) => b.updatedAt - a.updatedAt); byKind.set(kind, l); }
  return l as Entry<T>[];
}
export function getEntry<T>(id: string): Entry<T> | undefined { const e = entries.get(id); return e && !e.deleted ? (e as Entry<T>) : undefined; }
export function allEntries(): Entry[] { return [...entries.values()].filter((e) => !e.deleted); }

export function useJournal<T>(kind: string): Entry<T>[] {
  useSyncExternalStore(subscribe, () => version);
  return listKind<T>(kind);
}
export function useJournalVersion() { return useSyncExternalStore(subscribe, () => version); }
export function useJournalSync(): SyncState { return useSyncExternalStore(subscribe, () => sync); }
function setSync(p: Partial<SyncState>) { sync = { ...sync, ...p }; changed(); }

// ------------------------------------------------------------------------------------------ writing

const ID_RX = /^j_[A-Za-z0-9_-]{6,40}$/;
export const MAX_ENTRY_CHARS = 250_000;

export function newId(prefix = "j") {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return prefix + "_" + Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 18);
}

export class JournalError extends Error {}

/** Saves (creates or replaces) an entry on this device; reaches the PC with the next comparison. */
export function saveEntry<T extends object>(kind: string, id: string, data: T): Entry<T> {
  if (!ID_RX.test(id)) throw new JournalError("Ungültige Kennung.");
  const size = JSON.stringify(data).length;
  if (size > MAX_ENTRY_CHARS) throw new JournalError("Eintrag ist zu groß (höchstens etwa 250 000 Zeichen).");
  const prev = entries.get(id);
  if (prev && prev.kind !== kind) throw new JournalError("Kennung gehört zu einer anderen Art.");
  const e: Entry<T> = { id, kind, updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1), base: prev?.base, data };
  entries.set(id, e as Entry);
  void persist([e as Entry]);
  changed();
  scheduleSync();
  return e;
}

/** Deletes an entry (a marker stays, so the deletion reaches the other devices). */
export function removeEntry(id: string) {
  const prev = entries.get(id);
  if (!prev || prev.deleted) return;
  const e: Entry = { id, kind: prev.kind, updatedAt: Math.max(Date.now(), prev.updatedAt + 1), base: prev.base, deleted: true, data: {} };
  entries.set(id, e);
  void persist([e]);
  changed();
  scheduleSync();
}

// ------------------------------------------------------------------------------------------ pictures

export const MAX_IMAGE_BYTES = 700 * 1024;
const urlCache = new Map<string, string>();

/** Makes a picture small (longest side 1600 px, JPEG) and keeps it on this device. Returns its id. */
export async function addImage(file: Blob): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|heic|heif|avif)$/.test(file.type)) throw new JournalError("Nur Bilder (JPEG, PNG, WebP …).");
  const bmp = await createImageBitmap(file).catch(() => { throw new JournalError("Das Bild kann dieser Browser nicht öffnen."); });
  let side = 1600, quality = 0.82, data = "";
  for (let i = 0; i < 6; i++) {
    const s = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    data = c.toDataURL("image/jpeg", quality).split(",")[1];
    if (data.length * 0.75 <= MAX_IMAGE_BYTES) break;
    side = Math.round(side * 0.8); quality = Math.max(0.5, quality - 0.08);
  }
  bmp.close();
  return putImageRow({ id: newId("img"), mime: "image/jpeg", data, at: Date.now() });
}

async function putImageRow(row: ImageRow) {
  try { await req((await store(IMAGES, "readwrite")).put(row)); } catch { setSync({ persistent: false }); }
  urlCache.set(row.id, `data:${row.mime};base64,${row.data}`);
  return row.id;
}

async function imageRow(id: string): Promise<ImageRow | undefined> {
  try { return await req((await store(IMAGES)).get(id)) as ImageRow | undefined; } catch { return undefined; }
}

/** The picture as a data URL – from this device, otherwise from the PC (then kept here). null = not available now. */
export async function imageUrl(id: string): Promise<string | null> {
  const c = urlCache.get(id);
  if (c) return c;
  const row = await imageRow(id);
  if (row) { const u = `data:${row.mime};base64,${row.data}`; urlCache.set(id, u); return u; }
  if (client.status.auth !== "ok" || client.demo) return null;
  try {
    const r = await client.call<{ mime: string; data: string }>("journal.image", { id });
    await putImageRow({ id, mime: r.mime, data: r.data, at: Date.now(), uploaded: { [pcKey()]: true } });
    return urlCache.get(id) ?? null;
  } catch { return null; }
}

export async function imageData(id: string): Promise<{ mime: string; data: string } | null> {
  const row = await imageRow(id);
  if (row) return { mime: row.mime, data: row.data };
  const u = await imageUrl(id);
  if (!u) return null;
  const m = /^data:([^;]+);base64,(.*)$/.exec(u);
  return m ? { mime: m[1], data: m[2] } : null;
}

const IMG_RX = /img_[A-Za-z0-9_-]{6,40}/g;
export function imageIdsIn(e: Entry): string[] { return [...new Set(JSON.stringify(e.data).match(IMG_RX) ?? [])]; }

// ------------------------------------------------------------------------------------------ comparing with the PC

function pcKey() { return client.credentials?.deviceId ?? (client.status.me?.isLocal ? "local" : "pc"); }
function meta(): Meta { const k = pcKey(); return (metas[k] ??= { rev: 0, acked: {} }); }
function pendingList() { const m = meta(); return [...entries.values()].filter((e) => m.acked[e.id] !== e.updatedAt); }

let timer: number | undefined;
let running: Promise<void> | null = null;
let again = false;

function scheduleSync(ms = 1200) {
  setSync({ pending: pendingList().length });
  if (client.status.auth !== "ok" || client.demo) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncJournal(), ms);
}

/** Started once by the app shell: compares on every login and whenever the PC reports a change. */
let started = false;
export function startJournalSync() {
  if (started) return;
  started = true;
  let wasOk = false;
  client.subscribe(() => {
    const ok = client.status.auth === "ok";
    if (ok && !wasOk) void ready.then(() => syncJournal());
    if (!ok && sync.phase === "syncing") setSync({ phase: "local" });
    wasOk = ok;
  });
  if (client.status.auth === "ok") { wasOk = true; void ready.then(() => syncJournal()); }
  client.on("changed", (d) => { if ((d as { topic?: string })?.topic === "journal") scheduleSync(300); });
  void ready.then(() => setSync({ pending: pendingList().length }));
}

export function syncJournal(): Promise<void> {
  if (running) { again = true; return running; }
  if (client.status.auth !== "ok" || client.demo) return Promise.resolve();
  running = (async () => {
    setSync({ phase: "syncing", error: undefined });
    try {
      do { again = false; await pushAll(); await pullAll(); } while (again);
      setSync({ phase: "synced", lastAt: Date.now(), pending: pendingList().length });
    } catch (e) {
      setSync({ phase: "error", error: (e as Error).message, pending: pendingList().length });
    } finally { running = null; }
  })();
  return running;
}

async function pushAll() {
  if (!client.can("manage")) return;
  const m = meta(), pc = pcKey();
  const refused = sync.refused.filter((r) => entries.get(r.id) && m.acked[r.id] !== entries.get(r.id)!.updatedAt);
  const list = pendingList();
  // Pictures first, so an entry never arrives on the PC before its pictures.
  const ids = [...new Set(list.filter((e) => !e.deleted).flatMap(imageIdsIn))];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const has = new Set((await client.call<{ ids: string[] }>("journal.hasImages", { ids: chunk })).ids);
    for (const id of chunk) {
      if (has.has(id)) continue;
      const row = await imageRow(id);
      if (!row || row.uploaded?.[pc]) continue;
      await client.call("journal.putImage", { id, mime: row.mime, data: row.data });
      await putImageRow({ ...row, uploaded: { ...row.uploaded, [pc]: true } });
    }
  }
  // Batches below the message limit (1 MB) and 200 entries.
  let batch: Entry[] = [], size = 0;
  const send = async () => {
    if (!batch.length) return;
    const r = await client.call<{ results: { id: string; status: string; reason?: string }[] }>("journal.push", {
      changes: batch.map((e) => ({ id: e.id, kind: e.kind, updatedAt: e.updatedAt, deleted: !!e.deleted, base: e.base ?? null, data: e.deleted ? null : e.data })),
    });
    for (const res of r.results) {
      const e = batch.find((x) => x.id === res.id)!;
      m.acked[res.id] = e.updatedAt;
      const i = refused.findIndex((x) => x.id === res.id);
      if (i >= 0) refused.splice(i, 1);
      if (res.status === "refused") refused.push({ id: res.id, reason: res.reason ?? "" });
      else if (res.status === "ok") { e.base = e.updatedAt; void persist([e]); }
    }
    batch = []; size = 0;
    await saveMeta(pc);
  };
  for (const e of list) {
    const s = e.deleted ? 100 : JSON.stringify(e.data).length + 200;
    if (batch.length >= 200 || size + s > 850_000) await send();
    batch.push(e); size += s;
  }
  await send();
  setSync({ refused });
}

async function pullAll() {
  const m = meta(), pc = pcKey();
  for (let guard = 0; guard < 200; guard++) {
    const r = await client.call<{ rev: number; more: boolean; conflicts: number; entries: Entry[] }>("journal.pull", { since: m.rev });
    const take: Entry[] = [];
    for (const s of r.entries) {
      const local = entries.get(s.id);
      const localDirty = local && m.acked[s.id] !== local.updatedAt;
      // A local change that has not reached this PC yet (e.g. a device without the right to change) stays when it is newer.
      if (localDirty && local!.updatedAt > s.updatedAt) continue;
      const e: Entry = { id: s.id, kind: s.kind, updatedAt: s.updatedAt, deleted: s.deleted || undefined, base: s.updatedAt, data: s.deleted ? {} : (s.data ?? {}) };
      entries.set(e.id, e);
      m.acked[e.id] = e.updatedAt;
      take.push(e);
    }
    m.rev = r.rev;
    if (take.length) { await persist(take); changed(); }
    await saveMeta(pc);
    setSync({ conflicts: r.conflicts });
    if (!r.more) break;
  }
}

// ------------------------------------------------------------------------------------------ export / import (files, without the PC)

export interface JournalExport { format: "nexus-journal"; version: 1; exportedAt: string; entries: Entry[]; images: Record<string, { mime: string; data: string }> }

/** All (or some kinds of) entries as one file, with their pictures if wanted. */
export async function exportJournal(kinds?: string[], withImages = true, only?: string[]): Promise<JournalExport> {
  const list = allEntries().filter((e) => (!kinds || kinds.includes(e.kind)) && (!only || only.includes(e.id)));
  const images: JournalExport["images"] = {};
  if (withImages) for (const id of new Set(list.flatMap(imageIdsIn))) { const d = await imageData(id); if (d) images[id] = d; }
  return { format: "nexus-journal", version: 1, exportedAt: new Date().toISOString(), entries: list.map(({ id, kind, updatedAt, data }) => ({ id, kind, updatedAt, data })), images };
}

/**
 * Reads an export file. Existing entries are only replaced by a newer version from the file; with `asCopies` every
 * entry gets a new id instead (for templates and shared collections, so nothing of yours is overwritten).
 */
export async function importJournal(text: string, opts: { kinds?: string[]; asCopies?: boolean } = {}): Promise<{ added: number; updated: number; skipped: number; images: number }> {
  let f: JournalExport;
  try { f = JSON.parse(text); } catch { throw new JournalError("Die Datei ist kein gültiges JSON."); }
  if (!f || f.format !== "nexus-journal" || !Array.isArray(f.entries)) throw new JournalError("Keine Sammlungs-Datei von Nexus.");
  if (f.version > 1) throw new JournalError("Die Datei stammt aus einer neueren Version.");
  let added = 0, updated = 0, skipped = 0, images = 0;
  const idMap = new Map<string, string>();
  if (opts.asCopies) for (const e of f.entries) if (e && typeof e.id === "string") idMap.set(e.id, newId());
  const remap = (d: unknown) => (idMap.size ? JSON.parse(JSON.stringify(d).replace(/j_[A-Za-z0-9_-]{6,40}/g, (m) => idMap.get(m) ?? m)) : d);
  for (const e of f.entries.slice(0, 20_000)) {
    if (!e || typeof e.kind !== "string" || !/^[a-z]{2,16}$/.test(e.kind) || typeof e.data !== "object" || e.data === null || (opts.kinds && !opts.kinds.includes(e.kind))) { skipped++; continue; }
    const id = idMap.get(e.id) ?? e.id;
    if (!ID_RX.test(id)) { skipped++; continue; }
    const cur = entries.get(id);
    if (cur && !cur.deleted && (cur.kind !== e.kind || cur.updatedAt >= (Number(e.updatedAt) || 0))) { skipped++; continue; }
    try { saveEntry(e.kind, id, remap(e.data) as object); cur && !cur.deleted ? updated++ : added++; } catch { skipped++; }
  }
  for (const [id, img] of Object.entries(f.images ?? {}).slice(0, 3000)) {
    if (!/^img_[A-Za-z0-9_-]{6,40}$/.test(id) || !/^image\/(jpeg|png|webp)$/.test(img?.mime) || typeof img.data !== "string" || img.data.length * 0.75 > MAX_IMAGE_BYTES) continue;
    if (await imageRow(id)) continue;
    await putImageRow({ id, mime: img.mime, data: img.data, at: Date.now() });
    images++;
  }
  return { added, updated, skipped, images };
}

/** Saves a text as a file on this device (download). */
export function downloadText(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** For tests: empties the in-memory state. */
export function _resetForTests() { entries.clear(); for (const k of Object.keys(metas)) delete metas[k]; sync = { phase: "local", pending: 0, refused: [], conflicts: 0, persistent: true }; changed(); }
