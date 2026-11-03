import { describe, expect, it } from "vitest";
import { cleanNote, cleanWidgets, DEFAULT_WIDGETS, islandTemps, netRows, NOTE_MAX, toggleWidget } from "./island-widgets";
import type { MetricsSample } from "./types";

const sample = (p: Partial<MetricsSample>): MetricsSample => ({ at: "x", cpuTempSource: "", gpus: [], disks: [], sources: {}, ...p });

describe("Insel-Widgets: Auswahl", () => {
  it("Standard bleibt wie bisher, unbekanntes fliegt raus, feste Reihenfolge, keine Doppelten", () => {
    expect(cleanWidgets(undefined)).toEqual(DEFAULT_WIDGETS);
    expect(cleanWidgets(["note", "game", "game", "unsinn", 5])).toEqual(["game", "note"]);
  });
  it("ein- und ausschalten", () => {
    expect(toggleWidget(DEFAULT_WIDGETS, "net", true)).toContain("net");
    expect(toggleWidget(DEFAULT_WIDGETS, "game", false)).not.toContain("game");
    expect(toggleWidget(["game"], "game", true)).toEqual(["game"]);
  });
});

describe("Insel-Widgets: Werte ehrlich", () => {
  it("Temperaturen gerundet; nicht messbar = „n. v.“; ohne Messung = „–“; FPS nur mit echter Zahl", () => {
    expect(islandTemps(sample({ cpuTempC: 61.4, gpus: [{ tempC: 70.6 } as never] }))).toEqual({ cpu: "61 °C", gpu: "71 °C", fps: "n. v." });
    expect(islandTemps(sample({}))).toEqual({ cpu: "n. v.", gpu: "n. v.", fps: "n. v." });
    expect(islandTemps(null)).toEqual({ cpu: "–", gpu: "–", fps: "–" });
    expect(islandTemps(sample({ fpsStatus: "Nicht verfügbar – benötigt PresentMon" })).fps).toBe("n. v.");
    expect(islandTemps(sample({ fpsStatus: "144 FPS" })).fps).toBe("144 FPS");
  });
  it("Netzwerk: letzter Ping, „keine Antwort“, „–“; höchstens zwei Ziele", () => {
    const rows = netRows([
      { id: "r", label: "Router", points: [{ ms: 3 }, { ms: 4.4 }] },
      { id: "i", label: "Internet", points: [{ ms: 12 }, { ms: null }] },
      { id: "x", label: "Server", points: [] },
    ]);
    expect(rows).toEqual([{ id: "r", label: "Router", text: "4 ms", ok: true }, { id: "i", label: "Internet", text: "keine Antwort", ok: false }]);
    expect(netRows([{ id: "s", label: "Server", points: [] }])[0].text).toBe("–");
    expect(netRows(null)).toEqual([]);
  });
  it("Notiz: Steuerzeichen raus, höchstens 500 Zeichen, Zeilenumbrüche bleiben", () => {
    expect(cleanNote("a\u0007b\nc")).toBe("ab\nc");
    expect(cleanNote("x".repeat(900)).length).toBe(NOTE_MAX);
    expect(cleanNote(42)).toBe("");
  });
});
