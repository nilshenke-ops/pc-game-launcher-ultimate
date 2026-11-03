import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Animationen: nur Eigenschaften, die den Seitenaufbau nicht neu berechnen (transform, opacity, Farben, Schatten …).
// Ausnahme: der Fortschrittsbalken ändert seine Breite – das ist sein Zweck. Und „weniger Bewegung“ schaltet alles ab.
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const LAYOUT = /^(width|height|top|left|right|bottom|margin(-[a-z]+)?|padding(-[a-z]+)?|font-size|line-height|max-height|max-width|min-height|min-width|border-width|gap|grid-template-columns|inset)$/;
const ALLOWED = new Set(["progress"]);

function keyframes() {
  const out: { name: string; body: string }[] = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    let i = re.lastIndex, d = 1;
    while (d && i < css.length) { if (css[i] === "{") d++; else if (css[i] === "}") d--; i++; }
    out.push({ name: m[1], body: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

describe("CSS-Animationen", () => {
  it("es gibt Animationen, und keine verändert den Seitenaufbau (außer dem Fortschrittsbalken)", () => {
    const all = keyframes();
    expect(all.length).toBeGreaterThan(20);
    const bad = all.filter((k) => !ALLOWED.has(k.name)).filter((k) => [...k.body.matchAll(/([a-z-]+)\s*:/g)].some((x) => LAYOUT.test(x[1]))).map((k) => k.name);
    expect(bad).toEqual([]);
  });
  it("„Weniger Bewegung“ stoppt alle Animationen und Übergänge", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation-duration:\s*0\.001ms\s*!important[^}]*transition-duration:\s*0\.001ms\s*!important/);
  });
});
