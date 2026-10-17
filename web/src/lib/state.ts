import { useSyncExternalStore } from "react";
import { client } from "./rpc";
import type { AppState, Notification, PlayingState } from "./types";

// Shared overview state (one request for all widgets), refreshed on relevant events with a short debounce.

let state = null as AppState | null;
let error = null as string | null;
let updatedAt = null as number | null;
let timer: number | null = null;
const listeners = new Set<() => void>();
let snapshot: { state: AppState | null; error: string | null; updatedAt: number | null } = { state, error, updatedAt };

function publish() {
  snapshot = { state, error, updatedAt };
  listeners.forEach((l) => l());
}

export function refreshState(delay = 150) {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(async () => {
    timer = null;
    if (client.status.auth !== "ok" && !client.preview) return;
    try {
      state = await client.call<AppState>("state.get");
      error = null;
      updatedAt = Date.now();
    } catch (e) { error = (e as Error).message; }
    publish();
  }, delay);
}

const TOPICS = new Set(["profiles", "library", "audio", "settings", "sounds", "devices", "notifications", "updates", "history"]);
client.on("authenticated", () => { state = null; refreshState(0); });
// Preview without PC: example overview right away (replaced once the PC is logged in).
queueMicrotask(() => { if (client.preview) refreshState(0); });
client.on("changed", (d) => { if (TOPICS.has((d as { topic: string }).topic)) refreshState(); });
client.on("session", () => refreshState());
client.on("profile.active", () => refreshState());
client.on("relay.status", () => refreshState());
client.on("notification", () => refreshState(400));
client.on("sounds.playing", (d) => {
  if (state) { state = { ...state, playing: d as PlayingState }; publish(); }
});

export function useAppState() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snapshot);
}

export type { Notification };
