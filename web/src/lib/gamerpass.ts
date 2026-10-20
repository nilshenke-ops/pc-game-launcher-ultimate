/** Trophy room and Gamer-Pass card – built only from the own GameQuest data (XP, level, achievements, play time). */

export interface Achievement { id: string; title: string; description: string; xp: number; source: string; value: number; target: number; unlocked: boolean; unlockedAt?: string | null }
export interface PassInput {
  xp: number; level: number; levelFrom: number; levelTo: number; achievements: Achievement[];
  totals: { minutes: number; sessions: number; games: number; longestStreakDays: number; wins: number; matches: number };
}
export type Tier = "gold" | "silver" | "bronze";

/** Trophy tier from the XP an achievement is worth. */
export const tier = (xp: number): Tier => (xp >= 100 ? "gold" : xp >= 50 ? "silver" : "bronze");

export interface PassData {
  name: string; emoji: string; level: number; progress: number; xp: number; xpToNext: number;
  hours: number; games: number; streak: number; trophies: { gold: number; silver: number; bronze: number; total: number; of: number };
  topGame?: string | null; latest?: Achievement | null;
}

export function passData(q: PassInput, name: string, emoji: string, topGame?: string | null): PassData {
  const unlocked = q.achievements.filter((a) => a.unlocked);
  const count = (x: Tier) => unlocked.filter((a) => tier(a.xp) === x).length;
  const span = Math.max(1, q.levelTo - q.levelFrom);
  const latest = [...unlocked].filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))[0] ?? null;
  return {
    name: name.trim() || "Gamer", emoji: emoji || "🎮", level: q.level, xp: q.xp,
    progress: Math.min(1, Math.max(0, (q.xp - q.levelFrom) / span)), xpToNext: Math.max(0, q.levelTo - q.xp),
    hours: Math.round(q.totals.minutes / 6) / 10, games: q.totals.games, streak: q.totals.longestStreakDays,
    trophies: { gold: count("gold"), silver: count("silver"), bronze: count("bronze"), total: unlocked.length, of: q.achievements.length },
    topGame: topGame ?? null, latest,
  };
}

const TIER_COLOR: Record<Tier, string> = { gold: "#facc15", silver: "#cbd5e1", bronze: "#d97706" };
export const tierColor = (x: Tier) => TIER_COLOR[x];

// ------------------------------------------------------------------ editor settings (stored only on this device / in the own account)

export const PASS_SECTIONS = ["stats", "trophies", "favorites", "badges"] as const;
export type PassSection = (typeof PASS_SECTIONS)[number];
export const PASS_FRAMES = ["none", "neon", "gold", "holo", "pixel"] as const;
export type PassFrame = (typeof PASS_FRAMES)[number];
export const PASS_BACKGROUNDS: Record<string, [string, string]> = {
  midnight: ["#0b1220", "#1e1b4b"], synthwave: ["#1a0b2e", "#5b1a5e"], aurora: ["#041016", "#0f3d3e"], lava: ["#1c0a06", "#5a1a0a"],
  ocean: ["#061a2b", "#1e3a8a"], forest: ["#06110f", "#1b3a24"], mono: ["#0a0a0a", "#2a2a2a"], candy: ["#3b0a2e", "#6d28d9"],
};

export interface PassStyle {
  name: string; emoji: string;
  /** Own picture, already shrunk to 256 px JPEG in the browser (data URL), or null = emoji. */
  avatar: string | null;
  title: string;
  favorites: { id: string; name: string }[];
  badges: string[];
  frame: PassFrame; bg: string;
  /** null = colour of the current design */
  accent: string | null;
  /** Shown sections in this order (missing = hidden). */
  order: PassSection[];
}
export const DEFAULT_PASS: PassStyle = { name: "", emoji: "🎮", avatar: null, title: "", favorites: [], badges: [], frame: "neon", bg: "midnight", accent: null, order: ["stats", "trophies", "favorites", "badges"] };

const HEX = /^#[0-9a-fA-F]{6}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "");

