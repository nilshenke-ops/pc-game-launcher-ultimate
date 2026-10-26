// Poster, cover, banner and profile-picture designs: layers (picture, text, shape) on a canvas of a fixed size.
// Pure data + drawing; the editor lives in components/design-editor.tsx. Saved as journal entries of kind "design"
// (works without the PC, synced like every journal entry). Only own pictures are used – nothing is fetched.

export type FontId = "sans" | "serif" | "mono" | "impact" | "round";
export const FONTS: { id: FontId; label: string; css: string }[] = [
  { id: "sans", label: "Klar", css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: "impact", label: "Kräftig", css: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  { id: "serif", label: "Klassisch", css: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Technik", css: "'Courier New', ui-monospace, Menlo, monospace" },
  { id: "round", label: "Verspielt", css: "'Trebuchet MS', 'Comic Sans MS', 'Chalkboard SE', sans-serif" },
];

interface Base { id: string; x: number; y: number; w: number; h: number; opacity: number }
export interface ImageLayer extends Base { type: "image"; imageId: string; fit: "cover" | "contain"; radius: number }
export interface TextLayer extends Base { type: "text"; text: string; font: FontId; size: number; color: string; weight: 400 | 700 | 900; align: "left" | "center" | "right"; shadow: boolean; stroke: string | null }
export interface ShapeLayer extends Base { type: "shape"; shape: "rect" | "ellipse" | "line"; fill: string | null; stroke: string | null; strokeWidth: number; radius: number }
export type Layer = ImageLayer | TextLayer | ShapeLayer;

export interface Background { kind: "color" | "gradient" | "image"; c1: string; c2: string; angle: number; imageId?: string | null }
export interface Design {
  title: string; area: "poster" | "banner"; formatId: string; w: number; h: number;
  background: Background; frame: { width: number; color: string };
  layers: Layer[];
  game?: { gameId: string | null; gameName: string | null };
  tags?: string[];
  /** Rendered picture (longest side 1600 px) and thumbnail, made when saving – for galleries and the exhibition. */
  renderId?: string | null; thumbId?: string | null;
}

/** Format presets. Sources: Steam = Steamworks documentation (partner.steamgames.com, library assets); YouTube and
 * Twitch = figures that several guides give (checked October 2026) – the platforms may change them. */
export interface Format { id: string; area: "poster" | "banner"; label: string; w: number; h: number; note?: string; safe?: { w: number; h: number }; round?: boolean }
export const FORMATS: Format[] = [
  { id: "poster-a4", area: "poster", label: "Poster A4 hochkant", w: 1240, h: 1754, note: "A4 bei 150 dpi" },
  { id: "poster-square", area: "poster", label: "Quadrat", w: 1080, h: 1080 },
  { id: "cover-steam", area: "poster", label: "Cover (Steam-Bibliothek)", w: 600, h: 900, note: "Steam „Library Capsule“ 600 × 900 – laut Steamworks-Dokumentation" },
  { id: "wallpaper", area: "poster", label: "Hintergrundbild 16:9", w: 1920, h: 1080 },
  { id: "banner-youtube", area: "banner", label: "YouTube-Kanalbanner", w: 2560, h: 1440, safe: { w: 1546, h: 423 }, note: "2560 × 1440, sichtbar auf allen Geräten nur die Mitte 1546 × 423 – Angaben aus Ratgebern (Okt. 2026), vor dem Hochladen in der YouTube-Hilfe prüfen" },
  { id: "banner-twitch", area: "banner", label: "Twitch-Profilbanner", w: 1200, h: 480, note: "1200 × 480 – Angabe aus Ratgebern (Okt. 2026), vor dem Hochladen bei Twitch prüfen" },
  { id: "steam-hero", area: "banner", label: "Steam „Library Hero“", w: 3840, h: 1240, note: "3840 × 1240 – laut Steamworks-Dokumentation" },
  { id: "header-3x1", area: "banner", label: "Header 3:1", w: 1500, h: 500 },
  { id: "profile", area: "banner", label: "Profilbild", w: 800, h: 800, round: true, note: "Viele Plattformen schneiden Profilbilder rund zu – der Kreis zeigt, was sicher sichtbar bleibt." },
];
export const MIN_SIDE = 64, MAX_SIDE = 4096, MAX_LAYERS = 40;

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const num = (v: unknown, min: number, max: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max) : "");
const imgId = (v: unknown) => (typeof v === "string" && /^img_[A-Za-z0-9_-]{4,40}$/.test(v) ? v : null);
const pick = <T extends string>(v: unknown, all: readonly T[], d: T) => (all.includes(v as T) ? (v as T) : d);
export const layerId = () => "l" + Math.random().toString(36).slice(2, 9);

export function sanitizeLayer(raw: unknown, W: number, H: number): Layer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = {
    id: typeof r.id === "string" && /^[a-z0-9]{2,12}$/i.test(r.id) ? r.id : layerId(),
    x: num(r.x, -W, 2 * W, 0), y: num(r.y, -H, 2 * H, 0), w: num(r.w, 4, 3 * W, W / 3), h: num(r.h, 4, 3 * H, H / 6), opacity: num(r.opacity, 0.05, 1, 1),
  };
  if (r.type === "image") { const id = imgId(r.imageId); return id ? { ...base, type: "image", imageId: id, fit: pick(r.fit, ["cover", "contain"] as const, "cover"), radius: num(r.radius, 0, 2000, 0) } : null; }
  if (r.type === "text") return { ...base, type: "text", text: str(r.text, 300), font: pick(r.font, FONTS.map((f) => f.id), "sans"), size: num(r.size, 8, 800, 64), color: color(r.color, "#ffffff"), weight: ([400, 700, 900] as const).includes(r.weight as 400) ? (r.weight as 400 | 700 | 900) : 700, align: pick(r.align, ["left", "center", "right"] as const, "center"), shadow: r.shadow === true, stroke: r.stroke == null ? null : color(r.stroke, "#000000") };
  if (r.type === "shape") return { ...base, type: "shape", shape: pick(r.shape, ["rect", "ellipse", "line"] as const, "rect"), fill: r.fill == null ? null : color(r.fill, "#22d3ee"), stroke: r.stroke == null ? null : color(r.stroke, "#ffffff"), strokeWidth: num(r.strokeWidth, 0, 200, 0), radius: num(r.radius, 0, 2000, 0) };
  return null;
}

