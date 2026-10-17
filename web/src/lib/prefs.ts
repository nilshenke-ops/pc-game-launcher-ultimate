import { useSyncExternalStore } from "react";
import { client, readJson, writeJson } from "./rpc";
import { setLanguage } from "./i18n";
import { defaultPrefs, hexToRgb, contrast, mix, sanitizePrefs, type Prefs, type Theme } from "./prefs-core";

export * from "./prefs-core";

const KEY = "pgl.prefs";

// ------------------------------------------------------------------ store

let prefs: Prefs = sanitizePrefs(readJson(KEY) ?? defaultPrefs());
const listeners = new Set<() => void>();
let syncTimer: number | null = null;

export function getPrefs() { return prefs; }

export function setPrefs(update: (p: Prefs) => Prefs, opts: { sync?: boolean } = {}) {
  prefs = sanitizePrefs({ ...update(structuredClone(prefs)), updatedAt: Date.now() });
  writeJson(KEY, prefs);
  applyTheme(prefs.theme);
  setLanguage(prefs.lang);
  listeners.forEach((l) => l());
  if (opts.sync !== false) scheduleSync();
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
      applyTheme(prefs.theme);
      setLanguage(prefs.lang);
      listeners.forEach((l) => l());
    } else if (remote.updatedAt < prefs.updatedAt) scheduleSync();
  } catch { /* offline: local copy stays active */ }
}

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
    "--bg-image": t.bgImage ? `url("${t.bgImage.replace(/"/g, "%22")}")` : "none",
    "--bg-dim": String(t.bgDim),
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.mode = t.mode;
  root.dataset.motion = t.reduceMotion ? "reduce" : "full";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.background);
}

applyTheme(prefs.theme);
setLanguage(prefs.lang);
