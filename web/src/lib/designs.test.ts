import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BG_SCENES, DEFAULT_PRESET, DEFAULT_THEME, defaultPrefs, HOME_VARIANT, homeVariant, LEGACY_PRESETS, lookOf, PRESETS, sanitizePrefs } from "./prefs-core";

describe("Die fünf Designs", () => {
  it("genau fünf, das Lavendel-Glas ist der Standard", () => {
    expect(Object.keys(PRESETS)).toEqual(["lavendel", "controller", "nacht", "chrom", "chromhell"]);
    expect(DEFAULT_PRESET).toBe("lavendel");
    expect(DEFAULT_THEME).toMatchObject({ preset: "lavendel", surface: "glass", bgScene: "h-lavendel" });
    expect(defaultPrefs().theme.preset).toBe("lavendel");
  });
  it("jedes Design hat eine Startseiten-Variante, eine Glas-Oberfläche und eine vorhandene Hintergrundgrafik", () => {
    for (const id of Object.keys(PRESETS)) {
      expect(HOME_VARIANT[id], id).toBeTruthy();
      expect(PRESETS[id].atmo?.surface, id).toBe("glass");
      const scene = PRESETS[id].atmo!.scene!;
      expect(BG_SCENES.some((s) => s.id === scene), id).toBe(true);
      expect(existsSync(new URL(`../../public/backgrounds/${scene}.svg`, import.meta.url)), scene).toBe(true);
    }
    expect(homeVariant("custom")).toBe("glass"); // own colours keep the glass home screen
  });
  it("die Farben und das Aussehen eines Designs setzt lookOf in einem Zug; Unbekanntes wird zum Standard", () => {
    expect(lookOf("chromhell")).toMatchObject({ preset: "chromhell", mode: "light", surface: "glass", bgScene: "h-chromhell" });
    expect(lookOf("gibt-es-nicht").preset).toBe("lavendel");
  });
  it("ein gespeichertes Design aus früheren Versionen wird einmal durch den Standard ersetzt; Schriftgröße und Bewegung bleiben", () => {
    expect(LEGACY_PRESETS.has("neon") && LEGACY_PRESETS.has("applelight")).toBe(true);
    const old = sanitizePrefs({ theme: { preset: "neon", mode: "dark", primary: "#22d3ee", accent: "#a78bfa", background: "#070b16", fontScale: 1.2, reduceMotion: true, surface: "flat", bgScene: "d-chrome" }, fx: { bg: { kind: "particles" } } });
    expect(old.theme).toMatchObject({ preset: "lavendel", surface: "glass", bgScene: "h-lavendel", fontScale: 1.2, reduceMotion: true });
    expect(old.fx.bg.kind).toBe("none");
  });
  it("eigene Farben (custom) und gewählte neue Designs bleiben, wie sie sind", () => {
    const own = sanitizePrefs({ theme: { preset: "custom", mode: "light", primary: "#112233", accent: "#445566", background: "#eef2f7", surface: "flat" } });
    expect(own.theme).toMatchObject({ preset: "custom", primary: "#112233", surface: "flat", bgScene: null });
    expect(sanitizePrefs({ theme: { ...lookOf("nacht") } }).theme).toMatchObject({ preset: "nacht", bgScene: "h-nacht" });
  });
});
