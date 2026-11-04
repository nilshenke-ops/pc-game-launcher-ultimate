import { describe, expect, it } from "vitest";
import { addPoint, cleanName, greetingName, homeGames, homeQuick, homeRecent, perfState, sparkPath, totalHours } from "./home-data";
import type { LibraryItem, MetricsSample } from "./types";

const it_ = (id: string, name: string, kind: "game" | "program" = "game", extra: Partial<LibraryItem> = {}) => ({ id, name, kind, source: "exe", target: "", args: "", processNames: [], categories: [], favorite: false, addedAt: "2026-01-01T00:00:00Z", ...extra }) as LibraryItem;
const items = [it_("a", "Anno"), it_("b", "Bioshock", "game", { favorite: true }), it_("c", "Celeste"), it_("d", "Doom"), it_("p", "Discord", "program", { favorite: true }), it_("q", "OBS", "program")];
const hist = { launches: [{ itemId: "c", at: "2026-11-03T10:00:00Z" }, { itemId: "a", at: "2026-11-02T10:00:00Z" }, { itemId: "p", at: "2026-11-01T10:00:00Z" }, { itemId: "c", at: "2026-10-01T10:00:00Z" }], stats: [{ itemId: "c", totalMinutes: 90, lastPlayed: "" }, { itemId: "a", totalMinutes: 30, lastPlayed: "" }] };

describe("Startseite: echte Daten", () => {
  it("Deine Spiele: nur Spiele, Favoriten zuerst, dann zuletzt gestartet", () => expect(homeGames(items, hist).map((x) => x.id)).toEqual(["b", "c", "a"]));
  it("Zuletzt verwendet: nur was gestartet wurde, neueste zuerst, Spiele und Programme", () => expect(homeRecent(items, hist).map((x) => x.id)).toEqual(["c", "a", "p"]));
  it("Ohne Verlauf nichts „Zuletzt“, ohne Bibliothek nichts", () => { expect(homeRecent(items, undefined)).toEqual([]); expect(homeGames(undefined, undefined)).toEqual([]); });
  it("Schnellzugriff: favorisierte Programme", () => expect(homeQuick(items).map((x) => x.id)).toEqual(["p"]));
  it("Gesamtspielzeit in Stunden, ohne Aufzeichnung keine Zahl", () => { expect(totalHours(hist)).toBe(2); expect(totalHours({ stats: [] })).toBeNull(); expect(totalHours(undefined)).toBeNull(); });
  it("Performance-Wort aus der echten CPU-Last; ohne Messung nichts", () => { expect(perfState(20)).toBe("optimal"); expect(perfState(70)).toBe("busy"); expect(perfState(95)).toBe("high"); expect(perfState(null)).toBeNull(); expect(perfState(NaN)).toBeNull(); });
  it("Verlaufslinie: begrenzt, nur mit Messwert, Pfad erst ab zwei Punkten", () => {
    const m = { cpuPercent: 50 } as MetricsSample;
    let pts: number[] = []; for (let i = 0; i < 60; i++) pts = addPoint(pts, m);
    expect(pts.length).toBe(40);
    expect(addPoint([1], { } as MetricsSample)).toEqual([1]);
    expect(sparkPath([10])).toBeNull();
    expect(sparkPath([0, 100], 100, 40)).toBe("M0.0 40.0 L100.0 0.0");
  });
  it("Name: Steuerzeichen und spitze Klammern raus, höchstens 24 Zeichen", () => { expect(cleanName("  <b>Nils\u0007henke</b> ")).toBe("bNilshenke/b"); expect(cleanName("x".repeat(40)).length).toBe(24); expect(cleanName(5)).toBe(""); });
});

describe("Begrüßung: Name", () => {
  it("eigener Name geht vor, sonst Vorname aus dem Konto, sonst leer", () => {
    expect(greetingName("Nils", "nilshenke")).toBe("Nils");
    expect(greetingName("", "nils.henke@example.com")).toBe("Nils");
    expect(greetingName("", "NILS_henke")).toBe("Nils");
    expect(greetingName("", "nilshenke")).toBe("Nilshenke");
    expect(greetingName("  ", null)).toBe("");
    expect(greetingName("", "123")).toBe("");
  });
});
