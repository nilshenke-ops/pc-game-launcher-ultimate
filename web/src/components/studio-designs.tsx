// Gallery of own posters/covers (F8) or banners/profile pictures (F9): new from a format, open, duplicate, download.

import { useState } from "react";
import { Copy, Download, Frame, PanelTop, Plus } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { newId, useJournal, type Entry } from "../lib/journal";
import { FORMATS, MAX_SIDE, MIN_SIDE, newDesign, safeName, sanitizeDesign, type Design } from "../lib/design";
import { JImage, SearchBox, trySave } from "./journal-ui";
import { DesignEditor } from "./design-editor";
import { Button, Empty, Field, Modal } from "./ui";
import { imageUrl } from "../lib/journal";

export function DesignsView({ area, focus }: { area: "poster" | "banner"; focus: string | null }) {
  const all = useJournal<Design>("design");
  const list = all.filter((e) => (e.data.area === "banner" ? "banner" : "poster") === area);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState(false);
  const [edit, setEdit] = useState<{ id: string; d: Design; exists: boolean } | null>(() => { const e = focus ? all.find((x) => x.id === focus) : null; return e ? { id: e.id, d: sanitizeDesign(e.data), exists: true } : null; });
  const shown = list.filter((e) => { const s = q.trim().toLowerCase(); return !s || [e.data.title, e.data.game?.gameName, ...(e.data.tags ?? [])].some((x) => (x ?? "").toLowerCase().includes(s)); });
  const duplicate = (e: Entry<Design>) => { const id = newId(); if (trySave("design", id, sanitizeDesign({ ...e.data, title: `${e.data.title} (Kopie)`.slice(0, 80) }))) toast(t("Kopie angelegt"), "success"); };
  const download = async (e: Entry<Design>) => {
    const url = e.data.renderId ? await imageUrl(e.data.renderId) : null;
    if (!url) { toast(t("Das gespeicherte Bild ist auf diesem Gerät nicht vorhanden – Entwurf öffnen und „PNG“ wählen."), "error"); return; }
    const a = document.createElement("a"); a.href = url; a.download = `${safeName(e.data.title)}.jpg`; a.click();
  };
  const Icon = area === "banner" ? PanelTop : Frame;
  return (
    <div className="stack">
      <p className="small muted">{area === "banner"
        ? t("Banner, Header und Profilbilder in passenden Formaten. Gespeichert wird auf diesem Gerät (und beim PC); hochladen musst du selbst – Nexus veröffentlicht nichts.")
        : t("Poster und eigene Cover mit Text, Formen und eigenen Bildern. Verwende nur Bilder, die du nutzen darfst – geschützte Cover sind nicht automatisch frei.")}</p>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setPick(true)}>{area === "banner" ? t("Neues Banner") : t("Neues Poster")}</Button>
        <div className="grow" style={{ minWidth: 180 }}><SearchBox value={q} onChange={setQ} /></div>
      </div>
      {list.length === 0 ? <Empty icon={<Icon size={28} />} title={area === "banner" ? t("Noch keine Banner") : t("Noch keine Poster")} text={t("Format wählen, Vorlage nehmen oder leer anfangen.")} action={<Button variant="primary" onClick={() => setPick(true)}>{t("Jetzt gestalten")}</Button>} /> : (
        <div className="studio-designs">
          {shown.map((e) => (
            <div key={e.id} className="studio-design-tile">
              <button type="button" className="studio-design-thumb" style={{ aspectRatio: `${e.data.w} / ${e.data.h}` }} onClick={() => setEdit({ id: e.id, d: sanitizeDesign(e.data), exists: true })} aria-label={e.data.title}>
                {e.data.thumbId ? <JImage id={e.data.thumbId} alt={e.data.title} /> : <span className="tiny muted">{t("Noch nicht gespeichert")}</span>}
              </button>
              <div className="row between" style={{ gap: 4 }}>
                <span className="small ellipsis" title={e.data.title}>{e.data.title}</span>
                <span className="row" style={{ gap: 2 }}>
                  <Button size="sm" variant="ghost" icon={<Copy size={14} />} aria-label={t("Duplizieren")} onClick={() => duplicate(e)} />
                  <Button size="sm" variant="ghost" icon={<Download size={14} />} aria-label={t("Als Bild speichern")} onClick={() => void download(e)} />
                </span>
              </div>
              <span className="tiny muted">{e.data.w} × {e.data.h}</span>
            </div>
          ))}
        </div>
      )}
      {pick && <FormatPicker area={area} onClose={() => setPick(false)} onPick={(d) => { setPick(false); setEdit({ id: newId(), d, exists: false }); }} />}
      {edit && <DesignEditor key={edit.id} id={edit.id} initial={edit.d} exists={edit.exists} onClose={() => setEdit(null)} />}
    </div>
  );
}

function FormatPicker({ area, onPick, onClose }: { area: "poster" | "banner"; onPick: (d: Design) => void; onClose: () => void }) {
  const [w, setW] = useState(1600), [h, setH] = useState(900);
  const ok = w >= MIN_SIDE && h >= MIN_SIDE && w <= MAX_SIDE && h <= MAX_SIDE;
  return (
    <Modal title={t("Format wählen")} onClose={onClose}>
      <div className="stack">
        <div className="list">
          {FORMATS.filter((f) => f.area === area).map((f) => (
            <button key={f.id} type="button" className="list-item" onClick={() => onPick(newDesign(f, t(f.label)))}>
              <span className="studio-ratio" style={{ aspectRatio: `${f.w} / ${f.h}` }} />
              <div className="grow"><div className="title">{t(f.label)}</div><div className="sub">{f.w} × {f.h} px{f.note ? ` · ${t(f.note)}` : ""}</div></div>
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label={t("Eigene Breite")}><input className="input" type="number" min={MIN_SIDE} max={MAX_SIDE} value={w} onChange={(e) => setW(+e.target.value)} style={{ width: 110 }} /></Field>
          <Field label={t("Eigene Höhe")}><input className="input" type="number" min={MIN_SIDE} max={MAX_SIDE} value={h} onChange={(e) => setH(+e.target.value)} style={{ width: 110 }} /></Field>
          <Button disabled={!ok} onClick={() => onPick(sanitizeDesign({ title: t("Eigenes Format"), area, formatId: "custom", w, h }))}>{t("Eigenes Format")}</Button>
        </div>
        {!ok && <p className="tiny" style={{ color: "var(--danger)" }}>{t("Erlaubt sind {a} bis {b} Pixel je Seite.", { a: MIN_SIDE, b: MAX_SIDE })}</p>}
      </div>
    </Modal>
  );
}
