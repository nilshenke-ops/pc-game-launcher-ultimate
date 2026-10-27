// Data center (F25): choose areas, export them as one versioned file, as CSV per kind or printable, and import a
// file with a preview and a choice for conflicts. Pure helpers here; the page is components/data-center.tsx.

import type { Entry } from "./journal";
import { KIND_LABEL } from "./journal-logic";

export const DATA_FORMAT = "nexus-data";

/** Areas the user picks from; every journal kind belongs to exactly one (unknown ones to "other"). */
export const DATA_GROUPS: { id: string; label: string; kinds: string[] }[] = [
  { id: "games", label: "Spiel-Notizen & Wissen", kinds: ["memory", "path", "find", "story", "wiki", "facts", "access", "release", "gameevent", "patch", "editions", "recfav", "recpref"] },
  { id: "build", label: "Welten, Builds & Technik", kinds: ["world", "project", "markers", "build", "modlist", "gfx", "controls", "perfrun", "server"] },
  { id: "together", label: "Gemeinsam & Spiele-Abende", kinds: ["challenge", "bingo", "bingotask", "player", "poll", "night", "team", "tournament"] },
  { id: "media", label: "Medien & Kreativ", kinds: ["photo", "album", "book", "clipmark", "track", "card", "design", "expo"] },
];

export function groupOf(kind: string) { return DATA_GROUPS.find((g) => g.kinds.includes(kind))?.id ?? "other"; }

/** Kinds of the chosen groups that really have entries (the "other" group takes every kind not listed above). */
export function kindsFor(groups: string[], present: string[]) {
  return present.filter((k) => groups.includes(groupOf(k)));
}

export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

// ------------------------------------------------------------------------------------------ CSV

const cell = (v: unknown): string => {
  let s = v == null ? "" : typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v)
    : Array.isArray(v) && v.every((x) => x == null || typeof x !== "object") ? v.join("; ") : JSON.stringify(v);
  // Spreadsheet programs run cells starting with these as formulas – a leading ' keeps them as text.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One kind as CSV (semicolon, for German spreadsheet programs): id, changed, then every field that occurs. */
export function toCsv(list: Entry[]): string {
  const count = new Map<string, number>();
  for (const e of list) for (const k of Object.keys(e.data as object)) count.set(k, (count.get(k) ?? 0) + 1);
  const cols = [...count.keys()].sort((a, b) => (count.get(b)! - count.get(a)!) || a.localeCompare(b)).slice(0, 60);
  const rows = [["id", "updatedAt", ...cols].map(cell).join(";")];
  for (const e of list) rows.push([e.id, new Date(e.updatedAt).toISOString(), ...cols.map((c) => (e.data as Record<string, unknown>)[c])].map(cell).join(";"));
  return "﻿" + rows.join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------------------------------ printable view

/** Readable fields of an entry for the print view: plain text values only, no ids or image references. */
export function printFields(e: Entry): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(e.data as Record<string, unknown>)) {
    if (k === "title" || /ids?$/i.test(k) || v == null || v === "") continue;
    const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v)
      : Array.isArray(v) && v.length && v.every((x) => typeof x === "string" || typeof x === "number") ? v.join(", ") : null;
    if (s && !/^j_[A-Za-z0-9_-]{6,40}$/.test(s)) out.push([k, s.length > 600 ? s.slice(0, 600) + " …" : s]);
  }
  return out.slice(0, 14);
}
