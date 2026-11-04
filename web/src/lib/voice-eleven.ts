// JARVIS's optional ElevenLabs voice. The text goes to the PC (voice.speak), the PC asks ElevenLabs with its own key
// (the key never reaches a phone or this page) and sends back a short MP3. Off unless it was switched on at the PC;
// whenever anything goes wrong the browser voice speaks instead, so JARVIS is never silent because of this.

import { client } from "./rpc";
import { toast } from "./hooks";
import { t } from "./i18n";

export interface ElevenStatus { enabled: boolean; keySet: boolean; voiceId: string | null; voiceName: string | null; volume: number; monthlyChars: number; used: number }
export interface ElevenVoice { id: string; name: string; gender?: string | null; accent?: string | null }

let status: ElevenStatus | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((l) => l());

/** The last known state (stale-while-revalidate: speaking never waits for it). */
export const elevenStatus = () => status;
export const subscribeEleven = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function refreshEleven(): Promise<void> {
  if (loading) return loading;
  if (client.demo) return Promise.resolve();
  loading = client.call<ElevenStatus>("voice.status").then((s) => { status = s; publish(); }).catch(() => { /* no PC: browser voice */ }).finally(() => { loading = null; });
  return loading;
}

// Keep the state current: after sign-in and whenever the PC's voice settings change (also from another device).
client.on("authenticated", () => { void refreshEleven(); });
client.on("changed", (d) => { if ((d as { topic?: string }).topic === "voice") void refreshEleven(); });

/** Is the ElevenLabs voice switched on at the PC (and is there a PC to ask)? */
export function elevenReady(): boolean {
  if (!status) { void refreshEleven(); return false; }
  return status.enabled && client.status.phase === "online" && client.status.auth === "ok";
}

let audio: HTMLAudioElement | null = null;
let told = "";

export function stopEleven() {
  if (audio) { audio.pause(); audio.src = ""; audio = null; }
}

/**
 * Speak with ElevenLabs. Resolves true when the audio played (or started), false when the browser voice should take over.
 * `isCurrent` lets a newer request cancel this one; `onStart`/`onEnd` drive the "speaking" state.
 */
export async function speakEleven(text: string, isCurrent: () => boolean, onStart: () => void, onEnd: () => void): Promise<boolean> {
  try {
    const r = await client.call<{ base64: string; mime: string; volume: number }>("voice.speak", { text });
    void refreshEleven(); // the PC counted the characters – show the new monthly count
    if (!isCurrent()) return true; // replaced by a newer request: say nothing, do not fall back
    stopEleven();
    const a = new Audio(`data:${r.mime === "audio/mpeg" ? "audio/mpeg" : "audio/mpeg"};base64,${r.base64}`);
    a.volume = Math.min(1, Math.max(0, r.volume / 100));
    audio = a;
    a.onended = () => { if (audio === a) audio = null; onEnd(); };
    a.onerror = () => { if (audio === a) audio = null; onEnd(); };
    await a.play();
    onStart();
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    // Tell the user once per reason why the browser voice speaks (key wrong, limit reached …); everything else stays quiet.
    if (/^voice-(key|limit|not-stock)$/.test(code) && told !== code) { told = code; toast(t("ElevenLabs-Stimme nicht verfügbar – JARVIS spricht mit der Browser-Stimme. ({m})", { m: (e as Error).message }), "warning"); }
    if (code === "voice-off") void refreshEleven();
    return false;
  }
}
