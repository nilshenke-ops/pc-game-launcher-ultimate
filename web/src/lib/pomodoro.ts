// Pomodoro für die Insel: 25 min Fokus, 5 min Pause, nach jedem vierten Fokus 15 min lange Pause. Reine Logik – die Uhr steht im Widget.

export type PomoPhase = "focus" | "break" | "long";
export interface PomoState { phase: PomoPhase; done: number }

export const POMO_MINUTES: Record<PomoPhase, number> = { focus: 25, break: 5, long: 15 };
export const POMO_LABEL: Record<PomoPhase, string> = { focus: "Fokus", break: "Pause", long: "Lange Pause" };
export const POMO_START: PomoState = { phase: "focus", done: 0 };

/** The phase that follows when `s.phase` runs out. A finished focus block counts; every fourth one is followed by the long break. */
export function pomoNext(s: PomoState): PomoState {
  if (s.phase === "focus") { const done = s.done + 1; return { phase: done % 4 === 0 ? "long" : "break", done }; }
  return { phase: "focus", done: s.done };
}
export const pomoMs = (p: PomoPhase) => POMO_MINUTES[p] * 60_000;
