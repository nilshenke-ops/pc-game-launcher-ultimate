// JARVIS Gaming – one request from the chat: split into steps, each step answered by the fastest fitting part
// (website change → this device, bingo → bingo maker, everything else → the PC's assistant), named actions run
// directly with a checked result. Stops at the first failed step and says so. Without JARVIS switched on, this is
// not used – the page then works like before (buttons only).

import { client } from "./rpc";
import { t } from "./i18n";
import { commitPreview, discardPreview, getPrefs, getPreview, previewTheme, restoreOriginalDesign, setPrefs, undoDesign } from "./prefs";
import type { Prefs } from "./prefs-core";
import { navItems } from "./nav";
import type { AssistantAction, AssistantReply } from "./assistant";
import { codeRequest, offTopic, siteIntent, splitSteps } from "./jarvis";
import { runAuto, runSite, type StepResult } from "./jarvis-run";
import { ensureJarvis } from "./jarvis-session";
import { forget, lastLog, logDone, logPageId, memoryIntent, memoryPageId, noteOpenQuestion, recall, remember, type MemoryIntent } from "./jarvis-memory";
import type { LibraryItem } from "./types";

export interface JarvisStep { text: string; ok: boolean | null }
export interface JarvisTurn { reply: AssistantReply; steps: JarvisStep[]; undo?: Prefs; navigate?: string; conversationId?: string | null; bingoId?: string }

const OFF_TOPIC = () => t("Ich bin JARVIS Gaming – ich kümmere mich nur um deine Spiele, deinen Gaming-PC und diese Gaming-Zentrale. Dabei helfe ich gern: Spiele starten, Profile einstellen, Sounds abspielen, Startseite und Bibliothek ordnen, Ruckler untersuchen, Bingos und Challenges erstellen.");
const CODE = () => t("Neue Funktionen oder Seiten sind Änderungen am Programmcode – die mache ich nicht nebenbei im Chat, und meinen eigenen Code ändere ich nie. Dafür gibt es den Entwicklungsweg mit Versionskontrolle, Tests und einem Update über die Update-Zentrale. Innerhalb der App (Startseiten, Widgets, Leiste, Kategorien, Profile, Design) ändere ich dagegen direkt, was du sagst.");
const opens = (s: string) => /\b(oeffne|öffne|offne|zeig|zeige|geh|gehe|wechsel)\b/i.test(s);

export interface JarvisCtx { online: boolean; conversationId: string | null; previousBingo: string | null; bingoProvider: string | null; /** Answer to "im Internet nachsehen?" for a bingo. */ bingoWeb?: boolean; /** Answer to "Darf ich nachsehen?" for a question (true = yes this time). */ lookup?: boolean; /** Tapped "In Quellen nachsehen" after an AI answer. */ sources?: boolean; /** Tapped "Gemini fragen (ohne Quelle)". */ ai?: boolean; /** AI chosen in the chat ("auto" = mode at the PC). */ engine?: string; /** For "Abbrechen". */ requestId?: string }

