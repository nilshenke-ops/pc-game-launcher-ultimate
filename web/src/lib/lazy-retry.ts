// After an update the old page may ask for program parts that no longer exist on the server (their file names changed). That used to show
// "Dieser Bereich konnte nicht geladen werden" and an island without content. Now the page reloads itself once and gets the new version.
import { lazy, type ComponentType } from "react";

const KEY = "pgl.chunkReload";

/** Reloads once (not again within 30 s, so a real outage never loops). Returns false when it did not reload. */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* storage blocked: still reload once per call below */ }
  const done = () => location.reload();
  // The old copy of the files must not be served again: forget the cached app shell, then reload.
  if ("caches" in window) caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).then(done, done); else done();
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
