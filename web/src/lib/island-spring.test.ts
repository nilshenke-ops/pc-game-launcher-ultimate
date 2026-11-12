import { describe, expect, it } from "vitest";
import { CLOSE_VARIANTS, createBoxAnimator, nextVariant, OPEN_VARIANTS, islandBox, ISLAND_DIMS, isSettled, stepSpring, WINDOW_H, WINDOW_W, type Box, type Scheduler } from "./island-spring";

/** A fake frame clock: 60 frames a second, run by hand. */
function clock() {
  let t = 0, next = 1; const q = new Map<number, (n: number) => void>();
  const s: Scheduler = { request: (cb) => { const id = next++; q.set(id, cb); return id; }, cancel: (id) => { q.delete(id); } };
  const tick = (ms = 1000 / 60) => { t += ms; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); return cbs.length; };
  return { s, tick, pending: () => q.size };
}
const run = (c: ReturnType<typeof clock>, max = 600) => { let n = 0; while (c.pending() && n++ < max) c.tick(); return n; };

describe("Öffnen und Schließen der Insel", () => {
  it("öffnet in ca. einer Sekunde mit sanftem Überschwingen und endet genau im Ziel", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel);
    const n = run(c);
    expect(frames[frames.length - 1]).toEqual(ISLAND_DIMS.panel);
    expect(n).toBeGreaterThan(50); expect(n).toBeLessThan(75);                  // ≈ 1 s at 60 frames a second
    const over = Math.max(...frames.map((f) => f.h)) - ISLAND_DIMS.panel.h;
    expect(over).toBeGreaterThan(2);                                            // a gentle swing past the target …
    expect(over).toBeLessThan((WINDOW_H - ISLAND_DIMS.panel.h) * 0.8);          // … that still fits into the window
    expect(a.moving).toBe(false);
  });
  it("schließt ruhig in knapp einer Sekunde, nie kleiner als das Ziel", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.panel, c.s);
    a.to(ISLAND_DIMS.notch);
    const n = run(c);
    expect(frames[frames.length - 1]).toEqual(ISLAND_DIMS.notch);
    expect(n).toBeGreaterThan(44); expect(n).toBeLessThan(65);
    expect(Math.min(...frames.map((f) => f.h))).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.h - 0.01);
    expect(Math.min(...frames.map((f) => f.w))).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.w - 0.01);
  });
  it("Breite führt beim Öffnen, Höhe beim Schließen; beides ohne Sprünge", () => {
    const o: Box[] = [], c = clock();
    createBoxAnimator((b) => o.push(b), ISLAND_DIMS.notch, c.s).to(ISLAND_DIMS.panel); run(c);
    const k = Math.floor(o.length * 0.3);
    const fw = (o[k].w - ISLAND_DIMS.notch.w) / (ISLAND_DIMS.panel.w - ISLAND_DIMS.notch.w), fh = (o[k].h - ISLAND_DIMS.notch.h) / (ISLAND_DIMS.panel.h - ISLAND_DIMS.notch.h);
    expect(fw).toBeGreaterThan(fh);                                              // opening: the width is ahead
    const cl: Box[] = [], c2 = clock();
    createBoxAnimator((b) => cl.push(b), ISLAND_DIMS.panel, c2.s).to(ISLAND_DIMS.notch); run(c2);
    const j = Math.floor(cl.length * 0.3);
    const gw = (cl[j].w - ISLAND_DIMS.notch.w) / (ISLAND_DIMS.panel.w - ISLAND_DIMS.notch.w), gh = (cl[j].h - ISLAND_DIMS.notch.h) / (ISLAND_DIMS.panel.h - ISLAND_DIMS.notch.h);
    expect(gh).toBeLessThan(gw);                                                 // closing: the height folds first
    for (const fr of [o, cl]) expect(Math.max(...fr.slice(1).map((f, i) => Math.abs(f.h - fr[i].h)))).toBeLessThan(26);
  });
  it("ein neues Ziel mitten in der Bewegung startet dort, wo die Insel gerade ist (kein Sprung)", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel);
    for (let i = 0; i < 30; i++) c.tick();
    const mid = frames[frames.length - 1];
    a.to(ISLAND_DIMS.bar); c.tick();
    const next = frames[frames.length - 1];
    expect(Math.abs(next.h - mid.h)).toBeLessThan(20);
    run(c);
    expect(a.box).toEqual(ISLAND_DIMS.bar);
  });
  it("sofort springen (ohne Animation) setzt genau das Ziel", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel, true);
    expect(frames).toEqual([ISLAND_DIMS.panel]);
    expect(c.pending()).toBe(0);
  });
  it("ein langer Aussetzer (Tab im Hintergrund) endet im Ziel, ohne darüber hinaus", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel); c.tick(); c.tick(5000);
    expect(Math.max(...frames.map((f) => f.h))).toBeLessThan(WINDOW_H);
  });
  it("stepSpring und isSettled (für die Holo-Ansicht)", () => {
    const x = [0], v = [0];
    for (let i = 0; i < 200; i++) stepSpring(x, v, [100], 1 / 60);
    expect(isSettled(x, v, [100])).toBe(true);
    expect(isSettled([50], [0], [100])).toBe(false);
  });
});

