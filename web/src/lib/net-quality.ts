// Rating of a connection from measured values only (no value = no rating). Thresholds are rules of thumb for online
// games and are shown in the app, so the rating is never a black box.
import { t } from "./i18n";

export type Quality = "excellent" | "good" | "fair" | "poor" | "unknown";
export const QUALITY_RULES: { q: Exclude<Quality, "unknown">; ping: number; jitter: number; loss: number }[] = [
  { q: "excellent", ping: 40, jitter: 5, loss: 0 },
  { q: "good", ping: 70, jitter: 10, loss: 1 },
  { q: "fair", ping: 120, jitter: 20, loss: 3 },
];

export function connectionQuality(v: { avg?: number | null; jitter?: number | null; lossPercent?: number | null; samples?: number }): Quality {
  if (v.avg == null || v.jitter == null || v.lossPercent == null || (v.samples ?? 0) < 5) return "unknown";
  return QUALITY_RULES.find((r) => v.avg! <= r.ping && v.jitter! <= r.jitter && v.lossPercent! <= r.loss)?.q ?? "poor";
}

export const qualityLabel = (q: Quality) =>
  ({ excellent: t("Ausgezeichnet"), good: t("Gut"), fair: t("Mittel"), poor: t("Schlecht"), unknown: t("Noch zu wenige Messwerte") } as Record<Quality, string>)[q];
/** Filled bars of the six-step display. */
export const qualityBars = (q: Quality) => ({ excellent: 6, good: 4, fair: 2, poor: 1, unknown: 0 } as Record<Quality, number>)[q];
