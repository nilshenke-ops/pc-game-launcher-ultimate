// Performance presets (3.62): three named bundles of existing display settings of this device. Nothing new is stored – a
// preset only sets theme.lite, theme.reduceMotion, theme.tilt, the moving background and the page transition. Before applying,
// the page shows exactly which of them change (from → to); afterwards one "Rückgängig" puts back the values from before.
import type { Prefs } from "./prefs-core";

export type PerfPresetId = "saver" | "balanced" | "max";

export interface PerfValues { lite: boolean; reduceMotion: boolean; tilt: boolean; bg: Prefs["fx"]["bg"]["kind"]; transition: Prefs["fx"]["transition"]["kind"] }

export const PERF_PRESETS: { id: PerfPresetId; label: string; desc: string; values: PerfValues }[] = [
  { id: "saver", label: "Energiesparend", desc: "Für Laptop-Akku, schwächere Geräte oder wenn die App neben einem Spiel offen ist: keine Unschärfe, kein Leuchten, keine Animationen.",
    values: { lite: true, reduceMotion: true, tilt: false, bg: "none", transition: "none" } },
  { id: "balanced", label: "Ausgewogen", desc: "Standard: weiche Übergänge und Glas-Effekte, aber kein bewegter Hintergrund.",
    values: { lite: false, reduceMotion: false, tilt: false, bg: "none", transition: "fade" } },
  { id: "max", label: "Maximale Effekte", desc: "Alle Effekte: bewegter Hintergrund, 3D-Neigen der Karten, gleitende Seitenwechsel. Braucht die meiste Leistung.",
    values: { lite: false, reduceMotion: false, tilt: true, bg: "particles", transition: "slide" } },
];

const FIELD_LABEL: Record<keyof PerfValues, string> = {
  lite: "Leichte Darstellung", reduceMotion: "Animationen reduzieren", tilt: "Karten neigen sich zur Maus (3D)", bg: "Bewegter Hintergrund", transition: "Seitenübergang",
};
const VALUE_LABEL: Record<string, string> = {
  true: "an", false: "aus", none: "aus", particles: "Partikel", stars: "Sternenflug", grid: "Neon-Raster", waves: "Wellen", embers: "Funken", snow: "Eiskristalle",
  fade: "Einblenden", slide: "Gleiten", zoom: "Zoom", blur: "Unschärfe",
};

export function currentPerf(p: Prefs): PerfValues {
  return { lite: !!p.theme.lite, reduceMotion: !!p.theme.reduceMotion, tilt: !!p.theme.tilt, bg: p.fx.bg.kind, transition: p.fx.transition.kind };
}

/** Which preset the device matches right now (null = own mix). */
export function activePreset(p: Prefs): PerfPresetId | null {
  const c = currentPerf(p);
  return PERF_PRESETS.find((x) => (Object.keys(x.values) as (keyof PerfValues)[]).every((k) => x.values[k] === c[k]))?.id ?? null;
}

export interface PerfChange { field: keyof PerfValues; label: string; from: string; to: string }

/** The preview: only the settings that would really change, in words. */
export function presetChanges(p: Prefs, id: PerfPresetId): PerfChange[] {
  const target = PERF_PRESETS.find((x) => x.id === id)!.values;
  const c = currentPerf(p);
  return (Object.keys(target) as (keyof PerfValues)[])
    .filter((k) => target[k] !== c[k])
    .map((k) => ({ field: k, label: FIELD_LABEL[k], from: VALUE_LABEL[String(c[k])] ?? String(c[k]), to: VALUE_LABEL[String(target[k])] ?? String(target[k]) }));
}

/** Writes the values into the prefs; everything else stays untouched. */
export function withPerf(p: Prefs, v: PerfValues): Prefs {
  return {
    ...p,
    theme: { ...p.theme, lite: v.lite, reduceMotion: v.reduceMotion, tilt: v.tilt },
    fx: { ...p.fx, bg: { ...p.fx.bg, kind: v.bg }, transition: { ...p.fx.transition, kind: v.transition } },
  };
}

export function applyPreset(p: Prefs, id: PerfPresetId): { next: Prefs; undo: PerfValues } {
  return { next: withPerf(p, PERF_PRESETS.find((x) => x.id === id)!.values), undo: currentPerf(p) };
}
