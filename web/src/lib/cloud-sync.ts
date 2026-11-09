// Automatic sync of the PC's data through the cloud (Cloudflare Worker + D1, see cloud-account-worker/src/sync.js).
//
//  • The PC (companion) uploads its data – games, programs, categories, favourites, settings, profiles … – sealed with the account's own key,
//    whenever something changes and every 30 s as a safety net, as long as it runs.
//  • Every device signed in with the same account pulls the newest state by itself (every few seconds while the app is open, at once when it
//    comes back to the front or the network returns) and keeps it on the device – so everything is also there while the PC is off.
//  • Changes made on a device while the PC is not reachable (favourite, category, rating, name, settings) are kept on the device, shown at once
//    and sent to the cloud as small sealed "changes"; the PC takes them over the next time it runs. Nothing is lost, nothing is doubled
//    (every change has an id), and what was changed on the PC in the meantime wins per field.
// Only things that actually run something on the Windows PC (start a game, the soundboard, remote control …) need the PC to be connected.

import { useSyncExternalStore } from "react";
import { client, readJson, writeJson } from "./rpc";
import { cloudApi } from "./cloud-account";
import { session, type DesignSession } from "./design-account";
import { saveCache, savedOverview, bumpCache } from "./offline-cache";
import { setOpQueuedHook } from "./outbox";
import { openBlob, sealBlob } from "./cloud-seal";
export { openBlob, sealBlob } from "./cloud-seal";
import { t } from "./i18n";

const TOKEN_KEY = "pgl.cloudSync.token", OPS_KEY = "pgl.cloudSync.ops", NOAUTO_KEY = "pgl.cloudSync.noAutoLink", LINKTRY_KEY = "pgl.cloudSync.linkTry";
const POLL_MS = 10_000, POLL_HIDDEN_MS = 60_000, TIMEOUT_MS = 20_000, MAX_OPS = 400;

/** What the PC uploads, as cache keys of the pages (same names as the RPC methods). */
export const SYNC_ITEMS = ["state.get", "library.list", "launchers.list", "quick.list", "profiles.list", "sounds.list", "settings.get", "history.get",
  "deck.list", "calendar.list", "widgets.list", "quests.get", "deals.list", "layouts.list", "overlay.layout", "activity.get", "plugins.list"] as const;
/** Changes a device may hand over through the cloud while the PC is off (data only – never starting anything). */
export const OP_METHODS = new Set(["library.update", "settings.save"]);

interface TokenRec { user: string; api: string; token: string; seq: number; have: Record<string, string>; pcAt: string | null; pcName: string | null; okAt: number | null }
export interface PendingOp { id: string; method: string; params: Record<string, unknown>; base?: Record<string, unknown>; at: string }

export interface CloudSyncStatus {
  /** Signed in with an account on a cloud service (otherwise there is nothing to sync). */
  active: boolean;
  user: string | null;
  /** "ok" the cloud answered, "unreachable" it did not, "unknown" not asked yet. */
  cloud: "ok" | "unreachable" | "unknown";
  /** A pull or a send is running right now. */
  syncing: boolean;
  /** Changes made here that the cloud does not have yet. */
  pending: number;
  /** When the cloud last answered / when the PC last uploaded. */
  okAt: number | null;
  pcSyncedAt: number | null;
  pcName: string | null;
  /** The newest state was taken over from the cloud and is shown. */
  upToDate: boolean;
  error: string | null;
}

let status: CloudSyncStatus = { active: false, user: null, cloud: "unknown", syncing: false, pending: 0, okAt: null, pcSyncedAt: null, pcName: null, upToDate: false, error: null };
const listeners = new Set<() => void>();
const setStatus = (p: Partial<CloudSyncStatus>) => { status = { ...status, ...p }; listeners.forEach((l) => l()); };
export const cloudSyncStatus = () => status;
export const useCloudSync = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => status);

// ------------------------------------------------------------------ the cloud calls

class AuthError extends Error {}

