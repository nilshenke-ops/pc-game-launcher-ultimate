// ONE JARVIS: the brain behind the chat on the assistant page AND the island. Both ask here, so a question is understood the same way
// everywhere (research, bingo, setup of the website, the PC's assistant, the free AIs without a PC) and the same AIs/keys answer.
// Where the answer is shown is the caller's business (hooks): the page puts it into its chat, the island shows it in its card.
import { client } from "./rpc";
import { t } from "./i18n";
import { getPrefs } from "./prefs";
import { navItems } from "./nav";
import { getEntry } from "./journal";
import { readCache } from "./offline-cache";
import { jarvisEnabled } from "./jarvis-session";
import type { AssistantReply, ChatState } from "./assistant";
import type { LibraryItem } from "./types";
import type { Card as BingoCard } from "./bingo";
import type { Phase } from "./research-chat";

/** Games of the last loaded library (for "Für welches Spiel?" suggestions) – most recently added first. */
export function readCacheNames(): string[] {
  return (readCache<{ items: LibraryItem[] }>("library.list")?.data.items ?? []).filter((x) => x.kind === "game" && !x.duplicateOf).map((x) => x.name).slice(0, 4);
}

export interface JarvisEnv {
  online: boolean;
  /** AI chosen for this question ("auto" = the PC decides). */
  engine: string;
  /** The switch "Im Internet suchen". */
  web: boolean;
  /** Does the PC have a web search set up? */
  webSearch: boolean;
  bingoProvider: string | null;
  conversationId: string | null;
  /** The chat so far (follow-up questions, the game talked about before). */
  turns: ChatState["turns"];
  requestId: string;
  /** Typed or spoken by the person right now (the island): named commands run at once. */
  direct?: boolean;
}
export interface JarvisExtra { bingoWeb?: boolean; lookup?: boolean; ai?: boolean; sources?: boolean; research?: boolean }
export interface JarvisHooks {
  /** Shows an answer; false = it is no longer wanted (cancelled) – then nothing else happens. */
  add(reply: AssistantReply, more?: Partial<ChatState["turns"][number]>, conversationId?: string | null): boolean;
  speak(text: string): void;
  navigate(path: string): void;
  setPhase(p: Phase): void;
  /** Text to show while waiting (a pause of the free service). */
  setLive?(text: string): void;
}

export async function askJarvis(question: string, env: JarvisEnv, extra: JarvisExtra, hooks: JarvisHooks): Promise<void> {
  const add = hooks.add;
    const lastBot = [...env.turns].reverse().find((x) => x.role === "bot");
    const lastBingo = [...env.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
    const afterBingo = !!lastBot?.bingoId || (extra.bingoWeb !== undefined && !!lastBingo);
    if (afterBingo && lastBingo) {
      const { isBingoFollowUp } = await import("../lib/bingo");
      if (isBingoFollowUp(question)) {
        const { bingoFromChat } = await import("../lib/bingo-chat");
        const b = await bingoFromChat(question, lastBingo, { online: env.online, provider: env.online ? env.bingoProvider : null, web: extra.bingoWeb });
        if (add(b.reply, { bingoId: b.bingoId }) && jarvisEnabled()) hooks.speak(b.reply.text);
        return;
      }
    }
    // The decision before every answer: research (B) and "which game?" (clarify) here; the rest as before.
    const { routeQuestion, research, clarifyReply, chatContext } = await import("../lib/research-chat");
    const { coachIntent } = await import("../lib/game-coach");
    // Messages in one chat build on each other: the game from before and the last turns go along.
    const ctx = chatContext(env.turns, (id) => getEntry<BingoCard>(id)?.data.gameName ?? null);
    const route = extra.research ? { ...routeQuestion(question, { force: true, contextGame: ctx.game }), kind: "research" as const } : routeQuestion(question, { force: env.web, coach: !!coachIntent(question), contextGame: ctx.game });
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
      const r = await research(question, { pc: env.online ? { call: (m, p) => client.call(m, p) } : null, webSearch: env.webSearch, route, requestId: env.requestId, engine: env.engine, onPhase: hooks.setPhase, history: ctx.history });
      add(r);
      return;
    }
    if (jarvisEnabled()) {
      // JARVIS: understands the request, runs named gaming actions and website changes directly, reports the real result.
      const { jarvisAsk } = await import("../lib/jarvis-chat");
      const previousBingo = [...env.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
      const r = await jarvisAsk(question, { online: env.online, conversationId: env.conversationId, previousBingo, bingoProvider: env.bingoProvider, bingoWeb: extra.bingoWeb, lookup: extra.lookup, ai: extra.ai, sources: extra.sources, engine: env.engine, requestId: env.requestId, contextGame: ctx.game, direct: env.direct });
      if (!add(r.reply, { bingoId: r.bingoId, undo: r.undo }, r.conversationId)) return;
      hooks.speak(r.reply.text);
      if (r.navigate) hooks.navigate(r.navigate);
      return;
    }
    // Setting up this device ("Mach das Design hell", "Pack das Deck in die Leiste") is answered here – with or without the PC.
    const { setupReply } = await import("../lib/assistant-setup");
    const setup = setupReply(question, getPrefs(), navItems());
    if (setup) { add(setup); return; }
    // Bingo ("Erstelle ein 4×4-Bingo für Minecraft auf mittel"): made here, tasks from the PC's AI or the catalog.
    const previousBingo = [...env.turns].reverse().find((x) => x.bingoId)?.bingoId ?? null;
    const { isBingoRequest } = await import("../lib/bingo");
    if (isBingoRequest(question, !!previousBingo)) {
      const { bingoFromChat } = await import("../lib/bingo-chat");
      const b = await bingoFromChat(question, previousBingo, { online: env.online, provider: env.online ? env.bingoProvider : null, web: extra.bingoWeb });
      add(b.reply, { bingoId: b.bingoId });
      return;
    }
    if (!env.online) {
      // Without a PC: the help built into the app answers right here in the browser (no internet, 0 €).
      const [{ answerOffline }, lib] = await Promise.all([import("../lib/assistant-offline"), client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }))]);
      let r = answerOffline(question, { library: lib.items ?? [], paired: !!client.credentials });
      // Not a question about the app: a general question goes to the free AI (only with this device's yes – asked once).
      if (r.unsure) { const { freeAiAnswer } = await import("../lib/free-ai-chat"); r = await freeAiAnswer(question, env.turns.map((x) => ({ role: x.role, text: x.role === "user" ? x.text ?? "" : x.reply?.text ?? "" })).filter((x) => x.text), r, (s) => hooks.setLive?.(t("Der kostenlose Dienst erlaubt nur etwa eine Antwort alle 45 Sekunden – ich warte {s} s …", { s }))); }
      add(r);
      return;
    }
    const r = await client.call<{ conversationId: string; reply: AssistantReply }>("assistant.ask", { conversationId: env.conversationId, text: question, engine: env.engine, requestId: env.requestId, ...(env.direct ? { direct: true } : {}) });
    add(r.reply, {}, r.conversationId);
}
