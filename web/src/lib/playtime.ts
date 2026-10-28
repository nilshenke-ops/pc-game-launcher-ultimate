// "Wie lange brauche ich noch?" – the calculation. Three kinds of numbers are kept apart and always labelled:
//   gemessen     play time from Steam or the companion's own sessions,
//   recherchiert average durations other players reported (IGDB) or the user's own figure,
//   Schätzung    what is calculated from the two – always a range, never one exact number.
// Play time is NOT simply subtracted from the average: other players' time says nothing reliable about the own
// progress. Without a progress value only a clearly marked rough figure is given and the progress is asked for.

export type Goal = "main" | "extra" | "complete";
export const GOAL_LABEL: Record<Goal, string> = { main: "Hauptstory", extra: "Hauptstory + Nebenaufgaben", complete: "100 %" };

export interface Durations { mainHours?: number | null; extraHours?: number | null; completeHours?: number | null; count?: number; source: string; url?: string | null; fetchedAt?: string | null; own?: boolean }
export interface Played { minutes: number; source: string; updatedAt?: string | null }
export interface Progress { percent: number; at: string; note?: string | null; goal?: Goal }

/** One game's stored play-time data (journal kind "playtime" – on this device, compared with the PC). */
export interface PlaytimeEntry {
  gameName: string;
  durations?: Durations | null;
  /** Your own average durations (e.g. from the game's box or a friend) – used when nothing was researched. */
  ownDurations?: { mainHours?: number | null; extraHours?: number | null; completeHours?: number | null } | null;
  played?: Played | null;
  /** Play time you entered yourself (console, other PC). */
  manualMinutes?: number | null;
  progress?: Progress | null;
  /** Average minutes per day you want to plan with. */
  minutesPerDay?: number | null;
  /** How much JARVIS may reveal for this game (Quest-Coach); unset = no story spoilers. */
  spoiler?: "none" | "hints" | "solution" | "full" | null;
  /** Platform you play it on and your play style – your own words, for JARVIS' advice. */
  platform?: string | null;
  playstyle?: string | null;
}

export interface Estimate {
  /** Range in hours, null when it cannot be said honestly. */
  range: [number, number] | null;
  kind: "done" | "progress" | "rough" | "total" | "none";
  notes: string[];
  missing: ("progress" | "played" | "durations")[];
}

const hoursOf = (d: Durations | null | undefined, g: Goal) => (g === "main" ? d?.mainHours : g === "extra" ? d?.extraHours : d?.completeHours) ?? null;
const r1 = (h: number) => Math.round(h * 10) / 10;

/** Researched averages, else the user's own figures (marked as such). */
export function effectiveDurations(e: PlaytimeEntry): Durations | null {
  if (e.durations && (e.durations.mainHours || e.durations.extraHours || e.durations.completeHours)) return e.durations;
  const o = e.ownDurations;
  if (o && (o.mainHours || o.extraHours || o.completeHours)) return { ...o, source: "deine Angabe", own: true };
  return null;
}

/** Measured play time, else what you entered yourself. */
export function effectivePlayed(e: PlaytimeEntry): Played | null {
  if (e.played && e.played.minutes > 0) return e.played;
  if (e.manualMinutes && e.manualMinutes > 0) return { minutes: e.manualMinutes, source: "deine Angabe" };
  return null;
}

