import { beforeEach, describe, expect, it } from "vitest";
import { askFreeAi, buildMessages, cleanAnswer, FREE_AI_PER_HOUR, FreeAiError, freeAiBudget, resetFreeAiBudget, setFreeAiConsent } from "./free-ai";

const ok = (content: unknown, model = "gpt-oss-20b") => new Response(JSON.stringify({ choices: [{ message: { content } }], model }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => { setFreeAiConsent("yes"); resetFreeAiBudget(); });

describe("Freie KI ohne PC", () => {
  it("sendet nur die Frage und die letzten Nachrichten – kein Schlüssel, keine Cookies, kein Referrer", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const r = await askFreeAi("Wie lange sollte man schlafen?", { fetcher: (async (url: string, init: RequestInit) => { seen = { url, init }; return ok("7 bis 9 Stunden."); }) as unknown as typeof fetch, now: 1 });
    expect(r).toEqual({ text: "7 bis 9 Stunden.", model: "gpt-oss-20b" });
    expect(seen!.url).toBe("https://text.pollinations.ai/openai");
    expect(seen!.init.credentials).toBe("omit");
    expect(seen!.init.referrerPolicy).toBe("no-referrer");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Wie lange sollte man schlafen?" });
    expect(Object.keys(seen!.init.headers as Record<string, string>)).toEqual(["content-type"]); // no Authorization
  });
  it("ohne Erlaubnis geht nichts raus", async () => {
    setFreeAiConsent("no");
    let called = false;
    await expect(askFreeAi("Hallo", { fetcher: (async () => { called = true; return ok("x"); }) as unknown as typeof fetch })).rejects.toThrow(/nicht erlaubt/);
    expect(called).toBe(false);
  });
  it("Verlauf: höchstens sechs frühere Nachrichten, gekürzt", () => {
    const h = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? ("bot" as const) : ("user" as const), text: "x".repeat(900) + i }));
    const m = buildMessages("Frage", h);
    expect(m).toHaveLength(8);              // system + 6 + question
    expect(m[1].content.length).toBe(500);
    expect(m[0].role).toBe("system");
    expect(m.at(-1)!.content).toBe("Frage");
  });
  it("Antworten werden zu reinem Text: kein Markup, keine Links", () => {
    expect(cleanAnswer("**Wichtig:** siehe [Seite](https://x.test/a) und https://evil.test <script>alert(1)</script>ok")).toBe("Wichtig: siehe Seite und  alert(1)ok");
    expect(cleanAnswer("a".repeat(5000)).length).toBe(1800);
  });
  it("Fehler werden in Sätzen erklärt: ausgelastet, Serverfehler, leer, kein Netz", async () => {
    const f = (r: () => Response | Promise<Response>) => ({ fetcher: (async () => r()) as unknown as typeof fetch });
    await expect(askFreeAi("a", f(() => new Response("", { status: 429 })))).rejects.toThrow(/ausgelastet/);
    await expect(askFreeAi("a", f(() => new Response("", { status: 503 })))).rejects.toThrow(/Fehler 503/);
    await expect(askFreeAi("a", f(() => ok("   ")))).rejects.toThrow(/leere Antwort/);
    await expect(askFreeAi("a", f(() => ok(null)))).rejects.toBeInstanceOf(FreeAiError);
    await expect(askFreeAi("a", { fetcher: (async () => { throw new TypeError("net"); }) as unknown as typeof fetch })).rejects.toThrow(/nicht erreichbar/);
  });
  it("höchstens 20 Fragen pro Stunde und Gerät", async () => {
    const t0 = 10_000_000_000;
    const before = freeAiBudget(t0);
    for (let i = 0; i < before; i++) await askFreeAi("a", { fetcher: (async () => ok("ja")) as unknown as typeof fetch, now: t0 });
    await expect(askFreeAi("a", { fetcher: (async () => ok("ja")) as unknown as typeof fetch, now: t0 })).rejects.toThrow(new RegExp(`${FREE_AI_PER_HOUR} Fragen`));
    expect(freeAiBudget(t0 + 3_700_000)).toBe(FREE_AI_PER_HOUR);          // an hour later it is free again
  });
});
