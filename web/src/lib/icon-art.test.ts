import { describe, expect, it } from "vitest";
import { cleanSymbol, DEFAULT_ICON, iconSize, sanitizeIcon } from "./icon-art";

describe("icon workshop", () => {
  it("keeps at most 3 visible characters, emoji count as one", () => {
    expect(cleanSymbol("  Rocket League ")).toBe("Roc");
    expect(cleanSymbol("👨‍👩‍👧🎮x y")).toBe("👨‍👩‍👧🎮x");
    expect(cleanSymbol("a\u0000b")).toBe("ab");
    expect(cleanSymbol(42)).toBe("");
  });
  it("rejects unknown values and clamps numbers", () => {
    const s = sanitizeIcon({ format: "svg", shape: "star", c1: "red", angle: 999, pattern: "<x>", border: -4, zoom: 9, title: "x".repeat(99), glow: false });
    expect(s).toMatchObject({ format: "icon", shape: "rounded", c1: DEFAULT_ICON.c1, angle: 360, pattern: "none", border: 0, zoom: 2, glow: false });
    expect(s.title).toHaveLength(32);
    expect(iconSize("cover")).toEqual({ w: 600, h: 900 });
  });
});
