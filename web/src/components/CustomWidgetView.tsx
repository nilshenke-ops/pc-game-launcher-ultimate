import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BatteryView, ConnView, CounterView, DiceView, NoteView, UntilView } from "./cw-extra";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useEvent, useLiveSubscription, useRpc } from "../lib/hooks";
import { useAppState } from "../lib/state";
import { DeckIcon } from "./deck-icons";
import { DESIGN_WIDTH, type CustomWidget, type WidgetElement } from "../lib/custom-widgets";
import type { MetricsSample } from "../lib/types";
import { runQuickAction } from "./run-quick";
import { mainGame } from "../lib/running";
import { MEDIA_KEYS } from "../lib/deck";
import { nowLine, nowSub, useNowPlaying } from "../lib/now-playing";

/** Font sizes are designed for a 360 px wide box and scale with the real width (container query units). */
const fs = (px: number) => `calc(${px} * 100cqw / ${DESIGN_WIDTH})`;
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

/** Live values only if the widget shows any – and only while it is visible (same rule as everywhere in the app). */
function useMetrics(enabled: boolean) {
  const [m, setM] = useState<MetricsSample | null>(null);
  useLiveSubscription<MetricsSample>("monitor", setM, undefined, enabled);
  useEvent<MetricsSample>("monitor.sample", (d) => { if (enabled) setM(d); });
  return m;
}

function useNow(enabled: boolean, everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") setNow(new Date()); }, everyMs);
    return () => clearInterval(id);
  }, [enabled, everyMs]);
  return now;
}

function metricValue(m: MetricsSample | null, kind?: string | null): { pct: number | null; text: string } {
  if (!m) return { pct: null, text: "–" };
  const gpu = m.gpus[0];
  const na = (k: "cpu" | "ram" | "gpu") => m.off?.includes(k) ? t("aus") : t("n. v.");
  switch (kind) {
    case "cpu": return { pct: m.cpuPercent ?? null, text: m.cpuPercent != null ? `${m.cpuPercent.toFixed(0)} %` : na("cpu") };
    case "ram": { const p = m.memTotalBytes && m.memUsedBytes != null ? (m.memUsedBytes / m.memTotalBytes) * 100 : null; return { pct: p, text: p != null ? `${p.toFixed(0)} %` : na("ram") }; }
    case "gpu": return { pct: gpu?.utilPercent ?? null, text: gpu?.utilPercent != null ? `${gpu.utilPercent.toFixed(0)} %` : na("gpu") };
    case "gputemp": return { pct: gpu?.tempC ?? null, text: gpu?.tempC != null ? `${gpu.tempC.toFixed(0)} °C` : na("gpu") };
    case "cputemp": return { pct: m.cpuTempC ?? null, text: m.cpuTempC != null ? `${m.cpuTempC.toFixed(0)} °C` : "n. v." };
    case "disk": { const d = m.disks?.[0]; const p = d && d.totalBytes > 0 ? ((d.totalBytes - d.freeBytes) / d.totalBytes) * 100 : null; return { pct: p, text: p != null ? `${p.toFixed(0)} %` : m.off?.includes("disks") ? t("aus") : "n. v." }; }
    default: return { pct: null, text: "–" };
  }
}

async function runButton(e: WidgetElement) {
  try {
    switch (e.action) {
      case "quick": {
        const q = await client.call<{ actions: { id: string; name: string; steps: unknown[]; requireConfirm?: boolean }[] }>("quick.list");
        const a = q.actions.find((x) => x.id === e.ref);
        if (!a) throw new Error(t("Die Quick Action gibt es nicht mehr."));
        await runQuickAction(a as Parameters<typeof runQuickAction>[0]);
        return;
      }
      case "launch": await client.call("library.launch", { id: e.ref }); break;
      case "sound": await client.call("sounds.play", { id: e.ref }); break;
      case "profile": await client.call("profiles.activate", { id: e.ref }); break;
      case "overlay": await client.call("overlay.toggle", { mode: e.ref === "mini" ? "mini" : "full" }); break;
      case "record": { const r = await client.call<{ message?: string }>("capture.recordToggle"); if (r?.message) toast(t(r.message), "success"); break; }
      case "replay": { const r = await client.call<{ message?: string }>("capture.replaySave"); if (r?.message) toast(t(r.message), "success"); break; }
      case "stopSounds": await client.call("sounds.stopAll"); break;
      case "media": await client.call("media.key", { key: e.ref }); break;
      case "open": if (e.ref) location.hash = "#" + e.ref; break;
    }
  } catch (err) { toast((err as Error).message, "error"); }
}

function Ring({ pct, color, size }: { pct: number | null; color: string; size: number }) {
  const r = 40, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} transform="rotate(-90 50 50)" />
      <text x="50" y="57" textAnchor="middle" fontSize={Math.max(14, Math.min(28, size))} fontWeight="700" fill="currentColor">{pct == null ? "–" : Math.round(p)}</text>
    </svg>
  );
}

