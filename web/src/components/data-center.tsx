// Data center (F25): this device's collections and its design in one place – pick areas, export them as a versioned
// file, as a table (CSV) or printed/PDF, and import a file with a preview and an own choice for conflicts.

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Database, Download, FileSpreadsheet, Printer, Upload } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { allEntries, downloadText, exportJournal, importJournal, previewImport, readJournalFile, useJournalVersion, type ConflictChoice, type Entry, type ImportItem, type JournalExport } from "../lib/journal";
import { entryTitle } from "../lib/journal-logic";
import { DATA_FORMAT, DATA_GROUPS, groupOf, kindLabel, kindsFor, printFields, toCsv } from "../lib/datacenter";
import { getPrefs, setPrefs } from "../lib/prefs";
import { sanitizePrefs, type Prefs } from "../lib/prefs-core";
import { Banner, Button, Card, Field, Modal, Switch } from "./ui";

type Design = Pick<Prefs, "theme" | "palettes" | "layouts" | "activeLayout" | "nav" | "homeShortcuts" | "fx">;
interface DataFile { format: typeof DATA_FORMAT; version: 1; exportedAt: string; groups: string[]; journal?: JournalExport; design?: Design }
interface Pending { name: string; text: string; journal: JournalExport | null; items: ImportItem[]; design: Design | null; groups: string[] }

const GROUPS = [...DATA_GROUPS, { id: "other", label: "Weitere Sammlungen", kinds: [] as string[] }];
const day = () => new Date().toISOString().slice(0, 10);
const designOf = (p: Prefs): Design => ({ theme: p.theme, palettes: p.palettes, layouts: p.layouts, activeLayout: p.activeLayout, nav: p.nav, homeShortcuts: p.homeShortcuts, fx: p.fx });

