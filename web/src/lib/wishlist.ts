// Wish list (F11): filter, sort and price limits over the Deal Radar entries. Only measured prices count – an entry
// without a price is never assumed to be cheap or expensive. Tested in wishlist.test.ts.

import { norm } from "./journal-logic";

export interface WishLike {
  id: string; title: string; kind?: string | null; priority?: number | null; categories?: string[] | null; addedAt?: string;
  targetCents?: number | null; finalCents?: number | null; msFinalCents?: number | null; discountPercent?: number | null;
}

/** Lowest measured price in an official store (Steam or Microsoft Store), null without any measurement. */
export function bestPrice(w: WishLike): number | null {
  const p = [w.finalCents, w.msFinalCents].filter((x): x is number => typeof x === "number");
  return p.length ? Math.min(...p) : null;
}

export const targetReached = (w: WishLike) => w.targetCents != null && bestPrice(w) != null && bestPrice(w)! <= w.targetCents;

export interface WishFilter { q?: string; kind?: "" | "game" | "dlc"; priority?: number | null; category?: string; maxCents?: number | null; onlyTarget?: boolean }
export type WishSort = "smart" | "priority" | "price" | "title" | "added";

export function filterWishes<T extends WishLike>(list: T[], f: WishFilter) {
  const q = norm(f.q ?? "");
  const shown = list.filter((w) =>
    (!q || norm(w.title).includes(q)) &&
    (!f.kind || (w.kind ?? "game") === f.kind) &&
    (f.priority == null || (w.priority ?? 1) === f.priority) &&
    (!f.category || (w.categories ?? []).some((c) => norm(c) === norm(f.category!))) &&
    (!f.onlyTarget || targetReached(w)));
  if (f.maxCents == null) return { shown, withoutPrice: 0 };
  // A price limit can only judge measured prices; the others are counted, not hidden silently.
  const priced = shown.filter((w) => bestPrice(w) != null && bestPrice(w)! <= f.maxCents!);
  return { shown: priced, withoutPrice: shown.filter((w) => bestPrice(w) == null).length };
}

export function sortWishes<T extends WishLike>(list: T[], mode: WishSort): T[] {
  const l = [...list];
  const byTitle = (a: T, b: T) => a.title.localeCompare(b.title);
  if (mode === "priority") return l.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1) || byTitle(a, b));
  if (mode === "price") return l.sort((a, b) => (bestPrice(a) ?? Infinity) - (bestPrice(b) ?? Infinity) || byTitle(a, b));
  if (mode === "title") return l.sort(byTitle);
  if (mode === "added") return l.sort((a, b) => String(b.addedAt ?? "").localeCompare(String(a.addedAt ?? "")));
  // Reached targets first, then the biggest discount.
  return l.sort((a, b) => Number(targetReached(b)) - Number(targetReached(a)) || (b.discountPercent ?? 0) - (a.discountPercent ?? 0) || byTitle(a, b));
}

export const allCategories = (list: WishLike[]) => [...new Set(list.flatMap((w) => w.categories ?? []))].sort((a, b) => a.localeCompare(b));

/** Points of a dated price chart: x 0..1 by time, y 0..1 by price (1 = highest). Needs at least two measurements. */
export function chartPoints(history: { at: string; final: number; initial?: number }[]) {
  const h = history.filter((p) => !isNaN(Date.parse(p.at)) && Number.isFinite(p.final)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (h.length < 2) return null;
  const t0 = Date.parse(h[0].at), t1 = Date.parse(h[h.length - 1].at);
  const max = Math.max(...h.map((p) => Math.max(p.final, p.initial ?? 0))), min = Math.min(...h.map((p) => p.final));
  const span = Math.max(max - min, 1);
  return { min, max, from: h[0].at, to: h[h.length - 1].at, points: h.map((p) => ({ x: t1 > t0 ? (Date.parse(p.at) - t0) / (t1 - t0) : 0, y: (p.final - min) / span, cents: p.final, at: p.at })) };
}
