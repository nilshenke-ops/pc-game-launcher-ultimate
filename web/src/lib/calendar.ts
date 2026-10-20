// Gaming calendar: dates (raids, tournaments, LAN parties, releases). Stored on the PC (calendar.*), created and changed
// on the phone also without the PC (queued like everything else). Occurrences are calculated in local time like on the
// PC, so a weekly 20:00 event stays at 20:00 across daylight saving.
import { t } from "./i18n";

export type Repeat = "none" | "daily" | "weekly" | "monthly";
export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO time (UTC). */
  start: string;
  durationMinutes: number;
  allDay: boolean;
  repeat: Repeat;
  repeatUntil?: string | null;
  remindMinutes?: number | null;
  itemId?: string | null;
  note?: string | null;
  color?: string | null;
  updatedAt?: string;
}
export interface Occurrence { event: CalendarEvent; start: Date; end: Date }

export const REPEATS: [Repeat, () => string][] = [["none", () => t("Einmalig")], ["daily", () => t("Täglich")], ["weekly", () => t("Wöchentlich")], ["monthly", () => t("Monatlich")]];
export const REMINDERS: [number | null, () => string][] = [[null, () => t("Keine")], [0, () => t("Zum Beginn")], [5, () => t("5 Minuten vorher")], [15, () => t("15 Minuten vorher")],
  [30, () => t("30 Minuten vorher")], [60, () => t("1 Stunde vorher")], [1440, () => t("1 Tag vorher")]];

export const newEventId = () => "cal_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function addLocal(d: Date, repeat: Repeat, n: number) {
  const x = new Date(d);
  if (repeat === "daily") x.setDate(x.getDate() + n);
  else if (repeat === "weekly") x.setDate(x.getDate() + 7 * n);
  else if (repeat === "monthly") {
    // Like the PC (.NET AddMonths): the 31st becomes the last day of shorter months instead of spilling over.
    const day = x.getDate();
    x.setDate(1); x.setMonth(x.getMonth() + n);
    x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  }
  return x;
}

/** All occurrences that overlap [from, to). */
export function occurrences(e: CalendarEvent, from: Date, to: Date): Occurrence[] {
  const start = new Date(e.start);
  const len = Math.max(e.allDay ? 1440 : e.durationMinutes, 1) * 60000;
  const until = e.repeatUntil ? new Date(e.repeatUntil) : null;
  const out: Occurrence[] = [];
  if (e.repeat === "none") return start.getTime() < to.getTime() && start.getTime() + len > from.getTime() ? [{ event: e, start, end: new Date(start.getTime() + len) }] : [];
  // Jump close to the range first (no need to walk years of daily events one by one).
  const step = e.repeat === "daily" ? 864e5 : e.repeat === "weekly" ? 6048e5 : 28 * 864e5;
  let n = Math.max(0, Math.floor((from.getTime() - start.getTime() - len) / step) - 1);
  for (let guard = 0; guard < 2000; guard++, n++) {
    const s = addLocal(start, e.repeat, n);
    if (s.getTime() >= to.getTime() || (until && s.getTime() > until.getTime())) break;
    if (s.getTime() + len > from.getTime()) out.push({ event: e, start: s, end: new Date(s.getTime() + len) });
  }
  return out;
}

/** The next occurrences from now on (running ones included), sorted. */
export function upcoming(events: CalendarEvent[], now = new Date(), days = 60, max = 50): Occurrence[] {
  const to = new Date(now.getTime() + days * 864e5);
  return events.flatMap((e) => occurrences(e, now, to)).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, max);
}

