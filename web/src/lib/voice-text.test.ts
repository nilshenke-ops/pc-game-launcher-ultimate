import { describe, expect, it } from "vitest";
import { cleanSpoken, voiceControl } from "./voice-text";

describe("Gesprochener Text wird wie getippter", () => {
  it("Weckwort, Füllwörter, „bitte“ und Schlusspunkt fallen weg", () => {
    expect(cleanSpoken("Hey Jarvis, ähm, starte bitte Rocket League.")).toBe("Starte bitte Rocket League");
    expect(cleanSpoken("Jarvis starte Rocket League bitte")).toBe("Starte Rocket League");
    expect(cleanSpoken("okay Jarvis, wie geht es meinem PC?")).toBe("Wie geht es meinem PC");
    expect(cleanSpoken("Also äh mach mal leiser")).toBe("Mach mal leiser");
    expect(cleanSpoken("  Öffne   Discord !  ")).toBe("Öffne Discord");
  });
  it("Inhalt bleibt, auch „Jarvis“ mitten im Satz und Zahlen", () => {
    expect(cleanSpoken("Erkläre mir bitte die Rolle von Jarvis im Spiel")).toBe("Erkläre mir bitte die Rolle von Jarvis im Spiel");
    expect(cleanSpoken("Stell die Lautstärke auf 30")).toBe("Stell die Lautstärke auf 30");
  });
  it("leer bleibt leer", () => { expect(cleanSpoken("")).toBe(""); expect(cleanSpoken("Hey Jarvis")).toBe(""); expect(cleanSpoken("ähm...")).toBe(""); });
  it("Steuerwörter: Stopp hält die Stimme an, Danke beendet das Gespräch", () => {
    for (const w of ["Stopp", "stop!", "Hey Jarvis, stopp.", "Sei still", "Abbrechen", "Genug"]) expect(voiceControl(w), w).toBe("stop");
    for (const w of ["Danke", "Danke, das war's", "Das war's.", "Tschüss", "Gespräch beenden", "Ende"]) expect(voiceControl(w), w).toBe("end");
  });
  it("normale Sätze (auch mit diesen Wörtern) sind keine Steuerwörter", () => {
    for (const w of ["Wie stoppe ich den Download", "Starte Rocket League", "Danke für die Info, aber was ist VRAM", "Pause im Spiel machen", "Halt die Musik an und starte Steam"]) expect(voiceControl(w), w).toBeNull();
  });
});
