// Changes made while no PC is connected (e.g. on the phone before the first pairing, or while the PC is off).
// Only configuration changes are queued – never anything that does something on the PC right away (start a game,
// play a sound, shut down, install an update). The change is shown immediately (cached lists are updated on this
// device) and sent to the PC in the original order as soon as this device is logged in. The PC checks every change
// exactly as if it had been made live (permissions, validation); refused changes stay visible with the reason.

import { useSyncExternalStore } from "react";
import { t } from "./i18n";
import { readCache, saveCache } from "./offline-cache";
import { PERMISSION_LABELS } from "./plugins";
import { WEB_VERSION } from "./release";
import { offlineCaptureStatus } from "./capture";

type Params = Record<string, unknown>;
export interface OutboxEntry {
  id: string;
  method: string;
  params: Params;
  label: string;
  at: number;
  /** Device id of the PC this change belongs to; null = the first PC this device connects to. */
  pc: string | null;
  /** Local plugin file waiting for upload (bytes kept in IndexedDB). */
  fileKey?: string;
  error?: string;
}

const KEY = "pgl.outbox";
const name = (p: Params, k = "name") => (typeof p[k] === "string" && p[k] ? `„${p[k]}“` : "");

/** Methods that may be queued, with a readable label. Everything else needs a connected PC. */
export const QUEUEABLE: Record<string, (p: Params) => string> = {
  "library.update": (p) => t("Spiel/Programm bearbeiten {n}", { n: name(p) }),
  "library.addSteam": (p) => t("Steam-Spiel zur Bibliothek hinzufügen {n}", { n: name(p) }),
  "quick.save": (p) => t("Quick Action speichern {n}", { n: name(p) }),
  "quick.remove": () => t("Quick Action löschen"),
  "quick.reorder": () => t("Quick Actions sortieren"),
  "profiles.save": (p) => (p.profile ? t("Profil speichern {n}", { n: name(p.profile as Params) }) : t("Automatischen Profilwechsel ändern")),
  "profiles.remove": () => t("Profil löschen"),
  "automations.save": (p) => t("Automatisierung speichern {n}", { n: name(p) }),
  "automations.remove": () => t("Automatisierung löschen"),
  "hotkeys.save": (p) => t("Hotkey speichern {n}", { n: typeof p.keys === "string" ? p.keys : "" }),
  "hotkeys.remove": () => t("Hotkey löschen"),
  "sounds.update": (p) => t("Sound bearbeiten {n}", { n: name(p) }),
  "sounds.remove": () => t("Sound löschen"),
  "sounds.saveCollection": (p) => t("Sammlung speichern {n}", { n: name(p) }),
  "sounds.removeCollection": () => t("Sammlung löschen"),
  "sounds.setActiveCollection": () => t("Aktive Sammlung wählen"),
  "audio.save": () => t("Audio-Einstellungen speichern"),
  "settings.save": () => t("Einstellungen speichern"),
  // The OBS password waits on this device until the PC takes it (then it is only kept protected on the PC).
  "obs.configure": () => t("OBS-Verbindung speichern"),
  "capture.configure": () => t("Aufnahme-Programm und Tasten speichern"),
  "overlay.saveLayout": () => t("Overlay-Widgets speichern"),
  "history.setNote": () => t("Notiz zur Spielsitzung"),
  "plugins.installCatalog": (p) => t("Plugin installieren {n}", { n: name(p, "label") }),
  "plugins.importFile": (p) => t("Plugin-Datei installieren {n}", { n: name(p, "label") }),
  "plugins.enable": () => t("Plugin aktivieren"),
  "plugins.disable": () => t("Plugin deaktivieren"),
  "plugins.revoke": () => t("Plugin-Berechtigung entziehen"),
  "plugins.uninstall": () => t("Plugin entfernen"),
  "plugins.setFlags": () => t("Plugin-Optionen ändern"),
  "plugins.setConfig": () => t("Plugin-Einstellungen speichern"),
};

let entries: OutboxEntry[] = load();
let version = 0;
const listeners = new Set<() => void>();
let currentPc: () => string | null = () => null;

function load(): OutboxEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxEntry[]; } catch { return []; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* storage full or blocked */ }
  version++;
  listeners.forEach((l) => l());
}

export const outbox = {
  subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); },
  version: () => version,
  /** Entries for the PC this device is (or will be) connected to. */
  list: (): OutboxEntry[] => { const pc = currentPc(); return entries.filter((e) => e.pc === null || e.pc === pc); },
  all: () => entries,
  setCurrentPc(fn: () => string | null) { currentPc = fn; },
  remove(id: string) { entries = entries.filter((e) => e.id !== id); persist(); },
  setError(id: string, error: string | undefined) { entries = entries.map((e) => (e.id === id ? { ...e, error } : e)); persist(); },
  replaceAll(next: OutboxEntry[]) { entries = next; persist(); },
};

