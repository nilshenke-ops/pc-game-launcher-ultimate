// "Läuft gerade": the song or video the PC plays (Spotify, a video in Firefox …), read by the companion from Windows' media sessions.
// One shared poller for all views; it only asks while someone looks at it and the page is visible.
import { useEffect, useSyncExternalStore } from "react";
import { client } from "./rpc";

export interface NowPlaying {
  supported: boolean; active?: boolean; playing: boolean; app: string; title: string; artist: string;
  /** Position and length of the song in ms as of `at` (0 = the program does not say); the cover as a data URL when the PC has one. */
  positionMs?: number; durationMs?: number; coverKey?: string; cover?: string | null; at?: number;
}

/** Where the song is now: the reported position plus the time since it was read (only while it plays), never past the end. */
export function nowPosition(n: Pick<NowPlaying, "playing" | "positionMs" | "durationMs" | "at"> | null | undefined, now = Date.now()): { ms: number; total: number; ratio: number } | null {
  if (!n || !n.durationMs || n.durationMs <= 0) return null;
  const ms = Math.min(n.durationMs, Math.max(0, (n.positionMs ?? 0) + (n.playing && n.at ? now - n.at : 0)));
  return { ms, total: n.durationMs, ratio: ms / n.durationMs };
}
/** "3:07" / "1:02:03". */
export function songTime(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

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

// The cover comes once per song (the PC only sends it when the key differs from the one we have).
let coverKey = "", cover: string | null = null;

async function poll() {
  if (document.visibilityState === "hidden") return;
  if (client.status.phase !== "online" || client.status.auth !== "ok") { if (state) { state = null; emit(); } return; }
  try {
    const r = await client.call<NowPlaying>("media.now", coverKey ? { have: coverKey } : {});
    if (r && r.supported !== false && r.active) {
      if (r.coverKey !== coverKey) { coverKey = r.coverKey ?? ""; cover = r.cover ?? null; } else if (r.cover) cover = r.cover;
      const next: NowPlaying = { ...r, cover, at: Date.now() };
      // The clock of the song runs in the page between two answers – a changed position alone is no reason to redraw everything.
      if (!same({ ...state, at: 0, positionMs: 0 } as NowPlaying, { ...next, at: 0, positionMs: 0 }) || Math.abs((state ? (nowPosition(state)?.ms ?? 0) : 0) - (r.positionMs ?? 0)) > 2500) { state = next; emit(); }
    } else {
      const next = r && r.supported !== false ? r : null;
      if (!same(state, next)) { state = next; emit(); }
    }
  } catch { /* no answer: keep the last value until the connection check clears it */ }
}

// Asks the PC only while somebody looks: every 3 s while something plays, slower when paused or quiet (no busy polling).
function next() { return state?.playing ? 3000 : state?.active ? 6000 : 10000; }
function loop() { timer = window.setTimeout(() => { void poll().finally(() => { if (timer !== undefined) loop(); }); }, next()); }
function start() { if (timer !== undefined) return; void poll(); loop(); }
function stop() { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } }

export function useNowPlaying(): NowPlaying | null {
  useEffect(() => { subs++; start(); return () => { subs--; if (subs <= 0) { subs = 0; stop(); } }; }, []);
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
}