/** The song or video the PC plays (Windows media sessions) – only asks the PC while a widget like this is on screen. */
function MusicView({ style }: { style: CSSProperties }) {
  const np = useNowPlaying();
  const line = nowLine(np);
  return (
    <div style={{ ...style, flexDirection: "column", alignItems: style.justifyContent as string, justifyContent: "center", gap: "2%" }}>
      <span className="ellipsis" style={{ maxWidth: "100%" }}>{line ? `${np?.playing ? "♪" : "❚❚"} ${np?.title}` : t("Gerade läuft nichts")}</span>
      {line && <span className="ellipsis" style={{ maxWidth: "100%", fontSize: "0.72em", opacity: 0.75, fontWeight: 400 }}>{nowSub(np)}</span>}
    </div>
  );
}

function ElementView({ e, w, metrics, now, minutes, playing, interactive }: { e: WidgetElement; w: CustomWidget; metrics: MetricsSample | null; now: Date; minutes: { today: number; week: number } | null; playing: string | null; interactive: boolean }) {
  const color = e.color ?? w.textColor;
  const style: CSSProperties = {
    position: "absolute", left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%`, color, fontSize: fs(e.size),
    fontWeight: e.bold ? 700 : 400, textAlign: e.align, display: "flex", alignItems: "center",
    justifyContent: e.align === "center" ? "center" : e.align === "right" ? "flex-end" : "flex-start", overflow: "hidden", lineHeight: 1.15,
  };
  switch (e.type) {
    case "text": return <div style={style}><span style={{ whiteSpace: "pre-wrap" }}>{e.text}</span></div>;
    case "clock": {
      const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const date = now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
      return <div style={style}><span style={{ fontVariantNumeric: "tabular-nums" }}>{e.kind === "date" ? date : e.kind === "both" ? `${time} · ${date}` : time}</span></div>;
    }
    case "metric": {
      const v = metricValue(metrics, e.kind);
      if (e.display === "ring") return <div style={{ ...style, justifyContent: "center" }}><Ring pct={e.kind === "gputemp" ? v.pct : v.pct} color={e.fill ?? "#22d3ee"} size={e.size} /></div>;
      if (e.display === "bar")
        return (
          <div style={{ ...style, flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: "4%" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>{e.text}</span><b style={{ fontVariantNumeric: "tabular-nums" }}>{v.text}</b></div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
              <i style={{ display: "block", height: "100%", width: "100%", transformOrigin: "left", transform: `scaleX(${Math.min(100, v.pct ?? 0) / 100})`, background: e.fill ?? "#22d3ee", transition: "transform .5s" }} />
            </div>
          </div>
        );
      return <div style={style}><span>{e.text ? `${e.text} ` : ""}<b style={{ fontVariantNumeric: "tabular-nums" }}>{v.text}</b></span></div>;
    }
    case "button":
      return (
        <button type="button" className="cw-button" style={{ ...style, background: e.fill ?? "rgba(255,255,255,.12)", gap: "0.4em", borderRadius: 999, cursor: interactive ? "pointer" : "default" }}
          onClick={interactive ? () => runButton(e) : undefined} tabIndex={interactive ? 0 : -1} aria-label={e.text || (e.action === "media" ? t(MEDIA_KEYS.find((k) => k[0] === e.ref)?.[1] ?? "Medien & Lautstärke") : "") || e.action || ""}>
          {e.icon && <DeckIcon name={e.icon} size={18} />}{e.text}
        </button>
      );
    case "image": return e.image ? <img src={e.image} alt="" style={{ ...style, objectFit: "cover", borderRadius: Math.min(12, w.radius) }} draggable={false} /> : <div style={{ ...style, border: "1px dashed currentColor", opacity: 0.4, justifyContent: "center" }}>{t("Bild")}</div>;
    case "playtime": {
      const m = minutes ? (e.kind === "week" ? minutes.week : minutes.today) : null;
      return <div style={{ ...style, flexDirection: "column", alignItems: style.justifyContent as string, justifyContent: "center" }}>{e.text && <span style={{ fontSize: "0.6em", opacity: 0.8, fontWeight: 400 }}>{e.text}</span>}<span>{m == null ? "–" : fmtMin(m)}</span></div>;
    }
    case "nowPlaying": return <div style={style}><span className="ellipsis">{playing ? `▶ ${playing}` : t("Kein Spiel aktiv")}</span></div>;
    case "music": return <MusicView style={style} />;
    case "shape": return <div style={{ ...style, background: e.fill ?? "#ffffff", borderRadius: Math.min(40, Math.max(0, e.size || 4)) }} />;
    case "icon": return <div style={{ ...style, justifyContent: "center" }}><span className="cw-icon" style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><DeckIcon name={e.icon ?? "zap"} size={64} /></span></div>;
    case "counter": return <CounterView e={e} w={w} style={style} interactive={interactive} />;
    case "note": return <NoteView e={e} w={w} style={style} interactive={interactive} />;
    case "until": return <UntilView e={e} w={w} style={style} interactive={interactive} now={now} />;
    case "conn": return <ConnView e={e} w={w} style={style} interactive={interactive} />;
    case "battery": return <BatteryView e={e} w={w} style={style} interactive={interactive} />;
    case "dice": return <DiceView e={e} w={w} style={style} interactive={interactive} />;
    case "timer": return e.display === "pills" ? <TimerPills e={e} style={style} interactive={interactive} /> : <TimerView e={e} style={style} interactive={interactive} />;
  }
}

/**
 * Shows a custom widget. interactive = buttons work (not in the editor). Live values, clock and play time are only
 * fetched for elements that show them. The box keeps its proportions (designed 360 px wide × height), so it scales
 * as a whole – on the phone, in the PC app, in the overlay and on the desktop.
 */
export function CustomWidgetView({ widget: w, interactive = true, height, overlayElements }: { widget: CustomWidget; interactive?: boolean; height?: number | string; overlayElements?: React.ReactNode }) {
  const kinds = useMemo(() => new Set(w.elements.map((e) => e.type)), [w.elements]);
  const metrics = useMetrics(kinds.has("metric"));
  const now = useNow(kinds.has("clock"), 15_000);
  const hist = useRpc<{ sessions: { startedAt: string; endedAt?: string | null }[] }>("history.get", {}, ["history"], kinds.has("playtime"));
  const { state } = useAppState();
  const minutes = useMemo(() => {
    if (!hist.data) return null;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const weekStart = Date.now() - 7 * 86400000;
    let today = 0, week = 0;
    for (const s of hist.data.sessions) {
      const a = new Date(s.startedAt).getTime(), b = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
      today += Math.max(0, b - Math.max(a, dayStart.getTime())) / 60000;
      week += Math.max(0, b - Math.max(a, weekStart)) / 60000;
    }
    return { today, week };
  }, [hist.data]);
  const playing = mainGame(state?.running)?.name ?? null;
  const bg = w.background2 ? `linear-gradient(135deg, ${w.background}, ${w.background2})` : w.background;
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} className="cw" data-id={w.id} style={{ ...(height ? { height } : { aspectRatio: `${DESIGN_WIDTH} / ${w.height}` }), width: "100%", borderRadius: w.radius, background: bg, opacity: w.opacity, color: w.textColor }}>
      {w.image && <img src={w.image} alt="" className="cw-bgimg" draggable={false} />}
      {w.elements.map((e) => <ElementView key={e.id} e={e} w={w} metrics={metrics} now={now} minutes={minutes} playing={playing} interactive={interactive} />)}
      {overlayElements}
    </div>
  );
}

/** Stopwatch or countdown on this device (e.g. respawn or break timer). Nothing is sent to the PC. */
function TimerView({ e, style, interactive }: { e: WidgetElement; style: CSSProperties; interactive: boolean }) {
  const total = e.kind === "countdown" ? Math.max(1, Number(e.ref) || 60) : 0;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [acc, setAcc] = useState(0); // ms counted before the last pause
  const [, tick] = useState(0);
  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  const elapsed = acc + (startedAt != null ? Date.now() - startedAt : 0);
  const left = total ? Math.max(0, total * 1000 - elapsed) : 0;
  const done = total > 0 && left === 0;
  const doneRef = useRef(false);
  useEffect(() => {
    if (done && !doneRef.current) { doneRef.current = true; navigator.vibrate?.([200, 100, 200]); setAcc(total * 1000); setStartedAt(null); }
    if (!done) doneRef.current = false;
  }, [done, total]);
  const ms = total ? left : elapsed;
  const sec = Math.ceil(ms / 1000 - (total ? 0 : 0.999));
  const text = `${sec >= 3600 ? `${Math.floor(sec / 3600)}:` : ""}${String(Math.floor((sec % 3600) / 60)).padStart(sec >= 3600 ? 2 : 1, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const running = startedAt != null;
  const toggle = () => { if (running) { setAcc(elapsed); setStartedAt(null); } else { if (done) setAcc(0); setStartedAt(Date.now()); } };
  const reset = () => { setStartedAt(null); setAcc(0); };
  return (
    <div style={{ ...style, flexDirection: "column", gap: "4%" }}>
      <span style={{ fontVariantNumeric: "tabular-nums", color: done ? "#f87171" : undefined }}>{text}</span>
      {interactive && (
        <span style={{ display: "flex", gap: 6, fontSize: 12, fontWeight: 600 }}>
          <button type="button" className="cw-button" style={{ padding: "2px 10px", borderRadius: 8, background: "rgba(255,255,255,.14)" }} onClick={toggle}>{running ? t("Pause") : done ? t("Neu") : t("Start")}</button>
          <button type="button" className="cw-button" style={{ padding: "2px 10px", borderRadius: 8, background: "rgba(255,255,255,.08)" }} onClick={reset}>{t("Zurücksetzen")}</button>
        </span>
      )}
    </div>
  );
}

/**
 * Stopwatch and countdown with large time, pill buttons and minute quick picks – the card look from the design.
 * Everything runs on this device; nothing is sent to the PC. The quick picks are minutes from the element's text
 * ("1,3,5,10,15"), so they can be changed in the widget editor.
 */
function TimerPills({ e, style, interactive }: { e: WidgetElement; style: CSSProperties; interactive: boolean }) {
  const presets = useMemo(() => (e.text ?? "1,3,5,10,15").split(",")
    .map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 1440).slice(0, 6), [e.text]);
  const [mode, setMode] = useState<"stopwatch" | "countdown">(e.kind === "countdown" ? "countdown" : "stopwatch");
  const [total, setTotal] = useState(() => (presets[0] ?? 5) * 60);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [acc, setAcc] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (startedAt == null) return;
    const id = window.setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [startedAt]);
  const elapsed = acc + (startedAt != null ? Date.now() - startedAt : 0);
  const left = Math.max(0, total * 1000 - elapsed);
  const running = startedAt != null;
  const done = mode === "countdown" && left === 0 && (running || acc > 0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (done && !doneRef.current) { doneRef.current = true; navigator.vibrate?.([200, 100, 200]); setAcc(total * 1000); setStartedAt(null); }
    if (!done) doneRef.current = false;
  }, [done, total]);
  const sec = Math.max(0, Math.ceil((mode === "countdown" ? left : elapsed) / 1000));
  const text = `${sec >= 3600 ? `${Math.floor(sec / 3600)}:` : ""}${String(Math.floor((sec % 3600) / 60)).padStart(sec >= 3600 ? 2 : 1, "0")}:${String(sec % 60).padStart(2, "0")}`;
  const start = () => { if (mode === "countdown" && left === 0) setAcc(0); setStartedAt(Date.now()); };
  const toggle = () => { if (running) { setAcc(elapsed); setStartedAt(null); } else start(); };
  const reset = () => { setStartedAt(null); setAcc(0); };
  const stopwatch = () => { setMode("stopwatch"); if (!running) { setAcc(0); setStartedAt(Date.now()); } };
  const preset = (min: number) => { setMode("countdown"); setTotal(min * 60); setAcc(0); setStartedAt(Date.now()); };
  const pill = (bg: string, color: string, strong = false): CSSProperties => ({
    background: bg, color, border: 0, borderRadius: 999, padding: strong ? "0.6em 1.05em" : "0.5em 0.8em",
    fontSize: fs(strong ? 13 : 12), fontWeight: 600, lineHeight: 1.15, cursor: interactive ? "pointer" : "default",
    boxShadow: strong ? "none" : "inset 0 0 0 1px rgba(255,255,255,.16)", whiteSpace: "nowrap", paddingBlock: "0.5em",
  });
  return (
    <div style={{ ...style, flexDirection: "column", justifyContent: "center", gap: "5%" }}>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, lineHeight: 1 }}>{text}</span>
      <div style={{ display: "flex", gap: "2.6%", justifyContent: "center", flexWrap: "wrap" }}>
        <button type="button" className="cw-button" style={pill("rgba(248,250,252,.94)", "#151821", true)}
          aria-disabled={!interactive} tabIndex={interactive ? 0 : -1} onClick={interactive ? (running ? toggle : mode === "stopwatch" ? stopwatch : start) : undefined}>
          {running ? t("Pause") : mode === "countdown" ? t("Fortsetzen") : t("Stoppuhr")}
        </button>
        <button type="button" className="cw-button" style={pill("rgba(255,255,255,.06)", "inherit")}
          aria-disabled={!interactive} tabIndex={interactive ? 0 : -1} onClick={interactive ? reset : undefined}>{t("Zurücksetzen")}</button>
      </div>
      {presets.length > 0 && (
        <div style={{ display: "flex", gap: "1.4%", justifyContent: "center", flexWrap: "nowrap" }}>
          {presets.map((m) => (
            <button key={m} type="button" className="cw-button" style={{ ...pill("rgba(255,255,255,.05)", "inherit"), flex: "1 1 0", minWidth: 0, paddingInline: "0.4em" }}
              aria-disabled={!interactive} tabIndex={interactive ? 0 : -1} onClick={interactive ? () => preset(m) : undefined}>{m} min</button>
          ))}
        </div>
      )}
    </div>
  );
}
