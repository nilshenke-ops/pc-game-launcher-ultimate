// The JARVIS island: a small window at the top of the PC screen (Windows companion, page #/island) that shows what
// JARVIS is doing and holds a few widgets (running game, media keys, clock, focus timer). Own design – inspired by
// "island" apps, no code or character taken from them. Everything shown comes from real state: JARVIS' activity as the
// PC reports it, his last answer and a question that needs a yes.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { t } from "./i18n";
import type { AssistantAction } from "./assistant";

export type Mood = "idle" | "thinking" | "listening" | "asking" | "happy" | "error" | "dizzy" | "dancing" | "gaming" | "sleeping" | "surprised";
/** Window sizes the companion accepts: only the eyes, the bar, the bar with a question, the open widgets. */
export type IslandSize = "notch" | "bar" | "ask" | "panel";

export interface IslandState {
  busy: boolean;
  listening: boolean;
  /** JARVIS' last answer (short), shown when the island is opened. */
  last: { text: string; ok: boolean | null; at: number } | null;
  /** An action from JARVIS that needs a yes (launch, quick action …) – "Erlauben" runs it, "Ablehnen" drops it. */
  ask: { action: AssistantAction; at: number } | null;
  /** Taps on the eyes within the last seconds (too many → dizzy). */
  pokes: number[];
  /** Sound the PC plays right now (level 0..1, last beat) – from the companion, only while it really plays. */
  music: { level: number; beatAt: number; at: number } | null;
  /** A game from the library runs (according to the PC), and since when. */
  gaming: boolean;
  gamingSince: number;
  /** The pet was told to dance or go to sleep ("tanz", "geh schlafen") – until the time is up or someone touches it. */
  pet: { mood: "dancing" | "sleeping"; until: number } | null;
  /** Last time someone used the island (hover, tap) or JARVIS did something – for the sleep mode. */
  lastActive: number;
}

let state: IslandState = { busy: false, listening: false, last: null, ask: null, pokes: [], music: null, gaming: false, gamingSince: 0, pet: null, lastActive: Date.now() };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<IslandState>) => { state = { ...state, ...p }; emit(); };

export const useIsland = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state);
export const islandState = () => state;

export function islandBusy(busy: boolean, listening = false) { if (busy !== state.busy || listening !== state.listening) set({ busy, listening }); }
/** Only an action that needs a confirmation and runs a command becomes a question – never an automatic one or a link. */
export function islandAnswer(text: string, ok: boolean | null, actions: AssistantAction[] = []) {
  const ask = actions.find((a) => a.confirm && a.method && !a.auto) ?? null;
  set({ last: { text: text.slice(0, 280), ok, at: Date.now() }, ask: ask ? { action: ask, at: Date.now() } : null });
}
/** declined: the question is dropped and nothing runs – the eyes go back to normal (no "done"). */
export function islandClearAsk(declined = false) { if (state.ask || declined) set({ ask: null, ...(declined ? { last: { text: t("Abgelehnt – nichts ausgeführt."), ok: null, at: 0 } } : {}) }); }
/** Message "island.audio" of the companion: {playing, level, beat}. */
export function islandMusic(d: { playing?: boolean; level?: number; beat?: boolean }, now = Date.now()) {
  if (!d.playing) { if (state.music) set({ music: null }); return; }
  set({ music: { level: Math.max(0, Math.min(1, Number(d.level) || 0)), beatAt: d.beat ? now : state.music?.beatAt ?? 0, at: now }, lastActive: now });
}
export function islandGaming(on: boolean, now = Date.now()) { if (on !== state.gaming) set({ gaming: on, gamingSince: on ? now : 0, lastActive: now }); }
/** Someone used the island – it wakes up (also from "geh schlafen"). */
export function islandTouch(now = Date.now()) { if (state.pet?.mood === "sleeping") set({ pet: null, lastActive: now }); else if (now - state.lastActive > 1000) set({ lastActive: now }); }

