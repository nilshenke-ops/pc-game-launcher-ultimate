import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the browser's storage (the tests run in node).
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m }; };
const local = mem(), session = mem();
vi.stubGlobal("window", { localStorage: local, sessionStorage: session });

import { elevenDeviceReady, elevenKeyLooksRight, removeLocalElevenKey, saveLocalElevenKey, speakElevenDevice, testLocalEleven, transcribeEleven, cleanTranscript, transcribeGroq, whisperKeyReady, removeLocalSearchKey, saveLocalSearchKey, searchKeyLooksRight, searchLive, readySearch, wantsLiveData, askLocal, askLocalChain, isChatModel, isFreeOpenRouter, keyLooksRight, localAiSnapshot, lockLocalAi, lockSecret, rankModel, readyProviders, removeLocalKey, resetLocalAiState, saveLocalKey, testLocal, transferKeysToPc, unlockLocalAi, unlockSecret } from "./free-ai-local";
import { resetFreeAiBudget, resetFreeAiPause, setFreeAiConsent } from "./free-ai";

const OR = "sk-or-v1-0123456789abcdef0123456789", GR = "gsk_0123456789abcdef0123456789ab", CS = "csk-0123456789abcdef0123456789abcdef", MI = "AbCdEfGhIjKlMnOpQrStUvWxYz012345", PASS = "geheim-123";
const json = (o: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", ...headers } });
const orModels = (...m: [string, string, number][]) => ({ data: m.map(([id, price, context_length]) => ({ id, pricing: { prompt: price, completion: price, request: "0", image: "0" }, context_length, architecture: { input_modalities: ["text"], output_modalities: ["text"] } })) });
const chatOk = (text: string, model = "x/y:free") => ({ model, choices: [{ message: { role: "assistant", content: text } }], usage: { completion_tokens: 12 } });

interface Call { url: string; auth: string | null; body: Record<string, unknown> | null }
function fake(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    const c: Call = { url, auth: h.get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

beforeEach(() => {
  local._m.clear(); session._m.clear();
  lockLocalAi(); removeLocalKey("openrouter"); removeLocalKey("groq"); removeLocalKey("cerebras"); removeLocalKey("mistral"); removeLocalSearchKey("tavily"); removeLocalSearchKey("serper"); removeLocalElevenKey(); resetLocalAiState(); resetFreeAiBudget(); resetFreeAiPause(); setFreeAiConsent("no");
});

describe("Kostenregeln im Browser (wie im Begleiter)", () => {
  it("nur echte Gratis-Modelle", () => {
    const m = (id: string, pricing: Record<string, unknown>) => ({ id, pricing });
    expect(isFreeOpenRouter(m("meta/llama:free", { prompt: "0", completion: "0", request: "0" }))).toBe(true);
    expect(isFreeOpenRouter(m("openrouter/free", { prompt: "0", completion: "0" }))).toBe(true);
    expect(isFreeOpenRouter(m("a/b:free", { prompt: "0.0000001", completion: "0" }))).toBe(false);
    expect(isFreeOpenRouter(m("openrouter/auto", { prompt: "-1", completion: "-1" }))).toBe(false);
    expect(isFreeOpenRouter(m("google/lyria", { prompt: "0", completion: "0" }))).toBe(false);
    expect(isFreeOpenRouter(m("a/b:free", { prompt: "kostenlos", completion: "0" }))).toBe(false);
    expect(isFreeOpenRouter(m("a/b:free", { completion: "0" }))).toBe(false);
    expect(isFreeOpenRouter(m("a/b:free", { prompt: "0", completion: "0", overrides: [{ x: 1 }] }))).toBe(false);
    expect(isFreeOpenRouter({ id: "a/b:free" })).toBe(false);
  });
  it("nur Chat-Modelle, Rangfolge, Schlüsselform", () => {
    for (const bad of ["meta/llama-guard-4-12b", "openai/whisper-large-v3", "nvidia/nemotron-3.5-content-safety:free", "cohere/north-mini-code:free"]) expect(isChatModel(bad), bad).toBe(false);
    expect(rankModel("openrouter/free", 200000)).toBeGreaterThan(rankModel("openai/gpt-oss-120b:free", 131072));
    expect(rankModel("openai/gpt-oss-120b", 131072)).toBeGreaterThan(rankModel("llama-3.1-8b-instant", 131072));
    expect(keyLooksRight("openrouter", OR)).toBe(true); expect(keyLooksRight("openrouter", GR)).toBe(false); expect(keyLooksRight("groq", "AIzaSyA0123456789abcdefghijklmnopqrstuv")).toBe(false);
  });
});

describe("Das Schloss (Passwort → AES-GCM)", () => {
  it("öffnet nur mit dem richtigen Passwort und für den richtigen Anbieter, Klartext steht nirgends", async () => {
    const l = await lockSecret(PASS, "openrouter", OR);
    expect(JSON.stringify(l)).not.toContain("sk-or");
    expect(await unlockSecret(PASS, "openrouter", l)).toBe(OR);
    expect(await unlockSecret("falsch-123", "openrouter", l)).toBeNull();
    expect(await unlockSecret(PASS, "groq", l)).toBeNull();                      // the OpenRouter key cannot be moved into the Groq slot
    expect(await unlockSecret(PASS, "openrouter", { ...l, ct: l.ct.slice(0, -4) + "AAAA" })).toBeNull();
  });
  it("speichern: falsche Form, kurzes Passwort, Groq ohne Bestätigung und fremdes Passwort werden abgelehnt; gespeichert ist nur verschlüsselt", async () => {
    await expect(saveLocalKey("openrouter", "AIzaSyA0123456789abcdefghijklmnopqrstuv", PASS)).rejects.toThrow(/OpenRouter-Schlüssel/);
    await expect(saveLocalKey("openrouter", OR, "kurz")).rejects.toThrow(/6 Zeichen/);
    await expect(saveLocalKey("groq", GR, PASS)).rejects.toThrow(/kostenlosen Tarif/);
    expect(localAiSnapshot().openrouter).toBe("none");
    await saveLocalKey("openrouter", OR, PASS);
    expect(localAiSnapshot().openrouter).toBe("ready");
    expect([...local._m.values()].join("")).not.toContain("sk-or-v1");           // nothing readable in the storage
    lockLocalAi();
    await expect(saveLocalKey("groq", GR, "anderes-pw-1", { attested: true })).rejects.toThrow(/passt nicht/);
    await saveLocalKey("groq", GR, PASS, { attested: true });
    expect(readyProviders()).toEqual(["openrouter", "groq"].filter((p) => p === "groq" || localAiSnapshot().openrouter === "ready"));
  });
  it("gesperrt: kein Schlüssel im Speicher, nach falschem Passwort bleibt es gesperrt, nach richtigem ist es bereit", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    lockLocalAi();
    expect(localAiSnapshot().openrouter).toBe("locked"); expect(readyProviders()).toEqual([]);
    await expect(unlockLocalAi("falsch-123")).rejects.toThrow(/Falsches Passwort/);
    expect(localAiSnapshot().openrouter).toBe("locked");
    await unlockLocalAi(PASS);
    expect(localAiSnapshot().openrouter).toBe("ready");
    removeLocalKey("openrouter");
    expect(localAiSnapshot().openrouter).toBe("none");
  });
});

describe("OpenRouter direkt aus dem Browser", () => {
  it("fragt nur kostenlose Modelle, mit Höchstpreis 0, den Schlüssel nur an openrouter.ai – und nennt den Anbieter", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    const f = fake((c) => c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000], ["meta/llama-3.3-70b:free", "0", 131072], ["big/paid-model", "0.00003", 1000000], ["a/gpt-oss-120b:free", "0.5", 131072])) : json(chatOk("Etwa 7 bis 9 Stunden.", "meta/llama-3.3-70b:free")));
    const a = await askLocal("openrouter", "Wie lange schlafen?", [], { fetcher: f.fetcher });
    expect(a.label).toBe("Beantwortet von OpenRouter – kostenloses Modell (meta/llama-3.3-70b:free)");
    const chat = f.calls.find((c) => c.url.endsWith("/chat/completions"))!;
    expect(chat.body!.model).toBe("openrouter/free");
    expect(chat.body!.provider).toEqual({ max_price: { prompt: 0, completion: 0, request: 0, image: 0 } });
    expect(chat.auth).toBe(`Bearer ${OR}`);
    expect(f.calls.every((c) => new URL(c.url).host === "openrouter.ai")).toBe(true);
    expect(f.calls.some((c) => JSON.stringify(c.body).includes("paid-model") || JSON.stringify(c.body).includes("gpt-oss-120b"))).toBe(false);
    expect(f.calls.filter((c) => c.url.endsWith("/models")).every((c) => c.auth === null)).toBe(true);     // the public list is read without the key
  });
  it("nur bezahlte Modelle in der Liste: nichts wird gesendet", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    const f = fake((c) => c.url.endsWith("/models") ? json(orModels(["big/paid-model", "0.00003", 1000000], ["x/y", "0.000001", 8000])) : json(chatOk("nie")));
    await expect(askLocal("openrouter", "Frage?", [], { fetcher: f.fetcher })).rejects.toThrow(/kein kostenloses Modell/);
    expect(f.calls.some((c) => c.url.endsWith("/chat/completions"))).toBe(false);
  });
  it("Modellliste ist höchstens 5 Minuten alt und wird sonst vor der Anfrage neu geprüft; ein Modell, das kostenpflichtig wurde, fällt heraus", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    let priced = false;
    const f = fake((c) => c.url.endsWith("/models") ? json(orModels(["openrouter/free", priced ? "0.000002" : "0", 200000], ["meta/llama-3.3-70b:free", "0", 131072])) : json(chatOk("ok", "meta/llama-3.3-70b:free")));
    const t0 = 1_000_000;
    await askLocal("openrouter", "Frage eins?", [], { fetcher: f.fetcher, now: t0 });
    await askLocal("openrouter", "Frage zwei?", [], { fetcher: f.fetcher, now: t0 + 60_000 });
    expect(f.calls.filter((c) => c.url.endsWith("/models"))).toHaveLength(1);
    priced = true;
    await askLocal("openrouter", "Frage drei?", [], { fetcher: f.fetcher, now: t0 + 6 * 60_000 });
    expect(f.calls.filter((c) => c.url.endsWith("/models"))).toHaveLength(2);
    expect(f.calls.filter((c) => c.url.endsWith("/chat/completions")).at(-1)!.body!.model).toBe("meta/llama-3.3-70b:free");
  });
  it("Fehler verständlich: ungültiger Schlüssel (401), Limit (429), Serverfehler, kein Netz", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    const mk = (res: () => Response) => fake((c) => c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : res());
    await expect(askLocal("openrouter", "a?", [], { fetcher: mk(() => json({}, 401)).fetcher })).rejects.toThrow(/Schlüssel wird abgelehnt/);
    resetLocalAiState();
    await expect(askLocal("openrouter", "b?", [], { fetcher: mk(() => json({}, 429, { "retry-after": "30" })).fetcher })).rejects.toThrow(/Limit erreicht/);
    await expect(askLocal("openrouter", "c?", [], { fetcher: mk(() => json({}, 500)).fetcher })).rejects.toThrow(/Limit erreicht|nicht verfügbar|gestört/);   // cooldown from before, or the failure itself
    resetLocalAiState();
    await expect(askLocal("openrouter", "d?", [], { fetcher: (async () => { throw new TypeError("net"); }) as unknown as typeof fetch })).rejects.toThrow(/nicht erreichbar/);
  });
  it("Verbindungstest: Modelle gezählt, eine kleine Frage beantwortet", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    const f = fake((c) => c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000], ["paid/x", "0.1", 1000])) : json(chatOk("Verbindung steht.", "x/y:free")));
    const r = await testLocal("openrouter", { fetcher: f.fetcher });
    expect(r.ok).toBe(true); expect(r.models).toBe(1);
  });
});

