// The open JARVIS island: a header (eyes, date and time, equalizer, "⋯"), three cards on "Home" (JARVIS, music, focus) and a row of
// tabs underneath – music, JARVIS (write or speak), focus timer and stopwatch, notifications, apps (WhatsApp, last started), the PC
// values and a note. Own design in the layout of "island" apps. Everything shown is real state of the PC; what the PC cannot tell stays "n. v.".

import { directionOf, dragOffset, exitMs, shouldCommit, swipeIntent, velocity } from "../lib/island-swipe";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Home, Inbox, LayoutGrid, MessageCircle, MessagesSquare, Mic, MicOff, Monitor, MoreHorizontal, Music, Pause, Play, Radio, Send, SkipBack, SkipForward, Star, StickyNote, Timer, Trash2, Volume1, Volume2, VolumeX, Layers } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { useAppState } from "../lib/state";
import { toast, useCan, useConn, useEvent, useRpc } from "../lib/hooks";
import { useIslandLook } from "../lib/island-look";
import { ISLAND_WIDGETS, toggleWidget, type IslandWidgetId } from "../lib/island-widgets";
import { clock, islandAnswer, islandState, islandBusy, islandPet, islandTouch, MOOD_LABEL, petCommand, setIslandPrefs, useIsland, useIslandPrefs, type Mood } from "../lib/island";
import { asksForSource } from "../lib/answer-text";
import type { AssistantAction } from "../lib/assistant";
import { countdownView, pauseCountdown, playTime, resumeCountdown, startCountdown, startPomodoro, stopCountdown, useTimer } from "../lib/island-timer";
import { POMO_LABEL } from "../lib/pomodoro";
import { nowPosition, nowSub, songTime, useNowPlaying } from "../lib/now-playing";
import { accentOfCover } from "../lib/cover-accent";
import { clearIslandHistory, useIslandHistory, type HistoryEntry } from "../lib/island-activity";
import { consumeSpoken, markSpoken, micPermission, setConversation, useConversation, useVoiceInput } from "../lib/island-voice";
import { cleanSpoken, voiceControl } from "../lib/voice-text";
import { friendlyError } from "../lib/friendly-error";
import { speak, stopSpeaking, useVoice } from "../lib/jarvis-voice";
import { askLocalChain, LOCAL_NAME, LOCAL_PROVIDERS, readyProviders, useLocalAi } from "../lib/free-ai-local";
import { askFreeAi, FREE_AI_NAME, FREE_AI_NOTICE, setFreeAiConsent, useFreeAiConsent } from "../lib/free-ai";
import { readJson, writeJson } from "../lib/rpc";
import { AiManager, hasReadyAi, type AiOverview } from "./ai-manager";
import { AiRoster } from "./ai-roster";
import { AiTiles } from "./ai-tiles";
import { MessageCompose } from "./message-compose";
import { parseMessageCommand, type Messenger } from "../lib/messaging";
import { mainGame } from "../lib/running";
import { homeRecent, type HistoryData } from "../lib/home-data";
import { relTime } from "../lib/format";
import { brandFor } from "../lib/brands";
import type { LibraryItem, Notification } from "../lib/types";
import { BrandLogo } from "./brand-logo";
import { Bars, IslandEyes } from "./island-bits";
import { IslandNet, IslandNote, IslandProfiles, IslandSounds, IslandStart, IslandStats, IslandStopwatch, IslandTemps, IslandVolume } from "./island-widgets";

export type IslandTab = "home" | "game" | "music" | "jarvis" | "focus" | "inbox" | "apps" | "pc" | "note";
const TAB_META: Record<IslandTab, { icon: typeof Home; label: string }> = {
  home: { icon: Home, label: "Home" }, game: { icon: Gamepad2, label: "Spiel" }, music: { icon: Music, label: "Musik" }, jarvis: { icon: MessageCircle, label: "JARVIS" }, focus: { icon: Timer, label: "Fokus" },
  inbox: { icon: Inbox, label: "Meldungen" }, apps: { icon: LayoutGrid, label: "Apps" }, pc: { icon: Monitor, label: "PC" }, note: { icon: StickyNote, label: "Notiz" },
};
/** Widgets of the old panel that now live under the "PC" tab (music, focus, stopwatch and note have their own places). */
const PC_WIDGETS: IslandWidgetId[] = ["game", "start", "clock", "stats", "temp", "net", "volume", "profile", "sounds"];

/** Which tabs show: the fixed ones always, the others follow the widget choice in the settings (so nothing the person switched off comes back). */
export function visibleTabs(widgets: IslandWidgetId[], gameRunning = false): IslandTab[] {
  const has = (id: IslandWidgetId) => widgets.includes(id);
  const tabs: IslandTab[] = ["home"];
  if (gameRunning) tabs.push("game"); // the gaming view appears with a running game and goes with it
  if (has("music")) tabs.push("music");
  tabs.push("jarvis");
  if (has("focus") || has("stopwatch")) tabs.push("focus");
  tabs.push("inbox", "apps");
  if (PC_WIDGETS.some(has)) tabs.push("pc");
  if (has("note")) tabs.push("note");
  return tabs;
}

/** The WhatsApp entry of the library (any item called "WhatsApp"); there is no way to open it without the PC knowing the program. */
export const findWhatsApp = (items: LibraryItem[] | undefined) => items?.find((i) => /whatsapp/i.test(i.name));

