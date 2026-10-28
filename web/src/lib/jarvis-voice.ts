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
    .replace(/[✓✗•→★▶]/g, " ").replace(/\p{Extended_Pictographic}/gu, " ").replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)
    .replace(/https?:\/\/\S+/g, " ").replace(/\b(\d+)\.\s/g, "$1: ").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 80 ? cut.slice(0, end + 1) : cut + " …");
}

// ------------------------------------------------------------------------------------------ which voice
export interface VoiceCfg { voiceURI: string | null; rate: number; pitch: number }
const CFG_KEY = "pgl.jarvis.voiceCfg";
export const DEFAULT_VOICE: VoiceCfg = { voiceURI: null, rate: 1.05, pitch: 1 };
export function voiceCfg(): VoiceCfg {
  const c = readJson<Partial<VoiceCfg>>(CFG_KEY) ?? {};
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { voiceURI: typeof c.voiceURI === "string" ? c.voiceURI : null, rate: clamp(c.rate, 0.6, 1.6, DEFAULT_VOICE.rate), pitch: clamp(c.pitch, 0.5, 1.5, DEFAULT_VOICE.pitch) };
}
export function setVoiceCfg(c: Partial<VoiceCfg>) { writeJson(CFG_KEY, { ...voiceCfg(), ...c }); publish(); }

/**
 * How human a voice sounds, from its name: the neural voices (Microsoft "… Online (Natural)" in Edge, Google's in
 * Chrome/Android, Apple "Premium/Erweitert") sound like a person; the old system voices sound robotic.
 */
export function naturalness(v: { name: string; localService?: boolean }): 0 | 1 | 2 {
  if (/natural|neural|premium|erweitert|enhanced|wavenet|studio/i.test(v.name)) return 2;
  if (/google|online|siri/i.test(v.name)) return 1;
  return 0;
}
export const NATURAL_LABEL = ["Standard (klingt nach Computer)", "Gut", "Sehr natürlich"] as const;

/** The voices of this device for a language, the most human-sounding first. */
export function voicesFor<V extends { name: string; lang: string; voiceURI: string; localService?: boolean }>(lang: string, all: V[]): V[] {
  const base = lang.slice(0, 2).toLowerCase();
  return all.filter((v) => v.lang.toLowerCase().replace("_", "-").startsWith(base))
    .map((v) => ({ v, score: naturalness(v) * 10 + (v.lang.replace("_", "-") === lang ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.v.name.localeCompare(b.v.name)).map((x) => x.v);
}

function voiceFor(lang: string): SpeechSynthesisVoice | null {
  const all = window.speechSynthesis.getVoices();
  const want = voiceCfg().voiceURI;
  return (want ? all.find((v) => v.voiceURI === want) : null) ?? voicesFor(lang, all)[0] ?? null;
}

export function speak(text: string, lang = document.documentElement.lang === "en" ? "en-US" : "de-DE", force = false) {
  if ((!on && !force) || !snap.supported) return;
  const say = speakable(text);
  if (!say) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(say);
  u.lang = lang;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  const cfg = voiceCfg();
  u.rate = cfg.rate;
  u.pitch = cfg.pitch;
  u.onstart = () => { speaking = true; publish(); };
  u.onend = u.onerror = () => { speaking = false; publish(); };
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (snap.supported) window.speechSynthesis.cancel();
  speaking = false;
  publish();
}

/** "Probe hören" in the voice settings – also when the voice is switched off. */
export function testVoice(text = "Hallo, ich bin JARVIS. Sag mir, was wir heute zocken.") { speak(text, undefined, true); }
