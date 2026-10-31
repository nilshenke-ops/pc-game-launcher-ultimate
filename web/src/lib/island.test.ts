import { describe, expect, it } from "vitest";
import { ASK_TTL, clock, HAPPY_MS, islandAnswer, islandClearAsk, islandSize, islandState, moodOf } from "./island";

const base = { busy: false, listening: false, last: null, ask: null, pokes: [] as number[] };
const now = 1_000_000;

describe("JARVIS-Insel: Gesicht folgt dem echten Zustand", () => {
  it("Stimmungen in fester Reihenfolge", () => {
    expect(moodOf(base, now)).toBe("idle");
    expect(moodOf({ ...base, busy: true }, now)).toBe("thinking");
    expect(moodOf({ ...base, busy: true, listening: true }, now)).toBe("listening");
    expect(moodOf({ ...base, last: { text: "ok", ok: true, at: now - 1000 } }, now)).toBe("happy");
    expect(moodOf({ ...base, last: { text: "Fehler", ok: false, at: now - 1000 } }, now)).toBe("error");
    expect(moodOf({ ...base, last: { text: "ok", ok: true, at: now - HAPPY_MS - 1 } }, now)).toBe("idle");
    // Eine Rückfrage geht vor, läuft aber nach 2 Minuten ab
    const ask = { action: { kind: "power", label: "PC herunterfahren", method: "power.shutdown", confirm: true }, at: now - 1000 };
    expect(moodOf({ ...base, busy: true, ask }, now)).toBe("asking");
    expect(moodOf({ ...base, ask: { ...ask, at: now - ASK_TTL - 1 } }, now)).toBe("idle");
    // Zu oft angetippt → schwindelig
    expect(moodOf({ ...base, pokes: [now - 3000, now - 2000, now - 1500, now - 800, now - 100] }, now)).toBe("dizzy");
    expect(moodOf({ ...base, pokes: [now - 9000, now - 8000, now - 7000, now - 6000, now - 100] }, now)).toBe("idle");
  });
  it("nur Aktionen mit Bestätigung und Befehl werden zur Rückfrage – nie automatische oder Navigation", () => {
    islandAnswer("Soll ich?", true, [{ kind: "navigate", label: "Öffnen", path: "/x" }, { kind: "launch", label: "Starten", method: "library.launch", auto: true, confirm: true }]);
    expect(islandState().ask).toBeNull();
    islandAnswer("Soll ich den PC herunterfahren?", true, [{ kind: "power", label: "PC herunterfahren", method: "power.shutdown", confirm: true }]);
    expect(islandState().ask?.action.method).toBe("power.shutdown");
    islandClearAsk();
    expect(islandState().ask).toBeNull();
    expect(islandState().last?.text).toBe("Soll ich den PC herunterfahren?");
  });
  it("zu sind nur die Augen zu sehen – Leiste bei Maus oder Aktivität, Rückfrage mit Knöpfen, Widgets beim Antippen", () => {
    expect(islandSize({ open: false, ask: false, hover: false, mood: "idle" })).toBe("notch");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "dizzy" })).toBe("notch");
    expect(islandSize({ open: false, ask: false, hover: true, mood: "idle" })).toBe("bar");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "thinking" })).toBe("bar");
    expect(islandSize({ open: false, ask: false, hover: false, mood: "happy" })).toBe("bar");
    expect(islandSize({ open: false, ask: true, hover: false, mood: "asking" })).toBe("ask");
    expect(islandSize({ open: true, ask: true, hover: true, mood: "asking" })).toBe("panel");
    islandClearAsk(true);
    expect(islandState().last?.at).toBe(0); // declined: no "done" face
  });
  it("Fokus-Timer-Anzeige", () => {
    expect(clock(5 * 60_000)).toBe("5:00");
    expect(clock(61_500)).toBe("1:02");
    expect(clock(-5)).toBe("0:00");
  });
});
