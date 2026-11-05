import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bot, Copy, Globe, Mic, MicOff, Plus, RefreshCw, Send, Settings2, Sparkles, Square, StepForward, Undo2, User } from "lucide-react";
import { client } from "../lib/rpc";
import { t } from "../lib/i18n";
import { toast, useCan, useConn, useRpc } from "../lib/hooks";
import { Banner, Button, Card, confirmDialog, PageHead, Switch } from "../components/ui";
import { AiManager } from "../components/ai-manager";
import { CHAT_KEY, emptyChat, formatCost, jarvisChips, offlineExamples, QUICK_COMMAND, readChat, setupChips, type AssistantAction, type AssistantReply, type ChatState } from "../lib/assistant";
import { openJarvis, setJarvisEnabled, useJarvis } from "../lib/jarvis-session";
import { speak, stopSpeaking } from "../lib/jarvis-voice";
import { consumeSpoken, markSpoken, useVoiceInput } from "../lib/island-voice";
import { cleanSpoken, voiceControl } from "../lib/voice-text";
import { plainAnswer } from "../lib/answer-text";
import { friendlyError } from "../lib/friendly-error";
import { JarvisHud } from "../components/jarvis-hud";
import { IslandSettingsCard } from "../components/island-settings";
import { SettingsDialog, type Status } from "../components/assistant-settings";
import { getPrefs, setPrefs } from "../lib/prefs";
import { navItems } from "../lib/nav";
import type { SetupOp } from "../lib/assistant-setup";
import type { LibraryItem } from "../lib/types";
import { getEntry, useJournal } from "../lib/journal";
import { readCache } from "../lib/offline-cache";
import type { Card as BingoCard } from "../lib/bingo";
import { chosenEngine, phaseText, setChosenEngine, setWebSwitch, webSwitch, type Cite, type Phase } from "../lib/research-chat";


const doneText = (kind: string) => ({
  launch: t("Wird gestartet"), sound: t("Sound läuft"), stopSounds: t("Alle Sounds gestoppt"), profile: t("Profil aktiviert"), quick: t("Wird ausgeführt"),
  goal: t("Ziel angelegt"), wish: t("Auf die Wunschliste gesetzt"), match: t("Match eingetragen"),
} as Record<string, string>)[kind] ?? t("Erledigt");

const BingoBoardLazy = lazy(() => import("../components/bingo-board").then((m) => ({ default: m.BingoBoard })));

/** A bingo made in the chat, playable right here (still the same card as on the bingo page). */
function ChatBingo({ id }: { id: string }) {
  const cards = useJournal<BingoCard>("bingo");
  const e = cards.find((c) => c.id === id);
  if (!e) return <span className="tiny muted">{t("Dieses Bingo wurde gelöscht.")}</span>;
  return <div className="as-bingo"><b className="small">{e.data.title}</b><BingoBoardLazy e={e} /></div>;
}

/** Games of the last loaded library (for "Für welches Spiel?" suggestions) – most recently added first. */
function readCacheNames(): string[] {
  return (readCache<{ items: LibraryItem[] }>("library.list")?.data.items ?? []).filter((x) => x.kind === "game" && !x.duplicateOf).map((x) => x.name).slice(0, 4);
}

