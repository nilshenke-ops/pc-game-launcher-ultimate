import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, ArrowDown, ArrowUp, Bell, Check, Clock, Eye, EyeOff, Gamepad2, Headphones, LayoutDashboard, Maximize2, Music, RotateCcw,
  Grid3x3, LayoutGrid, ListTodo, Rocket, Timer, Smartphone, Square, Star, StickyNote, Swords, Wifi, Zap,
  Puzzle, Shapes,
} from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { useConn, useConnectingSoon, useEvent, useLiveSubscription, useMediaQuery, useRpc } from "../lib/hooks";
import { useAppState, usePlaying } from "../lib/state";
import { ALL_WIDGETS, DEFAULT_LAYOUT, setPrefs, usePrefs, type WidgetConf, type WidgetId, type WidgetSize } from "../lib/prefs";
import { OFFLINE_WIDGETS, type BuiltinWidgetId } from "../lib/prefs-core";
import { ClockWidget, MediaWidget, MiniDeckWidget, NextWidget, NotesWidget, ShortcutsWidget, StartWidget, TimerWidget } from "../components/home-widgets";
import { parsePluginWidgetId, pluginWidgetId, type PluginList } from "../lib/plugins";
import { PluginFrame } from "../components/PluginFrame";
import { bytes, clock, relTime, since } from "../lib/format";
import { IconByName } from "../lib/nav";
import type { LibraryItem, MetricsSample, Notification, QuickAction } from "../lib/types";
import { Banner, Button, Card, Empty, Meter, PageHead } from "../components/ui";
import { DownloadCard } from "../components/DownloadCard";
import { TileRow } from "../components/launch-tiles";
import { runQuickAction } from "../components/run-quick";
import { CustomWidgetView } from "../components/CustomWidgetView";
import { CUSTOM_PREFIX, type CustomWidget } from "../lib/custom-widgets";
import { CUSTOM_WIDGET } from "../lib/prefs-core";

function StatusWidget() {
  const { state, updatedAt } = useAppState();
  const conn = useConn();
  const soon = useConnectingSoon();
  const online = conn.phase === "online" && conn.auth === "ok"; // real connection state, not the last known data
  if (client.preview) {
    return (
      <div className="stack">
        <div className="row nowrap">
          <div className="grow">
            <div className="eyebrow">{t("Dein Gaming-PC")}</div>
            <h2 style={{ fontSize: "1.4rem" }}>{t("Offline – kein PC verbunden")}</h2>
            <div className="small muted">{t("Öffne am PC den Nexus Gaming Hub → „Gerät koppeln“ und scanne den QR-Code. Bis dahin kannst du schon alles einrichten.")}</div>
          </div>
          <span className="badge"><span className="dot error" />{t("Offline")}</span>
        </div>
        <div className="row"><Link to="/connect" className="btn primary sm">{t("PC verbinden")}</Link><Link to="/settings?s=design" className="btn sm">{t("Design & Layout anpassen")}</Link></div>
      </div>
    );
  }
  if (!state) {
    if (soon || (conn.phase === "online" && (conn.auth === "ok" || conn.auth === "checking"))) return <div className="skeleton" style={{ height: 120 }} />;
    return (
      <div className="stack">
        <div className="row nowrap">
          <div className="grow">
            <div className="eyebrow">{t("Dein Gaming-PC")}</div>
            <h2 style={{ fontSize: "1.4rem" }}>{t("Warte auf deinen PC …")}</h2>
            <div className="small muted">{t("Sobald der PC an ist und der Begleiter läuft, verbindet sich die App von selbst.")}</div>
          </div>
          <span className="badge"><span className="dot error" />{t("Offline")}</span>
        </div>
        <div className="row"><Button size="sm" variant="primary" onClick={() => client.reconnectNow()}>{t("Jetzt verbinden")}</Button><Link to="/settings?s=design" className="btn sm">{t("Design & Layout anpassen")}</Link></div>
      </div>
    );
  }
  const relay = state.relay.state;
  return (
    <div className="stack">
      <div className="row nowrap">
        <div className="grow">
          <div className="eyebrow">{t("Dein Gaming-PC")}</div>
          <h2 style={{ fontSize: "1.4rem" }}>{state.pcName}</h2>
          <div className="small muted">{state.platform} · Companion v{state.version}</div>
        </div>
        {online ? <span className="badge ok"><span className="dot ok" />{t("Online")}</span> : <span className="badge"><span className="dot error" />{t("Nicht verbunden")}</span>}
      </div>
      <div className="row">
        <span className="badge info"><Wifi size={12} />{state.me.transport === "relay" ? t("Über Relay") : t("Lokal verbunden")}</span>
        <span className={`badge ${relay === "connected" ? "ok" : relay === "disabled" ? "" : "warn"}`}>{t("Relay")}: {relay === "connected" ? t("verbunden") : relay === "disabled" ? t("aus") : relay}</span>
        <span className="badge">{state.me.isLocal ? t("Am PC") : state.me.name}</span>
      </div>
      <div className="tiny muted">{t("Aktualisiert {t}", { t: updatedAt ? clock(updatedAt) : "–" })}</div>
    </div>
  );
}

