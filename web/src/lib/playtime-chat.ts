// JARVIS – Spielzeitanalyse. Gets what is really known (PC: Steam play time, measured sessions, IGDB averages; stored
// on this device: your progress and the last values from the PC), keeps it with source and date in the journal
// (kind "playtime", compared across devices through the PC) and answers with clearly labelled numbers.

import { client } from "./rpc";
import { listKind, newId, saveEntry, type Entry } from "./journal";
import { norm } from "./journal-logic";
import type { LibraryItem } from "./types";
import {
  daysFor, daysUntil, effectiveDurations, effectivePlayed, estimateRemaining, fmtHours, fmtMinutes, fmtRange, GOAL_LABEL,
  type Durations, type Goal, type Played, type PlaytimeEntry, type PlaytimeIntent,
} from "./playtime";

export const PLAYTIME_KIND = "playtime";
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : "unbekannt");

type Lookup = {
  game: string;
  steamApi?: { minutes: number; updatedAt?: string | null; source: string } | null;
  steamLocal?: { minutes: number; updatedAt?: string | null; source: string } | null;
  measured?: { minutes: number; sessions: number; since?: string | null; updatedAt?: string | null; source: string } | null;
  durations?: { name: string; url: string; mainHours?: number | null; extraHours?: number | null; completeHours?: number | null; count: number; fetchedAt: string; source: string } | null;
  durationsError?: string | null;
};

export function findPlaytime(game: string): Entry<PlaytimeEntry> | undefined {
  const n = norm(game);
  return listKind<PlaytimeEntry>(PLAYTIME_KIND).find((e) => norm(e.data.gameName) === n)
    ?? listKind<PlaytimeEntry>(PLAYTIME_KIND).find((e) => norm(e.data.gameName).includes(n) || n.includes(norm(e.data.gameName)));
}

/** The library's spelling of a game, if it is in the library ("hogwarts legacy" → "Hogwarts Legacy"). */
async function libraryName(game: string, online: boolean): Promise<string> {
  if (!online) return game;
  const lib = await client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }));
  const n = norm(game);
  const hit = (lib.items ?? []).find((i) => norm(i.name) === n) ?? (lib.items ?? []).find((i) => i.kind === "game" && norm(i.name).includes(n) && n.length >= 4);
  return hit?.name ?? game;
}

function save(game: string, patch: Partial<PlaytimeEntry>): Entry<PlaytimeEntry> {
  const prev = findPlaytime(game);
  return saveEntry<PlaytimeEntry>(PLAYTIME_KIND, prev?.id ?? newId(), { ...(prev?.data ?? { gameName: game }), ...patch, gameName: prev?.data.gameName ?? game });
}

export interface PlaytimeReply { text: string; sources: string[]; entryId?: string; ok: boolean | null }

export async function playtimeAnswer(intent: PlaytimeIntent, online: boolean): Promise<PlaytimeReply> {
  const game = await libraryName(intent.game, online);
  if (intent.kind === "progress") {
    const e = save(game, { progress: { percent: intent.percent, at: new Date().toISOString() } });
    const rest = await analysis(game, "main", null, null, online, "remaining");
    return { ...rest, text: `✓ Gemerkt: ${e.data.gameName} – ${intent.percent} % (deine Angabe vom ${day(new Date().toISOString())}).\n\n${rest.text}`, entryId: e.id, ok: true };
  }
  return analysis(game, intent.goal, intent.minutesPerDay, intent.deadline, online, intent.ask);
}

