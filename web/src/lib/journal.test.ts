import { describe, expect, it, vi } from "vitest";
import {
  backlinks, duplicateGroups, filterFinds, memorySummary, mergePages, pathProgress, resolveLink, spoilerFree, splitWiki, withVersion, wikiLinks,
  type Find, type GoalPath, type Memory, type Story, type WikiPage,
} from "./journal-logic";
import type { Entry } from "./journal";

const E = <T,>(id: string, kind: string, data: T, updatedAt = 1): Entry<T> => ({ id, kind, updatedAt, data });

describe("game memory", () => {
  const list = [
    E<Memory>("j_m1", "memory", { gameId: "g1", at: "2026-10-01T18:00:00Z", did: "Tutorial", where: "Startinsel", next: "Boot bauen" }),
    E<Memory>("j_m2", "memory", { gameId: "g1", at: "2026-10-05T18:00:00Z", did: "Höhle erkundet" }),
    E<Memory>("j_m3", "memory", { gameName: "Hades", at: "2026-10-03T18:00:00Z", did: "Run 4" }),
  ];
  it("summarises only what was written down, newest first", () => {
    const s = memorySummary(list, { gameId: "g1" })!;
    expect(s.count).toBe(2);
    expect(s.lastDid).toBe("Höhle erkundet");
    expect(s.where).toBe("Startinsel"); // newest entry without a place → the last one that has one
    expect(s.next).toBe("Boot bauen");
    expect(s.latestId).toBe("j_m2");
    expect(memorySummary(list, { gameName: " hades " })!.count).toBe(1); // games outside the library by name
    expect(memorySummary(list, { gameId: "nope" })).toBeNull();
  });
});

describe("goal path", () => {
  it("progress comes from the stages", () => {
    const p: GoalPath = { title: "x", stages: [{ id: "a", title: "A", done: true }, { id: "b", title: "B", milestone: true }, { id: "c", title: "C", milestone: true, done: true }] };
    expect(pathProgress(p)).toMatchObject({ total: 3, done: 2, percent: 67, milestones: 2, milestonesDone: 1, complete: false });
    expect(pathProgress(p).next?.id).toBe("b");
    expect(pathProgress({ title: "leer", stages: [] })).toMatchObject({ percent: 0, complete: false });
  });
});

describe("finds", () => {
  const list = [
    E<Find>("j_f1", "find", { title: "Truhe", category: "secret", status: "open", tags: ["Nether"], gameId: "g1", favorite: true }, 3),
    E<Find>("j_f2", "find", { title: "Amulett", category: "item", status: "done", tags: ["nether", "Boss"], gameId: "g1", notes: "beim Wächter" }, 2),
    E<Find>("j_f3", "find", { title: "Brücke", category: "place", status: "found", tags: [], gameName: "Elden Ring" }, 1),
  ];
  it("searches in all fields, filters and sorts", () => {
    expect(filterFinds(list, { q: "wächter" }).map((e) => e.id)).toEqual(["j_f2"]);
    expect(filterFinds(list, { tag: "NETHER" }).map((e) => e.id)).toEqual(["j_f1", "j_f2"]);
    expect(filterFinds(list, { favorite: true }).map((e) => e.id)).toEqual(["j_f1"]);
    expect(filterFinds(list, { game: { gameName: "elden ring" } }).map((e) => e.id)).toEqual(["j_f3"]);
    expect(filterFinds(list, {}, "title").map((e) => e.data.title)).toEqual(["Amulett", "Brücke", "Truhe"]);
    expect(filterFinds(list, {}, "status").map((e) => e.data.status)).toEqual(["open", "found", "done"]);
    expect(filterFinds([], { q: "x" })).toEqual([]);
  });
});

describe("story without spoilers", () => {
  const s: Story = {
    title: "S", progressId: "c2",
    chapters: [{ id: "c1", title: "Anfang" }, { id: "c2", title: "Verrat", spoiler: true }, { id: "c3", title: "Ende" }],
    characters: [{ id: "p1", name: "Mira", chapterId: "c1" }, { id: "p2", name: "Der Kaiser", chapterId: "c3" }, { id: "p3", name: "X", spoiler: true }],
    questions: [{ id: "q1", text: "Wer ist der Mörder?", answer: "Der Gärtner" }, { id: "q2", text: "Wo ist das Schwert?", answer: "Im See", answered: true }],
  };
  it("hides what lies after the progress marker and what is marked as spoiler", () => {
    const v = spoilerFree(s);
    expect(v.chapters.map((c) => c.hidden)).toEqual([null, "spoiler", "ahead"]);
    expect(v.characters.map((c) => c.hidden)).toEqual([null, "ahead", "spoiler"]);
    expect(v.questions.map((q) => q.answerHidden)).toEqual([true, false]); // an answer to an open question is a spoiler
    expect(v.hiddenCount).toBe(4);
    expect(spoilerFree({ ...s, progressId: null }).chapters.every((c) => c.hidden)).toBe(true);
  });
});

