// The open JARVIS island: a header (eyes, date and time, equalizer, "⋯"), three cards on "Home" (JARVIS, music, focus) and a row of
// tabs underneath – music, JARVIS (write or speak), focus timer and stopwatch, notifications, apps (WhatsApp, last started), the PC
// values and a note. Own design in the layout of "island" apps. Everything shown is real state of the PC; what the PC cannot tell stays "n. v.".

import { carouselMs, directionOf, dragOffset, shouldCommit, swipeIntent, velocity } from "../lib/island-swipe";
import { flushSync } from "react-dom";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Gamepad2, Home, Inbox, LayoutGrid, MessageCircle, MessagesSquare, Mic, MicOff, Monitor, MoreHorizontal, ChevronUp, Settings2, Power, RefreshCw, Copy, Check, BellOff, History, LayoutDashboard, SlidersHorizontal, Activity, BatteryCharging, BatteryMedium, Music, Pause, Play, Radio, Send, SkipBack, SkipForward, Star, StickyNote, Timer, Trash2, Volume2, Layers, Camera, ScrollText, Download, Headphones, Pencil, Plus, X, Smartphone, Cpu, Gauge, MemoryStick, Palette } from "lucide-react";
import { t } from "../lib/i18n";
import { client } from "../lib/rpc";
import { useAppState } from "../lib/state";
import { toast, useCan, useConn, useEvent, useRpc } from "../lib/hooks";
import { connView } from "../lib/conn-state";
import { handoffUrl, IslandControls, IslandLyrics, IslandSystem, onTouchDevice, PcVolumeBar, useIslandWeather, useMetricsHistory, usePcControls, usePcSensors, WeatherIcon } from "./island-extra";
import { IslandTile, TabsEditor, TileCatalog, TileEditBar, TileSettings, type TileCtx } from "./island-tiles";
import { IslandAudio } from "./island-audio";
import { ProcSheet, type ProcKind } from "./island-procs";
import { IslandColorPicker } from "./island-color";
import { addTile, moveTile, opt, removeTile, setTabs, setTileOpt, tabsOf, tileDef, MAX_TILES, type IslandLayout, type IslandTab, type LayoutPage, type Tile } from "../lib/island-layout";
import { sendWake, useWake, wakeLabel } from "../lib/wake";
import { useIslandLayout, useIslandLook } from "../lib/island-look";
import { ISLAND_WIDGETS, toggleWidget, type IslandWidgetId } from "../lib/island-widgets";
import { clock, islandAnswer, islandState, islandBusy, islandPet, islandTouch, MOOD_LABEL, petCommand, setIslandPrefs, useIsland, useIslandPrefs, type Mood } from "../lib/island";
import { asksForSource } from "../lib/answer-text";
import type { AssistantAction } from "../lib/assistant";
import { addCountdown, countdownView, pauseCountdown, playTime, resumeCountdown, startCountdown, startPomodoro, stopCountdown, useTimer } from "../lib/island-timer";
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
import { brandBg, brandFor } from "../lib/brands";
import type { LibraryItem, Notification } from "../lib/types";
import { BrandLogo } from "./brand-logo";
import { useGlidePill } from "./glide-pill";
import { Bars, IslandEyes } from "./island-bits";
import { IslandNet, IslandNote, IslandProfiles, IslandSounds, IslandStart, IslandStats, IslandStopwatch, IslandTemps, IslandVolume } from "./island-widgets";

export type { IslandTab } from "../lib/island-layout";
const TAB_META: Record<IslandTab, { icon: typeof Home; label: string }> = {
  home: { icon: Home, label: "Home" }, dash: { icon: LayoutDashboard, label: "Übersicht" }, controls: { icon: SlidersHorizontal, label: "Regler" }, audio: { icon: Headphones, label: "Audio" }, system: { icon: Activity, label: "System" }, game: { icon: Gamepad2, label: "Spiel" }, music: { icon: Music, label: "Musik" }, jarvis: { icon: MessageCircle, label: "JARVIS" }, focus: { icon: Timer, label: "Fokus" },
  inbox: { icon: Inbox, label: "Meldungen" }, apps: { icon: LayoutGrid, label: "Apps" }, pc: { icon: Monitor, label: "PC" }, note: { icon: StickyNote, label: "Notiz" },
};
/** Widgets of the old panel that now live under the "PC" tab (music, focus, stopwatch and note have their own places). */
const PC_WIDGETS: IslandWidgetId[] = ["game", "start", "clock", "stats", "temp", "net", "volume", "profile", "sounds"];

/** Which tabs show: the fixed ones always, the others follow the widget choice in the settings (so nothing the person switched off comes back). */
export function visibleTabs(widgets: IslandWidgetId[], gameRunning = false): IslandTab[] {
  const has = (id: IslandWidgetId) => widgets.includes(id);
  const tabs: IslandTab[] = ["home", "dash"];   // the overview (calendar, focus, weather, load) is always there
  if (gameRunning) tabs.push("game"); // the gaming view appears with a running game and goes with it
  if (has("music")) tabs.push("music");
  tabs.push("jarvis");
  if (has("focus") || has("stopwatch")) tabs.push("focus");
  tabs.push("inbox", "apps", "controls", "audio", "system");
  if (PC_WIDGETS.some(has)) tabs.push("pc");
  if (has("note")) tabs.push("note");
  return tabs;
}

/** The WhatsApp entry of the library (any item called "WhatsApp"); there is no way to open it without the PC knowing the program. */
export const findWhatsApp = (items: LibraryItem[] | undefined) => items?.find((i) => /whatsapp/i.test(i.name));

