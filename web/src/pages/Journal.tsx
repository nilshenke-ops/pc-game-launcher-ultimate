// Spiele-Journal: "Wo war ich noch mal?" (game memory), goal paths, quest & find collection and spoiler-free story notes.
// Everything is kept in this browser and works while the PC is off (lib/journal.ts); with the PC it is compared.

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, BookOpen, Copy, Eye, EyeOff, Flag, Gift, History as HistoryIcon, MapPin, Pencil, Plus, Route, Search, Star, Trash2, Trophy } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { newId, removeEntry, useJournal, type Entry } from "../lib/journal";
import {
  allTags, cleanTags, filterFinds, FIND_CATEGORIES, FIND_CATEGORY_LABEL, FIND_STATUS, FIND_STATUS_LABEL, matchesQuery, memoriesOf, memorySummary,
  PATH_TEMPLATES, pathProgress, spoilerFree, type Chapter, type Character, type Question, type Find, type FindSort, type GameRef, type GoalPath, type Memory, type Stage, type Story,
} from "../lib/journal-logic";
import { Button, Card, confirmDialog, Empty, Field, Meter, Modal, PageHead, Segmented, Switch } from "../components/ui";
import { ExportImport, SearchBox, fromLocalInput, GamePicker, gameLabel, ImagePicker, ImageStrip, LinkedList, LinkPicker, localIsoNow, SyncBadge, TagInput, toLocalInput, trySave, useGames } from "../components/journal-ui";

type Tab = "memory" | "goals" | "finds" | "story";
const TABS: Tab[] = ["memory", "goals", "finds", "story"];

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "memory") as Tab;
  const setTab = (v: Tab) => setParams({ tab: v }, { replace: true });
  const games = useGames();
  return (
    <>
      <PageHead eyebrow={t("Spielbegleiter")} title={t("Spiele-Journal")}
        text={t("Wo du warst, was du vorhast, was du gefunden hast und wie die Story weitergeht – gespeichert auf diesem Gerät, auch ohne PC.")}
        actions={<SyncBadge />} />
      <div className="stack">
        <div className="chips j-tabs" role="tablist" aria-label={t("Bereich")}>
          {([["memory", <HistoryIcon size={15} />, t("Wo war ich?")], ["goals", <Route size={15} />, t("Zielpfade")], ["finds", <MapPin size={15} />, t("Sammlung")], ["story", <BookOpen size={15} />, t("Story")]] as [Tab, ReactNode, string][]).map(([v, icon, label]) => (
            <button key={v} type="button" role="tab" aria-selected={tab === v} className={`chip ${tab === v ? "on" : ""}`} onClick={() => setTab(v)}>{icon}{label}</button>
          ))}
        </div>
        {tab === "memory" && <MemoryTab games={games} focus={params.get("id")} newFor={params.get("new")} />}
        {tab === "goals" && <GoalsTab games={games} focus={params.get("id")} />}
        {tab === "finds" && <FindsTab games={games} focus={params.get("id")} />}
        {tab === "story" && <StoryTab games={games} focus={params.get("id")} />}
      </div>
    </>
  );
}

type Games = { id: string; name: string }[];
const gameKey = (g: GameRef) => g.gameId ? "id:" + g.gameId : g.gameName ? "n:" + g.gameName.trim().toLowerCase() : "";

/** Games that appear in these entries (for the filter), library games first. */
function gamesIn(list: Entry<GameRef>[], games: Games) {
  const m = new Map<string, GameRef & { label: string }>();
  for (const e of list) { const k = gameKey(e.data); if (k && !m.has(k)) m.set(k, { gameId: e.data.gameId, gameName: e.data.gameName, label: gameLabel(e.data, games) }); }
  return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
}

function GameFilter({ list, games, value, onChange }: { list: Entry<GameRef>[]; games: Games; value: string; onChange: (k: string) => void }) {
  const opts = gamesIn(list, games);
  if (!opts.length) return null;
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t("Spiel")} style={{ maxWidth: 260 }}>
      <option value="">{t("Alle Spiele")}</option>
      {opts.map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}
    </select>
  );
}
const refOf = (k: string, list: Entry<GameRef>[]): GameRef | null => { const e = list.find((x) => gameKey(x.data) === k); return e ? { gameId: e.data.gameId, gameName: e.data.gameName } : null; };

// ============================================================================================ F2 – Wo war ich noch mal?

