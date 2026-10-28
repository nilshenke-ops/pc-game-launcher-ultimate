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
import { forget, lastLog, logDone, logPageId, memoryIntent, memoryPageId, recall, remember, type MemoryIntent } from "./jarvis-memory";
import type { LibraryItem } from "./types";

export interface JarvisStep { text: string; ok: boolean | null }
export interface JarvisTurn { reply: AssistantReply; steps: JarvisStep[]; undo?: Prefs; navigate?: string; conversationId?: string | null; bingoId?: string }

const OFF_TOPIC = () => t("Ich bin JARVIS Gaming – ich kümmere mich nur um deine Spiele, deinen Gaming-PC und diese Gaming-Zentrale. Dabei helfe ich gern: Spiele starten, Profile einstellen, Sounds abspielen, Startseite und Bibliothek ordnen, Ruckler untersuchen, Bingos und Challenges erstellen.");
const CODE = () => t("Neue Funktionen oder Seiten sind Änderungen am Programmcode – die mache ich nicht nebenbei im Chat, und meinen eigenen Code ändere ich nie. Dafür gibt es den Entwicklungsweg mit Versionskontrolle, Tests und einem Update über die Update-Zentrale. Innerhalb der App (Startseiten, Widgets, Leiste, Kategorien, Profile, Design) ändere ich dagegen direkt, was du sagst.");
const opens = (s: string) => /\b(oeffne|öffne|offne|zeig|zeige|geh|gehe|wechsel)\b/i.test(s);

export interface JarvisCtx { online: boolean; conversationId: string | null; previousBingo: string | null; bingoProvider: string | null; /** Answer to "im Internet nachsehen?" for a bingo. */ bingoWeb?: boolean }

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
    // Design wishes in plain language: shown as a preview first, saved only with "Übernehmen".
    const { designIntent } = await import("./design-ai");
    const di = chi ? null : designIntent(part, getPreview()?.theme ?? getPrefs().theme);
    const { playtimeIntent } = await import("./playtime");
    const pt = chi || di ? null : playtimeIntent(part);
    const { coachIntent } = await import("./game-coach");
    const ci = pt || chi || di ? null : coachIntent(part);
    const { gamingIntent } = await import("./gaming-intel");
    const gi = pt || ci || chi || di ? null : gamingIntent(part);
    const { researchIntent } = await import("./gaming-research");
    const ri = pt || ci || gi || chi || di ? null : researchIntent(part);
    const setup = pt || ci || gi || ri || chi || di ? null : setupReply(part, getPrefs(), navItems());
    const site = setup || pt || ci || gi || ri || chi || di ? null : siteIntent(part);
    const { isBingoRequest } = await import("./bingo");
    if (di) {
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
      const res = await client.call<{ conversationId: string; reply: AssistantReply & { actions: (AssistantAction & { auto?: boolean })[] }; jarvis?: boolean }>("assistant.ask", { conversationId, text: part, jarvis: session });
      conversationId = res.conversationId;
      res.reply.sources.forEach((s) => sources.add(s));
      const autos = res.reply.actions.filter((a) => a.auto && a.kind !== "navigate");
      const navs = res.reply.actions.filter((a) => a.auto && a.kind === "navigate");
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
      } else {
        r = { text: res.reply.text, ok: res.reply.failed ? false : null };
        if (navs.length) buttons.push(...navs);
      }
    } else {
      const [{ answerOffline }, lib] = await Promise.all([import("./assistant-offline"), client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }))]);
      const o = answerOffline(part, { library: lib.items ?? [], paired: !!client.credentials });
      r = { text: o.text, ok: null };
      buttons.push(...o.actions);
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
