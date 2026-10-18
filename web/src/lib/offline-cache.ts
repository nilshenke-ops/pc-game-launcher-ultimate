// Last data loaded from the PC, kept on this device so lists (games, Game Pass) can still be looked at while the PC is off.
// Always shown with its date ("Stand …") and never used to start anything – actions need the PC.
// Cleared when this device signs out or is removed on the PC.

const PREFIX = "pgl.cache.";
export const CACHED_METHODS = new Set(["library.list", "gamepass.list"]);

export function saveCache(method: string, data: unknown) {
  if (!CACHED_METHODS.has(method)) return;
  try { localStorage.setItem(PREFIX + method, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full or blocked */ }
}

export function readCache<T>(method: string): { at: number; data: T } | null {
  if (!CACHED_METHODS.has(method)) return null;
  try { const v = localStorage.getItem(PREFIX + method); return v ? JSON.parse(v) : null; } catch { return null; }
}

export function clearCaches() {
  try { for (const m of CACHED_METHODS) localStorage.removeItem(PREFIX + m); } catch { /* blocked */ }
}
