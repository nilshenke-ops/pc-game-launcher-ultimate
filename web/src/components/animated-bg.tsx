// Moving background (Settings → Design). A canvas behind everything: at most 30 frames per second, stops while the
// page is hidden, draws a single still frame with reduced motion / light rendering, and nothing at all when "Aus".
import { useEffect, useRef } from "react";
import { usePrefs, type BgAnim } from "../lib/prefs";
import { reducedMotion } from "./launch-cinema";

interface Dot { x: number; y: number; z: number; v: number; r: number; c: number }

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "34,211,238";

/** Draws one frame of a background (pure apart from the canvas – also used for the still frame). */
export function drawFrame(ctx: CanvasRenderingContext2D, kind: BgAnim, w: number, h: number, time: number, dots: Dot[], rgb: [string, string]) {
  ctx.clearRect(0, 0, w, h);
  const col = (i: number, a: number) => `rgba(${rgb[i % 2]},${a})`;
  if (kind === "grid") {
    const horizon = h * 0.55, step = 48, off = (time * 0.04) % step;
    ctx.lineWidth = 1;
    for (let y = 0; y < h - horizon; y += step / 2) {
      const yy = horizon + ((y + off) ** 1.25) % (h - horizon);
      ctx.strokeStyle = col(0, 0.10 + 0.25 * ((yy - horizon) / (h - horizon))); ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }
    for (let i = -12; i <= 12; i++) { ctx.strokeStyle = col(1, 0.18); ctx.beginPath(); ctx.moveTo(w / 2 + i * 12, horizon); ctx.lineTo(w / 2 + i * w * 0.12, h); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, horizon - 80, 0, horizon); g.addColorStop(0, "transparent"); g.addColorStop(1, col(0, 0.25));
    ctx.fillStyle = g; ctx.fillRect(0, horizon - 80, w, 80);
    return;
  }
  if (kind === "waves") {
    for (let k = 0; k < 4; k++) {
      ctx.beginPath(); ctx.strokeStyle = col(k, 0.18 + k * 0.05); ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += 12) { const y = h * (0.45 + k * 0.12) + Math.sin(x / (140 + k * 40) + time / (900 - k * 120)) * (26 + k * 8); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    return;
  }
  for (const d of dots) {
    if (kind === "stars") {
      const s = 1 / d.z, x = w / 2 + d.x * s * w * 0.5, y = h / 2 + d.y * s * h * 0.5;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.fillStyle = col(d.c, Math.min(1, 0.2 + (1 - d.z) * 0.9)); ctx.beginPath(); ctx.arc(x, y, Math.max(0.4, d.r * (1.2 - d.z) * 1.6), 0, 6.283); ctx.fill();
    } else {
      ctx.fillStyle = kind === "snow" ? `rgba(255,255,255,${0.25 + d.r * 0.15})` : kind === "embers" ? `rgba(${d.c ? "251,146,60" : "250,204,21"},${0.35 + d.r * 0.15})` : col(d.c, 0.35 + d.r * 0.12);
      ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, 6.283); ctx.fill();
    }
  }
}

function step(kind: BgAnim, dots: Dot[], dt: number) {
  for (const d of dots) {
    if (kind === "stars") { d.z -= d.v * dt * 0.00025; if (d.z <= 0.05) { d.z = 1; d.x = Math.random() * 2 - 1; d.y = Math.random() * 2 - 1; } }
    else if (kind === "snow") { d.y += d.v * dt * 0.00004; d.x += Math.sin(d.y * 20 + d.r) * dt * 0.00001; if (d.y > 1.02) { d.y = -0.02; d.x = Math.random(); } }
    else if (kind === "embers") { d.y -= d.v * dt * 0.00005; d.x += Math.sin(d.y * 14 + d.r) * dt * 0.00001; if (d.y < -0.02) { d.y = 1.02; d.x = Math.random(); } }
    else { d.x += Math.cos(d.r * 9 + d.v) * dt * 0.000012; d.y += Math.sin(d.r * 7 + d.v) * dt * 0.000012; d.x = (d.x + 1) % 1; d.y = (d.y + 1) % 1; }
  }
}

export function makeDots(n: number): Dot[] {
  return Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), v: 0.5 + Math.random(), r: 0.6 + Math.random() * 2.2, c: Math.random() < 0.5 ? 0 : 1 }));
}

export function AnimatedBackground() {
  const { fx, theme } = usePrefs();
  const ref = useRef<HTMLCanvasElement>(null);
  const { kind, speed, amount, opacity } = fx.bg;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || kind === "none") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = reducedMotion() || !!theme.lite;
    let w = 0, h = 0, raf = 0, last = 0, stopped = false;
    const dots = makeDots(Math.round((kind === "stars" ? 260 : 90) * amount));
    if (kind === "stars") for (const d of dots) { d.x = d.x * 2 - 1; d.y = d.y * 2 - 1; }
    const rgb: [string, string] = [css("--primary-rgb"), css("--accent-rgb")];
    const size = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (still || !raf) drawFrame(ctx, kind, w, h, last, dots, rgb);
    };
    const frame = (now: number) => {
      raf = 0;
      if (stopped || document.visibilityState === "hidden") return;
      const dt = Math.min(100, now - (last || now));
      if (now - last >= 33) { last = now; step(kind, dots, dt * speed); drawFrame(ctx, kind, w, h, now * speed, dots, rgb); }
      raf = requestAnimationFrame(frame);
    };
    const onVis = () => { if (!still && document.visibilityState === "visible" && !raf) { last = 0; raf = requestAnimationFrame(frame); } };
    size();
    window.addEventListener("resize", size);
    document.addEventListener("visibilitychange", onVis);
    if (!still) raf = requestAnimationFrame(frame);
    return () => { stopped = true; cancelAnimationFrame(raf); window.removeEventListener("resize", size); document.removeEventListener("visibilitychange", onVis); };
  }, [kind, speed, amount, theme.lite, theme.reduceMotion, theme.primary, theme.accent]);

  if (kind === "none") return null;
  return <canvas ref={ref} className="bg-anim" style={{ opacity }} aria-hidden data-bg-anim={kind} />;
}