async function analysis(game: string, goal: Goal, minutesPerDay: number | null, deadline: string | null, online: boolean, ask: "total" | "remaining"): Promise<PlaytimeReply> {
  const notes: string[] = [];
  let source: "pc" | "stored" = "stored";
  let lookupError: string | null = null;
  let measuredLine: string | null = null;
  if (online) {
    try {
      const r = await client.call<Lookup>("playtime.lookup", { game });
      source = "pc";
      const played: Played | null = r.steamLocal ? { minutes: r.steamLocal.minutes, source: r.steamLocal.source, updatedAt: r.steamLocal.updatedAt }
        : r.steamApi ? { minutes: r.steamApi.minutes, source: r.steamApi.source, updatedAt: r.steamApi.updatedAt }
        : r.measured ? { minutes: r.measured.minutes, source: r.measured.source, updatedAt: r.measured.updatedAt } : null;
      if (r.measured && played && played.source !== r.measured.source) measuredLine = `Davon vom Begleiter gemessen: ${fmtMinutes(r.measured.minutes)} in ${r.measured.sessions} Sitzungen [gemessen]`;
      const durations: Durations | null = r.durations ? { mainHours: r.durations.mainHours, extraHours: r.durations.extraHours, completeHours: r.durations.completeHours, count: r.durations.count, source: r.durations.source, url: r.durations.url, fetchedAt: r.durations.fetchedAt } : null;
      const prev = findPlaytime(game)?.data;
      save(game, { played: played ?? prev?.played ?? null, durations: durations ?? prev?.durations ?? null });
      if (r.durationsError === "not-configured" && !durations) notes.push("Durchschnittsdauern: Am PC unter Spiele-Journal → Spielzeit den kostenlosen IGDB-Zugang eintragen – oder dort eine eigene Angabe machen.");
      else if (r.durationsError === "not-found") notes.push(`IGDB kennt „${game}“ nicht eindeutig – keine Durchschnittsdauer. Eine eigene Angabe geht unter Spiele-Journal → Spielzeit.`);
      else if (r.durationsError) notes.push(`Durchschnittsdauer nicht abrufbar: ${r.durationsError}`);
      if (!played) notes.push("Für dieses Spiel kennt der PC keine Spielzeit: nicht in deinem Steam-Konto bzw. auf diesem PC, und der Begleiter hat keine Sitzung gemessen. Du kannst sie unter Spiele-Journal → Spielzeit selbst eintragen.");
    } catch (e) {
      lookupError = (e as Error).message;
    }
  }
  const entry = findPlaytime(game);
  const data: PlaytimeEntry = entry?.data ?? { gameName: game };
  if (!online) notes.unshift(entry ? "Der PC ist nicht verbunden – das sind die gespeicherten Werte (jeweils mit Datum). PC-Daten werden beim nächsten Verbinden aktualisiert." : "Der PC ist nicht verbunden. Für dieses Spiel ist noch nichts gespeichert – Spielzeit (Steam/Begleiter) und Durchschnittsdauer (IGDB) kann ich erst mit dem PC abrufen.");
  else if (lookupError) notes.unshift(`Die Verbindung zum PC ist während der Anfrage abgebrochen (${lookupError}) – das sind die gespeicherten Werte.`);

  const d = effectiveDurations(data);
  const played = effectivePlayed(data);
  const lines: string[] = [`JARVIS – Spielzeitanalyse: ${data.gameName}`];
  lines.push(played
    ? `• Bisher gespielt: ${fmtMinutes(played.minutes)} [${played.source === "deine Angabe" ? "deine Angabe" : `gemessen · ${played.source}`}${played.updatedAt ? ` · Stand ${day(played.updatedAt)}` : ""}]`
    : "• Bisher gespielt: nicht bekannt");
  if (measuredLine) lines.push(`  ${measuredLine}`);
  lines.push(data.progress ? `• Fortschritt: ${data.progress.percent} % [deine Angabe vom ${day(data.progress.at)}]` : `• Fortschritt: nicht bekannt – sag z. B. „Ich bin bei 40 % in ${data.gameName}“`);
  if (d) {
    const parts = [d.mainHours ? `Hauptstory ${fmtHours(d.mainHours)}` : "", d.extraHours ? `mit Nebenaufgaben ${fmtHours(d.extraHours)}` : "", d.completeHours ? `100 % ${fmtHours(d.completeHours)}` : ""].filter(Boolean);
    lines.push(`• Durchschnitt: ${parts.join(" · ")} [${d.own ? "deine Angabe" : `recherchiert · ${d.source}${d.count ? `, ${d.count} Spieler` : ""}${d.fetchedAt ? ` · Stand ${day(d.fetchedAt)}` : ""}`}]`);
  } else lines.push("• Durchschnittsdauer: nicht bekannt");

  if (ask === "remaining") {
    const est = estimateRemaining(data, goal);
    if (est.range && est.kind !== "done") {
      lines.push(`• Geschätzt noch (${GOAL_LABEL[goal]}): ${fmtRange(est.range)} [Schätzung${est.kind === "rough" ? ", grob" : est.kind === "total" ? " = Gesamtdauer" : ""}]`);
      const per = minutesPerDay ?? data.minutesPerDay ?? null;
      const plans = per ? [per] : [30, 60];
      lines.push(`• ${plans.map((m) => { const [a, b] = daysFor(est.range!, m); return `bei ${fmtMinutes(m)} pro Tag: ${a === b ? a : `${a} – ${b}`} Tage`; }).join(" · ")}`);
      const until = deadline ? daysUntil(deadline) : null;
      if (until) {
        const need = Math.ceil((est.range[1] * 60) / until.days);
        const needLo = Math.ceil((est.range[0] * 60) / until.days);
        lines.push(`• Bis ${until.label} (${until.days} Tag${until.days > 1 ? "e" : ""} inkl. heute): etwa ${fmtMinutes(needLo)} – ${fmtMinutes(need)} pro Tag nötig${need > 6 * 60 ? " – das ist sehr viel" : ""}.`);
        const budget = minutesPerDay ?? data.minutesPerDay ?? null;
        if (budget) lines.push(`• Mit ${fmtMinutes(budget)} pro Tag: ${budget >= need ? "ja, das reicht voraussichtlich" : budget >= needLo ? "knapp – das kann reichen, sicher ist es nicht" : "eher nicht"} [Schätzung].`);
        else lines.push("• Ob es reicht, hängt davon ab, wie viel du pro Tag spielst – sag z. B. „… bis Freitag bei 1 Stunde pro Tag“.");
      }
    } else if (est.kind === "done") lines.push("• Laut deiner Angabe hast du das schon geschafft.");
    else lines.push(`• Geschätzt noch: lässt sich nicht seriös sagen – es fehlt: ${est.missing.map((m) => ({ progress: "dein Fortschritt", played: "deine Spielzeit", durations: "eine Durchschnittsdauer" })[m]).join(", ")}.`);
    notes.push(...est.notes);
  }
  const sources = [d && !d.own && d.url ? d.url : "", played && played.source !== "deine Angabe" ? played.source : ""].filter(Boolean);
  const text = [...lines, "", ...notes.map((n) => "ℹ " + n), sources.length ? `\nQuellen: ${sources.join(" · ")}` : ""].filter((x) => x !== "").join("\n");
  return { text, sources: sources.length ? sources : ["JARVIS"], entryId: findPlaytime(game)?.id, ok: source === "pc" ? true : null };
}

