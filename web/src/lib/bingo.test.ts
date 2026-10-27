import { describe, expect, it } from "vitest";
import { CATALOG, GENRES } from "./bingo-catalog";
import {
  DEFAULT_OPTIONS, DIFFICULTIES, findGame, isBingoRequest, levelPlan, modesFor, NotEnoughTasks, parseLine, parseRequest, pickTasks, poolFor, progress, replaceCell,
  resetCard, resolveOptions, sanitizeAiTasks, sanitizeCard, shuffleCard, standings, status, toCells, toggleCell, type BingoOptions, type Card, type Task,
} from "./bingo";

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const opts = (o: Partial<BingoOptions>): BingoOptions => ({ ...DEFAULT_OPTIONS, ...o });
const card = (size: 3 | 4 | 5, extra: Partial<Card> = {}): Card => ({ title: "T", size, cells: Array.from({ length: size * size }, (_, i) => ({ text: "A" + i, done: false })), ...extra });

describe("catalog", () => {
  it("every built-in line is valid and unique per game", () => {
    for (const g of [...CATALOG, ...Object.values(GENRES)]) {
      const parsed = g.tasks.map((l) => parseLine(l, "catalog"));
      expect(parsed.every(Boolean), (g as { name: string }).name).toBe(true);
      const texts = parsed.map((t) => t!.text.toLowerCase());
      expect(new Set(texts).size, (g as { name: string }).name).toBe(texts.length);
    }
  });
  it("recognises games by their names", () => {
    expect(findGame("Minecraft: Java Edition")?.id).toBe("minecraft");
    expect(findGame("ELDEN RING")?.id).toBe("eldenring");
    expect(findGame("PEAK")?.id).toBe("peak");
    expect(findGame("Peakaboo Island")).toBeNull();
    expect(findGame("Some Unknown Game")).toBeNull();
  });
});

