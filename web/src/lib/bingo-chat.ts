// "Erstelle ein 4×4-Bingo für Minecraft auf mittel" in the assistant chat: understood here (with or without the PC),
// the card is made with lib/bingo-make.ts and shown right in the chat.

import { t } from "./i18n";
import { client } from "./rpc";
import { getEntry } from "./journal";
import type { LibraryItem } from "./types";
import type { AssistantReply } from "./assistant";
import { DIFFICULTY_LABEL, MODE_LABEL, parseRequest, resolveOptions, type Card } from "./bingo";
import { createCard } from "./bingo-make";

export const BINGO_EXAMPLES = () => [t("Erstelle ein 4×4-Bingo für Minecraft auf mittel"), t("Mach mir ein 3×3-Bingo für Elden Ring auf leicht"), t("Erstelle ein 5×5-Bingo für PEAK auf gemischt")];

export async function bingoFromChat(question: string, previousId: string | null, ai: { online: boolean; provider: string | null }): Promise<{ reply: AssistantReply; bingoId?: string }> {
  const previous = previousId ? getEntry<Card>(previousId)?.data ?? null : null;
  const lib = await client.call<{ items: LibraryItem[] }>("library.list").catch(() => ({ items: [] as LibraryItem[] }));
  const games = (lib.items ?? []).filter((i) => i.kind === "game").map((i) => i.name);
  const r = parseRequest(question, { library: games, previous });
  const reply = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ text, actions: [], sources: [], suggestions: [], mode: "device", ...extra });
  if (r.action === "ask") return { reply: reply(t(r.question ?? "Für welches Spiel soll das Bingo sein?"), { suggestions: BINGO_EXAMPLES() }) };
  const o = resolveOptions(r, previous, () => (games.length ? games[Math.floor(Math.random() * games.length)] : null));
  if ("error" in o) return { reply: reply(t(o.error), { suggestions: BINGO_EXAMPLES() }) };
  try {
    const made = await createCard(o, { useAi: true, aiAvailable: ai.online && !!ai.provider });
    const c = made.card;
    const text = t("Hier ist dein {s}×{s}-Bingo für {g} ({d}{m}) mit {n} Aufgaben. Tippe ein Feld an, wenn du die Aufgabe geschafft hast.", {
      s: c.size, g: c.gameName ?? "", d: t(DIFFICULTY_LABEL[c.difficulty ?? "medium"]), m: c.mode && c.mode !== "classic" ? ", " + t(MODE_LABEL[c.mode]) : "", n: c.cells.filter((x) => !x.free).length,
    });
    return {
      bingoId: made.id,
      reply: reply(text + (c.notesFromMaker?.length ? "\n\n" + c.notesFromMaker.map((x) => t(x)).join("\n") : ""), {
        actions: [{ kind: "navigate", label: t("Bingo öffnen"), path: `/play?tab=bingo&id=${made.id}` }, { kind: "navigate", label: t("Einstellungen anpassen"), path: "/play?tab=bingo&area=make" }],
        suggestions: [t("Mach das vorherige Bingo schwieriger"), t("Erstelle ein komplett neues Bingo ohne Wiederholung")],
        sources: [t("Aufgaben: {p}", { p: t(c.provider ?? "Katalog") })],
      }),
    };
  } catch (e) {
    // The AI failed: say why and offer the catalog – nothing is swapped in silently.
    const msg = (e as Error).message;
    return { reply: reply(t("Das Bingo konnte nicht erstellt werden: {e}", { e: msg }), { suggestions: BINGO_EXAMPLES(), actions: [{ kind: "navigate", label: t("Mit Katalog-Aufgaben erstellen"), path: "/play?tab=bingo&area=make" }] }) };
  }
}