describe("Die Kette ohne PC", () => {
  it("OpenRouter voll → Groq antwortet, und die Antwort sagt es; gesperrte Schlüssel werden nicht benutzt", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    await saveLocalKey("groq", GR, PASS, { attested: true });
    const f = fake((c) => {
      if (c.url.includes("openrouter.ai")) return c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : json({}, 429, { "retry-after": "30" });
      return c.url.endsWith("/models") ? json({ data: [{ id: "llama-3.3-70b-versatile", context_window: 131072 }, { id: "whisper-large-v3" }] }) : json(chatOk("Von Groq.", "llama-3.3-70b-versatile"));
    });
    const a = await askLocalChain("Wie lange schlafen?", [], { fetcher: f.fetcher });
    expect(a.provider).toBe("groq"); expect(a.label).toBe("Beantwortet von Groq – kostenloses Modell (llama-3.3-70b-versatile)");
    expect(f.calls.some((c) => JSON.stringify(c.body).includes("whisper"))).toBe(false);
    expect(f.calls.filter((c) => c.url.includes("api.groq.com") && c.auth !== `Bearer ${GR}`)).toEqual([]);   // Groq's key only goes to Groq
    expect(f.calls.filter((c) => c.url.includes("openrouter.ai") && c.auth === `Bearer ${GR}`)).toEqual([]);
    lockLocalAi();
    await expect(askLocalChain("Noch eine Frage?", [], { fetcher: f.fetcher })).rejects.toThrow(/Momentan ist keine kostenlose externe KI erreichbar/);
  });
  it("fällt alles aus, kommt die ehrliche Meldung mit den Gründen; mit Zustimmung springt zuletzt Pollinations ein", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    const f = fake((c) => c.url.includes("text.pollinations.ai") ? json(chatOk("Von Pollinations.", "gpt-oss")) : c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : json({}, 500));
    await expect(askLocalChain("Frage?", [], { fetcher: f.fetcher })).rejects.toThrow(/OpenRouter:/);
    resetLocalAiState();
    setFreeAiConsent("yes");
    const a = await askLocalChain("Frage?", [], { fetcher: f.fetcher });
    expect(a.provider).toBe("pollinations");
  });
});

