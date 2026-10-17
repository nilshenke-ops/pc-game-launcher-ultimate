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
