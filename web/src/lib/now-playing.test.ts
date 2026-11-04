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
