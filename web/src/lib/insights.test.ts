import { describe, expect, it } from "vitest";
import { compareRuns, compareYears, longestStreak, MIN_SESSIONS, playStyle, runFromSession, yearReview, yearsWithData, type Session } from "./insights";

const s = (itemId: string, at: string, minutes: number, extra: Partial<Session> = {}): Session => ({ itemId, name: itemId.toUpperCase(), startedAt: at, endedAt: at, minutes, ...extra });

describe("year review", () => {
  const list = [
    s("a", "2025-12-30T20:00:00", 60), s("a", "2026-01-02T20:00:00", 120), s("b", "2026-01-03T20:00:00", 30), s("a", "2026-01-04T21:00:00", 90),
    s("c", "2026-03-10T10:00:00", 45), s("b", "2026-01-03T22:00:00", 15),
  ];
  it("counts only the year and only recorded sessions", () => {
    const r = yearReview(list, 2026, "2025-12-30T20:00:00");
    expect([r.sessions, r.minutes, r.activeDays, r.streak]).toEqual([5, 300, 4, 3]);
    expect(r.games.map((g) => [g.name, g.minutes])).toEqual([["A", 210], ["B", 45], ["C", 45]]);
    expect(r.byMonth[0]).toBe(255);
    expect(r.byMonth[2]).toBe(45);
    expect(r.longest!.minutes).toBe(120);
    expect(r.newGames).toEqual(["B", "C"]); // A was already played in 2025
    expect(r.coverageFrom).toBeNull();
  });
  it("says when the recording started during the year and does not claim new games then", () => {
    const r = yearReview(list, 2026, "2026-01-02T20:00:00");
    expect(r.coverageFrom).toBe("2026-01-02T20:00:00");
    expect(r.newGames).toBeNull();
    expect(yearReview([], 2026, null)).toMatchObject({ sessions: 0, minutes: 0, longest: null, topWeekday: null, newGames: null });
  });
  it("compares years only where both have data", () => {
    const a = yearReview(list, 2026, "2025-01-01T00:00:00"), b = yearReview(list, 2025, "2025-01-01T00:00:00");
    expect(compareYears(a, b).minutes).toBe(400);
    expect(compareYears(b, yearReview([], 2024, null)).minutes).toBeNull();
    expect(yearsWithData(list)).toEqual([2026, 2025]);
  });
  it("finds the longest streak of days", () => {
    expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-02", "2026-01-04", "2026-01-05", "2026-01-06"])).toBe(3);
    expect(longestStreak(["2025-12-31", "2026-01-01"])).toBe(2);
    expect(longestStreak([])).toBe(0);
  });
});

describe("play style", () => {
  it("names nothing with too few sessions", () => {
    const p = playStyle([s("a", "2026-01-02T20:00:00", 60)], []);
    expect(p.enough).toBe(false);
    expect(p.traits).toEqual([]);
  });
  it("derives traits from the numbers and shows them", () => {
    const list = Array.from({ length: MIN_SESSIONS }, (_, i) => s(i < 8 ? "a" : "b", `2026-01-${String(3 + (i % 2) * 1).padStart(2, "0")}T21:00:00`, 150));
    const p = playStyle(list, [{ id: "a", name: "A", categories: ["Koop"], rating: 5, favorite: true, backlog: "completed" }, { id: "b", name: "B", rating: 3 }]);
    expect(p.traits.map((x) => x.text)).toEqual(["Meist gespielt: {p} ({n} %)", "Lange Sitzungen: typisch {m} Min.", "Wochenend-Spieler: {n} % der Spielzeit am Wochenende", "Treu: ein Spiel macht {n} % deiner Spielzeit aus"]);
    expect(p.traits[0].vars).toEqual({ p: "Abends (17–23 Uhr)", n: 100 });
    expect(p.topCategories).toEqual([{ name: "Koop", minutes: 1200 }]);
    expect(p.ratings).toEqual({ count: 2, average: 4, best: [{ name: "A", rating: 5 }, { name: "B", rating: 3 }] });
    expect(p.favorites).toEqual(["A"]);
    expect(p.backlog.completed).toBe(1);
  });
});

describe("performance archive", () => {
  it("takes only measured loads from a session, never FPS", () => {
    const r = runFromSession(s("a", "2026-01-02T20:00:00", 60, { perf: { samples: 30, cpuAvg: 41.26, gpuAvg: 88.04, gpuMax: 99 } }))!;
    expect(r).toMatchObject({ source: "measured", cpuAvg: 41.3, gpuAvg: 88, gpuMax: 99, fpsAvg: null, fpsLow: null });
    expect(runFromSession(s("a", "2026-01-02T20:00:00", 60))).toBeNull();
  });
  it("compares runs and knows which direction is better", () => {
    const c = compareRuns({ fpsAvg: 60, frametimeMs: 16.7, cpuTemp: 70 }, { fpsAvg: 72, frametimeMs: 13.9, cpuTemp: null });
    expect(c.find((x) => x.key === "fpsAvg")).toMatchObject({ diff: 12, better: true });
    expect(c.find((x) => x.key === "frametimeMs")).toMatchObject({ diff: -2.8, better: true });
    expect(c.find((x) => x.key === "cpuTemp")).toMatchObject({ diff: null, better: null });
  });
});