/** Spoken or typed commands for the pet itself (not for JARVIS' brain): dance for a while, go to sleep, wake up. */
export type PetCommand = "dance" | "sleep" | "wake";
export function petCommand(text: string): PetCommand | null {
  const s = text.toLowerCase().replace(/[.!?,]/g, " ").replace(/\s+/g, " ").trim().replace(/^(hey |hallo |ok )?jarvis /, "");
  if (/^(tanz|tanze|tanz mal|tanz für mich|tanz bitte|dance)$/.test(s)) return "dance";
  if (/^(geh|geh bitte|geh jetzt) (schlafen|pennen)$|^(schlaf|schlaf jetzt|schlaf ein|gute nacht)$|^go to sleep$/.test(s)) return "sleep";
  if (/^(wach auf|aufwachen|guten morgen|wake up)$/.test(s)) return "wake";
  return null;
}
export const DANCE_MS = 30_000;
export function islandPet(cmd: PetCommand, now = Date.now()) {
  if (cmd === "dance") set({ pet: { mood: "dancing", until: now + DANCE_MS }, lastActive: now });
  else if (cmd === "sleep") set({ pet: { mood: "sleeping", until: Infinity } });
  else set({ pet: null, lastActive: now });
}
export function islandPoke(now = Date.now()) { set({ pokes: [...state.pokes.filter((x) => now - x < 4000), now] }); }

/** A question waits at most 2 minutes – then it is gone and nothing runs. */
export const ASK_TTL = 120_000;
/** "Done" is shown for 6 s after an answer. */
export const HAPPY_MS = 6000;

/** Without anything going on for this long the pet falls asleep (tap or hover wakes it). */
export const SLEEP_AFTER = 10 * 60_000;
/** Music counts as playing while the companion keeps reporting it (it says so itself when it stops). */
export const MUSIC_FRESH = 4000;
/** A started game surprises the pet for a moment before it settles into the gaming look. */
export const SURPRISE_MS = 3000;

/** What the eyes show – first match wins. Pure, so it is tested without a browser. */
export function moodOf(s: Pick<IslandState, "busy" | "listening" | "last" | "ask" | "pokes" | "music" | "gaming" | "gamingSince" | "lastActive"> & { pet?: IslandState["pet"] }, now = Date.now()): Mood {
  if (s.pokes.filter((x) => now - x < 4000).length >= 5) return "dizzy";
  if (s.ask && now - s.ask.at < ASK_TTL) return "asking";
  if (s.listening) return "listening";
  if (s.busy) return "thinking";
  if (s.last && now - s.last.at < HAPPY_MS) return s.last.ok === false ? "error" : "happy";
  if (s.pet && now < s.pet.until) return s.pet.mood;
  if (s.gaming && now - s.gamingSince < SURPRISE_MS) return "surprised";
  if (s.music && now - s.music.at < MUSIC_FRESH) return "dancing";
  if (s.gaming) return "gaming";
  if (now - s.lastActive > SLEEP_AFTER) return "sleeping";
  return "idle";
}

/** Collapsed to the eyes unless something is going on: open → widgets, question → bar with buttons, hover/activity → bar. */
export function islandSize(x: { open: boolean; ask: boolean; hover: boolean; mood: Mood }): IslandSize {
  if (x.open) return "panel";
  if (x.ask) return "ask";
  return x.hover || x.mood === "thinking" || x.mood === "listening" || x.mood === "happy" || x.mood === "error" ? "bar" : "notch";
}

export const MOOD_LABEL: Record<Mood, string> = {
  idle: "Bereit", thinking: "Denkt nach", listening: "Hört zu", asking: "Fragt dich", happy: "Erledigt", error: "Hat nicht geklappt", dizzy: "Schwindelig",
  dancing: "Tanzt", gaming: "Zockt mit", sleeping: "Schläft", surprised: "Überrascht",
};

// ------------------------------------------------------------------ settings (this window only)

const KEY = "pgl.island";
export interface IslandPrefs { sound: boolean }
export const islandPrefs = (): IslandPrefs => { try { const v = readJson<Partial<IslandPrefs>>(KEY); return { sound: v?.sound !== false }; } catch { return { sound: true }; } };
const prefListeners = new Set<() => void>();
let prefSnap = islandPrefs();
export function setIslandPrefs(p: Partial<IslandPrefs>) {
  prefSnap = { ...prefSnap, ...p };
  try { writeJson(KEY, prefSnap); } catch { /* storage blocked – only for this visit */ }
  prefListeners.forEach((l) => l());
}
export const useIslandPrefs = () => useSyncExternalStore((fn) => { prefListeners.add(fn); return () => prefListeners.delete(fn); }, () => prefSnap);

/** Focus timer: milliseconds → "m:ss". */
export const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
