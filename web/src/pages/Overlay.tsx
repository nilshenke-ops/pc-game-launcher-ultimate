import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, AudioLines, Bell, Check, Coffee, Dices, Gamepad, Hash, Hourglass, Tag, Target, Trophy, Wifi, Clock, Gamepad2, Grid3x3, Headphones, LayoutGrid, ListTodo, Music, Music2, Puzzle, RotateCcw, Shapes, Star, StickyNote, Swords, Timer, Video, X, Zap,
  AudioWaveform,
} from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useRpc } from "../lib/hooks";
import { refreshState } from "../lib/state";
import { pluginWidgetId, type PluginList } from "../lib/plugins";
import {
  addWidget, DEFAULT_OVERLAY_LAYOUT, layoutOrDefault, OVERLAY_BUILTINS, overlayPluginWidgets, overlayBuiltinTitle, removeWidget, setVisible,
  type OverlayBuiltin, type OverlayLayout, type OverlayWidgetPlace,
} from "../lib/overlay-layout";
import { PluginFrame } from "../components/PluginFrame";
import { CaptureWidget, SoundboardWidget } from "../components/overlay-widgets";
import { META } from "./Dashboard";
import { CustomWidgetView } from "../components/CustomWidgetView";
import { CUSTOM_PREFIX, type CustomWidget } from "../lib/custom-widgets";

const ICONS: Record<OverlayBuiltin, ReactNode> = {
  system: <Activity size={18} />, capture: <Video size={18} />, quick: <Zap size={18} />, soundboard: <Music size={18} />, favorites: <Star size={18} />,
  recent: <Clock size={18} />, audio: <Headphones size={18} />, playing: <AudioLines size={18} />, profile: <Swords size={18} />,
  session: <Gamepad2 size={18} />, notifications: <Bell size={18} />, deck: <Grid3x3 size={18} />, media: <Music2 size={18} />, timer: <Timer size={18} />,
  clock: <Clock size={18} />, notes: <StickyNote size={18} />, next: <ListTodo size={18} />,
  counter: <Hash size={18} />, break: <Coffee size={18} />, today: <Hourglass size={18} />, ping: <Wifi size={18} />, goals: <Target size={18} />,
  level: <Trophy size={18} />, deals: <Tag size={18} />, controller: <Gamepad size={18} />, random: <Dices size={18} />, visualizer: <AudioWaveform size={18} />,
};

interface Entry { id: string; title: string; icon: ReactNode; render: () => ReactNode }

/**
 * The large in-game overlay (Windows companion, opened with the overlay shortcut), modelled on the Xbox Game Bar:
 * a bar at the top centre and free-floating widget windows that can be moved and resized anywhere on the screen.
 * The arrangement is stored on the PC. Esc, the shortcut or a click on the empty background close it.
 */
