import { loginProof } from "./sha256";
import { t } from "./i18n";

export const PROTOCOL_VERSION = 1;

export interface Hello {
  protocol: number;
  nonce: string;
  transport: "local" | "relay";
  info: { app: string; version: string; pcName: string; platform: string; features: Record<string, boolean> };
}

export interface Me { isLocal: boolean; permissions: string[]; device?: { id: string; name: string } | null }

export interface ConnStatus {
  phase: "connecting" | "online" | "offline";
  attempt: number;
  retryAt?: number;
  lastError?: string;
  everConnected: boolean;
  relayCompanion?: "online" | "offline";
  auth: "none" | "checking" | "ok" | "failed" | "revoked";
  authError?: string;
  hello?: Hello;
  me?: Me;
  latencyMs?: number;
  url: string;
}

export class RpcError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

interface Credentials { deviceId: string; token: string; pcName?: string }
type Listener = (data: unknown) => void;

const CRED_KEY = "pgl.cred";
const SERVER_KEY = "pgl.server";
const ADMIN_KEY = "pgl.admin";
const REQUEST_TIMEOUT_MS = 20000;

function store(kind: "local" | "session") {
  try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}

export function readJson<T>(key: string, kind: "local" | "session" = "local"): T | null {
  try { const v = store(kind)?.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
export function writeJson(key: string, value: unknown, kind: "local" | "session" = "local") {
  try { if (value === null) store(kind)?.removeItem(key); else store(kind)?.setItem(key, JSON.stringify(value)); } catch { /* storage blocked (private mode) */ }
}

/** Default: the server that delivered this page. Can be overridden per browser (e.g. relay address). */
export function defaultServerUrl(): string {
  const base = new URL("ws", location.origin + location.pathname);
  base.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const pc = new URLSearchParams(location.search).get("pc");
  if (pc) base.searchParams.set("pc", pc);
  return base.toString();
}

export function serverUrl(): string {
  return readJson<string>(SERVER_KEY) || defaultServerUrl();
}

export function setServerUrl(url: string | null) {
  writeJson(SERVER_KEY, url && url.trim() ? url.trim() : null);
}

/** Reads the PC session token (injected by the companion window or passed as #admin=... from the tray menu). */
export function captureAdminToken() {
  const w = window as unknown as { __PGL_ADMIN__?: string };
  if (w.__PGL_ADMIN__) writeJson(ADMIN_KEY, w.__PGL_ADMIN__, "session");
  const m = location.hash.match(/^#admin=([A-Za-z0-9_-]{20,})/);
  if (m) {
    writeJson(ADMIN_KEY, m[1], "session");
    history.replaceState(null, "", location.pathname + location.search + "#/");
  }
}

class Client {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number }>();
  private listeners = new Map<string, Set<Listener>>();
  private statusListeners = new Set<() => void>();
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private attempt = 0;
  private started = false;
  status: ConnStatus = { phase: "connecting", attempt: 0, everConnected: false, auth: "none", url: "" };

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener("online", () => this.reconnectNow());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && this.status.phase === "offline") this.reconnectNow(); });
    this.connect();
  }

  subscribe = (fn: () => void) => { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); };
  getStatus = () => this.status;

  private set(patch: Partial<ConnStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((l) => l());
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => { this.listeners.get(event)?.delete(fn); };
  }

  private emit(event: string, data: unknown) {
    this.listeners.get(event)?.forEach((l) => { try { l(data); } catch (e) { console.error(e); } });
    this.listeners.get("*")?.forEach((l) => l({ event, data }));
  }

  get credentials(): Credentials | null { return readJson<Credentials>(CRED_KEY); }
  get hasAdminToken() { return !!readJson<string>(ADMIN_KEY, "session"); }

  reconnectNow() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.ws && this.ws.readyState <= 1) return;
    this.attempt = 0;
    this.connect();
  }

  /** Closes and reopens the connection, e.g. after the server address was changed. */
  restart() {
    this.ws?.close();
    this.ws = null;
    this.reconnectNow();
  }

  private connect() {
    const url = serverUrl();
    this.set({ phase: "connecting", url, attempt: this.attempt, retryAt: undefined });
    let ws: WebSocket;
    try { ws = new WebSocket(url); }
    catch (e) { this.onClosed(t("Ungültige Serveradresse: {e}", { e: String(e) })); return; }
    this.ws = ws;
    this.nextId = 1;
    const openTimeout = window.setTimeout(() => { if (ws.readyState === WebSocket.CONNECTING) ws.close(); }, 10000);
    ws.onopen = async () => {
      clearTimeout(openTimeout);
      this.attempt = 0;
      try {
        const hello = await this.call<Hello>("hello");
        this.set({ phase: "online", hello, everConnected: true, lastError: undefined });
        await this.authenticate();
        this.startPing();
      } catch (e) {
        if ((e as RpcError).code === "relay-companion-offline") return;
        this.set({ lastError: (e as Error).message });
      }
    };
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = (ev) => {
      clearTimeout(openTimeout);
      if (this.ws !== ws) return;
      this.onClosed(ev.reason || (this.status.everConnected ? t("Verbindung unterbrochen") : t("Companion nicht erreichbar")));
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private onClosed(reason: string) {
    this.ws = null;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new RpcError("offline", t("Verbindung unterbrochen"))); }
    this.pending.clear();
    // Exponential backoff with jitter: 1, 2, 4, 8, 15, 30 s.
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt, 5)) * (0.8 + Math.random() * 0.4);
    this.attempt++;
    const auth = this.status.auth === "revoked" ? "revoked" : this.status.auth === "ok" ? "checking" : this.status.auth;
    this.set({ phase: "offline", lastError: reason, retryAt: Date.now() + delay, attempt: this.attempt, auth, relayCompanion: undefined });
    this.retryTimer = window.setTimeout(() => { this.retryTimer = null; this.connect(); }, delay);
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = async () => {
      const t = performance.now();
      try { await this.call("ping"); this.set({ latencyMs: Math.round(performance.now() - t) }); } catch { /* reconnect handles it */ }
    };
    ping();
    this.pingTimer = window.setInterval(ping, 15000);
  }

  private onMessage(text: string) {
    let msg: { v?: number; id?: number; ok?: boolean; r?: unknown; e?: { code: string; message: string }; ev?: string; d?: unknown; type?: string; state?: string };
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.type === "relay") {
      // Status messages from the relay itself (not from the companion).
      const online = msg.state === "companion-online";
      const wasOffline = this.status.relayCompanion === "offline";
      this.set({ relayCompanion: online ? "online" : "offline" });
      // The PC came back: start a fresh session (new hello/nonce) through the relay.
      if (online && wasOffline) { this.restart(); return; }
      if (!online) for (const [, p] of this.pending) p.reject(new RpcError("relay-companion-offline", t("Der PC ist gerade nicht mit dem Relay verbunden.")));
      return;
    }
    if (msg.ev) {
      if (msg.ev === "auth.revoked") {
        writeJson(CRED_KEY, null);
        this.set({ auth: "revoked", me: undefined, authError: (msg.d as { reason?: string })?.reason });
      }
      this.emit(msg.ev, msg.d);
      return;
    }
    if (typeof msg.id === "number") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.r);
      else p.reject(new RpcError(msg.e?.code ?? "error", msg.e?.message ?? t("Unbekannter Fehler")));
    }
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new RpcError("offline", t("Keine Verbindung zum PC.")));
        return;
      }
      const id = this.nextId++;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError("timeout", t("Der PC hat nicht rechtzeitig geantwortet.")));
      }, method === "network.diagnose" || method === "updates.download" || method === "sounds.importUrl" ? 90000 : REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ v: PROTOCOL_VERSION, id, m: method, p: params ?? {} }));
    });
  }

  async authenticate() {
    const hello = this.status.hello;
    if (!hello) return;
    const admin = readJson<string>(ADMIN_KEY, "session");
    const cred = this.credentials;
    if (!admin && !cred) {
      // Keep "revoked" so the pairing screen can explain why the device was signed out.
      this.set({ auth: this.status.auth === "revoked" ? "revoked" : "none", me: undefined });
      return;
    }
    this.set({ auth: "checking" });
    try {
      const me = admin
        ? await this.call<Me>("auth.login", { adminToken: admin })
        : await this.call<Me>("auth.login", { deviceId: cred!.deviceId, proof: loginProof(cred!.token, hello.nonce) });
      this.set({ auth: "ok", me, authError: undefined });
      this.emit("authenticated", me);
    } catch (e) {
      const err = e as RpcError;
      if (err.code === "auth-failed") {
        if (admin) writeJson(ADMIN_KEY, null, "session");
        else writeJson(CRED_KEY, null);
      }
      this.set({ auth: err.code === "auth-failed" ? "failed" : "none", authError: err.message, me: undefined });
    }
  }

  async savePairing(token: string, deviceId: string) {
    writeJson(CRED_KEY, { deviceId, token, pcName: this.status.hello?.info.pcName });
    await this.authenticate();
  }

  async logout() {
    try { await this.call("auth.logout"); } catch { /* ignore */ }
    writeJson(CRED_KEY, null);
    writeJson(ADMIN_KEY, null, "session");
    this.set({ auth: "none", me: undefined });
  }

  can(permission: string) { return this.status.me?.permissions.includes(permission) ?? false; }
}

export const client = new Client();
