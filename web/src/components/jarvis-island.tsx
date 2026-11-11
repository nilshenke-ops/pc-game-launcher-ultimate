// The JARVIS island in its own small window at the top of the PC screen (Windows companion, page #/island).
// Collapsed: only JARVIS' eyes. Hover: a bar with what he is doing and the time. A question from JARVIS (launch …):
// the bar with "Erlauben"/"Ablehnen". Tap: the open island with tabs (see island-panel.tsx).
// The size changes with a spring (island-spring.ts) that this page runs itself: the Windows window stays as big as the open
// island and only gets told the shape of every frame, so the screen and the window cut-out can never drift apart.
// Own design – inspired by "island" apps, no code or character taken from them. Everything shown comes from real state.

import { plainAnswer } from "../lib/answer-text";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Bell, Check, Gamepad2, Music, Timer as TimerIcon, X } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { useAppState } from "../lib/state";
import { useIslandLook } from "../lib/island-look";
import { advanceTimer, countdownView, playTime, timerLive, useTimer } from "../lib/island-timer";
// The open panel (tabs, AI settings, widgets) is by far the biggest part of the island and is only needed after a tap: it loads in the
// background right after the page has started (idle), so the first tap is still instant, but the start of the app does not wait for it.
const loadPanel = () => import("./island-panel");
const IslandPanel = lazy(() => loadPanel().then((m) => ({ default: m.IslandPanel })));
if (typeof window !== "undefined") {
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(() => { void loadPanel(); }, { timeout: 4000 }); else window.setTimeout(() => { void loadPanel(); }, 2500);
}
import { consumeSpoken } from "../lib/island-voice";
import { speak } from "../lib/jarvis-voice";
import { createBoxAnimator, islandBox, islandProgress, WINDOW_W, type Box } from "../lib/island-spring";
import { POMO_LABEL } from "../lib/pomodoro";
import { useConn } from "../lib/hooks";
import { eyeColor, clock, islandAnswer, islandEvent, islandBusy, islandClearAsk, islandGaming, islandMusic, islandSize, islandTouch, islandNotice, noticeFresh, moodOf, useIsland, useIslandPrefs, ASK_TTL, type Mood } from "../lib/island";
import type { AssistantAction } from "../lib/assistant";
import { mainGame, playedGames } from "../lib/running";
import { nowLine, useNowPlaying } from "../lib/now-playing";
import { Bars, IslandEyes, TimerRing } from "./island-bits";
import { motionOff } from "../lib/motion";
export { IslandEyes, RobotHead } from "./island-bits";

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

/** Keeps something on screen for `ms` after it should go, so it can play its exit animation. */
function useExit(show: boolean, ms: number) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) { setMounted(true); return; }
    const id = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(id);
  }, [show, ms]);
  return mounted;
}

/** A burst of small sparks when JARVIS finishes something (pure CSS, one element per spark, gone after a second). */
function Confetti() {
  return (
    <span className="isl-confetti" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ["--a" as string]: `${i * 30 + (i % 2 ? 8 : -6)}deg`, ["--d" as string]: `${26 + (i % 3) * 9}px`, ["--s" as string]: `${i * 12}ms` } as CSSProperties} />)}
    </span>
  );
}

/** Width of the screen, for the narrow phone layout of the in-app island. */
function useViewportW() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => { const on = () => setW(window.innerWidth); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return w;
}
const reducedMotion = () => motionOff();

