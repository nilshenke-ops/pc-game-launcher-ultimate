// Which queued changes need a fresh confirmation before they are sent to the PC (kept apart so it is easy to test).

/** Changes that grant rights or bring in new code: sent only after the user confirms again. */
export const CONFIRM_METHODS = new Set(["plugins.installCatalog", "plugins.importFile", "plugins.enable"]);
/** Changes older than this wait for a confirmation – after a long time the user may no longer want them. */
export const STALE_MS = 7 * 24 * 3600 * 1000;
export const needsConfirm = (e: { method: string; at: number; confirmed?: boolean }, now = Date.now()) =>
  !e.confirmed && (CONFIRM_METHODS.has(e.method) || now - e.at > STALE_MS);
