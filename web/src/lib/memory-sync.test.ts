import { beforeEach, describe, expect, it } from "vitest";
import type { MemorySettings } from "./memory-config";
import { applyMemoryToPc, memoryMismatch, resetMemorySync, sameMemoryPath, type MemoryRpc, type PcMemory } from "./memory-sync";

const PATH = "C:\\Users\\Test\\JARVIS-MEMORY";
const want = (o: Partial<MemorySettings> = {}): MemorySettings => ({ path: PATH, enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest", ...o });
const pcState = (o: Partial<PcMemory> = {}): PcMemory => ({ path: PATH, enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest", ...o });

interface Call { method: string; params?: unknown }

function fake(pc: PcMemory | Error, opts: { local?: boolean; admin?: boolean; online?: boolean; failConfigure?: boolean } = {}) {
  const calls: Call[] = [];
  const rpc: MemoryRpc = {
    status: { phase: opts.online === false ? "offline" : "online", auth: "ok", me: { isLocal: opts.local !== false } },
    can: () => opts.admin !== false,
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === "memory.status") {
        if (pc instanceof Error) throw pc;
        return pc as unknown as never;
      }
      if (method === "memory.configure") {
        if (opts.failConfigure) throw new Error("noch nicht bereit");
        return {} as never;
      }
      throw new Error("unerwartet: " + method);
    },
  };
  return { rpc, calls };
}

beforeEach(() => resetMemorySync());

describe("was der PC noch nicht hat", () => {
  it("nichts, wenn alles gleich ist", () => {
    expect(memoryMismatch(want(), pcState())).toEqual([]);
  });

  it("erkennt jeden Unterschied", () => {
    expect(memoryMismatch(want(), pcState({ path: "D:\\Vault" }))).toEqual(["path"]);
    expect(memoryMismatch(want(), pcState({ enabled: false }))).toEqual(["enabled"]);
    expect(memoryMismatch(want(), pcState({ writeEnabled: false }))).toEqual(["writeEnabled"]);
    expect(memoryMismatch(want(), pcState({ deleteEnabled: true }))).toEqual(["deleteEnabled"]);
    expect(memoryMismatch(want(), pcState({ auto: "auto" }))).toEqual(["auto"]);
    expect(memoryMismatch(want(), pcState({ path: null, enabled: false }))).toEqual(["path", "enabled"]);
  });

  it("sieht Groß-/Kleinschreibung, Schrägstriche und einen Schlussstrich als denselben Ordner", () => {
    expect(sameMemoryPath(PATH, "c:/users/test/jarvis-memory/")).toBe(true);
    expect(sameMemoryPath(PATH, "C:\\Users\\Test\\JARVIS-MEMORY \\")).toBe(true);
    expect(sameMemoryPath(PATH, "C:\\Users\\Test\\JARVIS-MEMORY2")).toBe(false);
    expect(sameMemoryPath(PATH, "")).toBe(false);
  });
});

describe("automatisch auf den PC", () => {
  it("stellt die Einstellungen ein, wenn der PC andere hat", async () => {
    const { rpc, calls } = fake(pcState({ path: "D:\\Vault", enabled: false }));
    expect(await applyMemoryToPc(rpc, { quiet: true }, want())).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["memory.status", "memory.configure"]);
    expect(calls[1].params).toEqual({ path: PATH, enabled: true, writeEnabled: true, deleteEnabled: false, auto: "suggest" });
  });

  it("lässt den PC in Ruhe, wenn schon alles stimmt", async () => {
    const { rpc, calls } = fake(pcState());
    expect(await applyMemoryToPc(rpc, { quiet: true }, want())).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["memory.status"]);
  });

  it("macht nichts, solange im Konto kein Ordner steht", async () => {
    const { rpc, calls } = fake(pcState());
    expect(await applyMemoryToPc(rpc, { quiet: true }, want({ path: "" }))).toBe(false);
    expect(calls).toEqual([]);
  });

  it("nur am PC selbst und nur mit Verwaltungsrecht", async () => {
    const off = fake(pcState({ path: "D:\\Vault" }), { local: false });
    expect(await applyMemoryToPc(off.rpc, { quiet: true }, want())).toBe(false);
    expect(off.calls).toEqual([]);
    const weak = fake(pcState({ path: "D:\\Vault" }), { admin: false });
    expect(await applyMemoryToPc(weak.rpc, { quiet: true }, want())).toBe(false);
    expect(weak.calls).toEqual([]);
    const offline = fake(pcState({ path: "D:\\Vault" }), { online: false });
    expect(await applyMemoryToPc(offline.rpc, { quiet: true }, want())).toBe(false);
    expect(offline.calls).toEqual([]);
  });

  it("versucht es beim nächsten Verbinden erneut, wenn der PC nicht antwortet", async () => {
    const broken = fake(new Error("keine Verbindung"));
    expect(await applyMemoryToPc(broken.rpc, { quiet: true }, want())).toBe(false);
    const ok = fake(pcState({ path: "D:\\Vault" }));
    expect(await applyMemoryToPc(ok.rpc, { quiet: true }, want())).toBe(true);
  });

  it("meldet sich nicht doppelt, wenn schon übernommen wurde", async () => {
    const { rpc, calls } = fake(pcState({ path: "D:\\Vault" }));
    expect(await applyMemoryToPc(rpc, { quiet: true }, want())).toBe(true);
    const before = calls.length;
    expect(await applyMemoryToPc(rpc, { quiet: true }, want())).toBe(false);
    expect(calls.length).toBe(before);
  });

  it("übernimmt auf Knopfdruck auch bei gleichem Stand", async () => {
    const { rpc, calls } = fake(pcState());
    expect(await applyMemoryToPc(rpc, { quiet: true, force: true }, want())).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["memory.status", "memory.configure"]);
  });

  it("läuft nicht doppelt gleichzeitig", async () => {
    const { rpc, calls } = fake(pcState({ path: "D:\\Vault" }));
    const [a, b] = await Promise.all([applyMemoryToPc(rpc, { quiet: true }, want()), applyMemoryToPc(rpc, { quiet: true }, want())]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(calls.filter((c) => c.method === "memory.configure")).toHaveLength(1);
  });
});
