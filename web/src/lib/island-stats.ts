// Werte für die Insel-Karte „PC-Werte“: nur was der PC wirklich gemessen hat – nichts geschätzt.
import type { MetricsSample } from "./types";

export interface IslandStat { id: "cpu" | "ram" | "gpu"; label: string; pct: number | null; text: string }

/** "aus" = in den Einstellungen abgeschaltet, "n. v." = diesen Wert kann der PC nicht messen. */
export function islandStats(m: MetricsSample | null): IslandStat[] {
  const na = (k: "cpu" | "ram" | "gpu") => (m?.off?.includes(k) ? "aus" : "n. v.");
  const pct = (v: number | null | undefined, k: "cpu" | "ram" | "gpu") => ({ pct: v == null ? null : Math.max(0, Math.min(100, v)), text: v == null ? (m ? na(k) : "–") : `${Math.round(v)} %` });
  const ram = m?.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  return [
    { id: "cpu", label: "CPU", ...pct(m?.cpuPercent, "cpu") },
    { id: "ram", label: "RAM", ...pct(ram, "ram") },
    { id: "gpu", label: "GPU", ...pct(m?.gpus?.[0]?.utilPercent, "gpu") },
  ];
}
