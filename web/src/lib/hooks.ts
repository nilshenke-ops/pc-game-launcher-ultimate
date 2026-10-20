import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { client, needsPcMessage, RpcError, type ConnStatus } from "./rpc";
import { t } from "./i18n";
import { readCache, saveCache } from "./offline-cache";
import { OFFLINE_DEFAULTS, outbox } from "./outbox";

/** Whether this device may do something (offline: rights of its last login; never connected: everything except PC-only). */
export function useCan(permission: string): boolean {
  useConn();
  return client.can(permission);
}

export function useConn(): ConnStatus {
  return useSyncExternalStore(client.subscribe, client.getStatus);
}

/** Right after opening the app a paired device is usually connected within a few hundred ms. During this short
 * moment pages show their normal layout with placeholders instead of the offline view – so nothing jumps when the
 * PC answers. After at most 1.5 s (PC really off) the offline view is shown. */
const CONNECT_GRACE_MS = 1500;
export function useConnectingSoon(): boolean {
  const conn = useConn();
  const left = CONNECT_GRACE_MS - performance.now();
  const [, tick] = useState(0);
  const soon = left > 0 && client.canSignIn && conn.phase === "connecting" || (conn.phase === "online" && conn.auth === "checking");
  useEffect(() => { if (soon && left > 0) { const id = window.setTimeout(() => tick((n) => n + 1), left + 10); return () => clearTimeout(id); } }, [soon, left]);
  return soon && (left > 0 || conn.phase === "online");
}

const visibleNow = () => typeof document === "undefined" || document.visibilityState !== "hidden";
const onVisibility = (cb: () => void) => { document.addEventListener("visibilitychange", cb); return () => document.removeEventListener("visibilitychange", cb); };
/** False while the tab/app is in the background (iPad home screen, hidden PC window) – live subscriptions pause then. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(onVisibility, visibleNow, () => true);
}

/**
 * Live data from the PC (e.g. "monitor", "audio"): subscribes only while connected and the page is visible,
 * unsubscribes otherwise – so the PC does no sampling for views nobody is looking at.
 */
export function useLiveSubscription<T>(topic: string, onFirst?: (data: T) => void, onError?: (e: Error) => void, enabled = true) {
  const authed = useConn().auth === "ok";
  const visible = usePageVisible();
  const first = useRef(onFirst); first.current = onFirst;
  const fail = useRef(onError); fail.current = onError;
  useEffect(() => {
    if (!authed || !visible || !enabled) return;
    acquire<T>(topic).then((d) => first.current?.(d)).catch((e) => fail.current?.(e as Error));
    return () => release(topic);
  }, [topic, authed, visible, enabled]);
}

// The PC keeps one subscription per topic and connection. Several views on the same topic (dashboard card, own
// widget, plugin) share it: subscribed by the first, unsubscribed after the last – one closing view no longer stops
// the live values of the others.
const subs = new Map<string, { count: number; first: Promise<unknown> }>();
function acquire<T>(topic: string): Promise<T> {
  const s = subs.get(topic);
  if (s) { s.count++; return s.first as Promise<T>; }
  const first = client.call<T>(`${topic}.subscribe`);
  subs.set(topic, { count: 1, first });
  first.catch(() => { if (subs.get(topic)?.first === first) subs.delete(topic); });
  return first;
}
function release(topic: string) {
  const s = subs.get(topic);
  if (!s) return;
  if (--s.count > 0) return;
  subs.delete(topic);
  client.call(`${topic}.unsubscribe`).catch(() => {});
}

export function useEvent<T = unknown>(event: string, fn: (data: T) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => client.on(event, (d) => ref.current(d as T)), [event]);
}

export interface Query<T> { data: T | undefined; error: RpcError | null; loading: boolean; reload: () => void; updatedAt: number | null; stale?: boolean }

/**
 * Loads data from the companion once authenticated and reloads it whenever the companion reports a change
 * for one of the given topics (event "changed") or after a reconnect.
 */