export function useOutbox(): OutboxEntry[] {
  useSyncExternalStore(outbox.subscribe, outbox.version);
  return outbox.list();
}

const tmpId = (prefix: string) => `tmp_${prefix}_${Math.random().toString(36).slice(2, 10)}`;
export const isTemp = (id: unknown) => typeof id === "string" && id.startsWith("tmp_");

/**
 * Queues a change and applies it to the copies of the PC's lists on this device, so the page shows it at once.
 * Returns what the PC would return (e.g. the saved object with its – temporary – id).
 */
export function enqueue(method: string, params: Params, extra: Partial<OutboxEntry> = {}): unknown {
  let p = structuredClone(params ?? {});
  // The audio form always sends all values. Only what was changed here is kept, so devices chosen at the PC
  // (e.g. the virtual cable) are not overwritten later by "Windows-Standard".
  if (method === "audio.save") {
    const before = (readCache<{ settings: Params }>("audio.state")?.data ?? OFFLINE_DEFAULTS["audio.state"] as { settings: Params }).settings;
    p = Object.fromEntries(Object.entries(p).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
    if (Object.keys(p).length === 0) return params;
  }
  const result = applyLocally(method, p);
  entries = [...entries, { id: Math.random().toString(36).slice(2), method, params: p, label: QUEUEABLE[method]?.(p) ?? method, at: Date.now(), pc: currentPc(), ...extra }];
  persist();
  return result;
}

// ------------------------------------------------------------------ local (optimistic) application to cached lists

/** Empty lists for a device that has never been connected, so things can be set up before the first pairing. */
export const OFFLINE_DEFAULTS: Record<string, unknown> = {
  "quick.list": { actions: [] },
  "profiles.list": { profiles: [], autoSwitch: true },
  "automations.list": { rules: [] },
  "hotkeys.list": { supported: true, hotkeys: [] },
  // Games come from the PC; until then only games picked here (e.g. from the Steam library) are listed.
  "library.list": { items: [], installed: {}, running: [], coversFromCdn: true },
  "history.get": { enabled: true, sessions: [], launches: [], stats: [], launchStats: [], failures: [] },
  // Same defaults as the companion (Models.cs); only the values changed here are sent later (settings.save is a patch).
  "settings.get": {
    relaySecretSet: false, restartRequired: false,
    settings: {
      language: "de", lanAccess: true, port: 8787, webAppUrl: "https://nilshenke-ops.github.io/pc-game-launcher-ultimate", relayEnabled: false,
      historyEnabled: true, startMinimized: true, keepRunningInTray: true, processScanSeconds: 5, recordSessionPerf: true,
      updateManifestUrl: "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/download/update.json",
      pluginCatalogUrl: "https://nilshenke-ops.github.io/pc-game-launcher-ultimate/plugins/catalog.json",
      notifyInfo: true, quietWhileGaming: true, mutedNotificationKeys: [], steamCoversFromCdn: true, gamePassEnabled: false, gamePassMarket: "DE",
      coverSearch: true, steamEnabled: false, epicEnabled: false, eaEnabled: false,
      obsUrl: "ws://127.0.0.1:4455", obsReplayWhilePlaying: false, overlayCorner: "top-right",
    },
  },
  "capture.status": offlineCaptureStatus(),
  "overlay.layout": {},
  "obs.status": { url: "ws://127.0.0.1:4455", passwordSet: false, replayWhilePlaying: false, connected: false, offline: true },
  // Whether this PC can show the overlay is only known once it is connected.
  "overlay.status": { supported: false, visible: null, unknown: true },
  // Audio devices are only known on the PC; until then "Windows-Standard" is shown and only changed values are sent.
  "audio.state": {
    supported: true, devices: [], missing: [], micPassthroughActive: false, offlineDefaults: true,
    settings: { outputDeviceId: null, soundboardVolume: 80, monitorEnabled: false, monitorDeviceId: null, monitorVolume: 60, micPassthrough: false, micDeviceId: null, micVolume: 100, playMode: "overlap", maxConcurrent: 8 },
  },
  "plugins.list": { appVersion: WEB_VERSION, apiVersion: 1, permissions: PERMISSION_LABELS, plugins: [],
    categories: ["launcher", "audio", "discord", "performance", "design", "automation", "device", "information", "productivity", "community"] },
};

function patch<T>(method: string, fn: (d: T) => T, params = "{}") {
  const cur = readCache<T>(method, params)?.data ?? (OFFLINE_DEFAULTS[method] as T | undefined);
  if (cur === undefined) return;
  saveCache(method, fn(structuredClone(cur)), params);
}

type WithId = { id: string };
const upsert = <X extends WithId>(list: X[], item: X) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item]);

