// Shared parts of the collection pages (journal, wiki): game choice, tags, pictures, links between entries, the
// sync status and export/import. Everything works without the PC; only pictures not yet on this device need it.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CloudOff, Download, ImagePlus, Link2, Loader2, RefreshCw, Search, Upload, X, Check, HardDrive } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useConn, useRpc } from "../lib/hooks";
import { dateTime } from "../lib/format";
import type { LibraryItem } from "../lib/types";
import { addImage, allEntries, downloadText, exportJournal, getEntry, imageUrl, importJournal, saveEntry, syncJournal, useJournalSync, useJournalVersion, type Entry } from "../lib/journal";
import { cleanTags, entryTitle, KIND_LABEL, KIND_PATH, matchesQuery, type GameRef } from "../lib/journal-logic";
import { Banner, Button, Field, Modal, confirmDialog } from "./ui";

// ------------------------------------------------------------------------------------------ games

/** Games of the library (last known list while the PC is off). Empty when it was never loaded. */
export function useGames(): { id: string; name: string }[] {
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  return useMemo(() => (lib.data?.items ?? []).filter((i) => i.kind === "game").map((i) => ({ id: i.id, name: i.name })).sort((a, b) => a.name.localeCompare(b.name)), [lib.data]);
}

export function gameLabel(g: GameRef, games: { id: string; name: string }[]) {
  return (g.gameId && games.find((x) => x.id === g.gameId)?.name) || g.gameName || "";
}

/** A game of the library, or any name (for games not in the library). */
export function GamePicker({ value, onChange, games, label = t("Spiel"), allowNone = true }: { value: GameRef; onChange: (g: GameRef) => void; games: { id: string; name: string }[]; label?: string; allowNone?: boolean }) {
  const [free, setFree] = useState(!value.gameId && !!value.gameName);
  return (
    <Field label={label} hint={games.length ? undefined : t("Die Spieleliste kommt vom PC – solange sie fehlt, einfach den Namen eintippen.")}>
      <div className="stack-sm">
        {games.length > 0 && !free && (
          <select className="input" value={value.gameId ?? ""} onChange={(e) => {
            if (e.target.value === "__free") { setFree(true); onChange({ gameId: null, gameName: value.gameName ?? "" }); return; }
            const g = games.find((x) => x.id === e.target.value);
            onChange(g ? { gameId: g.id, gameName: g.name } : { gameId: null, gameName: null });
          }}>
            {allowNone && <option value="">{t("Kein bestimmtes Spiel")}</option>}
            {!allowNone && !value.gameId && <option value="">{t("Spiel wählen …")}</option>}
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__free">{t("Anderes Spiel (Name eintippen) …")}</option>
          </select>
        )}
        {(free || !games.length) && (
          <div className="row nowrap">
            <input className="input grow" value={value.gameName ?? ""} maxLength={100} placeholder={t("Name des Spiels")} onChange={(e) => onChange({ gameId: null, gameName: e.target.value })} />
            {games.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setFree(false); onChange({ gameId: null, gameName: null }); }}>{t("Aus Liste")}</Button>}
          </div>
        )}
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------------------------------ tags

export function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState("");
  const add = (s: string) => { const v = cleanTags([...value, ...s.split(",")]); onChange(v); setText(""); };
  const listId = useMemo(() => "tags-" + Math.random().toString(36).slice(2), []);
  return (
    <Field label={t("Tags")} hint={t("Mit Enter oder Komma hinzufügen")}>
      <div className="stack-sm">
        {value.length > 0 && <div className="row" style={{ gap: 6 }}>{value.map((tg) => (
          <span key={tg} className="chip on">{tg}<button type="button" className="chip-x" aria-label={t("Tag {t} entfernen", { t: tg })} onClick={() => onChange(value.filter((x) => x !== tg))}><X size={13} /></button></span>
        ))}</div>}
        <input className="input" list={listId} value={text} maxLength={40} placeholder={t("z. B. Nether, Boss, Seltene Beute")}
          onChange={(e) => { if (e.target.value.endsWith(",")) add(e.target.value); else setText(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); add(text); } }}
          onBlur={() => { if (text.trim()) add(text); }} />
        <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).slice(0, 50).map((s) => <option key={s} value={s} />)}</datalist>
      </div>
    </Field>
  );
}

// ------------------------------------------------------------------------------------------ pictures