export function useRpc<T>(method: string, params?: unknown, topics: string[] = [], enabled = true): Query<T> {
  const conn = useConn();
  useSyncExternalStore(outbox.subscribe, outbox.version); // offline changes update the shown copy right away
  const [state, setState] = useState<{ data?: T; error: RpcError | null; loading: boolean; updatedAt: number | null }>({ error: null, loading: true, updatedAt: null });
  const paramKey = JSON.stringify(params ?? {});
  const seq = useRef(0);
  const ready = conn.auth === "ok" && conn.phase === "online" && enabled;

  const load = useCallback(() => {
    if (!ready) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    client.call<T>(method, JSON.parse(paramKey))
      .then((data) => { saveCache(method, data, paramKey); if (my === seq.current) setState({ data, error: null, loading: false, updatedAt: Date.now() }); })
      .catch((error: RpcError) => { if (my === seq.current) setState((s) => ({ ...s, error, loading: false })); });
  }, [method, paramKey, ready]);

  useEffect(() => { load(); }, [load]);
  const topicKey = topics.join(",");
  useEffect(() => {
    if (!topicKey) return;
    const list = topicKey.split(",");
    return client.on("changed", (d) => { if (list.includes((d as { topic: string }).topic)) load(); });
  }, [topicKey, load]);

  // Never an endless skeleton: without a logged-in PC, pages show "Offline" (see Loadable) instead.
  if (!ready && enabled && !state.data && (conn.phase !== "online" || (conn.auth !== "ok" && conn.auth !== "checking"))) {
    // Lists last loaded from the PC stay visible (marked "stale" with their date); everything else shows "Offline".
    const cached = readCache<T>(method, paramKey) ?? (method in OFFLINE_DEFAULTS && paramKey === "{}" ? { at: 0, data: OFFLINE_DEFAULTS[method] as T } : null);
    if (cached) return { data: cached.data, error: null, loading: false, reload: () => client.reconnectNow(), updatedAt: cached.at || null, stale: true };
    return { data: undefined, error: new RpcError("offline", t("Der PC ist gerade nicht erreichbar. Die Inhalte erscheinen automatisch, sobald der PC an ist und der Companion läuft.")), loading: false, reload: () => client.reconnectNow(), updatedAt: null };
  }
  return { data: state.data, error: state.error, loading: state.loading && !state.data, reload: load, updatedAt: state.updatedAt };
}

/** Wraps an action with busy state and error capture for buttons. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string } = {}) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    try {
      const r = await fn(...args);
      if (opts.success) toast(opts.success, "success");
      return r;
    } catch (e) {
      toast((e as Error).message, "error");
      return undefined;
    } finally { setBusy(false); }
  }, [fn, opts.success]);
  return [run, busy] as const;
}

// ------------------------------------------------------------------ toasts

export interface Toast { id: number; text: string; kind: "info" | "success" | "error" | "warning" }
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastId = 1;

export function toast(text: string, kind: Toast["kind"] = "info") {
  if (text === needsPcMessage()) return; // the "PC verbinden" hint is already open
  if (kind === "error" && text.startsWith("Demo:")) kind = "info"; // demo notices are explanations, not errors
  const id = toastId++;
  toasts = [...toasts.filter((x) => x.text !== text), { id, text, kind }].slice(-4);
  toastListeners.forEach((l) => l());
  window.setTimeout(() => dismissToast(id), kind === "error" ? 7000 : kind === "success" ? 2500 : 3500);
}

export function dismissToast(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  toastListeners.forEach((l) => l());
}

export function useToasts() {
  return useSyncExternalStore((fn) => { toastListeners.add(fn); return () => toastListeners.delete(fn); }, () => toasts);
}

export function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (fn) => { const m = window.matchMedia(q); m.addEventListener("change", fn); return () => m.removeEventListener("change", fn); },
    () => window.matchMedia(q).matches,
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  // No ticking while the page is hidden (screen off, other tab); on return the time is current at once.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") setNow(Date.now()); };
    const t = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [intervalMs]);
  return now;
}

export function can(perm: string) { return client.can(perm); }
