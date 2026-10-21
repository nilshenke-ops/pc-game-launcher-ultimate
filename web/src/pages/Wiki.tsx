// Gaming-Wiki: own pages with [[links]], backlinks, versions, autosave, merging duplicates and import/export. Pages live
// in this browser (works without the PC) and are compared with the PC like all collections (lib/journal.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookMarked, Check, Download, FilePlus2, GitMerge, History as HistoryIcon, Link2, Loader2, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { dateTime } from "../lib/format";
import { toast } from "../lib/hooks";
import { allEntries, downloadText, getEntry, newId, removeEntry, useJournal, useJournalVersion, type Entry } from "../lib/journal";
import { allTags, backlinks, duplicateGroups, KIND_PATH, matchesQuery, mergePages, norm, resolveLink, splitWiki, withVersion, wikiMarkdown, type WikiPage } from "../lib/journal-logic";
import { Banner, Button, Card, confirmDialog, Empty, Field, Modal, PageHead } from "../components/ui";
import { EntryChip, ExportImport, GamePicker, gameLabel, LinkedList, LinkPicker, SearchBox, SyncBadge, TagInput, trySave, useGames } from "../components/journal-ui";

export default function WikiPage() {
  const [params, setParams] = useSearchParams();
  const pages = useJournal<WikiPage>("wiki");
  const games = useGames();
  const id = params.get("id");
  const page = id ? pages.find((p) => p.id === id) : undefined;
  const open = (pid: string | null, edit = false) => setParams(pid ? { id: pid, ...(edit ? { edit: "1" } : {}) } : {}, { replace: false });
  const create = (title = "") => {
    const t0 = title.trim() || t("Neue Seite");
    const exists = pages.find((p) => norm(p.data.title) === norm(t0));
    if (exists && title) { open(exists.id); return; }
    const nid = newId();
    if (trySave("wiki", nid, { title: t0, body: "", tags: [], aliases: [], history: [], links: [] } satisfies WikiPage)) open(nid, true);
  };
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Gaming-Wiki")} text={t("Dein eigenes Nachschlagewerk: Seiten zu Spielen, Bossen, Rezepten, Strategien – verlinkt mit [[Seitenname]]. Gespeichert auf diesem Gerät, auch ohne PC.")}
        actions={<SyncBadge />} />
      {page ? <PageView key={page.id} page={page} pages={pages} games={games} editStart={params.get("edit") === "1"} onOpen={open} onCreate={create} />
        : id ? <Card><Empty icon={<BookMarked size={28} />} title={t("Seite nicht gefunden")} text={t("Sie wurde vielleicht gelöscht oder zusammengeführt.")} action={<Button onClick={() => open(null)}>{t("Zur Übersicht")}</Button>} /></Card>
        : <Overview pages={pages} games={games} onOpen={open} onCreate={create} />}
    </>
  );
}

type Games = { id: string; name: string }[];

