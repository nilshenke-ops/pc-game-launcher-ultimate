// Small pure helpers for GameQuest and Deal Radar (unit-tested in quest-deal.test.ts).
import { locale } from "./i18n";

/** Id made on this device, so a change saved offline is sent exactly once (the PC ignores a repeated id). */
export function clientId(prefix: "goal" | "match" | "wish" | "rmp"): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return `${prefix}_${Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14)}`;
}

/** "19,99" / "19.99" / "19" → cents; empty → null; anything else → NaN. */
export function parsePrice(text: string): number | null {
  const s = text.trim().replace(/\s|€|\$|£/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

export function money(cents: number | null | undefined, currency?: string | null): string {
  if (cents == null) return "–";
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency: currency || "EUR" }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

/** Cents → text for the input field ("19,99" in German). */
export function priceInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

/** Lowest price this PC has seen itself (not the all-time low in the store – that is not known). */
export function lowestSeen(history: { final: number }[]): number | null {
  return history.length ? Math.min(...history.map((p) => p.final)) : null;
}

/** Progress 0…100 for a goal; null when not yet calculated by the PC. */
export function progressPercent(value: number | null | undefined, target: number): number | null {
  if (value == null || target <= 0) return null;
  return Math.max(0, Math.min(100, (value / target) * 100));
}

/** Level progress 0…100 inside the current level. */
export function levelPercent(xp: number, from: number, to: number): number {
  return to > from ? Math.max(0, Math.min(100, ((xp - from) / (to - from)) * 100)) : 0;
}
