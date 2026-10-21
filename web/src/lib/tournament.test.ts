import { describe, expect, it } from "vitest";
import { checkResult, checkSetup, compute, draw, matchesCsv, roundRobinPairs, seedOrder, splitGroups, type TournamentData } from "./tournament";

const T = (format: TournamentData["format"], n: number, extra: Partial<TournamentData> = {}): TournamentData =>
  ({ title: "Test", format, participants: Array.from({ length: n }, (_, i) => `P${i + 1}`), results: {}, ...extra });
/** Plays every ready match with the given rule until nothing is left. */
function playAll(t: TournamentData, pick: (a: string, b: string, id: string) => "a" | "b") {
  for (let guard = 0; guard < 500; guard++) {
    const ready = compute(t).matches.find((m) => m.status === "ready");
    if (!ready) return compute(t);
    t.results[ready.id] = { winner: pick(ready.a!, ready.b!, ready.id) };
  }
  throw new Error("did not finish");
}
const lower = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? "a" : "b");

describe("setup and results are checked", () => {
  it("refuses bad setups", () => {
    expect(() => checkSetup(T("single", 1))).toThrow(/Mindestens 2/);
    expect(() => checkSetup({ ...T("single", 3), participants: ["A", "a", "B"] })).toThrow(/nur einmal/);
    expect(() => checkSetup({ ...T("single", 2), participants: ["A", " "] })).toThrow(/Namen/);
    expect(() => checkSetup(T("double", 2))).toThrow(/mindestens 3/);
    expect(() => checkSetup(T("groups", 5, { groups: 3 }))).toThrow(/mindestens 2 Teilnehmer/);
    expect(() => checkSetup(T("groups", 8, { groups: 2, advance: 5 }))).toThrow(/weiterkommen/);
    expect(() => checkSetup(T("single", 65))).toThrow(/Höchstens 64/);
  });
  it("refuses bad results", () => {
    expect(checkResult({ scoreA: 2, scoreB: 2 }, false)).toMatch(/Unentschieden/);
    expect(checkResult({ scoreA: 2, scoreB: 2, winner: "b" }, false)).toBeNull(); // after overtime
    expect(checkResult({ scoreA: 3, scoreB: 1, winner: "b" }, false)).toMatch(/passt nicht/);
    expect(checkResult({ scoreA: -1, scoreB: 1 }, false)).toMatch(/ganze Zahlen/);
    expect(checkResult({ scoreA: 1.5, scoreB: 1 }, false)).toMatch(/ganze Zahlen/);
    expect(checkResult({ scoreA: 1 }, false)).toMatch(/Beide/);
    expect(checkResult({}, false)).toMatch(/fehlt/);
    expect(checkResult({ draw: true }, true)).toBeNull();
  });
  it("the draw only reorders", () => {
    const d = draw(["A", "B", "C", "D"], () => 0.5);
    expect([...d].sort()).toEqual(["A", "B", "C", "D"]);
  });
});

describe("single elimination", () => {
  it("seeds so that 1 and 2 meet in the final; byes go to the top seeds", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const c = compute(T("single", 6));
    const r1 = c.matches.filter((m) => m.round === 1);
    expect(r1.filter((m) => m.status === "bye").map((m) => m.winner)).toEqual(["P1", "P2"]);
    // The bye winners already stand in round 2; no other round-2 match is ready yet.
    expect(c.matches.find((m) => m.id === "W2-1")).toMatchObject({ a: "P1", b: null, status: "waiting" });
  });
  it("plays through to a champion, with a wrong result reported instead of breaking the bracket", () => {
    const t = T("single", 5);
    const done = playAll(t, lower);
    expect(done.champion).toBe("P1");
    expect(done.matches.filter((m) => m.status === "done")).toHaveLength(4); // n-1 games
    // Results remember who played: change a first-round result and the later games of that player no longer count.
    const t4 = T("single", 4);
    for (const m of [["W1-1", "a"], ["W1-2", "a"]] as const) { const x = compute(t4).matches.find((y) => y.id === m[0])!; t4.results[m[0]] = { winner: m[1], players: [x.a!, x.b!] }; }
    const fin = compute(t4).matches.find((y) => y.id === "W2-1")!;
    t4.results["W2-1"] = { winner: "a", players: [fin.a!, fin.b!] };
    expect(compute(t4).champion).toBe("P1");
    t4.results["W1-1"] = { ...t4.results["W1-1"], winner: "b" }; // P4 beat P1 after all
    const again = compute(t4);
    expect(again.champion).toBeNull();
    expect(again.invalid.map((m) => m.id)).toEqual(["W2-1"]);
    expect(again.matches.find((m) => m.id === "W2-1")).toMatchObject({ a: "P4", b: "P2", status: "ready" });
    // A result for a match whose players are not known yet is never used.
    const t2 = T("single", 8, { results: { "W3-1": { winner: "a" } } });
    const c2 = compute(t2);
    expect(c2.invalid.map((m) => m.id)).toEqual(["W3-1"]);
    expect(c2.champion).toBeNull();
    // A result on a bye is reported.
    expect(compute(T("single", 3, { results: { "W1-1": { winner: "a" } } })).invalid[0].invalid).toMatch(/Freilos/);
  });
  it("works for every size from 2 to 33 (n-1 games, one champion)", () => {
    for (let n = 2; n <= 33; n++) {
      const c = playAll(T("single", n), lower);
      expect(c.champion).toBe("P1");
      expect(c.matches.filter((m) => m.status === "done")).toHaveLength(n - 1);
    }
  });
});

