import { describe, expect, it } from "vitest";
import { answerOffline, SECTIONS } from "./assistant-offline";
import { search } from "./knowledge";
import type { LibraryItem } from "./types";

const game = (id: string, name: string, extra: Partial<LibraryItem> = {}) =>
  ({ id, kind: "game", name, source: "steam", target: id, args: "", processNames: [], categories: [], favorite: false, addedAt: "", ...extra }) as LibraryItem;

describe("assistant without PC", () => {
  it("finds the same help sections as the assistant on the PC (same questions as AssistantTests.cs)", () => {
    expect(SECTIONS.length).toBeGreaterThan(30);
    expect(search(SECTIONS, "Wie hören andere in Discord meine Sounds?")[0].section.title).toBe("Discord einrichten: Sounds für andere hörbar machen");
    expect(search(SECTIONS, "Kann ich unterwegs mit 5G auf den PC zugreifen?")[0].section.title).toBe("Zugriff von unterwegs");
    expect(search(SECTIONS, "wo stelle ich einen zielpreis ein")[0].section.title).toBe("Deal Radar");
    expect(search(SECTIONS, "und oder der")).toEqual([]);
  });

  it("opens pages, answers from the cached library and backlog, and is honest about what needs the PC", () => {
    const lib = [game("a", "Hades", { favorite: true, backlog: "next", priority: 3 }), game("b", "Celeste", { backlog: "backlog" })];
    const open = answerOffline("Öffne das Deck", { library: [], paired: false });
    expect(open.actions[0]).toMatchObject({ kind: "navigate", path: "/deck" });
    expect(answerOffline("zeig mir die Sounds", { library: [], paired: true }).actions[0].path).toBe("/soundboard");

    const games = answerOffline("Welche Spiele habe ich?", { library: lib, paired: true });
    expect(games.text).toContain("Hades");
    expect(games.sources[0]).toContain("zuletzt vom PC geladen");

    expect(answerOffline("Was soll ich als Nächstes spielen?", { library: lib, paired: true }).text).toContain("Hades");

    const start = answerOffline("Starte Hades", { library: lib, paired: true });
    expect(start.text).toContain("PC verbunden");
    expect(start.actions[0]).toMatchObject({ method: "library.launch", params: { id: "a" }, confirm: true });

    const cpu = answerOffline("Wie ist meine CPU-Auslastung?", { library: lib, paired: false });
    expect(cpu.text).toContain("zuerst ein PC verbunden");
    expect(cpu.text).not.toMatch(/\d+ ?%/); // never invents values

    const help = answerOffline("Wie richte ich Discord mit dem Soundboard ein?", { library: [], paired: false });
    expect(help.sources[0]).toContain("Discord");
    expect(help.mode).toBe("offline");
    expect(answerOffline("blabla quatsch", { library: [], paired: false }).suggestions.length).toBeGreaterThan(0);
  });
});
