// Logic of the island's tools added in 3.63 (dice, counter, countdown, checklist, breathing, links). Pure functions, so they are tested;
// the tiles and the "Werkzeuge"/"Weltzeit"/"Listen" areas in components/island-tools.tsx only draw them.

export type DiceMode = "d6" | "d20" | "coin" | "num";

/** One throw. `rand` is a number in [0, 1) – crypto randomness in the app, fixed values in tests. */
export function roll(mode: DiceMode, max: number, rand: number): { value: number; text: string } {
  if (mode === "coin") { const v = rand < 0.5 ? 0 : 1; return { value: v, text: v ? "Zahl" : "Kopf" }; }
  const top = mode === "d6" ? 6 : mode === "d20" ? 20 : Math.max(2, Math.min(1000, Math.round(max)));
  const v = 1 + Math.floor(rand * top);
  return { value: v, text: String(v) };
}
/** A fair random number in [0, 1) from the browser's crypto source. */
export function cryptoRand(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

/** Days/hours/minutes until a date (YYYY-MM-DD, optional HH:MM, local time). null when the date is not valid. */
export function countdownParts(date: string, time: string, now: number): { past: boolean; days: number; hours: number; minutes: number; at: Date } | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const h = tm ? Number(tm[1]) : 0, mi = tm ? Number(tm[2]) : 0;
  if (h > 23 || mi > 59) return null;
  const at = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), h, mi);
  if (at.getMonth() !== Number(dm[2]) - 1 || at.getDate() !== Number(dm[3])) return null; // 2026-02-31 and the like
  let diff = at.getTime() - now;
  const past = diff < 0;
  diff = Math.abs(diff);
  const days = Math.floor(diff / 86_400_000), hours = Math.floor((diff % 86_400_000) / 3_600_000), minutes = Math.floor((diff % 3_600_000) / 60_000);
  return { past, days, hours, minutes, at };
}

/** Checklist kept as text: one item per line, a leading "x " marks it done. */
export interface CheckItem { text: string; done: boolean }
export function parseChecklist(s: string): CheckItem[] {
  return s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12)
    .map((l) => (/^x\s+/i.test(l) ? { text: l.replace(/^x\s+/i, ""), done: true } : { text: l, done: false }));
}
export function checklistText(items: CheckItem[]): string {
  return items.map((i) => (i.done ? "x " : "") + i.text.replace(/\n/g, " ")).join("\n").slice(0, 300);
}
export function toggleItem(s: string, index: number): string {
  const items = parseChecklist(s);
  if (!items[index]) return s;
  items[index] = { ...items[index], done: !items[index].done };
  return checklistText(items);
}
export function addItem(s: string, text: string): string {
  const clean = text.trim().slice(0, 60);
  if (!clean) return s;
  const items = [...parseChecklist(s), { text: clean, done: false }];
  const full = items.map((i) => (i.done ? "x " : "") + i.text).join("\n");
  return full.length <= 300 && items.length <= 12 ? full : s; // a full list stays as it is instead of cutting the last entry
}
export const clearDone = (s: string) => checklistText(parseChecklist(s).filter((i) => !i.done));

/** Breathing patterns: seconds for in, hold, out, hold. */
export const BREATHE: Record<string, number[]> = { box: [4, 4, 4, 4], calm: [4, 7, 8, 0], even: [5, 0, 5, 0] };
const PHASE = ["Einatmen", "Halten", "Ausatmen", "Halten"] as const;
/** Which phase runs at `ms` since the start, how far it is (0..1) and the circle's size (0 = small, 1 = big). */
export function breathePhase(pattern: string, ms: number): { label: (typeof PHASE)[number]; left: number; size: number } {
  const p = BREATHE[pattern] ?? BREATHE.box;
  const total = p.reduce((a, b) => a + b, 0) * 1000;
  let at = ((ms % total) + total) % total;
  for (let i = 0; i < 4; i++) {
    const len = p[i] * 1000;
    if (len === 0) continue;
    if (at < len) {
      const f = at / len;
      const size = i === 0 ? f : i === 1 ? 1 : i === 2 ? 1 - f : 0;
      return { label: PHASE[i], left: Math.ceil((len - at) / 1000), size };
    }
    at -= len;
  }
  return { label: "Einatmen", left: p[0], size: 0 };
}

/** Only real web addresses may be opened (no javascript:, data:, file: …). Returns the address and a short name, or null. */
export function safeLink(raw: string): { url: string; name: string } | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : "https://" + s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { url: u.toString(), name: u.hostname.replace(/^www\./, "") };
  } catch { return null; }
}

/** Counter: a new value inside the allowed range. */
export const bump = (value: number, by: number) => Math.max(-99999, Math.min(99999, Math.round(value + by)));
