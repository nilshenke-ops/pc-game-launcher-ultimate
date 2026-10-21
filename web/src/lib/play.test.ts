import { describe, expect, it } from "vitest";
import { baseName, bingoLines, decodeShare, duplicateGames, encodeShare, findGames, generateChallenges, makeBoard, mergeBacklog, sanitizeSharedBingo, sessionFor, type GameStats } from "./play";
import type { LibraryItem } from "./types";

const G = (id: string, x: Partial<LibraryItem> = {}): LibraryItem => ({ id, kind: "game", name: id, source: "exe", target: "", args: "", processNames: [], categories: [], favorite: false, addedAt: "", ...x } as LibraryItem);
const now = Date.parse("2026-10-21T12:00:00Z");
const stats = new Map<string, GameStats>([
  ["hades", { totalMinutes: 600, lastPlayed: "2026-10-20T20:00:00Z", sessions: 12, typicalMinutes: 25 }],
  ["witcher", { totalMinutes: 3000, lastPlayed: "2026-09-01T20:00:00Z", sessions: 30, typicalMinutes: 90 }],
]);

describe("time finder", () => {
  const items = [
    G("hades", { backlog: "playing" }), G("witcher", { backlog: "next", priority: 3 }), G("tetris", { sessionMinutes: 10 }),
    G("unbekannt", { backlog: "backlog" }), G("fertig", { backlog: "completed", sessionMinutes: 5 }), G("alt", { backlogArchived: true, sessionMinutes: 5 }),
    G("doppelt", { duplicateOf: "hades", sessionMinutes: 5 }), G("discord", { kind: "program", sessionMinutes: 5 } as Partial<LibraryItem>),
  ];
  it("own estimate first, otherwise the real median, otherwise unknown", () => {
    expect(sessionFor(G("x", { sessionMinutes: 40 }), stats.get("hades"))).toEqual({ minutes: 40, source: "own" });
    expect(sessionFor(G("x"), stats.get("hades"))).toEqual({ minutes: 25, source: "history" });
    expect(sessionFor(G("x"), undefined)).toBeNull();
  });
  it("only what fits; unknown length separate; finished, archived, merged and programs never", () => {
    const r = findGames(items, stats, { minutes: 30, statuses: [], installedOnly: false, installed: {}, now });
    expect(r.fits.map((s) => s.item.id)).toEqual(["hades", "tetris"]); // witcher (90 min) does not fit into 30
    expect(r.unknown.map((s) => s.item.id)).toEqual(["unbekannt"]);
    const big = findGames(items, stats, { minutes: 120, statuses: [], installedOnly: false, installed: {}, now });
    expect(big.fits[0].item.id).toBe("witcher"); // next + high priority
    expect(big.fits[0].reasons.map((x) => x.key)).toEqual(["history", "status", "prio", "days"]);
    expect(big.fits.find((s) => s.item.id === "tetris")!.reasons.map((x) => x.key)).toEqual(["own", "new"]);
  });
  it("filters by status, installed and days not played", () => {
    expect(findGames(items, stats, { minutes: 120, statuses: ["next"], installedOnly: false, installed: {}, now }).fits.map((s) => s.item.id)).toEqual(["witcher"]);
    expect(findGames(items, stats, { minutes: 120, statuses: [], installedOnly: true, installed: { witcher: false }, now }).fits.map((s) => s.item.id)).not.toContain("witcher");
    expect(findGames(items, stats, { minutes: 120, statuses: [], installedOnly: false, installed: {}, notPlayedDays: 7, now }).fits.map((s) => s.item.id)).toEqual(["witcher", "tetris"]);
  });
});

