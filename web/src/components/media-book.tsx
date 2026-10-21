// F4 Gaming-Erinnerungsbuch: special moments as a timeline (year → month), with pictures, museum photos, media links,
// tags, categories, favorites and archive. A note from the game memory ("Spielgedächtnis") can become a page.

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, BookHeart, BookOpen, ExternalLink, Heart, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { getEntry, newId, useJournal, type Entry } from "../lib/journal";
import { matchesQuery, norm, type Memory } from "../lib/journal-logic";
import { blank, type Data } from "../lib/collections";
import { BOOK } from "../lib/collection-schemas";
import { timeline } from "../lib/media";
import { Button, Card, confirmDialog, Empty, Modal } from "./ui";
import { ExportImport, gameLabel, ImageStrip, JImage, LinkedList, SearchBox, trySave, useGames } from "./journal-ui";
import { EntryEditor, removeWithLinks } from "./collection-view";
import type { Photo } from "./media-shared";

interface BookEntry { title: string; date: string; game?: { gameId?: string | null; gameName?: string | null }; category?: string | null; text?: string; imageIds?: string[]; media?: { label?: string; url: string }[]; tags?: string[]; favorite?: boolean; archived?: boolean; links?: string[] }

const CATS = BOOK.fields.find((f) => f.key === "category")!.options!;
const catLabel = (v?: string | null) => (v ? t(CATS.find((c) => c.value === v)?.label ?? v) : "");
const MONTHS = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(undefined, { month: "long" });

