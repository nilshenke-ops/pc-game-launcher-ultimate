import { describe, expect, it } from "vitest";
import { POMO_START, pomoMs, pomoNext } from "./pomodoro";

describe("Pomodoro", () => {
  it("Fokus → Pause → Fokus …, nach dem vierten Fokus die lange Pause", () => {
    let s = POMO_START; const seen: string[] = [];
    for (let i = 0; i < 8; i++) { s = pomoNext(s); seen.push(s.phase); }
    expect(seen).toEqual(["break", "focus", "break", "focus", "break", "focus", "long", "focus"]);
    expect(s.done).toBe(4);
  });
  it("Zeiten: 25, 5 und 15 Minuten", () => {
    expect([pomoMs("focus"), pomoMs("break"), pomoMs("long")]).toEqual([25 * 60000, 5 * 60000, 15 * 60000]);
  });
  it("eine Pause zählt keinen Fokus mit", () => expect(pomoNext({ phase: "break", done: 2 })).toEqual({ phase: "focus", done: 2 }));
});