describe("double elimination", () => {
  it("everyone but the champion loses twice; grand final reset only when the losers-bracket winner wins", () => {
    for (let n = 3; n <= 20; n++) {
      const t = T("double", n);
      const c = playAll(t, lower);
      expect(c.champion).toBe("P1");
      const losses = new Map<string, number>();
      for (const m of c.matches) if (m.status === "done" && m.loser) losses.set(m.loser, (losses.get(m.loser) ?? 0) + 1);
      expect(losses.get("P1") ?? 0).toBe(0);
      for (let i = 2; i <= n; i++) expect(losses.get(`P${i}`)).toBe(2);
      expect(c.matches.find((m) => m.id === "F2")!.status).toBe("empty"); // no reset needed
    }
  });
  it("the losers-bracket winner beating the champion forces a second final", () => {
    const t = T("double", 4);
    // P1 wins the winners bracket, P2 comes through the losers bracket and wins F1, then F2 decides.
    const c = playAll(t, (a, b, id) => (id === "F1" ? (a === "P1" ? "b" : "a") : lower(a, b)));
    expect(c.matches.find((m) => m.id === "F1")!.winner).toBe("P2");
    expect(c.matches.find((m) => m.id === "F2")!.status).toBe("done");
    expect(c.champion).toBe("P1"); // won the deciding final (lower number wins)
    const t2 = { ...t, results: { ...t.results, F2: { winner: "a" as const } } }; // F2 is P2 (a) vs P1 (b)
    expect(compute(t2).champion).toBe("P2");
  });
});

describe("round robin and groups", () => {
  it("everyone meets everyone once; odd numbers sit out in turn", () => {
    for (const n of [2, 3, 4, 5, 8]) {
      const pairs = roundRobinPairs(n).flat();
      expect(pairs).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(pairs.map(([a, b]) => [a, b].sort().join("-"))).size).toBe(pairs.length);
    }
  });
  it("table with points, draws allowed, champion only when all games are done", () => {
    const t = T("roundrobin", 3);
    const c0 = compute(t);
    const ids = c0.matches.map((m) => m.id);
    t.results[ids[0]] = { scoreA: 1, scoreB: 1 };
    expect(compute(t).champion).toBeNull();
    const c = playAll(t, lower);
    expect(c.table!.map((s) => s.points).reduce((a, b) => a + b, 0)).toBe(3 + 3 + 2); // one draw (1+1) + two wins
    expect(c.champion).toBe(c.table![0].name);
  });
  it("groups: snake split, knockout only after the groups, group winners meet runners-up", () => {
    expect(splitGroups(["1", "2", "3", "4", "5", "6"], 2)).toEqual([["1", "4", "5"], ["2", "3", "6"]]);
    const t = T("groups", 8, { groups: 2, advance: 2 });
    let c = compute(t);
    expect(c.matches.filter((m) => m.id.startsWith("K")).every((m) => m.status === "waiting" && !m.a)).toBe(true);
    c = playAll(t, lower);
    expect(c.groups!.every((g) => g.done)).toBe(true);
    const semis = c.matches.filter((m) => m.id.startsWith("K1-"));
    expect(semis.map((m) => [m.a, m.b])).toEqual([[c.groups![0].table[0].name, c.groups![1].table[1].name], [c.groups![1].table[0].name, c.groups![0].table[1].name]]);
    expect(c.champion).toBe("P1");
  });
});

it("CSV export neutralises formulas", () => {
  const t = { ...T("single", 2), participants: ["=EVIL()", "Bob"] };
  t.results["W1-1"] = { scoreA: 2, scoreB: 0 };
  expect(matchesCsv(compute(t))).toContain(`"'=EVIL()";Bob;2;0;"'=EVIL()";done`);
});
