// Timers of the JARVIS island: focus timer (5/15/25 min), Pomodoro and a stopwatch. They live here – not inside the open
// panel – so a running timer keeps running and shows in the closed island too (like a "live activity"). Pure logic with an
// injectable clock, tested without a browser.

import { useSyncExternalStore } from "react";
import { pomoMs, pomoNext, POMO_START, type PomoState } from "./pomodoro";

export interface TimerState {
  /** When the running countdown ends (ms since epoch), null = none running. */
  end: number | null;
  /** Length of the running countdown (for the progress ring). */
  total: number;
  /** Set = Pomodoro (phases follow each other until stopped). */
  pomo: PomoState | null;
  /** Stopwatch: running since / time collected before the last start. */
  watchStart: number | null;
  watchAcc: number;
}
export type TimerEvent = { kind: "done" } | { kind: "phase"; pomo: PomoState };

const initial = (): TimerState => ({ end: null, total: 0, pomo: null, watchStart: null, watchAcc: 0 });
let state: TimerState = initial();
const listeners = new Set<() => void>();
const set = (s: TimerState) => { state = s; listeners.forEach((l) => l()); };

export const timerState = () => state;
export const useTimer = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
export const resetTimers = () => set(initial());

export function startCountdown(minutes: number, now = Date.now()) {
  const ms = Math.max(1, Math.min(180, Math.round(minutes))) * 60_000;
  set({ ...state, end: now + ms, total: ms, pomo: null });
}
export function startPomodoro(now = Date.now()) {
  set({ ...state, end: now + pomoMs(POMO_START.phase), total: pomoMs(POMO_START.phase), pomo: POMO_START });
}
export function stopCountdown() { set({ ...state, end: null, total: 0, pomo: null }); }

/** Called by the island's clock: when the countdown has run out it ends (or moves to the next Pomodoro phase) and says what happened. */
export function advanceTimer(now = Date.now()): TimerEvent | null {
  if (state.end == null || now < state.end) return null;
  if (state.pomo) {
    const next = pomoNext(state.pomo);
    set({ ...state, end: now + pomoMs(next.phase), total: pomoMs(next.phase), pomo: next });
    return { kind: "phase", pomo: next };
  }
  set({ ...state, end: null, total: 0 });
  return { kind: "done" };
}

/** Remaining time and progress (0..1) of the running countdown, or null. */
export function countdownView(s: TimerState, now = Date.now()): { left: number; progress: number } | null {
  if (s.end == null) return null;
  const left = Math.max(0, s.end - now);
  return { left, progress: s.total > 0 ? Math.min(1, Math.max(0, 1 - left / s.total)) : 0 };
}

// ------------------------------------------------------------------ stopwatch
export function watchToggle(now = Date.now()) {
  if (state.watchStart == null) set({ ...state, watchStart: now });
  else set({ ...state, watchStart: null, watchAcc: state.watchAcc + (now - state.watchStart) });
}
export function watchReset() { set({ ...state, watchStart: null, watchAcc: 0 }); }
export const watchMs = (s: TimerState, now = Date.now()) => s.watchAcc + (s.watchStart != null ? now - s.watchStart : 0);
/** "m:ss" (or "h:mm:ss") with tenths of a second while it runs would flicker – seconds are enough. */
export function watchText(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** Something is counting that the closed island should show. */
export const timerLive = (s: TimerState) => s.end != null;

/** How long a game has been running, as "1:23 h" / "42 min" (no seconds – the island updates once a second anyway). */
export function playTime(sinceIso: string | number, now = Date.now()): string | null {
  const at = typeof sinceIso === "number" ? sinceIso : Date.parse(sinceIso);
  if (!Number.isFinite(at) || at > now + 60_000) return null;
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  return min >= 60 ? `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} h` : `${min} min`;
}
