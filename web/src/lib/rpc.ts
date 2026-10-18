import { loginProof } from "./sha256";
import { t } from "./i18n";
import { attachDemo, demoCall } from "./demo";
import { clearCaches } from "./offline-cache";
import { enqueue, outbox, QUEUEABLE } from "./outbox";

export const PROTOCOL_VERSION = 1;

export interface Hello {
  protocol: number;
  nonce: string;
  transport: "local" | "relay";
  info: { app: string; version: string; pcName: string; platform: string; features: Record<string, boolean> };
}

export interface Me { isLocal: boolean; permissions: string[]; device?: { id: string; name: string } | null }

/** Hosted build: the web app lives on a static host and connects to the PC address the user scans or types. */
export const HOSTED = import.meta.env.VITE_HOSTED === "1";

export interface ConnStatus {
  phase: "connecting" | "online" | "offline";
  attempt: number;
  retryAt?: number;
  lastError?: string;
  everConnected: boolean;
  relayCompanion?: "online" | "offline";
  /** The user opened the app without a PC connection (design/layout can be changed, connects automatically later). */
  offlineShell?: boolean;
  /** Hosted build without a saved PC address: show "PC verbinden" instead of connecting anywhere. */
  needsServer?: boolean;
  auth: "none" | "checking" | "ok" | "failed" | "revoked";
  /** This page has been logged in to a real PC at least once (no example data after that). */
  everAuthed?: boolean;
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
const OFFLINE_KEY = "pgl.offlineShell";
const SERVER_KEY = "pgl.server";
const ADMIN_KEY = "pgl.admin";
const REQUEST_TIMEOUT_MS = 20000;

// Without a logged-in PC every section can be opened, but shows "Offline" instead of content (no example data).
/** Requests that pages make by themselves (loading data); they fail quietly instead of opening the "PC verbinden" hint. */
const QUIET = /\.(list|get|status|state|logs|subscribe|unsubscribe|diagnose|run|me|pending|getPrefs)$/;
// Requests that work without login (connection setup and pairing) always go to the PC.
const NO_LOGIN = new Set(["hello", "ping", "auth.login", "pairing.request", "pairing.claim"]);

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

export function serverConfigured() { return !!readJson<string>(SERVER_KEY); }

export function setServerUrl(url: string | null) {
  writeJson(SERVER_KEY, url && url.trim() ? url.trim() : null);
}

// ------------------------------------------------------------------ several PCs
// Every paired PC is remembered with its own address and device key. Only one is connected at a time; profiles,
// games and sounds stay on the respective PC. Switching clears the data cache of the previous PC on this device.

const PCS_KEY = "pgl.pcs";
const PERMS_KEY = "pgl.lastPermissions";
export interface SavedPc { id: string; name: string; server: string | null; cred: Credentials; lastUsed: number }

export function savedPcs(): SavedPc[] { return readJson<SavedPc[]>(PCS_KEY) ?? []; }

function rememberPc(name: string | undefined) {
  const cred = readJson<Credentials>(CRED_KEY);
  if (!cred) return;
  const server = readJson<string>(SERVER_KEY);
  const list = savedPcs().filter((p) => p.cred.deviceId !== cred.deviceId);
  const id = savedPcs().find((p) => p.cred.deviceId === cred.deviceId)?.id ?? Math.random().toString(36).slice(2, 10);
  writeJson(PCS_KEY, [{ id, name: name || cred.pcName || "PC", server, cred, lastUsed: Date.now() }, ...list].slice(0, 10));
}

export function forgetPc(id: string) { writeJson(PCS_KEY, savedPcs().filter((p) => p.id !== id)); }

export function isActivePc(p: SavedPc) { return readJson<Credentials>(CRED_KEY)?.deviceId === p.cred.deviceId; }

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
  private pingNow: (() => void) | null = null;
  private attempt = 0;
  private started = false;
  private closeReason: string | null = null;
  status: ConnStatus = { phase: "connecting", attempt: 0, everConnected: false, auth: "none", url: "", offlineShell: readJson<boolean>(OFFLINE_KEY) === true };

  /** True while the app shows example data instead of a real PC (preview link or "Demo ansehen"). */
  demo = false;

