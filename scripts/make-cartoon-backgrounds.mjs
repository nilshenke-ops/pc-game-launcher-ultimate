// Draws the cartoon backgrounds (web/public/backgrounds) – each as wide version for PC/tablet and as tall version for phones
// ("<id>-phone.svg"). Flat colours, thick dark outlines, friendly faces. Deterministic: same output on every run.
// Usage: node scripts/make-cartoon-backgrounds.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(fileURLToPath(new URL("..", import.meta.url)), "web/public/backgrounds");

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const f = (n) => Math.round(n * 10) / 10;

function svg(W, H, defs, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>\n`;
}
const grad = (id, top, bottom) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

function star(x, y, r, fill = "#fde047", stroke = "#a16207", sw = 3) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; pts.push(`${f(x + rr * Math.cos(a))},${f(y + rr * Math.sin(a))}`); }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}
const face = (x, y, s, ink, { sleepy = false, cheeks = "#fb7185" } = {}) =>
  (sleepy
    ? `<path d="M${f(x - 0.42 * s)} ${f(y - 0.1 * s)} q${f(0.14 * s)} ${f(0.12 * s)} ${f(0.28 * s)} 0 M${f(x + 0.14 * s)} ${f(y - 0.1 * s)} q${f(0.14 * s)} ${f(0.12 * s)} ${f(0.28 * s)} 0" fill="none" stroke="${ink}" stroke-width="${f(0.07 * s)}" stroke-linecap="round"/>`
    : `<circle cx="${f(x - 0.3 * s)}" cy="${f(y - 0.12 * s)}" r="${f(0.09 * s)}" fill="${ink}"/><circle cx="${f(x + 0.3 * s)}" cy="${f(y - 0.12 * s)}" r="${f(0.09 * s)}" fill="${ink}"/>`)
  + `<circle cx="${f(x - 0.48 * s)}" cy="${f(y + 0.12 * s)}" r="${f(0.1 * s)}" fill="${cheeks}" opacity=".6"/><circle cx="${f(x + 0.48 * s)}" cy="${f(y + 0.12 * s)}" r="${f(0.1 * s)}" fill="${cheeks}" opacity=".6"/>`
  + `<path d="M${f(x - 0.22 * s)} ${f(y + 0.16 * s)} Q${f(x)} ${f(y + 0.4 * s)} ${f(x + 0.22 * s)} ${f(y + 0.16 * s)}" fill="none" stroke="${ink}" stroke-width="${f(0.07 * s)}" stroke-linecap="round"/>`;

function cloud(x, y, s, fill, ink) {
  const c = [[0, 0, 0.6], [0.55, -0.25, 0.7], [1.2, -0.05, 0.62], [1.7, 0.2, 0.48], [-0.5, 0.2, 0.45]];
  const shapes = c.map(([dx, dy, r]) => `<circle cx="${f(x + dx * s)}" cy="${f(y + dy * s)}" r="${f(r * s)}"/>`).join("");
  return `<g fill="${fill}" stroke="${ink}" stroke-width="${f(0.06 * s)}">${shapes}</g><g fill="${fill}">${shapes}</g>`;
}

/** Rolling hill from x0 to x1 with top at y, filled to the bottom. */
function hill(W, H, y, amp, waves, fill, ink, phase = 0) {
  let d = `M0 ${H} L0 ${f(y)}`;
  for (let i = 0; i <= 60; i++) { const x = (W * i) / 60; d += ` L${f(x)} ${f(y - amp * Math.sin((i / 60) * Math.PI * waves + phase))}`; }
  return `<path d="${d} L${W} ${H} Z" fill="${fill}" stroke="${ink}" stroke-width="7" stroke-linejoin="round"/>`;
}
const hillY = (W, y, amp, waves, phase, x) => y - amp * Math.sin((x / W) * Math.PI * waves + phase);

function house(x, y, s, wall, roof, win, ink) {
  return `<g stroke="${ink}" stroke-width="${f(0.05 * s)}" stroke-linejoin="round">`
    + `<rect x="${f(x - 0.5 * s)}" y="${f(y - 0.8 * s)}" width="${f(s)}" height="${f(0.8 * s)}" fill="${wall}"/>`
    + `<polygon points="${f(x - 0.65 * s)},${f(y - 0.78 * s)} ${f(x)},${f(y - 1.35 * s)} ${f(x + 0.65 * s)},${f(y - 0.78 * s)}" fill="${roof}"/>`
    + `<rect x="${f(x - 0.32 * s)}" y="${f(y - 0.6 * s)}" width="${f(0.24 * s)}" height="${f(0.22 * s)}" fill="${win}"/>`
    + `<rect x="${f(x + 0.08 * s)}" y="${f(y - 0.6 * s)}" width="${f(0.24 * s)}" height="${f(0.22 * s)}" fill="${win}"/>`
    + `<rect x="${f(x - 0.12 * s)}" y="${f(y - 0.32 * s)}" width="${f(0.24 * s)}" height="${f(0.32 * s)}" fill="${roof}"/></g>`;
}
function tree(x, y, s, leaf, trunk, ink) {
  return `<g stroke="${ink}" stroke-width="${f(0.06 * s)}" stroke-linejoin="round"><rect x="${f(x - 0.1 * s)}" y="${f(y - 0.6 * s)}" width="${f(0.2 * s)}" height="${f(0.6 * s)}" fill="${trunk}"/>`
    + `<circle cx="${f(x)}" cy="${f(y - 0.85 * s)}" r="${f(0.42 * s)}" fill="${leaf}"/><circle cx="${f(x - 0.3 * s)}" cy="${f(y - 0.62 * s)}" r="${f(0.3 * s)}" fill="${leaf}"/><circle cx="${f(x + 0.3 * s)}" cy="${f(y - 0.62 * s)}" r="${f(0.3 * s)}" fill="${leaf}"/></g>`;
}

// ------------------------------------------------------------------ scenes (W×H; the same code draws wide and tall versions)

function day(W, H) {
  const r = rng(7), tall = H > W, ink = "#1e3a5f", s = Math.min(W, H);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  const sx = tall ? W * 0.72 : W * 0.83, sy = tall ? H * 0.13 : H * 0.19, sr = s * 0.1;
  for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; b += `<line x1="${f(sx + 1.25 * sr * Math.cos(a))}" y1="${f(sy + 1.25 * sr * Math.sin(a))}" x2="${f(sx + 1.75 * sr * Math.cos(a))}" y2="${f(sy + 1.75 * sr * Math.sin(a))}" stroke="#ffd43b" stroke-width="${f(sr * 0.15)}" stroke-linecap="round"/>`; }
  b += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr)}" fill="#ffd43b" stroke="#b45309" stroke-width="${f(sr * 0.08)}"/>` + face(sx, sy, sr, "#7c2d12");
  const clouds = tall ? [[0.12, 0.1, 0.07], [0.3, 0.3, 0.06], [0.6, 0.42, 0.05]] : [[0.1, 0.17, 0.065], [0.38, 0.1, 0.05], [0.6, 0.28, 0.045]];
  for (const [cx, cy, cs] of clouds) b += cloud(W * cx, H * cy, s * cs * 1.6, "#fff", ink);
  const g1 = tall ? H * 0.68 : H * 0.62, g2 = tall ? H * 0.78 : H * 0.76;
  b += hill(W, H, g1, s * 0.05, 3, "#4ade80", "#14532d", 0.3);
  for (const fx of tall ? [0.18, 0.82] : [0.12, 0.3, 0.7, 0.9]) b += tree(W * fx, hillY(W, g1, s * 0.05, 3, 0.3, W * fx) + 6, s * 0.11, "#22c55e", "#92400e", "#14532d");
  b += house(W * (tall ? 0.5 : 0.5), hillY(W, g1, s * 0.05, 3, 0.3, W * 0.5) + 8, s * 0.16, "#fef3c7", "#ef4444", "#7dd3fc", "#1f2937");
  b += hill(W, H, g2, s * 0.035, 2, "#22c55e", "#14532d", 1.4);
  for (let i = 0; i < (tall ? 14 : 22); i++) { const x = r() * W, y = g2 + 30 + r() * (H - g2 - 40); b += `<g transform="translate(${f(x)} ${f(y)})"><circle r="9" fill="${["#f472b6", "#facc15", "#fff", "#a78bfa"][i % 4]}" stroke="#14532d" stroke-width="3"/><circle r="3.5" fill="#f59e0b"/></g>`; }
  return svg(W, H, grad("sky", "#4fc3f7", "#b3ecff"), b);
}

