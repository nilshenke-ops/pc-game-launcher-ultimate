import { beforeEach, describe, expect, it } from "vitest";
import { askFreeAi, buildMessages, cleanAnswer, FREE_AI_PER_HOUR, FreeAiError, freeAiBudget, looksLikePaymentNotice, resetFreeAiBudget, resetFreeAiPause, setFreeAiConsent } from "./free-ai";

const ok = (content: unknown, model = "gpt-oss-20b") => new Response(JSON.stringify({ choices: [{ message: { content } }], model }), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => { setFreeAiConsent("yes"); resetFreeAiBudget(); resetFreeAiPause(); });

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
    await expect(askFreeAi("a", f(() => new Response("", { status: 429, headers: { "retry-after": "60" } })))).rejects.toThrow(/alle 45 Sekunden.*60 Sekunden/);
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

  it("die Budget-Meldung des anonymen Zugangs ist keine Antwort – und der Dienst wird danach eine Weile in Ruhe gelassen", async () => {
    const notice = new Response(JSON.stringify({ model: "gpt-oss", choices: [{ message: { content: "The API key used for this request has reached its budget. Please [raise the key budget](https://enter.pollinations.ai/edit-key), then try again." } }], usage: { prompt_tokens: 0, completion_tokens: 0 } }), { status: 200 });
    let calls = 0;
    const fetcher = (async () => { calls++; return notice.clone(); }) as unknown as typeof fetch;
    await expect(askFreeAi("Wie hoch ist der Mount Everest?", { fetcher, now: 1_000 })).rejects.toThrow(/aufgebraucht|Budget/);
    await expect(askFreeAi("Und der K2?", { fetcher, now: 2_000 })).rejects.toThrow(/Weile/);
    expect(calls).toBe(1);                                              // the second question did not even go out
    await expect(askFreeAi("Und der K2?", { fetcher, now: 1_000 + 31 * 60_000 })).rejects.toThrow(FreeAiError);   // after the pause it is asked again (and gets the notice again)
    expect(calls).toBe(2);
  });
  it("Zahlungswörter in einer echten, langen Antwort sind keine Meldung", () => {
    expect(looksLikePaymentNotice("Please top up your credits.", 0)).toBe(true);
    expect(looksLikePaymentNotice("Erwachsene brauchen etwa 7 bis 9 Stunden Schlaf.", 14)).toBe(false);
    expect(looksLikePaymentNotice("Im Spiel kostet das Upgrade 500 Credits. ".repeat(20), 200)).toBe(false);
  });

  it("Tempolimit des Dienstes (402 FREE_LIMIT mit Retry-After): kurz abwarten, dann genau einmal neu fragen", async () => {
    let calls = 0; const waits: number[] = [];
    const fetcher = (async () => { calls++; return calls === 1 ? new Response("{\"error\":{\"code\":\"FREE_LIMIT\"}}", { status: 402, headers: { "retry-after": "1" } }) : ok("Etwa 8 848 Meter."); }) as unknown as typeof fetch;
    const t0 = Date.now();
    const r = await askFreeAi("Wie hoch ist der Mount Everest?", { fetcher, onWait: (s) => waits.push(s) });
    expect(r.text).toContain("8 848");
    expect(calls).toBe(2); expect(waits).toEqual([1]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });
  it("schnelle Einstellungen: openai-fast, wenig Nachdenken, kurze Antwort – und wird die Einstellung abgelehnt (400), geht es ohne", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetcher = (async (_u: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); bodies.push(b); return "reasoning_effort" in b ? new Response("{}", { status: 400 }) : ok("Antwort."); }) as unknown as typeof fetch;
    const r = await askFreeAi("Frage?", { fetcher });
    expect(r.text).toBe("Antwort.");
    expect(bodies[0]).toMatchObject({ model: "openai-fast", reasoning_effort: "low", max_tokens: 400 });
    expect(bodies[1]).not.toHaveProperty("reasoning_effort");
    expect(bodies).toHaveLength(2);
  });
});
