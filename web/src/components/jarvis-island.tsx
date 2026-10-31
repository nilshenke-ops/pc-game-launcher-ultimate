// The JARVIS island in its own small window at the top of the PC screen (Windows companion, page #/island).
// Collapsed: only JARVIS' eyes. Hover: a bar with what he is doing and the time. A question from JARVIS (launch …):
// the bar with "Erlauben"/"Ablehnen". Tap: widgets (JARVIS, running game, media keys, clock, focus timer).
// Own design – inspired by "island" apps, no code or character taken from them. Everything shown comes from real state.

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Gamepad2, Pause, Play, SkipBack, SkipForward, Timer, X } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { useAppState } from "../lib/state";
import { toast, useCan, useConn } from "../lib/hooks";
import { clock, islandAnswer, islandBusy, islandClearAsk, islandPoke, islandSize, moodOf, MOOD_LABEL, setIslandPrefs, useIsland, useIslandPrefs, ASK_TTL, type Mood } from "../lib/island";
import type { AssistantAction } from "../lib/assistant";

type HostWindow = Window & { chrome?: { webview?: { postMessage: (m: unknown) => void } } };

/** A soft two-note chime (Web Audio) – only when sounds are on. */
function chime(up = true) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [up ? 660 : 520, up ? 880 : 440].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.14 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.14 + 0.35);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.14); o.stop(ctx.currentTime + i * 0.14 + 0.4);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* no audio – the colour still shows it */ }
}

/** JARVIS' eyes – shape and colour per mood (CSS, see .isl-eyes). Tapping too often makes him dizzy. */
export function IslandEyes({ mood, big, onPoke }: { mood: Mood; big?: boolean; onPoke?: () => void }) {
  return (
    <span className={`isl-eyes m-${mood}${big ? " big" : ""}`} role="img" aria-label={t("JARVIS: {m}", { m: t(MOOD_LABEL[mood]) })}
      onClick={onPoke ? (e) => { e.stopPropagation(); onPoke(); } : undefined}>
      <i /><i />
    </span>
  );
}

function FocusTimer({ sound }: { sound: boolean }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!end) return;
    const id = window.setInterval(() => {
      const n = Date.now(); setNow(n);
      if (n >= end) { setEnd(null); islandAnswer(t("Fokuszeit vorbei – kurze Pause?"), true); if (sound) chime(true); }
    }, 500);
    return () => window.clearInterval(id);
  }, [end, sound]);
  return (
    <div className="isl-card">
      <span className="isl-ic"><Timer size={18} /></span>
      <div className="isl-main">
        <b className="isl-big">{end ? clock(end - now) : t("Fokus")}</b>
        <div className="row isl-mini">
          {end ? <button type="button" className="chip" onClick={() => setEnd(null)}>{t("Stopp")}</button>
            : [5, 15, 25].map((m) => <button key={m} type="button" className="chip" onClick={() => { setNow(Date.now()); setEnd(Date.now() + m * 60_000); }}>{m} min</button>)}
        </div>
      </div>
    </div>
  );
}

