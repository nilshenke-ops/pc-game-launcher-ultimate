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

import { elevenSpeechToSpeech, elevenVoices, saveLocalElevenKey, setDeviceKeyForTests, removeLocalElevenKey } from "./free-ai-local";
describe("ElevenLabs-Modus: Stimmenliste und Sprache-zu-Sprache", () => {
  const key = "sk_" + "a".repeat(32);
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
  const setup = async () => {
    (globalThis as unknown as { window: unknown }).window = { localStorage: mem(), sessionStorage: mem() };
    setDeviceKeyForTests(await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]) as CryptoKey);
    await saveLocalElevenKey(key);
  };
  it("lädt nur brauchbare Stimmen mit Namen und Art", async () => {
    await setup();
    const fetcher = (async () => new Response(JSON.stringify({ voices: [{ voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade" }, { voice_id: "kaputt!", name: "X" }, { voice_id: "abcdefghij1234", name: "Meine Stimme", category: "cloned" }, { name: "ohne id" }] }), { status: 200 })) as unknown as typeof fetch;
    expect(await elevenVoices({ fetcher })).toEqual([{ id: "pNInz6obpgDQGcFmaJgB", name: "Adam", category: "premade" }, { id: "abcdefghij1234", name: "Meine Stimme", category: "cloned" }]);
    removeLocalElevenKey(); setDeviceKeyForTests(null);
  });
  it("schickt die Aufnahme mit Stimme, Modell und Schlüssel an die Sprache-zu-Sprache-Schnittstelle", async () => {
    await setup();
    const seen: { url: string; key: string | null; fields: string[] }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      seen.push({ url, key: new Headers(init?.headers).get("xi-api-key"), fields: [...(init!.body as FormData).keys()] });
      return new Response(new Uint8Array(400), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await elevenSpeechToSpeech(new Blob([new Uint8Array(4000)], { type: "audio/webm" }), "pNInz6obpgDQGcFmaJgB", { fetcher });
    expect(out.size).toBe(400);
    expect(seen[0].url).toContain("https://api.elevenlabs.io/v1/speech-to-speech/pNInz6obpgDQGcFmaJgB");
    expect(seen[0].key).toBe(key);
    expect(seen[0].fields).toEqual(expect.arrayContaining(["audio", "model_id"]));
    removeLocalElevenKey(); setDeviceKeyForTests(null);
  });
  it("lehnt ungültige Stimme, zu kurze und zu lange Aufnahmen ab, ohne etwas zu senden", async () => {
    await setup();
    let calls = 0; const fetcher = (async () => { calls++; return new Response("x"); }) as unknown as typeof fetch;
    await expect(elevenSpeechToSpeech(new Blob([new Uint8Array(4000)]), "../x", { fetcher })).rejects.toThrow(/Stimme/);
    await expect(elevenSpeechToSpeech(new Blob([new Uint8Array(100)]), "pNInz6obpgDQGcFmaJgB", { fetcher })).rejects.toThrow(/kurz/);
    await expect(elevenSpeechToSpeech(new Blob([new Uint8Array(8_100_000)]), "pNInz6obpgDQGcFmaJgB", { fetcher })).rejects.toThrow(/lang/);
    expect(calls).toBe(0);
    removeLocalElevenKey(); setDeviceKeyForTests(null);
  });
});