function applyLocally(method: string, p: Params): unknown {
  const ensureId = (o: Params, prefix: string) => { if (!o.id) o.id = tmpId(prefix); return o; };
  switch (method) {
    case "library.addSteam": {
      p.tempId = tmpId("item"); // later changes that refer to this game are switched to the PC's id
      const item = { id: p.tempId as string, kind: "game", name: (p.name as string) || "Steam " + p.appId, source: "steam", target: p.appId, categories: [], favorite: false, processNames: [], addedAt: new Date().toISOString(), pending: true } as WithId & Params;
      patch<{ items: (WithId & Params)[] }>("library.list", (d) => d.items.some((i) => i.source === "steam" && i.target === p.appId) ? d : ({ ...d, items: [...d.items, item] }));
      return item;
    }
    case "library.update":
      patch<{ items: WithId[] }>("library.list", (d) => ({ ...d, items: d.items.map((i) => (i.id === p.id ? { ...i, ...p } : i)) }));
      return p;
    case "quick.save":
      ensureId(p, "qa");
      patch<{ actions: WithId[] }>("quick.list", (d) => ({ ...d, actions: upsert(d.actions, { steps: [], ...p } as unknown as WithId) }));
      return p;
    case "quick.remove": patch<{ actions: WithId[] }>("quick.list", (d) => ({ ...d, actions: d.actions.filter((a) => a.id !== p.id) })); return true;
    case "quick.reorder": {
      const ids = (p.ids as string[]) ?? [];
      patch<{ actions: WithId[] }>("quick.list", (d) => ({ ...d, actions: [...d.actions].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) }));
      return true;
    }
    case "profiles.save":
      if (p.profile) {
        const prof = ensureId(p.profile as Params, "prof");
        patch<{ profiles: WithId[] }>("profiles.list", (d) => ({ ...d, profiles: upsert(d.profiles, prof as unknown as WithId) }));
        return prof;
      }
      patch<Params>("profiles.list", (d) => ({ ...d, autoSwitch: !!p.autoSwitch }));
      return true;
    case "profiles.remove": patch<{ profiles: WithId[] }>("profiles.list", (d) => ({ ...d, profiles: d.profiles.filter((x) => x.id !== p.id) })); return true;
    case "automations.save":
      ensureId(p, "rule");
      patch<{ rules: WithId[] }>("automations.list", (d) => ({ ...d, rules: upsert(d.rules, p as unknown as WithId) }));
      return p;
    case "automations.remove": patch<{ rules: WithId[] }>("automations.list", (d) => ({ ...d, rules: d.rules.filter((x) => x.id !== p.id) })); return true;
    case "hotkeys.save":
      ensureId(p, "hk");
      patch<{ hotkeys: { hotkey: WithId; status: unknown }[] }>("hotkeys.list", (d) => ({
        ...d, hotkeys: d.hotkeys.some((h) => h.hotkey.id === p.id) ? d.hotkeys.map((h) => (h.hotkey.id === p.id ? { ...h, hotkey: p as unknown as WithId } : h))
          : [...d.hotkeys, { hotkey: p as unknown as WithId, status: { id: p.id, state: "pending", message: t("Wartet auf PC") } }],
      }));
      return p;
    case "hotkeys.remove": patch<{ hotkeys: { hotkey: WithId }[] }>("hotkeys.list", (d) => ({ ...d, hotkeys: d.hotkeys.filter((h) => h.hotkey.id !== p.id) })); return true;
    case "sounds.update": patch<{ data: { sounds: WithId[] } }>("sounds.list", (d) => ({ ...d, data: { ...d.data, sounds: d.data.sounds.map((s) => (s.id === p.id ? { ...s, ...p } : s)) } })); return p;
    case "sounds.remove": patch<{ data: { sounds: WithId[] } }>("sounds.list", (d) => ({ ...d, data: { ...d.data, sounds: d.data.sounds.filter((s) => s.id !== p.id) } })); return true;
    case "sounds.saveCollection":
      ensureId(p, "col");
      patch<{ data: { collections: WithId[] } }>("sounds.list", (d) => ({ ...d, data: { ...d.data, collections: upsert(d.data.collections ?? [], p as unknown as WithId) } }));
      return p;
    case "sounds.removeCollection": patch<{ data: { collections: WithId[] } }>("sounds.list", (d) => ({ ...d, data: { ...d.data, collections: (d.data.collections ?? []).filter((c) => c.id !== p.id) } })); return true;
    case "sounds.setActiveCollection": patch<{ data: Params }>("sounds.list", (d) => ({ ...d, data: { ...d.data, activeCollectionId: p.id ?? null } })); return true;
    case "audio.save": patch<{ settings: Params }>("audio.state", (d) => ({ ...d, settings: { ...d.settings, ...p } })); return p;
    case "settings.save": patch<{ settings: Params }>("settings.get", (d) => ({ ...d, settings: { ...d.settings, ...p } })); return p;
    case "overlay.saveLayout": patch<Params>("overlay.layout", () => (p.layout ? { layout: p.layout } : {})); return p.layout ? { layout: p.layout } : {};
    case "capture.configure": {
      patch<Params>("capture.status", (d) => {
        const keys = { ...(d.keys as Record<string, string>) };
        for (const [k, v] of Object.entries((p.keys as Record<string, string | null>) ?? {})) { if (v === null) delete keys[k]; else keys[k] = v; }
        const perFunction = { ...((d.actionProviders as Record<string, string>) ?? {}) };
        for (const [k, v] of Object.entries((p.actionProviders as Record<string, string | null>) ?? {})) { if (v === null) delete perFunction[k]; else perFunction[k] = v; }
        return { ...d, ...offlineCaptureStatus((p.provider as string) ?? (d.provider as string), (p.overlayProvider as string) ?? (d.overlayProvider as string), keys, perFunction), obs: d.obs };
      });
      return readCache("capture.status")?.data;
    }
    case "obs.configure": {
      patch<Params>("obs.status", (d) => ({
        ...d, ...(typeof p.url === "string" ? { url: p.url } : {}), ...(typeof p.password === "string" ? { passwordSet: p.password !== "" } : {}),
        ...(typeof p.replayWhilePlaying === "boolean" ? { replayWhilePlaying: p.replayWhilePlaying } : {}),
      }));
      return readCache("obs.status")?.data;
    }
    case "history.setNote":
      patch<{ sessions: { itemId: string; startedAt: string; note?: string }[] }>("history.get", (d) => ({ ...d, sessions: d.sessions.map((s) => (s.itemId === p.itemId && s.startedAt === p.startedAt ? { ...s, note: p.note as string } : s)) }));
      return true;
    default:
      if (method.startsWith("plugins.")) return applyPluginLocally(method, p);
      return true;
  }
}