function night(W, H) {
  const r = rng(11), tall = H > W, s = Math.min(W, H);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < (tall ? 40 : 55); i++) { const x = r() * W, y = r() * H * (tall ? 0.62 : 0.55); b += i % 4 === 0 ? star(x, y, 10 + r() * 14) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + r() * 3)}" fill="#fef9c3"/>`; }
  const mx = tall ? W * 0.68 : W * 0.78, my = tall ? H * 0.16 : H * 0.22, mr = s * 0.11;
  b += `<circle cx="${f(mx)}" cy="${f(my)}" r="${f(mr * 1.5)}" fill="#fde68a" opacity=".12"/><circle cx="${f(mx)}" cy="${f(my)}" r="${f(mr)}" fill="#fde68a" stroke="#92400e" stroke-width="${f(mr * 0.07)}"/>`
    + `<circle cx="${f(mx - mr * 0.35)}" cy="${f(my - mr * 0.45)}" r="${f(mr * 0.12)}" fill="#fcd34d"/><circle cx="${f(mx + mr * 0.45)}" cy="${f(my + mr * 0.5)}" r="${f(mr * 0.09)}" fill="#fcd34d"/>`
    + face(mx, my, mr, "#78350f", { sleepy: true });
  // night cap
  b += `<path d="M${f(mx - mr * 0.85)} ${f(my - mr * 0.55)} Q${f(mx)} ${f(my - mr * 1.9)} ${f(mx + mr * 1.3)} ${f(my - mr * 1.25)} L${f(mx + mr * 0.85)} ${f(my - mr * 0.55)} Z" fill="#60a5fa" stroke="#1e3a8a" stroke-width="${f(mr * 0.06)}" stroke-linejoin="round"/><circle cx="${f(mx + mr * 1.32)}" cy="${f(my - mr * 1.25)}" r="${f(mr * 0.16)}" fill="#fff" stroke="#1e3a8a" stroke-width="${f(mr * 0.05)}"/>`;
  b += cloud(W * (tall ? 0.18 : 0.15), H * (tall ? 0.35 : 0.3), s * 0.09, "#6d5fb3", "#2e1065");
  const g1 = tall ? H * 0.7 : H * 0.64, g2 = tall ? H * 0.82 : H * 0.8;
  b += hill(W, H, g1, s * 0.05, 3, "#1e5b4c", "#06251f", 0.6);
  for (const [fx, sc] of (tall ? [[0.25, 0.15], [0.7, 0.13]] : [[0.18, 0.13], [0.42, 0.16], [0.63, 0.12], [0.86, 0.14]])) b += house(W * fx, hillY(W, g1, s * 0.05, 3, 0.6, W * fx) + 8, s * sc, "#c4b5fd", "#7c3aed", "#fde047", "#1e1b4b");
  b += hill(W, H, g2, s * 0.03, 2, "#14453a", "#06251f", 2);
  for (let i = 0; i < (tall ? 12 : 18); i++) { const x = r() * W, y = g2 + 30 + r() * (H - g2 - 40); b += `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="#bef264" opacity=".9"/><circle cx="${f(x)}" cy="${f(y)}" r="14" fill="#bef264" opacity=".2"/>`; } // fireflies
  return svg(W, H, grad("sky", "#1e1b4b", "#5b21b6"), b);
}

