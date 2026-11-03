import { describe, expect, it } from "vitest";
import { sortLibrary } from "./library-sort";

const g = (id: string, name: string, extra: Partial<{ favorite: boolean; rating: number; addedAt: string }> = {}) => ({ id, name, addedAt: "2026-01-01T00:00:00Z", ...extra });
const games = [g("a", "Anno"), g("b", "Bioshock", { rating: 5 }), g("c", "Celeste", { rating: 3, addedAt: "2026-06-01T00:00:00Z" }), g("d", "Doom", { favorite: true, addedAt: "2026-03-01T00:00:00Z" })];
const ids = (l: { id: string }[]) => l.map((x) => x.id).join("");

describe("Spielebibliothek sortieren", () => {
  it("A–Z, Favoriten immer zuerst", () => expect(ids(sortLibrary(games, "name", new Map()))).toBe("dabc"));
  it("Zuletzt: das zuletzt Gestartete zuerst, nie Gestartetes hinten (dann nach Name)", () => {
    const last = new Map([["c", 300], ["a", 100], ["b", 200]]);
    expect(ids(sortLibrary(games, "recent", last))).toBe("dcba");
    expect(ids(sortLibrary(games, "recent", new Map([["b", 5]])))).toBe("dbac");
  });
  it("Bewertung: beste zuerst, ohne Bewertung hinten", () => expect(ids(sortLibrary(games, "rating", new Map()))).toBe("dbca"));
  it("Hinzugefügt: neueste zuerst", () => expect(ids(sortLibrary(games, "added", new Map()))).toBe("dcab"));
  it("ändert die übergebene Liste nicht", () => { const copy = [...games]; sortLibrary(games, "recent", new Map([["c", 1]])); expect(games).toEqual(copy); });
});
