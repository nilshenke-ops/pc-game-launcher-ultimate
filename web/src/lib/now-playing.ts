// "Läuft gerade": the song or video the PC plays (Spotify, a video in Firefox …), read by the companion from Windows' media sessions.
// One shared poller for all views; it only asks while someone looks at it and the page is visible.
import { useEffect, useSyncExternalStore } from "react";
import { client } from "./rpc";

export interface NowPlaying { supported: boolean; active?: boolean; playing: boolean; app: string; title: string; artist: string }

/** "Artist – Title" (or just the title); empty without anything. */
export function nowLine(n: Pick<NowPlaying, "title" | "artist"> | null | undefined): string {
  if (!n || !n.title) return "";
  return n.artist ? `${n.artist} – ${n.title}` : n.title;
}
/** What to say about it: playing or paused, with the program. */
export function nowSub(n: NowPlaying | null | undefined): string {
  if (!n || !n.title) return "";
  return [n.artist, n.app].filter(Boolean).join(" · ");
}

let state: NowPlaying | null = null;
let subs = 0;
let timer: number | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const same = (a: NowPlaying | null, b: NowPlaying | null) => JSON.stringify(a) === JSON.stringify(b);

async function poll() {
  if (document.visibilityState === "hidden") return;
  if (client.status.phase !== "online" || client.status.auth !== "ok") { if (state) { state = null; emit(); } return; }
  try {
    const r = await client.call<NowPlaying>("media.now");
    const next = r && r.supported !== false ? r : null;
    if (!same(state, next)) { state = next; emit(); }
  } catch { /* no answer: keep the last value until the connection check clears it */ }
}

function start() { if (timer !== undefined) return; void poll(); timer = window.setInterval(() => void poll(), 3000); }
function stop() { if (timer !== undefined) { clearInterval(timer); timer = undefined; } }

export function useNowPlaying(): NowPlaying | null {
  useEffect(() => { subs++; start(); return () => { subs--; if (subs <= 0) { subs = 0; stop(); } }; }, []);
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
}
