// Icon workshop: own icons (1:1) and covers (2:3) drawn on a canvas in the browser. Uploaded pictures are always
// drawn again (re-encoded), so no original file, no metadata and no SVG ever leaves this device.

export type IconFormat = "icon" | "cover";
export type IconShape = "rounded" | "circle" | "hexagon" | "square";
export type IconPattern = "none" | "stripes" | "dots" | "grid";
export interface IconSpec {
  format: IconFormat; shape: IconShape; c1: string; c2: string; angle: number; pattern: IconPattern;
  /** Big symbol: up to 3 letters/digits or one emoji; ignored while a picture is used. */
  symbol: string; symbolColor: string; glow: boolean; border: number; borderColor: string;
  /** Name under the symbol (cover only). */
  title: string;
  /** 0.5 .. 2 – zoom of the own picture. */
  zoom: number;
}

export const DEFAULT_ICON: IconSpec = { format: "icon", shape: "rounded", c1: "#22d3ee", c2: "#a78bfa", angle: 135, pattern: "none", symbol: "", symbolColor: "#ffffff", glow: true, border: 0, borderColor: "#ffffff", title: "", zoom: 1 };

export const ICON_TEMPLATES: { id: string; name: string; spec: Partial<IconSpec> }[] = [
  { id: "neon", name: "Neon", spec: { c1: "#0b0726", c2: "#1e1b4b", symbolColor: "#22d3ee", glow: true, border: 6, borderColor: "#f472b6", pattern: "grid" } },
  { id: "retro", name: "Retro", spec: { c1: "#f472b6", c2: "#facc15", symbolColor: "#1e1b4b", glow: false, border: 0, pattern: "stripes" } },
  { id: "minimal", name: "Minimal", spec: { c1: "#111111", c2: "#2a2a2a", symbolColor: "#f5f5f5", glow: false, border: 0, pattern: "none" } },
  { id: "gold", name: "Gold", spec: { c1: "#78350f", c2: "#fbbf24", symbolColor: "#fff7ed", glow: true, border: 6, borderColor: "#fde68a", pattern: "dots" } },
  { id: "ice", name: "Ice", spec: { c1: "#0c4a6e", c2: "#7dd3fc", symbolColor: "#ffffff", glow: true, border: 0, pattern: "none" } },
  { id: "fire", name: "Fire", spec: { c1: "#7f1d1d", c2: "#fb923c", symbolColor: "#fff7ed", glow: true, border: 0, pattern: "stripes" } },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const num = (v: unknown, min: number, max: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);

/** Up to 3 characters (letters, digits) or a single emoji – counted as the user sees them. */
export function cleanSymbol(s: unknown): string {
  if (typeof s !== "string") return "";
  const chars = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s.replace(/[\u0000-\u001f\u007f]/g, "").trim())].map((x) => x.segment);
  return chars.slice(0, 3).join("");
}

export function sanitizeIcon(input: unknown): IconSpec {
  const v = (input && typeof input === "object" ? input : {}) as Partial<IconSpec>;
  const d = DEFAULT_ICON;
  return {
    format: pick(v.format, ["icon", "cover"] as const, d.format), shape: pick(v.shape, ["rounded", "circle", "hexagon", "square"] as const, d.shape),
    c1: color(v.c1, d.c1), c2: color(v.c2, d.c2), angle: num(v.angle, 0, 360, d.angle), pattern: pick(v.pattern, ["none", "stripes", "dots", "grid"] as const, d.pattern),
    symbol: cleanSymbol(v.symbol), symbolColor: color(v.symbolColor, d.symbolColor), glow: v.glow !== false, border: num(v.border, 0, 24, d.border),
    borderColor: color(v.borderColor, d.borderColor), title: typeof v.title === "string" ? v.title.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 32) : "", zoom: num(v.zoom, 0.5, 2, 1),
  };
}

export const iconSize = (f: IconFormat) => (f === "icon" ? { w: 512, h: 512 } : { w: 600, h: 900 });

function shapePath(c: CanvasRenderingContext2D, s: IconShape, w: number, h: number) {
  c.beginPath();
  if (s === "circle") c.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  else if (s === "hexagon") { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3, x = w / 2 + (w / 2) * Math.cos(a), y = h / 2 + (h / 2) * Math.sin(a); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); }
  else if (s === "square") c.rect(0, 0, w, h);
  else c.roundRect(0, 0, w, h, Math.min(w, h) * 0.22);
}