/** The island page (own window of the Windows companion; opened in a browser it shows the same at the top). */
export function JarvisIsland({ floating = false }: { floating?: boolean } = {}) {
  const s = useIsland();
  const prefs = useIslandPrefs();
  const { look } = useIslandLook();
  const app = useAppState().state;
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const mood = moodOf(s, now);
  const tm = useTimer();
  const np = useNowPlaying();
  const mediaLine = np?.active && np.playing ? nowLine(np) : "";
  const live = countdownView(tm, now);
  const notice = noticeFresh(s, now) ? s.notice : null;
  const prevMood = useRef<Mood>(mood);
  const hostRef = useRef<HTMLDivElement>(null);
  const panelMounted = useExit(open, 2000);
  const [ripples, setRipples] = useState<{ id: number; x: number }[]>([]);
  const ask = s.ask && now - s.ask.at < ASK_TTL ? s.ask.action : null;
  // In the app (phone, tablet, browser) the island stays the small face with the two eyes – the eyes show what JARVIS does; the wide bar with
  // text would cover the buttons of the top bar. The wide bar is for the island window on the PC screen.
  const wanted = islandSize({ open, ask: !!ask, hover, mood, notice: !!notice });
  const size = floating && wanted === "bar" ? "notch" : wanted;
  const vw = useViewportW();
  const box = islandBox(size, vw, floating);
  const panelW = islandBox("panel", vw, floating).w;

  // JARVIS' activity comes from the PC (whichever device asks him) – only to this PC's own windows.
  useEffect(() => client.on("jarvis.activity", (d) => {
    const x = d as { phase?: string; ok?: boolean; text?: string; via?: string; note?: string; ask?: AssistantAction | null };
    if (x.phase === "busy") islandBusy(true);
    if (x.phase === "done") {
      islandBusy(false); islandAnswer(String(x.text ?? ""), x.ok === false ? false : true, x.ask ? [{ ...x.ask, confirm: true }] : [], "jarvis", x.via, x.note);
      if (consumeSpoken() && x.text) speak(plainAnswer(x.text)); // only the answer to a question that was spoken
    }
  }), []);
  // The sound the PC plays (level and beat only – nothing is recorded) and the running game drive dancing and gaming.
  useEffect(() => client.on("island.audio", (d) => islandMusic(d as { playing?: boolean; level?: number; beat?: boolean })), []);
  // Notifications of the PC (a download finished, a warning …) show for a moment in the bar.
  useEffect(() => client.on("notification", (d) => islandNotice(d as { title?: unknown; severity?: unknown })), []);
  const gameName = playedGames(app?.running)[0]?.name ?? null; // a live wallpaper alone does not make the eyes "play along"
  useEffect(() => { islandGaming(!!gameName); }, [gameName]);
  // Games that start and end, and the connection to the PC, become short messages and history entries (not the first state after loading).
  const gameSeen = useRef<{ name: string; since: number } | null | undefined>(undefined);
  useEffect(() => {
    const g = playedGames(app?.running)[0] ?? null, was = gameSeen.current;
    gameSeen.current = g ? { name: g.name, since: Date.parse(g.since) || Date.now() } : null;
    if (was === undefined) return;
    if (g && !was) islandEvent("game", "success", t("Spiel gestartet: {n}", { n: g.name }));
    else if (!g && was) islandEvent("game", "info", t("Spiel beendet: {n} ({t})", { n: was.name, t: playTime(was.since) ?? "–" }));
  }, [app?.running]); // eslint-disable-line react-hooks/exhaustive-deps
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const wasOnline = useRef<boolean | null>(null), hadOnline = useRef(false);
  useEffect(() => {
    const was = wasOnline.current; wasOnline.current = online;
    if (was === null || was === online) { if (online) hadOnline.current = true; return; }
    if (!online && was) islandEvent("system", "warning", t("Verbindung zum PC verloren"));
    else if (online && hadOnline.current) islandEvent("system", "success", t("Verbindung zum PC wiederhergestellt")); // not the very first connect after loading
    if (online) hadOnline.current = true;
  }, [online]);

  // ---- the spring: width, height and corner radius of the island; in the Windows window the shape of every frame goes to the companion
  const animRef = useRef<ReturnType<typeof createBoxAnimator> | null>(null);
  const positionRef = useRef(look.position);
  positionRef.current = look.position;
  useLayoutEffect(() => {
    const el = hostRef.current; if (!el) return;
    const post = (m: unknown) => (window as HostWindow).chrome?.webview?.postMessage(m);
    const apply = (b: Box) => {
      el.style.width = `${b.w}px`; el.style.height = `${b.h}px`;
      // How far open the island is (0 closed … 1 open): the content (header, tabs, cards) fades, rises and clears its blur by this number – so
      // opening, closing and turning around halfway are one continuous movement that always follows the spring (see motion-pack.css).
      el.style.setProperty("--isl-p", islandProgress(b.h).toFixed(3));
      // While the island moves, the blur behind the page's glass surfaces is paused (re-blurring them every frame is the costliest part).
      document.documentElement.toggleAttribute("data-isl-anim", animRef.current?.moving ?? false);
      // In the Windows window the island hangs from the top edge: square at the top, round at the bottom (like the cut-out of the window).
      el.style.borderRadius = floating ? `${b.r}px` : `0 0 ${b.r}px ${b.r}px`;
      if (floating) return;
      const winW = window.innerWidth || WINDOW_W, p = positionRef.current;
      el.style.left = `${Math.round(p === "left" ? 0 : p === "right" ? winW - b.w : (winW - b.w) / 2)}px`;
      post({ type: "island-rect", w: Math.round(b.w * 10) / 10, h: Math.round(b.h * 10) / 10, r: Math.round(b.r * 10) / 10 });
    };
    const a = createBoxAnimator(apply, box);
    animRef.current = a;
    a.to(box, true);
    return () => { a.stop(); animRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floating]);
  useEffect(() => { animRef.current?.to(box, reducedMotion()); }, [box.w, box.h, box.r, look.position]); // eslint-disable-line react-hooks/exhaustive-deps
  // The companion only needs to know when the panel is open (it takes the keyboard focus for typing then).
  useEffect(() => { (window as HostWindow).chrome?.webview?.postMessage({ type: "island-size", size }); }, [size]);

  // Moods that end by time need a clock – every second while something short-lived shows, otherwise every 15 s (sleep).
  // (Only the yes/no matters: the music reports arrive ten times a second and must not restart the timer.)
  const fast = !!(s.last || s.ask || s.pokes.length || s.music || open || hover || s.gaming || s.pet || s.notice || timerLive(tm));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), fast ? 1000 : 15000);
    return () => window.clearInterval(id);
  }, [fast]);
  // The focus timer / Pomodoro runs here, so it also works with the panel closed.
  useEffect(() => {
    const ev = advanceTimer(now);
    if (!ev) return;
    if (ev.kind === "phase") islandAnswer(ev.pomo.phase === "focus" ? t("Pause vorbei – weiter mit Fokus ({n} geschafft)", { n: ev.pomo.done }) : t(ev.pomo.phase === "long" ? "Vier Fokus-Runden geschafft – lange Pause!" : "Fokus geschafft – kurze Pause!"), true, [], "timer");
    else islandAnswer(t("Fokuszeit vorbei – kurze Pause?"), true, [], "timer");
    if (prefs.sound) chime(true);
  }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const allow = async () => {
    if (!ask?.method) return;
    islandClearAsk();
    try { await client.call(ask.method, ask.params ?? {}); islandAnswer(t("Erledigt: {n}", { n: ask.label }), true); }
    catch (e) { islandAnswer((e as Error).message, false); }
  };
  const game = mainGame(app?.running);
  const gameTime = game ? playTime(game.since, now) : null;
  const timerText = live ? `${tm.pomo ? t(POMO_LABEL[tm.pomo.phase]) : t("Fokus")} · ${clock(live.left)}` : null;
  // What leads the closed island, by importance: a question, JARVIS working, an answer or message, a running timer, a game, music.
  // The other live things show as small marks next to the time, so nothing that is going on is hidden.
  const gameText = game ? (gameTime ? `${game.name} · ${gameTime}` : game.name) : "";
  const leadKind = ask || mood === "thinking" || mood === "listening" || ((mood === "happy" || mood === "error") && s.last) ? "jarvis" : notice ? "notice" : timerText ? "timer" : game ? "game" : mediaLine || (mood === "dancing" && s.music) ? "music" : null;
  const text = ask ? t("JARVIS fragt: {a}?", { a: ask.label }) : mood === "thinking" ? t("JARVIS denkt nach …") : mood === "listening" ? t("JARVIS hört zu …")
    : (mood === "happy" || mood === "error") && s.last ? s.last.text : notice ? notice.text : timerText ? timerText : game ? gameText : mediaLine ? `♪ ${mediaLine}` : mood === "dancing" && s.music ? t("Musik läuft") : t("JARVIS – antippen für Widgets");
  const marks = ([live ? "timer" : null, game ? "game" : null, mediaLine || (mood === "dancing" && s.music) ? "music" : null] as const).filter((k): k is "timer" | "game" | "music" => !!k && k !== leadKind);
  // A counting text (timer, play time) keeps one element so only real changes of the message animate.
  const textKey = timerText && text === timerText ? "timer" : game && text.startsWith(game.name) ? `game:${game.name}` : text;
  // The eyes follow the mouse a little (a few pixels) while it is over the island.
  const follow = (e: React.MouseEvent) => {
    const el = hostRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 || 1)));
    const dy = Math.max(-1, Math.min(1, (e.clientY - (r.top + 18)) / 60));
    el.style.setProperty("--ex", `${(dx * 3).toFixed(1)}px`); el.style.setProperty("--ey", `${(dy * 2).toFixed(1)}px`);
  };
  const unfollow = () => { const el = hostRef.current; if (el) { el.style.setProperty("--ex", "0px"); el.style.setProperty("--ey", "0px"); } };

  // While the panel folds away the content keeps the width of the open island – it is clipped by the shrinking shell, never squeezed.
  const innerW = panelMounted ? panelW : box.w;

  return (
    <div ref={hostRef} className={`isl-host v2 s-${size} h-${mood}${open ? " is-open" : ""}${notice ? ` n-${notice.severity}` : ""}${live ? " timing" : ""}${floating ? " floating" : ""}`} onMouseMove={follow} data-isl-style={look.style} data-isl-eye-size={look.eyeSize} data-isl-eye={eyeColor(look.eye) ? "1" : undefined} style={eyeColor(look.eye) ? ({ "--isl-eye": eyeColor(look.eye) } as CSSProperties) : undefined} onMouseEnter={() => { setHover(true); islandTouch(); }} onMouseLeave={() => { setHover(false); unfollow(); }}>
      <div className="isl-inner" style={{ width: innerW }}>
      {mood === "happy" && s.last && <Confetti key={s.last.at} />}
      {mood === "dancing" && s.music && s.music.beatAt > 0 && <span className="isl-beat" key={s.music.beatAt} aria-hidden />}
      <div className={`isl m-${mood}`} aria-hidden={open || undefined}>
        <button type="button" className="isl-pill" aria-expanded={open} aria-label={t("JARVIS-Insel öffnen")} tabIndex={open ? -1 : 0} onClick={(e) => {
          const id = Date.now(), x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setRipples((r) => [...r.slice(-3), { id, x }]); window.setTimeout(() => setRipples((r) => r.filter((q) => q.id !== id)), 600);
          setOpen((o) => !o);
        }}>
          {ripples.map((r) => <span key={r.id} className="isl-ripple" style={{ left: r.x }} aria-hidden />)}
          {live && size !== "notch" && !ask && <TimerRing progress={live.progress} />}
          {/* A tap anywhere on the closed island opens it – the eyes included (poking them is for the open island's header). */}
          <IslandEyes mood={mood} />
          {mood === "dancing" && s.music ? <Bars level={s.music.level} /> : mediaLine ? <Bars level={0.35} /> : null}
          {live && size === "notch" && <span className="isl-live"><TimerRing progress={live.progress} />{clock(live.left)}</span>}
          {notice && size !== "notch" && !ask && <Bell size={15} className="isl-bell" aria-hidden />}
          {size !== "notch" && <span className="isl-text" key={textKey}>{text}{mood === "thinking" && <span className="isl-dots" aria-hidden><i /><i /><i /></span>}</span>}
        </button>
        {size !== "notch" && !ask && marks.length > 0 && <span className="isl-marks" aria-hidden>{marks.map((k) => k === "timer" ? <TimerIcon key={k} size={13} /> : k === "game" ? <Gamepad2 key={k} size={13} /> : <Music key={k} size={13} />)}</span>}
        {size !== "notch" && !ask && <span className="isl-time">{live ? clock(live.left) : new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        {ask && (
          <span className="isl-ask">
            <button type="button" className="btn sm primary" onClick={() => void allow()}><Check size={15} /> {t("Erlauben")}</button>
            <button type="button" className="btn sm" onClick={() => islandClearAsk(true)}><X size={15} /> {t("Ablehnen")}</button>
          </span>
        )}
      </div>
      {panelMounted && (
        <div className={`isl2-wrap${open ? "" : " closing"}`}><Suspense fallback={null}><IslandPanel mood={mood} now={now} floating={floating} onClose={() => setOpen(false)} /></Suspense></div>
      )}
      </div>
    </div>
  );
}
