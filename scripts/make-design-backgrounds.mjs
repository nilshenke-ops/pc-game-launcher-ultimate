#!/usr/bin/env node
// Draws the background scenes of the five designs (lavender glass, controller dark, night blue, chrome dark, chrome light).
// Plain SVG (gradients, rings, blurred light) – no photos, nothing copied. Output: web/public/backgrounds/h-*.svg
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const out = join(new URL("..", import.meta.url).pathname, "web/public/backgrounds");
const W = 1920, H = 1080;
const svg = (defs, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
const blur = (id, sd) => `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) => `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const rad = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;

const scenes = {
  // Lavender glass: deep indigo on the left to pale lavender on the right, big see-through spheres with bright rims.
  "h-lavendel": svg(
    lin("g", [[0, "#2a2b64"], [0.45, "#58529f"], [1, "#c6c2ee"]]) + lin("rim", [[0, "#fff", 0.75], [1, "#fff", 0]], 0, 0, 1, 1) + rad("sph", [[0, "#fff", 0.0], [0.82, "#fff", 0.06], [1, "#fff", 0.38]]) + blur("b", 80) + blur("s", 6),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <circle cx="430" cy="120" r="430" fill="#7a6bff" filter="url(#b)" opacity=".5"/>
     <circle cx="1650" cy="900" r="520" fill="#f2d3ff" filter="url(#b)" opacity=".55"/>
     <circle cx="1560" cy="80" r="560" fill="url(#sph)"/><circle cx="1560" cy="80" r="560" fill="none" stroke="url(#rim)" stroke-width="5" filter="url(#s)"/>
     <circle cx="1050" cy="1240" r="860" fill="url(#sph)"/><circle cx="1050" cy="1240" r="860" fill="none" stroke="url(#rim)" stroke-width="4" opacity=".8" filter="url(#s)"/>
     <circle cx="1850" cy="1000" r="420" fill="none" stroke="#fff" stroke-width="3" opacity=".35" filter="url(#s)"/>`),
  // Controller dark: near black, violet and blue light glowing from the right, thin glowing rings.
  "h-controller": svg(
    lin("g", [[0, "#05060c"], [1, "#0d0f22"]]) + rad("v", [[0, "#6c4cff", 0.75], [1, "#6c4cff", 0]]) + rad("bl", [[0, "#3b82ff", 0.7], [1, "#3b82ff", 0]]) + lin("rim", [[0, "#9fb4ff", 0.7], [1, "#9fb4ff", 0]]) + blur("s", 5),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <circle cx="1480" cy="360" r="620" fill="url(#v)"/><circle cx="1750" cy="900" r="560" fill="url(#bl)"/>
     <circle cx="1500" cy="640" r="760" fill="none" stroke="url(#rim)" stroke-width="3" filter="url(#s)"/>
     <circle cx="1280" cy="760" r="980" fill="none" stroke="url(#rim)" stroke-width="2" opacity=".6" filter="url(#s)"/>
     <ellipse cx="1000" cy="1010" rx="1100" ry="120" fill="#5b4bd6" opacity=".16" filter="url(#s)"/>`),
  // Night blue: deep navy with a violet-blue sweep and two large soft arcs.
  "h-nacht": svg(
    lin("g", [[0, "#060818"], [1, "#0b1236"]]) + lin("sw", [[0, "#4f46e5", 0], [0.5, "#5b6cff", 0.85], [1, "#a855f7", 0]], 0, 1, 1, 0) + rad("bl", [[0, "#2f6bff", 0.7], [1, "#2f6bff", 0]]) + blur("b", 70) + blur("s", 4),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <path d="M900 1200 C 1200 700 1500 520 2100 480 L 2100 1100 Z" fill="url(#sw)" filter="url(#b)" opacity=".9"/>
     <circle cx="1650" cy="1000" r="520" fill="url(#bl)"/>
     <circle cx="1700" cy="260" r="620" fill="none" stroke="#7c8cff" stroke-width="3" opacity=".4" filter="url(#s)"/>
     <circle cx="1100" cy="900" r="900" fill="none" stroke="#7c8cff" stroke-width="2" opacity=".25" filter="url(#s)"/>`),
  // Chrome dark: black with liquid-metal bands (long silver curves with bright edges).
  "h-chrom": svg(
    lin("g", [[0, "#0b0b0d"], [1, "#141517"]]) + lin("m1", [[0, "#1a1b1e"], [0.35, "#f4f4f6"], [0.55, "#6d7078"], [1, "#0c0c0e"]], 0, 0, 1, 1) + lin("m2", [[0, "#0c0c0e"], [0.4, "#9ea1a8"], [0.6, "#fff"], [1, "#1a1b1e"]], 1, 0, 0, 1) + blur("s", 3) + blur("b", 30),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <path d="M1050 -80 C 1350 120 1450 420 1260 640 C 1180 460 1080 220 1050 -80 Z" fill="url(#m1)" opacity=".95"/>
     <path d="M1350 -60 C 1750 20 1960 260 1960 520 L 1960 -60 Z" fill="url(#m2)" opacity=".9"/>
     <path d="M700 1160 C 780 760 1180 500 1960 560 L 1960 1160 Z" fill="url(#m2)" opacity=".85"/>
     <path d="M700 1160 C 780 760 1180 500 1960 560" fill="none" stroke="#fff" stroke-width="3" opacity=".7" filter="url(#s)"/>
     <path d="M1050 -80 C 1350 120 1450 420 1260 640" fill="none" stroke="#fff" stroke-width="3" opacity=".6" filter="url(#s)"/>
     <ellipse cx="1180" cy="660" rx="260" ry="80" fill="#fff" opacity=".18" filter="url(#b)"/>`),
  // Chrome light: silver-grey with the same bands in light tones.
  "h-chromhell": svg(
    lin("g", [[0, "#e4e6ea"], [1, "#a9acb3"]]) + lin("m1", [[0, "#6f7279"], [0.35, "#ffffff"], [0.6, "#b9bcc3"], [1, "#4a4c52"]], 0, 0, 1, 1) + lin("m2", [[0, "#4a4c52"], [0.4, "#d6d8dd"], [0.62, "#fff"], [1, "#8d9097"]], 1, 0, 0, 1) + blur("s", 3) + blur("b", 40),
    `<rect width="${W}" height="${H}" fill="url(#g)"/>
     <ellipse cx="500" cy="480" rx="520" ry="620" fill="#fff" opacity=".35" filter="url(#b)"/>
     <path d="M1080 -80 C 1380 120 1480 420 1290 640 C 1210 460 1110 220 1080 -80 Z" fill="url(#m1)" opacity=".9"/>
     <path d="M1380 -60 C 1780 20 1960 260 1960 520 L 1960 -60 Z" fill="url(#m2)" opacity=".85"/>
     <path d="M720 1160 C 800 760 1200 500 1960 560 L 1960 1160 Z" fill="url(#m2)" opacity=".8"/>
     <path d="M720 1160 C 800 760 1200 500 1960 560" fill="none" stroke="#fff" stroke-width="3" opacity=".9" filter="url(#s)"/>`),
};
for (const [id, body] of Object.entries(scenes)) writeFileSync(join(out, id + ".svg"), body);
console.log(Object.keys(scenes).length + " Hintergründe geschrieben");
