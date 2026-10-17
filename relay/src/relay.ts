import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";

/**
 * PGL relay.
 * - Serves the web app (static files) and the companion download.
 * - Companions connect outbound to /companion and authenticate with id + secret.
 * - Browsers connect to /ws?pc=<id>; every browser connection becomes a channel that is forwarded as opaque frames.
 * The relay never sees pairing codes in a usable form and cannot log in itself: authentication happens end to end
 * between browser and companion (challenge-response). The relay only forwards and rate-limits.
 */

export interface CompanionConfig { id: string; secretSha256: string }
export interface RelayConfig {
  port: number;
  host: string;
  webDir: string;
  downloadsDir: string;
  companions: CompanionConfig[];
  trustProxy: boolean;
  allowedOrigins: string[];
  maxClientsPerCompanion: number;
  maxPayloadBytes: number;
}

export const VERSION = "1.0.0";

export function defaultConfig(base: string): RelayConfig {
  return {
    port: 8788,
    host: "0.0.0.0",
    webDir: resolve(base, "../web/dist"),
    downloadsDir: resolve(base, "downloads"),
    companions: [],
    trustProxy: false,
    allowedOrigins: [],
    maxClientsPerCompanion: 20,
    maxPayloadBytes: 2 * 1024 * 1024,
  };
}

export function sha256Hex(s: string) { return createHash("sha256").update(s, "utf8").digest("hex"); }

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // Structured logs without message contents or secrets.
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  hit(key: string) {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) { this.hits.set(key, list); return false; }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; media-src 'self' blob: data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

interface CompanionConn { ws: WebSocket; id: string; clients: Map<string, WebSocket>; alive: boolean }

export interface Relay { server: Server; close: () => Promise<void>; port: () => number; online: () => string[] }

