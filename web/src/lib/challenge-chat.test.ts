import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls });

const { challengeIntent, challengeAnswer, makeChallenges, gameInText, _resetChallengeChat, setDoneToMemory } = await import("./challenge-chat");
const { coachIntent, coachAnswer } = await import("./game-coach");
const { listKind, newId, saveEntry, _resetForTests } = await import("./journal");
const { CATALOG } = await import("./bingo-catalog");
const { parseLine } = await import("./bingo");

beforeEach(() => { store.clear(); _resetForTests(); _resetChallengeChat(); });
const seq = () => { let n = 0; return () => ((n++ * 0.37) % 1); };

describe("Challenge-Generator: natürliche Sprache", () => {
  it("versteht die Beispiele aus dem Auftrag", () => {
    expect(challengeIntent("Erstelle fünf mittelschwere Minecraft-Challenges.")).toMatchObject({ kind: "make", game: "Minecraft", count: 5, difficulty: "medium" });
    expect(challengeIntent("Ich habe heute nur 20 Minuten. Gib mir eine passende Herausforderung.")).toMatchObject({ kind: "make", count: 1, minutes: 20 });
    expect(challengeIntent("Erstelle eine sehr schwere Elden-Ring-Challenge ohne Story-Spoiler.")).toMatchObject({ kind: "make", game: "Elden Ring", count: 1, difficulty: "veryhard", noSpoiler: true });
    expect(challengeIntent("Erstelle drei lustige Herausforderungen für einen Gaming-Abend mit Freunden.")).toMatchObject({ kind: "make", count: 3, category: "fun", players: 2 });
    expect(challengeIntent("Mach die aktuelle Challenge schwieriger.")).toEqual({ kind: "harder" });
    expect(challengeIntent("Generiere ein Challenge-Bingo für Minecraft mit 16 Feldern.")).toBeNull(); // the bingo maker answers
    expect(challengeIntent("Challenge geschafft!")).toMatchObject({ kind: "done" });
    expect(challengeIntent("Zeig mir meine offenen Challenges")).toEqual({ kind: "list" });
    expect(challengeIntent("Bewerte die Challenge mit 4 Sternen")).toEqual({ kind: "rate", stars: 4 });
    expect(challengeIntent("Gib mir eine Horror-Challenge")).toMatchObject({ kind: "make", game: null, genre: "horror" });
    expect(challengeIntent("Starte Minecraft")).toBeNull();
  });
  it("erkennt Spiele aus dem Auftrag", () => {
    for (const [q, g] of [["GTA 5 Challenge", "GTA V"], ["eine Palworld-Challenge", "Palworld"], ["Challenge für Cyberpunk 2077", "Cyberpunk 2077"], ["Lords of the Fallen Challenge", "Lords of the Fallen"], ["Age of Empires II", "Age of Empires"], ["Roblox", "Roblox"], ["Baldur's Gate 3", "Baldur's Gate 3"], ["Stardew Valley", "Stardew Valley"]])
      expect(gameInText(q, [])).toBe(g);
  });
  it("jede Katalogzeile ist gültig", () => {
    for (const g of CATALOG) for (const l of g.tasks) expect(parseLine(l, "catalog"), `${g.name}: ${l}`).not.toBeNull();
  });
});

describe("Challenge-Generator: aus dem geprüften Katalog, ohne Wiederholung", () => {
  it("Schwierigkeit, Spoiler und Mitspieler werden eingehalten", () => {
    const i = challengeIntent("Erstelle fünf mittelschwere Minecraft-Challenges")!;
    const m = makeChallenges(i as never, seq());
    expect(m.tasks).toHaveLength(5);
    expect(m.tasks.every((t) => t.level === 2 && !t.team)).toBe(true);
    const er = makeChallenges(challengeIntent("sehr schwere Elden-Ring-Challenge ohne Story-Spoiler") as never, seq());
    expect(er.tasks.every((t) => t.level === 4 && !t.spoiler)).toBe(true);
    const short = makeChallenges(challengeIntent("Ich habe nur 20 Minuten, gib mir eine sehr schwere Minecraft-Challenge") as never, seq());
    expect(short.tasks[0].level).toBeLessThanOrEqual(2);
  });
  it("gespeichert, ersetzt durch „schwieriger“, geschafft → im Gedächtnis, nie doppelt", () => {
    const a = challengeAnswer(challengeIntent("Gib mir eine leichte Minecraft-Challenge")!, seq());
    expect(a.ok).toBe(true);
    expect(a.text).toContain("geprüfter Aufgaben-Katalog für Minecraft");
    expect(listKind("challenge")).toHaveLength(1);
    const first = (listKind<{ text: string; level: number }>("challenge")[0]).data;
    expect(first.level).toBe(1);
    const h = challengeAnswer({ kind: "harder" }, seq());
    expect(h.text).toContain("jetzt Mittel");
    const now = listKind<{ text: string; level: number }>("challenge");
    expect(now).toHaveLength(1);
    expect(now[0].data.level).toBe(2);
    expect(now[0].data.text).not.toBe(first.text);
    const d = challengeAnswer({ kind: "done", text: null });
    expect(d.text).toContain("Geschafft");
    expect(listKind<{ did: string; gameName: string }>("memory")[0].data).toMatchObject({ gameName: "Minecraft" });
    expect(listKind<{ did: string }>("memory")[0].data.did).toMatch(/^Challenge geschafft: /);
    // A done challenge is never suggested again.
    const all = Array.from({ length: 30 }, () => makeChallenges({ kind: "make", game: "Minecraft", genre: null, count: 1, difficulty: "medium", category: null, minutes: null, noSpoiler: true, players: 1, speed: false }, Math.random).tasks[0]?.text);
    expect(all).not.toContain(now[0].data.text.replace(/^.*?:\s/, ""));
    expect(challengeAnswer({ kind: "rate", stars: 4 }).text).toContain("★★★★☆");
  });
  it("Gedächtnis-Eintrag ist abschaltbar", () => {
    setDoneToMemory(false);
    challengeAnswer(challengeIntent("Gib mir eine Terraria-Challenge")!, seq());
    challengeAnswer({ kind: "done", text: null });
    expect(listKind("memory")).toHaveLength(0);
  });
});

