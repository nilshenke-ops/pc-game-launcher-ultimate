// Plays soundboard sounds on THIS device (phone/tablet) from the copy in the device storage – for when no PC is connected.
import { useSyncExternalStore } from "react";
import { getCachedSound } from "./sound-cache";
import { t } from "./i18n";
import type { Sound } from "./types";

interface Live { audio: HTMLAudioElement; url: string | null; soundId: string }
const live = new Map<string, Live>();
let ids: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const publish = () => { ids = new Set([...live.values()].map((l) => l.soundId)); listeners.forEach((l) => l()); };
export const useLocalPlaying = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => ids);
export const localPlayingIds = () => ids;

const isAudioLink = (u?: string) => !!u && /\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/i.test(u);

function release(key: string) { const l = live.get(key); if (!l) return; l.audio.pause(); if (l.url) URL.revokeObjectURL(l.url); live.delete(key); publish(); }

/** Plays one sound. Returns an error text, or null when it plays. Tapping a playing (looping) sound stops it. */
export async function playLocal(s: Sound, master = 1): Promise<string | null> {
  const running = [...live.entries()].find(([, l]) => l.soundId === s.id && l.audio.loop);
  if (running) { release(running[0]); return null; }
  const rec = await getCachedSound(s.id);
  let url: string | null = null, src: string;
  if (rec) { url = URL.createObjectURL(rec.blob); src = url; }
  else if (isAudioLink(s.sourceUrl)) src = s.sourceUrl!;                       // never saved, but it came from a direct audio link: stream it
  else return t("Dieser Sound ist noch nicht auf dem Handy gespeichert – einmal mit dem PC verbunden die Seite öffnen, dann ist er auch ohne PC da.");
  const audio = new Audio(src);
  audio.volume = Math.min(1, Math.max(0, (s.volume / 100) * master));
  audio.loop = !!s.loop;
  const key = `${s.id}:${Date.now()}`;
  live.set(key, { audio, url, soundId: s.id }); publish();
  audio.onended = () => release(key);
  audio.onerror = () => release(key);
  try { await audio.play(); return null; }
  catch (e) { release(key); return (e as Error).name === "NotAllowedError" ? t("Der Browser blockiert den Ton – einmal in die Seite tippen und nochmal versuchen.") : t("Der Sound ließ sich nicht abspielen."); }
}

export function stopAllLocal() { for (const k of [...live.keys()]) release(k); }
