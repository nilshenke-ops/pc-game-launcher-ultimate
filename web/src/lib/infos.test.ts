import { describe, expect, it } from "vitest";
import { bbcodeToLines, compareFacts, duplicates, editionMatrix, eventState, FACT_KEYS, known, meets, mergeCandidates, patchDigest, recommend, releaseDay, releaseGroups, sortPatch, zonedToUtc, type Candidate } from "./infos";

describe("time zones", () => {
  it("converts a wall-clock time in a named zone to the right instant, also across daylight saving", () => {
    expect(zonedToUtc("2026-07-01T10:00", "America/Los_Angeles")!.toISOString()).toBe("2026-07-01T17:00:00.000Z"); // PDT, UTC-7
    expect(zonedToUtc("2026-12-01T10:00", "America/Los_Angeles")!.toISOString()).toBe("2026-12-01T18:00:00.000Z"); // PST, UTC-8
    expect(zonedToUtc("2026-03-29T03:30", "Europe/Berlin")!.toISOString()).toBe("2026-03-29T01:30:00.000Z"); // first hour of CEST
    expect(zonedToUtc("2026-11-01T19:00", "UTC")!.toISOString()).toBe("2026-11-01T19:00:00.000Z");
  });
  it("gives null instead of guessing", () => {
    expect(zonedToUtc("2026-13-01T10:00", "UTC")).toBeNull();
    expect(zonedToUtc("morgen", "UTC")).toBeNull();
    expect(zonedToUtc("2026-01-01T10:00", "Mars/Olympus")).toBeNull();
    expect(zonedToUtc(null)).toBeNull();
  });
  it("event state never claims an event still runs without an end", () => {
    const s = new Date("2026-01-10T00:00:00Z"), e = new Date("2026-01-20T00:00:00Z");
    expect(eventState(s, e, new Date("2026-01-05T00:00:00Z"))).toBe("upcoming");
    expect(eventState(s, e, new Date("2026-01-15T00:00:00Z"))).toBe("running");
    expect(eventState(s, e, new Date("2026-01-25T00:00:00Z"))).toBe("ended");
    expect(eventState(s, null, new Date("2026-03-25T00:00:00Z"))).toBe("started");
    expect(eventState(null, null)).toBe("unknown");
  });
});

describe("releases", () => {
  it("groups upcoming by month, keeps windows without a day and past ones apart", () => {
    const now = new Date(2026, 9, 27);
    const l = [
      { id: "a", data: { title: "A", date: "2026-11-05", dateStatus: "confirmed" } },
      { id: "b", data: { title: "B", date: "2026-10-28", dateStatus: "unconfirmed" } },
      { id: "c", data: { title: "C", dateStatus: "window", window: "Q1 2027" } },
      { id: "d", data: { title: "D", date: "2026-10-01", dateStatus: "confirmed" } },
      { id: "e", data: { title: "E", date: "2026-10-27", dateStatus: "confirmed" } },
    ];
    const g = releaseGroups(l, now);
    expect(g.months.map(([k, v]) => [k, v.map((x) => x.id)])).toEqual([["2026-10", ["e", "b"]], ["2026-11", ["a"]]]);
    expect(g.undated.map((x) => x.id)).toEqual(["c"]);
    expect(g.past.map((x) => x.id)).toEqual(["d"]);
    expect(releaseDay({ date: "2026-11-05", dateStatus: "window" })).toBeNull();
  });
});

describe("patch notes", () => {
  const steam = "[p]\\[ GAMEPLAY ][/p][list][*][p]Reduced the cooldown of Dash[/p][/*][*][p]Fixed a crash when joining[/p][/*][/list][p]BUG FIXES[/p][list][*][p]Players could fall through the floor[/p][/*][/list][p][url=https://x.example]More info[/url][/p][img]{STEAM_CLAN_IMAGE}/a.png[/img]";
  it("turns Steam BBCode into plain lines without changing the words", () => {
    expect(bbcodeToLines(steam)).toEqual(["[ GAMEPLAY ]", "Reduced the cooldown of Dash", "Fixed a crash when joining", "BUG FIXES", "Players could fall through the floor", "More info"]);
  });
  it("sorts by the developer's headings first, then by keywords", () => {
    const r = sortPatch(steam);
    expect(r.headings).toEqual(["[ GAMEPLAY ]", "BUG FIXES"]);
    expect(r.lines.map((l) => [l.text, l.cat])).toEqual([
      ["Reduced the cooldown of Dash", "gameplay"], ["Fixed a crash when joining", "gameplay"], ["Players could fall through the floor", "fixes"], ["More info", "fixes"],
    ]);
    const plain = sortPatch("- Fixed a crash on start\n- Improved performance on older GPUs\n- Added a new map: Harbor\n- Increased rifle damage by 5%\n- Thanks for playing");
    expect(plain.lines.map((l) => l.cat)).toEqual(["fixes", "technical", "content", "gameplay", "other"]);
  });
  it("short version only uses the original lines", () => {
    const d = patchDigest(sortPatch("Fixed A\nFixed B\nFixed C\nAdded new map").lines);
    expect(d).toEqual([{ cat: "content", count: 1, first: ["Added new map"] }, { cat: "fixes", count: 3, first: ["Fixed A", "Fixed B"] }]);
  });
});

