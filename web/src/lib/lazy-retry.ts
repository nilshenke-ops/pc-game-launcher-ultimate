// After an update the old page may ask for program parts that no longer exist on the server (their file names changed). That used to show
// "Dieser Bereich konnte nicht geladen werden" and an island without content. Now the page reloads itself once and gets the new version.
import { lazy, type ComponentType } from "react";

const KEY = "pgl.chunkReload";

/** Throws away everything the device kept of the app (service worker + stored files) and loads it fresh from the server, bypassing the browser cache. */
export async function hardReload(): Promise<void> {
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() ?? []) await r.unregister(); } catch { /* none */ }
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* none */ }
  const u = new URL(location.href);
  u.searchParams.set("_r", String(Date.now()));                 // a new address: the browser cannot answer with its old copy of the page
  location.replace(u.toString());
}

/** Heals once (not again within 30 s, so a real outage never loops). Returns false when it did not. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage blocked */ }
  void hardReload();
  return true;
}

/** `lazy` that survives a stale version: a failed load reloads the page once instead of failing. */
export function lazyRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return lazy(() => load().catch((e) => {
    if (reloadOnceForNewVersion()) return new Promise<{ default: T }>(() => { /* the page is reloading */ });
    throw e;
  }));
}

export function watchPreloadErrors() {
  window.addEventListener("vite:preloadError", (e) => { if (reloadOnceForNewVersion()) e.preventDefault(); });
}
