import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls });

const { routeQuestion, research, clarifyReply, phaseText, chatContext } = await import("./research-chat");
const { _resetForTests } = await import("./journal");
beforeEach(() => { store.clear(); _resetForTests(); });

describe("Entscheidung vor jeder Antwort", () => {
  it("die Fälle aus dem Auftrag", () => {
    expect(routeQuestion("Was ist der Unterschied zwischen RAM und VRAM?").kind).toBe("knowledge");
    expect(routeQuestion("Suche die neuesten offiziellen Patchnotes für Minecraft.")).toMatchObject({ kind: "research", force: true, game: "Minecraft" });
    expect(routeQuestion("Was gibt es Neues zu meinem angegebenen Spiel?")).toMatchObject({ kind: "research", force: false });
    expect(routeQuestion("Erkläre mir eine Quest spoilerfrei.").kind).toBe("clarify");
    expect(routeQuestion("Erkläre mir die Quest Der Blutige Baron in The Witcher spoilerfrei").kind).toBe("knowledge");
    // Statements for the journal are no "which game?" question; an unknown game named after "in" counts as named.
    expect(routeQuestion("Ich bin in E2E Questspiel gerade bei der Quest Der Kartenraum").kind).not.toBe("clarify");
    expect(routeQuestion("Wie schaffe ich den Boss in Hollow Fantasy?").kind).not.toBe("clarify");
    expect(routeQuestion("Was sollte ich in E2E Questspiel als Nächstes machen?", { coach: true }).kind).toBe("notes");
  });
  it("Funktionen, mehrere Schritte, Notizen, Schalter", () => {
    expect(routeQuestion("Starte Minecraft").kind).toBe("function");
    expect(routeQuestion("Öffne Discord und dann starte Minecraft").kind).toBe("multi");
    expect(routeQuestion("Wo war ich in Elden Ring?").kind).toBe("notes");
    expect(routeQuestion("Was ist ein Creeper?", { force: true })).toMatchObject({ kind: "research", why: "Schalter „Im Internet suchen“" });
    expect(routeQuestion("Wann erscheint das nächste Update für Fortnite?").kind).toBe("research");
    expect(routeQuestion("Wie viel RAM braucht man zum Zocken?").kind).toBe("knowledge");
    // "Starte …" stays a function even with the switch on – a search is no excuse to skip the real action.
    expect(routeQuestion("Starte Minecraft", { force: true }).kind).toBe("function");
  });
  it("fragt nach, statt ein Spiel zu raten", () => {
    const r = clarifyReply("Erkläre mir eine Quest spoilerfrei.", ["Skyrim", "Elden Ring"]);
    expect(r.text).toContain("Zu welchem Spiel ist die Quest?");
    expect(r.suggestions).toEqual(["Erkläre mir eine Quest spoilerfrei in Skyrim", "Erkläre mir eine Quest spoilerfrei in Elden Ring"]);
    expect(phaseText("sources")).toBe("Quellen werden ausgewertet …");
  });
});

type Call = { m: string; p: Record<string, unknown> };
const pcWith = (answer: (m: string, p: Record<string, unknown>) => unknown) => {
  const calls: Call[] = [];
  return { calls, pc: { call: async <T,>(m: string, p?: unknown): Promise<T> => { calls.push({ m, p: p as Record<string, unknown> }); return answer(m, p as Record<string, unknown>) as T; } } };
};
const noWiki = (async () => new Response(JSON.stringify({ query: { search: [] } }), { status: 200 })) as unknown as typeof fetch;

describe("Nachrichten bauen aufeinander auf", () => {
  it("das Spiel aus dem Chat gilt für Folgefragen, der Verlauf geht als Kontext mit", async () => {
    const turns = [
      { role: "user" as const, text: "Erstelle ein Bingo für Among Us" },
      { role: "bot" as const, reply: { text: "Hier ist dein 4×4-Bingo …" }, bingoId: "b1" },
      { role: "user" as const, text: "Was gibt es Neues zu Hollow Knight?" },
      { role: "bot" as const, reply: { text: "Silksong ist erschienen." } },
    ];
    const ctx = chatContext(turns, (id) => (id === "b1" ? "Among Us" : null));
    expect(ctx.game).toBe("Hollow Knight");
    expect(ctx.history).toHaveLength(4);
    expect(chatContext(turns.slice(0, 2), (id) => (id === "b1" ? "Among Us" : null)).game).toBe("Among Us");
    // "dort" points back → the game from before; a newly named game wins; without a reference no game is guessed.
    expect(routeQuestion("Und welche Updates kamen dort zuletzt?", { contextGame: "Hollow Knight" }).game).toBe("Hollow Knight");
    expect(routeQuestion("Welche Updates kamen zuletzt für Minecraft?", { contextGame: "Hollow Knight" }).game).toBe("Minecraft");
    expect(routeQuestion("Wie ist das Wetter?", { contextGame: "Hollow Knight" }).game).toBeNull();
    // A quest question with the game from before is no "Für welches Spiel?".
    expect(routeQuestion("Wie schaffe ich die Quest dort?", { contextGame: "Hollow Knight" }).kind).not.toBe("clarify");
    const { calls, pc } = pcWith(() => ({ answered: true, answer: "Ja. [1]", searched: true, searches: 1, provider: "Claude", sources: [{ n: 1, title: "x", url: "https://x.example/", provider: "Claude-Websuche", cited: true }] }));
    await research("Und welche Updates kamen dort zuletzt?", { pc, webSearch: true, route: routeQuestion("Und welche Updates kamen dort zuletzt?", { contextGame: "Hollow Knight" }), requestId: "r9", engine: "auto", history: [{ role: "user", text: "a".repeat(900) }, { role: "bot", text: "b" }] });
    expect(calls[0].p).toMatchObject({ game: "Hollow Knight" });
    const h = calls[0].p.history as { text: string }[];
    expect(h).toHaveLength(2);
    expect(h[0].text).toHaveLength(400);
  });
});

