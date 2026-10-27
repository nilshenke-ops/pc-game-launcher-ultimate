// JARVIS's voice – the browser's own speech output (Web Speech API, on the device, no server, no cost).
// Only answers to a request are spoken, never anything by itself; switched off in one tap.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

const KEY = "pgl.jarvis.voice";
let on = readJson<boolean>(KEY) ?? true;
let speaking = false;
const listeners = new Set<() => void>();
let snap = { on, speaking, supported: typeof window !== "undefined" && "speechSynthesis" in window };
const publish = () => { snap = { ...snap, on, speaking }; listeners.forEach((l) => l()); };

export function setVoice(v: boolean) { on = v; writeJson(KEY, v); if (!v) stopSpeaking(); publish(); }
export const useVoice = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => snap);

/** Text as it is read aloud: no symbols, no lists of buttons, at most a few sentences. */
export function speakable(text: string, max = 420): string {
  const s = text
    .replace(/[✓✗•→★▶]/g, " ").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)
    .replace(/https?:\/\/\S+/g, " ").replace(/\b(\d+)\.\s/g, "$1: ").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 80 ? cut.slice(0, end + 1) : cut + " …");
}

function voiceFor(lang: string): SpeechSynthesisVoice | null {
  const vs = window.speechSynthesis.getVoices();
  return vs.find((v) => v.lang === lang && /google|natural|neural|online/i.test(v.name)) ?? vs.find((v) => v.lang === lang) ?? vs.find((v) => v.lang.startsWith(lang.slice(0, 2))) ?? null;
}

export function speak(text: string, lang = document.documentElement.lang === "en" ? "en-US" : "de-DE") {
  if (!on || !snap.supported) return;
  const say = speakable(text);
  if (!say) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(say);
  u.lang = lang;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.rate = 1.05;
  u.onstart = () => { speaking = true; publish(); };
  u.onend = u.onerror = () => { speaking = false; publish(); };
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (snap.supported) window.speechSynthesis.cancel();
  speaking = false;
  publish();
}