/** "Vom PC aktualisieren" on the Spielzeit page: the same lookup, stored with source and date. Null when done, else why not. */
export async function refreshPlaytime(game: string): Promise<string | null> {
  try {
    const r = await client.call<Lookup>("playtime.lookup", { game, refresh: true });
    const played: Played | null = r.steamLocal ? { minutes: r.steamLocal.minutes, source: r.steamLocal.source, updatedAt: r.steamLocal.updatedAt }
      : r.steamApi ? { minutes: r.steamApi.minutes, source: r.steamApi.source, updatedAt: r.steamApi.updatedAt }
      : r.measured ? { minutes: r.measured.minutes, source: r.measured.source, updatedAt: r.measured.updatedAt } : null;
    const durations: Durations | null = r.durations ? { mainHours: r.durations.mainHours, extraHours: r.durations.extraHours, completeHours: r.durations.completeHours, count: r.durations.count, source: r.durations.source, url: r.durations.url, fetchedAt: r.durations.fetchedAt } : null;
    const prev = findPlaytime(game)?.data;
    save(game, { played: played ?? prev?.played ?? null, durations: durations ?? prev?.durations ?? null });
    const missing = [!played ? "keine Spielzeit gefunden" : "", r.durationsError === "not-configured" ? "IGDB-Zugang fehlt" : r.durationsError === "not-found" ? "IGDB kennt das Spiel nicht eindeutig" : r.durationsError ?? ""].filter(Boolean);
    return missing.length ? missing.join(" · ") : null;
  } catch (e) { return (e as Error).message; }
}

export function savePlaytime(game: string, patch: Partial<PlaytimeEntry>) { return save(game, patch); }
