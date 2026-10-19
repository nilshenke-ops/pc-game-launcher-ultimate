import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown, ArrowUp, Copy, Image as ImageIcon, LayoutDashboard, Monitor, Plus, Save, Shapes, Trash2, Undo2, Video,
} from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { setPrefs, usePrefs, type WidgetId } from "../lib/prefs";
import {
  CUSTOM_PREFIX, elementLabel, newElement, newElementId, newWidgetId, templates, type ButtonAction, type CustomWidget, type ElementType, type WidgetElement,
} from "../lib/custom-widgets";
import { addWidget, layoutOrDefault, overlayPluginWidgets, removeWidget, type OverlayLayout } from "../lib/overlay-layout";
import type { PluginList } from "../lib/plugins";
import { ICONS } from "../lib/nav";
import { CustomWidgetView } from "../components/CustomWidgetView";
import { Banner, Button, Card, confirmDialog, Empty, Field, Modal, PageHead, Segmented, Switch } from "../components/ui";

const TYPES: ElementType[] = ["text", "clock", "metric", "button", "image", "playtime", "nowPlaying", "shape"];
const ACTIONS: { value: ButtonAction; label: () => string; needsRef?: "quick" | "launch" | "sound" | "profile" }[] = [
  { value: "record", label: () => t("Aufnahme starten/stoppen") },
  { value: "replay", label: () => t("Replay speichern") },
  { value: "overlay", label: () => t("Overlay öffnen/schließen") },
  { value: "stopSounds", label: () => t("Alle Sounds stoppen") },
  { value: "quick", label: () => t("Quick Action ausführen"), needsRef: "quick" },
  { value: "launch", label: () => t("Spiel/Programm starten"), needsRef: "launch" },
  { value: "sound", label: () => t("Sound abspielen"), needsRef: "sound" },
  { value: "profile", label: () => t("Gaming-Profil aktivieren"), needsRef: "profile" },
];
/** The PC accepts pictures up to ~150 KB (as text ≤ 200 000 characters). */
const MAX_IMAGE_CHARS = 195_000;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round = (v: number) => Math.round(v * 2) / 2;

/** Picture from a file: kept as it is if small enough, otherwise made smaller (JPEG) until the PC accepts it. */
async function imageFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(t("Das ist kein Bild."));
  const asData = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  const original = await asData(file);
  if (original.length <= MAX_IMAGE_CHARS && /^data:image\/(png|jpeg|webp|gif);base64,/.test(original)) return original;
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(t("Das Bild konnte nicht gelesen werden."))); i.src = original; });
  for (const [max, q] of [[900, 0.82], [720, 0.75], [560, 0.7], [420, 0.62], [320, 0.55]] as const) {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL("image/jpeg", q);
    if (out.length <= MAX_IMAGE_CHARS) return out;
  }
  throw new Error(t("Das Bild ist zu groß."));
}

function ImagePicker({ value, onChange, label }: { value?: string | null; onChange: (v: string | null) => void; label: string }) {
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(value?.startsWith("https://") ? value : "");
  return (
    <Field label={label} hint={t("Bild hochladen (wird bei Bedarf verkleinert) oder https-Adresse eintragen.")}>
      <div className="row">
        <Button size="sm" icon={<ImageIcon size={15} />} onClick={() => file.current?.click()}>{t("Bild wählen")}</Button>
        {value && <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} onClick={() => { onChange(null); setUrl(""); }}>{t("Entfernen")}</Button>}
        <input ref={file} type="file" accept="image/*" hidden aria-label={label}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) imageFromFile(f).then(onChange, (err: Error) => toast(err.message, "error")); }} />
      </div>
      <input className="input" type="url" placeholder="https://…" value={url} aria-label={t("Bild-Adresse")}
        onChange={(e) => setUrl(e.target.value)} onBlur={() => { if (url === "") return; if (url.startsWith("https://")) onChange(url); else toast(t("Die Adresse muss mit https:// beginnen."), "error"); }} />
    </Field>
  );
}

function ColorField({ label, value, fallback, onChange, optional }: { label: string; value?: string | null; fallback: string; onChange: (v: string | null) => void; optional?: boolean }) {
  return (
    <Field label={label}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="color" value={value ?? fallback} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ width: 52, padding: 2, height: 36 }} />
        {optional && value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>{t("Standard")}</Button>}
      </div>
    </Field>
  );
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input className="input" type="number" value={value} min={min} max={max} step={step} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(clamp(v, min, max)); }} />
    </Field>
  );
}