/** Checks stored or synced editor settings – also data from another browser via the account. */
export function sanitizePass(input: unknown): PassStyle {
  const v = (input && typeof input === "object" ? input : {}) as Partial<PassStyle>;
  const d = DEFAULT_PASS;
  const avatar = typeof v.avatar === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v.avatar) && v.avatar.length <= 80_000 ? v.avatar : null;
  const order = Array.isArray(v.order) ? [...new Set(v.order.filter((x): x is PassSection => (PASS_SECTIONS as readonly string[]).includes(x as string)))] : d.order;
  return {
    name: clean(v.name, 22), emoji: clean(v.emoji, 8) || d.emoji, avatar, title: clean(v.title, 30),
    favorites: Array.isArray(v.favorites) ? v.favorites.filter((f) => f && typeof f.id === "string" && typeof f.name === "string").slice(0, 3).map((f) => ({ id: clean(f.id, 64), name: clean(f.name, 40) })) : [],
    badges: Array.isArray(v.badges) ? [...new Set(v.badges.filter((b): b is string => typeof b === "string").map((b) => b.slice(0, 64)))].slice(0, 4) : [],
    frame: (PASS_FRAMES as readonly string[]).includes(v.frame as string) ? v.frame! : d.frame,
    bg: typeof v.bg === "string" && v.bg in PASS_BACKGROUNDS ? v.bg : d.bg,
    accent: typeof v.accent === "string" && HEX.test(v.accent) ? v.accent : null,
    order,
  };
}

/** Height of each section on the card – the card grows or shrinks with the shown sections. */
const SECTION_H: Record<PassSection, number> = { stats: 150, trophies: 100, favorites: 100, badges: 100 };
export const passHeight = (order: PassSection[]) => 270 + order.reduce((n, s) => n + SECTION_H[s], 0) + 50;

export interface PassLabels { level: string; hours: string; games: string; streak: string; trophies: string; top: string; next: string; favorites: string; badges: string; noBadges: string; noFavorites: string }

function frame(c: CanvasRenderingContext2D, f: PassFrame, W: number, H: number, accent: string) {
  c.save();
  if (f === "neon") { c.shadowColor = accent; c.shadowBlur = 24; c.strokeStyle = accent; c.lineWidth = 4; c.beginPath(); c.roundRect(8, 8, W - 16, H - 16, 30); c.stroke(); }
  else if (f === "gold") { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#fde68a"); g.addColorStop(0.5, "#b45309"); g.addColorStop(1, "#fde68a"); c.strokeStyle = g; c.lineWidth = 10; c.beginPath(); c.roundRect(7, 7, W - 14, H - 14, 30); c.stroke(); }
  else if (f === "holo") { const g = c.createLinearGradient(0, 0, W, 0); ["#22d3ee", "#a78bfa", "#f472b6", "#facc15", "#34d399", "#22d3ee"].forEach((x, i) => g.addColorStop(i / 5, x)); c.strokeStyle = g; c.lineWidth = 6; c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 32); c.stroke(); }
  else if (f === "pixel") { c.fillStyle = accent; const s = 12; for (let x = 0; x < W; x += s * 2) { c.fillRect(x, 0, s, s); c.fillRect(x + s, H - s, s, s); } for (let y = 0; y < H; y += s * 2) { c.fillRect(0, y + s, s, s); c.fillRect(W - s, y, s, s); } }
  c.restore();
}

