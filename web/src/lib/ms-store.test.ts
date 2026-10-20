import { describe, expect, it } from "vitest";
import { fetchMsPrice, pickBest } from "./ms-store";
import fixture from "./ms-store.fixture.json";

describe("Microsoft Store prices on the device", () => {
  it("picks the game itself from a real catalog answer – no add-on bundle, no Game Pass member price", () => {
    const b = pickBest("Forza Horizon 5", fixture.Products as never)!;
    expect(b.title).toBe("Forza Horizon 5 Standard Edition");
    expect(b.finalCents).toBe(6999);
    expect(b.currency).toBe("EUR");
    expect(b.image?.startsWith("https://store-images.s-microsoft.com/")).toBe(true);
  });
  it("asks autosuggest, then the products, and reports honestly when nothing fits", async () => {
    const urls: string[] = [];
    const fake = (async (u: string) => { urls.push(u); return { json: async () => (u.includes("autosuggest") ? { Results: [{ Products: [{ ProductId: "9NKX70BBCDRN", Type: "Game" }, { ProductId: "9DLC", Type: "Durable" }] }] } : fixture) }; }) as unknown as typeof fetch;
    const r = await fetchMsPrice("Forza Horizon 5", "de", fake);
    expect("finalCents" in r && r.finalCents).toBe(6999);
    expect(urls[1]).toContain("bigIds=9NKX70BBCDRN&market=DE&languages=de-de");
    const none = await fetchMsPrice("Hollow Knight Silksong", "de", fake);
    expect("error" in none && none.error).toContain("kein kaufbares Angebot");
    const down = await fetchMsPrice("x", "de", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect("error" in down && down.error).toBe("Microsoft Store nicht erreichbar.");
  });
});
