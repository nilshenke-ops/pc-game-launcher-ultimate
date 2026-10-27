import { describe, expect, it } from "vitest";
import { choices, DEFAULT_KFS_FILTER, filterOffers, summary, type KfsOffer } from "./keyforsteam";

const o = (shop: string, price: number, x: Partial<KfsOffer> = {}): KfsOffer => ({ shop, official: false, shopRating: null, shopRatings: 0, edition: "Standard", region: "EUROPA", regionNote: null, platform: "steam", price, priceWithFees: null, priceBeforeVoucher: null, voucher: null, account: false, inStock: true, ...x });

describe("keyforsteam offers", () => {
  const list = [o("A", 20, { priceWithFees: 22.5 }), o("B", 21), o("Konto", 15, { account: true, region: "KONTO" }), o("Steam", 59.99, { official: true }), o("Deluxe-Shop", 30, { edition: "Deluxe" }), o("Weg", 5, { inStock: false })];
  it("hides account offers by default and sorts by what you pay with fees", () => {
    expect(filterOffers(list, DEFAULT_KFS_FILTER).map((x) => x.shop)).toEqual(["B", "A", "Deluxe-Shop", "Steam"]);
    expect(filterOffers(list, { ...DEFAULT_KFS_FILTER, keysOnly: false })[0].shop).toBe("Konto");
    expect(filterOffers(list, { ...DEFAULT_KFS_FILTER, officialOnly: true }).map((x) => x.shop)).toEqual(["Steam"]);
    expect(filterOffers(list, { ...DEFAULT_KFS_FILTER, edition: "Deluxe" }).map((x) => x.shop)).toEqual(["Deluxe-Shop"]);
  });
  it("compares only keys of the same edition", () => {
    const s = summary(list, "Standard");
    expect([s.official?.shop, s.keyshop?.shop]).toEqual(["Steam", "B"]);
    expect(summary(list, "Deluxe").official).toBeNull();
    expect(choices(list, "edition")).toEqual(["Standard", "Deluxe"]);
  });
});
