// Dates and times for the island (3.69.1). The island shows the clock, the date, calendars and world clocks and redraws them every second.
// `toLocaleTimeString()` and friends build a new Intl formatter on every call – the most expensive part of a redraw – so the formatters are
// made once and a time shown to the minute is only formatted when the minute changes. The text is exactly what the old calls returned.

const made = new Map<string, Intl.DateTimeFormat>();
/** One formatter per language and set of options. */
export function dtf(locale: string | undefined, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${o.timeZone ?? ""}|${o.weekday ?? ""}|${o.day ?? ""}|${o.month ?? ""}|${o.year ?? ""}|${o.hour ?? ""}|${o.minute ?? ""}|${o.second ?? ""}|${o.hour12 ?? ""}`;
  let f = made.get(key);
  if (!f) { f = new Intl.DateTimeFormat(locale, o); made.set(key, f); if (made.size > 64) made.delete(made.keys().next().value!); }
  return f;
}

const HM: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
let hmMinute = -1, hmLocale = "", hmText = "";
/** "19:48" in the language of the device – same as `new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })`. */
export function timeHM(ms: number): string {
  if (!Number.isFinite(ms)) return "Invalid Date";   // like the old call: no exception for a time that is not a date
  const minute = Math.floor(ms / 60_000), lang = typeof navigator === "undefined" ? "" : navigator.language;
  if (minute !== hmMinute || lang !== hmLocale) { hmText = dtf(undefined, HM).format(ms); hmMinute = minute; hmLocale = lang; }
  return hmText;
}
/** "Mo., 24. Nov." – same as toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }). */
export const dateWdm = (ms: number) => !Number.isFinite(ms) ? "Invalid Date" : dtf(undefined, { weekday: "short", day: "numeric", month: "short" }).format(ms);
/** The long form for a tooltip – same as toLocaleString([], { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }). */
export const dateTimeLong = (ms: number) => !Number.isFinite(ms) ? "Invalid Date" : dtf(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(ms);

/** Time or date in a time zone, German style – same as toLocaleTimeString/toLocaleDateString("de-DE", { timeZone, … }). */
export const zoneTime = (ms: number, zone: string | undefined, seconds = false) =>
  dtf("de-DE", { timeZone: zone || undefined, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) }).format(ms);
export const zoneDay = (ms: number, zone: string | undefined, full = true) =>
  dtf("de-DE", full ? { timeZone: zone || undefined, weekday: "short", day: "numeric", month: "short" } : { timeZone: zone || undefined, weekday: "short" }).format(ms);
/** Hour (0–23) in a time zone – same as Number(toLocaleString("en-US", { timeZone, hour: "numeric", hour12: false })). */
export const zoneHour = (ms: number, zone: string | undefined) => Number(dtf("en-US", { timeZone: zone || undefined, hour: "numeric", hour12: false }).format(ms));
/** The default English date and time of a zone ("11/24/2026, 7:48:12 PM") – what zoneDiff reads back into a Date. */
export const zoneStamp = (ms: number, zone?: string) => dtf("en-US", { timeZone: zone || undefined, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).format(ms);

/** Makes the formatters the open island will need once, while the browser is idle – building one takes a moment and it should not happen while the island opens. */
export function warmClockFormats(now = Date.now()) {
  try {
    timeHM(now); dateWdm(now); dateTimeLong(now);
    zoneTime(now, ""); zoneTime(now, "", true); zoneDay(now, ""); zoneDay(now, "", false); zoneHour(now, ""); zoneStamp(now);
    for (const o of [{ weekday: "short" }, { month: "short" }, { weekday: "narrow" }] as const) dtf(undefined, o).format(now);
  } catch { /* a browser without Intl support – the texts are made when needed */ }
}
