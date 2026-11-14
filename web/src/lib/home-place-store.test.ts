// 3.65: the weather place must survive signing in and the cloud sync – it is stored as JSON like every account key (the account blob only
// carries values that read back as JSON; the bare text of older versions was silently left out and wiped on the next sign-in).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { homePlace, migrateHomePlace, setHomePlace } from "./weather";

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
});

describe("Wetter-Ort speichern", () => {
  it("wird als JSON gespeichert und so gelesen, dass das Konto ihn mitnimmt", () => {
    setHomePlace("  Köln ");
    expect(mem.get("pgl.homePlace")).toBe('"Köln"');
    expect(JSON.parse(mem.get("pgl.homePlace")!)).toBe("Köln");   // what the account blob reads
    expect(homePlace()).toBe("Köln");
  });
  it("liest den reinen Text älterer Versionen weiter und wandelt ihn um", () => {
    mem.set("pgl.homePlace", "Adendorf");
    expect(homePlace()).toBe("Adendorf");
    migrateHomePlace();
    expect(mem.get("pgl.homePlace")).toBe('"Adendorf"');
    expect(homePlace()).toBe("Adendorf");
  });
  it("leer löscht ihn", () => {
    setHomePlace("Berlin"); setHomePlace("  ");
    expect(mem.has("pgl.homePlace")).toBe(false);
    expect(homePlace()).toBeNull();
  });
});
