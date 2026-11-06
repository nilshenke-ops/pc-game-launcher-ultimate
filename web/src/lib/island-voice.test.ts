import { describe, expect, it } from "vitest";
import { vadStep, VAD, resolveStt, type Vad } from "./island-voice";

const run = (levels: [number, number][]) => {   // [rms, ms since start]
  let s: Vad = { speaking: false, lastLoud: 0, startedAt: 0 };
  for (const [rms, at] of levels) { const r = vadStep(s, rms, at); s = r.state; if (r.stop) return r.stop; }
  return false;
};

describe("Aufnahme-Ende bei Sprechpause", () => {
  it("hört erst nach Sprache und einer Pause auf", () => {
    expect(run([[0.001, 200], [0.1, 600], [0.1, 1000], [0.001, 1500], [0.001, 2000]])).toBe(false);          // pause too short
    expect(run([[0.001, 200], [0.1, 600], [0.1, 1000], [0.001, 1500], [0.001, 2000], [0.001, 2400]])).toBe("silence");
  });
  it("gibt auf, wenn nichts gesagt wird, und begrenzt die Länge", () => {
    expect(run([[0.001, 1000], [0.001, 3000], [0.001, VAD.noSpeechMs + 10]])).toBe("nospeech");
    expect(run([[0.1, 1000], [0.1, 8000], [0.1, VAD.maxMs + 10]])).toBe("max");
  });
});

const R = (o: Partial<{ browser: boolean; groq: boolean; elevenDevice: boolean; elevenPc: boolean }> = {}) => ({ browser: false, groq: false, elevenDevice: false, elevenPc: false, ...o });
describe("Welche Spracherkennung hört zu", () => {
  it("Automatisch: Browser, wo es ihn gibt – sonst Scribe/Whisper, damit das Mikrofon auch in Firefox geht", () => {
    expect(resolveStt("auto", R({ browser: true, groq: true }))).toBe("browser");
    expect(resolveStt("auto", R({ elevenPc: true }))).toBe("eleven-pc");                                    // Firefox + key at the PC
    expect(resolveStt("auto", R({ elevenDevice: true, groq: true }))).toBe("eleven-device");
    expect(resolveStt("auto", R({ groq: true }))).toBe("groq");
    expect(resolveStt("auto", R())).toBeNull();                                                             // cannot listen at all
  });
  it("eine ausdrückliche Wahl gilt, solange sie bereit ist – sonst der nächstbeste Weg", () => {
    expect(resolveStt("groq", R({ browser: true, groq: true }))).toBe("groq");
    expect(resolveStt("groq", R({ browser: true }))).toBe("browser");
    expect(resolveStt("eleven", R({ browser: true, elevenDevice: true, elevenPc: true }))).toBe("eleven-device");
    expect(resolveStt("eleven", R({ browser: true }))).toBe("browser");
    expect(resolveStt("browser", R({ groq: true }))).toBeNull();                                            // "browser" never silently goes to a cloud
  });
});