function MemoryTab({ games, focus, newFor }: { games: Games; focus: string | null; newFor: string | null }) {
  const list = useJournal<Memory>("memory");
  const [game, setGame] = useState("");
  const [q, setQ] = useState("");
  const startGame = newFor ? games.find((g) => g.id === newFor) : undefined;
  const [edit, setEdit] = useState<Entry<Memory> | "new" | null>(newFor ? "new" : null);
  const ref = game ? refOf(game, list as Entry<GameRef>[]) : null;
  const shown = useMemo(() => (ref ? memoriesOf(list, ref) : [...list].sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at))).filter((e) => matchesQuery(e, q)), [list, ref, q]);
  const summaries = useMemo(() => gamesIn(list as Entry<GameRef>[], games).map(([k, g]) => ({ k, g, s: memorySummary(list, g)! })).sort((a, b) => Date.parse(b.s.lastAt) - Date.parse(a.s.lastAt)), [list, games]);
  const focused = focus ? list.find((e) => e.id === focus) : undefined;

  return (
    <>
      <Card title={t("Wo war ich noch mal?")} icon={<HistoryIcon size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit("new")}>{t("Neuer Eintrag")}</Button>}>
        <p className="small muted" style={{ marginTop: 0 }}>{t("Schreib nach dem Spielen kurz auf, wo du bist und was als Nächstes kommt. Beim nächsten Start zeigt Nexus dir genau das – nur was du selbst notiert hast.")}</p>
        {list.length === 0 ? <Empty icon={<HistoryIcon size={28} />} title={t("Noch keine Erinnerungen")} text={t("Lege den ersten Eintrag an, z. B. „Im Nether, Festung gefunden – nächstes Mal Lohen jagen“.")} />
          : (
            <div className="row" style={{ gap: 8 }}>
              <GameFilter list={list as Entry<GameRef>[]} games={games} value={game} onChange={setGame} />
              <SearchBox value={q} onChange={setQ} />
              <ExportImport kinds={["memory"]} name="erinnerungen" />
            </div>
          )}
      </Card>
      {focused && !game && <MemoryCard e={focused} games={games} onEdit={() => setEdit(focused)} highlight />}
      {!game && !q && summaries.length > 0 && (
        <div className="grid-3">
          {summaries.map(({ k, g, s }) => (
            <Card key={k} title={g.label} icon={<MapPin size={16} />} meta={t("{n} Einträge", { n: s.count })} className="tappable" >
              <SummaryBody s={s} />
              <div className="row" style={{ marginTop: 8, gap: 6 }}>
                <Button size="sm" onClick={() => setGame(k)}>{t("Verlauf ansehen")}</Button>
                <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => { setGame(k); setEdit("new"); }}>{t("Eintrag")}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {ref && (() => { const s = memorySummary(list, ref); return s && <Card title={t("Zusammenfassung")} icon={<MapPin size={16} />}><SummaryBody s={s} /></Card>; })()}
      {(game || q) && (shown.length === 0 ? <Card><Empty icon={<Search size={26} />} title={t("Nichts gefunden")} /></Card>
        : <div className="j-timeline">{shown.map((e) => <MemoryCard key={e.id} e={e} games={games} onEdit={() => setEdit(e)} />)}</div>)}
      {edit && <MemoryEditor entry={edit === "new" ? null : edit} games={games} preset={edit === "new" ? (ref ?? (startGame ? { gameId: startGame.id, gameName: startGame.name } : undefined)) : undefined} onClose={() => setEdit(null)} />}
    </>
  );
}

function SummaryBody({ s }: { s: NonNullable<ReturnType<typeof memorySummary>> }) {
  return (
    <div className="stack-sm small">
      <div className="tiny muted">{t("Zuletzt gespielt")}: {dateTime(s.lastAt)}</div>
      <div><b>{t("Zuletzt")}:</b> {s.lastDid}</div>
      {s.where ? <div><b>{t("Ort / Stand")}:</b> {s.where}</div> : <div className="muted">{t("Ort / Stand: nicht notiert")}</div>}
      {s.next ? <div><b>{t("Als Nächstes")}:</b> {s.next}</div> : <div className="muted">{t("Nächster Schritt: nicht notiert")}</div>}
    </div>
  );
}

function MemoryCard({ e, games, onEdit, highlight }: { e: Entry<Memory>; games: Games; onEdit: () => void; highlight?: boolean }) {
  const d = e.data;
  return (
    <article className={`j-item ${highlight ? "focus" : ""}`}>
      <div className="row between nowrap">
        <div className="grow">
          <div className="tiny muted">{dateTime(d.at)}{gameLabel(d, games) && ` · ${gameLabel(d, games)}`}</div>
          <div><b>{d.did}</b></div>
        </div>
        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Bearbeiten")} onClick={onEdit} />
      </div>
      {d.where && <div className="small"><MapPin size={13} /> {d.where}</div>}
      {d.next && <div className="small"><Flag size={13} /> {t("Als Nächstes")}: {d.next}</div>}
      {d.notes && <p className="small muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{d.notes}</p>}
      <ImageStrip ids={d.imageIds} />
      <LinkedList entry={e} />
    </article>
  );
}

function MemoryEditor({ entry, games, preset, onClose }: { entry: Entry<Memory> | null; games: Games; preset?: GameRef; onClose: () => void }) {
  const [id] = useState(entry?.id ?? newId());
  const [f, setF] = useState<Memory>(entry?.data ?? { gameId: preset?.gameId ?? null, gameName: preset?.gameName ?? null, at: new Date().toISOString(), did: "", where: "", next: "", notes: "", imageIds: [], links: [] });
  const set = (p: Partial<Memory>) => setF((x) => ({ ...x, ...p }));
  const ok = f.did.trim() && (f.gameId || f.gameName?.trim());
  const save = () => { if (trySave("memory", id, { ...f, did: f.did.trim(), gameName: f.gameName?.trim() || null })) onClose(); };
  return (
    <Modal title={entry ? t("Erinnerung bearbeiten") : t("Neue Erinnerung")} onClose={onClose} wide footer={<>
      {entry && <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Eintrag löschen?"), t("Der Eintrag wird auf allen Geräten gelöscht."), { danger: true })) { removeEntry(id); onClose(); } }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!ok} onClick={save}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <GamePicker value={f} onChange={(g) => set(g)} games={games} allowNone={false} />
        <Field label={t("Wann")}><input type="datetime-local" className="input" value={toLocalInput(f.at) || localIsoNow()} onChange={(e) => set({ at: fromLocalInput(e.target.value) })} /></Field>
        <Field label={t("Was hast du gemacht?")}><input className="input" value={f.did} maxLength={300} onChange={(e) => set({ did: e.target.value })} placeholder={t("z. B. Festung im Nether gefunden")} /></Field>
        <Field label={t("Wo bist du / Stand")}><input className="input" value={f.where ?? ""} maxLength={200} onChange={(e) => set({ where: e.target.value })} placeholder={t("Level, Kapitel, Ort, Koordinaten …")} /></Field>
        <Field label={t("Was kommt als Nächstes?")}><input className="input" value={f.next ?? ""} maxLength={300} onChange={(e) => set({ next: e.target.value })} /></Field>
        <Field label={t("Notizen")}><textarea className="input" rows={3} value={f.notes ?? ""} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <ImagePicker value={f.imageIds ?? []} onChange={(imageIds) => set({ imageIds })} />
        <LinkPicker value={f.links ?? []} onChange={(links) => set({ links })} selfId={id} />
      </div>
    </Modal>
  );
}

// ============================================================================================ F3 – Zielpfade

function GoalsTab({ games, focus }: { games: Games; focus: string | null }) {
  const list = useJournal<GoalPath>("path");
  const [archived, setArchived] = useState(false);
  const [edit, setEdit] = useState<Entry<GoalPath> | null>(null);
  const [create, setCreate] = useState(false);
  const paths = list.filter((e) => !e.data.template && !!e.data.archived === archived);
  const templates = list.filter((e) => e.data.template);
  const toggleStage = (e: Entry<GoalPath>, sid: string) => {
    const stages = e.data.stages.map((s) => s.id === sid ? { ...s, done: !s.done, doneAt: !s.done ? new Date().toISOString() : null } : s);
    trySave("path", e.id, { ...e.data, stages });
  };
  return (
    <>
      <Card title={t("Persönliche Zielpfade")} icon={<Route size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setCreate(true)}>{t("Neuer Zielpfad")}</Button>}>
        <p className="small muted" style={{ marginTop: 0 }}>{t("Eigene Etappen mit Belohnungen und Meilensteinen. Kein Druck: keine täglichen Pflichten, keine Fristen, keine Serien, die reißen können.")}</p>
        <div className="row" style={{ gap: 8 }}>
          <Segmented value={archived ? "a" : "o"} onChange={(v) => setArchived(v === "a")} options={[{ value: "o", label: t("Aktiv") }, { value: "a", label: t("Archiv") }]} />
          <ExportImport kinds={["path"]} name="zielpfade" />
        </div>
      </Card>
      {paths.length === 0 ? <Card><Empty icon={<Route size={28} />} title={archived ? t("Archiv ist leer") : t("Noch keine Zielpfade")} text={archived ? undefined : t("Starte mit einer Vorlage oder leer.")} /></Card> : (
        <div className="grid-2">
          {paths.map((e) => {
            const p = pathProgress(e.data);
            return (
              <Card key={e.id} title={e.data.title} icon={p.complete ? <Trophy size={16} /> : <Route size={16} />} meta={`${p.done}/${p.total}`} className={focus === e.id ? "focus" : ""}
                actions={<Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Bearbeiten")} onClick={() => setEdit(e)} />}>
                <div className="stack-sm">
                  {gameLabel(e.data, games) && <span className="tiny muted">{gameLabel(e.data, games)}</span>}
                  <Meter value={p.percent} />
                  <span className="tiny muted">{t("{p} % · Meilensteine {m}/{n}", { p: p.percent, m: p.milestonesDone, n: p.milestones })}{p.complete && " · " + t("Geschafft!")}</span>
                  <ol className="j-stages">
                    {e.data.stages.map((s) => (
                      <li key={s.id} className={s.done ? "done" : p.next?.id === s.id ? "next" : ""}>
                        <label className="checkbox"><input type="checkbox" checked={!!s.done} onChange={() => toggleStage(e, s.id)} />
                          <span>{s.milestone && <Flag size={13} />} {s.title}{s.reward && <span className="tiny muted"> · <Gift size={12} /> {s.reward}</span>}</span></label>
                      </li>
                    ))}
                  </ol>
                  <LinkedList entry={e} />
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="ghost" icon={e.data.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} onClick={() => trySave("path", e.id, { ...e.data, archived: !e.data.archived })}>{e.data.archived ? t("Zurückholen") : t("Archivieren")}</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {create && <PathCreate templates={templates} onClose={() => setCreate(false)} onCreated={(e) => { setCreate(false); setEdit(e); }} />}
      {edit && <PathEditor entry={edit} games={games} onClose={() => setEdit(null)} />}
    </>
  );
}

function PathCreate({ templates, onClose, onCreated }: { templates: Entry<GoalPath>[]; onClose: () => void; onCreated: (e: Entry<GoalPath>) => void }) {
  const make = (title: string, stages: Omit<Stage, "id">[]) => {
    const id = newId();
    const data: GoalPath = { title, stages: stages.map((s) => ({ ...s, id: newId("s"), done: false, doneAt: null })), archived: false, links: [] };
    if (trySave("path", id, data)) onCreated({ id, kind: "path", updatedAt: Date.now(), data });
  };
  return (
    <Modal title={t("Neuer Zielpfad")} onClose={onClose}>
      <div className="stack-sm">
        <Button block icon={<Plus size={15} />} onClick={() => make(t("Mein Ziel"), [{ title: t("Erste Etappe") }])}>{t("Leer beginnen")}</Button>
        <span className="tiny muted">{t("Vorlagen")}</span>
        {PATH_TEMPLATES.map((tp) => <Button key={tp.id} block variant="ghost" onClick={() => make(t(tp.title), tp.stages.map((s) => ({ ...s, title: t(s.title) })))}>{t(tp.title)} <span className="tiny muted">· {tp.stages.length} {t("Etappen")}</span></Button>)}
        {templates.length > 0 && <span className="tiny muted">{t("Eigene Vorlagen")}</span>}
        {templates.map((tp) => <Button key={tp.id} block variant="ghost" onClick={() => make(tp.data.title, tp.data.stages.map(({ title, reward, milestone, note }) => ({ title, reward, milestone, note })))}>{tp.data.title}</Button>)}
      </div>
    </Modal>
  );
}

function PathEditor({ entry, games, onClose }: { entry: Entry<GoalPath>; games: Games; onClose: () => void }) {
  const [f, setF] = useState<GoalPath>(entry.data);
  const set = (p: Partial<GoalPath>) => setF((x) => ({ ...x, ...p }));
  const setStage = (i: number, p: Partial<Stage>) => set({ stages: f.stages.map((s, j) => j === i ? { ...s, ...p } : s) });
  const move = (i: number, d: number) => { const s = [...f.stages]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); set({ stages: s }); };
  const valid = f.title.trim() && f.stages.length > 0 && f.stages.every((s) => s.title.trim());
  return (
    <Modal title={f.template ? t("Vorlage bearbeiten") : t("Zielpfad bearbeiten")} onClose={onClose} wide footer={<>
      <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Zielpfad löschen?"), t("Tipp: Archivieren behält ihn. Löschen entfernt ihn auf allen Geräten."), { danger: true })) { removeEntry(entry.id); onClose(); } }}>{t("Löschen")}</Button>
      {!f.template && <Button icon={<Copy size={15} />} onClick={() => { if (valid && trySave("path", newId(), { ...f, template: true, archived: false, gameId: null, gameName: null, links: [], stages: f.stages.map((s) => ({ ...s, id: newId("s"), done: false, doneAt: null })) })) toast(t("Als Vorlage gespeichert")); }}>{t("Als Vorlage")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!valid} onClick={() => { if (trySave("path", entry.id, { ...f, title: f.title.trim() })) onClose(); }}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Titel")}><input className="input" value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
        {!f.template && <GamePicker value={f} onChange={(g) => set(g)} games={games} />}
        <Field label={t("Beschreibung")}><textarea className="input" rows={2} value={f.description ?? ""} maxLength={2000} onChange={(e) => set({ description: e.target.value })} /></Field>
        <div className="stack-sm">
          <b className="small">{t("Etappen")}</b>
          {f.stages.map((s, i) => (
            <div key={s.id} className="j-stage-edit">
              <div className="row nowrap">
                <input className="input grow" value={s.title} maxLength={160} aria-label={t("Etappe {n}", { n: i + 1 })} onChange={(e) => setStage(i, { title: e.target.value })} />
                <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} disabled={i === 0} aria-label={t("Nach oben")} onClick={() => move(i, -1)} />
                <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} disabled={i === f.stages.length - 1} aria-label={t("Nach unten")} onClick={() => move(i, 1)} />
                <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} disabled={f.stages.length === 1} aria-label={t("Etappe entfernen")} onClick={() => set({ stages: f.stages.filter((_, j) => j !== i) })} />
              </div>
              <div className="row" style={{ gap: 8 }}>
                <input className="input grow" value={s.reward ?? ""} maxLength={120} placeholder={t("Belohnung (optional, z. B. neues Spiel-Outfit)")} onChange={(e) => setStage(i, { reward: e.target.value })} />
                <label className="checkbox"><input type="checkbox" checked={!!s.milestone} onChange={(e) => setStage(i, { milestone: e.target.checked })} />{t("Meilenstein")}</label>
              </div>
            </div>
          ))}
          <div><Button size="sm" icon={<Plus size={14} />} disabled={f.stages.length >= 100} onClick={() => set({ stages: [...f.stages, { id: newId("s"), title: "", done: false }] })}>{t("Etappe hinzufügen")}</Button></div>
        </div>
        {!f.template && <LinkPicker value={f.links ?? []} onChange={(links) => set({ links })} selfId={entry.id} />}
      </div>
    </Modal>
  );
}

// ============================================================================================ F4 – Quest- und Fundsammlung

function FindsTab({ games, focus }: { games: Games; focus: string | null }) {
  const list = useJournal<Find>("find");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [fav, setFav] = useState(false);
  const [game, setGame] = useState("");
  const [sort, setSort] = useState<FindSort>("changed");
  const [edit, setEdit] = useState<Entry<Find> | "new" | null>(null);
  const tags = useMemo(() => allTags(list), [list]);
  const ref = game ? refOf(game, list as Entry<GameRef>[]) : null;
  const shown = useMemo(() => filterFinds(list, { q, category, status, tag, favorite: fav, game: ref }, sort), [list, q, category, status, tag, fav, ref, sort]);
  const counts = useMemo(() => Object.fromEntries(FIND_STATUS.map((s) => [s, list.filter((e) => e.data.status === s).length])), [list]);
  const cycle = (e: Entry<Find>) => { const i = FIND_STATUS.indexOf(e.data.status as typeof FIND_STATUS[number]); trySave("find", e.id, { ...e.data, status: FIND_STATUS[(i + 1) % FIND_STATUS.length] }); };
  return (
    <>
      <Card title={t("Quest- und Fundsammlung")} icon={<MapPin size={18} />}
        actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setEdit("new")}>{t("Neuer Fund")}</Button>}>
        {list.length === 0 ? <Empty icon={<MapPin size={28} />} title={t("Noch nichts gesammelt")} text={t("Quests, Gegenstände, Geheimnisse und Orte – mit Bildern, Tags und Status.")} /> : (
          <div className="stack-sm">
            <span className="tiny muted">{t("{o} offen · {f} gefunden · {d} erledigt", { o: counts.open, f: counts.found, d: counts.done })}</span>
            <div className="row" style={{ gap: 8 }}>
              <SearchBox value={q} onChange={setQ} />
              <GameFilter list={list as Entry<GameRef>[]} games={games} value={game} onChange={setGame} />
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={t("Kategorie")} style={{ maxWidth: 180 }}>
                <option value="">{t("Alle Kategorien")}</option>
                {FIND_CATEGORIES.map((c) => <option key={c} value={c}>{t(FIND_CATEGORY_LABEL[c])}</option>)}
              </select>
              <select className="input" value={sort} onChange={(e) => setSort(e.target.value as FindSort)} aria-label={t("Sortierung")} style={{ maxWidth: 180 }}>
                <option value="changed">{t("Zuletzt geändert")}</option><option value="title">{t("Name A–Z")}</option><option value="status">{t("Status")}</option>
              </select>
            </div>
            <div className="chips">
              <button type="button" className={`chip ${!status ? "on" : ""}`} onClick={() => setStatus("")}>{t("Alle")}</button>
              {FIND_STATUS.map((s) => <button key={s} type="button" className={`chip ${status === s ? "on" : ""}`} onClick={() => setStatus(status === s ? "" : s)}>{t(FIND_STATUS_LABEL[s])} ({counts[s]})</button>)}
              <button type="button" className={`chip ${fav ? "on" : ""}`} onClick={() => setFav(!fav)}><Star size={13} /> {t("Favoriten")}</button>
              {tags.map((tg) => <button key={tg} type="button" className={`chip ${tag === tg ? "on" : ""}`} onClick={() => setTag(tag === tg ? "" : tg)}>#{tg}</button>)}
            </div>
            <ExportImport kinds={["find"]} name="sammlung" />
          </div>
        )}
      </Card>
      {list.length > 0 && (shown.length === 0 ? <Card><Empty icon={<Search size={26} />} title={t("Nichts passt zum Filter")} /></Card> : (
        <div className="grid-3">
          {shown.map((e) => (
            <article key={e.id} className={`j-item ${focus === e.id ? "focus" : ""}`}>
              <div className="row between nowrap">
                <div className="grow">
                  <div className="tiny muted">{t(FIND_CATEGORY_LABEL[e.data.category] ?? e.data.category)}{gameLabel(e.data, games) && ` · ${gameLabel(e.data, games)}`}</div>
                  <b>{e.data.title}</b>
                </div>
                <Button size="sm" variant="ghost" icon={<Star size={15} fill={e.data.favorite ? "currentColor" : "none"} />} aria-label={e.data.favorite ? t("Kein Favorit mehr") : t("Favorit")} aria-pressed={!!e.data.favorite} onClick={() => trySave("find", e.id, { ...e.data, favorite: !e.data.favorite })} />
                <Button size="sm" variant="ghost" icon={<Pencil size={14} />} aria-label={t("Bearbeiten")} onClick={() => setEdit(e)} />
              </div>
              {e.data.where && <div className="small"><MapPin size={13} /> {e.data.where}</div>}
              {e.data.notes && <p className="small muted j-clamp" style={{ margin: 0 }}>{e.data.notes}</p>}
              <ImageStrip ids={e.data.imageIds?.slice(0, 4)} />
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className={`badge ${e.data.status === "done" ? "ok" : e.data.status === "found" ? "info" : "warn"} j-status`} onClick={() => cycle(e)} title={t("Antippen: nächster Status")}>{t(FIND_STATUS_LABEL[e.data.status] ?? e.data.status)}</button>
                {e.data.tags.map((tg) => <span key={tg} className="badge">#{tg}</span>)}
              </div>
              <LinkedList entry={e} />
            </article>
          ))}
        </div>
      ))}
      {edit && <FindEditor entry={edit === "new" ? null : edit} games={games} tags={tags} preset={ref ?? undefined} onClose={() => setEdit(null)} />}
    </>
  );
}

function FindEditor({ entry, games, tags, preset, onClose }: { entry: Entry<Find> | null; games: Games; tags: string[]; preset?: GameRef; onClose: () => void }) {
  const [id] = useState(entry?.id ?? newId());
  const [f, setF] = useState<Find>(entry?.data ?? { title: "", category: "quest", status: "open", tags: [], gameId: preset?.gameId ?? null, gameName: preset?.gameName ?? null, notes: "", where: "", favorite: false, imageIds: [], links: [] });
  const set = (p: Partial<Find>) => setF((x) => ({ ...x, ...p }));
  return (
    <Modal title={entry ? t("Fund bearbeiten") : t("Neuer Fund")} onClose={onClose} wide footer={<>
      {entry && <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Eintrag löschen?"), t("Der Eintrag wird auf allen Geräten gelöscht."), { danger: true })) { removeEntry(id); onClose(); } }}>{t("Löschen")}</Button>}
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!f.title.trim()} onClick={() => { if (trySave("find", id, { ...f, title: f.title.trim(), tags: cleanTags(f.tags) })) onClose(); }}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Name")}><input className="input" value={f.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} placeholder={t("z. B. Versteckte Truhe hinter dem Wasserfall")} /></Field>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label={t("Kategorie")}><select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>{FIND_CATEGORIES.map((c) => <option key={c} value={c}>{t(FIND_CATEGORY_LABEL[c])}</option>)}</select></Field>
          <Field label={t("Status")}><select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}>{FIND_STATUS.map((s) => <option key={s} value={s}>{t(FIND_STATUS_LABEL[s])}</option>)}</select></Field>
        </div>
        <GamePicker value={f} onChange={(g) => set(g)} games={games} />
        <Field label={t("Wo")}><input className="input" value={f.where ?? ""} maxLength={200} onChange={(e) => set({ where: e.target.value })} placeholder={t("Gebiet, Koordinaten, Beschreibung")} /></Field>
        <Field label={t("Notizen")}><textarea className="input" rows={3} value={f.notes ?? ""} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <TagInput value={f.tags} onChange={(v) => set({ tags: v })} suggestions={tags} />
        <Switch checked={!!f.favorite} onChange={(v) => set({ favorite: v })} label={t("Favorit")} />
        <ImagePicker value={f.imageIds ?? []} onChange={(imageIds) => set({ imageIds })} />
        <LinkPicker value={f.links ?? []} onChange={(links) => set({ links })} selfId={id} />
      </div>
    </Modal>
  );
}

// ============================================================================================ F8 – Story ohne Spoiler

function StoryTab({ games, focus }: { games: Games; focus: string | null }) {
  const list = useJournal<Story>("story");
  const [open, setOpen] = useState<string | null>(focus);
  const cur = list.find((e) => e.id === open);
  const create = () => {
    const id = newId();
    if (trySave("story", id, { title: t("Neue Story"), chapters: [], characters: [], questions: [], progressId: null, links: [] } satisfies Story)) setOpen(id);
  };
  if (cur) return <StoryView e={cur} games={games} onBack={() => setOpen(null)} />;
  return (
    <Card title={t("Story-Zusammenfassung ohne Spoiler")} icon={<BookOpen size={18} />} actions={<Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={create}>{t("Neue Story")}</Button>}>
      <p className="small muted" style={{ marginTop: 0 }}>{t("Deine eigene Zusammenfassung: Kapitel, Figuren, offene Fragen und wie weit du bist. Die spoilerfreie Ansicht zeigt nichts, was hinter deinem Stand liegt oder als Spoiler markiert ist.")}</p>
      {list.length === 0 ? <Empty icon={<BookOpen size={28} />} title={t("Noch keine Story angelegt")} /> : (
        <div className="stack-sm">
          {list.map((e) => {
            const v = spoilerFree(e.data);
            return (
              <button key={e.id} type="button" className="j-hit" onClick={() => setOpen(e.id)}>
                <BookOpen size={15} /> <b>{e.data.title}</b>
                <span className="tiny muted">{gameLabel(e.data, games)} · {t("Kapitel {a}/{b}", { a: v.reached + 1, b: e.data.chapters.length })} · {t("{n} offene Fragen", { n: e.data.questions.filter((q) => !q.answered).length })}</span>
              </button>
            );
          })}
          <ExportImport kinds={["story"]} name="story" />
        </div>
      )}
    </Card>
  );
}

function StoryView({ e, games, onBack }: { e: Entry<Story>; games: Games; onBack: () => void }) {
  const s = e.data;
  const [safe, setSafe] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const v = spoilerFree(s);
  const save = (p: Partial<Story>) => trySave("story", e.id, { ...s, ...p });
  const reveal = (id: string) => setRevealed((r) => new Set(r).add(id));
  const Hidden = ({ id, why }: { id: string; why: "ahead" | "spoiler" }) => (
    <button type="button" className="j-spoiler" onClick={() => reveal(id)}><EyeOff size={14} /> {why === "ahead" ? t("Liegt hinter deinem Stand – antippen zum Zeigen") : t("Spoiler – antippen zum Zeigen")}</button>
  );
  const show = (id: string, hidden: string | null) => !safe || !hidden || revealed.has(id);
  return (
    <>
      <Card title={s.title} icon={<BookOpen size={18} />} meta={gameLabel(s, games)} actions={<div className="row" style={{ gap: 6 }}>
        <Button size="sm" onClick={onBack}>{t("Zurück")}</Button>
        <Button size="sm" variant="primary" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>{t("Bearbeiten")}</Button>
      </div>}>
        <div className="stack-sm">
          <Field label={t("Dein Stand (zuletzt erreichtes Kapitel)")}>
            <select className="input" value={s.progressId ?? ""} onChange={(ev) => save({ progressId: ev.target.value || null })}>
              <option value="">{t("Noch nicht begonnen")}</option>
              {s.chapters.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {show(c.id, c.spoiler ? "spoiler" : null) ? c.title : t("Kapitel {n}", { n: i + 1 })}</option>)}
            </select>
          </Field>
          <Switch checked={safe} onChange={(x) => { setSafe(x); setRevealed(new Set()); }} label={t("Spoilerfreie Ansicht")} hint={safe && v.hiddenCount ? t("{n} Einträge verborgen", { n: v.hiddenCount }) : undefined} />
          <LinkedList entry={e} />
        </div>
      </Card>
      <div className="grid-2">
        <Card title={t("Kapitel")} meta={`${v.reached + 1}/${s.chapters.length}`}>
          {s.chapters.length === 0 ? <p className="small muted">{t("Noch keine Kapitel – unter „Bearbeiten“ anlegen.")}</p> : (
            <ol className="j-stages">
              {v.chapters.map((c, i) => (
                <li key={c.id} className={i <= v.reached ? "done" : ""}>
                  {show(c.id, c.hidden) ? <div><b>{c.title}</b>{c.summary && <p className="small muted" style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{c.summary}</p>}</div> : <Hidden id={c.id} why={c.hidden!} />}
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title={t("Figuren")}>
          {s.characters.length === 0 ? <p className="small muted">{t("Noch keine Figuren.")}</p> : (
            <div className="stack-sm">{v.characters.map((c) => <div key={c.id} className="small">{show(c.id, c.hidden) ? <><b>{c.name}</b>{c.note && ` – ${c.note}`}</> : <Hidden id={c.id} why={c.hidden!} />}</div>)}</div>
          )}
        </Card>
        <Card title={t("Offene Fragen")}>
          {s.questions.length === 0 ? <p className="small muted">{t("Keine Fragen notiert.")}</p> : (
            <div className="stack-sm">{v.questions.map((q) => (
              <div key={q.id} className="small">
                {show(q.id, q.hidden) ? <>
                  <label className="checkbox"><input type="checkbox" checked={!!q.answered} onChange={() => save({ questions: s.questions.map((x) => x.id === q.id ? { ...x, answered: !x.answered } : x) })} /><span className={q.answered ? "muted" : ""}>{q.text}</span></label>
                  {q.answer && (show(q.id + ":a", safe && q.answerHidden ? "spoiler" : null) ? <div className="muted" style={{ paddingLeft: 26 }}>{q.answer}</div> : <div style={{ paddingLeft: 26 }}><button type="button" className="j-spoiler" onClick={() => reveal(q.id + ":a")}><Eye size={14} /> {t("Antwort zeigen")}</button></div>)}
                </> : <Hidden id={q.id} why={q.hidden!} />}
              </div>
            ))}</div>
          )}
        </Card>
      </div>
      {editing && <StoryEditor e={e} games={games} onClose={() => setEditing(false)} onDeleted={onBack} />}
    </>
  );
}

function StoryEditor({ e, games, onClose, onDeleted }: { e: Entry<Story>; games: Games; onClose: () => void; onDeleted: () => void }) {
  const [f, setF] = useState<Story>(e.data);
  const set = (p: Partial<Story>) => setF((x) => ({ ...x, ...p }));
  function listEditor<T extends { id: string }>(key: "chapters" | "characters" | "questions", items: T[], render: (x: T, upd: (p: Partial<T>) => void) => ReactNode, blank: () => T) {
    const upd = (i: number) => (p: Partial<T>) => set({ [key]: items.map((x, j) => j === i ? { ...x, ...p } : x) } as Partial<Story>);
    const move = (i: number, d: number) => { const s = [...items]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); set({ [key]: s } as Partial<Story>); };
    return (
      <div className="stack-sm">
        {items.map((x, i) => (
          <div key={x.id} className="j-stage-edit">
            {render(x, upd(i))}
            <div className="row" style={{ gap: 4 }}>
              <Button size="sm" variant="ghost" icon={<ArrowUp size={14} />} disabled={i === 0} aria-label={t("Nach oben")} onClick={() => move(i, -1)} />
              <Button size="sm" variant="ghost" icon={<ArrowDown size={14} />} disabled={i === items.length - 1} aria-label={t("Nach unten")} onClick={() => move(i, 1)} />
              <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={t("Entfernen")} onClick={() => set({ [key]: items.filter((_, j) => j !== i) } as Partial<Story>)} />
            </div>
          </div>
        ))}
        <div><Button size="sm" icon={<Plus size={14} />} disabled={items.length >= 200} onClick={() => set({ [key]: [...items, blank()] } as Partial<Story>)}>{t("Hinzufügen")}</Button></div>
      </div>
    );
  }
  const spoiler = (v: boolean | undefined, on: (v: boolean) => void) => <label className="checkbox"><input type="checkbox" checked={!!v} onChange={(ev) => on(ev.target.checked)} />{t("Spoiler")}</label>;
  const valid = f.title.trim() && f.chapters.every((c) => c.title.trim()) && f.characters.every((c) => c.name.trim()) && f.questions.every((q) => q.text.trim());
  return (
    <Modal title={t("Story bearbeiten")} onClose={onClose} wide footer={<>
      <Button variant="danger" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Story löschen?"), t("Die Story wird auf allen Geräten gelöscht."), { danger: true })) { removeEntry(e.id); onClose(); onDeleted(); } }}>{t("Löschen")}</Button>
      <Button onClick={onClose}>{t("Abbrechen")}</Button>
      <Button variant="primary" disabled={!valid} onClick={() => {
        const ids = new Set(f.chapters.map((c) => c.id));
        if (trySave("story", e.id, { ...f, title: f.title.trim(), progressId: f.progressId && ids.has(f.progressId) ? f.progressId : null, characters: f.characters.map((c) => ({ ...c, chapterId: c.chapterId && ids.has(c.chapterId) ? c.chapterId : null })) })) onClose();
      }}>{t("Speichern")}</Button>
    </>}>
      <div className="stack">
        <Field label={t("Titel")}><input className="input" value={f.title} maxLength={120} onChange={(ev) => set({ title: ev.target.value })} /></Field>
        <GamePicker value={f} onChange={(g) => set(g)} games={games} />
        <b className="small">{t("Kapitel")}</b>
        {listEditor("chapters", f.chapters, (c, upd) => <>
          <input className="input" value={c.title} maxLength={160} placeholder={t("Kapitel-Titel")} onChange={(ev) => upd({ title: ev.target.value })} />
          <textarea className="input" rows={2} value={c.summary ?? ""} maxLength={4000} placeholder={t("Was passiert (deine Worte)")} onChange={(ev) => upd({ summary: ev.target.value })} />
          {spoiler(c.spoiler, (v) => upd({ spoiler: v }))}
        </>, (): Chapter => ({ id: newId("c"), title: "" }))}
        <b className="small">{t("Figuren")}</b>
        {listEditor("characters", f.characters, (c, upd) => <>
          <input className="input" value={c.name} maxLength={100} placeholder={t("Name")} onChange={(ev) => upd({ name: ev.target.value })} />
          <input className="input" value={c.note ?? ""} maxLength={500} placeholder={t("Wer ist das? (deine Notiz)")} onChange={(ev) => upd({ note: ev.target.value })} />
          <div className="row" style={{ gap: 8 }}>
            <select className="input" style={{ maxWidth: 240 }} value={c.chapterId ?? ""} aria-label={t("Taucht auf in")} onChange={(ev) => upd({ chapterId: ev.target.value || null })}>
              <option value="">{t("Taucht auf in: –")}</option>
              {f.chapters.map((ch, i) => <option key={ch.id} value={ch.id}>{t("Taucht auf in")}: {i + 1}. {ch.title}</option>)}
            </select>
            {spoiler(c.spoiler, (v) => upd({ spoiler: v }))}
          </div>
        </>, (): Character => ({ id: newId("p"), name: "" }))}
        <b className="small">{t("Offene Fragen")}</b>
        {listEditor("questions", f.questions, (q, upd) => <>
          <input className="input" value={q.text} maxLength={300} placeholder={t("Frage")} onChange={(ev) => upd({ text: ev.target.value })} />
          <input className="input" value={q.answer ?? ""} maxLength={1000} placeholder={t("Antwort (falls bekannt – wird in der spoilerfreien Ansicht verdeckt)")} onChange={(ev) => upd({ answer: ev.target.value })} />
          <div className="row" style={{ gap: 8 }}>
            <label className="checkbox"><input type="checkbox" checked={!!q.answered} onChange={(ev) => upd({ answered: ev.target.checked })} />{t("Beantwortet")}</label>
            {spoiler(q.spoiler, (v) => upd({ spoiler: v }))}
          </div>
        </>, (): Question => ({ id: newId("q"), text: "" }))}
        <LinkPicker value={f.links ?? []} onChange={(links) => set({ links })} selfId={e.id} />
      </div>
    </Modal>
  );
}
