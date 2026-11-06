import { describe, expect, it } from "vitest";
import { createBoxAnimator, islandBox, ISLAND_DIMS, isSettled, stepSpring, WINDOW_H, WINDOW_W, type Box, type Scheduler } from "./island-spring";

/** A fake frame clock: 60 frames a second, run by hand. */
function clock() {
  let t = 0, next = 1; const q = new Map<number, (n: number) => void>();
  const s: Scheduler = { request: (cb) => { const id = next++; q.set(id, cb); return id; }, cancel: (id) => { q.delete(id); } };
  const tick = (ms = 1000 / 60) => { t += ms; const cbs = [...q.values()]; q.clear(); cbs.forEach((cb) => cb(t)); return cbs.length; };
  return { s, tick, pending: () => q.size };
}
const run = (c: ReturnType<typeof clock>, max = 600) => { let n = 0; while (c.pending() && n++ < max) c.tick(); return n; };

describe("Feder der Insel", () => {
  it("erreicht das Ziel, schwingt höchstens ein paar Prozent darüber und kommt zur Ruhe", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel);
    const n = run(c);
    const last = frames[frames.length - 1];
    expect(last).toEqual(ISLAND_DIMS.panel);                 // exactly the target at the end
    expect(n).toBeLessThan(90);                              // settled within 1.5 s
    const over = Math.max(...frames.map((f) => f.h)) - ISLAND_DIMS.panel.h;
    expect(over).toBeGreaterThan(0);                         // it swings a little (alive) …
    expect(over / (ISLAND_DIMS.panel.h - ISLAND_DIMS.notch.h)).toBeLessThan(0.1); // … but never more than 10 % of the way
    expect(a.moving).toBe(false);
  });
  it("beim Schließen läuft die Insel ruhig zusammen: kein Unterschwingen unter das Ziel und kommt zur Ruhe", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.panel, c.s);
    a.to(ISLAND_DIMS.notch);
    const n = run(c);
    expect(frames[frames.length - 1]).toEqual(ISLAND_DIMS.notch);
    expect(n).toBeLessThan(90);
    expect(Math.min(...frames.map((f) => f.h))).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.h - 0.5);   // never smaller than the notch
    expect(Math.min(...frames.map((f) => f.w))).toBeGreaterThanOrEqual(ISLAND_DIMS.notch.w - 0.5);
  });
  it("viele Zwischenbilder (flüssig, nicht ruckelnd) und keine Sprünge", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel); run(c);
    expect(frames.length).toBeGreaterThan(20);
    const steps = frames.slice(1).map((f, i) => Math.abs(f.h - frames[i].h));
    expect(Math.max(...steps)).toBeLessThan(60);             // biggest change between two frames (of 310 px, at the fastest point)
  });
  it("ein neues Ziel mitten in der Bewegung behält die Geschwindigkeit (kein Knick)", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel);
    for (let i = 0; i < 6; i++) c.tick();
    const before = frames.length;
    const v1 = frames[before - 1].h - frames[before - 2].h;
    a.to(ISLAND_DIMS.bar);                                   // changed his mind
    c.tick();
    const v2 = frames[frames.length - 1].h - frames[frames.length - 2].h;
    expect(Math.abs(v2 - v1)).toBeLessThan(Math.abs(v1) * 0.6 + 2); // the speed does not jump
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
  it("ein langer Aussetzer (Tab im Hintergrund) macht keinen Riesensprung", () => {
    const frames: Box[] = [], c = clock();
    const a = createBoxAnimator((b) => frames.push(b), ISLAND_DIMS.notch, c.s);
    a.to(ISLAND_DIMS.panel); c.tick(); c.tick(5000);
    expect(Math.max(...frames.map((f) => f.h))).toBeLessThan(ISLAND_DIMS.panel.h * 1.2);
  });
  it("stepSpring und isSettled", () => {
    const x = [0], v = [0];
    for (let i = 0; i < 200; i++) stepSpring(x, v, [100], 1 / 60);
    expect(isSettled(x, v, [100])).toBe(true);
    expect(isSettled([50], [0], [100])).toBe(false);
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
