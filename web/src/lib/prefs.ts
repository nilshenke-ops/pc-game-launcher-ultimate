import { useSyncExternalStore } from "react";
import { client, readJson, writeJson } from "./rpc";
import { setLanguage } from "./i18n";
import { BG_SCENES, DEFAULT_THEME, defaultPrefs, hexToRgb, contrast, mix, sanitizePrefs, withProfileTheme, type Prefs, type Theme } from "./prefs-core";
import type { ProfileTheme } from "./types";

export * from "./prefs-core";

const KEY = "pgl.prefs";

// ------------------------------------------------------------------ store

let prefs: Prefs = sanitizePrefs(readJson(KEY) ?? defaultPrefs());
const listeners = new Set<() => void>();
let syncTimer: number | null = null;

export function getPrefs() { return prefs; }

// Theme of the active gaming profile (from the PC). It is laid over the own design and never stored in it, so the own
// design comes back by itself when the profile ends, the PC is unreachable or the user switches it off.
let profileTheme: ProfileTheme | null = null;
// A design shown but not yet saved (JARVIS design editor): it lies over everything until "Übernehmen" or "Verwerfen".
let preview: { theme: Theme; changes: string[] } | null = null;
const effectiveTheme = () => preview?.theme ?? (prefs.profileThemes ? withProfileTheme(prefs.theme, profileTheme) : prefs.theme);
const previewListeners = new Set<() => void>();
const HISTORY_KEY = "pgl.design.history";
const ORIGINAL_KEY = "pgl.design.original";

/** Shows a design without saving it. */
export function previewTheme(theme: Theme, changes: string[]) {
  preview = { theme: sanitizePrefs({ ...prefs, theme }).theme, changes };
  applyTheme(effectiveTheme());
  previewListeners.forEach((l) => l());
}
export function discardPreview() { preview = null; applyTheme(effectiveTheme()); previewListeners.forEach((l) => l()); }
/** Saves the previewed design; the one before goes into the history (for "Rückgängig"). */
export function commitPreview(): boolean {
  if (!preview) return false;
  const next = preview.theme;
  pushDesignHistory(prefs.theme);
  preview = null;
  setPrefs((p) => ({ ...p, theme: next }));
  previewListeners.forEach((l) => l());
  return true;
}
export function getPreview() { return preview; }
export function usePreview() { return useSyncExternalStore((fn) => { previewListeners.add(fn); return () => previewListeners.delete(fn); }, () => preview); }

/** Earlier saved designs, newest last (at most 10); the very first one is kept as "Ausgangsdesign". */
export function designHistory(): Theme[] { return (readJson<Theme[]>(HISTORY_KEY) ?? []).filter((x) => x && typeof x === "object"); }
function pushDesignHistory(t: Theme) {
  if (!readJson(ORIGINAL_KEY)) writeJson(ORIGINAL_KEY, t);
  writeJson(HISTORY_KEY, [...designHistory(), t].slice(-10));
}
/** Back to the design before the last saved change. */
export function undoDesign(): boolean {
  const h = designHistory();
  const prev = h.pop();
  if (!prev) return false;
  writeJson(HISTORY_KEY, h);
  preview = null;
  setPrefs((p) => ({ ...p, theme: prev }));
  previewListeners.forEach((l) => l());
  return true;
}
/** The design from before the first change through the design editor (or the Nexus default). */
export function originalDesign(): Theme { return readJson<Theme>(ORIGINAL_KEY) ?? DEFAULT_THEME; }
export function restoreOriginalDesign() {
  pushDesignHistory(prefs.theme);
  preview = null;
  setPrefs((p) => ({ ...p, theme: originalDesign() }));
  previewListeners.forEach((l) => l());
}
export function setProfileTheme(pt: ProfileTheme | null | undefined) {
  const next = pt ?? null;
  if (JSON.stringify(next) === JSON.stringify(profileTheme)) return;
  profileTheme = next;
  applyTheme(effectiveTheme());
}
export function profileThemeActive() { return prefs.profileThemes && !!profileTheme; }

export function setPrefs(update: (p: Prefs) => Prefs, opts: { sync?: boolean } = {}) {
  prefs = sanitizePrefs({ ...update(structuredClone(prefs)), updatedAt: Date.now() });
  writeJson(KEY, prefs);
  applyTheme(effectiveTheme());
  setLanguage(prefs.lang);
  listeners.forEach((l) => l());
  if (opts.sync !== false) scheduleSync();
  changeListeners.forEach((l) => l());
}

/** Saves preferences on the companion as well, so the design survives clearing the browser and follows the device. */
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    if (client.status.auth === "ok") client.call("ui.savePrefs", { prefs }).catch(() => { /* retried on next change */ });
  }, 800);
}

