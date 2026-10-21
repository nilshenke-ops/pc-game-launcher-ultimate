// Schema-driven collections (Minecraft worlds, build projects, builds/loadouts, mod lists, map markers, graphics
// comparisons, controls …): one description of the fields gives the form, the checks, search, filters and CSV export.
// Entries are stored with lib/journal.ts (in the browser, compared with the PC). Pure logic – tested in collections.test.ts.

export type FieldType = "text" | "textarea" | "number" | "select" | "tags" | "game" | "images" | "image" | "url" | "bool" | "date" | "rows" | "ref";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Whole numbers only. */
  int?: boolean;
  maxLen?: number;
  placeholder?: string;
  hint?: string;
  /** For "rows": the columns of each row. */
  columns?: FieldDef[];
  maxRows?: number;
  /** For "ref": the kind of the entries to choose from. */
  refKind?: string;
  /** Shown on the card in the list. */
  card?: boolean;
  /** Offered as filter (select, bool, tags). */
  filter?: boolean;
  /** Set by the page itself (e.g. a chosen PC file) – not shown in the form, the details or the table. */
  hidden?: boolean;
}

export interface Schema {
  kind: string;
  /** Singular label ("Welt"). */
  label: string;
  fields: FieldDef[];
  /** Ready starting points (generic – they claim nothing about a particular game). */
  templates?: { name: string; data: Record<string, unknown> }[];
  /** Checks across fields (e.g. "official" needs a source). */
  check?: (d: Data) => FieldError[];
}

export type Data = Record<string, unknown>;

export interface FieldError { key: string; row?: number; col?: string; message: string; vars?: Record<string, string | number> }

const isUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };

function checkValue(f: FieldDef, v: unknown, path: { key: string; row?: number; col?: string }): FieldError | null {
  const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
  if (empty) return f.required ? { ...path, message: "„{f}“ fehlt.", vars: { f: f.label } } : null;
  switch (f.type) {
    case "text": case "textarea": {
      if (typeof v !== "string") return { ...path, message: "„{f}“ muss Text sein.", vars: { f: f.label } };
      const max = f.maxLen ?? (f.type === "text" ? 200 : 20000);
      if (v.length > max) return { ...path, message: "„{f}“ ist zu lang (höchstens {n} Zeichen).", vars: { f: f.label, n: max } };
      if (f.required && !v.trim()) return { ...path, message: "„{f}“ fehlt.", vars: { f: f.label } };
      return null;
    }
    case "number": {
      const n = typeof v === "number" ? v : NaN;
      if (!Number.isFinite(n)) return { ...path, message: "„{f}“ muss eine Zahl sein.", vars: { f: f.label } };
      if (f.int && !Number.isInteger(n)) return { ...path, message: "„{f}“ muss eine ganze Zahl sein.", vars: { f: f.label } };
      if (f.min != null && n < f.min) return { ...path, message: "„{f}“ muss mindestens {n} sein.", vars: { f: f.label, n: f.min } };
      if (f.max != null && n > f.max) return { ...path, message: "„{f}“ darf höchstens {n} sein.", vars: { f: f.label, n: f.max } };
      return null;
    }
    case "select": return f.options?.some((o) => o.value === v) ? null : { ...path, message: "„{f}“: ungültige Auswahl.", vars: { f: f.label } };
    case "bool": return typeof v === "boolean" ? null : { ...path, message: "„{f}“: ungültiger Wert.", vars: { f: f.label } };
    case "url": return typeof v === "string" && isUrl(v) ? null : { ...path, message: "„{f}“ muss eine Adresse mit https:// sein.", vars: { f: f.label } };
    case "date": return typeof v === "string" && !isNaN(Date.parse(v)) ? null : { ...path, message: "„{f}“: ungültiges Datum.", vars: { f: f.label } };
    case "tags": case "images": return Array.isArray(v) && v.every((x) => typeof x === "string") ? null : { ...path, message: "„{f}“: ungültige Liste.", vars: { f: f.label } };
    case "image": case "ref": return typeof v === "string" ? null : { ...path, message: "„{f}“: ungültiger Wert.", vars: { f: f.label } };
    case "game": return typeof v === "object" ? null : { ...path, message: "„{f}“: ungültiger Wert.", vars: { f: f.label } };
    default: return null;
  }
}

/** All problems of an entry (empty = valid). Rows are checked cell by cell. */
export function validate(s: Schema, d: Data): FieldError[] {
  const errs: FieldError[] = [];
  for (const f of s.fields) {
    const v = d[f.key];
    if (f.type === "rows") {
      if (v == null) { if (f.required) errs.push({ key: f.key, message: "„{f}“ fehlt.", vars: { f: f.label } }); continue; }
      if (!Array.isArray(v)) { errs.push({ key: f.key, message: "„{f}“: ungültige Liste.", vars: { f: f.label } }); continue; }
      if (f.maxRows && v.length > f.maxRows) errs.push({ key: f.key, message: "„{f}“: höchstens {n} Zeilen.", vars: { f: f.label, n: f.maxRows } });
      v.forEach((row, i) => {
        if (!row || typeof row !== "object") { errs.push({ key: f.key, row: i, message: "Zeile {n} ist ungültig.", vars: { n: i + 1 } }); return; }
        for (const c of f.columns ?? []) { const e = checkValue(c, (row as Data)[c.key], { key: f.key, row: i, col: c.key }); if (e) errs.push(e); }
      });
      if (f.required && v.length === 0) errs.push({ key: f.key, message: "„{f}“ fehlt.", vars: { f: f.label } });
      continue;
    }
    if (f.type === "game") {
      const g = v as { gameId?: string | null; gameName?: string | null } | undefined;
      if (f.required && !(g?.gameId || g?.gameName?.trim())) errs.push({ key: f.key, message: "„{f}“ fehlt.", vars: { f: f.label } });
      continue;
    }
    const e = checkValue(f, v, { key: f.key });
    if (e) errs.push(e);
  }
  if (s.check) errs.push(...s.check(d));
  return errs;
}

