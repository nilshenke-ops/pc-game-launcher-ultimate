// Release/DLC calendar (F12) and seasons/events (F17): own entries with source and status, a month view of what is
// coming, past entries kept apart, and "add to calendar" with a reminder (the existing gaming calendar does the
// reminding – on the PC and, without it, in this browser).

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck, CalendarDays, CalendarPlus, Flag, Rocket, Star } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { toast, useCan, useConn } from "../lib/hooks";
import { useJournal, type Entry } from "../lib/journal";
import type { Data } from "../lib/collections";
import { GAMEEVENT, RELEASE } from "../lib/collection-schemas";
import { newEventId, REMINDERS, type CalendarEvent } from "../lib/calendar";
import { daysUntil, eventState, releaseDay, releaseGroups, timeIn, zonedToUtc, type EventState } from "../lib/infos";
import { CollectionView } from "./collection-view";
import { Button, Card } from "./ui";

const TYPE_LABEL: Record<string, string> = { game: "Spiel", dlc: "DLC / Erweiterung", update: "Großes Update", season: "Saison", other: "Sonstiges", event: "Event", pass: "Battle Pass", tournament: "Turnier", maintenance: "Wartung" };

function monthName(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function StatusBadge({ status }: { status: unknown }) {
  if (status === "confirmed") return <span className="badge ok">{t("Bestätigt")}</span>;
  if (status === "window") return <span className="badge warn">{t("Nur Zeitraum")}</span>;
  return <span className="badge warn">{t("Unbestätigt")}</span>;
}

/** Saves one or more calendar dates and remembers their ids on the entry (so a second tap updates instead of doubling). */
function CalendarButton({ make, ids, onIds }: { make: (remind: number | null) => CalendarEvent[]; ids: string[]; onIds: (ids: string[]) => void }) {
  const can = useCan("manage");
  const conn = useConn();
  const [remind, setRemind] = useState<number | null>(1440);
  const [busy, setBusy] = useState(false);
  if (!can) return null;
  const save = async () => {
    setBusy(true);
    try {
      const evs = make(remind).map((e, i) => ({ ...e, id: ids[i] ?? e.id }));
      for (const e of evs) await client.call("calendar.save", e);
      onIds(evs.map((e) => e.id));
      toast(conn.auth === "ok" ? t("Im Kalender gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      <select className="input" style={{ maxWidth: 200 }} aria-label={t("Erinnerung")} value={remind == null ? "" : String(remind)} onChange={(e) => setRemind(e.target.value === "" ? null : Number(e.target.value))}>
        {REMINDERS.map(([v, l]) => <option key={String(v)} value={v == null ? "" : String(v)}>{t("Erinnerung")}: {l()}</option>)}
      </select>
      <Button size="sm" icon={ids.length ? <CalendarCheck size={15} /> : <CalendarPlus size={15} />} busy={busy} onClick={save}>{ids.length ? t("Im Kalender aktualisieren") : t("In den Kalender")}</Button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ F12

function releaseWhen(d: Data) {
  const day = releaseDay(d);
  if (!day) return String(d.window ?? t("Termin offen"));
  const n = daysUntil(day);
  const date = day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  return n === 0 ? `${date} · ${t("heute")}` : n > 0 ? `${date} · ${t("in {n} Tagen", { n })}` : date;
}

function ReleaseRow({ e, onOpen }: { e: Entry<Data>; onOpen: () => void }) {
  const d = e.data;
  return (
    <button type="button" className="list-item" onClick={onOpen}>
      <Rocket size={16} />
      <div className="grow"><div className="title">{String(d.title)}{d.favorite ? " ★" : ""}</div><div className="sub">{[t(TYPE_LABEL[String(d.type)] ?? ""), releaseWhen(d), ((d.platforms as string[]) ?? []).join(", ")].filter(Boolean).join(" · ")}</div></div>
      <StatusBadge status={d.dateStatus} />
    </button>
  );
}

export function ReleasesView({ focus }: { focus: string | null }) {
  const list = useJournal<Data>(RELEASE.kind);
  const [, setParams] = useSearchParams();
  const [onlyFav, setOnlyFav] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const shown = list.filter((e) => !e.data.archived && (!onlyFav || e.data.favorite));
  const g = useMemo(() => releaseGroups(shown), [shown]);
  const open = (id: string) => setParams({ tab: "releases", id }, { replace: true });
  return (
    <>
      {list.length > 0 && (
        <Card title={t("Was kommt")} icon={<CalendarDays size={18} />} actions={<button type="button" className={`chip ${onlyFav ? "on" : ""}`} onClick={() => setOnlyFav(!onlyFav)}><Star size={13} />{t("Favoriten")}</button>}>
          <div className="stack">
            {g.months.length === 0 && g.undated.length === 0 && <span className="small muted">{t("Nichts Kommendes eingetragen.")}</span>}
            {g.months.map(([k, l]) => <div key={k} className="stack-xs"><b className="small">{monthName(k)}</b><div className="list">{l.map((e) => <ReleaseRow key={e.id} e={e} onOpen={() => open(e.id)} />)}</div></div>)}
            {g.undated.length > 0 && <div className="stack-xs"><b className="small">{t("Ohne genaues Datum")}</b><div className="list">{g.undated.map((e) => <ReleaseRow key={e.id} e={e} onOpen={() => open(e.id)} />)}</div></div>}
            {g.past.length > 0 && <div className="stack-xs">
              <button type="button" className="chip" onClick={() => setShowPast(!showPast)}>{t("Bereits erschienen")} ({g.past.length})</button>
              {showPast && <div className="list">{g.past.map((e) => <ReleaseRow key={e.id} e={e} onOpen={() => open(e.id)} />)}</div>}
            </div>}
          </div>
        </Card>
      )}
      <CollectionView key={`r${focus ?? ""}`} schema={RELEASE} icon={<Rocket size={18} />} focus={focus}
        intro={t("Eigene Liste kommender Spiele, DLCs und Updates. „Bestätigt“ nur mit offizieller Quelle; alles andere bleibt sichtbar als unbestätigt markiert. Nichts wird automatisch eingetragen.")}
        cardExtra={(e) => <span className="row" style={{ gap: 4 }}><StatusBadge status={e.data.dateStatus} /><span className="tiny muted">{releaseWhen(e.data)}</span></span>}
        detail={(e, save) => {
          const day = releaseDay(e.data);
          return (
            <div className="stack-sm">
              <div className="row" style={{ gap: 8 }}><StatusBadge status={e.data.dateStatus} /><span className="small">{releaseWhen(e.data)}</span></div>
              {e.data.dateStatus !== "confirmed" && <span className="tiny muted">{t("Termin nicht offiziell bestätigt – kann sich noch ändern.")}</span>}
              {day && daysUntil(day) >= 0 && <CalendarButton ids={e.data.calendarId ? [String(e.data.calendarId)] : []} onIds={(ids) => save({ ...e.data, calendarId: ids[0] })}
                make={(remind) => [{ id: newEventId(), title: `${t("Release")}: ${String(e.data.title)}`.slice(0, 80), start: day.toISOString(), durationMinutes: 1440, allDay: true, repeat: "none", remindMinutes: remind, note: [e.data.dateStatus === "confirmed" ? t("Bestätigt") : t("Unbestätigt"), e.data.source].filter(Boolean).join(" · ").slice(0, 500) || null }]} />}
              <WishLink title={String(e.data.title)} />
            </div>
          );
        }} />
    </>
  );
}

/** Link to the wish list: the same title is recognised, otherwise one tap adds it there. */
function WishLink({ title }: { title: string }) {
  const can = useCan("manage");
  const [busy, setBusy] = useState(false);
  if (!can) return null;
  const add = async () => {
    setBusy(true);
    try { await client.call("deals.save", { id: "wish_" + Math.random().toString(36).slice(2, 12), title: title.slice(0, 80), steamAppId: null, targetCents: null }); toast(t("Auf die Wunschliste gesetzt"), "success"); }
    catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  return <div><Button size="sm" variant="ghost" icon={<Star size={14} />} busy={busy} onClick={add}>{t("Auf die Wunschliste")}</Button></div>;
}

// ------------------------------------------------------------------------------------------ F17

const STATE_LABEL: Record<EventState, string> = { upcoming: "Kommt", running: "Läuft", started: "Begonnen (Ende unbekannt)", ended: "Vorbei", unknown: "Zeit unklar" };
const STATE_CLASS: Record<EventState, string> = { upcoming: "accent", running: "ok", started: "warn", ended: "", unknown: "warn" };

export function eventTimes(d: Data) {
  const tz = typeof d.tz === "string" && d.tz ? d.tz : undefined;
  return { tz, start: zonedToUtc(d.start as string, tz), end: zonedToUtc(d.end as string, tz) };
}

function EventWhen({ d }: { d: Data }) {
  const { tz, start, end } = eventTimes(d);
  if (!start) return <span className="small muted">{t("Zeit unklar")}</span>;
  return (
    <div className="stack-xs small">
      <span>{t("Beginn")}: {timeIn(start, undefined)}{end ? ` – ${t("Ende")}: ${timeIn(end, undefined)}` : ""}</span>
      {tz && <span className="tiny muted">{t("Laut Ankündigung ({z})", { z: tz })}: {timeIn(start, tz)}{end ? ` – ${timeIn(end, tz)}` : ""}</span>}
    </div>
  );
}

export function EventsView({ focus }: { focus: string | null }) {
  const list = useJournal<Data>(GAMEEVENT.kind);
  const [, setParams] = useSearchParams();
  const now = new Date();
  const active = list.filter((e) => !e.data.archived).map((e) => ({ e, ...eventTimes(e.data) })).map((x) => ({ ...x, state: eventState(x.start, x.end, now) }));
  const current = active.filter((x) => x.state === "running" || x.state === "started" || x.state === "upcoming").sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
  const ended = active.filter((x) => x.state === "ended").length;
  return (
    <>
      {list.length > 0 && (
        <Card title={t("Jetzt und demnächst")} icon={<Flag size={18} />} meta={ended ? t("{n} vorbei", { n: ended }) : undefined}>
          {current.length === 0 ? <span className="small muted">{t("Nichts läuft gerade oder kommt demnächst.")}</span> : (
            <div className="list">{current.map((x) => (
              <button key={x.e.id} type="button" className="list-item" onClick={() => setParams({ tab: "events", id: x.e.id }, { replace: true })}>
                <div className="grow"><div className="title">{String(x.e.data.title)}{x.e.data.favorite ? " ★" : ""}</div><div className="sub">{x.start ? timeIn(x.start, undefined) : ""}{x.end ? ` – ${timeIn(x.end, undefined)}` : ""}</div></div>
                <span className={`badge ${STATE_CLASS[x.state]}`}>{t(STATE_LABEL[x.state])}</span>
                {x.e.data.status !== "confirmed" && <span className="badge warn">{t("Unbestätigt")}</span>}
              </button>
            ))}</div>
          )}
        </Card>
      )}
      <CollectionView key={`e${focus ?? ""}`} schema={GAMEEVENT} icon={<Flag size={18} />} focus={focus}
        intro={t("Saisons, Events und Battle Passes, die du selbst einträgst – mit der Zeitzone aus der Ankündigung. Gezeigt wird immer auch deine Ortszeit. Ohne Ende wird nicht behauptet, dass etwas noch läuft.")}
        cardExtra={(e) => { const x = eventTimes(e.data); const s = eventState(x.start, x.end); return <span className="row" style={{ gap: 4 }}><span className={`badge ${STATE_CLASS[s]}`}>{t(STATE_LABEL[s])}</span>{e.data.status !== "confirmed" && <span className="badge warn">{t("Unbestätigt")}</span>}</span>; }}
        detail={(e, save) => {
          const x = eventTimes(e.data);
          const s = eventState(x.start, x.end);
          const title = String(e.data.title);
          return (
            <div className="stack-sm">
              <div className="row" style={{ gap: 6 }}><span className={`badge ${STATE_CLASS[s]}`}>{t(STATE_LABEL[s])}</span><StatusBadge status={e.data.status} /></div>
              <EventWhen d={e.data} />
              {x.start && s !== "ended" && <CalendarButton ids={(e.data.calendarIds as string[] | undefined) ?? []} onIds={(ids) => save({ ...e.data, calendarIds: ids })}
                make={(remind) => [
                  ...(x.start! > new Date() ? [{ id: newEventId(), title: `${t("Start")}: ${title}`.slice(0, 80), start: x.start!.toISOString(), durationMinutes: 60, allDay: false, repeat: "none" as const, remindMinutes: remind, note: (e.data.source as string | undefined) ?? null }] : []),
                  ...(x.end ? [{ id: newEventId(), title: `${t("Endet")}: ${title}`.slice(0, 80), start: new Date(x.end.getTime() - 3600_000).toISOString(), durationMinutes: 60, allDay: false, repeat: "none" as const, remindMinutes: remind, note: (e.data.source as string | undefined) ?? null }] : []),
                ]} />}
            </div>
          );
        }} />
    </>
  );
}
