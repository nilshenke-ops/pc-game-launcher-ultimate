import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } };
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls });

const { lookupIntent, topicOf, relevant, lookup, lookupAnswer, fromMemory, learnedReply, webPermission, setWebPermission, toEnglish, contextOf, introFromHtml, askPermission, score, sourcesFor, aiAnswer, fallbackIntent, askPermission: askPerm2 } = await import("./web-lookup");
const { GAMES, gameMentioned } = await import("./knowledge-sources");
const { _resetForTests } = await import("./journal");
const { openQuestions, learnedAll } = await import("./jarvis-memory");

beforeEach(() => { store.clear(); _resetForTests(); });

type Page = { title: string; text: string; html?: string };
/** Fake sources: MediaWiki (search, extracts, parse) and the Stack Exchange API, like the real interfaces answer. */
function fakeFetch(pages: Record<string, Page[]>, arqade?: { title: string; answer: string; votes: number; accepted?: boolean }) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    const p = u.searchParams;
    if (u.host === "api.stackexchange.com") {
      const body = u.pathname.endsWith("/answers")
        ? { items: arqade ? [{ answer_id: 77, score: arqade.votes, is_accepted: !!arqade.accepted, body: `<p>${arqade.answer}</p>`, owner: { display_name: "Spieler1" } }] : [] }
        : { items: arqade ? [{ question_id: 5, title: arqade.title, score: 12, is_answered: true }] : [] };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    const list = pages[u.host] ?? [];
    const body = p.get("list") === "search"
      ? { query: { search: list.filter((x) => p.get("srsearch")!.toLowerCase().split(" ").some((w) => w.length > 2 && (x.title + " " + x.text).toLowerCase().includes(w))).map((x) => ({ title: x.title, snippet: `<span class="searchmatch">${x.title}</span> ${x.text}` })) } }
      : p.get("action") === "parse"
        ? { parse: { text: { "*": list.find((x) => x.title === p.get("page"))?.html ?? "" } } }
        : { query: { pages: { 1: { title: p.get("titles"), extract: list.find((x) => x.title === p.get("titles"))?.text } } } };
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
    const { f, calls } = fakeFetch({ "de.minecraft.wiki": [{ title: "Creeper", text: "Creeper sind aggressive Monster, die nur in der Oberwelt spawnen. Beim Angriff explodieren sie." }] });
    const i = lookupIntent("Was ist ein Creeper in Minecraft?")!;
    const a = await lookupAnswer(i, f);
    expect(a.ok).toBe(true);
    expect(a.text).toContain("Creeper sind aggressive Monster");
    expect(a.text).toContain("Beste Quelle: Minecraft Wiki");
    expect(a.links[0].url).toBe("https://de.minecraft.wiki/w/Creeper");
    expect(calls[0]).toContain("de.minecraft.wiki/api.php");
    expect(calls.filter((c) => !c.includes("stackexchange")).every((c) => c.includes("origin=*"))).toBe(true);
    // Remembered with its source on the wiki page.
    expect(learnedAll()[0]).toMatchObject({ title: "Creeper", source: "Minecraft Wiki", url: "https://de.minecraft.wiki/w/Creeper" });
    const again = fromMemory(lookupIntent("Was ist ein Creeper in Minecraft?")!)!;
    expect(learnedReply(again).text).toContain("von mir nachgeschlagen am");
  });
  it("findet nichts Passendes → keine erfundene Antwort, Frage wird notiert", async () => {
    const { f } = fakeFetch({ "de.wikipedia.org": [{ title: "Zombie", text: "Ein Untoter." }] });
    const a = await lookupAnswer(lookupIntent("Was ist ein Blorbfisch?")!, f);
    expect(a.ok).toBeNull();
    expect(a.text).toContain("ich erfinde keine Antwort");
    expect(openQuestions()[0]).toContain("Was ist ein Blorbfisch?");
  });
  it("nicht erreichbar → ehrlich gesagt", async () => {
    const f = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    const r = await lookup("Creeper", "Minecraft", f);
    expect(r.found).toBeNull();
    expect(r.errors).toHaveLength(r.tried.length);
    expect(r.tried).toEqual(["Minecraft Wiki", "Wikipedia (deutsch)", "Wikipedia (englisch)"]); // "what is" → no player answers
    expect((await lookup("beste Schwert", "Minecraft", f, "Was ist das beste Schwert in Minecraft?")).tried).toContain("Arqade (Stack Exchange)");
  });
  it("englische Quellen werden gekennzeichnet; Erlaubnis merkbar", async () => {
    const { f } = fakeFetch({ "terraria.wiki.gg": [{ title: "Moon Lord", text: "The Moon Lord is a Hardmode, post-Lunatic Cultist boss." }] });
    const a = await lookupAnswer(lookupIntent("Wer ist der Moon Lord in Terraria?")!, f);
    expect(a.text).toContain("Quelle auf Englisch");
    expect(webPermission()).toBe("ask");
    setWebPermission("always");
    expect(webPermission()).toBe("always");
  });
  it("Skyrim: mehrere Quellen, die beste gewinnt – Spieler-Antwort bei „stärkste Waffe“", async () => {
    const { f, calls } = fakeFetch({
      "en.uesp.net": [{ title: "Skyrim:Weapons", text: "Daedric weapons are the strongest standard weapons", html: "<aside>Infobox</aside><div class=\"hatnote\">For other uses, see Weapons.</div><p>Weapons in Skyrim are divided into one-handed, two-handed and ranged weapons.</p>" }],
      "de.wikipedia.org": [{ title: "The Elder Scrolls V: Skyrim", text: "Skyrim ist ein Rollenspiel von Bethesda." }],
    }, { title: "What is the strongest weapon in Skyrim?", answer: "Without exploits, a Daedric or Dragonbone weapon smithed to Legendary is the strongest. With enchanting and smithing potions you can push it far higher.", votes: 25, accepted: true });
    const i = lookupIntent("Was ist die stärkst WAFFE in Skyrim")!;
    expect(i).toMatchObject({ topic: "stärkst WAFFE", game: "Skyrim" });
    expect(askPermission(i).text).toContain("UESP (Elder Scrolls Wiki), Elder Scrolls Wiki (Fandom), Arqade (Stack Exchange), Wikipedia");
    const a = await lookupAnswer(i, f);
    expect(a.ok).toBe(true);
    expect(a.text).toContain("Daedric or Dragonbone");
    expect(a.text).toMatch(/Beste Quelle: Arqade \(Stack Exchange\) – Antwort von Spieler1, 25 Stimmen, akzeptiert, CC BY-SA/);
    expect(a.text).toContain("Weitere Quellen: UESP (Elder Scrolls Wiki) („Skyrim:Weapons“)");
    expect(a.text).not.toContain("Rollenspiel von Bethesda"); // the general game article does not answer the question
    expect(a.links[0].url).toBe("https://gaming.stackexchange.com/a/77");
    expect(a.links.map((l) => l.label)).toEqual(expect.arrayContaining(["TikTok-Suche", "Reddit-Suche", "YouTube-Suche", "Instagram #skyrim"]));
    // English sources get English search words; nothing of TikTok/Instagram/Reddit is read.
    expect(calls.some((c) => c.includes("en.uesp.net") && c.includes("srsearch=strongest%20weapon") && c.includes("srnamespace=134"))).toBe(true);
    expect(calls.some((c) => /tiktok|instagram|reddit|google|duckduckgo/.test(c))).toBe(false);
  });
  it("mit PC: deutsche Antwort nur aus den Quellen, mit Videos; ohne KI am PC → beste Stelle", async () => {
    const { f } = fakeFetch({ "en.uesp.net": [{ title: "Skyrim:Weapons", text: "Daedric weapons are the strongest standard weapons" }] });
    const sent: { m: string; p: unknown }[] = [];
    const pc = { call: async <T,>(m: string, p?: unknown): Promise<T> => {
      sent.push({ m, p });
      if (m === "media.youtube") return { configured: true, videos: [{ title: "Skyrim – stärkste Waffe", channel: "Kanal", url: "https://www.youtube.com/watch?v=abc" }] } as T;
      return { answered: true, answer: "Ohne Tricks sind daedrische Waffen am stärksten [1].", best: 1, provider: "ollama", model: "llama3" } as T;
    } };
    const a = await lookupAnswer(lookupIntent("Was ist die stärkste Waffe in Skyrim?")!, f, pc);
    expect(a.text).toContain("Ohne Tricks sind daedrische Waffen am stärksten [1].");
    expect(a.text).toContain("[1] UESP (Elder Scrolls Wiki): Skyrim:Weapons");
    expect(a.text).toContain("Zusammengefasst von deiner lokalen KI nur aus diesen Quellen");
    expect(a.text).toContain("• Skyrim – stärkste Waffe – Kanal");
    expect(sent.find((x) => x.m === "assistant.summarize")!.p).toMatchObject({ question: "Was ist die stärkste Waffe in Skyrim?", passages: [{ source: "UESP (Elder Scrolls Wiki)", url: "https://en.uesp.net/wiki/Skyrim:Weapons" }] });
    // No AI at the PC: the best passage itself, honestly marked as English.
    const noAi = { call: async <T,>(m: string): Promise<T> => { if (m === "media.youtube") return { configured: false, videos: [] } as T; throw Object.assign(new Error("Keine KI"), { code: "assistant-local" }); } };
    store.clear(); _resetForTests();
    const b = await lookupAnswer(lookupIntent("Was ist die stärkste Waffe in Skyrim?")!, f, noAi);
    expect(b.text).toContain("Daedric weapons are the strongest");
    expect(b.text).toContain("Quelle auf Englisch");
  });
});

