import { describe, expect, it } from "vitest";
import { commandFor, gridFor, moveKey, resize, slots, starterDeck, textOn, type Deck, type DeckPage } from "./deck";
import type { LibraryItem, Profile } from "./types";

const page: DeckPage = { id: "p", name: "P", keys: [
  { id: "a", slot: 0, action: { type: "none" } }, { id: "b", slot: 1, action: { type: "none" } }, { id: "c", slot: 11, action: { type: "none" } },
] };

describe("deck", () => {
  it("landscape swaps columns and rows, keys keep their order", () => {
    expect(gridFor({ cols: 3, rows: 5 }, false)).toEqual({ cols: 3, rows: 5 });
    expect(gridFor({ cols: 3, rows: 5 }, true)).toEqual({ cols: 5, rows: 3 });
    const s = slots(page, 3, 4);
    expect(s).toHaveLength(12);
    expect(s[0]!.id).toBe("a");
    expect(s[11]!.id).toBe("c");
  });

  it("every key runs an existing command – navigation keys run none", () => {
    expect(commandFor({ type: "launch", ref: "x" })).toEqual({ method: "library.launch", params: { id: "x" } });
    expect(commandFor({ type: "media", ref: "volup" })).toEqual({ method: "media.key", params: { key: "volup" } });
    expect(commandFor({ type: "folder", ref: "p2" })).toBeNull();
    expect(commandFor({ type: "open", ref: "/" })).toBeNull();
  });

  it("moving swaps with a key on the target place", () => {
    const m = moveKey(page, "a", 1);
    expect(m.keys.find((k) => k.id === "a")!.slot).toBe(1);
    expect(m.keys.find((k) => k.id === "b")!.slot).toBe(0);
    expect(moveKey(page, "a", 5).keys.find((k) => k.id === "a")!.slot).toBe(5);
  });

  it("a smaller grid moves keys into free places and reports what does not fit", () => {
    const d: Deck = { id: "d", name: "D", cols: 3, rows: 4, pages: [page] };
    const r = resize(d, 2, 2);
    expect(r.dropped).toBe(0);
    expect(r.deck.pages[0].keys.map((k) => k.slot).sort()).toEqual([0, 1, 2]);
    const full: DeckPage = { id: "f", name: "F", keys: Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, slot: i, action: { type: "none" as const } })) };
    expect(resize({ ...d, pages: [full] }, 2, 2).dropped).toBe(2);
  });

  it("the starter deck only uses own items and stays inside the grid with valid folders", () => {
    const items = [{ id: "g1", kind: "game", name: "Hades", favorite: true, categories: [], coverUrl: "https://x/y.jpg" } as unknown as LibraryItem];
    const profiles = [{ id: "prof_general", name: "Allgemein", icon: "monitor", color: "#22d3ee" } as unknown as Profile];
    const d = starterDeck(items, [], [], profiles);
    const ids = new Set(d.pages.map((p) => p.id));
    for (const p of d.pages) {
      expect(new Set(p.keys.map((k) => k.slot)).size).toBe(p.keys.length);
      for (const k of p.keys) {
        expect(k.slot).toBeLessThan(d.cols * d.rows);
        if (k.action.type === "folder") expect(ids.has(k.action.ref!)).toBe(true);
      }
    }
    expect(d.pages[0].keys[0]).toMatchObject({ icon: "cover", action: { type: "launch", ref: "g1" } });
  });

  it("text colour stays readable", () => {
    expect(textOn("#ffffff")).toBe("#04121a");
    expect(textOn("#0b1220")).toBe("#ffffff");
    expect(textOn(null)).toBe("#ffffff");
  });
});
