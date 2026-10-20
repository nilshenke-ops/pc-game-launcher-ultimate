// Start animation ("loading screen") while the PC starts a game. It only watches: the start command is sent by the
// caller before the animation shows, a tap/Esc skips it at once, and an error in here can never stop a start.
// It says "läuft" only when the PC reports the game in its running list – before that only what is really known
// (command sent, PC answered).
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { readCache } from "../lib/offline-cache";
import { initials } from "../lib/format";
import { getPrefs, LAUNCH_STYLES, type Fx, type LaunchStyle } from "../lib/prefs";
import { tileArt } from "./launch-tiles";
import type { LibraryItem } from "../lib/types";

type Phase = "sending" | "sent" | "running" | "failed" | "preview";
interface Run { key: number; id?: string; name: string; pic?: string; phase: Phase; error?: string; style: LaunchStyle; ms: number; tagline: string; cover: boolean; still: boolean }

const PREVIEW_EVENT = "pgl-launch-preview";
/** Shows the start animation with a sample name (settings → Design) – nothing is started. */
export function previewLaunch(fx: Fx["launch"], name = "Beispielspiel") { window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: { fx, name } })); }

export const reducedMotion = () => document.documentElement.dataset.motion === "reduce" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** How long the screen stays at most (ms): fast mode is short, reduced motion shows a still screen briefly. */
export function cinemaMs(fx: Fx["launch"], still: boolean) { return still ? Math.min(1500, fx.seconds * 1000) : fx.fast ? 1200 : fx.seconds * 1000; }

let seq = 0;

function LaunchCinemaInner() {
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const closeTimer = useRef<number | undefined>(undefined);

  const close = () => { window.clearTimeout(closeTimer.current); setRun(null); };
  const closeIn = (ms: number) => { window.clearTimeout(closeTimer.current); closeTimer.current = window.setTimeout(() => setRun(null), ms); };
  const update = (key: number, p: Partial<Run>) => setRun((r) => (r && r.key === key ? { ...r, ...p } : r));

  const open = (fx: Fx["launch"], base: Pick<Run, "id" | "name" | "pic" | "phase">) => {
    const still = reducedMotion();
    const r: Run = { ...base, key: ++seq, style: fx.style, ms: cinemaMs(fx, still), tagline: fx.tagline, cover: fx.cover, still };
    setRun(r);
    closeIn(r.ms);
    return r.key;
  };

  useEffect(() => {
    const offLaunch = client.on("launch.local", (d) => {
      const fx = getPrefs().fx.launch;
      // Without a PC connection nothing can start – the app already says so; no loading screen for a start that cannot happen.
      if (!fx.enabled || (!client.demo && (client.status.phase !== "online" || client.status.auth !== "ok"))) return;
      const { id, result } = d as { id?: string; result: Promise<{ ok?: boolean; message?: string } | undefined> };
      const lib = readCache<{ items: LibraryItem[] }>("library.list")?.data;
      const item = lib?.items.find((i) => i.id === id);
      const art = item ? tileArt(item) : {};
      const key = open(fx, { id, name: item?.name ?? t("Spiel"), pic: art.pic, phase: "sending" });
      result.then(
        (r) => {
          if (r && r.ok === false) { update(key, { phase: "failed", error: r.message ?? t("Start fehlgeschlagen") }); if (runRef.current?.key === key) closeIn(2500); return; }
          setRun((x) => (x && x.key === key && x.phase === "sending" ? { ...x, phase: "sent" } : x));
        },
        (e: Error) => { update(key, { phase: "failed", error: e.message }); if (runRef.current?.key === key) closeIn(2500); },
      );
    });
    // The PC's own report – the only thing that turns the screen into "läuft".
    const offSession = client.on("session", (d) => {
      const r = runRef.current;
      const running = (d as { running?: { itemId: string }[] })?.running ?? [];
      if (r?.id && (r.phase === "sending" || r.phase === "sent") && running.some((x) => x.itemId === r.id)) { update(r.key, { phase: "running" }); closeIn(1200); }
    });
    const onPreview = (e: Event) => {
      const { fx, name } = (e as CustomEvent<{ fx: Fx["launch"]; name: string }>).detail;
      open(fx, { name, phase: "preview" });
    };
    window.addEventListener(PREVIEW_EVENT, onPreview);
    return () => { offLaunch(); offSession(); window.removeEventListener(PREVIEW_EVENT, onPreview); window.clearTimeout(closeTimer.current); };
  }, []);

  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") close(); };
    const onHide = () => { if (document.visibilityState === "hidden") close(); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onHide); };
  }, [run?.key]);

  if (!run) return null;
  const status: Record<Phase, string> = {
    sending: t("Startbefehl wird an den PC gesendet …"),
    sent: t("Startbefehl angekommen – der PC startet das Spiel"),
    running: t("Läuft auf dem PC"),
    failed: run.error ?? t("Start fehlgeschlagen"),
    preview: t("Vorschau – es wird nichts gestartet"),
  };
  return createPortal(
    <div className={`lc lc-${run.style} ${run.still ? "still" : ""} ${run.phase}`} role="status" aria-live="polite" onClick={close} style={{ ["--lc-dur" as string]: `${run.ms}ms` }}>
      <div className="lc-fx" aria-hidden><i className="lc-a" /><i className="lc-b" /><i className="lc-c" /></div>
      <div className="lc-center">
        {run.cover && (run.pic ? <img className="lc-cover" src={run.pic} alt="" onError={() => update(run.key, { pic: undefined })} /> : <span className="lc-cover lc-initials">{initials(run.name)}</span>)}
        <h2 className="lc-title" data-text={run.name}>{run.name}</h2>
        {run.tagline && <p className="lc-tag">{run.tagline}</p>}
        <p className="lc-status">{status[run.phase]}</p>
        <div className="lc-bar"><i key={run.key} /></div>
      </div>
      <button type="button" className="btn sm ghost lc-skip" onClick={(e) => { e.stopPropagation(); close(); }}>{t("Überspringen")}</button>
    </div>,
    document.body,
  );
}

/** A broken animation must never be in the way: it then just shows nothing (the start itself does not depend on it). */
class Guard extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() { return { broken: true }; }
  componentDidCatch(e: unknown) { console.warn("launch animation", e); }
  render() { return this.state.broken ? null : this.props.children; }
}

export function LaunchCinema() { return <Guard><LaunchCinemaInner /></Guard>; }

export const launchStyleName = (id: string) => LAUNCH_STYLES.find((s) => s.id === id)?.name ?? id;
