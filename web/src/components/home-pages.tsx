// Own home pages (F19): several dashboards side by side, switchable with one tap, named freely; and sharing one
// page as a file or link (F27) – checked and previewed before it is added as a new page.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Link2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { setPrefs, usePrefs } from "../lib/prefs";
import { ALL_WIDGETS, type Layout } from "../lib/prefs-core";
import { decodeShare, encodeShare } from "../lib/play";
import { checkPage, sharePage, type CheckedPage } from "../lib/layout-share";
import { downloadText } from "../lib/journal";
import { Banner, Button, confirmDialog, Field, Modal } from "./ui";

const label = (id: string) => (ALL_WIDGETS.find((w) => w.id === id)?.label ? t(ALL_WIDGETS.find((w) => w.id === id)!.label) : id.startsWith("plugin:") ? t("Plugin-Widget {n}", { n: id.split(":")[2] }) : id);

export function HomePages({ layout, mobile, edit, pluginWidgets }: { layout: Layout; mobile: boolean; edit: boolean; pluginWidgets: string[] }) {
  const prefs = usePrefs();
  const [params, setParams] = useSearchParams();
  const [preview, setPreview] = useState<CheckedPage | null>(null);
  const [rename, setRename] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const select = (id: string) => setPrefs((p) => ({ ...p, activeLayout: { ...p.activeLayout, [mobile ? "mobile" : "desktop"]: id } }));
  const add = (base?: Partial<Layout>) => {
    if (prefs.layouts.length >= 20) { toast(t("Höchstens 20 Seiten."), "error"); return; }
    const id = "l" + Math.random().toString(36).slice(2, 10);
    setPrefs((p) => ({ ...p, layouts: [...p.layouts, { id, name: base?.name ?? t("Seite {n}", { n: p.layouts.length + 1 }), widgets: base?.widgets ?? [{ id: "clock", visible: true, size: "s" }] }], activeLayout: { ...p.activeLayout, [mobile ? "mobile" : "desktop"]: id } }));
  };
  const open = (raw: unknown) => {
    const c = checkPage(raw, pluginWidgets);
    if ("error" in c) { toast(t(c.error), "error"); return; }
    setPreview(c);
  };
  // A link like …#/?page=… opens the preview.
  useEffect(() => {
    const code = params.get("page");
    if (!code) return;
    open(decodeShare(code));
    params.delete("page"); setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shareLink = () => {
    const { page, leftOut } = sharePage(layout);
    const link = `${location.origin}${location.pathname}#/?page=${encodeShare(page)}`;
    void navigator.clipboard?.writeText(link).then(() => toast(leftOut ? t("Link kopiert – {n} eigene Widgets sind nicht dabei (sie gehören zu deinem Gerät)", { n: leftOut }) : t("Link kopiert"), "success"), () => toast(link, "info"));
  };
  const shareFile = () => { const { page } = sharePage(layout); downloadText(`nexus-seite-${layout.name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 30)}.json`, JSON.stringify(page, null, 2)); };
  const del = async () => {
    if (prefs.layouts.length < 2) return;
    if (!await confirmDialog(t("Seite „{n}“ löschen?", { n: layout.name }), t("Nur die Anordnung wird gelöscht – Widgets und Daten bleiben."), { danger: true, ok: t("Löschen") })) return;
    setPrefs((p) => { const rest = p.layouts.filter((l) => l.id !== layout.id); return { ...p, layouts: rest, activeLayout: { desktop: p.activeLayout.desktop === layout.id ? rest[0].id : p.activeLayout.desktop, mobile: p.activeLayout.mobile === layout.id ? rest[0].id : p.activeLayout.mobile } }; });
  };
  if (prefs.layouts.length < 2 && !edit) return null;
  return (
    <div className="home-pages">
      <div className="chips" role="tablist" aria-label={t("Startseiten")}>
        {prefs.layouts.map((l) => <button key={l.id} type="button" role="tab" aria-selected={l.id === layout.id} className={`chip ${l.id === layout.id ? "on" : ""}`} onClick={() => select(l.id)}>{l.name}</button>)}
        {edit && <button type="button" className="chip" onClick={() => add()}><Plus size={13} />{t("Neue Seite")}</button>}
      </div>
      {edit && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setRename(layout.name)}>{t("Umbenennen")}</Button>
          <Button size="sm" variant="ghost" icon={<Link2 size={14} />} onClick={shareLink}>{t("Seite als Link teilen")}</Button>
          <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={shareFile}>{t("Als Datei")}</Button>
          <Button size="sm" variant="ghost" icon={<Upload size={14} />} onClick={() => file.current?.click()}>{t("Seite importieren")}</Button>
          {prefs.layouts.length > 1 && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void del()}>{t("Seite löschen")}</Button>}
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f || f.size > 200_000) return; try { open(JSON.parse(await f.text())); } catch { toast(t("Die Datei ist kein gültiges JSON."), "error"); } }} />
        </div>
      )}
      {rename != null && (
        <Modal title={t("Seite umbenennen")} onClose={() => setRename(null)} footer={<><Button onClick={() => setRename(null)}>{t("Abbrechen")}</Button><Button variant="primary" disabled={!rename.trim()} onClick={() => { setPrefs((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === layout.id ? { ...l, name: rename.trim().slice(0, 40) } : l)) })); setRename(null); }}>{t("Speichern")}</Button></>}>
          <Field label={t("Name")}><input className="input" maxLength={40} value={rename} onChange={(e) => setRename(e.target.value)} /></Field>
        </Modal>
      )}
      {preview && (
        <Modal title={t("Geteilte Seite „{n}“", { n: preview.name })} onClose={() => setPreview(null)} footer={<><Button onClick={() => setPreview(null)}>{t("Abbrechen")}</Button><Button variant="primary" icon={<Plus size={15} />} onClick={() => { add({ name: preview.name, widgets: preview.widgets }); setPreview(null); toast(t("Als neue Seite hinzugefügt"), "success"); }}>{t("Als neue Seite hinzufügen")}</Button></>}>
          <div className="stack-sm">
            <span className="small muted">{t("Enthält nur die Anordnung der Widgets – keine Einstellungen, Rechte, Schlüssel oder Programmcode. Deine bisherigen Seiten bleiben unverändert.")}</span>
            <ul className="ins-list">{preview.widgets.map((w) => <li key={w.id}><span>{label(w.id)}</span><span className="muted">{w.size.toUpperCase()}{preview.needsPlugin.includes(w.id) ? " · " + t("Plugin nicht installiert") : ""}</span></li>)}</ul>
            {preview.dropped > 0 && <Banner kind="warn">{t("{n} unbekannte Einträge wurden weggelassen.", { n: preview.dropped })}</Banner>}
            {preview.needsPlugin.length > 0 && <Banner kind="info">{t("Plugin-Widgets erscheinen erst, wenn das passende Plugin installiert ist.")}</Banner>}
          </div>
        </Modal>
      )}
    </div>
  );
}
