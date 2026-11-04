import { describe, expect, it } from "vitest";
import { nowLine, nowSub } from "./now-playing";

describe("Läuft gerade", () => {
  it("Zeile: Interpret – Titel, nur Titel ohne Interpret, leer ohne Titel", () => {
    expect(nowLine({ title: "Blinding Lights", artist: "The Weeknd" })).toBe("The Weeknd – Blinding Lights");
    expect(nowLine({ title: "Lofi Beats – 24/7 Stream", artist: "" })).toBe("Lofi Beats – 24/7 Stream");
    expect(nowLine({ title: "", artist: "x" })).toBe("");
    expect(nowLine(null)).toBe("");
  });
  it("Zusatz: Interpret und Programm", () => {
    expect(nowSub({ supported: true, playing: true, app: "Spotify", title: "A", artist: "B" })).toBe("B · Spotify");
    expect(nowSub({ supported: true, playing: true, app: "Firefox", title: "Video", artist: "" })).toBe("Firefox");
    expect(nowSub(null)).toBe("");
  });
});

import { nowPosition, songTime } from "./now-playing";
import { accentFromPixels } from "./cover-accent";

describe("Fortschritt des Titels", () => {
  it("läuft zwischen zwei Antworten weiter, steht beim Pausieren und geht nie über das Ende", () => {
    const n = { playing: true, positionMs: 60_000, durationMs: 200_000, at: 1000 };
    expect(nowPosition(n, 11_000)).toMatchObject({ ms: 70_000, ratio: 0.35 });
    expect(nowPosition({ ...n, playing: false }, 11_000)?.ms).toBe(60_000);
    expect(nowPosition(n, 9_999_999)?.ms).toBe(200_000);
    expect(nowPosition({ playing: true, positionMs: 5, durationMs: 0, at: 1 }, 5)).toBeNull(); // the program does not say how long
    expect(nowPosition(null)).toBeNull();
  });
  it("Zeitformat", () => {
    expect(songTime(187_000)).toBe("3:07");
    expect(songTime(3_723_000)).toBe("1:02:03");
    expect(songTime(-5)).toBe("0:00");
  });
});

describe("Akzentfarbe aus dem Titelbild", () => {
  const px = (r: number, g: number, b: number, n = 50) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
  it("nimmt die bunte Farbe, Schwarz und Weiß zählen nicht", () => {
    expect(accentFromPixels([...px(0, 0, 0, 100), ...px(255, 255, 255, 100), ...px(220, 40, 60, 60)])).toBe("#dc283c");
  });
  it("graue oder leere Bilder liefern nichts (dann bleibt die normale Farbe)", () => {
    expect(accentFromPixels(px(128, 128, 128))).toBeNull();
    expect(accentFromPixels([])).toBeNull();
    expect(accentFromPixels([200, 30, 30, 0])).toBeNull();
  });
});