/** Everything that comes from storage or a file is checked: sizes, colours, picture ids, at most 40 layers. */
export function sanitizeDesign(raw: unknown): Design {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fmt = FORMATS.find((f) => f.id === r.formatId);
  const w = Math.round(fmt ? fmt.w : num(r.w, MIN_SIDE, MAX_SIDE, 1080)), h = Math.round(fmt ? fmt.h : num(r.h, MIN_SIDE, MAX_SIDE, 1080));
  const bg = (r.background && typeof r.background === "object" ? r.background : {}) as Record<string, unknown>;
  const fr = (r.frame && typeof r.frame === "object" ? r.frame : {}) as Record<string, unknown>;
  const g = (r.game && typeof r.game === "object" ? r.game : {}) as Record<string, unknown>;
  return {
    title: str(r.title, 80) || "Entwurf",
    area: fmt?.area ?? pick(r.area, ["poster", "banner"] as const, "poster"),
    formatId: fmt ? fmt.id : "custom", w, h,
    background: { kind: pick(bg.kind, ["color", "gradient", "image"] as const, "gradient"), c1: color(bg.c1, "#0f172a"), c2: color(bg.c2, "#6d28d9"), angle: num(bg.angle, 0, 360, 135), imageId: imgId(bg.imageId) },
    frame: { width: num(fr.width, 0, Math.min(w, h) / 4, 0), color: color(fr.color, "#ffffff") },
    layers: (Array.isArray(r.layers) ? r.layers : []).slice(0, MAX_LAYERS).map((l) => sanitizeLayer(l, w, h)).filter((l): l is Layer => !!l),
    game: { gameId: typeof g.gameId === "string" ? g.gameId.slice(0, 80) : null, gameName: typeof g.gameName === "string" ? g.gameName.slice(0, 120) : null },
    tags: Array.isArray(r.tags) ? r.tags.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 30)).slice(0, 20) : [],
    renderId: imgId(r.renderId), thumbId: imgId(r.thumbId),
  };
}

export function newDesign(format: Format, title = "Entwurf"): Design {
  return sanitizeDesign({ title, formatId: format.id, layers: [] });
}

