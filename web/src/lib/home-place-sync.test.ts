import { beforeEach, describe, expect, it } from "vitest";
import { applyHomePlaceToPc, resetHomePlaceSync, sameHomePlace } from "./home-place-sync";
import type { AccountRpc } from "./memory-sync";

interface Call { method: string; params?: unknown }

function fake(pc: Record<string, unknown> | Error, opts: { local?: boolean; admin?: boolean; online?: boolean } = {}) {
  const calls: Call[] = [];
  const rpc: AccountRpc = {
    status: { phase: opts.online === false ? "offline" : "online", auth: "ok", me: { isLocal: opts.local !== false } },
    can: () => opts.admin !== false,
    call: async (method: string, params?: unknown) => {
      calls.push({ method, params });
      if (method === "assistant.status") {
        if (pc instanceof Error) throw pc;
        return pc as never;
      }
      if (method === "assistant.homePlace") return {} as never;
      throw new Error("unerwartet: " + method);
    },
  };
  return { rpc, calls };
}

beforeEach(() => resetHomePlaceSync());

describe("derselbe Ort", () => {
  it("ignoriert Groß-/Kleinschreibung, Leerzeichen und doppelte Leerzeichen", () => {
    expect(sameHomePlace("Adendorf", "adendorf ")).toBe(true);
    expect(sameHomePlace("Bad  Homburg", "bad homburg")).toBe(true);
    expect(sameHomePlace("Adendorf", "Bardowick")).toBe(false);
    expect(sameHomePlace("Homburg", "Bad Homburg")).toBe(false);
  });
});

describe("Wetter-Ort automatisch auf den PC", () => {
  it("setzt den Ort, wenn der PC einen anderen hat", async () => {
    const { rpc, calls } = fake({ homePlace: "Bardowick" });
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "Adendorf")).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["assistant.status", "assistant.homePlace"]);
    expect(calls[1].params).toEqual({ place: "Adendorf" });
  });

  it("lässt ihn in Ruhe, wenn er schon stimmt", async () => {
    const { rpc, calls } = fake({ homePlace: "adendorf" });
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "Adendorf")).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["assistant.status"]);
  });

  it("macht nichts ohne Ort im Konto", async () => {
    const { rpc, calls } = fake({ homePlace: "Adendorf" });
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "  ")).toBe(false);
    expect(calls).toEqual([]);
  });

  it("nur am PC selbst und nur mit Verwaltungsrecht", async () => {
    const phone = fake({ homePlace: "X" }, { local: false });
    expect(await applyHomePlaceToPc(phone.rpc, { quiet: true }, "Adendorf")).toBe(false);
    expect(phone.calls).toEqual([]);
    const weak = fake({ homePlace: "X" }, { admin: false });
    expect(await applyHomePlaceToPc(weak.rpc, { quiet: true }, "Adendorf")).toBe(false);
    expect(weak.calls).toEqual([]);
  });

  it("bleibt still, wenn der Begleiter den Aufruf noch nicht kennt", async () => {
    const { rpc, calls } = fake({ mode: "local" });                       // no homePlace field = older companion
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "Adendorf")).toBe(false);
    expect(calls.map((c) => c.method)).toEqual(["assistant.status"]);
  });

  it("versucht es beim nächsten Verbinden erneut", async () => {
    const broken = fake(new Error("keine Verbindung"));
    expect(await applyHomePlaceToPc(broken.rpc, { quiet: true }, "Adendorf")).toBe(false);
    const ok = fake({ homePlace: null });
    expect(await applyHomePlaceToPc(ok.rpc, { quiet: true }, "Adendorf")).toBe(true);
  });

  it("meldet sich nicht doppelt", async () => {
    const { rpc, calls } = fake({ homePlace: null });
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "Adendorf")).toBe(true);
    const before = calls.length;
    expect(await applyHomePlaceToPc(rpc, { quiet: true }, "Adendorf")).toBe(false);
    expect(calls.length).toBe(before);
  });

  it("übernimmt auf Knopfdruck auch bei gleichem Ort", async () => {
    const { rpc, calls } = fake({ homePlace: "Adendorf" });
    expect(await applyHomePlaceToPc(rpc, { quiet: true, force: true }, "Adendorf")).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["assistant.status", "assistant.homePlace"]);
  });
});
