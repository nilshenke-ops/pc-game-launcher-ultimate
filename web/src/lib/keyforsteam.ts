// Keyforsteam price comparison (loaded by the PC on request, see KeyforsteamService): filters and a short summary.

export interface KfsOffer {
  shop: string; official: boolean; shopRating: number | null; shopRatings: number; edition: string; region: string; regionNote: string | null;
  platform: string | null; price: number; priceWithFees: number | null; priceBeforeVoucher: number | null; voucher: string | null; account: boolean; inStock: boolean;
}
export interface KfsResult { source: string; url: string; title: string | null; fetchedAt: string; offers: KfsOffer[] }
export interface KfsFilter { officialOnly: boolean; keysOnly: boolean; edition: string; region: string }

export const DEFAULT_KFS_FILTER: KfsFilter = { officialOnly: false, keysOnly: true, edition: "", region: "" };

/** What the user pays: with the cheapest payment fee if the shop names one. */
export const payPrice = (o: KfsOffer) => o.priceWithFees ?? o.price;

export function filterOffers(list: KfsOffer[], f: KfsFilter): KfsOffer[] {
  return list
    .filter((o) => o.inStock && (!f.officialOnly || o.official) && (!f.keysOnly || !o.account) && (!f.edition || o.edition === f.edition) && (!f.region || o.region === f.region))
    .sort((a, b) => payPrice(a) - payPrice(b));
}

/** Editions and regions that occur, most offers first (for the filter menus). */
export function choices(list: KfsOffer[], key: "edition" | "region"): string[] {
  const n = new Map<string, number>();
  for (const o of list) n.set(o[key], (n.get(o[key]) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}

/** Cheapest key from an official shop and from a key shop – of the same edition, so the two are comparable. */
export function summary(list: KfsOffer[], edition: string) {
  const keys = list.filter((o) => o.inStock && !o.account && o.edition === edition);
  const best = (l: KfsOffer[]) => l.reduce<KfsOffer | null>((m, o) => (!m || payPrice(o) < payPrice(m) ? o : m), null);
  return { official: best(keys.filter((o) => o.official)), keyshop: best(keys.filter((o) => !o.official)) };
}

