// Statistics card: a summary of a period from the local gaming history, drawn in the browser. Nothing is published.
// Missing data is shown as missing – never as 0 % or as an invented value.
import { t } from "./i18n";

export interface CardSession { itemId: string; name: string; startedAt: string; endedAt?: string | null; minutes: number; perf?: { samples: number; cpuAvg?: number; gpuAvg?: number; ramAvg?: number } | null }
export type Period = "week" | "month" | "year" | "all";

export interface CardData {
  from: Date | null; to: Date;
  totalMinutes: number; sessions: number; games: number; daysPlayed: number;
  longest?: { name: string; minutes: number };
  top: { name: string; minutes: number; sessions: number }[];
  perf?: { cpuAvg?: number; gpuAvg?: number; samples: number };
  previous?: { totalMinutes: number; sessions: number };
}

/** Start of the period that ends at "to" (local time). */
export function periodStart(period: Period, to: Date): Date | null {
  const d = new Date(to);
  if (period === "all") return null;
  if (period === "week") { d.setDate(d.getDate() - 7); return d; }
  if (period === "month") { d.setMonth(d.getMonth() - 1); return d; }
  d.setFullYear(d.getFullYear() - 1);
  return d;
}

function inRange(s: CardSession, from: Date | null, to: Date) {
  const at = Date.parse(s.startedAt);
  return (!from || at >= from.getTime()) && at < to.getTime();
}

export function compute(all: CardSession[], period: Period, to = new Date()): CardData {
  const from = periodStart(period, to);
  const list = all.filter((s) => inRange(s, from, to));
  const byGame = new Map<string, { name: string; minutes: number; sessions: number }>();
  for (const s of list) {
    const g = byGame.get(s.itemId) ?? { name: s.name, minutes: 0, sessions: 0 };
    g.minutes += Math.max(0, s.minutes); g.sessions++;
    byGame.set(s.itemId, g);
  }
  const withPerf = list.filter((s) => s.perf && s.perf.samples > 0);
  const avg = (k: "cpuAvg" | "gpuAvg") => {
    const v = withPerf.filter((s) => s.perf![k] != null);
    if (!v.length) return undefined;
    const w = v.reduce((a, s) => a + s.perf!.samples, 0);
    return v.reduce((a, s) => a + s.perf![k]! * s.perf!.samples, 0) / w;
  };
  const longest = list.reduce<CardSession | null>((m, s) => (!m || s.minutes > m.minutes ? s : m), null);
  let previous: CardData["previous"];
  if (from) {
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
    const prev = all.filter((s) => inRange(s, prevFrom, from));
    // Only compare when the history reaches back that far – otherwise "+100 %" would be misleading.
    const oldest = all.reduce((m, s) => Math.min(m, Date.parse(s.startedAt)), Infinity);
    if (oldest <= prevFrom.getTime() || prev.length > 0) previous = { totalMinutes: prev.reduce((a, s) => a + Math.max(0, s.minutes), 0), sessions: prev.length };
  }
  return {
    from, to,
    totalMinutes: list.reduce((a, s) => a + Math.max(0, s.minutes), 0),
    sessions: list.length,
    games: byGame.size,
    daysPlayed: new Set(list.map((s) => new Date(s.startedAt).toDateString())).size,
    longest: longest ? { name: longest.name, minutes: longest.minutes } : undefined,
    top: [...byGame.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5),
    perf: withPerf.length ? { cpuAvg: avg("cpuAvg"), gpuAvg: avg("gpuAvg"), samples: withPerf.reduce((a, s) => a + s.perf!.samples, 0) } : undefined,
    previous,
  };
}

export const hm = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
};

