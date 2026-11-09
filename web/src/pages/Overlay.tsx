import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, AudioLines, Bell, Check, Coffee, Dices, Gamepad, Hash, Hourglass, Tag, Target, Trophy, Wifi, Clock, Gamepad2, Grid3x3, Headphones, LayoutGrid, ListTodo, Music, Music2, Puzzle, RotateCcw, Shapes, Star, StickyNote, Swords, Timer, Video, X, Zap,
  AudioWaveform, Eye, EyeOff, Magnet, Search as SearchIcon, LayoutTemplate,
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
import { CaptureWidget, MicChip, RecChip, SoundboardWidget } from "../components/overlay-widgets";
import { META } from "./Dashboard";
import { CustomWidgetView } from "../components/CustomWidgetView";
import { CUSTOM_PREFIX, type CustomWidget } from "../lib/custom-widgets";

const ICONS: Record<OverlayBuiltin, ReactNode> = {
  system: <Activity size={18} />, capture: <Video size={18} />, quick: <Zap size={18} />, soundboard: <Music size={18} />, favorites: <Star size={18} />,
  recent: <Clock size={18} />, audio: <Headphones size={18} />, playing: <AudioLines size={18} />, profile: <Swords size={18} />,
  session: <Gamepad2 size={18} />, notifications: <Bell size={18} />, deck: <Grid3x3 size={18} />, media: <Music2 size={18} />, timer: <Timer size={18} />,
  clock: <Clock size={18} />, notes: <StickyNote size={18} />, next: <ListTodo size={18} />,
  counter: <Hash size={18} />, break: <Coffee size={18} />, today: <Hourglass size={18} />, ping: <Wifi size={18} />, goals: <Target size={18} />,
  level: <Trophy size={18} />, deals: <Tag size={18} />, controller: <Gamepad size={18} />, random: <Dices size={18} />, visualizer: <AudioWaveform size={18} />, bingo: <Grid3x3 size={18} />,
};