function SessionWidget() {
  const { state } = useAppState();
  const running = state?.running ?? [];
  if (!running.length) return <Empty icon={<Gamepad2 size={26} />} title={t("Kein Spiel aktiv")} text={t("Erkannt werden Spiele aus deiner Bibliothek mit Prozessname oder Installationsordner.")} />;
  return (
    <div className="stack">
      {running.map((r) => (
        <div key={r.itemId} className="row nowrap">
          <span className="dot ok pulse" />
          <div className="grow"><b className="ellipsis">{r.name}</b><div className="small muted">{t("läuft seit {d}", { d: since(r.since) })}</div></div>
        </div>
      ))}
    </div>
  );
}

function ProfileWidget() {
  const { state } = useAppState();
  const p = state?.activeProfile;
  if (!p) return <Empty icon={<Swords size={26} />} title={t("Kein Profil aktiv")} />;
  return (
    <div className="stack">
      <div className="row nowrap">
        <div className="thumb" style={{ background: p.color, color: "#04121a" }}><IconByName name={p.icon} size={20} /></div>
        <div className="grow"><b>{p.name}</b><div className="small muted">{p.reason}</div></div>
      </div>
      <div className="row">
        <Link to="/profiles" className="btn sm">{t("Wechseln")}</Link>
        <span className="tiny muted">{state?.autoSwitch ? t("Automatischer Wechsel an") : t("Automatischer Wechsel aus")}</span>
      </div>
    </div>
  );
}

function QuickWidget() {
  const q = useRpc<{ actions: QuickAction[] }>("quick.list", {}, ["quick"]);
  const { state } = useAppState();
  // The active gaming profile's quick actions come first (in the profile's order); otherwise the ones marked for the dashboard.
  const all = q.data?.actions ?? [];
  const fromProfile = (state?.activeProfile?.quickActionIds ?? []).map((id) => all.find((a) => a.id === id)).filter((a): a is QuickAction => !!a);
  const actions = (fromProfile.length ? fromProfile : all.filter((a) => a.showOnDashboard)).slice(0, 8);
  if (!q.loading && !actions.length) return <Empty icon={<Zap size={26} />} title={t("Keine Quick Actions")} action={<Link to="/quick" className="btn sm">{t("Erstellen")}</Link>} />;
  return (
    <div className="qa-grid">
      {actions.map((a) => (
        <button key={a.id} className="card flat qa-tile" style={{ padding: 12 }} onClick={() => runQuickAction(a)}>
          <span className="ico"><IconByName name={a.icon} /></span>
          <b className="small">{a.name}</b>
        </button>
      ))}
    </div>
  );
}

