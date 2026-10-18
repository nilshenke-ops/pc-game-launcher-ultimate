// Plugins without a connected PC: the official store is read directly from the project website (signature checked
// in the browser), packages are downloaded and checked (size + SHA-256 from the signed catalog), and themes and
// widgets can be used right away on this device. Installing on the PC is queued (lib/outbox.ts) and happens – with
// the PC's full check – as soon as this device is connected. Own plugin files wait in IndexedDB until then.

import { client } from "./rpc";
import { t } from "./i18n";
import { readCache, saveCache } from "./offline-cache";
import { enqueue, type OutboxEntry } from "./outbox";
import { verifyProjectSignature, WEB_VERSION, compareVersions } from "./release";
import { sha256, toHex } from "./sha256";
import { PERMISSION_LABELS, type CatalogEntry, type CatalogInfo, type InstalledPlugin, type PluginList, type PluginManifest } from "./plugins";

export const PLUGIN_SITE = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/plugins/";
const CATEGORIES = ["launcher", "audio", "discord", "performance", "design", "automation", "device", "information", "productivity", "community"];

export function emptyPluginList(): PluginList {
  return { appVersion: WEB_VERSION, apiVersion: 1, permissions: PERMISSION_LABELS, categories: CATEGORIES, plugins: [] };
}
const currentList = () => readCache<PluginList>("plugins.list", "{}")?.data ?? emptyPluginList();

// ------------------------------------------------------------------ ZIP (plugin packages are small ZIP files)

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error(t("Dieser Browser kann Plugin-Pakete nicht entpacken – bitte aktualisieren oder am PC installieren."));
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads all files of a ZIP (stored or deflated), checking the same path rules as the companion. */
export async function unzip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error(t("Datei ist kein gültiges Plugin-Paket (kein ZIP)."));
  const count = v.getUint16(eocd + 10, true);
  if (count > 100) throw new Error(t("Paket enthält mehr als 100 Dateien."));
  let p = v.getUint32(eocd + 16, true);
  const files: Record<string, Uint8Array> = {};
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error(t("Plugin-Paket ist beschädigt."));
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    if (name.includes("\\") || name.startsWith("/") || name.split("/").some((s) => s === "" || s === "." || s === "..")) throw new Error(t("Unzulässiger Dateipfad im Paket: {n}", { n: name }));
    if (usize > 1024 * 1024) throw new Error(t("{n} ist größer als 1 MB.", { n: name }));
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    const raw = buf.subarray(start, start + csize);
    files[name] = method === 0 ? raw.slice() : method === 8 ? await inflate(raw) : (() => { throw new Error(t("Plugin-Paket ist beschädigt.")); })();
  }
  return files;
}

const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function sha(data: Uint8Array) { return globalThis.crypto?.subtle ? toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource))) : toHex(sha256(data)); }

/** Basic checks in the browser; the PC checks the package completely again before installing. */
function readManifest(files: Record<string, Uint8Array>): PluginManifest {
  if (!files["plugin.json"]) throw new Error(t("plugin.json fehlt im Paket."));
  let m: PluginManifest;
  try { m = JSON.parse(new TextDecoder().decode(files["plugin.json"])); } catch { throw new Error(t("plugin.json ist ungültig.")); }
  if (!/^[a-z0-9]+(\.[a-z0-9-]+){1,5}$/.test(m.id ?? "") || !/^\d+\.\d+\.\d+$/.test(m.version ?? "") || !m.name) throw new Error(t("plugin.json: ID, Name oder Version ungültig."));
  if (m.apiVersion !== 1) throw new Error(t("Plugin-API-Version {v} wird nicht unterstützt.", { v: String(m.apiVersion) }));
  if ((m.permissions ?? []).some((x) => !(x in PERMISSION_LABELS))) throw new Error(t("Unbekannte Berechtigung im Plugin."));
  const c = (m.contributes ?? {}) as Partial<PluginManifest["contributes"]>;
  m.contributes = { widgets: c.widgets ?? [], actions: c.actions ?? [], themes: c.themes ?? [], settings: c.settings ?? [] };
  m.changelog = m.changelog ?? [];
  m.platforms = m.platforms ?? [];
  m.permissions = m.permissions ?? [];
  return m;
}

/** Puts a plugin into this device's copy of the PC's plugin list and keeps its files for themes and widgets. */
function remember(m: PluginManifest, files: Record<string, Uint8Array>, trust: InstalledPlugin["trust"], source: string) {
  const config: Record<string, unknown> = {};
  for (const s of m.contributes.settings) config[s.key] = s.default ?? null;
  const entry: InstalledPlugin = {
    id: m.id, version: m.version, trust, source, enabled: false, granted: [], favorite: false, autoUpdate: false, config,
    installedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), log: [], manifest: m, pending: true,
    disabledReason: "Wartet auf PC – wird beim nächsten Verbinden installiert", missingPermissions: m.permissions, missingDependencies: [],
  };
  const list = currentList();
  saveCache("plugins.list", { ...list, plugins: [...list.plugins.filter((p) => p.id !== m.id), entry] }, "{}");
  const web = Object.fromEntries(Object.entries(files).filter(([k]) => k !== "plugin.json").map(([k, v]) => [k, b64(v)]));
  for (const preview of [false, true]) saveCache("plugins.files", { id: m.id, version: m.version, files: web }, JSON.stringify({ id: m.id, preview }));
}