/** Templates: starting layouts only (text and shapes), every part can be changed or removed. */
export const DESIGN_TEMPLATES: { id: string; area: "poster" | "banner" | "any"; name: string; make: (w: number, h: number) => Partial<Design> }[] = [
  { id: "headline", area: "any", name: "Großer Titel", make: (w, h) => ({ background: { kind: "gradient", c1: "#0f172a", c2: "#7c3aed", angle: 135 }, layers: [
    { id: "t1", type: "text", text: "SPIELNAME", font: "impact", size: Math.round(Math.min(w, h) * 0.16), color: "#ffffff", weight: 900, align: "center", shadow: true, stroke: null, x: w * 0.05, y: h * 0.38, w: w * 0.9, h: h * 0.2, opacity: 1 },
    { id: "t2", type: "text", text: "Untertitel", font: "sans", size: Math.round(Math.min(w, h) * 0.05), color: "#e2e8f0", weight: 400, align: "center", shadow: false, stroke: null, x: w * 0.1, y: h * 0.58, w: w * 0.8, h: h * 0.08, opacity: 1 },
  ] as Layer[] }) },
  { id: "neon", area: "any", name: "Neon-Rahmen", make: (w, h) => ({ background: { kind: "color", c1: "#05060f", c2: "#05060f", angle: 0 }, frame: { width: Math.round(Math.min(w, h) * 0.02), color: "#22d3ee" }, layers: [
    { id: "s1", type: "shape", shape: "rect", fill: null, stroke: "#f472b6", strokeWidth: Math.max(2, Math.round(Math.min(w, h) * 0.008)), radius: Math.round(Math.min(w, h) * 0.04), x: w * 0.08, y: h * 0.08, w: w * 0.84, h: h * 0.84, opacity: 1 },
    { id: "t1", type: "text", text: "LEVEL UP", font: "impact", size: Math.round(Math.min(w, h) * 0.14), color: "#22d3ee", weight: 900, align: "center", shadow: true, stroke: null, x: w * 0.1, y: h * 0.42, w: w * 0.8, h: h * 0.18, opacity: 1 },
  ] as Layer[] }) },
  { id: "band", area: "banner", name: "Band mit Name", make: (w, h) => ({ background: { kind: "gradient", c1: "#111827", c2: "#0e7490", angle: 90 }, layers: [
    { id: "s1", type: "shape", shape: "rect", fill: "#000000", stroke: null, strokeWidth: 0, radius: 0, x: 0, y: h * 0.4, w, h: h * 0.2, opacity: 0.45 },
    { id: "t1", type: "text", text: "Kanalname", font: "sans", size: Math.round(h * 0.12), color: "#ffffff", weight: 900, align: "center", shadow: false, stroke: null, x: w * 0.2, y: h * 0.43, w: w * 0.6, h: h * 0.14, opacity: 1 },
  ] as Layer[] }) },
  { id: "badge", area: "banner", name: "Profil-Abzeichen", make: (w, h) => ({ background: { kind: "gradient", c1: "#f97316", c2: "#db2777", angle: 160 }, layers: [
    { id: "s1", type: "shape", shape: "ellipse", fill: "#0b1020", stroke: "#ffffff", strokeWidth: Math.round(Math.min(w, h) * 0.02), radius: 0, x: w * 0.18, y: h * 0.18, w: w * 0.64, h: h * 0.64, opacity: 1 },
    { id: "t1", type: "text", text: "NG", font: "impact", size: Math.round(Math.min(w, h) * 0.28), color: "#ffffff", weight: 900, align: "center", shadow: false, stroke: null, x: w * 0.18, y: h * 0.34, w: w * 0.64, h: h * 0.32, opacity: 1 },
  ] as Layer[] }) },
];

export function applyTemplate(d: Design, id: string): Design {
  const tpl = DESIGN_TEMPLATES.find((x) => x.id === id);
  return tpl ? sanitizeDesign({ ...d, ...tpl.make(d.w, d.h), title: d.title, formatId: d.formatId, w: d.w, h: d.h }) : d;
}

// ------------------------------------------------------------------------------------------ undo / redo

/** Snapshots of the design; at most 60 steps back. */
export class History<T> {
  private past: string[] = [];
  private future: string[] = [];
  constructor(private limit = 60) {}
  push(state: T) { this.past.push(JSON.stringify(state)); if (this.past.length > this.limit) this.past.shift(); this.future = []; }
  undo(current: T): T | null { const p = this.past.pop(); if (p == null) return null; this.future.push(JSON.stringify(current)); return JSON.parse(p) as T; }
  redo(current: T): T | null { const f = this.future.pop(); if (f == null) return null; this.past.push(JSON.stringify(current)); return JSON.parse(f) as T; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}

// ------------------------------------------------------------------------------------------ geometry

/** The topmost layer under a point (canvas pixels), or null. */
export function hitLayer(layers: Layer[], x: number, y: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) return l; }
  return null;
}

export function moveLayer(layers: Layer[], id: string, dir: "up" | "down" | "top" | "bottom"): Layer[] {
  const i = layers.findIndex((l) => l.id === id);
  if (i < 0) return layers;
  const out = [...layers]; const [l] = out.splice(i, 1);
  const j = dir === "top" ? out.length : dir === "bottom" ? 0 : dir === "up" ? Math.min(out.length, i + 1) : Math.max(0, i - 1);
  out.splice(j, 0, l);
  return out;
}

