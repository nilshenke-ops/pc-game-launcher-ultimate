// Status-Pille für Handy und iPad: eine kleine, antippbare Anzeige unter der oberen Leiste (Verbindung, laufendes Spiel,
// wartende Änderungen). Eine Webseite kann keine echte Dynamic Island des iPhones steuern – das ist eine eigene Anzeige in der Seite.
// Aus, bis man sie in den Einstellungen einschaltet; gilt nur für dieses Gerät.

import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "./rpc";
import { mainGame } from "./running";

const KEY = "pgl.statusPill";
let on = (() => { try { return readJson<boolean>(KEY) === true; } catch { return false; } })();
const listeners = new Set<() => void>();
export const useStatusPill = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => on);
export function setStatusPill(v: boolean) { on = v; try { writeJson(KEY, v); } catch { /* storage blocked – only for this visit */ } listeners.forEach((l) => l()); }

export interface PillInfo { tone: "ok" | "warn" | "error"; short: string; detail: string; game: string | null; waiting: number }

/** Compact text of the pill: connection first; a running game or waiting changes make it a bit longer. */
export function pillText(i: Pick<PillInfo, "short" | "game" | "waiting">): string {
  const parts = [i.short];
  if (i.game) parts.push(i.game);
  if (i.waiting > 0) parts.push(`${i.waiting}↑`);
  return parts.join(" · ");
}

/** Only while really connected the pill may name a running game (the saved overview never lists one). */
export function runningGame(running: { name: string }[] | undefined, connected: boolean): string | null {
  return connected && running && running.length > 0 ? (mainGame(running)?.name ?? null) : null;
}
