// The island's size changes like a real spring: it starts fast, swings a few percent past the target and settles. Width, height
// and corner radius move together, and a new target in the middle of a movement keeps the speed (no jerk when the mouse goes
// in and out quickly). The page drives its own window shape from these numbers, so every frame of the screen and the shape the
// Windows window cuts out are the same – no second clock in the companion that could drift.

export interface Box { w: number; h: number; r: number }

/** Spring constants: damping ratio ≈ 0.67 → about 6 % overshoot, settled after roughly a third of a second. */
export const STIFFNESS = 380;
export const DAMPING = 26;
/** Folding back into the notch is calm: critically damped (no swing past the target, so the island never "pops" shut). Slightly softer than opening. */
export const CLOSE_STIFFNESS = 300;
export const CLOSE_DAMPING = 2 * Math.sqrt(CLOSE_STIFFNESS) * 0.985;

/** One step of a damped spring for several values at once (semi-implicit Euler in small, fixed sub-steps – stable at any frame rate). */
export function stepSpring(x: number[], v: number[], target: number[], dt: number, k = STIFFNESS, c = DAMPING): void {
  const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
  for (let s = 0; s < n; s++) {
    for (let i = 0; i < x.length; i++) {
      v[i] += (k * (target[i] - x[i]) - c * v[i]) * h;
      x[i] += v[i] * h;
    }
  }
}

export const isSettled = (x: number[], v: number[], target: number[], eps = 0.25, veps = 2) => x.every((xi, i) => Math.abs(target[i] - xi) < eps && Math.abs(v[i]) < veps);

export interface Scheduler { request(cb: (nowMs: number) => void): number; cancel(id: number): void }
const browser: Scheduler = { request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) };

/**
 * Moves a box to its target with the spring above and tells `apply` the box of every frame. `to(…, true)` jumps (reduced motion, first
 * paint). Created once per island; the scheduler can be replaced to test it without a browser.
 */
export function createBoxAnimator(apply: (b: Box) => void, start: Box, scheduler: Scheduler = browser) {
  const x = [start.w, start.h, start.r], v = [0, 0, 0];
  let target = [...x], raf = 0, last = 0, k = STIFFNESS, c = DAMPING;
  const emit = () => apply({ w: x[0], h: x[1], r: x[2] });
  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, Math.max(0.001, (now - last) / 1000)) : 1 / 60;
    last = now;
    stepSpring(x, v, target, dt, k, c);
    if (isSettled(x, v, target)) { x[0] = target[0]; x[1] = target[1]; x[2] = target[2]; v[0] = v[1] = v[2] = 0; raf = 0; last = 0; emit(); return; }
    emit();
    raf = scheduler.request(frame);
  };
  return {
    to(t: Box, instant = false) {
      const closing = t.h < x[1] - 1 || t.w < x[0] - 1;   // getting smaller: calm; getting bigger: lively
      k = closing ? CLOSE_STIFFNESS : STIFFNESS; c = closing ? CLOSE_DAMPING : DAMPING;
      target = [t.w, t.h, t.r];
      if (instant) { x[0] = t.w; x[1] = t.h; x[2] = t.r; v[0] = v[1] = v[2] = 0; if (raf) scheduler.cancel(raf); raf = 0; last = 0; emit(); return; }
      if (!raf) { last = 0; raf = scheduler.request(frame); }
    },
    stop() { if (raf) scheduler.cancel(raf); raf = 0; last = 0; },
    get box(): Box { return { w: x[0], h: x[1], r: x[2] }; },
    get moving() { return raf !== 0; },
  };
}

// ------------------------------------------------------------------ sizes of the island

export type IslandBoxSize = "notch" | "bar" | "ask" | "panel";
/** Logical pixels. The window of the Windows companion is always as big as the open panel plus room for the overshoot (see WINDOW_W / WINDOW_H). */
export const ISLAND_DIMS: Record<IslandBoxSize, Box> = {
  notch: { w: 132, h: 34, r: 17 },
  bar: { w: 460, h: 40, r: 20 },
  ask: { w: 560, h: 40, r: 20 },
  panel: { w: 560, h: 344, r: 28 },
};
export const WINDOW_W = 620, WINDOW_H = 380;

/** How far open an island of this height is: 0 = closed island, 1 = open panel (the spring may swing a little past 1 and below 0 – clamped). */
export function islandProgress(h: number): number {
  const lo = ISLAND_DIMS.bar.h, hi = ISLAND_DIMS.panel.h;
  return Math.min(1, Math.max(0, (h - lo) / (hi - lo)));
}

/** The box of a size; on narrow screens (phone) never wider than the screen, and a smaller closed island. */
export function islandBox(size: IslandBoxSize, viewportW = Infinity, floating = false): Box {
  const d = ISLAND_DIMS[size];
  const narrow = floating && viewportW < 700;
  const w = size === "notch" && narrow ? 104 : d.w;
  return { ...d, w: Math.round(Math.max(88, Math.min(w, viewportW - 16))) };
}
