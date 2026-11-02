// 3D tilt: the card under the mouse leans a few degrees towards it. One delegated listener for the whole page, only while
// the design asks for it, only with a real mouse and full motion – never on touch screens, never with "Animationen reduzieren".

const MAX_DEG = 5;
let on = false;
let current: HTMLElement | null = null;

/** Degrees for a pointer at (x, y) in a box: leaning towards the pointer, 0 in the middle. */
export function tiltFor(x: number, y: number, w: number, h: number, max = MAX_DEG): { rx: number; ry: number } {
  if (w <= 0 || h <= 0) return { rx: 0, ry: 0 };
  const nx = Math.max(-1, Math.min(1, (x / w) * 2 - 1)), ny = Math.max(-1, Math.min(1, (y / h) * 2 - 1));
  return { rx: Math.round(-ny * max * 100) / 100 || 0, ry: Math.round(nx * max * 100) / 100 || 0 }; // || 0: no "-0"
}

function reset() {
  if (!current) return;
  current.classList.remove("tilting");
  current.style.removeProperty("--rx"); current.style.removeProperty("--ry");
  current = null;
}

function move(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  const card = (e.target as HTMLElement | null)?.closest?.(".card") as HTMLElement | null;
  if (card !== current) { reset(); if (!card || card.matches(".card .card")) return; current = card; card.classList.add("tilting"); }
  if (!current) return;
  const r = current.getBoundingClientRect();
  // Very large cards (whole pages) stay still – tilting them looks wrong.
  if (r.width > 900 || r.height > 700) { reset(); return; }
  const { rx, ry } = tiltFor(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  current.style.setProperty("--rx", rx + "deg"); current.style.setProperty("--ry", ry + "deg");
}

/** Switches the listeners on or off (called when the design changes). */
export function setTilt(enabled: boolean) {
  if (enabled === on) return;
  on = enabled;
  if (enabled) { document.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerleave", reset, true); }
  else { document.removeEventListener("pointermove", move); document.removeEventListener("pointerleave", reset, true); reset(); }
}
