// Last data loaded from the PC, kept on this device so lists (games, Game Pass) can still be looked at while the PC is off.
// Always shown with its date ("Stand …") and never used to start anything – actions need the PC.
// Cleared when this device signs out or is removed on the PC.

const PREFIX = "pgl.cache.";
// Plugins: list and files of installed plugins, so their widgets and themes also work while the PC is off.
// Settings lists: kept so they can be changed without the PC (lib/outbox.ts queues the change and updates this copy).
export const CACHED_METHODS = new Set(["library.list", "gamepass.list", "steam.list", "launchers.list", "plugins.list", "plugins.files",
  "quick.list", "profiles.list", "automations.list", "hotkeys.list", "sounds.list", "audio.state", "settings.get", "history.get", "obs.status", "capture.status", "overlay.layout", "widgets.list", "network.targets", "quests.get", "deals.list", "deck.list"]);
const key = (method: string, params?: string) => PREFIX + method + (params && params !== "{}" ? params : "");

export function saveCache(method: string, data: unknown, params?: string) {
  if (!CACHED_METHODS.has(method)) return;
  try { localStorage.setItem(key(method, params), JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ }
}

export function readCache<T>(method: string, params?: string): { at: number; data: T } | null {
  if (!CACHED_METHODS.has(method)) return null;
  try { const v = localStorage.getItem(key(method, params)); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function clearCaches() {
  try { for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k); } catch { /* blocked */ }
}
