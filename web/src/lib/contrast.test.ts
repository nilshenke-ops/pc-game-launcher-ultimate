import { describe, expect, it } from "vitest";
import { contrast, mix, PRESETS } from "./prefs-core";

// Lesbarkeit aller eingebauten Designs (WCAG): Text auf Seite und Karte, grauer Text, Schrift auf der Hauptfarbe.
// Die Farben folgen applyTheme() in prefs.ts.
describe("Kontrast aller Designs", () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    const dark = p.mode === "dark";
    const text = dark ? "#e8edf7" : "#0f172a";
    const muted = dark ? "#93a0b8" : "#475569";
    const card = dark ? mix(p.background, "#ffffff", 0.06) : "#ffffff";
    const onPrimary = contrast(p.primary, "#000000") > contrast(p.primary, "#ffffff") ? "#04121a" : "#ffffff";
    it(`${p.name} (${id}): Text ≥ 4,5 : 1, grauer Text ≥ 3 : 1, Schrift auf Hauptfarbe ≥ 4,5 : 1`, () => {
      expect(contrast(text, p.background), "Text auf Hintergrund").toBeGreaterThanOrEqual(4.5);
      expect(contrast(text, card), "Text auf Karte").toBeGreaterThanOrEqual(4.5);
      expect(contrast(muted, p.background), "grauer Text auf Hintergrund").toBeGreaterThanOrEqual(3);
      expect(contrast(muted, card), "grauer Text auf Karte").toBeGreaterThanOrEqual(3);
      expect(contrast(onPrimary, p.primary), "Schrift auf Hauptfarbe").toBeGreaterThanOrEqual(4.5);
    });
  }
});
