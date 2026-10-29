import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls });

const { lookupIntent, topicOf, relevant, lookup, lookupAnswer, fromMemory, learnedReply, webPermission, setWebPermission } = await import("./web-lookup");
const { _resetForTests } = await import("./journal");
const { openQuestions, learnedAll } = await import("./jarvis-memory");

beforeEach(() => { store.clear(); _resetForTests(); });

/** A fake wiki: answers search and extracts like the MediaWiki API. */
function fakeFetch(pages: Record<string, { host: string; title: string; text: string }[]>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const list = Object.entries(pages).find(([host]) => u.host === host)?.[1] ?? [];
    const body = u.searchParams.get("list") === "search"
      ? { query: { search: list.filter((p) => u.searchParams.get("srsearch")!.toLowerCase().split(" ").some((w) => p.title.toLowerCase().includes(w))).map((p) => ({ title: p.title, snippet: `<span class="searchmatch">${p.title}</span> ${p.text}` })) } }
      : { query: { pages: { 1: { title: u.searchParams.get("titles"), extract: list.find((p) => p.title === u.searchParams.get("titles"))?.text } } } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { f: f as unknown as typeof fetch, calls };
}

describe("Fragen verstehen", () => {
  it("Thema und Spiel", () => {
    expect(lookupIntent("Was ist ein Creeper in Minecraft?")).toMatchObject({ kind: "question", topic: "Creeper", game: "Minecraft" });
    expect(lookupIntent("Such im Internet nach Moon Lord")).toMatchObject({ kind: "explicit", topic: "Moon Lord" });
    expect(lookupIntent("Wer ist Malenia in Elden Ring?")).toMatchObject({ topic: "Malenia", game: "Elden Ring" });
    expect(lookupIntent("Wikipedia: Hidetaka Miyazaki")).toMatchObject({ kind: "explicit", topic: "Hidetaka Miyazaki" });
    expect(lookupIntent("Starte Minecraft")).toBeNull();
    expect(topicOf("Erklär mir was Redstone ist", "Minecraft")).toBe("Redstone");
  });
  it("Treffer nur, wenn er wirklich passt", () => {
    expect(relevant("Creeper", "Creeper")).toBe(true);
    expect(relevant("Moon Lord", "Moon Lord")).toBe(true);
    expect(relevant("Creeper", "Zombie")).toBe(false);
  });
});

describe("Nachschlagen", () => {
  it("Spiel-Wiki zuerst, mit Quelle und gemerkt – beim zweiten Mal ohne Internet", async () => {
    const { f, calls } = fakeFetch({ "de.minecraft.wiki": [{ host: "", title: "Creeper", text: "Creeper sind aggressive Monster, die nur in der Oberwelt spawnen. Beim Angriff explodieren sie." }] });
    const i = lookupIntent("Was ist ein Creeper in Minecraft?")!;
    const a = await lookupAnswer(i, f);
    expect(a.ok).toBe(true);
    expect(a.text).toContain("Creeper sind aggressive Monster");
    expect(a.text).toContain("Quelle: Minecraft Wiki");
    expect(a.links[0].url).toBe("https://de.minecraft.wiki/w/Creeper");
    expect(calls[0]).toContain("de.minecraft.wiki/api.php");
    expect(calls.every((c) => c.includes("origin=*"))).toBe(true);
    // Remembered with its source on the wiki page.
    expect(learnedAll()[0]).toMatchObject({ title: "Creeper", source: "Minecraft Wiki", url: "https://de.minecraft.wiki/w/Creeper" });
    const again = fromMemory(lookupIntent("Was ist ein Creeper in Minecraft?")!)!;
    expect(learnedReply(again).text).toContain("von mir nachgeschlagen am");
  });
  it("findet nichts Passendes → keine erfundene Antwort, Frage wird notiert", async () => {
    const { f } = fakeFetch({ "de.wikipedia.org": [{ host: "", title: "Zombie", text: "Ein Untoter." }] });
    const a = await lookupAnswer(lookupIntent("Was ist ein Blorbfisch?")!, f);
    expect(a.ok).toBeNull();
    expect(a.text).toContain("ich erfinde keine Antwort");
    expect(openQuestions()[0]).toContain("Was ist ein Blorbfisch?");
  });
  it("nicht erreichbar → ehrlich gesagt", async () => {
    const f = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const r = await lookup("Creeper", "Minecraft", f);
    expect(r.found).toBeNull();
    expect(r.errors).toHaveLength(3);
  });
  it("englische Quellen werden gekennzeichnet; Erlaubnis merkbar", async () => {
    const { f } = fakeFetch({ "terraria.wiki.gg": [{ host: "", title: "Moon Lord", text: "The Moon Lord is a Hardmode, post-Lunatic Cultist boss." }] });
    const a = await lookupAnswer(lookupIntent("Wer ist der Moon Lord in Terraria?")!, f);
    expect(a.text).toContain("Quelle auf Englisch");
    expect(webPermission()).toBe("ask");
    setWebPermission("always");
    expect(webPermission()).toBe("always");
  });
});