function ItemsWidget({ mode }: { mode: "favorites" | "recent" }) {
  const lib = useRpc<{ items: LibraryItem[]; running: string[] }>("library.list", {}, ["library"]);
  const hist = useRpc<{ launches: { itemId: string; at: string }[] }>("history.get", {}, ["history"], mode === "recent");
  const items = lib.data?.items ?? [];
  const list = mode === "favorites"
    ? items.filter((i) => i.favorite).slice(0, 12)
    : [...new Map((hist.data?.launches ?? []).map((l) => [l.itemId, l])).values()].map((l) => ({ item: items.find((i) => i.id === l.itemId), at: l.at })).filter((x) => x.item).slice(0, 6).map((x) => x.item!);
  // No favourites yet: show the games anyway (most recently added first), so the home screen is useful right away.
  const shown = list.length || mode === "recent" ? list : [...items].sort((x, y) => Number(y.kind === "game") - Number(x.kind === "game") || Date.parse(y.addedAt) - Date.parse(x.addedAt)).slice(0, 10);
  // Placeholder of the same height while the list loads – the widgets below do not jump.
  if (!shown.length && (lib.loading || (!lib.data && !lib.error))) return <div className="skeleton" style={{ height: 96 }} />;
  if (!lib.loading && !shown.length)
    return <Empty icon={mode === "favorites" ? <Star size={26} /> : <Clock size={26} />} title={mode === "favorites" ? t("Noch keine Spiele") : t("Noch nichts gestartet")} text={mode === "favorites" ? t("Sobald der PC verbunden ist, erscheinen hier deine Spiele zum Antippen.") : undefined} action={<Link to="/games" className="btn sm">{t("Zur Bibliothek")}</Link>} />;
  return (
    <div className="stack-sm">
      <TileRow items={shown} running={lib.data?.running ?? []} />
      {mode === "favorites" && !list.length && <span className="tiny muted">{t("Tipp: Mit dem Stern auf der Spiele-Seite legst du fest, was hier steht.")}</span>}
    </div>
  );
}

function SystemWidget() {
  const [m, setM] = useState<MetricsSample | null>(null);
  useLiveSubscription<MetricsSample>("monitor", setM);
  useEvent<MetricsSample>("monitor.sample", setM);
  if (!m && client.preview) return <p className="small muted">{t("Live-Werte erscheinen, sobald dein PC verbunden ist.")}</p>;
  if (!m) return <div className="skeleton" style={{ height: 110 }} />;
  const ram = m.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null;
  const gpu = m.gpus[0];
  const na = (k: "cpu" | "ram" | "gpu") => m.off?.includes(k) ? t("Ausgeschaltet") : t("Nicht verfügbar");
  const Row = ({ k, v, val }: { k: string; v: string; val?: number | null }) => (
    <div className="stack-sm"><div className="row between small"><span className="muted">{k}</span><b>{v}</b></div><Meter value={val} /></div>
  );
  return (
    <div className="stack">
      <Row k="CPU" v={m.cpuPercent != null ? `${m.cpuPercent.toFixed(0)} %` : na("cpu")} val={m.cpuPercent} />
      <Row k="RAM" v={ram != null ? `${bytes(m.memUsedBytes)} / ${bytes(m.memTotalBytes)}` : na("ram")} val={ram} />
      <Row k={gpu?.name ? `GPU · ${gpu.name}` : "GPU"} v={gpu?.utilPercent != null ? `${gpu.utilPercent.toFixed(0)} %${gpu.tempC != null ? ` · ${gpu.tempC} °C` : ""}` : na("gpu")} val={gpu?.utilPercent} />
      <div className="tiny muted">{t("Live · {t}", { t: clock(m.at) })} · <Link to="/monitor">{t("Details")}</Link></div>
    </div>
  );
}

