// The home screen of the designs: greeting, PC status, "Deine Spiele", "Zuletzt verwendet", performance – everything from the
// real data of the PC (library, history, live load). Each design has its own composition (see data-home / homeVariant).
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Clock, Cpu, Gamepad2, Gpu, LayoutDashboard, Monitor, MemoryStick, MoreHorizontal, Pause, Play, Plus, Rocket, SkipBack, SkipForward, Zap } from "lucide-react";
import { t } from "../lib/i18n";
import { client, readJson, writeJson } from "../lib/rpc";
import { toast, useCan, useConn, useEvent, useLiveSubscription, useRpc } from "../lib/hooks";
import { usePrefs, homeVariant } from "../lib/prefs";
import { useAppState } from "../lib/state";
import { connView } from "../lib/conn-state";
import { addPoint, cleanName, homeGames, homeQuick, homeRecent, NAME_KEY, perfState, sparkPath, totalHours, type HistoryData } from "../lib/home-data";
import type { LibraryItem, MetricsSample } from "../lib/types";
import { gradientFor } from "../lib/format";
import { Art, useLaunch } from "./launch-tiles";

// ------------------------------------------------------------------ the name on the greeting (this device only)
let name = cleanName(readJson<string>(NAME_KEY)) || "";
const nameListeners = new Set<() => void>();
export const useUserName = () => useSyncExternalStore((fn) => { nameListeners.add(fn); return () => nameListeners.delete(fn); }, () => name);
export function setUserName(v: string) { name = cleanName(v); writeJson(NAME_KEY, name || null); nameListeners.forEach((l) => l()); }

/** A glass game controller (own drawing) for the "Controller" design. */
function ControllerArt() {
  return (
    <svg className="hs-controller" viewBox="0 0 520 360" aria-hidden>
      <defs>
        <linearGradient id="hc-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".5" stopColor="#a99bff" stopOpacity=".28" /><stop offset="1" stopColor="#5aa9ff" stopOpacity=".4" /></linearGradient>
        <linearGradient id="hc-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#8fb4ff" stopOpacity=".2" /></linearGradient>
        <filter id="hc-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14" /></filter>
      </defs>
      <ellipse cx="270" cy="340" rx="190" ry="16" fill="#6c5cff" opacity=".55" filter="url(#hc-glow)" />
      <path d="M150 80 C 92 80 46 170 34 270 C 28 318 70 338 112 316 C 152 296 168 258 208 258 L 332 258 C 372 258 388 296 428 316 C 470 338 512 318 506 270 C 494 170 448 80 390 80 L 330 100 L 210 100 Z" fill="url(#hc-body)" stroke="url(#hc-rim)" strokeWidth="3" />
      <rect x="215" y="112" width="110" height="62" rx="16" fill="#fff" opacity=".14" stroke="#fff" strokeOpacity=".4" />
      <circle cx="190" cy="204" r="30" fill="#fff" opacity=".18" stroke="#fff" strokeOpacity=".5" strokeWidth="2" /><circle cx="190" cy="204" r="14" fill="#fff" opacity=".3" />
      <circle cx="350" cy="204" r="30" fill="#fff" opacity=".18" stroke="#fff" strokeOpacity=".5" strokeWidth="2" /><circle cx="350" cy="204" r="14" fill="#fff" opacity=".3" />
      <path d="M96 150 h18 v-18 h18 v18 h18 v18 h-18 v18 h-18 v-18 h-18 z" fill="#fff" opacity=".28" />
      {[[408, 130], [434, 156], [408, 182], [382, 156]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="13" fill="#fff" opacity=".26" stroke="#fff" strokeOpacity=".5" />)}
    </svg>
  );
}

function Spark({ points }: { points: number[] }) {
  const d = sparkPath(points);
  return <svg className="hs-spark" viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden>{d && <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}</svg>;
}

function GameTile({ item, launch, busy }: { item: LibraryItem; launch: (i: LibraryItem) => void; busy: boolean }) {
  return (
    <button type="button" className={`hs-tile ${busy ? "busy" : ""}`} onClick={() => launch(item)} aria-label={t("{name} starten", { name: item.name })}>
      <span className="hs-tile-art" style={{ background: gradientFor(item.name) }}><Art item={item} coverAllowed /></span>
      <span className="hs-tile-name">{item.name}</span>
      <span className="hs-tile-go"><ArrowRight size={16} /></span>
    </button>
  );
}

function IconTile({ item, launch }: { item: LibraryItem; launch: (i: LibraryItem) => void }) {
  return <button type="button" className="hs-mini" onClick={() => launch(item)} aria-label={t("{name} starten", { name: item.name })} title={item.name}><span className="hs-mini-art" style={{ background: gradientFor(item.name) }}><Art item={item} coverAllowed /></span></button>;
}