function fish(x, y, s, body, fin, flip) {
  const k = flip ? -1 : 1, ink = "#0c4a6e";
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${k} 1)" stroke="${ink}" stroke-width="${f(0.06 * s)}" stroke-linejoin="round">`
    + `<polygon points="${f(-0.75 * s)},0 ${f(-1.15 * s)},${f(-0.35 * s)} ${f(-1.15 * s)},${f(0.35 * s)}" fill="${fin}"/>`
    + `<ellipse rx="${f(0.8 * s)}" ry="${f(0.5 * s)}" fill="${body}"/>`
    + `<path d="M${f(-0.1 * s)} ${f(-0.48 * s)} Q${f(0.1 * s)} ${f(-0.85 * s)} ${f(0.35 * s)} ${f(-0.42 * s)}" fill="${fin}"/>`
    + `<circle cx="${f(0.42 * s)}" cy="${f(-0.12 * s)}" r="${f(0.13 * s)}" fill="#fff"/><circle cx="${f(0.46 * s)}" cy="${f(-0.12 * s)}" r="${f(0.06 * s)}" fill="${ink}" stroke="none"/>`
    + `<path d="M${f(0.55 * s)} ${f(0.15 * s)} q${f(0.12 * s)} ${f(0.08 * s)} ${f(0.18 * s)} ${f(-0.04 * s)}" fill="none"/></g>`;
}

