// JARVIS's voice – the browser's own speech output (Web Speech API, on the device, no server, no cost).
// Only answers to a request are spoken, never anything by itself; switched off in one tap.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { elevenReady, playElevenBlob, setTtsProblem, speakEleven, stopEleven } from "./voice-eleven";
import { elevenDeviceReady, speakElevenDevice } from "./free-ai-local";

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
    .replace(/https?:\/\/\S+/g, " ").replace(/\b(\d):(\d)\b/g, "$1 zu $2")           // a score (single digits): "2:1" → "2 zu 1"; times have two-digit minutes ("18:30 Uhr")
    .replace(/(\d)\s*°\s*C\b/g, "$1 Grad Celsius").replace(/(\d)\s*°/g, "$1 Grad").replace(/(\d)\s*%/g, "$1 Prozent").replace(/(\d)\s*km\/h\b/gi, "$1 Kilometer pro Stunde").replace(/(\d)\s*€/g, "$1 Euro").replace(/\b(\d+)\.\s/g, "$1: ").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (end > 80 ? cut.slice(0, end + 1) : cut + " …");
}

// ------------------------------------------------------------------------------------------ which voice
export interface VoiceCfg { voiceURI: string | null; rate: number; pitch: number }
const CFG_KEY = "pgl.jarvis.voiceCfg";
export const DEFAULT_VOICE: VoiceCfg = { voiceURI: null, rate: 1, pitch: 0.95 };
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

// ---- which voice speaks: "auto" = ElevenLabs when it is ready (at the PC, or with this device's own key), otherwise the browser voice; "browser" = never ElevenLabs.
export type TtsEngine = "auto" | "browser" | "eleven";
const TTS_KEY = "pgl.ttsEngine", TTS_USED = "pgl.ttsEleven";
const TTS_MONTHLY_CHARS = 15000;                                   // this device's own cap for its own ElevenLabs key
const tl = new Set<() => void>();
export function ttsEngine(): TtsEngine { try { const v = localStorage.getItem(TTS_KEY); return v === "browser" || v === "eleven" ? v : "auto"; } catch { return "auto"; } }
export const setTtsEngine = (e: TtsEngine) => { try { localStorage.setItem(TTS_KEY, e); } catch { /* blocked */ } tl.forEach((l) => l()); };
export const useTtsEngine = () => useSyncExternalStore((fn) => { tl.add(fn); return () => { tl.delete(fn); }; }, ttsEngine);
function deviceCharsLeft(): number {
  const m = new Date().toISOString().slice(0, 7);
  try { const u = JSON.parse(localStorage.getItem(TTS_USED) ?? "{}") as { m?: string; n?: number }; return TTS_MONTHLY_CHARS - (u.m === m ? u.n ?? 0 : 0); } catch { return TTS_MONTHLY_CHARS; }
}
function countDeviceChars(n: number) {
  const m = new Date().toISOString().slice(0, 7);
  try { const u = JSON.parse(localStorage.getItem(TTS_USED) ?? "{}") as { m?: string; n?: number }; localStorage.setItem(TTS_USED, JSON.stringify({ m, n: (u.m === m ? u.n ?? 0 : 0) + n })); } catch { /* blocked */ }
}

let seq = 0; // a newer request (or "stop") cancels an older one that is still waiting for ElevenLabs

/** Speaks with the ElevenLabs voice when it is switched on at the PC; anything that goes wrong falls back to the browser voice. */
export function speak(text: string, lang = document.documentElement.lang === "en" ? "en-US" : "de-DE", force = false) {
  if (!on && !force) return;
  const say = speakable(text);
  if (!say) return;
  const mine = ++seq;
  stopEleven();
  if (snap.supported) window.speechSynthesis.cancel();
  const engine = ttsEngine();
  if (engine !== "browser" && !elevenReady() && elevenDeviceReady() && deviceCharsLeft() >= say.length) {
    // this device's own ElevenLabs key: text → MP3 straight from here; anything that goes wrong → the browser voice
    void speakElevenDevice(say).then((b) => { countDeviceChars(say.length); return playElevenBlob(b, () => mine === seq, () => { speaking = true; publish(); }, () => { if (mine === seq) { speaking = false; publish(); } }); })
      .then((ok) => { if (!ok && mine === seq) speakBrowser(say, lang); }, (e) => { setTtsProblem((e as Error).message || "ElevenLabs"); if (mine === seq) speakBrowser(say, lang); });
    return;
  }
  if (engine !== "browser" && elevenReady()) {
    void speakEleven(say, () => mine === seq, () => { speaking = true; publish(); }, () => { if (mine === seq) { speaking = false; publish(); } })
      .then((ok) => { if (!ok && mine === seq) speakBrowser(say, lang); });
    return;
  }
  speakBrowser(say, lang);
}

/** Sentences, each spoken on its own: the browser cuts long utterances off (Chrome after ~15 s) and a short pause between sentences sounds like a person. */
export function sentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) { if (out.length && out[out.length - 1].length < 28) out[out.length - 1] += " " + p; else out.push(p); }   // no one-word utterances
  return out;
}

function speakBrowser(say: string, lang: string) {
  if (!snap.supported) return;
  window.speechSynthesis.cancel();
  const v = voiceFor(lang);
  const cfg = voiceCfg();
  const parts = sentences(say);
  parts.forEach((part, i) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = lang;
    if (v) u.voice = v;
    u.rate = cfg.rate;
    u.pitch = cfg.pitch;
    if (i === 0) u.onstart = () => { speaking = true; publish(); };
    u.onend = u.onerror = () => { if (i === parts.length - 1) { speaking = false; publish(); } };
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  seq++;
  stopEleven();
  if (snap.supported) window.speechSynthesis.cancel();
  speaking = false;
  publish();
}

/** "Probe hören" in the voice settings – also when the voice is switched off. */
export function testVoice(text = "Hallo, ich bin JARVIS. Sag mir, was wir heute zocken.") { speak(text, undefined, true); }
