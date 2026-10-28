import { describe, expect, it } from "vitest";
import { BG_ANIMS, DEFAULT_FX, LAUNCH_STYLES, PRESETS, sanitizeFx, sanitizePrefs } from "./prefs-core";

describe("effects (start animation, moving background, transitions)", () => {
  it("fills in defaults for designs from before 2.27", () => {
    expect(sanitizePrefs({ version: 1, theme: {} }).fx).toEqual(DEFAULT_FX);
    expect(sanitizeFx(null)).toEqual(DEFAULT_FX);
  });
  it("clamps numbers and rejects unknown kinds and control characters", () => {
    const f = sanitizeFx({ launch: { enabled: false, style: "<script>", seconds: 99, fast: 1, tagline: "Los\u0000\n geht's" + "x".repeat(200) }, bg: { kind: "fire!", speed: -5, amount: 9, opacity: 0 }, transition: { kind: "spin", ms: 5 } });
    expect(f.launch).toMatchObject({ enabled: false, style: "neon-portal", seconds: 8, fast: true });
    expect(f.launch.tagline).not.toMatch(/[\u0000-\u001f]/);
    expect(f.launch.tagline.length).toBeLessThanOrEqual(60);
    expect(f.bg).toEqual({ kind: "none", speed: 0.25, amount: 1, opacity: 0.1 });
    expect(f.transition).toEqual({ kind: "fade", ms: 100 });
  });
  it("has the eight loading-screen templates and valid atmospheres", () => {
    expect(LAUNCH_STYLES.map((s) => s.id)).toEqual(["neon-portal", "cyberpunk", "space", "minimal", "glitch", "energy", "galaxy", "hologram"]);
    const atmos = Object.values(PRESETS).filter((p) => p.atmo);
    expect(atmos.map((p) => p.name)).toEqual(expect.arrayContaining(["Cyberpunk", "Neon", "Space", "Ice", "Fire", "Fantasy", "Retro Arcade", "Minimal Dark", "Glass", "Schwarz-Weiß", "Minecraft", "Purple Gaming", "Blue Gaming"]));
    for (const p of atmos) {
      expect(BG_ANIMS.some((b) => b.id === p.atmo!.bg)).toBe(true);
      expect(LAUNCH_STYLES.some((s) => s.id === p.atmo!.launch)).toBe(true);
    }
  });
});

import { bands } from "./audio-bands";

describe("music visualizer", () => {
  it("bars come only from the analyser data: silence stays flat", () => {
    expect(bands(new Uint8Array(256), 24).every((x) => x === 0)).toBe(true);
    const loud = bands(new Uint8Array(256).fill(255), 24);
    expect(loud).toHaveLength(24);
    expect(loud.every((x) => x === 1)).toBe(true);
    const bass = new Uint8Array(256); bass.fill(255, 0, 4);
    const b = bands(bass, 24);
    expect(b[0]).toBe(1);
    expect(b[23]).toBe(0);
  });
});
