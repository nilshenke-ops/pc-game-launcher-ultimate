// Plays soundboard sounds on THIS device (phone/tablet) from the copy in the device storage – for when no PC is connected.
import { useSyncExternalStore } from "react";
import { getCachedSound } from "./sound-cache";
import { t } from "./i18n";
import type { Sound } from "./types";

interface Live { audio: HTMLAudioElement; url: string | null; soundId: string; base: number; gain: GainNode | null }
const live = new Map<string, Live>();
let ids: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const publish = () => { ids = new Set([...live.values()].map((l) => l.soundId)); listeners.forEach((l) => l()); };
export const useLocalPlaying = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => ids);
export const localPlayingIds = () => ids;

// ---- the volume of this device's playback (its own setting – the PC's soundboard volume belongs to the PC's speakers)
const VOL_KEY = "pgl.sounds.localVolume";
let master = (() => { try { const v = Number(localStorage.getItem(VOL_KEY)); return localStorage.getItem(VOL_KEY) != null && v >= 0 && v <= 100 ? v : 80; } catch { return 80; } })();
const volListeners = new Set<() => void>();
export const localVolume = () => master;
export const useLocalVolume = () => useSyncExternalStore((fn) => { volListeners.add(fn); return () => volListeners.delete(fn); }, () => master);
// iPhone and iPad ignore the volume of an audio element; a gain node of the Web Audio API works everywhere (and allows a sound's own volume above 100 %).
let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  try { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; ctx = C ? new C() : null; } catch { ctx = null; }
  return ctx;
}
function applyVolume(l: Live) {
  const v = Math.max(0, l.base * (master / 100));
  if (l.gain) l.gain.gain.value = Math.min(4, v); else l.audio.volume = Math.min(1, v);
}
/** Sets the volume of this device's soundboard playback (0–100) – at once, also for sounds that are playing – and keeps it for next time. */
export function setLocalVolume(v: number) {
  master = Math.round(Math.min(100, Math.max(0, v)));
  try { localStorage.setItem(VOL_KEY, String(master)); } catch { /* storage blocked: stays for this visit */ }
  for (const l of live.values()) applyVolume(l);
  volListeners.forEach((f) => f());
}

const isAudioLink = (u?: string) => !!u && /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/i.test(u);

function release(key: string) { const l = live.get(key); if (!l) return; l.audio.pause(); try { l.gain?.disconnect(); } catch { /* already gone */ } if (l.url) URL.revokeObjectURL(l.url); live.delete(key); publish(); }

/** Plays one sound. Returns an error text, or null when it plays. Tapping a playing (looping) sound stops it. */
export async function playLocal(s: Sound): Promise<string | null> {
  const running = [...live.entries()].find(([, l]) => l.soundId === s.id && l.audio.loop);
  if (running) { release(running[0]); return null; }
  const rec = await getCachedSound(s.id);
  let url: string | null = null, src: string;
  if (rec) { url = URL.createObjectURL(rec.blob); src = url; }
  else if (isAudioLink(s.sourceUrl)) src = s.sourceUrl!;                       // never saved, but it came from a direct audio link: stream it
  else return t("Dieser Sound ist noch nicht auf dem Handy gespeichert – einmal mit dem PC verbunden die Seite öffnen, dann ist er auch ohne PC da.");
  const audio = new Audio(src);
  audio.loop = !!s.loop;
  // Only the device's own copy goes through the gain node (a link from another site would stay silent there without its permission).
  let gain: GainNode | null = null;
  const c = url ? audioCtx() : null;
  if (c) { try { void c.resume(); gain = c.createGain(); c.createMediaElementSource(audio).connect(gain); gain.connect(c.destination); } catch { gain = null; } }
  const key = `${s.id}:${Date.now()}`;
  const entry: Live = { audio, url, soundId: s.id, base: s.volume / 100, gain };
  applyVolume(entry);
  live.set(key, entry); publish();
  audio.onended = () => release(key);
  audio.onerror = () => release(key);
  try { await audio.play(); return null; }
  catch (e) { release(key); return (e as Error).name === "NotAllowedError" ? t("Der Browser blockiert den Ton – einmal in die Seite tippen und nochmal versuchen.") : t("Der Sound ließ sich nicht abspielen."); }
}

export function stopAllLocal() { for (const k of [...live.keys()]) release(k); }
