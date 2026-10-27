import { describe, expect, it } from "vitest";
import { bestPrice, chartPoints, filterWishes, sortWishes, targetReached } from "./wishlist";

const w = (id: string, x: object) => ({ id, title: id, ...x });
const list = [
  w("Alpha", { kind: "game", priority: 2, categories: ["Koop"], finalCents: 1999, msFinalCents: 2499, targetCents: 2000, addedAt: "2026-01-01" }),
  w("Beta DLC", { kind: "dlc", priority: 0, categories: ["Story"], finalCents: 999, addedAt: "2026-03-01" }),
  w("Gamma", { kind: "game", priority: 1, addedAt: "2026-02-01" }),
];

describe("wish list", () => {
  it("uses only measured prices", () => {
    expect(bestPrice(list[0])).toBe(1999);
    expect(bestPrice(list[2])).toBeNull();
    expect(targetReached(list[0])).toBe(true);
    expect(targetReached(list[2])).toBe(false);
  });
  it("filters by kind, priority, category and price limit, counting entries without a price", () => {
    expect(filterWishes(list, { kind: "dlc" }).shown.map((x) => x.id)).toEqual(["Beta DLC"]);
    expect(filterWishes(list, { priority: 2 }).shown.map((x) => x.id)).toEqual(["Alpha"]);
    expect(filterWishes(list, { category: "koop" }).shown.map((x) => x.id)).toEqual(["Alpha"]);
    expect(filterWishes(list, { maxCents: 1500 })).toEqual({ shown: [list[1]], withoutPrice: 1 });
    expect(filterWishes(list, { onlyTarget: true }).shown.map((x) => x.id)).toEqual(["Alpha"]);
  });
  it("sorts", () => {
    expect(sortWishes(list, "priority").map((x) => x.id)).toEqual(["Alpha", "Gamma", "Beta DLC"]);
    expect(sortWishes(list, "price").map((x) => x.id)).toEqual(["Beta DLC", "Alpha", "Gamma"]);
    expect(sortWishes(list, "added").map((x) => x.id)).toEqual(["Beta DLC", "Gamma", "Alpha"]);
  });
  it("chart needs two dated measurements", () => {
    expect(chartPoints([{ at: "2026-01-01T00:00:00Z", final: 1000 }])).toBeNull();
    const c = chartPoints([{ at: "2026-01-03T00:00:00Z", final: 500, initial: 1000 }, { at: "2026-01-01T00:00:00Z", final: 1000, initial: 1000 }])!;
    expect(c.points.map((p) => [p.x, p.y])).toEqual([[0, 1], [1, 0]]);
    expect([c.min, c.max]).toEqual([500, 1000]);
  });
});
