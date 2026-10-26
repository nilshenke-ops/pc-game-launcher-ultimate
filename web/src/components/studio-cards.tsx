// F6 own collector cards: gallery with filters, editor with live preview, duplicate, export as picture, share.

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, IdCard, Plus, Share2, Star, Trash2, X } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { newId, useJournal, type Entry } from "../lib/journal";
import { CARD_H, CARD_W, cardImageIds, drawCard, duplicateCard, newCard, RARITIES, sanitizeCard, type Card, type CardBg, type Rarity } from "../lib/cards";
import { safeName } from "../lib/design";
import { removeWithLinks } from "./collection-view";
import { GamePicker, SearchBox, TagInput, trySave, useGames } from "./journal-ui";
import { canShareFiles, downloadCanvas, loadImages, PictureButton, shareCanvas, useImages } from "./studio-shared";
import { Banner, Button, confirmDialog, Empty, Field, Modal, Segmented, Switch } from "./ui";

const BGS: { value: CardBg; label: string }[] = [{ value: "gradient", label: "Verlauf" }, { value: "stripes", label: "Streifen" }, { value: "dots", label: "Punkte" }, { value: "grid", label: "Raster" }, { value: "plain", label: "Einfarbig" }];

export function CardCanvas({ card, scale = 0.4, canvasRef }: { card: Card; scale?: number; canvasRef?: React.RefObject<HTMLCanvasElement | null> }) {
  const own = useRef<HTMLCanvasElement>(null);
  const ref = canvasRef ?? own;
  const images = useImages(cardImageIds(card));
  const rar = t(RARITIES.find((r) => r.id === card.rarity)!.label);
  useEffect(() => { if (ref.current) drawCard(ref.current, card, images, { scale, rarityLabel: rar }); }, [card, images, scale, rar, ref]);
  return <canvas ref={ref} className="studio-card-canvas" style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }} aria-label={card.title} role="img" />;
}

export function CardsView({ focus }: { focus: string | null }) {
  const cards = useJournal<Card>("card");
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<Rarity | "">("");
  const [coll, setColl] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [edit, setEdit] = useState<{ id: string; card: Card } | null>(() => { const e = focus ? cards.find((c) => c.id === focus) : null; return e ? { id: e.id, card: sanitizeCard(e.data) } : null; });
  const collections = useMemo(() => [...new Set(cards.map((c) => c.data.collection).filter(Boolean))].sort(), [cards]);
  const shown = cards.filter((c) => {
    const d = c.data;
    if (rarity && d.rarity !== rarity) return false;
    if (coll && d.collection !== coll) return false;
    if (favOnly && !d.favorite) return false;
    const s = q.trim().toLowerCase();
    return !s || [d.title, d.description, d.category, d.game?.gameName, ...(d.tags ?? [])].some((x) => (x ?? "").toLowerCase().includes(s));
  });
  return (
    <div className="stack">
      <p className="small muted">{t("Selbst gestaltete Karten – die Seltenheit ist nur die Optik, die du auswählst. Es gibt nichts zu kaufen und keine Zufallsziehung.")}</p>
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEdit({ id: newId(), card: newCard() })}>{t("Neue Karte")}</Button>
        <div className="grow" style={{ minWidth: 180 }}><SearchBox value={q} onChange={setQ} /></div>
        <select className="input" style={{ width: "auto" }} value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "")} aria-label={t("Seltenheit")}>
          <option value="">{t("Alle Seltenheiten")}</option>{RARITIES.map((r) => <option key={r.id} value={r.id}>{t(r.label)}</option>)}
        </select>
        {collections.length > 0 && <select className="input" style={{ width: "auto" }} value={coll} onChange={(e) => setColl(e.target.value)} aria-label={t("Sammlung")}>
          <option value="">{t("Alle Sammlungen")}</option>{collections.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>}
        <Button size="sm" variant={favOnly ? "primary" : "ghost"} icon={<Star size={15} />} onClick={() => setFavOnly(!favOnly)}>{t("Favoriten")}</Button>
      </div>
      {cards.length === 0 ? <Empty icon={<IdCard size={28} />} title={t("Noch keine Sammelkarten")} text={t("Gestalte deine erste Karte: Bild, Name, Werte und Rahmen.")} action={<Button variant="primary" onClick={() => setEdit({ id: newId(), card: newCard() })}>{t("Neue Karte")}</Button>} /> :
        shown.length === 0 ? <p className="small muted">{t("Keine Karte passt zum Filter.")}</p> : (
          <div className="studio-cards">
            {shown.map((c) => (
              <button key={c.id} type="button" className="studio-card-tile" onClick={() => setEdit({ id: c.id, card: sanitizeCard(c.data) })} aria-label={c.data.title}>
                <CardCanvas card={sanitizeCard(c.data)} scale={0.36} />
                {c.data.favorite && <Star size={16} className="studio-fav" fill="currentColor" />}
              </button>
            ))}
          </div>
        )}
      {edit && <CardEditor id={edit.id} initial={edit.card} exists={cards.some((c) => c.id === edit.id)} collections={collections} onClose={() => setEdit(null)} onOpen={(e) => setEdit({ id: e.id, card: sanitizeCard(e.data) })} />}
    </div>
  );
}