export async function jarvisAsk(question: string, ctx: JarvisCtx): Promise<JarvisTurn> {
  const reply = (text: string, actions: AssistantAction[] = [], sources: string[] = ["JARVIS"]): AssistantReply => ({ text, actions, sources, suggestions: [], mode: ctx.online ? "local" : "device" });
  if (offTopic(question)) return { reply: reply(OFF_TOPIC()), steps: [] };
  if (codeRequest(question)) return { reply: reply(CODE()), steps: [] };
  // "Sei lockerer" / "Sprich wieder sachlich": JARVIS' tone, right away.
  const tone = /^(?:jarvis,?\s*)?(?:sei|sprich|rede|antworte)\b.{0,25}\b(locker(?:er)?|lustig(?:er)?|frech(?:er)?|mit sprüchen)\b/i.test(question) ? "locker"
    : /^(?:jarvis,?\s*)?(?:sei|sprich|rede|antworte)\b.{0,25}\b(sachlich(?:er)?|seriös(?:er)?|ernst(?:er)?|ohne sprüche|normal)\b/i.test(question) ? "sachlich" : null;
  if (tone) {
    const { setStyle } = await import("./jarvis-style");
    setStyle(tone);
    return { reply: reply(tone === "locker" ? "✓ Ab jetzt locker. Ich hoffe, du verträgst Sprüche. 😏 (Zurück mit „Sprich wieder sachlich“.)" : "✓ Ab jetzt wieder sachlich – keine Sprüche mehr."), steps: [{ text: question, ok: true }] };
  }
  // What JARVIS learned by looking things up, and where he still has gaps.
  if (/\bwas hast du (?:alles )?nachgeschlagen\b|\bdein (?:nachgeschlagenes )?wissen\b|jarvis-wissen/i.test(question)) {
    const { learnedAll, learnedPageId } = await import("./jarvis-memory");
    const l = learnedAll().reverse();
    const id = learnedPageId();
    return { reply: reply(l.length ? [`JARVIS – nachgeschlagen (${l.length})`, ...l.slice(0, 12).map((x) => `• ${x.title} – ${x.source}, ${x.at}`)].join("\n") : t("Ich habe noch nichts nachgeschlagen."), id ? [{ kind: "navigate", label: t("JARVIS-Wissen öffnen"), path: `/wiki?id=${id}` }] : []), steps: [] };
  }
  if (/\bwelche fragen (?:konntest|kannst) du nicht\b|\boffene fragen\b|\bwas weißt du (?:noch )?nicht\b/i.test(question)) {
    const { openQuestions } = await import("./jarvis-memory");
    const o = openQuestions().reverse();
    return { reply: reply(o.length ? [t("JARVIS – Fragen ohne verlässliche Antwort ({n})", { n: o.length }), ...o.slice(0, 12).map((x) => "• " + x)].join("\n") : t("Bisher keine – auf alles, was du gefragt hast, hatte ich eine Antwort mit Quelle.")), steps: [] };
  }
  // "Merk dir einen Hinweis für Elden Ring: …" belongs to that game's journal, not to the general memory.
  const { coachIntent: coach } = await import("./game-coach");
  const mem = coach(question) ? null : memoryIntent(question);
  if (mem) return { reply: memoryReply(mem, reply), steps: [] };

  // "Was sollte ich in X als Nächstes machen?" is one question, not two steps around "als Nächstes".
  const parts = coach(question) ? [question.trim()] : splitSteps(question);
  const steps: JarvisStep[] = [];
  const buttons: AssistantAction[] = [];
  const texts: string[] = [];
  const sources = new Set<string>();
  let undo: Prefs | undefined;
  let navigate: string | undefined;
  let conversationId = ctx.conversationId;
  let bingoId: string | undefined;
  const session = ctx.online ? await ensureJarvis() : false;

  for (let n = 0; n < parts.length; n++) {
    const part = parts[n];
    const last = n === parts.length - 1;
    let r: StepResult;
    const { setupReply, applySetup } = await import("./assistant-setup");
    // A play-time question first: "… bis morgen bei 2 Stunden pro Tag" is not a design wish.
    // Challenges from the checked catalog ("fünf mittelschwere Minecraft-Challenges", "schwieriger", "geschafft").
    const { challengeIntent } = await import("./challenge-chat");
    const chi = challengeIntent(part);
    // "Such im Internet nach …" / "Wikipedia: …" – asked for directly.
    const { lookupIntent } = await import("./web-lookup");
    const lk = lookupIntent(part);
    const lke = !chi && lk?.kind === "explicit" ? lk : null;
    // Design wishes in plain language: shown as a preview first, saved only with "Übernehmen".
    const { designIntent } = await import("./design-ai");
    const di = chi || lke ? null : designIntent(part, getPreview()?.theme ?? getPrefs().theme);
    // Performance questions: real values from the PC, measured facts kept apart from suspicions.
    const { perfIntent } = await import("./perf-chat");
    const pfi = chi || di || lke ? null : perfIntent(part);
    const { playtimeIntent } = await import("./playtime");
    const pt = chi || di || pfi || lke ? null : playtimeIntent(part);
    const { coachIntent } = await import("./game-coach");
    const ci = pt || chi || di || pfi || lke ? null : coachIntent(part);
    const { gamingIntent } = await import("./gaming-intel");
    const gi = pt || ci || chi || di || pfi || lke ? null : gamingIntent(part);
    const { researchIntent } = await import("./gaming-research");
    const ri = pt || ci || gi || chi || di || pfi || lke ? null : researchIntent(part);
    const setup = pt || ci || gi || ri || chi || di || pfi || lke ? null : setupReply(part, getPrefs(), navItems());
    // A question ("Was ist ein Creeper in Minecraft?") is not an order to open a page.
    const site = setup || pt || ci || gi || ri || chi || di || pfi || lke || lk?.kind === "question" ? null : siteIntent(part);
    const { isBingoRequest } = await import("./bingo");
    if (lke || (ctx.ai && lk)) {
      const a = await lookupFlow((lke ?? lk)!, ctx);
      r = { text: a.text, ok: a.ok };
      if (a.source) sources.add(a.source);
      buttons.push(...a.actions);
    } else if (pfi) {
      const { perfAnswer } = await import("./perf-chat");
      for (let i = 0; !ctx.online && client.status.phase === "connecting" && i < 40; i++) await new Promise((res) => setTimeout(res, 100));
      const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
      const a = await perfAnswer(pfi, online);
      r = { text: a.text, ok: a.ok };
      sources.add("Messwerte des PCs");
      buttons.push(...a.navigate.map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
    } else if (di) {
      if (di.kind === "change") {
        previewTheme(di.theme, di.changes);
        r = { text: [`JARVIS – Design-Vorschau:`, ...di.changes.map((c) => "• " + c), ...di.notes.map((n) => "ℹ " + n), "", "Noch nicht gespeichert. Unten „Übernehmen“ oder „Verwerfen“ tippen – oder sag es mir. Funktionen, Menü und Widgets bleiben unverändert."].join("\n"), ok: true };
      } else if (di.kind === "apply") r = commitPreview() ? { text: "✓ Design übernommen und gespeichert (auch für deine anderen Geräte über den PC). „Letzte Designänderung rückgängig“ holt das vorherige zurück.", ok: true } : { text: "Es gibt gerade keine Design-Vorschau zum Übernehmen.", ok: null };
      else if (di.kind === "discard") { const had = !!getPreview(); discardPreview(); r = had ? { text: "✓ Vorschau verworfen – dein Design ist wie vorher.", ok: true } : { text: "Es gibt gerade keine Design-Vorschau.", ok: null }; }
      else if (di.kind === "undo") r = undoDesign() ? { text: "✓ Letzte Designänderung rückgängig gemacht.", ok: true } : { text: "Es gibt keine frühere Designänderung zum Zurückholen.", ok: null };
      else { restoreOriginalDesign(); r = { text: "✓ Ursprüngliches Design wiederhergestellt. „Letzte Designänderung rückgängig“ holt das bisherige zurück.", ok: true }; }
      sources.add(t("Einstellungen dieses Geräts"));
    } else if (chi) {
      const { challengeAnswer } = await import("./challenge-chat");
      const a = challengeAnswer(chi);
      r = { text: a.text, ok: a.ok };
      sources.add("Aufgaben-Katalog");
      buttons.push(...a.navigate.map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
    } else if (ci) {
      // Quest-Coach: your own journal first (where you were, plans, open quests, spoiler level).
      const { coachAnswer } = await import("./game-coach");
      const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
      const a = await coachAnswer(ci, online);
      r = { text: a.text, ok: a.ok };
      a.sources.forEach((x) => sources.add(x));
      buttons.push(...a.links.map((l) => ({ kind: "openUrl", label: l.label, params: { url: l.url } })), ...a.navigate.map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
    } else if (gi) {
      // Gaming knowledge beyond the app: free games, news, sensitivity, health, setup, lag, controller, spending.
      const { gamingAnswer } = await import("./gaming-intel");
      for (let i = 0; !ctx.online && gi.kind === "news" && client.status.phase === "connecting" && i < 40; i++) await new Promise((res) => setTimeout(res, 100));
      const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
      const a = await gamingAnswer(gi, online);
      r = { text: a.text, ok: a.ok };
      a.sources.forEach((x) => sources.add(x));
      buttons.push(...a.links.map((l) => ({ kind: "openUrl", label: l.label, params: { url: l.url } })), ...(a.navigate ?? []).map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
    } else if (ri) {
      // Research on request: Steam (through the PC), speedrun.com, FreeToGame, Microsoft Store / Wikipedia.
      const { researchAnswer } = await import("./gaming-research");
      for (let i = 0; !ctx.online && client.status.phase === "connecting" && i < 40; i++) await new Promise((res) => setTimeout(res, 100));
      const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
      const a = await researchAnswer(ri, online);
      r = { text: a.text, ok: a.ok };
      a.sources.forEach((x) => sources.add(x));
      buttons.push(...a.links.map((l) => ({ kind: "openUrl", label: l.label, params: { url: l.url } })), ...(a.navigate ?? []).map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
    } else if (pt) {
      // Spielzeitanalyse: PC data when connected, otherwise the stored values – never invented numbers.
      const { playtimeAnswer } = await import("./playtime-chat");
      // Asked right after opening the page: wait a moment for the PC instead of answering "nicht verbunden".
      for (let i = 0; !ctx.online && client.status.phase === "connecting" && i < 40; i++) await new Promise((res) => setTimeout(res, 100));
      const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
      const a = await playtimeAnswer(pt, online);
      r = { text: a.text, ok: a.ok };
      // "… und was sollte ich als Nächstes machen?" in the same sentence: the Quest-Coach answers that part.
      if (/\bwas (?:sollte|soll|kann) ich\b.*\bals (?:nächstes|naechstes)\b/i.test(question)) {
        const { coachAnswer } = await import("./game-coach");
        const c = await coachAnswer({ kind: "next", game: pt.game }, online);
        r = { text: `${r.text}\n\n${c.text}`, ok: r.ok };
        buttons.push(...c.navigate.map((n) => ({ kind: "navigate", label: n.label, path: n.path })));
      }
      a.sources.forEach((x) => sources.add(x));
      buttons.push({ kind: "navigate", label: t("Spielzeit ansehen und ändern"), path: `/journal?tab=playtime${a.entryId ? `&id=${a.entryId}` : ""}` });
    } else if (setup) {
      const ops = setup.actions.filter((a) => a.kind === "setup");
      if (ops.length === 1) {
        // A clear change of this website: applied right away (with "Rückgängig").
        const o = ops[0].params as never;
        const mobile = window.matchMedia("(max-width: 699px)").matches;
        if (["mode", "preset", "scene", "font", "motion", "resetTheme"].includes((o as { op: string }).op)) {
          // A design change: preview first, saved with "Übernehmen".
          previewTheme(applySetup({ ...getPrefs(), theme: getPreview()?.theme ?? getPrefs().theme }, o, mobile).theme, [setup.text]);
          r = { text: `JARVIS – Design-Vorschau: ${setup.text}\nNoch nicht gespeichert – unten „Übernehmen“ oder „Verwerfen“.`, ok: true };
        } else {
          undo ??= getPrefs();
          setPrefs((p) => applySetup(p, o, mobile));
          if ((o as { op: string; value?: string }).op === "lang") client.call("settings.save", { language: (o as { value: string }).value }).catch(() => {});
          r = { text: "✓ " + setup.text, ok: true };
        }
        buttons.push(...setup.actions.filter((a) => a.kind !== "setup"));
      } else {
        // Several possibilities (e.g. which place in a full bar) – only this question is asked.
        r = { text: setup.text, ok: null };
        buttons.push(...setup.actions);
      }
      sources.add(t("Einstellungen dieses Geräts"));
    } else if (site) {
      r = await runSite(site);
      if (r.undo) undo ??= r.undo;
      if (r.actions) buttons.push(...r.actions);
      if (r.navigate) { if (last && opens(part)) navigate = r.navigate; else buttons.push({ kind: "navigate", label: t("Ansehen"), path: r.navigate }); }
      sources.add("JARVIS");
    } else if (isBingoRequest(part, !!ctx.previousBingo)) {
      const { bingoFromChat } = await import("./bingo-chat");
      const b = await bingoFromChat(part, ctx.previousBingo, { online: ctx.online, provider: ctx.online ? ctx.bingoProvider : null, web: ctx.bingoWeb });
      bingoId = b.bingoId ?? bingoId;
      r = { text: b.reply.text, ok: b.bingoId ? true : null };
      buttons.push(...b.reply.actions);
      b.reply.sources.forEach((x) => sources.add(x));
    } else if (ctx.online) {
      const res = await client.call<{ conversationId: string; reply: AssistantReply & { actions: (AssistantAction & { auto?: boolean })[] }; jarvis?: boolean }>("assistant.ask", { conversationId, text: part, jarvis: session, engine: ctx.engine, requestId: ctx.requestId });
      conversationId = res.conversationId;
      res.reply.sources.forEach((s) => sources.add(s));
      const autos = res.reply.actions.filter((a) => a.auto && a.kind !== "navigate");
      const navs = res.reply.actions.filter((a) => a.auto && a.kind === "navigate");
      // A knowledge question the built-in help cannot really answer (no hit, or a text that does not even mention the
      // topic): look it up instead – and never start or open anything for a question.
      // Nothing the built-in help knows ("Ship or Burn"): looked up too – JARVIS does not stop at "weiß ich nicht".
      const lkf = lk ?? (res.reply.unsure && !autos.length ? (await import("./web-lookup")).fallbackIntent(part) : null);
      if (lkf?.kind === "question" && (res.reply.unsure || !mentions(res.reply.text, lkf.topic))) {
        const a = await lookupFlow(lkf, ctx);
        r = { text: a.text, ok: a.ok };
        if (a.source) sources.add(a.source);
        buttons.push(...a.actions);
      } else {
      buttons.push(...res.reply.actions.filter((a) => !a.auto));
      if (autos.length) {
        const results: StepResult[] = [];
        for (const a of autos) {
          const x = await runAuto(a);
          // "Starte mein Spiel": say which one was taken.
          if (a.kind === "launch" && a.target === "mein spiel") x.text = t("Dein zuletzt gespieltes Spiel: {t}", { t: x.text });
          results.push(x);
          if (x.ok === false) break;
        }
        r = { text: results.map((x) => x.text).join("\n"), ok: results.some((x) => x.ok === false) ? false : results.every((x) => x.ok) ? true : null };
      } else if (navs.length && last) {
        navigate = navs[0].path ?? undefined;
        r = { text: t("✓ {n}", { n: navs[0].label }), ok: true };
      } else if (lk && res.reply.unsure) {
        // The built-in help has nothing good: look it up instead of a vague answer.
        const a = await lookupFlow(lk, ctx);
        r = { text: a.text, ok: a.ok };
        if (a.source) sources.add(a.source);
        buttons.push(...a.actions);
      } else {
        r = { text: res.reply.text, ok: res.reply.failed ? false : null };
        if (navs.length) buttons.push(...navs);
      }
      }
    } else {
      const [{ answerOffline }, lib] = await Promise.all([import("./assistant-offline"), client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }))]);
      const o = answerOffline(part, { library: lib.items ?? [], paired: !!client.credentials });
      const lkf = o.unsure ? lk ?? (await import("./web-lookup")).fallbackIntent(part) : null;
      if (lkf) {
        const a = await lookupFlow(lkf, ctx);
        r = { text: a.text, ok: a.ok };
        if (a.source) sources.add(a.source);
        buttons.push(...a.actions);
      } else {
        r = { text: o.text, ok: null };
        buttons.push(...o.actions);
      }
    }
    steps.push({ text: part, ok: r.ok });
    texts.push(parts.length > 1 ? `${n + 1}. ${r.text}` : r.text);
    if (r.ok === false && !last) { texts.push(t("Die weiteren Schritte habe ich deshalb nicht ausgeführt.")); break; }
  }
  // Tone "locker": a one-liner after a successful answer (facts unchanged); never after an error or an open question.
  const { withStyle } = await import("./jarvis-style");
  const out = reply(withStyle(texts.join("\n\n"), steps.length > 0 && steps.every((x) => x.ok === true) ? true : null), buttons.slice(0, 8), [...sources]);
  // The log page ("JARVIS-Protokoll") – only what really happened.
  try { logDone(question, steps.map((s, i) => ({ text: texts[i] ?? s.text, ok: s.ok }))); } catch { /* storage full – the result is still shown */ }
  return { reply: out, steps, undo, navigate, conversationId, bingoId };
}

/** Does an answer talk about the asked topic at all? ("Creeper" in a text about the worlds page: no.) */
function mentions(text: string, topic: string): boolean {
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const words = norm(topic).split(/[^a-z0-9äöüß]+/).filter((w) => w.length >= 3);
  const t = norm(text);
  return words.length === 0 || words.some((w) => t.includes(w.length > 5 ? w.slice(0, -1) : w));
}

/** Known from earlier → from memory; otherwise look it up (after permission) – nothing is guessed. */
async function lookupFlow(i: import("./web-lookup").LookupIntent, ctx: JarvisCtx): Promise<{ text: string; ok: boolean | null; source?: string; actions: AssistantAction[] }> {
  const w = await import("./web-lookup");
  if (ctx.ai) { const a = await w.aiAnswer(i, { call: (m, p) => client.call(m, p) }); return { text: a.text, ok: a.ok, source: a.source, actions: [] }; }
  const known = w.fromMemory(i);
  const links = (l: { label: string; url: string }[]): AssistantAction[] => l.map((x) => ({ kind: "openUrl", label: x.label, params: { url: x.url } }));
  if (known) { const a = w.learnedReply(known); return { text: a.text, ok: a.ok, source: a.source, actions: links(a.links) }; }
  const perm = w.webPermission();
  if (ctx.lookup === false || (perm === "never" && i.kind !== "explicit")) {
    noteOpenQuestion(i.raw);
    return { text: t("Ohne nachzusehen weiß ich das nicht – ich rate nicht. Die Frage steht unter „JARVIS: offene Fragen“."), ok: null, actions: [] };
  }
  const online = ctx.online || (client.status.phase === "online" && client.status.auth === "ok" && !client.demo);
  const pc = online ? { call: <T,>(m: string, p?: unknown) => client.call<T>(m, p) } : undefined;
  // "Direkt KI" needs the PC (the AI runs there); without it JARVIS looks in the sources and says why.
  const mode = ctx.sources || (w.answerMode() === "ai" && !pc) ? "sources" : w.answerMode();
  if (ctx.lookup === true || perm === "always" || i.kind === "explicit") {
    if (mode === "ai" && pc) {
      const a = await w.aiAnswer(i, pc);
      if (a.aiAnswered) return { text: a.text, ok: a.ok, source: a.source, actions: [{ kind: "lookupChoice", label: t("In Quellen nachsehen"), params: { question: i.raw, ok: true, sources: true } }] };
      // No AI at the PC (or it failed): the sources instead – said openly.
      const b = await w.lookupAnswer(i, fetch, pc);
      return { text: `${a.text}\n\n${t("Deshalb habe ich in den Quellen nachgesehen:")}\n${b.text}`, ok: b.ok, source: b.source, actions: links(b.links) };
    }
    const a = await w.lookupAnswer(i, fetch, pc);
    if (a.ok === null && !a.ask && pc && mode === "auto") {
      // Nothing found: ask the AI right away (setting "Quellen, sonst KI").
      const b = await w.aiAnswer(i, pc);
      return { text: `${a.text}\n\n${b.text}`, ok: b.aiAnswered ? null : a.ok, source: b.source ?? a.source, actions: links(a.links) };
    }
    // Nothing found: the free AI at the PC may answer from its own knowledge – only on a tap, marked "ohne Quelle".
    const ai: AssistantAction[] = a.ok === null && pc && !a.ask ? [{ kind: "aiAnswer", label: t("KI fragen (ohne Quelle)"), params: { question: i.raw } }] : [];
    return { text: a.text, ok: a.ok, source: a.source, actions: [...ai, ...links(a.links)] };
  }
  const q = w.askPermission(i, mode);
  return { text: q.text, ok: null, actions: [
    { kind: "lookupChoice", label: mode === "ai" ? t("Ja, KI fragen") : t("Ja, nachsehen"), params: { question: i.raw, ok: true } },
    { kind: "lookupChoice", label: t("Ja, immer erlauben"), params: { question: i.raw, ok: true, always: true } },
    { kind: "lookupChoice", label: t("Nein"), params: { question: i.raw, ok: false } },
  ] };
}

function memoryReply(m: MemoryIntent, reply: (text: string, actions?: AssistantAction[], sources?: string[]) => AssistantReply): AssistantReply {
  const open = (id: string | null, label: string): AssistantAction[] => (id ? [{ kind: "navigate", label, path: `/wiki?id=${id}` }] : []);
  switch (m.kind) {
    case "remember": {
      const r = remember(m.fact);
      return reply(t("✓ Gemerkt: „{f}“. Das steht jetzt in deinem Wiki auf der Seite „JARVIS-Gedächtnis“ ({n} Einträge) – lesbar und änderbar wie jede Seite.", { f: m.fact, n: r.count }), open(r.id ?? null, t("Gedächtnis öffnen")), [t("JARVIS-Gedächtnis")]);
    }
    case "recall": {
      const found = recall(m.about);
      if (!found.length) return reply(m.about ? t("Zu „{a}“ habe ich mir nichts gemerkt. Sag z. B. „Merk dir, dass ich {a} am liebsten im Koop spiele“.", { a: m.about }) : t("Ich habe mir noch nichts gemerkt. Sag z. B. „Merk dir, dass ich Shooter mit Controller spiele“."), [], [t("JARVIS-Gedächtnis")]);
      return reply((m.about ? t("Das habe ich mir zu „{a}“ gemerkt:", { a: m.about }) : t("Das habe ich mir gemerkt:")) + "\n" + found.slice(0, 12).map((l) => "• " + l).join("\n"), open(memoryPageId(), t("Gedächtnis öffnen")), [t("JARVIS-Gedächtnis")]);
    }
    case "forget": {
      const n = recall(m.about).length;
      if (!n) return reply(t("Zu „{a}“ habe ich nichts gespeichert.", { a: m.about }));
      // Deleting is asked first.
      return reply(t("Soll ich {n} Eintrag/Einträge zu „{a}“ aus meinem Gedächtnis löschen?", { n, a: m.about }), [{ kind: "jarvisForget", label: t("Ja, vergessen"), params: { about: m.about } }], [t("JARVIS-Gedächtnis")]);
    }
    case "log": {
      const l = lastLog();
      return reply(l.length ? t("Zuletzt erledigt:") + "\n" + l.map((x) => "• " + x).join("\n") : t("Ich habe noch nichts für dich erledigt."), open(logPageId(), t("Protokoll öffnen")), [t("JARVIS-Protokoll")]);
    }
  }
}

export function forgetNow(about: string): string {
  const n = forget(about);
  return n ? t("✓ {n} Eintrag/Einträge zu „{a}“ vergessen.", { n, a: about }) : t("Da war nichts mehr zu „{a}“.", { a: about });
}
