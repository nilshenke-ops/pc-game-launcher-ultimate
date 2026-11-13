import { describe, expect, it } from "vitest";
import { nextDelay, pickMoment } from "./eye-life";

describe("Augen-Leben ohne Endlos-Animation", () => {
  it("meist Blinzeln, manchmal ein Blick zur Seite", () => {
    expect(pickMoment(0)).toBe("blink");
    expect(pickMoment(0.5)).toBe("blink2");
    expect(pickMoment(0.7)).toBe("left");
    expect(pickMoment(0.99)).toBe("right");
  });
  it("alle 3,5 bis 8 Sekunden – nie dauernd", () => {
    expect(nextDelay(0)).toBe(3500);
    expect(nextDelay(1)).toBe(8000);
  });
});