export function HomeShowcase({ onEdit }: { onEdit: () => void }) {
  const prefs = usePrefs();
  const variant = homeVariant(prefs.theme.preset);
  const userName = useUserName();
  const conn = useConn();
  const { state } = useAppState();
  const online = conn.phase === "online" && conn.auth === "ok";
  const view = connView(conn, { demo: client.demo, hasCredentials: !!client.credentials });
  const canMedia = useCan("launch");
  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"]);
  const hist = useRpc<HistoryData>("history.get", {}, ["history"]);
  const { launch, launching } = useLaunch();
  // Live load: the PC measures only while this page is open (same rule as every live view).
  const [m, setM] = useState<MetricsSample | null>(null);
  const [points, setPoints] = useState<number[]>([]);
  useLiveSubscription<MetricsSample>("monitor", (d) => { setM(d); setPoints((p) => addPoint(p, d)); }, undefined, online);
  useEvent<MetricsSample>("monitor.sample", (d) => { if (online) { setM(d); setPoints((p) => addPoint(p, d)); } });

  const items = lib.data?.items;
  const games = homeGames(items, hist.data, variant === "controller" ? 3 : 3);
  const recent = homeRecent(items, hist.data, 5);
  const quick = homeQuick(items, 4);
  const hours = totalHours(hist.data);
  const perf = perfState(online ? m?.cpuPercent : null);
  const first = games[0] ?? recent[0];
  const greeting = userName || t("Gamer");
  const gpu = m?.gpus?.[0]?.name;
  const ram = m?.memTotalBytes ? `${Math.round(m.memTotalBytes / 1024 ** 3)} GB RAM` : null;
  const platform = state?.platform ? (/win/i.test(state.platform) ? "Windows" : state.platform) : null;
  const media = (key: string) => client.call("media.key", { key }).catch((e: Error) => toast(e.message, "error"));

  const start = (
    first && online
      ? <button type="button" className="hs-start" onClick={() => launch(first)} aria-label={t("Jetzt starten: {name}", { name: first.name })}><Play size={18} fill="currentColor" /><span>{t("Jetzt starten")}</span><ChevronRight size={18} /></button>
      : <Link to={online ? "/games" : "/connect"} className="hs-start"><Play size={18} fill="currentColor" /><span>{t("Jetzt starten")}</span><ChevronRight size={18} /></Link>
  );

  const tiles = (
    <section className="hs-section" aria-label={t("Deine Spiele")}>
      <div className="hs-head"><h2><Gamepad2 size={22} />{t("Deine Spiele")}</h2><Link to="/games" className="hs-all">{t("Alle anzeigen")} <ArrowRight size={14} /></Link></div>
      <div className="hs-tiles">
        {games.map((g) => <GameTile key={g.id} item={g} launch={launch} busy={launching.has(g.id)} />)}
        {games.length === 0 && [["/steam", "Steam"], ["/gamepass", "Game Pass"], ["/launchers", t("Launcher")]].map(([to, label]) => (
          <Link key={to} to={to} className="hs-tile link"><span className="hs-tile-art plain"><Gamepad2 size={34} /></span><span className="hs-tile-name">{label}</span><span className="hs-tile-go"><ArrowRight size={16} /></span></Link>
        ))}
        <Link to="/games" className="hs-tile add" aria-label={t("Spiel hinzufügen")}><span className="hs-tile-art plain"><Plus size={40} /></span><span className="hs-tile-name">{t("Spiel hinzufügen")}</span></Link>
      </div>
    </section>
  );

  const strip = variant === "chrome" || variant === "chromelight" ? { title: t("Schnellzugriff"), icon: <Zap size={18} />, list: quick.length ? quick : recent } : { title: t("Zuletzt verwendet"), icon: <Clock size={20} />, list: recent };
  const row = (
    <section className="hs-section hs-row" aria-label={strip.title}>
      <div className="hs-head small"><h3>{strip.icon}{strip.title}</h3></div>
      <div className="hs-minis">
        {strip.list.map((i) => <IconTile key={i.id} item={i} launch={launch} />)}
        {strip.list.length === 0 && <span className="small muted">{online || lib.data ? t("Noch nichts gestartet.") : t("Erscheint, sobald der PC verbunden ist.")}</span>}
        <Link to={variant === "chrome" || variant === "chromelight" ? "/quick" : "/history"} className="hs-mini more" aria-label={t("Mehr")}><MoreHorizontal size={22} /></Link>
      </div>
    </section>
  );

  const perfCard = (
    <Link to="/monitor" className="hs-perf" aria-label={t("Performance")}>
      <Zap size={22} className="hs-perf-ic" />
      <span className="hs-perf-txt"><b>{t("Performance")}</b><em className={perf ?? "none"}>{perf === "optimal" ? t("Optimal") : perf === "busy" ? t("Ausgelastet") : perf === "high" ? t("Hohe Last") : online ? t("Misst …") : "–"}</em></span>
      <Spark points={points} />
      <ChevronRight size={18} />
    </Link>
  );

  const music = variant === "chromelight" && (
    <div className="hs-music" aria-label={t("Musik am PC")}>
      <span className="hs-music-art" />
      <span className="hs-music-txt"><b>{t("Musik am PC")}</b><small>{t("Steuerung per Medientasten")}</small></span>
      <button type="button" className="hs-round" disabled={!online || !canMedia} onClick={() => media("prev")} aria-label={t("Vorheriger Titel")}><SkipBack size={16} /></button>
      <button type="button" className="hs-round big" disabled={!online || !canMedia} onClick={() => media("playpause")} aria-label={t("Wiedergabe/Pause")}><Play size={18} /><Pause size={18} /></button>
      <button type="button" className="hs-round" disabled={!online || !canMedia} onClick={() => media("next")} aria-label={t("Nächster Titel")}><SkipForward size={16} /></button>
    </div>
  );

  const hero = variant === "controller" ? (
    <div className="hs-hero">
      <div className="hs-eyebrow">{t("Willkommen zurück")}</div>
      <h1 className="hs-title big">{t("Deine Gaming-Zentrale")}</h1>
      <p className="hs-sub">{t("Spiele. Apps. Alles an einem Ort.")}</p>
      <div className="hs-actions">{start}<button type="button" className="hs-edit" onClick={onEdit}><LayoutDashboard size={16} />{t("Anpassen")}</button></div>
    </div>
  ) : (
    <div className="hs-hero">
      {(variant === "chrome" || variant === "chromelight") && <div className="hs-eyebrow line">{t("PC Game Launcher Ultimate")}</div>}
      <h1 className="hs-title">{t("Hallo {n}!", { n: greeting })} <span className="hs-wave" aria-hidden>{variant === "chrome" || variant === "chromelight" ? "" : "👋"}</span></h1>
      <p className="hs-sub">{variant === "chrome" || variant === "chromelight" ? t("Deine Gaming-Zentrale – einfach. schnell. modern.") : t("Deine Gaming-Zentrale – einfach. schnell. überall.")}</p>
      {variant !== "stats" && <div className="hs-actions">{start}<button type="button" className="hs-edit" onClick={onEdit}><LayoutDashboard size={16} />{t("Anpassen")}</button></div>}
    </div>
  );

  const WinLogo = <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden><path fill="currentColor" d="M0 2.3 6.5 1.4v6H0zM7.3 1.3 16 0v7.4H7.3zM0 8.6h6.5v6L0 13.7zM7.3 8.6H16V16l-8.7-1.2z" /></svg>;
  const chips: [ReactNode, string][] = [];
  if (online && platform) chips.push([/windows/i.test(platform) ? WinLogo : <Monitor size={18} />, platform]);
  if (online && gpu) chips.push([<Gpu key="g" size={18} />, gpu.replace(/NVIDIA GeForce |AMD Radeon /i, "")]);
  if (online && ram) chips.push([variant === "controller" ? <Cpu key="c" size={18} /> : <MemoryStick key="r" size={18} />, ram]);
  const statusCard = (
    <Link to="/diagnostics" className={`hs-status ${view.tone}`} aria-label={t("Verbindungsstatus: {s}", { s: t(view.label) })}>
      <div className="hs-ring" aria-hidden><span><Monitor size={40} /></span></div>
      <div className="hs-status-body">
        <b className="hs-status-title">{online ? t("PC verbunden") : t(view.short)}</b>
        <span className="hs-status-sub"><i className={`dot ${view.tone}`} />{online ? t("Alles bereit!") : t(view.label)}</span>
      </div>
      {chips.length > 0 && <div className="hs-chips">{chips.map(([ic, label]) => <span key={label}>{ic}{label}</span>)}</div>}
    </Link>
  );

  const stats = variant === "stats" && (
    <div className="hs-stats">
      <div className="hs-stat"><Rocket size={30} /><b>{online ? t("Bereit!") : t("Nicht verbunden")}</b><span><i className={`dot ${view.tone}`} />{online ? t("PC ist verbunden") : t(view.short)}</span></div>
      <div className="hs-stat"><Gamepad2 size={30} /><b>{state?.counts.games ?? (items && items.length ? items.filter((i) => i.kind === "game").length : "–")}</b><span>{t("Spiele verfügbar")}</span></div>
      <div className="hs-stat"><Clock size={30} /><b>{hours != null ? `${hours.toLocaleString()} h` : "–"}</b><span>{hours != null ? t("Gesamt-Spielzeit") : t("Noch keine Spielzeit erfasst")}</span></div>
    </div>
  );

  return (
    <div className={`home-showcase v-${variant}`}>
      <h2 className="sr-only">{t("Gaming-Zentrale")}</h2>
      <div className="hs-top">
        {hero}
        {variant === "controller" ? <ControllerArt /> : variant === "stats" ? null : statusCard}
      </div>
      {variant === "stats" && stats}
      {variant === "controller" && <div className="hs-pillstatus">{statusCard}</div>}
      {tiles}
      {variant === "controller" ? null : (
        <div className="hs-bottom">{row}{music}{perfCard}</div>
      )}
    </div>
  );
}
