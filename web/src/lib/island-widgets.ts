// Widgets der JARVIS-Insel: welche im geöffneten Fenster erscheinen und was sie zeigen. Nur echte Werte – nichts geschätzt.
import type { MetricsSample } from "./types";

export type IslandWidgetId = "game" | "clock" | "music" | "focus" | "stats" | "temp" | "net" | "volume" | "note";
export const ISLAND_WIDGETS: { id: IslandWidgetId; label: string; hint: string }[] = [
  { id: "game", label: "Laufendes Spiel", hint: "Welches Spiel aus deiner Bibliothek läuft und seit wann" },
  { id: "clock", label: "Uhr", hint: "Uhrzeit und Datum" },
  { id: "music", label: "Musik am PC", hint: "Zurück, Pause/Weiter, Weiter" },
  { id: "focus", label: "Fokus-Timer & Pomodoro", hint: "5/15/25 Minuten oder Pomodoro (25/5)" },
  { id: "stats", label: "PC-Werte", hint: "CPU, RAM, GPU" },
  { id: "temp", label: "Temperatur & FPS", hint: "CPU-/GPU-Temperatur; FPS nur, wenn der PC sie messen kann" },
  { id: "net", label: "Netzwerk", hint: "Ping zu Router und Internet (nur solange das Fenster offen ist)" },
  { id: "volume", label: "Lautstärke", hint: "Leiser, Stumm, Lauter (Systemlautstärke per Tasten)" },
  { id: "note", label: "Notiz", hint: "Ein kurzer Zettel, nur auf diesem PC gespeichert" },
];
/** What was always in the panel (plus the PC values since 2.90.0) – the new ones are off until switched on. */
export const DEFAULT_WIDGETS: IslandWidgetId[] = ["game", "clock", "music", "focus", "stats"];
export const isWidgetId = (v: unknown): v is IslandWidgetId => ISLAND_WIDGETS.some((w) => w.id === v);
/** Keeps only known ids, in the fixed order, without duplicates; anything unusable falls back to the default set. */
export function cleanWidgets(v: unknown): IslandWidgetId[] {
  if (!Array.isArray(v)) return DEFAULT_WIDGETS;
  const set = new Set(v.filter(isWidgetId));
  return ISLAND_WIDGETS.map((w) => w.id).filter((id) => set.has(id));
}
export function toggleWidget(list: IslandWidgetId[], id: IslandWidgetId, on: boolean): IslandWidgetId[] {
  return cleanWidgets(on ? [...list, id] : list.filter((x) => x !== id));
}

export interface IslandTemps { cpu: string; gpu: string; fps: string }
/** "n. v." = this value cannot be measured on this PC; FPS needs a frame-capture service the companion does not include. */
export function islandTemps(m: MetricsSample | null): IslandTemps {
  const deg = (v?: number | null) => (v == null ? (m ? "n. v." : "–") : `${Math.round(v)} °C`);
  const fps = !m ? "–" : m.fpsStatus && /^\d/.test(m.fpsStatus) ? m.fpsStatus : "n. v.";
  return { cpu: deg(m?.cpuTempC), gpu: deg(m?.gpus?.[0]?.tempC), fps };
}

export interface NetRow { id: string; label: string; text: string; ok: boolean }
/** Last ping per target; "keine Antwort" when the last try failed, "–" before the first one. */
export function netRows(targets: { id: string; label: string; points: { ms: number | null }[] }[] | null, max = 2): NetRow[] {
  return (targets ?? []).slice(0, max).map((tg) => {
    const last = tg.points.length ? tg.points[tg.points.length - 1].ms : undefined;
    return { id: tg.id, label: tg.label, text: last === undefined ? "–" : last === null ? "keine Antwort" : `${Math.round(last)} ms`, ok: last != null };
  });
}

export const NOTE_MAX = 500;
export const cleanNote = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, NOTE_MAX) : "");
