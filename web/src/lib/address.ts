// Turns what a person types or scans as "PC-Adresse" into the WebSocket address of the companion.
// Accepts e.g. "gaming-pc.tail1234.ts.net", "https://gaming-pc.tail1234.ts.net", "wss://…/ws" or "192.168.1.5:8787".

export function pcAddressToWs(input: string, pageIsHttps: boolean): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = (pageIsHttps ? "https://" : "http://") + s;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
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
  const ws = pcAddressToWs(input, false);
  if (!ws || !ws.startsWith("ws://")) return null;
  const u = new URL(ws.replace(/^ws:/, "http:"));
  const c = code.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9);
  return `http://${u.host}/#/pair${c ? `?code=${encodeURIComponent(c)}` : ""}`;
}
