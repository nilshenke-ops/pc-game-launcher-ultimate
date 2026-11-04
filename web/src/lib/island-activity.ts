// What is going on around the PC, as the island sees it: several activities can be live at once (music, a game, a timer, JARVIS),
// the most important one leads the closed island and the others show as small marks. Everything that happened is also kept in a
// short history (this device, survives a reload) so an important message never just disappears after seven seconds.
// Pure logic – tested without a browser.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";

export type ActivityKind = "jarvis" | "game" | "timer" | "music" | "system" | "notice";
export type ActivityLevel = "info" | "success" | "warning" | "error";

export interface LiveActivity { kind: ActivityKind; level: ActivityLevel; text: string }
/** Who leads: an error or warning before a question before JARVIS working before a running timer before a game before music. */
const RANK: Record<string, number> = { error: 0, warning: 1, ask: 2, jarvis: 3, timer: 4, game: 5, music: 6 };
const rankOf = (a: LiveActivity) => (a.level === "error" ? RANK.error : a.level === "warning" ? RANK.warning : RANK[a.kind] ?? 9);

/** Live activities, most important first (stable for equal rank). */
export function orderActivities(list: LiveActivity[]): LiveActivity[] {
  return list.map((a, i) => ({ a, i })).sort((x, y) => rankOf(x.a) - rankOf(y.a) || x.i - y.i).map((x) => x.a);
}
/** The one that leads and the others that only show as marks. */
export function splitLead(list: LiveActivity[]): { lead: LiveActivity | null; others: LiveActivity[] } {
  const o = orderActivities(list);
  return { lead: o[0] ?? null, others: o.slice(1) };
}

// ------------------------------------------------------------------ history
export interface HistoryEntry { id: number; at: number; kind: ActivityKind; level: ActivityLevel; text: string }
export const HISTORY_MAX = 60;
const KEY = "pgl.island.history";

/** Adds an entry on top; the same text twice within 8 seconds counts once (a flapping connection must not flood the list). */
export function addEntry(list: HistoryEntry[], e: Omit<HistoryEntry, "id">, max = HISTORY_MAX): HistoryEntry[] {
  const text = e.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 140);
  if (!text) return list;
  const top = list[0];
  if (top && top.text === text && top.kind === e.kind && e.at - top.at < 8000) return list;
  return [{ ...e, text, id: (top?.id ?? 0) + 1 }, ...list].slice(0, max);
}
export function cleanHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const kinds = ["jarvis", "game", "timer", "music", "system", "notice"], levels = ["info", "success", "warning", "error"];
  return v.filter((x): x is HistoryEntry => !!x && typeof x.text === "string" && typeof x.at === "number" && kinds.includes(x.kind) && levels.includes(x.level))
    .slice(0, HISTORY_MAX).map((x, i) => ({ id: typeof x.id === "number" ? x.id : i, at: x.at, kind: x.kind, level: x.level, text: x.text.slice(0, 140) }));
}

let history: HistoryEntry[] = (() => { try { return cleanHistory(readJson<unknown>(KEY)); } catch { return []; } })();
const listeners = new Set<() => void>();
export const useIslandHistory = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => history);
export const islandHistory = () => history;
export function logIsland(kind: ActivityKind, level: ActivityLevel, text: string, now = Date.now()) {
  const next = addEntry(history, { at: now, kind, level, text });
  if (next === history) return;
  history = next;
  try { writeJson(KEY, history); } catch { /* storage blocked – the list stays for this visit */ }
  listeners.forEach((l) => l());
}
export function clearIslandHistory() { history = []; try { writeJson(KEY, history); } catch { /* ignore */ } listeners.forEach((l) => l()); }
