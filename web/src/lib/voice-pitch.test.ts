import { describe, expect, it } from "vitest";
import { PitchShifterCore } from "./voice-pitch-worklet.js";
import { effectivePitch, semitoneRatio, voiceById, VOICES } from "./voice-presets";

const SR = 48000;
/** Energy of one frequency in a signal (Goertzel). */
function energy(x: Float32Array, hz: number) {
  const w = (2 * Math.PI * hz) / SR, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
}
/** Runs a sine through the shifter block by block (128 samples, like the browser) and returns the second half (settled). */
function run(freq: number, ratio: number, seconds = 1) {
  const core = new PitchShifterCore(SR), n = Math.round(SR * seconds), out = new Float32Array(n), inp = new Float32Array(128), o = new Float32Array(128);
  for (let p = 0; p < n; p += 128) {
    for (let i = 0; i < 128; i++) inp[i] = 0.5 * Math.sin((2 * Math.PI * freq * (p + i)) / SR);
    core.process(inp, o, ratio);
    out.set(o, p);
  }
  return out.slice(n >> 1);
}

describe("Stimmenwechsler: Tonhöhe in Echtzeit", () => {
  it.each([[1.5, 440], [0.5, 440], [1.25, 300], [0.75, 300], [2, 220]])("Faktor %s: aus %s Hz wird die erwartete Tonhöhe", (ratio, f) => {
    const y = run(f, ratio), want = energy(y, f * ratio);
    expect(want).toBeGreaterThan(energy(y, f) * 8);                 // the new pitch is clearly stronger than the old one
    expect(want).toBeGreaterThan(energy(y, f * ratio * 1.5) * 8);   // … and than a wrong one
  });
  it("Faktor 1 lässt die Stimme klingen wie vorher (gleiche Tonhöhe, ähnliche Lautstärke)", () => {
    const y = run(440, 1);
    expect(energy(y, 440)).toBeGreaterThan(energy(y, 660) * 50);
    const rms = Math.sqrt(y.reduce((a, v) => a + v * v, 0) / y.length);
    expect(rms).toBeGreaterThan(0.3 * 0.707); expect(rms).toBeLessThan(0.5 * 0.707 * 1.2);
  });
  it("Stille bleibt still, Unsinn als Faktor stürzt nicht ab", () => {
    const core = new PitchShifterCore(SR), o = new Float32Array(128);
    core.process(null, o, NaN); expect(o.every((v) => v === 0)).toBe(true);
    core.process(new Float32Array(128).fill(0.1), o, 99);
    expect(o.every(Number.isFinite)).toBe(true);
  });
});

describe("Stimmen", () => {
  it("jede Stimme hat eine eigene Kennung, einen Namen und erlaubte Werte", () => {
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length);
    for (const v of VOICES) {
      expect(v.name.length).toBeGreaterThan(2);
      expect(v.pitch).toBeGreaterThanOrEqual(0.25); expect(v.pitch).toBeLessThanOrEqual(4);
      if (v.ring) { expect(v.ring.mix).toBeGreaterThan(0); expect(v.ring.mix).toBeLessThanOrEqual(1); }
      if (v.echo) { expect(v.echo.feedback).toBeLessThan(0.85); expect(v.echo.time).toBeLessThanOrEqual(1); }
      if (v.band) expect(v.band.low).toBeLessThan(v.band.high);
    }
    expect(VOICES.length).toBeGreaterThanOrEqual(30);
    expect(VOICES.map((v) => v.id)).toContain("duel");
  });
  it("Original ändert nichts; unbekannte Kennung fällt auf Original zurück", () => {
    expect(voiceById("original").pitch).toBe(1);
    expect(voiceById("gibt-es-nicht").id).toBe("original");
  });
  it("Feinabstimmung in Halbtönen: +12 ist eine Oktave, die Grenzen des Schiebers gelten", () => {
    expect(semitoneRatio(12)).toBeCloseTo(2, 10); expect(semitoneRatio(-12)).toBeCloseTo(0.5, 10);
    expect(effectivePitch(voiceById("monster"), 0)).toBeCloseTo(0.6, 10);
    expect(effectivePitch(voiceById("chipmunk"), 12)).toBe(3.2);
    expect(effectivePitch(voiceById("monster"), -99)).toBeGreaterThanOrEqual(0.25);
  });
});