describe("size and difficulty", () => {
  it("level plans always add up to the field count", () => {
    for (const n of [8, 9, 16, 24, 25]) for (const d of DIFFICULTIES) expect(levelPlan(d, n).reduce((a, b) => a + b, 0)).toBe(n);
    expect(levelPlan("mixed", 25)).toEqual([6, 7, 7, 5]);
    expect(levelPlan("easy", 9)[2] + levelPlan("easy", 9)[3]).toBe(0);
    expect(levelPlan("veryhard", 16)[0] + levelPlan("veryhard", 16)[1]).toBe(0);
  });
  it("3×3, 4×4 and 5×5 get exactly 9, 16 and 25 different tasks for all difficulties (Minecraft, Elden Ring, PEAK, unknown game)", () => {
    for (const game of ["Minecraft", "Elden Ring", "PEAK", "Totally Unknown Game"]) for (const size of [3, 4, 5] as const) for (const difficulty of DIFFICULTIES) {
      const pool = poolFor(game).tasks;
      const r = pickTasks(pool, [], opts({ game, size, difficulty }), seeded(size));
      expect(r.tasks).toHaveLength(size * size);
      expect(new Set(r.tasks.map((t) => t.text)).size).toBe(size * size);
      expect(r.tasks.some((t) => t.team)).toBe(false); // alone: no team tasks
      expect(r.tasks.some((t) => t.spoiler)).toBe(false); // no spoilers unless allowed
    }
  });
  it("difficulty really shifts the tasks", () => {
    const pool = poolFor("Minecraft").tasks;
    const avg = (d: BingoOptions["difficulty"]) => { const t = pickTasks(pool, [], opts({ game: "Minecraft", size: 4, difficulty: d }), seeded(3)).tasks; return t.reduce((a, x) => a + x.level, 0) / t.length; };
    expect(avg("easy")).toBeLessThan(avg("medium"));
    expect(avg("medium")).toBeLessThan(avg("hard"));
    expect(avg("hard")).toBeLessThan(avg("veryhard"));
    const easy = pickTasks(pool, [], opts({ game: "Minecraft", size: 3, difficulty: "easy" }), seeded(2)).tasks;
    expect(easy.every((t) => t.level <= 2)).toBe(true);
  });
  it("fits the game: Minecraft, Elden Ring and PEAK tasks come from their own list; unknown games get general tasks", () => {
    expect(poolFor("Minecraft").tasks.map((t) => t.text)).toContain("Finde Diamanten");
    expect(poolFor("Elden Ring").tasks.map((t) => t.text)).toContain("Besiege Margit, das Grausame Omen");
    expect(poolFor("PEAK").tasks.map((t) => t.text)).toContain("Platziere eine Seilrolle für deine Nachfolger");
    const unk = poolFor("Totally Unknown Game");
    expect(unk.from).toBe("genre");
    expect(unk.tasks.some((t) => /diamant|margit/i.test(t.text))).toBe(false);
  });
  it("team tasks only with several players; spoilers only when allowed", () => {
    const pool = poolFor("Minecraft").tasks;
    const two = pickTasks(pool, [], opts({ game: "Minecraft", size: 5, difficulty: "mixed", players: 2, mode: "coop" }), seeded(5)).tasks;
    expect(two.some((t) => t.team)).toBe(true);
    const er = poolFor("Elden Ring").tasks;
    const sp = pickTasks(er, [], opts({ game: "Elden Ring", size: 5, difficulty: "veryhard", spoilers: true }), seeded(9)).tasks;
    expect(sp.some((t) => t.spoiler)).toBe(true);
  });
  it("own tasks: only own, mixed, and too few own tasks is an honest error", () => {
    const own: Task[] = Array.from({ length: 10 }, (_, i) => ({ text: "Eigene Aufgabe " + i, level: 2, category: "fun", source: "own" }));
    expect(() => pickTasks([], own, opts({ size: 4, taskSource: "own" }))).toThrow(NotEnoughTasks);
    const only = pickTasks([], own, opts({ size: 3, taskSource: "own" }), seeded(1)).tasks;
    expect(only.every((t) => t.source === "own")).toBe(true);
    const mix = pickTasks(poolFor("Minecraft").tasks, own, opts({ size: 4, taskSource: "mixed" }), seeded(1)).tasks;
    expect(mix.filter((t) => t.source === "own")).toHaveLength(8);
    expect(mix).toHaveLength(16);
  });
  it("modes only where they make sense", () => {
    expect(modesFor("Stardew Valley", 1)).not.toContain("boss");
    expect(modesFor("Elden Ring", 1)).toContain("boss");
    expect(modesFor("Elden Ring", 1)).not.toContain("coop");
    expect(modesFor("Elden Ring", 2)).toContain("coop");
  });
  it("a free centre only on odd sizes", () => {
    const t = pickTasks(poolFor("Minecraft").tasks, [], opts({ size: 5, freeCenter: true }), seeded(1)).tasks;
    expect(t).toHaveLength(24);
    const cells = toCells(t, 5, true, seeded(1));
    expect(cells).toHaveLength(25);
    expect(cells[12].free).toBe(true);
  });
});

describe("AI answers are checked", () => {
  it("keeps valid tasks, drops junk, never crashes", () => {
    const r = sanitizeAiTasks({ tasks: [{ text: "Finde Diamanten", level: 2, category: "collect" }, { text: "Finde Diamanten" }, { text: "<script>x</script>" }, "Besuche den Nether", { text: "x" }, 42, null, { text: "Baue ein Haus", level: 9, category: "zzz" }] }, "Minecraft");
    expect(r.map((t) => [t.text, t.level, t.category])).toEqual([["Finde Diamanten", 2, "collect"], ["Besuche den Nether", 2, "challenge"], ["Baue ein Haus", 2, "challenge"]]);
    expect(sanitizeAiTasks(null, "x")).toEqual([]);
    expect(sanitizeAiTasks({ tasks: "nope" }, "x")).toEqual([]);
    expect(sanitizeCard({ title: "x", size: 3, cells: [] })).toBeNull();
  });
});