function pills(c: CanvasRenderingContext2D, y: number, items: { text: string; dot?: string }[], empty: string) {
  let x = 56;
  c.font = "600 24px system-ui, sans-serif";
  if (!items.length) { c.fillStyle = "rgba(255,255,255,.45)"; c.fillText(empty, x, y + 34); return; }
  for (const it of items) {
    const text = it.text.length > 24 ? it.text.slice(0, 23) + "…" : it.text;
    const w = c.measureText(text).width + (it.dot ? 64 : 40);
    if (x + w > 944) break;
    c.fillStyle = "rgba(255,255,255,.09)"; c.beginPath(); c.roundRect(x, y, w, 50, 25); c.fill();
    if (it.dot) { c.fillStyle = it.dot; c.beginPath(); c.arc(x + 26, y + 25, 9, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = "#fff"; c.fillText(text, x + (it.dot ? 44 : 20), y + 33);
    x += w + 12;
  }
}

/** Draws the Gamer-Pass as a 1000 px wide card (for saving or sharing as a picture). */
export function drawPass(canvas: HTMLCanvasElement, d: PassData, labels: PassLabels, style: PassStyle = DEFAULT_PASS, opts: { accent?: string; avatar?: HTMLImageElement | null; achievements?: Achievement[] } = {}) {
  const W = 1000, H = passHeight(style.order);
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return;
  const accent = style.accent ?? opts.accent ?? "#22d3ee";
  const [b0, b1] = PASS_BACKGROUNDS[style.bg] ?? PASS_BACKGROUNDS.midnight;
  const bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, b0); bg.addColorStop(1, b1);
  c.fillStyle = bg; c.beginPath(); c.roundRect(0, 0, W, H, 36); c.fill();
  frame(c, style.frame, W, H, accent);
  c.textBaseline = "alphabetic";
  // avatar
  if (opts.avatar) {
    c.save(); c.beginPath(); c.roundRect(56, 56, 140, 140, 28); c.clip(); c.drawImage(opts.avatar, 56, 56, 140, 140); c.restore();
    c.strokeStyle = accent; c.lineWidth = 3; c.beginPath(); c.roundRect(56, 56, 140, 140, 28); c.stroke();
  } else { c.font = "120px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"; c.fillText(d.emoji, 56, 180); }
  c.fillStyle = "#fff"; c.font = "800 58px system-ui, sans-serif"; c.fillText(d.name.slice(0, 22), 222, 112);
  let y = 156;
  if (style.title) { c.fillStyle = "rgba(255,255,255,.75)"; c.font = "italic 600 28px system-ui, sans-serif"; c.fillText(style.title, 224, y - 4); y += 34; }
  c.fillStyle = accent; c.font = "700 32px system-ui, sans-serif"; c.fillText(`${labels.level} ${d.level}`, 222, y + 6);
  c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.roundRect(222, y + 22, 700, 18, 9); c.fill();
  c.fillStyle = accent; c.beginPath(); c.roundRect(222, y + 22, Math.max(18, 700 * d.progress), 18, 9); c.fill();
  c.fillStyle = "rgba(255,255,255,.7)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(`${d.xp} XP · ${labels.next}`, 222, y + 68);
  y = 270;
  const head = (text: string) => { c.fillStyle = "rgba(255,255,255,.55)"; c.font = "700 20px system-ui, sans-serif"; c.fillText(text.toUpperCase(), 56, y + 22); };
  for (const sec of style.order) {
    if (sec === "stats") {
      const stats: [string, string][] = [[labels.hours, d.hours.toLocaleString("de-DE")], [labels.games, String(d.games)], [labels.streak, String(d.streak)], [labels.trophies, `${d.trophies.total}/${d.trophies.of}`]];
      stats.forEach(([k, v], i) => {
        const x = 56 + i * 228;
        c.fillStyle = "rgba(255,255,255,.07)"; c.beginPath(); c.roundRect(x, y, 208, 128, 20); c.fill();
        c.fillStyle = "#fff"; c.font = "800 48px system-ui, sans-serif"; c.fillText(v, x + 22, y + 68);
        c.fillStyle = "rgba(255,255,255,.65)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(k, x + 22, y + 104);
      });
    } else if (sec === "trophies") {
      (["gold", "silver", "bronze"] as Tier[]).forEach((x, i) => {
        const cx = 86 + i * 110;
        c.fillStyle = TIER_COLOR[x]; c.beginPath(); c.arc(cx, y + 42, 30, 0, Math.PI * 2); c.fill();
        c.fillStyle = "#0b1220"; c.font = "800 28px system-ui, sans-serif"; c.textAlign = "center"; c.fillText(String(d.trophies[x]), cx, y + 52); c.textAlign = "left";
      });
      if (d.topGame) { c.fillStyle = "rgba(255,255,255,.65)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(labels.top, 440, y + 28); c.fillStyle = "#fff"; c.font = "700 32px system-ui, sans-serif"; c.fillText(d.topGame.slice(0, 26), 440, y + 66); }
    } else if (sec === "favorites") {
      head(labels.favorites);
      pills(c, y + 36, style.favorites.map((f) => ({ text: "★ " + f.name })), labels.noFavorites);
    } else if (sec === "badges") {
      head(labels.badges);
      const all = opts.achievements ?? [];
      pills(c, y + 36, style.badges.map((id) => all.find((a) => a.id === id && a.unlocked)).filter((a): a is Achievement => !!a).map((a) => ({ text: a.title, dot: TIER_COLOR[tier(a.xp)] })), labels.noBadges);
    }
    y += SECTION_H[sec];
  }
  c.fillStyle = "rgba(255,255,255,.35)"; c.font = "500 18px system-ui, sans-serif"; c.textAlign = "right"; c.fillText("Nexus Gaming Hub", W - 40, H - 26); c.textAlign = "left";
}

/** Own picture → 256×256 JPEG (centre cut), so no original file, metadata or huge picture is ever stored. */
export async function avatarFromFile(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Nur PNG, JPEG, WebP oder GIF.");
  if (file.size > 8_000_000) throw new Error("Bild ist zu groß (max. 8 MB).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bild nicht lesbar.")); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("Bild nicht lesbar.");
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    cv.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    for (const q of [0.85, 0.7, 0.55]) { const out = cv.toDataURL("image/jpeg", q); if (out.length <= 80_000) return out; }
    throw new Error("Bild ist zu groß.");
  } finally { URL.revokeObjectURL(url); }
}
