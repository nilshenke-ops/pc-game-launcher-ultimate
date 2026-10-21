import { useMemo, useRef, useState } from "react";
import { BellRing, CalendarDays, ChevronLeft, ChevronRight, Download, Play, Plus, Trash2, Upload } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import type { LibraryItem } from "../lib/types";
import { inMonth, newEventId, parseIcs, REMINDERS, REPEATS, sameDay, toIcs, upcoming, whenText, type CalendarEvent, type Occurrence, type Repeat } from "../lib/calendar";
import { Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";

const COLORS = ["#22d3ee", "#a78bfa", "#f472b6", "#f59e0b", "#34d399", "#f87171"];
const pad = (n: number) => String(n).padStart(2, "0");
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function save(text: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Gaming calendar: month view, upcoming dates, reminders. Works without the PC (changes are sent when it is connected). */
export default function CalendarPage() {
  const q = useRpc<{ events: CalendarEvent[] }>("calendar.list", {}, ["calendar"]);
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const canManage = useCan("manage");
  const conn = useConn();
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [day, setDay] = useState<Date>(now);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const events = q.data?.events ?? [];
  const items = lib.data?.items ?? [];
  const occ = useMemo(() => inMonth(events, month.y, month.m), [events, month]);
  const next = useMemo(() => upcoming(events, new Date(), 60, 8), [events]);
  const dayOcc = occ.filter((o) => sameDay(o.start, day) || (o.start < day && o.end > day));

  const first = new Date(month.y, month.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.y, month.m, i + 1))];
  const move = (d: number) => setMonth(({ y, m }) => { const x = new Date(y, m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; });

  const create = (on = day) => {
    const start = new Date(on); start.setHours(20, 0, 0, 0);
    // 20:00 already over today: the next full hour instead of a time in the past.
    if (start.getTime() < Date.now()) { const next = new Date(); next.setMinutes(0, 0, 0); next.setHours(next.getHours() + 1); if (next.toDateString() === start.toDateString() || start.toDateString() === new Date().toDateString()) start.setTime(next.getTime()); }
    setEditing({ id: newEventId(), title: "", start: start.toISOString(), durationMinutes: 120, allDay: false, repeat: "none", remindMinutes: 15, color: COLORS[0] });
  };
  const importFile = async (f: File) => {
    const list = parseIcs(await f.text());
    if (!list.length) { toast(t("In der Datei wurden keine Termine gefunden."), "error"); return; }
    for (const e of list) await client.call("calendar.save", e).catch((err: Error) => toast(err.message, "error"));
    toast(t("{n} Termine übernommen", { n: list.length }), "success");
  };
  const allowNotifications = async () => {
    if (!("Notification" in window)) { toast(t("Dieser Browser kann keine Hinweise anzeigen."), "error"); return; }
    const r = await Notification.requestPermission();
    toast(r === "granted" ? t("Erinnerungen auf diesem Gerät sind an.") : t("Hinweise wurden nicht erlaubt."), r === "granted" ? "success" : "info");
  };
  const launch = (id: string) => client.call<{ ok?: boolean; message?: string }>("library.launch", { id })
    .then((r) => toast(r?.ok === false ? r.message ?? t("Start fehlgeschlagen") : t("Wird am PC gestartet"), r?.ok === false ? "error" : "success"), (e: Error) => toast(e.message, "error"));

  const Row = ({ o }: { o: Occurrence }) => {
    const item = o.event.itemId ? items.find((i) => i.id === o.event.itemId) : undefined;
    return (
      <div className="cal-row" role="button" tabIndex={0} onClick={() => canManage && setEditing(structuredClone(o.event))} onKeyDown={(e) => { if (e.key === "Enter" && canManage) setEditing(structuredClone(o.event)); }}>
        <span className="cal-bar" style={{ background: o.event.color ?? "var(--primary)" }} />
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ellipsis" style={{ display: "block" }}>{o.event.title}</b>
          <span className="small muted">{whenText(o)}{o.event.repeat !== "none" ? " · " + REPEATS.find((r) => r[0] === o.event.repeat)![1]() : ""}{o.event.remindMinutes != null ? " · 🔔" : ""}{item ? " · " + item.name : ""}</span>
        </div>
        {item && <Button size="sm" variant="primary" icon={<Play size={14} />} aria-label={t("{name} starten", { name: item.name })} disabled={conn.auth !== "ok"}
          onClick={(e) => { e.stopPropagation(); void launch(item.id); }} />}
      </div>
    );
  };

  return (
    <>
      <PageHead eyebrow={t("Dashboard")} title={t("Kalender")}
        text={t("Raids, Turniere, LAN-Partys und Releases – mit Erinnerung. Funktioniert auch ohne PC; gespeichert wird auf dem PC, gleich auf allen Geräten.")}
        actions={canManage && <Button variant="primary" icon={<Plus size={17} />} onClick={() => create()}>{t("Neuer Termin")}</Button>} />
      <Loadable loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="cal-layout">
          <Card className="cal-month">
            <div className="row nowrap" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <Button size="sm" variant="ghost" icon={<ChevronLeft size={18} />} aria-label={t("Vorheriger Monat")} onClick={() => move(-1)} />
              <b>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
              <Button size="sm" variant="ghost" icon={<ChevronRight size={18} />} aria-label={t("Nächster Monat")} onClick={() => move(1)} />
            </div>
            <div className="cal-grid">
              {[t("Mo"), t("Di"), t("Mi"), t("Do"), t("Fr"), t("Sa"), t("So")].map((d) => <span key={d} className="cal-wd">{d}</span>)}
              {cells.map((d, i) => d ? (
                <button key={i} type="button" className={`cal-day ${sameDay(d, day) ? "on" : ""} ${sameDay(d, now) ? "today" : ""}`} onClick={() => setDay(d)} onDoubleClick={() => canManage && create(d)}
                  aria-label={d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}>
                  <span>{d.getDate()}</span>
                  <span className="cal-dots">{occ.filter((o) => sameDay(o.start, d)).slice(0, 3).map((o, j) => <i key={j} style={{ background: o.event.color ?? "var(--primary)" }} />)}</span>
                </button>
              ) : <span key={i} />)}
            </div>
          </Card>
          <div className="stack">
            <Card title={day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              actions={canManage && <Button size="sm" icon={<Plus size={15} />} onClick={() => create(day)}>{t("Termin")}</Button>}>
              {dayOcc.length ? dayOcc.map((o) => <Row key={o.event.id + o.start.toISOString()} o={o} />) : <p className="small muted" style={{ margin: 0 }}>{t("Keine Termine an diesem Tag.")}</p>}
            </Card>
            <Card title={t("Demnächst")} icon={<CalendarDays size={18} />}>
              {next.length ? next.map((o) => <Row key={o.event.id + o.start.toISOString()} o={o} />)
                : <Empty icon={<CalendarDays size={26} />} title={t("Noch keine Termine")} text={t("Lege einen Termin an – z. B. den Raid am Freitag oder ein Release.")} />}
            </Card>
            <Card title={t("Mehr")}>
              <div className="row">
                <Button size="sm" icon={<BellRing size={15} />} onClick={allowNotifications}>{t("Erinnerungen auf diesem Gerät")}</Button>
                <Button size="sm" icon={<Download size={15} />} disabled={!events.length} onClick={() => save(toIcs(events), "nexus-kalender.ics")}>{t("Exportieren (.ics)")}</Button>
                {canManage && <Button size="sm" icon={<Upload size={15} />} onClick={() => file.current?.click()}>{t("Importieren (.ics)")}</Button>}
                <input ref={file} type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
              </div>
              <p className="tiny muted" style={{ marginBottom: 0 }}>{t("Erinnerungen: Der PC meldet sie als Benachrichtigung (auch in der App). Auf diesem Gerät erscheinen sie, solange die App geöffnet ist – auch ohne PC. Export/Import für Google-, Apple- oder Outlook-Kalender.")}</p>
            </Card>
          </div>
        </div>
      </Loadable>
      {editing && <EventDialog value={editing} items={items} libLoaded={!!lib.data} isNew={!events.some((e) => e.id === editing.id)} onClose={() => setEditing(null)} />}
    </>
  );
}

function EventDialog({ value, items, libLoaded, isNew, onClose }: { value: CalendarEvent; items: LibraryItem[]; libLoaded: boolean; isNew: boolean; onClose: () => void }) {
  const [e, setE] = useState(value);
  const start = new Date(e.start);
  const set = (x: Partial<CalendarEvent>) => setE((o) => ({ ...o, ...x }));
  const setDate = (date: string, time: string) => {
    const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
    if (!y || !m || !d) return;
    set({ start: new Date(y, m - 1, d, e.allDay ? 0 : h || 0, e.allDay ? 0 : mi || 0).toISOString() });
  };
  const submit = async () => {
    if (!e.title.trim()) { toast(t("Bitte einen Titel eingeben."), "error"); return; }
    const ev = { ...e, title: e.title.trim(), durationMinutes: e.allDay ? 0 : e.durationMinutes, start: e.allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString() : e.start };
    try {
      await client.call("calendar.save", ev);
      if (client.status.phase === "online") toast(t("Termin gespeichert"), "success"); // offline the queue already says so
      onClose();
    } catch (err) { toast((err as Error).message, "error"); }
  };
  const remove = async () => {
    if (!(await confirmDialog(t("Termin löschen?"), e.title, { danger: true, ok: t("Löschen") }))) return;
    await client.call("calendar.remove", { id: e.id }).then(onClose, (err: Error) => toast(err.message, "error"));
  };
  return (
    <Modal title={isNew ? t("Neuer Termin") : t("Termin bearbeiten")} onClose={onClose} footer={<>
      {!isNew && <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove} style={{ marginRight: "auto" }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={submit}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Titel")}><input className="input" value={e.title} maxLength={80} autoFocus placeholder={t("z. B. Raid mit der Gilde")} onChange={(x) => set({ title: x.target.value })} /></Field>
        <Switch checked={e.allDay} onChange={(allDay) => set({ allDay })} label={t("Ganztägig")} />
        <div className="grid-2">
          <Field label={t("Datum")}><input className="input" type="date" value={dateValue(start)} onChange={(x) => setDate(x.target.value, timeValue(start))} /></Field>
          {!e.allDay && <Field label={t("Uhrzeit")}><input className="input" type="time" value={timeValue(start)} onChange={(x) => setDate(dateValue(start), x.target.value)} /></Field>}
        </div>
        {!e.allDay && <Field label={t("Dauer")}>
          <select className="input" value={e.durationMinutes} onChange={(x) => set({ durationMinutes: Number(x.target.value) })}>
            {[[0, t("Ohne Ende")], [30, "30 min"], [60, "1 h"], [90, "1,5 h"], [120, "2 h"], [180, "3 h"], [240, "4 h"], [360, "6 h"], [720, "12 h"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {![0, 30, 60, 90, 120, 180, 240, 360, 720].includes(e.durationMinutes) && <option value={e.durationMinutes}>{e.durationMinutes} min</option>}
          </select></Field>}
        <div className="grid-2">
          <Field label={t("Wiederholen")}><select className="input" value={e.repeat} onChange={(x) => set({ repeat: x.target.value as Repeat })}>{REPEATS.map(([v, l]) => <option key={v} value={v}>{l()}</option>)}</select></Field>
          <Field label={t("Erinnerung")}><select className="input" value={e.remindMinutes ?? ""} onChange={(x) => set({ remindMinutes: x.target.value === "" ? null : Number(x.target.value) })}>
            {REMINDERS.map(([v, l]) => <option key={String(v)} value={v ?? ""}>{l()}</option>)}</select></Field>
        </div>
        {e.repeat !== "none" && <Field label={t("Wiederholen bis (optional)")}><input className="input" type="date" value={e.repeatUntil ? dateValue(new Date(e.repeatUntil)) : ""}
          onChange={(x) => { const [y, m, d] = x.target.value.split("-").map(Number); set({ repeatUntil: y ? new Date(y, m - 1, d, 23, 59).toISOString() : null }); }} /></Field>}
        <Field label={t("Spiel (optional)")} hint={t("Im Termin erscheint ein Start-Knopf.")}>
          <select className="input" value={e.itemId ?? ""} onChange={(x) => set({ itemId: x.target.value || null })}>
            <option value="">{items.length ? t("Kein Spiel") : libLoaded ? t("Noch keine Spiele in der Bibliothek") : t("Noch keine Spiele – sie erscheinen, sobald der PC einmal verbunden war")}</option>
            {[...items].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></Field>
        <Field label={t("Farbe")}><div className="row">{COLORS.map((c) => <button key={c} type="button" className={`color-dot ${e.color === c ? "on" : ""}`} style={{ background: c }} aria-label={c} aria-pressed={e.color === c} onClick={() => set({ color: c })} />)}</div></Field>
        <Field label={t("Notiz")}><textarea className="input" rows={2} maxLength={500} value={e.note ?? ""} onChange={(x) => set({ note: x.target.value || null })} /></Field>
      </div>
    </Modal>
  );
}
