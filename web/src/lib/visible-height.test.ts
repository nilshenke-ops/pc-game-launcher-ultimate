import { describe, expect, it } from "vitest";
import { keyboardOpen, visibleHeight } from "./visible-height";

describe("sichtbare Höhe", () => {
  it("nimmt die Höhe ohne Tastatur, nie mehr als das Fenster, nie unter 120 px", () => {
    expect(visibleHeight({ height: 380 }, 844)).toBe(380);
    expect(visibleHeight({ height: 900 }, 844)).toBe(844);
    expect(visibleHeight({ height: 40 }, 844)).toBe(120);
  });
  it("ohne Angabe des Browsers: keine Variable", () => {
    expect(visibleHeight(null, 844)).toBeNull();
    expect(visibleHeight({ height: 0 }, 844)).toBeNull();
  });
});

describe("Bildschirmtastatur", () => {
  it("offen, wenn der sichtbare Bereich mehr als 120 px kleiner ist als das Fenster", () => {
    expect(keyboardOpen(400, 844)).toBe(true);
    expect(keyboardOpen(800, 844)).toBe(false);
    expect(keyboardOpen(null, 844)).toBe(false);
  });
});