function sea(W, H) {
  const r = rng(23), tall = H > W, s = Math.min(W, H);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 5; i++) { const x = W * (0.1 + i * 0.22); b += `<polygon points="${f(x - 30)},0 ${f(x + 50)},0 ${f(x + 220)},${f(H * 0.75)} ${f(x + 60)},${f(H * 0.75)}" fill="#fff" opacity=".07"/>`; }
  for (let i = 0; i < (tall ? 26 : 34); i++) { const x = r() * W, y = r() * H * 0.8, rr = 6 + r() * 16; b += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" fill="#e0f2fe" fill-opacity=".25" stroke="#f0f9ff" stroke-width="3"/><circle cx="${f(x - rr * 0.35)}" cy="${f(y - rr * 0.35)}" r="${f(rr * 0.2)}" fill="#fff"/>`; }
  // Phones: smaller fish near the edges, so text in the middle stays easy to read.
  const fishes = tall ? [[0.86, 0.12, 0.04, "#fb923c", "#f97316", 1], [0.12, 0.34, 0.035, "#facc15", "#eab308", 0], [0.88, 0.5, 0.035, "#f472b6", "#db2777", 1], [0.14, 0.66, 0.03, "#a78bfa", "#7c3aed", 0]]
    : [[0.2, 0.22, 0.06, "#fb923c", "#f97316", 0], [0.72, 0.18, 0.05, "#facc15", "#eab308", 1], [0.46, 0.42, 0.045, "#f472b6", "#db2777", 0], [0.85, 0.48, 0.04, "#a78bfa", "#7c3aed", 1], [0.1, 0.55, 0.035, "#34d399", "#059669", 0]];
  for (const [fx, fy, fs, c1, c2, flip] of fishes) b += fish(W * fx, H * fy, s * fs * 1.6, c1, c2, !!flip);
  const g = tall ? H * 0.82 : H * 0.8;
  for (let i = 0; i < (tall ? 7 : 12); i++) {
    const x = (W * (i + 0.5)) / (tall ? 7 : 12) + (r() - 0.5) * 40, h = s * (0.18 + r() * 0.16);
    let d = `M${f(x)} ${f(g + 20)}`; for (let k = 1; k <= 6; k++) d += ` Q${f(x + (k % 2 ? 28 : -28))} ${f(g + 20 - (h * (k - 0.5)) / 6)} ${f(x)} ${f(g + 20 - (h * k) / 6)}`;
    b += `<path d="${d}" fill="none" stroke="#065f46" stroke-width="22" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#22c55e" stroke-width="13" stroke-linecap="round"/>`;
  }
  b += `<path d="M0 ${f(g)} Q${f(W * 0.25)} ${f(g - 30)} ${f(W * 0.5)} ${f(g)} T${W} ${f(g)} L${W} ${H} L0 ${H} Z" fill="#fcd34d" stroke="#a16207" stroke-width="7"/>`;
  const cx = W * (tall ? 0.62 : 0.7), cy = g + (H - g) * 0.45, cs = s * 0.09;
  b += `<g stroke="#451a03" stroke-width="${f(cs * 0.08)}" stroke-linejoin="round"><rect x="${f(cx - cs)}" y="${f(cy - cs * 0.4)}" width="${f(cs * 2)}" height="${f(cs * 1.1)}" fill="#b45309"/><path d="M${f(cx - cs)} ${f(cy - cs * 0.4)} Q${f(cx)} ${f(cy - cs * 1.3)} ${f(cx + cs)} ${f(cy - cs * 0.4)} Z" fill="#d97706"/><rect x="${f(cx - cs * 0.18)}" y="${f(cy - cs * 0.55)}" width="${f(cs * 0.36)}" height="${f(cs * 0.45)}" fill="#facc15"/></g>`;
  for (let i = 0; i < (tall ? 6 : 10); i++) { const x = r() * W, y = g + 40 + r() * (H - g - 60); b += star(x, y, 18, "#fb7185", "#9f1239", 3); }
  return svg(W, H, grad("sky", "#38bdf8", "#075985"), b);
}

function planet(x, y, rad, body, ring, ink, faceInk) {
  return (ring ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rad * 1.7)}" ry="${f(rad * 0.45)}" fill="none" stroke="${ink}" stroke-width="${f(rad * 0.22)}"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(rad * 1.7)}" ry="${f(rad * 0.45)}" fill="none" stroke="${ring}" stroke-width="${f(rad * 0.12)}"/>` : "")
    + `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${body}" stroke="${ink}" stroke-width="${f(rad * 0.08)}"/>`
    + (ring ? `<path d="M${f(x - rad * 1.7)} ${f(y)} A${f(rad * 1.7)} ${f(rad * 0.45)} 0 0 0 ${f(x + rad * 1.7)} ${f(y)}" fill="none" stroke="${ring}" stroke-width="${f(rad * 0.12)}"/>` : "")
    + face(x, y, rad * 0.8, faceInk);
}

