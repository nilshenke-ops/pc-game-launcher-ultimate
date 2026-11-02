#!/usr/bin/env node
// Draws the simple, modern background scenes of the "Designs" (chrome stripes, teal flow, sunset sea, frosted shapes,
// soft grey). Plain SVG (gradients, lines, blurred shapes) – no photos, nothing copied. Output: web/public/backgrounds/d-*.svg
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const out = join(new URL("..", import.meta.url).pathname, "web/public/backgrounds");
const W = 1920, H = 1080;
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
const blur = (id, sd) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const stripes = (step, op, color) => Array.from({ length: Math.ceil(H / step) }, (_, i) => `<rect x="0" y="${i * step}" width="${W}" height="${step * 0.45}" fill="${color}" opacity="${op}"/>`).join("");

const scenes = {
  // Chrome stripes: horizontal brushed-metal bands with a bright diagonal light streak.
  "d-chrome": svg(`<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2d31"/><stop offset=".5" stop-color="#8c9097"/><stop offset="1" stop-color="#1d1e21"/></linearGradient>
    <linearGradient id="s" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>${blur("b", 30)}`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/><polygon points="700,0 1000,0 1500,${H} 1200,${H}" fill="url(#s)" filter="url(#b)"/>${stripes(14, 0.35, "#000")}${stripes(14, 0.08, "#fff").replace(/y="(\d+(?:\.\d+)?)"/g, (_, y) => `y="${+y + 7}"`)}`),
  // Teal flow: dark teal with a glowing wave band and fine scan lines.
  "d-teal": svg(`<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#021114"/><stop offset="1" stop-color="#05262b"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16d9d9" stop-opacity="0"/><stop offset=".5" stop-color="#2de2e6" stop-opacity=".95"/><stop offset="1" stop-color="#16d9d9" stop-opacity="0"/></linearGradient>${blur("b", 50)}${blur("c", 14)}`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/><path d="M-100 900 C 500 700 700 200 1100 -100 L 1500 -100 C 1150 300 1100 800 400 1200 Z" fill="url(#w)" filter="url(#b)" opacity=".8"/><path d="M200 1100 C 700 800 800 300 1200 -50 L 1300 -50 C 950 350 900 800 500 1150 Z" fill="#7cf5c8" filter="url(#c)" opacity=".35"/>${stripes(6, 0.12, "#000")}`),
  // Sunset sea: warm sky, sun glow, layered blue waves (an own drawing, not a photo).
  "d-sea": svg(`<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3a6b"/><stop offset=".45" stop-color="#e2793c"/><stop offset=".6" stop-color="#f6c36a"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#15508c"/><stop offset="1" stop-color="#05213f"/></linearGradient>${blur("b", 40)}`,
    `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="1000" cy="560" r="150" fill="#ffd9a0" filter="url(#b)" opacity=".9"/><rect y="600" width="${W}" height="480" fill="url(#sea)"/>` +
    [0, 1, 2, 3, 4].map((i) => `<path d="M0 ${700 + i * 70} Q 240 ${660 + i * 70} 480 ${700 + i * 70} T 960 ${700 + i * 70} T 1440 ${700 + i * 70} T 1920 ${700 + i * 70} V 1080 H0 Z" fill="#fff" opacity="${0.05 + i * 0.03}"/>`).join("")),
  // Frost: pale blue-grey with big soft shapes – for glass cards.
  "d-frost": svg(`<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#e9eef7"/></linearGradient>${blur("b", 70)}`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="450" cy="300" r="320" fill="#8ec5ff" filter="url(#b)" opacity=".7"/><circle cx="1500" cy="780" r="380" fill="#ffd0e0" filter="url(#b)" opacity=".7"/><circle cx="1100" cy="150" r="240" fill="#c9b8ff" filter="url(#b)" opacity=".55"/>`),
  // Soft grey: calm light grey with fine dark branches' shadows as soft lines (nothing busy).
  "d-grey": svg(`<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f1f3"/><stop offset="1" stop-color="#d4d5da"/></linearGradient>${blur("b", 60)}${blur("c", 3)}`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/><ellipse cx="500" cy="500" rx="420" ry="520" fill="#fff" filter="url(#b)" opacity=".7"/><path d="M780 0 C 760 300 860 600 800 1080" stroke="#1b1b1f" stroke-width="5" fill="none" filter="url(#c)" opacity=".75"/><path d="M1180 0 C 1230 350 1100 700 1160 1080" stroke="#1b1b1f" stroke-width="4" fill="none" filter="url(#c)" opacity=".6"/>`),
  // Midnight: deep blue-black with two soft colour clouds – calm dark for glass.
  "d-midnight": svg(`<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070a16"/><stop offset="1" stop-color="#0d1530"/></linearGradient>${blur("b", 90)}`,
    `<rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="500" cy="700" r="360" fill="#3b5bff" filter="url(#b)" opacity=".5"/><circle cx="1500" cy="250" r="320" fill="#a24bff" filter="url(#b)" opacity=".4"/>`),
};
for (const [id, body] of Object.entries(scenes)) writeFileSync(join(out, id + ".svg"), body);
console.log(Object.keys(scenes).length + " Hintergründe geschrieben");
