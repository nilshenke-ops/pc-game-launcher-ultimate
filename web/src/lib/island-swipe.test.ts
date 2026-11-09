import { describe, expect, it } from "vitest";
import { directionOf, dragOffset, exitMs, shouldCommit, swipeIntent, velocity } from "./island-swipe";

describe("Insel: Wischen zwischen den Bereichen", () => {
  it("erkennt erst nach ein paar Pixeln, ob gewischt oder gescrollt wird", () => {
    expect(swipeIntent(3, 2)).toBe("undecided");
    expect(swipeIntent(30, 8)).toBe("horizontal");
    expect(swipeIntent(10, 40)).toBe("vertical");
    expect(swipeIntent(20, 20)).toBe("vertical");   // diagonal: scrolling wins
  });
  it("folgt dem Finger 1:1 – am Rand mit Gummiband und begrenzt", () => {
    expect(dragOffset(80, true)).toBe(80);
    expect(dragOffset(100, false)).toBeCloseTo(32);
    expect(dragOffset(-1000, false)).toBe(-56);
  });
  it("Richtung: nach links wischen = weiter, nach rechts = zurück", () => {
    expect(directionOf(-50)).toBe(1); expect(directionOf(50)).toBe(-1);
  });
  it("Loslassen: weit genug oder schnell genug geht weiter, sonst federt es zurück; ohne Ziel nie", () => {
    expect(shouldCommit(-150, 0, 400, true)).toBe(true);
    expect(shouldCommit(-40, 0, 400, true)).toBe(false);
    expect(shouldCommit(-40, -0.8, 400, true)).toBe(true);        // kurzer, schneller Wisch
    expect(shouldCommit(-40, 0.8, 400, true)).toBe(false);        // schnell, aber zurück zur Hand
    expect(shouldCommit(-300, -1, 400, false)).toBe(false);
  });
  it("Geschwindigkeit aus den letzten Momenten", () => {
    expect(velocity([])).toBe(0);
    expect(velocity([{ x: 0, t: 0 }, { x: -100, t: 100 }, { x: -200, t: 200 }])).toBeCloseTo(-1, 1);
    expect(velocity([{ x: 0, t: 0 }, { x: -50, t: 1000 }, { x: -52, t: 1050 }])).toBeCloseTo(-0.04, 2);
  });
  it("Austrittsdauer: schneller Wisch kurz, langsamer länger, immer innerhalb der Grenzen", () => {
    expect(exitMs(300, 3)).toBe(110);
    expect(exitMs(300, 0.1)).toBe(220);
    expect(exitMs(200, 1)).toBe(200);
  });
});
