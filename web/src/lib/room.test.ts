import { describe, expect, it } from "vitest";
import { BOX_POOL, boxesLeft, DEFAULT_ROOM, openBox, openNodes, owned, progressOf, sanitizeRoom, TREE, unlockedStyles } from "./room";

const p = (level: number, trophies: number, hours: number) => ({ level, trophies, hours });

describe("progress tree", () => {
  it("opens nodes in order of each branch, only from own data", () => {
    expect([...openNodes(p(1, 0, 0))]).toEqual(["l1"]);
    expect(openNodes(p(5, 3, 21))).toEqual(new Set(["l1", "l3", "l5", "t1", "t3", "h5", "h20"]));
    expect(progressOf({ level: 4, achievements: [{ unlocked: true }, { unlocked: false }, { unlocked: true }], totals: { minutes: 179 } })).toEqual({ level: 4, trophies: 2, hours: 2 });
    expect(unlockedStyles(p(3, 0, 20))).toEqual(new Set(["neon-loft", "cyber-den", "space-station"]));
  });
});

describe("reward boxes", () => {
  it("one per level, none without playing", () => {
    expect(boxesLeft(p(1, 0, 0), DEFAULT_ROOM)).toBe(0);
    expect(openBox(p(1, 0, 0), DEFAULT_ROOM)).toBeNull();
    expect(boxesLeft(p(4, 0, 0), DEFAULT_ROOM)).toBe(3);
  });
  it("never gives an item twice and never a fixed tree reward", () => {
    let s = DEFAULT_ROOM;
    const seen = new Set<string>();
    const lvl = p(100, 0, 0);
    for (let k = 0; k < BOX_POOL.length; k++) {
      const r = openBox(lvl, s, () => 0.999)!;
      expect(seen.has(r.item)).toBe(false);
      expect(TREE.some((n) => n.reward.collectible === r.item)).toBe(false);
      seen.add(r.item); s = r.state;
    }
    expect(openBox(lvl, s)).toBeNull(); // everything collected
    expect(seen.size).toBe(BOX_POOL.length);
  });
  it("owned = open tree rewards + box items", () => {
    const s = { ...DEFAULT_ROOM, fromBoxes: ["cat"] };
    expect(owned(p(1, 1, 0), s).sort()).toEqual(["books", "cat", "plant"]);
  });
});

describe("stored room", () => {
  it("cleans foreign or broken data", () => {
    const s = sanitizeRoom({
      active: "nope", startPage: 1,
      variants: [{ id: "a b<", name: "x\u0000", style: "evil", light: "red", hidden: ["pc", "pc", "x"], decor: [{ id: "cat", x: 500, y: -3 }, { id: "cat", x: 1, y: 1 }, { id: "bomb", x: 1, y: 1 }] }],
      fromBoxes: ["cat", "cat", "plant", "nope"], shelf: ["cat", "cat", "nope"],
    });
    expect(s.variants[0]).toMatchObject({ id: "ab", name: "x", style: "neon-loft", light: "#22d3ee", hidden: ["pc"], decor: [{ id: "cat", x: 96, y: 2 }] });
    expect(s.active).toBe("ab");
    expect(s.startPage).toBe(true);
    expect(s.fromBoxes).toEqual(["cat"]); // tree rewards cannot be claimed as box items
    expect(s.shelf.slice(0, 3)).toEqual(["cat", null, null]);
    expect(s.shelf).toHaveLength(12);
    expect(sanitizeRoom(null).variants).toHaveLength(1);
  });
});