describe("Vom Handy an den PC übertragen", () => {
  it("überträgt entsperrte Schlüssel, die der PC noch nicht hat – einmal, ohne den PC-eigenen Schlüssel zu überschreiben", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    await saveLocalKey("groq", GR, PASS, { attested: true });
    const sent: [string, string, boolean][] = [];
    const send = async (p: string, k: string, a: boolean) => { sent.push([p, k, a]); };
    const already = new Set<string>();
    const pc = [{ id: "openrouter", state: "setup", keySet: false }, { id: "groq", state: "ready", keySet: true }, { id: "pollinations", state: "ready" }];
    const r = await transferKeysToPc(pc, send, already);
    expect(r.done).toEqual(["openrouter"]);                                  // Groq has its own key at the PC
    expect(sent).toEqual([["openrouter", OR, true]]);
    expect((await transferKeysToPc(pc, send, already)).done).toEqual([]);    // not again
  });
  it("gesperrt: nichts geht raus; Fehler bei einem stoppt den anderen nicht und wird später wiederholt", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    await saveLocalKey("groq", GR, PASS, { attested: true });
    const pc = [{ id: "openrouter", state: "setup" }, { id: "groq", state: "setup" }];
    let calls = 0;
    const flaky = async (p: string) => { calls++; if (p === "openrouter") throw new Error("PC gerade nicht erreichbar"); };
    const already = new Set<string>();
    const r = await transferKeysToPc(pc, flaky, already);
    expect(r.done).toEqual(["groq"]); expect(r.failed.map((f) => f.provider)).toEqual(["openrouter"]);
    expect((await transferKeysToPc(pc, async () => {}, already)).done).toEqual(["openrouter"]);   // retried
    lockLocalAi();
    expect(calls).toBe(2);
    expect((await transferKeysToPc(pc, async () => { calls++; }, new Set())).done).toEqual([]);   // locked: nothing leaves
    expect(calls).toBe(2);
  });
});

