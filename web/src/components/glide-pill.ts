// One highlight element that glides (spring) to the active entry of a menu instead of the highlight jumping from one entry to the next.
// The pill is drawn by CSS exactly like the active entry (see .mn-pill); this only places it. The first place is taken without gliding there.
//
// 3.67.3: measured with layout values (offsetLeft/Top/Width/Height – not affected by a scale animation around it) and only when something
// really changed size (ResizeObserver on the menu and each entry). Before, it measured with getBoundingClientRect on every frame for 0.7 s
// after each change – while the JARVIS island opened that forced an extra layout of the whole island per frame and made it stutter.
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** Position of an element inside an ancestor, from layout values (transforms of the ancestors – like an opening animation – do not matter). */
function offsetIn(el: HTMLElement, root: HTMLElement): { x: number; y: number } | null {
  let x = 0, y = 0, cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    x += cur.offsetLeft; y += cur.offsetTop;
    const parent = cur.offsetParent as HTMLElement | null;
    if (!parent) return null;
    // the offset parent may lie outside root: subtract root's own offset then (root is positioned in the usual case, so this rarely runs)
    if (!root.contains(parent) && parent !== root) { x -= root.offsetLeft; y -= root.offsetTop; break; }
    cur = parent;
  }
  return { x, y };
}

export function useGlidePill(box: RefObject<HTMLElement | null>, pill: RefObject<HTMLElement | null>, activeSel: string, deps: unknown[]) {
  const placed = useRef(false);
  const last = useRef("");
  const measure = () => {
    const root = box.current, el = pill.current;
    if (!root || !el) return;
    const link = root.querySelector<HTMLElement>(activeSel);
    if (!link || !link.offsetHeight) { if (el.style.opacity !== "0") el.style.opacity = "0"; last.current = ""; return; }
    const at = offsetIn(link, root);
    if (!at) return;
    const key = `${at.x}|${at.y}|${link.offsetWidth}|${link.offsetHeight}`;
    if (key === last.current) return;              // nothing moved: no writes, no extra layout
    last.current = key;
    el.style.opacity = "1";
    el.style.width = `${link.offsetWidth}px`; el.style.height = `${link.offsetHeight}px`;
    el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
    el.style.borderRadius = getComputedStyle(link).borderRadius;
    if (!placed.current) { placed.current = true; requestAnimationFrame(() => el.classList.add("ready")); }
  };
  // the active entry changed: place the pill there (once – later size changes come through the observer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { last.current = ""; measure(); }, deps);
  useEffect(() => {
    const root = box.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    // the menu and every entry: an entry that grows (a label appears) moves the others – one of them always changes size then
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    for (const child of Array.from(root.children)) if (child !== pill.current) ro.observe(child);
    return () => ro.disconnect();
  });
}
