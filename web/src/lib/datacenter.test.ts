import { describe, expect, it } from "vitest";
import { groupOf, kindsFor, printFields, toCsv } from "./datacenter";
import type { Entry } from "./journal";

const e = (id: string, data: object): Entry => ({ id, kind: "wiki", updatedAt: Date.UTC(2026, 0, 2), data });

describe("data center", () => {
  it("puts every kind into one area", () => {
    expect(groupOf("wiki")).toBe("games");
    expect(groupOf("bingo")).toBe("together");
    expect(groupOf("neu")).toBe("other");
    expect(kindsFor(["games", "other"], ["wiki", "bingo", "neu"])).toEqual(["wiki", "neu"]);
  });
  it("writes CSV that spreadsheets cannot run as formulas", () => {
    const csv = toCsv([e("j_aaaaaaaa", { title: "A; B", tags: ["x", "y"], n: 3 }), e("j_bbbbbbbb", { title: "=HYPERLINK(1)", body: 'Er sagte "hi"\nneu' })]);
    const lines = csv.slice(1).split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines[0]).toBe("id;updatedAt;title;body;n;tags");
    expect(lines[1]).toBe('j_aaaaaaaa;2026-01-02T00:00:00.000Z;"A; B";;3;"x; y"');
    expect(lines[2]).toBe(`j_bbbbbbbb;2026-01-02T00:00:00.000Z;'=HYPERLINK(1);"Er sagte ""hi""\nneu";;`);
  });
  it("prints readable fields only", () => {
    expect(printFields(e("j_aaaaaaaa", { title: "T", body: "Text", imageIds: ["img_1"], gameId: "x", tags: ["a"], links: ["j_cccccccc"], at: 1 }))).toEqual([["body", "Text"], ["tags", "a"], ["at", "1"]]);
  });
});