function AudioWidget() {
  const { state } = useAppState();
  if (!state) return <div className="skeleton" style={{ height: 72 }} />;
  const a = state.audio;
  if (!a.supported) return <Banner kind="info">{t("Audio wird nur vom Windows-Companion unterstützt.")}</Banner>;
  return (
    <div className="stack">
      <div className="small"><span className="muted">{t("Ausgabe")}:</span> <b>{a.output}</b></div>
      <div className="small"><span className="muted">{t("Mikrofon")}:</span> <b>{a.mic}</b></div>
      <div className="stack-sm"><div className="row between small"><span className="muted">{t("Lautstärke Soundboard")}</span><b>{a.volume} %</b></div><Meter value={a.volume} /></div>
      {a.missing.length > 0 && <Banner kind="warn">{t("Fehlt: {x}", { x: a.missing.join(", ") })}</Banner>}
    </div>
  );
}

function PlayingWidget() {
  const playing = usePlaying()?.playing ?? [];
  if (!playing.length) return <Empty icon={<Music size={26} />} title={t("Kein Sound aktiv")} action={<Link to="/soundboard" className="btn sm">{t("Soundboard")}</Link>} />;
  return (
    <div className="stack">
      {playing.map((p) => (
        <div key={p.playbackId} className="row nowrap"><span className="dot ok pulse" /><span className="grow ellipsis">{p.name}</span>
          <Button size="sm" icon={<Square size={13} />} onClick={() => client.call("sounds.stop", { playbackId: p.playbackId })} aria-label={t("Stopp")} /></div>
      ))}
      <Button size="sm" variant="danger" onClick={() => client.call("sounds.stopAll")}>{t("Alle stoppen")}</Button>
    </div>
  );
}

function NotificationsWidget() {
  const q = useRpc<{ items: Notification[] }>("notifications.list", {}, ["notifications"]);
  useEvent("notification", q.reload);
  const items = (q.data?.items ?? []).slice(0, 4);
  if (!q.loading && !items.length) return <Empty icon={<Check size={26} />} title={t("Alles in Ordnung")} text={t("Keine offenen Meldungen.")} />;
  return (
    <div className="list">
      {items.map((n) => (
        <div key={n.id} className="list-item">
          <span className={`dot ${n.severity === "error" ? "error" : n.severity === "warning" ? "warn" : "ok"}`} />
          <div className="grow"><div className="title small">{n.title}{n.count > 1 ? ` (${n.count}×)` : ""}</div><div className="sub ellipsis">{n.message} · {relTime(n.at)}</div></div>
        </div>
      ))}
    </div>
  );
}

function DevicesWidget() {
  const { state } = useAppState();
  return (
    <div className="stack">
      <div className="stat"><span className="v">{state?.counts.devices ?? "–"}</span><span className="k">{t("Gekoppelte Geräte")}</span></div>
      <div className="row"><Link to="/devices" className="btn sm">{t("Verwalten")}</Link>{state?.me.isLocal && <Link to="/pair" className="btn sm primary">{t("Koppeln")}</Link>}</div>
    </div>
  );
}