export function createRelay(cfg: RelayConfig): Relay {
  const companions = new Map<string, CompanionConn>();
  const waiting = new Map<string, Set<WebSocket>>(); // browsers waiting for an offline companion
  const connLimiter = new RateLimiter(60, 60_000);
  const authLimiter = new RateLimiter(10, 300_000);
  const known = new Map(cfg.companions.map((c) => [c.id, c.secretSha256.toLowerCase()]));

  const clientIp = (req: IncomingMessage) => {
    if (cfg.trustProxy) {
      const h = (req.headers["cf-connecting-ip"] as string) || (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim();
      if (h) return h;
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  // ---------------------------------------------------------------- HTTP

  function send(res: ServerResponse, status: number, body: string | object, type = "application/json; charset=utf-8") {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type, "Content-Length": Buffer.byteLength(text), "Cache-Control": "no-store" });
    res.end(text);
  }

  function downloadManifest(): { available: boolean; fileName?: string; size?: number; sha256?: string; version?: string; url?: string; reason?: string; message?: string } {
    const file = join(cfg.downloadsDir, "manifest.json");
    if (!existsSync(file)) return { available: false, reason: "not-built", message: "Auf diesem Relay wurde noch kein Companion bereitgestellt (scripts/publish-companion legt ihn in relay/downloads ab)." };
    try {
      const m = JSON.parse(readFileSync(file, "utf8")) as { fileName: string; size: number; sha256: string; version: string };
      if (!/^[\w.-]+\.(exe|zip)$/.test(m.fileName)) throw new Error("Ungültiger Dateiname im Manifest");
      const path = join(cfg.downloadsDir, m.fileName);
      if (!existsSync(path)) return { available: false, reason: "missing", message: "Datei aus dem Manifest fehlt im Download-Ordner." };
      const size = statSync(path).size;
      if (size !== m.size) return { available: false, reason: "mismatch", message: "Dateigröße passt nicht zum Manifest – Datei bitte neu bereitstellen." };
      return { available: true, fileName: m.fileName, size, sha256: m.sha256, version: m.version, url: `download/${m.fileName}` };
    } catch (e) {
      return { available: false, reason: "invalid", message: `Download-Manifest fehlerhaft: ${(e as Error).message}` };
    }
  }

  function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
    const root = resolve(cfg.webDir);
    let rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
    let file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) { send(res, 400, "Bad request", "text/plain"); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(rel)) { send(res, 404, "Not found", "text/plain; charset=utf-8"); return; }
      rel = "index.html";
      file = join(root, rel);
      if (!existsSync(file)) { send(res, 503, "<h1>Web-App nicht gebaut</h1><p>Bitte im Ordner web <code>npm run build</code> ausführen.</p>", "text/html; charset=utf-8"); return; }
    }
    const st = statSync(file);
    const etag = `"${st.size.toString(16)}-${st.mtimeMs.toString(16)}"`;
    if (req.headers["if-none-match"] === etag) { res.writeHead(304, SECURITY_HEADERS); res.end(); return; }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": st.size,
      ETag: etag,
      "Cache-Control": rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    if (req.method === "HEAD") { res.end(); return; }
    createReadStream(file).pipe(res);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://relay.local");
    if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, { error: "method not allowed" }); return; }
    if (url.pathname === "/healthz") { send(res, 200, { ok: true, role: "relay", version: VERSION, companionsOnline: companions.size }); return; }
    if (url.pathname === "/download/info") { send(res, 200, downloadManifest()); return; }
    if (url.pathname.startsWith("/download/")) {
      const m = downloadManifest();
      const name = url.pathname.slice("/download/".length);
      if (!m.available || name !== m.fileName) { send(res, 404, { error: "Datei nicht verfügbar" }); return; }
      const path = join(cfg.downloadsDir, m.fileName!);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": m.fileName!.endsWith(".zip") ? "application/zip" : "application/vnd.microsoft.portable-executable",
        "Content-Length": m.size!,
        "Content-Disposition": `attachment; filename="${m.fileName}"`,
        "X-Checksum-SHA256": m.sha256!,
        "Cache-Control": "no-cache",
      });
      if (req.method === "HEAD") { res.end(); return; }
      createReadStream(path).pipe(res);
      return;
    }
    serveStatic(req, res, url.pathname);
  });

  // ---------------------------------------------------------------- WebSockets

  const wss = new WebSocketServer({ noServer: true, maxPayload: cfg.maxPayloadBytes });

  server.on("upgrade", (req, socket, head) => {
    const ip = clientIp(req);
    const url = new URL(req.url ?? "/", "http://relay.local");
    const reject = (code: number, text: string) => { socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    if (!connLimiter.hit(ip)) { reject(429, "Too Many Requests"); return; }
    if (url.pathname === "/companion") {
      wss.handleUpgrade(req, socket, head, (ws) => onCompanion(ws, ip));
      return;
    }
    if (url.pathname.endsWith("/ws")) {
      const origin = req.headers.origin;
      if (origin) {
        const o = new URL(origin);
        const sameHost = o.host === req.headers.host;
        if (!sameHost && !cfg.allowedOrigins.includes(o.origin)) { reject(403, "Forbidden"); return; }
      }
      let pc = url.searchParams.get("pc");
      if (!pc && known.size === 1) pc = [...known.keys()][0];
      if (!pc || !known.has(pc)) { reject(404, "Unknown PC"); return; }
      wss.handleUpgrade(req, socket, head, (ws) => onClient(ws, pc!, ip));
      return;
    }
    reject(404, "Not Found");
  });

  function onCompanion(ws: WebSocket, ip: string) {
    let conn: CompanionConn | null = null;
    const timer = setTimeout(() => { if (!conn) ws.close(4401, "auth timeout"); }, 10_000);
    ws.on("message", (raw: RawData) => {
      let f: { t?: string; id?: string; secret?: string; ch?: string; d?: string; reason?: string };
      try { f = JSON.parse(raw.toString()); } catch { return; }
      if (!conn) {
        if (f.t !== "auth" || typeof f.id !== "string" || typeof f.secret !== "string") { ws.close(4400, "auth expected"); return; }
        const expected = known.get(f.id);
        const ok = !!expected && authLimiter.hit(ip) && timingSafeEqual(Buffer.from(sha256Hex(f.secret)), Buffer.from(expected.padEnd(64, "0").slice(0, 64)));
        if (!ok) {
          log("warn", "companion auth failed", { ip, id: f.id });
          ws.send(JSON.stringify({ t: "error", message: "Companion-ID oder Relay-Schlüssel falsch." }));
          ws.close(4403, "forbidden");
          return;
        }
        clearTimeout(timer);
        const old = companions.get(f.id);
        if (old) { log("info", "companion replaced", { id: f.id }); old.ws.close(4409, "replaced"); }
        conn = { ws, id: f.id, clients: new Map(), alive: true };
        companions.set(f.id, conn);
        ws.send(JSON.stringify({ t: "ok", version: VERSION }));
        log("info", "companion online", { id: f.id, ip });
        for (const c of waiting.get(f.id) ?? []) c.send(JSON.stringify({ type: "relay", state: "companion-online" }));
        return;
      }
      if (typeof f.ch !== "string") return;
      const client = conn.clients.get(f.ch);
      if (!client) return;
      if (f.t === "msg" && typeof f.d === "string") {
        if (client.bufferedAmount > 8 * 1024 * 1024) { client.close(1013, "slow client"); return; }
        client.send(f.d);
      } else if (f.t === "close") {
        client.close(4000, (f.reason ?? "closed").slice(0, 100));
      }
    });
    ws.on("pong", () => { if (conn) conn.alive = true; });
    ws.on("close", () => {
      clearTimeout(timer);
      if (conn && companions.get(conn.id) === conn) {
        companions.delete(conn.id);
        log("info", "companion offline", { id: conn.id });
        for (const c of conn.clients.values()) {
          c.send(JSON.stringify({ type: "relay", state: "companion-offline" }));
          addWaiting(conn.id, c);
        }
      }
    });
    ws.on("error", () => {});
  }

  function addWaiting(pc: string, ws: WebSocket) {
    if (!waiting.has(pc)) waiting.set(pc, new Set());
    waiting.get(pc)!.add(ws);
  }

  function onClient(ws: WebSocket, pc: string, ip: string) {
    const ch = randomBytes(9).toString("base64url");
    const msgLimiter = new RateLimiter(300, 10_000);
    let attachedTo: CompanionConn | null = null;
    let alive = true;

    const attach = () => {
      const comp = companions.get(pc);
      if (!comp || comp.clients.size >= cfg.maxClientsPerCompanion) return false;
      comp.clients.set(ch, ws);
      comp.ws.send(JSON.stringify({ t: "open", ch, ip }));
      attachedTo = comp;
      waiting.get(pc)?.delete(ws);
      return true;
    };

    if (!attach()) {
      ws.send(JSON.stringify({ type: "relay", state: "companion-offline" }));
      addWaiting(pc, ws);
    }

    ws.on("message", (raw: RawData, isBinary: boolean) => {
      if (isBinary) { ws.close(1003, "text only"); return; }
      if (!msgLimiter.hit("m")) { ws.close(1008, "rate limit"); return; }
      const comp = attachedTo && companions.get(pc) === attachedTo ? attachedTo : null;
      if (!comp) {
        // The browser keeps the socket; it will reconnect when "companion-online" arrives.
        attachedTo = null;
        ws.send(JSON.stringify({ type: "relay", state: "companion-offline" }));
        return;
      }
      if (comp.ws.bufferedAmount > 16 * 1024 * 1024) { ws.close(1013, "relay busy"); return; }
      comp.ws.send(JSON.stringify({ t: "msg", ch, d: raw.toString() }));
    });
    ws.on("pong", () => { alive = true; });
    const ping = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 30_000);
    ws.on("close", () => {
      clearInterval(ping);
      waiting.get(pc)?.delete(ws);
      const comp = companions.get(pc);
      if (comp && comp.clients.get(ch) === ws) {
        comp.clients.delete(ch);
        comp.ws.send(JSON.stringify({ t: "close", ch }));
      }
    });
    ws.on("error", () => {});
  }

  const heartbeat = setInterval(() => {
    for (const c of companions.values()) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      c.ws.ping();
    }
  }, 30_000);

  return {
    server,
    port: () => { const a = server.address(); return typeof a === "object" && a ? a.port : cfg.port; },
    online: () => [...companions.keys()],
    close: () => new Promise((r) => {
      clearInterval(heartbeat);
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}
