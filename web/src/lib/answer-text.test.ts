import { describe, expect, it } from "vitest";
import { asksForSource, plainAnswer } from "./answer-text";

describe("plainAnswer", () => {
  it("nimmt Markdown-Zeichen weg, der Inhalt bleibt", () => {
    expect(plainAnswer("Der höchste Berg der Welt ist der **Mount Everest** im Himalaya mit **8.848,86 Metern** (Stand: 2020).")).toBe("Der höchste Berg der Welt ist der Mount Everest im Himalaya mit 8.848,86 Metern (Stand: 2020).");
    expect(plainAnswer("## Tipps\n- *erstens* langsam\n- `zweitens` schnell")).toBe("Tipps\n– erstens langsam\n– zweitens schnell");
    expect(plainAnswer("Mehr unter [der Wiki-Seite](https://example.com/x) und [1] hier.")).toBe("Mehr unter der Wiki-Seite und hier.");
  });
  it("entfernt eine Quellenzeile am Ende, aber keinen Text mittendrin", () => {
    expect(plainAnswer("Sieben bis neun Stunden.\n\nQuelle: Wikipedia\n- Schlaf")).toBe("Sieben bis neun Stunden.");
    expect(plainAnswer("Die Quelle des Rheins liegt in der Schweiz.")).toBe("Die Quelle des Rheins liegt in der Schweiz.");
  });
  it("lässt normalen Text, Zahlen mit Sternchen-Rechnung und leere Eingaben in Ruhe", () => {
    expect(plainAnswer("2 * 3 = 6 und 4 * 5 = 20")).toBe("2 * 3 = 6 und 4 * 5 = 20");
    expect(plainAnswer("snake_case_name bleibt")).toBe("snake_case_name bleibt");
    expect(plainAnswer("")).toBe("");
  });
});

describe("asksForSource", () => {
  it("erkennt die Frage nach der Quelle", () => {
    for (const q of ["Quelle?", "Quellen", "Und die Quelle?", "Woher weißt du das?", "Woher hast du das", "Welche KI hat geantwortet?", "Wer hat das geantwortet?", "Nenn mir die Quelle"]) expect(asksForSource(q), q).toBe(true);
  });
  it("hält normale Fragen und Befehle heraus", () => {
    for (const q of ["Wie hoch ist der Mount Everest?", "Starte Discord", "Woher kommt der Name Minecraft und wie wurde das Spiel so erfolgreich?", "Wo ist die Quelle des Rheins"]) expect(asksForSource(q), q).toBe(false);
  });
});
