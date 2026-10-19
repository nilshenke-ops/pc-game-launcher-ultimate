import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, sanitizePrefs, withProfileTheme } from "./prefs-core";

describe("profile themes", () => {
  it("lay valid profile colours over the own design and ignore broken ones", () => {
    const own = { ...DEFAULT_THEME, radius: 20 };
    const t1 = withProfileTheme(own, { mode: "light", primary: "#ff0000", accent: "#00ff00", background: "#ffffff", bgScene: "cartoon" });
    expect(t1).toMatchObject({ mode: "light", primary: "#ff0000", background: "#ffffff", bgScene: "cartoon", radius: 20 });
    expect(withProfileTheme(own, { mode: "dark", primary: "red;}body{", accent: "#00ff00", background: "#000000" })).toBe(own);
    expect(withProfileTheme(own, null)).toBe(own);
    expect(withProfileTheme(own, { mode: "dark", primary: "#111111", accent: "#222222", background: "#333333", bgScene: "../x" }).bgScene).toBe(own.bgScene);
  });
  it("the per-device switch is on by default and survives sanitising", () => {
    expect(sanitizePrefs({}).profileThemes).toBe(true);
    expect(sanitizePrefs({ profileThemes: false }).profileThemes).toBe(false);
  });
});