/** An empty entry with sensible defaults. */
export function blank(s: Schema): Data {
  const d: Data = {};
  for (const f of s.fields) {
    if (f.type === "rows" || f.type === "tags" || f.type === "images") d[f.key] = [];
    else if (f.type === "bool") d[f.key] = false;
    else if (f.type === "select" && f.required && f.options?.length) d[f.key] = f.options[0].value;
    else if (f.type === "game") d[f.key] = { gameId: null, gameName: null };
  }
  return d;
}

/** Text of a value for search, cards and CSV. */
export function valueText(f: FieldDef, v: unknown): string {
  if (v == null) return "";
  if (f.type === "select") return f.options?.find((o) => o.value === v)?.label ?? String(v);
  if (f.type === "bool") return v ? "ja" : "nein";
  if (f.type === "tags") return (v as string[]).join(", ");
  if (f.type === "game") return (v as { gameName?: string }).gameName ?? "";
  if (f.type === "rows" || f.type === "images") return String((v as unknown[]).length);
  return String(v);
}

export const csvCell = (v: string) => (/[;"\n\r]/.test(v) || /^[=+\-@]/.test(v) ? `"${(/^[=+\-@]/.test(v) ? "'" : "") + v.replace(/"/g, '""')}"` : v);

/** CSV (semicolon, for German Excel) of the rows of one row field, e.g. all POIs of a world. Formulas are neutralised. */
export function rowsCsv(f: FieldDef, rows: Data[]): string {
  const cols = f.columns ?? [];
  const lines = [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => valueText(c, r[c.key])))];
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

/** CSV of whole entries (one line each, scalar fields only). */
export function entriesCsv(s: Schema, list: Data[]): string {
  const cols = s.fields.filter((f) => !["rows", "images", "image"].includes(f.type));
  const lines = [cols.map((c) => c.label), ...list.map((d) => cols.map((c) => valueText(c, d[c.key])))];
  return "﻿" + lines.map((l) => l.map(csvCell).join(";")).join("\r\n");
}

// ------------------------------------------------------------------------------------------ feature helpers

/** Minecraft: Nether ↔ Overworld (x and z divided / multiplied by 8, y stays) – the game's own rule. */
export function netherToOverworld(p: { x: number; y: number; z: number }) { return { x: p.x * 8, y: p.y, z: p.z * 8 }; }
export function overworldToNether(p: { x: number; y: number; z: number }) { return { x: Math.floor(p.x / 8), y: p.y, z: Math.floor(p.z / 8) }; }

/** Straight distance between two points (blocks). Without a height on either point only the horizontal distance counts. */
export function distance(a: { x: number; y?: number | null; z: number }, b: { x: number; y?: number | null; z: number }) {
  const withY = a.y != null && b.y != null;
  return { blocks: Math.round(Math.hypot(a.x - b.x, withY ? a.y! - b.y! : 0, a.z - b.z)), withY };
}

/** Progress of a project: only from its own tasks (done / all); materials are shown separately. */
export function taskProgress(tasks: { done?: boolean }[]) {
  const total = tasks.length, done = tasks.filter((t) => t.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
export function materialProgress(rows: { needed?: number; have?: number }[]) {
  const need = rows.reduce((a, r) => a + Math.max(0, r.needed ?? 0), 0);
  const have = rows.reduce((a, r) => a + Math.min(Math.max(0, r.have ?? 0), Math.max(0, r.needed ?? 0)), 0);
  return { need, have, percent: need ? Math.round((have / need) * 100) : 0, missing: rows.filter((r) => (r.have ?? 0) < (r.needed ?? 0)) };
}

/** Two builds side by side: every property of either, with "same" / "different" / "only one". */
export function compareRows(a: { name: string; value: string }[], b: { name: string; value: string }[]) {
  const key = (s: string) => s.trim().toLowerCase();
  const names: string[] = [];
  for (const r of [...a, ...b]) if (r.name?.trim() && !names.some((n) => key(n) === key(r.name))) names.push(r.name.trim());
  return names.map((name) => {
    const va = a.find((r) => key(r.name) === key(name))?.value ?? null, vb = b.find((r) => key(r.name) === key(name))?.value ?? null;
    const state = va == null || vb == null ? "only" : va.trim() === vb.trim() ? "same" : "diff";
    return { name, a: va, b: vb, state };
  });
}

/** A marker placed on an own map image: position as 0..1 of the picture (independent of the screen size). */
export function markerPos(clickX: number, clickY: number, rect: { left: number; top: number; width: number; height: number }) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clickX - rect.left) / rect.width, y = (clickY - rect.top) / rect.height;
  if (x < 0 || y < 0 || x > 1 || y > 1) return null;
  return { px: Math.round(x * 10000) / 10000, py: Math.round(y * 10000) / 10000 };
}

/** Groups of rows by a column value (map marker groups, control platforms …), in first-seen order. */
export function groupBy<T extends Data>(rows: T[], key: string, none: string) {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = String(r[key] ?? "").trim() || none; m.set(k, [...(m.get(k) ?? []), r]); }
  return [...m.entries()];
}
