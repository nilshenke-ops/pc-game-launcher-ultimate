// Remembers where the last tap/click happened, so a dialog or a page can open FROM that spot (grow out of what was pressed).
let last: { x: number; y: number; t: number; side: boolean } | null = null;
let on = false;

export function startTapTracking() {
  if (on || typeof document === "undefined") return;
  on = true;
  document.addEventListener("pointerdown", (e) => {
    last = { x: e.clientX, y: e.clientY, t: performance.now(), side: !!(e.target as Element | null)?.closest?.(".sidebar, .topbar, .bottom-nav") };
  }, { capture: true, passive: true });
}

/** The tap of the last moment (default 1.2 s), or null. */
export const recentTap = (ms = 1200) => (last && performance.now() - last.t < ms ? last : null);

/** Motion is switched off (setting or system)? */
export const motionOff = () => typeof document === "undefined" || document.documentElement.dataset.motion === "reduce";
