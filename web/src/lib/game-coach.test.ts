import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachAnswer, coachIntent, spoilerOf } from "./game-coach";
import { listKind, newId, saveEntry } from "./journal";
import { gamingIntent } from "./gaming-intel";
import { memoryIntent } from "./jarvis-memory";
import { playtimeIntent } from "./playtime";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
beforeEach(() => store.clear());

describe("Quest-Coach: was gefragt ist", () => {
  it("Gedächtnis-Fragen aus dem Auftrag", () => {
    expect(coachIntent("Wo war ich stehen geblieben?")).toEqual({ kind: "where", game: null });
    expect(coachIntent("JARVIS, wo war ich in Hogwarts Legacy stehen geblieben?")).toEqual({ kind: "where", game: "Hogwarts Legacy" });
    expect(coachIntent("Was sollte ich in Hogwarts Legacy als Nächstes machen?")).toEqual({ kind: "next", game: "Hogwarts Legacy" });
    expect(coachIntent("Speichere diesen Hinweis für Elden Ring: Malenia erst mit Blutungswaffe")).toEqual({ kind: "note", game: "Elden Ring", text: "Malenia erst mit Blutungswaffe" });
    expect(coachIntent("Erinnere mich daran, dass ich in Hogwarts Legacy noch die Nebenquest Der verlorene Kessel machen will")).toEqual({ kind: "todo", game: "Hogwarts Legacy", text: "Nebenquest Der verlorene Kessel" });
    expect(coachIntent("Ich bin in Hogwarts Legacy gerade bei der Quest Der Kartenraum")).toEqual({ kind: "at", game: "Hogwarts Legacy", where: "der Quest Der Kartenraum" });
    expect(coachIntent("Wie komme ich in Hollow Knight weiter bei Hornet?")).toEqual({ kind: "help", game: "Hollow Knight", topic: "Hornet" });
    expect(coachIntent("Fasse die Geschichte von Elden Ring bis zu meinem Fortschritt zusammen")).toEqual({ kind: "story", game: "Elden Ring" });
    expect(coachIntent("Keine Spoiler für Elden Ring")).toEqual({ kind: "spoiler", game: "Elden Ring", level: "none" });
    expect(coachIntent("Ausführliche Lösung für Hollow Knight")).toEqual({ kind: "spoiler", game: "Hollow Knight", level: "solution" });
    expect(coachIntent("Ich habe heute 20 Minuten")).toEqual({ kind: "fits", minutes: 20 });
    expect(coachIntent("Welches Spiel passt heute in 1,5 Stunden?")).toEqual({ kind: "fits", minutes: 90 });
  });
  it("kollidiert nicht mit Spielzeit, Ausgaben, Gedächtnis und Befehlen", () => {
    expect(coachIntent("Ich bin bei 40 % in Hogwarts Legacy")).toBeNull();
    expect(playtimeIntent("Ich bin bei 40 % in Hogwarts Legacy")).toMatchObject({ kind: "progress" });
    expect(coachIntent("Ich habe 19,99 € für Hades ausgegeben")).toBeNull();
    expect(coachIntent("Wie lange brauche ich noch für Hades bei 45 Minuten täglich?")).toBeNull();
    expect(coachIntent("Starte Minecraft")).toBeNull();
    expect(coachIntent("Merk dir, dass ich Minecraft mit Shadern spiele")).toBeNull();
    expect(memoryIntent("Merk dir, dass ich Minecraft mit Shadern spiele")).toMatchObject({ kind: "remember" });
    expect(gamingIntent("Wo war ich in Hades?")).toBeNull();
  });
});

describe("Quest-Coach: Antworten nur aus deinen Einträgen", () => {
  it("nichts gespeichert → nichts erfunden", async () => {
    const a = await coachAnswer({ kind: "where", game: "Hogwarts Legacy" }, false);
    expect(a.text).toContain("rate nicht");
    const n = await coachAnswer({ kind: "next", game: "Hogwarts Legacy" }, false);
    expect(n.ok).toBeNull();
    expect(n.text).toContain("nichts Erfundenes");
  });
  it("merken, dann wiederfinden – Stelle, Plan, offene Aufgabe, Zielpfad", async () => {
    await coachAnswer({ kind: "at", game: "Hogwarts Legacy", where: "Quest Der Kartenraum" }, false);
    await coachAnswer({ kind: "todo", game: "hogwarts legacy", text: "Nebenquest Der verlorene Kessel" }, false);
    saveEntry("path", newId(), { gameName: "Hogwarts Legacy", title: "Hauptstory", stages: [{ id: "a", title: "Kapitel 1", done: true }, { id: "b", title: "Kapitel 2" }] });
    const w = await coachAnswer({ kind: "where", game: "Hogwarts Legacy" }, false);
    expect(w.text).toContain("Stelle: Quest Der Kartenraum");
    expect(w.text).toContain("Offen: Nebenquest Der verlorene Kessel");
    expect(w.text).toContain("nächste Etappe: Kapitel 2");
    const n = await coachAnswer({ kind: "next", game: "Hogwarts Legacy" }, false);
    expect(n.text).toContain("Zielpfad „Hauptstory“ – nächste Etappe: Kapitel 2");
    expect(n.text).toContain("keine Story-Spoiler");
    // The to-do landed in the collection, the spelling of the journal is kept.
    expect(listKind<{ gameName: string; status: string }>("find")[0].data).toMatchObject({ gameName: "Hogwarts Legacy", status: "open" });
    // "Wo war ich stehen geblieben?" without a game → the last one.
    expect((await coachAnswer({ kind: "where", game: null }, false)).text).toContain("Hogwarts Legacy");
  });
  it("Spoiler-Stufe gilt für Hilfe-Links; ohne bekannte Stelle wird nachgefragt", async () => {
    const h = await coachAnswer({ kind: "help", game: "Hollow Knight", topic: null }, false);
    expect(h.text).toContain("Ich weiß nicht, an welcher Stelle du gerade bist");
    expect(h.links[0].url).toContain("ohne%20Spoiler");
    await coachAnswer({ kind: "spoiler", game: "Hollow Knight", level: "solution" }, false);
    expect(spoilerOf("Hollow Knight")).toBe("solution");
    const s = await coachAnswer({ kind: "help", game: "Hollow Knight", topic: "Hornet" }, false);
    expect(s.links[0].url).toContain("Hornet%20L%C3%B6sung");
  });
  it("Story nur bis zu deinem Stand", async () => {
    saveEntry("story", newId(), { gameName: "Elden Ring", title: "Story", chapters: [{ id: "c1", title: "Limgrave", summary: "Anfang" }, { id: "c2", title: "Später", summary: "Geheim" }], characters: [], questions: [], progressId: "c1" });
    const a = await coachAnswer({ kind: "story", game: "Elden Ring" }, false);
    expect(a.text).toContain("Limgrave: Anfang");
    expect(a.text).not.toContain("Geheim");
    expect(a.text).toContain("1 weitere");
  });
});