describe("facts", () => {
  it("compares, marks unknown and differences", () => {
    const c = compareFacts([{ title: "A", data: { coop: "yes", crossplay: "no" } }, { title: "B", data: { coop: "yes", crossplay: "yes" } }], FACT_KEYS);
    expect(c.rows.find((r) => r.key === "coop")!.values).toEqual(["yes", "yes"]);
    expect(c.differs).toEqual(["crossplay"]);
    expect(c.allUnknown).toContain("mods");
    expect(known({ coop: "yes", crossplay: "unknown", mods: "no" }, FACT_KEYS)).toEqual({ known: 2, of: FACT_KEYS.length });
    expect(meets({ subtitles: "partial" }, ["subtitles"])).toBe(false);
    expect(meets({ subtitles: "partial" }, ["subtitles"], true)).toBe(true);
  });
});

describe("recommendations", () => {
  const c = (title: string, x: Partial<Candidate>): Candidate => ({ key: title.toLowerCase(), title, feel: [], cats: [], flags: {}, platforms: [], played: false, priceCents: null, where: ["library"], ...x });
  const seed = c("Valheim", { feel: ["Survival", "Koop"], cats: ["Mit Freunden"], flags: { coop: "yes" } });
  const all = [seed,
    c("Grounded", { feel: ["Survival", "Koop"], flags: { coop: "yes" }, platforms: ["PC"], priceCents: 2999 }),
    c("Raft", { feel: ["Survival"], played: true, platforms: ["PC"] }),
    c("Tetris", { feel: ["Puzzle"] }),
    c("Horror X", { feel: ["Survival", "Horror"] }),
  ];
  it("explains every point and leaves out unrelated games", () => {
    const r = recommend(seed, all, { liked: [], disliked: [] });
    expect(r.map((x) => x.c.title)).toEqual(["Grounded", "Horror X", "Raft"]);
    expect(r[0].score).toBe(7);
    expect(r[0].reasons).toEqual([{ text: "Gleiches Spielgefühl: {w}", words: ["Survival", "Koop"] }, { text: "Beide laut Faktencheck: {w}", words: ["Koop"], translate: true }]);
    // Sharing only a play mode is not enough to be suggested.
    expect(recommend(c("A", { flags: { offline: "yes" } }), [c("B", { flags: { offline: "yes" } })], { liked: [], disliked: [] })).toEqual([]);
  });
  it("applies preferences and filters", () => {
    expect(recommend(seed, all, { liked: [], disliked: ["horror"] }).map((x) => x.c.title)).not.toContain("Horror X");
    expect(recommend(seed, all, { liked: [], disliked: [] }, { hidePlayed: true }).map((x) => x.c.title)).not.toContain("Raft");
    expect(recommend(seed, all, { liked: [], disliked: [] }, { platform: "pc" }).map((x) => x.c.title)).toEqual(["Grounded", "Raft"]);
    expect(recommend(seed, all, { liked: [], disliked: [] }, { budgetCents: 1999 }).map((x) => x.c.title)).not.toContain("Grounded");
    const h = recommend(seed, all, { liked: ["Horror"], disliked: [] }).find((x) => x.c.title === "Horror X")!;
    expect(h.score).toBe(5);
    expect(h.reasons.at(-1)).toEqual({ text: "Magst du: {w}", words: ["Horror"] });
  });
  it("merges the same game from several sources", () => {
    const m = mergeCandidates([c("Valheim", { cats: ["A"], where: ["library"] }), c("valheim ", { feel: ["Survival"], flags: { coop: "yes" }, priceCents: 1999, where: ["wish"] })]);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ cats: ["A"], feel: ["Survival"], flags: { coop: "yes" }, priceCents: 1999, where: ["library", "wish"] });
  });
});

describe("editions", () => {
  const rows = [
    { name: "Standard", contents: "Hauptspiel", owned: true },
    { name: "Deluxe", contents: "Hauptspiel, Season Pass, Skin-Paket" },
    { name: "Season Pass", contents: "DLC 1; DLC 2", owned: true },
    { name: "DLC 1", contents: "DLC 1" },
  ];
  it("builds the matrix", () => {
    const m = editionMatrix(rows);
    expect(m.items).toEqual(["Hauptspiel", "Season Pass", "Skin-Paket", "DLC 1", "DLC 2"]);
    expect(m.has[0]).toEqual([true, true, false, false]);
  });
  it("warns before buying something already owned", () => {
    const d = duplicates(rows);
    expect(d.wouldDuplicate).toEqual([
      { row: 1, name: "Deluxe", items: [{ item: "Hauptspiel", via: "Standard" }], all: false },
      { row: 3, name: "DLC 1", items: [{ item: "DLC 1", via: "Season Pass" }], all: true },
    ]);
    expect(duplicates([{ name: "A", contents: "X", owned: true }, { name: "B", contents: "x, Y", owned: true }]).paidTwice).toEqual([{ item: "x", rows: ["A", "B"] }]);
  });
});
