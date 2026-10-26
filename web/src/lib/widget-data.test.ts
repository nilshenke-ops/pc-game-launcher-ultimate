import { describe, expect, it } from "vitest";
import { dailyPick, topPlayed } from "./widget-data";

describe("widget data", () => {
  it("counts only the minutes inside the last 7 days, per game, most played first", () => {
    const now = Date.parse("2026-10-21T20:00:00Z");
    const s = [
      { itemId: "a", name: "Hades", startedAt: "2026-10-20T18:00:00Z", endedAt: "2026-10-20T20:00:00Z", minutes: 120 },
      { itemId: "b", name: "Minecraft", startedAt: "2026-10-14T19:00:00Z", endedAt: "2026-10-14T21:00:00Z", minutes: 120 }, // ends 1 h inside the window
      { itemId: "b", name: "Minecraft", startedAt: "2026-10-01T10:00:00Z", endedAt: "2026-10-01T12:00:00Z", minutes: 120 }, // outside
      { itemId: "c", name: "Läuft gerade", startedAt: "2026-10-21T19:30:00Z", minutes: 0 },                                     // no end: up to now
      { itemId: "d", name: "Kaputt", startedAt: "nope", minutes: 50 },
    ];
    expect(topPlayed(s, now)).toEqual([{ name: "Hades", minutes: 120 }, { name: "Minecraft", minutes: 60 }, { name: "Läuft gerade", minutes: 30 }]);
    expect(topPlayed([], now)).toEqual([]);
  });

  it("picks the same entry all day and another one the next day", () => {
    const list = ["a", "b", "c"];
    const morning = new Date(2026, 9, 21, 8).getTime(), evening = new Date(2026, 9, 21, 23).getTime(), next = new Date(2026, 9, 22, 8).getTime();
    expect(dailyPick(list, morning)).toBe(dailyPick(list, evening));
    expect(dailyPick(list, next)).not.toBe(dailyPick(list, morning));
    expect(dailyPick([], morning)).toBeUndefined();
  });
});