describe("playing", () => {
  it("marks and unmarks fields", () => {
    let c = card(3);
    c = toggleCell(c, 0);
    expect(c.cells[0].done).toBe(true);
    expect(c.cells[0].doneBy).toEqual(["Ich"]);
    expect(status(c)).toBe("running");
    c = toggleCell(c, 0);
    expect(c.cells[0].done).toBe(false);
    expect(status(c)).toBe("new");
  });
  it("finds every row, column and both diagonals on 3×3, 4×4 and 5×5", () => {
    for (const size of [3, 4, 5] as const) {
      const lines = (idx: number[]) => { let c = card(size); for (const i of idx) c = toggleCell(c, i); return progress(c).lines.map((l) => `${l.kind}${l.index}`); };
      for (let r = 0; r < size; r++) expect(lines(Array.from({ length: size }, (_, k) => r * size + k))).toEqual([`row${r}`]);
      for (let col = 0; col < size; col++) expect(lines(Array.from({ length: size }, (_, k) => k * size + col))).toEqual([`col${col}`]);
      expect(lines(Array.from({ length: size }, (_, k) => k * size + k))).toEqual(["diag0"]);
      expect(lines(Array.from({ length: size }, (_, k) => k * size + size - 1 - k))).toEqual(["diag1"]);
      expect(lines(Array.from({ length: size - 1 }, (_, k) => k))).toEqual([]);
    }
  });
  it("progress, completion, reset and shuffle", () => {
    let c = card(3);
    for (let i = 0; i < 9; i++) c = toggleCell(c, i);
    const p = progress(c);
    expect([p.done, p.left, p.percent, p.complete, p.lines.length]).toEqual([9, 0, 100, true, 8]);
    expect(status(c)).toBe("done");
    expect(c.finishedAt).toBeTruthy();
    c = toggleCell(c, 4);
    expect(c.finishedAt).toBeNull();
    const s = shuffleCard(c, seeded(4));
    expect(s.cells.find((x) => x.text === "A4")!.done).toBe(false);
    expect(s.cells.filter((x) => x.done)).toHaveLength(8);
    expect(progress(resetCard(c)).done).toBe(0);
  });
  it("versus: every player marks for themselves, standings compare them", () => {
    let c = card(3, { multi: "versus", players: ["Anna", "Ben"] });
    for (const i of [0, 1, 2]) c = toggleCell(c, i, "Anna");
    c = toggleCell(c, 4, "Ben");
    expect(progress(c, "Anna").lines).toHaveLength(1);
    expect(progress(c, "Ben").done).toBe(1);
    expect(standings(c).map((x) => x.player)).toEqual(["Anna", "Ben"]);
    expect(c.cells[0].doneBy).toEqual(["Anna"]);
  });
  it("replacing a field never brings back a task from the card or the history", () => {
    const pool = poolFor("Minecraft").tasks;
    const tasks = pickTasks(pool, [], opts({ size: 3 }), seeded(1)).tasks;
    let c: Card = { title: "x", size: 3, cells: toCells(tasks, 3, false, seeded(1)) };
    const seen = new Set(c.cells.map((x) => x.text));
    for (let k = 0; k < 10; k++) { const n = replaceCell(c, 0, pool, seeded(k + 2))!; expect(seen.has(n.cells[0].text)).toBe(false); seen.add(n.cells[0].text); c = n; }
    expect(c.history).toHaveLength(10);
  });
});