/** Target of a button (game, sound, profile, quick action) – only lists of this PC, never commands. */
function RefPicker({ kind, value, onChange }: { kind: "quick" | "launch" | "sound" | "profile"; value?: string | null; onChange: (v: string) => void }) {
  const quick = useRpc<{ actions: { id: string; name: string }[] }>("quick.list", {}, ["quick"], kind === "quick");
  const lib = useRpc<{ items: { id: string; name: string; kind: string }[] }>("library.list", {}, ["library"], kind === "launch");
  const sounds = useRpc<{ data: { sounds: { id: string; name: string }[] } }>("sounds.list", {}, ["sounds"], kind === "sound");
  const profiles = useRpc<{ profiles: { id: string; name: string }[] }>("profiles.list", {}, ["profiles"], kind === "profile");
  const list = kind === "quick" ? quick.data?.actions : kind === "launch" ? lib.data?.items : kind === "sound" ? sounds.data?.data.sounds : profiles.data?.profiles;
  const label = { quick: t("Quick Action"), launch: t("Spiel/Programm"), sound: t("Sound"), profile: t("Gaming-Profil") }[kind];
  return (
    <Field label={label} hint={!list?.length ? t("Noch nichts vorhanden – zuerst anlegen bzw. den PC verbinden.") : undefined}>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>{t("Bitte wählen …")}</option>
        {(list ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        {value && !list?.some((x) => x.id === value) && <option value={value}>{t("(nicht mehr vorhanden)")}</option>}
      </select>
    </Field>
  );
}

function ElementProps({ e, set }: { e: WidgetElement; set: (p: Partial<WidgetElement>) => void }) {
  const action = ACTIONS.find((a) => a.value === e.action);
  const withText = e.type === "text" || e.type === "button" || e.type === "metric" || e.type === "playtime";
  return (
    <div className="stack-sm">
      {withText && (
        <Field label={e.type === "text" ? t("Text") : e.type === "button" ? t("Beschriftung") : t("Bezeichnung")}>
          {e.type === "text"
            ? <textarea className="input" rows={2} maxLength={200} value={e.text ?? ""} onChange={(x) => set({ text: x.target.value })} />
            : <input className="input" maxLength={200} value={e.text ?? ""} onChange={(x) => set({ text: x.target.value })} />}
        </Field>
      )}
      {e.type === "clock" && (
        <Segmented label={t("Anzeige")} value={(e.kind ?? "time") as "time" | "date" | "both"} onChange={(v) => set({ kind: v })}
          options={[{ value: "time", label: t("Uhrzeit") }, { value: "date", label: t("Datum") }, { value: "both", label: t("Beides") }]} />
      )}
      {e.type === "metric" && (
        <>
          <Field label={t("Messwert")}>
            <select className="input" value={e.kind ?? "cpu"} onChange={(x) => set({ kind: x.target.value })}>
              <option value="cpu">{t("CPU-Auslastung")}</option><option value="ram">{t("Arbeitsspeicher (RAM)")}</option>
              <option value="gpu">{t("Grafikkarte (GPU)")}</option><option value="gputemp">{t("GPU-Temperatur")}</option>
            </select>
          </Field>
          <Segmented label={t("Darstellung")} value={e.display ?? "number"} onChange={(v) => set({ display: v })}
            options={[{ value: "number", label: t("Zahl") }, { value: "bar", label: t("Balken") }, { value: "ring", label: t("Ring") }]} />
        </>
      )}
      {e.type === "playtime" && (
        <Segmented label={t("Zeitraum")} value={(e.kind ?? "today") as "today" | "week"} onChange={(v) => set({ kind: v })}
          options={[{ value: "today", label: t("Heute") }, { value: "week", label: t("7 Tage") }]} />
      )}
      {e.type === "button" && (
        <>
          <Field label={t("Aktion")}>
            <select className="input" value={e.action ?? "record"} onChange={(x) => set({ action: x.target.value as ButtonAction, ref: x.target.value === "overlay" ? "full" : null })}>
              {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label()}</option>)}
            </select>
          </Field>
          {action?.needsRef && <RefPicker kind={action.needsRef} value={e.ref} onChange={(v) => set({ ref: v })} />}
          {e.action === "overlay" && (
            <Segmented label={t("Overlay")} value={(e.ref === "mini" ? "mini" : "full") as "full" | "mini"} onChange={(v) => set({ ref: v })}
              options={[{ value: "full", label: t("Groß") }, { value: "mini", label: t("Mini") }]} />
          )}
          <Field label={t("Symbol")}>
            <div className="ws-icons" role="radiogroup" aria-label={t("Symbol")}>
              <button type="button" role="radio" aria-checked={!e.icon} className={!e.icon ? "on" : ""} onClick={() => set({ icon: null })}>–</button>
              {Object.entries(ICONS).map(([k, I]) => (
                <button key={k} type="button" role="radio" aria-checked={e.icon === k} aria-label={k} className={e.icon === k ? "on" : ""} onClick={() => set({ icon: k })}><I size={16} /></button>
              ))}
            </div>
          </Field>
        </>
      )}
      {e.type === "image" && <ImagePicker label={t("Bild")} value={e.image} onChange={(v) => set({ image: v })} />}
      <div className="grid-2">
        {e.type !== "shape" && e.type !== "image" && <ColorField label={t("Schriftfarbe")} value={e.color} fallback="#ffffff" optional onChange={(v) => set({ color: v })} />}
        {(e.type === "button" || e.type === "shape" || e.type === "metric") && (
          <ColorField label={e.type === "metric" ? t("Balken-/Ringfarbe") : t("Füllfarbe")} value={e.fill} fallback="#22d3ee" optional={e.type !== "shape"} onChange={(v) => set({ fill: v })} />
        )}
      </div>
      {e.type !== "shape" && e.type !== "image" && (
        <>
          <Field label={t("Schriftgröße: {n}", { n: e.size })}>
            <input type="range" min={8} max={120} value={e.size} onChange={(x) => set({ size: Number(x.target.value) })} aria-label={t("Schriftgröße")} />
          </Field>
          <div className="row">
            <Segmented label={t("Ausrichtung")} value={e.align} onChange={(v) => set({ align: v })}
              options={[{ value: "left", label: t("Links") }, { value: "center", label: t("Mitte") }, { value: "right", label: t("Rechts") }]} />
            <Switch checked={e.bold} onChange={(v) => set({ bold: v })} label={t("Fett")} />
          </div>
        </>
      )}
      <div className="grid-4">
        <NumberField label="X %" value={e.x} min={0} max={100 - Math.min(e.w, 100)} step={0.5} onChange={(v) => set({ x: v })} />
        <NumberField label="Y %" value={e.y} min={0} max={100 - Math.min(e.h, 100)} step={0.5} onChange={(v) => set({ y: v })} />
        <NumberField label={t("Breite %")} value={e.w} min={2} max={100 - e.x} step={0.5} onChange={(v) => set({ w: v })} />
        <NumberField label={t("Höhe %")} value={e.h} min={2} max={100 - e.y} step={0.5} onChange={(v) => set({ h: v })} />
      </div>
    </div>
  );
}