export function MemoryBook({ focus }: { focus?: string | null }) {
  const list = useJournal<BookEntry>("book");
  const games = useGames();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [game, setGame] = useState("");
  const [tag, setTag] = useState("");
  const [fav, setFav] = useState(false);
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState<string | null>(focus ?? null);
  const [edit, setEdit] = useState<{ id: string; data: Data; isNew: boolean } | null>(null);
  const [fromMemory, setFromMemory] = useState(false);

  const gameNames = useMemo(() => [...new Set(list.map((e) => gameLabel(e.data.game ?? {}, games)).filter(Boolean))].sort(), [list, games]);
  const tags = useMemo(() => [...new Set(list.flatMap((e) => e.data.tags ?? []))].sort(), [list]);
  const shown = list.filter((e) => !!e.data.archived === archived && matchesQuery(e, q) && (!cat || e.data.category === cat) && (!game || gameLabel(e.data.game ?? {}, games) === game)
    && (!tag || (e.data.tags ?? []).some((x) => norm(x) === norm(tag))) && (!fav || e.data.favorite));
  const tl = timeline(shown.map((e) => ({ date: e.data.date, e })));
  const cur = open ? list.find((e) => e.id === open) : undefined;
  const startNew = (data: Partial<BookEntry> = {}) => setEdit({ id: newId(), data: { ...blank(BOOK), date: new Date().toISOString().slice(0, 10), ...data }, isNew: true });

  return (
    <>
      <Card title={t("Erinnerungsbuch")} icon={<BookHeart size={18} />} meta={list.length ? String(list.filter((e) => !e.data.archived).length) : undefined}
        actions={<span className="row nowrap" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" icon={<BookOpen size={15} />} onClick={() => setFromMemory(true)}>{t("Aus „Wo war ich?“")}</Button>
          <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => startNew()}>{t("Neu")}</Button>
        </span>}>
        <div className="small muted" style={{ marginBottom: 10 }}>{t("Besondere Gaming-Momente mit eigener Geschichte, Bildern und Links – als Zeitleiste. Funktioniert ohne PC.")}</div>
        {list.length === 0 ? <Empty icon={<BookHeart size={24} />} title={t("Noch keine Erinnerungen")} text={t("Schreib den ersten Moment auf – oder übernimm eine Notiz aus „Wo war ich?“ oder ein Foto aus dem Museum.")} /> : (
          <div className="stack-sm">
            <div className="row" style={{ gap: 8 }}>
              <SearchBox value={q} onChange={setQ} />
              <select className="input" style={{ maxWidth: 200 }} value={cat} aria-label={t("Kategorie")} onChange={(e) => setCat(e.target.value)}><option value="">{t("Kategorie")}: {t("alle")}</option>{CATS.map((c) => <option key={c.value} value={c.value}>{t(c.label)}</option>)}</select>
              {gameNames.length > 0 && <select className="input" style={{ maxWidth: 200 }} value={game} aria-label={t("Spiel")} onChange={(e) => setGame(e.target.value)}><option value="">{t("Spiel")}: {t("alle")}</option>{gameNames.map((g) => <option key={g} value={g}>{g}</option>)}</select>}
            </div>
            <div className="chips">
              <button type="button" className={`chip ${fav ? "on" : ""}`} aria-pressed={fav} onClick={() => setFav(!fav)}><Heart size={13} /> {t("Favoriten")}</button>
              {tags.map((tg) => <button key={tg} type="button" className={`chip ${tag === tg ? "on" : ""}`} aria-pressed={tag === tg} onClick={() => setTag(tag === tg ? "" : tg)}>#{tg}</button>)}
              <button type="button" className={`chip ${archived ? "on" : ""}`} aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive size={13} /> {t("Archiv")} ({list.filter((e) => e.data.archived).length})</button>
            </div>
            <ExportImport kinds={["book"]} name="erinnerungsbuch" />
          </div>
        )}
      </Card>
      {list.length > 0 && (tl.length === 0 ? <Card><Empty icon={<Search size={24} />} title={t("Nichts passt zum Filter")} /></Card> : (
        <div className="m-timeline">
          {tl.map((y) => (
            <section key={y.year} aria-label={String(y.year)}>
              <h3 className="m-year">{y.year}</h3>
              {y.months.map((m) => (
                <div key={m.month} className="m-month">
                  <div className="m-month-label tiny muted">{MONTHS(m.month)}</div>
                  <div className="stack-sm">
                    {m.items.map(({ e }) => {
                      const first = e.data.imageIds?.[0] ?? (e.data.links ?? []).map((id) => getEntry<Photo>(id)).find((x) => x?.kind === "photo")?.data.thumbId;
                      return (
                        <button key={e.id} type="button" className={`j-item m-book-card ${focus === e.id ? "focus" : ""}`} onClick={() => setOpen(e.id)}>
                          {first && <span className="m-book-img"><JImage id={first} /></span>}
                          <span className="stack-sm" style={{ minWidth: 0 }}>
                            <b>{e.data.title}{e.data.favorite ? " ★" : ""}</b>
                            <span className="tiny muted">{[new Date(e.data.date).toLocaleDateString(), gameLabel(e.data.game ?? {}, games), catLabel(e.data.category)].filter(Boolean).join(" · ")}</span>
                            {e.data.text && <span className="small m-excerpt">{e.data.text.slice(0, 180)}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ))}
      {cur && !edit && <BookDetail e={cur} onClose={() => setOpen(null)} onEdit={() => setEdit({ id: cur.id, data: cur.data as unknown as Data, isNew: false })} />}
      {edit && <EntryEditor schema={BOOK} id={edit.id} initial={edit.data} isNew={edit.isNew} games={games} onClose={(saved) => { setEdit(null); if (saved) setOpen(edit.id); }} />}
      {fromMemory && <MemoryPicker onClose={() => setFromMemory(false)} onPick={(m) => {
        setFromMemory(false);
        const d = m.data;
        startNew({ title: d.did.slice(0, 120), date: (d.at ?? new Date().toISOString()).slice(0, 10), game: { gameId: d.gameId ?? null, gameName: d.gameName ?? null }, text: [d.where && `${t("Wo")}: ${d.where}`, d.did, d.next && `${t("Als Nächstes")}: ${d.next}`, d.notes].filter(Boolean).join("\n\n"), imageIds: d.imageIds ?? [], links: [m.id] });
      }} />}
    </>
  );
}

function BookDetail({ e, onClose, onEdit }: { e: Entry<BookEntry>; onClose: () => void; onEdit: () => void }) {
  const games = useGames();
  const d = e.data;
  const photos = (d.links ?? []).map((id) => getEntry<Photo>(id)).filter((x): x is Entry<Photo> => x?.kind === "photo");
  return (
    <Modal title={d.title} wide onClose={onClose} footer={<>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog(t("Eintrag löschen?"), t("Er wird auf allen Geräten gelöscht. Verknüpfungen anderer Einträge auf ihn werden entfernt."), { danger: true, ok: t("Löschen") })) { removeWithLinks(e.id); onClose(); } }}>{t("Löschen")}</Button>
      <Button variant="ghost" icon={d.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />} onClick={() => { trySave("book", e.id, { ...d, archived: !d.archived }); onClose(); }}>{d.archived ? t("Zurückholen") : t("Archivieren")}</Button>
      <Button variant="primary" icon={<Pencil size={15} />} onClick={onEdit}>{t("Bearbeiten")}</Button>
    </>}>
      <div className="stack">
        <span className="small muted">{[new Date(d.date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), gameLabel(d.game ?? {}, games), catLabel(d.category)].filter(Boolean).join(" · ")}</span>
        <div><Button size="sm" icon={<Heart size={15} fill={d.favorite ? "currentColor" : "none"} />} aria-pressed={!!d.favorite} onClick={() => trySave("book", e.id, { ...d, favorite: !d.favorite })}>{d.favorite ? t("Favorit") : t("Als Favorit")}</Button></div>
        {d.text && <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{d.text}</p>}
        <ImageStrip ids={d.imageIds} />
        {photos.length > 0 && <div className="stack-sm"><span className="tiny muted">{t("Aus dem Fotomuseum")}</span><div className="j-thumbs small">{photos.map((p) => <a key={p.id} className="j-thumb" href={`#/media?tab=museum&id=${p.id}`} aria-label={p.data.title}><JImage id={p.data.thumbId || p.data.imageId} /></a>)}</div></div>}
        {(d.media ?? []).length > 0 && <div className="stack-sm"><span className="tiny muted">{t("Medienverweise")}</span>{d.media!.map((m, i) => <a key={i} className="j-link-chip" href={m.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> {m.label || m.url}</a>)}</div>}
        {(d.tags ?? []).length > 0 && <div className="row" style={{ gap: 4 }}>{d.tags!.map((tg) => <span key={tg} className="badge">#{tg}</span>)}</div>}
        <LinkedList entry={e} />
      </div>
    </Modal>
  );
}

function MemoryPicker({ onClose, onPick }: { onClose: () => void; onPick: (m: Entry<Memory>) => void }) {
  const memories = useJournal<Memory>("memory");
  const games = useGames();
  const [q, setQ] = useState("");
  const hits = memories.filter((m) => matchesQuery(m, q)).sort((a, b) => Date.parse(b.data.at) - Date.parse(a.data.at)).slice(0, 50);
  return (
    <Modal title={t("Aus „Wo war ich?“")} onClose={onClose}>
      {memories.length === 0 ? <Empty icon={<BookOpen size={22} />} title={t("Noch keine Notizen unter „Wo war ich?“")} text={t("Notizen schreibst du im Spiele-Journal unter „Wo war ich?“.")} /> : (
        <div className="stack-sm">
          <SearchBox value={q} onChange={setQ} />
          {hits.map((m) => (
            <button key={m.id} type="button" className="j-hit" onClick={() => { onPick(m); toast(t("Übernommen – prüfen und speichern"), "info"); }}>
              <b className="small">{m.data.did.slice(0, 80)}</b> <span className="tiny muted">{[new Date(m.data.at).toLocaleDateString(), gameLabel(m.data, games)].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
