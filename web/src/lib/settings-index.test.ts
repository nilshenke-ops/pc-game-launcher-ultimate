import { describe, expect, it } from "vitest";
import { fold, searchSettings, sectionOf, SETTINGS_CATS, SETTINGS_INDEX } from "./settings-index";
import { activePreset, applyPreset, currentPerf, presetChanges, withPerf } from "./settings-presets";
import { defaultPrefs } from "./prefs-core";

const top = (q: string) => searchSettings(q)[0]?.entry.id;
const ids = (q: string) => searchSettings(q).map((h) => h.entry.id);

describe("settings search", () => {
  it("finds a setting by its own words", () => {
    expect(top("Schriftgröße")).toBe("font");
    expect(top("Mit Windows starten")).toBe("autostart");
    expect(top("WLAN")).toBe("lan");
  });
  it("folds umlauts and spelling", () => {
    expect(fold("Größe")).toBe(fold("groesse"));
    expect(top("schriftgroesse")).toBe("font");
  });
  it("matches the beginning of a word", () => {
    expect(ids("schrift")).toContain("font");
  });
  it("understands everyday words (synonyms)", () => {
    expect(ids("dunkel")).toContain("themes");
    expect(top("laggt")).toBe("perf-preset");
    expect(ids("akku")).toContain("lite");
    expect(ids("handy")).toContain("lan");
    expect(ids("mic")).toContain("mic-along");
    expect(ids("kennwort")).toContain("account");
    expect(ids("englisch")).toContain("language");
  });
  it("needs every word to match", () => {
    expect(ids("mikrofon discord")).toContain("mic-along");
    expect(ids("mikrofon xyzunbekannt")).toEqual([]);
  });
  it("returns nothing for empty or one-letter input", () => {
    expect(searchSettings("")).toEqual([]);
    expect(searchSettings("a")).toEqual([]);
  });
  it("every entry has a known category and a route; ids are unique", () => {
    const cats = new Set(SETTINGS_CATS.map((c) => c.id));
    for (const e of SETTINGS_INDEX) { expect(cats.has(e.cat)).toBe(true); expect(e.to.startsWith("/")).toBe(true); }
    expect(new Set(SETTINGS_INDEX.map((e) => e.id)).size).toBe(SETTINGS_INDEX.length);
  });
  it("old section links still land in the right category", () => {
    expect(sectionOf("backup")).toBe("cloud");
    expect(sectionOf("account")).toBe("cloud");
    expect(sectionOf("security")).toBe("privacy");
    expect(sectionOf("design")).toBe("design");
    expect(sectionOf("nonsense")).toBe("general");
    expect(sectionOf(null)).toBe("general");
  });
});

describe("performance presets", () => {
  it("shows only what really changes", () => {
    const p = defaultPrefs();
    const saver = presetChanges(p, "saver");
    expect(saver.map((c) => c.field).sort()).toEqual(["lite", "reduceMotion", "transition"]);
    expect(saver.find((c) => c.field === "lite")).toMatchObject({ from: "aus", to: "an" });
    expect(presetChanges(p, "balanced")).toEqual([]);
    expect(activePreset(p)).toBe("balanced");
  });
  it("applies and undoes without touching anything else", () => {
    const p = defaultPrefs();
    const { next, undo } = applyPreset(p, "max");
    expect(activePreset(next)).toBe("max");
    expect(next.theme.primary).toBe(p.theme.primary);
    expect(next.fx.launch).toEqual(p.fx.launch);
    const back = withPerf(next, undo);
    expect(currentPerf(back)).toEqual(currentPerf(p));
    expect(back.fx).toEqual(p.fx);
    expect({ ...back.theme, lite: undefined, tilt: undefined }).toEqual({ ...p.theme, lite: undefined, tilt: undefined });
  });
});
