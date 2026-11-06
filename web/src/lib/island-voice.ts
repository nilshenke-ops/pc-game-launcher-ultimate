// Talking to JARVIS through the island: tap the microphone, say it, it is sent as a question – and the answer is read aloud
// (only for a spoken question, never by itself). The speech recognition is the browser's own (Web Speech API): in Chrome and Edge
// the audio of that one sentence is processed by the browser maker's service, nothing goes through this app. It runs only while the
// microphone button is active; there is no wake word and no listening in the background.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { transcribeGroq, useLocalAi, whisperKeyReady } from "./free-ai-local";

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
}
type Ctor = new () => Recognition;
const ctor = (): Ctor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
export const voiceInputSupported = () => ctor() !== null;

// ---- Whisper (Groq): better recognition than the browser's own, also where the browser has none (Safari home-screen apps). Optional: the audio of one
// sentence goes from this device straight to Groq (USA) with the person's own free key – only after switching it on here.
const WHISPER_KEY = "pgl.whisper";
const wl = new Set<() => void>();
export const whisperWanted = () => { try { return localStorage.getItem(WHISPER_KEY) === "1"; } catch { return false; } };
export const setWhisperWanted = (on: boolean) => { try { localStorage.setItem(WHISPER_KEY, on ? "1" : "0"); } catch { /* blocked */ } wl.forEach((l) => l()); };
export const useWhisperWanted = () => useSyncExternalStore((fn) => { wl.add(fn); return () => { wl.delete(fn); }; }, whisperWanted);
export const whisperUsable = () => whisperWanted() && whisperKeyReady() && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";

/** Voice activity: stops the recording after a pause once something was said, or when nothing is said at all. Pure, so it is tested. */
export interface Vad { speaking: boolean; lastLoud: number; startedAt: number }
export const VAD = { threshold: 0.02, silenceMs: 1300, noSpeechMs: 6000, maxMs: 15000 };
export function vadStep(s: Vad, rms: number, now: number): { state: Vad; stop: false | "silence" | "nospeech" | "max" } {
  const loud = rms >= VAD.threshold;
  const state: Vad = { speaking: s.speaking || loud, lastLoud: loud ? now : s.lastLoud, startedAt: s.startedAt };
  if (now - s.startedAt >= VAD.maxMs) return { state, stop: "max" };
  if (!state.speaking && now - s.startedAt >= VAD.noSpeechMs) return { state, stop: "nospeech" };
  if (state.speaking && !loud && now - state.lastLoud >= VAD.silenceMs) return { state, stop: "silence" };
  return { state, stop: false };
}

/** The next answer of JARVIS is read aloud because the question was spoken. */
let spoken = false;
export const markSpoken = () => { spoken = true; };
export const consumeSpoken = () => { const s = spoken; spoken = false; return s; };

/** "Gespräch": after the answer has been read aloud the microphone opens again by itself, until "Danke" / "Ende", the tap on the microphone, or two silences in a row. */
let convo = false;
const convoListeners = new Set<() => void>();
export const setConversation = (v: boolean) => { if (convo !== v) { convo = v; convoListeners.forEach((l) => l()); } };
export const useConversation = () => useSyncExternalStore((fn) => { convoListeners.add(fn); return () => { convoListeners.delete(fn); }; }, () => convo);

/** Whether this page may use the microphone ("granted" / "denied" / "prompt"); "unknown" where the browser cannot tell (Safari, home-screen apps). */
export async function micPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    const p = await (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }).permissions?.query({ name: "microphone" });
    return p?.state === "granted" || p?.state === "denied" || p?.state === "prompt" ? p.state : "unknown";
  } catch { return "unknown"; }
}

/** Why the recognition stopped, in words for a person. */
export function voiceErrorText(code: string): string | null {
  switch (code) {
    case "aborted": case "no-speech": return null;
    case "not-allowed": case "service-not-allowed": return "Das Mikrofon ist nicht erlaubt (Browser-Einstellung der Seite).";
    case "audio-capture": return "Kein Mikrofon gefunden.";
    case "network": return "Die Spracherkennung des Browsers ist gerade nicht erreichbar.";
    default: return "Die Spracheingabe hat nicht geklappt.";
  }
}

export function useVoiceInput(onFinal: (text: string) => void, onProblem?: (text: string) => void, onEmpty?: () => void) {
  const rec = useRef<Recognition | null>(null);
  const wh = useRef<{ stop: () => void; abort: () => void } | null>(null);
  const done = useRef(onFinal), problem = useRef(onProblem), empty = useRef(onEmpty);
  done.current = onFinal; problem.current = onProblem; empty.current = onEmpty;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  useLocalAi(); useWhisperWanted();                                    // re-render when a key is (un)locked or the switch changes
  const whisper = whisperUsable();
  const supported = voiceInputSupported() || whisper;

  const startWhisper = useCallback(async () => {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { problem.current?.("Das Mikrofon ist nicht erlaubt (Browser-Einstellung der Seite)."); return; }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let aborted = false, vad: Vad = { speaking: false, lastLoud: 0, startedAt: performance.now() };
    const timer = window.setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const v of buf) sum += v * v;
      const r = vadStep(vad, Math.sqrt(sum / buf.length), performance.now());
      vad = r.state; setInterim(vad.speaking ? "…" : "");
      if (r.stop && mr.state === "recording") mr.stop();
    }, 80);
    const cleanup = () => { window.clearInterval(timer); stream.getTracks().forEach((t) => t.stop()); void ctx.close().catch(() => {}); wh.current = null; setListening(false); setInterim(""); };
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      const spoke = vad.speaking; cleanup();
      if (aborted || !spoke) { if (!aborted) empty.current?.(); return; }
      try {
        const text = await transcribeGroq(new Blob(chunks, { type: mr.mimeType || type || "audio/webm" }), document.documentElement.lang === "en" ? "en" : "de");
        if (text) done.current(text); else empty.current?.();
      } catch (e) { problem.current?.((e as Error).message || "Die Spracherkennung (Whisper) hat nicht geklappt."); }
    };
    wh.current = { stop: () => { if (mr.state === "recording") mr.stop(); }, abort: () => { aborted = true; if (mr.state === "recording") mr.stop(); else cleanup(); } };
    setListening(true); setInterim("");
    mr.start(250);
  }, []);

  const stop = useCallback(() => { rec.current?.stop(); wh.current?.stop(); }, []);
  const start = useCallback(() => {
    if (rec.current || wh.current) return;
    if (whisperUsable()) { void startWhisper(); return; }
    const C = ctor();
    if (!C) return;
    const r = new C();
    r.lang = document.documentElement.lang === "en" ? "en-US" : "de-DE";
    r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else live += t; }
      setInterim((finalText + live).trim());
    };
    r.onerror = (e) => { const m = voiceErrorText(e.error); if (m) problem.current?.(m); };
    r.onend = () => {
      rec.current = null; setListening(false); setInterim("");
      const said = finalText.trim();
      if (said) done.current(said); else empty.current?.();
    };
    rec.current = r; setListening(true); setInterim("");
    try { r.start(); } catch { rec.current = null; setListening(false); }
  }, [startWhisper]);
  useEffect(() => () => { rec.current?.abort(); rec.current = null; wh.current?.abort(); }, []);
  return { supported, listening, interim, whisper, start, stop, toggle: () => (rec.current || wh.current ? stop() : start()) };
}