describe("Gaming-Gedächtnis", () => {
  it("Beispiele aus dem Auftrag", () => {
    expect(coachIntent("Wo war ich zuletzt in Minecraft?")).toEqual({ kind: "where", game: "Minecraft" });
    expect(coachIntent("Was sollte ich heute in Elden Ring machen?")).toEqual({ kind: "next", game: "Elden Ring" });
    expect(coachIntent("Merke dir, dass ich als Nächstes mein Minecraft-Haus fertigbauen möchte.")).toEqual({ kind: "plan", game: "Minecraft", text: "Mein Minecraft-Haus fertigbauen" });
    expect(coachIntent("Zeig mir alle offenen Projekte in meinen Spielen.")).toEqual({ kind: "projects" });
    expect(coachIntent("Was weißt du über mich als Gamer?")).toEqual({ kind: "profile" });
    expect(coachIntent("Was spiele ich am meisten?")).toEqual({ kind: "top" });
    expect(coachIntent("Merk dir, dass ich Pizza mag")).toBeNull(); // no game → general memory
  });
  it("Plan wird dem Spiel zugeordnet und taucht bei „heute“ und in den offenen Projekten auf – mit Herkunft", async () => {
    await coachAnswer({ kind: "plan", game: "Minecraft", text: "Mein Minecraft-Haus fertigbauen" }, false);
    saveEntry("project", newId(), { title: "Burg", status: "building", worldId: "w1", tasks: [{ text: "Dach" }, { text: "Turm", done: true }] });
    saveEntry("challenge", newId(), { text: "Elden Ring: Besiege einen Boss", gameName: "Elden Ring", source: "catalog", status: "open" });
    const next = await coachAnswer({ kind: "next", game: "Minecraft" }, false);
    expect(next.text).toContain("Dein eigener Plan");
    expect(next.text).toContain("Mein Minecraft-Haus fertigbauen");
    expect(next.text).toContain("Bauprojekt „Burg“ – noch 1 Aufgabe");
    const p = await coachAnswer({ kind: "projects" }, false);
    expect(p.text).toContain("▸ Minecraft");
    expect(p.text).toContain("▸ Elden Ring");
    expect(p.text).toContain("Challenge: Besiege einen Boss");
    expect(p.text).toContain("nichts aus einem Spielstand gelesen");
    const w = await coachAnswer({ kind: "where", game: "Minecraft" }, false);
    expect(w.text).toContain("Einen Spielstand lese ich nicht aus");
  });
  it("Profil ohne PC-Daten erfindet keine Spielzeiten; mit gespeichertem PC-Stand gekennzeichnet", async () => {
    let r = await coachAnswer({ kind: "profile" }, false);
    expect(r.text).toContain("die misst der PC");
    store.set("pgl.cache.library.list", JSON.stringify({ at: 1, data: { items: [{ id: "a", kind: "game", name: "Hades" }, { id: "b", kind: "game", name: "Minecraft" }] } }));
    store.set("pgl.cache.history.get", JSON.stringify({ at: 1, data: { stats: [{ itemId: "a", totalMinutes: 600, lastPlayed: "2026-10-20T18:00:00Z", sessions: 8 }, { itemId: "b", totalMinutes: 90, lastPlayed: "2026-10-27T18:00:00Z", sessions: 2 }] } }));
    r = await coachAnswer({ kind: "profile" }, false);
    expect(r.text).toContain("Meistgespielt: Hades (10 Std.)");
    expect(r.text).toContain("[vom PC gemessen, gespeicherter Stand]");
    const top = await coachAnswer({ kind: "top" }, false);
    expect(top.text.split("\n")[1]).toContain("1. Hades");
    const rec = await coachAnswer({ kind: "recent" }, false);
    expect(rec.text.split("\n")[1]).toContain("Minecraft");
  });
});
