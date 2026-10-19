import { describe, expect, it } from "vitest";
import { matches, pickRandom, planImport, sortItems, toCsv, toExport, type PlayStats } from "./backlog";
import type { LibraryItem } from "./types";

const item = (id: string, name: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id, kind: "game", name, source: "steam", target: id, args: "", processNames: [], categories: [], favorite: false, addedAt: "2026-01-01T00:00:00Z", ...extra,
});
const items = [
  item("a", "Hades", { backlog: "next", priority: 3, categories: ["Roguelike"] }),
  item("b", "Celeste", { backlog: "backlog", priority: 1, source: "epic" }),
  item("c", "Portal 2", { backlog: "completed", priority: 0, goalHours: 8 }),
  item("d", "Doom"),
];
const stats = new Map<string, PlayStats>([["a", { totalMinutes: 30, lastPlayed: "2026-10-18T10:00:00Z" }], ["c", { totalMinutes: 720, lastPlayed: "2026-09-01T10:00:00Z" }]]);
const all = { statuses: [], play: "all" as const, search: "" };

describe("backlog", () => {
  it("filters by status, platform, category and play time; games outside the backlog never show", () => {
    expect(items.filter((i) => matches(i, all, stats)).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(items.filter((i) => matches(i, { ...all, statuses: ["next", "backlog"] }, stats)).map((i) => i.id)).toEqual(["a", "b"]);
    expect(items.filter((i) => matches(i, { ...all, source: "epic" }, stats)).map((i) => i.id)).toEqual(["b"]);
    expect(items.filter((i) => matches(i, { ...all, category: "Roguelike" }, stats)).map((i) => i.id)).toEqual(["a"]);
    expect(items.filter((i) => matches(i, { ...all, play: "never" }, stats)).map((i) => i.id)).toEqual(["b"]);
    expect(items.filter((i) => matches(i, { ...all, play: "lt1" }, stats)).map((i) => i.id)).toEqual(["a"]);
    expect(items.filter((i) => matches(i, { ...all, play: "gt10" }, stats)).map((i) => i.id)).toEqual(["c"]);
  });

  it("sorts by priority, play time and last played", () => {
    const b = items.filter((i) => i.backlog);
    expect(sortItems(b, "priority", stats).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(sortItems(b, "playtime", stats).map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(sortItems(b, "lastPlayed", stats).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("random choice is fair, or weighted by priority", () => {
    const pool = [{ id: 1, priority: 0 }, { id: 2, priority: 3 }];
    expect(pickRandom([], true)).toBeNull();
    expect(pickRandom(pool, false, () => 0.49)!.id).toBe(1); // 2 tickets: 1 each
    expect(pickRandom(pool, false, () => 0.51)!.id).toBe(2);
    expect(pickRandom(pool, true, () => 0.19)!.id).toBe(1); // 5 tickets: 1 + 4
    expect(pickRandom(pool, true, () => 0.21)!.id).toBe(2);
    expect(pickRandom(pool, true, () => 0.999999)!.id).toBe(2);
  });

  it("export → import round trip shows changes first and skips unknown games and broken entries", () => {
    const file = toExport(items, new Date("2026-10-19T00:00:00Z"));
    expect(file.entries).toHaveLength(3);
    const here = [item("a", "Hades"), item("x", "celeste", { source: "epic", target: "other" })];
    const plan = planImport({ ...file, entries: [...file.entries, { name: "Bad", source: "steam", target: "z", status: "won", priority: 9 }] }, here);
    expect(plan.matched.map((m) => m.item.id)).toEqual(["a", "x"]); // by launcher+entry, otherwise by name
    expect(plan.matched[0].changes.join(" ")).toContain("Als Nächstes");
    expect(plan.unmatched.map((u) => u.name)).toEqual(["Portal 2"]);
    expect(plan.invalid).toBe(1);
    expect(() => planImport({ format: "other" }, here)).toThrow();
  });

  it("CSV neutralises formulas", () => {
    const csv = toCsv([item("e", "=HYPERLINK(\"x\")", { backlog: "next", notes: "a;b" })], new Map());
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("\"a;b\"");
  });
});

