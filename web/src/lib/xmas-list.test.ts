import { describe, expect, it } from "vitest";
import { cleanList, decodeShare, applyLookup, encodeShare, formatPrice, guessTitle, makeWish, normalizeUrl, parsePrice, shareLink, totalCents, withoutPrice, type Wish } from "./xmas-list";

describe("Weihnachtswunschliste", () => {
  it("liest Preise in deutscher und englischer Schreibweise", () => {
    expect(parsePrice("29,99")).toBe(2999);
    expect(parsePrice("29.99 €")).toBe(2999);
    expect(parsePrice("1.299,00")).toBe(129900);
    expect(parsePrice("1,299.50")).toBe(129950);
    expect(parsePrice("1.299")).toBe(129900);
    expect(parsePrice("45")).toBe(4500);
    expect(parsePrice("12,5")).toBe(1250);
    for (const bad of ["", "abc", "-5", "12,3,4x", "€"]) expect(parsePrice(bad)).toBeNull();
    expect(formatPrice(2999)).toMatch(/29,99\s*€/);
    expect(formatPrice(null)).toBe("");
  });

  it("lässt nur Weblinks zu", () => {
    expect(normalizeUrl("https://shop.de/a?b=1")).toBe("https://shop.de/a?b=1");
    expect(normalizeUrl("shop.de/artikel")).toBe("https://shop.de/artikel");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "ftp://x.de/a", "https://user:pw@shop.de/", "kein link", "localhost", ""]) expect(normalizeUrl(bad), bad).toBeNull();
  });

  it("macht aus dem Link einen ersten Titel", () => {
    expect(guessTitle("https://www.amazon.de/Sony-WH-1000XM5-Kopfhoerer/dp/B09XS7JWHH")).toBe("Sony WH 1000XM5 Kopfhoerer");
    expect(guessTitle("https://www.shop.de/")).toBe("shop.de");
  });

  it("makeWish prüft Link und Preis", () => {
    const w = makeWish("shop.de/lego-technic-bugatti", "", "49,95") as Wish;
    expect(w.url).toBe("https://shop.de/lego-technic-bugatti");
    expect(w.priceCents).toBe(4995);
    expect(w.title).toBe("lego technic bugatti");
    expect("error" in (makeWish("quatsch", "", "") as object)).toBe(true);
    expect("error" in (makeWish("shop.de/a", "", "abc") as object)).toBe(true);
    expect((makeWish("shop.de/a-b-c-d-e-f", "Mein Titel", "") as Wish).priceCents).toBeNull();
  });

  it("rechnet die Summe nur aus eingetragenen Preisen", () => {
    const l = cleanList({ items: [{ url: "https://a.de/x", priceCents: 1000 }, { url: "https://b.de/y", priceCents: null }, { url: "https://c.de/z", priceCents: 550 }] });
    expect(totalCents(l.items)).toBe(1550);
    expect(withoutPrice(l.items)).toBe(1);
  });

  it("säubert Fremddaten: falsche Links, Steuerzeichen, Längen, Anzahl", () => {
    const l = cleanList({ title: "Liste\n\t", items: [{ url: "javascript:alert(1)", title: "x" }, { url: "https://a.de/x", title: "T".repeat(500), note: "n\u0000n", priceCents: -3 }, "kaputt", null] });
    expect(l.title).toBe("Liste");
    expect(l.items).toHaveLength(1);
    expect(l.items[0].title.length).toBe(120);
    expect(l.items[0].note).toBe("n n");
    expect(l.items[0].priceCents).toBeNull();
    expect(cleanList({ items: Array.from({ length: 300 }, (_, i) => ({ url: `https://a.de/${i}` })) }).items).toHaveLength(100);
    expect(cleanList(null)).toEqual({ title: "", items: [] });
  });

  it("der Teilen-Link trägt die Liste und kommt unverändert wieder heraus", async () => {
    const list = cleanList({ title: "Weihnachten 2026", items: [
      { url: "https://shop.de/kopfhörer?id=1", title: "Kopfhörer – ä ö ü ß", priceCents: 29999, note: "Schwarz bitte 🎁" },
      { url: "https://b.de/y", title: "Buch", priceCents: null, note: "" },
    ] });
    const code = await encodeShare(list);
    expect(code).toMatch(/^[zp][A-Za-z0-9_-]+$/);
    const back = await decodeShare(code);
    expect(back?.title).toBe("Weihnachten 2026");
    expect(back?.items.map((w) => [w.title, w.url, w.priceCents, w.note])).toEqual(list.items.map((w) => [w.title, w.url, w.priceCents, w.note]));
    expect(shareLink("https://x.github.io/app/", code)).toBe(`https://x.github.io/app/#/w/${code}`);
    expect(code).not.toContain("=");
  });

  it("lehnt fremde Codes ab, statt etwas anzuzeigen", async () => {
    for (const bad of ["", "z", "x123", "zAAAA", "p!!!", "pe30", "z" + "A".repeat(70_000), "p" + btoa('{"i":5}').replace(/=/g, "")]) expect(await decodeShare(bad), bad.slice(0, 12)).toBeNull();
    // gültiger Aufbau, aber gefährlicher Link: wird beim Lesen entfernt
    const evil = "p" + btoa(JSON.stringify({ t: "x", i: [["a", "javascript:alert(1)", 100, ""]] })).replace(/=/g, "");
    expect((await decodeShare(evil))?.items).toEqual([]);
  });

  it("eine lange Liste bleibt als Link handlich", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ url: `https://www.beispiel-shop.de/produkte/artikel-nummer-${i}-mit-langem-namen`, title: `Wunsch Nummer ${i}`, priceCents: 1000 + i, note: "" }));
    const code = await encodeShare(cleanList({ items }));
    expect(code.length).toBeLessThan(2000);
    expect((await decodeShare(code))?.items).toHaveLength(30);
  });

  it("übernimmt vom PC gelesene Preise nur, wenn es Euro sind", () => {
    const base = { url: "https://a.de/x", host: "a.de", title: "Ding &lt;", currency: "EUR", source: "Produktdaten", note: null, multiple: false, readAt: "2026-11-28T10:00:00Z" };
    expect(applyLookup({ ...base, priceCents: 1234 })).toMatchObject({ cents: 1234, kind: "ok", message: "found" });
    expect(applyLookup({ ...base, priceCents: 1234, currency: null })).toMatchObject({ cents: 1234, kind: "ok" });
    expect(applyLookup({ ...base, priceCents: 1234, multiple: true })).toMatchObject({ cents: 1234, kind: "check", message: "multiple" });
    expect(applyLookup({ ...base, priceCents: 1234, currency: "USD" })).toMatchObject({ cents: null, kind: "check", message: "other-currency", amount: "12,34", currency: "USD" });
    expect(applyLookup({ ...base, priceCents: null, note: "keine Daten" })).toMatchObject({ cents: null, kind: "none", message: "none", note: "keine Daten" });
  });

  it("merkt sich, wann ein Preis gelesen wurde, aber nur zu einem vorhandenen Preis", () => {
    const l = cleanList({ items: [{ url: "https://a.de/x", priceCents: 500, priceAt: 1700000000000 }, { url: "https://b.de/y", priceCents: null, priceAt: 1700000000000 }, { url: "https://c.de/z", priceCents: 5, priceAt: "x" }] });
    expect(l.items.map((w) => w.priceAt)).toEqual([1700000000000, null, null]);
  });
});