describe("wiki", () => {
  const pages = [
    E<WikiPage>("j_w1", "wiki", { title: "Creeper", body: "Explodiert. Siehe [[Schutz|Rüstung]] und [[Nether]].", tags: [] }),
    E<WikiPage>("j_w2", "wiki", { title: "Schutz", body: "Rüstung hilft gegen [[creeper]].", tags: ["Kampf"], aliases: ["Rüstung"] }),
    E<WikiPage>("j_w3", "wiki", { title: "creeper ", body: "Doppelt", tags: ["Mob"] }),
  ];
  it("finds links, resolves titles and aliases, lists backlinks", () => {
    expect(wikiLinks(pages[0].data.body)).toEqual([{ target: "Schutz", label: "Rüstung" }, { target: "Nether", label: "Nether" }]);
    expect(resolveLink("rüstung", pages)?.id).toBe("j_w2");
    expect(resolveLink("Nether", pages)).toBeNull();
    expect(backlinks(pages[1], pages).map((p) => p.id)).toEqual(["j_w1"]);
    const find = E("j_f9", "find", { title: "Fund", links: ["j_w2"] });
    expect(backlinks(pages[1], pages, [find]).map((p) => p.id)).toEqual(["j_w1", "j_f9"]);
    expect(splitWiki("a [[B|c]] d")).toEqual([{ text: "a " }, { link: "B", label: "c" }, { text: " d" }]);
  });
  it("detects duplicates and merges them without losing text", () => {
    const g = duplicateGroups(pages);
    expect(g).toHaveLength(1);
    expect(g[0].map((p) => p.id)).toEqual(["j_w1", "j_w3"]);
    const m = mergePages(pages[0].data, pages[2].data, 1000);
    expect(m.body).toContain("Explodiert.");
    expect(m.body).toContain("Doppelt");
    expect(m.tags).toEqual(["Mob"]);
    expect(m.history?.[0].body).toBe(pages[0].data.body); // the text before the merge is a version
  });
  it("keeps at most one version per 5 minutes and at most 20", () => {
    let p: WikiPage = { title: "T", body: "v0", tags: [] };
    let t = 0;
    for (let i = 1; i <= 30; i++) { t += 6 * 60_000; p = withVersion(p, { ...p, body: "v" + i }, t); }
    expect(p.history).toHaveLength(20);
    expect(p.history![19].body).toBe("v29");
    const q = withVersion(p, { ...p, body: "quick" }, t + 1000);
    expect(q.history).toHaveLength(20);
    expect(q.history![19].body).toBe("v29"); // autosave a second later: no extra version
    expect(withVersion(p, { ...p }, t + 10 * 60_000).history).toHaveLength(20); // unchanged text: none
  });
});

describe("store, export and import (without the PC)", async () => {
  vi.stubGlobal("window", { setTimeout, clearTimeout, addEventListener: () => {} });
  vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });
  vi.stubGlobal("location", { hash: "", protocol: "http:", host: "localhost", search: "" });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const j = await import("./journal");
  it("saves, deletes with a marker, refuses bad input", async () => {
    await j.ready;
    j._resetForTests();
    const id = j.newId();
    expect(id).toMatch(/^j_[a-z0-9]{18}$/);
    j.saveEntry("find", id, { title: "A", category: "item", status: "open", tags: [] });
    expect(j.listKind("find")).toHaveLength(1);
    expect(() => j.saveEntry("wiki", id, { title: "x" })).toThrow(/anderen Art/);
    expect(() => j.saveEntry("find", "../x", {})).toThrow(/Kennung/);
    expect(() => j.saveEntry("find", j.newId(), { body: "x".repeat(260_000) })).toThrow(/zu groß/);
    const before = j.getEntry(id)!.updatedAt;
    j.saveEntry("find", id, { title: "B", category: "item", status: "open", tags: [] });
    expect(j.getEntry(id)!.updatedAt).toBeGreaterThan(before);
    j.removeEntry(id);
    expect(j.getEntry(id)).toBeUndefined();
    expect(j.listKind("find")).toHaveLength(0);
  });
  it("export → import: newer wins, copies get new ids, bad files are refused", async () => {
    j._resetForTests();
    const a = j.newId(), b = j.newId();
    j.saveEntry("wiki", a, { title: "Seite A", body: "[[Seite B]]", tags: [], links: [b] });
    j.saveEntry("wiki", b, { title: "Seite B", body: "", tags: [] });
    const file = JSON.stringify(await j.exportJournal(["wiki"], false));
    expect(await j.importJournal(file)).toMatchObject({ added: 0, updated: 0, skipped: 2 }); // same or older → nothing changes
    const copies = await j.importJournal(file, { asCopies: true });
    expect(copies.added).toBe(2);
    const pages = j.listKind<{ title: string; links?: string[] }>("wiki");
    expect(pages).toHaveLength(4);
    const copyA = pages.find((p) => p.id !== a && p.data.title === "Seite A")!;
    const copyB = pages.find((p) => p.id !== b && p.data.title === "Seite B")!;
    expect(copyA.data.links).toEqual([copyB.id]); // links inside the copied set point to the copies
    j._resetForTests();
    expect(await j.importJournal(file)).toMatchObject({ added: 2 });
    await expect(j.importJournal("{nope")).rejects.toThrow(/JSON/);
    await expect(j.importJournal(JSON.stringify({ format: "other", entries: [] }))).rejects.toThrow(/Keine Sammlungs-Datei/);
    expect(await j.importJournal(JSON.stringify({ format: "nexus-journal", version: 1, entries: [{ id: "j_bad", kind: "Wiki!", updatedAt: 1, data: {} }, { id: "x", kind: "wiki", data: null }] }))).toMatchObject({ added: 0, skipped: 2 });
  });
});
