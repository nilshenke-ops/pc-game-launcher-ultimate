// Own gaming collector cards: designed by the user, saved as journal entries of kind "card". The "rarity" is only a
// look (frame and shine) chosen by the user – nothing is bought, drawn at random or won.

import { drawImageFit, fillGradient, wrapLines, type ImageMap } from "./design";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";
export const RARITIES: { id: Rarity; label: string; frame: string; glow: string }[] = [
  { id: "common", label: "Gewöhnlich", frame: "#94a3b8", glow: "rgba(148,163,184,0)" },
  { id: "rare", label: "Selten", frame: "#38bdf8", glow: "rgba(56,189,248,0.55)" },
  { id: "epic", label: "Episch", frame: "#a855f7", glow: "rgba(168,85,247,0.6)" },
  { id: "legendary", label: "Legendär", frame: "#f59e0b", glow: "rgba(245,158,11,0.65)" },
  { id: "mythic", label: "Mythisch", frame: "#f43f5e", glow: "rgba(244,63,94,0.7)" },
];
export type CardBg = "gradient" | "stripes" | "dots" | "grid" | "plain";

export interface CardStat { label: string; value: string }
export interface Card {
  title: string; description: string; category: string; tags: string[]; favorite: boolean; collection: string;
  game: { gameId: string | null; gameName: string | null };
  imageId: string | null; rarity: Rarity; c1: string; c2: string; bg: CardBg; textColor: string;
  stats: CardStat[];
  links?: string[];
}

export const CARD_W = 630, CARD_H = 880;

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");

export function sanitizeCard(raw: unknown): Card {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const g = (r.game && typeof r.game === "object" ? r.game : {}) as Record<string, unknown>;
  return {
    title: str(r.title, 40) || "Neue Karte",
    description: str(r.description, 240),
    category: str(r.category, 40), collection: str(r.collection, 40),
    tags: Array.isArray(r.tags) ? r.tags.map((x) => str(x, 30)).filter(Boolean).slice(0, 12) : [],
    favorite: r.favorite === true,
    game: { gameId: typeof g.gameId === "string" ? g.gameId.slice(0, 80) : null, gameName: typeof g.gameName === "string" ? g.gameName.slice(0, 120) : null },
    imageId: typeof r.imageId === "string" && /^img_[A-Za-z0-9_-]{4,40}$/.test(r.imageId) ? r.imageId : null,
    rarity: RARITIES.some((x) => x.id === r.rarity) ? (r.rarity as Rarity) : "common",
    c1: color(r.c1, "#1e1b4b"), c2: color(r.c2, "#0e7490"),
    bg: (["gradient", "stripes", "dots", "grid", "plain"] as const).includes(r.bg as CardBg) ? (r.bg as CardBg) : "gradient",
    textColor: color(r.textColor, "#ffffff"),
    stats: Array.isArray(r.stats) ? r.stats.map((s) => { const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>; return { label: str(o.label, 20), value: str(o.value, 14) }; }).filter((s) => s.label).slice(0, 6) : [],
    links: Array.isArray(r.links) ? r.links.filter((x): x is string => typeof x === "string").slice(0, 50) : [],
  };
}

export const newCard = (): Card => sanitizeCard({ title: "Neue Karte", stats: [{ label: "Stärke", value: "7" }, { label: "Tempo", value: "5" }] });

/** A copy keeps everything but the name gets "(Kopie)". */
export const duplicateCard = (c: Card): Card => sanitizeCard({ ...c, title: `${c.title} (Kopie)`.slice(0, 40), favorite: false });

function pattern(ctx: CanvasRenderingContext2D, kind: CardBg, w: number, h: number) {
  ctx.save(); ctx.globalAlpha = 0.12; ctx.strokeStyle = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 2;
  if (kind === "stripes") for (let x = -h; x < w; x += 28) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
  if (kind === "dots") for (let y = 14; y < h; y += 28) for (let x = 14; x < w; x += 28) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
  if (kind === "grid") { for (let x = 0; x < w; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } }
  ctx.restore();
}

