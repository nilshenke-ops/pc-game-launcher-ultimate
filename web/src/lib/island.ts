// The JARVIS island: a small window at the top of the PC screen (Windows companion, page #/island) that shows what
// JARVIS is doing and holds a few widgets (running game, media keys, clock, focus timer). Own design – inspired by
// "island" apps, no code or character taken from them. Everything shown comes from real state: JARVIS' activity as the
// PC reports it, his last answer and a question that needs a yes.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { t } from "./i18n";
import type { AssistantAction } from "./assistant";

export type Mood = "idle" | "thinking" | "listening" | "asking" | "happy" | "error" | "dizzy";
/** Window sizes the companion accepts: only the eyes, the bar, the bar with a question, the open widgets. */
export type IslandSize = "notch" | "bar" | "ask" | "panel";

export interface IslandState {
  busy: boolean;
  listening: boolean;
  /** JARVIS' last answer (short), shown when the island is opened. */
  last: { text: string; ok: boolean | null; at: number } | null;
  /** An action from JARVIS that needs a yes (launch, quick action …) – "Erlauben" runs it, "Ablehnen" drops it. */
  ask: { action: AssistantAction; at: number } | null;
  /** Taps on the eyes within the last seconds (too many → dizzy). */
  pokes: number[];
}

let state: IslandState = { busy: false, listening: false, last: null, ask: null, pokes: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IslandState>) => { state = { ...state, ...p }; emit(); };

export const useIsland = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);
export const islandState = () => state;

export function islandBusy(busy: boolean, listening = false) { if (busy !== state.busy || listening !== state.listening) set({ busy, listening }); }
/** Only an action that needs a confirmation and runs a command becomes a question – never an automatic one or a link. */
export function islandAnswer(text: string, ok: boolean | null, actions: AssistantAction[] = []) {
  const ask = actions.find((a) => a.confirm && a.method && !a.auto) ?? null;
  set({ last: { text: text.slice(0, 280), ok, at: Date.now() }, ask: ask ? { action: ask, at: Date.now() } : null });
}
/** declined: the question is dropped and nothing runs – the eyes go back to normal (no "done"). */
export function islandClearAsk(declined = false) { if (state.ask || declined) set({ ask: null, ...(declined ? { last: { text: t("Abgelehnt – nichts ausgeführt."), ok: null, at: 0 } } : {}) }); }
export function islandPoke(now = Date.now()) { set({ pokes: [...state.pokes.filter((x) => now - x < 4000), now] }); }

/** A question waits at most 2 minutes – then it is gone and nothing runs. */
export const ASK_TTL = 120_000;
/** "Done" is shown for 6 s after an answer. */
export const HAPPY_MS = 6000;

/** What the eyes show – first match wins. Pure, so it is tested without a browser. */
export function moodOf(s: Pick<IslandState, "busy" | "listening" | "last" | "ask" | "pokes">, now = Date.now()): Mood {
  if (s.pokes.filter((x) => now - x < 4000).length >= 5) return "dizzy";
  if (s.ask && now - s.ask.at < ASK_TTL) return "asking";
  if (s.listening) return "listening";
  if (s.busy) return "thinking";
  if (s.last && now - s.last.at < HAPPY_MS) return s.last.ok === false ? "error" : "happy";
  return "idle";
}

/** Collapsed to the eyes unless something is going on: open → widgets, question → bar with buttons, hover/activity → bar. */
export function islandSize(x: { open: boolean; ask: boolean; hover: boolean; mood: Mood }): IslandSize {
  if (x.open) return "panel";
  if (x.ask) return "ask";
  return x.hover || x.mood === "thinking" || x.mood === "listening" || x.mood === "happy" || x.mood === "error" ? "bar" : "notch";
}

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "Bereit", thinking: "Denkt nach", listening: "Hört zu", asking: "Fragt dich", happy: "Erledigt", error: "Hat nicht geklappt", dizzy: "Schwindelig",
};

// ------------------------------------------------------------------ settings (this window only)

const KEY = "pgl.island";
export interface IslandPrefs { sound: boolean }
export const islandPrefs = (): IslandPrefs => { try { const v = readJson<Partial<IslandPrefs>>(KEY); return { sound: v?.sound !== false }; } catch { return { sound: true }; } };
const prefListeners = new Set<() => void>();
let prefSnap = islandPrefs();
export function setIslandPrefs(p: Partial<IslandPrefs>) {
  prefSnap = { ...prefSnap, ...p };
  try { writeJson(KEY, prefSnap); } catch { /* storage blocked – only for this visit */ }
  prefListeners.forEach((l) => l());
}
export const useIslandPrefs = () => useSyncExternalStore((fn) => { prefListeners.add(fn); return () => prefListeners.delete(fn); }, () => prefSnap);

/** Focus timer: milliseconds → "m:ss". */
export const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