describe("Cerebras und Mistral ohne PC", () => {
  it("Schlüsselformen: jeder Schlüssel passt nur in den eigenen Platz", () => {
    expect(keyLooksRight("cerebras", CS)).toBe(true); expect(keyLooksRight("cerebras", GR)).toBe(false); expect(keyLooksRight("cerebras", OR)).toBe(false);
    expect(keyLooksRight("mistral", MI)).toBe(true); expect(keyLooksRight("mistral", CS)).toBe(false); expect(keyLooksRight("mistral", GR)).toBe(false);
    expect(keyLooksRight("mistral", "AIzaSyA0123456789abcdefghijklmnopqrstuv")).toBe(false);           // a Google key
    expect(isChatModel("voxtral-mini-latest")).toBe(false); expect(isChatModel("mistral-ocr-latest")).toBe(false);
    expect(rankModel("mistral-large-latest", 0)).toBeGreaterThan(rankModel("mistral-small-latest", 0));
  });
  it("ohne Bestätigung „kostenloser Tarif“ wird nichts gespeichert; danach gilt sie nur für den eigenen Dienst", async () => {
    await expect(saveLocalKey("cerebras", CS, PASS)).rejects.toThrow(/Cerebras-Konto ist im kostenlosen Tarif/);
    await expect(saveLocalKey("mistral", MI, PASS)).rejects.toThrow(/Mistral-Konto ist im kostenlosen Tarif/);
    await saveLocalKey("cerebras", CS, PASS, { attested: true });
    expect(localAiSnapshot().attested).toMatchObject({ cerebras: true, mistral: false, groq: false });
    await expect(saveLocalKey("mistral", MI, PASS)).rejects.toThrow(/kostenlosen Tarif/);                 // Cerebras' yes is not Mistral's yes
    removeLocalKey("cerebras");
    expect(localAiSnapshot().attested.cerebras).toBe(false);
  });
  it("die Kette: Cerebras voll → Mistral antwortet mit Namen; jeder Schlüssel geht nur an den eigenen Host; Nicht-Chat-Modelle werden nie gefragt", async () => {
    await saveLocalKey("cerebras", CS, PASS, { attested: true });
    await saveLocalKey("mistral", MI, PASS, { attested: true });
    expect(readyProviders()).toEqual(["cerebras", "mistral"]);
    const f = fake((c) => {
      if (c.url.includes("api.cerebras.ai")) return c.url.endsWith("/models") ? json({ data: [{ id: "llama-3.3-70b" }] }) : json({}, 429, { "retry-after": "30" });
      return c.url.endsWith("/models")
        ? json({ data: [{ id: "mistral-large-latest", capabilities: { completion_chat: true }, max_context_length: 131072 }, { id: "mistral-embed", capabilities: { completion_chat: false } }, { id: "voxtral-mini-latest", capabilities: { completion_chat: true } }] })
        : json(chatOk("Von Mistral.", "mistral-large-latest"));
    });
    const a = await askLocalChain("Wie lange schlafen?", [], { fetcher: f.fetcher });
    expect(a.provider).toBe("mistral"); expect(a.label).toBe("Beantwortet von Mistral – kostenloses Modell (mistral-large-latest)");
    expect(f.calls.filter((c) => c.url.includes("api.cerebras.ai") && c.auth !== `Bearer ${CS}`)).toEqual([]);
    expect(f.calls.filter((c) => c.url.includes("api.mistral.ai") && c.auth !== `Bearer ${MI}`)).toEqual([]);
    expect(f.calls.some((c) => JSON.stringify(c.body).includes("embed") || JSON.stringify(c.body).includes("voxtral"))).toBe(false);
  });
  it("ein Schlüssel von früher (nur Groq bestätigt, altes Format) bleibt bestätigt", async () => {
    local.setItem("pgl.localai", JSON.stringify({ groq: { v: 1, salt: "AA==", iv: "AA==", ct: "AA==" }, groqAttested: true }));
    lockLocalAi(); resetLocalAiState();
    await saveLocalKey("mistral", MI, PASS, { attested: true }).catch(() => {});                          // wrong password for the old key → refused, nothing changes
    expect(JSON.parse(local.getItem("pgl.localai")!).groqAttested).toBe(true);
  });
});

