// Backlog: status, priority and play-time goal live on the library entry (one place, synced through the PC);
// play time and "last played" come from the existing history. Everything here is pure and tested.
import { t } from "./i18n";
import type { LibraryItem } from "./types";

export const STATUSES = ["backlog", "next", "playing", "paused", "completed", "dropped"] as const;
export type BacklogStatus = (typeof STATUSES)[number];

export const statusLabel = (s: string) => ({
  backlog: t("Noch spielen"), next: t("Als Nächstes"), playing: t("Gerade aktiv"),
  paused: t("Pausiert"), completed: t("Durchgespielt"), dropped: t("Nicht mehr interessant"),
} as Record<string, string>)[s] ?? s;

export const priorityLabel = (p: number) => [t("Keine"), t("Niedrig"), t("Mittel"), t("Hoch")][p] ?? String(p);

export interface PlayStats { totalMinutes: number; lastPlayed?: string }

export type PlayFilter = "all" | "never" | "lt1" | "1to10" | "gt10";
export type BacklogSort = "priority" | "name" | "lastPlayed" | "playtime" | "changed";

export interface BacklogFilter { statuses: string[]; source?: string; category?: string; play: PlayFilter; search: string }

export function matches(i: LibraryItem, f: BacklogFilter, stats: Map<string, PlayStats>) {
  if (!i.backlog || (f.statuses.length > 0 && !f.statuses.includes(i.backlog))) return false;
  if (f.source && i.source !== f.source) return false;
  if (f.category && !i.categories.includes(f.category)) return false;
  const s = f.search.trim().toLowerCase();
  if (s && !i.name.toLowerCase().includes(s) && !(i.notes ?? "").toLowerCase().includes(s)) return false;
  const h = (stats.get(i.id)?.totalMinutes ?? 0) / 60;
  switch (f.play) {
    case "never": return h === 0;
    case "lt1": return h > 0 && h < 1;
    case "1to10": return h >= 1 && h <= 10;
    case "gt10": return h > 10;
    default: return true;
  }
}

export function sortItems(list: LibraryItem[], sort: BacklogSort, stats: Map<string, PlayStats>) {
  const last = (i: LibraryItem) => Date.parse(stats.get(i.id)?.lastPlayed ?? "") || 0;
  const mins = (i: LibraryItem) => stats.get(i.id)?.totalMinutes ?? 0;
  const order = (i: LibraryItem) => STATUSES.indexOf(i.backlog as BacklogStatus);
  return [...list].sort((a, b) => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "lastPlayed": return last(b) - last(a) || a.name.localeCompare(b.name);
      case "playtime": return mins(b) - mins(a) || a.name.localeCompare(b.name);
      case "changed": return (Date.parse(b.backlogChangedAt ?? "") || 0) - (Date.parse(a.backlogChangedAt ?? "") || 0);
      default: return (b.priority ?? 0) - (a.priority ?? 0) || order(a) - order(b) || a.name.localeCompare(b.name);
    }
  });
}

/** Fair random choice; higher priority can count more ("weighted": priority 0..3 → 1..4 tickets). */
export function pickRandom<T extends { priority?: number }>(list: T[], weighted: boolean, rnd: () => number = cryptoRandom): T | null {
  if (list.length === 0) return null;
  const weights = list.map((i) => (weighted ? 1 + Math.max(0, Math.min(3, i.priority ?? 0)) : 1));
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < list.length; k++) { r -= weights[k]; if (r < 0) return list[k]; }
  return list[list.length - 1];
}

function cryptoRandom() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

// ------------------------------------------------------------------ export / import

export interface BacklogEntry { name: string; source: string; target: string; status: string; priority: number; goalHours?: number; notes?: string; categories?: string[]; rating?: number; estimateHours?: number; sessionMinutes?: number; archived?: boolean }
export interface BacklogExport { format: "nexus-backlog"; version: 1; exportedAt: string; entries: BacklogEntry[] }

export function toExport(items: LibraryItem[], now = new Date()): BacklogExport {
  return {
    format: "nexus-backlog", version: 1, exportedAt: now.toISOString(),
    entries: items.filter((i) => i.backlog).map((i) => ({
      name: i.name, source: i.source, target: i.target, status: i.backlog!, priority: i.priority ?? 0,
      ...(i.goalHours ? { goalHours: i.goalHours } : {}), ...(i.notes ? { notes: i.notes } : {}), ...(i.categories.length ? { categories: i.categories } : {}),
      ...(i.rating ? { rating: i.rating } : {}), ...(i.estimateHours ? { estimateHours: i.estimateHours } : {}), ...(i.sessionMinutes ? { sessionMinutes: i.sessionMinutes } : {}), ...(i.backlogArchived ? { archived: true } : {}),
    })),
  };
}

