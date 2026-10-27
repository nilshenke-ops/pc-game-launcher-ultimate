// JARVIS's memory – plain Markdown pages in the own Gaming-Wiki, readable and editable like every other page:
// "JARVIS-Gedächtnis" holds what the user asked to remember ("Merk dir, dass …"), "JARVIS-Protokoll" what JARVIS
// did (last 100 lines). Stored on this device and synced with the PC like all collections; nothing goes elsewhere.

import { fold } from "./knowledge";
import { listKind, newId, saveEntry, type Entry } from "./journal";
import type { WikiPage } from "./journal-logic";

export const MEMORY_TITLE = "JARVIS-Gedächtnis";
export const LOG_TITLE = "JARVIS-Protokoll";
const MAX_LOG = 100;
const MAX_FACTS = 300;

export type MemoryIntent = { kind: "remember"; fact: string } | { kind: "recall"; about: string | null } | { kind: "forget"; about: string } | { kind: "log" };

/** "Merk dir, dass ich Minecraft mit Shadern spiele" · "Was weißt du über Minecraft?" · "Vergiss Minecraft" · "Was hast du heute gemacht?" */
export function memoryIntent(raw: string): MemoryIntent | null {
  const t = raw.trim().replace(/[.!]+$/, "");
  let m = /^(?:jarvis,?\s+)?(?:merk|merke)\s+(?:dir|es dir)\s*(?:bitte\s*)?[:,]?\s*(?:dass\s+)?(.{3,300})$/i.exec(t) ?? /^(?:notier|notiere|speicher|speichere)\s+(?:dir\s+)?[:,]?\s*(?:dass\s+)?(.{3,300})$/i.exec(t);
  if (m) return { kind: "remember", fact: mainClause(m[1].trim()).replace(/^./, (c) => c.toUpperCase()) };
  m = /^(?:vergiss|lösch|loesch|entferne)\s+(?:bitte\s+)?(?:alles\s+)?(?:über|ueber|zu|was du über|was du ueber)?\s*(.{2,80}?)(?:\s+aus deinem gedächtnis)?$/i.exec(t);
  if (m && /vergiss|gedächtnis|gedaechtnis/i.test(t)) return { kind: "forget", about: m[1].trim() };
  if (/was (hast du|hat jarvis) (heute |gerade |zuletzt )?(gemacht|erledigt)|dein protokoll|jarvis.?protokoll/i.test(t)) return { kind: "log" };
  m = /was (?:weißt|weisst) du (?:noch )?(?:über|ueber|zu|von)\s+(.{2,80})\??$/i.exec(t);
  if (m) return { kind: "recall", about: m[1].replace(/\?$/, "").trim() };
  if (/was (?:hast du dir gemerkt|weißt du über mich|weisst du ueber mich)|dein gedächtnis|dein gedaechtnis|zeig (mir )?(dein )?gedächtnis/i.test(t)) return { kind: "recall", about: null };
  return null;
}

/** "ich Minecraft mit Shadern spiele" (after "dass") → "Ich spiele Minecraft mit Shadern": the verb moves to second place. */
export function mainClause(s: string): string {
  const w = s.split(/\s+/);
  const subj = /^(ich|wir|er|sie|es|du)$/i.test(w[0]) ? 1 : /^(mein|meine|meinen|dein|deine|unser|unsere)$/i.test(w[0]) && w.length > 3 ? 2 : 0;
  const verb = w[w.length - 1];
  if (!subj || w.length < subj + 2 || !/^[a-zäöüß]+$/.test(verb)) return s;
  return [...w.slice(0, subj), verb, ...w.slice(subj, -1)].join(" ");
}

function page(title: string): Entry<WikiPage> | undefined {
  return listKind<WikiPage>("wiki").find((p) => p.data.title === title);
}
const lines = (p?: Entry<WikiPage>) => (p?.data.body ?? "").split("\n").filter((l) => l.startsWith("- "));
const today = () => new Date().toLocaleDateString("de-DE");

function write(title: string, intro: string, items: string[]) {
  const p = page(title);
  const body = `${intro}\n\n${items.join("\n")}\n`;
  saveEntry("wiki", p?.id ?? newId(), { ...(p?.data ?? { tags: ["JARVIS"] }), title, body } as WikiPage);
  return p?.id;
}

export function remember(fact: string): { id: string | undefined; count: number } {
  const all = lines(page(MEMORY_TITLE));
  const line = `- ${today()}: ${fact.replace(/\s+/g, " ").slice(0, 300)}`;
  const next = [...all.filter((l) => fold(l.replace(/^- [\d.]+: /, "")) !== fold(fact)), line].slice(-MAX_FACTS);
  write(MEMORY_TITLE, "Was ich mir für dich merken sollte. Du kannst diese Seite wie jede Wiki-Seite lesen und ändern.", next);
  return { id: page(MEMORY_TITLE)?.id, count: next.length };
}

/** Remembered lines about something (all words must appear), newest first. */
export function recall(about: string | null): string[] {
  const all = lines(page(MEMORY_TITLE)).reverse().map((l) => l.slice(2));
  if (!about) return all;
  const words = fold(about).split(/\s+/).filter((w) => w.length > 1 && !["mich", "mir", "meine", "mein"].includes(w));
  return all.filter((l) => words.every((w) => fold(l).includes(w)));
}

export function forget(about: string): number {
  const p = page(MEMORY_TITLE);
  const all = lines(p);
  const words = fold(about).split(/\s+/).filter((w) => w.length > 1);
  const keep = all.filter((l) => !words.every((w) => fold(l).includes(w)));
  if (keep.length !== all.length) write(MEMORY_TITLE, "Was ich mir für dich merken sollte. Du kannst diese Seite wie jede Wiki-Seite lesen und ändern.", keep);
  return all.length - keep.length;
}

/** What JARVIS did (one line per request with a real result). */
export function logDone(request: string, results: { text: string; ok: boolean | null }[]) {
  const done = results.filter((r) => r.ok !== null);
  if (!done.length) return;
  const time = new Date().toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const line = `- ${time} · „${request.slice(0, 80)}“ → ${done.map((r) => (r.ok ? "✓ " : "✗ ") + r.text.replace(/^[✓✗]\s*/, "").replace(/\s+/g, " ").slice(0, 120)).join(" · ")}`;
  write(LOG_TITLE, "Was JARVIS für dich erledigt hat (die letzten 100 Aufträge mit Ergebnis).", [...lines(page(LOG_TITLE)), line].slice(-MAX_LOG));
}

export function lastLog(n = 8): string[] { return lines(page(LOG_TITLE)).slice(-n).reverse().map((l) => l.slice(2)); }
export const memoryCount = () => lines(page(MEMORY_TITLE)).length;
export const memoryPageId = () => page(MEMORY_TITLE)?.id ?? null;
export const logPageId = () => page(LOG_TITLE)?.id ?? null;
