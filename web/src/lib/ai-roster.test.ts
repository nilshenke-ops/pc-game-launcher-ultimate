import { describe, expect, it } from "vitest";
import { buildRoster, rosterSummary } from "./ai-roster";
import type { AiOverview, AiProvider } from "../components/ai-manager";

const P = (o: Partial<AiProvider> & { id: string }): AiProvider => ({ name: o.id, enabled: true, needsKey: true, keySet: false, attested: false, consent: false, state: "setup", stateText: "", privacy: "", cost: "", ...o });
const ov = (providers: AiProvider[]): AiOverview => ({ providers, auto: true, mode: "smart", smart: true, anyReady: providers.some((p) => p.state === "ready") });
const dev = (o: Partial<{ openrouter: "none" | "locked" | "ready"; groq: "none" | "locked" | "ready" }> = {}) => ({ openrouter: "none" as const, groq: "none" as const, groqAttested: false, ...o });

describe("Meine KIs", () => {
  it("trennt Funktioniert, Angefangen und Nicht eingerichtet – und sortiert in dieser Reihenfolge", () => {
    const rows = buildRoster(ov([
      P({ id: "openrouter", name: "OpenRouter", state: "ready", keySet: true, lastOkAt: "2026-11-05T10:00:00Z", lastModel: "x/y:free" }),
      P({ id: "groq", name: "Groq", state: "setup", keySet: true, attested: false, stateText: "Bitte bestätigen: kostenloser Tarif" }),
      P({ id: "pollinations", name: "Pollinations", state: "setup" }),
      P({ id: "ollama", name: "Ollama", state: "setup", needsKey: false }),
    ]), { keySet: false, gemini: { keySet: true, model: "gemini-flash" }, router: { baseUrl: "https://openrouter.ai/api/v1", keySet: false, models: [] } }, dev(), "no", () => "vor 5 Min");
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.openrouter).toMatchObject({ state: "works" }); expect(by.openrouter.text).toContain("vor 5 Min"); expect(by.openrouter.text).toContain("x/y:free");
    expect(by.groq).toMatchObject({ state: "begun", next: "Kostenlosen Tarif bestätigen" });
    expect(by.pollinations.state).toBe("none"); expect(by.ollama.state).toBe("none");
    expect(by.gemini.state).toBe("works"); expect(by.router).toMatchObject({ state: "begun", text: "Adresse eingetragen, Schlüssel fehlt" }); expect(by.claude.state).toBe("none");
    expect(by.local.state).toBe("works");
    const order = rows.map((r) => r.state); expect(order).toEqual([...order].sort((a, b) => ["works", "limit", "problem", "begun", "none"].indexOf(a) - ["works", "limit", "problem", "begun", "none"].indexOf(b)));
    expect(rosterSummary(rows)).toEqual({ works: 3, begun: 2, none: 3, problems: 0 });
  });
  it("Limit und abgelehnter Schlüssel sind eigene Zustände; ausgeschaltet zählt als angefangen", () => {
    const rows = buildRoster(ov([
      P({ id: "openrouter", state: "cooldown", keySet: true, stateText: "Limit erreicht – wieder ab 14:05" }),
      P({ id: "groq", state: "error", keySet: true, lastError: "Groq: Schlüssel abgelehnt" }),
      P({ id: "pollinations", state: "off", consent: true }),
    ]), null, dev());
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.openrouter.state).toBe("limit"); expect(by.groq).toMatchObject({ state: "problem", text: "Groq: Schlüssel abgelehnt" }); expect(by.pollinations).toMatchObject({ state: "begun", text: "Eingerichtet, aber ausgeschaltet" });
  });
  it("ohne PC: Schlüssel auf dem Gerät – bereit, gesperrt oder nichts; Pollinations nach Zustimmung", () => {
    const ready = buildRoster(null, null, dev({ openrouter: "ready", groq: "locked" }), "yes");
    const by = Object.fromEntries(ready.map((r) => [r.id, r]));
    expect(by.openrouter).toMatchObject({ state: "works", device: true }); expect(by.groq).toMatchObject({ state: "begun", device: true, next: "Mit dem Passwort entsperren" });
    expect(by.pollinations.state).toBe("works");
    expect(buildRoster(null, null, dev(), "no").find((r) => r.id === "pollinations")!.state).toBe("none");
  });
  it("Schlüssel am PC und auf dem Gerät: bleibt „funktioniert“, nennt beides", () => {
    const rows = buildRoster(ov([P({ id: "openrouter", state: "ready", keySet: true, lastOkAt: "x" }), P({ id: "groq" })]), null, dev({ openrouter: "ready" }));
    expect(rows.find((r) => r.id === "openrouter")!.text).toContain("auch auf diesem Gerät");
  });
});