export function estimateRemaining(e: PlaytimeEntry, goal: Goal): Estimate {
  const d = effectiveDurations(e);
  const played = effectivePlayed(e);
  const avg = hoursOf(d, goal);
  const p = e.progress && (!e.progress.goal || e.progress.goal === goal) ? e.progress.percent : null;
  const notes: string[] = [];
  const missing: Estimate["missing"] = [];
  if (!avg) missing.push("durations");
  if (!played) missing.push("played");
  if (p == null) missing.push("progress");
  if (d && !d.own && (d.count ?? 0) > 0 && (d.count ?? 0) < 5) notes.push(`Nur ${d.count} Spieler haben ihre Zeit eingetragen – der Durchschnitt ist unsicher.`);
  if (p != null && p >= 100) return { range: [0, 0], kind: "done", notes: ["Laut deiner Angabe ist das schon geschafft."], missing: [] };

  if (p != null && p > 0) {
    const left = 1 - p / 100;
    const values: number[] = [];
    if (avg) values.push(avg * left);
    // Own pace: only from a meaningful share, otherwise a few minutes would be extrapolated to hundreds of hours.
    if (played && p >= 5) { values.push((played.minutes / 60 / (p / 100)) * left); notes.push("Berücksichtigt dein bisheriges Tempo (Spielzeit ÷ Fortschritt)."); }
    if (!values.length) return { range: null, kind: "none", notes: [...notes, "Für eine Schätzung fehlen Spielzeit oder Durchschnittsdauer."], missing };
    // Own pace and average far apart: one span over both would be useless ("11 – 88 h"). Your own pace counts, the average is named.
    if (values.length === 2 && Math.max(...values) / Math.min(...values) > 1.6) {
      const [byAvg, own] = values;
      notes.push(own > byAvg
        ? `Nach dem Durchschnitt wären es nur etwa ${fmtHours(byAvg)} – du spielst bisher deutlich langsamer bzw. gründlicher (oder die gemessene Zeit enthält Pausen, andere Modi oder Durchläufe). Gezählt wird dein Tempo.`
        : `Nach dem Durchschnitt wären es etwa ${fmtHours(byAvg)} – du bist bisher deutlich schneller als der Durchschnitt. Gezählt wird dein Tempo.`);
      return { range: [r1(own * 0.85), r1(own * 1.15)], kind: "progress", notes, missing };
    }
    const lo = Math.min(...values) * 0.85, hi = Math.max(...values) * 1.15;
    return { range: [r1(lo), r1(hi)], kind: "progress", notes, missing };
  }
  if (avg && played) {
    const playedH = played.minutes / 60;
    if (playedH >= avg) return { range: null, kind: "none", notes: [...notes, `Du hast schon länger gespielt als der Durchschnitt (${r1(avg)} h) – ohne deinen Fortschritt lässt sich nichts Verlässliches sagen.`], missing };
    const rest = avg - playedH;
    notes.push("Nur grob: Ohne deinen Fortschritt wird angenommen, dass du ungefähr im Durchschnittstempo spielst. Sag mir deinen Fortschritt (z. B. „Ich bin bei 40 % in …“), dann wird es genauer.");
    return { range: [r1(rest * 0.6), r1(rest * 1.4)], kind: "rough", notes, missing };
  }
  if (avg) return { range: [r1(avg * 0.85), r1(avg * 1.15)], kind: "total", notes: [...notes, "Das ist die Gesamtdauer – deine bisherige Spielzeit und dein Fortschritt fehlen."], missing };
  return { range: null, kind: "none", notes, missing };
}

/** Days needed at a daily budget, as a range. */
export function daysFor(range: [number, number], minutesPerDay: number): [number, number] {
  const m = Math.max(5, minutesPerDay);
  return [Math.max(1, Math.ceil((range[0] * 60) / m)), Math.max(1, Math.ceil((range[1] * 60) / m))];
}

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];

/** "bis Freitag", "bis morgen", "bis zum 3.11." → days from today to that day, including both (today counts). */
export function daysUntil(text: string, now = new Date()): { days: number; label: string } | null {
  const t = text.toLowerCase();
  if (/\bbis (heute abend|heute)\b/.test(t)) return { days: 1, label: "heute" };
  if (/\bbis übermorgen\b|\bbis uebermorgen\b/.test(t)) return { days: 3, label: "übermorgen" };
  if (/\bbis morgen\b/.test(t)) return { days: 2, label: "morgen" };
  const w = WEEKDAYS.findIndex((d) => new RegExp(`\\bbis (zum |nächsten |naechsten )?${d}\\b`).test(t));
  if (w >= 0) { const diff = (w - now.getDay() + 7) % 7 || 7; return { days: diff + 1, label: WEEKDAYS[w][0].toUpperCase() + WEEKDAYS[w].slice(1) }; }
  const m = /\bbis (?:zum )?(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?/.exec(t);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    let target = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && target < new Date(now.getFullYear(), now.getMonth(), now.getDate())) target = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    const days = Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000) + 1;
    return days >= 1 && days <= 400 ? { days, label: target.toLocaleDateString("de-DE") } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- what was asked

