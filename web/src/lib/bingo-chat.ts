// "Erstelle ein 4×4-Bingo für Minecraft auf mittel" in the assistant chat: understood here (with or without the PC),
// the card is made with lib/bingo-make.ts and shown right in the chat.

import { t } from "./i18n";
import { client, readJson, writeJson } from "./rpc";
import { getEntry } from "./journal";
import type { LibraryItem } from "./types";
import type { AssistantReply } from "./assistant";
import { DIFFICULTY_LABEL, MODE_LABEL, parseRequest, poolFor, resolveOptions, type Card } from "./bingo";
import { createCard } from "./bingo-make";

export const BINGO_EXAMPLES = () => [t("Erstelle ein 4×4-Bingo für Minecraft auf mittel"), t("Mach mir ein 3×3-Bingo für Elden Ring auf leicht"), t("Erstelle ein 5×5-Bingo für PEAK auf gemischt")];

/** The user asked for the internet in the sentence itself ("… mit Steam-Erfolgen", "… aus dem Internet"). */
export const saysInternet = (q: string) => /internet|steam.?erfolg|achievements? von steam|online (suchen|nachsehen)|aus dem netz/i.test(q);

const WEB_KEY = "pgl.bingo.web";
/** "Ja, immer erlauben": JARVIS looks games up on the internet without asking again (switch off in the bingo maker). */
export const webAlways = () => { try { return readJson<string>(WEB_KEY) === "always"; } catch { return false; } };
export const setWebAlways = (v: boolean) => { try { writeJson(WEB_KEY, v ? "always" : null); } catch { /* storage blocked – asked again next time */ } };

/**
 * `ai.web`: true = the user agreed to look on the internet (Steam achievements), false = declined, undefined = not
 * asked yet – then a game without own catalog tasks (and without an AI on the PC) gets the question first.
 */