/** Widget menu in sections – 28 entries in one list were hard to scan. */
const WIDGET_GROUPS: { title: string; ids: OverlayBuiltin[] }[] = [
  { title: "Spiel & System", ids: ["session", "system", "quick", "favorites", "recent", "profile", "controller", "ping", "today"] },
  { title: "Aufnahme & Ton", ids: ["capture", "soundboard", "audio", "playing", "media", "visualizer"] },
  { title: "Zeit & Notizen", ids: ["clock", "timer", "notes", "next", "counter", "break"] },
  { title: "Fortschritt & Sammlung", ids: ["goals", "level", "deals", "random", "bingo", "notifications"] },
];

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
  const [leaving, setLeaving] = useState(false);
  const [session, setSession] = useState(0);                 // a new number = the bar and the windows play their entrance again the next time the overlay opens
  const [find, setFind] = useState("");
  const [snap, setSnap] = useState(() => { try { return localStorage.getItem("pgl.gb.snap") !== "0"; } catch { return true; } });
  const presets = useRpc<{ presets: { id: string; name: string; layout: OverlayLayout }[] }>("overlay.presets", {}, ["overlay"]);
  const still = () => document.documentElement.dataset.motion === "reduce" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  // Closing plays a short exit (0.18 s) first, then the PC hides the window.
  const hide = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => { client.call("overlay.hide").catch(() => {}).finally(() => { setLeaving(false); setMenu(false); setSession((n) => n + 1); }); }, still() ? 0 : 180);
  };

  useEffect(() => {
    document.documentElement.classList.add("overlay-mode");
    // Esc closes; Alt+R starts/stops the recording and Alt+C saves a replay – even while the recording widget is hidden.
    // Not while typing in a widget (notes) and not while the widget menu has focus.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (menu) setMenu(false); else hide(); return; }
      const typing = e.target instanceof HTMLElement && !!e.target.closest("input, textarea, select, [contenteditable='true']");
      if (typing || menu || !e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyR") { e.preventDefault(); client.call("capture.recordToggle").catch(() => {}); }
      if (e.code === "KeyC") { e.preventDefault(); client.call("capture.replaySave").catch(() => {}); }
    };
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
  const q = find.trim().toLowerCase();
  const found = catalog.filter((c) => !q || c.title.toLowerCase().includes(q));
  const groups = WIDGET_GROUPS
    .map((g) => ({ title: g.title, items: found.filter((c) => (g.ids as string[]).includes(c.id)) }))
    .filter((g) => g.items.length > 0);
  const rest = found.filter((c) => !WIDGET_GROUPS.some((g) => (g.ids as string[]).includes(c.id)));
  if (rest.length) groups.push({ title: "Eigene & Plugins", items: rest });

  return (
    <div key={session} className={`gb-root${leaving ? " leaving" : ""}`} style={{ ["--gb-alpha" as string]: l.opacity }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { if (menu) setMenu(false); else hide(); } }}
      // Links inside widgets would turn the overlay into the full app – the overlay stays the overlay.
      onClickCapture={(e) => { if ((e.target as HTMLElement).closest('a[href^="#/"]')) e.preventDefault(); }}>
      <header className="gb-bar" role="toolbar" aria-label={t("Overlay-Leiste")}>
        <span className="gb-logo" aria-hidden><Gamepad2 size={18} /></span>
        <b className="gb-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
        <span className="gb-sep" />
        <RecChip /><MicChip />
        {placed.map((w, i) => {
          const e = entry(w.id)!;
          return (
            <button key={w.id} style={{ ["--i" as string]: i }} className={`gb-icon ${w.visible ? "on" : ""}`} title={e.title} aria-label={e.title} aria-pressed={w.visible}
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
          <label className="gb-search"><SearchIcon size={14} aria-hidden />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder={t("Widgets suchen …")} aria-label={t("Widgets suchen")} /></label>
          <div className="gb-menu-title">{t("Widgets")}</div>
          {groups.length === 0 && <p className="gb-menu-empty">{t("Keine Widgets gefunden.")}</p>}
          {groups.map((g) => {
            const active = g.items.filter((c) => l.widgets.some((w) => w.id === c.id)).length;
            return (
              <div key={g.title} className="gb-menu-section">
                <div className="gb-menu-title">{t(g.title)}<span className="gb-menu-count" aria-hidden>{active}/{g.items.length}</span></div>
                {g.items.map((c) => {
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
              </div>
            );
          })}
          <label className="gb-menu-item">
            <span className="grow">{t("Deckkraft")} {Math.round(l.opacity * 100)} %</span>
            <input type="range" min={50} max={100} step={5} value={Math.round(l.opacity * 100)} aria-label={t("Deckkraft")}
              onChange={(e) => { editing.current = true; save({ ...l, opacity: Number(e.target.value) / 100 }); }} />
          </label>
          {(presets.data?.presets ?? []).length > 0 && (
            <>
              <div className="gb-menu-title">{t("Ansichten")}</div>
              <div className="gb-chips">
                {presets.data!.presets.map((p) => (
                  <button key={p.id} className="gb-chip" title={t("„{n}“ anwenden", { n: p.name })}
                    onClick={() => { editing.current = false; client.call<{ layout: OverlayLayout }>("overlay.applyPreset", { id: p.id }).then((r) => setLayout(layoutOrDefault(r.layout, overlayPluginWidgets(plugins.data!), view)), () => {}); }}>
                    <LayoutTemplate size={12} /> {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="gb-row">
            <button className="gb-btn" onClick={() => { editing.current = true; const allOn = l.widgets.every((w) => w.visible); save({ ...l, widgets: l.widgets.map((w) => ({ ...w, visible: !allOn })) }); }}>
              {l.widgets.every((w) => w.visible) ? <EyeOff size={14} /> : <Eye size={14} />} {l.widgets.every((w) => w.visible) ? t("Alle ausblenden") : t("Alle einblenden")}
            </button>
            <button className={`gb-btn gb-toggle${snap ? " on" : ""}`} aria-pressed={snap} title={t("Beim Verschieben an Raster und Rändern einrasten (Alt gedrückt halten: frei)")}
              onClick={() => { const v = !snap; setSnap(v); try { localStorage.setItem("pgl.gb.snap", v ? "1" : "0"); } catch { /* ignore */ } }}><Magnet size={14} /> {t("Einrasten")}</button>
          </div>
          <button className="gb-btn wide" onClick={() => { editing.current = true; save(null); }}><RotateCcw size={14} /> {t("Anordnung zurücksetzen")}</button>
          <p className="gb-muted gb-menu-hint">{t("Widgets am Titel verschieben, an der Ecke unten rechts die Größe ändern.")}<br />{t("Tasten: Alt+R Aufnahme · Alt+C Replay · Esc schließen.")}</p>
        </div>
      )}

      {conn.auth !== "ok" && <div className="gb-panel gb-center">{t("Verbinde mit dem Begleiter …")}</div>}
      {placed.filter((w) => w.visible).map((w, i) => (
        <Panel key={w.id} idx={i} snap={snap} place={w} view={view} entry={entry(w.id)!} z={10 + front.indexOf(w.id) + 1} onFocus={() => toFront(w.id)}
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
function Panel({ idx, snap, place, view, entry, z, onFocus, onMove, onClose }: { idx: number; snap: boolean; place: OverlayWidgetPlace; view: { w: number; h: number }; entry: Entry; z: number; onFocus: () => void; onMove: (p: OverlayWidgetPlace) => void; onClose: () => void }) {
  const [live, setLive] = useState<OverlayWidgetPlace | null>(null);
  const [dragging, setDragging] = useState(false);
  const p = live ?? place;
  const left = Math.max(0, Math.min(p.x * view.w, view.w - Math.min(p.w, view.w) - 8));   // always fully on the screen
  const top = Math.min(p.y * view.h, Math.max(0, view.h - 40));

  const drag = (mode: "move" | "size") => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const panel = el.closest(".gb-panel") as HTMLElement;
    const start = { x: e.clientX, y: e.clientY, left, top, w: panel.offsetWidth, h: panel.offsetHeight };
    let last = p;
    setDragging(true);
    // Snap to an 8 px grid and to the screen edges (12 px pull); holding Alt moves freely.
    const magnet = (v: number, max: number, on: boolean) => { if (!on) return v; const g = Math.round(v / 8) * 8; return g < 12 ? 0 : g > max - 12 ? max : g; };
    const onMovePtr = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      const on = snap && !ev.altKey;
      const maxX = view.w - 80, maxY = view.h - 40;
      last = mode === "move"
        ? { ...p, x: Math.max(0, Math.min(magnet(start.left + dx, maxX, on), maxX)) / view.w, y: Math.max(0, Math.min(magnet(start.top + dy, maxY, on), maxY)) / view.h }
        : { ...p, w: Math.round(Math.max(200, Math.min(start.w + dx, 1600))), h: Math.round(Math.max(100, Math.min(start.h + dy, 1200))) };
      setLive(last);
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMovePtr);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      setLive(null); setDragging(false);
      onMove(last);
    };
    el.addEventListener("pointermove", onMovePtr);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  };

  return (
    <section className={`gb-panel${dragging ? " dragging" : ""}`} style={{ left, top, width: p.w, height: p.h || undefined, zIndex: z, ["--i" as string]: idx }} aria-label={entry.title} onPointerDownCapture={onFocus}>
      <header className="gb-panel-head" onPointerDown={drag("move")} title={t("Zum Verschieben ziehen")}>
        <span className="gb-panel-icon">{entry.icon}</span>
        <span className="gb-panel-title">{entry.title}</span>
        <button className="gb-icon sm" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} aria-label={t("{w} ausblenden", { w: entry.title })}><X size={14} /></button>
      </header>
      <div className="gb-panel-body">{entry.render()}</div>
      <span className="gb-resize" onPointerDown={drag("size")} aria-hidden title={t("Größe ändern")}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M9 3 3 9M9 6.5 6.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" /></svg></span>
    </section>
  );
}
