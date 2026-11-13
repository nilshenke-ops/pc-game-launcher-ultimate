import { describe, expect, it } from "vitest";
import { ACCENTS, BRAND_COLORS, BRAND_LABEL, isAccent, isEffect, resolveAccent } from "./island-theme";

describe("island colours", () => {
  it("picks the chosen colour, the app's colour on auto, else the song's", () => {
    expect(resolveAccent("default", "discord", "#123456")).toBeNull();
    expect(resolveAccent("#F9A8D4", "discord", null)).toBe("#f9a8d4");
    expect(resolveAccent("auto", "discord", "#123456")).toBe("#5865f2");
    expect(resolveAccent("auto", "browser", "#123456")).toBe("#123456");
    expect(resolveAccent("auto", null, null)).toBeNull();
    expect(resolveAccent("javascript:alert(1)", null, null)).toBeNull();
  });
  it("checks what comes from the PC", () => {
    expect(isAccent("auto")).toBe(true);
    expect(isAccent("#abc")).toBe(false);
    expect(isEffect("sakura")).toBe(true);
    expect(isEffect("feuer")).toBe(false);
    expect(ACCENTS.every((a) => isAccent(a.id))).toBe(true);
    expect(Object.keys(BRAND_COLORS).every((k) => BRAND_LABEL[k])).toBe(true);
  });
});
