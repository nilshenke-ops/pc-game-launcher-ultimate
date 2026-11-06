// JARVIS MEMORY: the long-term memory is a folder of plain Markdown files (an Obsidian vault) on the PC.
// This page only talks to the PC over the authenticated connection – the files never leave the PC and are not part of the website.
import { useEffect, useState } from "react";
import { Brain, FilePlus2, FolderOpen, HeartPulse, Link2, NotebookText, Save, Search, Trash2 } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { dateTime, relTime } from "../lib/format";
import { Banner, Button, Card, confirmDialog, Empty, Field, Loadable, Modal, PageHead, Switch } from "../components/ui";

interface MemStatus { enabled: boolean; path?: string | null; state: "off" | "no-folder" | "missing" | "ok"; notes: number; folders: number; writeEnabled: boolean; deleteEnabled: boolean; auto: "off" | "suggest" | "auto"; obsidianVault: boolean; lastNote?: string | null; lastWrite?: string | null; message: string }
interface Note { path: string; title: string; folder: string; updated: string; size: number; type?: string | null }
interface Hit { path: string; title: string; folder: string; updated: string; score: number; snippet: string }
interface Project { path: string; title: string; status?: string | null; updated: string; last?: string | null }
interface Health { kind: string; path: string; text: string }
interface Opened { path: string; text: string; updated: string; links: Note[]; backlinks: Note[] }

const AUTO = [{ value: "off", label: "Nur was ich sage" }, { value: "suggest", label: "JARVIS fragt („Merk dir das“)" }, { value: "auto", label: "Klares gleich speichern" }] as const;
const FOLDER_NAME = (f: string) => f.replace(/^\d+-/, "");