describe("Recherche", () => {
  it("mit Claude-Websuche am PC: Antwort mit nummerierten, anklickbaren Quellen und Datum", async () => {
    const { calls, pc } = pcWith(() => ({ answered: true, answer: "Bestätigt: 26.3 bringt Schneeziegel. [1]", searched: true, searches: 1, queries: ["minecraft patch notes"], searchProvider: "Claude-Websuche (Anthropic)", provider: "Claude", model: "Claude Opus 5.5", costUsd: 0.03,
      sources: [{ n: 1, title: "Minecraft Java Edition 26.3", url: "https://www.minecraft.net/x", provider: "Claude-Websuche", date: "October 20, 2026", cited: true, quote: "adds snow bricks" }],
      others: [{ n: 2, title: "Böse", url: "javascript:alert(1)", provider: "Claude-Websuche", cited: false }] }));
    const phases: string[] = [];
    const r = await research("Suche die neuesten offiziellen Patchnotes für Minecraft.", { pc, webSearch: true, route: routeQuestion("Suche die neuesten offiziellen Patchnotes für Minecraft."), requestId: "r1", engine: "auto", onPhase: (p) => phases.push(p) });
    expect(calls[0]).toMatchObject({ m: "assistant.research", p: { force: true, requestId: "r1", game: "Minecraft", engine: "auto" } });
    expect(r.text).toBe("Bestätigt: 26.3 bringt Schneeziegel. [1]");
    expect(r.cites[0]).toMatchObject({ n: 1, url: "https://www.minecraft.net/x", date: "October 20, 2026" });
    expect(r.research.others![0].url).toBe(""); // only https links are clickable
    expect(r.mode).toBe("claude");
    expect(r.model).toBe("Claude Opus 5.5");
    expect(phases).toEqual(["start"]);
  });
  it("ohne Claude: Wikis im Browser + freie Quellen am PC; Suchanbieter ohne Treffer → offen gesagt", async () => {
    const { calls, pc } = pcWith(() => ({ answered: false, answer: null, sources: [], searched: true, searchProvider: "Wikipedia (deutsch)", provider: null, note: "In den freien Quellen nichts Passendes gefunden." }));
    const r = await research("Was gibt es Neues zu Blorbfisch Deluxe?", { pc, webSearch: false, route: routeQuestion("Was gibt es Neues zu Blorbfisch Deluxe?"), requestId: "r2", engine: "auto", fetcher: noWiki });
    expect(calls[0].p.engine).toBe("free");
    expect(r.text).toContain("In den freien Quellen nichts Passendes gefunden – ich erfinde keine Antwort.");
    expect(r.cites).toEqual([]);
  });
  it("keine Suche möglich → nichts vorgetäuscht", async () => {
    const { pc } = pcWith(() => ({ answered: false, answer: null, sources: [], searched: false, searchProvider: "", provider: null }));
    const r = await research("Was gibt es Neues?", { pc, webSearch: false, route: routeQuestion("Was gibt es Neues zu Fortnite?"), requestId: "r3", engine: "auto", fetcher: noWiki });
    expect(r.text).toContain("Es konnte keine Suche durchgeführt werden");
    expect(r.text).toContain("(Keine Internetsuche durchgeführt.)");
  });
  it("Backend nicht erreichbar → der Fehler kommt an, keine Ersatzantwort", async () => {
    const pc = { call: async () => { throw Object.assign(new Error("Keine Verbindung zum PC"), { code: "offline" }); } };
    await expect(research("Suche Patchnotes für Minecraft", { pc, webSearch: true, route: routeQuestion("Suche Patchnotes für Minecraft"), requestId: "r4", engine: "auto" })).rejects.toThrow("Keine Verbindung zum PC");
  });
  it("ohne PC: nur offene Wikis, klar gesagt", async () => {
    const r = await research("Was gibt es Neues zu Blorbfisch?", { pc: null, webSearch: false, route: routeQuestion("Was gibt es Neues zu Blorbfisch?"), requestId: "r5", engine: "auto", fetcher: noWiki });
    expect(r.text).toContain("Ohne PC habe ich nur offene Wikis durchsucht");
    expect(r.text).toContain("ich erfinde keine Antwort");
  });
});
