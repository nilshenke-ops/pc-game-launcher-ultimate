import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { client, needsPcMessage, RpcError, type ConnStatus } from "./rpc";
import { t } from "./i18n";

export function useConn(): ConnStatus {
  return useSyncExternalStore(client.subscribe, client.getStatus);
}

export function useEvent<T = unknown>(event: string, fn: (data: T) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => client.on(event, (d) => ref.current(d as T)), [event]);
}

export interface Query<T> { data: T | undefined; error: RpcError | null; loading: boolean; reload: () => void; updatedAt: number | null }

/**
 * Loads data from the companion once authenticated and reloads it whenever the companion reports a change
 * for one of the given topics (event "changed") or after a reconnect.
 */
export function useRpc<T>(method: string, params?: unknown, topics: string[] = [], enabled = true): Query<T> {
  const conn = useConn();
  const [state, setState] = useState<{ data?: T; error: RpcError | null; loading: boolean; updatedAt: number | null }>({ error: null, loading: true, updatedAt: null });
  const paramKey = JSON.stringify(params ?? {});
  const seq = useRef(0);
  const ready = conn.auth === "ok" && conn.phase === "online" && enabled;

  const load = useCallback(() => {
    if (!ready) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    client.call<T>(method, JSON.parse(paramKey))
      .then((data) => { if (my === seq.current) setState({ data, error: null, loading: false, updatedAt: Date.now() }); })
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
  if (!ready && enabled && !state.data && (conn.phase !== "online" || (conn.auth !== "ok" && conn.auth !== "checking")))
    return { data: undefined, error: new RpcError("offline", t("Der PC ist gerade nicht erreichbar. Die Inhalte erscheinen automatisch, sobald der PC an ist und der Companion läuft.")), loading: false, reload: () => client.reconnectNow(), updatedAt: null };
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
  window.setTimeout(() => dismissToast(id), kind === "error" ? 7000 : 3500);
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
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

export function can(perm: string) { return client.can(perm); }
