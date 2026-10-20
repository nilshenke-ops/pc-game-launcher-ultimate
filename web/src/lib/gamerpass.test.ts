import { describe, expect, it } from "vitest";
import { passData, tier, type PassInput } from "./gamerpass";

const q: PassInput = {
  xp: 175, level: 2, levelFrom: 100, levelTo: 300,
  totals: { minutes: 754, sessions: 12, games: 4, longestStreakDays: 3, wins: 2, matches: 5 },
  achievements: [
    { id: "first", title: "Erste Runde", description: "", xp: 25, source: "auto", value: 1, target: 1, unlocked: true, unlockedAt: "2026-10-01T10:00:00Z" },
    { id: "h10", title: "10 Stunden", description: "", xp: 50, source: "auto", value: 10, target: 10, unlocked: true, unlockedAt: "2026-10-05T10:00:00Z" },
    { id: "h100", title: "100 Stunden", description: "", xp: 200, source: "auto", value: 12.6, target: 100, unlocked: false },
  ],
};

describe("Gamer-Pass", () => {
  it("tiers follow the XP of an achievement", () => {
    expect([tier(25), tier(50), tier(100), tier(200)]).toEqual(["bronze", "silver", "gold", "gold"]);
  });
  it("only counts own data – nothing invented", () => {
    const d = passData(q, "  ", "", "Elden Ring");
    expect(d.name).toBe("Gamer");
    expect(d.hours).toBe(12.6);
    expect(d.progress).toBeCloseTo(0.375);
    expect(d.xpToNext).toBe(125);
    expect(d.trophies).toEqual({ gold: 0, silver: 1, bronze: 1, total: 2, of: 3 });
    expect(d.latest?.id).toBe("h10");
  });
});
