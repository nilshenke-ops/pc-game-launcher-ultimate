import { describe, expect, it } from "vitest";
import { cacheIsFull, readCache, saveCache, savedOverview } from "./offline-cache";
import type { AppState } from "./types";

const live = {
  pcName: "Gaming-PC", version: "2.87.0", platform: "windows", startedAt: "2026-11-02T10:00:00Z", features: {},
  activeProfile: { id: "p1", name: "Zocken", color: "#22d3ee", icon: "gamepad" }, autoSwitch: true,
  running: [{ itemId: "g1", name: "Rocket League", since: "2026-11-02T11:00:00Z" }],
  playing: { playing: [{ id: "s", name: "Airhorn" }], queued: 2 },
  relay: { state: "connected", url: "https://x", clients: 3 }, lanUrls: ["http://192.168.0.5:8787"], lanAccess: true,
  audio: { supported: true, output: "Lautsprecher", mic: "Mikro", volume: 0.5, missing: [] },
  counts: { games: 12, programs: 3, sounds: 8, devices: 2, notifications: 1 }, me: { isLocal: false, name: "Handy", permissions: ["view"], transport: "ws" },
  updates: { current: "2.87.0", state: "ready", downloaded: true, canInstall: true },
} as unknown as AppState;

const mem = new Map<string, string>();
const api = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), key: () => null, clear: () => mem.clear(), length: 0 };
// Like the real one, Object.keys() lists the stored keys.
(globalThis as unknown as { localStorage: Storage }).localStorage = new Proxy(api, { ownKeys: () => [...mem.keys()], getOwnPropertyDescriptor: (_t, k) => (mem.has(String(k)) ? { enumerable: true, configurable: true, value: mem.get(String(k)) } : undefined) }) as unknown as Storage;

describe("gespeicherte Übersicht", () => {
  it("behält Namen, Profil und Zähler, aber nie was gerade läuft oder spielt", () => {
    const s = savedOverview(live);
    expect(s.pcName).toBe("Gaming-PC");
    expect(s.activeProfile?.name).toBe("Zocken");
    expect(s.counts.games).toBe(12);
    expect(s.running).toEqual([]);
    expect(s.playing).toEqual({ playing: [], queued: 0 });
    expect(s.relay.clients).toBe(0);
    expect(s.updates.canInstall).toBe(false);
  });

  it("wird auf dem Gerät abgelegt und mit Datum zurückgelesen", () => {
    saveCache("state.get", savedOverview(live));
    const c = readCache<AppState>("state.get");
    expect(c?.data.pcName).toBe("Gaming-PC");
    expect(c!.at).toBeGreaterThan(0);
  });
});

describe("voller Speicher", () => {
  it("räumt die ältesten gespeicherten Stände weg und speichert den neuen", () => {
    mem.clear();
    let quota = 3;
    const orig = api.setItem;
    api.setItem = (k: string, v: string) => { if (!mem.has(k) && mem.size >= quota) throw new Error("QuotaExceeded"); orig(k, v); };
    mem.set("pgl.cache.library.list", JSON.stringify({ at: 1, data: 1 }));
    mem.set("pgl.cache.steam.list", JSON.stringify({ at: 2, data: 2 }));
    mem.set("pgl.cache.deck.list", JSON.stringify({ at: 3, data: 3 }));
    saveCache("quick.list", { actions: [] });
    expect(readCache("quick.list")).not.toBeNull();
    expect(mem.has("pgl.cache.library.list")).toBe(false); // the oldest one made room
    expect(mem.has("pgl.cache.deck.list")).toBe(true);
    expect(cacheIsFull()).toBe(false);
    quota = 0; mem.clear();
    saveCache("quick.list", { actions: [] });
    expect(cacheIsFull()).toBe(true);
  });
});