describe("Varianten für die Insel am PC", () => {
  it("jede Öffnungsvariante endet genau im Ziel, bleibt im Fenster und springt nie", () => {
    for (const v of Object.keys(OPEN_VARIANTS) as (keyof typeof OPEN_VARIANTS)[]) {
      const c = clock(), frames: Box[] = [];
      createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s).to(ISLAND_DIMS.panel, false, v); run(c);
      expect(frames.at(-1), v).toEqual(ISLAND_DIMS.panel);
      expect(Math.max(...frames.map((f) => f.w)), v).toBeLessThanOrEqual(WINDOW_W);
      expect(Math.max(...frames.map((f) => f.h)), v).toBeLessThanOrEqual(WINDOW_H);
      for (let i = 1; i < frames.length; i++) expect(Math.abs(frames[i].h - frames[i - 1].h), v).toBeLessThan(30);
    }
  });
  it("jede Schließvariante endet genau im Ziel und wird nie kleiner als die geschlossene Insel", () => {
    for (const v of Object.keys(CLOSE_VARIANTS) as (keyof typeof CLOSE_VARIANTS)[]) {
      const c = clock(), frames: Box[] = [];
      createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.panel, c.s).to(ISLAND_DIMS.notch, false, v); run(c);
      expect(frames.at(-1), v).toEqual(ISLAND_DIMS.notch);
      expect(Math.min(...frames.map((f) => f.w)), v).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.w - 0.01);
      expect(Math.min(...frames.map((f) => f.h)), v).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.h - 0.01);
    }
  });
  it("„drop“ fällt zuerst nach unten, „unfold“ wird zuerst breit; „zip“ wird zuerst schmal", () => {
    const mid = (from: Box, to: Box, v: string) => { const c = clock(), f: Box[] = []; createBoxAnimator((b) => f.push(b), from, c.s).to(to, false, v as never); run(c); return f[Math.floor(f.length * 0.3)]; };
    const drop = mid(ISLAND_DIMS.notch, ISLAND_DIMS.panel, "drop"), unfold = mid(ISLAND_DIMS.notch, ISLAND_DIMS.panel, "unfold"), zip = mid(ISLAND_DIMS.panel, ISLAND_DIMS.notch, "zip");
    expect(drop.h).toBeGreaterThan(150); expect(drop.w).toBeLessThan(160);
    expect(unfold.w).toBeGreaterThan(450); expect(unfold.h).toBeLessThan(90);
    expect(zip.w).toBeLessThan(400); expect(zip.h).toBeGreaterThan(330);
  });
  it("die nächste Variante ist nie die gerade gespielte", () => {
    const all = ["classic", "drop", "pop", "unfold"] as const;
    for (const last of all) for (const r of [0, 0.3, 0.6, 0.999]) expect(nextVariant(all, last, () => r)).not.toBe(last);
    expect(all).toContain(nextVariant(all, null, () => 0.5));
  });
});

describe("Größen der Insel", () => {
  it("das Fenster ist größer als das Panel samt Überschwingen", () => {
    expect(WINDOW_W).toBeGreaterThan(ISLAND_DIMS.panel.w * 1.06);
    expect(WINDOW_H).toBeGreaterThan(ISLAND_DIMS.panel.h * 1.06);
  });
  it("auf schmalen Bildschirmen nie breiter als der Bildschirm", () => {
    expect(islandBox("panel", 390, true).w).toBe(374);
    expect(islandBox("notch", 390, true).w).toBe(104);
    expect(islandBox("notch", 1280, true).w).toBe(132);
    expect(islandBox("panel", 1280).w).toBe(560);
  });
});
