import { describe, expect, it } from "vitest";
import { cm360, convertSens, gamingAnswer, gamingIntent } from "./gaming-intel";

describe("JARVIS Gaming-Wissen: was gefragt ist", () => {
  it("Gratis-Spiele, mit Plattform und Items", () => {
    expect(gamingIntent("Welche Spiele gibt es gerade gratis auf Epic?")).toEqual({ kind: "free", platform: "epic-games-store", loot: false });
    expect(gamingIntent("Gibt es kostenlose Spiele?")).toEqual({ kind: "free", platform: null, loot: false });
    expect(gamingIntent("Gratis Ingame-Items für PS5")).toMatchObject({ kind: "free", platform: "ps5.ps4", loot: true });
    expect(gamingIntent("Erstelle ein Bingo für kostenlose Spiele")).toBeNull();
    expect(gamingIntent("Was gibt es bei Epic gratis?")).toEqual({ kind: "free", platform: "epic-games-store", loot: false });
  });
  it("Neuigkeiten und Patches", () => {
    expect(gamingIntent("Was ist neu in Hades?")).toEqual({ kind: "news", game: "Hades" });
    expect(gamingIntent("Gibt es ein Update für Counter-Strike 2?")).toEqual({ kind: "news", game: "Counter-Strike 2" });
    expect(gamingIntent("Patchnotes von Helldivers 2")).toEqual({ kind: "news", game: "Helldivers 2" });
  });
  it("Sensitivität umrechnen und cm/360", () => {
    expect(gamingIntent("Rechne meine CS2-Sensitivität 1,2 in Valorant um")).toMatchObject({ kind: "sens", from: "cs2", to: "valorant", sens: 1.2, dpi: null });
    expect(gamingIntent("Sens 2 von Apex nach Overwatch bei 800 DPI")).toMatchObject({ kind: "sens", from: "apex", to: "overwatch", sens: 2, dpi: 800 });
    expect(gamingIntent("Wie viel cm/360 sind Sensitivität 0,4 in Valorant bei 1600 DPI?")).toMatchObject({ kind: "cm360", game: "valorant", sens: 0.4, dpi: 1600 });
    // CS2 → Valorant is the well-known ÷ 3.18.
    expect(convertSens(1.2, "cs2", "valorant")).toBeCloseTo(0.377, 3);
    expect(convertSens(1, "cs2", "overwatch")).toBeCloseTo(3.333, 3);
    // 800 DPI, CS2 sens 2 → 360 / (0.022 · 2 · 800) · 2.54 ≈ 25.98 cm.
    expect(cm360(2, 800, "cs2")).toBeCloseTo(25.98, 1);
  });
  it("Ausgaben", () => {
    expect(gamingIntent("Ich habe 19,99 € für Hades ausgegeben")).toEqual({ kind: "spend", amount: 19.99, game: "Hades" });
    expect(gamingIntent("Wie viel habe ich diesen Monat für Spiele ausgegeben?")).toMatchObject({ kind: "spendSum" });
    expect(gamingIntent("Wie viel habe ich im März 2026 für Spiele ausgegeben?")).toEqual({ kind: "spendSum", month: 2, year: 2026 });
  });
  it("Ratgeber nur bei klaren Gaming-/Setup-Fragen", () => {
    expect(gamingIntent("Meine Augen brennen nach dem Zocken")).toEqual({ kind: "advice", topic: "eyes" });
    expect(gamingIntent("Mir tut der Rücken beim Zocken weh")).toEqual({ kind: "advice", topic: "posture" });
    expect(gamingIntent("Mein Monitor hat 144 Hz, welches FPS-Limit?")).toEqual({ kind: "advice", topic: "display" });
    expect(gamingIntent("Warum laggt Fortnite so?")).toEqual({ kind: "advice", topic: "lag" });
    expect(gamingIntent("Mein Controller hat Stick Drift")).toEqual({ kind: "advice", topic: "controller" });
    expect(gamingIntent("Starte Hades")).toBeNull();
    expect(gamingIntent("Wie lange brauche ich noch für Hades?")).toBeNull();
  });
});

describe("Antworten", () => {
  it("Gratis-Spiele mit Quelle; Fehler werden gesagt, nichts erfunden", async () => {
    const ok = (async () => new Response(JSON.stringify([{ id: 1, title: "Testspiel (Epic Games) Giveaway", worth: "$19.99", open_giveaway_url: "https://www.gamerpower.com/open/testspiel", end_date: "2099-11-05 23:59:00", platforms: "PC, Epic Games Store", type: "Game" }, { id: 2, title: "Abgelaufen Giveaway", worth: "$5", open_giveaway_url: "https://www.gamerpower.com/open/alt", end_date: "2020-01-01 00:00:00", platforms: "PC", type: "Game" }]), { status: 200 })) as unknown as typeof fetch;
    const a = await gamingAnswer({ kind: "free", platform: "epic-games-store", loot: false }, false, ok);
    expect(a.text).toContain("Testspiel – PC, Epic Games Store · sonst $19.99 · bis 5.11.2099");
    expect(a.text).toContain("GamerPower.com");
    expect(a.text).not.toContain("Abgelaufen");
    expect(a.links.at(-1)!.url).toBe("https://www.gamerpower.com");
    const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    const b = await gamingAnswer({ kind: "free", platform: null, loot: false }, false, down);
    expect(b.ok).toBe(false);
    expect(b.text).toContain("nicht abrufen");
  });
  it("Neuigkeiten ohne PC: ehrlich, mit Weg zu den Patchnotes", async () => {
    const a = await gamingAnswer({ kind: "news", game: "Hades" }, false);
    expect(a.text).toContain("nur über den PC");
    expect(a.navigate?.[0].path).toBe("/infos?tab=patches");
  });
  it("Ratgeber nennt Quellen und ersetzt keinen Arzt", async () => {
    const a = await gamingAnswer({ kind: "advice", topic: "eyes" }, false);
    expect(a.text).toContain("20-20-20");
    expect(a.text).toContain("ersetzt keinen Arzt");
    expect(a.links[0].url).toMatch(/^https:\/\/www\.aao\.org\//);
  });
});