describe("Hilfen", () => {
  it("deutsche Spielwörter → englische Suchbegriffe, Spiel am Satzende, Einleitung ohne Infobox", () => {
    expect(toEnglish("stärkste Rüstung")).toBe("strongest armor");
    expect(toEnglish("bestes Schwert")).toBe("best sword");
    expect(toEnglish("Moon Lord")).toBe("Moon Lord");
    expect(contextOf("Wo finde ich Ebenerz in Skyrim?")).toBe("Skyrim");
    expect(contextOf("Was ist ein Mantis Lord bei Hollow Knight")).toBe("Hollow Knight");
    expect(contextOf("Was ist das in der Nacht")).toBeNull();
    expect(lookupIntent("Wo finde ich Ebenerz in Skyrim?")).toMatchObject({ topic: "Ebenerz", game: "Skyrim" });
    expect(introFromHtml("<aside>x</aside><div class=\"hatnote\">For other uses see y.</div><p>For other uses, see Z.</p><p>The Moon Lord is the final boss of Terraria and very strong.</p>")).toBe("The Moon Lord is the final boss of Terraria and very strong.");
    expect(score("strongest weapon", "Skyrim:Weapons", "the strongest weapons")).toBeCloseTo(0.8);
  });
});

describe("Viele Quellen", () => {
  it("über 80 Spiele mit eigenem Wiki, alle über https und mit offizieller Schnittstelle", () => {
    expect(GAMES.length).toBeGreaterThanOrEqual(80);
    const apis = GAMES.flatMap((g) => g.wikis.map((w) => w.api));
    expect(apis.every((a) => /^https:\/\/[a-z0-9.-]+\/(?:[a-z-]+\/)*api\.php$/.test(a))).toBe(true);
    expect(apis.some((a) => /pcgamingwiki|howlongtobeat|google|tiktok|instagram|reddit/.test(a))).toBe(false);
    expect(new Set(GAMES.map((g) => g.name)).size).toBe(GAMES.length);
  });
  it("erkennt Spiele im Satz und wählt Quellen nach Thema", () => {
    expect(lookupIntent("Wie besiege ich Hornet in Hollow Knight?")).toMatchObject({ topic: "Hornet", game: "Hollow Knight" });
    expect(gameMentioned("Welche Legende ist in Apex Legends am besten")).toBe("Apex Legends");
    expect(gameMentioned("Was ist Rust für eine Sprache")).toBeNull(); // everyday words only after "in …"
    expect(lookupIntent("Was ist Hollow Knight?")).toMatchObject({ topic: "Hollow Knight", game: null });
    expect(sourcesFor("Hornet", "Hollow Knight", "Wie besiege ich Hornet in Hollow Knight?")).toEqual(["Hollow Knight Wiki (Fandom)", "Arqade (Stack Exchange)", "Wikipedia (deutsch)", "Wikipedia (englisch)"]);
    expect(sourcesFor("Pikachu", "Pokémon", "Was ist Pikachu in Pokémon?")).toContain("Bulbapedia");
    expect(lookupIntent("Was tun wenn die Grafikkarte zu heiß wird?")).toMatchObject({ topic: "Grafikkarte zu heiß wird", game: null });
    expect(sourcesFor("Grafikkarte zu heiß", null, "Was tun wenn die Grafikkarte zu heiß wird")).toContain("Super User (Stack Exchange, PC-Hilfe)");
    expect(sourcesFor("Regeln von Catan", null, "Wie sind die Regeln von Catan?")).toContain("Board & Card Games (Stack Exchange)");
    expect(sourcesFor("Sehenswürdigkeiten in Rom", null, "Welche Sehenswürdigkeiten gibt es in Rom für eine Reise")).toContain("Wikivoyage (deutsch)");
    expect(sourcesFor("Vulkan", null, "Was ist ein Vulkan?")).toEqual(["Klexikon (Kinder-Lexikon, einfach erklärt)", "Wikipedia (deutsch)", "Wikipedia (englisch)"]);
  });
  it("Super User beantwortet PC-Fragen mit Spieler-/Nutzer-Antwort", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      const u = new URL(url);
      const body = u.host === "api.stackexchange.com"
        ? (u.pathname.endsWith("/answers") ? { items: [{ answer_id: 9, score: 40, is_accepted: true, body: "<p>Clean the fans and check that the GPU fan curve is not set too low; then monitor temperatures.</p>", owner: { display_name: "Tech" } }] } : { items: [{ question_id: 1, title: "Graphics card gets too hot while gaming", score: 30, is_answered: true }] })
        : { query: { search: [] } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;
    const a = await lookupAnswer(lookupIntent("Was tun wenn die Grafikkarte zu heiß wird?")!, f);
    expect(a.text).toContain("Clean the fans");
    expect(a.text).toContain("Beste Quelle: Super User (Stack Exchange, PC-Hilfe) – Antwort von Tech, 40 Stimmen, akzeptiert");
    expect(a.links[0].url).toBe("https://superuser.com/a/9");
    expect(calls.some((c) => c.includes("site=superuser") && c.includes("graphics%20card"))).toBe(true);
  });
});

