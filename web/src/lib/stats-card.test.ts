import { describe, expect, it } from "vitest";
import { change, compute, toCsv, type CardSession } from "./stats-card";

const s = (itemId: string, name: string, at: string, minutes: number, perf?: CardSession["perf"]): CardSession => ({ itemId, name, startedAt: at, minutes, perf });
const now = new Date("2026-10-19T12:00:00Z");
const all = [
  s("a", "Hades", "2026-10-18T10:00:00Z", 120, { samples: 10, cpuAvg: 40, gpuAvg: 80 }),
  s("a", "Hades", "2026-10-15T10:00:00Z", 60, { samples: 30, cpuAvg: 20 }),
  s("b", "Celeste", "2026-10-14T10:00:00Z", 30),
  s("b", "Celeste", "2026-10-08T10:00:00Z", 90),
  s("c", "Doom", "2025-01-01T10:00:00Z", 45),
];

describe("stats card", () => {
  it("sums only the chosen period, ranks games and weights load by samples", () => {
    const d = compute(all, "week", now);
    expect(d.totalMinutes).toBe(210);
    expect(d.sessions).toBe(3);
    expect(d.games).toBe(2);
    expect(d.top.map((g) => g.name)).toEqual(["Hades", "Celeste"]);
    expect(d.longest).toEqual({ name: "Hades", minutes: 120 });
    expect(d.perf!.cpuAvg).toBeCloseTo((40 * 10 + 20 * 30) / 40);
    expect(d.perf!.gpuAvg).toBe(80); // only sessions that measured the GPU
    expect(d.previous).toEqual({ totalMinutes: 90, sessions: 1 });
  });

  it("does not invent numbers when data is missing", () => {
    const d = compute([s("x", "X", "2026-10-18T10:00:00Z", 10)], "week", now);
    expect(d.perf).toBeUndefined(); // no measurements → no load shown
    expect(d.previous).toBeUndefined(); // history does not reach back → no comparison
    expect(change(10, 0)).toBeNull();
    expect(change(150, 100)).toBe(50);
    expect(compute([], "month", now).sessions).toBe(0);
    expect(compute(all, "all", now).totalMinutes).toBe(345);
  });

  it("CSV neutralises formulas", () => {
    expect(toCsv({ ...compute(all, "all", now), top: [{ name: "=cmd", minutes: 1, sessions: 1 }] })).toContain("\"'=cmd\"");
  });
});
