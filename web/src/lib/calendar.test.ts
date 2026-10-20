import { describe, expect, it } from "vitest";
import { inMonth, occurrences, parseIcs, toIcs, upcoming, type CalendarEvent } from "./calendar";

const ev = (x: Partial<CalendarEvent>): CalendarEvent => ({ id: "cal_t", title: "Raid", start: new Date(2026, 9, 20, 20, 0).toISOString(), durationMinutes: 120, allDay: false, repeat: "none", ...x });

describe("calendar", () => {
  it("repeats weekly in local time and stops at the end date", () => {
    const e = ev({ repeat: "weekly", repeatUntil: new Date(2026, 11, 1).toISOString() });
    const occ = occurrences(e, new Date(2026, 9, 1), new Date(2027, 0, 1));
    expect(occ).toHaveLength(6); // 20.10., 27.10., 3.11., 10.11., 17.11., 24.11.
    expect(occ.every((o) => o.start.getHours() === 20)).toBe(true); // also after the switch to winter time (25.10.)
  });
  it("monthly on the 31st falls on the last day of shorter months (like on the PC)", () => {
    const e = ev({ start: new Date(2026, 0, 31, 18).toISOString(), repeat: "monthly" });
    expect(occurrences(e, new Date(2026, 1, 1), new Date(2026, 2, 1))[0].start.getDate()).toBe(28);
    expect(occurrences(e, new Date(2026, 3, 1), new Date(2026, 4, 1))[0].start.getDate()).toBe(30);
  });
  it("a running event still counts as upcoming, a past one does not", () => {
    const now = new Date(2026, 9, 20, 21, 0);
    expect(upcoming([ev({})], now)).toHaveLength(1);
    expect(upcoming([ev({})], new Date(2026, 9, 20, 23, 0))).toHaveLength(0);
    expect(inMonth([ev({ repeat: "daily" })], 2026, 9)).toHaveLength(12); // 20.–31. October
  });
  it("ICS export and import keep title, time, repetition and reminder", () => {
    const e = ev({ title: "LAN-Party; mit Freunden, 2026", repeat: "weekly", remindMinutes: 30, note: "Zeile 1\nZeile 2" });
    const back = parseIcs(toIcs([e]))[0];
    expect(back).toMatchObject({ title: e.title, start: e.start, durationMinutes: 120, repeat: "weekly", remindMinutes: 30, note: "Zeile 1\nZeile 2", allDay: false });
    const day = parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Release\r\nDTSTART;VALUE=DATE:20261105\r\nEND:VEVENT\r\nEND:VCALENDAR")[0];
    expect(day.allDay).toBe(true);
    expect(new Date(day.start).getDate()).toBe(5);
    expect(parseIcs("BEGIN:VEVENT\r\nDTSTART:kaputt\r\nSUMMARY:x\r\nEND:VEVENT")).toHaveLength(0); // nothing invented
  });
});
