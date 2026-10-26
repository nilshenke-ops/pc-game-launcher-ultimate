// F8/F9 editor for posters, covers, banners and profile pictures: layers (picture, text, shape) that can be moved and
// scaled with finger or mouse, undo/redo, templates, safe area for platform formats, save and export.

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { ArrowDown, ArrowUp, Circle, Copy, Download, Minus, Redo2, Share2, Square, Trash2, Type, Undo2, Wand2 } from "lucide-react";
import { t } from "../lib/i18n";
import { toast } from "../lib/hooks";
import {
  applyTemplate, designImageIds, DESIGN_TEMPLATES, drawDesign, FONTS, FORMATS, hitLayer, History, layerId, moveLayer, safeName, sanitizeDesign,
  type Design, type Layer, type ShapeLayer, type TextLayer,
} from "../lib/design";
import { removeWithLinks } from "./collection-view";
import { GamePicker, trySave, useGames } from "./journal-ui";
import { canShareFiles, downloadCanvas, loadImages, PictureButton, shareCanvas, storeRender, useImages } from "./studio-shared";
import { Banner, Button, confirmDialog, Field, Modal, Segmented, Switch } from "./ui";

type Drag = { mode: "move" | "resize"; id: string; sx: number; sy: number; start: Layer };

export function DesignEditor({ id, initial, exists, onClose }: { id: string; initial: Design; exists: boolean; onClose: () => void }) {
  const [d, setD] = useState(initial);
  const [sel, setSel] = useState<string | null>(null);
  const [safe, setSafe] = useState(true);
  const [busy, setBusy] = useState(false);
  const hist = useRef(new History<Design>());
  const last = useRef<{ key: string; at: number }>({ key: "", at: 0 });
  const [, bump] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const games = useGames();
  const images = useImages(designImageIds(d));
  const fmt = FORMATS.find((f) => f.id === d.formatId);
  const scale = Math.min(1, 1000 / Math.max(d.w, d.h));
  const layer = d.layers.find((l) => l.id === sel) ?? null;

  useEffect(() => { if (cv.current) drawDesign(cv.current, d, images, scale); }, [d, images, scale]);

  /** Every change goes through here: one undo step per action (typing in one field counts as one step). */
  const commit = useCallback((next: Design, key = String(Math.random())) => {
    const now = Date.now();
    if (!(key === last.current.key && now - last.current.at < 800)) hist.current.push(d);
    last.current = { key, at: now };
    setD(sanitizeDesign(next));
    bump((x) => x + 1);
  }, [d]);
  const setLayer = (lid: string, p: Partial<Layer>, key?: string) => commit({ ...d, layers: d.layers.map((l) => (l.id === lid ? ({ ...l, ...p } as Layer) : l)) }, key ? `${lid}:${key}` : undefined);
  const undo = () => { const prev = hist.current.undo(d); if (prev) { setD(prev); bump((x) => x + 1); } };
  const redo = () => { const next = hist.current.redo(d); if (next) { setD(next); bump((x) => x + 1); } };

  const add = (l: Layer) => { commit({ ...d, layers: [...d.layers, l] }); setSel(l.id); };
  const m = Math.min(d.w, d.h);
  const addText = () => add({ id: layerId(), type: "text", text: t("Dein Text"), font: "sans", size: Math.round(m * 0.09), color: "#ffffff", weight: 700, align: "center", shadow: true, stroke: null, x: d.w * 0.15, y: d.h * 0.4, w: d.w * 0.7, h: m * 0.14, opacity: 1 });
  const addShape = (shape: ShapeLayer["shape"]) => add({ id: layerId(), type: "shape", shape, fill: shape === "line" ? null : "#22d3ee", stroke: shape === "line" ? "#ffffff" : null, strokeWidth: shape === "line" ? Math.max(2, Math.round(m * 0.01)) : 0, radius: 0, x: d.w * 0.3, y: d.h * 0.35, w: d.w * 0.4, h: shape === "line" ? m * 0.05 : d.h * 0.3, opacity: 1 });
  const addImage = (imageId: string) => add({ id: layerId(), type: "image", imageId, fit: "cover", radius: 0, x: d.w * 0.2, y: d.h * 0.2, w: d.w * 0.6, h: d.h * 0.6, opacity: 1 });
  const removeSel = () => { if (!sel) return; commit({ ...d, layers: d.layers.filter((l) => l.id !== sel) }); setSel(null); };
  const dupSel = () => { if (!layer) return; add({ ...layer, id: layerId(), x: layer.x + m * 0.03, y: layer.y + m * 0.03 }); };

  // ------------------------------------------------------------------ pointer: move and scale
  const toDesign = (e: { clientX: number; clientY: number }) => {
    const r = cv.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * d.w, y: ((e.clientY - r.top) / r.height) * d.h };
  };
  const down = (e: RPointerEvent, mode: "move" | "resize", lid?: string) => {
    const p = toDesign(e);
    const target = lid ? d.layers.find((l) => l.id === lid) : hitLayer(d.layers, p.x, p.y);
    if (!target) { setSel(null); return; }
    e.preventDefault(); e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSel(target.id);
    hist.current.push(d); bump((x) => x + 1);
    drag.current = { mode, id: target.id, sx: p.x, sy: p.y, start: target };
  };
  const move = (e: RPointerEvent) => {
    const g = drag.current; if (!g) return;
    const p = toDesign(e), dx = p.x - g.sx, dy = p.y - g.sy, s = g.start;
    setD((cur) => ({ ...cur, layers: cur.layers.map((l) => {
      if (l.id !== g.id) return l;
      if (g.mode === "move") return { ...l, x: s.x + dx, y: s.y + dy } as Layer;
      const w = Math.max(8, s.w + dx), h = Math.max(8, s.h + dy);
      return (l.type === "text" ? { ...l, w, h, size: Math.max(8, Math.round((s as TextLayer).size * (h / s.h))) } : { ...l, w, h }) as Layer;
    }) }));
  };
  const up = () => { drag.current = null; setD((cur) => sanitizeDesign(cur)); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (typing || !layer) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
      const step = (e.shiftKey ? 0.05 : 0.01) * m;
      const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (dir[e.key]) { e.preventDefault(); setLayer(layer.id, { x: layer.x + dir[e.key][0], y: layer.y + dir[e.key][1] }, "nudge"); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // ------------------------------------------------------------------ save / export
  const fullCanvas = async () => { const c = document.createElement("canvas"); drawDesign(c, d, await loadImages(designImageIds(d)), 1); return c; };
  const save = async () => {
    setBusy(true);
    try {
      const c = await fullCanvas();
      const { renderId, thumbId } = await storeRender(c);
      if (trySave("design", id, sanitizeDesign({ ...d, renderId, thumbId }))) { toast(t("Gespeichert"), "success"); onClose(); }
    } catch (e) { toast(t((e as Error).message), "error"); } finally { setBusy(false); }
  };
  const remove = async () => { if (await confirmDialog(t("Entwurf löschen?"), t("„{n}“ wird gelöscht und aus Ausstellungen entfernt.", { n: d.title }), { danger: true, ok: t("Löschen") })) { removeWithLinks(id); onClose(); } };

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <Modal title={<><Wand2 size={18} /> {d.area === "banner" ? t("Banner- und Profilbild-Werkstatt") : t("Poster- und Cover-Designer")}</>} onClose={onClose} wide className="studio-editor-modal"
      footer={<>
        {exists && <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove}>{t("Löschen")}</Button>}
        <Button variant="ghost" icon={<Download size={15} />} onClick={async () => downloadCanvas(await fullCanvas(), safeName(d.title), "png")}>{t("PNG")}</Button>
        <Button variant="ghost" icon={<Download size={15} />} onClick={async () => downloadCanvas(await fullCanvas(), safeName(d.title), "jpg")}>{t("JPG")}</Button>
        {canShareFiles() && <Button variant="ghost" icon={<Share2 size={15} />} onClick={async () => shareCanvas(await fullCanvas(), safeName(d.title), d.title)}>{t("Teilen")}</Button>}
        <Button variant="primary" busy={busy} onClick={() => void save()}>{t("Speichern")}</Button>
      </>}>
      <div className="studio-toolbar">
        <Button size="sm" icon={<Undo2 size={15} />} disabled={!hist.current.canUndo} onClick={undo}>{t("Rückgängig")}</Button>
        <Button size="sm" icon={<Redo2 size={15} />} disabled={!hist.current.canRedo} onClick={redo}>{t("Wiederholen")}</Button>
        <span className="studio-sep" />
        <Button size="sm" icon={<Type size={15} />} onClick={addText}>{t("Text")}</Button>
        <Button size="sm" icon={<Square size={15} />} onClick={() => addShape("rect")}>{t("Rechteck")}</Button>
        <Button size="sm" icon={<Circle size={15} />} onClick={() => addShape("ellipse")}>{t("Kreis")}</Button>
        <Button size="sm" icon={<Minus size={15} />} onClick={() => addShape("line")}>{t("Linie")}</Button>
        <PictureButton onPick={addImage} label={t("Bild")} side={2400} />
        <select className="input studio-tpl" value="" onChange={(e) => { if (e.target.value) { commit(applyTemplate(d, e.target.value)); setSel(null); } }} aria-label={t("Vorlage")}>
          <option value="">{t("Vorlage …")}</option>
          {DESIGN_TEMPLATES.filter((x) => x.area === "any" || x.area === d.area).map((x) => <option key={x.id} value={x.id}>{t(x.name)}</option>)}
        </select>
      </div>
      <div className="studio-editor">
        <div className="studio-stage" ref={wrap}>
          <div className="studio-canvas-wrap" style={{ aspectRatio: `${d.w} / ${d.h}`, width: `min(100%, calc(54vh * ${(d.w / d.h).toFixed(4)}))` }} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
            <canvas ref={cv} className="studio-canvas" onPointerDown={(e) => down(e, "move")} aria-label={t("Zeichenfläche")} />
            {safe && fmt?.safe && <div className="studio-safe" style={{ left: pct((d.w - fmt.safe.w) / 2, d.w), top: pct((d.h - fmt.safe.h) / 2, d.h), width: pct(fmt.safe.w, d.w), height: pct(fmt.safe.h, d.h) }}><span>{t("Überall sichtbar")}</span></div>}
            {safe && fmt?.round && <div className="studio-safe round" />}
            {layer && (
              <div className="studio-sel" style={{ left: pct(layer.x, d.w), top: pct(layer.y, d.h), width: pct(layer.w, d.w), height: pct(layer.h, d.h) }} onPointerDown={(e) => down(e, "move", layer.id)}>
                <span className="studio-handle" onPointerDown={(e) => down(e, "resize", layer.id)} aria-label={t("Größe ändern")} />
              </div>
            )}
          </div>
          <p className="tiny muted">{d.w} × {d.h} px{fmt ? ` · ${t(fmt.label)}` : ""}{fmt?.note ? ` – ${t(fmt.note)}` : ""}</p>
          {(fmt?.safe || fmt?.round) && <Switch checked={safe} onChange={setSafe} label={t("Sichtbaren Bereich anzeigen (wird nicht mit gespeichert)")} />}
        </div>
        <div className="studio-panel stack-sm">
          <Field label={t("Titel")}><input className="input" maxLength={80} value={d.title} onChange={(e) => commit({ ...d, title: e.target.value }, "title")} /></Field>
          <GamePicker value={d.game ?? { gameId: null, gameName: null }} onChange={(g) => commit({ ...d, game: { gameId: g.gameId ?? null, gameName: g.gameName ?? null } })} games={games} />
          <details open={!layer}>
            <summary className="small"><b>{t("Hintergrund & Rahmen")}</b></summary>
            <div className="stack-sm" style={{ marginTop: 8 }}>
              <Segmented value={d.background.kind} onChange={(kind) => commit({ ...d, background: { ...d.background, kind } })} label={t("Hintergrund")}
                options={[{ value: "color", label: t("Farbe") }, { value: "gradient", label: t("Verlauf") }, { value: "image", label: t("Bild") }]} />
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <Field label={t("Farbe 1")}><input type="color" value={d.background.c1} onChange={(e) => commit({ ...d, background: { ...d.background, c1: e.target.value } }, "bg1")} /></Field>
                {d.background.kind !== "color" && <Field label={t("Farbe 2")}><input type="color" value={d.background.c2} onChange={(e) => commit({ ...d, background: { ...d.background, c2: e.target.value } }, "bg2")} /></Field>}
                {d.background.kind !== "color" && <Field label={t("Winkel")}><input type="range" min={0} max={360} value={d.background.angle} onChange={(e) => commit({ ...d, background: { ...d.background, angle: +e.target.value } }, "bga")} /></Field>}
              </div>
              {d.background.kind === "image" && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><PictureButton side={2400} label={t("Hintergrundbild")} onPick={(imageId) => commit({ ...d, background: { ...d.background, imageId } })} /></div>}
              <div className="row" style={{ gap: 10 }}>
                <Field label={t("Rahmen")}><input type="range" min={0} max={Math.round(m / 8)} value={d.frame.width} onChange={(e) => commit({ ...d, frame: { ...d.frame, width: +e.target.value } }, "fw")} /></Field>
                <Field label={t("Rahmenfarbe")}><input type="color" value={d.frame.color} onChange={(e) => commit({ ...d, frame: { ...d.frame, color: e.target.value } }, "fc")} /></Field>
              </div>
            </div>
          </details>
          <div className="stack-sm">
            <b className="small">{t("Ebenen")}</b>
            {d.layers.length === 0 && <p className="tiny muted">{t("Noch leer – oben Text, Form oder Bild hinzufügen oder eine Vorlage wählen.")}</p>}
            <div className="studio-layers">
              {[...d.layers].reverse().map((l) => (
                <button key={l.id} type="button" className={`studio-layer ${l.id === sel ? "on" : ""}`} onClick={() => setSel(l.id)}>
                  {l.type === "text" ? <Type size={14} /> : l.type === "image" ? <Wand2 size={14} /> : l.shape === "ellipse" ? <Circle size={14} /> : <Square size={14} />}
                  <span>{l.type === "text" ? (l.text || t("Text")).slice(0, 24) : l.type === "image" ? t("Bild") : l.shape === "line" ? t("Linie") : l.shape === "ellipse" ? t("Kreis") : t("Rechteck")}</span>
                </button>
              ))}
            </div>
          </div>
          {layer && <LayerProps l={layer} set={(p, k) => setLayer(layer.id, p, k)} onRemove={removeSel} onDup={dupSel}
            onOrder={(dir) => commit({ ...d, layers: moveLayer(d.layers, layer.id, dir) })} />}
          {d.area === "banner" && <Banner kind="info">{t("Nexus veröffentlicht nichts auf YouTube, Twitch oder anderen Plattformen – speichere das Bild und lade es dort selbst hoch.")}</Banner>}
        </div>
      </div>
    </Modal>
  );
}