export function JImage({ id, alt = "", className = "", onClick }: { id: string; alt?: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const conn = useConn();
  useEffect(() => { let on = true; void imageUrl(id).then((u) => { if (on) setUrl(u); }); return () => { on = false; }; }, [id, conn.auth]);
  if (url === undefined) return <div className={`j-img loading ${className}`} aria-busy><Loader2 size={16} className="spin" /></div>;
  if (url === null) return <div className={`j-img missing ${className}`} title={t("Bild ist nur auf einem anderen Gerät oder dem PC – erscheint, sobald der PC verbunden ist.")}><CloudOff size={16} /></div>;
  return <img src={url} alt={alt} className={`j-img ${className}`} loading="lazy" onClick={onClick} />;
}

export function ImagePicker({ value, onChange, max = 12 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const ids: string[] = [];
    for (const f of [...files].slice(0, max - value.length)) {
      try { ids.push(await addImage(f)); } catch (e) { toast((e as Error).message, "error"); }
    }
    onChange([...value, ...ids]);
    setBusy(false);
  };
  return (
    <Field label={t("Bilder")} hint={t("Werden verkleinert (höchstens 1600 px) und auf diesem Gerät gespeichert, mit dem PC abgeglichen.")}>
      <div className="j-thumbs">
        {value.map((id) => (
          <div key={id} className="j-thumb">
            <JImage id={id} onClick={() => setView(id)} />
            <button type="button" className="j-thumb-x" aria-label={t("Bild entfernen")} onClick={() => onChange(value.filter((x) => x !== id))}><X size={14} /></button>
          </div>
        ))}
        {value.length < max && <button type="button" className="j-thumb add" onClick={() => input.current?.click()} disabled={busy} aria-label={t("Bild hinzufügen")}>{busy ? <Loader2 size={18} className="spin" /> : <ImagePlus size={20} />}</button>}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
      </div>
      {view && <ImageViewer id={view} onClose={() => setView(null)} />}
    </Field>
  );
}

export function ImageViewer({ id, onClose }: { id: string; onClose: () => void }) {
  return <Modal title={t("Bild")} onClose={onClose} wide><div className="cap-view"><JImage id={id} /></div></Modal>;
}

export function ImageStrip({ ids }: { ids?: string[] }) {
  const [view, setView] = useState<string | null>(null);
  if (!ids?.length) return null;
  return (
    <>
      <div className="j-thumbs small">{ids.map((id) => <div key={id} className="j-thumb"><JImage id={id} onClick={() => setView(id)} /></div>)}</div>
      {view && <ImageViewer id={view} onClose={() => setView(null)} />}
    </>
  );
}

// ------------------------------------------------------------------------------------------ links between entries

export function EntryChip({ e }: { e: Entry }) {
  const path = KIND_PATH[e.kind]?.(e.id);
  const label = <><span className="badge">{t(KIND_LABEL[e.kind] ?? e.kind)}</span> {entryTitle(e)}</>;
  return path ? <Link to={path} className="j-link-chip">{label}</Link> : <span className="j-link-chip">{label}</span>;
}

/** Links to other entries (memory, wiki page, find …), chosen by search. Shows entries linking back here too. */
export function LinkPicker({ value, onChange, selfId, kinds }: { value: string[]; onChange: (v: string[]) => void; selfId: string; kinds?: string[] }) {
  useJournalVersion();
  const [q, setQ] = useState("");
  const linked = value.map((id) => getEntry(id)).filter((e): e is Entry => !!e);
  const hits = q.trim() ? allEntries().filter((e) => e.id !== selfId && !value.includes(e.id) && (!kinds || kinds.includes(e.kind)) && KIND_PATH[e.kind] && matchesQuery(e, q)).slice(0, 8) : [];
  return (
    <Field label={t("Verknüpft mit")} hint={t("Andere Einträge: Erinnerungen, Wiki-Seiten, Funde, Zielpfade, Story")}>
      <div className="stack-sm">
        {linked.length > 0 && <div className="row" style={{ gap: 6 }}>{linked.map((e) => (
          <span key={e.id} className="row nowrap" style={{ gap: 2 }}><EntryChip e={e} /><button type="button" className="chip-x" aria-label={t("Verknüpfung entfernen")} onClick={() => onChange(value.filter((x) => x !== e.id))}><X size={13} /></button></span>
        ))}</div>}
        <input className="input" value={q} placeholder={t("Eintrag suchen …")} onChange={(e) => setQ(e.target.value)} />
        {hits.length > 0 && <div className="stack-sm">{hits.map((e) => (
          <button key={e.id} type="button" className="j-hit" onClick={() => { onChange([...value, e.id]); setQ(""); }}><Link2 size={14} /> <span className="badge">{t(KIND_LABEL[e.kind] ?? e.kind)}</span> {entryTitle(e)}</button>
        ))}</div>}
      </div>
    </Field>
  );
}

/** Entries this one links to and entries that link to it. */
export function LinkedList({ entry }: { entry: Entry }) {
  useJournalVersion();
  const own = (((entry.data as { links?: string[] }).links) ?? []).map((id) => getEntry(id)).filter((e): e is Entry => !!e);
  const back = allEntries().filter((e) => e.id !== entry.id && ((e.data as { links?: string[] }).links ?? []).includes(entry.id) && !own.some((o) => o.id === e.id));
  if (!own.length && !back.length) return null;
  return (
    <div className="stack-sm">
      <span className="tiny muted">{t("Verknüpft")}</span>
      <div className="row" style={{ gap: 6 }}>{[...own, ...back].map((e) => <EntryChip key={e.id} e={e} />)}</div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ sync status

export function SyncBadge() {
  const s = useJournalSync();
  const conn = useConn();
  const [show, setShow] = useState(false);
  const online = conn.auth === "ok" && !client.demo;
  let icon: ReactNode = <HardDrive size={14} />, text = t("Auf diesem Gerät gespeichert"), kind = "";
  if (!s.persistent) { icon = <AlertTriangle size={14} />; text = t("Dieser Browser speichert nicht (privates Fenster?) – nur bis zum Schließen"); kind = "error"; }
  else if (online && s.phase === "syncing") { icon = <Loader2 size={14} className="spin" />; text = t("Gleiche mit dem PC ab …"); kind = "info"; }
  else if (online && s.phase === "error") { icon = <AlertTriangle size={14} />; text = t("Abgleich fehlgeschlagen"); kind = "error"; }
  else if (online && s.pending === 0) { icon = <Check size={14} />; text = t("Mit dem PC abgeglichen"); kind = "ok"; }
  else if (s.pending > 0) { icon = <CloudOff size={14} />; text = online ? (s.pending === 1 ? t("1 Änderung geht gleich zum PC") : t("{n} Änderungen gehen gleich zum PC", { n: s.pending })) : (s.pending === 1 ? t("1 Änderung nur hier – geht zum PC, sobald er an ist") : t("{n} Änderungen nur hier – gehen zum PC, sobald er an ist", { n: s.pending })); kind = "warn"; }
  return (
    <>
      <button type="button" className={`badge ${kind} j-sync`} onClick={() => setShow(true)} aria-label={t("Speicherort und Abgleich")}>{icon}{text}{s.conflicts > 0 && ` · ${t("{n} Konflikt-Kopien", { n: s.conflicts })}`}</button>
      {show && <SyncDetails onClose={() => setShow(false)} />}
    </>
  );
}

interface Conflict { id: string; entryId: string; kind: string; updatedAt: number; by: string; at: string; data?: Record<string, unknown> }

function SyncDetails({ onClose }: { onClose: () => void }) {
  const s = useJournalSync();
  const conn = useConn();
  const online = conn.auth === "ok" && !client.demo;
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const load = () => { if (online) void client.call<{ conflicts: Conflict[] }>("journal.conflicts").then((r) => setConflicts(r.conflicts), () => setConflicts([])); };
  useEffect(load, [online, s.conflicts]);
  const restore = async (c: Conflict) => {
    const cur = getEntry(c.entryId);
    if (!c.data) return;
    if (!await confirmDialog(t("Diese Version wiederherstellen?"), t("Die jetzige Version von „{n}“ wird ersetzt. Sie bleibt dabei selbst als Konflikt-Kopie auf dem PC.", { n: cur ? entryTitle(cur) : c.entryId }))) return;
    saveEntry(c.kind, c.entryId, c.data);
    await syncJournal();
    await client.call("journal.dismissConflict", { id: c.id });
    load();
    toast(t("Wiederhergestellt"), "success");
  };
  return (
    <Modal title={t("Speicherort und Abgleich")} onClose={onClose}>
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>{t("Deine Sammlungen werden in diesem Browser gespeichert und funktionieren auch, wenn der PC aus ist. Ist der PC verbunden, wird mit seiner Kopie abgeglichen – so sehen deine anderen Geräte dasselbe, und alles ist im PC-Backup.")}</p>
        {!s.persistent && <Banner kind="error">{t("Dieser Browser erlaubt kein dauerhaftes Speichern (z. B. privates Fenster). Verbinde den PC, damit nichts verloren geht, oder exportiere eine Datei.")}</Banner>}
        <div className="small">
          <div>{t("Noch nicht auf dem PC")}: <b>{s.pending}</b></div>
          {s.lastAt && <div>{t("Zuletzt abgeglichen")}: {dateTime(new Date(s.lastAt).toISOString())}</div>}
          {s.error && <div style={{ color: "var(--danger)" }}>{s.error}</div>}
        </div>
        {s.refused.length > 0 && <Banner kind="warn" title={t("Vom PC abgelehnt")}>{s.refused.map((r) => { const e = getEntry(r.id); return <div key={r.id}>{e ? entryTitle(e) : r.id}: {r.reason}</div>; })}</Banner>}
        {online ? <div><Button size="sm" icon={<RefreshCw size={14} />} busy={s.phase === "syncing"} onClick={() => void syncJournal()}>{t("Jetzt abgleichen")}</Button></div>
          : <p className="tiny muted" style={{ margin: 0 }}>{t("Kein PC verbunden – der Abgleich startet von selbst beim nächsten Verbinden.")}</p>}
        {online && conflicts && conflicts.length > 0 && (
          <div className="stack-sm">
            <b className="small">{t("Konflikt-Kopien")}</b>
            <p className="tiny muted" style={{ margin: 0 }}>{t("Wurde ein Eintrag auf zwei Geräten geändert, gilt die neuere Änderung. Die andere Version liegt hier – nichts geht verloren.")}</p>
            {conflicts.map((c) => {
              const cur = getEntry(c.entryId);
              return (
                <div key={c.id} className="j-conflict">
                  <div className="grow">
                    <div className="small"><b>{String(c.data?.title ?? c.data?.did ?? (cur ? entryTitle(cur) : c.entryId))}</b> <span className="badge">{t(KIND_LABEL[c.kind] ?? c.kind)}</span></div>
                    <div className="tiny muted">{t("Version von {by}, geändert {at}", { by: c.by, at: dateTime(new Date(c.updatedAt).toISOString()) })}</div>
                  </div>
                  <Button size="sm" onClick={() => void restore(c)}>{t("Wiederherstellen")}</Button>
                  <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label={t("Verwerfen")} onClick={() => void client.call("journal.dismissConflict", { id: c.id }).then(load)} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------ export / import

export function ExportImport({ kinds, name, label }: { kinds: string[]; name: string; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const exp = async () => {
    setBusy(true);
    try {
      const f = await exportJournal(kinds);
      if (!f.entries.length) { toast(t("Noch nichts zum Exportieren"), "info"); return; }
      downloadText(`nexus-${name}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(f));
      toast(t("{n} Einträge exportiert", { n: f.entries.length }), "success");
    } finally { setBusy(false); }
  };
  const imp = async (file?: File) => {
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { toast(t("Datei ist zu groß (höchstens 60 MB)."), "error"); return; }
    setBusy(true);
    try {
      const r = await importJournal(await file.text(), { kinds });
      toast(t("Import: {a} neu, {u} aktualisiert, {s} übersprungen", { a: r.added, u: r.updated, s: r.skipped }), r.added + r.updated ? "success" : "info");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      <Button size="sm" variant="ghost" icon={<Download size={14} />} busy={busy} onClick={() => void exp()}>{label ?? t("Exportieren")}</Button>
      <Button size="sm" variant="ghost" icon={<Upload size={14} />} disabled={busy} onClick={() => input.current?.click()}>{t("Importieren")}</Button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => { void imp(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

/** Saves the entry; a refusal (too big, …) is shown, not lost silently. */
export function trySave<T extends object>(kind: string, id: string, data: T): boolean {
  try { saveEntry(kind, id, data); return true; } catch (e) { toast((e as Error).message, "error"); return false; }
}

export const localIsoNow = () => { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const toLocalInput = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const fromLocalInput = (v: string) => { const d = new Date(v); return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="search-inline input" style={{ maxWidth: 280 }}>
      <Search size={15} aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("Suchen …")} aria-label={t("Suchen")} className="j-search-input" />
    </label>
  );
}
