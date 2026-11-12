// Cloud link: the PC's companion and the devices of ONE account meet here, so a phone finds the PC again by itself as soon as Windows is up –
// without a QR code, an open router port or a VPN. One Durable Object per account ("PcLink"), WebSockets with hibernation (an idle link costs nothing).
//
//   GET /api/link/companion?user=<name>   (WebSocket)  the PC, outbound. First frame {t:"auth", id:<user>, secret:<device token>} -> {t:"ok"}
//   GET /api/link/ws?user=<name>          (WebSocket)  a device.        First frame {type:"link-auth", token:<device token>}
//                                                      -> {type:"relay", state:"companion-online" | "companion-offline"}
//
// The frames between PC and device are the same as with the self-hosted relay (relay/src/relay.ts): {t:"open",ch,ip} {t:"msg",ch,d} {t:"close",ch}.
// The link only forwards them. It cannot log in at the PC and cannot read commands' answers' meaning: the device proves itself to the PC end to end
// (challenge-response with its device key), exactly as in the home network. Tokens are the account's sync tokens (D1 keeps only their SHA-256);
// revoking a token or deleting the account ends its access here as well (checked whenever a socket authenticates).

export const LINK_VERSION = "1.0.0";
const USER_RX = /^[a-z0-9._-]{3,24}$/;
const MAX_CLIENTS = 20;
const MAX_FRAME = 4 * 1024 * 1024;
const AUTH_TIMEOUT_MS = 15_000;

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Does this device token belong to the account? (Same table as the sync: only the hash is stored.) */
async function tokenValid(env, user, token) {
  if (!env.DB || typeof token !== "string" || token.length < 20 || token.length > 200) return false;
  try {
    const row = await env.DB.prepare("SELECT user FROM sync_tokens WHERE hash = ?1").bind(await sha256Hex(token)).first();
    return !!row && row.user === user;
  } catch { return false; }
}