/** The numbered sources under a researched answer – only pages really found; a clear line when no search ran. */
function Sources({ cites, info }: { cites: Cite[]; info?: AssistantReply["research"] }) {
  const searched = info?.searched !== false;
  const line = !searched ? t("Keine Internetsuche durchgeführt") : [info?.provider, info?.searches ? t("{n} Suche(n)", { n: info.searches }) : null].filter(Boolean).join(" · ");
  return (
    <details className="as-sources" open={cites.length > 0 && cites.length <= 3}>
      <summary><Globe size={14} aria-hidden /> {cites.length ? t("Quellen ({n})", { n: cites.length }) : t("Keine Quellen")}{line ? ` · ${line}` : ""}</summary>
      {cites.length > 0 && (
        <ol className="as-cites">
          {cites.map((c) => (
            <li key={c.n} value={c.n}>
              {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.title}</a> : <span>{c.title}</span>}
              <span className="tiny muted"> · {c.provider}{c.date ? ` · ${c.date}` : ""}</span>
              {c.quote && <div className="tiny muted as-quote">„{c.quote}“</div>}
            </li>
          ))}
        </ol>
      )}
      {(info?.others?.length ?? 0) > 0 && (
        <div className="tiny muted">{t("Weitere Treffer (nicht zitiert)")}: {info!.others!.map((c, i) => <span key={c.n}>{i > 0 && ", "}{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow">{c.title}</a> : c.title}</span>)}</div>
      )}
      {(info?.queries?.length ?? 0) > 0 && <div className="tiny muted">{t("Gesucht nach")}: {info!.queries!.map((q) => `„${q}“`).join(", ")}</div>}
      {(info?.errors?.length ?? 0) > 0 && <div className="tiny muted">⚠ {info!.errors.join(" · ")}</div>}
    </details>
  );
}

const AI_MODES = new Set(["claude", "ollama", "router", "openrouter", "groq", "pollinations", "free"]);

function Turn({ turn, onSuggest, onBingo, onLookup, onRegenerate, onContinue }: { turn: ChatState["turns"][number]; onSuggest: (text: string) => void; onBingo: (question: string, web: boolean, label: string) => void; onLookup: (question: string, ok: boolean, label: string, ai?: boolean, sources?: boolean) => void; /** Only on the last answer. */ onRegenerate?: () => void; onContinue?: () => void }) {
  const nav = useNavigate();
  const [done, setDone] = useState<Record<number, boolean>>({});
  // Settings before a set-up change, to undo it with one tap.
  const [before, setBefore] = useState<ReturnType<typeof getPrefs> | null>((turn.undo as ReturnType<typeof getPrefs> | undefined) ?? null);
  if (turn.role === "user") return <div className="as-turn me"><div className="as-bubble">{turn.text}</div><User size={18} aria-hidden /></div>;
  const r = turn.reply!;
  const run = async (a: AssistantAction, i: number) => {
    if (a.kind === "navigate" && a.path) { nav(a.path); return; }
    // A source or offer link (https only) – opened in a new tab, nothing else happens.
    if (a.kind === "openUrl" && typeof a.params?.url === "string" && /^https:\/\//.test(a.params.url)) { window.open(a.params.url, "_blank", "noopener,noreferrer"); return; }
    // Answer to "Soll ich im Internet nachsehen?" for a bingo.
    // "Freie KI ohne PC erlauben?" – the answer is kept on this device; "yes" asks the question again.
    if (a.kind === "messageOpen" && a.params) { void import("../lib/messaging").then((m) => { const url = m.messageLink(a.params!.app as import("../lib/messaging").Messenger, String(a.params!.text ?? ""), typeof a.params!.phone === "string" ? a.params!.phone : null); if (url.startsWith("https://")) window.open(url, "_blank", "noopener,noreferrer"); else if (/^(sms:|mailto:)/.test(url)) window.location.href = url; }); return; }
    if (a.kind === "freeAiChoice" && a.params) { setDone({ [i]: true }); void import("../lib/free-ai").then((m) => { m.setFreeAiConsent(a.params!.ok === true ? "yes" : "no"); if (a.params!.ok === true) onLookup(String(a.params!.question ?? ""), true, a.label); }); return; }
    if (a.kind === "aiAnswer" && a.params) { setDone({ [i]: true }); onLookup(String(a.params.question ?? ""), true, a.label, true); return; }
    if (a.kind === "lookupChoice" && a.params) { setDone({ [i]: true }); if (a.params.always === true) void import("../lib/web-lookup").then((m) => m.setWebPermission("always")); onLookup(String(a.params.question ?? ""), a.params.ok === true, a.label, false, a.params.sources === true); return; }
    if (a.kind === "bingoChoice" && a.params) { setDone({ [i]: true }); if (a.params.always === true) void import("../lib/bingo-chat").then((m) => m.setWebAlways(true)); onBingo(String(a.params.question ?? ""), a.params.web === true, a.label); return; }
    if (a.kind === "jarvisForget" && a.params) {
      const { forgetNow } = await import("../lib/jarvis-chat");
      setDone({ [i]: true });
      toast(forgetNow(String(a.params.about ?? "")), "success");
      return;
    }
    if (a.kind === "setup" && a.params) {
      const o = a.params as unknown as SetupOp;
      const { applySetup } = await import("../lib/assistant-setup");
      const prev = getPrefs();
      setPrefs((p) => applySetup(p, o, window.matchMedia("(max-width: 699px)").matches));
      if (o.op === "lang") client.call("settings.save", { language: o.value }).catch(() => {});
      setBefore(prev);
      setDone({ [i]: true });
      toast(t("Erledigt: {n}", { n: a.label }), "success");
      return;
    }
    if (!a.method) return;
    if (a.confirm && !(await confirmDialog(a.label + "?", t("Das wird jetzt auf deinem PC ausgeführt."), { ok: t("Ausführen") }))) return;
    try {
      await client.call(a.method, a.params ?? {});
      setDone((d) => ({ ...d, [i]: true }));
      toast(doneText(a.kind), "success");
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <div className="as-turn bot reply">
      <Bot size={18} aria-hidden />
      <div className="as-bubble">
        <div className="as-text">{AI_MODES.has(r.mode) ? plainAnswer(r.text) : r.text}</div>
        {turn.bingoId && <Suspense fallback={null}><ChatBingo id={turn.bingoId} /></Suspense>}
        {(r.actions.length > 0 || before) && (
          <div className="row as-actions">
            {r.actions.map((a, i) => (
              <Button key={i} size="sm" variant={a.kind === "navigate" ? "ghost" : "primary"} disabled={done[i]} onClick={() => run(a, i)}>{done[i] ? "✓ " : ""}{a.label}</Button>
            ))}
            {before && <Button size="sm" variant="ghost" icon={<Undo2 size={15} />} onClick={() => { const b = before; setPrefs(() => b); setBefore(null); setDone({}); toast(t("Rückgängig gemacht"), "info"); }}>{t("Rückgängig")}</Button>}
          </div>
        )}
        {r.cites && <Sources cites={r.cites} info={r.research} />}
        {r.suggestions.length > 0 && <div className="chips as-sugg">{r.suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => onSuggest(s.replace(/^Mehr zu: /, ""))}>{s}</button>)}</div>}
        {AI_MODES.has(r.mode) ? (
          // An AI answer shows only the answer – who answered and the sources are one tap away.
          <details className="tiny muted as-meta"><summary>{t("Woher kommt die Antwort?")}</summary>
          {r.mode === "claude" ? `${r.model ?? "Claude"}${r.costUsd != null ? " · " + formatCost(r.costUsd) : ""}` : r.mode === "ollama" ? `${r.model ?? "Ollama"} · ${t("0 €")}` : r.mode === "openrouter" || r.mode === "groq" || r.mode === "pollinations" ? `${({ openrouter: "OpenRouter", groq: "Groq", pollinations: "Pollinations" } as const)[r.mode]}${r.model ? " · " + r.model : ""} · ${t("kostenlos")}` : r.mode === "router" ? `${r.model ?? t("KI-Router")}${r.model?.endsWith(":free") ? " · " + t("kostenlos") : ""}` : r.mode === "free" ? `${t("Freie KI ohne PC")}${r.model ? " · " + r.model : ""} · ${t("0 €")}` : r.mode === "offline" ? t("Ohne PC · 0 €") : r.mode === "device" ? t("Auf diesem Gerät · 0 €") : r.model ? `${r.model} · ${t("0 €")}` : t("Lokal · 0 €")}
          {r.sources.length > 0 && " · " + t("Quelle: {s}", { s: r.sources.join(", ") })}
          </details>
        ) : (
        <div className="tiny muted as-meta">
          {r.mode === "claude" ? `${r.model ?? "Claude"}${r.costUsd != null ? " · " + formatCost(r.costUsd) : ""}` : r.mode === "ollama" ? `${r.model ?? "Ollama"} · ${t("0 €")}` : r.mode === "openrouter" || r.mode === "groq" || r.mode === "pollinations" ? `${({ openrouter: "OpenRouter", groq: "Groq", pollinations: "Pollinations" } as const)[r.mode]}${r.model ? " · " + r.model : ""} · ${t("kostenlos")}` : r.mode === "router" ? `${r.model ?? t("KI-Router")}${r.model?.endsWith(":free") ? " · " + t("kostenlos") : ""}` : r.mode === "free" ? `${t("Freie KI ohne PC")}${r.model ? " · " + r.model : ""} · ${t("0 €")}` : r.mode === "offline" ? t("Ohne PC · 0 €") : r.mode === "device" ? t("Auf diesem Gerät · 0 €") : r.model ? `${r.model} · ${t("0 €")}` : t("Lokal · 0 €")}
          {r.sources.length > 0 && " · " + t("Quelle: {s}", { s: r.sources.join(", ") })}
        </div>
        )}
        {!r.cancelled && !r.actions.some((a) => a.kind === "lookupChoice" || a.kind === "bingoChoice") && (
          <div className="row as-tools">
            <button type="button" className="as-tool" aria-label={t("Antwort kopieren")} title={t("Kopieren")} onClick={() => { void navigator.clipboard?.writeText(r.text).then(() => toast(t("Kopiert"), "success"), () => toast(t("Kopieren nicht möglich"), "error")); }}><Copy size={14} aria-hidden /> {t("Kopieren")}</button>
            {onRegenerate && <button type="button" className="as-tool" onClick={onRegenerate}><RefreshCw size={14} aria-hidden /> {t("Neu erzeugen")}</button>}
            {onContinue && <button type="button" className="as-tool" onClick={onContinue}><StepForward size={14} aria-hidden /> {t("Fortsetzen")}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

/** KI-Assistent: answers questions about the app and this PC, suggests actions as buttons. Runs on the PC (local) or with Claude. */
export default function Assistant() {
  const conn = useConn();
  const online = conn.auth === "ok" && conn.phase === "online";
  const canAdmin = useCan("admin");
  const st = useRpc<Status>("assistant.status", {}, ["assistant"]);
  const [chat, setChat] = useState<ChatState>(readChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  // Two areas: the conversation, and everything about the AIs (keys, order, models, island) – the chat stays uncluttered, the setup is one tap away.
  const tab: "chat" | "ai" = params.get("tab") === "ai" ? "ai" : "chat";
  const setTab = (v: "chat" | "ai") => { const n = new URLSearchParams(params); if (v === "ai") n.set("tab", "ai"); else n.delete("tab"); setParams(n, { replace: true }); };
  const jv = useJarvis();
  const navTo = useNavigate();
  // The AI chosen for this chat (only the ones set up at the PC are offered) and the switch "Im Internet suchen".
  const [engine, setEngine] = useState(chosenEngine);
  const [web, setWeb] = useState(webSwitch);
  // Running request: its id (for "Abbrechen"), the phase and the text Claude is writing right now.
  const running = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [live, setLive] = useState("");
  useEffect(() => client.on("assistant.progress", (d) => {
    const x = d as { requestId?: string; phase?: Phase; text?: string | null };
    if (!x.requestId || x.requestId !== running.current) return;
    if (x.phase) setPhase(x.phase);
    if (x.phase === "writing" && x.text) setLive((v) => (v + x.text).slice(-4000));
  }), []);
  // Opening this page starts the JARVIS session (if switched on) – it lasts while this tab is open.
  useEffect(() => { openJarvis(); }, [online]);

  useEffect(() => { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat)); } catch { /* private mode */ } end.current?.scrollIntoView({ block: "end" }); }, [chat]);

  const ask = async (q: string, extra: { bingoWeb?: boolean; lookup?: boolean; ai?: boolean; sources?: boolean; shown?: string; research?: boolean } = {}) => {
    const question = q.trim();
    // A command ("Starte …", "Mach leiser") is not held up by a slow AI answer that is still on its way: it runs next to it.
    const side = busy && QUICK_COMMAND.test(question);
    if (!question || (busy && !side)) return;
    setText("");
    setChat((c) => ({ ...c, turns: [...c.turns, { role: "user", text: extra.shown ?? question }] }));
    const requestId = "r" + Math.random().toString(36).slice(2, 12);
    if (!side) { setBusy(true); running.current = requestId; setPhase(null); setLive(""); }
    // A cancelled request may still answer later – that answer is dropped.
    const add = (reply: AssistantReply, more: Partial<ChatState["turns"][number]> = {}, conversationId?: string | null) => {
      if (!side && running.current !== requestId) return false;
      setChat((c) => ({ conversationId: conversationId ?? c.conversationId, turns: [...c.turns, { role: "bot", reply, ...more }] }));
      if (consumeSpoken()) speak(reply.text, undefined, true);       // a spoken question is answered aloud
      return true;
    };
    const eng = online ? engine : "auto";
    try {
      // "Schreib bei WhatsApp: …": the text is prepared and the messenger opens with ONE tap (the recipient is chosen there; nothing is sent here).
      const { parseMessageCommand, MESSENGERS } = await import("../lib/messaging");
      const msg = parseMessageCommand(question);
      if (msg) {
        const app = msg.app ?? "whatsapp";
        const name = MESSENGERS.find((m) => m.id === app)?.label ?? "WhatsApp";
        add({ text: msg.body ? t("Die Nachricht ist vorbereitet. Tippe auf „In {a} öffnen“ – dort wählst du den Empfänger und sendest selbst. Diese App schickt nichts selbst.", { a: name }) : t("Was soll in der Nachricht stehen? Schreib zum Beispiel: „Schreib bei WhatsApp: Bin gleich da“. Oder nutze die Karte „Nachricht schreiben“ in der Insel (Reiter Apps)."),
          actions: msg.body ? [{ kind: "messageOpen", label: t("In {a} öffnen", { a: name }), params: { app, text: msg.body, phone: msg.phone } }] : [], sources: [t("Nachricht schreiben")], suggestions: [], mode: "device" });
        return;
      }
      // The chat builds on itself: right after a bingo, "es soll mittel sein und ich bin Impostor" changes that card
      // (not a web lookup and not split into JARVIS steps). Also after "im Internet nachsehen?" for such a change.
      const lastBot = [...chat.turns].reverse().find((x) => x.role === "bot");
      const lastBingo = [...chat.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
      const afterBingo = !!lastBot?.bingoId || (extra.bingoWeb !== undefined && !!lastBingo);
      if (afterBingo && lastBingo) {
        const { isBingoFollowUp } = await import("../lib/bingo");
        if (isBingoFollowUp(question)) {
          const { bingoFromChat } = await import("../lib/bingo-chat");
          const b = await bingoFromChat(question, lastBingo, { online, provider: online ? st.data?.bingoProvider ?? null : null, web: extra.bingoWeb });
          if (add(b.reply, { bingoId: b.bingoId }) && jv.enabled) speak(b.reply.text);
          return;
        }
      }
      // The decision before every answer: research (B) and "which game?" (clarify) here; the rest as before.
      const { routeQuestion, research, clarifyReply, chatContext } = await import("../lib/research-chat");
      const { coachIntent } = await import("../lib/game-coach");
      // Messages in one chat build on each other: the game from before and the last turns go along.
      const ctx = chatContext(chat.turns, (id) => getEntry<BingoCard>(id)?.data.gameName ?? null);
      const route = extra.research ? { ...routeQuestion(question, { force: true, contextGame: ctx.game }), kind: "research" as const } : routeQuestion(question, { force: web, coach: !!coachIntent(question), contextGame: ctx.game });
      if (route.kind === "clarify") {
        const lib = readCacheNames();
        add(clarifyReply(question, lib));
        return;
      }
      if (route.kind === "research" && extra.lookup !== false) {
        const { webPermission } = await import("../lib/web-lookup");
        const perm = webPermission();
        // Going online needs the user's yes – the switch "Im Internet suchen" or "Such im Internet …" is that yes.
        if (!route.force && !extra.lookup && perm !== "always") {
          if (perm === "never") { add({ text: t("Das bräuchte aktuelle Infos aus dem Internet – nachsehen ist ausgeschaltet (JARVIS → Stimme & Ton). Ohne Suche kann ich das nicht verlässlich beantworten."), actions: [], sources: [], suggestions: [], mode: "device" }); return; }
          add({ text: t("Dafür brauche ich aktuelle Infos. Darf ich im Internet nachsehen? Gesendet wird nur deine Frage – an die Websuche am PC (falls eingerichtet) bzw. an offene Wikis und offizielle Patchnotes."), actions: [
            { kind: "lookupChoice", label: t("Ja, nachsehen"), params: { question, ok: true } },
            { kind: "lookupChoice", label: t("Ja, immer erlauben"), params: { question, ok: true, always: true } },
            { kind: "lookupChoice", label: t("Nein"), params: { question, ok: false } },
          ], sources: [], suggestions: [], mode: "device" });
          return;
        }
        const r = await research(question, { pc: online ? { call: (m, p) => client.call(m, p) } : null, webSearch: !!st.data?.webSearch, route, requestId, engine: eng, onPhase: setPhase, history: ctx.history });
        add(r);
        return;
      }
      if (jv.enabled) {
        // JARVIS: understands the request, runs named gaming actions and website changes directly, reports the real result.
        const { jarvisAsk } = await import("../lib/jarvis-chat");
        const previousBingo = [...chat.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
        const r = await jarvisAsk(question, { online, conversationId: chat.conversationId, previousBingo, bingoProvider: st.data?.bingoProvider ?? null, bingoWeb: extra.bingoWeb, lookup: extra.lookup, ai: extra.ai, sources: extra.sources, engine: eng, requestId, contextGame: ctx.game });
        if (!add(r.reply, { bingoId: r.bingoId, undo: r.undo }, r.conversationId)) return;
        speak(r.reply.text);
        if (r.navigate) navTo(r.navigate);
        return;
      }
      // Setting up this device ("Mach das Design hell", "Pack das Deck in die Leiste") is answered here – with or without the PC.
      const { setupReply } = await import("../lib/assistant-setup");
      const setup = setupReply(question, getPrefs(), navItems());
      if (setup) { setChat((c) => ({ ...c, turns: [...c.turns, { role: "bot", reply: setup }] })); return; }
      // Bingo ("Erstelle ein 4×4-Bingo für Minecraft auf mittel"): made here, tasks from the PC's AI or the catalog.
      const previousBingo = [...chat.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
      const { isBingoRequest } = await import("../lib/bingo");
      if (isBingoRequest(question, !!previousBingo)) {
        const { bingoFromChat } = await import("../lib/bingo-chat");
        const b = await bingoFromChat(question, previousBingo, { online, provider: online ? st.data?.bingoProvider ?? null : null, web: extra.bingoWeb });
        setChat((c) => ({ ...c, turns: [...c.turns, { role: "bot", reply: b.reply, bingoId: b.bingoId }] }));
        return;
      }
      if (!online) {
        // Without a PC: the help built into the app answers right here in the browser (no internet, 0 €).
        const [{ answerOffline }, lib] = await Promise.all([import("../lib/assistant-offline"), client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }))]);
        let r = answerOffline(question, { library: lib.items ?? [], paired: !!client.credentials });
        // Not a question about the app: a general question goes to the free AI (only with this device's yes – asked once).
        if (r.unsure) { const { freeAiAnswer } = await import("../lib/free-ai-chat"); r = await freeAiAnswer(question, chat.turns.map((x) => ({ role: x.role, text: x.role === "user" ? x.text ?? "" : x.reply?.text ?? "" })).filter((x) => x.text), r, (s) => setLive(t("Der kostenlose Dienst erlaubt nur etwa eine Antwort alle 45 Sekunden – ich warte {s} s …", { s }))); }
        setChat((c) => ({ ...c, turns: [...c.turns, { role: "bot", reply: r }] }));
        return;
      }
      const r = await client.call<{ conversationId: string; reply: AssistantReply }>("assistant.ask", { conversationId: chat.conversationId, text: question, engine: eng, requestId });
      add(r.reply, {}, r.conversationId);
    } catch (e) {
      // The real error (key, limit, timeout, no connection) – never a made-up answer instead.
      add({ text: friendlyError(e), actions: [], sources: [], suggestions: [], mode: "local" });
    } finally {
      if (!side && running.current === requestId) { running.current = null; setBusy(false); setPhase(null); setLive(""); }
    }
  };

  /** Stops the running answer: the PC cancels the request (Claude/free AI/search), a late answer is dropped. */
  const cancel = () => {
    const id = running.current;
    if (!id) return;
    running.current = null;
    if (online) client.call("assistant.cancel", { requestId: id }).catch(() => {});
    setChat((c) => ({ ...c, turns: [...c.turns, { role: "bot", reply: { text: t("⏹ Abgebrochen – die Anfrage wurde gestoppt."), actions: [], sources: [], suggestions: [], mode: "device", cancelled: true } }] }));
    setBusy(false); setPhase(null); setLive("");
  };
  const lastUser = [...chat.turns].reverse().find((x) => x.role === "user")?.text ?? null;
  const lastBot = chat.turns.length - 1;

  // Opened from the search (Ctrl+K → "Assistent fragen …").
  useEffect(() => {
    const q = params.get("q");
    if (q) { setParams({}, { replace: true }); void ask(q); }
  }, [online, params]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    if (chat.conversationId) client.call("assistant.reset", { conversationId: chat.conversationId }).catch(() => {});
    setChat(emptyChat());
  };

  // Speaking: the same recognition as in the island – the sentence is cleaned like a typed one, "Stopp" quietens the voice, the answer is read aloud.
  const voice = useVoiceInput((said) => {
    const ctl = voiceControl(said);
    if (ctl) { stopSpeaking(); return; }
    const cleaned = cleanSpoken(said);
    if (cleaned) { markSpoken(); void ask(cleaned); }
  }, (m) => toast(t(m), "error"));
  const listening = voice.listening;
  const toggleMic = () => { stopSpeaking(); voice.toggle(); };

  const s = st.data;
  return (
    <div className="as-page">
      <PageHead eyebrow={t("Gaming-Assistent")} title="JARVIS"
        text={jv.enabled ? t("Sag oder schreib mir, was ich tun soll – ich starte Spiele, stelle Profile ein, ordne deine Website und untersuche Ruckler. Nur Gaming, nur auf deinen Auftrag.") : s?.claudeReady ? t("Frag alles zu deinem PC, deinen Spielen und der App. Antworten kommen von Claude – Befehle erledigt der lokale Assistent kostenlos.") : s?.mode === "ollama" ? t("Frag alles zu deinem PC, deinen Spielen und der App. Alles läuft auf deinem PC – 0 €, ohne Konto.") : t("Frag alles zu deinem PC, deinen Spielen und der App. Der lokale Assistent läuft auf deinem PC – ohne Internet und kostenlos.")}
        actions={<>
          <span className={`badge ${jv.active ? "ok" : ""}`} title={t("Nur solange diese Seite offen ist und JARVIS an ist. Ohne Auftrag tut JARVIS nichts.")}>{jv.active ? t("JARVIS aktiv") : jv.enabled ? (online ? t("JARVIS verbindet …") : t("JARVIS ohne PC")) : t("JARVIS aus")}</span>
          {s && <span className={`badge ${s.claudeReady ? "accent" : "ok"}`}>{s.claudeReady ? s.models.find((m) => m.id === s.model)?.label ?? "Claude" : s.mode === "smart" ? t("Automatisch · 0 €") : s.mode === "ollama" ? t("Lokale KI · 0 €") : s.mode === "router" && s.router?.ready ? t("KI-Router · {m}", { m: s.router.models[0] }) : t("Lokal · 0 €")}</span>}
          <Button icon={<Plus size={16} />} onClick={reset} disabled={chat.turns.length === 0}>{t("Neues Gespräch")}</Button>
          {canAdmin && s && <Button icon={<Settings2 size={16} />} onClick={() => setSettings(true)}>{t("Einrichten")}</Button>}
        </>} />
      <div className="as-tabs" role="tablist" aria-label={t("Bereich")}>
        <button type="button" role="tab" aria-selected={tab === "chat"} className={`as-tab${tab === "chat" ? " on" : ""}`} onClick={() => setTab("chat")}>{t("Gespräch")}</button>
        <button type="button" role="tab" aria-selected={tab === "ai"} className={`as-tab${tab === "ai" ? " on" : ""}`} onClick={() => setTab("ai")}>{t("KI & Einstellungen")}</button>
      </div>
      {tab === "chat" && (<>
      {jv.enabled && <JarvisHud busy={busy} listening={listening} active={jv.active} online={online} onPick={(x) => setText(x)} />}
      <Card className="jv-toggle">
        <Switch checked={jv.enabled} onChange={setJarvisEnabled} label={t("JARVIS führt Aufträge direkt aus")}
          hint={jv.enabled ? t("Was du ausdrücklich nennst, wird sofort erledigt und geprüft (Spiel starten, Profil, Sound, Website ordnen). Löschen, Energie und Unklares nur nach Rückfrage. Endet, wenn du ausschaltest oder die Website schließt – laufende Spiele bleiben offen.") : t("Aus: Ich schlage Aktionen nur als Knopf vor, ausgeführt wird erst nach deinem Tippen.")} />
      </Card>
      {!online && <Banner kind="info" title={t("Ohne PC: Hilfe-Modus")}>{t("Ich richte die App für dich ein (Design, Leiste, Home, Sprache), beantworte Fragen zur App, öffne Seiten und kenne deine zuletzt geladene Bibliothek und den Backlog – direkt auf diesem Gerät. Allgemeine Fragen beantwortet die freie KI ohne Konto – nur mit deinem Ja, dann geht deine Frage an Pollinations. Live-Werte und Starten gehen erst mit dem PC.")}</Banner>}

      <Card className="as-chat">
        <div className="as-log" aria-live="polite">
          {chat.turns.length === 0 && (
            <div className="as-empty">
              <Sparkles size={28} aria-hidden />
              <p>{jv.enabled ? t("Ich bin JARVIS, dein Gaming-Assistent. Ich kenne jede Seite der App, deine Bibliothek, Sounds, Profile und die Live-Werte deines PCs – und erledige, was du mir sagst. Auch mehrere Schritte: „Öffne Discord und starte dann Minecraft“.") : t("Ich kenne jede Seite der App, deine Bibliothek, Sounds, Profile und die Live-Werte deines PCs. Aktionen schlage ich als Knopf vor – ausgeführt wird erst, wenn du tippst.")}</p>
              <div className="chips">{(jv.enabled ? jarvisChips() : online ? [...(s?.examples ?? []).slice(0, 4), ...setupChips()] : offlineExamples()).map((e) => <button key={e} type="button" className="chip" onClick={() => ask(e)}>{e}</button>)}</div>
            </div>
          )}
          {chat.turns.map((turn, i) => <Turn key={i} turn={turn} onSuggest={(x) => void ask(x)} onBingo={(q, web, label) => void ask(q, { bingoWeb: web, shown: label })} onLookup={(q, ok, label, ai, sources) => void ask(q, { lookup: ok, ai, sources, shown: label })}
            onRegenerate={i === lastBot && !busy && lastUser && turn.role === "bot" ? () => void ask(lastUser, { shown: t("↻ {q}", { q: lastUser }) }) : undefined}
            onContinue={i === lastBot && !busy && turn.role === "bot" && online ? () => void ask(t("Mach bitte genau da weiter, wo deine letzte Antwort aufgehört hat.")) : undefined} />)}
          {busy && (
            <div className="as-turn bot">
              <Bot size={18} aria-hidden />
              <div className="as-bubble" aria-live="polite">
                {live ? <div className="as-text">{live}</div> : <div className="as-typing" aria-hidden><i /><i /><i /></div>}
                <div className="row as-progress">
                  <span className="tiny muted">{phaseText(phase)}</span>
                  <Button size="sm" variant="ghost" icon={<Square size={13} />} onClick={cancel}>{t("Abbrechen")}</Button>
                </div>
              </div>
            </div>
          )}
          <div ref={end} />
        </div>
        <div className="row as-options">
          {online && (s?.engines?.length ?? 0) > 1 && (
            <label className="as-engine">
              <span className="tiny muted">{t("KI")}</span>
              <select className="input" value={s!.engines!.some((x) => x.id === engine) ? engine : "auto"} aria-label={t("KI-Modell für diesen Chat")} onChange={(e) => { setEngine(e.target.value); setChosenEngine(e.target.value); }}>
                {s!.engines!.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </label>
          )}
          <button type="button" className={`chip ${web ? "on" : ""}`} aria-pressed={web} title={s?.webSearch ? t("Claude-Websuche am PC (kostet pro Suche)") : online ? t("Offene Wikis + offizielle Patchnotes, zusammengefasst von der KI am PC") : t("Ohne PC: nur offene Wikis")} onClick={() => { setWeb(!web); setWebSwitch(!web); }}><Globe size={14} aria-hidden /> {t("Im Internet suchen")}</button>
        </div>
        <form className="as-input" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
          <input className="input" value={voice.listening ? voice.interim : text} readOnly={voice.listening} maxLength={2000} placeholder={voice.listening ? t("Ich höre zu …") : jv.enabled ? t("Dein Auftrag an JARVIS, z. B. „Starte Minecraft und aktiviere mein Minecraft-Profil“") : t("Frag etwas oder gib einen Befehl, z. B. „Starte Rocket League“")} aria-label={t("Nachricht an den Assistenten")} onChange={(e) => setText(e.target.value)} />
          {voice.supported && <Button variant="ghost" icon={listening ? <MicOff size={18} /> : <Mic size={18} />} aria-label={listening ? t("Zuhören beenden") : t("Spracheingabe")} aria-pressed={listening} onClick={toggleMic} />}
          <Button type="submit" variant="primary" icon={<Send size={16} />} disabled={!text.trim() || (busy && !QUICK_COMMAND.test(text.trim()))} aria-label={t("Senden")} />
        </form>
      </Card>
      </>)}
      {tab === "ai" && (<>
      {online && <IslandSettingsCard />}
      <Card title={t("KI-Verwaltung – kostenlose KI")}>
        <AiManager online={online} onChanged={() => st.reload()} />
      </Card>
      </>)}
      {settings && s && <SettingsDialog st={s} onClose={() => setSettings(false)} />}
    </div>
  );
}