/** Handles over the preview: drag to move, corner to resize, arrow keys for fine steps (Shift = 5 %), Delete removes. */
function Handles({ w, sel, onSelect, onChange, onRemove }: { w: CustomWidget; sel: string | null; onSelect: (id: string | null) => void; onChange: (id: string, p: Partial<WidgetElement>) => void; onRemove: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const start = (ev: RPointerEvent, e: WidgetElement, mode: "move" | "size") => {
    ev.preventDefault(); ev.stopPropagation();
    onSelect(e.id);
    const r = box.current!.getBoundingClientRect();
    const sx = ev.clientX, sy = ev.clientY, o = { ...e };
    const target = ev.currentTarget as HTMLElement;
    target.setPointerCapture(ev.pointerId);
    const move = (m: PointerEvent) => {
      const dx = ((m.clientX - sx) / r.width) * 100, dy = ((m.clientY - sy) / r.height) * 100;
      if (mode === "move") onChange(e.id, { x: round(clamp(o.x + dx, 0, 100 - o.w)), y: round(clamp(o.y + dy, 0, 100 - o.h)) });
      else onChange(e.id, { w: round(clamp(o.w + dx, 2, 100 - o.x)), h: round(clamp(o.h + dy, 2, 100 - o.y)) });
    };
    const up = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); target.removeEventListener("pointercancel", up); };
    target.addEventListener("pointermove", move); target.addEventListener("pointerup", up); target.addEventListener("pointercancel", up);
  };
  const key = (ev: React.KeyboardEvent, e: WidgetElement) => {
    const s = ev.shiftKey ? 5 : 1;
    const d = ({ ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] } as Record<string, [number, number]>)[ev.key];
    if (d) { ev.preventDefault(); onChange(e.id, { x: clamp(e.x + d[0], 0, 100 - e.w), y: clamp(e.y + d[1], 0, 100 - e.h) }); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); onRemove(e.id); }
  };
  return (
    <div ref={box} className="ws-handles" onPointerDown={(ev) => { if (ev.target === ev.currentTarget) onSelect(null); }}>
      {w.elements.map((e) => (
        <div key={e.id} role="button" tabIndex={0} aria-label={t("{t} verschieben", { t: elementLabel(e.type) })} aria-pressed={sel === e.id}
          className={`ws-handle ${sel === e.id ? "sel" : ""}`} style={{ left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%` }}
          onPointerDown={(ev) => start(ev, e, "move")} onKeyDown={(ev) => key(ev, e)} onFocus={() => onSelect(e.id)}>
          {sel === e.id && <span className="ws-resize" aria-hidden onPointerDown={(ev) => start(ev, e, "size")} />}
        </div>
      ))}
    </div>
  );
}

/** Where the widget is shown: dashboard (this device's layouts), overlay (stored on the PC), Windows desktop (window on the PC). */
function Placement({ w, saved, desktopSupported, canManage, onDesktop }: { w: CustomWidget; saved: boolean; desktopSupported: boolean | null; canManage: boolean; onDesktop: (on: boolean, width?: number) => void }) {
  const prefs = usePrefs();
  const id = (CUSTOM_PREFIX + w.id) as WidgetId;
  const activeIds = [prefs.activeLayout.desktop, prefs.activeLayout.mobile];
  const onDash = prefs.layouts.some((l) => activeIds.includes(l.id) && l.widgets.some((x) => x.id === id && x.visible));
  const toggleDash = () => setPrefs((p) => ({
    ...p,
    layouts: p.layouts.map((l) => !activeIds.includes(l.id) ? l : {
      ...l, widgets: l.widgets.some((x) => x.id === id) ? l.widgets.map((x) => (x.id === id ? { ...x, visible: !onDash } : x)) : [{ id, visible: true, size: "s" as const }, ...l.widgets],
    }),
  }));
  const plugins = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  const ov = useRpc<{ layout?: OverlayLayout }>("overlay.layout", {}, ["overlay"]);
  const overlay = layoutOrDefault(ov.data?.layout, overlayPluginWidgets(plugins.data));
  const inOverlay = overlay.widgets.some((x) => x.id === id);
  const toggleOverlay = () => client.call("overlay.saveLayout", { layout: inOverlay ? removeWidget(overlay, id) : addWidget(overlay, id) })
    .then(() => toast(inOverlay ? t("Aus dem Overlay entfernt") : t("Ins Overlay gelegt – Position im Overlay selbst verschieben"), "success"), (e: Error) => toast(e.message, "error"));
  return (
    <Card title={t("Wo soll es erscheinen?")} icon={<LayoutDashboard size={18} />}>
      {!saved && <p className="small muted">{t("Erst speichern – dann kann das Widget platziert werden.")}</p>}
      <div className="stack-sm">
        <Switch checked={onDash} disabled={!saved} onChange={toggleDash} label={t("Auf dem Dashboard")} hint={t("Website und PC-App – im aktiven Layout dieses Geräts. Reihenfolge und Größe unter Home → Anpassen.")} />
        <Switch checked={inOverlay} disabled={!saved || !canManage} onChange={toggleOverlay} label={t("Im Overlay (beim Zocken)")} hint={t("Frei verschiebbar im großen Overlay, wie in der Xbox Game Bar.")} />
        <Switch checked={w.desktop} disabled={!saved || !canManage || desktopSupported === false} onChange={(v) => onDesktop(v)}
          label={t("Auf dem Windows-Desktop")}
          hint={desktopSupported === false ? t("Dieser PC kann keine Desktop-Widgets anzeigen (nur der Windows-Begleiter).")
            : t("Eigenes kleines Fenster ganz unten auf dem Desktop – zum Verschieben ziehen (nicht an Knöpfen). Pausiert, solange ein Spiel läuft.")} />
        {w.desktop && (
          <Field label={t("Breite auf dem Desktop: {n} px", { n: w.desktopW })}>
            <input type="range" min={160} max={800} step={10} value={w.desktopW} disabled={!canManage} aria-label={t("Breite auf dem Desktop")} onChange={(e) => onDesktop(true, Number(e.target.value))} />
          </Field>
        )}
        <p className="tiny muted">{t("Startmenü, Sperrbildschirm und die Windows-Widget-Leiste (Win+W) lassen normale Programme nicht zu – dafür gibt es deshalb keinen Knopf.")}</p>
      </div>
    </Card>
  );
}

export default function WidgetStudio() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canManage = useCan("manage");
  const list = useRpc<{ widgets: CustomWidget[]; desktopSupported?: boolean }>("widgets.list", {}, ["widgets"]);
  const widgets = list.data?.widgets ?? [];
  const [draft, setDraft] = useState<CustomWidget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const saved = !!draft && widgets.some((w) => w.id === draft.id);

  // Unsaved changes must not get lost by leaving the page.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (fn: (w: CustomWidget) => CustomWidget) => { setDraft((d) => (d ? fn(d) : d)); setDirty(true); };
  const setEl = (id: string, p: Partial<WidgetElement>) => edit((w) => ({ ...w, elements: w.elements.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
  const removeEl = (id: string) => { edit((w) => ({ ...w, elements: w.elements.filter((e) => e.id !== id) })); setSel(null); };
  const moveEl = (id: string, d: number) => edit((w) => {
    const i = w.elements.findIndex((e) => e.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= w.elements.length) return w;
    const n = [...w.elements]; [n[i], n[j]] = [n[j], n[i]]; return { ...w, elements: n };
  });
  const addEl = (type: ElementType) => {
    if (!draft || draft.elements.length >= 40) return toast(t("Höchstens 40 Elemente pro Widget."), "error");
    const e = newElement(type);
    // New elements are placed slightly offset, so they do not hide each other.
    const n = draft.elements.length % 6;
    const placed = { ...e, x: clamp(e.x + n * 4, 0, 100 - e.w), y: clamp(e.y + n * 6, 0, 100 - e.h) };
    edit((w) => ({ ...w, elements: [...w.elements, placed] }));
    setSel(placed.id);
  };

  const open = async (w: CustomWidget | null) => {
    if (dirty && !(await confirmDialog(t("Änderungen verwerfen?"), t("Das aktuelle Widget hat ungespeicherte Änderungen.")))) return false;
    setDraft(w ? structuredClone(w) : null); setDirty(false); setSel(null);
    return true;
  };
  const save = async (w = draft) => {
    if (!w) return;
    const bad = w.elements.find((e) => e.type === "button" && ["quick", "launch", "sound", "profile"].includes(e.action ?? "") && !e.ref);
    if (bad) { setSel(bad.id); return toast(t("Der Knopf „{n}“ braucht noch ein Ziel.", { n: bad.text || t("Knopf") }), "error"); }
    setBusy(true);
    try {
      const r = await client.call<CustomWidget>("widgets.save", w);
      setDraft((d) => (d && d.id === w.id ? { ...d, ...(r && typeof r === "object" ? r : {}) } : d));
      setDirty(false);
      toast(online ? t("Widget gespeichert") : t("Gespeichert – wird beim Verbinden auf den PC übertragen"), "success");
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!draft || !(await confirmDialog(t("Widget löschen?"), t("„{n}“ verschwindet vom Dashboard, aus dem Overlay und vom Desktop.", { n: draft.name }), { danger: true, ok: t("Löschen") }))) return;
    try {
      if (saved) await client.call("widgets.remove", { id: draft.id });
      setDraft(null); setDirty(false);
      toast(t("Widget gelöscht"), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const duplicate = async () => {
    if (!draft) return;
    const copy = { ...structuredClone(draft), id: newWidgetId(), name: `${draft.name} (2)`.slice(0, 40), desktop: false, elements: draft.elements.map((e) => ({ ...e, id: newElementId() })) };
    if (await open(copy)) setDirty(true);
  };
  const setDesktop = (on: boolean, width?: number) => {
    if (!draft) return;
    const next = { ...draft, desktop: on, desktopW: width ?? draft.desktopW };
    setDraft(next);
    if (!dirty) save(next); else setDirty(true);
  };

  const el = draft?.elements.find((e) => e.id === sel) ?? null;
  return (
    <>
      <PageHead eyebrow={t("Anpassen")} title={t("Widget-Baukasten")}
        text={t("Eigene Widgets bauen: Texte, Uhr, Live-Werte, Knöpfe und Bilder frei anordnen – für Dashboard, Overlay und Windows-Desktop.")}
        actions={<Button variant="primary" icon={<Plus size={16} />} disabled={!canManage} onClick={() => setPicker(true)}>{t("Neues Widget")}</Button>} />
      {!canManage && <Banner kind="warn">{t("Dieses Gerät darf Widgets nur ansehen (Berechtigung „Verwalten“ fehlt).")}</Banner>}

      <div className="ws-layout">
        <aside className="ws-list" aria-label={t("Meine Widgets")}>
          {widgets.length === 0 && !draft && (
            <Empty icon={<Shapes size={28} />} title={t("Noch keine eigenen Widgets")} text={t("Starte mit einer Vorlage – alles darin lässt sich ändern.")}
              action={<Button variant="primary" icon={<Plus size={16} />} disabled={!canManage} onClick={() => setPicker(true)}>{t("Neues Widget")}</Button>} />
          )}
          {[...widgets, ...(draft && !saved ? [draft] : [])].map((w) => (
            <button key={w.id} type="button" className={`ws-item ${draft?.id === w.id ? "on" : ""}`} onClick={() => draft?.id !== w.id && open(w)} aria-pressed={draft?.id === w.id}>
              <div className="ws-thumb"><CustomWidgetView widget={draft?.id === w.id ? draft : w} interactive={false} /></div>
              <span className="ellipsis">{draft?.id === w.id ? draft.name : w.name}{draft?.id === w.id && (dirty || !saved) ? " •" : ""}</span>
              <span className="ws-badges">{w.desktop && <Monitor size={13} aria-label={t("Desktop")} />}</span>
            </button>
          ))}
        </aside>

        {draft ? (
          <section className="ws-main">
            <div className="ws-toolbar row">
              <input className="input ws-name" value={draft.name} maxLength={40} aria-label={t("Name des Widgets")} onChange={(e) => edit((w) => ({ ...w, name: e.target.value }))} />
              <Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!canManage || (!dirty && saved)} onClick={() => save()}>{t("Speichern")}</Button>
              {dirty && saved && <Button icon={<Undo2 size={16} />} onClick={() => { const w = widgets.find((x) => x.id === draft.id); if (w) { setDraft(structuredClone(w)); setDirty(false); setSel(null); } }}>{t("Verwerfen")}</Button>}
              <Button icon={<Copy size={16} />} disabled={!canManage} onClick={duplicate}>{t("Duplizieren")}</Button>
              <Button variant="danger" icon={<Trash2 size={16} />} disabled={!canManage} onClick={remove}>{t("Löschen")}</Button>
            </div>

            <div className="ws-stage">
              <div className="ws-canvas" style={{ maxWidth: 480 }}>
                <CustomWidgetView widget={draft} interactive={false}
                  overlayElements={<Handles w={draft} sel={sel} onSelect={setSel} onChange={setEl} onRemove={removeEl} />} />
              </div>
              <p className="tiny muted" style={{ textAlign: "center" }}>{t("Elemente ziehen zum Verschieben, Ecke unten rechts für die Größe. Pfeiltasten: feiner (mit Shift größere Schritte), Entf: löschen.")}</p>
              <div className="ws-palette" role="group" aria-label={t("Element hinzufügen")}>
                {TYPES.map((ty) => <Button key={ty} size="sm" icon={<Plus size={14} />} disabled={!canManage} onClick={() => addEl(ty)}>{elementLabel(ty)}</Button>)}
              </div>
            </div>

            <div className="ws-side">
              {el ? (
                <Card title={elementLabel(el.type)} icon={<Shapes size={18} />}
                  actions={<>
                    <Button size="sm" variant="ghost" icon={<ArrowUp size={15} />} aria-label={t("Nach vorne")} onClick={() => moveEl(el.id, 1)} />
                    <Button size="sm" variant="ghost" icon={<ArrowDown size={15} />} aria-label={t("Nach hinten")} onClick={() => moveEl(el.id, -1)} />
                    <Button size="sm" variant="ghost" icon={<Trash2 size={15} />} aria-label={t("Element löschen")} onClick={() => removeEl(el.id)} />
                  </>}>
                  <ElementProps e={el} set={(p) => setEl(el.id, p)} />
                </Card>
              ) : (
                <Card title={t("Widget")} icon={<Shapes size={18} />}>
                  <div className="stack-sm">
                    <Field label={t("Höhe (bei 360 px Breite): {n} px", { n: draft.height })}>
                      <input type="range" min={60} max={600} step={5} value={draft.height} aria-label={t("Höhe")} onChange={(e) => edit((w) => ({ ...w, height: Number(e.target.value) }))} />
                    </Field>
                    <div className="grid-2">
                      <ColorField label={t("Hintergrund")} value={draft.background} fallback="#111827" onChange={(v) => edit((w) => ({ ...w, background: v ?? "#111827" }))} />
                      <ColorField label={t("Verlauf zu")} value={draft.background2} fallback="#7c3aed" optional onChange={(v) => edit((w) => ({ ...w, background2: v }))} />
                      <ColorField label={t("Textfarbe")} value={draft.textColor} fallback="#f8fafc" onChange={(v) => edit((w) => ({ ...w, textColor: v ?? "#f8fafc" }))} />
                    </div>
                    <ImagePicker label={t("Hintergrundbild")} value={draft.image} onChange={(v) => edit((w) => ({ ...w, image: v }))} />
                    <Field label={t("Deckkraft: {p} %", { p: Math.round(draft.opacity * 100) })} hint={t("Gilt auf Dashboard und im Overlay – Desktop-Fenster sind immer deckend.")}>
                      <input type="range" min={20} max={100} step={5} value={Math.round(draft.opacity * 100)} aria-label={t("Deckkraft")} onChange={(e) => edit((w) => ({ ...w, opacity: Number(e.target.value) / 100 }))} />
                    </Field>
                    <Field label={t("Ecken-Rundung: {n} px", { n: draft.radius })}>
                      <input type="range" min={0} max={40} value={draft.radius} aria-label={t("Ecken-Rundung")} onChange={(e) => edit((w) => ({ ...w, radius: Number(e.target.value) }))} />
                    </Field>
                    {draft.elements.length > 0 && (
                      <Field label={t("Elemente (oben = vorne)")}>
                        <div className="ws-layers">
                          {[...draft.elements].reverse().map((e) => (
                            <button key={e.id} type="button" onClick={() => setSel(e.id)}>{elementLabel(e.type)}{e.text ? ` – ${e.text}` : ""}</button>
                          ))}
                        </div>
                      </Field>
                    )}
                  </div>
                </Card>
              )}
              {el && <Button size="sm" variant="ghost" onClick={() => setSel(null)}>{t("← Widget-Einstellungen")}</Button>}
              <Placement w={draft} saved={saved && !dirty} desktopSupported={list.data?.desktopSupported ?? null} canManage={canManage} onDesktop={setDesktop} />
            </div>
          </section>
        ) : widgets.length > 0 && (
          <section className="ws-main"><Empty icon={<Shapes size={28} />} title={t("Widget wählen")} text={t("Links ein Widget zum Bearbeiten wählen oder ein neues anlegen.")} /></section>
        )}
      </div>

      <p className="tiny muted" style={{ marginTop: 16 }}>
        {t("Widgets liegen auf dem PC und sind auf allen gekoppelten Geräten gleich. Ohne PC gebaute Widgets werden beim nächsten Verbinden übertragen.")}{" "}
        <Link to="/overlay-settings"><Video size={12} /> {t("Overlay & Aufnahme")}</Link>
      </p>

      {picker && (
        <Modal title={t("Neues Widget")} wide onClose={() => setPicker(false)}>
          <div className="ws-templates">
            {templates().map((tpl) => {
              const w = tpl.make();
              return (
                <button key={tpl.name} type="button" className="ws-template" onClick={async () => { if (await open(w)) { setPicker(false); setDirty(true); } }}>
                  <CustomWidgetView widget={w} interactive={false} />
                  <b>{tpl.name}</b>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </>
  );
}

