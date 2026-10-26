import { describe, expect, it } from "vitest";
import { applyTemplate, FORMATS, hitLayer, History, moveLayer, newDesign, sanitizeDesign, wrapLines, type Layer } from "./design";
import { duplicateCard, sanitizeCard } from "./cards";
import { BADGES, countAll, evaluate, sanitizeCustomBadge } from "./badges";
import { dropMissing, moveItem, newExpo, placeItem, resizeItem, sanitizeExpo } from "./expo";

describe("design", () => {
  it("checks everything from storage: formats, colours, picture ids, layer count", () => {
    const d = sanitizeDesign({ formatId: "cover-steam", w: 99999, background: { kind: "image", c1: "red", imageId: "javascript:alert(1)" },
      layers: [...Array(50)].map(() => ({ type: "text", text: "x\u0007y", color: "#FFAA00", size: 9999 })).concat([{ type: "image", imageId: "http://evil" } as never]) });
    expect([d.w, d.h]).toEqual([600, 900]); // format wins over a forged size
    expect(d.background.c1).toBe("#0f172a");
    expect(d.background.imageId).toBeNull();
    expect(d.layers).toHaveLength(40);
    const t = d.layers[0] as Extract<Layer, { type: "text" }>;
    expect(t.text).toBe("xy"); expect(t.color).toBe("#ffaa00"); expect(t.size).toBe(800);
    expect(sanitizeDesign({ formatId: "nope", w: 10, h: 99999 })).toMatchObject({ formatId: "custom", w: 64, h: 4096 });
  });
  it("every preset says where platform sizes come from", () => {
    for (const f of FORMATS.filter((f) => /youtube|twitch|steam/.test(f.id))) expect(f.note).toMatch(/Steamworks|Ratgebern/);
  });
  it("templates only add layers that fit the canvas", () => {
    const d = applyTemplate(newDesign(FORMATS.find((f) => f.id === "banner-twitch")!), "band");
    expect(d.layers.length).toBe(2);
    for (const l of d.layers) { expect(l.x + l.w).toBeLessThanOrEqual(d.w + 0.5); expect(l.y + l.h).toBeLessThanOrEqual(d.h + 0.5); }
  });
  it("undo and redo", () => {
    const h = new History<{ n: number }>();
    h.push({ n: 1 }); h.push({ n: 2 });
    expect(h.undo({ n: 3 })).toEqual({ n: 2 });
    expect(h.undo({ n: 2 })).toEqual({ n: 1 });
    expect(h.redo({ n: 1 })).toEqual({ n: 2 });
    h.push({ n: 9 });
    expect(h.canRedo).toBe(false);
  });
  it("finds the topmost layer and reorders", () => {
    const a = { id: "a", x: 0, y: 0, w: 100, h: 100 } as Layer, b = { id: "b", x: 50, y: 50, w: 100, h: 100 } as Layer;
    expect(hitLayer([a, b], 60, 60)?.id).toBe("b");
    expect(hitLayer([a, b], 10, 10)?.id).toBe("a");
    expect(hitLayer([a, b], 300, 300)).toBeNull();
    expect(moveLayer([a, b], "b", "bottom").map((l) => l.id)).toEqual(["b", "a"]);
  });
  it("wraps text by measured width", () => {
    expect(wrapLines((s) => s.length * 10, "eins zwei drei vier", 100)).toEqual(["eins zwei", "drei vier"]);
    expect(wrapLines((s) => s.length * 10, "a\nb", 100)).toEqual(["a", "b"]);
  });
});

describe("collector cards", () => {
  it("rarity is only a look and values are checked", () => {
    const c = sanitizeCard({ rarity: "ultra-paid", stats: [...Array(9)].map((_, i) => ({ label: "W" + i, value: "123456789012345678" })), imageId: "x" });
    expect(c.rarity).toBe("common");
    expect(c.stats).toHaveLength(6);
    expect(c.stats[0].value.length).toBe(14);
    expect(c.imageId).toBeNull();
    expect(duplicateCard({ ...c, title: "Drache", favorite: true })).toMatchObject({ title: "Drache (Kopie)", favorite: false });
  });
});

describe("badges", () => {
  const bingo = (done: boolean) => ({ kind: "bingo", data: { title: "B", size: 3, cells: [...Array(9)].map((_, i) => ({ text: String(i), done: done && i < 3 })) } });
  it("are counted only from real entries", () => {
    const counts = countAll([bingo(false), bingo(true), { kind: "design", data: { area: "banner" } }, { kind: "design", data: { area: "poster" } }, { kind: "album", data: {} }, { kind: "find", data: {} }, ...[...Array(9)].map(() => ({ kind: "memory", data: {} }))]);
    expect(counts).toMatchObject({ bingo: 1, banners: 1, posters: 1, collections: 2, notes: 9 });
    const { states, newDates } = evaluate(BADGES, counts, {});
    const st = (id: string) => states.find((s) => s.def.id === id)!;
    expect(st("first-bingo").earned).toBe(true);
    expect(st("ten-notes")).toMatchObject({ earned: false, have: 9 });
    expect(Object.keys(newDates)).toContain("first-bingo");
    expect(newDates["ten-notes"]).toBeUndefined();
  });
  it("a remembered date does not award a badge whose data is gone", () => {
    const { states } = evaluate(BADGES, countAll([]), { "first-card": "2026-01-01T00:00:00Z" });
    expect(states.find((s) => s.def.id === "first-card")).toMatchObject({ earned: false, since: null });
  });
  it("own badges need a known counter and a sensible target", () => {
    expect(sanitizeCustomBadge({ name: "Foto-Profi", counter: "photos", need: 100 }, "c1")).toMatchObject({ custom: true, need: 100 });
    expect(sanitizeCustomBadge({ name: "x", counter: "money", need: 1 }, "c2")).toBeNull();
    expect(sanitizeCustomBadge({ name: "x", counter: "photos", need: 0 }, "c3")).toBeNull();
  });
});

describe("exhibition", () => {
  it("keeps positions on the wall and drops foreign references", () => {
    const e = sanitizeExpo({ rooms: [{ items: [{ ref: "card:j_abcdefgh", x: 99, w: 30 }, { ref: "javascript:x" }, { ref: "photo:j_12345678", w: 500 }] }], template: "evil" });
    expect(e.template).toBe("gallery");
    expect(e.rooms[0].items).toHaveLength(2);
    expect(e.rooms[0].items[0].x).toBe(70);
    expect(e.rooms[0].items[1].w).toBe(80);
  });
  it("places, moves, resizes and cleans up", () => {
    let r = newExpo().rooms[0];
    r = placeItem(placeItem(r, "card:j_aaaaaaaa"), "design:j_bbbbbbbb");
    expect(r.items.map((i) => [i.x, i.y])).toEqual([[4, 8], [28, 8]]);
    r = moveItem(r, r.items[0].id, 95, 120);
    expect([r.items[0].x, r.items[0].y]).toEqual([82, 95]);
    r = resizeItem(r, r.items[0].id, 40);
    expect([r.items[0].w, r.items[0].x]).toEqual([40, 60]);
    const cleaned = dropMissing({ ...newExpo(), rooms: [r] }, (ref) => ref.startsWith("card:"));
    expect(cleaned.rooms[0].items.map((i) => i.ref)).toEqual(["card:j_aaaaaaaa"]);
  });
});