export async function bingoFromChat(question: string, previousId: string | null, ai: { online: boolean; provider: string | null; web?: boolean }): Promise<{ reply: AssistantReply; bingoId?: string }> {
  const previous = previousId ? getEntry<Card>(previousId)?.data ?? null : null;
  const lib = await client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }));
  const games = (lib.items ?? []).filter((i) => i.kind === "game").map((i) => i.name);
  const r = parseRequest(question, { library: games, previous });
  const reply = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ text, actions: [], sources: [], suggestions: [], mode: "device", ...extra });
  if (r.action === "ask") return { reply: reply(t(r.question ?? "Für welches Spiel soll das Bingo sein?"), { suggestions: BINGO_EXAMPLES() }) };
  const o = resolveOptions(r, previous, () => (games.length ? games[Math.floor(Math.random() * games.length)] : null));
  if ("error" in o) return { reply: reply(t(o.error), { suggestions: BINGO_EXAMPLES() }) };
  const inCatalog = poolFor(o.game, o.genre).from === "catalog";
  // With or without the PC: without it, this device asks the Microsoft Store and Wikipedia itself (Steam only via the PC).
  const webOk = ai.web === true || (ai.web === undefined && (webAlways() || saysInternet(question)));
  // Every game – with or without own tasks: the internet makes the card more fitting and more varied, but only after a "Ja".
  if (o.taskSource !== "own") {
    if (webOk) o.web = true;
    else if (ai.web === undefined) {
      // Ask before going on the internet (once – or never again with "immer erlauben").
      return {
        reply: reply((inCatalog ? t("Für „{g}“ habe ich eigene Aufgaben. Soll ich zusätzlich im Internet nachsehen, damit das Bingo abwechslungsreicher wird?", { g: o.game }) : t("Für „{g}“ habe ich keine eigenen Aufgaben. Soll ich im Internet nachsehen?", { g: o.game })) + " " + (!ai.online ? t("Dein PC ist gerade nicht verbunden – dann sieht dieses Gerät selbst im Microsoft Store (Xbox) und bei Wikipedia nach, was für ein Spiel es ist (Steam-Erfolge gibt es nur über den PC), und nimmt Aufgaben, die zu dieser Art Spiel passen.") : ai.provider ? t("Dein PC sucht das Spiel bei Steam (Erfolge, Genre, Beschreibung), im Microsoft Store (Xbox) und sonst bei Wikipedia. Mit diesen Infos schreibt die KI ({p}) passende Aufgaben dazu; die Schwierigkeit echter Erfolge kommt davon, wie viele Spieler sie geschafft haben.", { p: ai.provider }) : t("Dein PC sucht das Spiel bei Steam (Erfolge, Genre, Beschreibung), im Microsoft Store (Xbox) und sonst bei Wikipedia – daraus werden passende Aufgaben; die Schwierigkeit echter Erfolge kommt davon, wie viele Spieler sie geschafft haben.")), {
          actions: [
            { kind: "bingoChoice", label: t("Ja, im Internet nachsehen"), params: { question, web: true } },
            { kind: "bingoChoice", label: t("Ja, immer erlauben"), params: { question, web: true, always: true } },
            { kind: "bingoChoice", label: ai.provider ? t("Nein, die KI schreibt sie") : inCatalog ? t("Nein, nur eingebaute Aufgaben") : t("Nein, allgemeine Aufgaben"), params: { question, web: false } },
          ],
        }),
      };
    }
  }
  // Made right here in the chat – if one way fails, the next one is tried and the note says so.
  const tries: { o: typeof o; useAi: boolean }[] = [{ o, useAi: true }];
  if (o.web) tries.push({ o: { ...o, web: false }, useAi: !!ai.provider });
  if (o.taskSource !== "own") tries.push({ o: { ...o, web: false }, useAi: false });
  const failed: string[] = [];
  for (const [i, x] of tries.entries()) {
    try {
      const made = await createCard(x.o, { useAi: x.useAi, aiAvailable: x.useAi && ai.online && !!ai.provider, pcOnline: ai.online });
      const c = made.card;
      const text = t("Hier ist dein {s}×{s}-Bingo für {g} ({d}{m}) mit {n} Aufgaben. Tippe ein Feld an, wenn du die Aufgabe geschafft hast.", {
        s: c.size, g: c.gameName ?? "", d: t(DIFFICULTY_LABEL[c.difficulty ?? "medium"]), m: c.mode && c.mode !== "classic" ? ", " + t(MODE_LABEL[c.mode]) : "", n: c.cells.filter((x) => !x.free).length,
      });
      const notes = [...failed, ...(c.notesFromMaker ?? []).map((x) => t(x))];
      return {
        bingoId: made.id,
        reply: reply(text + (notes.length ? "\n\n" + notes.join("\n") : ""), {
          actions: [{ kind: "navigate", label: t("Bingo öffnen"), path: `/play?tab=bingo&id=${made.id}` }, { kind: "navigate", label: t("Einstellungen anpassen"), path: "/play?tab=bingo&area=make" }],
          suggestions: [t("Mach das vorherige Bingo schwieriger"), t("Erstelle ein komplett neues Bingo ohne Wiederholung")],
          sources: [t("Aufgaben: {p}", { p: t(c.provider ?? "Katalog") })],
        }),
      };
    } catch (e) {
      const msg = (e as Error).message;
      const what = x.o.web ? t("Die Suche im Internet") : x.useAi && ai.provider ? t("Die KI") : t("Die allgemeinen Aufgaben");
      failed.push(t("{w} hat nicht geklappt ({e}) – deshalb anders erstellt.", { w: what, e: msg }));
      if (i === tries.length - 1) return { reply: reply(t("Das Bingo konnte nicht erstellt werden: {e}", { e: msg }), { suggestions: BINGO_EXAMPLES() }) };
    }
  }
  return { reply: reply(t("Das Bingo konnte nicht erstellt werden.")) };
}
