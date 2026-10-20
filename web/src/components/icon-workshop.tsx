// Icon workshop (Modal): design an own icon or cover with live preview, then download it or use it right away
// (game/program in the library, Gamer-Pass picture). Opened from where the picture is used – no extra menu.
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Trash2, Wand2 } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import { readJson, writeJson } from "../lib/rpc";
import { DEFAULT_ICON, drawIcon, exportIcon, ICON_TEMPLATES, loadSafeImage, sanitizeIcon, type IconFormat, type IconSpec } from "../lib/icon-art";
import { initials } from "../lib/format";
import { Button, Field, Modal, Segmented } from "./ui";

const KEY = "pgl.iconSpec";

export function IconWorkshop({ name, format: fixed, applyLabel, maxBytes, onApply, onClose }: {
  name: string; format?: IconFormat; applyLabel?: string; maxBytes?: number; onApply?: (dataUrl: string, format: IconFormat) => void | Promise<void>; onClose: () => void;
}) {
  const [spec, setSpecRaw] = useState<IconSpec>(() => sanitizeIcon({ ...DEFAULT_ICON, ...readJson<Partial<IconSpec>>(KEY), symbol: initials(name).slice(0, 3), title: name.slice(0, 32), ...(fixed ? { format: fixed } : {}) }));
  const [img, setImg] = useState<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const set = (p: Partial<IconSpec>) => setSpecRaw((s) => sanitizeIcon({ ...s, ...p }));
  useEffect(() => { if (cv.current) drawIcon(cv.current, spec, img); writeJson(KEY, { ...spec, symbol: undefined, title: undefined }); }, [spec, img]);

  const limit = maxBytes ?? (spec.format === "icon" ? 190_000 : 680_000);
  const result = () => { if (!cv.current) throw new Error(t("Kein Bild.")); return exportIcon(cv.current, limit); };
  const download = () => {
    try { const a = document.createElement("a"); a.href = result(); a.download = `${name.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "icon"}-${spec.format}.${a.href.startsWith("data:image/png") ? "png" : "jpg"}`; a.click(); }
    catch (e) { toast(t((e as Error).message), "error"); }
  };
  const apply = async () => {
    if (!onApply) return;
    setBusy(true);
    try { await onApply(result(), spec.format); onClose(); } catch (e) { toast(t((e as Error).message), "error"); } finally { setBusy(false); }
  };

  return (
    <Modal title={<><Wand2 size={18} /> {t("Icon-Werkstatt")}</>} onClose={onClose} wide
      footer={<>
        <Button variant="ghost" icon={<Download size={15} />} onClick={download}>{t("Als Bild speichern")}</Button>
        {onApply && <Button variant="primary" busy={busy} onClick={() => void apply()}>{applyLabel ?? t("Übernehmen")}</Button>}
      </>}>
      <div className="iw">
        <div className="iw-preview"><canvas ref={cv} className={`iw-canvas ${spec.format}`} role="img" aria-label={t("Vorschau")} /></div>
        <div className="stack-sm">
          {!fixed && <Segmented value={spec.format} onChange={(format) => set({ format })} label={t("Format")} options={[{ value: "icon", label: t("Icon (1:1)") }, { value: "cover", label: t("Cover (2:3)") }]} />}
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {ICON_TEMPLATES.map((x) => <button key={x.id} type="button" className="chip" style={{ background: `linear-gradient(135deg, ${x.spec.c1}, ${x.spec.c2})`, color: "#fff" }} onClick={() => set(x.spec)}>{t(x.name)}</button>)}
          </div>
          <div className="grid-2">
            <Field label={t("Symbol (bis 3 Zeichen oder Emoji)")}><input className="input" value={spec.symbol} onChange={(e) => set({ symbol: e.target.value })} disabled={!!img} /></Field>
            {spec.format === "cover" && <Field label={t("Name auf dem Cover")}><input className="input" value={spec.title} maxLength={32} onChange={(e) => set({ title: e.target.value })} /></Field>}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <label className="btn sm"><ImagePlus size={14} />{t("Eigenes Bild")}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { setImg(await loadSafeImage(f)); } catch (err) { toast(t((err as Error).message), "error"); } }} /></label>
            {img && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setImg(null)}>{t("Bild entfernen")}</Button>}
          </div>
          {img && <Field label={t("Zoom: {v} %", { v: Math.round(spec.zoom * 100) })}><input type="range" min={0.5} max={2} step={0.05} value={spec.zoom} onChange={(e) => set({ zoom: +e.target.value })} /></Field>}
          {spec.format === "icon" && <Field label={t("Form")}><Segmented value={spec.shape} onChange={(shape) => set({ shape })} label={t("Form")} options={[{ value: "rounded", label: t("Abgerundet") }, { value: "circle", label: t("Kreis") }, { value: "hexagon", label: t("Sechseck") }, { value: "square", label: t("Quadrat") }]} /></Field>}
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label className="row small" style={{ gap: 4 }}>{t("Farbe 1")} <input type="color" value={spec.c1} onChange={(e) => set({ c1: e.target.value })} /></label>
            <label className="row small" style={{ gap: 4 }}>{t("Farbe 2")} <input type="color" value={spec.c2} onChange={(e) => set({ c2: e.target.value })} /></label>
            <label className="row small" style={{ gap: 4 }}>{t("Symbol")} <input type="color" value={spec.symbolColor} onChange={(e) => set({ symbolColor: e.target.value })} /></label>
            <label className="row small" style={{ gap: 4 }}>{t("Rand")} <input type="color" value={spec.borderColor} onChange={(e) => set({ borderColor: e.target.value })} /></label>
          </div>
          <div className="grid-2">
            <Field label={t("Verlauf: {v}°", { v: spec.angle })}><input type="range" min={0} max={360} step={5} value={spec.angle} onChange={(e) => set({ angle: +e.target.value })} /></Field>
            <Field label={t("Randbreite: {v}", { v: spec.border })}><input type="range" min={0} max={24} value={spec.border} onChange={(e) => set({ border: +e.target.value })} /></Field>
          </div>
          <Field label={t("Muster")}><Segmented value={spec.pattern} onChange={(pattern) => set({ pattern })} label={t("Muster")} options={[{ value: "none", label: t("Ohne") }, { value: "stripes", label: t("Streifen") }, { value: "dots", label: t("Punkte") }, { value: "grid", label: t("Raster") }]} /></Field>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={spec.glow} onChange={(e) => set({ glow: e.target.checked })} />{t("Leuchten")}</label>
          <p className="tiny muted" style={{ margin: 0 }}>{t("Entsteht im Browser. Eigene Bilder werden neu gezeichnet (ohne Metadaten, kein SVG) und nirgends hochgeladen – nur das fertige Bild wird übernommen, wenn du es willst.")}</p>
        </div>
      </div>
    </Modal>
  );
}
