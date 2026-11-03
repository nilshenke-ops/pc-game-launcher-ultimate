import { describe, expect, it } from "vitest";
import { tiltFor } from "./tilt";
import { BG_SCENES, PRESETS, SURFACES, contrast, sanitizePrefs, defaultPrefs } from "./prefs-core";

describe("3D-Neigung", () => {
  it("neigt sich zur Maus hin, in der Mitte gerade, nie über die Grenze", () => {
    expect(tiltFor(100, 50, 200, 100)).toEqual({ rx: 0, ry: 0 });
    const right = tiltFor(200, 50, 200, 100), top = tiltFor(100, 0, 200, 100);
    expect(right.ry).toBe(5); expect(right.rx).toBe(0);
    expect(top.rx).toBe(5); // top edge: leans back
    expect(tiltFor(900, -400, 200, 100)).toEqual({ rx: 5, ry: 5 });
    expect(tiltFor(10, 10, 0, 0)).toEqual({ rx: 0, ry: 0 });
  });
});

describe("Oberflächen und schlichte Designs", () => {
  it("die Oberfläche wird geprüft, unbekannte Werte werden flach", () => {
    const p = defaultPrefs();
    expect(sanitizePrefs({ ...p, theme: { ...p.theme, surface: "soft", tilt: true } }).theme).toMatchObject({ surface: "soft", tilt: true });
    expect(sanitizePrefs({ ...p, theme: { ...p.theme, surface: "<script>", tilt: "ja" as unknown as boolean } }).theme).toMatchObject({ surface: "flat", tilt: true });
    expect(sanitizePrefs({}).theme.surface).toBe("glass"); // the standard design is a glass one
    expect(SURFACES).toEqual(["flat", "glass", "clear", "soft", "raised"]);
  });
  it("neue Designs sind lesbar: Text auf der Seitenfarbe und Knopfschrift auf der Hauptfarbe haben genug Kontrast", () => {
    for (const id of ["lavendel", "controller", "nacht", "chrom", "chromhell"]) {
      const p = PRESETS[id];
      expect(p, id).toBeTruthy();
      const text = p.mode === "dark" ? "#e8edf7" : "#0f172a";
      expect(contrast(p.background, text), id + " Text").toBeGreaterThan(7);
      const onPrimary = contrast(p.primary, "#000000") > contrast(p.primary, "#ffffff") ? "#04121a" : "#ffffff";
      expect(contrast(p.primary, onPrimary), id + " Knopf").toBeGreaterThan(3);
      expect(p.atmo?.surface, id).toBeTruthy();
      if (p.atmo?.scene) expect(BG_SCENES.some((x) => x.id === p.atmo!.scene), id + " Szene").toBe(true);
    }
  });
});
