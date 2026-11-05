// Talking to JARVIS through the island: tap the microphone, say it, it is sent as a question – and the answer is read aloud
// (only for a spoken question, never by itself). The speech recognition is the browser's own (Web Speech API): in Chrome and Edge
// the audio of that one sentence is processed by the browser maker's service, nothing goes through this app. It runs only while the
// microphone button is active; there is no wake word and no listening in the background.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

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
  const done = useRef(onFinal), problem = useRef(onProblem), empty = useRef(onEmpty);
  done.current = onFinal; problem.current = onProblem; empty.current = onEmpty;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const supported = voiceInputSupported();

  const stop = useCallback(() => { rec.current?.stop(); }, []);
  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
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
  }, []);
  useEffect(() => () => { rec.current?.abort(); rec.current = null; }, []);
  return { supported, listening, interim, start, stop, toggle: () => (rec.current ? stop() : start()) };
}
