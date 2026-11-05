import { describe, expect, it } from "vitest";
import { QUICK_COMMAND } from "./assistant";

describe("Befehle neben einer langsamen Antwort", () => {
  it("Befehle des PCs werden erkannt", () => {
    for (const c of ["Starte God of War", "starte Minecraft", "Öffne Discord", "Mach leiser", "Stoppe die Musik", "Pausiere den Sound", "Spiele Sound Boom ab", "Stell die Lautstärke auf 30", "Jarvis, starte Steam", "Bitte öffne die Bibliothek", "Lauter", "Aktiviere mein Profil"])
      expect(QUICK_COMMAND.test(c), c).toBe(true);
  });
  it("normale Fragen warten auf die laufende Antwort", () => {
    for (const q of ["Wie lange sollte man schlafen?", "Was ist der Unterschied zwischen RAM und VRAM", "Erkläre mir die Quest", "Wie geht es meinem PC", "Startet das Spiel gerade?"])
      expect(QUICK_COMMAND.test(q), q).toBe(false);
  });
});