describe("Websuche ohne PC", () => {
  const TV = "tvly-dev-0123456789abcdefABCDEF", SP = "0123456789abcdef0123456789abcdef01234567";
  it("erkennt Fragen nach Aktuellem (Sport!) und lässt Befehle und App-Fragen in Ruhe", () => {
    for (const q of ["Wer spielt gegen Bayern nächstes Spiel?", "Wie steht es gerade bei Bayern gegen Dortmund?", "Wie ist der Spielstand Bayern gegen Dortmund?", "Wann spielt der FC Bayern als nächstes?"]) expect(wantsLiveData(q)).toBe(true);
    for (const q of ["Starte Discord und mach leiser", "Wie funktioniert das Soundboard?", "Hi"]) expect(wantsLiveData(q)).toBe(false);
  });
  it("Schlüsselformen, ein Passwort für alles, gesperrt nach dem Löschen", async () => {
    expect(searchKeyLooksRight("tavily", TV)).toBe(true); expect(searchKeyLooksRight("tavily", SP)).toBe(false);
    expect(searchKeyLooksRight("serper", SP)).toBe(true); expect(searchKeyLooksRight("serper", TV)).toBe(false);
    await expect(saveLocalSearchKey("tavily", SP, PASS)).rejects.toThrow(/Tavily-Schlüssel/);
    await saveLocalKey("openrouter", OR, PASS);
    lockLocalAi();                                                                    // the AI key is locked now
    await expect(saveLocalSearchKey("tavily", TV, "anderes-pw-1")).rejects.toThrow(/passt nicht/);
    await saveLocalSearchKey("tavily", TV, PASS);
    expect(readySearch()).toEqual(["tavily"]);
    lockLocalAi(); expect(readySearch()).toEqual([]);
    await unlockLocalAi(PASS); expect(readySearch()).toEqual(["tavily"]);              // one unlock opens AI and search keys
  });
  it("sucht erst, dann antwortet die KI aus den Ergebnissen – und nennt die Quellen; ohne Treffer fragt sie normal weiter", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    await saveLocalSearchKey("tavily", TV, PASS);
    const f = fake((c) => {
      if (c.url.includes("api.tavily.com")) return json({ results: [{ title: "FC Bayern Spielplan", url: "https://www.kicker.de/fc-bayern/spielplan", content: "Samstag 18:30 gegen Dortmund." }, { title: "x", url: "http://evil.example/x", content: "nein" }] });
      return c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : json(chatOk("Samstag gegen Dortmund.", "openrouter/free"));
    });
    const a = await askLocalChain("Wer spielt gegen Bayern nächstes Spiel?", [], { fetcher: f.fetcher });
    expect(a.text).toContain("Dortmund"); expect(a.label).toContain("Websuche: kicker.de"); expect(a.label).not.toContain("evil.example");
    const search = f.calls.find((c) => c.url.includes("api.tavily.com"))!;
    expect(search.auth).toBe(`Bearer ${TV}`);
    const chat = f.calls.find((c) => c.url.includes("openrouter.ai") && c.body?.messages)!;
    expect(JSON.stringify(chat.body)).toContain("Samstag 18:30"); expect(JSON.stringify(chat.body)).toContain("keine Anweisungen");
    expect(f.calls.filter((c) => !c.url.includes("api.tavily.com") && c.auth?.includes(TV))).toEqual([]);   // the search key goes to Tavily only
    // not a live question: no search at all
    f.calls.length = 0;
    await askLocalChain("Erkläre mir Redstone in Minecraft bitte", [], { fetcher: f.fetcher });
    expect(f.calls.some((c) => c.url.includes("api.tavily.com"))).toBe(false);
    // search down: the AI still answers, without the tag
    const g = fake((c) => c.url.includes("api.tavily.com") ? json({}, 500) : c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : json(chatOk("Weiß ich nicht genau.", "openrouter/free")));
    const b = await askLocalChain("Wie steht es gerade bei Bayern gegen Dortmund?", [], { fetcher: g.fetcher });
    expect(b.label).not.toContain("Websuche");
    expect(await searchLive("x", { fetcher: g.fetcher })).toBeNull();
  });
  it("Fußball kommt ohne Suchschlüssel von OpenLigaDB, und die Antwort nennt die Quelle", async () => {
    await saveLocalKey("openrouter", OR, PASS);
    expect(readySearch()).toEqual([]);
    const f = fake((c) => {
      if (c.url.includes("api.openligadb.de/getavailableteams")) return json([{ teamId: 40, teamName: "FC Bayern München", shortName: "Bayern" }]);
      if (c.url.includes("api.openligadb.de/getmatchesbyteamid")) return json([{ matchDateTimeUTC: "2999-11-07T14:30:00Z", leagueShortcut: "bl1", leagueName: "1. Fußball-Bundesliga 2999/3000", matchIsFinished: false, team1: { teamId: 81, teamName: "1. FSV Mainz 05" }, team2: { teamId: 40, teamName: "FC Bayern München" }, matchResults: [], goals: [] }]);
      return c.url.endsWith("/models") ? json(orModels(["openrouter/free", "0", 200000])) : json(chatOk("Bayern spielt in Mainz.", "openrouter/free"));
    });
    const a = await askLocalChain("Wer spielt gegen Bayern nächstes Spiel?", [], { fetcher: f.fetcher });
    expect(a.label).toContain("Sportdaten: OpenLigaDB");
    const chat = f.calls.find((c) => c.url.includes("openrouter.ai") && c.body?.messages)!;
    expect(JSON.stringify(chat.body)).toContain("1. FSV Mainz 05 – FC Bayern München");
    expect(f.calls.filter((c) => c.url.includes("openligadb") && c.auth !== null)).toEqual([]);          // no key, no login to the sports service
  });
});

