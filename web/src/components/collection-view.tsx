// One UI for every schema-driven collection (lib/collections.ts): list or table, search, filters, sort, archive,
// create (empty or from a template), edit with checks, duplicate, delete, links, export/import and CSV.
// Feature-specific parts (coordinate tools, comparisons, map, slider …) come in through `detail` and `cardExtra`.

import { useMemo, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Copy, FileSpreadsheet, LayoutGrid, List, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { toast } from "../lib/hooks";
import { allEntries, downloadText, getEntry, newId, removeEntry, useJournal, type Entry } from "../lib/journal";
import { blank, entriesCsv, rowsCsv, validate, valueText, type Data, type FieldDef, type FieldError, type Schema } from "../lib/collections";
import { matchesQuery, norm } from "../lib/journal-logic";
import { Button, Card, confirmDialog, Empty, Field, Modal } from "./ui";
import { ExportImport, GamePicker, gameLabel, ImagePicker, ImageStrip, JImage, LinkedList, LinkPicker, SearchBox, TagInput, trySave, useGames } from "./journal-ui";

type Games = { id: string; name: string }[];

const fieldLabel = (f: FieldDef) => t(f.label);
export const errText = (e: FieldError) => t(e.message, { ...e.vars, f: e.vars?.f ? t(String(e.vars.f)) : "" });

export function CollectionView({ schema, icon, intro, focus, detail, cardExtra, editorExtra }: {
  schema: Schema; icon: ReactNode; intro?: ReactNode; focus?: string | null;
  detail?: (e: Entry<Data>, save: (d: Data) => void) => ReactNode;
  cardExtra?: (e: Entry<Data>) => ReactNode;
  /** Feature-specific inputs in the form (e.g. choosing a PC file for a hidden field). */
  editorExtra?: (d: Data, set: (k: string, v: unknown) => void) => ReactNode;
}) {
  const list = useJournal<Data>(schema.kind);
  const games = useGames();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState<"changed" | "title" | "date">("changed");
  const dateField = schema.fields.find((f) => f.type === "date");
  const [table, setTable] = useState(false);
  const [edit, setEdit] = useState<{ id: string; data: Data; isNew: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [creating, setCreating] = useState(false);
  const filterFields = schema.fields.filter((f) => f.filter);
  const tags = useMemo(() => [...new Set(list.flatMap((e) => ((e.data.tags as string[]) ?? [])))].sort(), [list]);

  const shown = useMemo(() => {
    const l = list.filter((e) => !!e.data.archived === archived && matchesQuery(e, q) && filterFields.every((f) => {
      const v = filters[f.key];
      if (!v) return true;
      if (f.type === "tags") return ((e.data[f.key] as string[]) ?? []).some((x) => norm(x) === norm(v));
      if (f.type === "bool") return !!e.data[f.key] === (v === "1");
      return String(e.data[f.key] ?? "") === v;
    }));
    if (sort === "date" && dateField) return [...l].sort((a, b) => String(b.data[dateField.key] ?? "").localeCompare(String(a.data[dateField.key] ?? "")));
    return sort === "title" ? [...l].sort((a, b) => String(a.data.title ?? "").localeCompare(String(b.data.title ?? ""))) : l;
  }, [list, q, filters, archived, sort, filterFields, dateField]);
  const listValues = (key: string) => [...new Set(list.flatMap((e) => ((e.data[key] as string[]) ?? [])))].sort();

  const cur = open ? list.find((e) => e.id === open) : undefined;
  const startNew = (data: Data) => { setCreating(false); setEdit({ id: newId(), data: { ...blank(schema), ...data }, isNew: true }); };
  const cardFields = schema.fields.filter((f) => f.card && f.key !== "title" && !f.hidden);
  const tableFields = schema.fields.filter((f) => !["rows", "images", "image", "textarea"].includes(f.type) && !f.hidden).slice(0, 7);

  return (
    <>
      <Card title={t(schema.label)} icon={icon} meta={list.length ? String(list.filter((e) => !e.data.archived).length) : undefined}
        actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => (schema.templates?.length ? setCreating(true) : startNew({}))}>{t("Neu")}</Button>}>
        {intro && <div className="small muted" style={{ marginBottom: 10 }}>{intro}</div>}
        {list.length === 0 ? <Empty icon={icon} title={t("Noch nichts angelegt")} text={t("Lege den ersten Eintrag an – gespeichert auf diesem Gerät, auch ohne PC.")} /> : (
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <SearchBox value={q} onChange={setQ} />
              {filterFields.filter((f) => f.type === "select").map((f) => (
                <select key={f.key} className="input" style={{ maxWidth: 200 }} value={filters[f.key] ?? ""} aria-label={fieldLabel(f)} onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value }))}>
                  <option value="">{fieldLabel(f)}: {t("alle")}</option>{f.options!.map((op) => <option key={op.value} value={op.value}>{t(op.label)}</option>)}
                </select>
              ))}
              {filterFields.filter((f) => f.type === "ref").map((f) => <RefFilter key={f.key} f={f} value={filters[f.key] ?? ""} onChange={(v) => setFilters((x) => ({ ...x, [f.key]: v }))} />)}
              {filterFields.filter((f) => f.type === "tags" && f.key !== "tags" && listValues(f.key).length).map((f) => (
                <select key={f.key} className="input" style={{ maxWidth: 200 }} value={filters[f.key] ?? ""} aria-label={fieldLabel(f)} onChange={(e) => setFilters((x) => ({ ...x, [f.key]: e.target.value }))}>
                  <option value="">{fieldLabel(f)}: {t("alle")}</option>{listValues(f.key).map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ))}
              <select className="input" style={{ maxWidth: 190 }} value={sort} aria-label={t("Sortierung")} onChange={(e) => setSort(e.target.value as "changed" | "title" | "date")}><option value="changed">{t("Zuletzt geändert")}</option><option value="title">{t("Name A–Z")}</option>{dateField && <option value="date">{t("{f} (neueste zuerst)", { f: fieldLabel(dateField) })}</option>}</select>
              <Button size="sm" variant="ghost" icon={table ? <LayoutGrid size={14} /> : <List size={14} />} aria-pressed={table} onClick={() => setTable(!table)}>{table ? t("Karten") : t("Tabelle")}</Button>
            </div>
            <div className="chips">
              {filterFields.filter((f) => f.type === "bool").map((f) => <button key={f.key} type="button" className={`chip ${filters[f.key] === "1" ? "on" : ""}`} onClick={() => setFilters((x) => ({ ...x, [f.key]: x[f.key] === "1" ? "" : "1" }))}>{f.key === "favorite" && <Star size={13} />}{fieldLabel(f)}</button>)}
              {tags.map((tg) => <button key={tg} type="button" className={`chip ${filters.tags === tg ? "on" : ""}`} onClick={() => setFilters((x) => ({ ...x, tags: x.tags === tg ? "" : tg }))}>#{tg}</button>)}
              <button type="button" className={`chip ${archived ? "on" : ""}`} onClick={() => setArchived(!archived)}><Archive size={13} /> {t("Archiv")} ({list.filter((e) => e.data.archived).length})</button>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <ExportImport kinds={[schema.kind]} name={schema.kind} />
              <Button size="sm" variant="ghost" icon={<FileSpreadsheet size={14} />} onClick={() => downloadText(`nexus-${schema.kind}-${new Date().toISOString().slice(0, 10)}.csv`, entriesCsv(schema, shown.map((e) => e.data)), "text/csv")}>{t("Tabelle (CSV)")}</Button>
            </div>
          </div>
        )}
      </Card>
      {list.length > 0 && (shown.length === 0 ? <Card><Empty icon={<Search size={24} />} title={t("Nichts passt zum Filter")} /></Card> : table ? (
        <div className="table-wrap card">
          <table className="table">
            <thead><tr>{tableFields.map((f) => <th key={f.key}>{fieldLabel(f)}</th>)}<th>{t("Geändert")}</th></tr></thead>
            <tbody>{shown.map((e) => (
              <tr key={e.id} className="tappable" onClick={() => setOpen(e.id)}>
                {tableFields.map((f) => <td key={f.key}>{f.type === "game" ? gameLabel(e.data[f.key] as object, games) : f.type === "ref" ? <RefName id={e.data[f.key] as string} /> : t(valueText(f, e.data[f.key]))}</td>)}
                <td className="tiny muted">{dateTime(new Date(e.updatedAt).toISOString())}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="grid-3">
          {shown.map((e) => (
            <button key={e.id} type="button" className={`j-item j-page-card ${focus === e.id ? "focus" : ""}`} onClick={() => setOpen(e.id)}>
              <b>{String(e.data.title ?? "")}{e.data.favorite ? " ★" : ""}</b>
              <span className="tiny muted">{cardFields.map((f) => f.type === "game" ? gameLabel(e.data[f.key] as object, games) : f.type === "ref" ? (getEntry<Data>(e.data[f.key] as string)?.data.title as string ?? "") : t(valueText(f, e.data[f.key]))).filter(Boolean).join(" · ")}</span>
              {cardExtra?.(e)}
              {(e.data.tags as string[] | undefined)?.length ? <span className="row" style={{ gap: 4 }}>{(e.data.tags as string[]).map((tg) => <span key={tg} className="badge">#{tg}</span>)}</span> : null}
            </button>
          ))}
        </div>
      ))}
      {cur && !edit && (
        <Modal title={String(cur.data.title ?? t(schema.label))} onClose={() => setOpen(null)} wide footer={<>
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={async () => {
            if (!await confirmDialog(t("Eintrag löschen?"), t("Er wird auf allen Geräten gelöscht. Verknüpfungen anderer Einträge auf ihn werden entfernt."), { danger: true, ok: t("Löschen") })) return;
            removeWithLinks(cur.id); setOpen(null);
          }}>{t("Löschen")}</Button>
          <Button variant="ghost" icon={cur.data.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={() => { trySave(schema.kind, cur.id, { ...cur.data, archived: !cur.data.archived }); setOpen(null); }}>{cur.data.archived ? t("Zurückholen") : t("Archivieren")}</Button>
          <Button variant="ghost" icon={<Copy size={15} />} onClick={() => { const id = newId(); if (trySave(schema.kind, id, { ...cur.data, title: `${String(cur.data.title ?? "")} (${t("Kopie")})`, archived: false })) { toast(t("Kopie angelegt"), "success"); setOpen(id); } }}>{t("Duplizieren")}</Button>
          <Button variant="primary" icon={<Pencil size={15} />} onClick={() => setEdit({ id: cur.id, data: cur.data, isNew: false })}>{t("Bearbeiten")}</Button>
        </>}>
          <EntryDetail schema={schema} e={cur} games={games} extra={detail?.(cur, (d) => trySave(schema.kind, cur.id, d))} />
        </Modal>
      )}
      {creating && (
        <Modal title={t("Neu: {n}", { n: t(schema.label) })} onClose={() => setCreating(false)}>
          <div className="stack-sm">
            <Button block icon={<Plus size={15} />} onClick={() => startNew({})}>{t("Leer beginnen")}</Button>
            <span className="tiny muted">{t("Vorlagen")}</span>
            {schema.templates!.map((tp) => <Button key={tp.name} block variant="ghost" onClick={() => startNew(translateTemplate(tp.data))}>{t(tp.name)}</Button>)}
          </div>
        </Modal>
      )}
      {edit && <EntryEditor schema={schema} id={edit.id} initial={edit.data} isNew={edit.isNew} games={games} extra={editorExtra} onClose={(saved) => { setEdit(null); if (saved) setOpen(edit.id); }} />}
    </>
  );
}

/** Template texts are shown in the user's language. */
function translateTemplate(d: Data): Data {
  const tr = (v: unknown): unknown => typeof v === "string" ? (v ? t(v) : v) : Array.isArray(v) ? v.map(tr) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "status" ? x : tr(x)])) : v;
  return tr(d) as Data;
}

/** Deleting also removes links to the entry from other entries (no dead links). */
export function removeWithLinks(id: string) {
  removeEntry(id);
  for (const e of allEntries()) {
    const d = e.data as Data;
    const links = d.links as string[] | undefined;
    const refs = Object.entries(d).filter(([, v]) => v === id).map(([k]) => k);
    if (!links?.includes(id) && !refs.length) continue;
    const next: Data = { ...d, ...(links ? { links: links.filter((x) => x !== id) } : {}) };
    for (const k of refs) next[k] = null;
    trySave(e.kind, e.id, next);
  }
}

function RefName({ id }: { id?: string | null }) { return <>{id ? String(getEntry<Data>(id)?.data.title ?? t("(gelöscht)")) : ""}</>; }

function RefFilter({ f, value, onChange }: { f: FieldDef; value: string; onChange: (v: string) => void }) {
  const opts = useJournal<Data>(f.refKind!);
  if (!opts.length) return null;
  return (
    <select className="input" style={{ maxWidth: 220 }} value={value} aria-label={fieldLabel(f)} onChange={(e) => onChange(e.target.value)}>
      <option value="">{fieldLabel(f)}: {t("alle")}</option>{opts.map((o) => <option key={o.id} value={o.id}>{String(o.data.title ?? o.id)}</option>)}
    </select>
  );
}

function EntryDetail({ schema, e, games, extra }: { schema: Schema; e: Entry<Data>; games: Games; extra?: ReactNode }) {
  const d = e.data;
  return (
    <div className="stack">
      {extra}
      <dl className="j-dl">
        {schema.fields.filter((f) => !["rows", "images", "image", "tags", "title"].includes(f.type) && f.key !== "title" && !f.hidden).map((f) => {
          const v = d[f.key];
          if (f.type === "bool" && !v) return null;
          const text = f.type === "game" ? gameLabel(v as object ?? {}, games) : f.type === "ref" ? (v ? String(getEntry<Data>(v as string)?.data.title ?? t("(gelöscht)")) : "") : f.type === "url" && v ? <a href={String(v)} target="_blank" rel="noopener noreferrer">{String(v)}</a> : t(valueText(f, v));
          if (!text) return null;
          return <div key={f.key}><dt>{fieldLabel(f)}</dt><dd style={{ whiteSpace: f.type === "textarea" ? "pre-wrap" : undefined }}>{text}</dd></div>;
        })}
      </dl>
      {schema.fields.filter((f) => f.type === "image" && d[f.key]).map((f) => <div key={f.key}><span className="tiny muted">{fieldLabel(f)}</span><div className="j-thumbs"><div className="j-thumb" style={{ width: 160, height: 100 }}><JImage id={String(d[f.key])} /></div></div></div>)}
      {schema.fields.filter((f) => f.type === "images").map((f) => <ImageStrip key={f.key} ids={d[f.key] as string[]} />)}
      {schema.fields.filter((f) => f.type === "rows" && (d[f.key] as Data[] | undefined)?.length).map((f) => (
        <div key={f.key} className="stack-sm">
          <div className="row between"><b className="small">{fieldLabel(f)} ({(d[f.key] as Data[]).length})</b>
            <Button size="sm" variant="ghost" icon={<FileSpreadsheet size={14} />} onClick={() => downloadText(`${String(d.title ?? f.key).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40)}-${f.key}.csv`, rowsCsv({ ...f, columns: f.columns!.map((c) => ({ ...c, label: t(c.label) })) }, d[f.key] as Data[]), "text/csv")}>{t("CSV")}</Button></div>
          <div className="table-wrap"><table className="table"><thead><tr>{f.columns!.map((c) => <th key={c.key}>{fieldLabel(c)}</th>)}</tr></thead>
            <tbody>{(d[f.key] as Data[]).map((r, i) => <tr key={i}>{f.columns!.map((c) => <td key={c.key}>{c.type === "url" && r[c.key] ? <a href={String(r[c.key])} target="_blank" rel="noopener noreferrer">{t("Link")}</a> : c.type === "bool" ? (r[c.key] ? "✓" : "") : t(valueText(c, r[c.key]))}</td>)}</tr>)}</tbody></table></div>
        </div>
      ))}
      {(d.tags as string[] | undefined)?.length ? <div className="row" style={{ gap: 4 }}>{(d.tags as string[]).map((tg) => <span key={tg} className="badge">#{tg}</span>)}</div> : null}
      <LinkedList entry={e} />
      <span className="tiny muted">{t("Zuletzt geändert {d}", { d: dateTime(new Date(e.updatedAt).toISOString()) })}</span>
    </div>
  );
}

export function EntryEditor({ schema, id, initial, isNew, games, onClose, extra }: { schema: Schema; id: string; initial: Data; isNew: boolean; games: Games; onClose: (saved: boolean) => void; extra?: (d: Data, set: (k: string, v: unknown) => void) => ReactNode }) {
  const [d, setD] = useState<Data>(initial);
  const [tried, setTried] = useState(false);
  const errors = validate(schema, d);
  const errFor = (key: string) => errors.filter((e) => e.key === key);
  const save = () => {
    setTried(true);
    if (errors.length) { toast(errText(errors[0]), "error"); return; }
    if (trySave(schema.kind, id, d)) onClose(true);
  };
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  return (
    <Modal title={isNew ? t("Neu: {n}", { n: t(schema.label) }) : t("{n} bearbeiten", { n: t(schema.label) })} onClose={() => onClose(false)} wide footer={<>
      <Button onClick={() => onClose(false)}>{t("Abbrechen")}</Button>
      <Button variant="primary" onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        {schema.fields.filter((f) => !f.hidden).map((f) => <FieldInput key={f.key} f={f} value={d[f.key]} onChange={(v) => set(f.key, v)} games={games} errors={tried ? errFor(f.key) : []} />)}
        {extra?.(d, set)}
        <LinkPicker value={(d.links as string[]) ?? []} onChange={(links) => set("links", links)} selfId={id} />
      </div>
    </Modal>
  );
}

function FieldInput({ f, value, onChange, games, errors }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; games: Games; errors: FieldError[] }) {
  const err = errors.filter((e) => e.row == null).map(errText)[0];
  const label = <>{fieldLabel(f)}{f.required && " *"}</>;
  const hint = f.hint ? t(f.hint) : undefined;
  switch (f.type) {
    case "text": case "url": return <Field label={label} hint={hint} error={err}><input className="input" value={String(value ?? "")} maxLength={f.type === "url" ? 500 : f.maxLen ?? 200} placeholder={f.placeholder ? t(f.placeholder) : f.type === "url" ? "https://" : undefined} inputMode={f.type === "url" ? "url" : undefined} onChange={(e) => onChange(e.target.value || null)} /></Field>;
    case "textarea": return <Field label={label} hint={hint} error={err}><textarea className="input" rows={4} value={String(value ?? "")} maxLength={f.maxLen ?? 20000} onChange={(e) => onChange(e.target.value)} /></Field>;
    case "number": return <Field label={label} hint={hint} error={err}><NumberInput label={fieldLabel(f)} value={value as number | null} onChange={onChange} /></Field>;
    case "select": return <Field label={label} hint={hint} error={err}><select className="input" value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)}>{!f.required && <option value="">–</option>}{f.options!.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}</select></Field>;
    case "bool": return <label className="checkbox"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{fieldLabel(f)}</label>;
    case "date": return <Field label={label} hint={hint} error={err}><input type="date" className="input" value={String(value ?? "").slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} /></Field>;
    case "tags": return <TagInput value={(value as string[]) ?? []} onChange={onChange} />;
    case "game": return <>{<GamePicker value={(value as object) ?? {}} onChange={onChange} games={games} label={fieldLabel(f) + (f.required ? " *" : "")} />}{err && <span className="tiny" style={{ color: "var(--danger)" }}>{err}</span>}</>;
    case "images": return <ImagePicker value={(value as string[]) ?? []} onChange={onChange} />;
    case "image": return <><ImagePicker value={value ? [String(value)] : []} onChange={(v) => onChange(v[v.length - 1] ?? null)} max={1} />{hint && <span className="tiny muted">{hint}</span>}{err && <span className="tiny" style={{ color: "var(--danger)" }}>{err}</span>}</>;
    case "ref": return <RefInput f={f} value={value as string | null} onChange={onChange} />;
    case "rows": return <RowsInput f={f} value={(value as Data[]) ?? []} onChange={onChange} errors={errors} />;
    default: return null;
  }
}

function NumberInput({ value, onChange, label }: { value: number | null | undefined; onChange: (v: number | null) => void; label?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return <input className="input" inputMode="decimal" aria-label={label} value={text} onChange={(e) => {
    setText(e.target.value);
    const s = e.target.value.trim().replace(",", ".");
    onChange(s === "" ? null : s === "-" ? null : Number(s));
  }} />;
}

function RefInput({ f, value, onChange }: { f: FieldDef; value: string | null; onChange: (v: string | null) => void }) {
  const opts = useJournal<Data>(f.refKind!);
  return (
    <Field label={fieldLabel(f)} hint={opts.length ? undefined : t("Noch keine Einträge zum Auswählen.")}>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">–</option>{opts.map((o) => <option key={o.id} value={o.id}>{String(o.data.title ?? o.id)}</option>)}
        {value && !opts.some((o) => o.id === value) && <option value={value}>{t("(gelöscht)")}</option>}
      </select>
    </Field>
  );
}

function RowsInput({ f, value, onChange, errors }: { f: FieldDef; value: Data[]; onChange: (v: Data[]) => void; errors: FieldError[] }) {
  const cols = f.columns!;
  const setCell = (i: number, k: string, v: unknown) => onChange(value.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const move = (i: number, d: number) => { const n = [...value]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); onChange(n); };
  const addRow = () => { const r: Data = {}; for (const c of cols) if (c.type === "select" && c.required) r[c.key] = c.options![0].value; else if (c.type === "bool") r[c.key] = false; onChange([...value, r]); };
  return (
    <div className="stack-sm">
      <b className="small">{fieldLabel(f)} ({value.length})</b>
      {f.hint && <span className="tiny muted">{t(f.hint)}</span>}
      {value.map((r, i) => {
        const rowErr = errors.filter((e) => e.row === i);
        return (
          <div key={i} className={`j-stage-edit rows-edit ${rowErr.length ? "has-error" : ""}`}>
            <div className="rows-cells">
              {cols.map((c) => (
                <label key={c.key} className={`rows-cell ${c.type === "bool" ? "bool" : ""} ${c.key === "name" || c.key === "text" || c.key === "action" || c.key === "item" ? "wide" : ""}`}>
                  <span className="tiny muted">{fieldLabel(c)}</span>
                  {c.type === "bool" ? <input type="checkbox" aria-label={fieldLabel(c)} checked={!!r[c.key]} onChange={(e) => setCell(i, c.key, e.target.checked)} />
                    : c.type === "select" ? <select className="input" aria-label={fieldLabel(c)} value={String(r[c.key] ?? "")} onChange={(e) => setCell(i, c.key, e.target.value || null)}>{!c.required && <option value="">–</option>}{c.options!.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}</select>
                    : c.type === "number" ? <NumberInput label={fieldLabel(c)} value={r[c.key] as number | null} onChange={(v) => setCell(i, c.key, v)} />
                    : <input className="input" aria-label={fieldLabel(c)} value={String(r[c.key] ?? "")} maxLength={c.type === "url" ? 500 : c.maxLen ?? 200} placeholder={c.placeholder ? t(c.placeholder) : c.type === "url" ? "https://" : undefined} onChange={(e) => setCell(i, c.key, e.target.value || null)} />}
                </label>
              ))}
            </div>
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} disabled={i === 0} aria-label={t("Nach oben")} onClick={() => move(i, -1)} />
              <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} disabled={i === value.length - 1} aria-label={t("Nach unten")} onClick={() => move(i, 1)} />
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Zeile entfernen")} onClick={() => onChange(value.filter((_, j) => j !== i))} />
              {rowErr.length > 0 && <span className="tiny" style={{ color: "var(--danger)" }}>{errText(rowErr[0])}</span>}
            </div>
          </div>
        );
      })}
      <div><Button size="sm" icon={<Plus size={14} />} disabled={!!f.maxRows && value.length >= f.maxRows} onClick={addRow}>{t("Zeile hinzufügen")}</Button></div>
    </div>
  );
}
