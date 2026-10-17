import { en } from "./en";

// German is the source language: every UI text is written in German inside t(…).
// en.ts maps those texts to English. A unit test checks that every t(…) literal has a translation.

let lang: "de" | "en" = "de";

export function setLanguage(l: "de" | "en") {
  lang = l;
  document.documentElement.lang = l;
}

export function getLanguage() { return lang; }

export function t(text: string, vars?: Record<string, string | number>): string {
  let out = lang === "en" ? en[text] ?? text : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

export function locale() { return lang === "en" ? "en-GB" : "de-DE"; }