/** Draws the card at 630 × 880 (× scale). `labels` translates the rarity name. */
export function drawCard(cv: HTMLCanvasElement, c: Card, images: ImageMap, opts: { scale?: number; rarityLabel?: string } = {}) {
  const s = opts.scale ?? 1, W = CARD_W, H = CARD_H;
  cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const rar = RARITIES.find((r) => r.id === c.rarity)!;
  // outer frame
  ctx.fillStyle = "#0b0f19"; ctx.fillRect(0, 0, W, H);
  const fg = ctx.createLinearGradient(0, 0, W, H); fg.addColorStop(0, rar.frame); fg.addColorStop(0.5, "#ffffff"); fg.addColorStop(1, rar.frame);
  ctx.fillStyle = c.rarity === "common" ? rar.frame : fg;
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 36); ctx.fill();
  // inner area
  ctx.save(); ctx.beginPath(); ctx.roundRect(18, 18, W - 36, H - 36, 26); ctx.clip();
  if (c.bg === "plain") { ctx.fillStyle = c.c1; ctx.fillRect(0, 0, W, H); } else fillGradient(ctx, W, H, c.c1, c.c2, 150);
  if (c.bg !== "plain" && c.bg !== "gradient") pattern(ctx, c.bg, W, H);
  // picture window
  const px = 46, py = 110, pw = W - 92, ph = 420;
  ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.clip();
  ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(px, py, pw, ph);
  const img = c.imageId ? images.get(c.imageId) : null;
  if (img) drawImageFit(ctx, img, px, py, pw, ph, "cover");
  else { ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "600 34px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText((c.title[0] ?? "?").toUpperCase(), px + pw / 2, py + ph / 2); }
  ctx.restore();
  if (rar.glow !== "rgba(148,163,184,0)") { ctx.save(); ctx.shadowColor = rar.glow; ctx.shadowBlur = 30; ctx.strokeStyle = rar.frame; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 18); ctx.stroke(); ctx.restore(); }
  // name + rarity
  ctx.fillStyle = c.textColor; ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.font = "900 44px system-ui, -apple-system, 'Segoe UI', sans-serif";
  let name = c.title; while (ctx.measureText(name).width > W - 230 && name.length > 3) name = name.slice(0, -2) + "…";
  ctx.fillText(name, 46, 44);
  ctx.font = "800 20px system-ui, sans-serif"; ctx.textAlign = "right"; ctx.fillStyle = rar.frame;
  ctx.fillText((opts.rarityLabel ?? rar.label).toUpperCase(), W - 46, 56);
  // game + category line
  ctx.textAlign = "left"; ctx.fillStyle = c.textColor; ctx.globalAlpha = 0.8; ctx.font = "600 22px system-ui, sans-serif";
  const sub = [c.game.gameName, c.category].filter(Boolean).join(" · ");
  if (sub) ctx.fillText(sub.slice(0, 48), 46, 548);
  ctx.globalAlpha = 1;
  // description
  ctx.font = "400 22px system-ui, sans-serif";
  const lines = wrapLines((t) => ctx.measureText(t).width, c.description, W - 92).slice(0, 4);
  lines.forEach((l, i) => ctx.fillText(l, 46, 584 + i * 28));
  // stats
  const st = c.stats.slice(0, 6), cols = Math.max(1, Math.min(3, st.length)), bw = (W - 92 - (cols - 1) * 12) / cols;
  st.forEach((x, i) => {
    const col = i % cols, row = Math.floor(i / cols), bx = 46 + col * (bw + 12), by = H - 46 - (Math.ceil(st.length / cols) - row) * 62 + 6;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.roundRect(bx, by, bw, 54, 12); ctx.fill();
    ctx.fillStyle = c.textColor; ctx.globalAlpha = 0.75; ctx.font = "600 16px system-ui, sans-serif"; ctx.fillText(x.label.toUpperCase().slice(0, 16), bx + 12, by + 8);
    ctx.globalAlpha = 1; ctx.font = "900 22px system-ui, sans-serif"; ctx.fillText(x.value, bx + 12, by + 26);
  });
  ctx.restore();
}

export function cardImageIds(c: Card) { return c.imageId ? [c.imageId] : []; }