export type PlaytimeIntent =
  | { kind: "question"; game: string; ask: "total" | "remaining"; goal: Goal; minutesPerDay: number | null; deadline: string | null }
  | { kind: "progress"; game: string; percent: number };

/** Daily budget from "bei 45 Minuten täglich", "1 Stunde pro Tag", "1,5 h am Tag". */
export function minutesPerDayOf(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(minuten|min|stunden|stunde|std|h)\b[^.?!]{0,20}?(täglich|taeglich|am tag|pro tag|jeden tag|am abend|pro abend)/i.exec(text)
    ?? /(täglich|taeglich|jeden tag|pro tag)\s*(\d+(?:[.,]\d+)?)\s*(minuten|min|stunden|stunde|std|h)\b/i.exec(text);
  if (!m) return null;
  const [n, unit] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[3]];
  const v = Number(n.replace(",", "."));
  const minutes = /^(stunden|stunde|std|h)$/i.test(unit) ? v * 60 : v;
  return minutes >= 5 && minutes <= 1440 ? Math.round(minutes) : null;
}

const cleanGame = (s: string) => s
  .replace(/^(?:(?:für|fuer)\s+)?(?:die\s+)?(?:100\s*(?:%|prozent)|hauptstory|story|nebenquests|nebenaufgaben)\s+(?:in|bei|von|für|fuer)\s+/i, "")
  .replace(/\b(bei|mit)\s+\d+(?:[.,]\d+)?\s*(minuten|min|stunden|stunde|std|h)\b.*$/i, "")
  .replace(/\bbis (zum |nächsten )?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|übermorgen|heute|\d{1,2}\.\d{1,2}\.?\d*)\b.*$/i, "")
  .replace(/\b(durchgespielt|durch|fertig|geschafft|komplett|beendet|abgeschlossen)\b.*$/i, "")
  .replace(/\b(die|der|das)?\s*(hauptstory|haupt-story|story|nebenquests|nebenaufgaben|100\s*%|100 prozent)\b.*$/i, "")
  .replace(/^(ich|noch|in|für|fuer|bei|mit|das spiel|dem spiel|spiel)\s+/i, "").replace(/^(ich|noch|in|für|fuer|bei|mit)\s+/i, "")
  .replace(/\b(habe|hab|bin|ist|sind|werde|noch|ungefähr|ungefaehr|etwa|denn|eigentlich)\b/gi, " ")
  .replace(/[?!.,"„“]+/g, " ").replace(/\s+/g, " ").trim();

export function playtimeIntent(raw: string): PlaytimeIntent | null {
  // "Ich möchte Hogwarts Legacy abschließen. Wie lange brauche ich noch, und was sollte ich als Nächstes machen?"
  // – the game comes from the first sentence; the "what next" part is answered by the Quest-Coach.
  const full = raw.trim().replace(/^jarvis[,:]?\s*/i, "");
  const context = /\bich (?:möchte|moechte|will|würde gerne|wuerde gerne)\s+(.{2,80}?)\s+(?:abschließen|abschliessen|durchspielen|beenden|schaffen|fertig spielen|zu ende spielen|zu ende bringen)\b/i.exec(full)?.[1] ?? null;
  const t = full.replace(/,?\s*(?:und|&)\s+was (?:sollte|soll|kann) ich.*$/i, "").replace(/^.*?\b(?:abschließen|abschliessen|durchspielen|beenden|schaffen)[.!]\s+/i, "").trim();
  if (context && /^wie lange (?:brauche|brauch) ich (?:noch|dafür noch|dafuer noch)?\s*\??$/i.test(t)) {
    const goal0: Goal = /100\s*%|100 prozent|komplett|vollständig/i.test(full) ? "complete" : /nebenquest|nebenaufgabe/i.test(full) ? "extra" : "main";
    return { kind: "question", game: cleanGame(context), ask: "remaining", goal: goal0, minutesPerDay: minutesPerDayOf(full), deadline: null };
  }
  let m = /^(?:ich bin|bin)\s+(?:bei|zu|auf)\s+(\d{1,3})\s*(?:%|prozent)\s+(?:in|bei|von)\s+(.{2,80}?)[.!]?$/i.exec(t)
    ?? /^(?:in|bei)\s+(.{2,80}?)\s+bin ich\s+(?:bei|zu)\s+(\d{1,3})\s*(?:%|prozent)/i.exec(t);
  if (m) {
    const [percent, game] = /^\d/.test(m[1]) ? [Number(m[1]), m[2]] : [Number(m[2]), m[1]];
    if (percent >= 0 && percent <= 100) return { kind: "progress", game: cleanGame(game), percent };
  }
  const goal: Goal = /100\s*%|100 prozent|komplett|alles erledigt|alle erfolge|vollständig|vollstaendig/i.test(t) ? "complete" : /nebenquest|nebenaufgabe|nebenmission|mit nebenbei|mit allem nebenher/i.test(t) ? "extra" : "main";
  const minutesPerDay = minutesPerDayOf(t);
  const deadline = /\bbis\s+(zum |nächsten |naechsten )?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|übermorgen|uebermorgen|heute|\d{1,2}\.\d{1,2})/i.test(t) ? t : null;
  m = /wie lange (?:brauche|brauch) ich (?:noch|ungefähr noch|etwa noch)?\s*,?\s*(?:für|fuer|bis ich|um|in|bei)?\s*(.{2,90}?)\s*\??$/i.exec(t)
    ?? /wie (?:viel|viele) (?:zeit|stunden) (?:brauche ich|fehlt mir|fehlen mir|habe ich) noch (?:für|fuer|in|bei)?\s*(.{2,90}?)\s*\??$/i.exec(t)
    ?? /schaffe ich (?:die |das )?(?:hauptstory |story )?(?:von |in |bei )?(.{2,80}?)\s+bis\b/i.exec(t)
    ?? /wie viele tage brauche ich (?:noch )?(?:für|fuer|bei|in)\s+(.{2,80}?)\s*\??$/i.exec(t);
  if (m) { const game = cleanGame(m[1]); if (game.length >= 2) return { kind: "question", game, ask: "remaining", goal, minutesPerDay, deadline }; }
  m = /wie lange (?:dauert|geht|braucht man für|braucht man fuer|spielt man)\s+(?:das spiel\s+)?(.{2,90}?)\s*(?:insgesamt|ungefähr|etwa|durchschnittlich)?\s*\??$/i.exec(t)
    ?? /wie lang ist\s+(.{2,80}?)\s*\??$/i.exec(t)
    ?? /(?:spieldauer|spielzeit) (?:von|für|fuer)\s+(.{2,80}?)\s*\??$/i.exec(t);
  if (m) { const game = cleanGame(m[1]); if (game.length >= 2) return { kind: "question", game, ask: "total", goal, minutesPerDay, deadline }; }
  return null;
}

export const fmtHours = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} Min.` : `${r1(h).toLocaleString("de-DE")} Std.`);
export const fmtRange = (r: [number, number]) => (r[0] === r[1] ? fmtHours(r[0]) : `${fmtHours(r[0])} – ${fmtHours(r[1])}`);
export const fmtMinutes = (m: number) => (m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} Std. ${m % 60 ? `${m % 60} Min.` : ""}`.trim());
