import { describe, expect, it } from "vitest";
import postcss from "postcss";
// @ts-expect-error plain JS plugin
import motionQueries from "../../postcss-motion.mjs";
import { islandProgress, ISLAND_DIMS } from "./island-spring";

const run = async (css: string) => (await postcss([motionQueries()]).process(css, { from: undefined })).css.replace(/\s+/g, " ").trim();

describe("postcss-motion: the system's \"reduce motion\" no longer decides, the app's own switch does", () => {
  it("(prefers-reduced-motion: reduce) becomes :root[data-motion=reduce]", async () => {
    const out = await run("@media (prefers-reduced-motion: reduce) { .a, .b i { animation: none; } }");
    expect(out).not.toContain("prefers-reduced-motion");
    expect(out).toContain(':root[data-motion="reduce"] .a');
    expect(out).toContain(':root[data-motion="reduce"] .b i');
  });
  it("(prefers-reduced-motion: no-preference) becomes :root:not([data-motion=reduce])", async () => {
    const out = await run("@media (prefers-reduced-motion: no-preference) { :root { --x: 1 } .c { animation: m 1s; } }");
    expect(out).not.toContain("prefers-reduced-motion");
    expect(out).toContain(':root:not([data-motion="reduce"]) { --x: 1 }');
    expect(out).toContain(':root:not([data-motion="reduce"]) .c');
  });
  it("selectors that start with :root or html are merged, not doubled", async () => {
    const out = await run('@media (prefers-reduced-motion: reduce) { :root[data-lite="1"] .d, html .e { transition: none } }');
    expect(out).toContain(':root[data-motion="reduce"][data-lite="1"] .d');
    expect(out).toContain(':root[data-motion="reduce"] .e');
  });
  it("other conditions in the same query stay as they were", async () => {
    const out = await run("@media (hover: none), (prefers-reduced-motion: reduce) { .f { transform: none } }");
    expect(out).toContain("@media (hover: none)");
    expect(out).toContain(':root[data-motion="reduce"] .f');
  });
  it("other media queries are untouched", async () => {
    expect(await run("@media (max-width: 600px) { .g { color: red } }")).toBe("@media (max-width: 600px) { .g { color: red } }");
  });
});

describe("islandProgress", () => {
  it("is 0 for the closed island, 1 for the open panel, and stays inside 0…1 while the spring swings past", () => {
    expect(islandProgress(ISLAND_DIMS.notch.h)).toBe(0);
    expect(islandProgress(ISLAND_DIMS.bar.h)).toBe(0);
    expect(islandProgress(ISLAND_DIMS.panel.h)).toBe(1);
    expect(islandProgress(ISLAND_DIMS.panel.h + 30)).toBe(1);
    expect(islandProgress(10)).toBe(0);
    const mid = islandProgress((ISLAND_DIMS.bar.h + ISLAND_DIMS.panel.h) / 2);
    expect(mid).toBeGreaterThan(0.45); expect(mid).toBeLessThan(0.55);
  });
  it("grows with the height (so the content follows the spring in both directions)", () => {
    let last = -1;
    for (let h = 40; h <= 344; h += 8) { const p = islandProgress(h); expect(p).toBeGreaterThanOrEqual(last); last = p; }
  });
});