function LayerProps({ l, set, onRemove, onDup, onOrder }: { l: Layer; set: (p: Partial<Layer>, key?: string) => void; onRemove: () => void; onDup: () => void; onOrder: (d: "up" | "down") => void }) {
  return (
    <div className="stack-sm studio-props">
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Button size="sm" icon={<ArrowUp size={14} />} onClick={() => onOrder("up")}>{t("Nach vorn")}</Button>
        <Button size="sm" icon={<ArrowDown size={14} />} onClick={() => onOrder("down")}>{t("Nach hinten")}</Button>
        <Button size="sm" icon={<Copy size={14} />} onClick={onDup}>{t("Duplizieren")}</Button>
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={onRemove}>{t("Entfernen")}</Button>
      </div>
      {l.type === "text" && <>
        <Field label={t("Text")}><textarea className="input" rows={2} maxLength={300} value={l.text} onChange={(e) => set({ text: e.target.value }, "text")} /></Field>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <Field label={t("Schriftart")}><select className="input" value={l.font} onChange={(e) => set({ font: e.target.value as TextLayer["font"] })}>{FONTS.map((f) => <option key={f.id} value={f.id}>{t(f.label)}</option>)}</select></Field>
          <Field label={t("Größe")}><input className="input" type="number" min={8} max={800} value={l.size} onChange={(e) => set({ size: +e.target.value }, "size")} style={{ width: 90 }} /></Field>
          <Field label={t("Farbe")}><input type="color" value={l.color} onChange={(e) => set({ color: e.target.value }, "color")} /></Field>
        </div>
        <Segmented value={String(l.weight)} onChange={(v) => set({ weight: +v as TextLayer["weight"] })} label={t("Stärke")} options={[{ value: "400", label: t("Normal") }, { value: "700", label: t("Fett") }, { value: "900", label: t("Extra") }]} />
        <Segmented value={l.align} onChange={(align) => set({ align })} label={t("Ausrichtung")} options={[{ value: "left", label: t("Links") }, { value: "center", label: t("Mitte") }, { value: "right", label: t("Rechts") }]} />
        <Switch checked={l.shadow} onChange={(shadow) => set({ shadow })} label={t("Schatten")} />
        <Switch checked={!!l.stroke} onChange={(on) => set({ stroke: on ? "#000000" : null })} label={t("Kontur")} />
      </>}
      {l.type === "shape" && <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {l.shape !== "line" && <Switch checked={!!l.fill} onChange={(on) => set({ fill: on ? "#22d3ee" : null })} label={t("Füllung")} />}
        {l.fill && <Field label={t("Füllfarbe")}><input type="color" value={l.fill} onChange={(e) => set({ fill: e.target.value }, "fill")} /></Field>}
        <Field label={t("Linienfarbe")}><input type="color" value={l.stroke ?? "#ffffff"} onChange={(e) => set({ stroke: e.target.value }, "stroke")} /></Field>
        <Field label={t("Linienstärke")}><input type="range" min={0} max={60} value={l.strokeWidth} onChange={(e) => set({ strokeWidth: +e.target.value }, "sw")} /></Field>
        {l.shape === "rect" && <Field label={t("Ecken")}><input type="range" min={0} max={300} value={l.radius} onChange={(e) => set({ radius: +e.target.value }, "r")} /></Field>}
      </div>}
      {l.type === "image" && <>
        <Segmented value={l.fit} onChange={(fit) => set({ fit })} label={t("Einpassen")} options={[{ value: "cover", label: t("Füllen (zuschneiden)") }, { value: "contain", label: t("Ganz zeigen") }]} />
        <Field label={t("Ecken")}><input type="range" min={0} max={600} value={l.radius} onChange={(e) => set({ radius: +e.target.value }, "r")} /></Field>
      </>}
      <Field label={t("Deckkraft")}><input type="range" min={5} max={100} value={Math.round(l.opacity * 100)} onChange={(e) => set({ opacity: +e.target.value / 100 }, "op")} /></Field>
      <p className="tiny muted">{t("Verschieben: ziehen oder Pfeiltasten. Größe: Ecke unten rechts ziehen.")}</p>
    </div>
  );
}
