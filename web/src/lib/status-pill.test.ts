import { describe, expect, it } from "vitest";
import { pillText, runningGame } from "./status-pill";

describe("Status-Pille", () => {
  it("Text: zuerst die Verbindung, dann Spiel und wartende Änderungen", () => {
    expect(pillText({ short: "Verbunden", game: null, waiting: 0 })).toBe("Verbunden");
    expect(pillText({ short: "Verbunden", game: "Rocket League", waiting: 0 })).toBe("Verbunden · Rocket League");
    expect(pillText({ short: "Wiederverbinden …", game: null, waiting: 3 })).toBe("Wiederverbinden … · 3↑");
  });
  it("nennt ein laufendes Spiel nur, wenn wirklich verbunden – nie aus dem gespeicherten Stand", () => {
    const running = [{ name: "Doom" }];
    expect(runningGame(running, true)).toBe("Doom");
    expect(runningGame(running, false)).toBeNull();
    expect(runningGame([], true)).toBeNull();
    expect(runningGame(undefined, true)).toBeNull();
  });
});