function AppLogo({ item }: { item: LibraryItem }) {
  const b = brandFor(item);
  if (b) return <BrandLogo brand={b} size={30} color="currentColor" />;
  if (item.iconData) return <img className="isl2-appimg" src={item.iconData} alt="" width={30} height={30} decoding="async" />;
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
  // The real state of the connection in words (lib/conn-state.ts), and the wake signal for a PC that is off (lib/wake.ts, only where it is set up).
  const cview = connView(conn, { hasCredentials: !!client.credentials });
  const wake = useWake();
  const waking = wake.phase === "sending" || wake.phase === "sent" || wake.phase === "booting" || wake.phase === "connecting";
  const pcLine = online ? (conn.via === "cloud" ? t("über die Cloud") : t("PC bereit")) : waking ? wakeLabel(wake, false, true).text : cview.label;
  const [copied, setCopied] = useState(false);
  const pcControls = usePcControls(online);
  const sensors = usePcSensors(online);
  const [lyrics, setLyrics] = useState(false);
  const weather = useIslandWeather();
  const np = useNowPlaying();
  const tm = useTimer();
  const game = mainGame(app?.running);
  const lay = useIslandLayout();
  const L = lay.layout;
  const tabs = tabsOf(L, visibleTabs(look.widgets, !!game), !!game);
  const metrics = useMetricsHistory(online);
  const has = (id: IslandWidgetId) => look.widgets.includes(id);
  const [tab, setTabRaw] = useState<IslandTab>("home");
  // Any other change of area (voice, buttons, links) fades the new area in; only the swipe carousel hands over without a second animation.
  const setTab = (to: IslandTab) => { setSlide(null); setTabRaw(to); };
  const [msg, setMsg] = useState<{ text: string; app: Messenger; phone: string | null }>(() => ({ text: "", app: ((): Messenger => { const v = readJson<string>("pgl.island.msgapp"); return v === "telegram" || v === "sms" || v === "mail" ? v : "whatsapp"; })(), phone: null }));
  const [menu, setMenu] = useState(false);
  // The menu stays for a moment after it was closed, so it can fold back into its corner.
  const [menuShown, setMenuShown] = useState(false);
  useEffect(() => { if (menu) { setMenuShown(true); return; } const id = window.setTimeout(() => setMenuShown(false), 190); return () => window.clearTimeout(id); }, [menu]);
  const [edit, setEdit] = useState(false);
  // Editing the start page or the overview: the tiles wiggle, each can move, be set up or go; "+" adds one (3.57).
  const [editing, setEditing] = useState<LayoutPage | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "add" | "tabs" | "color" } | { kind: "opts"; id: string }>(null);
  const [procs, setProcs] = useState<ProcKind | null>(null);
  const canClosePrograms = useCan("manage");
  const hold = useRef<number | null>(null);
  // Holding a tile (or "… bearbeiten" in the menu) starts editing that page.
  const holdStart = () => { const page = tabRef.current; if (page !== "home" && page !== "dash") return; hold.current = window.setTimeout(() => { hold.current = null; setEditing(page); navigator.vibrate?.(15); }, 600); };
  const holdEnd = () => { if (hold.current) { clearTimeout(hold.current); hold.current = null; } };
  const [q, setQ] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  useEffect(() => { let on = true; void accentOfCover(np?.cover).then((c) => { if (on) setAccent(c); }); return () => { on = false; }; }, [np?.cover]);
  const hist = useIslandHistory();
  const current: IslandTab = tabs.includes(tab) ? tab : "home";
  useEffect(() => { if (editing && current !== editing) { setEditing(null); setSheet(null); } }, [current, editing]);
  const media = (key: string) => client.call("media.key", { key }).catch((e: Error) => toast(e.message, "error"));
  // Swipe: like a deck of cards – the area follows the finger and the NEXT one is already there beside it, moving along. On release both carry on
  // (the next one comes to rest in the middle), or both spring back. Touch and pen only, never over a field or a button. A tap on a tab does the same.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLElement | null>(null);
  const thumbRef = useRef<HTMLSpanElement | null>(null);
  useGlidePill(tabsRef, thumbRef, ".isl2-tab.on", [current, tabs.length]);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number; locked: boolean; samples: { x: number; t: number }[]; dx: number; d: 1 | -1 } | null>(null);
  const swipedAt = useRef(0); // a swipe must not also count as a tap on the card under the finger
  const busyMoving = useRef(false);
  const queuedTab = useRef<IslandTab | null>(null);
  const tabRef = useRef<IslandTab>(current);
  tabRef.current = current;
  const goTabRef = useRef<(to: IslandTab) => Promise<void>>(async () => undefined);
  const [slide, setSlide] = useState<"none" | null>(null);
  const [peek, setPeek] = useState<IslandTab | null>(null);
  const reduced = () => document.documentElement.dataset.motion === "reduce";
  const idx = () => tabs.indexOf(current);
  const spot = (dx: number, d: 1 | -1) => { const w = bodyRef.current?.clientWidth || 400; if (peekRef.current) peekRef.current.style.transform = `translate3d(${dx + d * w}px,0,0)`; };
  // The neighbour is mounted a moment after the drag starts: put it where the finger says as soon as it exists.
  useLayoutEffect(() => { const s = swipe.current; if (peek && s) spot(s.dx, s.d); });
  /** Carries the current area out and the next one in (from where the finger left them), then hands over to the real next area without a flicker. */
  const goTab = async (to: IslandTab, from = 0, vx = 0) => {
    const el = bodyRef.current, i = idx(), j = tabs.indexOf(to);
    if (j < 0) return;
    if (busyMoving.current) { queuedTab.current = to; return; }          // tapped while moving: it goes there right after, nothing is lost
    if (j === i) return;
    const d: 1 | -1 = j > i ? 1 : -1;
    busyMoving.current = true;
    try {
      if (el && !reduced() && el.animate) {
        const w = el.clientWidth || 400;
        flushSync(() => setPeek(to));
        const pe = peekRef.current;
        if (pe) {
          const ms = carouselMs(Math.abs(-d * w - from), vx), ease = "cubic-bezier(.22,.9,.28,1)";
          const a1 = el.animate([{ transform: `translate3d(${from}px,0,0)` }, { transform: `translate3d(${-d * w}px,0,0)` }], { duration: ms, easing: ease, fill: "forwards" });
          const a2 = pe.animate([{ transform: `translate3d(${from + d * w}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: ms, easing: ease, fill: "forwards" });
          await Promise.all([a1.finished, a2.finished]).catch(() => undefined);
        }
      }
      setSlide("none"); setTabRaw(to); setPeek(null);   // the real area appears exactly where the neighbour stopped
      navigator.vibrate?.(8);
    } finally {
      window.setTimeout(() => {
        busyMoving.current = false;
        const next = queuedTab.current; queuedTab.current = null;
        if (next && next !== tabRef.current) void goTabRef.current(next);
      }, 60);
    }
  };
  goTabRef.current = (to) => goTab(to);
  const stepTab = (d: 1 | -1, from = 0, vx = 0) => { const to = tabs[idx() + d]; if (to) void goTab(to, from, vx); };
  const springBack = (el: HTMLElement, from: number, d: 1 | -1) => {
    const pe = peekRef.current, w = el.clientWidth || 400;
    if (reduced() || !el.animate) { el.style.transform = ""; setPeek(null); return; }
    const ease = getComputedStyle(document.documentElement).getPropertyValue("--spr-soft").trim() || "cubic-bezier(.2,.8,.2,1)";
    el.animate([{ transform: `translate3d(${from}px,0,0)` }, { transform: "translate3d(0,0,0)" }], { duration: 400, easing: ease });
    el.style.transform = "";
    const a = pe?.animate([{ transform: `translate3d(${from + d * w}px,0,0)` }, { transform: `translate3d(${d * w}px,0,0)` }], { duration: 400, easing: ease, fill: "forwards" });
    if (a) void a.finished.then(() => setPeek(null), () => setPeek(null)); else setPeek(null);
  };
  const swipeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (busyMoving.current || e.pointerType === "mouse" || t.closest("input, textarea, select, button, a, [contenteditable='true']")) { swipe.current = null; return; }
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false, samples: [{ x: e.clientX, t: e.timeStamp }], dx: 0, d: 1 };
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
    s.d = directionOf(dx);
    const to = tabs[idx() + s.d] ?? null;
    s.dx = dragOffset(dx, !!to);
    e.currentTarget.style.transform = `translate3d(${s.dx}px,0,0)`;
    if (peek !== to) setPeek(to);                                            // the neighbour on the side the finger pulls towards
    if (to) spot(s.dx, s.d);
  };
  const swipeUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current; swipe.current = null;
    if (!s || s.id !== e.pointerId || !s.locked) return;
    swipedAt.current = Date.now();
    const el = e.currentTarget, w = el.clientWidth || 400, dx = e.clientX - s.x, vx = velocity(s.samples);
    const d = directionOf(dx), has = !!tabs[idx() + d];
    if (shouldCommit(dx, vx, w, has)) stepTab(d, s.dx, vx); else springBack(el, s.dx, d);
  };
  const swipeCancel = (e: ReactPointerEvent<HTMLDivElement>) => { const s = swipe.current; swipe.current = null; if (s?.locked) springBack(e.currentTarget, s.dx, s.d); };

  const lib = useRpc<{ items: LibraryItem[] }>("library.list", {}, ["library"], online && current === "apps");
  const recentHist = useRpc<HistoryData>("history.get", {}, ["history"], online && current === "apps");
  const inbox = useRpc<{ items: Notification[] }>("notifications.list", {}, ["notifications"], online && current === "inbox");
  const general = useRpc<{ settings: { downloadNotices?: boolean } }>("settings.get", {}, ["settings"], online && current === "inbox" && canManage);
  useEvent("notification", () => { if (current === "inbox") inbox.reload(); });

  // Which AI answers: "Automatisch" (commands at the PC, questions per free AI with a spare) is the default; the chips switch to one AI for this question.
  const ai = useRpc<{ engines?: { id: string; label: string }[]; webSearch?: boolean; bingoProvider?: string | null }>("assistant.status", {}, ["assistant"], online);
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
    // The same JARVIS as on the assistant page (lib/jarvis-ask.ts): one brain, the same AIs and keys, the same chat – so nothing has to be set up twice.
    islandBusy(true);
    try {
      const { askJarvis } = await import("../lib/jarvis-ask");
      const { appendChat, readChat } = await import("../lib/assistant");
      const { jarvisEnabled, openJarvis } = await import("../lib/jarvis-session");
      openJarvis();                                                    // asking here starts the JARVIS session like opening the page does (named commands run at once)
      const { webSwitch } = await import("../lib/research-chat");
      const chat = readChat();
      let shown = false;
      await askJarvis(v, { online: true, engine: engineNow === "auto" ? "auto" : engineNow, web: webSwitch(), webSearch: !!ai.data?.webSearch, bingoProvider: ai.data?.bingoProvider ?? null, conversationId: chat.conversationId, turns: chat.turns, requestId: "i" + Math.random().toString(36).slice(2, 10), direct: true }, {},
        {
          add: (reply, _more, conversationId) => {
            shown = true;
            islandAnswer(reply.text, reply.failed ? false : true, reply.actions, "jarvis", reply.model ?? undefined);
            appendChat(v, reply, conversationId);
            if (consumeSpoken()) speak(reply.text);
            // With JARVIS switched off nothing ran by itself: what the PC named for direct execution runs now (a started game, a sound).
            if (!jarvisEnabled()) void (async () => {
              for (const a of reply.actions.filter((x: AssistantAction & { auto?: boolean }) => x.auto && x.method && x.kind !== "navigate")) {
                try { await client.call(a.method!, a.params ?? {}); islandAnswer(a.kind === "launch" ? t("{n} wird gestartet", { n: a.label.replace(/ starten$/, "") }) : t("✓ {n}", { n: a.label }), true); }
                catch (e) { islandAnswer(friendlyError(e), false); break; }
              }
            })();
            return true;
          },
          speak: () => { /* the island reads an answer aloud only when the question was spoken (see add) */ },
          navigate: () => { /* the island stays where it is */ },
          setPhase: () => { /* no phases here */ },
        });
      if (!shown) islandAnswer(t("Dazu habe ich keine Antwort bekommen."), false);
    } catch (err) { islandAnswer(friendlyError(err), false); }
    finally { islandBusy(false); }
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
  // Keyboard on the PC: 1–9 open an area, ← and → go to its neighbours – never while something is being typed.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || !el || el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (/^[1-9]$/.test(e.key)) { const to = tabs[Number(e.key) - 1]; if (to) { e.preventDefault(); void goTabRef.current(to); } }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") { const to = tabs[tabs.indexOf(tabRef.current) + (e.key === "ArrowRight" ? 1 : -1)]; if (to) { e.preventDefault(); void goTabRef.current(to); } }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tabs.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const touch = onTouchDevice();
  const pos = nowPosition(np, now);
  const timerSub = view ? (view.paused ? t("Pausiert") : tm.pomo ? t(POMO_LABEL[tm.pomo.phase]) : t("Läuft")) : t("Bereit zu starten");
  const cover = np?.cover ? <img className="isl2-cover" src={np.cover} alt="" /> : <Music size={22} />;
  const accentStyle = accent ? ({ "--tint": `color-mix(in srgb, ${accent} 62%, transparent)` } as React.CSSProperties) : undefined;
  const gameSince = game ? new Date(game.since).getTime() : 0;
  // The running game's own picture fills its card: its cover if there is one, else its logo/icon on a soft blurred copy of itself – never stretched.
  const gameLib = useRpc<{ items: LibraryItem[]; coversFromCdn?: boolean }>("library.list", {}, ["library"], online && !!game);
  const gItem = game ? gameLib.data?.items.find((i) => i.id === game.itemId) : undefined;
  const gCover = gItem?.coverUrl && (gameLib.data?.coversFromCdn || !gItem.coverUrl.includes("steamstatic")) ? gItem.coverUrl : undefined;
  const gBrand = gItem ? brandFor(gItem) : undefined;
  const gPic = gCover ?? gItem?.iconData ?? null;
  const [gAccent, setGAccent] = useState<string | null>(null);
  useEffect(() => { let on = true; void accentOfCover(gPic).then((c) => { if (on) setGAccent(c); }); return () => { on = false; }; }, [gPic]);
  const gStyle = gAccent ? ({ "--tint": `color-mix(in srgb, ${gAccent} 62%, transparent)` } as React.CSSProperties) : gBrand ? ({ "--tint": `color-mix(in srgb, ${brandBg(gBrand)} 70%, transparent)` } as React.CSSProperties) : undefined;
  const musicFilled = !!np?.cover;

  // ---------------------------------------------------------------- tiles: start page and overview (3.57, editable)
  const gameLogo = gItem && (gBrand || gItem.iconData) ? (
    <span className="isl2-fill logo" aria-hidden>
      {gItem.iconData && <img className="isl2-fill-blur" src={gItem.iconData} alt="" />}
      <span className="isl2-fill-logo">{gBrand ? <BrandLogo brand={gBrand} size={72} color="#fff" /> : <img src={gItem.iconData!} alt="" />}</span>
    </span>
  ) : undefined;
  const pcAction = !online ? (wake.configured
    ? <button type="button" className={`isl2-round${waking ? " busy" : ""}`} disabled={waking} onClick={() => void sendWake()} aria-label={t("PC einschalten")} title={t("PC einschalten")}><Power size={16} /></button>
    : conn.cloudLink !== "waiting" ? <button type="button" className="isl2-round" onClick={() => client.reconnectNow()} aria-label={t("Jetzt verbinden")} title={t("Jetzt verbinden")}><RefreshCw size={16} /></button> : undefined) : undefined;
  const pageOf = (id: string): LayoutPage => (L.home.some((x) => x.id === id) ? "home" : "dash");
  const saveL = (l: IslandLayout) => { void lay.saveLayout(l); };
  const ctx: TileCtx = {
    online, now, canUse: canMedia, open: (to) => setTab(to),
    mood, last: s.last?.text ?? null,
    np, media, accent: accentStyle,
    game: game ? { name: game.name, since: gameSince, cover: gCover, style: gStyle, logo: gameLogo } : null,
    controls: pcControls, weather, metrics,
    pc: { title: online ? t("Verbunden") : waking ? t("Startet …") : cview.short, sub: pcLine, action: pcAction },
    setOpt: (id, key, value) => saveL(setTileOpt(L, pageOf(id), id, key, value)),
    procs: online ? (k) => setProcs(k) : undefined,
  };

  /** The start page keeps its rich cards for JARVIS, the game, music, focus and the PC; every other kind is a tile. */
  const richCard = (tile: Tile): ReactNode => {
    switch (tile.type) {
      case "jarvis": return (
        <div className={`isl2-card jv m-${mood}`}>
          <button type="button" className="isl2-ctitle" onClick={() => setTab("jarvis")}>JARVIS</button>
          <span className={`isl2-spin${mood === "thinking" || mood === "listening" ? " on" : ""}`} aria-hidden><i /></span>
          <span className={`isl3-orb m-${mood}`} aria-hidden><i /><i /></span>
          <b className="isl2-big">{t(MOOD_LABEL[mood])}</b>
          <span className="isl2-sub ellipsis">{s.last && opt<boolean>(tile, "last") ? s.last.text : t("Tippen zum Fragen")}</span>
        </div>
      );
      case "game":
        if (!game) return opt<boolean>(tile, "idle") ? <IslandTile tile={tile} ctx={ctx} box={false} className="isl2-card" /> : null;
        return (
          <div className={`isl2-card gm${gCover || gItem ? " filled" : ""}`} style={gStyle}>
            {gCover ? <img className="isl2-fill" src={gCover} alt="" decoding="async" /> : gameLogo ?? null}
            <button type="button" className="isl2-ctitle" onClick={() => setTab("game")}>{t("Spiel")}</button>
            {gCover && gItem && (gBrand || gItem.iconData) && <span className="isl2-badge" aria-hidden>{gBrand ? <BrandLogo brand={gBrand} size={30} color="#fff" /> : <img src={gItem.iconData!} alt="" decoding="async" />}</span>}
            {!(gCover || gameLogo) && <span className="isl2-art" aria-hidden><Gamepad2 size={22} /></span>}
            <b className="isl2-big ellipsis" title={game.name}>{game.name}</b>
            <span className="isl2-sub ellipsis">{playTime(gameSince, now) ?? t("läuft")}</span>
          </div>
        );
      case "music": {
        const fill = musicFilled && opt<boolean>(tile, "cover");
        const skip = opt<boolean>(tile, "skip");
        return (
          <div className={`isl2-card mu${fill ? " filled" : ""}`} style={accentStyle}>
            {fill && <img className="isl2-fill" src={np!.cover!} alt="" key={np!.cover} decoding="async" />}
            <button type="button" className="isl2-ctitle" onClick={() => setTab("music")}>{t("Musik")}</button>
            {!fill && <span className="isl2-art" aria-hidden>{cover}</span>}
            {playing && <Bars level={0.4} />}
            <b className="isl2-big ellipsis" title={np?.title}>{np?.active ? np.title : t("Stille")}</b>
            <span className="isl2-sub ellipsis">{np?.active ? nowSub(np) : online ? t("Gerade läuft nichts") : t("PC nicht verbunden")}</span>
            {pos && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${pos.ratio})` }} /></span>}
            <span className="isl3-cardbtns">
              {skip && <button type="button" className="isl2-round sm" disabled={ctl} onClick={() => media("prev")} aria-label={t("Vorheriger Titel")}><SkipBack size={14} /></button>}
              <button type="button" className="isl2-round" disabled={ctl} onClick={() => media("playpause")} aria-label={t("Wiedergabe/Pause")}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
              {skip && <button type="button" className="isl2-round sm" disabled={ctl} onClick={() => media("next")} aria-label={t("Nächster Titel")}><SkipForward size={14} /></button>}
            </span>
          </div>
        );
      }
      case "focus": {
        const mins = opt<number>(tile, "minutes");
        return (
          <div className={`isl2-card fo${tm.pomo ? ` ph-${tm.pomo.phase}` : ""}`}>
            <button type="button" className="isl2-ctitle" onClick={() => setTab("focus")}>{t("Fokus")}</button>
            <b className="isl2-big isl2-time">{view ? clock(view.left) : `${mins}:00`}</b>
            <span className="isl2-sub">{timerSub}</span>
            {view && <span className="isl2-prog" aria-hidden><i style={{ transform: `scaleX(${view.progress})` }} /></span>}
            <button type="button" className="isl2-round" onClick={() => (view ? (view.paused ? resumeCountdown() : pauseCountdown()) : startCountdown(mins))} aria-label={view ? (view.paused ? t("Fortsetzen") : t("Pausieren")) : t("Fokus starten")}>{view && !view.paused ? <Pause size={16} /> : <Play size={16} />}</button>
          </div>
        );
      }
      case "pc": return (
        <div className={`isl2-card pc ${online ? "on" : "off"}`}>
          <button type="button" className="isl2-ctitle" onClick={() => setTab("pc")}>{t("PC")}</button>
          <span className="isl2-art" aria-hidden><Monitor size={22} /></span>
          <b className="isl2-big">{ctx.pc.title}</b>
          <span className="isl2-sub">{pcLine}</span>
          {pcAction}
        </div>
      );
      default: return <IslandTile tile={tile} ctx={ctx} box={false} className="isl2-card" />;
    }
  };

  /** While a page is edited every tile wiggles and gets its buttons: forward, settings, remove, back. */
  const tileWrap = (page: LayoutPage, tile: Tile, i: number, n: number, node: ReactNode) => {
    if (editing !== page) return node ? <Fragment key={tile.id}>{node}</Fragment> : null;
    const label = t(tileDef(tile.type).label);
    return (
      <div key={tile.id} className="isl3-ew" style={{ ["--i" as string]: i } as React.CSSProperties}>
        {node ?? <div className={`isl2-card isl3-ghost${page === "dash" ? " box" : ""}`}><b>{label}</b><span className="isl2-sub">{t("erscheint, sobald ein Spiel läuft")}</span></div>}
        <TileEditBar label={label} first={i === 0} last={i === n - 1}
          onMove={(by) => saveL(moveTile(L, page, tile.id, by))}
          onSettings={() => setSheet({ kind: "opts", id: tile.id })}
          onRemove={() => saveL(removeTile(L, page, tile.id))} />
      </div>
    );
  };
  const addTileBtn = (page: LayoutPage) => L[page].length < MAX_TILES[page] && (
    <button type="button" className={`isl3-addtile${page === "home" ? " card" : ""}`} onClick={() => setSheet({ kind: "add" })} aria-label={t("Kachel hinzufügen")}><Plus size={22} /><span>{t("Kachel")}</span></button>
  );
  const holdProps = { onPointerDown: (e: ReactPointerEvent) => { if (!(e.target as HTMLElement).closest("button, input, textarea, select, a")) holdStart(); }, onPointerUp: () => holdEnd(), onPointerLeave: () => holdEnd(), onPointerCancel: () => holdEnd() };
  const homeTiles = L.home.map((tile, i) => tileWrap("home", tile, i, L.home.length, richCard(tile))).filter(Boolean);
  const homeCards = (
    <div className={`isl2-cards${editing === "home" ? " editing" : ""}`} data-n={homeTiles.length} {...holdProps}>
      {homeTiles}
      {editing === "home" && addTileBtn("home")}
      {!homeTiles.length && editing !== "home" && <div className="isl2-empty"><LayoutGrid size={18} aria-hidden /><span>{t("Keine Kacheln – tippe auf den Stift, um welche hinzuzufügen.")}</span></div>}
    </div>
  );
  const dashTiles = (
    <div className={`isl3-dash${editing === "dash" ? " editing" : ""}`} data-n={L.dash.length} {...holdProps}>
      {L.dash.map((tile, i) => tileWrap("dash", tile, i, L.dash.length, <IslandTile tile={tile} ctx={ctx} box />))}
      {editing === "dash" && addTileBtn("dash")}
      {!L.dash.length && editing !== "dash" && <div className="isl2-empty"><LayoutGrid size={18} aria-hidden /><span>{t("Keine Kacheln – tippe auf den Stift, um welche hinzuzufügen.")}</span></div>}
    </div>
  );
  const editHead = (page: LayoutPage) => editing === page ? (
    <div className="isl3-edithead" role="toolbar" aria-label={t("Bearbeiten")}>
      <span className="isl3-ehtext"><b>{page === "home" ? t("Startseite bearbeiten") : t("Übersicht bearbeiten")}</b><i>{lay.canPc ? t("gilt für alle Geräte") : t("gilt nur für dieses Gerät")}</i></span>
      <button type="button" className="isl2-chip" onClick={() => setSheet({ kind: "tabs" })}>{t("Bereiche")}</button>
      <button type="button" className="isl2-chip" disabled={lay.source === "default"} onClick={() => void lay.reset()}>{t("Zurücksetzen")}</button>
      <button type="button" className="isl2-chip done" onClick={() => { setEditing(null); setSheet(null); }}>{t("Fertig")}</button>
    </div>
  ) : null;
  const sheetPage: LayoutPage = sheet?.kind === "opts" ? pageOf(sheet.id) : editing ?? (current === "dash" ? "dash" : "home");
  const sheetTile = sheet?.kind === "opts" ? L[sheetPage].find((x) => x.id === sheet.id) : undefined;
  const sheetTitle = !sheet ? "" : sheet.kind === "add" ? t("Kachel hinzufügen") : sheet.kind === "tabs" ? t("Bereiche in der Leiste") : sheet.kind === "color" ? t("Farbe & Effekt") : sheetTile ? t("{n} einstellen", { n: t(tileDef(sheetTile.type).label) }) : "";
  const sheetView = sheet && (
    <div className="isl3-sheet" role="dialog" aria-label={sheetTitle}>
      <div className="isl3-sheethead"><b>{sheetTitle}</b><button type="button" className="isl3-mini" onClick={() => setSheet(null)} aria-label={t("Schließen")}><X size={15} /></button></div>
      <div className="isl3-sheetbody">
        {sheet.kind === "add" && <TileCatalog have={L[sheetPage].map((x) => x.type)} full={L[sheetPage].length >= MAX_TILES[sheetPage]} onPick={(type) => { saveL(addTile(L, sheetPage, type)); setSheet(null); }} />}
        {sheet.kind === "opts" && sheetTile && <TileSettings tile={sheetTile} onChange={(k, v) => saveL(setTileOpt(L, sheetPage, sheetTile.id, k, v))} />}
        {sheet.kind === "tabs" && <TabsEditor tabs={L.tabs ?? visibleTabs(look.widgets, true)} onChange={(list) => saveL(setTabs(L, list))} />}
        {sheet.kind === "color" && <IslandColorPicker />}
        {sheet.kind !== "add" && sheet.kind !== "color" && <p className="tiny muted">{lay.canPc ? t("Wird am PC gespeichert und gilt für die Insel auf allen Geräten.") : t("Dieses Gerät darf die Einstellungen des PCs nicht ändern – die Änderung gilt nur hier.")}</p>}
      </div>
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
  const home = <div className="isl3-page">{editHead("home")}{homeCards}</div>;
  const dashPage = <div className="isl3-page">{editHead("dash")}{dashTiles}</div>;

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
          <button type="button" className={`isl2-round sm${lyrics ? " on" : ""}`} onClick={() => setLyrics((v) => !v)} aria-pressed={lyrics} aria-label={t("Liedtext")} title={t("Liedtext")}><ScrollText size={15} /></button>
          {np?.active && touch && (
            <button type="button" className="isl2-round sm" aria-label={t("Am Handy weiterhören")} title={t("Am Handy weiterhören – öffnet das Lied in Spotify bzw. YouTube; die Stelle im Lied wird nicht übernommen")}
              onClick={() => { if (np.playing && !ctl) media("playpause"); window.open(handoffUrl(np), "_blank", "noopener"); }}><Smartphone size={15} /></button>
          )}
        </div>
        <PcVolumeBar controls={pcControls} canUse={!ctl} press={media} />
      </div>
    </div>
  );
  const musicBody = lyrics ? <div className="isl3-mus2">{musicTab}<IslandLyrics np={np} now={now} /></div> : musicTab;

  // Game view: what runs, since when, the connection, and the controls that exist at the PC (overlay, recording, replay).
  const act = async (method: string, ok: string) => { try { const r = await client.call<{ message?: string }>(method, {}); toast(r?.message ? t(r.message) : ok, "success"); } catch (e) { toast((e as Error).message, "error"); } };
  const gm = metrics.m;
  const pctOf = (v: number | null | undefined) => (v == null ? (gm ? "n. v." : "–") : `${Math.round(v)} %`);
  const ramPct = gm?.memTotalBytes && gm.memUsedBytes != null ? (gm.memUsedBytes / gm.memTotalBytes) * 100 : null;
  const gameTab = game ? (
    <div className={`isl3-game${gCover || gameLogo ? " filled" : ""}`} style={gStyle}>
      <div className="isl3-gbg" aria-hidden>{gCover ? <img src={gCover} alt="" decoding="async" /> : gameLogo ?? null}</div>
      <div className="isl3-gtop">
        <span className="isl3-gicon" aria-hidden>{gItem?.iconData ? <img src={gItem.iconData} alt="" /> : gBrand ? <BrandLogo brand={gBrand} size={28} color="#fff" /> : <Gamepad2 size={26} />}</span>
        <div className="isl2-mtext">
          <b className="isl2-big ellipsis" title={game.name}>{game.name}</b>
          <span className="isl2-sub">{t("läuft seit {t}", { t: new Date(gameSince).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })} · {playTime(gameSince, now) ?? "–"}</span>
        </div>
        <span className={`isl3-pill ${online ? "ok" : "warn"}`}><i />{online ? t("PC verbunden") : t("PC nicht verbunden")}</span>
      </div>
      <div className="isl3-gstats" aria-label={t("Werte des PCs")}>
        <span><Cpu size={13} aria-hidden /><i>CPU</i><b>{pctOf(gm?.cpuPercent)}</b>{gm?.cpuTempC != null && <em>{Math.round(gm.cpuTempC)}°</em>}</span>
        <span><Gauge size={13} aria-hidden /><i>GPU</i><b>{pctOf(gm?.gpus?.[0]?.utilPercent)}</b>{gm?.gpus?.[0]?.tempC != null && <em>{Math.round(gm.gpus[0].tempC!)}°</em>}</span>
        <span><MemoryStick size={13} aria-hidden /><i>RAM</i><b>{pctOf(ramPct)}</b></span>
        <span><Gamepad2 size={13} aria-hidden /><i>FPS</i><b>{gm?.fpsStatus && /^\d/.test(gm.fpsStatus) ? gm.fpsStatus : gm ? "n. v." : "–"}</b></span>
      </div>
      <div className="isl2-actions">
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("overlay.toggle", t("Overlay umgeschaltet"))}><Layers size={17} />{t("Overlay")}</button>
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("capture.recordToggle", t("Aufnahme umgeschaltet"))}><Radio size={17} />{t("Aufnahme")}</button>
        <button type="button" className="isl2-act" disabled={ctl} onClick={() => void act("capture.replaySave", t("Replay gespeichert"))}><Star size={17} />{t("Replay")}</button>
      </div>
    </div>
  ) : <div className="isl2-empty"><Gamepad2 size={18} aria-hidden /><span>{t("Kein Spiel aktiv")}</span></div>;

  // Timer view: presets or your own minutes, the countdown with progress, pause and resume.
  const [custom, setCustom] = useState("");
  const focusTab = (
    <div className="isl2-focus">
      <div className={`isl2-tcard${view ? " running" : ""}${view?.paused ? " paused" : ""}`}>
        <div className="isl2-thead">
          <div className={`isl2-ring${view?.paused ? " paused" : ""}`} style={{ ["--p" as string]: view ? view.progress : 0 } as React.CSSProperties} aria-hidden><i /></div>
          <div className="isl2-ttext">
            <b className="isl2-time">{view ? clock(view.left) : "25:00"}</b>
            <span className="isl2-sub">{timerSub}{tm.pomo ? ` · ${tm.pomo.done} ✓` : ""}</span>
          </div>
          {view && (
            <div className="isl2-trun">
              <button type="button" className="isl2-round big" onClick={() => (view.paused ? resumeCountdown() : pauseCountdown())} aria-label={view.paused ? t("Fortsetzen") : t("Pausieren")}>{view.paused ? <Play size={18} /> : <Pause size={18} />}</button>
              <button type="button" className="isl2-chip" onClick={stopCountdown}>{t("Stopp")}</button>
            </div>
          )}
        </div>
        {view && (
          <div className="isl2-tchips more" role="group" aria-label={t("Zeit anpassen")}>
            {[1, 5, 10].map((m) => <button key={m} type="button" className="isl2-chip" onClick={() => addCountdown(m)}>+{m} min</button>)}
            <button type="button" className="isl2-chip" onClick={() => addCountdown(-1)} aria-label={t("Eine Minute weniger")}>−1 min</button>
          </div>
        )}
        {!view && (
          <>
            <div className="isl2-tchips">
              {[5, 15, 25, 45].map((m) => <button key={m} type="button" className="isl2-chip" onClick={() => startCountdown(m)}>{m} min</button>)}
            </div>
            <div className="isl2-trow">
              <button type="button" className="isl2-chip accent" title={t("25 min Fokus, 5 min Pause, nach vier Runden 15 min")} onClick={() => startPomodoro()}>{t("Pomodoro")}</button>
              <form className="isl2-custom" onSubmit={(e) => { e.preventDefault(); const m = Number(custom); if (m >= 1 && m <= 180) { startCountdown(m); setCustom(""); } }}>
                <input className="input" inputMode="numeric" value={custom} maxLength={3} placeholder={t("Eigene Minuten")} aria-label={t("Eigene Minuten")} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
                <button type="submit" className="isl2-chip" aria-label={t("Eigene Minuten starten")} disabled={!(Number(custom) >= 1 && Number(custom) <= 180)}>{t("Start")}</button>
              </form>
            </div>
          </>
        )}
      </div>
      {has("stopwatch") && <IslandStopwatch />}
    </div>
  );

  const ENGINE_LABEL: Record<string, string> = { smart: "Automatisch", openrouter: "OpenRouter", groq: "Groq", cerebras: "Cerebras", mistral: "Mistral", pollinations: "Pollinations", router: "Router", ollama: "Lokale KI", local: "Eingebaut" };
  const noAiHere = !online && consent === "no";
  const SUGGEST = online
    ? ["Wie warm ist meine GPU?", "Starte Spotify", "Wie wird das Wetter morgen?", "Erzähl mir einen Witz"]
    : ["Wie wird das Wetter morgen?", "Erzähl mir einen Witz", "Was ist 15 % von 80?"];
  const jarvisTab = (
    <div className="isl2-chat v3">
      <div className="isl2-answer grow">
        <div className="isl2-ahead">
          <span className="badge">{t(MOOD_LABEL[mood])}</span>
          {s.last && <button type="button" className="isl2-copy" aria-label={t("Antwort kopieren")} title={t("Antwort kopieren")}
            onClick={() => { void navigator.clipboard?.writeText(s.last!.text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }, () => toast(t("Kopieren nicht möglich"), "error")); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>}
        </div>
        {s.last
          ? <p className="isl-last">{s.last.text}</p>
          : (
            <div className="isl3-suggest">
              <span className={`isl3-orb big m-${mood}`} aria-hidden><i /><i /></span>
              <p className="isl2-sub">{t("Frag etwas oder tippe auf einen Vorschlag:")}</p>
              <div className="isl3-schips">{SUGGEST.map((x) => <button key={x} type="button" className="isl2-chip" disabled={noAiHere} onClick={() => void send(t(x))}>{t(x)}</button>)}</div>
            </div>
          )}
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
      {online && engineIds.some((id) => id !== "local" && id !== "auto") && (
        <div className="isl2-engines row" role="radiogroup" aria-label={t("Welche KI antwortet")}>
          {engineIds.filter((id) => id in ENGINE_LABEL).map((id) => (
            <button key={id} type="button" role="radio" aria-checked={engineNow === id} className={`isl2-chip${engineNow === id ? " on" : ""}`} onClick={() => setEngine(id)}>{t(ENGINE_LABEL[id])}</button>
          ))}
          <button type="button" role="radio" aria-checked={engineNow === "auto"} className={`isl2-chip${engineNow === "auto" ? " on" : ""}`} onClick={() => setEngine("auto")} title={t("Die Einstellung des PCs")}>{t("Standard")}</button>
        </div>
      )}
      <details className="isl2-more">
        <summary>{t("KI-Status, Zuständigkeiten und Hinweise")}</summary>
        <p className="tiny muted isl2-tip">{online ? t("Befehle („Starte WhatsApp“) erledigt der PC, Fragen beantwortet eine kostenlose KI – fällt eine aus, springt die nächste ein. Gesprochene Fragen werden laut beantwortet.") : t("Ohne PC: allgemeine Fragen beantwortet die freie KI ohne Konto (nur mit deinem Ja).")}</p>
        <AiRoster online={online} ai={aiv.data} compact selected={t(ENGINE_LABEL[engineNow] ?? "Standard")} />
        <AiTiles online={online} ai={aiv.data} />
      </details>
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
      {hist.length === 0 ? <div className="isl2-empty"><History size={18} aria-hidden /><span>{t("Noch nichts passiert.")}</span></div> : hist.slice(0, 8).map((h) => (
        <div key={h.id} className="isl2-note">
          <span className={`dot ${dot(h.level)}`} />
          <div className="isl2-ntext"><b className="ellipsis">{h.text}</b><span className="tiny muted">{relTime(h.at)}</span></div>
        </div>
      ))}
      <div className="isl2-hhead"><b>{t("Meldungen des PCs")}</b>{online && list.length > 0 && <button type="button" className="isl2-chip" onClick={() => void client.call("notifications.dismissAll", {}).then(() => inbox.reload(), () => undefined)}>{t("Alle löschen")}</button>}</div>
      {online && canManage && general.data && (
        <label className="isl2-dl">
          <span className="isl2-mii" aria-hidden><Download size={14} /></span>
          <span>{t("Fertige Downloads melden")}</span>
          <input type="checkbox" className="isl2-switch" checked={general.data.settings.downloadNotices !== false}
            onChange={(e) => { client.call("settings.save", { downloadNotices: e.target.checked }).then(() => general.reload(), (err: Error) => toast(err.message, "error")); }} />
        </label>
      )}
      {!online ? <div className="isl2-empty"><Monitor size={18} aria-hidden /><span>{pcLine}</span></div>
        : !inbox.loading && !list.length ? <div className="isl2-empty ok"><BellOff size={18} aria-hidden /><span>{t("Keine offenen Meldungen.")}</span></div>
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
      {!online && (
        <div className={`isl-card isl2-conn ${cview.tone}`} role="status">
          <span className="isl-ic"><Monitor size={18} /></span>
          <div className="isl-main">
            <b>{waking ? wakeLabel(wake, false, true).text : cview.short}</b>
            <span className="tiny muted">{waking ? t("Das dauert meist ein bis zwei Minuten – die Insel verbindet sich danach von selbst.") : cview.label}</span>
          </div>
          <div className="isl2-connbtns">
            {wake.configured && <button type="button" className="isl2-chip accent" disabled={waking} onClick={() => void sendWake()}><Power size={14} /> {waking ? t("Wird gestartet …") : t("PC einschalten")}</button>}
            {conn.cloudLink !== "waiting" && !waking && <button type="button" className="isl2-chip" onClick={() => client.reconnectNow()}><RefreshCw size={14} /> {t("Jetzt verbinden")}</button>}
          </div>
        </div>
      )}
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
      {has("volume") && (pcControls.data?.volume != null
        ? <div className="isl-card isl3-pcvol"><div className="isl-main"><b>{t("Lautstärke am PC")}</b><PcVolumeBar controls={pcControls} canUse={online && canMedia} press={media} /></div></div>
        : <IslandVolume enabled={online && canMedia} press={media} />)}
      {has("profile") && <IslandProfiles online={online} canLaunch={canMedia} />}
      {has("sounds") && <IslandSounds online={online} canPlay={canSound} />}
    </div>
  );

  const body: Record<IslandTab, ReactNode> = { home, game: gameTab, music: musicBody, jarvis: jarvisTab, apps: appsTab, inbox: inboxTab, pc: edit && canManage ? editor : pcTab, focus: focusTab, note: <IslandNote />,
    dash: dashPage,
    audio: <IslandAudio online={online} canUse={canMedia} canManage={canManage} controls={pcControls} sensors={sensors} />,
    controls: <IslandControls online={online} canUse={canMedia} controls={pcControls} sensors={sensors} now={now} press={media} />,
    system: <IslandSystem online={online} controls={pcControls} onDetails={online ? setProcs : undefined} /> };

  return (
    <div className="isl2" role="dialog" aria-label={t("JARVIS-Insel")}>
      <header className="isl2-head">
        {/* Like the closed island opens with a tap on its top, the open one closes with a tap on its top (eyes and date) – no menu needed. */}
        <button type="button" className="isl2-closeTap" aria-label={t("JARVIS-Insel schließen")} title={t("Tippen zum Schließen")} onClick={() => { islandTouch(); onClose(); }}>
          <IslandEyes mood={mood} />
        </button>
        <nav className="isl2-tabs has-thumb top" role="tablist" aria-label={t("Bereiche der Insel")} ref={tabsRef}>
          <span className="isl2-thumb" ref={thumbRef} aria-hidden="true" />
          {tabs.map((id) => {
            const m = TAB_META[id], on = id === current;
            return (
              <button key={id} type="button" role="tab" id={`isl2-tab-${id}`} aria-selected={on} aria-controls="isl2-panel" aria-label={t(m.label)} title={`${t(m.label)} (${tabs.indexOf(id) + 1})`}
                className={`isl2-tab${on ? " on" : ""}`} onClick={() => { if (id !== current) void goTab(id); }}><m.icon size={16} /></button>
            );
          })}
        </nav>
        <span className="isl2-status" title={new Date(now).toLocaleString([], { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}>
          {sensors.data?.micInUse && <span className="isl2-stat sens mic" role="img" aria-label={t("Mikrofon in Benutzung: {n}", { n: sensors.data.micApp ?? "?" })} title={t("Mikrofon in Benutzung: {n}", { n: sensors.data.micApp ?? "?" })}><Mic size={12} /></span>}
          {sensors.data?.cameraInUse && <span className="isl2-stat sens cam" role="img" aria-label={t("Kamera in Benutzung: {n}", { n: sensors.data.cameraApp ?? "?" })} title={t("Kamera in Benutzung: {n}", { n: sensors.data.cameraApp ?? "?" })}><Camera size={12} /></span>}
          {playing && <Bars level={0.4} />}
          {weather.w && <span className="isl2-stat" aria-label={t("Wetter: {n} Grad", { n: weather.w.temp })}><WeatherIcon code={weather.w.code} size={14} />{weather.w.temp}°</span>}
          {pcControls.data?.battery != null && <span className="isl2-stat" aria-label={t("Akku des PCs: {n} Prozent", { n: pcControls.data.battery })}>{pcControls.data.charging ? <BatteryCharging size={14} /> : <BatteryMedium size={14} />}{pcControls.data.battery}%</span>}
          <time className="isl2-clock" dateTime={new Date(now).toISOString()}>{new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </span>
        {(current === "home" || current === "dash") && editing !== current && (
          <button type="button" className="isl2-more isl3-pen" onClick={() => setEditing(current)} aria-label={current === "home" ? t("Startseite bearbeiten") : t("Übersicht bearbeiten")} title={t("Bearbeiten")}><Pencil size={15} /></button>
        )}
        <div className="isl2-moreWrap" ref={menuRef}>
          <button type="button" className="isl2-more" aria-haspopup="menu" aria-expanded={menu} aria-label={t("Mehr")} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={18} /></button>
          {(menu || menuShown) && (
            <div className={`isl2-menu${menu ? "" : " closing"}`} role="menu">
              <label className="isl2-mi" role="menuitemcheckbox" aria-checked={prefs.sound}>
                <span className="isl2-mii" aria-hidden><Volume2 size={15} /></span>
                <span className="isl2-mit">{t("Ton bei „fertig“ und Rückfragen")}</span>
                <input type="checkbox" className="isl2-switch" checked={prefs.sound} onChange={(e) => setIslandPrefs({ sound: e.target.checked })} />
              </label>
              <span className="isl2-msep" aria-hidden />
              <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setTab("home"); setEditing("home"); }}><span className="isl2-mii" aria-hidden><Pencil size={15} /></span><span className="isl2-mit">{t("Startseite bearbeiten")}</span></button>
              <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setTab("dash"); setEditing("dash"); }}><span className="isl2-mii" aria-hidden><LayoutDashboard size={15} /></span><span className="isl2-mit">{t("Übersicht bearbeiten")}</span></button>
              <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setSheet({ kind: "color" }); }}><span className="isl2-mii" aria-hidden><Palette size={15} /></span><span className="isl2-mit">{t("Farbe & Effekt")}</span></button>
              <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setSheet({ kind: "tabs" }); }}><span className="isl2-mii" aria-hidden><SlidersHorizontal size={15} /></span><span className="isl2-mit">{t("Bereiche anpassen")}</span></button>
              {canManage && <button type="button" role="menuitem" className="isl2-mi" onClick={() => { setMenu(false); setTab("pc"); setEdit(true); }}><span className="isl2-mii" aria-hidden><LayoutGrid size={15} /></span><span className="isl2-mit">{t("Widgets im Bereich PC")}</span></button>}
              {floating && <Link to="/assistant" role="menuitem" className="isl2-mi" onClick={onClose}><span className="isl2-mii" aria-hidden><MessageCircle size={15} /></span><span className="isl2-mit">{t("JARVIS öffnen")}</span></Link>}
              {floating && <Link to="/overlay-settings" role="menuitem" className="isl2-mi" onClick={onClose}><span className="isl2-mii" aria-hidden><Settings2 size={15} /></span><span className="isl2-mit">{t("Insel-Einstellungen")}</span></Link>}
              <button type="button" role="menuitem" className="isl2-mi" onClick={onClose}><span className="isl2-mii" aria-hidden><ChevronUp size={15} /></span><span className="isl2-mit">{t("Schließen")}</span></button>
            </div>
          )}
        </div>
      </header>
      <div className="isl2-stage">
        <div className={`isl2-body${slide ? " swipe-none" : ""}`} role="tabpanel" id="isl2-panel" aria-labelledby={`isl2-tab-${current}`} key={current} ref={bodyRef}
          onPointerDown={swipeDown} onPointerMove={swipeMove} onPointerUp={swipeUp} onPointerCancel={swipeCancel}
          onClickCapture={(e) => { if (Date.now() - swipedAt.current < 400) { e.preventDefault(); e.stopPropagation(); } }}>{body[current]}</div>
        {peek && <div className="isl2-body isl2-peek" aria-hidden ref={peekRef} {...({ inert: "" } as object)}>{body[peek]}</div>}
        {sheetView}
        {procs && <ProcSheet kind={procs} onKind={setProcs} onClose={() => setProcs(null)} canClose={canClosePrograms} />}
      </div>
    </div>
  );
}