/** Plugin entries in the cached "plugins.list". Installs from the store/file are added by plugins-offline.ts. */
function applyPluginLocally(method: string, p: Params): unknown {
  patch<{ plugins: (WithId & Params)[] }>("plugins.list", (d) => ({
    ...d,
    plugins: method === "plugins.uninstall" ? d.plugins.filter((x) => x.id !== p.id) : d.plugins.map((x) => {
      if (x.id !== p.id) return x;
      switch (method) {
        case "plugins.enable": return { ...x, enabled: true, granted: p.grant, disabledReason: undefined, missingPermissions: [] };
        case "plugins.disable": return { ...x, enabled: false, disabledReason: "Vom Nutzer deaktiviert" };
        case "plugins.revoke": return { ...x, granted: ((x.granted as string[]) ?? []).filter((g) => g !== p.permission), missingPermissions: [...((x.missingPermissions as string[]) ?? []), p.permission] };
        case "plugins.setFlags": return { ...x, ...(p.favorite !== undefined ? { favorite: p.favorite } : {}), ...(p.autoUpdate !== undefined ? { autoUpdate: p.autoUpdate } : {}) };
        case "plugins.setConfig": return { ...x, config: p.config };
        default: return x;
      }
    }),
  }), "{}");
  return true;
}

/** Ids handed out on this device are replaced by the PC's real ids once the creating change went through. */
export function substituteIds<T>(value: T, map: Map<string, string>): T {
  if (map.size === 0) return value;
  const walk = (v: unknown): unknown => typeof v === "string" ? map.get(v) ?? v : Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Params).map(([k, x]) => [k, walk(x)])) : v;
  return walk(value) as T;
}

/** Before sending: temporary ids of new objects are removed so the PC assigns real ones. */
export function prepareForPc(method: string, params: Params): { params: Params; tempId?: string } {
  const p = structuredClone(params);
  const strip = (o: Params) => { const id = o.id; if (isTemp(id)) { o.id = ""; return id as string; } return undefined; };
  if (method === "profiles.save" && p.profile) return { params: p, tempId: strip(p.profile as Params) };
  if (["quick.save", "automations.save", "hotkeys.save", "sounds.saveCollection"].includes(method)) return { params: p, tempId: strip(p) };
  if (method === "library.addSteam") return { params: p, tempId: p.tempId as string | undefined };
  return { params: p };
}