/** Change in percent, or null when there is nothing to compare with. */
export function change(now: number, before: number | undefined) {
  if (before == null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export interface CardOptions { top: boolean; totals: boolean; longest: boolean; perf: boolean; compare: boolean; milestones: boolean; title: string; layout: "poster" | "wide" }

export function toCsv(d: CardData) {
  const rows = [["Spiel", "Spielzeit (min)", "Sitzungen"], ...d.top.map((g) => [g.name, String(Math.round(g.minutes)), String(g.sessions)])];
  return "﻿" + rows.map((r) => r.map((c) => (/[;"\n]/.test(c) || /^[=+\-@]/.test(c) ? `"${(/^[=+\-@]/.test(c) ? "'" : "") + c.replace(/"/g, '""')}"` : c)).join(";")).join("\r\n");
}

/** Draws the card. Colours come from the current theme (CSS variables). */
export function draw(canvas: HTMLCanvasElement, d: CardData, o: CardOptions, periodText: string, milestone?: string) {
  const [w, h] = o.layout === "poster" ? [1080, 1350] : [1200, 675];
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => css.getPropertyValue(n).trim() || f;
  const bg = v("--bg", "#070b14"), primary = v("--primary", "#22d3ee"), accent = v("--accent", "#a78bfa"), text = v("--text", "#e8edf7"), muted = v("--muted", "#93a0b8");
  c.fillStyle = bg; c.fillRect(0, 0, w, h);
  const glow = c.createRadialGradient(w * 0.85, h * 0.1, 10, w * 0.85, h * 0.1, w * 0.9);
  glow.addColorStop(0, primary + "55"); glow.addColorStop(1, "transparent");
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
  const pad = 64;
  let y = pad + 20;
  const font = (size: number, weight = 600) => { c.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; };
  const line = (s: string, size: number, color: string, weight = 600, x = pad) => { font(size, weight); c.fillStyle = color; c.fillText(s, x, y); };
  line("NEXUS GAMING HUB", 22, primary, 800); y += 56;
  line(o.title.slice(0, 40) || t("Meine Gaming-Statistik"), 52, text, 800); y += 44;
  line(periodText, 26, muted, 500); y += 70;

  if (d.sessions === 0) { line(t("In diesem Zeitraum wurde kein Spiel erkannt."), 30, muted, 500); return; }

  if (o.totals) {
    const cols = [[hm(d.totalMinutes), t("Spielzeit")], [String(d.sessions), t("Sitzungen")], [String(d.games), t("Spiele")], [String(d.daysPlayed), t("Tage gespielt")]];
    const cw = (w - pad * 2) / cols.length;
    cols.forEach(([val, label], i) => {
      font(o.layout === "poster" ? 44 : 40, 800); c.fillStyle = i === 0 ? primary : text; c.fillText(val, pad + i * cw, y);
      font(20, 500); c.fillStyle = muted; c.fillText(label, pad + i * cw, y + 34);
    });
    y += 100;
    if (o.compare && d.previous) {
      const ch = change(d.totalMinutes, d.previous.totalMinutes);
      line(ch == null ? t("Vorheriger Zeitraum: keine Spielzeit erfasst") : t("{c} % Spielzeit gegenüber dem vorherigen Zeitraum ({p})", { c: (ch > 0 ? "+" : "") + ch, p: hm(d.previous.totalMinutes) }), 22, muted, 500);
      y += 50;
    }
  }
  if (o.top && d.top.length) {
    line(t("Meistgespielt"), 26, accent, 700); y += 24;
    const max = d.top[0].minutes || 1;
    const rows = o.layout === "poster" ? d.top : d.top.slice(0, 3);
    for (const g of rows) {
      y += 46;
      font(26, 600); c.fillStyle = text; c.fillText(g.name.length > 34 ? g.name.slice(0, 33) + "…" : g.name, pad, y);
      font(22, 500); c.fillStyle = muted; const tx = hm(g.minutes); c.fillText(tx, w - pad - c.measureText(tx).width, y);
      c.fillStyle = primary + "33"; c.fillRect(pad, y + 12, w - pad * 2, 8);
      c.fillStyle = primary; c.fillRect(pad, y + 12, (w - pad * 2) * (g.minutes / max), 8);
    }
    y += 60;
  }
  if (o.longest && d.longest && y < h - 120) { line(t("Längste Sitzung: {n} ({d})", { n: d.longest.name, d: hm(d.longest.minutes) }), 24, text, 500); y += 44; }
  if (o.perf && d.perf && y < h - 90) {
    const parts = [d.perf.cpuAvg != null ? `CPU Ø ${Math.round(d.perf.cpuAvg)} %` : null, d.perf.gpuAvg != null ? `GPU Ø ${Math.round(d.perf.gpuAvg)} %` : null].filter(Boolean);
    if (parts.length) { line(`${t("Auslastung beim Spielen")}: ${parts.join(" · ")}`, 22, muted, 500); y += 40; }
  }
  if (o.milestones && milestone && y < h - 90) { line(milestone, 22, accent, 600); y += 40; }
  font(18, 500); c.fillStyle = muted;
  c.fillText(t("Lokal erfasst vom Nexus Gaming Hub · Spielzeit = erkannte Laufzeit der Spiele"), pad, h - pad + 10);
}
