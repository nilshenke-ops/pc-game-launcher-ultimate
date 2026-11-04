import { describe, expect, it } from "vitest";
import { addEntry, cleanHistory, HISTORY_MAX, orderActivities, splitLead, type HistoryEntry } from "./island-activity";

const a = (kind: "jarvis" | "game" | "timer" | "music" | "system" | "notice", level: "info" | "success" | "warning" | "error" = "info", text: string = kind) => ({ kind, level, text });

describe("Aktivitäten der Insel", () => {
  it("Reihenfolge: Fehler, Warnung, JARVIS, Timer, Spiel, Musik", () => {
    const o = orderActivities([a("music"), a("game"), a("timer"), a("jarvis"), a("notice", "warning"), a("system", "error")]).map((x) => x.kind);
    expect(o).toEqual(["system", "notice", "jarvis", "timer", "game", "music"]);
  });
  it("mehrere gleichzeitig: einer führt, die anderen bleiben als Marken", () => {
    const { lead, others } = splitLead([a("music"), a("game")]);
    expect(lead?.kind).toBe("game");
    expect(others.map((x) => x.kind)).toEqual(["music"]);
    expect(splitLead([]).lead).toBeNull();
  });
  it("gleicher Rang behält die Reihenfolge", () => {
    expect(orderActivities([a("notice", "info", "x"), a("notice", "info", "y")]).map((x) => x.text)).toEqual(["x", "y"]);
  });
});

describe("Verlauf", () => {
  const e = (text: string, at: number, kind: HistoryEntry["kind"] = "system"): Omit<HistoryEntry, "id"> => ({ at, kind, level: "info", text });
  it("neueste oben, gleicher Text kurz hintereinander nur einmal", () => {
    let l: HistoryEntry[] = [];
    l = addEntry(l, e("Verbindung verloren", 1000));
    l = addEntry(l, e("Verbindung verloren", 3000));            // flapping: counted once
    l = addEntry(l, e("Verbindung wiederhergestellt", 4000));
    l = addEntry(l, e("Verbindung verloren", 20_000));          // much later: counts again
    expect(l.map((x) => x.text)).toEqual(["Verbindung verloren", "Verbindung wiederhergestellt", "Verbindung verloren"]);
  });
  it("höchstens 60 Einträge, leere und Steuerzeichen werden bereinigt", () => {
    let l: HistoryEntry[] = [];
    for (let i = 0; i < 80; i++) l = addEntry(l, e(`Ereignis ${i}`, i * 60_000));
    expect(l).toHaveLength(HISTORY_MAX);
    expect(l[0].text).toBe("Ereignis 79");
    expect(addEntry([], e("   ", 0))).toEqual([]);
    expect(addEntry([], e("a\u0007b", 0))[0].text).toBe("a b");
  });
  it("beschädigte gespeicherte Daten ergeben eine leere, gültige Liste", () => {
    expect(cleanHistory("kaputt")).toEqual([]);
    expect(cleanHistory([{ text: "ok", at: 1, kind: "game", level: "success", id: 3 }, { text: 5 }, null, { text: "x", at: 1, kind: "böse", level: "info" }])).toHaveLength(1);
  });
});