function AppLogo({ item }: { item: LibraryItem }) {
  const b = brandFor(item);
  if (b) return <BrandLogo brand={b} size={26} color="currentColor" />;
  if (item.iconData) return <img src={item.iconData} alt="" width={26} height={26} />;
  return <span className="isl2-letter" aria-hidden>{item.name.slice(0, 1).toUpperCase()}</span>;
}

export function IslandPanel({ mood, now, floating, onClose }: { mood: Mood; now: number; floating: boolean; onClose: () => void }) {
  const s = useIsland();
  const prefs = useIslandPrefs();
  const { look, save, canManage } = useIslandLook();
  const app = useAppState().state;
  const conn = useConn();
  const canMedia = useCan("launch");
  const canSound = useCan("soundboard");
  const online = conn.auth === "ok" && conn.phase === "online";
  const np = useNowPlaying();
  const tm = useTimer();
  const game = mainGame(app?.running);
  const tabs = visibleTabs(look.widgets, !!game);
  const has = (id: IslandWidgetId) => look.widgets.includes(id);
  const [tab, setTab] = useState<IslandTab>("home");
  const [msg, setMsg] = useState<{ text: string; app: Messenger; phone: string | null }>(() => ({ text: "", app: ((): Messenger => { const v = readJson<string>("pgl.island.msgapp"); return v === "telegram" || v === "sms" || v === "mail" ? v : "whatsapp"; })(), phone: null }));
  const [menu, setMenu] = useState(false);
  const [edit, setEdit] = useState(false);
  const hold = useRef<number | null>(null);
  // Holding a card (or "Widgets bearbeiten" in the menu) makes the widgets wiggle: − removes one, + adds one (saved at the PC, admin right needed).
  const holdStart = () => { if (!canManage) return; hold.current = window.setTimeout(() => { hold.current = null; setEdit(true); navigator.vibrate?.(15); }, 600); };
  const holdEnd = () => { if (hold.current) { clearTimeout(hold.current); hold.current = null; } };
  const [q, setQ] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => { let on = true; void accentOfCover(np?.cover).then((c) => { if (on) setAccent(c); }); return () => { on = false; }; }, [np?.cover]);
  const hist = useIslandHistory();
  const current: IslandTab = tabs.includes(tab) ? tab : "home";
  const media = (key: string) => client.call("media.key", { key }).catch((e: Error) => toast(e.message, "error"));
  // Swipe: the area follows the finger (a soft rubber band at the first and last one); on release it either carries on out of the way and the next
  // one springs in from the other side, or it springs back. Touch and pen only, never over a field or a button. A tap on a tab slides the same way.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number; locked: boolean; samples: { x: number; t: number }[]; dx: number } | null>(null);
  const swipedAt = useRef(0); // a swipe must not also count as a tap on the card under the finger
  const busyMoving = useRef(false);
  const [slide, setSlide] = useState<"next" | "prev" | null>(null);
  const reduced = () => document.documentElement.dataset.motion === "reduce" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const easing = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  const idx = () => tabs.indexOf(current);
  /** Moves on to another area: the old one leaves first (from where the finger left it), then the new one springs in from the opposite side. */
  const goTab = async (to: IslandTab, from = 0, vx = 0) => {
    const el = bodyRef.current, i = idx(), j = tabs.indexOf(to);
    if (j < 0 || j === i || busyMoving.current) return;
    const dir = j > i ? 1 : -1;
    busyMoving.current = true;
    try {
      if (el && !reduced() && el.animate) {
        const w = el.clientWidth || 400, target = -dir * Math.min(w * 0.45, 180);
        const a = el.animate([{ transform: `translate3d(${from}px,0,0)`, opacity: 1 - Math.min(Math.abs(from) / w, 0.5) }, { transform: `translate3d(${target}px,0,0)`, opacity: 0 }],
          { duration: exitMs(Math.abs(target - from), vx), easing: "cubic-bezier(.4,0,.9,.6)", fill: "forwards" });
        await a.finished.catch(() => undefined);
        el.style.transform = ""; el.style.opacity = "0";   // the new body mounts at once; it starts invisible and springs in
      }
      setSlide(dir > 0 ? "next" : "prev");
      setTab(to);
      navigator.vibrate?.(8);
    } finally { window.setTimeout(() => { busyMoving.current = false; }, 60); }
  };
  const stepTab = (d: 1 | -1, from = 0, vx = 0) => { const to = tabs[idx() + d]; if (to) void goTab(to, from, vx); };
  const springBack = (el: HTMLElement, from: number) => {
    if (reduced() || !el.animate) { el.style.transform = ""; el.style.opacity = ""; return; }
    const a = el.animate([{ transform: `translate3d(${from}px,0,0)`, opacity: parseFloat(el.style.opacity || "1") }, { transform: "translate3d(0,0,0)", opacity: 1 }],
      { duration: 380, easing: easing("--spr-soft", "cubic-bezier(.2,.8,.2,1)") });
    el.style.transform = ""; el.style.opacity = "";
    void a.finished.catch(() => undefined);
  };
  const swipeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (busyMoving.current || e.pointerType === "mouse" || t.closest("input, textarea, select, button, a, [contenteditable='true']")) { swipe.current = null; return; }
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false, samples: [{ x: e.clientX, t: e.timeStamp }], dx: 0 };
  };
  const swipeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.locked) {
      const intent = swipeIntent(dx, dy);
      if (intent === "vertical") { swipe.current = null; return; }          // scrolling: leave it to the browser
      if (intent === "undecided") return;
      s.locked = true;
      try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ }   // the finger may leave the body while swiping
    }
    s.samples.push({ x: e.clientX, t: e.timeStamp }); if (s.samples.length > 12) s.samples.shift();
    const to = tabs[idx() + directionOf(dx)];
    s.dx = dragOffset(dx, !!to);
    const el = e.currentTarget, w = el.clientWidth || 400;
    el.style.transform = `translate3d(${s.dx}px,0,0)`;
    el.style.opacity = String(1 - Math.min(Math.abs(s.dx) / w, 0.5));
  };
  const swipeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current; swipe.current = null;
    if (!s || s.id !== e.pointerId || !s.locked) return;
    swipedAt.current = Date.now();
    const el = e.currentTarget, w = el.clientWidth || 400, dx = e.clientX - s.x, vx = velocity(s.samples);
    const d = directionOf(dx), has = !!tabs[idx() + d];
    if (shouldCommit(dx, vx, w, has)) stepTab(d, s.dx, vx); else springBack(el, s.dx);
  };
  const swipeCancel = (e: ReactPointerEvent<HTMLDivElement>) => { const s = swipe.current; swipe.current = null; if (s?.locked) springBack(e.currentTarget, s.dx); };

  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"], online && current === "apps");
  const recentHist = useRpc<HistoryData>("history.get", {}, ["history"], online && current === "apps");
  const inbox = useRpc<{ items: Notification[] }>("notifications.list", {}, ["notifications"], online && current === "inbox");
  useEvent("notification", () => { if (current === "inbox") inbox.reload(); });

  // Which AI answers: "Automatisch" (commands at the PC, questions per free AI with a spare) is the default; the chips switch to one AI for this question.
  const ai = useRpc<{ engines?: { id: string; label: string }[] }>("assistant.status", {}, ["assistant"], online && current === "jarvis");
  const aiv = useRpc<AiOverview>("ai.status", {}, ["assistant"], online && current === "jarvis");
  const ENGINE_KEY = "pgl.island.engine";
  const [engine, setEngineState] = useState<string>(() => { try { return readJson<string>(ENGINE_KEY) ?? "smart"; } catch { return "smart"; } });
  const setEngine = (id: string) => { setEngineState(id); try { writeJson(ENGINE_KEY, id); } catch { /* storage blocked */ } };
  const engineIds = (ai.data?.engines ?? []).map((e) => e.id);
  const engineNow = engineIds.includes(engine) ? engine : engineIds.includes("smart") ? "smart" : "auto";
  const consent = useFreeAiConsent();
  const localSnap = useLocalAi();
  const [pendingFree, setPendingFree] = useState<string | null>(null);
  const turns = useRef<{ role: "user" | "bot"; text: string }[]>([]);

  /** Without the PC: general questions go to the free AI (once allowed on this device); nothing else leaves the device. */
  const askWithoutPc = async (v: string) => {
    const own = readyProviders().length > 0;                           // the person's own OpenRouter/Groq key, unlocked on this device
    if (!own && consent === "no") { islandAnswer(LOCAL_PROVIDERS.some((p) => localSnap[p] === "locked") ? t("Dein Schlüssel auf diesem Gerät ist gesperrt – in der KI-Verwaltung entsperren.") : t("Ohne PC kann ich das hier nicht beantworten."), false); return; }
    if (!own && consent === "ask") { setPendingFree(v); return; }
    islandBusy(true);
    try {
      const r = await askLocalChain(v, turns.current);
      turns.current = [...turns.current, { role: "user" as const, text: v }, { role: "bot" as const, text: r.text }].slice(-8);
      islandAnswer(r.text, true, [], "jarvis", r.provider === "pollinations" ? FREE_AI_NAME : r.provider === "local" ? "JARVIS" : LOCAL_NAME[r.provider]);
      if (consumeSpoken()) speak(r.text);
    } catch (e) { islandAnswer(friendlyError(e), false); }
    finally { islandBusy(false); }
  };

  const send = async (text: string) => {
    const v = text.trim(); if (!v) return;
    setQ("");
    const pet = petCommand(v);
    if (pet) { islandPet(pet); islandAnswer(pet === "dance" ? t("Ich tanze!") : pet === "sleep" ? t("Gute Nacht – tippe mich an, dann bin ich wieder da.") : t("Bin wach!"), true); return; }
    // "Schreib bei WhatsApp: …": the text is prepared in the card of the Apps tab – the tap on "öffnen" there is the user's own.
    const cmd = parseMessageCommand(v);
    if (cmd) {
      const app = cmd.app ?? msg.app;
      setMsg({ text: cmd.body || msg.text, app, phone: cmd.phone }); setTab("apps");
      islandAnswer(cmd.body ? t("Die Nachricht ist vorbereitet – tippe auf „Öffnen“, dann wählst du dort den Empfänger.") : t("Schreib den Text in die Karte und tippe auf „Öffnen“."), true);
      return;
    }
    // The source is told only when asked for ("Woher weißt du das?", "Quelle?") – otherwise the island shows just the answer.
    if (asksForSource(v)) {
      const l = islandState().last;
      islandAnswer(l?.via ? t("Das hat {n} geantwortet.{x}", { n: l.via, x: l.note && (l.note.includes("deshalb") || l.note.includes("Websuche:")) ? ` ${l.note.replace(/^Automatisch:\s*/, "")}` : "" }) : t("Die letzte Antwort kam aus der eingebauten Hilfe oder vom PC – ohne externe KI."), true);
      return;
    }
    if (!online) { await askWithoutPc(v); return; }
    try {
      // "direct": I said or typed this command myself – what I named ("Starte Among Us", "Öffne Discord") runs at once, without asking again.
      const res = await client.call<{ reply?: { actions?: (AssistantAction & { auto?: boolean })[] } }>("assistant.ask", { text: v, direct: true, ...(engineNow === "auto" ? {} : { engine: engineNow }) });
      const autos = (res?.reply?.actions ?? []).filter((a) => a.auto && a.method && a.kind !== "navigate");
      for (const a of autos) {
        try { await client.call(a.method!, a.params ?? {}); islandAnswer(a.kind === "launch" ? t("{n} wird gestartet", { n: a.label.replace(/ starten$/, "") }) : a.kind === "stopSounds" ? t("Sounds gestoppt") : t("✓ {n}", { n: a.label }), true); }
        catch (e) { islandAnswer(friendlyError(e), false); break; }
      }
    } catch (err) { islandAnswer(friendlyError(err), false); }
  };
  // Speaking to JARVIS: the sentence is cleaned like a typed one, "Stopp" quietens the voice, "Danke" ends the conversation.
  const convo = useConversation();
  const vs = useVoice();
  const convoRef = useRef(false); convoRef.current = convo;
  const askedAt = useRef(0), idle = useRef(0);
  const voice = useVoiceInput((said) => {
    idle.current = 0;
    const ctl = voiceControl(said);
    if (ctl === "stop") { stopSpeaking(); return; }
    if (ctl === "end") { stopSpeaking(); setConversation(false); toast(t("Gespräch beendet."), "success"); return; }
    const cleaned = cleanSpoken(said);
    if (!cleaned) return;
    markSpoken(); askedAt.current = Date.now(); setTab("jarvis"); void send(cleaned);
  }, (m) => { toast(t(m), "error"); setConversation(false); },
  () => { if (convoRef.current && ++idle.current >= 2) { setConversation(false); toast(t("Gespräch beendet – ich habe nichts gehört."), "info"); } });
  // In a conversation the microphone opens again by itself once the answer has been read aloud (a short pause so JARVIS does not hear itself).
  const lastAt = s.last?.at ?? 0;
  useEffect(() => {
    if (!convo || !voice.supported || voice.listening || vs.speaking || s.busy) return;
    const answered = askedAt.current === 0 || lastAt >= askedAt.current || Date.now() - askedAt.current > 45_000;
    if (!answered) return;
    const timer = setTimeout(() => voice.start(), vs.on ? 1500 : 500);
    return () => clearTimeout(timer);
  }, [convo, voice, vs.speaking, vs.on, s.busy, lastAt]);
  const toggleConversation = async () => {
    if (convo) { setConversation(false); voice.stop(); stopSpeaking(); return; }
    if (await micPermission() === "denied") { toast(t("Das Mikrofon ist für diese Seite gesperrt. In den Browser-Einstellungen der Seite erlauben, dann noch einmal tippen."), "error"); return; }
    idle.current = 0; askedAt.current = 0; setConversation(true);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(q); };

  // Escape closes the "⋯" menu first, then the island.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setMenu(false); } };
    const away = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    window.addEventListener("keydown", key, true); window.addEventListener("mousedown", away);
    return () => { window.removeEventListener("keydown", key, true); window.removeEventListener("mousedown", away); };
  }, [menu]);

  const launch = async (item: LibraryItem) => {
    try { await client.call("library.launch", { id: item.id }); islandAnswer(t("{n} wird gestartet", { n: item.name }), true); }
    catch (e) { islandAnswer((e as Error).message, false); }
  };

  // ---------------------------------------------------------------- cards of "Home"
  const playing = !!np?.active && np.playing;
  const view = countdownView(tm, now);
  const ctl = !online || !canMedia;
  const pos = nowPosition(np, now);
  const timerSub = view ? (view.paused ? t("Pausiert") : tm.pomo ? t(POMO_LABEL[tm.pomo.phase]) : t("Läuft")) : t("Bereit zu starten");
  const timerBtn = () => (view ? (view.paused ? resumeCountdown() : pauseCountdown()) : startCountdown(25));
  const cover = np?.cover ? <img className="isl2-cover" src={np.cover} alt="" /> : <Music size={22} />;
  const accentStyle = accent ? ({ "--tint": `color-mix(in srgb, ${accent} 62%, transparent)` } as React.CSSProperties) : undefined;
  const gameSince = game ? new Date(game.since).getTime() : 0;

  const homeCards = (
    <div className="isl2-cards" onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("button")) holdStart(); }} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}>
      <div className={`isl2-card jv m-${mood}`}>
        <button type="button" className="isl2-ctitle" onClick={() => setTab("jarvis")}>JARVIS</button>
        <span className={`isl2-spin${mood === "thinking" || mood === "listening" ? " on" : ""}`} aria-hidden><i /></span>
        <b className="isl2-big">{t(MOOD_LABEL[mood])}</b>
        <span className="isl2-sub ellipsis">{s.last ? s.last.text : t("Tippen zum Fragen")}</span>
      </div>
      {game && (
        <div className="isl2-card gm">
          <button type="button" className="isl2-ctitle" onClick={() => setTab("game")}>{t("Spiel")}</button>
          <span className="isl2-art" aria-hidden><Gamepad2 size={22} /></span>
          <b className="isl2-big ellipsis" title={game.name}>{game.name}</b>
          <span className="isl2-sub ellipsis">{playTime(gameSince, now) ?? t("läuft")}</span>
        </div>
      )}
      {has("music") && (
        <div className="isl2-card mu" style={accentStyle}>
          <button type="button" className="isl2-ctitle" onClick={() => setTab("music")}>{t("Musik")}</button>
          <span className="isl2-art" aria-hidden>{cover}</span>
          {playing && <Bars level={0.4} />}
          <b className="isl2-big ellipsis" title={np?.title}>{np?.active ? np.title : t("Nichts")}</b>
          <span className="isl2-sub ellipsis">{np?.active ? nowSub(np) : online ? t("Gerade läuft nichts") : t("PC nicht verbunden")}</span>
          {pos && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${pos.ratio})` }} /></span>}
          <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("playpause")} aria-label={t("Wiedergabe/Pause")}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        </div>
      )}
      {has("focus") && (
        <div className="isl2-card fo">
          <button type="button" className="isl2-ctitle" onClick={() => setTab("focus")}>{t("Fokus")}</button>
          <b className="isl2-big isl2-time">{view ? clock(view.left) : "25:00"}</b>
          <span className="isl2-sub">{timerSub}</span>
          {view && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${view.progress})` }} /></span>}
          <button type="button" className="isl2-round" onClick={timerBtn} aria-label={view ? (view.paused ? t("Fortsetzen") : t("Pausieren")) : t("Fokus starten")}>{view && !view.paused ? <Pause size={16} /> : <Play size={16} />}</button>
        </div>
      )}
    </div>
  );

  const label = (id: IslandWidgetId) => t(ISLAND_WIDGETS.find((w) => w.id === id)?.label ?? id);
  const setWidget = (id: IslandWidgetId, on: boolean) => void save({ widgets: toggleWidget(look.widgets, id, on) });
  const editor = (
    <div className="isl2-edit">
      <div className="isl2-ehead">
        <p className="isl2-sub">{t("Alles wackelt: − nimmt ein Widget weg, + holt eines dazu. Die Auswahl gilt für die Insel auf diesem PC.")}</p>
        <button type="button" className="isl2-chip done" onClick={() => setEdit(false)}>{t("Fertig")}</button>
      </div>
      <div className="isl2-wig" role="list" aria-label={t("Aktive Widgets")}>
        {look.widgets.map((id) => (
          <span key={id} role="listitem" className="isl2-wchip on">{label(id)}
            <button type="button" className="isl2-minus" onClick={() => setWidget(id, false)} aria-label={t("{n} entfernen", { n: label(id) })}>−</button></span>
        ))}
      </div>
      <div className="isl2-hhead"><b>{t("Hinzufügen")}</b></div>
      <div className="isl2-wig" role="group" aria-label={t("Weitere Widgets")}>
        {ISLAND_WIDGETS.filter((w) => !look.widgets.includes(w.id)).map((w) => (
          <button key={w.id} type="button" className="isl2-wchip add" title={t(w.hint)} onClick={() => setWidget(w.id, true)} aria-label={t("{n} hinzufügen", { n: label(w.id) })}>+ {label(w.id)}</button>
        ))}
      </div>
    </div>
  );
  const home = edit && canManage ? editor : homeCards;

  // ---------------------------------------------------------------- the other tabs
  const musicTab = (
    <div className="isl2-music" style={accentStyle}>
      <span className="isl2-art big" aria-hidden>{np?.cover ? <img className="isl2-cover" src={np.cover} alt="" /> : <Music size={34} />}</span>
      <div className="isl2-mtext">
        {np?.active ? (
          <><b className="isl2-big ellipsis" title={np.title}>{np.title}</b><span className="isl2-sub ellipsis">{nowSub(np)}{np.playing ? "" : ` · ${t("pausiert")}`}</span></>
        ) : (
          <><b className="isl2-big">{t("Gerade läuft nichts")}</b><span className="isl2-sub">{online ? (np === null ? t("Dieser PC meldet keine Wiedergabe (nur der Windows-Begleiter).") : t("Läuft etwas in Spotify oder einem Browser-Tab, steht es hier.")) : t("PC nicht verbunden")}</span></>
        )}
        {pos && (
          <div className="isl2-seek" role="progressbar" aria-label={t("Fortschritt")} aria-valuemin={0} aria-valuemax={Math.round(pos.total / 1000)} aria-valuenow={Math.round(pos.ms / 1000)}>
            <span>{songTime(pos.ms)}</span><span className="isl2-prog"><i style={{ transform: `scaleX(${pos.ratio})` }} /></span><span>{songTime(pos.total)}</span>
          </div>
        )}
        <div className="isl2-ctrls">
          <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("prev")} aria-label={t("Vorheriger Titel")}><SkipBack size={16} /></button>
          <button type="button" className="isl2-round big" disabled={ctl} onClick={() => media("playpause")} aria-label={t("Wiedergabe/Pause")}>{np?.playing ? <Pause size={18} /> : <Play size={18} />}</button>
          <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("next")} aria-label={t("Nächster Titel")}><SkipForward size={16} /></button>
          <span className="isl2-gap" />
          <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("voldown")} aria-label={t("Leiser")}><Volume1 size={16} /></button>
          <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("volup")} aria-label={t("Lauter")}><Volume2 size={16} /></button>
        </div>
      </div>
    </div>
  );

  // Game view: what runs, since when, the connection, and the controls that exist at the PC (overlay, recording, replay).
  const act = async (method: string, ok: string) => { try { const r = await client.call<{ message?: string }>(method, {}); toast(r?.message ? t(r.message) : ok, "success"); } catch (e) { toast((e as Error).message, "error"); } };
  const gameTab = game ? (
    <div className="isl2-game">
      <div className="isl2-gtop">
        <span className="isl2-art big" aria-hidden><Gamepad2 size={34} /></span>
        <div className="isl2-mtext">
          <b className="isl2-big ellipsis" title={game.name}>{game.name}</b>
          <span className="isl2-sub">{t("läuft seit {t}", { t: new Date(gameSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })} · {playTime(gameSince, now) ?? "–"}</span>
          <span className={`isl2-conn ${online ? "ok" : "off"}`}><i />{online ? t("PC verbunden") : t("PC nicht verbunden")}</span>
        </div>
      </div>
      <div className="isl2-actions">
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("overlay.toggle", t("Overlay umgeschaltet"))}><Layers size={17} />{t("Overlay")}</button>
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("capture.recordToggle", t("Aufnahme umgeschaltet"))}><Radio size={17} />{t("Aufnahme")}</button>
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("capture.replaySave", t("Replay gespeichert"))}><Star size={17} />{t("Replay")}</button>
      </div>
    </div>
  ) : <p className="isl2-sub">{t("Kein Spiel aktiv")}</p>;

  // Timer view: presets or your own minutes, the countdown with progress, pause and resume.
  const [custom, setCustom] = useState("");
  const focusTab = (
    <div className="isl2-focus">
      <div className="isl2-tcard">
        <div className={`isl2-ring${view?.paused ? " paused" : ""}`} style={{ ["--p" as string]: view ? view.progress : 0 } as React.CSSProperties} aria-hidden><i /></div>
        <div className="isl2-ttext">
          <b className="isl2-time">{view ? clock(view.left) : "25:00"}</b>
          <span className="isl2-sub">{timerSub}{tm.pomo ? ` · ${tm.pomo.done} ✓` : ""}</span>
          <div className="isl2-ctrls">
            {view ? (
              <>
                <button type="button" className="isl2-round big" onClick={() => (view.paused ? resumeCountdown() : pauseCountdown())} aria-label={view.paused ? t("Fortsetzen") : t("Pausieren")}>{view.paused ? <Play size={18} /> : <Pause size={18} />}</button>
                <button type="button" className="isl2-chip" onClick={stopCountdown}>{t("Stopp")}</button>
              </>
            ) : (
              <>
                {[5, 15, 25, 45].map((m) => <button key={m} type="button" className="isl2-chip" onClick={() => startCountdown(m)}>{m} min</button>)}
                <button type="button" className="isl2-chip" title={t("25 min Fokus, 5 min Pause, nach vier Runden 15 min")} onClick={() => startPomodoro()}>{t("Pomodoro")}</button>
              </>
            )}
          </div>
          {!view && (
            <form className="isl2-custom" onSubmit={(e) => { e.preventDefault(); const m = Number(custom); if (m >= 1 && m <= 180) { startCountdown(m); setCustom(""); } }}>
              <input className="input" inputMode="numeric" value={custom} maxLength={3} placeholder={t("Eigene Minuten")} aria-label={t("Eigene Minuten")} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
              <button type="submit" className="isl2-chip" aria-label={t("Eigene Minuten starten")} disabled={!(Number(custom) >= 1 && Number(custom) <= 180)}>{t("Start")}</button>
            </form>
          )}
        </div>
      </div>
      {has("stopwatch") && <IslandStopwatch />}
    </div>
  );

  const ENGINE_LABEL: Record<string, string> = { smart: "Automatisch", openrouter: "OpenRouter", groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", pollinations: "Pollinations", router: "Router", ollama: "Lokale KI", local: "Eingebaut" };
  const noAiHere = !online && consent === "no";
  const jarvisTab = (
    <div className="isl2-chat">
      <div className="isl2-answer">
        <span className="badge">{t(MOOD_LABEL[mood])}</span>
        <p className="isl-last">{s.last ? s.last.text : t("Noch nichts gefragt.")}</p>
      </div>
      {pendingFree && (
        <div className="isl2-answer" role="group" aria-label={t("Freie KI erlauben")}>
          <p className="tiny">{t(FREE_AI_NOTICE)}</p>
          <div className="isl2-ctrls">
            <button type="button" className="isl2-chip done" onClick={() => { const v = pendingFree; setPendingFree(null); setFreeAiConsent("yes"); void (async () => { islandBusy(true); try { const r = await askFreeAi(v, { history: turns.current }); islandAnswer(r.text, true, [], "jarvis", FREE_AI_NAME); } catch (e) { islandAnswer((e as Error).message, false); } finally { islandBusy(false); } })(); }}>{t("Ja, freie KI nutzen")}</button>
            <button type="button" className="isl2-chip" onClick={() => { setPendingFree(null); setFreeAiConsent("no"); }}>{t("Nein")}</button>
          </div>
        </div>
      )}
      {online && engineIds.some((id) => id !== "local" && id !== "auto") && (
        <div className="isl2-engines" role="radiogroup" aria-label={t("Welche KI antwortet")}>
          {engineIds.filter((id) => id in ENGINE_LABEL).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={engineNow === id} className={`isl2-chip${engineNow === id ? " on" : ""}`} onClick={() => setEngine(id)}>{t(ENGINE_LABEL[id])}</button>
          ))}
          <button type="button" role="radio" aria-checked={engineNow === "auto"} className={`isl2-chip${engineNow === "auto" ? " on" : ""}`} onClick={() => setEngine("auto")} title={t("Die Einstellung des PCs")}>{t("Standard")}</button>
        </div>
      )}
      <form className="isl2-ask" onSubmit={submit}>
        <button type="button" className={`isl2-mic${voice.listening ? " on" : ""}`} disabled={!voice.supported || noAiHere} onClick={() => { if (convo) setConversation(false); voice.toggle(); }}
          aria-pressed={voice.listening} aria-label={voice.listening ? t("Zuhören beenden") : t("Mit JARVIS sprechen")}
          title={voice.supported ? (voice.listening ? t("Zuhören beenden") : t("Mit JARVIS sprechen")) : t("In diesem Fenster gibt es keine Spracherkennung – schreib stattdessen, oder öffne JARVIS im Browser (Chrome, Edge).")}>
          {voice.listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button type="button" className={`isl2-mic${convo ? " on" : ""}`} disabled={!voice.supported || noAiHere} onClick={() => void toggleConversation()}
          aria-pressed={convo} aria-label={convo ? t("Gespräch beenden") : t("Gespräch starten")}
          title={convo ? t("Gespräch beenden") : t("Gespräch: JARVIS hört nach jeder Antwort von selbst wieder zu")}><MessagesSquare size={18} /></button>
        <input className="input" value={voice.listening ? voice.interim : q} maxLength={300} readOnly={voice.listening}
          placeholder={voice.listening ? t("Ich höre zu …") : t("Frag JARVIS …")} onChange={(e) => setQ(e.target.value)} aria-label={t("Frag JARVIS …")} />
        <button type="submit" className="isl2-send" disabled={!q.trim() || noAiHere || voice.listening} aria-label={t("Fragen")}><Send size={16} /></button>
      </form>
      {convo && <p className="tiny isl2-tip" role="status">{t("Gespräch läuft – sprich einfach weiter. Sag „Stopp“, damit JARVIS still ist, oder „Danke“, um zu beenden.")}</p>}
      <p className="tiny muted isl2-tip">{online ? t("Befehle („Starte WhatsApp“) erledigt der PC, Fragen beantwortet eine kostenlose KI – fällt eine aus, springt die nächste ein. Gesprochene Fragen werden laut beantwortet.") : t("Ohne PC: allgemeine Fragen beantwortet die freie KI ohne Konto (nur mit deinem Ja).")}</p>
      <AiRoster online={online} ai={aiv.data} compact selected={t(ENGINE_LABEL[engineNow] ?? "Standard")} />
      <details className="isl2-tiles"><summary>{t("Wer ist wofür zuständig")}</summary><AiTiles online={online} ai={aiv.data} /></details>
      <details className="isl2-setup" open={online && !!aiv.data && !hasReadyAi(aiv.data)}>
        <summary>{t("KI-Verwaltung")}{hasReadyAi(aiv.data) ? ` · ${t("eingerichtet")}` : ""}</summary>
        <AiManager online={online} roster={false} onChanged={() => { ai.reload(); aiv.reload(); }} />
      </details>
    </div>
  );

  const items = lib.data?.items;
  const wa = findWhatsApp(items);
  const recent = homeRecent(items, recentHist.data, 6).filter((i) => i.id !== wa?.id).slice(0, wa ? 5 : 6);
  const appsTab = (
    <div className="isl2-apps">
      <MessageCompose text={msg.text} onText={(v) => setMsg((m) => ({ ...m, text: v }))} app={msg.app} phone={msg.phone}
        onApp={(app) => { setMsg((m) => ({ ...m, app })); try { writeJson("pgl.island.msgapp", app); } catch { /* ignore */ } }} />
      {!online ? <p className="isl2-sub">{t("PC nicht verbunden")}</p> : (
        <>
          <div className="isl2-grid">
            {wa && <button type="button" className="isl2-app wa" disabled={!canMedia} onClick={() => void launch(wa)}><AppLogo item={wa} /><span className="ellipsis">WhatsApp</span></button>}
            {recent.map((i) => <button key={i.id} type="button" className="isl2-app" disabled={!canMedia} onClick={() => void launch(i)} title={i.name}><AppLogo item={i} /><span className="ellipsis">{i.name}</span></button>)}
          </div>
          {!lib.loading && !wa && (
            <p className="tiny muted">{t("WhatsApp ist nicht in deiner Bibliothek. Füge es unter „Apps“ hinzu, dann startet es von hier.")} {floating && <Link to="/programs" onClick={onClose}>{t("Apps öffnen")}</Link>}</p>
          )}
          {!lib.loading && !recent.length && !wa && <p className="isl2-sub">{t("Noch nichts gestartet")}</p>}
        </>
      )}
    </div>
  );

  const list = (inbox.data?.items ?? []).filter((n) => !n.dismissed).slice(0, 5);
  const dot = (l: HistoryEntry["level"]) => (l === "error" ? "error" : l === "warning" ? "warn" : "ok");
  const inboxTab = (
    <div className="isl2-inbox">
      <div className="isl2-hhead"><b>{t("Verlauf")}</b>{hist.length > 0 && <button type="button" className="isl2-chip" onClick={clearIslandHistory} aria-label={t("Verlauf leeren")}><Trash2 size={13} /></button>}</div>
      {hist.length === 0 ? <p className="isl2-sub">{t("Noch nichts passiert.")}</p> : hist.slice(0, 8).map((h) => (
        <div key={h.id} className="isl2-note">
          <span className={`dot ${dot(h.level)}`} />
          <div className="isl2-ntext"><b className="ellipsis">{h.text}</b><span className="tiny muted">{relTime(h.at)}</span></div>
        </div>
      ))}
      <div className="isl2-hhead"><b>{t("Meldungen des PCs")}</b></div>
      {!online ? <p className="isl2-sub">{t("PC nicht verbunden")}</p>
        : !inbox.loading && !list.length ? <p className="isl2-sub">{t("Keine offenen Meldungen.")}</p>
        : list.map((n) => (
          <div key={n.id} className="isl2-note">
            <span className={`dot ${n.severity === "error" ? "error" : n.severity === "warning" ? "warn" : "ok"}`} />
            <div className="isl2-ntext"><b className="ellipsis">{n.title}{n.count > 1 ? ` (${n.count}×)` : ""}</b><span className="tiny muted ellipsis">{n.message} · {relTime(n.at)}</span></div>
          </div>
        ))}
    </div>
  );

  const pcTab = (
    <div className="isl-grid">
      {has("game") && (
        <div className="isl-card">
          <div className="isl-main">
            <b className="ellipsis">{game ? game.name : t("Kein Spiel aktiv")}</b>
            <span className="tiny muted">{!online ? t("PC nicht verbunden") : game ? `${t("läuft seit {t}", { t: new Date(game.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}${playTime(game.since, now) ? ` · ${playTime(game.since, now)}` : ""}` : t("Laut deinem PC")}</span>
          </div>
        </div>
      )}
      {has("start") && <IslandStart online={online} canLaunch={canMedia} />}
      {has("clock") && (
        <div className="isl-card"><div className="isl-main">
          <b className="isl-big">{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
          <span className="tiny muted">{new Date(now).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
        </div></div>
      )}
      {has("stats") && <IslandStats online={online} />}
      {has("temp") && <IslandTemps online={online} />}
      {has("net") && <IslandNet online={online} />}
      {has("volume") && <IslandVolume enabled={online && canMedia} press={media} />}
      {has("profile") && <IslandProfiles online={online} canLaunch={canMedia} />}
      {has("sounds") && <IslandSounds online={online} canPlay={canSound} />}
    </div>
  );

  const body: Record<IslandTab, ReactNode> = { home, game: gameTab, music: musicTab, jarvis: jarvisTab, apps: appsTab, inbox: inboxTab, pc: pcTab, focus: focusTab, note: <IslandNote /> };

  return (
    <div className="isl2" role="dialog" aria-label={t("JARVIS-Insel")}>
      <header className="isl2-head">
        {/* Like the closed island opens with a tap on its top, the open one closes with a tap on its top (eyes and date) – no menu needed. */}
        <button type="button" className="isl2-closeTap" aria-label={t("JARVIS-Insel schließen")} title={t("Tippen zum Schließen")} onClick={() => { islandTouch(); onClose(); }}>
          <IslandEyes mood={mood} />
          <time className="isl2-date" dateTime={new Date(now).toISOString()}>{new Date(now).toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
        </button>
        {playing && <Bars level={0.4} />}
        <div className="isl2-moreWrap" ref={menuRef}>
          <button type="button" className="isl2-more" aria-haspopup="menu" aria-expanded={menu} aria-label={t("Mehr")} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={18} /></button>
          {menu && (
            <div className="isl2-menu" role="menu">
              <label className="isl2-mi" role="menuitemcheckbox" aria-checked={prefs.sound}><input type="checkbox" checked={prefs.sound} onChange={(e) => setIslandPrefs({ sound: e.target.checked })} /> {t("Ton bei „fertig“ und Rückfragen")}</label>
              {canManage && <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setTab("home"); setEdit(true); }}>{t("Widgets bearbeiten")}</button>}
              {floating && <Link to="/assistant" role="menuitem" className="isl2-mi" onClick={onClose}>{t("JARVIS öffnen")}</Link>}
              {floating && <Link to="/overlay-settings" role="menuitem" className="isl2-mi" onClick={onClose}>{t("Insel-Einstellungen")}</Link>}
              <button type="button" role="menuitem" className="isl2-mi" onClick={onClose}>{t("Schließen")}</button>
            </div>
          )}
        </div>
      </header>
      <div className={`isl2-body${slide ? ` swipe-${slide}` : ""}`} role="tabpanel" id="isl2-panel" aria-labelledby={`isl2-tab-${current}`} key={current} ref={bodyRef}
        onPointerDown={swipeDown} onPointerMove={swipeMove} onPointerUp={swipeUp} onPointerCancel={swipeCancel}
        onClickCapture={(e) => { if (Date.now() - swipedAt.current < 400) { e.preventDefault(); e.stopPropagation(); } }}>{body[current]}</div>
      <nav className="isl2-tabs" role="tablist" aria-label={t("Bereiche der Insel")}>
        {tabs.map((id) => {
          const m = TAB_META[id], on = id === current;
          return (
            <button key={id} type="button" role="tab" id={`isl2-tab-${id}`} aria-selected={on} aria-controls="isl2-panel" aria-label={t(m.label)} title={t(m.label)}
              className={`isl2-tab${on ? " on" : ""}`} onClick={() => { if (id !== current) void goTab(id); }}><m.icon size={17} />{on && <span>{t(m.label)}</span>}</button>
          );
        })}
        <span className="isl2-grow" />
        <button type="button" className="isl2-tab" disabled={ctl} onClick={() => media("mute")} aria-label={t("Ton aus/an")} title={t("Ton aus/an")}><VolumeX size={17} /></button>
      </nav>
    </div>
  );
}
