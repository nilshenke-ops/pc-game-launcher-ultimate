import { describe, expect, it } from "vitest";
import { loadSteamIndex, lookup, type SteamIndex } from "./steam-index";

const idx: SteamIndex = {
  country: "de", currency: "EUR", updatedAt: "2026-10-20T16:24:00Z",
  items: [[1445790, "Make Way", 374, 1499, 75], [1672970, "Minecraft Dungeons", 1999, 1999, 0], [1928870, "Minecraft Legends", 3999, 3999, 0], [1551360, "Forza Horizon 5", 5999, 5999, 0], [1245620, "ELDEN RING", 5999, 5999, 0], [2622380, "ELDEN RING NIGHTREIGN", 3999, 3999, 0]],
};

describe("Steam price list of the website", () => {
  it("finds a game by its name or app id – never a similar game", () => {
    expect(lookup(idx, { title: "Make Way" })).toMatchObject({ appId: "1445790", finalCents: 374, initialCents: 1499, discountPercent: 75 });
    expect(lookup(idx, { title: "Elden Ring" })?.appId).toBe("1245620");
    expect(lookup(idx, { title: "Minecraft" })).toBeNull(); // not sold on Steam – no "Minecraft Dungeons" instead
    expect(lookup(idx, { title: "x", steamAppId: "1551360" })?.finalCents).toBe(5999);
    expect(lookup(idx, { title: "Hades II" })).toBeNull();
  });
  it("loads the list from the website and keeps the last copy for later", async () => {
    const store: Record<string, string> = {};
    const ls = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
    Object.assign(globalThis, { window: { localStorage: ls, sessionStorage: ls } });
    const ok = (async () => ({ ok: true, json: async () => idx })) as unknown as typeof fetch;
    expect((await loadSteamIndex("DE", ok))?.items.length).toBe(6);
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect((await loadSteamIndex("de", down))?.updatedAt).toBe(idx.updatedAt);
  });
});
