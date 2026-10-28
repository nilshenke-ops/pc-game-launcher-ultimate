// Turns what a person types or scans as "PC-Adresse" into the WebSocket address of the companion.
// Accepts e.g. "gaming-pc.tail1234.ts.net", "https://gaming-pc.tail1234.ts.net", "wss://…/ws" or "192.168.1.5:8787".

const DEFAULT_PORT = 8787;
const HOME_HOST = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.(fritz\.box|local|lan|home|speedport\.ip))$/;

export function pcAddressToWs(input: string, pageIsHttps: boolean): string | null {
  let s = input.trim();
  if (!s) return null;
  const typedScheme = /^[a-z]+:\/\//i.test(s);
  // A home-network address (192.168.x.x, 10.x, name.fritz.box, name.local …) is always plain http – the PC has no
  // certificate for it; typed without a port it means the companion's default port.
  const home = !typedScheme && HOME_HOST.test(s.split(/[/:]/)[0].toLowerCase());
  if (!typedScheme) s = (pageIsHttps && !home ? "https://" : "http://") + s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (home && !u.port) u.port = String(DEFAULT_PORT);
  if (!["http:", "https:", "ws:", "wss:"].includes(u.protocol) || !u.hostname) return null;
  const secure = u.protocol === "https:" || u.protocol === "wss:";
  const base = u.pathname.replace(/\/+$/, "");
  const path = base.endsWith("/ws") ? base : `${base}/ws`;
  return `${secure ? "wss" : "ws"}://${u.host}${path}${u.search}`;
}

/** 127.0.0.1 / localhost always mean "this device" – on an iPad that is the iPad, never the PC. */
export function isLoopbackAddress(wsOrHost: string): boolean {
  let host = wsOrHost;
  try { host = new URL(wsOrHost).hostname; } catch { /* plain host */ }
  host = host.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host);
}

/** Short form for display and for the "pc" parameter in pairing links. */
export function wsToPcAddress(ws: string): string {
  try {
    const u = new URL(ws);
    const path = u.pathname.replace(/\/ws$/, "");
    return u.host + (path && path !== "/" ? path : "") + u.search;
  } catch { return ws; }
}

/**
 * An https page (the website) may not talk to a plain http PC address in the home network – the browser blocks it.
 * Opening the PC's own page directly is allowed: this is that link (with the code already filled in), or null when the
 * address is not a plain http one.
 */
export function directPairUrl(input: string, code: string): string | null {
  // Only a home-network address (IP, name.fritz.box, name.local) or a typed http:// one – a name like
  // gaming.tail1234.ts.net without scheme is an https address and is reached directly, not via http.
  const ws = pcAddressToWs(input, true);
  if (!ws || !ws.startsWith("ws://")) return null;
  const u = new URL(ws.replace(/^ws:/, "http:"));
  const c = code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9);
  return `http://${u.host}/#/pair${c ? `?code=${encodeURIComponent(c)}` : ""}`;
}