// ------------------------------------------------------------------ store

export async function loadOfflineCatalog(): Promise<CatalogInfo> {
  const bust = `?t=${Date.now()}`;
  const [cat, sig] = await Promise.all([fetch(PLUGIN_SITE + "catalog.json" + bust, { cache: "no-store" }), fetch(PLUGIN_SITE + "catalog.json.sig" + bust, { cache: "no-store" })]);
  if (!cat.ok || !sig.ok) throw new Error(t("Plugin-Katalog nicht erreichbar (HTTP {s}).", { s: cat.ok ? sig.status : cat.status }));
  const bytes = new Uint8Array(await cat.arrayBuffer());
  const verified = await verifyProjectSignature(bytes, await sig.text());
  if (verified === false) throw new Error(t("Signatur des Plugin-Katalogs ist ungültig – Katalog wird nicht verwendet."));
  const data = JSON.parse(new TextDecoder().decode(bytes)) as { plugins: (CatalogEntry & { url: string; sha256: string })[] };
  const installed = new Map(currentList().plugins.map((p) => [p.id, p.version]));
  return {
    url: PLUGIN_SITE + "catalog.json", verified: verified === true,
    plugins: data.plugins.map((p) => ({ ...p, compatible: compareVersions(p.minAppVersion, WEB_VERSION) <= 0, installedVersion: installed.get(p.id) })),
  };
}

/** Downloads and checks a store plugin, makes it usable on this device and queues the installation (and activation). */
export async function installFromStoreOffline(id: string, grant: string[] | null) {
  const r = await fetch(PLUGIN_SITE + "catalog.json?t=" + Date.now(), { cache: "no-store" });
  const entry = ((await r.json()) as { plugins: (CatalogEntry & { url: string; sha256: string })[] }).plugins.find((p) => p.id === id);
  if (!entry) throw new Error(t("Plugin nicht im Katalog."));
  const pkg = new Uint8Array(await (await fetch(entry.url, { cache: "no-store" })).arrayBuffer());
  if (pkg.length !== entry.size || (await sha(pkg)) !== entry.sha256) throw new Error(t("Paket stimmt nicht mit dem Katalog überein (Größe/Prüfsumme) – nicht übernommen."));
  const files = await unzip(pkg);
  const m = readManifest(files);
  if (m.id !== entry.id || m.version !== entry.version) throw new Error(t("Paketinhalt passt nicht zum Katalogeintrag – nicht übernommen."));
  remember(m, files, entry.trust, "Katalog (vorgemerkt)");
  enqueue("plugins.installCatalog", { id, label: m.name });
  if (grant) enqueue("plugins.enable", { id, grant });
  return m;
}

// ------------------------------------------------------------------ own plugin files

const DB = "pgl-plugin-files", STORE = "files";
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error(t("Speichern auf diesem Gerät ist nicht möglich (privater Modus?)."))); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => { const q = fn(d.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
}

/** Checks an own .pglplugin file on this device and keeps it until the PC is connected (installed there deactivated). */
export async function importFileOffline(file: File): Promise<PluginManifest> {
  if (file.size > 2 * 1024 * 1024) throw new Error(t("Plugin-Pakete dürfen höchstens 2 MB groß sein."));
  const data = new Uint8Array(await file.arrayBuffer());
  const files = await unzip(data);
  const m = readManifest(files);
  const key = `${m.id}@${m.version}`;
  await idb("readwrite", (s) => s.put(data, key));
  remember(m, files, "unverified", "Datei (vorgemerkt)");
  enqueue("plugins.importFile", { id: m.id, label: m.name }, { fileKey: key });
  return m;
}

/** Called by the sync: uploads a queued file in pieces and installs it on the PC (deactivated, as always). */
export async function uploadQueuedPluginFile(e: OutboxEntry): Promise<unknown> {
  const data = await idb<Uint8Array | undefined>("readonly", (s) => s.get(e.fileKey!) as IDBRequest<Uint8Array | undefined>);
  if (!data) throw new Error(t("Die vorgemerkte Plugin-Datei ist auf diesem Gerät nicht mehr vorhanden."));
  const { importId } = await client.call<{ importId: string }>("plugins.importBegin", { size: data.length });
  for (let o = 0; o < data.length; o += 512 * 1024) await client.call("plugins.importChunk", { importId, data: b64(data.subarray(o, o + 512 * 1024)) });
  const r = await client.call("plugins.importEnd", { importId, check: false });
  await idb("readwrite", (s) => s.delete(e.fileKey!));
  return r;
}