describe("Whisper (Groq) für die Sprache", () => {
  it("filtert erfundene Sätze bei Stille und kurzes Rauschen", () => {
    expect(cleanTranscript("  Starte   Among Us ", [{ no_speech_prob: 0.01 }])).toBe("Starte Among Us");
    expect(cleanTranscript("Untertitel der Amara.org-Community", [])).toBe("");
    expect(cleanTranscript("Vielen Dank fürs Zuschauen!", [{ no_speech_prob: 0.2 }])).toBe("");
    expect(cleanTranscript("Hallo", [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.8 }])).toBe("");
    expect(cleanTranscript("Hallo Welt", [{ no_speech_prob: 0.9 }, { no_speech_prob: 0.1 }])).toBe("Hallo Welt");
  });
  it("braucht den entsperrten, als kostenlos bestätigten Groq-Schlüssel und schickt ihn nur an Groq", async () => {
    await expect(transcribeGroq(new Blob([new Uint8Array(3000)], { type: "audio/webm" }), "de")).rejects.toThrow(/gesperrt/);
    expect(whisperKeyReady()).toBe(false);
    await saveLocalKey("groq", GR, PASS, { attested: true });
    expect(whisperKeyReady()).toBe(true);
    const calls: { url: string; auth: string | null; form: FormData }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => { calls.push({ url, auth: new Headers(init?.headers).get("authorization"), form: init!.body as FormData }); return json({ text: " Starte Among Us. ", segments: [{ no_speech_prob: 0.02 }] }); }) as unknown as typeof fetch;
    const text = await transcribeGroq(new Blob([new Uint8Array(3000)], { type: "audio/webm;codecs=opus" }), "de-DE", { fetcher });
    expect(text).toBe("Starte Among Us.");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/audio/transcriptions"); expect(calls[0].auth).toBe(`Bearer ${GR}`);
    expect(calls[0].form.get("model")).toBe("whisper-large-v3-turbo"); expect(calls[0].form.get("language")).toBe("de");
    expect(await transcribeGroq(new Blob([new Uint8Array(100)]), "de", { fetcher })).toBe("");   // too short: nothing is sent
    expect(calls).toHaveLength(1);
    const limit = (async () => json({}, 429, { "retry-after": "20" })) as unknown as typeof fetch;
    await expect(transcribeGroq(new Blob([new Uint8Array(3000)], { type: "audio/webm" }), "de", { fetcher: limit })).rejects.toThrow(/Limit/);
  });
});

