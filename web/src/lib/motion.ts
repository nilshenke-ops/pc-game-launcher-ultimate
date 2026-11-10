// One switch for "no animations": the app's own setting (Settings → Design: "Animationen reduzieren", the light mode) – and only if the user
// asks for it also the system's "reduce motion" (Windows: Animationen anzeigen off · iPad/iPhone: Bewegung reduzieren).
// Before, the system setting always won: many gaming PCs have Windows animations switched off for speed, and then the island opened without
// any movement. Now the app animates unless the user says otherwise; CSS and scripts both read html[data-motion] (see postcss-motion.mjs).
const KEY = "pgl.motion.followOs";

export const followOsMotion = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export function setFollowOsMotion(v: boolean) {
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* blocked */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event("pgl-motion"));
}
export const osReducesMotion = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** Is movement switched off right now (app setting, light mode, or – if asked for – the system)? */
export const motionOff = (): boolean => typeof document === "undefined" || document.documentElement.dataset.motion === "reduce";
