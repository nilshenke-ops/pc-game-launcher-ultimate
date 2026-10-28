import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
vi.stubGlobal("localStorage", ls);
vi.stubGlobal("window", { localStorage: ls, sessionStorage: ls });

const { withStyle, setStyle, styleOf } = await import("./jarvis-style");
const { naturalness, voicesFor, speakable } = await import("./jarvis-voice");

describe("Stimme: die menschlichsten zuerst", () => {
  it("erkennt neuronale Stimmen am Namen", () => {
    expect(naturalness({ name: "Microsoft Conrad Online (Natural) - German (Germany)" })).toBe(2);
    expect(naturalness({ name: "Anna (Erweitert)" })).toBe(2);
    expect(naturalness({ name: "Google Deutsch" })).toBe(1);
    expect(naturalness({ name: "Microsoft Hedda - German (Germany)" })).toBe(0);
  });
  it("sortiert die Stimmen der Sprache, andere Sprachen fallen weg", () => {
    const all = [
      { name: "Microsoft Hedda - German (Germany)", lang: "de-DE", voiceURI: "hedda" },
      { name: "Google Deutsch", lang: "de-DE", voiceURI: "google" },
      { name: "Microsoft Killian Online (Natural) - German (Germany)", lang: "de-DE", voiceURI: "killian" },
      { name: "Microsoft Jonas Online (Natural) - German (Austria)", lang: "de-AT", voiceURI: "jonas" },
      { name: "Google US English", lang: "en-US", voiceURI: "us" },
    ];
    expect(voicesFor("de-DE", all).map((v) => v.voiceURI)).toEqual(["killian", "jonas", "google", "hedda"]);
  });
  it("liest keine Emojis vor", () => {
    expect(speakable("Erledigt. 😏 Läuft bei uns.")).toBe("Erledigt. Läuft bei uns.");
  });
});

describe("Ton „Locker“", () => {
  const noon = new Date(2026, 9, 28, 12, 0);
  it("sachlich ist der Standard und ändert nichts", () => {
    expect(styleOf()).toBe("sachlich");
    expect(withStyle("✓ Gestartet: Hades", true, "sachlich", noon)).toBe("✓ Gestartet: Hades");
  });
  it("hängt einen Spruch an – Fakten bleiben unverändert davor", () => {
    const t = "JARVIS – Spielzeitanalyse: Hades\n• Geschätzt noch: 11 – 15 Std.";
    const r = withStyle(t, true, "locker", noon);
    expect(r.startsWith(t)).toBe(true);
    expect(r).toMatch(/\n\n😏 .+/);
    expect(withStyle(t, true, "locker", noon)).toBe(r); // the same answer gets the same line
  });
  it("kein Spruch bei Fehlern oder offenen Fragen; spät nachts ein Hinweis auf die Uhrzeit", () => {
    expect(withStyle("Das ging nicht.", false, "locker", noon)).toBe("Das ging nicht.");
    expect(withStyle("Welches Spiel meinst du?", null, "locker", noon)).toBe("Welches Spiel meinst du?");
    expect(withStyle("✓ Erledigt", true, "locker", new Date(2026, 9, 28, 1, 30))).toContain("Es ist 01:30");
    setStyle("locker");
    expect(styleOf()).toBe("locker");
  });
});
