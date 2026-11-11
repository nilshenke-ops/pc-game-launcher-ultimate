// Game cards and quick tiles tilt towards the pointer and carry a light spot that follows it (mouse / pen only, never on touch, never
// with "reduce animations"). One delegated listener for the whole page; the work per move is two style writes on one element.
import { motionOff } from "./motion";

const SEL = ".game-card, .qa-tile";
let cur: HTMLElement | null = null, raf = 0, ev: PointerEvent | null = null;

function frame() {
  raf = 0;
  const e = ev, el = cur; if (!e || !el) return;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  el.style.setProperty("--pry", `${((px - 0.5) * 12).toFixed(2)}deg`);
  el.style.setProperty("--prx", `${((0.5 - py) * 10).toFixed(2)}deg`);
  el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
  el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
}
function reset(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("ptilt");
  for (const k of ["--prx", "--pry"]) el.style.removeProperty(k);
}

export function initTilt() {
  if (typeof window === "undefined" || !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;
  document.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch" || motionOff()) return;
    const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
    if (el !== cur) { reset(cur); cur = el; el?.classList.add("ptilt"); }
    if (!el) return;
    ev = e; if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });
  document.addEventListener("pointerleave", () => { reset(cur); cur = null; }, true);
}