export const META: Record<BuiltinWidgetId, { icon: React.ReactNode; title: () => string; render: () => React.ReactNode; link?: string }> = {
  status: { icon: <Activity size={18} />, title: () => t("Verbindung & PC"), render: () => <StatusWidget /> },
  session: { icon: <Gamepad2 size={18} />, title: () => t("Aktuelle Spielesitzung"), render: () => <SessionWidget /> },
  profile: { icon: <Swords size={18} />, title: () => t("Gaming-Profil"), render: () => <ProfileWidget />, link: "/profiles" },
  quick: { icon: <Zap size={18} />, title: () => t("Quick Actions"), render: () => <QuickWidget />, link: "/quick" },
  favorites: { icon: <Star size={18} />, title: () => t("Meine Spiele & Apps"), render: () => <ItemsWidget mode="favorites" />, link: "/games" },
  recent: { icon: <Clock size={18} />, title: () => t("Zuletzt gestartet"), render: () => <ItemsWidget mode="recent" />, link: "/history" },
  system: { icon: <Activity size={18} />, title: () => t("PC-Auslastung"), render: () => <SystemWidget />, link: "/monitor" },
  audio: { icon: <Headphones size={18} />, title: () => t("Audio"), render: () => <AudioWidget />, link: "/audio" },
  playing: { icon: <Music size={18} />, title: () => t("Laufende Sounds"), render: () => <PlayingWidget />, link: "/soundboard" },
  notifications: { icon: <Bell size={18} />, title: () => t("Benachrichtigungen"), render: () => <NotificationsWidget />, link: "/notifications" },
  download: { icon: <LayoutDashboard size={18} />, title: () => t("Begleiter & Updates"), render: () => null },
  devices: { icon: <Smartphone size={18} />, title: () => t("Geräte"), render: () => <DevicesWidget />, link: "/devices" },
  shortcuts: { icon: <LayoutGrid size={18} />, title: () => t("Schnellstart"), render: () => <ShortcutsWidget edit={false} /> },
  clock: { icon: <Clock size={18} />, title: () => t("Uhr & Datum"), render: () => <ClockWidget /> },
  notes: { icon: <StickyNote size={18} />, title: () => t("Notizen"), render: () => <NotesWidget /> },
  next: { icon: <ListTodo size={18} />, title: () => t("Als Nächstes spielen"), render: () => <NextWidget />, link: "/backlog" },
  start: { icon: <Rocket size={18} />, title: () => t("Erste Schritte"), render: () => <StartWidget /> },
  media: { icon: <Music size={18} />, title: () => t("Medien & Lautstärke"), render: () => <MediaWidget /> },
  timer: { icon: <Timer size={18} />, title: () => t("Stoppuhr & Countdown"), render: () => <TimerWidget /> },
  deck: { icon: <Grid3x3 size={18} />, title: () => t("Mini-Deck"), render: () => <MiniDeckWidget />, link: "/deck" },
};