export default function MemoryPage() {
  const conn = useConn();
  const online = conn.phase === "online" && conn.auth === "ok";
  const canManage = useCan("manage");
  const canAdmin = useCan("admin");
  const st = useRpc<MemStatus>("memory.status", {}, ["memory"]);
  const s = st.data;
  const ready = !!s && s.state === "ok";
  const recent = useRpc<{ notes: Note[] }>("memory.recent", {}, ["memory"], ready);
  const projects = useRpc<{ projects: Project[] }>("memory.projects", {}, ["memory"], ready);
  const health = useRpc<{ items: Health[] }>("memory.health", {}, ["memory"], ready);
  const all = useRpc<{ notes: Note[] }>("memory.list", {}, ["memory"], ready);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const reload = () => { st.reload(); recent.reload(); projects.reload(); health.reload(); all.reload(); };

  useEffect(() => {
    const q = query.trim();
    if (!ready || q.length < 2) { setHits(null); return; }
    const id = window.setTimeout(() => client.call<{ hits: Hit[] }>("memory.search", { query: q }).then((r) => setHits(r.hits), () => setHits([])), 250);
    return () => window.clearTimeout(id);
  }, [query, ready]);

  const byFolder = new Map<string, Note[]>();
  for (const n of all.data?.notes ?? []) byFolder.set(n.folder, [...(byFolder.get(n.folder) ?? []), n]);

  return (
    <>
      <PageHead eyebrow={t("Assistent")} title={t("JARVIS MEMORY")}
        text={t("Das Langzeitgedächtnis von JARVIS: ein Ordner mit normalen Markdown-Notizen auf deinem PC (ein Obsidian-Vault). Nichts davon liegt im Netz – die Seite fragt den PC nur über die gesicherte Verbindung.")}
        actions={canManage && ready && s?.writeEnabled && <Button variant="primary" icon={<FilePlus2 size={16} />} onClick={() => setCreating(true)}>{t("Neue Notiz")}</Button>} />
      {!online && <div style={{ marginBottom: 14 }}><Banner kind="info">{t("Ohne PC-Verbindung ist das Gedächtnis nicht erreichbar. JARVIS antwortet trotzdem normal – nur ohne Erinnerungen.")}</Banner></div>}
      <Loadable loading={st.loading && !s} error={st.error} onRetry={st.reload}>
        {s && (
          <div className="stack">
            <Card title={t("Verbindung")} icon={<Brain size={18} />} meta={<span className={`badge${s.state === "ok" ? " ok" : ""}`}>{s.state === "ok" ? t("Verbunden") : s.state === "missing" ? t("Nicht erreichbar") : s.state === "off" ? t("Aus") : t("Kein Ordner")}</span>}>
              <div className="stack-sm">
                <p className="muted" style={{ margin: 0 }}>{t(s.message)}</p>
                <div className="mem-stats">
                  <div><b>{s.notes}</b><span>{t("Notizen")}</span></div>
                  <div><b>{s.folders}</b><span>{t("Ordner")}</span></div>
                  <div><b>{s.lastNote ? relTime(s.lastNote) : "–"}</b><span>{t("Zuletzt geändert")}</span></div>
                  <div><b>{s.state === "ok" ? t("aktuell") : "–"}</b><span>{t("Abgleich")}</span></div>
                </div>
                {s.path && <div className="mem-path"><FolderOpen size={14} /> <code>{s.path}</code></div>}
              </div>
              <Settings s={s} online={online} canAdmin={canAdmin} isPc={!!conn.me?.isLocal} onChanged={reload} />
            </Card>

            {ready && (
              <>
                <Card title={t("Im Gedächtnis suchen")} icon={<Search size={18} />}>
                  <div className="stack-sm">
                    <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("z. B. „Minecraft-Projekt“ oder „Netzwerk“")} aria-label={t("Im Gedächtnis suchen")} />
                    {hits && (hits.length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("Dazu steht nichts im Gedächtnis.")}</p>
                      : <div className="mem-list">{hits.map((h) => (
                        <button key={h.path} className="mem-row" onClick={() => setOpen(h.path)}>
                          <NotebookText size={16} /><span><b>{h.title}</b><small>{FOLDER_NAME(h.folder)} · {relTime(h.updated)}</small><em>{h.snippet}</em></span>
                        </button>))}</div>)}
                  </div>
                </Card>

                <div className="mem-grid">
                  <Card title={t("Projekte")} icon={<NotebookText size={18} />}>
                    {(projects.data?.projects ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("Noch keine Projekte. Sag z. B. „Merk dir, dass mein Minecraft-Projekt noch nicht fertig ist“.")}</p>
                      : <div className="mem-list">{projects.data!.projects.map((p) => (
                        <button key={p.path} className="mem-row" onClick={() => setOpen(p.path)}>
                          <NotebookText size={16} /><span><b>{p.title}</b><small>{p.status ? t("Status: {s}", { s: p.status }) : t("Kein Status")} · {relTime(p.updated)}</small>{p.last && <em>{p.last}</em>}</span>
                        </button>))}</div>}
                  </Card>
                  <Card title={t("Zuletzt gemerkt")} icon={<NotebookText size={18} />}>
                    {(recent.data?.notes ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("Noch nichts.")}</p>
                      : <div className="mem-list">{recent.data!.notes.map((n) => (
                        <button key={n.path} className="mem-row" onClick={() => setOpen(n.path)}>
                          <NotebookText size={16} /><span><b>{n.title}</b><small>{FOLDER_NAME(n.folder)} · {dateTime(n.updated)}</small></span>
                        </button>))}</div>}
                  </Card>
                </div>

                <Card title={t("Gespeicherte Informationen")} icon={<FolderOpen size={18} />}>
                  {byFolder.size === 0 ? <Empty icon={<Brain size={28} />} title={t("Noch leer")} text={t("Sobald JARVIS etwas merkt, erscheint es hier.")} />
                    : <div className="stack-sm">{[...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([f, list]) => (
                      <details key={f} className="mem-folder" open={list.length < 7}>
                        <summary>{FOLDER_NAME(f)} <span className="badge">{list.length}</span></summary>
                        <div className="mem-list">{list.map((n) => (
                          <button key={n.path} className="mem-row" onClick={() => setOpen(n.path)}><NotebookText size={16} /><span><b>{n.title}</b><small>{relTime(n.updated)}</small></span></button>))}</div>
                      </details>))}</div>}
                </Card>

                <Card title={t("Pflege")} icon={<HeartPulse size={18} />}>
                  {(health.data?.items ?? []).length === 0 ? <p className="muted" style={{ margin: 0 }}>{t("Alles in Ordnung: keine Doppelten, keine alten offenen Projekte, keine Lücken.")}</p>
                    : <div className="mem-list">{health.data!.items.map((h, i) => (
                      <button key={i} className="mem-row" onClick={() => setOpen(h.path)}><HeartPulse size={16} /><span><b>{h.text}</b><small>{h.path}</small></span></button>))}</div>}
                  <p className="muted" style={{ marginBottom: 0 }}>{t("JARVIS schlägt nur vor – er ändert oder löscht dabei nichts.")}</p>
                </Card>
              </>
            )}
          </div>
        )}
      </Loadable>
      {open && s && <NoteEditor path={open} canWrite={canManage && s.writeEnabled} canDelete={canAdmin && s.deleteEnabled} onOpen={setOpen} onClose={() => { setOpen(null); reload(); }} />}
      {creating && <NewNote onClose={(p) => { setCreating(false); reload(); if (p) setOpen(p); }} />}
    </>
  );
}

