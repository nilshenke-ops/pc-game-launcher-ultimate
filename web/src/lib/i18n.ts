import { useSyncExternalStore } from "react";

// German is the source language: every UI text is written in German inside t(…).
// en.ts maps those texts to English. A unit test checks that every t(…) literal has a translation.
// The English dictionary is a large file: it is only loaded when English is chosen, not for every German user.

let lang: "de" | "en" = "de";
let en: Record<string, string> | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function loadEnglish(): Promise<void> {
  loading ??= import("./en").then((m) => { en = m.en; version++; listeners.forEach((l) => l()); });
  return loading;
}

export function setLanguage(l: "de" | "en") {
  lang = l;
  document.documentElement.lang = l;
  if (l === "en") void loadEnglish();
}

/** Resolves when the texts of the current language are there (instantly for German). */
export function languageReady(): Promise<void> { return lang === "en" ? loadEnglish() : Promise.resolve(); }

/** Re-renders once the English texts have arrived (used at the top of the app). */
export function useLanguageVersion() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => version);
}

export function getLanguage() { return lang; }

export function t(text: string, vars?: Record<string, string | number>): string {
  let out = lang === "en" ? en?.[text] ?? text : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function locale() { return lang === "en" ? "en-GB" : "de-DE"; }
