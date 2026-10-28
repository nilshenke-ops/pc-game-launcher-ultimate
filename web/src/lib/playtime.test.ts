import { describe, expect, it } from "vitest";
import { daysFor, daysUntil, estimateRemaining, minutesPerDayOf, playtimeIntent, type PlaytimeEntry } from "./playtime";

const igdb = { mainHours: 26.5, extraHours: 43, completeHours: 68.5, count: 412, source: "IGDB" };

describe("Spielzeit: was gefragt ist", () => {
  it("versteht die Fragen aus dem Auftrag", () => {
    expect(playtimeIntent("JARVIS, wie lange brauche ich noch, bis ich Hogwarts Legacy durchgespielt habe?")).toMatchObject({ kind: "question", game: "Hogwarts Legacy", ask: "remaining", goal: "main" });
    expect(playtimeIntent("Wie lange dauert Elden Ring insgesamt?")).toMatchObject({ ask: "total", game: "Elden Ring" });
    expect(playtimeIntent("Wie lange brauche ich für 100 % in Hollow Knight?")).toMatchObject({ goal: "complete", game: "Hollow Knight" });
    expect(playtimeIntent("Wie lange brauche ich noch für Hogwarts Legacy bei 45 Minuten täglich?")).toMatchObject({ game: "Hogwarts Legacy", minutesPerDay: 45 });
    expect(playtimeIntent("Schaffe ich die Hauptstory von Hogwarts Legacy bis Freitag?")).toMatchObject({ game: "Hogwarts Legacy", ask: "remaining" });
    expect(playtimeIntent("Ich bin bei 40 % in Hogwarts Legacy")).toEqual({ kind: "progress", game: "Hogwarts Legacy", percent: 40 });
    expect(playtimeIntent("In Skyrim bin ich bei 15 Prozent")).toEqual({ kind: "progress", game: "Skyrim", percent: 15 });
    expect(playtimeIntent("Starte Minecraft")).toBeNull();
    expect(minutesPerDayOf("1,5 Stunden pro Tag")).toBe(90);
    expect(minutesPerDayOf("täglich 30 min")).toBe(30);
  });
});

describe("Spielzeit: ehrliche Schätzung", () => {
  it("2 – Fortschritt und Spielzeit bekannt: Spanne aus Durchschnitt und eigenem Tempo", () => {
    const e: PlaytimeEntry = { gameName: "Hogwarts Legacy", durations: igdb, played: { minutes: 15 * 60, source: "Steam" }, progress: { percent: 50, at: "2026-10-28" } };
    const r = estimateRemaining(e, "main");
    expect(r.kind).toBe("progress");
    // Average says 13.25 h left, own pace (15 h for 50 %) says 15 h – range around both.
    expect(r.range![0]).toBeLessThan(13.25);
    expect(r.range![1]).toBeGreaterThan(15);
    expect(r.missing).toEqual([]);
  });
  it("3 – Spielzeit bekannt, Fortschritt unbekannt: nur grob, klar gesagt, Fortschritt wird erfragt", () => {
    const r = estimateRemaining({ gameName: "X", durations: igdb, played: { minutes: 10 * 60, source: "Steam" } }, "main");
    expect(r.kind).toBe("rough");
    expect(r.missing).toEqual(["progress"]);
    expect(r.notes.join(" ")).toMatch(/Nur grob/);
    // Longer than the average already: nothing is invented.
    const long = estimateRemaining({ gameName: "X", durations: igdb, played: { minutes: 40 * 60, source: "Steam" } }, "main");
    expect(long.range).toBeNull();
  });
  it("4 – keine Spielzeitquelle: nur die Gesamtdauer, Spielzeit und Fortschritt fehlen", () => {
    const r = estimateRemaining({ gameName: "X", durations: igdb }, "main");
    expect(r.kind).toBe("total");
    expect(r.missing).toEqual(["played", "progress"]);
  });
  it("5 – keine verlässliche Recherche: keine Zahl, nichts erfunden", () => {
    const r = estimateRemaining({ gameName: "X", played: { minutes: 300, source: "Steam" } }, "main");
    expect(r.range).toBeNull();
    expect(r.missing).toContain("durations");
    // Few submissions are flagged.
    expect(estimateRemaining({ gameName: "X", durations: { ...igdb, count: 2 } }, "main").notes.join(" ")).toMatch(/unsicher/);
  });
  it("eigene Angaben zählen, wenn nichts recherchiert ist, und sind als solche erkennbar", () => {
    const r = estimateRemaining({ gameName: "X", ownDurations: { mainHours: 20 }, manualMinutes: 300, progress: { percent: 25, at: "x" } }, "main");
    expect(r.kind).toBe("progress");
    expect(estimateRemaining({ gameName: "X", progress: { percent: 100, at: "x" } }, "main").kind).toBe("done");
  });
  it("eigenes Tempo weit weg vom Durchschnitt: keine nutzlose Riesen-Spanne, der Durchschnitt wird genannt", () => {
    const r = estimateRemaining({ gameName: "X", durations: { ...igdb, mainHours: 22.5 }, played: { minutes: 51 * 60, source: "Verlauf" }, progress: { percent: 40, at: "x" } }, "main");
    // own pace 51 h / 40 % → 76.5 h left; average 13.5 h left → only the own pace ±15 %.
    expect(r.range).toEqual([65, 88]);
    expect(r.notes.join(" ")).toMatch(/Durchschnitt wären es nur etwa 13,5 Std/);
  });
  it("Tage und Termine", () => {
    expect(daysFor([10, 15], 60)).toEqual([10, 15]);
    expect(daysFor([1, 2], 45)).toEqual([2, 3]);
    const wed = new Date(2026, 9, 28); // Mittwoch
    expect(daysUntil("bis Freitag", wed)).toEqual({ days: 3, label: "Freitag" });
    expect(daysUntil("bis morgen", wed)?.days).toBe(2);
    expect(daysUntil("bis zum 1.11.", wed)?.days).toBe(5);
    expect(daysUntil("irgendwann", wed)).toBeNull();
  });
});