/** Entry from the Worker: picks the account's object. Everything else happens inside it. */
export function handleLink(request, env, url) {
  const plain = (status, error, message) => new Response(JSON.stringify({ ok: false, error, message }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  if (!env.PC_LINK) return plain(503, "link-unavailable", "Der Cloud-Verbindungsdienst ist auf diesem Server nicht eingerichtet (Durable-Object-Bindung PC_LINK fehlt).");
  const role = url.pathname === "/api/link/companion" ? "companion" : url.pathname === "/api/link/ws" ? "client" : null;
  if (!role) return plain(404, "not-found", "Unbekannter Pfad.");
  if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") return plain(426, "upgrade-required", "Hier wird eine WebSocket-Verbindung erwartet.");
  const user = (url.searchParams.get("user") || "").toLowerCase();
  if (!USER_RX.test(user)) return plain(400, "invalid-params", "Ungültiger Benutzername.");
  return env.PC_LINK.get(env.PC_LINK.idFromName(user)).fetch(request);
}

export class PcLink {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    // Heartbeat of idle devices without waking the object.
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"link-ping"}', '{"type":"link-pong"}')); } catch { /* older runtime */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.pathname === "/api/link/companion" ? "companion" : "client";
    const user = (url.searchParams.get("user") || "").toLowerCase();
    if (role === "client" && this.ctx.getWebSockets("client").length >= MAX_CLIENTS) return new Response("Too many devices", { status: 429 });
    const pair = new WebSocketPair();
    const ch = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    this.ctx.acceptWebSocket(pair[1], role === "client" ? ["client", "ch:" + ch] : ["companion"]);
    pair[1].serializeAttachment({ role, user, ch, ip: request.headers.get("cf-connecting-ip") || "cloud", authed: false, attached: false, at: Date.now() });
    // A socket that never authenticates is closed (the alarm also wakes a hibernating object).
    try { const cur = await this.ctx.storage.getAlarm(); if (cur == null) await this.ctx.storage.setAlarm(Date.now() + AUTH_TIMEOUT_MS); } catch { /* no alarms: the socket just stays unauthenticated and useless */ }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async alarm() {
    let waiting = false;
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || a.authed) continue;
      if (Date.now() - a.at >= AUTH_TIMEOUT_MS) { try { ws.close(4401, "auth timeout"); } catch { /* gone */ } }
      else waiting = true;
    }
    if (waiting) await this.ctx.storage.setAlarm(Date.now() + AUTH_TIMEOUT_MS);
  }

  /** The PC's connection (the newest one, if an older one is still closing). */
  companion() {
    let best = null, bestAt = -1;
    for (const ws of this.ctx.getWebSockets("companion")) { const a = ws.deserializeAttachment(); if (a?.authed && a.since > bestAt) { best = ws; bestAt = a.since; } }
    return best;
  }
  send(ws, obj) { try { ws.send(typeof obj === "string" ? obj : JSON.stringify(obj)); return true; } catch { return false; } }

  /** Puts an authenticated device through to the PC (a new channel at the PC). */
  attach(ws, a) {
    const pc = this.companion();
    if (!pc || !this.send(pc, { t: "open", ch: a.ch, ip: a.ip })) return false;
    ws.serializeAttachment({ ...a, attached: true });
    return true;
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") { try { ws.close(1003, "text only"); } catch { /* gone */ } return; }
    if (message.length > MAX_FRAME) { try { ws.close(1009, "too big"); } catch { /* gone */ } return; }
    const a = ws.deserializeAttachment();
    if (!a) return;

    if (!a.authed) {
      let f; try { f = JSON.parse(message); } catch { f = null; }
      const token = a.role === "companion" ? (f?.t === "auth" && f.id === a.user ? f.secret : null) : (f?.type === "link-auth" ? f.token : null);
      // Marked at once, so a second frame that arrives while the token is checked is not taken for another login attempt.
      ws.serializeAttachment({ ...a, at: Date.now() + 60_000 });
      const ok = token != null && await tokenValid(this.env, a.user, token);
      if (!ok) {
        this.send(ws, a.role === "companion" ? { t: "error", message: "Cloud-Konto oder Geräte-Token ungültig – der PC meldet sich beim nächsten Abgleich neu an." } : { type: "relay", state: "auth-failed" });
        try { ws.close(4403, "forbidden"); } catch { /* gone */ }
        return;
      }
      if (a.role === "companion") {
        // One PC per account at a time: a newer connection replaces the older one (restart, network change).
        for (const old of this.ctx.getWebSockets("companion")) if (old !== ws) { try { old.close(4409, "replaced"); } catch { /* gone */ } }
        ws.serializeAttachment({ ...a, authed: true, since: Date.now() });
        this.send(ws, { t: "ok", version: LINK_VERSION });
        // Devices that were waiting get their channel now and start their session on the socket they already have.
        for (const c of this.ctx.getWebSockets("client")) {
          const ca = c.deserializeAttachment();
          if (!ca?.authed) continue;
          if (this.attach(c, { ...ca, attached: false })) this.send(c, { type: "relay", state: "companion-online" });
        }
        return;
      }
      const mine = { ...a, authed: true, attached: false };
      ws.serializeAttachment(mine);
      this.send(ws, { type: "relay", state: this.attach(ws, mine) ? "companion-online" : "companion-offline" });
      return;
    }

    if (a.role === "companion") {
      let f; try { f = JSON.parse(message); } catch { return; }
      if (typeof f?.ch !== "string") return;
      const target = this.ctx.getWebSockets("ch:" + f.ch)[0];
      if (!target) return;
      if (f.t === "msg" && typeof f.d === "string") this.send(target, f.d);
      else if (f.t === "close") {
        // The PC ended this session (e.g. the device was removed): the device starts a new one on a fresh connection.
        try { target.close(4000, String(f.reason ?? "closed").slice(0, 100)); } catch { /* gone */ }
      }
      return;
    }

    // a device
    const pc = a.attached ? this.companion() : null;
    if (!pc) { this.send(ws, { type: "relay", state: "companion-offline" }); return; }
    this.send(pc, { t: "msg", ch: a.ch, d: message });
  }

  async webSocketClose(ws) { this.gone(ws); }
  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const a = ws.deserializeAttachment();
    if (!a?.authed) return;
    if (a.role === "companion") {
      // Replaced by a newer connection of the PC: the devices already talk to that one.
      if (this.ctx.getWebSockets("companion").some((o) => o !== ws && o.deserializeAttachment()?.authed)) return;
      for (const c of this.ctx.getWebSockets("client")) {
        const ca = c.deserializeAttachment();
        if (!ca?.authed) continue;
        c.serializeAttachment({ ...ca, attached: false });
        this.send(c, { type: "relay", state: "companion-offline" });
      }
      return;
    }
    if (a.attached) { const pc = this.companion(); if (pc) this.send(pc, { t: "close", ch: a.ch }); }
  }
}