function Settings({ s, online, canAdmin, isPc, onChanged }: { s: MemStatus; online: boolean; canAdmin: boolean; isPc: boolean; onChanged: () => void }) {
  const [path, setPath] = useState(s.path ?? "");
  useEffect(() => setPath(s.path ?? ""), [s.path]);
  const save = (p: Record<string, unknown>) => client.call("memory.configure", p).then(() => { toast(t("Gespeichert"), "success"); onChanged(); }, (e: Error) => toast(e.message, "error"));
  if (!canAdmin) return <p className="muted" style={{ marginBottom: 0 }}>{t("Einstellungen ändert nur ein Gerät mit Verwaltungs-Recht.")}</p>;
  return (
    <div className="stack-sm" style={{ marginTop: 12 }}>
      <Field label={t("Ordner des Gedächtnisses (auf dem PC)")} hint={isPc ? t("Zum Beispiel C:\\Users\\Name\\Documents\\JARVIS-MEMORY – der Ordner wird angelegt, falls es ihn nicht gibt. Ein vorhandener Obsidian-Vault geht auch.") : t("Den Ordner wählst du am PC selbst (aus Sicherheitsgründen nicht vom Handy). Hier siehst du ihn nur.")}>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" value={path} disabled={!isPc || !online} onChange={(e) => setPath(e.target.value)} placeholder="C:\Users\…\JARVIS-MEMORY" />
          {isPc && <Button variant="primary" disabled={!online || !path.trim() || path.trim() === s.path} onClick={() => save({ path: path.trim(), enabled: true })}>{t("Übernehmen")}</Button>}
        </div>
      </Field>
      <Switch checked={s.enabled} disabled={!online || !s.path} onChange={(v) => save({ enabled: v })} label={t("Gedächtnis benutzen")} hint={t("Aus: JARVIS antwortet wie vorher, ohne zu merken oder nachzuschlagen.")} />
      <Switch checked={s.writeEnabled} disabled={!online} onChange={(v) => save({ writeEnabled: v })} label={t("JARVIS darf Notizen schreiben")} hint={t("Aus: nur Lesen und Suchen.")} />
      <Switch checked={s.deleteEnabled} disabled={!online} onChange={(v) => save({ deleteEnabled: v })} label={t("Löschen erlauben")} hint={t("Gelöscht wird nie von selbst und nie endgültig: Notizen kommen in den Papierkorb des Vaults (.trash).")} />
      <Field label={t("Automatisch merken")}>
        <select className="input" value={s.auto} disabled={!online} onChange={(e) => save({ auto: e.target.value })}>
          {AUTO.map((a) => <option key={a.value} value={a.value}>{t(a.label)}</option>)}
        </select>
      </Field>
    </div>
  );
}