describe("ElevenLabs auf dem Gerät", () => {
  const EL = "sk_0123456789abcdef0123456789abcdef0123456789ab";
  it("Schlüsselform, ein Passwort für alles, nur an den eigenen Host", async () => {
    expect(elevenKeyLooksRight(EL)).toBe(true); expect(elevenKeyLooksRight(GR)).toBe(false); expect(elevenKeyLooksRight("0123456789abcdef0123456789abcdef")).toBe(true);
    await expect(saveLocalElevenKey(GR, PASS)).rejects.toThrow(/ElevenLabs-Schlüssel/);
    await saveLocalKey("openrouter", OR, PASS);
    lockLocalAi();
    await expect(saveLocalElevenKey(EL, "anderes-pw-1")).rejects.toThrow(/passt nicht/);
    await saveLocalElevenKey(EL, PASS);
    expect(elevenDeviceReady()).toBe(true);
    lockLocalAi(); expect(elevenDeviceReady()).toBe(false);
    await unlockLocalAi(PASS); expect(elevenDeviceReady()).toBe(true);                                       // one unlock opens all keys
  });
  it("Spracherkennung (Scribe) und Stimme gehen direkt an ElevenLabs, mit dem Schlüssel im Header und ohne Cookies", async () => {
    await saveLocalElevenKey(EL, PASS);
    const calls: { url: string; key: string | null; body: unknown; cred: unknown }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, key: new Headers(init?.headers).get("xi-api-key"), body: init?.body, cred: init?.credentials });
      if (url.includes("/speech-to-text")) return json({ text: " Starte  Among Us. " });
      if (url.includes("/text-to-speech/")) return new Response(new Uint8Array(900), { headers: { "content-type": "audio/mpeg" } });
      return json({ tier: "free", character_count: 120, character_limit: 10000 });
    }) as unknown as typeof fetch;
    expect(await transcribeEleven(new Blob([new Uint8Array(3000)], { type: "audio/webm" }), "de-DE", { fetcher })).toBe("Starte Among Us.");
    expect((calls[0].body as FormData).get("model_id")).toBe("scribe_v1"); expect((calls[0].body as FormData).get("language_code")).toBe("deu");
    expect(await transcribeEleven(new Blob([new Uint8Array(100)]), "de", { fetcher })).toBe("");               // too short: nothing sent
    const b = await speakElevenDevice("Hallo Nils", { fetcher });
    expect(b.size).toBe(900);
    const t = await testLocalEleven({ fetcher });
    expect(t.ok).toBe(true); expect(t.message).toContain("120 von 10000");
    expect(calls.every((c) => c.url.startsWith("https://api.elevenlabs.io/") && c.key === EL && c.cred === "omit")).toBe(true);
    const bad = (async () => json({}, 401)) as unknown as typeof fetch;
    await expect(speakElevenDevice("Hallo", { fetcher: bad })).rejects.toThrow(/abgelehnt/);
    const full = (async () => json({}, 429)) as unknown as typeof fetch;
    await expect(transcribeEleven(new Blob([new Uint8Array(3000)], { type: "audio/webm" }), "de", { fetcher: full })).rejects.toThrow(/Kontingent/);
  });
});