async function post(api: string, action: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let signal: AbortSignal | undefined;
  try { signal = AbortSignal.timeout(TIMEOUT_MS); } catch { signal = undefined; }
  const res = await fetch(`${api}/api/sync/${action}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal });
  const text = await res.text().catch(() => "");
  let data: Record<string, unknown> = {};
  if (text) { try { data = JSON.parse(text) as Record<string, unknown>; } catch { data = {}; } }
  if (res.status === 401 && action !== "token") throw new AuthError();
  if (res.status >= 500) throw new Error(String(data.message ?? "server"));
  if (!res.ok || data.ok === false) throw new Error(String(data.message ?? res.status));
  return data;
}

const tokenRec = (): TokenRec | null => readJson<TokenRec>(TOKEN_KEY);
const forgetToken = () => writeJson(TOKEN_KEY, null);

function currentSession(): (DesignSession & { api: string }) | null {
  const s = session(), api = cloudApi();
  return s && s.cloud && api ? { ...s, api } : null;
}

async function ensureToken(s: DesignSession & { api: string }): Promise<TokenRec> {
  const have = tokenRec();
  if (have && have.user === s.user && have.api === s.api) return have;
  const r = await post(s.api, "token", { user: s.user, key: s.auth, device: deviceName() });
  const rec: TokenRec = { user: s.user, api: s.api, token: String(r.token), seq: -1, have: {}, pcAt: null, pcName: null, okAt: null };
  writeJson(TOKEN_KEY, rec);
  return rec;
}

function deviceName(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Browser";
}

// ------------------------------------------------------------------ pulling: the cloud copy becomes the device's copy

let pulling = false;
export async function pullNow(): Promise<boolean> {
  const s = currentSession();
  if (!s) { setStatus({ active: false, user: null }); return false; }
  if (pulling) return false;
  pulling = true;
  setStatus({ active: true, user: s.user, syncing: true, pending: pendingOps().length });
  try {
    let rec = await ensureToken(s);
    let r: Record<string, unknown>;
    try { r = await post(s.api, "pull", { user: s.user, token: rec.token, seq: rec.seq, have: rec.have }); }
    catch (e) {
      if (!(e instanceof AuthError)) throw e;
      forgetToken(); rec = await ensureToken(s);                                        // the cloud forgot this device: new token, same account
      r = await post(s.api, "pull", { user: s.user, token: rec.token, seq: -1, have: {} });
    }
    const seq = Number(r.seq ?? 0);
    const pcAt = typeof r.pcAt === "string" ? r.pcAt : null, pcName = typeof r.pcName === "string" ? r.pcName : null;
    if (!r.unchanged) {
      const have = { ...rec.have };
      let wrote = false;
      for (const it of (r.items as { item: string; ver: string; parts?: string[] }[] | undefined) ?? []) {
        if (!it.parts) { have[it.item] = it.ver; continue; }                            // not changed since the last time
        try {
          const data = JSON.parse(await openBlob(s.enc, it.parts.join(""))) as unknown;
          if (applyFromCloud(it.item, data)) wrote = true;
          have[it.item] = it.ver;
        } catch { /* another password key or a newer format: this item is skipped, the rest still works */ }
      }
      writeJson(TOKEN_KEY, { ...rec, seq, have, pcAt, pcName, okAt: Date.now() });
      if (wrote) bumpCache();
    } else writeJson(TOKEN_KEY, { ...rec, seq, pcAt, pcName, okAt: Date.now() });
    setStatus({ cloud: "ok", okAt: Date.now(), pcSyncedAt: pcAt ? Date.parse(pcAt) : null, pcName, upToDate: true, error: null });
    return true;
  } catch (e) {
    setStatus({ cloud: navigator.onLine === false || !(e instanceof Error) || e.message === "server" || /fetch|network|abort|timeout|load failed/i.test(e.message) ? "unreachable" : "ok", upToDate: false,
      error: e instanceof Error && !/fetch|network|abort|timeout|load failed|server/i.test(e.message) ? e.message : null });
    return false;
  } finally { pulling = false; setStatus({ syncing: false, pending: pendingOps().length }); }
}

/** While the PC is connected its live answers are the truth; the cloud copy fills in what this device does not have, and everything while the PC is off. */
function applyFromCloud(item: string, data: unknown): boolean {
  const live = client.status.phase === "online" && client.status.auth === "ok";
  if (live) return false;
  if (item === "state.get") { saveCache("state.get", savedOverview(data as never)); return true; }
  saveCache(item, data);
  return true;
}

// ------------------------------------------------------------------ changes made here while the PC is away

const pendingOps = (): PendingOp[] => readJson<PendingOp[]>(OPS_KEY) ?? [];
const savePending = (list: PendingOp[]) => writeJson(OPS_KEY, list.length ? list.slice(-MAX_OPS) : null);
export const pendingCloudChanges = () => pendingOps().length;

/**
 * Called when a change is queued for the PC (see outbox.ts): it also goes to the cloud as a sealed change, so it reaches the PC even if this
 * device is gone by then. "base" holds what the fields were before – the PC only overwrites a field if it still has that value.
 */
export function queueCloudOp(method: string, params: Record<string, unknown>, base?: Record<string, unknown>) {
  if (!OP_METHODS.has(method) || !currentSession()) return;
  const op: PendingOp = { id: "op_" + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16), method, params: structuredClone(params), base, at: new Date().toISOString() };
  savePending([...pendingOps(), op]);
  setStatus({ pending: pendingOps().length });
  void flushOps();
}

let flushing = false;
export async function flushOps(): Promise<boolean> {
  const s = currentSession(), ops = pendingOps();
  if (!s || ops.length === 0 || flushing) return ops.length === 0;
  flushing = true;
  setStatus({ syncing: true });
  try {
    const rec = await ensureToken(s);
    for (let i = 0; i < ops.length; i += 20) {
      const batch = ops.slice(i, i + 20);
      const sealed = await Promise.all(batch.map(async (o) => ({ id: o.id, at: o.at, blob: await sealBlob(s.enc, JSON.stringify({ method: o.method, params: o.params, base: o.base, at: o.at, device: deviceName() })) })));
      await post(s.api, "op", { user: s.user, token: rec.token, ops: sealed });
      const sent = new Set(batch.map((o) => o.id));
      savePending(pendingOps().filter((o) => !sent.has(o.id)));                      // gone from here only after the cloud has it
    }
    setStatus({ cloud: "ok", okAt: Date.now(), error: null });
    return true;
  } catch (e) {
    if (e instanceof AuthError) forgetToken();
    setStatus({ cloud: "unreachable" });
    return false;
  } finally { flushing = false; setStatus({ syncing: false, pending: pendingOps().length }); }
}

// ------------------------------------------------------------------ the PC takes the account over by itself

let linking = false;
/** Signed in here and an admin PC connected: hand the PC its own cloud access (sealed on the way), so it uploads its data from now on. */
export async function linkPcNow(force = false): Promise<"linked" | "already" | "skipped" | "failed"> {
  const s = currentSession();
  if (!s || linking) return "skipped";
  if (client.status.phase !== "online" || client.status.auth !== "ok") return "skipped";
  // The rights may have just been given at the PC (the connection's cached copy is then old): ask the PC once more.
  const me = await client.call<{ isLocal: boolean; permissions: string[] }>("devices.me").catch(() => client.status.me), local = !!me?.isLocal;
  if (!local && !me?.permissions.includes("admin")) return "skipped";
  if (!force && readJson<string>(NOAUTO_KEY) === s.user) return "skipped";
  linking = true;
  try {
    const st = await client.call<{ linked: boolean; user: string | null; api: string | null }>("cloud.status");
    if (st.linked && st.user === s.user && st.api === s.api) return "already";
    const params: Record<string, unknown> = { api: s.api, user: s.user };
    if (local) { params.auth = s.auth; params.enc = s.enc; }
    else {
      const a = client.sealSecret("cloud.auth", s.auth), e = client.sealSecret("cloud.enc", s.enc);
      if (!a || !e) return "skipped";
      params.sealed = { auth: a, enc: e };
    }
    await client.call("cloud.link", params);
    writeJson(NOAUTO_KEY, null);
    return "linked";
  } catch { return "failed"; }
  finally { linking = false; }
}

export function setAutoLink(on: boolean) { const s = session(); writeJson(NOAUTO_KEY, on || !s ? null : s.user); }

// ------------------------------------------------------------------ the loop

let started = false, timer: number | undefined;
export function startCloudSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  setOpQueuedHook(queueCloudOp);
  const tick = async () => {
    window.clearTimeout(timer);
    try {
      if (currentSession()) { await flushOps(); await pullNow(); maybeLinkPc(); }
      else if (status.active) setStatus({ active: false, user: null, cloud: "unknown", upToDate: false });
    } finally { timer = window.setTimeout(tick, document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_MS); }
  };
  const soon = (ms = 300) => { window.clearTimeout(timer); timer = window.setTimeout(tick, ms); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") soon(); });
  window.addEventListener("online", () => soon());
  window.addEventListener("pgl-account", () => soon(100));
  client.on("authenticated", () => { soon(500); });
  // Rights given or taken at the PC: try to hand the PC the account right away instead of at the next round.
  client.on("changed", (d) => { if ((d as { topic?: string }).topic === "devices") void linkPcNow(); });
  soon(800);
}

function maybeLinkPc() {
  const last = Number(readJson<number>(LINKTRY_KEY, "session") ?? 0);
  if (Date.now() - last < 60_000) return;
  writeJson(LINKTRY_KEY, Date.now(), "session");
  void linkPcNow().then((r) => { if (r === "linked") setStatus({ error: null }); });
}

/** One plain sentence for the state, in the order of what matters. */
export function describeSync(s: CloudSyncStatus, pcOnline: boolean): { cloud: string; pc: string; sync: string } {
  return {
    cloud: s.cloud === "ok" ? t("Cloud verbunden") : s.cloud === "unreachable" ? t("Cloud nicht erreichbar") : t("Cloud wird geprüft …"),
    pc: pcOnline ? t("PC verbunden") : t("PC nicht verbunden"),
    sync: s.syncing ? t("Synchronisierung läuft …") : s.pending > 0 ? t("{n} Änderung(en) ausstehend", { n: s.pending }) : s.upToDate ? t("Synchronisierung abgeschlossen") : t("Noch nicht synchronisiert"),
  };
}