describe("chat requests", () => {
  const lib = ["Stardew Valley", "Hades"];
  const r = (s: string, prev?: Card) => parseRequest(s, { library: lib, previous: prev ?? null });
  it("understands the examples", () => {
    expect(r("Erstelle ein 3×3-Bingo für Minecraft auf leicht.").options).toMatchObject({ size: 3, game: "Minecraft", difficulty: "easy" });
    expect(r("Mach mir ein 4×4-Bingo für Elden Ring auf schwer.").options).toMatchObject({ size: 4, game: "Elden Ring", difficulty: "hard" });
    expect(r("Erstelle ein 5×5-Bingo für PEAK auf sehr schwer.").options).toMatchObject({ size: 5, game: "PEAK", difficulty: "veryhard" });
    expect(r("Erstelle ein gemischtes Minecraft-Bingo mit einfachen, mittleren und schweren Aufgaben.").options).toMatchObject({ game: "Minecraft", difficulty: "mixed" });
    expect(r("Mach ein Minecraft-Bingo für zwei Spieler.").options).toMatchObject({ game: "Minecraft", players: 2 });
    expect(r("Erstelle ein Bingo für eine Minecraft-Survival-Welt, in der ich noch ganz am Anfang bin.").options).toMatchObject({ game: "Minecraft", beginner: true, difficulty: "easy" });
    expect(r("Erstelle ein Elden-Ring-Bingo für Spieler, die das Spiel bereits durchgespielt haben.").options).toMatchObject({ game: "Elden Ring", expert: true, spoilers: true });
    expect(r("Mach ein lustiges Bingo mit Aufgaben, die bei einem gemeinsamen Gaming-Abend passieren können.")).toMatchObject({ action: "ask" });
    expect(r("Erstelle ein zufälliges Bingo für ein beliebiges Spiel aus meiner Spielebibliothek.")).toMatchObject({ action: "create", randomGame: true });
    expect(r("Erstelle ein 4×4-Bingo für Hollow Knight auf mittel").options).toMatchObject({ game: "Hollow Knight", size: 4, difficulty: "medium" });
    expect(r("Bingo für Stardew Valley").options.game).toBe("Stardew Valley");
  });
  it("works with the previous card", () => {
    const prev: Card = { title: "x", size: 4, gameName: "Minecraft", difficulty: "medium", cells: card(4).cells };
    const harder = r("Mach das vorherige Bingo schwieriger.", prev);
    expect(harder.fromPrevious).toBe("harder");
    const o = resolveOptions(harder, prev, () => null) as BingoOptions;
    expect([o.game, o.size, o.difficulty]).toEqual(["Minecraft", 4, "hard"]);
    const fresh = resolveOptions(r("Erstelle mir ein komplett neues Bingo, ohne Aufgaben aus meinem letzten Bingo zu wiederholen.", prev), prev, () => null) as BingoOptions;
    expect(fresh.exclude).toContain("A0");
    expect(isBingoRequest("mach das vorherige schwieriger", true)).toBe(true);
    expect(isBingoRequest("wie spät ist es")).toBe(false);
    expect(isBingoRequest("Füge das Bingo-Widget zur Startseite hinzu")).toBe(false);
    expect(isBingoRequest("Erstelle ein 5×5-Minecraft-Bingo auf schwer")).toBe(true);
  });
  it("asks when the game is missing and picks from the library when asked to", () => {
    expect(resolveOptions(r("Erstelle ein Bingo"), null, () => null)).toEqual({ error: "Für welches Spiel soll das Bingo sein?" });
    expect((resolveOptions(r("Bingo für ein beliebiges Spiel aus meiner Bibliothek"), null, () => "Hades") as BingoOptions).game).toBe("Hades");
  });
});

