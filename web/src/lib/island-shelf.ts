// The island's file shelf (3.59): files dropped on the island land in the PC's exchange folder, and one QR code opens that
// folder on the phone. The code holds only the web app's address and the "Dateien" page – no PC address, no code, no key –
// so it never expires and is worthless without a phone that is already paired (the phone signs in the usual way).
import { isLoopbackAddress } from "./address";

export const DEFAULT_APP_URL = "https://nilshenke-ops.github.io/pc-game-launcher-ultimate";
export const SHELF_ROUTE = "#/files";

/** The web app's address without file name, query, fragment or trailing slash; null for anything that is not http(s). */
export function appBase(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null; // never put sign-in data into a code anyone can photograph
    const path = u.pathname.replace(/\/index\.html?$/i, "").replace(/\/+$/, "");
    return `${u.protocol}//${u.host}${path}`;
  } catch { return null; }
}

/**
 * Where the phone should go. The PC's own setting for the web app wins; else this page when the phone can reach it
 * (not "localhost", which on a phone is the phone itself); else the public web app.
 */
export function shelfUrl(webAppUrl: string | undefined | null, here: { href: string; hostname: string }): string {
  const base = appBase(webAppUrl) ?? (!isLoopbackAddress(here.hostname) ? appBase(here.href) : null) ?? DEFAULT_APP_URL;
  return `${base}/${SHELF_ROUTE}`;
}

// ---------------------------------------------------------------- dropping files on the island
// Files dragged onto the closed island open it on the shelf; the shelf picks them up as soon as it is there.
let pending: File[] = [];
let wantShelf = false;
const sinks = new Set<(files: File[]) => void>();
const tabListeners = new Set<() => void>();

export function dropOnShelf(files: File[]) {
  if (!files.length) return;
  wantShelf = true;
  tabListeners.forEach((l) => l());
  if (sinks.size) sinks.forEach((s) => s(files)); else pending = [...pending, ...files];
}
/** The shelf registers itself; files dropped before it was shown are handed over at once. */
export function onShelfFiles(sink: (files: File[]) => void) {
  sinks.add(sink);
  if (pending.length) { const p = pending; pending = []; sink(p); }
  return () => { sinks.delete(sink); };
}
/** Files are dragged over the island: open it on the shelf (the files follow with the drop). */
export function requestShelf() { wantShelf = true; tabListeners.forEach((l) => l()); }
/** The panel asks whether it should open on the shelf (once). */
export function takeShelfRequest() { const w = wantShelf; wantShelf = false; return w; }
export function onShelfRequest(l: () => void) { tabListeners.add(l); return () => { tabListeners.delete(l); }; }
/** A drag that carries files (not text or a link from the page itself). */
export const carriesFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types ?? []).includes("Files");
