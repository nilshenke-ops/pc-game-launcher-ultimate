// The assistant without a PC: runs completely in the browser (no internet, no cost). Knows the app from the same
// help texts as the PC assistant, opens pages, and uses what this device has kept from the PC (library, backlog).
// Anything that needs the PC (live values, starting) is said honestly instead of being guessed.
import knowledgeMd from "../../../companion/src/Companion.Core/Assistant/knowledge.md?raw";
import troubleshootingMd from "../../../TROUBLESHOOTING.md?raw";
import privacyMd from "../../../docs/DATENSCHUTZ.md?raw";
import { t } from "./i18n";
import { fold, parse, search, tokens } from "./knowledge";
import { navItems } from "./nav";
import { pickRandom } from "./backlog";
import { offlineExamples, type AssistantAction, type AssistantReply } from "./assistant";
import type { LibraryItem } from "./types";

export const SECTIONS = parse([
  { source: "Wissen", markdown: knowledgeMd },
  { source: "Fehlerbehebung", markdown: troubleshootingMd },
  { source: "Datenschutz", markdown: privacyMd },
]);

export interface OfflineContext {
  /** Library as last loaded from the PC (kept on this device); empty if never connected. */
  library: LibraryItem[];
  paired: boolean;
}

const reply = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ text, actions: [], sources: [], suggestions: [], mode: "offline", ...extra });
const nav = (path: string, label?: string): AssistantAction => ({ kind: "navigate", label: t("{n} öffnen", { n: label ?? navItems().find((i) => i.path === path)?.label ?? path }), path });


/** Best matching item by name: exact, then contained, then all words. */
function findItem(items: LibraryItem[], name: string) {
  const n = fold(name).trim();
  if (!n) return undefined;
  return items.find((i) => fold(i.name) === n) ?? items.find((i) => fold(i.name).includes(n)) ?? items.find((i) => n.split(/\s+/).every((w) => fold(i.name).includes(w)));
}

export function answerOffline(question: string, ctx: OfflineContext): AssistantReply {
  const q = question.trim();
  const f = fold(q);
  const games = ctx.library.filter((i) => i.kind === "game");
  const needsPc = ctx.paired ? t("Dafür muss der PC verbunden sein – sobald er an ist, verbindet sich die App von selbst.") : t("Dafür muss zuerst ein PC verbunden werden.");

  // Open a page: "öffne das Deck", "zeig mir die Sounds", "geh zu Einstellungen".
  const open = /^(oeffne|offne|zeig(e)?( mir)?|geh(e)?( zu| zur| zum| in)?|wechsel(e)? zu|open|show)\s+(.+)$/.exec(f);
  if (open) {
    const target = open[open.length - 1].replace(/^(das|die|den|der|mein(e|en)?|the)\s+/, "");
    const tt = tokens(target);
    const items = navItems();
    const hit = items.find((i) => fold(i.label) === target || fold(i.short ?? "") === target)
      ?? items.find((i) => tt.length > 0 && tt.every((w) => tokens(`${i.label} ${i.short ?? ""} ${i.keywords ?? ""}`).some((k) => k.startsWith(w) || w.startsWith(k))));
    if (hit) return reply(t("Hier geht's zu „{n}“.", { n: hit.label }), { actions: [nav(hit.path, hit.label)], sources: [t("Navigation")] });
  }

  // Start a game: only with the PC. The button is shown anyway – it works as soon as the PC is connected.
  const start = /^(starte|start|spiel(e)?|launch|oeffne das spiel)\s+(.+)$/.exec(f);
  if (start && !/sound/.test(f)) {
    const item = findItem(ctx.library, start[start.length - 1]);
    if (item) return reply(`${t("„{n}“ startet am PC.", { n: item.name })} ${needsPc}`, { actions: [{ kind: "launch", label: t("{n} starten", { n: item.name }), method: "library.launch", params: { id: item.id }, confirm: true }], sources: [t("Bibliothek (zuletzt vom PC geladen)")] });
  }

  // Library from the device's copy.
  if (/(welche|meine|alle).*(spiele|games)|spiele.*(hab|besitz)/.test(f)) {
    if (!games.length) return reply(ctx.paired ? t("Auf diesem Gerät ist noch keine Spieleliste gespeichert – sie kommt beim nächsten Verbinden vom PC.") : t("Noch kein PC verbunden – deine Spiele kennt nur der PC."), { actions: [nav("/connect")] });
    const fav = games.filter((g) => g.favorite).map((g) => g.name);
    return reply(t("{n} Spiele: {l}", { n: games.length, l: games.slice(0, 15).map((g) => g.name).join(", ") + (games.length > 15 ? " …" : "") }) + (fav.length ? " " + t("Favoriten: {f}.", { f: fav.join(", ") }) : ""),
      { actions: [nav("/games")], sources: [t("Bibliothek (zuletzt vom PC geladen)")] });
  }

  // Backlog: what to play next.
  if (/(was|welches).*(spielen|zocken)|als naechstes|backlog|zufall/.test(f)) {
    const next = games.filter((g) => g.backlog === "next" || g.backlog === "playing").sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const pool = games.filter((g) => g.backlog === "backlog" || g.backlog === "next");
    if (next.length || pool.length) {
      const pick = next[0] ?? pickRandom(pool, true)!;
      return reply(next.length ? t("Als Nächstes steht „{n}“ an.", { n: pick.name }) + (next.length > 1 ? " " + t("Außerdem: {l}.", { l: next.slice(1, 4).map((g) => g.name).join(", ") }) : "")
        : t("Zufällig aus deinem Backlog: „{n}“.", { n: pick.name }), { actions: [nav("/backlog")], sources: [t("Backlog (zuletzt vom PC geladen)")] });
    }
  }

  // Live values and history live on the PC.
  if (/(cpu|ram|gpu|temperatur|auslastung|wie geht es meinem pc|laeuft gerade|spielzeit|wie lange.*gespielt|lautstaerke|sound.*(spiel|abspiel))/.test(f)) {
    return reply(`${t("Das misst bzw. steuert der PC selbst.")} ${needsPc}`, { actions: [nav(ctx.paired ? "/monitor" : "/connect")] });
  }

  const hits = search(SECTIONS, q, 3);
  if (!hits.length || hits[0].score < 2.5) {
    return reply(t("Das weiß ich ohne PC nicht. Frag mich zur App (z. B. „Wie richte ich Discord ein?“), lass dich zu einer Seite bringen („Öffne das Deck“) oder frag nach deinem Backlog."), { suggestions: offlineExamples().slice(0, 4) });
  }
  const top = hits[0].section;
  return reply(top.text, {
    actions: top.page ? [nav(top.page, top.title)] : [],
    sources: [`${top.source}: ${top.title}`],
    suggestions: hits.slice(1).filter((h) => h.score >= hits[0].score * 0.6).map((h) => (h.section.title.endsWith("?") ? h.section.title : t("Mehr zu: {n}", { n: h.section.title }))),
  });
}
