// The eyes live (3.61) – without endless CSS animations. One timer picks a short moment every few seconds (blink, double blink,
// a glance left or right) and marks the eyes with data-life for exactly that long. In between nothing animates, so the island
// costs almost nothing while it just sits there (also over a game). Paused while the page is hidden or "less motion" is wanted.
export type LifeMoment = "blink" | "blink2" | "left" | "right";
const DURATION: Record<LifeMoment, number> = { blink: 280, blink2: 660, left: 1750, right: 1750 };

/** A moment by chance: mostly blinks, sometimes a glance. `r` in [0,1). */
export function pickMoment(r: number): LifeMoment {
  return r < 0.42 ? "blink" : r < 0.6 ? "blink2" : r < 0.8 ? "left" : "right";
}
/** Seconds until the next moment: 3.5–8 s, never in lockstep. */
export const nextDelay = (r: number) => Math.round(3500 + r * 4500);

let timer: number | undefined;
let started = false;
const reduced = () => document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function tick() {
  timer = window.setTimeout(tick, nextDelay(Math.random()));
  if (document.hidden || reduced()) return;
  const els = document.querySelectorAll<HTMLElement>(".isl-eyes, .isl3-orb");
  if (!els.length) return;
  const m = pickMoment(Math.random());
  els.forEach((e) => { e.dataset.life = m; });
  window.setTimeout(() => els.forEach((e) => { if (e.dataset.life === m) delete e.dataset.life; }), DURATION[m]);
}

export function startEyeLife() {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;
  timer = window.setTimeout(tick, 2500);
  return () => { window.clearTimeout(timer); started = false; };
}