export default function Overlay() {
  const conn = useConn();
  const plugins = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  const saved = useRpc<{ layout?: OverlayLayout }>("overlay.layout", {}, ["overlay"]);
  const custom = useRpc<{ widgets: CustomWidget[] }>("widgets.list", {}, ["widgets"]);
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const [menu, setMenu] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const saveTimer = useRef<number | undefined>(undefined);
  const editing = useRef(false);
  const hide = () => client.call("overlay.hide").catch(() => {});

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (menu) setMenu(false); else hide(); } };
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    const tick = window.setInterval(() => setNow(new Date()), 10_000);
    return () => { document.documentElement.classList.remove("overlay-mode"); window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); clearInterval(tick); };
  }, [menu]);
  useEffect(() => { if (conn.auth === "ok") refreshState(0); }, [conn.auth]);
  // Take the stored arrangement – but not while something is being dragged here (that would make it jump back).
  useEffect(() => { if (saved.data && plugins.data && !editing.current) setLayout(layoutOrDefault(saved.data.layout, overlayPluginWidgets(plugins.data), { w: window.innerWidth, h: window.innerHeight })); }, [saved.data, plugins.data]);
  // Like the Game Bar: the widget clicked last is in front.
  const [front, setFront] = useState<string[]>([]);
  const toFront = (id: string) => setFront((f) => (f[f.length - 1] === id ? f : [...f.filter((x) => x !== id), id]));

  const save = (l: OverlayLayout | null) => {
    setLayout(l ?? DEFAULT_OVERLAY_LAYOUT);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      client.call("overlay.saveLayout", { layout: l })
        .then(() => setSaveError(null), (e: Error) => setSaveError(e.message))
        .finally(() => { editing.current = false; });
    }, 400);
  };

  const catalog: Entry[] = [
    ...OVERLAY_BUILTINS.map((id) => ({
      id, title: overlayBuiltinTitle(id), icon: ICONS[id],
      render: () => (id === "capture" ? <CaptureWidget /> : id === "soundboard" ? <SoundboardWidget /> : META[id].render()),
    })),
    ...(plugins.data?.plugins ?? []).filter((p) => p.enabled && p.manifest?.platforms.includes("web")).flatMap((p) => p.manifest!.contributes.widgets.map((w) => ({
      id: pluginWidgetId(p.id, w.id), title: w.title, icon: <Puzzle size={18} />, render: () => <PluginFrame plugin={p} widget={w} />,
    }))),
    ...(custom.data?.widgets ?? []).map((w) => ({ id: CUSTOM_PREFIX + w.id, title: w.name, icon: <Shapes size={18} />, render: () => <CustomWidgetView widget={w} /> })),
  ];
  const entry = (id: string) => catalog.find((c) => c.id === id);
  const l = layout ?? DEFAULT_OVERLAY_LAYOUT;
  const placed = l.widgets.filter((w) => entry(w.id));

  return (
    <div className="gb-root" style={{ ["--gb-alpha" as string]: l.opacity }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { if (menu) setMenu(false); else hide(); } }}
      // Links inside widgets would turn the overlay into the full app – the overlay stays the overlay.
      onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a[href^="#/"]')) e.preventDefault(); }}>
      <header className="gb-bar" role="toolbar" aria-label={t("Overlay-Leiste")}>
        <span className="gb-logo" aria-hidden><Gamepad2 size={18} /></span>
        <b className="gb-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
        <span className="gb-sep" />
        {placed.map((w) => {
          const e = entry(w.id)!;
          return (
            <button key={w.id} className={`gb-icon ${w.visible ? "on" : ""}`} title={e.title} aria-label={e.title} aria-pressed={w.visible}
              onClick={() => { editing.current = true; save(setVisible(l, w.id, !w.visible)); }}>{e.icon}</button>
          );
        })}
        <span className="gb-sep" />
        <button className={`gb-icon ${menu ? "on" : ""}`} title={t("Widgets")} aria-label={t("Widgets")} aria-expanded={menu} onClick={() => setMenu(!menu)}><LayoutGrid size={18} /></button>
        <button className="gb-icon" title={t("Schließen")} aria-label={t("Schließen")} onClick={hide}><X size={18} /></button>
        {saveError && <span className="gb-error" role="alert">{t("Anordnung nicht gespeichert: {e}", { e: saveError })}</span>}
      </header>

      {menu && (
        <div className="gb-menu" role="dialog" aria-label={t("Widgets")}>
          <div className="gb-menu-title">{t("Widgets")}</div>
          {catalog.map((c) => {
            const on = l.widgets.some((w) => w.id === c.id);
            return (
              <label key={c.id} className="gb-menu-item">
                <span className="gb-menu-icon">{c.icon}</span>
                <span className="grow">{c.title}</span>
                <input type="checkbox" checked={on} aria-label={c.title}
                  onChange={() => { editing.current = true; save(on ? removeWidget(l, c.id) : addWidget(l, c.id, view)); }} />
              </label>
            );
          })}
          <label className="gb-menu-item">
            <span className="grow">{t("Deckkraft")} {Math.round(l.opacity * 100)} %</span>
            <input type="range" min={50} max={100} step={5} value={Math.round(l.opacity * 100)} aria-label={t("Deckkraft")}
              onChange={(e) => { editing.current = true; save({ ...l, opacity: Number(e.target.value) / 100 }); }} />
          </label>
          <button className="gb-btn wide" onClick={() => { editing.current = true; save(null); }}><RotateCcw size={14} /> {t("Anordnung zurücksetzen")}</button>
          <p className="gb-muted">{t("Widgets am Titel verschieben, an der Ecke unten rechts die Größe ändern.")}</p>
        </div>
      )}

      {conn.auth !== "ok" && <div className="gb-panel gb-center">{t("Verbinde mit dem Begleiter …")}</div>}
      {placed.filter((w) => w.visible).map((w) => (
        <Panel key={w.id} place={w} view={view} entry={entry(w.id)!} z={10 + front.indexOf(w.id) + 1} onFocus={() => toFront(w.id)}
          onMove={(p) => { editing.current = true; save({ ...l, widgets: l.widgets.map((x) => (x.id === w.id ? p : x)) }); }}
          onClose={() => { editing.current = true; save(setVisible(l, w.id, false)); }} />
      ))}
      {conn.auth === "ok" && placed.length === 0 && !menu && (
        <div className="gb-panel gb-center"><Check size={16} /> {t("Keine Widgets – oben über das Raster-Symbol hinzufügen.")}</div>
      )}
    </div>
  );
}

/** A widget window: drag at the title bar, resize at the bottom-right corner. Position is kept as share of the screen. */
function Panel({ place, view, entry, z, onFocus, onMove, onClose }: { place: OverlayWidgetPlace; view: { w: number; h: number }; entry: Entry; z: number; onFocus: () => void; onMove: (p: OverlayWidgetPlace) => void; onClose: () => void }) {
  const [live, setLive] = useState<OverlayWidgetPlace | null>(null);
  const p = live ?? place;
  const left = Math.min(p.x * view.w, Math.max(0, view.w - 120));
  const top = Math.min(p.y * view.h, Math.max(0, view.h - 40));

  const drag = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const panel = el.closest(".gb-panel") as HTMLElement;
    const start = { x: e.clientX, y: e.clientY, left, top, w: panel.offsetWidth, h: panel.offsetHeight };
    let last = p;
    const onMovePtr = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      last = mode === "move"
        ? { ...p, x: Math.max(0, Math.min(start.left + dx, view.w - 80)) / view.w, y: Math.max(0, Math.min(start.top + dy, view.h - 40)) / view.h }
        : { ...p, w: Math.round(Math.max(200, Math.min(start.w + dx, 1600))), h: Math.round(Math.max(100, Math.min(start.h + dy, 1200))) };
      setLive(last);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMovePtr);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setLive(null);
      onMove(last);
    };
    el.addEventListener("pointermove", onMovePtr);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  return (
    <section className="gb-panel" style={{ left, top, width: p.w, height: p.h || undefined, zIndex: z }} aria-label={entry.title} onPointerDownCapture={onFocus}>
      <header className="gb-panel-head" onPointerDown={drag("move")} title={t("Zum Verschieben ziehen")}>
        <span className="gb-panel-icon">{entry.icon}</span>
        <span className="gb-panel-title">{entry.title}</span>
        <button className="gb-icon sm" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label={t("{w} ausblenden", { w: entry.title })}><X size={14} /></button>
      </header>
      <div className="gb-panel-body">{entry.render()}</div>
      <span className="gb-resize" onPointerDown={drag("size")} aria-hidden title={t("Größe ändern")} />
    </section>
  );
}