export default function Dashboard() {
  const prefs = usePrefs();
  const { state } = useAppState();
  const connectingSoon = useConnectingSoon();
  const mobile = useMediaQuery("(max-width: 699px)");
  const [edit, setEdit] = useState(false);
  const profileLayout = state?.activeProfile?.dashboardLayoutId;
  // Profiles store the layout name (ids are per device); older profiles store an id.
  const fromProfile = profileLayout ? (prefs.layouts.find((l) => l.id === profileLayout) ?? prefs.layouts.find((l) => l.name === profileLayout))?.id : undefined;
  const layoutId = fromProfile ?? (mobile ? prefs.activeLayout.mobile : prefs.activeLayout.desktop);
  const layout = prefs.layouts.find((l) => l.id === layoutId) ?? prefs.layouts[0];

  // Plugin widgets: only from enabled plugins that run in the web app.
  const pl = useRpc<PluginList>("plugins.list", {}, ["plugins"]);
  const pluginWidgets = (pl.data?.plugins ?? []).filter((p) => p.enabled && p.manifest?.platforms.includes("web"))
    .flatMap((p) => p.manifest!.contributes.widgets.map((w) => ({ id: pluginWidgetId(p.id, w.id), plugin: p, widget: w })));
  // Own widgets from the widget editor: shown in their own look (no card around them).
  const cw = useRpc<{ widgets: CustomWidget[] }>("widgets.list", {}, ["widgets"]);
  const customWidgets = cw.data?.widgets ?? [];
  type Meta = { icon: React.ReactNode; title: () => string; render: () => React.ReactNode; link?: string; missing?: boolean; bare?: boolean };
  const metaFor = (id: WidgetId): Meta => {
    if (CUSTOM_WIDGET.test(id)) {
      const w = customWidgets.find((x) => CUSTOM_PREFIX + x.id === id);
      return w
        ? { icon: <Shapes size={18} />, title: () => w.name, render: () => <CustomWidgetView widget={w} interactive={!edit} />, link: "/widgets", bare: true }
        : { icon: <Shapes size={18} />, title: () => t("Eigenes Widget (gelöscht)"), render: () => <p className="small muted">{t("Dieses Widget wurde im Widget-Baukasten gelöscht.")}</p>, missing: true };
    }
    if (id === "shortcuts") return { ...META.shortcuts, render: () => <ShortcutsWidget edit={edit} /> };
    if (!parsePluginWidgetId(id)) return META[id as BuiltinWidgetId];
    const pw = pluginWidgets.find((x) => x.id === id);
    return pw
      ? { icon: <Puzzle size={18} />, title: () => pw.widget.title, render: () => <PluginFrame plugin={pw.plugin} widget={pw.widget} />, link: "/plugins" }
      : { icon: <Puzzle size={18} />, title: () => t("Plugin-Widget (nicht verfügbar)"), render: () => <p className="small muted">{t("Das Plugin ist deaktiviert oder entfernt.")}</p>, missing: true };
  };

  const updateWidgets = (fn: (w: WidgetConf[]) => WidgetConf[]) =>
    setPrefs((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === layout.id ? { ...l, widgets: fn(l.widgets) } : l)) }));
  const move = (id: WidgetId, d: number) => updateWidgets((ws) => {
    const visible = ws.filter((w) => w.visible);
    const i = visible.findIndex((w) => w.id === id);
    const j = i + d;
    if (j < 0 || j >= visible.length) return ws;
    const a = ws.findIndex((w) => w.id === visible[i].id), b = ws.findIndex((w) => w.id === visible[j].id);
    const n = [...ws]; [n[a], n[b]] = [n[b], n[a]]; return n;
  });
  const cycleSize = (id: WidgetId) => updateWidgets((ws) => ws.map((w) => {
    if (w.id !== id) return w;
    const sizes = ALL_WIDGETS.find((x) => x.id === id)?.sizes ?? (["s", "m", "l"] as WidgetSize[]);
    return { ...w, size: sizes[(sizes.indexOf(w.size) + 1) % sizes.length] as WidgetSize };
  }));
  const toggle = (id: WidgetId) => updateWidgets((ws) => ws.some((w) => w.id === id) ? ws.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)) : [...ws, { id, visible: true, size: id.startsWith("custom:") ? "s" : "m" }]);

  const visible = layout.widgets.filter((w) => w.visible && (edit || !metaFor(w.id).missing));
  const hidden = [...layout.widgets.filter((w) => !w.visible && !metaFor(w.id).missing),
    ...pluginWidgets.filter((x) => !layout.widgets.some((w) => w.id === x.id)).map((x) => ({ id: x.id, visible: false, size: "m" as WidgetSize })),
    ...customWidgets.map((x) => `${CUSTOM_PREFIX}${x.id}` as WidgetId).filter((id) => !layout.widgets.some((w) => w.id === id)).map((id) => ({ id, visible: false, size: "s" as WidgetSize }))];
  const greeting = useMemo(() => { const h = new Date().getHours(); return h < 11 ? t("Guten Morgen") : h < 18 ? t("Hallo") : t("Guten Abend"); }, []);

  // Without the PC only widgets that show something real; the others come back as soon as the PC is connected.
  // Right after opening, a paired phone connects within moments: keep the full layout (placeholders) so nothing jumps.
  const offline = !state && !connectingSoon;
  const offlineShown = visible.filter((w) => OFFLINE_WIDGETS.has(w.id) || CUSTOM_WIDGET.test(w.id));
  const fallback = (["status", "shortcuts", "next", "start"] as WidgetId[]).map((id) => ({ id, visible: true, size: (id === "status" ? "m" : "m") as WidgetSize }));
  const shownWidgets = !offline || edit ? visible
    : [...(offlineShown.some((w) => w.id === "status") ? [] : [fallback[0]]), ...(offlineShown.length > 0 ? offlineShown : fallback.slice(1))];
  const waitingForPc = offline && !edit ? visible.filter((w) => !OFFLINE_WIDGETS.has(w.id) && !CUSTOM_WIDGET.test(w.id)).length : 0;

  return (
    <>
      <PageHead eyebrow={greeting} title={t("Gaming-Zentrale")} text={state ? t("{g} Spiele · {p} Programme · {s} Sounds", { g: state.counts.games, p: state.counts.programs, s: state.counts.sounds }) : undefined}
        actions={<>
          {edit && <Button icon={<RotateCcw size={16} />} onClick={() => updateWidgets(() => structuredClone(DEFAULT_LAYOUT.widgets))}>{t("Standard")}</Button>}
          <Button variant={edit ? "primary" : undefined} icon={edit ? <Check size={16} /> : <LayoutDashboard size={16} />} onClick={() => setEdit(!edit)}>{edit ? t("Fertig") : t("Anpassen")}</Button>
        </>} />
      {edit && <Banner kind="info" title={t("Layout „{n}“ bearbeiten", { n: layout.name })}>{t("Widgets verschieben, Größe ändern oder ausblenden. Weitere Layouts und Bildschirmgrößen unter Einstellungen → Design & Layout.")}</Banner>}
      <div className="dash" style={{ marginTop: edit ? 16 : 0 }}>
        {shownWidgets.map((w, i) => {
          const meta = metaFor(w.id);
          if (w.id === "download") return <div key={w.id} className={`w-${w.size}`} style={{ position: "relative" }}><DownloadCard compact />{edit && <EditOverlay />}</div>;
          if (meta.bare) return <div key={w.id} className={`w-${w.size}`} style={{ position: "relative" }}><div style={{ maxWidth: 720, marginInline: "auto" }}>{meta.render()}</div>{edit && <EditOverlay />}</div>;
          return (
            <div key={w.id} className={`w-${w.size}`} style={{ position: "relative" }}>
              <Card title={meta.title()} icon={meta.icon} className={w.id === "status" ? "hero" : ""} style={{ height: "100%" }}
                actions={meta.link && !edit ? <Link to={meta.link} className="btn ghost sm">{t("Alle")}</Link> : undefined}>
                {meta.render()}
              </Card>
              {edit && <EditOverlay />}
            </div>
          );
          function EditOverlay() {
            return (
              <div className="widget-edit">
                <b>{meta.title()}</b>
                <div className="row">
                  <Button size="sm" icon={<ArrowUp size={15} />} disabled={i === 0} onClick={() => move(w.id, -1)} aria-label={t("Nach vorne")} />
                  <Button size="sm" icon={<ArrowDown size={15} />} disabled={i === visible.length - 1} onClick={() => move(w.id, 1)} aria-label={t("Nach hinten")} />
                  <Button size="sm" icon={<Maximize2 size={15} />} onClick={() => cycleSize(w.id)}>{w.size.toUpperCase()}</Button>
                  <Button size="sm" icon={<EyeOff size={15} />} onClick={() => toggle(w.id)} aria-label={t("Ausblenden")} />
                </div>
              </div>
            );
          }
        })}
      </div>
      {waitingForPc > 0 && <p className="tiny muted" style={{ marginTop: 12, textAlign: "center" }}>{t("{n} weitere Widgets erscheinen, sobald der PC verbunden ist.", { n: waitingForPc })}</p>}
      {edit && hidden.length > 0 && (
        <Card title={t("Ausgeblendete Widgets")} icon={<EyeOff size={18} />} style={{ marginTop: 16 }}>
          <div className="row">{hidden.map((w) => <Button key={w.id} size="sm" icon={<Eye size={15} />} onClick={() => toggle(w.id)}>{metaFor(w.id).title()}</Button>)}</div>
        </Card>
      )}
    </>
  );
}