// ------------------------------------------------------------------------------------------ drawing

export type ImageMap = Map<string, CanvasImageSource & { width: number; height: number }>;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillGradient(ctx: CanvasRenderingContext2D, w: number, h: number, c1: string, c2: string, angle: number) {
  const a = (angle * Math.PI) / 180, cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

export function drawImageFit(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, fit: "cover" | "contain") {
  const s = fit === "cover" ? Math.max(w / img.width, h / img.height) : Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Wraps text into lines that fit `width`. */
export function wrapLines(measure: (s: string) => number, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export function drawDesign(cv: HTMLCanvasElement, d: Design, images: ImageMap, scale = 1) {
  cv.width = Math.max(1, Math.round(d.w * scale)); cv.height = Math.max(1, Math.round(d.h * scale));
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const bg = d.background;
  const bgImg = bg.kind === "image" && bg.imageId ? images.get(bg.imageId) : null;
  if (bg.kind === "color") { ctx.fillStyle = bg.c1; ctx.fillRect(0, 0, d.w, d.h); }
  else fillGradient(ctx, d.w, d.h, bg.c1, bg.c2, bg.angle);
  if (bgImg) drawImageFit(ctx, bgImg, 0, 0, d.w, d.h, "cover");
  for (const l of d.layers) {
    ctx.save();
    ctx.globalAlpha = l.opacity;
    if (l.type === "image") {
      const img = images.get(l.imageId);
      if (img) { roundRect(ctx, l.x, l.y, l.w, l.h, l.radius); ctx.clip(); drawImageFit(ctx, img, l.x, l.y, l.w, l.h, l.fit); }
    } else if (l.type === "shape") {
      if (l.shape === "line") { ctx.strokeStyle = l.stroke ?? l.fill ?? "#ffffff"; ctx.lineWidth = Math.max(1, l.strokeWidth || 4); ctx.beginPath(); ctx.moveTo(l.x, l.y + l.h / 2); ctx.lineTo(l.x + l.w, l.y + l.h / 2); ctx.stroke(); }
      else {
        if (l.shape === "ellipse") { ctx.beginPath(); ctx.ellipse(l.x + l.w / 2, l.y + l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2); } else roundRect(ctx, l.x, l.y, l.w, l.h, l.radius);
        if (l.fill) { ctx.fillStyle = l.fill; ctx.fill(); }
        if (l.stroke && l.strokeWidth > 0) { ctx.strokeStyle = l.stroke; ctx.lineWidth = l.strokeWidth; ctx.stroke(); }
      }
    } else {
      const font = FONTS.find((f) => f.id === l.font)?.css ?? FONTS[0].css;
      ctx.font = `${l.weight} ${l.size}px ${font}`;
      ctx.textBaseline = "top";
      ctx.textAlign = l.align;
      const lines = wrapLines((s) => ctx.measureText(s).width, l.text, l.w);
      const lh = l.size * 1.15;
      const tx = l.align === "left" ? l.x : l.align === "right" ? l.x + l.w : l.x + l.w / 2;
      if (l.shadow) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = l.size * 0.25; ctx.shadowOffsetY = l.size * 0.06; }
      lines.forEach((line, i) => {
        const y = l.y + i * lh;
        // A single word wider than the box (e.g. a long title) gets smaller instead of sticking out.
        const wide = ctx.measureText(line).width;
        const fit = wide > l.w ? l.w / wide : 1;
        if (fit < 1) ctx.font = `${l.weight} ${Math.max(6, l.size * fit)}px ${font}`;
        const yy = y + (fit < 1 ? (l.size * (1 - fit)) / 2 : 0);
        if (l.stroke) { ctx.lineWidth = Math.max(1, l.size * fit * 0.06); ctx.strokeStyle = l.stroke; ctx.lineJoin = "round"; ctx.strokeText(line, tx, yy); }
        ctx.fillStyle = l.color; ctx.fillText(line, tx, yy);
        if (fit < 1) ctx.font = `${l.weight} ${l.size}px ${font}`;
      });
    }
    ctx.restore();
  }
  if (d.frame.width > 0) { ctx.strokeStyle = d.frame.color; ctx.lineWidth = d.frame.width; ctx.strokeRect(d.frame.width / 2, d.frame.width / 2, d.w - d.frame.width, d.h - d.frame.width); }
}

/** Picture ids a design needs (background + picture layers). */
export function designImageIds(d: Design): string[] {
  return [...new Set([d.background.kind === "image" ? d.background.imageId : null, ...d.layers.map((l) => (l.type === "image" ? l.imageId : null))].filter((x): x is string => !!x))];
}

export function safeName(s: string) { return s.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "entwurf"; }