function CardEditor({ id, initial, exists, collections, onClose, onOpen }: { id: string; initial: Card; exists: boolean; collections: string[]; onClose: () => void; onOpen: (e: Entry<Card>) => void }) {
  const [c, setC] = useState(initial);
  const games = useGames();
  const cv = useRef<HTMLCanvasElement>(null);
  const set = (p: Partial<Card>) => setC((x) => sanitizeCard({ ...x, ...p }));
  const setStat = (i: number, p: Partial<Card["stats"][number]>) => setC((x) => ({ ...x, stats: x.stats.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const save = () => { const clean = sanitizeCard(c); if (trySave("card", id, clean)) { toast(t("Gespeichert"), "success"); onClose(); } };
  const duplicate = () => { const nid = newId(); const copy = duplicateCard(c); if (trySave("card", nid, copy)) { toast(t("Kopie angelegt"), "success"); onOpen({ id: nid, kind: "card", updatedAt: Date.now(), data: copy }); } };
  const remove = async () => { if (await confirmDialog(t("Karte löschen?"), t("„{n}“ wird gelöscht und aus Ausstellungen entfernt.", { n: c.title }), { danger: true, ok: t("Löschen") })) { removeWithLinks(id); onClose(); } };
  const exportCard = async () => { const big = document.createElement("canvas"); drawCard(big, c, await loadImages(cardImageIds(c)), { scale: 1, rarityLabel: t(RARITIES.find((r) => r.id === c.rarity)!.label) }); await downloadCanvas(big, safeName(c.title)); };
  const share = async () => { const big = document.createElement("canvas"); drawCard(big, c, await loadImages(cardImageIds(c)), { scale: 1, rarityLabel: t(RARITIES.find((r) => r.id === c.rarity)!.label) }); await shareCanvas(big, safeName(c.title), c.title); };
  return (
    <Modal title={<><IdCard size={18} /> {exists ? t("Sammelkarte bearbeiten") : t("Neue Sammelkarte")}</>} onClose={onClose} wide
      footer={<>
        {exists && <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove}>{t("Löschen")}</Button>}
        {exists && <Button variant="ghost" icon={<Copy size={15} />} onClick={duplicate}>{t("Duplizieren")}</Button>}
        <Button variant="ghost" icon={<Download size={15} />} onClick={() => void exportCard()}>{t("Als Bild speichern")}</Button>
        {canShareFiles() && <Button variant="ghost" icon={<Share2 size={15} />} onClick={() => void share()}>{t("Teilen")}</Button>}
        <Button variant="primary" onClick={save}>{t("Speichern")}</Button>
      </>}>
      <div className="studio-split">
        <div className="studio-preview"><CardCanvas card={c} scale={0.6} canvasRef={cv} /></div>
        <div className="stack-sm">
          <Field label={t("Name")}><input className="input" value={c.title} maxLength={40} onChange={(e) => setC({ ...c, title: e.target.value })} /></Field>
          <Field label={t("Beschreibung")}><textarea className="input" rows={3} maxLength={240} value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></Field>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <PictureButton onPick={(imageId) => set({ imageId })} label={t("Eigenes Bild")} />
            {c.imageId && <Button size="sm" variant="ghost" icon={<X size={15} />} onClick={() => set({ imageId: null })}>{t("Bild entfernen")}</Button>}
          </div>
          <GamePicker value={c.game} onChange={(g) => set({ game: { gameId: g.gameId ?? null, gameName: g.gameName ?? null } })} games={games} />
          <Field label={t("Seltenheit (nur Optik)")}>
            <Segmented value={c.rarity} onChange={(v) => set({ rarity: v })} label={t("Seltenheit")} options={RARITIES.map((r) => ({ value: r.id, label: t(r.label) }))} />
          </Field>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <Field label={t("Farbe 1")}><input type="color" value={c.c1} onChange={(e) => set({ c1: e.target.value })} /></Field>
            <Field label={t("Farbe 2")}><input type="color" value={c.c2} onChange={(e) => set({ c2: e.target.value })} /></Field>
            <Field label={t("Schrift")}><input type="color" value={c.textColor} onChange={(e) => set({ textColor: e.target.value })} /></Field>
            <Field label={t("Hintergrund")}>
              <select className="input" value={c.bg} onChange={(e) => set({ bg: e.target.value as CardBg })}>{BGS.map((b) => <option key={b.value} value={b.value}>{t(b.label)}</option>)}</select>
            </Field>
          </div>
          <Field label={t("Eigene Werte (bis 6)")}>
            <div className="stack-sm">
              {c.stats.map((s, i) => (
                <div key={i} className="studio-stat">
                  <input className="input" placeholder={t("Name")} maxLength={20} value={s.label} onChange={(e) => setStat(i, { label: e.target.value })} aria-label={t("Name")} />
                  <input className="input" placeholder={t("Wert")} aria-label={t("Wert")} maxLength={14} value={s.value} onChange={(e) => setStat(i, { value: e.target.value })} />
                  <Button size="sm" variant="ghost" icon={<X size={14} />} aria-label={t("Entfernen")} onClick={() => setC({ ...c, stats: c.stats.filter((_, j) => j !== i) })} />
                </div>
              ))}
              {c.stats.length < 6 && <div><Button size="sm" icon={<Plus size={14} />} onClick={() => setC({ ...c, stats: [...c.stats, { label: "", value: "" }] })}>{t("Wert hinzufügen")}</Button></div>}
            </div>
          </Field>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Field label={t("Kategorie")}><input className="input" maxLength={40} value={c.category} onChange={(e) => setC({ ...c, category: e.target.value })} /></Field>
            <Field label={t("Sammlung")}><input className="input" list="card-colls" maxLength={40} value={c.collection} onChange={(e) => setC({ ...c, collection: e.target.value })} /><datalist id="card-colls">{collections.map((x) => <option key={x} value={x} />)}</datalist></Field>
          </div>
          <Field label={t("Tags")}><TagInput value={c.tags} onChange={(tags) => setC({ ...c, tags })} /></Field>
          <Switch checked={c.favorite} onChange={(favorite) => setC({ ...c, favorite })} label={t("Favorit")} />
          {!c.imageId && <Banner kind="info">{t("Nimm eigene Bilder oder Bilder, die du verwenden darfst – Nexus lädt keine Bilder aus dem Internet.")}</Banner>}
        </div>
      </div>
    </Modal>
  );
}
