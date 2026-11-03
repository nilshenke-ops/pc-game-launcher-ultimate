import { describe, expect, it } from "vitest";
import { islandStats } from "./island-stats";
import type { MetricsSample } from "./types";

const sample = (p: Partial<MetricsSample>): MetricsSample => ({ at: "x", cpuTempSource: "", gpus: [], disks: [], sources: {}, ...p });

describe("Insel: PC-Werte", () => {
  it("zeigt die gemessenen Werte gerundet", () => {
    const s = islandStats(sample({ cpuPercent: 41.6, memTotalBytes: 16e9, memUsedBytes: 8e9, gpus: [{ utilPercent: 73.2 } as never] }));
    expect(s.map((x) => x.text)).toEqual(["42 %", "50 %", "73 %"]);
  });
  it("ohne Messung: Strich; nicht messbar: „n. v.“; abgeschaltet: „aus“ – nie eine erfundene Zahl", () => {
    expect(islandStats(null).map((x) => x.text)).toEqual(["–", "–", "–"]);
    const s = islandStats(sample({ off: ["gpu"] }));
    expect(s.find((x) => x.id === "gpu")!.text).toBe("aus");
    expect(s.find((x) => x.id === "cpu")!.text).toBe("n. v.");
    expect(s.every((x) => x.pct === null)).toBe(true);
  });
  it("Werte bleiben zwischen 0 und 100", () => {
    expect(islandStats(sample({ cpuPercent: 140 }))[0].pct).toBe(100);
    expect(islandStats(sample({ cpuPercent: -3 }))[0].pct).toBe(0);
  });
});