function NoteEditor({ path, canWrite, canDelete, onOpen, onClose }: { path: string; canWrite: boolean; canDelete: boolean; onOpen: (p: string) => void; onClose: () => void }) {
  const q = useRpc<Opened>("memory.read", { path }, []);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setText(q.data.text); }, [q.data]);
  const d = q.data;
  const dirty = !!d && text !== d.text;
  const save = async () => {
    if (!d) return; setBusy(true);
    try { await client.call("memory.write", { path: d.path, content: text, updated: d.updated }); toast(t("Gespeichert – die alte Fassung bleibt im Verlauf"), "success"); q.reload(); }
    catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  const remove = async () => {
    if (!d || !(await confirmDialog(t("Notiz löschen?"), t("„{n}“ kommt in den Papierkorb des Vaults (.trash) und kann dort zurückgeholt werden.", { n: d.path }), { danger: true, ok: t("Löschen") }))) return;
    try { await client.call("memory.delete", { path: d.path, confirm: true }); toast(t("Gelöscht"), "success"); onClose(); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal title={d?.path ?? path} onClose={onClose} wide
      footer={<>
        {canDelete && d && <Button variant="danger" icon={<Trash2 size={16} />} onClick={remove}>{t("Löschen")}</Button>}
        <Button onClick={onClose}>{t("Schließen")}</Button>
        {canWrite && <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={save}>{t("Speichern")}</Button>}
      </>}>
      <Loadable loading={q.loading && !d} error={q.error} onRetry={q.reload}>
        {d && (
          <div className="stack-sm">
            <textarea className="input mem-editor" value={text} readOnly={!canWrite} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label={t("Notiz")} />
            <small className="muted">{t("Geändert {d}", { d: dateTime(d.updated) })}{!canWrite && " · " + t("nur lesen")}</small>
            {(d.links.length > 0 || d.backlinks.length > 0) && (
              <div className="mem-links">
                <Link2 size={14} />
                {[...d.links, ...d.backlinks.filter((b) => !d.links.some((l) => l.path === b.path))].map((n) => <button key={n.path} className="badge" onClick={() => onOpen(n.path)}>{n.title}</button>)}
              </div>
            )}
          </div>
        )}
      </Loadable>
    </Modal>
  );
}

function NewNote({ onClose }: { onClose: (path?: string) => void }) {
  const [folder, setFolder] = useState("05-Wissen");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const FOLDERS = ["01-Personen", "02-Projekte", "03-Gaming", "04-Gespräche", "05-Wissen", "06-Aufgaben"];
  const create = async () => {
    const name = title.trim().replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return;
    setBusy(true);
    try {
      const path = `${folder}/${name}.md`;
      await client.call("memory.write", { path, createOnly: true, content: `---\ntitle: ${name}\n---\n# ${name}\n\n${body.trim()}\n` });
      toast(t("Notiz angelegt"), "success"); onClose(path);
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };
  return (
    <Modal title={t("Neue Notiz")} onClose={() => onClose()} footer={<><Button onClick={() => onClose()}>{t("Abbrechen")}</Button><Button variant="primary" busy={busy} disabled={!title.trim()} onClick={create}>{t("Anlegen")}</Button></>}>
      <div className="stack-sm">
        <Field label={t("Ordner")}><select className="input" value={folder} onChange={(e) => setFolder(e.target.value)}>{FOLDERS.map((f) => <option key={f} value={f}>{FOLDER_NAME(f)}</option>)}</select></Field>
        <Field label={t("Titel")}><input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label={t("Inhalt")}><textarea className="input mem-editor" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