function Overview({ pages, games, onOpen, onCreate }: { pages: Entry<WikiPage>[]; games: Games; onOpen: (id: string) => void; onCreate: (title?: string) => void }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<"changed" | "title">("changed");
  const [merge, setMerge] = useState<Entry<WikiPage>[] | null>(null);
  const tags = useMemo(() => allTags(pages), [pages]);
  const dups = useMemo(() => duplicateGroups(pages), [pages]);
  const shown = useMemo(() => {
    const l = pages.filter((p) => (!tag || p.data.tags.some((x) => norm(x) === norm(tag))) && matchesQuery(p, q));
    return sort === "title" ? [...l].sort((a, b) => a.data.title.localeCompare(b.data.title)) : l;
  }, [pages, q, tag, sort]);
  return (
    <div className="stack">
      <Card title={t("Seiten")} icon={<BookMarked size={18} />} meta={pages.length ? String(pages.length) : undefined} actions={<Button size="sm" variant="primary" icon={<FilePlus2 size={15} />} onClick={() => onCreate()}>{t("Neue Seite")}</Button>}>
        {pages.length === 0 ? <Empty icon={<BookMarked size={28} />} title={t("Noch keine Wiki-Seiten")} text={t("Leg eine Seite an. Mit [[Name]] im Text verlinkst du andere Seiten – fehlt eine, kannst du sie mit einem Tipp anlegen.")} /> : (
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <SearchBox value={q} onChange={setQ} />
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as "changed" | "title")} aria-label={t("Sortierung")} style={{ maxWidth: 200 }}>
                <option value="changed">{t("Zuletzt geändert")}</option><option value="title">{t("Name A–Z")}</option>
              </select>
              <ExportImport kinds={["wiki"]} name="wiki" />
            </div>
            {tags.length > 0 && <div className="chips">{tags.map((tg) => <button key={tg} type="button" className={`chip ${tag === tg ? "on" : ""}`} onClick={() => setTag(tag === tg ? "" : tg)}>#{tg}</button>)}</div>}
          </div>
        )}
      </Card>
      {dups.length > 0 && (
        <Banner kind="warn" title={t("Doppelte Seiten")}>
          {dups.map((g) => <div key={g[0].id} className="row" style={{ gap: 8 }}>„{g[0].data.title}“ × {g.length} <Button size="sm" icon={<GitMerge size={14} />} onClick={() => setMerge(g)}>{t("Zusammenführen")}</Button></div>)}
        </Banner>
      )}
      {pages.length > 0 && (shown.length === 0 ? <Card><Empty icon={<Search size={26} />} title={t("Nichts gefunden")} action={q.trim() ? <Button icon={<Plus size={15} />} onClick={() => onCreate(q)}>{t("Seite „{n}“ anlegen", { n: q.trim() })}</Button> : undefined} /></Card> : (
        <div className="grid-3">
          {shown.map((p) => (
            <button key={p.id} type="button" className="j-item j-page-card" onClick={() => onOpen(p.id)}>
              <b>{p.data.title}</b>
              <span className="tiny muted">{gameLabel(p.data, games) || t("Allgemein")} · {t("geändert {d}", { d: dateTime(new Date(p.updatedAt).toISOString()) })}</span>
              {p.data.body && <span className="small muted j-clamp">{p.data.body.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b ?? a).slice(0, 220)}</span>}
              {p.data.tags.length > 0 && <span className="row" style={{ gap: 4 }}>{p.data.tags.map((tg) => <span key={tg} className="badge">#{tg}</span>)}</span>}
            </button>
          ))}
        </div>
      ))}
      {merge && <MergeDialog group={merge} onClose={() => setMerge(null)} onDone={(id) => { setMerge(null); onOpen(id); }} />}
    </div>
  );
}

function MergeDialog({ group, onClose, onDone }: { group: Entry<WikiPage>[]; onClose: () => void; onDone: (id: string) => void }) {
  const [keep, setKeep] = useState(group[0].id);
  const run = () => {
    const k = group.find((g) => g.id === keep)!;
    let data = k.data;
    for (const o of group.filter((g) => g.id !== keep)) data = mergePages(data, o.data, Date.now());
    if (!trySave("wiki", k.id, data)) return;
    for (const o of group.filter((g) => g.id !== keep)) {
      // Entries that linked to the merged page now link to the kept one.
      for (const e of allEntries()) {
        const links = (e.data as { links?: string[] }).links;
        if (links?.includes(o.id)) trySave(e.kind, e.id, { ...(e.data as object), links: [...new Set(links.map((x) => x === o.id ? k.id : x))] });
      }
      removeEntry(o.id);
    }
    toast(t("Zusammengeführt – die alten Texte stehen in der Versionsgeschichte"), "success");
    onDone(k.id);
  };
  return (
    <Modal title={t("Seiten zusammenführen")} onClose={onClose} footer={<><Button onClick={onClose}>{t("Abbrechen")}</Button><Button variant="primary" icon={<GitMerge size={15} />} onClick={run}>{t("Zusammenführen")}</Button></>}>
      <div className="stack-sm">
        <p className="small" style={{ margin: 0 }}>{t("Welche Seite bleibt? Die Texte der anderen werden angehängt, Tags und Verknüpfungen übernommen. Links auf die anderen Seiten führen danach hierher.")}</p>
        {group.map((g) => (
          <label key={g.id} className="checkbox"><input type="radio" name="keep" checked={keep === g.id} onChange={() => setKeep(g.id)} />
            <span>{g.data.title} <span className="tiny muted">· {g.data.body.length} {t("Zeichen")} · {dateTime(new Date(g.updatedAt).toISOString())}</span></span></label>
        ))}
      </div>
    </Modal>
  );
}

function PageView({ page, pages, games, editStart, onOpen, onCreate }: { page: Entry<WikiPage>; pages: Entry<WikiPage>[]; games: Games; editStart: boolean; onOpen: (id: string | null, edit?: boolean) => void; onCreate: (title?: string) => void }) {
  useJournalVersion();
  const [editing, setEditing] = useState(editStart);
  const [history, setHistory] = useState(false);
  const nav = useNavigate();
  const others = useMemo(() => allEntries().filter((e) => e.kind !== "wiki" && KIND_PATH[e.kind]), [page.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = backlinks(page, pages, others);
  const p = page.data;
  const followLink = (target: string) => {
    const hit = resolveLink(target, pages, others);
    if (hit) nav(KIND_PATH[hit.kind](hit.id));
    else onCreate(target);
  };
  return (
    <div className="stack">
      <Card title={p.title} icon={<BookMarked size={18} />} meta={gameLabel(p, games) || undefined} actions={<div className="row" style={{ gap: 6 }}>
        <Button size="sm" onClick={() => onOpen(null)}>{t("Übersicht")}</Button>
        {!editing && <Button size="sm" variant="primary" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>{t("Bearbeiten")}</Button>}
      </div>}>
        {editing ? <PageEditor page={page} pages={pages} games={games} onDone={() => setEditing(false)} onDeleted={() => onOpen(null)} /> : (
          <div className="stack">
            {p.body.trim() ? <div className="j-wiki-body">{splitWiki(p.body).map((part, i) => "text" in part ? <span key={i}>{part.text}</span> : (() => {
              const hit = resolveLink(part.link, pages, others);
              return <button key={i} type="button" className={`j-wiki-link ${hit ? "" : "missing"}`} title={hit ? undefined : t("Seite gibt es noch nicht – antippen zum Anlegen")} onClick={() => followLink(part.link)}>{part.label}</button>;
            })())}</div> : <p className="muted small">{t("Diese Seite ist noch leer.")}</p>}
            {p.tags.length > 0 && <div className="row" style={{ gap: 4 }}>{p.tags.map((tg) => <span key={tg} className="badge">#{tg}</span>)}</div>}
            {(p.aliases?.length ?? 0) > 0 && <span className="tiny muted">{t("Auch bekannt als")}: {p.aliases!.join(", ")}</span>}
            <LinkedList entry={page} />
            <div className="row" style={{ gap: 6 }}>
              <Button size="sm" variant="ghost" icon={<HistoryIcon size={14} />} onClick={() => setHistory(true)}>{t("Versionen ({n})", { n: p.history?.length ?? 0 })}</Button>
              <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={() => downloadText(`${p.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "seite"}.md`, wikiMarkdown(p), "text/markdown")}>{t("Als Markdown")}</Button>
            </div>
          </div>
        )}
      </Card>
      <Card title={t("Rückverweise")} icon={<Link2 size={16} />} meta={String(back.length)}>
        {back.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{t("Noch keine andere Seite verlinkt hierher. Schreibe [[{n}]] in eine andere Seite.", { n: p.title })}</p>
          : <div className="row" style={{ gap: 6 }}>{back.map((e) => <EntryChip key={e.id} e={e} />)}</div>}
      </Card>
      {history && <HistoryDialog page={page} onClose={() => setHistory(false)} />}
    </div>
  );
}

/** Edits are saved automatically shortly after typing stops; a version of the text before is kept (see withVersion). */
function PageEditor({ page, pages, games, onDone, onDeleted }: { page: Entry<WikiPage>; pages: Entry<WikiPage>[]; games: Games; onDone: () => void; onDeleted: () => void }) {
  const [f, setF] = useState<WikiPage>(page.data);
  const [state, setState] = useState<"saved" | "pending" | "error">("saved");
  const first = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(f); latest.current = f;
  const tags = useMemo(() => allTags(pages), [pages]);
  const set = (p: Partial<WikiPage>) => { setF((x) => ({ ...x, ...p })); setState("pending"); };
  const flush = () => {
    window.clearTimeout(timer.current);
    const cur = getEntry<WikiPage>(page.id)?.data;
    const next = { ...latest.current, title: latest.current.title.trim() || t("Ohne Titel") };
    if (cur && JSON.stringify({ ...cur, history: undefined }) === JSON.stringify({ ...next, history: undefined })) { setState("saved"); return true; }
    const ok = trySave("wiki", page.id, withVersion(cur, { ...next, history: cur?.history ?? [] }, Date.now()));
    setState(ok ? "saved" : "error");
    return ok;
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
    return () => window.clearTimeout(timer.current);
  }, [f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (latest.current !== page.data) flush(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dupe = pages.find((x) => x.id !== page.id && norm(x.data.title) === norm(f.title));
  const missing = [...new Set(splitWiki(f.body).flatMap((p) => "link" in p && !resolveLink(p.link, pages, allEntries()) ? [p.link] : []))];
  return (
    <div className="stack">
      <Field label={t("Titel")} error={dupe ? t("Es gibt schon eine Seite mit diesem Titel – du kannst sie später zusammenführen.") : undefined}>
        <input className="input" value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label={t("Text")} hint={t("[[Seitenname]] verlinkt eine Seite, [[Seitenname|anderer Text]] mit eigenem Linktext.")}>
        <textarea className="input j-wiki-edit" rows={14} value={f.body} maxLength={200_000} onChange={(e) => set({ body: e.target.value })} />
      </Field>
      {missing.length > 0 && <p className="tiny muted" style={{ margin: 0 }}>{t("Noch nicht angelegt")}: {missing.join(", ")}</p>}
      <GamePicker value={f} onChange={(g) => set(g)} games={games} />
      <TagInput value={f.tags} onChange={(v) => set({ tags: v })} suggestions={tags} />
      <LinkPicker value={f.links ?? []} onChange={(links) => set({ links })} selfId={page.id} />
      <div className="row between">
        <span className="tiny muted j-save-state" aria-live="polite">{state === "pending" ? <><Loader2 size={12} className="spin" /> {t("Wird gespeichert …")}</> : state === "error" ? t("Nicht gespeichert") : <><Check size={12} /> {t("Gespeichert")}</>}</span>
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={async () => {
            if (!await confirmDialog(t("Seite löschen?"), t("„{n}“ wird auf allen Geräten gelöscht. Links darauf zeigen dann „noch nicht angelegt“.", { n: page.data.title }), { danger: true })) return;
            window.clearTimeout(timer.current); latest.current = page.data; removeEntry(page.id); onDeleted();
          }}>{t("Löschen")}</Button>
          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => { if (flush()) onDone(); }}>{t("Fertig")}</Button>
        </div>
      </div>
    </div>
  );
}

function HistoryDialog({ page, onClose }: { page: Entry<WikiPage>; onClose: () => void }) {
  const h = [...(page.data.history ?? [])].reverse();
  const [view, setView] = useState<number | null>(null);
  const restore = (i: number) => {
    const v = h[i];
    if (trySave("wiki", page.id, withVersion(page.data, { ...page.data, title: v.title, body: v.body }, Date.now(), true))) { toast(t("Version wiederhergestellt – der Text davor ist jetzt selbst eine Version"), "success"); onClose(); }
  };
  return (
    <Modal title={t("Versionen von „{n}“", { n: page.data.title })} onClose={onClose} wide>
      {h.length === 0 ? <p className="small muted">{t("Noch keine früheren Versionen. Beim Bearbeiten wird der vorherige Text als Version behalten (höchstens eine je 5 Minuten, die letzten 20).")}</p> : (
        <div className="stack-sm">
          {h.map((v, i) => (
            <div key={v.at + ":" + i} className="j-conflict">
              <div className="grow"><b className="small">{v.title}</b><div className="tiny muted">{dateTime(new Date(v.at).toISOString())} · {v.body.length} {t("Zeichen")}</div></div>
              <Button size="sm" variant="ghost" onClick={() => setView(view === i ? null : i)}>{view === i ? t("Ausblenden") : t("Ansehen")}</Button>
              <Button size="sm" icon={<RotateCcw size={14} />} onClick={() => restore(i)}>{t("Wiederherstellen")}</Button>
            </div>
          ))}
          {view != null && <pre className="j-version">{h[view].body}</pre>}
        </div>
      )}
    </Modal>
  );
}