  /** Starts the demo: no network connection, every request is answered by lib/demo.ts. */
  startDemo() {
    this.demo = true;
    this.started = true;
    attachDemo((ev, d) => this.emit(ev, d));
    const permissions = ["view", "launch", "soundboard", "manage", "admin"];
    this.set({
      phase: "online", everConnected: true, auth: "ok", url: "demo",
      hello: { protocol: PROTOCOL_VERSION, nonce: "", transport: "local", info: { app: "PC Game Launcher Ultimate", version: "1.0.0", pcName: "Demo-PC", platform: "Demo", features: { audio: true, hotkeys: true, autostart: true, pickFile: false, installUpdates: true } } },
      me: { isLocal: false, permissions, device: { id: "demo", name: "Dieses Gerät" } },
    });
    queueMicrotask(() => this.emit("authenticated", this.status.me));
  }

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener("online", () => this.reconnectNow());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      // Back from sleep/background: reconnect at once, or check right away that the open connection still works.
      if (this.status.phase === "offline") this.reconnectNow();
      else if (this.status.phase === "online") this.pingNow?.();
    });
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

  /** No PC paired on this device yet: pages show "Offline", actions ask to connect the PC first. */
  get preview() { return !this.demo && this.status.auth !== "ok" && !this.status.everAuthed && !this.credentials; }

  /** Opens the app shell while the PC is off. Paired devices log in automatically once the PC is reachable. */
  openOffline() { writeJson(OFFLINE_KEY, true); this.set({ offlineShell: true }); }
  closeOffline() { writeJson(OFFLINE_KEY, null); this.set({ offlineShell: false }); }

  /** Closes and reopens the connection, e.g. after the server address was changed. */
  restart() {
    this.ws?.close();
    this.ws = null;
    this.reconnectNow();
  }

  private connect() {
    if (HOSTED && !serverConfigured()) {
      // Nothing to connect to yet – the user scans the QR code or types the PC address.
      this.set({ phase: "offline", needsServer: true, url: "", lastError: undefined, retryAt: undefined });
      return;
    }
    if (this.status.needsServer) this.set({ needsServer: false });
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
        // e.g. incompatible protocol version: show the reason and retry later instead of spinning forever.
        this.closeReason = (e as RpcError).code === "protocol" ? t("Companion-Version passt nicht zu dieser Web-App: {m}", { m: (e as Error).message }) : (e as Error).message;
        ws.close();
      }
    };
    ws.onmessage = (ev) => this.onMessage(String(ev.data));
    ws.onclose = (ev) => {
      clearTimeout(openTimeout);
      if (this.ws !== ws) return;
      const reason = this.closeReason ?? (ev.reason || (this.status.everConnected ? t("Verbindung unterbrochen") : t("Companion nicht erreichbar")));
      this.closeReason = null;
      this.onClosed(reason);
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  private onClosed(reason: string) {
    this.ws = null;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(new RpcError("offline", t("Verbindung unterbrochen"))); }
    this.pending.clear();
    // Exponential backoff with jitter: 1, 2, 4, 8, 15, 30 s.
    const delay = Math.min(15000, 1000 * 2 ** Math.min(this.attempt, 4)) * (0.8 + Math.random() * 0.4);
    this.attempt++;
    const auth = this.status.auth === "revoked" ? "revoked" : this.status.auth === "ok" ? "checking" : this.status.auth;
    this.set({ phase: "offline", lastError: reason, retryAt: Date.now() + delay, attempt: this.attempt, auth, relayCompanion: undefined });
    this.retryTimer = window.setTimeout(() => { this.retryTimer = null; this.connect(); }, delay);
  }

  private startPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    const ping = async () => {
      const started = performance.now();
      try { await this.call("ping"); this.set({ latencyMs: Math.round(performance.now() - started) }); }
      catch (e) {
        // No answer (e.g. the iPad slept, Wi-Fi changed, PC went off without closing): the socket is dead even if
        // the browser has not noticed yet. Closing it starts the automatic reconnect with a clear reason.
        if ((e as RpcError).code === "timeout") { this.closeReason = t("Der PC antwortet nicht mehr (keine Antwort auf Ping)."); this.ws?.close(); }
      }
    };
    this.pingNow = ping;
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
        clearCaches();
        this.set({ auth: "revoked", me: undefined, everAuthed: false, authError: (msg.d as { reason?: string })?.reason });
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
    if (this.demo) return demoCall(method, (params ?? {}) as Record<string, unknown>) as Promise<T>;
    if (this.status.auth !== "ok" && !NO_LOGIN.has(method) && !this.status.me) {
      if (method === "ui.savePrefs" || method === "ui.getPrefs") return Promise.resolve((method === "ui.getPrefs" ? { prefs: null } : true) as T); // design stays on this device
      if (QUEUEABLE[method]) return Promise.resolve(this.queue(method, params) as T);
      if (!QUIET.test(method)) this.emit("needs-pc", { method });
      return Promise.reject(new RpcError("needs-pc", needsPcMessage()));
    }
    return new Promise<T>((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Configuration changes wait on this device; actions (start, play …) need the PC: explain instead of a bare error.
        if (QUEUEABLE[method]) { resolve(this.queue(method, params) as T); return; }
        if (!QUIET.test(method) && !NO_LOGIN.has(method)) this.emit("needs-pc", { method });
        reject(new RpcError("offline", needsPcMessage()));
        return;
      }
      const id = this.nextId++;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError("timeout", t("Der PC hat nicht rechtzeitig geantwortet.")));
      }, method === "ping" ? 8000 : method === "network.diagnose" || method === "updates.download" || method === "sounds.importUrl" ? 90000 : REQUEST_TIMEOUT_MS);
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
      this.set({ auth: "ok", me, authError: undefined, everAuthed: true });
      if (!admin) rememberPc(hello.info?.pcName);
      writeJson(PERMS_KEY, me.permissions);
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

  /** Connects to another remembered PC (its own address and device key). */
  switchPc(id: string) {
    const pc = savedPcs().find((p) => p.id === id);
    if (!pc) return;
    writeJson(CRED_KEY, pc.cred);
    writeJson(SERVER_KEY, pc.server);
    clearCaches();
    this.set({ auth: "none", me: undefined, everAuthed: false });
    this.restart();
  }

  /** Keeps all remembered PCs, but leaves the current one so a further PC can be paired. */
  addAnotherPc() {
    writeJson(CRED_KEY, null);
    if (HOSTED) setServerUrl(null);
    clearCaches();
    this.set({ auth: "none", me: undefined, everAuthed: false });
    this.restart();
  }

  /** Keeps a configuration change on this device until the PC is connected (see lib/outbox.ts). */
  queue(method: string, params: unknown) {
    const result = enqueue(method, (params ?? {}) as Record<string, unknown>);
    this.emit("queued", { method });
    return result;
  }

  async savePairing(token: string, deviceId: string) {
    writeJson(CRED_KEY, { deviceId, token, pcName: this.status.hello?.info.pcName });
    await this.authenticate();
  }

  async logout() {
    if (this.demo) { exitDemo(); return; }
    try { await this.call("auth.logout"); } catch { /* ignore */ }
    const cur = readJson<Credentials>(CRED_KEY);
    if (cur) writeJson(PCS_KEY, savedPcs().filter((p) => p.cred.deviceId !== cur.deviceId)); // signed out = this PC is forgotten here
    writeJson(CRED_KEY, null);
    writeJson(ADMIN_KEY, null, "session");
    clearCaches();
    if (HOSTED) { setServerUrl(null); this.restart(); }
    this.set({ auth: "none", me: undefined, everAuthed: false });
  }

  can(permission: string) {
    if (this.status.me) return this.status.me.permissions.includes(permission);
    // Offline: the rights this device had at its last login (changes are queued and checked by the PC again).
    const last = readJson<string[]>(PERMS_KEY);
    if (last && this.credentials) return last.includes(permission);
    // Never connected: everything can be prepared (except PC-only things); the PC decides when it is connected.
    return permission !== "local" && permission !== "admin";
  }
}

export const client = new Client();
outbox.setCurrentPc(() => readJson<Credentials>(CRED_KEY)?.deviceId ?? null);

export function needsPcMessage() { return t("Dafür muss zuerst dein PC verbunden sein."); }

const DEMO_KEY = "pgl.demo";
export function demoRequested() { return readJson<boolean>(DEMO_KEY, "session") === true; }
export function enterDemo() { writeJson(DEMO_KEY, true, "session"); location.hash = "#/"; location.reload(); }
export function exitDemo() { writeJson(DEMO_KEY, null, "session"); location.hash = "#/"; location.reload(); }
