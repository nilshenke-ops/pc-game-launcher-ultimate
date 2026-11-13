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
