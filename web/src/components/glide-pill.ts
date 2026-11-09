// One highlight element that glides (spring) to the active entry of a menu instead of the highlight jumping from one entry to the next.
// The pill is drawn by CSS exactly like the active entry (see .mn-pill); this only places it. The first place is taken without gliding there.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function useGlidePill(box: RefObject<HTMLElement | null>, pill: RefObject<HTMLElement | null>, activeSel: string, deps: unknown[]) {
  const placed = useRef(false);
  const measure = () => {
    const root = box.current, el = pill.current;
    if (!root || !el) return;
    const link = root.querySelector<HTMLElement>(activeSel);
    if (!link) { el.style.opacity = "0"; return; }
    const r = root.getBoundingClientRect(), l = link.getBoundingClientRect();
    if (!l.height) { el.style.opacity = "0"; return; }
    el.style.opacity = "1";
    el.style.width = `${l.width}px`; el.style.height = `${l.height}px`;
    el.style.transform = `translate3d(${l.left - r.left}px, ${l.top - r.top}px, 0)`;
    el.style.borderRadius = getComputedStyle(link).borderRadius;
    if (!placed.current) { placed.current = true; requestAnimationFrame(() => el.classList.add("ready")); }
  };
  useLayoutEffect(() => {
    measure();
    // the entries may still be moving or changing size (a list that fills, the active entry that shows its label): follow for a moment
    let alive = true; const t0 = performance.now();
    const tick = () => { if (!alive) return; measure(); if (performance.now() - t0 < 700) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    const root = box.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  });
}