/** The island page (own window of the Windows companion; opened in a browser it shows the same at the top). */
export function JarvisIsland() {
  const s = useIsland();
  const prefs = useIslandPrefs();
  const app = useAppState().state;
  const conn = useConn();
  const canMedia = useCan("launch");
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [q, setQ] = useState("");
  const mood = moodOf(s, now);
  const prevMood = useRef<Mood>(mood);
  const online = conn.auth === "ok" && conn.phase === "online";
  const ask = s.ask && now - s.ask.at < ASK_TTL ? s.ask.action : null;
  const size = islandSize({ open, ask: !!ask, hover, mood });

  // JARVIS' activity comes from the PC (whichever device asks him) – only to this PC's own windows.
  useEffect(() => client.on("jarvis.activity", (d) => {
    const x = d as { phase?: string; ok?: boolean; text?: string; ask?: AssistantAction | null };
    if (x.phase === "busy") islandBusy(true);
    if (x.phase === "done") { islandBusy(false); islandAnswer(String(x.text ?? ""), x.ok === false ? false : true, x.ask ? [{ ...x.ask, confirm: true }] : []); }
  }), []);
  // The window grows and shrinks with the content (the companion accepts only these four sizes).
  useEffect(() => { (window as HostWindow).chrome?.webview?.postMessage({ type: "island-size", size }); }, [size]);
  // Moods that end by time need a clock – one tick per second, only while needed.
  useEffect(() => {
    if (!(s.last || s.ask || s.pokes.length || open || hover)) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [s.last, s.ask, s.pokes.length, open, hover]);
  useEffect(() => { if (s.ask && now - s.ask.at >= ASK_TTL) islandClearAsk(); }, [now, s.ask]);
  useEffect(() => {
    const was = prevMood.current; prevMood.current = mood;
    if (!prefs.sound || was === mood) return;
    if (mood === "happy" || mood === "asking") chime(true);
    if (mood === "error") chime(false);
  }, [mood, prefs.sound]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  const game = app?.running?.[0] ?? null;
  const allow = async () => {
    if (!ask?.method) return;
    islandClearAsk();
    try { await client.call(ask.method, ask.params ?? {}); islandAnswer(t("Erledigt: {n}", { n: ask.label }), true); }
    catch (e) { islandAnswer((e as Error).message, false); }
  };
  const media = (key: string) => client.call("media.key", { key }).catch((e: Error) => toast(e.message, "error"));
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim(); if (!v) return;
    setQ("");
    // The answer arrives as "jarvis.activity" like any other – the island shows it.
    try { await client.call("assistant.ask", { text: v }); } catch (err) { islandAnswer((err as Error).message, false); }
  };
  const text = ask ? t("JARVIS fragt: {a}?", { a: ask.label }) : mood === "thinking" ? t("JARVIS denkt nach …") : mood === "listening" ? t("JARVIS hört zu …")
    : (mood === "happy" || mood === "error") && s.last ? s.last.text : game ? game.name : t("JARVIS – antippen für Widgets");

  return (
    <div className={`isl-host s-${size}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className={`isl m-${mood}`}>
        <button type="button" className="isl-pill" aria-expanded={open} aria-label={t("JARVIS-Insel öffnen")} onClick={() => setOpen((o) => !o)}>
          <IslandEyes mood={mood} onPoke={() => { islandPoke(); setNow(Date.now()); }} />
          {size !== "notch" && <span className="isl-text">{text}</span>}
        </button>
        {size !== "notch" && !ask && <span className="isl-time">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        {ask && (
          <span className="isl-ask">
            <button type="button" className="btn sm primary" onClick={() => void allow()}><Check size={15} /> {t("Erlauben")}</button>
            <button type="button" className="btn sm" onClick={() => islandClearAsk(true)}><X size={15} /> {t("Ablehnen")}</button>
          </span>
        )}
      </div>
      {open && (
        <div className="isl-panel" role="dialog" aria-label={t("JARVIS-Insel")}>
          <div className="isl-card isl-jarvis">
            <IslandEyes mood={mood} big />
            <div className="isl-main">
              <div className="row"><b>JARVIS</b><span className="badge">{t(MOOD_LABEL[mood])}</span></div>
              <div className="small muted isl-last">{s.last ? s.last.text : t("Noch nichts gefragt.")}</div>
              <form className="row" onSubmit={send}>
                <input className="input" value={q} maxLength={300} placeholder={t("Frag JARVIS …")} onChange={(e) => setQ(e.target.value)} aria-label={t("Frag JARVIS …")} />
                <button type="submit" className="btn sm primary" disabled={!q.trim() || !online}>{t("Fragen")}</button>
              </form>
            </div>
          </div>
          <div className="isl-grid">
            <div className="isl-card">
              <span className="isl-ic"><Gamepad2 size={18} /></span>
              <div className="isl-main">
                <b className="ellipsis">{game ? game.name : t("Kein Spiel aktiv")}</b>
                <span className="tiny muted">{!online ? t("PC nicht verbunden") : game ? t("läuft seit {t}", { t: new Date(game.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("Laut deinem PC")}</span>
              </div>
            </div>
            <div className="isl-card">
              <div className="isl-main">
                <b className="isl-big">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
                <span className="tiny muted">{new Date(now).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
              </div>
            </div>
            <div className="isl-card">
              <div className="isl-main">
                <b>{t("Musik am PC")}</b>
                <div className="row isl-mini">
                  <button type="button" className="btn icon sm" disabled={!online || !canMedia} onClick={() => media("prev")} aria-label={t("Vorheriger Titel")}><SkipBack size={16} /></button>
                  <button type="button" className="btn icon sm" disabled={!online || !canMedia} onClick={() => media("playpause")} aria-label={t("Wiedergabe/Pause")}><Play size={14} /><Pause size={14} /></button>
                  <button type="button" className="btn icon sm" disabled={!online || !canMedia} onClick={() => media("next")} aria-label={t("Nächster Titel")}><SkipForward size={16} /></button>
                </div>
              </div>
            </div>
            <FocusTimer sound={prefs.sound} />
          </div>
          <div className="row isl-foot">
            <label className="row tiny"><input type="checkbox" checked={prefs.sound} onChange={(e) => setIslandPrefs({ sound: e.target.checked })} /> {t("Ton bei „fertig“ und Rückfragen")}</label>
            <span className="spacer" />
            <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>{t("Schließen")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