const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[;"\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };

/** CSV for spreadsheets (semicolon – German Excel). Cells starting with = + - @ are neutralised (no formula injection). */
export function toCsv(items: LibraryItem[], stats: Map<string, PlayStats>) {
  const rows = [["Name", "Status", "Priorität", "Spielzeit (h)", "Ziel (h)", "Schätzung (h)", "Sitzung (Min.)", "Bewertung", "Archiv", "Zuletzt gespielt", "Plattform", "Kategorien", "Notizen"]];
  for (const i of items.filter((x) => x.backlog)) {
    const st = stats.get(i.id);
    rows.push([i.name, statusLabel(i.backlog!), priorityLabel(i.priority ?? 0), st ? (st.totalMinutes / 60).toFixed(1).replace(".", ",") : "0",
      i.goalHours ? String(i.goalHours).replace(".", ",") : "", i.estimateHours ? String(i.estimateHours).replace(".", ",") : "", i.sessionMinutes ? String(i.sessionMinutes) : "", i.rating ? String(i.rating) : "", i.backlogArchived ? "ja" : "", st?.lastPlayed ? st.lastPlayed.slice(0, 10) : "", i.source, i.categories.join(", "), i.notes ?? ""]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

export interface ImportPlan { matched: { item: LibraryItem; entry: BacklogEntry; changes: string[] }[]; unmatched: BacklogEntry[]; invalid: number }

/** Checks a backlog file and matches it to this PC's library (same launcher + target, otherwise same name). Nothing is changed here. */
export function planImport(raw: unknown, items: LibraryItem[]): ImportPlan {
  const f = raw as Partial<BacklogExport> | null;
  if (!f || f.format !== "nexus-backlog" || !Array.isArray(f.entries)) throw new Error(t("Keine Backlog-Datei (format „nexus-backlog“ erwartet)."));
  if (f.entries.length > 5000) throw new Error(t("Datei enthält zu viele Einträge."));
  const plan: ImportPlan = { matched: [], unmatched: [], invalid: 0 };
  const seen = new Set<string>();
  for (const e of f.entries as BacklogEntry[]) {
    if (!e || typeof e.name !== "string" || !STATUSES.includes(e.status as BacklogStatus) || !Number.isInteger(e.priority ?? 0) || (e.priority ?? 0) < 0 || (e.priority ?? 0) > 3 ||
      (e.goalHours != null && !(typeof e.goalHours === "number" && e.goalHours >= 0 && e.goalHours <= 10000)) ||
      (e.estimateHours != null && !(typeof e.estimateHours === "number" && e.estimateHours >= 0 && e.estimateHours <= 10000)) ||
      (e.sessionMinutes != null && !(Number.isInteger(e.sessionMinutes) && e.sessionMinutes >= 0 && e.sessionMinutes <= 1440)) ||
      (e.rating != null && !(Number.isInteger(e.rating) && e.rating >= 0 && e.rating <= 5)) ||
      (e.categories != null && !(Array.isArray(e.categories) && e.categories.every((c) => typeof c === "string")))) { plan.invalid++; continue; }
    const item = items.find((i) => i.source === e.source && i.target === e.target) ?? items.find((i) => i.name.trim().toLowerCase() === e.name.trim().toLowerCase());
    if (!item || seen.has(item.id)) { if (!item) plan.unmatched.push(e); continue; }
    seen.add(item.id);
    const changes: string[] = [];
    if (item.backlog !== e.status) changes.push(`${t("Status")}: ${item.backlog ? statusLabel(item.backlog) : "–"} → ${statusLabel(e.status)}`);
    if ((item.priority ?? 0) !== (e.priority ?? 0)) changes.push(`${t("Priorität")}: ${priorityLabel(item.priority ?? 0)} → ${priorityLabel(e.priority ?? 0)}`);
    if ((item.goalHours ?? 0) !== (e.goalHours ?? 0)) changes.push(`${t("Ziel")}: ${item.goalHours ?? "–"} → ${e.goalHours ?? "–"} h`);
    if (e.rating != null && (item.rating ?? 0) !== e.rating) changes.push(`${t("Bewertung")}: ${item.rating ?? 0} → ${e.rating}`);
    if (e.estimateHours != null && (item.estimateHours ?? 0) !== e.estimateHours) changes.push(`${t("Schätzung")}: ${item.estimateHours ?? "–"} → ${e.estimateHours} h`);
    if (e.sessionMinutes != null && (item.sessionMinutes ?? 0) !== e.sessionMinutes) changes.push(`${t("Sitzung")}: ${item.sessionMinutes ?? "–"} → ${e.sessionMinutes} Min.`);
    if (e.archived != null && !!item.backlogArchived !== e.archived) changes.push(e.archived ? t("wird archiviert") : t("aus dem Archiv"));
    plan.matched.push({ item, entry: e, changes });
  }
  return plan;
}