/** Draws the icon or cover. `img` = own picture (already loaded), drawn to fill the area. */
export function drawIcon(cv: HTMLCanvasElement, spec: IconSpec, img?: CanvasImageSource & { width: number; height: number } | null) {
  const { w, h } = iconSize(spec.format);
  cv.width = w; cv.height = h;
  const c = cv.getContext("2d");
  if (!c) return;
  c.clearRect(0, 0, w, h);
  c.save();
  shapePath(c, spec.format === "cover" ? "rounded" : spec.shape, w, h);
  c.clip();
  const a = (spec.angle * Math.PI) / 180, r = Math.hypot(w, h) / 2;
  const g = c.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  g.addColorStop(0, spec.c1); g.addColorStop(1, spec.c2);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  if (img) {
    const scale = Math.max(w / img.width, h / img.height) * spec.zoom;
    c.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
  }
  c.globalAlpha = 0.14; c.fillStyle = "#ffffff"; c.strokeStyle = "#ffffff"; c.lineWidth = 2;
  if (spec.pattern === "stripes") for (let x = -h; x < w; x += 36) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h, 0); c.lineWidth = 12; c.stroke(); }
  else if (spec.pattern === "dots") for (let y = 18; y < h; y += 36) for (let x = 18; x < w; x += 36) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); }
  else if (spec.pattern === "grid") { for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } }
  c.globalAlpha = 1;
  if (!img && spec.symbol) {
    const emoji = /\p{Extended_Pictographic}/u.test(spec.symbol);
    const n = [...spec.symbol].length;
    const size = emoji ? w * 0.5 : w * (n <= 1 ? 0.5 : n === 2 ? 0.4 : 0.3);
    c.font = `${emoji ? "" : "800 "}${size}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    if (spec.glow) { c.shadowColor = spec.symbolColor; c.shadowBlur = w * 0.06; }
    c.fillStyle = spec.symbolColor;
    c.fillText(spec.symbol, w / 2, spec.format === "cover" && spec.title ? h * 0.42 : h / 2 + size * 0.04);
    c.shadowBlur = 0;
  }
  if (spec.format === "cover" && spec.title) {
    const grad = c.createLinearGradient(0, h * 0.6, 0, h); grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,.75)");
    c.fillStyle = grad; c.fillRect(0, h * 0.6, w, h * 0.4);
    c.fillStyle = "#ffffff"; c.textAlign = "center"; c.textBaseline = "alphabetic";
    let fs = 64; c.font = `800 ${fs}px system-ui, sans-serif`;
    while (c.measureText(spec.title).width > w - 60 && fs > 28) { fs -= 4; c.font = `800 ${fs}px system-ui, sans-serif`; }
    c.fillText(spec.title, w / 2, h - 70);
  }
  c.restore();
  if (spec.border > 0) {
    c.save(); shapePath(c, spec.format === "cover" ? "rounded" : spec.shape, w, h); c.clip();
    c.lineWidth = spec.border * 2; c.strokeStyle = spec.borderColor; shapePath(c, spec.format === "cover" ? "rounded" : spec.shape, w, h); c.stroke(); c.restore();
  }
}

/** Loads an own picture safely: only PNG/JPEG/WebP/GIF, at most 10 MB, drawn again at most 1200 px (no SVG, no metadata). */
export async function loadSafeImage(file: File): Promise<HTMLCanvasElement> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Nur PNG, JPEG, WebP oder GIF.");
  if (file.size > 10_000_000) throw new Error("Bild ist zu groß (max. 10 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bild nicht lesbar.")); i.src = url; });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("Bild nicht lesbar.");
    const s = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  } finally { URL.revokeObjectURL(url); }
}

/** Result as data URL that fits the PC's limits (cover ≤ 700 KB, icon ≤ 200 KB): PNG if small enough, else JPEG. */
export function exportIcon(cv: HTMLCanvasElement, max: number): string {
  // PNG keeps the transparent corners of round shapes; smaller PNG first, JPEG only as the last way out.
  for (const f of [1, 0.75, 0.5]) {
    const src = f === 1 ? cv : scaled(cv, f);
    const png = src.toDataURL("image/png");
    if (png.length <= max) return png;
  }
  for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) { const j = cv.toDataURL("image/jpeg", q); if (j.length <= max) return j; }
  throw new Error("Bild ist zu groß.");
}

function scaled(cv: HTMLCanvasElement, f: number) {
  const out = document.createElement("canvas"); out.width = Math.round(cv.width * f); out.height = Math.round(cv.height * f);
  out.getContext("2d")!.drawImage(cv, 0, 0, out.width, out.height);
  return out;
}
