import { describe, expect, it } from "vitest";
import { blank, compareRows, distance, entriesCsv, markerPos, materialProgress, netherToOverworld, overworldToNether, rowsCsv, taskProgress, validate } from "./collections";
import { BUILD, CONTROLS, GFX, MODLIST, PROJECT, WORLD } from "./collection-schemas";

describe("schema checks", () => {
  it("required fields, numbers, selects, urls and rows are checked cell by cell", () => {
    const w = { ...blank(WORLD), title: "" };
    expect(validate(WORLD, w).map((e) => e.key)).toEqual(["title"]);
    const ok = { ...blank(WORLD), title: "Survival 2026", pois: [{ name: "Basis", dim: "overworld", x: 100, y: 64, z: -200 }] };
    expect(validate(WORLD, ok)).toEqual([]);
    const bad = { ...ok, edition: "ps5", pois: [{ name: "", dim: "overworld", x: 1.5, z: 99999999 }] };
    const errs = validate(WORLD, bad);
    expect(errs.find((e) => e.key === "edition")?.message).toMatch(/ungültige Auswahl/);
    expect(errs.filter((e) => e.row === 0).map((e) => e.col).sort()).toEqual(["name", "x", "z"]);
    expect(validate(BUILD, { ...blank(BUILD), title: "x", source: "javascript:alert(1)" }).map((e) => e.key)).toEqual(["source"]);
    expect(validate(GFX, { ...blank(GFX), title: "x" }).map((e) => e.key)).toEqual(["imageA", "imageB"]);
    expect(validate(MODLIST, { ...blank(MODLIST), title: "Pack", mods: Array.from({ length: 1001 }, () => ({ name: "m", status: "planned" })) }).some((e) => /höchstens 1000/.test(e.message.replace("{n}", "1000")))).toBe(true);
  });
  it("controls: “official” only with a source", () => {
    const d = { ...blank(CONTROLS), title: "Pad", game: { gameName: "Elden Ring" }, entries: [{ action: "Springen", input: "A", device: "pad", origin: "official" }, { action: "Rollen", input: "B", device: "pad", origin: "own" }] };
    expect(validate(CONTROLS, d).map((e) => [e.row, e.col])).toEqual([[0, "source"]]);
    d.entries[0] = { ...d.entries[0], source: "https://example.com/manual" } as never;
    expect(validate(CONTROLS, d)).toEqual([]);
    expect(validate(CONTROLS, { ...d, game: { gameId: null, gameName: " " } }).map((e) => e.key)).toEqual(["game"]);
  });
});

describe("world and project tools", () => {
  it("Nether ↔ Overworld uses the game's factor 8", () => {
    expect(overworldToNether({ x: 803, y: 70, z: -1601 })).toEqual({ x: 100, y: 70, z: -201 });
    expect(netherToOverworld({ x: 100, y: 70, z: -200 })).toEqual({ x: 800, y: 70, z: -1600 });
    expect(distance({ x: 0, y: 64, z: 0 }, { x: 30, y: 64, z: 40 })).toEqual({ blocks: 50, withY: true });
    expect(distance({ x: 803, y: 70, z: -1601 }, { x: 833, z: -1561 })).toEqual({ blocks: 50, withY: false }); // no height → horizontal only
  });
  it("progress comes only from tasks; materials separately", () => {
    expect(taskProgress([{ done: true }, {}, { done: true }, {}])).toEqual({ total: 4, done: 2, percent: 50 });
    expect(taskProgress([])).toEqual({ total: 0, done: 0, percent: 0 });
    const m = materialProgress([{ needed: 64, have: 80 }, { needed: 36, have: 0 }]);
    expect(m).toMatchObject({ need: 100, have: 64, percent: 64 });
    expect(m.missing).toHaveLength(1);
    expect(validate(PROJECT, { ...blank(PROJECT), title: "Burg", materials: [{ item: "Stein", needed: -1 }] }).map((e) => e.col)).toEqual(["needed"]);
  });
});

describe("compare, markers, csv", () => {
  it("compares two builds property by property", () => {
    expect(compareRows([{ name: "Waffe", value: "Bogen" }, { name: "Rüstung", value: "Leder" }], [{ name: "waffe", value: "Schwert" }, { name: "Rüstung", value: "Leder" }, { name: "Ring", value: "Feuer" }]))
      .toEqual([{ name: "Waffe", a: "Bogen", b: "Schwert", state: "diff" }, { name: "Rüstung", a: "Leder", b: "Leder", state: "same" }, { name: "Ring", a: null, b: "Feuer", state: "only" }]);
  });
  it("marker position is relative to the own map picture; outside is ignored", () => {
    expect(markerPos(150, 100, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ px: 0.25, py: 0.5 });
    expect(markerPos(10, 10, { left: 100, top: 50, width: 200, height: 100 })).toBeNull();
  });
  it("CSV neutralises formulas and quotes separators", () => {
    const poi = WORLD.fields.find((f) => f.key === "pois")!;
    const csv = rowsCsv(poi, [{ name: "=HYPERLINK(1)", dim: "nether", x: 1, y: 2, z: 3, note: "a;b" }]);
    expect(csv).toContain(`"'=HYPERLINK(1)";Nether;1;2;3;;"a;b"`);
    expect(entriesCsv(WORLD, [{ title: "W", edition: "java", mode: "survival", tags: ["a", "b"] }]).split("\r\n")[1]).toBe("W;Java;;Überleben;;;;a, b");
  });
});
