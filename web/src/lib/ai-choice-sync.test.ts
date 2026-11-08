import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiChoice } from "./ai-choice";
import { applyAiChoiceToPc, orderFor, rememberAiChoice, resetAiChoiceSync, sameAiChoice, type PcAi } from "./ai-choice-sync";
import type { AccountRpc } from "./memory-sync";

const PC: PcAi = { providers: [{ id: "openrouter" }, { id: "groq" }, { id: "pollinations" }, { id: "ollama" }], strategy: "fallback", auto: false, single: null };
const choice = (o: Partial<AiChoice> = {}): AiChoice => ({ order: ["openrouter", "groq", "pollinations", "ollama"], strategy: "fallback", single: null, ...o });

interface Call { method: string; params?: unknown }

function fake(status: PcAi | Error, opts: { local?: boolean; admin?: boolean; online?: boolean } = {}) {
  const calls: Call[] = [];
  const rpc: AccountRpc = {
    status: { phase: opts.online === false ? "offline" : "online", auth: "ok", me: { isLocal: opts.local !== false } },
    can: () => opts.admin !== false,
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === "ai.status") { if (status instanceof Error) throw status; return status as never; }
      if (method === "ai.order" || method === "ai.strategy") return status as never;
      throw new Error("unerwartet: " + method);
    },
  };
  return { rpc, calls };
}

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), _m: m }; };

beforeEach(() => { resetAiChoiceSync(); vi.unstubAllGlobals(); });

describe("Reihenfolge und Betriebsart vergleichen", () => {
  it("kennt die Reihenfolge des PCs und hängt unbekannte KIs hinten an", () => {
    expect(orderFor(choice({ order: ["groq", "openrouter"] }), ["openrouter", "groq", "pollinations", "ollama"]))
      .toEqual(["groq", "openrouter", "pollinations", "ollama"]);
    expect(orderFor(choice({ order: ["mistral", "groq"] }), ["openrouter", "groq"])).toEqual(["groq", "openrouter"]);
  });

  it("erkennt gleiche und andere Einstellungen", () => {
    expect(sameAiChoice(choice(), PC)).toBe(true);
    expect(sameAiChoice(choice({ order: ["groq", "openrouter", "pollinations", "ollama"] }), PC)).toBe(false);
    expect(sameAiChoice(choice({ strategy: "race" }), PC)).toBe(false);
    expect(sameAiChoice(choice({ strategy: "single", single: "groq" }), PC)).toBe(false);
    expect(sameAiChoice(choice({ strategy: "single", single: "groq" }), { ...PC, strategy: "single", single: "groq" })).toBe(true);
    // an older companion without "strategy" tells it by "auto"
    expect(sameAiChoice(choice({ strategy: "fallback" }), { ...PC, strategy: undefined, auto: true })).toBe(true);
  });
});

describe("KI-Auswahl automatisch auf den PC", () => {
  it("setzt Reihenfolge und Betriebsart, wenn der PC anders eingestellt ist", async () => {
    const pc: PcAi = { ...PC, providers: [{ id: "openrouter" }, { id: "groq" }, { id: "pollinations" }, { id: "ollama" }], strategy: "single", single: "openrouter" };
    const { rpc, calls } = fake(pc);
    const want = choice({ order: ["groq", "mistral", "openrouter"], strategy: "fallback" });
    expect(await applyAiChoiceToPc(rpc, { quiet: true }, want)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["ai.status", "ai.order", "ai.strategy"]);
    expect(calls[1].params).toEqual({ order: ["groq", "openrouter", "pollinations", "ollama"] });
    expect(calls[2].params).toEqual({ strategy: "fallback" });
  });

  it("wählt bei „Nur eine KI“ auch den Anbieter", async () => {
    const { rpc, calls } = fake(PC);
    expect(await applyAiChoiceToPc(rpc, { quiet: true }, choice({ strategy: "single", single: "groq" }))).toBe(true);
    expect(calls.filter((c) => c.method === "ai.order")).toHaveLength(0);
    expect(calls[1].params).toEqual({ strategy: "single", single: "groq" });
  });

  it("lässt den PC in Ruhe, wenn schon alles stimmt", async () => {
    const { rpc, calls } = fake(PC);
    expect(await applyAiChoiceToPc(rpc, { quiet: true }, choice())).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["ai.status"]);
  });

  it("macht nichts ohne gemerkte Auswahl, ohne PC selbst oder ohne Verwaltungsrecht", async () => {
    const empty = fake(PC);
    expect(await applyAiChoiceToPc(empty.rpc, { quiet: true }, null)).toBe(false);
    expect(empty.calls).toEqual([]);
    const phone = fake(PC, { local: false });
    expect(await applyAiChoiceToPc(phone.rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(false);
    expect(phone.calls).toEqual([]);
    const weak = fake(PC, { admin: false });
    expect(await applyAiChoiceToPc(weak.rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(false);
    expect(weak.calls).toEqual([]);
  });

  it("versucht es beim nächsten Verbinden erneut", async () => {
    const broken = fake(new Error("keine Verbindung"));
    expect(await applyAiChoiceToPc(broken.rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(false);
    const ok = fake(PC);
    expect(await applyAiChoiceToPc(ok.rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(true);
  });

  it("meldet sich nicht doppelt, wenn schon übernommen wurde", async () => {
    const { rpc, calls } = fake(PC);
    expect(await applyAiChoiceToPc(rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(true);
    const before = calls.length;
    expect(await applyAiChoiceToPc(rpc, { quiet: true }, choice({ strategy: "race" }))).toBe(false);
    expect(calls.length).toBe(before);
  });
});

describe("Auswahl ins Konto schreiben", () => {
  it("nimmt den Stand des PCs und speichert ihn für die anderen Geräte", async () => {
    const local = mem();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: mem() });
    const { rpc } = fake({ ...PC, strategy: "single", single: "groq" });
    const saved = await rememberAiChoice(rpc);
    expect(saved).toMatchObject({ order: ["openrouter", "groq", "pollinations", "ollama"], strategy: "single", single: "groq" });
    const raw = JSON.parse(local.getItem("pgl.aiChoice") ?? "null");
    expect(raw).toMatchObject({ strategy: "single", single: "groq" });
    expect(typeof raw.savedAt).toBe("number");
  });
});