export async function loadRemotePrefs() {
  try {
    const r = await client.call<{ prefs: string | null }>("ui.getPrefs");
    if (!r.prefs) { scheduleSync(); return; }
    const remote = sanitizePrefs(JSON.parse(r.prefs));
    if (remote.updatedAt > prefs.updatedAt) {
      prefs = remote;
      writeJson(KEY, prefs);
      applyTheme(effectiveTheme());
      setLanguage(prefs.lang);
      listeners.forEach((l) => l());
    } else if (remote.updatedAt < prefs.updatedAt) scheduleSync();
  } catch { /* offline: local copy stays active */ }
}

/** Called after every own change of the design (not for loading). Returns the unsubscribe function. */
const changeListeners = new Set<() => void>();
export function onPrefsChange(fn: () => void) { changeListeners.add(fn); return () => { changeListeners.delete(fn); }; }

/** Puts a whole design on this device (design profile, design code) and saves it like an own change. */
export function replacePrefs(p: Prefs) { setPrefs(() => p); }

export function usePrefs(): Prefs {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => prefs);
}

export function bumpUsage(key: string) {
  setPrefs((p) => ({ ...p, usage: { ...p.usage, [key]: (p.usage[key] ?? 0) + 1 } }));
}

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  const dark = t.mode === "dark";
  const text = dark ? "#e8edf7" : "#0f172a";
  const surface = dark ? mix(t.background, "#ffffff", 0.06) : "#ffffff";
  const vars: Record<string, string> = {
    "--bg": t.background,
    "--bg-2": dark ? mix(t.background, "#ffffff", 0.03) : mix(t.background, "#000000", 0.03),
    "--surface-rgb": hexToRgb(surface).join(","),
    "--surface-alpha": String(t.surfaceAlpha),
    "--surface-2": dark ? mix(t.background, "#ffffff", 0.1) : mix(t.background, "#000000", 0.06),
    "--border": dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.1)",
    "--border-strong": dark ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.2)",
    "--text": text,
    "--muted": dark ? "#93a0b8" : "#475569",
    "--primary": t.primary,
    "--primary-rgb": hexToRgb(t.primary).join(","),
    "--on-primary": contrast(t.primary, "#000000") > contrast(t.primary, "#ffffff") ? "#04121a" : "#ffffff",
    "--accent": t.accent,
    "--accent-rgb": hexToRgb(t.accent).join(","),
    "--radius": `${t.radius}px`,
    "--radius-sm": `${Math.max(4, Math.round(t.radius * 0.6))}px`,
    "--font-scale": String(t.fontScale),
    // Relative to the page, so it works on the website and on the PC alike (also offline: the files are precached).
    "--bg-image": t.bgImage ? `url("${t.bgImage.replace(/"/g, "%22")}")` : t.bgScene ? `url("${new URL(`backgrounds/${t.bgScene}.svg`, location.href.split("#")[0]).href}")` : "none",
    "--bg-image-phone": !t.bgImage && t.bgScene && BG_SCENES.find((s) => s.id === t.bgScene)?.phone
      ? `url("${new URL(`backgrounds/${t.bgScene}-phone.svg`, location.href.split("#")[0]).href}")` : "none",
    "--bg-dim": String(t.bgDim),
    // Built-in scenes are landscapes: keep the ground visible on tall phone screens.
    "--bg-pos": !t.bgImage && t.bgScene ? "center bottom" : "center",
  };
  if (t.border === "bold") { vars["--border"] = dark ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.22)"; vars["--border-strong"] = dark ? "rgba(255,255,255,0.32)" : "rgba(15,23,42,0.38)"; }
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // Shadows: "soft" is the stylesheet's own value.
  if (t.shadow === "none") { root.style.setProperty("--shadow", "none"); root.style.setProperty("--glow", "none"); }
  else if (t.shadow === "strong") { root.style.setProperty("--shadow", dark ? "0 18px 44px -10px rgba(0,0,0,0.8)" : "0 18px 40px -12px rgba(15,23,42,0.4)"); root.style.removeProperty("--glow"); }
  else { root.style.removeProperty("--shadow"); root.style.removeProperty("--glow"); }
  root.dataset.density = t.density ?? "normal";
  root.dataset.touch = t.touch ? "1" : "0";
  root.dataset.mode = t.mode;
  // Landscapes with a sky colour are anchored at the bottom on phones; patterns (comic, arcade, space) stay full-screen.
  const scene = !t.bgImage && t.bgScene ? BG_SCENES.find((s) => s.id === t.bgScene) : undefined;
  root.dataset.bgfit = scene?.phone ? "phone" : scene?.sky ? "bottom" : "cover";
  root.style.setProperty("--bg-sky", scene?.sky ?? "transparent");
  root.dataset.motion = t.reduceMotion || t.lite ? "reduce" : "full";
  root.dataset.lite = t.lite ? "1" : "0";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.background);
}

applyTheme(prefs.theme);
setLanguage(prefs.lang);
