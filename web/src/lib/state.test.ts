import { describe, expect, it } from "vitest";
import { readCache, saveCache, savedOverview } from "./offline-cache";
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
(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), key: () => null, clear: () => mem.clear(), length: 0 };

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
