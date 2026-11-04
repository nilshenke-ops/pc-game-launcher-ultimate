import { describe, expect, it } from "vitest";
import { consumeSpoken, markSpoken, voiceErrorText, voiceInputSupported } from "./island-voice";

describe("Sprechen mit JARVIS über die Insel", () => {
  it("nur eine gesprochene Frage wird laut beantwortet, und nur einmal", () => {
    expect(consumeSpoken()).toBe(false);
    markSpoken();
    expect(consumeSpoken()).toBe(true);
    expect(consumeSpoken()).toBe(false);
  });
  it("Fehlertexte: Stille und Abbruch sind keine Fehler, der Rest ist verständlich", () => {
    expect(voiceErrorText("no-speech")).toBeNull();
    expect(voiceErrorText("aborted")).toBeNull();
    expect(voiceErrorText("not-allowed")).toMatch(/Mikrofon/);
    expect(voiceErrorText("audio-capture")).toMatch(/Mikrofon/);
    expect(voiceErrorText("network")).toMatch(/nicht erreichbar/);
    expect(voiceErrorText("xyz")).toMatch(/nicht geklappt/);
  });
  it("ohne Browser-Spracherkennung (Testumgebung) wird ehrlich „nicht unterstützt“ gemeldet", () => {
    expect(voiceInputSupported()).toBe(false);
  });
});
