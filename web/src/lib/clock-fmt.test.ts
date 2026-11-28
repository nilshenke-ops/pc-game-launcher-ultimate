import { describe, expect, it } from "vitest";
import { dateTimeLong, dateWdm, timeHM, zoneDay, zoneHour, zoneStamp, zoneTime } from "./clock-fmt";

describe("Uhrzeit und Datum der Insel", () => {
  const samples = [Date.UTC(2026, 10, 24, 18, 48, 12), Date.UTC(2026, 0, 1, 0, 0, 0), Date.UTC(2026, 5, 15, 12, 5, 59), Date.UTC(2026, 2, 29, 1, 30, 0), Date.UTC(2026, 9, 25, 0, 59, 59)];
  it("liefert genau den Text der bisherigen toLocale…-Aufrufe", () => {
    for (const ms of samples) {
      const d = new Date(ms);
      expect(timeHM(ms)).toBe(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      expect(dateWdm(ms)).toBe(d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }));
      expect(dateTimeLong(ms)).toBe(d.toLocaleString([], { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      for (const zone of ["", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Adelaide"]) {
        expect(zoneTime(ms, zone)).toBe(d.toLocaleTimeString("de-DE", { timeZone: zone || undefined, hour: "2-digit", minute: "2-digit" }));
        expect(zoneTime(ms, zone, true)).toBe(d.toLocaleTimeString("de-DE", { timeZone: zone || undefined, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        expect(zoneDay(ms, zone)).toBe(d.toLocaleDateString("de-DE", { timeZone: zone || undefined, weekday: "short", day: "numeric", month: "short" }));
        expect(zoneDay(ms, zone, false)).toBe(d.toLocaleDateString("de-DE", { timeZone: zone || undefined, weekday: "short" }));
        expect(zoneHour(ms, zone)).toBe(Number(d.toLocaleString("en-US", { timeZone: zone || undefined, hour: "numeric", hour12: false })));
        expect(zoneStamp(ms, zone)).toBe(d.toLocaleString("en-US", { timeZone: zone || undefined }));
      }
    }
  });
  it("formatiert eine Minute nur einmal, aber folgt dem Minutenwechsel", () => {
    const a = Date.UTC(2026, 10, 24, 18, 48, 0);
    expect(timeHM(a + 59_000)).toBe(timeHM(a));
    expect(timeHM(a + 60_000)).not.toBe(timeHM(a));
  });
  it("ein ungültiges Datum macht wie vorher keinen Fehler", () => {
    expect(timeHM(NaN)).toBe(new Date(NaN).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    expect(dateWdm(NaN)).toBe("Invalid Date"); expect(dateTimeLong(Infinity)).toBe("Invalid Date");
  });
  it("eine unbekannte Zeitzone wirft wie vorher, damit die Anzeige „–“ zeigen kann", () => {
    expect(() => zoneTime(Date.now(), "Nirgendwo/Stadt")).toThrow();
  });
});
