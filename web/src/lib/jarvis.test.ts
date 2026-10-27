import { describe, expect, it } from "vitest";
import { codeRequest, coopGames, findItem, nextGame, offTopic, siteIntent, splitSteps, tidy } from "./jarvis";
import type { LibraryItem } from "./types";

const item = (id: string, name: string, x: Partial<LibraryItem> = {}): LibraryItem => ({ id, kind: "game", name, source: "steam", target: "", args: "", processNames: [], categories: [], favorite: false, addedAt: "2026-01-01", ...x }) as LibraryItem;

describe("jarvis steps", () => {
  it("splits a request into steps only where a new command starts", () => {
    expect(splitSteps("Öffne Discord und starte anschließend mein Spiel")).toEqual(["Öffne Discord", "starte mein Spiel"]);
    expect(splitSteps("Starte Minecraft und öffne danach mein Minecraft-Gaming-Profil")).toEqual(["Starte Minecraft", "öffne mein Minecraft-Gaming-Profil"]);
    expect(splitSteps("Starte Minecraft, dann aktiviere Profil Streaming")).toEqual(["Starte Minecraft", "aktiviere Profil Streaming"]);
    expect(splitSteps("Zeig mir Rocket League und Minecraft")).toEqual(["Zeig mir Rocket League und Minecraft"]);
    expect(splitSteps("starte A, dann starte B, dann starte C, dann starte D, dann starte E, dann starte F").length).toBe(5);
  });
  it("knows what is not about gaming and what is a code change", () => {
    expect(offTopic("Schreib eine E-Mail an meinen Chef")).toBe(true);
    expect(offTopic("Wie wird das Wetter morgen?")).toBe(true);
    expect(offTopic("Öffne Discord")).toBe(false);
    expect(offTopic("Starte Minecraft")).toBe(false);
    expect(codeRequest("Programmier mir eine neue Seite")).toBe(true);
    expect(codeRequest("Erstelle eine neue Kategorie")).toBe(false);
  });
});

describe("jarvis website requests", () => {
  it("recognises the requests from the brief", () => {
    expect(siteIntent("Erstelle eine neue Kategorie für meine Lieblingsspiele")).toEqual({ kind: "favoritesCategory", category: "Lieblingsspiele" });
    expect(siteIntent("Verschiebe meine zuletzt gespielten Spiele weiter nach oben")).toEqual({ kind: "librarySort", sort: "recent" });
    expect(siteIntent("Ordne mein Dashboard übersichtlicher an")).toEqual({ kind: "tidyHome" });
    expect(siteIntent("Erstelle eine neue Dashboard-Anordnung für Minecraft")).toEqual({ kind: "pageFor", name: "Minecraft" });
    expect(siteIntent("Zeige mir, welche meiner installierten Spiele zu zweit spielbar sind")).toEqual({ kind: "coopGames" });
    expect(siteIntent("Erstelle ein Profil für mein nächstes Spiel")).toEqual({ kind: "profileFor", game: null, next: true });
    expect(siteIntent("Erstelle ein Profil für Hades")).toEqual({ kind: "profileFor", game: "Hades", next: false });
    expect(siteIntent("Passe mein Gaming-Dashboard an mein neues Profil an")).toEqual({ kind: "profileDashboard", profile: null });
    expect(siteIntent("Öffne meine Soundboard-Seite und bereite meine gespeicherten Sounds vor")).toEqual({ kind: "soundboardReady" });
    expect(siteIntent("Verschiebe meine Favoriten nach oben")).toEqual({ kind: "favoritesFirst" });
    expect(siteIntent("Mache die Spieleübersicht übersichtlicher")).toEqual({ kind: "librarySort", sort: "recent" });
    expect(siteIntent("Leg eine Kategorie Shooter für Counter-Strike 2 an")).toEqual({ kind: "category", category: "Shooter", game: "Counter-Strike 2" });
    expect(siteIntent("Starte Minecraft")).toBeNull();
    expect(siteIntent("Zeig die Uhr auf Home")).toBeNull();
  });
  it("tidies without removing anything and finds the next game", () => {
    const l = { id: "d", name: "Standard", widgets: [{ id: "clock", visible: true, size: "s" }, { id: "notes", visible: false, size: "s" }, { id: "status", visible: true, size: "m" }] } as const;
    expect(tidy(structuredClone(l) as never).widgets.map((w: { id: string }) => w.id)).toEqual(["status", "clock", "notes"]);
    const items = [item("a", "Alpha", { backlog: "playing" }), item("b", "Beta", { backlog: "next", priority: 1 }), item("c", "Gamma", { backlog: "next", priority: 3 })];
    expect(nextGame(items)?.name).toBe("Gamma");
    expect(nextGame([item("a", "Alpha")])).toBeNull();
    expect(findItem(items, "gam")?.id).toBe("c");
  });
  it("lists games for two only from own facts and categories", () => {
    const items = [item("a", "It Takes Two"), item("b", "Hades"), item("c", "Rocket League", { categories: ["Multiplayer"] }), item("d", "Celeste")];
    const r = coopGames(items, [{ title: "It Takes Two", coop: "yes" }, { title: "Hades", coop: "no", localMp: "no" }]);
    expect(r.yes.map((x) => [x.item.name, x.why])).toEqual([["It Takes Two", "fact:coop"], ["Rocket League", "cat:Multiplayer"]]);
    expect(r.unknown).toBe(1); // Celeste: nothing known; Hades: known "no"
  });
});