describe("Kostenlose KI ohne Quelle", () => {
  it("nur auf Tipp, klar markiert, nicht als Wissen gemerkt", async () => {
    const i = lookupIntent("Was ist ein Blorbfisch?")!;
    const a = await aiAnswer(i, { call: async <T,>(m: string, p?: unknown): Promise<T> => { expect(m).toBe("assistant.freeAnswer"); expect(p).toEqual({ question: "Was ist ein Blorbfisch?" }); return { answer: "Das kenne ich nicht.", sure: false, provider: "Gemini", model: "gemini-3.5-flash-lite" } as T; } });
    expect(a.text).toMatch(/^⚠ KI-Antwort von Gemini \(kostenlos\) – ohne Quelle, nicht nachgeprüft/);
    expect(a.text).toContain("Die KI ist sich selbst nicht sicher");
    expect(learnedAll()).toHaveLength(0);
    const none = await aiAnswer(i, { call: async () => { throw Object.assign(new Error("x"), { code: "assistant-local" }); } });
    expect(none.text).toContain("Gemini-Schlüssel");
  });
});

describe("Nicht wissen ist kein Ende", () => {
  it("auch ein bloßer Begriff oder Spielname wird nachgeschlagen, Befehle nicht", () => {
    expect(fallbackIntent("Ship or Burn")).toMatchObject({ kind: "question", topic: "Ship or Burn", game: null });
    expect(fallbackIntent("Hornet Hollow Knight")).toMatchObject({ topic: "Hornet", game: "Hollow Knight" });
    expect(fallbackIntent("Starte Minecraft")).toBeNull();
    expect(fallbackIntent("Danke")).toBeNull();
    expect(fallbackIntent("x".repeat(90))).toBeNull();
  });
  it("Rückmeldungen zur letzten Antwort werden nicht nachgeschlagen, Folgefragen behalten das Spiel", () => {
    for (const x of ["Das macht teilweise noch kein Sinn es soll Mittel sein und ich bin impostor", "passt nicht", "es soll schwerer sein", "ich bin Impostor", "Stimmt", "Genau so"]) expect(fallbackIntent(x), x).toBeNull();
    expect(fallbackIntent("Wer ist der Boss?", "Hollow Knight")).toMatchObject({ game: "Hollow Knight" });
    expect(fallbackIntent("Ship or Burn")?.game).toBeNull();
  });
  it("Modus „Direkt von der KI“: die Erlaubnisfrage nennt die KI und was gesendet wird", () => {
    const q = askPerm2(fallbackIntent("Ship or Burn")!, "ai");
    expect(q.text).toContain("Darf ich die KI an deinem PC fragen");
    expect(q.text).toContain("ohne Quelle");
  });
});

