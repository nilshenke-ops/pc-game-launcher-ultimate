// Last data loaded from the PC, kept on this device so lists (games, Game Pass) can still be looked at while the PC is off.
// Always shown with its date ("Stand …") and never used to start anything – actions need the PC.
// Cleared when this device signs out or is removed on the PC.

import type { AppState } from "./types";

const PREFIX = "pgl.cache.";
// Plugins: list and files of installed plugins, so their widgets and themes also work while the PC is off.
// Settings lists: kept so they can be changed without the PC (lib/outbox.ts queues the change and updates this copy).
export const CACHED_METHODS = new Set(["library.list", "gamepass.list", "steam.list", "launchers.list", "plugins.list", "plugins.files",
  "quick.list", "profiles.list", "automations.list", "hotkeys.list", "sounds.list", "audio.state", "settings.get", "history.get", "obs.status", "capture.status", "overlay.layout", "overlay.presets", "vault.list", "inventory.get", "privacy.status", "gamestate.list", "remote.status", "moves.list", "moves.options", "widgets.list", "network.targets", "quests.get", "deals.list", "deck.list", "calendar.list", "activity.get", "storage.get", "files.list", "captures.list", "layouts.list", "mods.overview", "mods.list", "rgb.status", "rgb.settings", "controllers.list", "input.list", "input.devices", "history.startTimes", "state.get"]);
const key = (method: string, params?: string) => PREFIX + method + (params && params !== "{}" ? params : "");

export function saveCache(method: string, data: unknown, params?: string) {
  if (!CACHED_METHODS.has(method)) return;
  const k = key(method, params), v = JSON.stringify({ at: Date.now(), data });
  try { localStorage.setItem(k, v); return; } catch { /* storage full or blocked */ }
  // Full: the oldest saved copies make room (never the one being written); if it still does not fit, say so once.
  try {
    const old = Object.keys(localStorage).filter((x) => x.startsWith(PREFIX) && x !== k)
      .map((x) => { try { return { x, at: (JSON.parse(localStorage.getItem(x) ?? "{}") as { at?: number }).at ?? 0 }; } catch { return { x, at: 0 }; } })
      .sort((a, b) => a.at - b.at);
    for (const o of old.slice(0, Math.max(1, Math.ceil(old.length / 3)))) localStorage.removeItem(o.x);
    localStorage.setItem(k, v);
  } catch { cacheFull = true; cacheListeners.forEach((l) => l()); }
}

/** True once a copy could not be saved even after making room – the app then says so instead of failing silently. */
let cacheFull = false;
const cacheListeners = new Set<() => void>();
export const cacheIsFull = () => cacheFull;
export const onCacheFull = (fn: () => void) => { cacheListeners.add(fn); return () => cacheListeners.delete(fn); };

/** Raised when a copy came from the cloud (not from a live answer), so open pages show it – see lib/cloud-sync.ts. */
let cacheVer = 0;
const cacheVerListeners = new Set<() => void>();
export const bumpCache = () => { cacheVer++; cacheVerListeners.forEach((l) => l()); };
export const cacheStore = { subscribe: (fn: () => void) => { cacheVerListeners.add(fn); return () => cacheVerListeners.delete(fn); }, version: () => cacheVer };

export function readCache<T>(method: string, params?: string): { at: number; data: T } | null {
  if (!CACHED_METHODS.has(method)) return null;
  try { const v = localStorage.getItem(key(method, params)); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function clearCaches() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); } catch { /* blocked */ }
}

/** What stays on this device from the overview: names, profile, counts – never what runs or plays right now. */
export const savedOverview = (s: AppState): AppState => ({ ...s, running: [], playing: { playing: [], queued: 0 }, relay: { state: "off", clients: 0 }, updates: { ...s.updates, downloaded: false, canInstall: false } });