export function DataCenter() {
  useJournalVersion();
  const all = allEntries();
  const present = useMemo(() => [...new Set(all.map((e) => e.kind))].sort(), [all]);
  const count = (g: string) => all.filter((e) => groupOf(e.kind) === g).length;
  const [groups, setGroups] = useState<string[]>(GROUPS.map((g) => g.id));
  const [design, setDesign] = useState(true);
  const [images, setImages] = useState(true);
  const [csvKind, setCsvKind] = useState("");
  const [printing, setPrinting] = useState<Entry[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const kinds = kindsFor(groups, present);
  const chosen = all.filter((e) => kinds.includes(e.kind));
  const toggle = (id: string) => setGroups((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));

  const exportFile = async () => {
    if (!chosen.length && !design) { toast(t("Nichts ausgewählt"), "info"); return; }
    setBusy(true);
    try {
      const f: DataFile = { format: DATA_FORMAT, version: 1, exportedAt: new Date().toISOString(), groups, journal: kinds.length ? await exportJournal(kinds, images) : undefined, design: design ? designOf(getPrefs()) : undefined };
      downloadText(`nexus-daten-${day()}.json`, JSON.stringify(f));
      toast(t("{n} Einträge exportiert", { n: f.journal?.entries.length ?? 0 }), "success");
    } finally { setBusy(false); }
  };
  const exportCsv = () => {
    const k = csvKind || kinds[0];
    const list = all.filter((e) => e.kind === k);
    if (!list.length) { toast(t("Noch nichts zum Exportieren"), "info"); return; }
    downloadText(`nexus-${k}-${day()}.csv`, toCsv(list), "text/csv;charset=utf-8");
  };
  const print = () => {
    if (!chosen.length) { toast(t("Nichts ausgewählt"), "info"); return; }
    setPrinting(chosen);
    // After the print view is in the page; the browser's dialog offers "Als PDF speichern".
    setTimeout(() => { window.print(); setPrinting(null); }, 300);
  };
  const read = async (f?: File) => {
    if (!f) return;
    if (f.size > 60 * 1024 * 1024) { toast(t("Datei ist zu groß (höchstens 60 MB)."), "error"); return; }
    try {
      const text = await f.text();
      let raw: unknown;
      try { raw = JSON.parse(text); } catch { throw new Error(t("Die Datei ist kein gültiges JSON.")); }
      const o = raw as Partial<DataFile> & { format?: string };
      let journal: JournalExport | null = null, des: Design | null = null;
      if (o.format === DATA_FORMAT) {
        if ((o.version ?? 0) > 1) throw new Error(t("Die Datei stammt aus einer neueren Version."));
        if (o.journal) journal = readJournalFile(JSON.stringify(o.journal));
        if (o.design && typeof o.design === "object") des = designOf(sanitizePrefs({ ...getPrefs(), ...o.design }));
      } else if (o.format === "nexus-journal") journal = readJournalFile(text);
      else if (o.format === "pgl-layouts") des = designOf(sanitizePrefs({ ...getPrefs(), ...(o as object) }));
      else throw new Error(t("Keine Datei von Nexus."));
      setPending({ name: f.name, text: journal ? JSON.stringify(journal) : "", journal, items: journal ? previewImport(journal) : [], design: des, groups: GROUPS.map((g) => g.id) });
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Card title={t("Datenzentrum")} icon={<Database size={18} />}>
      <div className="stack">
        <p className="small muted">{t("Deine Sammlungen und dein Design auf diesem Gerät – ohne PC nutzbar. Bereiche wählen, dann als Datei, Tabelle oder PDF sichern.")}</p>
        <div className="chips wrap" role="group" aria-label={t("Bereiche")}>
          {GROUPS.map((g) => <button key={g.id} type="button" className={`chip ${groups.includes(g.id) ? "on" : ""}`} aria-pressed={groups.includes(g.id)} onClick={() => toggle(g.id)}>{t(g.label)} · {count(g.id)}</button>)}
        </div>
        <Switch checked={design} onChange={setDesign} label={t("Design, Startseiten und Navigation")} />
        <Switch checked={images} onChange={setImages} label={t("Bilder der Sammlungen mitsichern")} hint={t("Macht die Datei größer.")} />
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Button variant="primary" icon={<Download size={16} />} busy={busy} onClick={() => void exportFile()}>{t("Als Datei (JSON)")}</Button>
          <Button icon={<Printer size={16} />} onClick={print}>{t("Drucken / PDF")}</Button>
          <Button icon={<Upload size={16} />} onClick={() => file.current?.click()}>{t("Datei importieren …")}</Button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        {kinds.length > 0 && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label={t("Tabelle (CSV) für")}>
              <select className="input" value={csvKind || kinds[0]} onChange={(e) => setCsvKind(e.target.value)}>
                {kinds.map((k) => <option key={k} value={k}>{t(kindLabel(k))} ({all.filter((e) => e.kind === k).length})</option>)}
              </select>
            </Field>
            <Button icon={<FileSpreadsheet size={16} />} onClick={exportCsv}>{t("Als Tabelle (CSV)")}</Button>
          </div>
        )}
      </div>
      {pending && <ImportPreview p={pending} onClose={() => setPending(null)} />}
      {printing && createPortal(<PrintView list={printing} />, document.body)}
    </Card>
  );
}

function ImportPreview({ p, onClose }: { p: Pending; onClose: () => void }) {
  const [groups, setGroups] = useState(p.groups);
  const [choice, setChoice] = useState<ConflictChoice>("newer");
  const [design, setDesign] = useState<"skip" | "add" | "replace">(p.design ? "add" : "skip");
  const [busy, setBusy] = useState(false);
  const items = p.items.filter((i) => i.status !== "invalid" && groups.includes(groupOf(i.entry.kind)));
  const n = (s: ImportItem["status"]) => items.filter((i) => i.status === s).length;
  const conflicts = items.filter((i) => i.status === "conflict");
  const invalid = p.items.filter((i) => i.status === "invalid").length;
  const fileGroups = GROUPS.filter((g) => p.items.some((i) => i.status !== "invalid" && groupOf(i.entry.kind) === g.id));
  const run = async () => {
    setBusy(true);
    try {
      const parts: string[] = [];
      if (p.journal && items.length) {
        const r = await importJournal(p.text, { conflict: choice, only: items.map((i) => i.entry.id) });
        parts.push(t("{a} neu, {u} aktualisiert, {c} als Kopie, {s} übersprungen", { a: r.added, u: r.updated, c: r.copies, s: r.skipped }));
      }
      if (p.design && design !== "skip") {
        const d = p.design;
        if (design === "replace") setPrefs((cur) => sanitizePrefs({ ...cur, ...d }));
        else setPrefs((cur) => {
          const ids = new Set(cur.layouts.map((l) => l.id));
          const extra = d.layouts.map((l) => ({ ...l, id: ids.has(l.id) ? "l" + Math.random().toString(36).slice(2, 10) : l.id }));
          return sanitizePrefs({ ...cur, layouts: [...cur.layouts, ...extra].slice(0, 20) });
        });
        parts.push(design === "replace" ? t("Design ersetzt") : t("Startseiten hinzugefügt"));
      }
      toast(parts.length ? t("Import: {p}", { p: parts.join(" · ") }) : t("Nichts importiert"), parts.length ? "success" : "info");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Modal title={t("Import prüfen: {n}", { n: p.name })} wide onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" busy={busy} disabled={!items.length && design === "skip"} onClick={() => void run()}>{t("Importieren")}</Button></>}>
      <div className="stack">
        <span className="small muted">{t("Noch wurde nichts geändert. Wähle, was übernommen wird.")}</span>
        {fileGroups.length > 0 && (
          <div className="chips wrap" role="group" aria-label={t("Bereiche")}>
            {fileGroups.map((g) => <button key={g.id} type="button" className={`chip ${groups.includes(g.id) ? "on" : ""}`} aria-pressed={groups.includes(g.id)} onClick={() => setGroups((x) => (x.includes(g.id) ? x.filter((y) => y !== g.id) : [...x, g.id]))}>{t(g.label)}</button>)}
          </div>
        )}
        {p.journal && <div className="ins-tiles">
          <div><b>{n("new")}</b><span className="small muted">{t("neu")}</span></div>
          <div><b>{n("same")}</b><span className="small muted">{t("schon gleich vorhanden")}</span></div>
          <div><b>{conflicts.length}</b><span className="small muted">{t("unterschiedlich")}</span></div>
        </div>}
        {invalid > 0 && <Banner kind="warn">{t("{n} ungültige Einträge werden übersprungen.", { n: invalid })}</Banner>}
        {conflicts.length > 0 && (
          <>
            <Field label={t("Wenn ein Eintrag hier anders ist")}>
              <select className="input" value={choice} onChange={(e) => setChoice(e.target.value as ConflictChoice)}>
                <option value="newer">{t("Neuere Fassung behalten")}</option>
                <option value="mine">{t("Meine behalten")}</option>
                <option value="theirs">{t("Aus der Datei übernehmen")}</option>
                <option value="copy">{t("Beide behalten (Datei als Kopie)")}</option>
              </select>
            </Field>
            <ul className="ins-list">{conflicts.slice(0, 30).map((i) => (
              <li key={i.entry.id}><span>{entryTitle(i.entry)} <span className="badge">{t(kindLabel(i.entry.kind))}</span></span><span className="tiny muted">{t("hier {a} · Datei {b}", { a: dateTime(new Date(i.mine!.updatedAt).toISOString()), b: i.entry.updatedAt ? dateTime(new Date(i.entry.updatedAt).toISOString()) : "–" })}</span></li>
            ))}</ul>
            {conflicts.length > 30 && <span className="tiny muted">{t("… und {n} weitere", { n: conflicts.length - 30 })}</span>}
          </>
        )}
        {p.design && (
          <Field label={t("Design und Startseiten aus der Datei ({n} Seiten)", { n: p.design.layouts.length })}>
            <select className="input" value={design} onChange={(e) => setDesign(e.target.value as typeof design)}>
              <option value="add">{t("Startseiten als neue Seiten hinzufügen")}</option>
              <option value="replace">{t("Mein Design und meine Startseiten ersetzen")}</option>
              <option value="skip">{t("Nicht übernehmen")}</option>
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function PrintView({ list }: { list: Entry[] }) {
  const byKind = new Map<string, Entry[]>();
  for (const e of list) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  return (
    <div className="print-only">
      <h1>{t("Nexus – meine Sammlungen")}</h1>
      <p>{t("Stand {d} · {n} Einträge", { d: dateTime(new Date().toISOString()), n: list.length })}</p>
      {[...byKind].map(([k, l]) => (
        <section key={k}>
          <h2>{t(kindLabel(k))} ({l.length})</h2>
          {l.map((e) => <div key={e.id} className="print-entry"><h3>{entryTitle(e)}</h3>{printFields(e).map(([f, v]) => <p key={f}><b>{f}:</b> {v}</p>)}</div>)}
        </section>
      ))}
    </div>
  );
}
