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

/** Draws the Gamer-Pass as a 1000×600 card (for saving or sharing as a picture). */
export function drawPass(canvas: HTMLCanvasElement, d: PassData, labels: { level: string; hours: string; games: string; streak: string; trophies: string; top: string; next: string }, accent = "#22d3ee") {
  const W = 1000, H = 600;
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) return;
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1220"); bg.addColorStop(1, "#1e1b4b");
  c.fillStyle = bg; c.beginPath(); c.roundRect(0, 0, W, H, 36); c.fill();
  c.strokeStyle = accent; c.globalAlpha = 0.5; c.lineWidth = 3; c.beginPath(); c.roundRect(6, 6, W - 12, H - 12, 32); c.stroke(); c.globalAlpha = 1;
  c.textBaseline = "alphabetic";
  c.font = "120px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif"; c.fillText(d.emoji, 56, 180);
  c.fillStyle = "#fff"; c.font = "800 58px system-ui, sans-serif"; c.fillText(d.name.slice(0, 22), 220, 120);
  c.fillStyle = accent; c.font = "700 34px system-ui, sans-serif"; c.fillText(`${labels.level} ${d.level}`, 222, 170);
  // XP bar
  c.fillStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.roundRect(222, 192, 700, 20, 10); c.fill();
  c.fillStyle = accent; c.beginPath(); c.roundRect(222, 192, Math.max(20, 700 * d.progress), 20, 10); c.fill();
  c.fillStyle = "rgba(255,255,255,.7)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(`${d.xp} XP · ${labels.next}`, 222, 242);
  const stats: [string, string][] = [[labels.hours, d.hours.toLocaleString("de-DE")], [labels.games, String(d.games)], [labels.streak, String(d.streak)], [labels.trophies, `${d.trophies.total}/${d.trophies.of}`]];
  stats.forEach(([k, v], i) => {
    const x = 56 + i * 228;
    c.fillStyle = "rgba(255,255,255,.07)"; c.beginPath(); c.roundRect(x, 290, 208, 130, 20); c.fill();
    c.fillStyle = "#fff"; c.font = "800 48px system-ui, sans-serif"; c.fillText(v, x + 22, 360);
    c.fillStyle = "rgba(255,255,255,.65)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(k, x + 22, 398);
  });
  (["gold", "silver", "bronze"] as Tier[]).forEach((x, i) => {
    const cx = 86 + i * 120;
    c.fillStyle = TIER_COLOR[x]; c.beginPath(); c.arc(cx, 500, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#0b1220"; c.font = "800 28px system-ui, sans-serif"; c.textAlign = "center"; c.fillText(String(d.trophies[x]), cx, 510); c.textAlign = "left";
  });
  if (d.topGame) { c.fillStyle = "rgba(255,255,255,.65)"; c.font = "500 22px system-ui, sans-serif"; c.fillText(labels.top, 440, 488); c.fillStyle = "#fff"; c.font = "700 32px system-ui, sans-serif"; c.fillText(d.topGame.slice(0, 26), 440, 526); }
  c.fillStyle = "rgba(255,255,255,.35)"; c.font = "500 18px system-ui, sans-serif"; c.textAlign = "right"; c.fillText("Nexus Gaming Hub", W - 40, H - 30); c.textAlign = "left";
}
