// JARVIS Gaming – one request from the chat: split into steps, each step answered by the fastest fitting part
// (website change → this device, bingo → bingo maker, everything else → the PC's assistant), named actions run
// directly with a checked result. Stops at the first failed step and says so. Without JARVIS switched on, this is
// not used – the page then works like before (buttons only).

import { client } from "./rpc";
import { t } from "./i18n";
import { getPrefs, setPrefs } from "./prefs";
import type { Prefs } from "./prefs-core";
import { navItems } from "./nav";
import type { AssistantAction, AssistantReply } from "./assistant";
import { codeRequest, offTopic, siteIntent, splitSteps } from "./jarvis";
import { runAuto, runSite, type StepResult } from "./jarvis-run";
import { ensureJarvis } from "./jarvis-session";
import type { LibraryItem } from "./types";

export interface JarvisStep { text: string; ok: boolean | null }
export interface JarvisTurn { reply: AssistantReply; steps: JarvisStep[]; undo?: Prefs; navigate?: string; conversationId?: string | null; bingoId?: string }

const OFF_TOPIC = () => t("Ich bin JARVIS Gaming – ich kümmere mich nur um deine Spiele, deinen Gaming-PC und diese Gaming-Zentrale. Dabei helfe ich gern: Spiele starten, Profile einstellen, Sounds abspielen, Startseite und Bibliothek ordnen, Ruckler untersuchen, Bingos und Challenges erstellen.");
const CODE = () => t("Neue Funktionen oder Seiten sind Änderungen am Programmcode – die mache ich nicht nebenbei im Chat, und meinen eigenen Code ändere ich nie. Dafür gibt es den Entwicklungsweg mit Versionskontrolle, Tests und einem Update über die Update-Zentrale. Innerhalb der App (Startseiten, Widgets, Leiste, Kategorien, Profile, Design) ändere ich dagegen direkt, was du sagst.");
const opens = (s: string) => /\b(oeffne|öffne|offne|zeig|zeige|geh|gehe|wechsel)\b/i.test(s);

export interface JarvisCtx { online: boolean; conversationId: string | null; previousBingo: string | null; bingoProvider: string | null }

export async function jarvisAsk(question: string, ctx: JarvisCtx): Promise<JarvisTurn> {
  const reply = (text: string, actions: AssistantAction[] = [], sources: string[] = ["JARVIS"]): AssistantReply => ({ text, actions, sources, suggestions: [], mode: ctx.online ? "local" : "device" });
  if (offTopic(question)) return { reply: reply(OFF_TOPIC()), steps: [] };
  if (codeRequest(question)) return { reply: reply(CODE()), steps: [] };

  const parts = splitSteps(question);
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
    const setup = setupReply(part, getPrefs(), navItems());
    const site = setup ? null : siteIntent(part);
    const { isBingoRequest } = await import("./bingo");
    if (setup) {
      const ops = setup.actions.filter((a) => a.kind === "setup");
      if (ops.length === 1) {
        // A clear change of this website: applied right away (with "Rückgängig").
        undo ??= getPrefs();
        const o = ops[0].params as never;
        setPrefs((p) => applySetup(p, o, window.matchMedia("(max-width: 699px)").matches));
        if ((o as { op: string; value?: string }).op === "lang") client.call("settings.save", { language: (o as { value: string }).value }).catch(() => {});
        r = { text: "✓ " + setup.text, ok: true };
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
      const b = await bingoFromChat(part, ctx.previousBingo, { online: ctx.online, provider: ctx.online ? ctx.bingoProvider : null });
      bingoId = b.bingoId ?? bingoId;
      r = { text: b.reply.text, ok: b.bingoId ? true : null };
      buttons.push(...b.reply.actions);
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
  const out = reply(texts.join("\n\n"), buttons.slice(0, 8), [...sources]);
  return { reply: out, steps, undo, navigate, conversationId, bingoId };
}