describe("challenges", () => {
  const ctx = { games: [G("witcher", { backlog: "next" }), G("neu", { backlog: "next" })], stats, nextStages: [{ pathId: "j_p1", title: "100 %", stage: "Alle Sammelobjekte" }], openFinds: [{ id: "j_f1", title: "Truhe" }], now };
  it("generates different ideas, data-based ones name their real source", () => {
    const list = generateChallenges(ctx, 30, { withData: true }, () => 0);
    expect(new Set(list.map((c) => c.text)).size).toBe(list.length);
    const data = list.filter((c) => c.source === "data").map((c) => c.text);
    expect(data).toContain("Spiele wieder einmal witcher – zuletzt vor 49 Tagen");
    expect(data).toContain("Fang neu an – steht bei dir auf „Als Nächstes“");
    expect(data).toContain("Nächste Etappe in „100 %“: Alle Sammelobjekte");
    expect(data).toContain("Offener Fund: Truhe");
    expect(generateChallenges(ctx, 30, { withData: false }).every((c) => c.source === "generic")).toBe(true);
    const short = generateChallenges(ctx, 30, { withData: false, maxMinutes: 15 });
    expect(short.every((c) => !c.minutes || c.minutes <= 15)).toBe(true);
    const first = generateChallenges(ctx, 3, { withData: false });
    expect(generateChallenges(ctx, 30, { withData: false, exclude: first.map((c) => c.text) }).some((c) => first.some((f) => f.text === c.text))).toBe(false);
  });
});

describe("bingo", () => {
  const tasks = Array.from({ length: 30 }, (_, i) => "Aufgabe " + i);
  it("makes a card, keeps the centre free and refuses too few tasks", () => {
    const b = makeBoard(tasks, 5, true, () => 0);
    expect(b).toHaveLength(25);
    expect(b[12].free).toBe(true);
    expect(new Set(b.map((c) => c.text)).size).toBe(25);
    expect(makeBoard(tasks, 4, true)).toHaveLength(16); // even size: no centre
    expect(() => makeBoard(["a", "b", "a"], 3, false)).toThrow(/9 verschiedene Aufgaben \(vorhanden: 2\)/);
  });
  it("detects rows, columns and both diagonals", () => {
    const cells = makeBoard(tasks, 3, false, () => 0);
    expect(bingoLines(cells, 3)).toEqual([]);
    [0, 1, 2].forEach((i) => (cells[i].done = true));
    expect(bingoLines(cells, 3).map((l) => l.kind + l.index)).toEqual(["row0"]);
    [4, 8].forEach((i) => (cells[i].done = true));
    expect(bingoLines(cells, 3).map((l) => l.kind + l.index)).toEqual(["row0", "diag0"]);
    [3, 6].forEach((i) => (cells[i].done = true));
    expect(bingoLines(cells, 3).map((l) => l.kind + l.index)).toEqual(["row0", "col0", "diag0", "diag1"]); // 2, 4, 6 are done too
    cells[2].done = cells[4].done = cells[6].done = true;
    expect(bingoLines(cells, 3).map((l) => l.kind)).toContain("diag");
  });
  it("share link round trip; broken or foreign data is refused", () => {
    const card = { title: "Abend", size: 3, cells: makeBoard(tasks, 3, true), freeCenter: true };
    const back = sanitizeSharedBingo(decodeShare(encodeShare(card)));
    expect(back?.cells.map((c) => c.text)).toEqual(card.cells.map((c) => c.text));
    expect(decodeShare("!!!")).toBeNull();
    expect(sanitizeSharedBingo({ title: "x", size: 3, cells: [] })).toBeNull();
    expect(sanitizeSharedBingo({ title: "x", size: 7, cells: [] })).toBeNull();
    expect(() => encodeShare({ x: "y".repeat(10000) })).toThrow(/Datei/);
    expect(decodeShare<{ t: string }>(encodeShare({ t: "Ümlaut ✓" }))?.t).toBe("Ümlaut ✓");
  });
});

describe("backlog duplicates", () => {
  it("finds the same game twice and merges without losing anything", () => {
    const a = G("a", { name: "Forza Horizon 5 (PC)", backlog: "backlog", priority: 1, categories: ["Rennen"], notes: "Steam" });
    const b = G("b", { name: "Forza Horizon 5 – Premium Edition", backlog: "playing", priority: 3, rating: 4, categories: ["Koop"], notes: "Xbox", sessionMinutes: 30 });
    expect(baseName(a.name)).toBe(baseName(b.name));
    expect(duplicateGames([a, b, G("c", { name: "Hades" })]).map((g) => g.map((x) => x.id))).toEqual([["a", "b"]]);
    expect(duplicateGames([a, { ...b, duplicateOf: "a" }])).toEqual([]);
    expect(mergeBacklog(a, b)).toMatchObject({ backlog: "backlog", priority: 3, rating: 4, categories: ["Rennen", "Koop"], notes: "Steam\nXbox", sessionMinutes: 30 });
    expect(mergeBacklog(G("x"), b).backlog).toBe("playing");
  });
});