function space(W, H) {
  const r = rng(31), tall = H > W, s = Math.min(W, H);
  let b = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < (tall ? 60 : 80); i++) { const x = r() * W, y = r() * H; b += i % 6 === 0 ? star(x, y, 8 + r() * 12, "#fef08a", "#854d0e", 2.5) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 + r() * 2.5)}" fill="#e0e7ff"/>`; }
  // Phones: everything at the edges, so text in the middle stays easy to read.
  b += planet(W * (tall ? 0.86 : 0.18), H * (tall ? 0.06 : 0.3), s * (tall ? 0.08 : 0.12), "#fb923c", "#fde68a", "#7c2d12", "#7c2d12");
  b += planet(W * (tall ? 0.1 : 0.82), H * (tall ? 0.9 : 0.7), s * (tall ? 0.07 : 0.09), "#38bdf8", null, "#0c4a6e", "#0c4a6e");
  b += planet(W * (tall ? 0.06 : 0.6), H * (tall ? 0.42 : 0.15), s * 0.045, "#a3e635", null, "#365314", "#365314");
  // rocket
  const rx = W * (tall ? 0.9 : 0.42), ry = H * (tall ? 0.7 : 0.55), rs = s * (tall ? 0.07 : 0.1), ink = "#1e1b4b";
  b += `<g transform="translate(${f(rx)} ${f(ry)}) rotate(35)" stroke="${ink}" stroke-width="${f(rs * 0.07)}" stroke-linejoin="round">`
    + `<path d="M${f(-rs * 0.28)} ${f(rs * 0.9)} Q0 ${f(rs * 1.9)} ${f(rs * 0.28)} ${f(rs * 0.9)} Z" fill="#fb923c"/><path d="M${f(-rs * 0.15)} ${f(rs * 0.9)} Q0 ${f(rs * 1.5)} ${f(rs * 0.15)} ${f(rs * 0.9)} Z" fill="#fde047"/>`
    + `<path d="M${f(-rs * 0.35)} ${f(rs * 0.3)} L${f(-rs * 0.75)} ${f(rs * 0.95)} L${f(-rs * 0.35)} ${f(rs * 0.85)} Z" fill="#ef4444"/><path d="M${f(rs * 0.35)} ${f(rs * 0.3)} L${f(rs * 0.75)} ${f(rs * 0.95)} L${f(rs * 0.35)} ${f(rs * 0.85)} Z" fill="#ef4444"/>`
    + `<path d="M0 ${f(-rs * 1.2)} C${f(rs * 0.55)} ${f(-rs * 0.7)} ${f(rs * 0.45)} ${f(rs * 0.6)} ${f(rs * 0.35)} ${f(rs * 0.95)} L${f(-rs * 0.35)} ${f(rs * 0.95)} C${f(-rs * 0.45)} ${f(rs * 0.6)} ${f(-rs * 0.55)} ${f(-rs * 0.7)} 0 ${f(-rs * 1.2)} Z" fill="#f1f5f9"/>`
    + `<circle cy="${f(-rs * 0.2)}" r="${f(rs * 0.22)}" fill="#7dd3fc"/></g>`;
  // UFO
  const ux = W * (tall ? 0.12 : 0.76), uy = H * (tall ? 0.6 : 0.32), us = s * (tall ? 0.05 : 0.07);
  b += `<g stroke="${ink}" stroke-width="${f(us * 0.08)}"><path d="M${f(ux - us * 0.5)} ${f(uy)} Q${f(ux)} ${f(uy - us)} ${f(ux + us * 0.5)} ${f(uy)} Z" fill="#a5f3fc" fill-opacity=".85"/><ellipse cx="${f(ux)}" cy="${f(uy + us * 0.1)}" rx="${f(us * 1.2)}" ry="${f(us * 0.32)}" fill="#a78bfa"/></g>`
    + face(ux, uy - us * 0.3, us * 0.4, "#065f46", { cheeks: "#86efac" })
    + [-0.7, 0, 0.7].map((k) => `<circle cx="${f(ux + us * k)}" cy="${f(uy + us * 0.12)}" r="${f(us * 0.1)}" fill="#fde047"/>`).join("");
  return svg(W, H, grad("sky", "#0b1033", "#312e81"), b);
}

const scenes = { cartoon: day, "cartoon-night": night, "cartoon-sea": sea, "cartoon-space": space };
for (const [id, draw] of Object.entries(scenes)) {
  if (id !== "cartoon") writeFileSync(join(OUT, `${id}.svg`), draw(1920, 1080)); // the wide "cartoon" stays the original drawing
  writeFileSync(join(OUT, `${id}-phone.svg`), draw(1080, 1920));
  console.log(id);
}
