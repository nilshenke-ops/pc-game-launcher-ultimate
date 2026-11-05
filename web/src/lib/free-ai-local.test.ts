import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the browser's storage (the tests run in node).
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m }; };
const local = mem(), session = mem();
vi.stubGlobal("window", { localStorage: local, sessionStorage: session });

import { askLocal, askLocalChain, isChatModel, isFreeOpenRouter, keyLooksRight, localAiSnapshot, lockLocalAi, lockSecret, rankModel, readyProviders, removeLocalKey, resetLocalAiState, saveLocalKey, testLocal, transferKeysToPc, unlockLocalAi, unlockSecret } from "./free-ai-local";
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
  lockLocalAi(); removeLocalKey("openrouter"); removeLocalKey("groq"); removeLocalKey("cerebras"); removeLocalKey("mistral"); resetLocalAiState(); resetFreeAiBudget(); resetFreeAiPause(); setFreeAiConsent("no");
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