export function inMonth(events: CalendarEvent[], year: number, month: number): Occurrence[] {
  const from = new Date(year, month, 1), to = new Date(year, month + 1, 1);
  return events.flatMap((e) => occurrences(e, from, to)).sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function whenText(o: Occurrence, now = new Date()) {
  const day = sameDay(o.start, now) ? t("Heute") : sameDay(o.start, new Date(now.getTime() + 864e5)) ? t("Morgen") : o.start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return o.event.allDay ? day : `${day}, ${o.start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

// ------------------------------------------------------------------ ICS (Google, Apple, Outlook)

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDay = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const unesc = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

export function toIcs(events: CalendarEvent[]): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nexus Gaming Hub//Kalender//DE", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const s = new Date(e.start);
    lines.push("BEGIN:VEVENT", `UID:${e.id}@nexus-gaming-hub`, `DTSTAMP:${icsDate(new Date(e.updatedAt ?? Date.now()))}`, `SUMMARY:${esc(e.title)}`);
    if (e.allDay) lines.push(`DTSTART;VALUE=DATE:${icsDay(s)}`, `DTEND;VALUE=DATE:${icsDay(new Date(s.getTime() + 864e5))}`);
    else { lines.push(`DTSTART:${icsDate(s)}`); if (e.durationMinutes > 0) lines.push(`DTEND:${icsDate(new Date(s.getTime() + e.durationMinutes * 60000))}`); }
    if (e.repeat !== "none") lines.push(`RRULE:FREQ=${e.repeat.toUpperCase()}${e.repeatUntil ? `;UNTIL=${icsDate(new Date(e.repeatUntil))}` : ""}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    if (e.remindMinutes != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.remindMinutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  // Lines longer than 75 octets are folded as RFC 5545 requires.
  return lines.map((l) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join("\r\n "))).join("\r\n") + "\r\n";
}

function parseIcsDate(v: string, params: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h == null || /VALUE=DATE(?!-)/.test(params)) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  return { date: z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

/** Reads events from an .ics file (other calendars). Unknown things are skipped, nothing is invented. */
export function parseIcs(text: string): CalendarEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: CalendarEvent[] = [];
  let cur: Record<string, { v: string; p: string }> | null = null;
  let alarm: string | null = null;
  let inAlarm = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; alarm = null; continue; }
    if (line === "BEGIN:VALARM") { inAlarm = true; continue; }
    if (line === "END:VALARM") { inAlarm = false; continue; }
    if (line === "END:VEVENT" && cur) {
      const st = cur.DTSTART && parseIcsDate(cur.DTSTART.v, cur.DTSTART.p);
      const title = cur.SUMMARY ? unesc(cur.SUMMARY.v).trim().slice(0, 80) : "";
      if (st && title) {
        const en = cur.DTEND && parseIcsDate(cur.DTEND.v, cur.DTEND.p);
        const rule = cur.RRULE?.v ?? "";
        const freq = /FREQ=(DAILY|WEEKLY|MONTHLY)/.exec(rule)?.[1]?.toLowerCase() as Repeat | undefined;
        const until = /UNTIL=([0-9TZ]+)/.exec(rule)?.[1];
        const remind = alarm ? /^-?P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(alarm) : null;
        out.push({
          id: newEventId(), title, start: st.date.toISOString(), allDay: st.allDay,
          durationMinutes: st.allDay ? 0 : en ? Math.max(0, Math.min(10080, Math.round((en.date.getTime() - st.date.getTime()) / 60000))) : 60,
          repeat: freq ?? "none", repeatUntil: until ? parseIcsDate(until, "")?.date.toISOString() ?? null : null,
          remindMinutes: remind ? Math.min(10080, (+(remind[1] ?? 0)) * 1440 + (+(remind[2] ?? 0)) * 60 + (+(remind[3] ?? 0))) : null,
          note: cur.DESCRIPTION ? unesc(cur.DESCRIPTION.v).slice(0, 500) : null,
        });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
    if (!m) continue;
    if (inAlarm) { if (m[1] === "TRIGGER") alarm = m[3]; continue; }
    cur[m[1]] = { v: m[3], p: m[2] };
  }
  return out.slice(0, 500);
}

// ------------------------------------------------------------------ reminders on this device

const REMINDED_KEY = "pgl.calendar.reminded";
/** Reminders due now on this device (not yet shown here). Works without the PC, but only while the app is open –
 * with the PC connected the PC reminds as well (notification on the PC and in the app). */
export function dueReminders(events: CalendarEvent[], now = new Date()): Occurrence[] {
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(REMINDED_KEY) ?? "[]"); } catch { /* storage blocked */ }
  const due = events.filter((e) => e.remindMinutes != null)
    .flatMap((e) => occurrences(e, new Date(now.getTime() - 10 * 60000), new Date(now.getTime() + 7 * 864e5)))
    .filter((o) => {
      const at = o.start.getTime() - (o.event.remindMinutes ?? 0) * 60000;
      return now.getTime() >= at && now.getTime() <= o.start.getTime() + 10 * 60000 && !seen.includes(`${o.event.id}@${o.start.toISOString()}`);
    });
  if (due.length) {
    seen = [...seen, ...due.map((o) => `${o.event.id}@${o.start.toISOString()}`)].slice(-300);
    try { localStorage.setItem(REMINDED_KEY, JSON.stringify(seen)); } catch { /* storage blocked */ }
  }
  return due;
}
