// Swiping between the areas of the island: the page follows the finger (with a soft resistance at the first and last area), and on release it
// either carries on out of the way and lets the next area spring in from the other side, or springs back. Pure decisions live here (tested);
// the animation itself is in components/island-panel.tsx.

/** Past this share of the width, or fast enough, a release counts as "go on". */
export const COMMIT_SHARE = 0.22;
export const COMMIT_SPEED = 0.45;   // px per ms
export const LOCK_DISTANCE = 9;     // px until it is clear whether this is a swipe or scrolling

/** Horizontal intent: clearly more sideways than up/down. */
export function swipeIntent(dx: number, dy: number): "horizontal" | "vertical" | "undecided" {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < LOCK_DISTANCE && ay < LOCK_DISTANCE) return "undecided";
  return ax > ay * 1.2 ? "horizontal" : "vertical";
}

/** Where the body is drawn while dragging: 1:1, but with a rubber band when there is no area beyond (first/last). */
export function dragOffset(dx: number, hasTarget: boolean): number {
  if (hasTarget) return dx;
  const sign = dx < 0 ? -1 : 1;
  return sign * Math.min(Math.abs(dx) * 0.32, 56);
}

/** Direction of travel for a finger move: dx < 0 (to the left) goes on to the next area. */
export const directionOf = (dx: number): 1 | -1 => (dx < 0 ? 1 : -1);

export function shouldCommit(dx: number, vx: number, width: number, hasTarget: boolean): boolean {
  if (!hasTarget) return false;
  const ax = Math.abs(dx);
  if (ax > Math.max(60, width * COMMIT_SHARE)) return true;
  return Math.abs(vx) > COMMIT_SPEED && ax > 24 && Math.sign(vx) === Math.sign(dx);
}

/** The speed of the last moments of the move (px/ms) from recent samples. */
export function velocity(samples: { x: number; t: number }[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const before = samples.slice(0, -1);
  const first = before.find((s) => last.t - s.t <= 90) ?? before[before.length - 1];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** How long the old area needs to leave: the faster the swipe, the shorter (but never abrupt). */
export function exitMs(remaining: number, vx: number): number {
  const sp = Math.max(Math.abs(vx), 0.35);
  return Math.round(Math.min(220, Math.max(110, remaining / sp)));
}
