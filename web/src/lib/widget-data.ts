// Pure helpers of the home widgets (components/more-widgets.tsx) – tested in widget-data.test.ts.

/** Same pick for the whole day (no flicker, changes at midnight). */
export function dailyPick<T>(list: T[], now: number): T | undefined {
  if (!list.length) return undefined;
  const d = new Date(now);
  const day = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return list[day % list.length];
}

export interface Sessions { sessions: { itemId: string; name: string; startedAt: string; endedAt?: string; minutes: number }[] }

/** Minutes per game in the last 7 days (sessions cut at the start of the window). */
export function topPlayed(sessions: Sessions["sessions"], now: number, days = 7) {
  const from = now - days * 86400000;
  const per = new Map<string, { name: string; minutes: number }>();
  for (const s of sessions) {
    const start = Date.parse(s.startedAt), end = s.endedAt ? Date.parse(s.endedAt) : now;
    if (isNaN(start) || end <= from) continue;
    const m = Math.max(0, (Math.min(end, now) - Math.max(start, from)) / 60000);
    if (m < 1) continue;
    const cur = per.get(s.itemId) ?? { name: s.name, minutes: 0 };
    cur.minutes += m;
    per.set(s.itemId, cur);
  }
  return [...per.values()].sort((a, b) => b.minutes - a.minutes);
}

