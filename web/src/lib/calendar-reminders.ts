// Reminders on this device: works without the PC (reads the device's copy of the calendar), but only while the app is
// open – browsers do not wake a closed web app without a push service. With the PC connected, the PC reminds as well.
import { readCache } from "./offline-cache";
import { dueReminders, whenText, type CalendarEvent } from "./calendar";
import { toast } from "./hooks";
import { t } from "./i18n";

let timer: number | null = null;
export function startCalendarReminders() {
  if (timer != null) return;
  const check = () => {
    const events = readCache<{ events: CalendarEvent[] }>("calendar.list")?.data?.events ?? [];
    for (const o of dueReminders(events)) {
      const text = `${o.event.title} – ${whenText(o)}`;
      toast(t("Erinnerung: {n}", { n: text }), "warning");
      try { if ("Notification" in window && Notification.permission === "granted") new Notification(o.event.title, { body: whenText(o), tag: o.event.id }); } catch { /* not allowed here */ }
    }
  };
  check();
  timer = window.setInterval(check, 30000);
}