describe("bingo for any game, real tasks and no repeats", async () => {
  const b = await import("./bingo");
  it("understands every size and difficulty for any game", () => {
    const cases: [string, string, number, string][] = [
      ["Mach ein Bingo für Hollow Knight auf sehr schwer 5x5", "Hollow Knight", 5, "veryhard"],
      ["Erstelle ein gemischtes 4×4 Bingo für Fortnite", "Fortnite", 4, "mixed"],
      ["3x3 Bingo für Celeste leicht", "Celeste", 3, "easy"],
      ["Bingo für Hades II auf schwer", "Hades Ii", 4, "hard"],
      ["Ein mittleres 4x4-Bingo für Satisfactory", "Satisfactory", 4, "medium"],
    ];
    for (const [q, game, size, d] of cases) {
      const r = b.parseRequest(q, { library: ["Hades II"] });
      expect(r.action, q).toBe("create");
      expect([r.options.game?.toLowerCase(), r.options.size ?? 4, r.options.difficulty ?? "medium"], q).toEqual([game.toLowerCase(), size, d]);
    }
  });
  it("turns Steam achievements into tasks with the difficulty from the unlock rate", () => {
    const t = b.webTasks([
      { name: "Erster Schritt", description: "Schließe das Tutorial ab.", hidden: false, percent: 81.2 },
      { name: "Königsmörder", description: "Besiege den König.", hidden: false, percent: 22.5 },
      { name: "Sammler", description: "Finde alle Muscheln.", hidden: false, percent: 5 },
      { name: "Perfektion", description: "", hidden: false, percent: 1.4 },
      { name: "Geheim", description: "", hidden: true, percent: 9 },
    ]);
    expect(t.map((x) => [x.level, x.text])).toEqual([[1, "Erster Schritt: Schließe das Tutorial ab."], [2, "Königsmörder: Besiege den König."], [3, "Sammler: Finde alle Muscheln."], [4, "Perfektion"], [3, "Versteckter Erfolg „Geheim“"]]);
    expect(t[0].why).toBe("81,2 % aller Steam-Spieler haben diesen Erfolg");
    expect(t[4].spoiler).toBe(true);
    expect(b.levelFromPercent(null)).toBe(2);
  });
  it("a second easy card of the same game uses other tasks while there are enough", () => {
    const o = { ...b.DEFAULT_OPTIONS, game: "Minecraft", size: 3 as const, difficulty: "easy" as const };
    const pool = b.poolFor("Minecraft").tasks;
    const first = b.pickTasks(pool, [], o).tasks.map((x) => x.text);
    const second = b.pickTasks(pool, [], { ...o, avoid: first }).tasks.map((x) => x.text);
    expect(second.filter((x) => first.includes(x))).toEqual([]);
    expect(second.length).toBe(9);
    // Asked for more than there is: repeats are allowed then – and said.
    const tiny = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ text: "Aufgabe " + i, level: 1 as const, category: "fun" as const, source: "catalog" as const }));
    const again = b.pickTasks(tiny, [], { ...o, avoid: tiny.slice(0, 5).map((x) => x.text) });
    expect(again.tasks.length).toBe(9);
    expect(again.notes.some((n) => n.startsWith("4 Aufgaben gab es schon in deinem letzten"))).toBe(true);
    const both = b.pickTasks(tiny, [], { ...o, avoid: tiny.slice(0, 3).map((x) => x.text), avoidOld: tiny.slice(3, 6).map((x) => x.text) }).tasks.map((x) => x.text);
    expect(both.filter((x) => tiny.slice(0, 3).some((y) => y.text === x)).length).toBe(2); // older repeats first, the last card only for the rest
  });
});
describe("bingo without a game", async () => {
  const b = await import("./bingo");
  it("asks for the game instead of taking a time as the name", () => {
    expect(b.parseRequest("Erstelle ein Gaming-Bingo für heute Abend").action).toBe("ask");
    expect(b.parseRequest("Bingo für das Wochenende").action).toBe("ask");
  });
});

describe("genreFromInfo (what Steam/Wikipedia say about a game)", () => {
  it("Make Way → racing, Koop only as last resort, unknown → generic", async () => {
    const { genreFromInfo } = await import("./bingo");
    expect(genreFromInfo({ genres: ["Action", "Gelegenheitsspiele", "Indie", "Rennspiele"], categories: ["Mehrspieler", "Geteilter Bildschirm"] })).toBe("racing");
    expect(genreFromInfo({ genres: ["Action"], description: "Ein Ego-Shooter in einer zerstörten Stadt." })).toBe("shooter");
    expect(genreFromInfo({ genres: ["Simulation"], categories: ["Online-Koop"] })).toBe("coop");
    expect(genreFromInfo({ genres: ["Indie"], categories: [], description: "Ein Puzzle." })).toBe("generic");
    expect(genreFromInfo({ genres: ["Sport"] })).toBe("sports");
    expect(genreFromInfo({ description: "Ein Survival-Horror-Spiel" })).toBe("horror");
  });
});
