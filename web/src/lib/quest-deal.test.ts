import { describe, expect, it } from "vitest";
import { clientId, keyShopLinks, levelPercent, lowestSeen, money, parsePrice, progressPercent } from "./quest-deal";

describe("quest/deal helpers", () => {
  it("makes ids the PC accepts", () => {
    expect(clientId("goal")).toMatch(/^goal_[A-Za-z0-9_-]{4,40}$/);
    expect(clientId("match")).toMatch(/^match_[A-Za-z0-9_-]{4,40}$/);
    expect(clientId("wish")).toMatch(/^wish_[A-Za-z0-9_-]{4,40}$/);
    expect(clientId("wish")).not.toBe(clientId("wish"));
  });

  it("parses prices", () => {
    expect(parsePrice("19,99")).toBe(1999);
    expect(parsePrice("19.9")).toBe(1990);
    expect(parsePrice(" 20 € ")).toBe(2000);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("abc")).toBeNaN();
    expect(parsePrice("1.2.3")).toBeNaN();
    expect(parsePrice("-5")).toBeNaN();
  });

  it("formats money and never invents a price", () => {
    expect(money(null, "EUR")).toBe("–");
    expect(money(1999, "EUR")).toMatch(/19,99/);
    expect(money(1999, "XYZ1")).toBe("19.99 XYZ1"); // unknown currency code → plain text
  });

  it("calculates progress", () => {
    expect(progressPercent(null, 10)).toBeNull();
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(30, 10)).toBe(100);
    expect(levelPercent(150, 100, 300)).toBe(25);
    expect(lowestSeen([])).toBeNull();
    expect(lowestSeen([{ final: 2999 }, { final: 1499 }, { final: 1999 }])).toBe(1499);
  });
});

describe("key shop links", () => {
  it("search Instant Gaming and Eneba (Germany, Europe/Global keys) by the cleaned title", () => {
    const [ig, en, kfs] = keyShopLinks("Hades™ II  ");
    expect(kfs.url).toBe("https://www.keyforsteam.de/katalog/?search_name=Hades%20II");
    expect(ig.url).toBe("https://www.instant-gaming.com/de/suche/?q=Hades%20II");
    expect(en.url).toBe("https://www.eneba.com/de/store/all?text=Hades%20II&regions[]=europe&regions[]=global");
    expect(keyShopLinks("A&B?#").map((l) => l.url)[0]).toBe("https://www.instant-gaming.com/de/suche/?q=A%26B%3F%23");
    expect(keyShopLinks("   ")).toEqual([]);
  });
});
