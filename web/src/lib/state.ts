import { useSyncExternalStore } from "react";
import { client } from "./rpc";
import { setProfileTheme } from "./prefs";
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
  setProfileTheme(state?.activeProfile?.theme);
  listeners.forEach((l) => l());
}

export function refreshState(delay = 150) {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(async () => {
    timer = null;
    if (client.status.auth !== "ok") return;
    try {
      state = await client.call<AppState>("state.get");
      error = null;
      updatedAt = Date.now();
    } catch (e) { error = (e as Error).message; }
    publish();
  }, delay);
}

const TOPICS = new Set(["profiles", "library", "audio", "settings", "sounds", "devices", "notifications", "updates", "history"]);
client.on("authenticated", () => refreshState(0));
// Connection lost: forget the overview, so nothing (e.g. "Rocket League läuft") is shown as current while the PC is unreachable.
client.subscribe(() => {
  if (state && (client.status.phase !== "online" || client.status.auth !== "ok")) { state = null; error = null; updatedAt = null; publish(); }
});
client.on("changed", (d) => { if (TOPICS.has((d as { topic: string }).topic)) refreshState(); });
client.on("session", () => refreshState());
client.on("profile.active", () => refreshState());
client.on("relay.status", () => refreshState());
client.on("notification", () => refreshState(400));
// Running sounds change often (every play/stop). They have their own small store, so they do not re-render the whole
// app shell and every dashboard card – only the views that show them.
let playing: PlayingState | null = null;
const playingListeners = new Set<() => void>();
client.on("sounds.playing", (d) => { playing = d as PlayingState; playingListeners.forEach((l) => l()); });
client.on("authenticated", () => { playing = null; });

/** Running sounds: live from events, before the first event from the overview. */
export function usePlaying(): PlayingState | null {
  const live = useSyncExternalStore((fn) => { playingListeners.add(fn); return () => playingListeners.delete(fn); }, () => playing);
  return live ?? snapshot.state?.playing ?? null;
}

export function useAppState() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snapshot);
}

export type { Notification };

/** Waits (event-driven, no polling) until the overview matches – e.g. a started game shows up as running. */
export function waitForState(test: (s: AppState) => boolean, ms: number): Promise<boolean> {
  if (snapshot.state && test(snapshot.state)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const check = () => { if (snapshot.state && test(snapshot.state)) { done(true); } };
    const timer = window.setTimeout(() => done(false), ms);
    function done(v: boolean) { window.clearTimeout(timer); listeners.delete(check); resolve(v); }
    listeners.add(check);
    refreshState(300);
  });
}
